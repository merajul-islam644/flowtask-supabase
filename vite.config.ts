import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig(({ mode }) => {
  // Load ALL .env variables (no prefix filter) so the Supabase dashboard's
  // NEXT_PUBLIC_* names work as-is. They are exposed to the browser bundle
  // only via the define mappings below — URL + publishable key only, which
  // are safe for browsers by design. No secret is ever bundled.
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl =
    env.NEXT_PUBLIC_SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? "";
  const supabaseKey =
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    env.VITE_SUPABASE_ANON_KEY ??
    "";

  return {
    plugins: [react(), tailwindcss()],
    // Project site on GitHub Pages lives under /flowtask-supabase/ —
    // only the Actions build sets this flag, so dev and local builds stay at "/".
    base: process.env.BUILD_FOR_GH_PAGES ? "/flowtask-supabase/" : "/",
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(supabaseKey),
    },
    server: {
      port: 5173,
    },
  };
});
