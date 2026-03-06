
# Unix Trainer

Learn what LeetCode doesn't teach.

Interactive coding challenges for more specific frameworks and languages that other platforms don't target.

Currently supporting:
- Systems Programming
- - Unix
- - Bash
- - Awk
- GPU Programming
- - Just CUDA for now

## Dev auto sign-in

To be automatically signed in as a **dev** user when running `npm run dev`:

1. Ensure `server/.env` has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
2. Run once: **`npm run dev:seed-user`**. This creates a user `dev@local.dev` in Supabase (and `public.users` via trigger) and writes `VITE_DEV_USER_ID` to `client/.env.local`.
3. Run **`npm run dev`**. The client will set `localStorage` from `VITE_DEV_USER_ID` so you appear signed in as Dev (saves/completions work against that user).

## Tech Stack:
- React (TypeScript)
- Node.js (JavaScript)
- PostgreSQL + Supabase (free tier)
- Server will be hosted on my local computer, then tunnel using cloudflare
- - This is more of a learning project, so this will suffice.
- - If you want to try this project for yourself, feel free to set it up locally
- Authentication: Supabase
- Code Editor: CodeMirror
- Terminal: Docker container for each client

## Potential Future Expansions:

- WebGPU
- SQL
- MongoDB Query Language
- Rust
- Go
- C / C++ with focus on low-level / memory management
- Docker
- Terraform
- Vulkan
- SYCL
