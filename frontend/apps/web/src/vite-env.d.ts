/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" → MSW serves the API in the browser, editor runs on a local Y.Doc. */
  readonly VITE_MOCK?: string;
}
