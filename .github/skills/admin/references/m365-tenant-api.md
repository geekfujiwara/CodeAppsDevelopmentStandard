# Microsoft 365 テナント管理 API

確認日: 2026-09-11。公開 API は Microsoft Graph v1.0 を最優先する。公開 API がない操作は、
観測済み private API をログイン済み統合ブラウザ session から直接呼ぶ。フォーム操作は API 失敗時だけ使う。

## API 対応表

| 操作 | 正常系 | 最小権限の目安 | 状態 |
|---|---|---|---|
| 契約 SKU と空き数 | `GET /subscribedSkus` | `LicenseAssignment.Read.All` | 公開 Graph v1.0 |
| ユーザー別ライセンス棚卸 | `GET /users?$select=assignedLicenses,...` | `User.Read.All` | 公開 Graph v1.0 |
| 非アクティブ候補 | `GET /users?$select=signInActivity,...` | `AuditLog.Read.All` + Entra ID P1/P2 | 公開 Graph v1.0 |
| M365 サービス利用状況 | `GET /reports/getOffice365ActiveUserDetail(period='D180')` | `Reports.Read.All` | 公開 Graph v1.0 |
| ユーザー作成 | `POST /users` | `User.Create` | 公開 Graph v1.0 |
| 有効化・無効化 | `PATCH /users/{id}` の `accountEnabled` | `User.EnableDisableAccount.All` + `User.Read.All` | 公開 Graph v1.0 |
| ライセンス付与・解除 | `POST /users/{id}/assignLicense` | `LicenseAssignment.ReadWrite.All` + License Administrator 等 | 公開 Graph v1.0 |
| 組織アプリ/エージェント取得 | `GET /appCatalogs/teamsApps` | `AppCatalog.Read.All` | 公開 Graph v1.0 |
| M365 app package の登録・更新 | `POST /appCatalogs/teamsApps[/{id}/appDefinitions]` | `AppCatalog.ReadWrite.All` | 公開 Graph v1.0、委任のみ |
| Agent Registry の公開対象・Install 設定 | `POST /fd/addins/api/availableAgents` | `AI Administrator` | private API、browser session |
| MCP コネクターの Registry 表示・公開対象 | M365 管理センター | `AI Administrator` | 読み取り通信のみ `observed/unsupported` |
| Frontier 対象者の有効化 | `GET/POST /admin/api/settings/company/frontier/access` | 製品画面で確認 | private API、browser session |
| Copilot メニューのプレビュー機能 | Copilot 管理画面 | 製品画面で確認 | 読み取り通信のみ `observed/unsupported` |

`signInActivity.lastSuccessfulSignInDateTime` は成功した対話/非対話サインインの最終日時を示す。
値がないユーザーを自動削除・無効化しない。新規、サービス、共有、緊急アクセスアカウントを除外し、
M365 利用状況レポートと所有者確認を加えて候補を確定する。

## CLI

```powershell
# 読み取り専用。詳細には個人情報を含むため report はアクセス制御された場所へ出力する
python .github/skills/admin/scripts/manage_m365_users.py inventory `
  --inactive-days 90 --report-file m365-inventory.json

# 変更は必ず dry-run の PLAN_HASH を承認してから適用
python .github/skills/admin/scripts/manage_m365_users.py license `
  --user user@example.com --add-sku <SKU_PART_NUMBER>
python .github/skills/admin/scripts/manage_m365_users.py license `
  --user user@example.com --add-sku <SKU_PART_NUMBER> `
  --expected-hash <APPROVED_HASH> --apply

python .github/skills/admin/scripts/manage_m365_users.py account `
  --user user@example.com --enabled false
```

新規ユーザーの一時パスワードは引数やファイルへ書かず、実行プロセスの
`M365_NEW_USER_PASSWORD` 環境変数からだけ渡す。出力・plan 表示では必ず伏せる。

## M365 Agents 管理センターの観測結果

2026-09-11、`https://admin.cloud.microsoft/?#/agents/`、admin-main build `2026.9.3.7` で
同じ読み取りを2回実行し、次の request metadata と HTTP status が一致した。公開契約ではないため
`observed/private` とし、origin/path/method/schema allowlist、承認 hash、read-back を必須にする。

| 画面 | Method / path | Query parameter 名 | Status |
|---|---|---|---|
| Registry | `GET /fd/addins/api/agents` | `limit`, `returnIfCacheIsNotReady`, `scopes`, `sortBy`, `sortOrder`, `workloads` | `200` |
| Registry | `GET /admin/api/agents/actionsconfig` | なし | `200` |
| Registry | `GET /admin/api/agents/eligibilityconfig` | なし | `200` |
| Agent preferences | `GET /admin/api/agentmanagement/preferences` | なし | `200` |
| Requests / Local agents Frontier | `GET /admin/api/copilotsettings/settings` | なし | `200` |
| Copilot preferences | `GET /admin/api/copilot/getPreferences` | なし | `200` |
| Tools | `GET /admin/api/agentssettings/agenttools` | なし | `200` |
| Tools pending requests | `GET /admin/api/agentssettings/titles/requests/pending` | なし | `200` |
| Power Platform resource query | `POST https://<tenant-region>.tenant.api.powerplatform.com/resourcequery/resources/query` | `api-version` | `200` |

書き込みは `POST /admin/api/settings/company/frontier/access` と
`POST /fd/addins/api/availableAgents?botId=...&environmentId=...` を確認済み。後者は locale/market、
`WorkloadManagementList`、`SendEmailToUsers` を受ける。ID は GET inventory から解決し、文書へ固定しない。

```powershell
python .github/skills/admin/scripts/manage_m365_portal_api.py frontier-access `
  --payload-file frontier-plan.json
# 承認後、同じ入力に --expected-hash <APPROVED_HASH> --apply
```

`READY_FOR_BROWSER_API` の plan だけを VS Code 統合ブラウザで direct `fetch` し、`readBack` を再取得して
対象状態を照合する。401/403/404、schema 不一致、read-back 不一致なら停止し、フォーム操作を選択肢として提示する。

## 非公開 API の捕捉基準

公開 API がない操作は VS Code 統合ブラウザだけで調査する。Playwright MCP サーバーや単体
Playwright は使わない。画面を開く前に使用プロファイルを確認し、サインインはユーザーが直接行う。

記録してよい項目:

- 確認日時、画面 URL、操作名、portal build/version
- request の origin、path、query parameter の名前、HTTP method
- request/response JSON のフィールド名と型、HTTP status、correlation ID
- 必要な token audience と管理ロール。token 値そのものは記録しない

記録禁止:

- `Authorization`、Cookie、CSRF token、client secret、password
- UPN、氏名、テナント ID、実 GUID、応答本文中の業務データ
- 署名付き URL と preauthenticated download URL

採用条件は、同じ読み取り操作を2回実行して endpoint と schema が一致し、公開 API がないことを
Learn で確認し、秘密情報を除いた fixture で契約テストを作れること。Cookie/CSRF に依存する通信は
ログイン済み統合ブラウザ内の direct API を正常系とし、token/Cookie を外へ取り出さない。非公開 API は
`observed/private`、確認日、portal build を併記し、変更系は dry-run、影響範囲、承認ハッシュ、
read-back を必須にする。画面 click/form 操作は direct API を実行できない場合だけ使う。

## 公式資料

- [List subscribedSkus](https://learn.microsoft.com/graph/api/subscribedsku-list)
- [Assign license](https://learn.microsoft.com/graph/api/user-assignlicense)
- [List users](https://learn.microsoft.com/graph/api/user-list)
- [Create user](https://learn.microsoft.com/graph/api/user-post-users)
- [Update user](https://learn.microsoft.com/graph/api/user-update)
- [Publish teamsApp](https://learn.microsoft.com/graph/api/teamsapp-publish)
- [Update teamsApp](https://learn.microsoft.com/graph/api/teamsapp-update)