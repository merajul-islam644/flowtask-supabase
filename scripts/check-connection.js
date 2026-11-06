/**
 * Read-only Supabase connection check.
 *
 *   npm run check     (equivalent to: node --env-file=.env scripts/check-connection.js)
 *
 * What it does: GETs `/auth/v1/health`, a read-only status endpoint.
 * It never reads table data, runs SQL, or changes anything.
 *
 * Note: we deliberately do NOT probe the `/rest/v1/` OpenAPI root — it can
 * return 401 with new-format (sb_publishable_) keys even when everything
 * works. Table queries through /rest/v1/<table> work fine.
 */
import { getSupabaseConfig } from "./lib/node-supabase.js";

try {
  const { url, key } = getSupabaseConfig();
  console.log(`Project URL: ${url}`);
  console.log("Publishable key: present (hidden)");
  console.log("Checking /auth/v1/health (read-only)...");

  const res = await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });

  if (res.ok) {
    const info = await res.json().catch(() => null);
    console.log(`✅ Connection OK — Supabase responded ${res.status}${info?.version ? ` (auth service ${info.version})` : ""}.`);
    console.log("   Your .env is correct. REST queries will work once tables exist.");
    process.exitCode = 0;
  } else if (res.status === 401 || res.status === 403) {
    console.log(`❌ Auth rejected (${res.status}). The publishable key in .env looks wrong.`);
    console.log(`
NOTE: make sure you copied the key labeled "publishable", NOT the one labeled
"secret". Run: node --env-file=.env scripts/key-info.js  for safe diagnostics.`);
    process.exitCode = 1;
  } else {
    console.log(`⚠️  Unexpected status ${res.status} ${res.statusText}`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exitCode = 1;
}
