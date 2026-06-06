import crypto from "crypto";
import {
  createSessionToken,
  getBearerToken,
  getSessionSecret,
  verifySessionToken,
} from "../lib/adminSession.js";
import { db } from "../db.js";

type AnyObj = Record<string, any>;

const SUPERUSER_USERNAME = process.env.SUPERUSER_USERNAME || "superuser";
const SUPERUSER_PASSWORD = process.env.SUPERUSER_PASSWORD || "change-this-password";
const ADMIN_SESSION_SECRET = getSessionSecret(SUPERUSER_PASSWORD);
const DEFAULT_LINKEDIN_URL = "https://www.linkedin.com/in/bipul-kumar-paul-7a90a0125";
const DEFAULT_STATUS_TEXT = "Available for new opportunities";
const DEFAULT_CAROUSEL_INTERVAL_MS = 4500;
const ABOUT_PHOTO_MAX_DATA_URL_LENGTH = 12_000_000;

const hashPassword = (password: string) =>
  crypto.createHash("sha256").update(password).digest("hex");

const authorized = (req: any) => verifySessionToken(getBearerToken(req), ADMIN_SESSION_SECRET);
const send = (res: any, status: number, data: any) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  return res.status(status).json(data);
};
const toPublicProfile = (profile: AnyObj) => {
  if (!profile) return {};
  const { phone, ...publicProfile } = profile;
  return publicProfile;
};

export default async function handler(req: any, res: any) {
  const pathParam = req.query?.path;
  const route = Array.isArray(pathParam)
    ? pathParam
    : typeof pathParam === "string" && pathParam.length > 0
      ? pathParam.split("/").filter(Boolean)
      : [];
  const method = String(req.method || "GET").toUpperCase();
  const first = route[0] || "";
  const second = route[1] || "";
  const body = req.body || {};

  try {
    // Lazy initialize database schemas & seeds on the first ever incoming request!
    await db.ensureDatabaseInitialized();
  } catch (dbInitErr: any) {
    console.error("Vercel lazy-init DB failed:", dbInitErr);
  }

  try {
    // 1. GET profile
    if (method === "GET" && first === "profile") {
      const profile = await db.prepare("SELECT * FROM profile WHERE id = 1").get();
      return send(res, 200, toPublicProfile(profile || {}));
    }

    // 2. GET experience
    if (method === "GET" && first === "experience") {
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
      const withCounts = experience.map((exp) => ({
        ...exp,
        projectCount: countByExperienceId[exp.id] || 0,
      }));
      return send(res, 200, withCounts);
    }

    // 3. GET projects list
    if (method === "GET" && first === "projects" && !second) {
      const projects = await db.prepare("SELECT * FROM projects ORDER BY sortDate DESC, id DESC").all();
      return send(res, 200, projects);
    }

    // 4. GET individual project
    if (method === "GET" && first === "projects" && second) {
      const row = await db.prepare("SELECT * FROM projects WHERE id = ?").get(second);
      if (!row) return send(res, 404, { success: false, message: "Project not found" });
      return send(res, 200, row);
    }

    // 5. GET skills
    if (method === "GET" && first === "skills") {
      const skills = await db.prepare("SELECT * FROM skills").all();
      return send(res, 200, skills);
    }

    // 6. GET education
    if (method === "GET" && first === "education") {
      const education = await db.prepare("SELECT * FROM education ORDER BY sortOrder ASC, endYear DESC, year DESC, id DESC").all();
      return send(res, 200, education);
    }

    // 7. GET highlights
    if (method === "GET" && first === "highlights") {
      const highlights = await db.prepare("SELECT * FROM highlights ORDER BY sortOrder ASC, id ASC").all();
      return send(res, 200, highlights);
    }

    // 8. GET about-photos/files/:filename
    if (method === "GET" && first === "about-photos" && second === "files" && route[2]) {
      const filename = String(route[2]).replace(/[^a-zA-Z0-9._-]/g, "");
      // Look up photo by matching base image string or filename in DB
      const photo = await db.prepare("SELECT * FROM about_photos WHERE image LIKE ?").get(`%${filename}%`);
      if (!photo) return send(res, 404, { success: false, message: "Photo not found in database" });
      const img = String(photo.image);
      if (img.startsWith("data:image")) {
        const match = img.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
        if (!match) return send(res, 400, { success: false, message: "Invalid image" });
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Content-Type", match[1]);
        res.end(Buffer.from(match[2], "base64"));
        return;
      }
      return send(res, 404, { success: false, message: "Photo format not base64" });
    }

    // 9. GET about-photos list
    if (method === "GET" && first === "about-photos" && !second) {
      const photos = await db.prepare("SELECT * FROM about_photos ORDER BY sortOrder ASC, id ASC").all();
      return send(res, 200, photos);
    }

    // 10. POST admin login
    if (method === "POST" && first === "admin" && second === "login") {
      try {
        const { username, password } = body;
        console.log(`[Vercel API login] Handler triggered for username: "${username}"`);
        if (!username || !password) {
          return send(res, 400, { success: false, message: "Missing username or password" });
        }

        let adminCredentials: any = null;
        try {
          adminCredentials = await db.prepare("SELECT username, passwordHash FROM admin_credentials WHERE id = 1").get();
        } catch (dbErr: any) {
          console.error("[Vercel API login] Database check failed:", dbErr);
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

        console.log(`[Vercel API login] recordMatch: ${isRecordMatch}, envMatch: ${isEnvMatch}`);
        if (!isRecordMatch && !isEnvMatch) {
          return send(res, 401, { success: false, message: "Invalid credentials. Please double check the username and password." });
        }

        const token = createSessionToken(ADMIN_SESSION_SECRET);
        return send(res, 200, { success: true, token });
      } catch (handlerErr: any) {
        console.error("[Vercel API login] Fatal error in route handler:", handlerErr);
        return send(res, 500, { success: false, message: handlerErr?.message || "Internal server error" });
      }
    }

    // 11. GET admin session
    if (method === "GET" && first === "admin" && second === "session") {
      return send(res, 200, { authenticated: authorized(req) });
    }

    // 12. POST change admin password
    if (method === "POST" && first === "admin" && second === "change-password") {
      if (!authorized(req)) return send(res, 401, { success: false, message: "Unauthorized" });
      const current = String(body.currentPassword || "");
      const next = String(body.newPassword || "");
      if (!current || !next || next.length < 8) return send(res, 400, { success: false, message: "Invalid payload" });
      
      const adminCredentials = await db.prepare("SELECT passwordHash FROM admin_credentials WHERE id = 1").get() as { passwordHash?: string; passwordhash?: string } | undefined;
      const storedHash = adminCredentials ? (adminCredentials.passwordHash ?? adminCredentials.passwordhash) : undefined;
      if (!adminCredentials || hashPassword(current) !== storedHash) {
        return send(res, 401, { success: false, message: "Current password is incorrect" });
      }
      await db.prepare("UPDATE admin_credentials SET passwordHash = ?, updatedAt = ? WHERE id = 1")
        .run(hashPassword(next), new Date().toISOString());
      return send(res, 200, { success: true });
    }

    // Protected POST/PUT/DELETE checks
    const writeProtected =
      (method === "POST" && ["profile", "experience", "projects", "skills", "education", "highlights", "about-photos"].includes(first)) ||
      (["PUT", "DELETE"].includes(method) && ["experience", "projects", "skills", "education", "highlights", "about-photos"].includes(first));
    if (writeProtected && !authorized(req)) return send(res, 401, { success: false, message: "Unauthorized" });

    // 13. POST profile
    if (method === "POST" && first === "profile") {
      const { name, title, status, carouselIntervalMs, email, linkedin, address, summary, bio, aboutPhoto } = body;
      const parsedInterval = Math.min(30000, Math.max(1000, Number(carouselIntervalMs) || DEFAULT_CAROUSEL_INTERVAL_MS));
      await db.prepare("UPDATE profile SET name=?, title=?, status=?, carouselIntervalMs=?, email=?, linkedin=?, address=?, summary=?, bio=?, aboutPhoto=? WHERE id=1")
        .run(name, title, status, parsedInterval, email, linkedin, address, summary, bio, aboutPhoto || "");
      return send(res, 200, { success: true });
    }

    // 14. POST experience
    if (method === "POST" && first === "experience") {
      const { company, position, department, period, location, description, startDate, organizationGroupId, isPromotion } = body;
      const parsedGroupId = organizationGroupId ? Number(organizationGroupId) : null;
      const parsedPromotion = isPromotion ? 1 : 0;
      await db.prepare(
        "INSERT INTO experience (company, position, department, period, location, description, startDate, organizationGroupId, isPromotion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(company, position, department || "", period, location, description, startDate, parsedGroupId, parsedPromotion);
      return send(res, 200, { success: true });
    }

    // 15. PUT experience
    if (method === "PUT" && first === "experience" && second) {
      const { company, position, department, period, location, description, startDate, organizationGroupId, isPromotion } = body;
      const parsedGroupId = organizationGroupId ? Number(organizationGroupId) : null;
      const parsedPromotion = isPromotion ? 1 : 0;
      await db.prepare(
        "UPDATE experience SET company=?, position=?, department=?, period=?, location=?, description=?, startDate=?, organizationGroupId=?, isPromotion=? WHERE id=?"
      ).run(company, position, department || "", period, location, description, startDate, parsedGroupId, parsedPromotion, second);
      return send(res, 200, { success: true });
    }

    // 16. DELETE experience
    if (method === "DELETE" && first === "experience" && second) {
      await db.prepare("DELETE FROM experience WHERE id = ?").run(second);
      return send(res, 200, { success: true });
    }

    // 17. POST projects
    if (method === "POST" && first === "projects") {
      const {
        title, client, date, projectStartDate, projectEndDate, location, features, activities, category, sortDate, image,
        outputDetails, activityDetails, photoGallery, outputTable, builderConfig, experienceId, isProjectManager,
        skills,
      } = body;
      const parsedExperienceId = experienceId ? Number(experienceId) : null;
      const parsedIsProjectManager = isProjectManager ? 1 : 0;
      await db.prepare("INSERT INTO projects (title, client, date, projectStartDate, projectEndDate, location, features, activities, category, sortDate, image, outputDetails, activityDetails, photoGallery, outputTable, builderConfig, experienceId, isProjectManager, skills) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(
          title, client, date, projectStartDate || null, projectEndDate || null, location, features, activities, category, sortDate, image,
          outputDetails || "", activityDetails || "", photoGallery || "[]", outputTable || "[]", builderConfig || "{}",
          parsedExperienceId, parsedIsProjectManager,
          skills || "[]"
        );
      return send(res, 200, { success: true });
    }

    // 18. PUT projects
    if (method === "PUT" && first === "projects" && second) {
      const {
        title, client, date, projectStartDate, projectEndDate, location, features, activities, category, sortDate, image,
        outputDetails, activityDetails, photoGallery, outputTable, builderConfig, experienceId, isProjectManager,
        skills,
      } = body;
      const parsedExperienceId = experienceId ? Number(experienceId) : null;
      const parsedIsProjectManager = isProjectManager ? 1 : 0;
      await db.prepare("UPDATE projects SET title=?, client=?, date=?, projectStartDate=?, projectEndDate=?, location=?, features=?, activities=?, category=?, sortDate=?, image=?, outputDetails=?, activityDetails=?, photoGallery=?, outputTable=?, builderConfig=?, experienceId=?, isProjectManager=?, skills=? WHERE id=?")
        .run(
          title, client, date, projectStartDate || null, projectEndDate || null, location, features, activities, category, sortDate, image,
          outputDetails || "", activityDetails || "", photoGallery || "[]", outputTable || "[]", builderConfig || "{}",
          parsedExperienceId, parsedIsProjectManager,
          skills || "[]",
          second
        );
      return send(res, 200, { success: true });
    }

    // 19. DELETE projects
    if (method === "DELETE" && first === "projects" && second) {
      await db.prepare("DELETE FROM projects WHERE id = ?").run(second);
      return send(res, 200, { success: true });
    }

    // 20. POST skills
    if (method === "POST" && first === "skills") {
      const { name, category, level } = body;
      await db.prepare("INSERT INTO skills (name, category, level) VALUES (?, ?, ?)")
        .run(name, category, level);
      return send(res, 200, { success: true });
    }

    // 21. PUT skills
    if (method === "PUT" && first === "skills" && second) {
      const { name, category, level } = body;
      await db.prepare("UPDATE skills SET name=?, category=?, level=? WHERE id=?")
        .run(name, category, level, second);
      return send(res, 200, { success: true });
    }

    // 22. DELETE skills
    if (method === "DELETE" && first === "skills" && second) {
      await db.prepare("DELETE FROM skills WHERE id = ?").run(second);
      return send(res, 200, { success: true });
    }

    // 23. POST education
    if (method === "POST" && first === "education") {
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
      } = body;
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
      return send(res, 200, { success: true });
    }

    // 24. PUT education
    if (method === "PUT" && first === "education" && second) {
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
      } = body;
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
        second
      );
      return send(res, 200, { success: true });
    }

    // 25. DELETE education
    if (method === "DELETE" && first === "education" && second) {
      await db.prepare("DELETE FROM education WHERE id = ?").run(second);
      return send(res, 200, { success: true });
    }

    // 26. POST highlights
    if (method === "POST" && first === "highlights") {
      const { title, subtitle, icon, iconColor, sortOrder } = body;
      await db.prepare("INSERT INTO highlights (title, subtitle, icon, iconColor, sortOrder) VALUES (?, ?, ?, ?, ?)")
        .run(title, subtitle, icon, iconColor ?? "text-blue-600", Number(sortOrder) || 0);
      return send(res, 200, { success: true });
    }

    // 27. PUT highlights
    if (method === "PUT" && first === "highlights" && second) {
      const { title, subtitle, icon, iconColor, sortOrder } = body;
      await db.prepare("UPDATE highlights SET title=?, subtitle=?, icon=?, iconColor=?, sortOrder=? WHERE id=?")
        .run(title, subtitle, icon, iconColor ?? "text-blue-600", Number(sortOrder) || 0, second);
      return send(res, 200, { success: true });
    }

    // 28. DELETE highlights
    if (method === "DELETE" && first === "highlights" && second) {
      await db.prepare("DELETE FROM highlights WHERE id = ?").run(second);
      return send(res, 200, { success: true });
    }

    // 29. POST about-photos
    if (method === "POST" && first === "about-photos") {
      const { image, caption, sortOrder, authority, date, type } = body;
      if (!image) return send(res, 400, { success: false, message: "Image is required" });
      const imageStr = String(image);
      if (imageStr.length > ABOUT_PHOTO_MAX_DATA_URL_LENGTH) {
        return send(res, 413, { success: false, message: "Image too large for Vercel. Use a smaller JPG or PNG." });
      }
      await db.prepare("INSERT INTO about_photos (image, caption, sortOrder, authority, date, type) VALUES (?, ?, ?, ?, ?, ?)")
        .run(imageStr, caption || "", Number(sortOrder) || 0, authority || "", date || "", type || "Certificate");
      return send(res, 200, { success: true });
    }

    // 30. PUT about-photos
    if (method === "PUT" && first === "about-photos" && second) {
      const { image, caption, sortOrder, authority, date, type } = body;
      const imageStr = image ? String(image) : "";
      if (imageStr && imageStr.length > ABOUT_PHOTO_MAX_DATA_URL_LENGTH) {
        return send(res, 413, { success: false, message: "Image too large for Vercel. Use a smaller JPG or PNG." });
      }
      if (imageStr) {
        await db.prepare("UPDATE about_photos SET image=?, caption=?, sortOrder=?, authority=?, date=?, type=? WHERE id=?")
          .run(imageStr, caption || "", Number(sortOrder) || 0, authority || "", date || "", type || "Certificate", second);
      } else {
        await db.prepare("UPDATE about_photos SET caption=?, sortOrder=?, authority=?, date=?, type=? WHERE id=?")
          .run(caption || "", Number(sortOrder) || 0, authority || "", date || "", type || "Certificate", second);
      }
      return send(res, 200, { success: true });
    }

    // 31. DELETE about-photos
    if (method === "DELETE" && first === "about-photos" && second) {
      await db.prepare("DELETE FROM about_photos WHERE id = ?").run(second);
      return send(res, 200, { success: true });
    }

    return send(res, 404, { success: false, message: "Not found" });
  } catch (err: any) {
    return send(res, 500, { success: false, message: err?.message || "Server error" });
  }
}
