# 初回ツールと接続参照を承認付き private API で追加する

Copilot Studio v2 (`cliagent`) の MCP / ConnectorTool 追加は、UI の Save が送る PVA gateway change-set を
ブラウザで捕捉し、dry-run、承認、同一セッションでの apply、Dataverse read-back の順で行う。
botcomponent を Dataverse Web API へ直接 INSERT してはいけない。UI が生成する
`DialogComponent` と `ConnectionReferenceInsert` を一体で保存する必要がある。

> **API の位置付け**: 2026-09-14、Copilot Studio shell release `2026.09.03.1` で実機観測した
> private/unsupported API。Microsoft の公開契約ではない。host/path/schema が変わったら
> fail closed とし、再捕捉するまで UI 操作へ戻す。

## 観測済み契約

| 工程 | method / path | 成功条件 |
|---|---|---|
| 接続作成 | `PUT https://{environment-host}/connectivity/connectors/{connector}/connections/{id}?api-version=1` | 201、その後の接続一覧 GET が 200 |
| ツール保存 | `PUT https://{pva-gateway}/api/botmanagement/v1/environments/{environmentId}/bots/{botId}/content/botcomponents?includeWorkflows=true` | 200 |
| 読み戻し | Dataverse `GET /api/data/v9.2/botcomponents`、親 bot + componenttype 9 で限定 | tool kind / connector / operation / connectionReference が完全一致 |

Save body の必須部分は次の構造である。実値の ID や完全な bot payload を文書・fixture・Git に
保存しない。

```text
botComponentChanges[0]
  $kind = BotComponentInsert
  component.$kind = DialogComponent
  component.dialog.$kind = McpTool または ConnectorTool
  component.dialog.connectorId / operationId / connectionReference / authMode
connectionReferenceChanges[0]
  $kind = ConnectionReferenceInsert
  connectionReference.$kind = ConnectionReference
  connectorId / connectionId / connectionReferenceLogicalName
bot.cdsBotId
```

`cloudFlowDefinitionChanges`、`connectorDefinitionChanges`、`environmentVariableChanges`、
AI model、connected agent、Dataverse search 等の change 配列は空でなければならない。
別の未保存変更が混ざっていれば planner は拒否する。

## 前提

- [ブラウザ自動化方針](../../standard/references/browser-automation.md)に従い、最初に Edge profile と
  対象環境、対象 agent、connector / operation、接続作成の可否を一度だけ確認する。
- VS Code 統合ブラウザだけを使う。別ブラウザ、Playwright のインストール、token の外部取得は行わない。
- 対象 agent は保存済みで、追加対象 connector の接続が環境に存在すること。
- 実行中は同じ page / browser context / profile を維持する。
- `.mcp/` は Git 対象外である。capture、plan、report は必ずこのディレクトリへ置く。

## 1. 接続を用意する

Tools > Add tool > Model Context Protocol (MCP) で対象サーバーを選ぶ。接続が無ければ UI の
**Create new connection** から作る。OAuth、同意、接続修復は UI で行い、資格情報を API plan に
含めない。接続作成後、いったん Add dialog を閉じてもよい。

自前 MCP Server は [mcp-server スキルの登録手順](../../mcp-server/references/copilot-studio-registration.md)
で connector を作る。Server name は英字・数字・ハイフン・ドットだけにする。`AADSTS50011` の場合は
表示された Redirect URI を Entra app へ登録してから接続を作り直す。

## 2. Save PUT を変更なしで捕捉する

1. agent を reload し、他の未保存変更がないことを確認する。
2. `mcp_tool_browser_runner.mjs` の `captureToolSave(page, capturePath, stageAndSave)` を使う。
3. callback 内で Add tool から対象 MCP と接続を選び、Addする。tool編集dialogが開くbuildでは
  MCP toolsのloading完了を待ってConfirmし、Saveがenabledになったことを確認してからSaveする。
4. helper は対象 gateway PUT を捕捉して `route.abort()` する。サーバーは変更されない。
5. Save 失敗表示は捕捉のために意図したものなので、agent を reload してローカル編集を破棄する。

helper が保存するのは method、URL、request JSON body だけである。`Authorization`、Cookie、CSRF、
session header、response business data は取得・記録・返却しない。

## 3. plan と PLAN_HASH を作る

```powershell
python .github/skills/copilot-studio-v2/scripts/mcp_tool_plan.py `
  .mcp/mcp-capture.json --plan-file .mcp/mcp-plan.json
```

planner は次を検証する。

- HTTPS の `*.gateway.prod.island.powerapps.com` と観測済み path/query だけである
- URL の environment / bot と `bot.cdsBotId` が一致する
- change-set が `BotComponentInsert` 1件と `ConnectionReferenceInsert` 1件である
- connector、operation、connection ID、connection reference が相互一致する
- tool kind が `McpTool` または `ConnectorTool`、`authMode` が `Invoker` である
- 他の change 配列が空である

出力された `expectedHash` と、connector、operation、対象 environment / bot、display name を提示して
ユーザー承認を得る。plan 全文には完全な bot payload が含まれるため、チャットやログへ貼らない。

## 4. 初回投入 manifest を作る

承認した各planのpathとhashを指定する。同一environment / botではないplan、重複する
connector / operation、hash不一致が1件でもあればmanifestを作らない。

```powershell
python .github/skills/copilot-studio-v2/scripts/create_initial_tools_manifest.py `
  --approval .mcp/dataverse-plan.json=<approved-hash> `
  --approval .mcp/outlook-plan.json=<approved-hash> `
  --approval .mcp/teams-plan.json=<approved-hash> `
  --output .mcp/initial-tools.json
```

## 5. 同一ブラウザセッションで一括 apply する

`runInitialToolProvisioning(page, manifestPath, reportPath)`へmanifestを渡す。runnerはbrowserに触れる前に
全planのcanonical SHA-256、target、重複、change-setを検証する。1件でも不一致ならgateway requestを
1件も送らない。単一toolの後方互換APIは`runApprovedPlan`である。

この関数はbrowser内のJavaScriptではなく、VS Code統合ブラウザの`page`を保持するNode.js側の
automation hostで呼び出す。新しいbrowser/profileを起動せず、capture時と同じ`page`を渡す。

```javascript
import { runInitialToolProvisioning } from "./scripts/mcp_tool_browser_runner.mjs";

const result = await runInitialToolProvisioning(
  page,
  ".mcp/initial-tools.json",
  ".mcp/initial-tools-report.json",
);
```

戻り値とreportはstatus、connectorId、operationId、write/read-back statusだけを含み、header値、token、
Cookie、業務データを含まない。`status=verified`かつ全toolが`added-verified`または`already-present`に
なるまで公開しない。

runner は reload 時の gateway / Dataverse request から必要な header だけをメモリ内で継承する。
値はログ、戻り値、plan に出さない。apply 前に exact tool を読み戻し、すでに1件あれば
`already-present` として PUT を省略する。0件の場合だけ PUT し、直後に再読込する。

成功結果は次のいずれかだけである。

```json
{"status":"already-present","writeStatus":null,"readBackStatus":200}
{"status":"added-verified","writeStatus":200,"readBackStatus":200}
```

reload 後に Tools 一覧でも全toolが表示されることを確認し、agent を再公開する。runtime の認可と
実データ範囲は Preview の golden question で別途検証する。

## 6. fail closed と UI fallback

次の場合は自動補正や推測をせず、書き込みを停止する。

| 症状 | 対処 |
|---|---|
| 401 / 403、認証 request を捕捉できない | 同じ profile で再サインイン。token を CLI へ移さない |
| 404、gateway host/path/query 不一致 | portal build を記録し、UI 通信を再捕捉する |
| schema drift、他 change の混入 | reload して MCP だけを編集。解消しなければ UI Save を使う |
| `0x80072042 UnmanagedCustomizationsNotAllowed` | 管理ポリシーに従う。許可環境へ切替えるか管理ソリューション経路を使う |
| read-back 0件 / 複数件 / connection reference 不一致 | 公開しない。UI で削除・再追加し、再捕捉する |
| stale connection / OAuth error | UI で接続を修復し、新しい capture と hash を作る |
| planner が `Only Invoker authMode is allowed` | UI で対象toolを削除し、利用者接続を選び直して `User` / Invoker でAddする。新しいcaptureとhashを作り、Maker modeをplan改変で回避しない |
| Add後もSaveが`Fix errors to save` | tool編集dialogのMCP toolsがloading中、またはConfirm未完了の可能性がある。loading完了→Inputs確認→Confirmの順で完了させる。それでも無効ならtoolを外してagent本体のprovisioningを切り分ける |

fallback の UI 手順は、Add tool > MCP > server > connection > Add > Save である。必要な画面に
Confirm が表示される build では Confirm も実行する。API plan を手修正して schema drift を回避しては
ならない。

## セキュリティ規約

- 記録可: method、sanitized host/path、query key、JSON field 名と型、HTTP status、portal build、確認日。
- 記録禁止: Bearer token、Cookie、CSRF、session header 値、secret、UPN、実 tenant/environment/bot/
  connection ID、業務データ。
- 実 ID を含む `.mcp/` はローカル一時物として扱い、PR、issue、テスト fixture に含めない。
- plan hash は変更承認であり、公開 API のサポート保証ではない。