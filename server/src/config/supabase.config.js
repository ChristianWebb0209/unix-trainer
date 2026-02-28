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

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment');
}

// Regular client (uses anon key - for authenticated users)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client (uses service role key - bypasses RLS)
export const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

// Helper to verify JWT token
export async function verifyToken(token) {
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