import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { db } from "./db.js";
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


// Initialize Database is moved into startServer() to be safely and asynchronously awaited.

const ensureTableColumn = async (table: string, column: string, definition: string) => {
  const columns = await db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((col) => col.name === column)) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    console.log(`[db] Added ${table}.${column}`);
  }
};

const toPublicProfile = (profile: any) => {
  if (!profile) return profile;
  const { phone, ...publicProfile } = profile;
  return publicProfile;
};

const ensureAboutPhotosTable = async () => {
  const exists = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'about_photos'")
    .get();
  if (!exists) {
    await db.exec(`
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
fs.mkdirSync(ABOUT_PHOTOS_DIR, { recursive: true });

const aboutPhotoFileUrl = (filename: string) => `${ABOUT_PHOTO_FILE_ROUTE}/${filename}`;

const normalizeAboutPhotoPath = (imagePath: string): string => {
  if (!imagePath) return "";
  if (imagePath.startsWith(`${ABOUT_PHOTO_FILE_ROUTE}/`)) return imagePath;
  if (imagePath.startsWith("/about/")) {
    return aboutPhotoFileUrl(path.basename(imagePath));
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

const migrateAboutPhotoPaths = async () => {
  await ensureAboutPhotosTable();
  const rows = await db.prepare("SELECT id, image FROM about_photos WHERE image LIKE '/about/%'").all() as {
    id: number;
    image: string;
  }[];
  if (rows.length === 0) return;
  const update = db.prepare("UPDATE about_photos SET image = ? WHERE id = ?");
  for (const row of rows) {
    await update.run(normalizeAboutPhotoPath(row.image), row.id);
  }
  console.log(`[db] Migrated ${rows.length} about photo path(s) to ${ABOUT_PHOTO_FILE_ROUTE}`);
};

async function migrateSqliteToPostgres() {
  if (!db.isPostgres) {
    return;
  }
  const pgPool = db.getPgPool();
  if (!pgPool) return;

  try {
    await pgPool.query(`CREATE TABLE IF NOT EXISTS sqlite_migration_flag (migrated INTEGER DEFAULT 1);`);
    const migratedCheck = await pgPool.query(`SELECT * FROM sqlite_migration_flag;`);
    if (migratedCheck.rows.length > 0) {
      console.log("[db-migration] SQLite to Postgres migration already done previously. Skipping.");
      return;
    }
  } catch (err) {
    console.warn("[db-migration] Error checking migration flag in Postgres:", err);
    return;
  }

  const sqliteFile = "portfolio.db";
  if (!fs.existsSync(sqliteFile)) {
    console.log("[db-migration] SQLite database portfolio.db not found on disk. Skipping migration.");
    await pgPool.query(`INSERT INTO sqlite_migration_flag (migrated) VALUES (1);`);
    return;
  }

  console.log("[db-migration] Found sqlite database. Migrating SQLite data to Postgres...");

  let sqliteConn: Database.Database | null = null;
  try {
    sqliteConn = new Database(sqliteFile);
  } catch (err) {
    console.error("[db-migration] Failed to open SQLite database for migration:", err);
    return;
  }

  const tables = [
    "profile",
    "experience",
    "projects",
    "skills",
    "education",
    "highlights",
    "about_photos",
    "admin_credentials"
  ];

  for (const tbl of tables) {
    try {
      const tableExists = sqliteConn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tbl);
      if (!tableExists) {
        console.log(`[db-migration] Table ${tbl} does not exist in SQLite. Skipping.`);
        continue;
      }

      const rows = sqliteConn.prepare(`SELECT * FROM ${tbl}`).all() as any[];
      console.log(`[db-migration] Table ${tbl} has ${rows.length} row(s) in SQLite.`);

      if (rows.length > 0) {
        await pgPool.query(`DELETE FROM ${tbl};`);

        const keys = Object.keys(rows[0]);
        const cols = keys.map(k => `"${k}"`).join(", ");
        const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(", ");
        const insertSql = `INSERT INTO ${tbl} (${cols}) VALUES (${placeholders})`;

        for (const row of rows) {
          const vals = keys.map(k => row[k]);
          await pgPool.query(insertSql, vals);
        }

        console.log(`[db-migration] Successfully inserted ${rows.length} row(s) into Postgres table ${tbl}.`);

        try {
          const seqQuery = `SELECT setval(pg_get_serial_sequence('${tbl}', 'id'), COALESCE((SELECT MAX(id) FROM ${tbl}), 1))`;
          await pgPool.query(seqQuery);
          console.log(`[db-migration] Reset SERIAL sequence for Postgres table ${tbl}.`);
        } catch (seqErr) {
          console.log(`[db-migration] SERIAL sequence reset skipped for ${tbl}.`);
        }
      }
    } catch (tblErr) {
      console.error(`[db-migration] Failed to migrate table ${tbl}:`, tblErr);
    }
  }

  try {
    await pgPool.query(`INSERT INTO sqlite_migration_flag (migrated) VALUES (1);`);
    console.log("[db-migration] SQLite to PostgreSQL migration fully completed and flagged!");
  } catch (err) {
    console.error("[db-migration] Failed to insert migration flag into Postgres:", err);
  } finally {
    try {
      if (sqliteConn) sqliteConn.close();
    } catch {}
  }
}

async function startServer() {
  // Initialize Database schemas and seed data
  await db.ensureDatabaseInitialized();

  // Migrate SQLite data to Postgres if applicable
  await migrateSqliteToPostgres();

  // Run dynamic migrations & column creation
  await ensureTableColumn("profile", "linkedin", "linkedin TEXT");
  await ensureTableColumn("profile", "status", "status TEXT");
  await ensureTableColumn("profile", "carouselIntervalMs", "carouselIntervalMs INTEGER DEFAULT 4500");
  await ensureTableColumn("profile", "aboutPhoto", "aboutPhoto TEXT");
  await ensureTableColumn("experience", "startDate", "startDate TEXT");
  await ensureTableColumn("experience", "organizationGroupId", "organizationGroupId INTEGER");
  await ensureTableColumn("experience", "isPromotion", "isPromotion INTEGER DEFAULT 0");
  await ensureTableColumn("experience", "department", "department TEXT");
  await ensureAboutPhotosTable();
  await ensureTableColumn("about_photos", "authority", "authority TEXT");
  await ensureTableColumn("about_photos", "date", "date TEXT");
  await ensureTableColumn("about_photos", "type", "type TEXT DEFAULT 'Certificate'");
  await migrateAboutPhotoPaths();

  await ensureTableColumn("education", "location", "location TEXT");
  await ensureTableColumn("education", "gpa", "gpa TEXT");
  await ensureTableColumn("education", "startYear", "startYear TEXT");
  await ensureTableColumn("education", "endYear", "endYear TEXT");
  await ensureTableColumn("education", "courses", "courses TEXT");
  await ensureTableColumn("education", "sortOrder", "sortOrder INTEGER DEFAULT 0");

  // Seed initial data if empty
  const profileCount = await db.prepare("SELECT COUNT(*) as count FROM profile").get() as { count: number };
  if (profileCount.count === 0) {
    await db.prepare(`
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
    for (const exp of experiences) {
      await insertExp.run(...exp);
    }

    const projects = [
      ['Pre-feasibility Study for Solar PV Plant', 'Total Eren S.A. and BrightNight Bangladesh B.V.', 'April 2023', 'Satkhira, Bangladesh', 'Drone based topography survey, Hydrological and flood risk assessment.', 'Project Manager: Drone image processing, DEM analysis, Report writing.', 'Energy', '2023-04', null],
      ['Soil and Ground Water Analysis', 'Singer Bangladesh', 'December 2022', 'Araihazar, Bangladesh', 'Soil and ground water sample collection, Lab test of environmental parameters.', 'Project Manager: Borehole drilling, Baseline assessment, Team management.', 'Environmental', '2022-12', null],
      ['Cadastral Survey for Wind & Solar Projects', 'North-west Power Generation Company Ltd.', 'January 2022', 'Mawa and Payra, Bangladesh', 'Cadastral survey, Land boundary demarcation.', 'Project Manager: Field visits, Mouza map digitization, Land elevation survey.', 'Survey', '2022-01', null],
      ['GIS Data Collection on Power Supply', 'JICA', 'February 2022', 'Bangladesh', 'Geo-referenced dataset of PGCB Transmission and substation infrastructure.', 'Project Manager & GIS Expert: GIS data collection, Database management.', 'Infrastructure', '2022-02', null],
      ['GIS coordinates collection of 12,635 schools', 'Winrock International', 'March 2023', '17 Districts of Bangladesh', '12674 project school survey using KoboCollect.', 'GIS Expert: Interactive dashboard, Web map preparation using Leaflet/Python.', 'Education', '2023-03', null]
    ];
    const insertProj = db.prepare("INSERT INTO projects (title, client, date, location, features, activities, category, sortDate, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const proj of projects) {
      await insertProj.run(...proj);
    }

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
    for (const skill of skills) {
      await insertSkill.run(...skill);
    }

    const education = [
      ['Bachelor of Urban and Regional Planning (BURP)', 'Khulna University of Engineering & Technology (KUET)', '2019', 'Department of Urban and Regional Planning'],
      ['Higher Secondary School Certificate (HSC)', 'Saint Joseph Higher Secondary School, Dhaka', '2014', 'Science'],
      ['Secondary School Certificate (SSC)', 'Rajapur High School, Natore', '2012', 'Science']
    ];
    const insertEdu = db.prepare("INSERT INTO education (degree, institution, year, details) VALUES (?, ?, ?, ?)");
    for (const edu of education) {
      await insertEdu.run(...edu);
    }
  }

  try {
    const highlightCount = await db.prepare("SELECT COUNT(*) as count FROM highlights").get() as { count: number };
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
      for (const row of highlights) {
        await insertHighlight.run(...row);
      }
    }
  } catch (e) {
    console.warn("Highlights seed skipped:", e);
  }

  await db.prepare("UPDATE profile SET phone = '' WHERE id = 1 AND phone IS NOT NULL AND phone != ''").run();
  await db.prepare("UPDATE profile SET linkedin = ? WHERE id = 1 AND (linkedin IS NULL OR linkedin = '')").run(DEFAULT_LINKEDIN_URL);
  await db.prepare("UPDATE profile SET status = ? WHERE id = 1 AND (status IS NULL OR status = '')").run(DEFAULT_STATUS_TEXT);
  await db.prepare("UPDATE profile SET carouselIntervalMs = ? WHERE id = 1 AND (carouselIntervalMs IS NULL OR carouselIntervalMs <= 0)").run(DEFAULT_CAROUSEL_INTERVAL_MS);

  const existingAdmin = await db.prepare("SELECT id FROM admin_credentials WHERE id = 1").get();
  if (!existingAdmin) {
    await db.prepare(`
      INSERT INTO admin_credentials (id, username, passwordHash, updatedAt)
      VALUES (1, ?, ?, ?)
    `).run(SUPERUSER_USERNAME, hashPassword(SUPERUSER_PASSWORD), new Date().toISOString());
    console.log("[db] Created superuser credentials record.");
  } else {
    await db.prepare(`
      UPDATE admin_credentials
      SET username = ?, passwordHash = ?, updatedAt = ?
      WHERE id = 1
    `).run(SUPERUSER_USERNAME, hashPassword(SUPERUSER_PASSWORD), new Date().toISOString());
    console.log("[db] Synced superuser credentials record with latest environment values.");
  }

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
  const existingExps = await db.prepare("SELECT id, period FROM experience WHERE startDate IS NULL").all() as any[];
  const updateExpDate = db.prepare("UPDATE experience SET startDate = ? WHERE id = ?");
  const monthsMap: { [key: string]: string } = {
    "January": "01", "February": "02", "March": "03", "April": "04", "May": "05", "June": "06",
    "July": "07", "August": "08", "September": "09", "October": "10", "November": "11", "December": "12",
    "Jan": "01", "Feb": "02", "Mar": "03", "Apr": "04", "Jun": "06",
    "Jul": "07", "Aug": "08", "Sep": "09", "Oct": "10", "Nov": "11", "Dec": "12"
  };

  for (const exp of existingExps) {
    if (exp.period) {
      // Handle "August 2021 to Present" or "August 2021 - Present"
      const startPart = exp.period.split(/ to | - | – /)[0];
      const parts = startPart.trim().split(' ');
      if (parts.length === 2) {
        const month = monthsMap[parts[0]];
        const year = parts[1];
        if (month && year) {
          await updateExpDate.run(`${year}-${month}`, exp.id);
        }
      }
    }
  }

  // Migration: Add sortDate column to projects if it doesn't exist
  try {
    await db.prepare("SELECT sortDate FROM projects LIMIT 1").get();
  } catch (e) {
    await db.exec("ALTER TABLE projects ADD COLUMN sortDate TEXT");
  }

  // Migration: Add image column to projects if it doesn't exist
  try {
    await db.prepare("SELECT image FROM projects LIMIT 1").get();
  } catch (e) {
    await db.exec("ALTER TABLE projects ADD COLUMN image TEXT");
  }

  // Migration: add detailed project content columns if they don't exist
  try {
    await db.prepare("SELECT outputDetails FROM projects LIMIT 1").get();
  } catch (e) {
    await db.exec("ALTER TABLE projects ADD COLUMN outputDetails TEXT");
  }

  try {
    await db.prepare("SELECT activityDetails FROM projects LIMIT 1").get();
  } catch (e) {
    await db.exec("ALTER TABLE projects ADD COLUMN activityDetails TEXT");
  }

  try {
    await db.prepare("SELECT photoGallery FROM projects LIMIT 1").get();
  } catch (e) {
    await db.exec("ALTER TABLE projects ADD COLUMN photoGallery TEXT");
  }

  try {
    await db.prepare("SELECT outputTable FROM projects LIMIT 1").get();
  } catch (e) {
    await db.exec("ALTER TABLE projects ADD COLUMN outputTable TEXT");
  }

  try {
    await db.prepare("SELECT builderConfig FROM projects LIMIT 1").get();
  } catch (e) {
    await db.exec("ALTER TABLE projects ADD COLUMN builderConfig TEXT");
  }

  try {
    await db.prepare("SELECT projectStartDate FROM projects LIMIT 1").get();
  } catch (e) {
    await db.exec("ALTER TABLE projects ADD COLUMN projectStartDate TEXT");
  }

  try {
    await db.prepare("SELECT projectEndDate FROM projects LIMIT 1").get();
  } catch (e) {
    await db.exec("ALTER TABLE projects ADD COLUMN projectEndDate TEXT");
  }

  try {
    await db.prepare("SELECT experienceId FROM projects LIMIT 1").get();
  } catch (e) {
    await db.exec("ALTER TABLE projects ADD COLUMN experienceId INTEGER");
  }

  try {
    await db.prepare("SELECT isProjectManager FROM projects LIMIT 1").get();
  } catch (e) {
    await db.exec("ALTER TABLE projects ADD COLUMN isProjectManager INTEGER DEFAULT 0");
  }

  try {
    await db.prepare("SELECT skills FROM projects LIMIT 1").get();
  } catch (e) {
    await db.exec("ALTER TABLE projects ADD COLUMN skills TEXT DEFAULT '[]'");
  }

  // Migration: Populate sortDate for existing projects
  const existingProjs = await db.prepare("SELECT id, date FROM projects WHERE sortDate IS NULL").all() as any[];
  const updateProjDate = db.prepare("UPDATE projects SET sortDate = ? WHERE id = ?");
  for (const proj of existingProjs) {
    if (proj.date) {
      const parts = proj.date.split(' ');
      if (parts.length === 2) {
        const month = monthsMap[parts[0]];
        const year = parts[1];
        if (month && year) {
          await updateProjDate.run(`${year}-${month}`, proj.id);
        }
      }
    }
  }

  app.get("/api/profile", async (req, res) => {
    const profile = await db.prepare("SELECT * FROM profile WHERE id = 1").get();
    res.json(toPublicProfile(profile));
  });

  app.get("/api/experience", async (req, res) => {
    const experience = await db.prepare(`
      SELECT * FROM experience 
      ORDER BY 
        CASE WHEN period LIKE '%Present' THEN 1 ELSE 0 END DESC,
        startDate DESC, 
        id DESC
    `).all() as any[];
    const projectCounts = await db.prepare(`
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

  app.get("/api/projects", async (req, res) => {
    const projects = await db.prepare("SELECT * FROM projects ORDER BY sortDate DESC, id DESC").all();
    res.json(projects);
  });

  app.get("/api/projects/:id", async (req, res) => {
    const project = await db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
    if (!project) {
      res.status(404).json({ success: false, message: "Project not found" });
      return;
    }
    res.json(project);
  });

  app.get("/api/skills", async (req, res) => {
    const skills = await db.prepare("SELECT * FROM skills").all();
    res.json(skills);
  });

  app.get("/api/education", async (req, res) => {
    const education = await db
      .prepare("SELECT * FROM education ORDER BY sortOrder ASC, endYear DESC, year DESC, id DESC")
      .all();
    res.json(education);
  });

  app.get("/api/highlights", async (req, res) => {
    const highlights = await db.prepare("SELECT * FROM highlights ORDER BY sortOrder ASC, id ASC").all();
    res.json(highlights);
  });

  app.get("/api/about-photos", async (req, res) => {
    try {
      await ensureAboutPhotosTable();
      const photos = await db.prepare("SELECT * FROM about_photos ORDER BY sortOrder ASC, id ASC").all();
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

  app.post("/api/admin/login", async (req, res) => {
    try {
      const { username, password } = req.body ?? {};
      console.log(`[login] Login attempt started for username: "${username}"`);
      if (!username || !password) {
        res.status(400).json({ success: false, message: "Missing username or password" });
        return;
      }

      let adminCredentials: any = null;
      try {
        adminCredentials = await db.prepare("SELECT username, passwordHash FROM admin_credentials WHERE id = 1").get();
      } catch (dbErr: any) {
        console.error("[login] DB query failed during authentication check:", dbErr);
      }

      const storedHash = adminCredentials ? (adminCredentials.passwordHash ?? adminCredentials.passwordhash) : undefined;
      const storedUser = adminCredentials ? adminCredentials.username : undefined;

      const hashOfInput = hashPassword(password);
      const isRecordMatch = Boolean(
        adminCredentials &&
        username === storedUser &&
        hashOfInput === storedHash
      );

      const isEnvMatch = Boolean(
        username === SUPERUSER_USERNAME &&
        password === SUPERUSER_PASSWORD
      );

      console.log(`[login] Comparison complete - Database match: ${isRecordMatch}, Environment match: ${isEnvMatch}`);
      if (!isRecordMatch && !isEnvMatch) {
        res.status(401).json({ success: false, message: "Invalid credentials. Please double check the username and password." });
        return;
      }

      const token = createSessionToken(ADMIN_SESSION_SECRET);
      res.json({ success: true, token });
    } catch (routeErr: any) {
      console.error("[login] Crash in Express login route:", routeErr);
      res.status(500).json({ success: false, message: routeErr?.message || "Internal server error" });
    }
  });

  app.get("/api/admin/session", (req, res) => {
    res.json({ authenticated: isAuthorized(req) });
  });

  app.post("/api/admin/change-password", requireSuperuser, async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword || typeof currentPassword !== "string" || typeof newPassword !== "string") {
      res.status(400).json({ success: false, message: "Invalid payload" });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
      return;
    }

    const adminCredentials = await db.prepare("SELECT passwordHash FROM admin_credentials WHERE id = 1").get() as { passwordHash?: string; passwordhash?: string } | undefined;
    const storedHash = adminCredentials ? (adminCredentials.passwordHash ?? adminCredentials.passwordhash) : undefined;
    if (!adminCredentials || hashPassword(currentPassword) !== storedHash) {
      res.status(401).json({ success: false, message: "Current password is incorrect" });
      return;
    }

    await db.prepare("UPDATE admin_credentials SET passwordHash = ?, updatedAt = ? WHERE id = 1")
      .run(hashPassword(newPassword), new Date().toISOString());

    res.json({ success: true });
  });

  // Admin Update Routes
  app.post("/api/profile", requireSuperuser, async (req, res) => {
    const { name, title, status, carouselIntervalMs, email, linkedin, address, summary, bio, aboutPhoto } = req.body;
    const parsedInterval = Math.min(30000, Math.max(1000, Number(carouselIntervalMs) || DEFAULT_CAROUSEL_INTERVAL_MS));
    
    const storedAboutPhoto = aboutPhoto ? String(aboutPhoto) : "";

    await db.prepare("UPDATE profile SET name=?, title=?, status=?, carouselIntervalMs=?, email=?, linkedin=?, address=?, summary=?, bio=?, aboutPhoto=? WHERE id=1")
      .run(name, title, status, parsedInterval, email, linkedin, address, summary, bio, storedAboutPhoto);
    res.json({ success: true });
  });

  // Experience CRUD
  app.post("/api/experience", requireSuperuser, async (req, res) => {
    try {
      const { company, position, department, period, location, description, startDate, organizationGroupId, isPromotion } = req.body;
      const parsedGroupId = organizationGroupId ? Number(organizationGroupId) : null;
      const parsedPromotion = isPromotion ? 1 : 0;
      await db.prepare(
        "INSERT INTO experience (company, position, department, period, location, description, startDate, organizationGroupId, isPromotion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(company, position, department || "", period, location, description, startDate, parsedGroupId, parsedPromotion);
      res.json({ success: true });
    } catch (error: any) {
      console.error("POST /api/experience failed:", error);
      res.status(500).json({ success: false, message: error?.message || "Failed to save experience" });
    }
  });

  app.put("/api/experience/:id", requireSuperuser, async (req, res) => {
    try {
      const { company, position, department, period, location, description, startDate, organizationGroupId, isPromotion } = req.body;
      const parsedGroupId = organizationGroupId ? Number(organizationGroupId) : null;
      const parsedPromotion = isPromotion ? 1 : 0;
      await db.prepare(
        "UPDATE experience SET company=?, position=?, department=?, period=?, location=?, description=?, startDate=?, organizationGroupId=?, isPromotion=? WHERE id=?"
      ).run(company, position, department || "", period, location, description, startDate, parsedGroupId, parsedPromotion, req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("PUT /api/experience failed:", error);
      res.status(500).json({ success: false, message: error?.message || "Failed to update experience" });
    }
  });

  app.delete("/api/experience/:id", requireSuperuser, async (req, res) => {
    await db.prepare("DELETE FROM experience WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Projects CRUD
  app.post("/api/projects", requireSuperuser, async (req, res) => {
    const {
      title, client, date, projectStartDate, projectEndDate, location, features, activities, category, sortDate, image,
      outputDetails, activityDetails, photoGallery, outputTable, builderConfig, experienceId, isProjectManager,
      skills,
    } = req.body;
    const parsedExperienceId = experienceId ? Number(experienceId) : null;
    const parsedIsProjectManager = isProjectManager ? 1 : 0;
    await db.prepare("INSERT INTO projects (title, client, date, projectStartDate, projectEndDate, location, features, activities, category, sortDate, image, outputDetails, activityDetails, photoGallery, outputTable, builderConfig, experienceId, isProjectManager, skills) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        title, client, date, projectStartDate || null, projectEndDate || null, location, features, activities, category, sortDate, image,
        outputDetails || "", activityDetails || "", photoGallery || "[]", outputTable || "[]", builderConfig || "{}",
        parsedExperienceId, parsedIsProjectManager,
        skills || "[]"
      );
    res.json({ success: true });
  });

  app.put("/api/projects/:id", requireSuperuser, async (req, res) => {
    const {
      title, client, date, projectStartDate, projectEndDate, location, features, activities, category, sortDate, image,
      outputDetails, activityDetails, photoGallery, outputTable, builderConfig, experienceId, isProjectManager,
      skills,
    } = req.body;
    const parsedExperienceId = experienceId ? Number(experienceId) : null;
    const parsedIsProjectManager = isProjectManager ? 1 : 0;
    await db.prepare("UPDATE projects SET title=?, client=?, date=?, projectStartDate=?, projectEndDate=?, location=?, features=?, activities=?, category=?, sortDate=?, image=?, outputDetails=?, activityDetails=?, photoGallery=?, outputTable=?, builderConfig=?, experienceId=?, isProjectManager=?, skills=? WHERE id=?")
      .run(
        title, client, date, projectStartDate || null, projectEndDate || null, location, features, activities, category, sortDate, image,
        outputDetails || "", activityDetails || "", photoGallery || "[]", outputTable || "[]", builderConfig || "{}",
        parsedExperienceId, parsedIsProjectManager,
        skills || "[]",
        req.params.id
      );
    res.json({ success: true });
  });

  app.delete("/api/projects/:id", requireSuperuser, async (req, res) => {
    await db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Skills CRUD
  app.post("/api/skills", requireSuperuser, async (req, res) => {
    const { name, category, level } = req.body;
    await db.prepare("INSERT INTO skills (name, category, level) VALUES (?, ?, ?)")
      .run(name, category, level);
    res.json({ success: true });
  });

  app.put("/api/skills/:id", requireSuperuser, async (req, res) => {
    const { name, category, level } = req.body;
    await db.prepare("UPDATE skills SET name=?, category=?, level=? WHERE id=?")
      .run(name, category, level, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/skills/:id", requireSuperuser, async (req, res) => {
    await db.prepare("DELETE FROM skills WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Education CRUD
  app.post("/api/education", requireSuperuser, async (req, res) => {
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
    await db.prepare(
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

  app.put("/api/education/:id", requireSuperuser, async (req, res) => {
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
    await db.prepare(
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

  app.delete("/api/education/:id", requireSuperuser, async (req, res) => {
    await db.prepare("DELETE FROM education WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Highlights CRUD
  app.post("/api/highlights", requireSuperuser, async (req, res) => {
    const { title, subtitle, icon, iconColor, sortOrder } = req.body;
    await db.prepare("INSERT INTO highlights (title, subtitle, icon, iconColor, sortOrder) VALUES (?, ?, ?, ?, ?)")
      .run(title, subtitle, icon, iconColor, Number(sortOrder) || 0);
    res.json({ success: true });
  });

  app.put("/api/highlights/:id", requireSuperuser, async (req, res) => {
    const { title, subtitle, icon, iconColor, sortOrder } = req.body;
    await db.prepare("UPDATE highlights SET title=?, subtitle=?, icon=?, iconColor=?, sortOrder=? WHERE id=?")
      .run(title, subtitle, icon, iconColor, Number(sortOrder) || 0, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/highlights/:id", requireSuperuser, async (req, res) => {
    await db.prepare("DELETE FROM highlights WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // About photos CRUD
  app.post("/api/about-photos", requireSuperuser, async (req, res) => {
    try {
      await ensureAboutPhotosTable();
      const { image, caption, sortOrder, authority, date, type } = req.body;
      if (!image) {
        res.status(404).json({ success: false, message: "Image is required" });
        return;
      }
      const storedImage = persistAboutPhotoImage(String(image));
      await db.prepare("INSERT INTO about_photos (image, caption, sortOrder, authority, date, type) VALUES (?, ?, ?, ?, ?, ?)")
        .run(storedImage, caption || "", Number(sortOrder) || 0, authority || "", date || "", type || "Certificate");
      res.json({ success: true });
    } catch (error: any) {
      console.error("POST /api/about-photos failed:", error);
      res.status(500).json({ success: false, message: error?.message || "Failed to save photo" });
    }
  });

  app.put("/api/about-photos/:id", requireSuperuser, async (req, res) => {
    try {
      await ensureAboutPhotosTable();
      const { image, caption, sortOrder, authority, date, type } = req.body;
      const existing = await db.prepare("SELECT image FROM about_photos WHERE id = ?").get(req.params.id) as { image: string } | undefined;
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
      await db.prepare("UPDATE about_photos SET image=?, caption=?, sortOrder=?, authority=?, date=?, type=? WHERE id=?")
        .run(storedImage, caption || "", Number(sortOrder) || 0, authority || "", date || "", type || "Certificate", req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("PUT /api/about-photos failed:", error);
      res.status(500).json({ success: false, message: error?.message || "Failed to update photo" });
    }
  });

  app.delete("/api/about-photos/:id", requireSuperuser, async (req, res) => {
    try {
      await ensureAboutPhotosTable();
      const existing = await db.prepare("SELECT image FROM about_photos WHERE id = ?").get(req.params.id) as { image: string } | undefined;
      if (existing) removeAboutPhotoFile(existing.image);
      await db.prepare("DELETE FROM about_photos WHERE id = ?").run(req.params.id);
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
