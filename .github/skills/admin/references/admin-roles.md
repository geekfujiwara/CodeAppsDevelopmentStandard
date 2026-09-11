# 管理者ロール要件

このスキルの各操作に必要な最小ロールの目安。組織のセキュリティ方針によって異なる場合があるため、
実際に付与する前に出典（Microsoft Learn）を確認する。

| 操作 | 実施場所 | 必要な最小ロール | 出典 |
|---|---|---|---|
| テナントレベルのデータ ポリシー（DLP）の参照・作成・編集 | Power Platform 管理センター / 管理 API | **Power Platform Administrator** | [データ ポリシーの管理](https://learn.microsoft.com/power-platform/admin/prevent-data-loss) |
| 環境レベルのデータ ポリシーの作成・編集 | 同上 | **Environment Admin**（Dataverse を含む環境では **System Administrator**） | 同上 |
| マネージド環境の有効化・共有制限の設定 | Power Platform 管理センター / 管理 API | **Power Platform Administrator** または対象環境の **Environment Admin** | [マネージド環境の有効化](https://learn.microsoft.com/power-platform/admin/managed-environment-enable) |
| 環境の作成・削除・容量割り当て | Power Platform 管理センター | **Power Platform Administrator** | [環境の管理](https://learn.microsoft.com/power-platform/admin/environments-administration) |
| 環境設定（機能トグル / Code Apps 許可など） | Power Platform 管理センター（環境設定） | 対象環境の **Environment Admin** | [環境の設定](https://learn.microsoft.com/power-platform/admin/admin-settings) |
| Dataverse のセキュリティ ロール割り当て | Power Platform 管理センター / Dataverse | Dataverse の **System Administrator** | [ユーザーへのロール割り当て](https://learn.microsoft.com/power-platform/admin/assign-security-roles) |
| Dataverse の監査の有効化 | Dataverse（組織設定・テーブル設定） | Dataverse の **System Administrator** | [Dataverse の監査](https://learn.microsoft.com/power-platform/admin/manage-dataverse-auditing) |
| テナント分離 / IP ファイアウォールなどのテナント設定 | Power Platform 管理センター | **Power Platform Administrator** | [テナント分離](https://learn.microsoft.com/power-platform/admin/cross-tenant-restrictions) |
| ライセンス棚卸 | Microsoft Graph / Microsoft 365 管理センター | **Directory Readers** または **Global Reader** + `LicenseAssignment.Read.All` | [subscribedSkus の一覧](https://learn.microsoft.com/graph/api/subscribedsku-list) |
| ライセンス割り当て・解除 | Microsoft Graph / Microsoft 365 管理センター | **License Administrator** + `LicenseAssignment.ReadWrite.All` | [assignLicense](https://learn.microsoft.com/graph/api/user-assignlicense) |
| クラウドユーザー作成 | Microsoft Graph / Microsoft 365 管理センター | **User Administrator** + `User.Create` | [ユーザー作成](https://learn.microsoft.com/graph/api/user-post-users) |
| ユーザー有効化・無効化 | Microsoft Graph / Microsoft 365 管理センター | **User Administrator** + `User.EnableDisableAccount.All` + `User.Read.All` | [ユーザー更新](https://learn.microsoft.com/graph/api/user-update) |
| 非アクティブ候補の棚卸 | Microsoft Graph | レポートを読める管理ロール + `AuditLog.Read.All`、Entra ID P1/P2 | [signInActivity](https://learn.microsoft.com/graph/api/resources/signinactivity) |
| Copilot エージェントの公開・配布 | Microsoft 365 管理センター | **AI Administrator** | [エージェント管理](https://learn.microsoft.com/microsoft-365/admin/manage/manage-agents-integrated-apps) |

## 重要な制約

- **環境管理者はテナント管理者が作成したデータ ポリシーを編集・削除できない。**
  環境レベルのポリシーでテナント全体のポリシーを上書きすることもできない。
- ポリシー変更の反映は**通常 1 時間以内、最大 24 時間**。直後に解消していなくても再評価まで待つ。
- **Advanced connector policies（ACP）は認定コネクタと MCP コネクタのみ**が対象。
  カスタムコネクタ・HTTP コネクタ・Copilot Studio の仮想コネクタは従来のデータ ポリシーで管理する。

## 権限がない場合の進め方

1. `check_environment.py` / `check_dlp.py` は読み取りにも管理者権限が必要なため、
   実行できない場合は**管理者に実行してもらい、出力を共有**してもらう。
2. 変更が必要なときは、`--apply` を付けない dry-run 出力を添えて依頼する
   （何がどう変わるかが確定した状態で依頼できる）。
3. 依頼内容には対象環境 ID・対象ホスト・希望する分類/設定値・想定影響範囲を明記する。
