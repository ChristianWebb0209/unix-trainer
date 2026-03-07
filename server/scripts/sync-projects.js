/**
 * Sync Projects
 * -------------
 * Synchronizes projects from .md files to the database.
 *
 * Reads .md from src/data/projects/*.md (top-level only).
 * Table: public.projects (id, name, content).
 *
 * Usage:
 *   npm run db:sync-projects              Upsert projects (insert or update by id).
 *   npm run db:sync-projects -- --hard   Wipe the projects table, then insert from .md files.
 */

import { query, testConnection, pool } from "../src/config/database.config.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function collectMdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
    files.push(path.join(dir, entry.name));
  }
  return files;
}

function idFromFilename(filePath) {
  const base = path.basename(filePath, ".md");
  return base.replace(/[^a-z0-9-_]/gi, "") || base;
}

function nameFromFilename(filePath) {
  return path.basename(filePath, ".md");
}

function loadProjectsFromMd() {
  const dataDir = path.resolve(__dirname, "../src/data/projects");
  if (!fs.existsSync(dataDir)) {
    console.error(`[Sync] Projects directory not found: ${dataDir}`);
    return [];
  }

  const files = collectMdFiles(dataDir);
  console.log(`[Sync] Found ${files.length} project files`);

  const projects = [];

  for (const filePath of files) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const id = idFromFilename(filePath);
      const name = nameFromFilename(filePath);
      if (!id) {
        console.warn(`[Sync] Skipping invalid filename: ${filePath}`);
        continue;
      }
      projects.push({ id, name, content: raw });
    } catch (e) {
      console.error(`[Sync] Failed to load ${filePath}:`, e.message);
    }
  }

  return projects;
}

async function ensureTableExists() {
  await query(`
    CREATE TABLE IF NOT EXISTS public.projects (
      id VARCHAR(100) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      content TEXT NOT NULL DEFAULT ''
    )
  `);
  console.log("[Sync] projects table ensured");
}

/**
 * Sync projects from .md files to DB. Upsert by default; --hard wipes first.
 * @param {{ hard?: boolean }} opts
 * @returns {{ synced: number; errors: number } }
 */
export async function syncProjectsToDb(opts = {}) {
  const hardMode = opts.hard ?? process.argv.includes("--hard");

  const projects = loadProjectsFromMd();

  await ensureTableExists();

  if (hardMode) {
    await query("DELETE FROM public.projects");
  }

  if (projects.length === 0) {
    return { synced: 0, errors: 0 };
  }

  let synced = 0;
  let errors = 0;

  for (const proj of projects) {
    try {
      await query(
        `INSERT INTO public.projects (id, name, content)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           content = EXCLUDED.content`,
        [proj.id, proj.name, proj.content]
      );
      synced++;
    } catch (err) {
      errors++;
      console.error("[Sync] Failed to upsert project", proj.id, err.message);
    }
  }

  return { synced, errors };
}

async function runScript() {
  const connected = await testConnection();
  if (!connected) {
    console.error("[Sync] Cannot proceed without database connection");
    process.exit(1);
  }

  console.log("[Sync] Loading projects from .md files...");
  const projects = loadProjectsFromMd();
  console.log(`[Sync] Loaded ${projects.length} projects from .md files`);

  const hardMode = process.argv.includes("--hard");
  if (hardMode) console.log("[Sync] --hard: will wipe public.projects first.");

  const { synced, errors } = await syncProjectsToDb({ hard: hardMode });
  console.log(`[Sync] Completed: ${synced} synced, ${errors} errors`);
  await pool.end();
  process.exit(errors > 0 ? 1 : 0);
}

runScript();
