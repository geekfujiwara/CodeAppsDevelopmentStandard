/// <reference types="vite/client" />

declare module "*.css";

interface ImportMetaEnv {
  /** サイト/ブランド表示名（.env.example 参照） */
  readonly VITE_SITE_NAME?: string;
  /** ヘッダーロゴのマーク（1〜2 文字） */
  readonly VITE_SITE_LOGO_MARK?: string;
  /** ブラウザタイトル */
  readonly VITE_SITE_TITLE?: string;
  /** テーマ保存キー */
  readonly VITE_THEME_STORAGE_KEY?: string;
  /** ナビゲーション定義(JSON) */
  readonly VITE_SITE_NAV_GROUPS_JSON?: string;
  /** ヒーロー定義(JSON) */
  readonly VITE_SITE_HERO_JSON?: string;
  /** 機能カード定義(JSON) */
  readonly VITE_SITE_FEATURE_GROUPS_JSON?: string;
  /** ハイライト定義(JSON) */
  readonly VITE_SITE_HIGHLIGHTS_JSON?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
