import Database from "better-sqlite3";
import pg from "pg";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const hashPassword = (password: string) =>
  crypto.createHash("sha256").update(password).digest("hex");

const DEFAULT_STATUS_TEXT = "Available for new opportunities";
const DEFAULT_LINKEDIN_URL = "https://www.linkedin.com/in/bipul-kumar-paul-7a90a0125";
const DEFAULT_CAROUSEL_INTERVAL_MS = 4500;
const SUPERUSER_USERNAME = process.env.SUPERUSER_USERNAME || "superuser";
const SUPERUSER_PASSWORD = process.env.SUPERUSER_PASSWORD || "change-this-password";

let initializationPromise: Promise<void> | null = null;

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_PRISMA_URL;
let isPostgres = false;
let pgPool: pg.Pool | null = null;
let sqliteDb: Database.Database | null = null;

if (databaseUrl) {
  isPostgres = true;
  // Bypass self-signed certificate in certificate chain validation for database connections
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  pgPool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1") ? false : {
      rejectUnauthorized: false
    }
  });
  console.log("[db] initialized PostgreSQL pool");
} else {
  sqliteDb = new Database("portfolio.db");
  sqliteDb.pragma("integrity_check");
  console.log("[db] initialized better-sqlite3 database");
}

function convertSqlPlaceholders(sql: string): string {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

class StatementWrapper {
  private sql: string;
  constructor(sql: string) {
    this.sql = sql;
  }

  async all(...params: any[]): Promise<any[]> {
    if (isPostgres && pgPool) {
      // Intercept SQLite PRAGMA table_info calls
      const match = this.sql.match(/PRAGMA\s+table_info\s*\(\s*(\w+)\s*\)/i);
      if (match) {
        const tableName = match[1].toLowerCase();
        const res = await pgPool.query(
          `SELECT column_name AS name FROM information_schema.columns WHERE table_name = $1`,
          [tableName]
        );
        return res.rows;
      }
      
      // Intercept SQLite sqlite_master calls
      const existsTableMatch = this.sql.match(/SELECT\s+name\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=\s*'(\w+)'/i);
      if (existsTableMatch) {
         const tableName = existsTableMatch[1].toLowerCase();
         const res = await pgPool.query(
           `SELECT table_name AS name FROM information_schema.tables WHERE table_name = $1`,
           [tableName]
         );
         return res.rows;
      }

      const pgSql = convertSqlPlaceholders(this.sql);
      const res = await pgPool.query(pgSql, params);
      return res.rows;
    } else {
      const stmt = sqliteDb!.prepare(this.sql);
      return stmt.all(...params);
    }
  }

  async get(...params: any[]): Promise<any> {
    if (isPostgres && pgPool) {
      // Intercept SQLite sqlite_master check
      const existsTableMatch = this.sql.match(/SELECT\s+name\s+FROM\s+sqlite_master\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=\s*'(\w+)'/i);
      if (existsTableMatch) {
         const tableName = existsTableMatch[1].toLowerCase();
         const res = await pgPool.query(
           `SELECT table_name AS name FROM information_schema.tables WHERE table_name = $1`,
           [tableName]
         );
         return res.rows[0];
      }

      const pgSql = convertSqlPlaceholders(this.sql);
      const res = await pgPool.query(pgSql, params);
      return res.rows[0];
    } else {
      const stmt = sqliteDb!.prepare(this.sql);
      return stmt.get(...params);
    }
  }

  async run(...params: any[]): Promise<{ changes: number; lastInsertRowid?: number | string }> {
    if (isPostgres && pgPool) {
      // Postgres auto-translates UPDATE / INSERT / DELETE
      const pgSql = convertSqlPlaceholders(this.sql);
      const res = await pgPool.query(pgSql, params);
      return {
        changes: res.rowCount ?? 0,
        lastInsertRowid: undefined
      };
    } else {
      const stmt = sqliteDb!.prepare(this.sql);
      const res = stmt.run(...params);
      return {
        changes: res.changes,
        lastInsertRowid: res.lastInsertRowid
      };
    }
  }
}

export const db = {
  isPostgres,
  getPgPool() { return pgPool; },
  getSqliteDb() { return sqliteDb; },

  async exec(sql: string): Promise<void> {
    if (isPostgres && pgPool) {
      let pgSql = sql
        .replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, "SERIAL PRIMARY KEY")
        .replace(/INTEGER\s+PRIMARY\s+KEY/gi, "SERIAL PRIMARY KEY")
        .replace(/PRIMARY\s+KEY\s+AUTOINCREMENT/gi, "SERIAL PRIMARY KEY");
      
      const statements = pgSql.split(";").map(s => s.trim()).filter(s => s.length > 0);
      for (const statement of statements) {
        try {
          await pgPool.query(statement);
        } catch (err: any) {
          // If column already exists during ALTER TABLE migrations, ignore it
          if (statement.toUpperCase().includes("ADD COLUMN") && err.message.includes("already exists")) {
            continue;
          }
          console.error(`[db] Error executing query in Postgres: ${statement}`, err);
          throw err;
        }
      }
    } else {
      sqliteDb!.exec(sql);
    }
  },

  prepare(sql: string): StatementWrapper {
    return new StatementWrapper(sql);
  },

  async ensureDatabaseInitialized(): Promise<void> {
    if (initializationPromise) {
      return initializationPromise;
    }
    initializationPromise = (async () => {
      // 1. Create tables
      await this.exec(`
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
          bio TEXT,
          aboutPhoto TEXT
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
          builderConfig TEXT DEFAULT '{}',
          experienceId INTEGER,
          isProjectManager INTEGER DEFAULT 0,
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
          details TEXT,
          location TEXT,
          gpa TEXT,
          startYear TEXT,
          endYear TEXT,
          courses TEXT DEFAULT '[]',
          sortOrder INTEGER DEFAULT 0
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
          authority TEXT,
          date TEXT,
          type TEXT DEFAULT 'Certificate'
        );

        CREATE TABLE IF NOT EXISTS admin_credentials (
          id INTEGER PRIMARY KEY,
          username TEXT NOT NULL,
          passwordHash TEXT NOT NULL,
          updatedAt TEXT
        );
      `);

      // Seed initial data if empty
      try {
        const profileCountResult = await this.prepare("SELECT COUNT(*) as count FROM profile").get() as { count: number | string };
        const count = Number(profileCountResult?.count || 0);
        if (count === 0) {
          // If we are on Postgres, we start seeding
          await this.prepare(`
            INSERT INTO profile (id, name, title, status, carouselIntervalMs, email, phone, linkedin, address, summary, bio, aboutPhoto)
            VALUES (1, 'Bipul Kumar Paul', 'GIS Analyst & Meteorologist', ?, ?, 'bipulpaul2084@gmail.com', '', ?, 'House: 492/20, Bashundhara Link Road, Dhaka-1212, Bangladesh', 
            'Over five years of experience in GIS and Remote Sensing, with a proven track record in land management and energy sector projects.',
            'Currently serving as Assistant Consultant and Coordinator of GIS and Remote Sensing Department at EQMS Consulting Limited. Successfully led 6 projects as Project Manager and involved in more than 40 projects as a GIS Expert.', '')
          `).run(DEFAULT_STATUS_TEXT, DEFAULT_CAROUSEL_INTERVAL_MS, DEFAULT_LINKEDIN_URL);

          const experiences = [
            ['EQMS Consulting Limited', 'Assistant Consultant', 'GIS and Remote Sensing Department', 'August 2021 to Present', 'Bangladesh', 'GIS database management, UAV/Drone image processing, Web GIS, and Project Management.', '2021-08'],
            ['Center for Environmental and Geographic Information Services (CEGIS)', 'Research Consultant', '', 'February 2021 to July 2021', 'Bangladesh', 'GIS database management, Land Use Land Cover classification, Mouza map digitization.', '2021-02'],
            ['Geo Planning for Advanced Development', 'Assistant GIS Specialist', '', 'August 2020 to January 2021', 'Bangladesh', 'GIS database preparation of electrical distribution network, Digitization from UAV imagery.', '2020-08'],
            ['Inspira Advisory and Consulting Limited', 'Research Assistant', '', 'August 2019 to November 2019', 'Bangladesh', 'Private Sector Assessment, Value Chain Analysis, Market Analysis.', '2019-08']
          ];
          const insertExp = this.prepare("INSERT INTO experience (company, position, department, period, location, description, startDate) VALUES (?, ?, ?, ?, ?, ?, ?)");
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
          const insertProj = this.prepare("INSERT INTO projects (title, client, date, location, features, activities, category, sortDate, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
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
          const insertSkill = this.prepare("INSERT INTO skills (name, category, level) VALUES (?, ?, ?)");
          for (const skill of skills) {
            await insertSkill.run(...skill);
          }

          const education = [
            ['Bachelor of Urban and Regional Planning (BURP)', 'Khulna University of Engineering & Technology (KUET)', '2019', 'Department of Urban and Regional Planning', 'Khulna, Bangladesh', '', '2014', '2019', '[]', 1],
            ['Higher Secondary School Certificate (HSC)', 'Saint Joseph Higher Secondary School, Dhaka', '2014', 'Science', 'Dhaka, Bangladesh', '', '2012', '2014', '[]', 2],
            ['Secondary School Certificate (SSC)', 'Rajapur High School, Natore', '2012', 'Science', 'Natore, Bangladesh', '', '2010', '2012', '[]', 3]
          ];
          const insertEdu = this.prepare("INSERT INTO education (degree, institution, year, details, location, gpa, startYear, endYear, courses, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
          for (const edu of education) {
            await insertEdu.run(...edu);
          }

          const highlights = [
            ["GIS Expert", "Spatial Analysis & Mapping", "Map", "text-emerald-600", 1],
            ["Meteorology", "Weather & Climate Studies", "Cloud", "text-blue-600", 2],
            ["Data Science", "Python & SQL Automation", "Database", "text-purple-600", 3],
            ["Remote Sensing", "UAV & Satellite Imaging", "Layers", "text-orange-600", 4],
          ];
          const insertHighlight = this.prepare(
            "INSERT INTO highlights (title, subtitle, icon, iconColor, sortOrder) VALUES (?, ?, ?, ?, ?)"
          );
          for (const row of highlights) {
            await insertHighlight.run(...row);
          }
        }
      } catch (e) {
        console.warn("[db] Seed check and seed process logs:", e);
      }

      try {
        const existingAdmin = await this.prepare("SELECT id FROM admin_credentials WHERE id = 1").get();
        if (!existingAdmin) {
          await this.prepare(`
            INSERT INTO admin_credentials (id, username, passwordHash, updatedAt)
            VALUES (1, ?, ?, ?)
          `).run(SUPERUSER_USERNAME, hashPassword(SUPERUSER_PASSWORD), new Date().toISOString());
          console.log("[db] Created admin credentials from environment variables.");
        } else {
          await this.prepare(`
            UPDATE admin_credentials
            SET username = ?, passwordHash = ?, updatedAt = ?
            WHERE id = 1
          `).run(SUPERUSER_USERNAME, hashPassword(SUPERUSER_PASSWORD), new Date().toISOString());
          console.log("[db] Synced admin credentials row with environment variables.");
        }
      } catch (e) {
        console.warn("[db] Seed/Sync admin credentials step skipped or exists:", e);
      }
    })();
    return initializationPromise;
  }
};
