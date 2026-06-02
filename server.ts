import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import os from "os";
import fs from "fs";
import {
  createSessionToken,
  getBearerToken,
  getSessionSecret,
  verifySessionToken,
} from "./lib/adminSession.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SUPERUSER_USERNAME = process.env.SUPERUSER_USERNAME || "superuser";
const SUPERUSER_PASSWORD = process.env.SUPERUSER_PASSWORD || "change-this-password";
const ADMIN_SESSION_SECRET = getSessionSecret(SUPERUSER_PASSWORD);
const hashPassword = (password: string) => crypto.createHash("sha256").update(password).digest("hex");
const DEFAULT_LINKEDIN_URL = "https://www.linkedin.com/in/bipul-kumar-paul-7a90a0125";
const DEFAULT_STATUS_TEXT = "Available for new opportunities";
const DEFAULT_CAROUSEL_INTERVAL_MS = 4500;

let db: Database.Database;
const DB_FILENAME = "portfolio.db";

function openAndVerifyDatabase(): Database.Database {
  let conn: Database.Database | null = null;
  try {
    conn = new Database(DB_FILENAME);
    // Pre-flight check to test if DB is corrupt before running tables setup
    conn.pragma("integrity_check");
    return conn;
  } catch (err) {
    console.error("\n⚠️ DATABASE DISK IMAGE CORRUPTION DETECTED ON START:", err);
    if (conn) {
      try {
        conn.close();
      } catch (closeErr) {
        console.warn("Failed to close corrupted db connection:", closeErr);
      }
    }
    console.log("Initiating automatic database reset to restore baseline portfolio data...");
    try {
      if (fs.existsSync(DB_FILENAME)) {
        fs.renameSync(DB_FILENAME, `portfolio.db.corrupt-${Date.now()}`);
      }
      const sidefiles = [DB_FILENAME + "-journal", DB_FILENAME + "-shm", DB_FILENAME + "-wal"];
      for (const sf of sidefiles) {
        try { if (fs.existsSync(sf)) fs.unlinkSync(sf); } catch {}
      }
    } catch (e) {
      console.warn("Unable to backup malformed database, unlinking original:", e);
      try { if (fs.existsSync(DB_FILENAME)) fs.unlinkSync(DB_FILENAME); } catch {}
    }
    return new Database(DB_FILENAME);
  }
}

db = openAndVerifyDatabase();

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY,
    name TEXT,
    title TEXT,
    status TEXT,
    carouselIntervalMs INTEGER,
    email TEXT,
    phone TEXT,
    linkedin TEXT,
    address TEXT,
    summary TEXT,
    bio TEXT
  );

  CREATE TABLE IF NOT EXISTS experience (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT,
    position TEXT,
    department TEXT,
    period TEXT,
    location TEXT,
    description TEXT,
    startDate TEXT,
    organizationGroupId INTEGER,
    isPromotion INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    client TEXT,
    date TEXT,
    projectStartDate TEXT,
    projectEndDate TEXT,
    location TEXT,
    features TEXT,
    activities TEXT,
    category TEXT,
    sortDate TEXT,
    image TEXT,
    outputDetails TEXT,
    activityDetails TEXT,
    photoGallery TEXT,
    outputTable TEXT,
    skills TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    category TEXT,
    level INTEGER
  );

  CREATE TABLE IF NOT EXISTS education (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    degree TEXT,
    institution TEXT,
    year TEXT,
    details TEXT
  );

  CREATE TABLE IF NOT EXISTS highlights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    subtitle TEXT,
    icon TEXT,
    iconColor TEXT,
    sortOrder INTEGER
  );

  CREATE TABLE IF NOT EXISTS about_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image TEXT NOT NULL,
    caption TEXT,
    sortOrder INTEGER DEFAULT 0,
    type TEXT DEFAULT 'Certificate'
  );

  CREATE TABLE IF NOT EXISTS admin_credentials (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    passwordHash TEXT NOT NULL,
    updatedAt TEXT
  );
`);

const ensureTableColumn = (table: string, column: string, definition: string) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    console.log(`[db] Added ${table}.${column}`);
  }
};

const toPublicProfile = (profile: any) => {
  if (!profile) return profile;
  const { phone, ...publicProfile } = profile;
  return publicProfile;
};

const ensureAboutPhotosTable = () => {
  const exists = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'about_photos'")
    .get();
  if (!exists) {
    db.exec(`
      CREATE TABLE about_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image TEXT NOT NULL,
        caption TEXT,
        sortOrder INTEGER DEFAULT 0
      );
    `);
    console.log("[db] Created about_photos table");
  }
};

const ABOUT_PHOTOS_DIR = path.join(__dirname, "public", "about");
const ABOUT_PHOTO_FILE_ROUTE = "/api/about-photos/files";
const PROJECT_IMAGES_DIR = path.join(__dirname, "public", "projects");
const PROJECT_IMAGE_FILE_ROUTE = "/api/projects/files";
fs.mkdirSync(ABOUT_PHOTOS_DIR, { recursive: true });
fs.mkdirSync(PROJECT_IMAGES_DIR, { recursive: true });

const aboutPhotoFileUrl = (filename: string) => `${ABOUT_PHOTO_FILE_ROUTE}/${filename}`;
const projectImageFileUrl = (filename: string) => `${PROJECT_IMAGE_FILE_ROUTE}/${filename}`;

const normalizeAboutPhotoPath = (imagePath: string): string => {
  if (!imagePath) return "";
  if (imagePath.startsWith(`${ABOUT_PHOTO_FILE_ROUTE}/`)) return imagePath;
  if (imagePath.startsWith("/about/")) {
    return aboutPhotoFileUrl(path.basename(imagePath));
  }
  return imagePath;
};

const normalizeProjectImagePath = (imagePath: string): string => {
  if (!imagePath) return "";
  if (imagePath.startsWith(`${PROJECT_IMAGE_FILE_ROUTE}/`)) return imagePath;
  if (imagePath.startsWith("/projects/")) {
    return projectImageFileUrl(path.basename(imagePath));
  }
  return imagePath;
};

const persistAboutPhotoImage = (imageData: string): string => {
  if (!imageData) return "";
  if (imageData.startsWith(`${ABOUT_PHOTO_FILE_ROUTE}/`) || imageData.startsWith("/about/")) {
    return normalizeAboutPhotoPath(imageData);
  }
  if (!imageData.startsWith("data:image")) return imageData;

  const match = imageData.match(/^data:image\/([\w+.-]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image format. Use JPG or PNG.");

  const extRaw = match[1].toLowerCase();
  const ext = extRaw === "jpeg" ? "jpg" : extRaw.replace("+xml", "");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 8 * 1024 * 1024) {
    throw new Error("Image too large. Please use a photo under 8MB.");
  }

  const filename = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(ABOUT_PHOTOS_DIR, filename), buffer);
  return aboutPhotoFileUrl(filename);
};

const persistProjectImage = (imageData: string): string => {
  if (!imageData) return "";
  if (imageData.startsWith(`${PROJECT_IMAGE_FILE_ROUTE}/`) || imageData.startsWith("/projects/")) {
    return normalizeProjectImagePath(imageData);
  }
  if (!imageData.startsWith("data:image")) return imageData;

  const match = imageData.match(/^data:image\/([\w+.-]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image format. Use JPG or PNG.");

  const extRaw = match[1].toLowerCase();
  const ext = extRaw === "jpeg" ? "jpg" : extRaw.replace("+xml", "");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 8 * 1024 * 1024) {
    throw new Error("Image too large. Please use a photo under 8MB.");
  }

  const filename = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(PROJECT_IMAGES_DIR, filename), buffer);
  return projectImageFileUrl(filename);
};

const removeAboutPhotoFile = (imagePath?: string) => {
  if (!imagePath) return;
  const filename = path.basename(
    imagePath.startsWith(`${ABOUT_PHOTO_FILE_ROUTE}/`) || imagePath.startsWith("/about/")
      ? imagePath
      : ""
  );
  if (!filename) return;
  const filePath = path.join(ABOUT_PHOTOS_DIR, filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

const removeProjectImageFile = (imagePath?: string) => {
  if (!imagePath) return;
  const filename = path.basename(
    imagePath.startsWith(`${PROJECT_IMAGE_FILE_ROUTE}/`) || imagePath.startsWith("/projects/")
      ? imagePath
      : ""
  );
  if (!filename) return;
  const filePath = path.join(PROJECT_IMAGES_DIR, filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

const migrateAboutPhotoPaths = () => {
  ensureAboutPhotosTable();
  const rows = db.prepare("SELECT id, image FROM about_photos WHERE image LIKE '/about/%'").all() as {
    id: number;
    image: string;
  }[];
  if (rows.length === 0) return;
  const update = db.prepare("UPDATE about_photos SET image = ? WHERE id = ?");
  for (const row of rows) {
    update.run(normalizeAboutPhotoPath(row.image), row.id);
  }
  console.log(`[db] Migrated ${rows.length} about photo path(s) to ${ABOUT_PHOTO_FILE_ROUTE}`);
};

// Migrations for existing databases (run as soon as the DB opens)
ensureTableColumn("profile", "linkedin", "linkedin TEXT");
ensureTableColumn("profile", "status", "status TEXT");
ensureTableColumn("profile", "carouselIntervalMs", "carouselIntervalMs INTEGER DEFAULT 4500");
ensureTableColumn("profile", "aboutPhoto", "aboutPhoto TEXT");
ensureTableColumn("experience", "startDate", "startDate TEXT");
ensureTableColumn("experience", "organizationGroupId", "organizationGroupId INTEGER");
ensureTableColumn("experience", "isPromotion", "isPromotion INTEGER DEFAULT 0");
ensureTableColumn("experience", "department", "department TEXT");
ensureAboutPhotosTable();
ensureTableColumn("about_photos", "authority", "authority TEXT");
ensureTableColumn("about_photos", "date", "date TEXT");
ensureTableColumn("about_photos", "type", "type TEXT DEFAULT 'Certificate'");
migrateAboutPhotoPaths();

ensureTableColumn("education", "location", "location TEXT");
ensureTableColumn("education", "gpa", "gpa TEXT");
ensureTableColumn("education", "startYear", "startYear TEXT");
ensureTableColumn("education", "endYear", "endYear TEXT");
ensureTableColumn("education", "courses", "courses TEXT");
ensureTableColumn("education", "sortOrder", "sortOrder INTEGER DEFAULT 0");

// Seed initial data if empty
const profileCount = db.prepare("SELECT COUNT(*) as count FROM profile").get() as { count: number };
if (profileCount.count === 0) {
  db.prepare(`
    INSERT INTO profile (id, name, title, status, carouselIntervalMs, email, phone, linkedin, address, summary, bio)
    VALUES (1, 'Bipul Kumar Paul', 'GIS Analyst & Meteorologist', '${DEFAULT_STATUS_TEXT}', ${DEFAULT_CAROUSEL_INTERVAL_MS}, 'bipulpaul2084@gmail.com', '', '${DEFAULT_LINKEDIN_URL}', 'House: 492/20, Bashundhara Link Road, Dhaka-1212, Bangladesh', 
    'Over five years of experience in GIS and Remote Sensing, with a proven track record in land management and energy sector projects.',
    'Currently serving as Assistant Consultant and Coordinator of GIS and Remote Sensing Department at EQMS Consulting Limited. Successfully led 6 projects as Project Manager and involved in more than 40 projects as a GIS Expert.')
  `).run();

  const experiences = [
    ['EQMS Consulting Limited', 'Assistant Consultant', 'August 2021 to Present', 'Bangladesh', 'GIS database management, UAV/Drone image processing, Web GIS, and Project Management.', '2021-08'],
    ['Center for Environmental and Geographic Information Services (CEGIS)', 'Research Consultant', 'February 2021 to July 2021', 'Bangladesh', 'GIS database management, Land Use Land Cover classification, Mouza map digitization.', '2021-02'],
    ['Geo Planning for Advanced Development', 'Assistant GIS Specialist', 'August 2020 to January 2021', 'Bangladesh', 'GIS database preparation of electrical distribution network, Digitization from UAV imagery.', '2020-08'],
    ['Inspira Advisory and Consulting Limited', 'Research Assistant', 'August 2019 to November 2019', 'Bangladesh', 'Private Sector Assessment, Value Chain Analysis, Market Analysis.', '2019-08']
  ];
  const insertExp = db.prepare("INSERT INTO experience (company, position, period, location, description, startDate) VALUES (?, ?, ?, ?, ?, ?)");
  experiences.forEach(exp => insertExp.run(...exp));

  const projects = [
    ['Pre-feasibility Study for Solar PV Plant', 'Total Eren S.A. and BrightNight Bangladesh B.V.', 'April 2023', 'Satkhira, Bangladesh', 'Drone based topography survey, Hydrological and flood risk assessment.', 'Project Manager: Drone image processing, DEM analysis, Report writing.', 'Energy', '2023-04', null],
    ['Soil and Ground Water Analysis', 'Singer Bangladesh', 'December 2022', 'Araihazar, Bangladesh', 'Soil and ground water sample collection, Lab test of environmental parameters.', 'Project Manager: Borehole drilling, Baseline assessment, Team management.', 'Environmental', '2022-12', null],
    ['Cadastral Survey for Wind & Solar Projects', 'North-west Power Generation Company Ltd.', 'January 2022', 'Mawa and Payra, Bangladesh', 'Cadastral survey, Land boundary demarcation.', 'Project Manager: Field visits, Mouza map digitization, Land elevation survey.', 'Survey', '2022-01', null],
    ['GIS Data Collection on Power Supply', 'JICA', 'February 2022', 'Bangladesh', 'Geo-referenced dataset of PGCB Transmission and substation infrastructure.', 'Project Manager & GIS Expert: GIS data collection, Database management.', 'Infrastructure', '2022-02', null],
    ['GIS coordinates collection of 12,635 schools', 'Winrock International', 'March 2023', '17 Districts of Bangladesh', '12674 project school survey using KoboCollect.', 'GIS Expert: Interactive dashboard, Web map preparation using Leaflet/Python.', 'Education', '2023-03', null]
  ];
  const insertProj = db.prepare("INSERT INTO projects (title, client, date, location, features, activities, category, sortDate, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  projects.forEach(proj => insertProj.run(...proj));

  const skills = [
    ['ArcMap', 'GIS', 95],
    ['ArcGIS Pro', 'GIS', 90],
    ['QGIS', 'GIS', 90],
    ['Python', 'Programming', 85],
    ['SQL', 'Programming', 80],
    ['Remote Sensing', 'Analysis', 95],
    ['UAV/Drone Processing', 'Survey', 90],
    ['AutoCAD', 'Design', 80]
  ];
  const insertSkill = db.prepare("INSERT INTO skills (name, category, level) VALUES (?, ?, ?)");
  skills.forEach(skill => insertSkill.run(...skill));

  const education = [
    ['Bachelor of Urban and Regional Planning (BURP)', 'Khulna University of Engineering & Technology (KUET)', '2019', 'Department of Urban and Regional Planning'],
    ['Higher Secondary School Certificate (HSC)', 'Saint Joseph Higher Secondary School, Dhaka', '2014', 'Science'],
    ['Secondary School Certificate (SSC)', 'Rajapur High School, Natore', '2012', 'Science']
  ];
  const insertEdu = db.prepare("INSERT INTO education (degree, institution, year, details) VALUES (?, ?, ?, ?)");
  education.forEach(edu => insertEdu.run(...edu));
}

try {
  const highlightCount = db.prepare("SELECT COUNT(*) as count FROM highlights").get() as { count: number };
  if (highlightCount.count === 0) {
    const highlights = [
      ["GIS Expert", "Spatial Analysis & Mapping", "Map", "text-emerald-600", 1],
      ["Meteorology", "Weather & Climate Studies", "Cloud", "text-blue-600", 2],
      ["Data Science", "Python & SQL Automation", "Database", "text-purple-600", 3],
      ["Remote Sensing", "UAV & Satellite Imaging", "Layers", "text-orange-600", 4],
    ];
    const insertHighlight = db.prepare(
      "INSERT INTO highlights (title, subtitle, icon, iconColor, sortOrder) VALUES (?, ?, ?, ?, ?)"
    );
  highlights.forEach((row) => insertHighlight.run(...row));
  }
} catch (e) {
  console.warn("Highlights seed skipped:", e);
}

db.prepare("UPDATE profile SET phone = '' WHERE id = 1 AND phone IS NOT NULL AND phone != ''").run();
db.prepare("UPDATE profile SET linkedin = ? WHERE id = 1 AND (linkedin IS NULL OR linkedin = '')").run(DEFAULT_LINKEDIN_URL);
db.prepare("UPDATE profile SET status = ? WHERE id = 1 AND (status IS NULL OR status = '')").run(DEFAULT_STATUS_TEXT);
db.prepare("UPDATE profile SET carouselIntervalMs = ? WHERE id = 1 AND (carouselIntervalMs IS NULL OR carouselIntervalMs <= 0)").run(DEFAULT_CAROUSEL_INTERVAL_MS);

const adminCount = db.prepare("SELECT COUNT(*) as count FROM admin_credentials").get() as { count: number };
if (adminCount.count === 0) {
  db.prepare(`
    INSERT INTO admin_credentials (id, username, passwordHash, updatedAt)
    VALUES (1, ?, ?, ?)
  `).run(SUPERUSER_USERNAME, hashPassword(SUPERUSER_PASSWORD), new Date().toISOString());
}

async function startServer() {
  const app = express();
  const HOST = process.env.HOST || "0.0.0.0";
  const PORT = Number(process.env.PORT || 3000);

  const isAuthorized = (req: express.Request) => {
    const token = getBearerToken(req);
    return verifySessionToken(token, ADMIN_SESSION_SECRET);
  };

  const requireSuperuser: express.RequestHandler = (req, res, next) => {
    if (!isAuthorized(req)) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    next();
  };

  app.use(express.json({ limit: "12mb" }));
  app.use(express.urlencoded({ limit: "12mb", extended: true }));
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type === "entity.too.large") {
      res.status(413).json({ success: false, message: "Image too large. Use a smaller photo (under 8MB)." });
      return;
    }
    next(err);
  });
  app.use(express.static(path.join(__dirname, "public")));

  // API Routes
  // Migration: Populate startDate for existing entries if NULL
  const existingExps = db.prepare("SELECT id, period FROM experience WHERE startDate IS NULL").all() as any[];
  const updateExpDate = db.prepare("UPDATE experience SET startDate = ? WHERE id = ?");
  const monthsMap: { [key: string]: string } = {
    "January": "01", "February": "02", "March": "03", "April": "04", "May": "05", "June": "06",
    "July": "07", "August": "08", "September": "09", "October": "10", "November": "11", "December": "12",
    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04", "Jun": "06",
    "Jul": "07", "Aug": "08", "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"
  };

  existingExps.forEach(exp => {
    if (exp.period) {
      // Handle "August 2021 to Present" or "August 2021 - Present"
      const startPart = exp.period.split(/ to | - | – /)[0];
      const parts = startPart.trim().split(' ');
      if (parts.length === 2) {
        const month = monthsMap[parts[0]];
        const year = parts[1];
        if (month && year) {
          updateExpDate.run(`${year}-${month}`, exp.id);
        }
      }
    }
  });

  // Migration: Add sortDate column to projects if it doesn't exist
  try {
    db.prepare("SELECT sortDate FROM projects LIMIT 1").get();
  } catch (e) {
    db.exec("ALTER TABLE projects ADD COLUMN sortDate TEXT");
  }

  // Migration: Add image column to projects if it doesn't exist
  try {
    db.prepare("SELECT image FROM projects LIMIT 1").get();
  } catch (e) {
    db.exec("ALTER TABLE projects ADD COLUMN image TEXT");
  }

// Migration: add detailed project content columns if they don't exist
try {
  db.prepare("SELECT outputDetails FROM projects LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE projects ADD COLUMN outputDetails TEXT");
}

try {
  db.prepare("SELECT activityDetails FROM projects LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE projects ADD COLUMN activityDetails TEXT");
}

try {
  db.prepare("SELECT photoGallery FROM projects LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE projects ADD COLUMN photoGallery TEXT");
}

try {
  db.prepare("SELECT outputTable FROM projects LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE projects ADD COLUMN outputTable TEXT");
}

  try {
    db.prepare("SELECT builderConfig FROM projects LIMIT 1").get();
  } catch (e) {
    db.exec("ALTER TABLE projects ADD COLUMN builderConfig TEXT");
  }

  try {
    db.prepare("SELECT projectStartDate FROM projects LIMIT 1").get();
  } catch (e) {
    db.exec("ALTER TABLE projects ADD COLUMN projectStartDate TEXT");
  }

  try {
    db.prepare("SELECT projectEndDate FROM projects LIMIT 1").get();
  } catch (e) {
    db.exec("ALTER TABLE projects ADD COLUMN projectEndDate TEXT");
  }

  try {
    db.prepare("SELECT experienceId FROM projects LIMIT 1").get();
  } catch (e) {
    db.exec("ALTER TABLE projects ADD COLUMN experienceId INTEGER");
  }

  try {
    db.prepare("SELECT isProjectManager FROM projects LIMIT 1").get();
  } catch (e) {
    db.exec("ALTER TABLE projects ADD COLUMN isProjectManager INTEGER DEFAULT 0");
  }

  try {
    db.prepare("SELECT skills FROM projects LIMIT 1").get();
  } catch (e) {
    db.exec("ALTER TABLE projects ADD COLUMN skills TEXT DEFAULT '[]'");
  }

  // Migration: Populate sortDate for existing projects
  const existingProjs = db.prepare("SELECT id, date FROM projects WHERE sortDate IS NULL").all() as any[];
  const updateProjDate = db.prepare("UPDATE projects SET sortDate = ? WHERE id = ?");
  existingProjs.forEach(proj => {
    if (proj.date) {
      const parts = proj.date.split(' ');
      if (parts.length === 2) {
        const month = monthsMap[parts[0]];
        const year = parts[1];
        if (month && year) {
          updateProjDate.run(`${year}-${month}`, proj.id);
        }
      }
    }
  });

  app.get("/api/profile", (req, res) => {
    const profile = db.prepare("SELECT * FROM profile WHERE id = 1").get();
    res.json(toPublicProfile(profile));
  });

  app.get("/api/experience", (req, res) => {
    const experience = db.prepare(`
      SELECT * FROM experience 
      ORDER BY 
        CASE WHEN period LIKE '%Present' THEN 1 ELSE 0 END DESC,
        startDate DESC, 
        id DESC
    `).all() as any[];
    const projectCounts = db.prepare(`
      SELECT experienceId, COUNT(*) as count
      FROM projects
      WHERE experienceId IS NOT NULL
      GROUP BY experienceId
    `).all() as { experienceId: number; count: number }[];
    const countByExperienceId = Object.fromEntries(
      projectCounts.map((row) => [row.experienceId, row.count])
    );
    res.json(
      experience.map((item) => ({
        ...item,
        projectCount: countByExperienceId[item.id] || 0,
      }))
    );
  });

  app.get("/api/projects", (req, res) => {
    const projects = db.prepare("SELECT * FROM projects ORDER BY sortDate DESC, id DESC").all();
    res.json(projects);
  });

  app.get("/api/projects/:id", (req, res) => {
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    res.json(project);
  });

  app.get("/api/skills", (req, res) => {
    const skills = db.prepare("SELECT * FROM skills").all();
    res.json(skills);
  });

  app.get("/api/education", (req, res) => {
    const education = db
      .prepare("SELECT * FROM education ORDER BY sortOrder ASC, endYear DESC, year DESC, id DESC")
      .all();
    res.json(education);
  });

  app.get("/api/highlights", (req, res) => {
    const highlights = db.prepare("SELECT * FROM highlights ORDER BY sortOrder ASC, id ASC").all();
    res.json(highlights);
  });

  app.get("/api/about-photos", (req, res) => {
    try {
      ensureAboutPhotosTable();
      const photos = db.prepare("SELECT * FROM about_photos ORDER BY sortOrder ASC, id ASC").all();
      res.json(photos);
    } catch (error: any) {
      console.error("GET /api/about-photos failed:", error);
      res.status(500).json({ success: false, message: error?.message || "Failed to load photos" });
    }
  });

  app.get("/api/about-photos/files/:filename", (req, res) => {
    const filename = path.basename(req.params.filename);
    if (!filename) {
      res.status(404).send("Photo not found");
      return;
    }
    const filePath = path.join(ABOUT_PHOTOS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).send("Photo not found");
      return;
    }
    res.sendFile(filePath);
  });

  app.get("/api/projects/files/:filename", (req, res) => {
    const filename = path.basename(req.params.filename);
    if (!filename) {
      res.status(404).send("Project image not found");
      return;
    }
    const filePath = path.join(PROJECT_IMAGES_DIR, filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).send("Project image not found");
      return;
    }
    res.sendFile(filePath);
  });

  app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body ?? {};
    const adminCredentials = db.prepare("SELECT username, passwordHash FROM admin_credentials WHERE id = 1").get() as { username: string; passwordHash: string } | undefined;
    const isValid = Boolean(
      adminCredentials &&
      username === adminCredentials.username &&
      hashPassword(password || "") === adminCredentials.passwordHash
    );

    if (!isValid) {
      res.status(401).json({ success: false, message: "Invalid credentials" });
      return;
    }

    const token = createSessionToken(ADMIN_SESSION_SECRET);
    res.json({ success: true, token });
  });

  app.get("/api/admin/session", (req, res) => {
    res.json({ authenticated: isAuthorized(req) });
  });

  app.post("/api/admin/change-password", requireSuperuser, (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword || typeof currentPassword !== "string" || typeof newPassword !== "string") {
      res.status(400).json({ success: false, message: "Invalid payload" });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
      return;
    }

    const adminCredentials = db.prepare("SELECT passwordHash FROM admin_credentials WHERE id = 1").get() as { passwordHash: string } | undefined;
    if (!adminCredentials || hashPassword(currentPassword) !== adminCredentials.passwordHash) {
      res.status(401).json({ success: false, message: "Current password is incorrect" });
      return;
    }

    db.prepare("UPDATE admin_credentials SET passwordHash = ?, updatedAt = ? WHERE id = 1")
      .run(hashPassword(newPassword), new Date().toISOString());

    res.json({ success: true });
  });

  // Admin Update Routes
  app.post("/api/profile", requireSuperuser, (req, res) => {
    const { name, title, status, carouselIntervalMs, email, linkedin, address, summary, bio, aboutPhoto } = req.body;
    const parsedInterval = Math.min(30000, Math.max(1000, Number(carouselIntervalMs) || DEFAULT_CAROUSEL_INTERVAL_MS));
    
    const storedAboutPhoto = aboutPhoto ? String(aboutPhoto) : "";

    db.prepare("UPDATE profile SET name=?, title=?, status=?, carouselIntervalMs=?, email=?, linkedin=?, address=?, summary=?, bio=?, aboutPhoto=? WHERE id=1")
      .run(name, title, status, parsedInterval, email, linkedin, address, summary, bio, storedAboutPhoto);
    res.json({ success: true });
  });

  // Experience CRUD
  app.post("/api/experience", requireSuperuser, (req, res) => {
    try {
      const { company, position, department, period, location, description, startDate, organizationGroupId, isPromotion } = req.body;
      const parsedGroupId = organizationGroupId ? Number(organizationGroupId) : null;
      const parsedPromotion = isPromotion ? 1 : 0;
      db.prepare(
        "INSERT INTO experience (company, position, department, period, location, description, startDate, organizationGroupId, isPromotion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(company, position, department || "", period, location, description, startDate, parsedGroupId, parsedPromotion);
      res.json({ success: true });
    } catch (error: any) {
      console.error("POST /api/experience failed:", error);
      res.status(500).json({ success: false, message: error?.message || "Failed to save experience" });
    }
  });

  app.put("/api/experience/:id", requireSuperuser, (req, res) => {
    try {
      const { company, position, department, period, location, description, startDate, organizationGroupId, isPromotion } = req.body;
      const parsedGroupId = organizationGroupId ? Number(organizationGroupId) : null;
      const parsedPromotion = isPromotion ? 1 : 0;
      db.prepare(
        "UPDATE experience SET company=?, position=?, department=?, period=?, location=?, description=?, startDate=?, organizationGroupId=?, isPromotion=? WHERE id=?"
      ).run(company, position, department || "", period, location, description, startDate, parsedGroupId, parsedPromotion, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("PUT /api/experience failed:", error);
      res.status(500).json({ success: false, message: error?.message || "Failed to update experience" });
    }
  });

  app.delete("/api/experience/:id", requireSuperuser, (req, res) => {
    db.prepare("DELETE FROM experience WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Projects CRUD
  app.post("/api/projects", requireSuperuser, (req, res) => {
    const {
      title, client, date, projectStartDate, projectEndDate, location, features, activities, category, sortDate, image,
      outputDetails, activityDetails, photoGallery, outputTable, builderConfig, experienceId, isProjectManager,
      skills,
    } = req.body;
    const parsedExperienceId = experienceId ? Number(experienceId) : null;
    const parsedIsProjectManager = isProjectManager ? 1 : 0;
    const storedImage = persistProjectImage(String(image || ""));
    db.prepare("INSERT INTO projects (title, client, date, projectStartDate, projectEndDate, location, features, activities, category, sortDate, image, outputDetails, activityDetails, photoGallery, outputTable, builderConfig, experienceId, isProjectManager, skills) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        title, client, date, projectStartDate || null, projectEndDate || null, location, features, activities, category, sortDate, storedImage,
        outputDetails || "", activityDetails || "", photoGallery || "[]", outputTable || "[]", builderConfig || "{}",
        parsedExperienceId, parsedIsProjectManager,
        skills || "[]"
      );
    res.json({ success: true });
  });

  app.put("/api/projects/:id", requireSuperuser, (req, res) => {
    const {
      title, client, date, projectStartDate, projectEndDate, location, features, activities, category, sortDate, image,
      outputDetails, activityDetails, photoGallery, outputTable, builderConfig, experienceId, isProjectManager,
      skills,
    } = req.body;
    const parsedExperienceId = experienceId ? Number(experienceId) : null;
    const parsedIsProjectManager = isProjectManager ? 1 : 0;
    const existing = db.prepare("SELECT image FROM projects WHERE id = ?").get(req.params.id) as { image?: string } | undefined;
    const storedImage = persistProjectImage(String(image || ""));
    if (existing && existing.image && existing.image !== storedImage) {
      removeProjectImageFile(existing.image);
    }
    db.prepare("UPDATE projects SET title=?, client=?, date=?, projectStartDate=?, projectEndDate=?, location=?, features=?, activities=?, category=?, sortDate=?, image=?, outputDetails=?, activityDetails=?, photoGallery=?, outputTable=?, builderConfig=?, experienceId=?, isProjectManager=?, skills=? WHERE id=?")
      .run(
        title, client, date, projectStartDate || null, projectEndDate || null, location, features, activities, category, sortDate, storedImage,
        outputDetails || "", activityDetails || "", photoGallery || "[]", outputTable || "[]", builderConfig || "{}",
        parsedExperienceId, parsedIsProjectManager,
        skills || "[]",
        req.params.id
      );
    res.json({ success: true });
  });

  app.delete("/api/projects/:id", requireSuperuser, (req, res) => {
    db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Skills CRUD
  app.post("/api/skills", requireSuperuser, (req, res) => {
    const { name, category, level } = req.body;
    db.prepare("INSERT INTO skills (name, category, level) VALUES (?, ?, ?)")
      .run(name, category, level);
    res.json({ success: true });
  });

  app.put("/api/skills/:id", requireSuperuser, (req, res) => {
    const { name, category, level } = req.body;
    db.prepare("UPDATE skills SET name=?, category=?, level=? WHERE id=?")
      .run(name, category, level, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/skills/:id", requireSuperuser, (req, res) => {
    db.prepare("DELETE FROM skills WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Education CRUD
  app.post("/api/education", requireSuperuser, (req, res) => {
    const {
      degree,
      institution,
      year,
      details,
      location,
      gpa,
      startYear,
      endYear,
      courses,
      sortOrder,
    } = req.body;
    db.prepare(
      `INSERT INTO education (degree, institution, year, details, location, gpa, startYear, endYear, courses, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      degree,
      institution,
      year,
      details || "",
      location || "",
      gpa || "",
      startYear || "",
      endYear || year || "",
      courses || "[]",
      Number(sortOrder) || 0
    );
    res.json({ success: true });
  });

  app.put("/api/education/:id", requireSuperuser, (req, res) => {
    const {
      degree,
      institution,
      year,
      details,
      location,
      gpa,
      startYear,
      endYear,
      courses,
      sortOrder,
    } = req.body;
    db.prepare(
      `UPDATE education SET degree=?, institution=?, year=?, details=?, location=?, gpa=?, startYear=?, endYear=?, courses=?, sortOrder=? WHERE id=?`
    ).run(
      degree,
      institution,
      year,
      details || "",
      location || "",
      gpa || "",
      startYear || "",
      endYear || year || "",
      courses || "[]",
      Number(sortOrder) || 0,
      req.params.id
    );
    res.json({ success: true });
  });

  app.delete("/api/education/:id", requireSuperuser, (req, res) => {
    db.prepare("DELETE FROM education WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Highlights CRUD
  app.post("/api/highlights", requireSuperuser, (req, res) => {
    const { title, subtitle, icon, iconColor, sortOrder } = req.body;
    db.prepare("INSERT INTO highlights (title, subtitle, icon, iconColor, sortOrder) VALUES (?, ?, ?, ?, ?)")
      .run(title, subtitle, icon, iconColor, Number(sortOrder) || 0);
    res.json({ success: true });
  });

  app.put("/api/highlights/:id", requireSuperuser, (req, res) => {
    const { title, subtitle, icon, iconColor, sortOrder } = req.body;
    db.prepare("UPDATE highlights SET title=?, subtitle=?, icon=?, iconColor=?, sortOrder=? WHERE id=?")
      .run(title, subtitle, icon, iconColor, Number(sortOrder) || 0, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/highlights/:id", requireSuperuser, (req, res) => {
    db.prepare("DELETE FROM highlights WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // About photos CRUD
  app.post("/api/about-photos", requireSuperuser, (req, res) => {
    try {
      ensureAboutPhotosTable();
      const { image, caption, sortOrder, authority, date, type } = req.body;
      if (!image) {
        res.status(404).json({ success: false, message: "Image is required" });
        return;
      }
      const storedImage = persistAboutPhotoImage(String(image));
      db.prepare("INSERT INTO about_photos (image, caption, sortOrder, authority, date, type) VALUES (?, ?, ?, ?, ?, ?)")
        .run(storedImage, caption || "", Number(sortOrder) || 0, authority || "", date || "", type || "Certificate");
      res.json({ success: true });
    } catch (error: any) {
      console.error("POST /api/about-photos failed:", error);
      res.status(500).json({ success: false, message: error?.message || "Failed to save photo" });
    }
  });

  app.put("/api/about-photos/:id", requireSuperuser, (req, res) => {
    try {
      ensureAboutPhotosTable();
      const { image, caption, sortOrder, authority, date, type } = req.body;
      const existing = db.prepare("SELECT image FROM about_photos WHERE id = ?").get(req.params.id) as { image: string } | undefined;
      if (!existing) {
        res.status(404).json({ success: false, message: "Photo not found" });
        return;
      }
      const incoming = String(image || "");
      const storedImage =
        incoming && incoming.startsWith("data:image")
          ? persistAboutPhotoImage(incoming)
          : incoming || existing.image;
      if (storedImage !== existing.image && incoming.startsWith("data:image")) {
        removeAboutPhotoFile(existing.image);
      }
      db.prepare("UPDATE about_photos SET image=?, caption=?, sortOrder=?, authority=?, date=?, type=? WHERE id=?")
        .run(storedImage, caption || "", Number(sortOrder) || 0, authority || "", date || "", type || "Certificate", req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("PUT /api/about-photos failed:", error);
      res.status(500).json({ success: false, message: error?.message || "Failed to update photo" });
    }
  });

  app.delete("/api/about-photos/:id", requireSuperuser, (req, res) => {
    try {
      ensureAboutPhotosTable();
      const existing = db.prepare("SELECT image FROM about_photos WHERE id = ?").get(req.params.id) as { image: string } | undefined;
      if (existing) removeAboutPhotoFile(existing.image);
      db.prepare("DELETE FROM about_photos WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("DELETE /api/about-photos failed:", error);
      res.status(500).json({ success: false, message: error?.message || "Failed to delete photo" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "public")));
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, HOST, () => {
    const interfaces = os.networkInterfaces();
    const lanIps = new Set<string>();

    for (const entries of Object.values(interfaces)) {
      if (!entries) continue;
      for (const entry of entries) {
        if (entry.family === "IPv4" && !entry.internal) {
          lanIps.add(entry.address);
        }
      }
    }

    console.log(`Server running on http://localhost:${PORT}`);
    if (HOST === "0.0.0.0") {
      for (const ip of lanIps) {
        console.log(`LAN access: http://${ip}:${PORT}`);
      }
    }
  });
}

startServer();
