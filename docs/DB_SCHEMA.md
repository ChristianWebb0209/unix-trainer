# Database Schema Documentation

## Overview

This document describes the PostgreSQL database schema for the coding practice platform. The architecture follows a **hybrid approach**:

- **Problems** are primarily stored as JSON files in the codebase (see `server/src/data/problems/`) for easy editing/versioning
- **Problem metadata** is cached in the `problems` table for efficient querying and JOINs
- **User data, completions, and submissions** are fully dynamic and stored in Postgres

This hybrid design balances flexibility (easy problem addition via JSON) with power (SQL queries for analytics, progress tracking).

---

## Entity Relationship Diagram

```
┌─────────────┐       ┌──────────────────┐       ┌─────────────┐
│   users     │       │ problem_comple- │       │  problems   │
│             │◄──────│ tions           │───────►             │
│ (id, email, │  1:N  │ (user_id,       │  N:1  │ (id, title, │
│  password,  │       │  problem_id,    │       │  difficulty,│
│  created_at)│       │  solution_code, │       │  metadata)  │
└─────────────┘       │  completed_at)  │       └─────────────┘
                      └─────────────────┘
                               │
                               │ (optional future extension)
                               ▼
                      ┌──────────────────┐
                      │    submissions   │
                      │ (detailed history│
                      │  of each attempt)│
                      └──────────────────┘
```

---

## Tables

### 1. users

**Purpose:** Stores user account information.

**Justification:** 
- Email-based authentication is standard for web apps
- `created_at` enables tracking user tenure
- Password should be hashed (bcrypt) - NOT stored in plain text

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique identifier for the user |
| email | VARCHAR(255) | UNIQUE, NOT NULL | User's email address |
| password_hash | VARCHAR(255) | NOT NULL | Bcrypt hashed password |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Account creation timestamp |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | Last profile update |

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

### 2. problems

**Purpose:** Caches problem metadata from JSON files for efficient database queries.

**Justification:**
- **Why store problems in DB if they're in JSON files?** 
  - Enables efficient SQL JOINs with completions table
  - Allows complex queries: "all easy problems not solved by user X"
  - Provides caching layer to avoid repeated JSON parsing
  - Enables analytics (solve counts, difficulty distribution)
- **Why keep JSON files too?**
  - Problems are "static content" - once written, they rarely change
  - JSON files are easier to version control and edit
  - Adding a new problem is as simple as dropping a new JSON file
- **Sync strategy:** The application loads problems from JSON on startup and inserts/updates the `problems` table. Alternatively, run a migration script to populate from JSON.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | VARCHAR(50) | PRIMARY KEY | Problem ID (e.g., "unix_001", matches JSON) |
| title | VARCHAR(255) | NOT NULL | Display title |
| description | TEXT | NOT NULL | Full problem description |
| difficulty | VARCHAR(20) | NOT NULL | "easy", "medium", or "hard" |
| type | VARCHAR(50) | NOT NULL | Problem type: "unix", "bash", "awk", etc. |
| visibility | VARCHAR(20) | NOT NULL, DEFAULT 'public' | "public" or "hidden" |
| time_limit_ms | INTEGER | NOT NULL, DEFAULT 5000 | Execution time limit |
| memory_limit_bytes | INTEGER | NOT NULL DEFAULT (256*1024*1024) | Memory limit |
| test_case_count | INTEGER | NOT NULL DEFAULT 0 | Number of test cases |
| created_at | TIMESTAMP | NOT NULL DEFAULT NOW() | When problem was added |
| updated_at | TIMESTAMP | NOT NULL DEFAULT NOW() | Last modification |

```sql
CREATE TABLE problems (
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
);

-- Indexes for common query patterns
CREATE INDEX idx_problems_difficulty ON problems(difficulty);
CREATE INDEX idx_problems_type ON problems(type);
CREATE INDEX idx_problems_visibility ON problems(visibility);
```

---

### 3. problem_completions

**Purpose:** Tracks which problems each user has completed and their solution.

**Justification:**
- This is the CORE of the dynamic system - tracks user progress
- `solution_code` column stores the user's working solution
- `completed_at` enables leaderboards and progress tracking
- UNIQUE constraint on (user_id, problem_id) ensures one completion per problem per user

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique completion record ID |
| user_id | UUID | FOREIGN KEY → users(id), NOT NULL | Reference to user |
| problem_id | VARCHAR(50) | FOREIGN KEY → problems(id), NOT NULL | Reference to problem |
| solution_code | TEXT | NOT NULL | User's final working solution |
| language | VARCHAR(20) | NOT NULL | Language used: "bash", "awk", etc. |
| attempts_count | INTEGER | NOT NULL DEFAULT 1 | Number of attempts before success |
| completed_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | When problem was solved |

```sql
CREATE TABLE problem_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id VARCHAR(50) NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    solution_code TEXT NOT NULL,
    language VARCHAR(20) NOT NULL,
    attempts_count INTEGER NOT NULL DEFAULT 1,
    completed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    -- One completion per user per problem
    UNIQUE(user_id, problem_id)
);

-- Indexes for query performance
CREATE INDEX idx_completions_user_id ON problem_completions(user_id);
CREATE INDEX idx_completions_problem_id ON problem_completions(problem_id);
CREATE INDEX idx_completions_completed_at ON problem_completions(completed_at DESC);
```

---

### 4. submissions (Optional - Future Extension)

**Purpose:** Stores detailed history of every submission attempt.

**Justification:**
- **Optional for v1** - If you only care about completed solutions, skip this
- **Enable later:** Analytics on failure patterns, "try again" features
- More storage but invaluable for debugging and improving problems

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Unique submission ID |
| user_id | UUID | FOREIGN KEY → users(id), NOT NULL | User who submitted |
| problem_id | VARCHAR(50) | FOREIGN KEY → problems(id), NOT NULL | Problem attempted |
| submitted_code | TEXT | NOT NULL | Code that was submitted |
| language | VARCHAR(20) | NOT NULL | Language used |
| status | VARCHAR(30) | NOT NULL | "accepted", "wrong_answer", "runtime_error", etc. |
| execution_time_ms | INTEGER | | How long execution took |
| submitted_at | TIMESTAMP | NOT NULL DEFAULT NOW() | When submission was made |

```sql
CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id VARCHAR(50) NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    submitted_code TEXT NOT NULL,
    language VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL,
    execution_time_ms INTEGER,
    submitted_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_submissions_user_id ON submissions(user_id);
CREATE INDEX idx_submissions_problem_id ON submissions(problem_id);
CREATE INDEX idx_submissions_status ON submissions(status);
```

---

## Sync Strategy: JSON ↔ Database

Since problems live in both JSON files AND the database, here's how to keep them in sync:

### Option A: Application Loads on Startup (Recommended for simplicity)
```
1. Server starts
2. ProblemService reads all JSON files
3. For each problem: INSERT INTO problems (...) ON CONFLICT (id) DO UPDATE
4. Problems table is always in sync with JSON
```

### Option B: Migration Script
```
1. When adding new problems: run `npm run sync-problems` 
2. Script reads JSON, inserts into DB
3. More controlled, good for production
```

---

## Example Queries

### "Show all problems a user hasn't completed"
```sql
SELECT p.* 
FROM problems p
WHERE p.visibility = 'public'
AND p.id NOT EXISTS (
    SELECT 1 FROM problem_completions pc 
    WHERE pc.problem_id = p.id AND pc.user_id = $1
);
```

### "Leaderboard: users with most completions"
```sql
SELECT u.email, COUNT(pc.id) as completions
FROM users u
JOIN problem_completions pc ON u.id = pc.user_id
GROUP BY u.id, u.email
ORDER BY completions DESC
LIMIT 10;
```

### "Find hardest problem (lowest solve rate)"
```sql
SELECT 
    p.id, 
    p.title, 
    COUNT(pc.id) as solve_count,
    (COUNT(pc.id)::float / (SELECT COUNT(*) FROM users)::float) as solve_rate
FROM problems p
LEFT JOIN problem_completions pc ON p.id = pc.problem_id
GROUP BY p.id, p.title
ORDER BY solve_rate ASC
LIMIT 5;
```

---

## Migration Notes

### Initial Setup
```sql
-- Run in order:
-- 1. Create users table
-- 2. Create problems table (will be populated from JSON)
-- 3. Create problem_completions table
-- 4. (Optional) Create submissions table

-- After tables exist, populate problems from JSON:
-- Run application once - it will sync JSON to DB
-- OR run: node scripts/sync-problems.js
```

### Future Schema Changes
- Add `submissions` table when you need detailed attempt history
- Add `user_roles` table for admin/moderator roles
- Add `problem_tags` for categorization beyond difficulty

---

## Summary

| Table | Storage Type | Why |
|-------|-------------|-----|
| users | Database | Dynamic, user-specific data |
| problems | Hybrid (JSON + DB cache) | Static content, but needs DB for queries |
| problem_completions | Database | Core dynamic tracking |
| submissions | Database (optional) | Future analytics |

This schema supports your goal of a **dynamic system** where users can track progress across problems, while keeping **problem management flexible** via JSON files.