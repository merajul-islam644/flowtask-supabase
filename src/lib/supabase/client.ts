import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/blocks/config";

/**
 * The single Supabase browser client for this app. Every Supabase call goes
 * through it — never hand-roll fetch against the REST API from components.
 *
 * Uses the publishable (anon) key only, which is safe in browsers by design:
 * Row Level Security on the tables is what actually protects the data.
 * A service_role key must NEVER appear here or anywhere else client-side.
 */
export const supabase = createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
  auth: {
    // Sessions persist in localStorage and refresh automatically.
    persistSession: true,
    autoRefreshToken: true,
    // Email/password sign-in completes in place; OAuth/magic-link callbacks
    // land on /login/callback, which handles the URL explicitly.
    detectSessionInUrl: true,
  },
});
