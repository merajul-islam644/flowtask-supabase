/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Mapped in vite.config.ts from NEXT_PUBLIC_SUPABASE_URL. */
  readonly VITE_SUPABASE_URL: string;
  /** Mapped in vite.config.ts from NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. */
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
