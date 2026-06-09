/**
 * サイト設定（ビルド時の環境変数を集約）
 *
 * デプロイごとに変わるブランディング値は `.env`（`.env.example` 参照）の
 * `VITE_*` 変数で上書きできる。未設定時は既定値にフォールバックする。
 */

export type SiteNavItemConfig = {
  label: string;
  path: string;
  iconKey?: string;
};

export type SiteNavGroupConfig = {
  label: string;
  items: SiteNavItemConfig[];
};

export type SiteFeatureItemConfig = {
  title: string;
  description: string;
  path: string;
  color: string;
  iconKey?: string;
};

export type SiteFeatureGroupConfig = {
  group: string;
  description: string;
  items: SiteFeatureItemConfig[];
};

export type SiteHighlightConfig = {
  title: string;
  description: string;
  iconKey?: string;
};

export type SiteHeroConfig = {
  badge: string;
  titlePrefix: string;
  titleHighlight: string;
  titleSuffix?: string;
  description: string;
  primaryActionLabel: string;
  primaryActionPath: string;
  secondaryActionLabel: string;
};

const defaultNavGroups: SiteNavGroupConfig[] = [
  {
    label: "メイン",
    items: [
      { label: "ホーム", path: "/", iconKey: "dashboard" },
      { label: "コンテンツ", path: "/content", iconKey: "content" },
    ],
  },
  {
    label: "管理",
    items: [
      { label: "ユーザー", path: "/users", iconKey: "users" },
      { label: "設定", path: "/settings", iconKey: "settings" },
    ],
  },
];

const defaultFeatureGroups: SiteFeatureGroupConfig[] = [
  {
    group: "メイン機能",
    description: "主要な業務機能にアクセス",
    items: [
      {
        title: "ダッシュボード",
        description: "主要指標をリアルタイムで確認。チームの状況を一画面で把握。",
        path: "/",
        color: "from-blue-500 to-indigo-600",
        iconKey: "dashboard",
      },
      {
        title: "コンテンツ管理",
        description: "ドキュメント・ナレッジの作成・編集・公開を管理。",
        path: "/content",
        color: "from-emerald-500 to-teal-600",
        iconKey: "content",
      },
    ],
  },
  {
    group: "管理機能",
    description: "システム管理とユーザー管理",
    items: [
      {
        title: "ユーザー管理",
        description: "メンバーの追加・ロール設定・アクセス権限を管理。",
        path: "/users",
        color: "from-orange-500 to-amber-600",
        iconKey: "users",
      },
      {
        title: "設定",
        description: "サイト全体の設定・通知・連携サービスを構成。",
        path: "/settings",
        color: "from-purple-500 to-violet-600",
        iconKey: "settings",
      },
    ],
  },
];

const defaultHighlights: SiteHighlightConfig[] = [
  {
    title: "高速デプロイ",
    description: "Power Pages + Dataverse で業務アプリを即座に外部公開。開発からデプロイまで数時間。",
    iconKey: "zap",
  },
  {
    title: "エンタープライズセキュリティ",
    description: "Entra ID 認証・テーブル権限・Web ロールで細かなアクセス制御を実現。",
    iconKey: "shield",
  },
  {
    title: "どこからでもアクセス",
    description: "レスポンシブ SPA でモバイル・タブレット・デスクトップすべてに対応。",
    iconKey: "globe",
  },
];

const defaultHero: SiteHeroConfig = {
  badge: "Power Pages",
  titlePrefix: "業務を、もっと",
  titleHighlight: "スマート",
  titleSuffix: "に。",
  description: "Dataverse と連携した業務ポータルで、\n情報共有・申請・管理をワンストップで実現します。",
  primaryActionLabel: "はじめる",
  primaryActionPath: "/content",
  secondaryActionLabel: "機能を見る",
};

function parseJsonEnv<T>(key: string, fallback: T): T {
  const value = import.meta.env[key as keyof ImportMetaEnv];

  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.warn(`[config] Failed to parse ${key}:`, error);
    return fallback;
  }
}

/** サイト/ブランド表示名（ヘッダー・フッター・タブタイトル） */
export const SITE_NAME: string =
  import.meta.env.VITE_SITE_NAME?.trim() || "Power Pages";

/** ヘッダーロゴのマーク（1〜2 文字） */
export const SITE_LOGO_MARK: string =
  import.meta.env.VITE_SITE_LOGO_MARK?.trim() || "P";

/** ブラウザタイトル */
export const SITE_TITLE: string =
  import.meta.env.VITE_SITE_TITLE?.trim() || SITE_NAME;

/** テーマ保存キー */
export const THEME_STORAGE_KEY: string =
  import.meta.env.VITE_THEME_STORAGE_KEY?.trim() || "pp-theme";

/** ナビゲーション構造 */
export const SITE_NAV_GROUPS = parseJsonEnv(
  "VITE_SITE_NAV_GROUPS_JSON",
  defaultNavGroups,
);

/** ホーム画面ヒーロー */
export const SITE_HERO = parseJsonEnv("VITE_SITE_HERO_JSON", defaultHero);

/** ホーム画面の機能紹介カード */
export const SITE_FEATURE_GROUPS = parseJsonEnv(
  "VITE_SITE_FEATURE_GROUPS_JSON",
  defaultFeatureGroups,
);

/** ホーム画面ハイライト */
export const SITE_HIGHLIGHTS = parseJsonEnv(
  "VITE_SITE_HIGHLIGHTS_JSON",
  defaultHighlights,
);
