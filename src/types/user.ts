/**
 * Office 365 Users コネクタ用の型定義
 *
 * pac code add-data-source で生成されるモデルを補完する型定義です。
 * 実際のプロジェクトでは、PAC CLI が src/models/ に型定義を自動生成します。
 */

/** ユーザープロフィール情報 */
export interface UserProfileData {
  /** ユーザー ID */
  id: string;
  /** 表示名 */
  displayName: string;
  /** 役職 */
  jobTitle?: string;
  /** 部署 */
  department?: string;
  /** メールアドレス */
  mail?: string;
  /** ユーザープリンシパル名 */
  userPrincipalName: string;
  /** 会社名 */
  companyName?: string;
  /** オフィスの場所 */
  officeLocation?: string;
  /** 市区町村 */
  city?: string;
  /** 国 / 地域 */
  country?: string;
}

/** ユーザーグループ情報 */
export interface UserGroup {
  /** グループ ID */
  id: string;
  /** グループ表示名 */
  displayName: string;
  /** グループの説明 */
  description?: string;
  /** メールアドレス */
  mail?: string;
}
