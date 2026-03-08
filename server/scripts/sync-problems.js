/**
 * Sync Problems
 * -------------
 * Synchronizes problems from JSON files to the database (Supabase schema).
 *
 * Reads JSON from src/data/problems/*.json (top-level only).
 * Table: public.problems (id, title, instructions, solution, difficulty, language, tests, starter_code).
 *
 * Usage:
 *   npm run db:sync-problems              Upsert problems (insert or update by id).
 *   npm run db:sync-problems -- --hard    Wipe the problems table, then insert exactly what is in the JSON files.
 */

import { query, testConnection, pool } from "../src/config/database.config.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function collectProblemJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    files.push(path.join(dir, entry.name));
  }
  return files;
}

function inferLanguageFromFileName(filePath) {
  const base = path.basename(filePath, ".json").toLowerCase();
  const known = ["awk", "bash", "unix", "c", "cpp", "rust", "cuda", "vulkan", "sycl"];
  return known.includes(base) ? base : "unix";
}

function loadProblemsFromJson() {
  const dataDir = path.resolve(__dirname, "../src/data/problems");
  if (!fs.existsSync(dataDir)) {
    console.error(`[Sync] Data directory not found: ${dataDir}`);
    return [];
  }

  const files = collectProblemJsonFiles(dataDir);
  console.log(`[Sync] Found ${files.length} problem files`);

  const problems = [];

  for (const filePath of files) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8").trim();
      if (!raw) {
        console.warn(`[Sync] Skipping empty file: ${filePath}`);
        continue;
      }
      const parsed = JSON.parse(raw);
      const fileLanguage = inferLanguageFromFileName(filePath);

      if (Array.isArray(parsed.problems)) {
        for (const prob of parsed.problems) {
          problems.push({
            id: prob.id,
            title: prob.title || prob.id,
            instructions: prob.instructions ?? prob.description ?? "",
            solution: prob.solution ?? null,
            difficulty: prob.difficulty || "easy",
            language: prob.language ?? fileLanguage,
            tests: Array.isArray(prob.tests) ? prob.tests : [],
            starter_code: prob.starterCode ?? prob.starter_code ?? null,
          });
        }
      }
    } catch (e) {
      console.error(`[Sync] Failed to load ${filePath}:`, e.message);
    }
  }

  return problems;
}

/** Ensure public.problems exists with Supabase schema (language, not type). */
async function ensureTableExists() {
  await query(`
    CREATE TABLE IF NOT EXISTS public.problems (
      id VARCHAR(50) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      instructions TEXT NOT NULL,
      solution TEXT DEFAULT NULL,
      difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('learn', 'easy', 'medium', 'hard')),
      language VARCHAR(50) NOT NULL,
      tests JSONB NOT NULL DEFAULT '[]'::jsonb,
      starter_code TEXT
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON public.problems(difficulty)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_problems_language ON public.problems(language)
  `);

  console.log("[Sync] problems table ensured");
}

async function syncProblems() {
  const connected = await testConnection();
  if (!connected) {
    console.error("[Sync] Cannot proceed without database connection");
    process.exit(1);
  }

  console.log("[Sync] Loading problems from JSON files...");
  const problems = loadProblemsFromJson();
  console.log(`[Sync] Loaded ${problems.length} problems from JSON files`);

  const hardMode = process.argv.includes("--hard");

  if (hardMode) {
    console.log("[Sync] --hard: wiping public.problems table...");
    try {
      const res = await query("DELETE FROM public.problems");
      const deleted = res.rowCount ?? 0;
      console.log(`[Sync] Deleted ${deleted} row(s). Will insert ${problems.length} from JSON.`);
    } catch (err) {
      console.error("[Sync] Failed to delete existing problems:", err.message);
      await pool.end();
      process.exit(1);
    }
  }

  await ensureTableExists();

  if (problems.length === 0) {
    console.log("[Sync] No problems to sync");
    await pool.end();
    process.exit(0);
  }

  let synced = 0;
  let errors = 0;

  const testsJson = (v) => (v == null ? "[]" : JSON.stringify(Array.isArray(v) ? v : []));

  for (const prob of problems) {
    try {
      await query(
        `INSERT INTO public.problems (id, title, instructions, solution, difficulty, language, tests, starter_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           instructions = EXCLUDED.instructions,
           solution = EXCLUDED.solution,
           difficulty = EXCLUDED.difficulty,
           language = EXCLUDED.language,
           tests = EXCLUDED.tests,
           starter_code = EXCLUDED.starter_code`,
        [
          prob.id,
          prob.title,
          prob.instructions,
          prob.solution,
          prob.difficulty,
          prob.language,
          testsJson(prob.tests),
          prob.starter_code,
        ]
      );
      synced++;
    } catch (err) {
      errors++;
      console.error("[Sync] Failed to upsert problem", prob.id, err.message);
    }
  }

  console.log(`[Sync] Completed: ${synced} synced, ${errors} errors`);
  await pool.end();
  process.exit(errors > 0 ? 1 : 0);
}

syncProblems();
