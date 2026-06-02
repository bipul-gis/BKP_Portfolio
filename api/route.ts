import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  createSessionToken,
  getBearerToken,
  getSessionSecret,
  verifySessionToken,
} from "../lib/adminSession.js";

type AnyObj = Record<string, any>;

const SUPERUSER_USERNAME = process.env.SUPERUSER_USERNAME || "superuser";
const SUPERUSER_PASSWORD = process.env.SUPERUSER_PASSWORD || "change-this-password";
const ADMIN_SESSION_SECRET = getSessionSecret(SUPERUSER_PASSWORD);
const DEFAULT_LINKEDIN_URL = "https://www.linkedin.com/in/bipul-kumar-paul-7a90a0125";
const DEFAULT_STATUS_TEXT = "Available for new opportunities";
const ABOUT_PHOTO_MAX_DATA_URL_LENGTH = 2_500_000;

const hashPassword = (password: string) =>
  crypto.createHash("sha256").update(password).digest("hex");

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const toSortDate = (text: string) => {
  const [month, year] = String(text || "").split(" ");
  const idx = months.indexOf(month) + 1;
  if (!idx || !year) return null;
  return `${year}-${String(idx).padStart(2, "0")}`;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ABOUT_PHOTO_FILE_ROUTE = "/api/about-photos/files";
const PROJECT_IMAGE_FILE_ROUTE = "/api/projects/files";

const aboutPhotoImageCache: Record<string, string> = {};
const projectImageCache: Record<string, string> = {};

const contentTypeFromFilename = (filename: string) => {
  const ext = String(path.extname(filename || "")).toLowerCase().replace(".", "");
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "application/octet-stream";
};

const normalizeImageFilename = (input: string) => String(input || "").replace(/[^a-zA-Z0-9._-]/g, "");
const aboutPhotoFileUrl = (filename: string) => `${ABOUT_PHOTO_FILE_ROUTE}/${filename}`;
const projectImageFileUrl = (filename: string) => `${PROJECT_IMAGE_FILE_ROUTE}/${filename}`;

const sendImageResponse = (res: any, dataUrl: string) => {
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) return send(res, 400, { success: false, message: "Invalid image format" });
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Content-Type", match[1]);
  res.end(Buffer.from(match[2], "base64"));
};

const sendStaticFileResponse = (res: any, filePath: string) => {
  if (!fs.existsSync(filePath)) return false;
  const buffer = fs.readFileSync(filePath);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Content-Type", contentTypeFromFilename(filePath));
  res.end(buffer);
  return true;
};

const persistAboutPhotoImage = (imageData: string) => {
  if (!imageData) return "";
  if (imageData.startsWith(ABOUT_PHOTO_FILE_ROUTE + "/") || imageData.startsWith("/about/")) {
    return imageData;
  }
  if (!imageData.startsWith("data:image")) return imageData;

  const match = imageData.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image format. Use JPG or PNG.");

  const extRaw = match[1].split("/")[1].toLowerCase();
  const ext = extRaw === "jpeg" ? "jpg" : extRaw.replace("+xml", "");
  const filename = `${crypto.randomUUID()}.${ext}`;
  aboutPhotoImageCache[filename] = imageData;
  return aboutPhotoFileUrl(filename);
};

const persistProjectImage = (imageData: string) => {
  if (!imageData) return "";
  if (imageData.startsWith(PROJECT_IMAGE_FILE_ROUTE + "/") || imageData.startsWith("/projects/")) {
    return imageData;
  }
  if (!imageData.startsWith("data:image")) return imageData;

  const match = imageData.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image format. Use JPG or PNG.");

  const extRaw = match[1].split("/")[1].toLowerCase();
  const ext = extRaw === "jpeg" ? "jpg" : extRaw.replace("+xml", "");
  const filename = `${crypto.randomUUID()}.${ext}`;
  projectImageCache[filename] = imageData;
  return projectImageFileUrl(filename);
};

const globalKey = "__portfolio_mem_store_v4__";
const g = globalThis as any;

if (!g[globalKey]) {
  g[globalKey] = {
    admin: {
      username: SUPERUSER_USERNAME,
      passwordHash: hashPassword(SUPERUSER_PASSWORD),
    },
    profile: {
      id: 1,
      name: "Bipul Kumar Paul",
      title: "GIS Analyst & Meteorologist",
      status: DEFAULT_STATUS_TEXT,
      email: "bipulpaul2084@gmail.com",
      linkedin: DEFAULT_LINKEDIN_URL,
      address: "House: 492/20, Bashundhara Link Road, Dhaka-1212, Bangladesh",
      summary: "Over five years of experience in GIS and Remote Sensing, with a proven track record in land management and energy sector projects.",
      bio: "Currently serving as Assistant Consultant and Coordinator of GIS and Remote Sensing Department at EQMS Consulting Limited. Successfully led 6 projects as Project Manager and involved in more than 40 projects as a GIS Expert.",
      aboutPhoto: "",
    },
    experience: [
      { id: 1, company: "EQMS Consulting Limited", department: "GIS and Remote Sensing Department", position: "Assistant Consultant", period: "August 2021 to Present", location: "Bangladesh", description: "GIS database management, UAV/Drone image processing, Web GIS, and Project Management.", startDate: "2021-08", organizationGroupId: null, isPromotion: 0 },
      { id: 2, company: "Center for Environmental and Geographic Information Services (CEGIS)", position: "Research Consultant", period: "February 2021 to July 2021", location: "Bangladesh", description: "GIS database management, Land Use Land Cover classification, Mouza map digitization.", startDate: "2021-02", organizationGroupId: null, isPromotion: 0 },
      { id: 3, company: "Geo Planning for Advanced Development", position: "Assistant GIS Specialist", period: "August 2020 to January 2021", location: "Bangladesh", description: "GIS database preparation of electrical distribution network, Digitization from UAV imagery.", startDate: "2020-08", organizationGroupId: null, isPromotion: 0 },
      { id: 4, company: "Inspira Advisory and Consulting Limited", position: "Research Assistant", period: "August 2019 to November 2019", location: "Bangladesh", description: "Private Sector Assessment, Value Chain Analysis, Market Analysis.", startDate: "2019-08", organizationGroupId: null, isPromotion: 0 },
    ],
    projects: [
      { id: 1, title: "Pre-feasibility Study for Solar PV Plant", client: "Total Eren S.A. and BrightNight Bangladesh B.V.", experienceId: 1, isProjectManager: 1, date: "April 2023", projectStartDate: "2023-04", projectEndDate: "2023-04", location: "Satkhira, Bangladesh", features: "Drone based topography survey, Hydrological and flood risk assessment.", activities: "Project Manager: Drone image processing, DEM analysis, Report writing.", category: "Energy", sortDate: "2023-04", image: null, outputDetails: "", activityDetails: "", photoGallery: "[]", outputTable: "[]", builderConfig: "{}" },
      { id: 2, title: "Soil and Ground Water Analysis", client: "Singer Bangladesh", experienceId: 1, isProjectManager: 1, date: "December 2022", projectStartDate: "2022-12", projectEndDate: "2022-12", location: "Araihazar, Bangladesh", features: "Soil and ground water sample collection, Lab test of environmental parameters.", activities: "Project Manager: Borehole drilling, Baseline assessment, Team management.", category: "Environmental", sortDate: "2022-12", image: null, outputDetails: "", activityDetails: "", photoGallery: "[]", outputTable: "[]", builderConfig: "{}" },
      { id: 3, title: "Cadastral Survey for Wind & Solar Projects", client: "North-west Power Generation Company Ltd.", experienceId: 1, isProjectManager: 1, date: "January 2022", projectStartDate: "2022-01", projectEndDate: "2022-01", location: "Mawa and Payra, Bangladesh", features: "Cadastral survey, Land boundary demarcation.", activities: "Project Manager: Field visits, Mouza map digitization, Land elevation survey.", category: "Survey", sortDate: "2022-01", image: null, outputDetails: "", activityDetails: "", photoGallery: "[]", outputTable: "[]", builderConfig: "{}" },
      { id: 4, title: "GIS Data Collection on Power Supply", client: "JICA", experienceId: 1, isProjectManager: 1, date: "February 2022", projectStartDate: "2022-02", projectEndDate: "2022-02", location: "Bangladesh", features: "Geo-referenced dataset of PGCB Transmission and substation infrastructure.", activities: "Project Manager & GIS Expert: GIS data collection, Database management.", category: "Infrastructure", sortDate: "2022-02", image: null, outputDetails: "", activityDetails: "", photoGallery: "[]", outputTable: "[]", builderConfig: "{}" },
      { id: 5, title: "GIS coordinates collection of 12,635 schools", client: "Winrock International", experienceId: 1, isProjectManager: 0, date: "March 2023", projectStartDate: "2023-03", projectEndDate: "2023-03", location: "17 Districts of Bangladesh", features: "12674 project school survey using KoboCollect.", activities: "GIS Expert: Interactive dashboard, Web map preparation using Leaflet/Python.", category: "Education", sortDate: "2023-03", image: null, outputDetails: "", activityDetails: "", photoGallery: "[]", outputTable: "[]", builderConfig: "{}" },
    ],
    skills: [
      { id: 1, name: "ArcMap", category: "GIS", level: 95 },
      { id: 2, name: "ArcGIS Pro", category: "GIS", level: 90 },
      { id: 3, name: "QGIS", category: "GIS", level: 90 },
      { id: 4, name: "Python", category: "Programming", level: 85 },
      { id: 5, name: "SQL", category: "Programming", level: 80 },
      { id: 6, name: "Remote Sensing", category: "Analysis", level: 95 },
      { id: 7, name: "UAV/Drone Processing", category: "Survey", level: 90 },
      { id: 8, name: "AutoCAD", category: "Design", level: 80 },
    ],
    education: [
      {
        id: 1,
        degree: "Bachelor of Urban and Regional Planning (BURP)",
        institution: "Khulna University of Engineering & Technology (KUET)",
        year: "2019",
        endYear: "2019",
        startYear: "2014",
        details: "Department of Urban and Regional Planning",
        location: "Khulna, Bangladesh",
        gpa: "",
        courses: "[]",
        sortOrder: 1,
      },
      {
        id: 2,
        degree: "Higher Secondary School Certificate (HSC)",
        institution: "Saint Joseph Higher Secondary School, Dhaka",
        year: "2014",
        endYear: "2014",
        startYear: "2012",
        details: "Science",
        location: "Dhaka, Bangladesh",
        gpa: "",
        courses: "[]",
        sortOrder: 2,
      },
      {
        id: 3,
        degree: "Secondary School Certificate (SSC)",
        institution: "Rajapur High School, Natore",
        year: "2012",
        endYear: "2012",
        startYear: "2010",
        details: "Science",
        location: "Natore, Bangladesh",
        gpa: "",
        courses: "[]",
        sortOrder: 3,
      },
    ],
    highlights: [
      { id: 1, title: "GIS Expert", subtitle: "Spatial Analysis & Mapping", icon: "Map", iconColor: "text-emerald-600", sortOrder: 1 },
      { id: 2, title: "Meteorology", subtitle: "Weather & Climate Studies", icon: "Cloud", iconColor: "text-blue-600", sortOrder: 2 },
      { id: 3, title: "Data Science", subtitle: "Python & SQL Automation", icon: "Database", iconColor: "text-purple-600", sortOrder: 3 },
      { id: 4, title: "Remote Sensing", subtitle: "UAV & Satellite Imaging", icon: "Layers", iconColor: "text-orange-600", sortOrder: 4 },
    ],
    aboutPhotos: [
      { id: 1, image: "/about/6643c6c7-ed6e-4d8a-8c9c-95b998a2d36f.jpg", caption: "fdsf", sortOrder: 1 },
      { id: 2, image: "/about/b1c06fff-31d2-4ac9-af13-56b6c5bc1690.jpg", caption: "", sortOrder: 2 },
      { id: 3, image: "/about/9307abf5-a735-4fd0-83a5-74ce72d878b1.jpg", caption: "dsfa", sortOrder: 3 },
    ] as AnyObj[],
  };
}

const store = g[globalKey] as {
  admin: { username: string; passwordHash: string };
  profile: AnyObj;
  experience: AnyObj[];
  projects: AnyObj[];
  skills: AnyObj[];
  education: AnyObj[];
  highlights: AnyObj[];
  aboutPhotos: AnyObj[];
};
store.profile.linkedin = store.profile.linkedin || DEFAULT_LINKEDIN_URL;
store.profile.status = store.profile.status || DEFAULT_STATUS_TEXT;
delete store.profile.phone;

const authorized = (req: any) => verifySessionToken(getBearerToken(req), ADMIN_SESSION_SECRET);
const send = (res: any, status: number, data: any) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  return res.status(status).json(data);
};
const toPublicProfile = (profile: AnyObj) => {
  const { phone, ...publicProfile } = profile;
  return publicProfile;
};

export default function handler(req: any, res: any) {
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
    if (method === "GET" && first === "profile") return send(res, 200, toPublicProfile(store.profile));
    if (method === "GET" && first === "experience") {
      const rows = [...store.experience].sort((a, b) => String(b.startDate || "").localeCompare(String(a.startDate || "")));
      const withCounts = rows.map((exp) => ({
        ...exp,
        projectCount: store.projects.filter((p) => Number(p.experienceId) === Number(exp.id)).length,
      }));
      return send(res, 200, withCounts);
    }
    if (method === "GET" && first === "projects" && !second) {
      const rows = [...store.projects].sort((a, b) => String(b.sortDate || "").localeCompare(String(a.sortDate || "")));
      return send(res, 200, rows);
    }
    if (method === "GET" && first === "projects" && second === "files" && route[2]) {
      const filename = normalizeImageFilename(String(route[2]));
      const project = store.projects.find((p) => {
        const img = String(p.image || "");
        return img.includes(filename);
      });
      if (!project) return send(res, 404, { success: false, message: "Project image not found" });
      const img = String(project.image || "");
      if (img.startsWith("data:image")) {
        return sendImageResponse(res, img);
      }
      if (img.startsWith(PROJECT_IMAGE_FILE_ROUTE + "/")) {
        const filenameOnly = path.basename(img);
        const cached = projectImageCache[filenameOnly];
        if (cached) return sendImageResponse(res, cached);
        if (project.imageData) return sendImageResponse(res, String(project.imageData));
        const filePath = path.join(__dirname, "..", "public", "projects", filenameOnly);
        if (sendStaticFileResponse(res, filePath)) return;
      }
      if (img.startsWith("/projects/")) {
        const filePath = path.join(__dirname, "..", "public", "projects", filename);
        if (sendStaticFileResponse(res, filePath)) return;
      }
      return send(res, 404, { success: false, message: "Project image not found" });
    }
    if (method === "GET" && first === "projects" && second) {
      const row = store.projects.find((x) => String(x.id) === String(second));
      if (!row) return send(res, 404, { success: false, message: "Project not found" });
      return send(res, 200, row);
    }
    if (method === "GET" && first === "skills") return send(res, 200, store.skills);
    if (method === "GET" && first === "education") {
      return send(
        res,
        200,
        [...store.education].sort(
          (a, b) =>
            Number(a.sortOrder || 0) - Number(b.sortOrder || 0) ||
            String(b.endYear || b.year || "").localeCompare(String(a.endYear || a.year || ""))
        )
      );
    }
    if (method === "GET" && first === "highlights") {
      return send(res, 200, [...store.highlights].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)));
    }
    if (method === "GET" && first === "about-photos" && second === "files" && route[2]) {
      const filename = normalizeImageFilename(String(route[2]));
      const photo = store.aboutPhotos.find((p) => {
        const img = String(p.image || "");
        return img.includes(filename);
      });
      if (!photo) return send(res, 404, { success: false, message: "Photo not found" });
      const img = String(photo.image || "");
      if (img.startsWith("data:image")) {
        return sendImageResponse(res, img);
      }
      if (img.startsWith(ABOUT_PHOTO_FILE_ROUTE + "/")) {
        const filenameOnly = path.basename(img);
        const cached = aboutPhotoImageCache[filenameOnly];
        if (cached) return sendImageResponse(res, cached);
        if (photo.imageData) return sendImageResponse(res, String(photo.imageData));
        const filePath = path.join(__dirname, "..", "public", "about", filenameOnly);
        if (sendStaticFileResponse(res, filePath)) return;
      }
      if (img.startsWith("/about/")) {
        const filePath = path.join(__dirname, "..", "public", "about", filename);
        if (sendStaticFileResponse(res, filePath)) return;
      }
      return send(res, 404, { success: false, message: "Photo not found" });
    }
    if (method === "GET" && first === "about-photos" && !second) {
      return send(res, 200, [...store.aboutPhotos].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)));
    }

    if (method === "POST" && first === "admin" && second === "login") {
      if (body.username !== store.admin.username || hashPassword(String(body.password || "")) !== store.admin.passwordHash) {
        return send(res, 401, { success: false, message: "Invalid credentials" });
      }
      const token = createSessionToken(ADMIN_SESSION_SECRET);
      return send(res, 200, { success: true, token });
    }
    if (method === "GET" && first === "admin" && second === "session") return send(res, 200, { authenticated: authorized(req) });
    if (method === "POST" && first === "admin" && second === "change-password") {
      if (!authorized(req)) return send(res, 401, { success: false, message: "Unauthorized" });
      const current = String(body.currentPassword || "");
      const next = String(body.newPassword || "");
      if (!current || !next || next.length < 8) return send(res, 400, { success: false, message: "Invalid payload" });
      if (hashPassword(current) !== store.admin.passwordHash) return send(res, 401, { success: false, message: "Current password is incorrect" });
      store.admin.passwordHash = hashPassword(next);
      return send(res, 200, { success: true });
    }

    const writeProtected =
      (method === "POST" && ["profile", "experience", "projects", "skills", "education", "highlights", "about-photos"].includes(first)) ||
      (["PUT", "DELETE"].includes(method) && ["experience", "projects", "skills", "education", "highlights", "about-photos"].includes(first));
    if (writeProtected && !authorized(req)) return send(res, 401, { success: false, message: "Unauthorized" });

    if (method === "POST" && first === "profile") {
      store.profile = { ...store.profile, ...body, id: 1 };
      return send(res, 200, { success: true });
    }
    if (method === "POST" && first === "experience") {
      const id = (store.experience.at(-1)?.id || 0) + 1;
      store.experience.push({ id, ...body });
      return send(res, 200, { success: true });
    }
    if (method === "PUT" && first === "experience" && second) {
      store.experience = store.experience.map((x) => (String(x.id) === String(second) ? { ...x, ...body } : x));
      return send(res, 200, { success: true });
    }
    if (method === "DELETE" && first === "experience" && second) {
      store.experience = store.experience.filter((x) => String(x.id) !== String(second));
      return send(res, 200, { success: true });
    }

    if (method === "POST" && first === "projects") {
      const id = (store.projects.at(-1)?.id || 0) + 1;
      const image = persistProjectImage(String(body.image || ""));
      const start = body.projectStartDate || null;
      const projectRecord: AnyObj = {
        id,
        ...body,
        image,
        projectStartDate: start,
        projectEndDate: body.projectEndDate || null,
        sortDate: body.sortDate || toSortDate(body.date || "") || start || null,
      };
      if (String(body.image || "").startsWith("data:image")) projectRecord.imageData = String(body.image);
      store.projects.push(projectRecord);
      return send(res, 200, { success: true });
    }
    if (method === "PUT" && first === "projects" && second) {
      store.projects = store.projects.map((x) =>
        String(x.id) === String(second)
          ? {
              ...x,
              ...body,
              image: body.image ? persistProjectImage(String(body.image)) : x.image,
              imageData: body.image ? String(body.image) : x.imageData,
              sortDate:
                body.sortDate ||
                x.sortDate ||
                toSortDate(body.date || x.date || "") ||
                body.projectStartDate ||
                x.projectStartDate ||
                null,
            }
          : x
      );
      return send(res, 200, { success: true });
    }
    if (method === "DELETE" && first === "projects" && second) {
      store.projects = store.projects.filter((x) => String(x.id) !== String(second));
      return send(res, 200, { success: true });
    }

    if (method === "POST" && first === "skills") {
      const id = (store.skills.at(-1)?.id || 0) + 1;
      store.skills.push({ id, ...body, level: Number(body.level || 0) });
      return send(res, 200, { success: true });
    }
    if (method === "PUT" && first === "skills" && second) {
      store.skills = store.skills.map((x) => (String(x.id) === String(second) ? { ...x, ...body, level: Number(body.level || x.level || 0) } : x));
      return send(res, 200, { success: true });
    }
    if (method === "DELETE" && first === "skills" && second) {
      store.skills = store.skills.filter((x) => String(x.id) !== String(second));
      return send(res, 200, { success: true });
    }

    if (method === "POST" && first === "education") {
      const id = (store.education.at(-1)?.id || 0) + 1;
      store.education.push({
        id,
        ...body,
        details: body.details || "",
        location: body.location || "",
        gpa: body.gpa || "",
        startYear: body.startYear || "",
        endYear: body.endYear || body.year || "",
        courses: body.courses || "[]",
        sortOrder: Number(body.sortOrder || 0),
      });
      return send(res, 200, { success: true });
    }
    if (method === "PUT" && first === "education" && second) {
      store.education = store.education.map((x) =>
        String(x.id) === String(second)
          ? {
              ...x,
              ...body,
              details: body.details || "",
              location: body.location || "",
              gpa: body.gpa || "",
              startYear: body.startYear || "",
              endYear: body.endYear || body.year || "",
              courses: body.courses || "[]",
              sortOrder: Number(body.sortOrder ?? x.sortOrder ?? 0),
            }
          : x
      );
      return send(res, 200, { success: true });
    }
    if (method === "DELETE" && first === "education" && second) {
      store.education = store.education.filter((x) => String(x.id) !== String(second));
      return send(res, 200, { success: true });
    }

    if (method === "POST" && first === "highlights") {
      const id = (store.highlights.at(-1)?.id || 0) + 1;
      store.highlights.push({ id, ...body, sortOrder: Number(body.sortOrder || 0) });
      return send(res, 200, { success: true });
    }
    if (method === "PUT" && first === "highlights" && second) {
      store.highlights = store.highlights.map((x) =>
        String(x.id) === String(second) ? { ...x, ...body, sortOrder: Number(body.sortOrder ?? x.sortOrder ?? 0) } : x
      );
      return send(res, 200, { success: true });
    }
    if (method === "DELETE" && first === "highlights" && second) {
      store.highlights = store.highlights.filter((x) => String(x.id) !== String(second));
      return send(res, 200, { success: true });
    }

    if (method === "POST" && first === "about-photos") {
      if (!body.image) return send(res, 400, { success: false, message: "Image is required" });
      const rawImage = String(body.image);
      if (rawImage.startsWith("data:") && rawImage.length > ABOUT_PHOTO_MAX_DATA_URL_LENGTH) {
        return send(res, 413, { success: false, message: "Image too large for Vercel. Use a smaller JPG or PNG." });
      }
      const image = persistAboutPhotoImage(rawImage);
      const id = (store.aboutPhotos.at(-1)?.id || 0) + 1;
      const photoRecord: AnyObj = { id, image, caption: body.caption || "", sortOrder: Number(body.sortOrder || 0) };
      if (rawImage.startsWith("data:image")) photoRecord.imageData = rawImage;
      store.aboutPhotos.push(photoRecord);
      return send(res, 200, { success: true });
    }
    if (method === "PUT" && first === "about-photos" && second) {
      const existing = store.aboutPhotos.find((x) => String(x.id) === String(second));
      if (!existing) return send(res, 404, { success: false, message: "Photo not found" });
      const nextImage = body.image ? String(body.image) : "";
      if (nextImage.startsWith("data:") && nextImage.length > ABOUT_PHOTO_MAX_DATA_URL_LENGTH) {
        return send(res, 413, { success: false, message: "Image too large for Vercel. Use a smaller JPG or PNG." });
      }
      store.aboutPhotos = store.aboutPhotos.map((x) =>
        String(x.id) === String(second)
          ? {
              ...x,
              image: nextImage ? persistAboutPhotoImage(nextImage) : x.image,
              imageData: nextImage ? nextImage : x.imageData,
              caption: body.caption || "",
              sortOrder: Number(body.sortOrder ?? x.sortOrder ?? 0),
            }
          : x
      );
      return send(res, 200, { success: true });
    }
    if (method === "DELETE" && first === "about-photos" && second) {
      store.aboutPhotos = store.aboutPhotos.filter((x) => String(x.id) !== String(second));
      return send(res, 200, { success: true });
    }

    return send(res, 404, { success: false, message: "Not found" });
  } catch (err: any) {
    return send(res, 500, { success: false, message: err?.message || "Server error" });
  }
}
