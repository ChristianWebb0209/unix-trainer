/**
 * Sync Problems
 * -------------

 * Synchronizes problems from JSON files to the database (supports local and Supabase).
 * 

 * Usage: 
 *   npm run db:sync-problems
 *   npm run db:sync-problems -- --watch  (watch mode)
 */

import { query, testConnection, pool } from '../config/database.config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Collect all JSON files recursively (synchronous for simplicity)
function collectJsonFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  
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

// Infer difficulty from file path
function inferDifficulty(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.includes(`${path.sep}easy${path.sep}`)) return 'easy';
  if (lower.includes(`${path.sep}medium${path.sep}`)) return 'medium';
  if (lower.includes(`${path.sep}hard${path.sep}`)) return 'hard';
  return 'easy';
}

// Infer problem type from file name
function inferType(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base.includes('awk')) return 'awk';
  if (base.includes('bash')) return 'bash';
  if (base.includes('unix')) return 'unix';
  return 'unix';
}










// Load problems from JSON files
function loadProblemsFromJson() {
  const dataDir = path.resolve(__dirname, '../../data/problems');
  if (!fs.existsSync(dataDir)) {
    console.error(`[Sync] Data directory not found: ${dataDir}`);

    return [];
  }


  const files = collectJsonFiles(dataDir);
  console.log(`[Sync] Found ${files.length} problem files`);

  const problems = [];

  for (const filePath of files) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed.problems)) {
        const inferredDifficulty = inferDifficulty(filePath);
        const inferredType = inferType(filePath);

        for (const prob of parsed.problems) {

          problems.push({
            id: prob.id,
            title: prob.title || prob.id,
            description: prob.description || '',
            difficulty: prob.difficulty || inferredDifficulty,
            type: prob.type || inferredType,
            visibility: prob.visibility || 'public',
            time_limit_ms: prob.constraint?.timeLimitMs || 5000,
            memory_limit_bytes: prob.constraint?.memoryLimitBytes || 256 * 1024 * 1024,
            test_case_count: Array.isArray(prob.tests) ? prob.tests.length : 0,




























            problem_data: JSON.stringify(prob), // Store full problem data as JSON
          });
        }
      }
    } catch (e) {
      console.error(`[Sync] Failed to load ${filePath}:`, e.message);
    }
  }

  return problems;
}

// Ensure Problems table exists
async function ensureTableExists() {
  await query(`
    CREATE TABLE IF NOT EXISTS Problems (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
      type TEXT CHECK (type IN ('unix', 'bash', 'awk')),
      visibility TEXT CHECK (visibility IN ('public', 'private', 'hidden')),
      time_limit_ms INTEGER DEFAULT 5000,
      memory_limit_bytes INTEGER DEFAULT 268435456,
      test_case_count INTEGER DEFAULT 0,
      problem_data JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  
  // Create index for faster lookups
  await query(`
    CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON Problems(difficulty)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_problems_type ON Problems(type)
  `);
  
  console.log('[Sync] Problems table ensured');
}

// Sync problems to database
async function syncProblems() {
  const connected = await testConnection();
  if (!connected) {
    console.error('[Sync] Cannot proceed without database connection');
    process.exit(1);
  }

  console.log('[Sync] Loading problems from JSON files...');
  const problems = loadProblemsFromJson();
  
  console.log(`[Sync] Loaded ${problems.length} problems from JSON files`);

  if (problems.length === 0) {
    console.log('[Sync] No problems to sync');
    await pool.end();
    process.exit(0);
  }

  // Ensure table exists
  await ensureTableExists();

  const hardMode = process.argv.includes('--hard');

  if (hardMode) {
    const validIds = problems.map((p) => p.id);
    if (validIds.length > 0) {
      console.log('[Sync] --hard enabled. Deleting problems not present in JSON files...');
      try {
        await query(
          `DELETE FROM Problems WHERE id <> ALL($1::text[])`,
          [validIds]
        );
        console.log('[Sync] Hard cleanup complete.');
      } catch (err) {
        console.error('[Sync] Failed during hard cleanup:', err.message);
      }
    }
  }

  let synced = 0;
  let errors = 0;

  for (const prob of problems) {
    try {
      await query(
        `INSERT INTO Problems(id, title, description, difficulty, type, visibility, time_limit_ms, memory_limit_bytes, test_case_count, problem_data, created_at, updated_at)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
         ON CONFLICT(id) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           difficulty = EXCLUDED.difficulty,
           type = EXCLUDED.type,
           visibility = EXCLUDED.visibility,
           time_limit_ms = EXCLUDED.time_limit_ms,
           memory_limit_bytes = EXCLUDED.memory_limit_bytes,
           test_case_count = EXCLUDED.test_case_count,
           problem_data = EXCLUDED.problem_data,
           updated_at = NOW()`,
        [
          prob.id,
          prob.title,
          prob.description,
          prob.difficulty,
          prob.type,
          prob.visibility,
          prob.time_limit_ms,
          prob.memory_limit_bytes,
          prob.test_case_count,
          prob.problem_data,
        ]
      );
      synced++;
    } catch (err) {
      errors++;
      console.error('[Sync] Failed to upsert problem', prob.id, err.message);
    }
  }

  console.log(`[Sync] Completed: ${synced} problems synced, ${errors} errors`);
  await pool.end();
  process.exit(errors > 0 ? 1 : 0);
}

syncProblems();