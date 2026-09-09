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
ユーザー提供の検証用ルールと空グループについて、Python だけでルール削除 PATCH →
グループ DELETE 200 → 一覧消失・他グループ維持・全環境所属不変を通し実測済み。
この検証グループの関連ポリシーは 0 件だったため、Python でのポリシー付き削除経路は
モックテストと管理センターの通信実測までであり、通し実行済みとは扱わない。
構造が違う、取得できない、ルーティングポリシーが複数ある場合は推測で更新しない。

## 取得・変更手順

### 全ルーティングを個人開発者グループへ統一する標準フロー

1. `scan_environment_strategy.py` で新旧両方を読み取り、全既存ルールと旧設定の宛先を PSN へ揃えることを提案する。
2. 移行プランと dry-run の差分を提示し、ユーザーの同意を得る。ハッシュだけを同意の代わりにしない。
3. 承認済みハッシュを指定して API 適用する。新ポリシーを PATCH、旧設定は宛先だけの最小差分を POST する。
4. API 再取得で全宛先・他の設定・グループ一覧・全環境所属を比較する。

```powershell
python .github/skills/admin/scripts/scan_environment_strategy.py --tenant-id $env:TENANT_ID --routing-only --report-file routing-scan.json
python .github/skills/admin/scripts/generate_migration_plan.py --scan-file routing-scan.json --output routing-migration-plan.md
python .github/skills/admin/scripts/apply_routing_strategy.py --tenant-id $env:TENANT_ID --report-file routing-plan.json
# 差分と expectedHash を提示し、同意後のみ実行する
python .github/skills/admin/scripts/apply_routing_strategy.py --tenant-id $env:TENANT_ID --report-file routing-result.json --expected-hash <APPROVED_HASH> --apply
python .github/skills/admin/scripts/scan_environment_strategy.py --tenant-id $env:TENANT_ID --routing-only --report-file routing-after.json
```

PSN はブループリントの `code: PSN` の名称とテナントのグループ表示名で一意に解決する。
見つからない、重複する、既存ルールがない場合は停止する。グループやルールの新設は別途承認する。
「すべて」は **全既存ルールの宛先と旧設定の宛先** を意味する。全ユーザーへの拡大・追加ポータル有効化・
優先順位変更・既存環境移動・ACP 変更は含まない。無効なルーティングを暗黙に有効化しない。
`--routing-only` は利用状況・ライセンス・DLP の総合監査ではない。
一括 `apply_environment_strategy.py` はルーティング関連設定を除外し、この承認経路を迂回しない。

旧設定の取得は BAP の `listTenantSettings?api-version=2021-04-01` への POST、更新は
`scopes/admin/updateTenantSettings?api-version=2021-04-01` への POST。
送信する JSON は `powerPlatform.governance.environmentRoutingTargetEnvironmentGroupId` の差分のみ。
認証は `auth_helper.get_session("https://api.bap.microsoft.com/.default")` を使用する。
実テナントで新ルールの None 宛先と旧設定の別グループ宛先を PSN へ統一し、Python API のみで
保存・読み戻し・再スキャンの変更不要判定を検証済み。新規メーカー環境の自動作成は未検証。

### 個別ルールの変更

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

通常は既存ルールの `EnvironmentGroup` だけを変更し、`Portals`、`SecurityGroups`、`Priority`、
他ルールを保持する。明示的な `--delete-rule` は後述の指定ルール削除に使う。
ルール作成・任意の並べ替え・ポータル切り替えは行わない。
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

### 検証用など不要なルール自体を削除する場合

グループ割り当てだけを解除する `None` と、ルール自体の削除は区別する。
ルール削除が承認されている場合は `--delete-rule` を指定する。
`ADMIN_ROUTING_TARGET_GROUP_ID` は未設定にし、`--target-group-id` は渡さない。

```powershell
python .github/skills/admin/scripts/set_environment_routing.py `
  --tenant-id $env:TENANT_ID --rule-name $env:ADMIN_ROUTING_RULE_NAME `
  --source-group-id $env:ADMIN_ROUTING_SOURCE_GROUP_ID `
  --delete-rule --report-file routing-delete-plan.json

# 削除差分の承認後
$routingPlan = Get-Content routing-delete-plan.json -Raw | ConvertFrom-Json
python .github/skills/admin/scripts/set_environment_routing.py `
  --tenant-id $env:TENANT_ID --rule-name $env:ADMIN_ROUTING_RULE_NAME `
  --source-group-id $env:ADMIN_ROUTING_SOURCE_GROUP_ID --delete-rule `
  --expected-hash $routingPlan.expectedHash --report-file routing-delete-result.json --apply
```

ルール名と元グループ ID の完全一致で 1 件だけを除去し、残るルールの相対順序を保持して優先順位を連番化する。
最後の 1 件は削除せず停止する。必要なら承認のうえ `None` へのグループ割り当て解除を使う。
読み戻しで他の設定が計画と一致したことを確認してから、次のグループ削除へ進む。

### 空グループを削除する

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
関連ポリシーが 0 件ならポリシー整理はスキップする。検証のためだけにポリシーを作成しない。
送信前後の段階をレポートに記録し、403・409・通信切断・読み戻し不一致は自動再試行しない。
部分完了時は API で現状を取得してレビューし直す。ハッシュ照合は原子的ロックではないので同時管理作業を止める。
UI の削除操作に戻ることを正常系とせず、異常時の調査は [troubleshooting.md](troubleshooting.md) を参照する。

## 公式資料

- [環境グループの削除条件とルーティング](https://learn.microsoft.com/en-us/power-platform/admin/environment-groups)
- [公開削除 API](https://learn.microsoft.com/en-us/rest/api/power-platform/environmentmanagement/environment-groups/delete-environment-group)
- [Power Platform for Admins V2](https://learn.microsoft.com/en-us/connectors/powerplatformadminv2/#delete-the-environment-group)
- [PAC admin 一覧](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/admin)
- [管理 PowerShell 一覧](https://learn.microsoft.com/en-us/powershell/module/microsoft.powerapps.administration.powershell/)