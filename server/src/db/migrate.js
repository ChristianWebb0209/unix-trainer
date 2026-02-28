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
  
  // 2. Create problems table
  `CREATE TABLE IF NOT EXISTS problems (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    type VARCHAR(50) NOT NULL,
    visibility VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'hidden')),
    time_limit_ms INTEGER NOT NULL DEFAULT 5000,
    memory_limit_bytes INTEGER NOT NULL DEFAULT 268435456,
    test_case_count INTEGER NOT NULL DEFAULT 0,
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
    attempts_count INTEGER NOT NULL DEFAULT 1,
    completed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, problem_id)
  )`,
  
  // 4. Create submissions table (optional, for future)
  `CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id VARCHAR(50) NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    submitted_code TEXT NOT NULL,
    language VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL,
    execution_time_ms INTEGER,
    submitted_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  
  // Indexes for problems
  `CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON problems(difficulty)`,
  `CREATE INDEX IF NOT EXISTS idx_problems_type ON problems(type)`,
  `CREATE INDEX IF NOT EXISTS idx_problems_visibility ON problems(visibility)`,
  
  // Indexes for problem_completions
  `CREATE INDEX IF NOT EXISTS idx_completions_user_id ON problem_completions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_completions_problem_id ON problem_completions(problem_id)`,
  `CREATE INDEX IF NOT EXISTS idx_completions_completed_at ON problem_completions(completed_at DESC)`,
  
  // Indexes for submissions
  `CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_submissions_problem_id ON submissions(problem_id)`,
  `CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status)`,
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
