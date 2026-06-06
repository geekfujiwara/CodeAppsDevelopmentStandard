/**
 * サイト設定（ビルド時の環境変数を集約）
 *
 * デプロイごとに変わるブランディング値は `.env`（`.env.example` 参照）の
 * `VITE_*` 変数で上書きできる。未設定時は既定値にフォールバックする。
 */

/** サイト/ブランド表示名（ヘッダー・フッター・タブタイトル） */
export const SITE_NAME: string =
  import.meta.env.VITE_SITE_NAME?.trim() || "Power Pages";

/** ヘッダーロゴのマーク（1〜2 文字） */
export const SITE_LOGO_MARK: string =
  import.meta.env.VITE_SITE_LOGO_MARK?.trim() || "P";
