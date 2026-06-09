/// <reference types="vite/client" />

declare module "*.css"

interface ImportMetaEnv {
  readonly VITE_CODEAPPS_APP_NAME?: string
  readonly VITE_CODEAPPS_APP_SUBTITLE?: string
  readonly VITE_CODEAPPS_DOCUMENT_TITLE?: string
  readonly VITE_CODEAPPS_THEME_STORAGE_KEY?: string
  readonly VITE_CODEAPPS_NAV_SECTIONS_JSON?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
