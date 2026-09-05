/**
 * Local Problem Store
 * -------------------
 * Filesystem-backed fallback for problems, used when Supabase is not configured.
 *
 * Reads `src/data/problems/*.json` once and caches in memory. Rows are shaped to
 * match what Supabase returns so ProblemService can treat both sources identically.
 *
 * This exists so the app is fully usable (browse, run, validate) with zero external
 * services. Supabase remains the source of truth for auth, progress and playground
 * files; when it is configured it takes over problem serving too.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { compareProblems } from "../../../problem-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROBLEMS_DIR = path.resolve(__dirname, "../data/problems");

/** @type {Map<string, object>|null} */
let cache = null;

/**
 * Normalizes one authored problem into the row shape used everywhere downstream.
 * @param {object} p
 * @param {string} fileLanguage
 */
function toRow(p, fileLanguage) {
  const starterCode =
    typeof p.starterCode === "string"
      ? p.starterCode
      : typeof p.starter_code === "string"
        ? p.starter_code
        : null;

  return {
    id: p.id,
    title: p.title,
    instructions: String(p.instructions ?? p.description ?? ""),
    solution: typeof p.solution === "string" ? p.solution : null,
    difficulty: String(p.difficulty ?? "easy").toLowerCase(),
    language: String(p.language ?? fileLanguage).toLowerCase(),
    tests: Array.isArray(p.tests) ? p.tests : [],
    starter_code: starterCode,
    starterCode,
  };
}

/** Loads and caches every problem from disk. @returns {Map<string, object>} */
export function loadLocalProblems() {
  if (cache) return cache;

  const byId = new Map();
  if (!fs.existsSync(PROBLEMS_DIR)) {
    cache = byId;
    return cache;
  }

  for (const entry of fs.readdirSync(PROBLEMS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const fullPath = path.join(PROBLEMS_DIR, entry.name);
    try {
      const raw = fs.readFileSync(fullPath, "utf-8").trim();
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed?.problems;
      if (!Array.isArray(list)) continue;

      const fileLanguage = path.basename(entry.name, ".json").toLowerCase();
      for (const p of list) {
        if (!p?.id || !p?.title) continue;
        byId.set(p.id, toRow(p, fileLanguage));
      }
    } catch (err) {
      console.error("[LocalProblems] Failed to parse", fullPath, err?.message ?? err);
    }
  }

  cache = byId;
  console.log(`[LocalProblems] Loaded ${byId.size} problems from disk (no-Supabase fallback).`);
  return cache;
}

/** @param {string} problemId */
export function getLocalProblem(problemId) {
  return loadLocalProblems().get(problemId) ?? null;
}

/** All problems, ordered the same way the client orders them. */
export function listLocalProblems() {
  return [...loadLocalProblems().values()].sort(compareProblems);
}
