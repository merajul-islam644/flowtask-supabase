/**
 * Safe .env key diagnostics — prints NO secret material.
 *
 *   node --env-file=.env scripts/key-info.js
 *
 * Shows only: key format/prefix, length, JWT role claim, and whether the
 * key's project ref matches the URL's project ref. These fields are
 * non-sensitive; the key value itself is never printed.
 */

const sysUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  "";

if (!key) {
  console.log("❌ No publishable/anon key found in .env (all accepted names empty).");
  process.exit(1);
}

console.log("Key format checks (value never printed):");
console.log(`  length            : ${key.length}`);
console.log(`  starts with       : ${key.slice(0, 4)}…`);
console.log(`  contains quote    : ${/["']/.test(key)}`);
console.log(`  contains space    : ${/\s/.test(key)}`);

if (key.startsWith("sb_")) {
  const kind = key.startsWith("sb_publishable_") ? "publishable (new format) ✅"
    : key.startsWith("sb_secret_") ? "secret ⚠️ THIS IS NOT THE PUBLISHABLE KEY"
    : "unknown sb_ type";
  console.log(`  new-style key     : ${kind}`);
  console.log("  (new-style keys are NOT a JWT — no role/ref to decode)");
} else if (key.split(".").length === 3) {
  console.log("  format            : legacy JWT-style key");
  try {
    const payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const iat = payload.iat ? new Date(payload.iat * 1000).toISOString().slice(0, 10) : "?";
    console.log(`  JWT role claim    : ${payload.role}`);
    console.log(`  JWT project ref   : ${payload.ref ?? "(none)"}`);
    console.log(`  JWT issued        : ${iat}`);
    const urlRef = sysUrl.replace(/^https?:\/\//, "").split(".")[0];
    if (payload.ref && sysUrl) {
      console.log(
        payload.ref === urlRef
          ? `  match             : ✅ key ref == URL ref (${urlRef})`
          : `  match             : ❌ MISMATCH — URL is "${urlRef}" but key is from "${payload.ref}". Wrong project's key!`
      );
    }
  } catch {
    console.log("  JWT payload       : could not decode (key may be truncated)");
  }
} else {
  console.log("  format            : ❌ neither sb_ key nor JWT — likely truncated or wrong text");
}

console.log(`\nURL project ref    : ${sysUrl.replace(/^https?:\/\//, "").split(".")[0] || "(URL empty)"}`);
