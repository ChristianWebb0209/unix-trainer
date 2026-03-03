import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { supabaseAdmin } from "../config/supabase.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function collectJsonFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
}

function inferDifficulty(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.includes(`${path.sep}learn${path.sep}`)) return "learn";
  if (lower.includes(`${path.sep}easy${path.sep}`)) return "easy";
  if (lower.includes(`${path.sep}medium${path.sep}`)) return "medium";
  if (lower.includes(`${path.sep}hard${path.sep}`)) return "hard";
  return "easy";
}

function inferLanguage(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base.includes("awk")) return "awk";
  if (base.includes("bash")) return "bash";
  if (base.includes("unix")) return "unix";
  if (base.includes("cuda")) return "cuda";
  return "any";
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function seedProblemsToSupabase() {
  if (!supabaseAdmin) {
    console.warn("[ProblemSeeder] supabaseAdmin is not configured; skipping seed.");
    return { inserted: 0, skipped: 0 };
  }

  const dataDir = path.resolve(__dirname, "../data/problems");
  if (!fs.existsSync(dataDir)) {
    console.warn(`[ProblemSeeder] Problems data directory not found: ${dataDir}`);
    return { inserted: 0, skipped: 0 };
  }

  const files = collectJsonFiles(dataDir);
  const rows = [];

  for (const filePath of files) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.problems)) continue;

      const inferredDifficulty = inferDifficulty(filePath);
      const inferredLanguage = inferLanguage(filePath);

      for (const p of parsed.problems) {
        if (!p?.id || !p?.title) continue;
        const instructions = String(p.instructions ?? p.description ?? "");
        const difficulty = String(p.difficulty ?? inferredDifficulty).toLowerCase();
        const language = String(p.language ?? inferredLanguage).toLowerCase();
        const tests = Array.isArray(p.tests) ? p.tests : [];
        const starterCode =
          typeof p.starterCode === "string"
            ? p.starterCode
            : typeof p.starter_code === "string"
              ? p.starter_code
              : null;

        rows.push({
          id: p.id,
          title: p.title,
          instructions,
          difficulty,
          language,
          tests,
          starter_code: starterCode,
        });
      }
    } catch (err) {
      console.error("[ProblemSeeder] Failed to parse", filePath, err?.message ?? err);
    }
  }

  if (rows.length === 0) {
    console.warn("[ProblemSeeder] No problems found in local JSON files.");
    return { inserted: 0, skipped: 0 };
  }

  // Fetch existing IDs once, then insert only missing (matches "add if not already there")
  const { data: existingData, error: existingErr } = await supabaseAdmin
    .from("problems")
    .select("id");

  if (existingErr) {
    console.error("[ProblemSeeder] Failed to fetch existing problem IDs:", existingErr.message);
    return { inserted: 0, skipped: 0 };
  }

  const existingIds = new Set((existingData ?? []).map((r) => r.id));
  const missing = rows.filter((r) => !existingIds.has(r.id));

  if (missing.length === 0) {
    console.log(`[ProblemSeeder] Supabase already has all ${rows.length} problems. Nothing to seed.`);
    return { inserted: 0, skipped: rows.length };
  }

  let inserted = 0;
  for (const batch of chunk(missing, 200)) {
    const { error } = await supabaseAdmin.from("problems").insert(batch);
    if (error) {
      console.error("[ProblemSeeder] Insert batch failed:", error.message);
      continue;
    }
    inserted += batch.length;
  }

  console.log(
    `[ProblemSeeder] Seed complete. Inserted ${inserted}, skipped ${rows.length - inserted} (already existed).`
  );
  return { inserted, skipped: rows.length - inserted };
}

