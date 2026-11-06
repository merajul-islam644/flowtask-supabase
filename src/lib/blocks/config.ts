/** Supabase configuration, read once from Vite env vars. See `.env` at the app root. */

function env(name: string): string | undefined {
  const value = import.meta.env[name];
  return typeof value === "string" && value.length > 0 ? value.trim() : undefined;
}

/**
 * The browser bundle only ever sees the project URL and the publishable key —
 * both safe for browsers by design (RLS protects the data). vite.config.ts
 * maps the dashboard's NEXT_PUBLIC_* names onto these automatically.
 */
export const supabaseConfig = {
  url: env("VITE_SUPABASE_URL") ?? "",
  publishableKey: env("VITE_SUPABASE_ANON_KEY") ?? "",
};

/** True when every value the sign-in flow needs is present. */
export function isLoginConfigured(): boolean {
  return Boolean(supabaseConfig.url && supabaseConfig.publishableKey);
}
