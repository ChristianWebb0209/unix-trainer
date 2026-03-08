# Tensor Trainer

LeetCode-style practice for **GPU and systems programming**: kernels (C, C++, Rust, CUDA, SYCL) and tensors (Python, Triton, PyTorch). Run code in real Docker workspaces, validate against tests, and use a full **playground** with saved files and project guides.

## Features

- **Two workspaces**  
  **Kernel Lab** — C, C++, Rust, CUDA, SYCL. **Tensor Lab** — Python, Triton, PyTorch. Switch by workspace; language selector follows the workspace.

- **Problem mode**  
  Curated problems with instructions, reference solutions, and in-editor validation. Run in a **live terminal** (Docker); in Kernel Lab you can add Render (Image/Video/Interactive) tabs to view output. Progress (attempted/completed) is saved when signed in.

- **Playground mode**  
  Free-form coding without a selected problem. **Files** tab: create, rename, delete, and export files (with language-specific extensions); auto-save; double-click to open; Delete key + confirmation modal; right-click → Export. **Projects** tab: browse markdown project guides from the server. Any workspace language is available in the playground.

- **Editor**  
  CodeMirror with syntax highlighting, LSP (clangd, rust-analyzer, pyright) in the container, resizable panels, and collapsible problem/side panel with animation.

- **Backend**  
  Express API, Supabase (auth + problems + completions + playground files), PostgreSQL. Problems and projects synced from repo data (JSON and `.md`) on server boot; optional `db:sync-*` scripts with `--hard` for full reset.

## Quick start

1. **Clone and install**  
   `npm install` at the repo root (uses workspaces: `client`, `server`).

2. **Environment**  
   In `server/`: copy `.env.example` to `.env` and set `DB_*` and, for auth/completions/files, `SUPABASE_*`. In `client/`: optional `client/.env.local` for dev (e.g. `VITE_DEV_USER_ID` after seeding).

3. **Database**  
   Run the SQL in `server/src/db/supabase-setup.sql` in your Supabase project (or use `server/src/db/drop-schema.sql` then the setup script for a clean slate).

4. **Docker**  
   Build workspace images (e.g. `npm run docker:build` in `server/` if you have a build script). Server expects Docker for terminal and LSP.

5. **Run**  
   From repo root: `npm run dev` (starts the client). Run the server separately (e.g. `npm run dev` in `server/`) so the API and WebSockets (terminal, LSP) are available.

**Dev auto sign-in**  
With Supabase configured, run `npm run dev:seed-user` once to create a dev user; the client can use `VITE_DEV_USER_ID` so you’re signed in locally and completions/files work.

## Scripts (root / server)

| Command | Description |
|--------|-------------|
| `npm run dev` | Start client (Vite). |
| `npm run dev:seed-user` | Create dev user and write `VITE_DEV_USER_ID` for client. |
| `npm run db:sync-problems` | Upsert problems from `server/src/data/problems/*.json`. |
| `npm run db:sync-problems:hard` | Wipe problems table and re-sync from JSON. |
| `npm run db:sync-projects` | Upsert projects from `server/src/data/projects/*.md`. |
| `npm run db:sync-projects:hard` | Wipe projects table and re-sync from `.md`. |

## Tech stack

- **Client:** React 19, TypeScript, Vite, CodeMirror 6, xterm.js, react-resizable-panels.
- **Server:** Node, Express, ws (terminal + LSP), Dockerode, Supabase, pg.
- **Data:** Supabase (PostgreSQL + auth). Problems and projects synced from `server/src/data/`.

## Docs

- `docs/add-new-languages-and-workspaces.md` — Add languages or workspaces.
- `docs/db-schema.md` — DB schema reference.
- `server/src/db/SCHEMA.md` — Minimal table/column overview.
- `server/src/data/problems/LLM_PROBLEM_AUTHORING_GUIDE.md` — How to write problem JSON.
