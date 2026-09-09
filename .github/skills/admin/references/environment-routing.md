# 環境ルーティング API と空グループ削除

## 新旧設定を区別する

従来の `listTenantSettings` が返す
`powerPlatform.governance.environmentRoutingTargetEnvironmentGroupId` だけでは、
新しい管理センターのルーティング先を判定できない。
新画面ではテナントの `EnvironmentRouting` ルールセットに、対象ポータルと
最大 25 件の優先順位付きルーティングルールが保存される。両者が異なる場合もある。

ブラウザ通信とキャッシュ認証での GET を確認した API（2026-09-09）:

| 用途 | API |
|---|---|
| テナントポリシー取得 | `GET {tenantHost}/governance/tenantRuleBasedPolicies?api-version=2021-10-01-preview` |
| 既存ポリシー更新 | `PATCH {tenantHost}/governance/ruleBasedPolicies/{policyId}?api-version=2021-10-01-preview` |

`tenantHost` はハイフン除去済みテナント ID の先頭 30 文字と末尾 2 文字を使った
`https://{first30}.{last2}.tenant.api.powerplatform.com`。
認証は `auth_helper.get_session("https://api.powerplatform.com/.default")`。
トークン・Cookie・Authorization ヘッダーを記録しない。

これは管理センターで観測したプレビュー API であり、安定した公開契約とは扱わない。
GET は実測済み。PATCH の形式はブラウザの保存要求を送信前に遮断して採取したもの。
各テナントの更新成功は、承認後の PATCH と読み戻しで別途検証する。
構造が違う、取得できない、ルーティングポリシーが複数ある場合は推測で更新しない。

## 取得・変更手順

```powershell
python .github/skills/admin/scripts/set_environment_routing.py `
  --tenant-id $env:TENANT_ID --report-file routing-current.json

python .github/skills/admin/scripts/set_environment_routing.py `
  --tenant-id $env:TENANT_ID `
  --rule-name $env:ADMIN_ROUTING_RULE_NAME `
  --source-group-id $env:ADMIN_ROUTING_SOURCE_GROUP_ID `
  --target-group-id $env:ADMIN_ROUTING_TARGET_GROUP_ID `
  --report-file routing-plan.json
```

レポートのルール名・セキュリティグループ・元/先グループ・優先順位・対象ポータルを提示し、
**移行先の承認をチャットで得る**。グループ削除の承認だけで移行先を勝手に選ばない。
承認後に同じ引数へ `--apply --expected-hash <expectedHash>` を追加し、別名の結果ファイルを指定する。

スクリプトは既存ルールの `EnvironmentGroup` だけを変更する。ルール作成・削除・並べ替え・
ポータル切り替えは行わない。`Portals`、`SecurityGroups`、`Priority`、他ルールを保持する。
送信直前に読み直してレビュー時点のハッシュと照合し、変化していれば PATCH 前に停止する。
API による原子的な同時更新防止は未確認なので、適用中は他管理者の編集を止める。
更新後は `id/name/ruleSets` を厳密照合し、UI の再読み込みでも確認する。
保存成功は新しいメーカー環境の自動作成成功を意味しない。既存環境は移動しない。

## グループ削除

公開 API は `DELETE https://api.powerplatform.com/environmentmanagement/environmentGroups/{groupId}?api-version=2024-10-01`。
`pac admin delete` / `Remove-AdminPowerAppEnvironment` は環境自体の削除であり使わない。
グループ削除専用の PAC / 管理 PowerShell コマンドは確認した公式一覧には掲載されていない。
Power Platform for Admins V2 の `DeleteEnvironmentGroup` アクションも利用候補となる。

```powershell
python .github/skills/admin/scripts/delete_environment_group.py `
  --tenant-id $env:TENANT_ID --group-id $env:ADMIN_DELETE_GROUP_ID `
  --expected-name $env:ADMIN_DELETE_GROUP_NAME --report-file delete-plan.json
```

削除承認後に同じ引数へ `--apply` を追加し、別名の結果ファイルを指定する。
毎回、名前/ID の一致・全ページの所属環境・従来設定の参照・新ルーティングルールの参照を確認する。
取得失敗を「空」とみなさない。削除後は一覧からの消失を検証する。
このコマンドは環境移動・環境削除・ポリシー削除・割り当て解除を自動実行しない。

空かつ非ルーティングでも、公開 API が HTTP 400、本文 `Conflict` を返す場合がある。
相関 ID をローカルレポートに保存し、無条件リトライや推測によるポリシー削除はしない。
管理センターの削除処理ではグループポリシー割り当て API の通信も観測されている。
URL の観測だけではメソッド・意味・安全な解除条件が確定しないため、解除コードを推測しない。

削除が承認済みなら [ブラウザ自動化方針](../../standard/references/browser-automation.md) に従い、
選択済みプロファイルの VS Code 統合ブラウザで Manage > Environment groups の対象行を選択し、
`Delete group` を実行する。**確認ダイアログなしに削除が開始される場合がある**。
行の選択要素は `radio`、グループ名は `button` の場合があるため、実際の snapshot を確認する。
削除通知だけでなく管理 API の一覧を再取得して完了を確かめる。

## 公式資料

- [環境グループの削除条件とルーティング](https://learn.microsoft.com/en-us/power-platform/admin/environment-groups)
- [公開削除 API](https://learn.microsoft.com/en-us/rest/api/power-platform/environmentmanagement/environment-groups/delete-environment-group)
- [Power Platform for Admins V2](https://learn.microsoft.com/en-us/connectors/powerplatformadminv2/#delete-the-environment-group)
- [PAC admin 一覧](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/admin)
- [管理 PowerShell 一覧](https://learn.microsoft.com/en-us/powershell/module/microsoft.powerapps.administration.powershell/)