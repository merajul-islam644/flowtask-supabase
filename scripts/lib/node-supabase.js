/**
 * Supabase client factory — connection setup only, no app-specific logic.
 *
 * Works in Node today and can be reused by a frontend later:
 *   - Node:      reads process.env (run with `node --env-file=.env ...`)
 *   - Bundlers:  reads import.meta.env first (e.g. Vite's VITE_* variables)
 *
 * Accepts BOTH naming conventions Supabase uses:
 *   - New dashboard style:  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *   - Classic style:        SUPABASE_URL, SUPABASE_ANON_KEY
 *
 * SECURITY RULES baked in below:
 *   - The publishable/anon key is the only key allowed in browser/frontend code.
 *   - A service_role key is rejected unless you explicitly pass server-side
 *     mode; the guard decodes the JWT payload to verify the role claim.
 */

import { createClient } from "@supabase/supabase-js";

/** All accepted names, best-first. */
const URL_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
];

const PUBLISHABLE_KEY_VARS = [
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
];

/** Server-only. Note: deliberately NO NEXT_PUBLIC_ alias for this one. */
const SERVICE_KEY_VARS = ["SUPABASE_SERVICE_ROLE_KEY"];

/** Read the first defined value among `names` from any runtime's env. */
function readEnv(names) {
  const sources = [];
  if (typeof import.meta !== "undefined" && import.meta.env) sources.push(import.meta.env);
  if (typeof process !== "undefined" && process.env) sources.push(process.env);
  for (const env of sources) {
    for (const name of names) {
      const v = env[name];
      if (typeof v === "string" && v.trim() !== "") return v;
    }
  }
  return null;
}

/** True if the JWT payload's "role" claim is "service_role". */
function isServiceRoleKey(key) {
  try {
    const payload = key.split(".")[1];
    if (!payload) return false;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json).role === "service_role";
  } catch {
    return false;
  }
}

/** Validate and return { url, key } from the environment. */
export function getSupabaseConfig({ requireKey = true } = {}) {
  const url = readEnv(URL_VARS);
  const key = readEnv(PUBLISHABLE_KEY_VARS);

  if (!url) {
    throw new Error(
      "Supabase URL is not set. Looked for: " + URL_VARS.join(", ") +
        ". Copy it from Supabase Dashboard -> Project Settings -> API into .env."
    );
  }
  const trimmedUrl = url.trim();
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(trimmedUrl);
  const isRemote = /^https:\/\/.+/.test(trimmedUrl);
  if (!isLocal && !isRemote) {
    throw new Error(`Supabase URL does not look like a valid URL: "${url}"`);
  }
  if (requireKey && !key) {
    throw new Error(
      "Publishable/anon key is not set. Looked for: " + PUBLISHABLE_KEY_VARS.join(", ") +
        ". Copy it from Supabase Dashboard -> Project Settings -> API into .env."
    );
  }
  return { url: trimmedUrl.replace(/\/+$/, ""), key };
}

/**
 * Create a Supabase client. Uses the publishable (anon) key — safe everywhere.
 *
 * @param {object} [options]
 * @param {boolean} [options.server=false] Set true in server-side code ONLY to
 *        permit SUPABASE_SERVICE_ROLE_KEY (bypasses Row Level Security).
 */
export function createSupabaseClient(options = {}) {
  const { url, key } = getSupabaseConfig();

  let effectiveKey = key;
  if (options.server) {
    const serviceKey = readEnv(SERVICE_KEY_VARS);
    if (serviceKey) effectiveKey = serviceKey;
  }

  if (!options.server && isServiceRoleKey(effectiveKey)) {
    throw new Error(
      "Refusing to use a service_role key outside server-side mode. " +
        "This key bypasses Row Level Security and must never reach browser code."
    );
  }

  return createClient(url, effectiveKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}
