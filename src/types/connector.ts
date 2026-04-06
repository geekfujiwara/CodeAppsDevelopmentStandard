/**
 * コネクタレスポンスの共通型定義
 *
 * Power Apps SDK を通じて取得されるコネクタレスポンスの汎用型です。
 */

/** コネクタ API レスポンスの共通型 */
export interface ConnectorResponse<T> {
  /** レスポンスデータ */
  data: T;
  /** HTTP ステータスコード */
  status?: number;
}

/** ページネーション付きレスポンス */
export interface PaginatedResponse<T> {
  /** データ配列 */
  value: T[];
  /** 次ページの URL（存在する場合） */
  "@odata.nextLink"?: string;
  /** 総件数（存在する場合） */
  "@odata.count"?: number;
}

/** エラーレスポンス */
export interface ConnectorError {
  /** エラーコード */
  code: string;
  /** エラーメッセージ */
  message: string;
  /** 詳細情報 */
  details?: string;
}
