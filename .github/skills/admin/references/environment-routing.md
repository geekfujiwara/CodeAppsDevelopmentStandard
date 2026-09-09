# 環境ルーティング API と空グループ削除

## 新旧設定を区別する

従来の `listTenantSettings` が返す
`powerPlatform.governance.environmentRoutingTargetEnvironmentGroupId` だけでは、
新しい管理センターのルーティング先を判定できない。
新画面ではテナントの `EnvironmentRouting` ルールセットに、対象ポータルと
最大 25 件の優先順位付きルーティングルールが保存される。両者が異なる場合もある。

管理センターの通信とキャッシュ認証で確認した API（2026-09-09）:

| 用途 | API |
|---|---|
| テナントポリシー取得 | `GET {tenantHost}/governance/tenantRuleBasedPolicies?api-version=2021-10-01-preview` |
| 既存ポリシー更新 | `PATCH {tenantHost}/governance/ruleBasedPolicies/{policyId}?api-version=2021-10-01-preview` |
| グループの関連ポリシー取得 | `GET {tenantHost}/governance/environmentGroups/{groupId}/ruleBasedPolicies?api-version=2021-10-01-preview&includeCustomerContent=true` |
| グループからポリシー割り当て解除 | `DELETE {tenantHost}/governance/ruleBasedPolicies/{policyId}/environmentGroups/{groupId}/assignments?api-version=2021-10-01-preview` |
| 専用ポリシー削除 | `DELETE {tenantHost}/governance/ruleBasedPolicies/{policyId}?api-version=2021-10-01-preview` |
| グループ削除 | `DELETE {tenantHost}/environmentmanagement/environmentGroups/{groupId}?api-version=1` |

`tenantHost` はハイフン除去済みテナント ID の先頭 30 文字と末尾 2 文字を使った
`https://{first30}.{last2}.tenant.api.powerplatform.com`。
認証は `auth_helper.get_session("https://api.powerplatform.com/.default")`。
トークン・Cookie・Authorization ヘッダーを記録しない。

これは管理センターで観測したプレビュー API であり、安定した公開契約とは扱わない。
ルーティング解除 PATCH は Python から実行・読み戻し済み。
グループ削除の DELETE 3 段階は管理センターで実測し、その順序を Python に実装している。
全割り当て取得と削除済みポリシーの 404 は Python でも読み取り検証済み。
Python の削除ライフサイクル全体はモックテスト済みで、実リソースでの通し実行は別ゲート。
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
更新後は `id/name/ruleSets` を API で厳密照合する。サーバーが ruleSet に追加する
`lastModifiedDate` だけは除外し、設定差は拒否する。UI 操作は正常系の完了条件にしない。
保存成功は新しいメーカー環境の自動作成成功を意味しない。既存環境は移動しない。

## グループ割り当ての解除

最後の 1 ルールは管理センターで Delete が無効となる場合がある。
宛先 `None` は `EnvironmentGroup` にゼロ GUID を設定する表現であり、ルール削除ではない。
これはグループ非所属の開発者環境へのルーティングで、自動作成の無効化ではない。
解除依頼が明示されている場合は別グループへ勝手に移行せず、この差分を使う。

```powershell
python .github/skills/admin/scripts/set_environment_routing.py `
  --tenant-id $env:TENANT_ID --rule-name $env:ADMIN_ROUTING_RULE_NAME `
  --source-group-id $env:ADMIN_ROUTING_SOURCE_GROUP_ID `
  --target-group-id 00000000-0000-0000-0000-000000000000 --report-file routing-detach-plan.json

# 解除差分を承認後に実行。計画の上書きや自動承認はしない。
$routingPlan = Get-Content routing-detach-plan.json -Raw | ConvertFrom-Json
python .github/skills/admin/scripts/set_environment_routing.py `
  --tenant-id $env:TENANT_ID --rule-name $env:ADMIN_ROUTING_RULE_NAME `
  --source-group-id $env:ADMIN_ROUTING_SOURCE_GROUP_ID `
  --target-group-id 00000000-0000-0000-0000-000000000000 `
  --expected-hash $routingPlan.expectedHash --report-file routing-detach-result.json --apply
```

対象ポータル・セキュリティグループ・優先順位・従来テナント設定は保持する。
複数ルールが参照する場合は承認されたルールごとに実行する。グループ削除前に全参照を再検査する。
従来設定にも対象グループ参照がある場合は停止する。このコマンドは旧テナント設定を変更しない。

## グループ削除（API 標準フロー）

正常系は **ブラウザ不要の API スクリプト**とする。単純な公開グループ DELETE への再試行ではなく、
上表のテナント API で関連ポリシーを整理してからグループを削除する。
`pac admin delete` / `Remove-AdminPowerAppEnvironment` は環境自体の削除であり使わない。
グループ削除専用の PAC / 管理 PowerShell コマンドは確認した公式一覧には掲載されていない。
公開 DELETE や管理コネクタは、ポリシー整理を含むこのフローの代わりには使わない。

```powershell
python .github/skills/admin/scripts/delete_environment_group.py `
  --tenant-id $env:TENANT_ID --group-id $env:ADMIN_DELETE_GROUP_ID `
  --expected-name $env:ADMIN_DELETE_GROUP_NAME --report-file delete-plan.json

# 関連ポリシーを含む削除計画の承認後に実行
$deletePlan = Get-Content delete-plan.json -Raw | ConvertFrom-Json
python .github/skills/admin/scripts/delete_environment_group.py `
  --tenant-id $env:TENANT_ID --group-id $env:ADMIN_DELETE_GROUP_ID `
  --expected-name $env:ADMIN_DELETE_GROUP_NAME --expected-hash $deletePlan.expectedHash `
  --report-file delete-result.json --apply
```

1. 名前/ID の一致、所属環境 0 件、新旧ルーティング参照 0 件を検査する。
2. 全グループ・全環境・テナントのポリシー割り当てを全ページ取得し、対象グループだけが参照することを確認する。共有・不明・取得失敗は停止する。
3. 関連ポリシー本体と環境所属一覧を含む計画をローカルに保存し、削除範囲の承認と `expectedHash` を要求する。適用直前に再取得し、差があれば書き込まない。
4. 専用ポリシーごとに割り当て DELETE、参照 0 件の再確認、ポリシー DELETE、GET 404 の確認を行う。
5. 空・新旧参照・ポリシー未割り当てを再検査し、グループ DELETE を実行する。
6. API 一覧で対象の消失、他グループの維持、全環境の ID と所属が変更されていないことを検証する。

環境移動・環境削除・共有ポリシー削除は行わない。ルーティング解除は上の別コマンドで実行する。
送信前後の段階をレポートに記録し、403・409・通信切断・読み戻し不一致は自動再試行しない。
部分完了時は API で現状を取得してレビューし直す。ハッシュ照合は原子的ロックではないので同時管理作業を止める。
UI の削除操作に戻ることを正常系とせず、異常時の調査は [troubleshooting.md](troubleshooting.md) を参照する。

## 公式資料

- [環境グループの削除条件とルーティング](https://learn.microsoft.com/en-us/power-platform/admin/environment-groups)
- [公開削除 API](https://learn.microsoft.com/en-us/rest/api/power-platform/environmentmanagement/environment-groups/delete-environment-group)
- [Power Platform for Admins V2](https://learn.microsoft.com/en-us/connectors/powerplatformadminv2/#delete-the-environment-group)
- [PAC admin 一覧](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/admin)
- [管理 PowerShell 一覧](https://learn.microsoft.com/en-us/powershell/module/microsoft.powerapps.administration.powershell/)