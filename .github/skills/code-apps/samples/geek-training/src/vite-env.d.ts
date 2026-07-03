/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_PUBLISHER_PREFIX: string
  readonly VITE_CODEAPPS_APP_NAME: string
  readonly VITE_CODEAPPS_APP_SUBTITLE: string
  readonly VITE_CODEAPPS_DOCUMENT_TITLE: string
  readonly VITE_CODEAPPS_THEME_STORAGE_KEY: string
  readonly VITE_FEATURE_ENROLLMENTS: string
  readonly VITE_FEATURE_REPORTS: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
