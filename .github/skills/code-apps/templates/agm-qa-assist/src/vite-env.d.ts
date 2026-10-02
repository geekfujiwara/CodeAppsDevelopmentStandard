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
  readonly VITE_AGM_MEETING_TITLE?: string
  readonly VITE_AGM_MEETING_DATE?: string
  readonly VITE_AGM_SP_SITE_URL?: string
  readonly VITE_AGM_SP_LIBRARY?: string
  /** ホスト再現テスト用のビルドだけで設定する */
  readonly VITE_DEV_LOCAL_CORPUS?: string
  readonly VITE_DEV_AUTOSTART?: string
  readonly VITE_DEV_SPEECH_TOKEN?: string
  readonly VITE_DEV_SPEECH_REGION?: string
  readonly VITE_DEV_ANSWER_TICKET_URL?: string
  readonly VITE_DEV_LIBRARY_QUERY?: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
