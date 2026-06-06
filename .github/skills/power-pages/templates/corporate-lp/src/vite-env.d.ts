/// <reference types="vite/client" />

declare module "*.css";

interface ImportMetaEnv {
  /** サイト/ブランド表示名（.env.example 参照） */
  readonly VITE_SITE_NAME?: string;
  /** ヘッダーロゴのマーク（1〜2 文字） */
  readonly VITE_SITE_LOGO_MARK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
