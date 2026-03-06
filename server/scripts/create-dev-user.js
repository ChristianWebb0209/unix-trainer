/**
 * Creates a dev user in Supabase Auth (and thus public.users via trigger)
 * and writes VITE_DEV_USER_ID to client/.env.local so the client can auto sign-in in dev.
 *
 * Run once: node server/scripts/create-dev-user.js (from repo root)
 * Or: npm run dev:seed-user
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in server/.env (or root .env)
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env from server/.env or repo root
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEV_EMAIL = 'dev@local.dev';
const DEV_PASSWORD = 'dev';
const DEV_DISPLAY_NAME = 'Dev';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in server/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  let userId;
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { name: DEV_DISPLAY_NAME },
  });
  if (!createError) {
    userId = createData.user?.id;
    if (userId) {
      console.log('Created dev user:', userId);
    }
  } else if (createError.message?.toLowerCase().includes('already') || createError.message?.includes('registered')) {
    const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const found = list?.users?.find((u) => u.email === DEV_EMAIL);
    if (found) {
      userId = found.id;
      console.log('Dev user already exists:', userId);
    } else {
      console.error('Dev user may exist but could not be found. Get the user ID from Supabase Dashboard -> Authentication -> Users and set VITE_DEV_USER_ID in client/.env.local');
      process.exit(1);
    }
  } else {
    console.error('Failed to create dev user:', createError.message);
    process.exit(1);
  }
  if (!userId) {
    console.error('No user id');
    process.exit(1);
  }

  const clientEnvPath = path.join(__dirname, '../../client/.env.local');
  let content = '';
  try {
    content = fs.readFileSync(clientEnvPath, 'utf8');
  } catch {
    // file may not exist
  }
  const line = `VITE_DEV_USER_ID=${userId}`;
  const hasAlready = /VITE_DEV_USER_ID=/.test(content);
  if (hasAlready) {
    content = content.replace(/VITE_DEV_USER_ID=.*/m, line);
  } else {
    content = content.trimEnd();
    if (content) content += '\n';
    content += '\n# Auto sign-in as dev when running npm run dev (set by create-dev-user.js)\n' + line + '\n';
  }
  fs.writeFileSync(clientEnvPath, content, 'utf8');
  console.log('Wrote', clientEnvPath);
  console.log('You can now run npm run dev and be signed in as dev.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
