/**
 * Local Markdown Store
 * --------------------
 * Filesystem fallback for the two markdown-backed tables (projects, help_files),
 * used when Postgres is not configured or unreachable.
 *
 * Same contract as the DB path: id comes from the filename, name is the filename,
 * content is the raw markdown. Together with local-problems.js this lets the whole
 * app run with no external services at all.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {Map<string, Map<string, {id: string, name: string, content: string}>>} */
const caches = new Map();

/**
 * @param {string} dirName Directory under src/data (e.g. "projects", "help-files").
 * @returns {Map<string, {id: string, name: string, content: string}>}
 */
function load(dirName) {
  const cached = caches.get(dirName);
  if (cached) return cached;

  const dir = path.resolve(__dirname, "../data", dirName);
  const byId = new Map();

  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
      const base = path.basename(entry.name, path.extname(entry.name));
      // Mirrors the id sanitising the sync scripts apply before inserting.
      const id = base.replace(/[^a-z0-9-_]/gi, "");
      if (!id) continue;
      try {
        byId.set(id, {
          id,
          name: base,
          content: fs.readFileSync(path.join(dir, entry.name), "utf-8"),
        });
      } catch (err) {
        console.error("[LocalMarkdown] Failed to read", entry.name, err?.message ?? err);
      }
    }
  }

  caches.set(dirName, byId);
  return byId;
}

/** @param {string} dirName */
export function listLocalMarkdown(dirName) {
  return [...load(dirName).values()]
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** @param {string} dirName @param {string} id */
export function getLocalMarkdown(dirName, id) {
  if (!id || typeof id !== "string") return null;
  const safeId = id.replace(/[^a-z0-9-_]/gi, "");
  if (!safeId) return null;
  return load(dirName).get(safeId) ?? null;
}
