/**
 * Database Migrations
 * ------------------
 * Creates all required tables: users, problems, problem_completions, submissions
 * 
 * Usage: npm run db:migrate
 */

import { pool, query, testConnection } from '../config/database.config.js';

const migrations = [
  // 1. Create users table
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  
  // 2. Create problems table (slimmed schema, populated from JSON files)
  `CREATE TABLE IF NOT EXISTS problems (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    instructions TEXT NOT NULL,
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('learn', 'easy', 'medium', 'hard')),
    language VARCHAR(50) NOT NULL,
    tests JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  
  // 3. Create problem_completions table
  `CREATE TABLE IF NOT EXISTS problem_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id VARCHAR(50) NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    solution_code TEXT NOT NULL,
    language VARCHAR(20) NOT NULL,
    completed_at TIMESTAMP,
    UNIQUE(user_id, problem_id)
  )`,
  
  // Indexes for problems
  `CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON problems(difficulty)`,
  `CREATE INDEX IF NOT EXISTS idx_problems_language ON problems(language)`,
  
  // Indexes for problem_completions
  `CREATE INDEX IF NOT EXISTS idx_completions_user_id ON problem_completions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_completions_problem_id ON problem_completions(problem_id)`,
  `CREATE INDEX IF NOT EXISTS idx_completions_completed_at ON problem_completions(completed_at DESC)`,
];

async function runMigrations() {
  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    console.error('[Migrate] Cannot proceed without database connection');
    process.exit(1);
  }
  
  console.log('[Migrate] Starting migrations...');
  
  for (let i = 0; i < migrations.length; i++) {
    try {
      await query(migrations[i]);
      console.log(`[Migrate] ${i + 1}/${migrations.length} applied`);
    } catch (error) {
      console.error(`[Migrate] Error applying migration ${i + 1}:`, error.message);
      process.exit(1);
    }
  }
  
  console.log('[Migrate] All migrations completed successfully');
  await pool.end();
  process.exit(0);
}

runMigrations();
