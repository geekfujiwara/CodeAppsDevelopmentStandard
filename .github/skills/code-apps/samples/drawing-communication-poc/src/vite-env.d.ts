/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_PUBLISHER_PREFIX: string
  readonly VITE_TABLE_PREFIX: string
  readonly VITE_DATAVERSE_URL: string
  readonly VITE_CODEAPPS_APP_NAME: string
  readonly VITE_CODEAPPS_APP_SUBTITLE: string
  readonly VITE_CODEAPPS_DOCUMENT_TITLE: string
  readonly VITE_CODEAPPS_THEME_STORAGE_KEY: string
  readonly VITE_GUIDE_STORAGE_KEY: string
  readonly VITE_DRAWING_STORAGE_KEY: string
  readonly VITE_FEATURE_DRAWING_CONVERSATION: string
  readonly VITE_FEATURE_DRAWING_STORAGE: string
  readonly VITE_DRAWING_POLL_INTERVAL_MS: string
  readonly VITE_DRAWING_POLL_TIMEOUT_MS: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
