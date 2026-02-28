
# UNIX TRAINER

## Tech Stack:
- React (TypeScript)
- Node.js (JavaScript)
- PostgreSQL + Supabase (free tier)
- Server will be hosted on my local computer, then tunnel using cloudflare
- - This is more of a learning project, so this will suffice.
- Authentication: Supabase + google Oauth option
- Code Editor: CodeMirror
- Terminal: Docker container for each client

## Features:

- list of problems on left, problem description center left, editor to the right
- - bash, unix, awk sections
- playground that lets you play around with bash, unix, awk

### Docker Usage:

A client can log on to site, but only when they log in and enter a problem the server will spin up a docker container that will stick with them even when they switch problems, etc.
lational database
