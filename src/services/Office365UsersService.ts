/**
 * Office 365 Users サービス - プレースホルダー
 *
 * このファイルは PAC CLI (`pac code add-data-source`) によって自動生成されるサービスの
 * プレースホルダーです。実際のプロジェクトでは、以下のコマンドで自動生成されます:
 *
 * ```bash
 * # 1. 利用可能な接続を確認
 * pac connection list
 *
 * # 2. Office 365 Users コネクタを追加
 * pac code add-data-source -a shared_office365users -c {connection-id}
 * ```
 *
 * 生成後、このファイルは PAC CLI が生成した実際のサービスファイルに置き換えてください。
 *
 * ## 生成されるサービスの例
 * PAC CLI は以下のようなメソッドを持つサービスクラスを生成します:
 *
 * - `MyProfile_V2(select?)` - 現在のユーザーのプロフィールを取得
 * - `UserProfile_V2(id, select?)` - 指定ユーザーのプロフィールを取得
 * - `UserPhoto_V2(id)` - ユーザーの写真を取得
 * - `SearchUser_V2(searchTerm, top?)` - ユーザーを検索
 * - `DirectReports_V2(id)` - 直属の部下を取得
 * - `Manager_V2(id)` - マネージャーを取得
 */

interface ServiceResponse {
  data: unknown;
  status?: number;
}

/**
 * Office365UsersService プレースホルダー
 *
 * ⚠️ このクラスはデモ用のプレースホルダーです。
 * 実際の開発では `pac code add-data-source` で生成されるサービスを使用してください。
 */
export const Office365UsersService = {
  /**
   * 現在のユーザーのプロフィールを取得
   * @param select - 取得するフィールド（カンマ区切り）
   */
  MyProfile_V2: async (_select?: string): Promise<ServiceResponse> => {
    throw new Error(
      "Office365UsersService は pac code add-data-source で生成してください。" +
        "詳細は README.md の「コネクタ設定」セクションを参照してください。"
    );
  },

  /**
   * 指定ユーザーのプロフィールを取得
   * @param id - ユーザー ID
   * @param select - 取得するフィールド（カンマ区切り）
   */
  UserProfile_V2: async (
    _id: string,
    _select?: string
  ): Promise<ServiceResponse> => {
    throw new Error(
      "Office365UsersService は pac code add-data-source で生成してください。"
    );
  },

  /**
   * ユーザーの写真を取得
   * @param id - ユーザー ID
   */
  UserPhoto_V2: async (_id: string): Promise<ServiceResponse> => {
    throw new Error(
      "Office365UsersService は pac code add-data-source で生成してください。"
    );
  },

  /**
   * ユーザーを検索
   * @param searchTerm - 検索キーワード
   * @param top - 取得件数の上限
   */
  SearchUser_V2: async (
    _searchTerm: string,
    _top?: number
  ): Promise<ServiceResponse> => {
    throw new Error(
      "Office365UsersService は pac code add-data-source で生成してください。"
    );
  },
};
