# Cowork ポータル API 自動化

確認日: 2026-09-11。Cowork プラグインのライフサイクルは次の優先順位で自動化する。

1. Microsoft 365 Agents Toolkit CLI (`atk`)
2. Microsoft Graph v1.0 の Teams app catalog API
3. 観測済み private API（ログイン済み VS Code 統合ブラウザ session から direct fetch）
4. API を実行できない場合だけ VS Code 統合ブラウザでフォーム操作

## ライフサイクル対応表

| 工程 | 正常系 | 備考 |
|---|---|---|
| plugin import/export | `atk import openplugin` / `atk export openplugin` | Agents Toolkit CLI 1.1.12 以上 |
| package/validate | `atk package` | manifest と package の事前検証 |
| 個人テスト | `atk install --file-path ... --scope Personal` | `TitleId` / `AppId` を保存 |
| 組織カタログ一覧 | `manage_agent_package_graph.py list` | Graph v1.0 |
| 組織カタログ新規/更新 | `manage_agent_package_graph.py deploy` | manifest ID を維持し version を増加 |
| OAuth client registration | `GET/POST/PATCH/DELETE /v1.0/oauthconfigurations` | private API、portal Bearer session |
| Agent Registry の Install/Uninstall | `POST /fd/addins/api/apps` | private API、admin browser session |
| Agent Registry の Publish/Finalize | `POST /fd/addins/api/v2/actionableApps` | private API、admin browser session |
| Agent 利用要求の承認 | `POST /fd/addins/api/agentActions/approve` | private API、admin browser session |
| Agent Entra permission の更新 | `POST /fd/addins/api/v2/AgentPermission/update` | private API、admin browser session |
| Frontier 対象者 | `GET/POST /admin/api/settings/company/frontier/access` | private API、admin browser session |

```powershell
# 読み取り専用
python .github/skills/cowork/scripts/manage_agent_package_graph.py list

# dry-run。ZIP の SHA-256 を含む PLAN_HASH を表示
python .github/skills/cowork/scripts/manage_agent_package_graph.py deploy `
  --package <plugin.zip> --requires-review

# 承認済みの同一 ZIP だけを登録/更新
python .github/skills/cowork/scripts/manage_agent_package_graph.py deploy `
  --package <plugin.zip> --requires-review `
  --expected-hash <APPROVED_HASH> --apply
```

Graph の app catalog 登録成功は、M365 Agent Registry で対象ユーザーへ公開されたことを意味しない。
登録/更新、管理者承認、公開対象、Cowork への同期、初回 OAuth 同意、MCP `tools/list`/`tools/call`
を別々に検証する。

## ポータル読み取り API の観測結果

2026-09-11 に VS Code 統合ブラウザで同じ読み取りを2回実行し、endpoint、query parameter 名、
HTTP status の一致を確認した。Developer Portal の build は画面と捕捉通信から取得できなかった。
次の通信はすべて `observed/unsupported` であり、公開 API や再送可能な契約として扱わない。

| 画面 | Method / path | Query parameter 名 | Status |
|---|---|---|---|
| OAuth client registration | `GET https://dev.teams.microsoft.com/cosmicprodamer/v1.0/oauthconfigurations` | `identityProvider` | `200` |
| Apps | `GET https://dev.teams.microsoft.com/amer/api/appdefinitions/my/count` | なし | `200` |
| M365 Agent Registry | `GET https://admin.cloud.microsoft/fd/addins/api/agents` | `limit`, `returnIfCacheIsNotReady`, `scopes`, `sortBy`, `sortOrder`, `workloads` | `200` |
| Agent tools | `GET https://admin.cloud.microsoft/admin/api/agentssettings/agenttools` | なし | `200` |

OAuth registration の list/get/create/update/delete を確認済み。region は `cosmicprodamer` / `apac` / `emea`。
専用 portal client の Device Code 認証は `AADSTS7000218` になるため、CLI へ token を移送せず、ログイン済み
Developer Portal 内から direct API を実行する。package 登録・更新は引き続き Graph v1.0 を正常系とする。

変更は `manage_oauth_registration_api.py` または admin の `manage_m365_portal_api.py` で dry-run し、
`PLAN_HASH` 承認後に `--apply` で `READY_FOR_BROWSER_API` を得る。その plan だけを admin の
`m365_portal_browser_runner.mjs` で送信する。runner は session headers を値を出力せず継承し、
`appManagementRequestID` のpollとAgent detailsのread-backまで実行する。

Agent Registry の実測契約は次のとおり。package登録/更新はGraph、登録後の配布ライフサイクルはprivate APIを正常系にする。

| 工程 | 契約 |
|---|---|
| Install / Uninstall | `/fd/addins/api/apps`、`Command=DEPLOY/UNDEPLOY`、`UserAssignmentDetails` |
| Publish / Finalize | `/fd/addins/api/v2/actionableApps`、`Apps[].Command=APPROVE/FINALIZEPACKAGE` |
| Agent 利用要求の承認 | `/fd/addins/api/agentActions/approve?workload=SharedAgent`、`requestIds[]` |
| Entra permission Grant / Revoke | `/fd/addins/api/v2/AgentPermission/update`、`ActiveDirectoryAppId`、`PermissionRequestData[]` |
| 完了確認 | `/fd/addins/api/deploymentRequestStatus/{requestId}` をpollし、Agent detailsをGET |

`PermissionRequestData[]` は `Type` (`Scope` / `Role`)、`Action` (`Grant` / `Revoke`)、
`ResourceId`、`Scope`、`AppId` の完全な組で送る。利用要求承認とEntra permission更新は別操作としてplanを作る。

Install/Uninstallは成功応答とdetails read-backまで実測済み。Publish/FinalizeとEntra permission更新は
bundle契約の捕捉とrunner契約テストまでで、成功mutationは未実測である。`AppCatalog.ReadWrite.All`を
同意した検証用認証でdisposable packageを登録するか、管理者が検証専用agentを指定するまで、既存agentへ
冪等性未確認のGrant/Revokeを送らない。

## Teams 開発者ポータル通信の調査

OAuth client registration の作成画面は client secret を扱うため、通信本文を保存しない。
ブラウザ上の操作と同じセッションで request event を監視し、origin/path/method、秘密を除いた
フィールド名、response status だけを記録する。Bearer token、Cookie、CSRF token、client secret、
registration ID の実値はチャット、ログ、fixture、SKILL.md に出さない。

次を個別に調査する:

- OAuth registration の list/get/create/update/delete
- registration の organization/app usage restriction
- M365 Agent Registry の list/get/upload/update/publish/disable
- package 内 `agentSkills` と `agentConnectors` の取得結果
- Frontier 対象者と Copilot 機能トグルの get/update

同じ読み取りを2回捕捉して schema が一致するまでは endpoint を固定しない。書き込み通信は
dry-run plan を作り、ユーザーが対象と影響を承認した後にだけ実行する。Cookie/CSRF/Bearer はブラウザ外へ
取り出さず、同一 session の direct API を正常系にする。API が 401/403/404、schema 不一致、read-back
不一致の場合だけフォーム操作へ切り替える。詳細な秘匿化基準は
[admin の M365 テナント管理 API](../../admin/references/m365-tenant-api.md)を参照。

## 公式資料

- [Build plugins for Copilot Cowork](https://learn.microsoft.com/microsoft-365/copilot/cowork/cowork-plugin-development)
- [Publish Agents for Microsoft 365 Copilot](https://learn.microsoft.com/microsoft-365/copilot/extensibility/publish)
- [Publish teamsApp](https://learn.microsoft.com/graph/api/teamsapp-publish)
- [Update teamsApp](https://learn.microsoft.com/graph/api/teamsapp-update)