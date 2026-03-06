import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { supabaseAdmin } from "../config/supabase.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Collect JSON files directly under dir (no recursion).
 * Expected: one file per language, e.g. awk.json, bash.json, unix.json, cuda.json, vulkan.json, sycl.json.
 */
function collectProblemJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const fullPath = path.join(dir, entry.name);
    files.push(fullPath);
  }
  return files;
}

/**
 * Infer language from filename: awk.json -> awk, bash.json -> bash, etc.
 */
function inferLanguageFromFileName(filePath) {
  const base = path.basename(filePath, ".json").toLowerCase();
  const known = ["awk", "bash", "unix", "c", "cpp", "rust", "cuda", "vulkan", "sycl"];
  return known.includes(base) ? base : "any";
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function seedProblemsToSupabase() {
  if (!supabaseAdmin) {
    console.warn("[ProblemSeeder] supabaseAdmin is not configured; skipping seed.");
    return { synced: 0 };
  }

  const dataDir = path.resolve(__dirname, "../data/problems");
  if (!fs.existsSync(dataDir)) {
    console.warn(`[ProblemSeeder] Problems data directory not found: ${dataDir}`);
    return { synced: 0 };
  }

  const files = collectProblemJsonFiles(dataDir);
  const rows = [];

  for (const filePath of files) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8").trim();
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.problems)) continue;

      const fileLanguage = inferLanguageFromFileName(filePath);

      for (const p of parsed.problems) {
        if (!p?.id || !p?.title) continue;
        const instructions = String(p.instructions ?? p.description ?? "");
        const solution =
          typeof p.solution === "string" ? p.solution : null;
        const difficulty = String(p.difficulty ?? "easy").toLowerCase();
        const language = String(p.language ?? fileLanguage).toLowerCase();
        const tests = Array.isArray(p.tests) ? p.tests : [];
        const starterCode =
          typeof p.starterCode === "string"
            ? p.starterCode
            : typeof p.starter_code === "string"
              ? p.starter_code
              : null;

        const row = {
          id: p.id,
          title: p.title,
          instructions,
          solution,
          difficulty,
          language,
          tests,
          starter_code: starterCode,
        };
        if (p.validation != null && typeof p.validation === "object") {
          row.validation = p.validation;
        }
        rows.push(row);
      }
    } catch (err) {
      console.error("[ProblemSeeder] Failed to parse", filePath, err?.message ?? err);
    }
  }

  if (rows.length === 0) {
    console.warn("[ProblemSeeder] No problems found in local JSON files.");
    return { synced: 0 };
  }

  // Upsert: insert new problems and update existing ones (same id → overwrite with JSON data)
  let synced = 0;
  for (const batch of chunk(rows, 100)) {
    const { error } = await supabaseAdmin
      .from("problems")
      .upsert(batch, { onConflict: "id", ignoreDuplicates: false });
    if (error) {
      console.error("[ProblemSeeder] Upsert batch failed:", error.message);
      continue;
    }
    synced += batch.length;
  }

  console.log(`[ProblemSeeder] Synced ${synced} problems from JSON (insert + update by id).`);
  return { synced };
}

