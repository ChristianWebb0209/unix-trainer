/**
 * Sync Help Files
 * ---------------
 * Synchronizes help docs from .md files to the database.
 *
 * Reads .md from src/data/help-files/*.md (top-level only).
 * Table: public.help_files (id, name, content).
 *
 * Usage:
 *   npm run db:sync-help-files              Upsert help files (insert or update by id).
 *   npm run db:sync-help-files -- --hard   Wipe the help_files table, then insert from .md files.
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
  return path.basename(filePath, ".md").replace(/-/g, " ");
}

function loadHelpFilesFromMd() {
  const dataDir = path.resolve(__dirname, "../src/data/help-files");
  if (!fs.existsSync(dataDir)) {
    console.error(`[Sync] Help files directory not found: ${dataDir}`);
    return [];
  }

  const files = collectMdFiles(dataDir);
  console.log(`[Sync] Found ${files.length} help files`);

  const items = [];
  for (const filePath of files) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const id = idFromFilename(filePath);
      const name = nameFromFilename(filePath);
      if (!id) {
        console.warn(`[Sync] Skipping invalid filename: ${filePath}`);
        continue;
      }
      items.push({ id, name, content: raw });
    } catch (e) {
      console.error(`[Sync] Failed to load ${filePath}:`, e.message);
    }
  }

  return items;
}

async function ensureTableExists() {
  await query(`
    CREATE TABLE IF NOT EXISTS public.help_files (
      id VARCHAR(100) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      content TEXT NOT NULL DEFAULT ''
    )
  `);
  console.log("[Sync] help_files table ensured");
}

/**
 * Sync help files from .md files to DB. Upsert by default; --hard wipes first.
 * @param {{ hard?: boolean }} opts
 * @returns {{ synced: number; errors: number } }
 */
export async function syncHelpFilesToDb(opts = {}) {
  const hardMode = opts.hard ?? process.argv.includes("--hard");

  const items = loadHelpFilesFromMd();

  await ensureTableExists();

  if (hardMode) {
    await query("DELETE FROM public.help_files");
  }

  if (items.length === 0) {
    return { synced: 0, errors: 0 };
  }

  let synced = 0;
  let errors = 0;

  for (const item of items) {
    try {
      await query(
        `INSERT INTO public.help_files (id, name, content)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           content = EXCLUDED.content`,
        [item.id, item.name, item.content]
      );
      synced++;
    } catch (err) {
      errors++;
      console.error("[Sync] Failed to upsert help file", item.id, err.message);
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

  console.log("[Sync] Loading help files from .md files...");
  const items = loadHelpFilesFromMd();
  console.log(`[Sync] Loaded ${items.length} help files`);

  const hardMode = process.argv.includes("--hard");
  if (hardMode) console.log("[Sync] --hard: will wipe public.help_files first.");

  const { synced, errors } = await syncHelpFilesToDb({ hard: hardMode });
  console.log(`[Sync] Completed: ${synced} synced, ${errors} errors`);
  await pool.end();
  process.exit(errors > 0 ? 1 : 0);
}

const isRunDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isRunDirectly) {
  runScript();
}
