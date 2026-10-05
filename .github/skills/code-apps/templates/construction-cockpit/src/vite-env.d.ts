/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_PUBLISHER_PREFIX: string
  readonly VITE_TABLE_PREFIX: string
  readonly VITE_DATAVERSE_URL: string
  readonly VITE_CODEAPPS_APP_NAME: string
  readonly VITE_CODEAPPS_APP_SUBTITLE: string
  readonly VITE_CODEAPPS_DOCUMENT_TITLE: string
  readonly VITE_CODEAPPS_THEME_STORAGE_KEY: string
  readonly VITE_FEATURE_STORES: string
  readonly VITE_FEATURE_REPORTS: string
  /** "off" で KY の AI 危険予測を使わず、過去事例の検索だけで表示する（既定: agent） */
  readonly VITE_KY_AI?: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
