/**
 * Supabase Configuration
 * ----------------------
 * Client for Supabase Auth and Database services.
 * 
 * Environment variables:
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_ANON_KEY: Public anon key (for client-side/authenticated requests)
 * - SUPABASE_SERVICE_ROLE_KEY: Secret service role key (for admin operations)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Supabase is optional. Without it the server serves problems, projects and help
 * docs straight from src/data (see local-problems.js / local-markdown.js); only
 * auth, saved progress and playground files need a real project.
 *
 * createClient() throws on an undefined URL, so both clients stay null until the
 * environment is actually configured.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn('[Supabase] Not configured - running on local data. Auth, progress and playground files are disabled.');
}

// Regular client (uses anon key - for authenticated users)
export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

// Admin client (uses service role key - bypasses RLS)
export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

// Helper to verify JWT token
export async function verifyToken(token) {
  if (!supabase) return null;
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) throw error;
    return user;
  } catch (error) {
    console.error('[Auth] Token verification failed:', error.message);
    return null;
  }
}

export default { supabase, supabaseAdmin, verifyToken };