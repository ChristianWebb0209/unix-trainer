import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase is optional.
 *
 * The CUDA lab — browsing problems, running code, validating, and the Render
 * panel — works entirely without it. Supabase only adds sign-in, saved progress,
 * and playground file persistence.
 *
 * `createClient` throws on an undefined URL, which would take down the whole app
 * at import time, so the client stays null until the environment is configured.
 * Callers must null-check; `isSupabaseConfigured` is the readable way to do it.
 */
const url = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url?.trim() && anonKey?.trim());

export const supabase: SupabaseClient | null = isSupabaseConfigured
    ? createClient(url as string, anonKey as string)
    : null;

if (!isSupabaseConfigured && import.meta.env?.DEV) {
    console.info(
        "[supabase] Not configured — running without accounts. " +
        "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in client/.env.local to enable sign-in."
    );
}
