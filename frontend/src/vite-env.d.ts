/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** frontend/package.json's version, which vite.config.ts defines. Read it as APP_VERSION from features/releases/version.ts. */
declare const __APP_VERSION__: string;

declare module '*.scss' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.svg?url' {
  const content: string;
  export default content;
}
