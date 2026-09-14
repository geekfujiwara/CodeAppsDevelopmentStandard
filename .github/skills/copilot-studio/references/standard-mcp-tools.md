# Standard agent MCP tool provisioning

確認日: 2026-09-14。Standard agent の MCP tool は、Copilot Studio UI が生成する gateway PUT を
承認付きで通過させ、Dataverse の component read-backまで自動化する。

## 観測済みcontract

```text
PUT https://{region}.gateway.prod.island.powerapps.com/
  api/botmanagement/v1/environments/{environmentId}/bots/{botId}/content/botcomponents
```

Standard agent は v2 の `McpTool` contractとは異なり、次の階層を使う。

```text
DialogComponent
  TaskDialog
    InvokeExternalAgentTaskAction
      ModelContextProtocolMetadata
```

同じPUTに `BotComponentInsert` と `ConnectionReferenceInsert` を1件ずつ含める。
接続は `ConnectionProperties.mode=Invoker` のみ許可する。connector tool、knowledge、triggerは
このcontractへ推測で追加しない。それぞれ正常なUI requestを別に捕捉する。

## Capture、承認、apply

1. VS Code統合ブラウザで対象Standard agentのToolsを開く。
2. `captureStandardToolSave()`へ、MCP選択からAddまでのcallbackと、Cancel/Leave callbackを渡す。
3. `standard_tool_plan.py`でplanを作り、target、connector、operation、display nameとhashを提示する。
4. 承認後、`runApprovedPlan()`へ同じUI操作callbackを渡す。
5. runnerはUIが生成したfresh requestを再検証し、approval hash一致時だけ送信する。
6. componenttype 9を読み戻し、schema、operation、connection referenceが一致する1件を確認する。

```powershell
python scripts/standard_tool_plan.py `
  .mcp/copilot-standard-mcp-capture.json `
  --plan-file .mcp/copilot-standard-mcp-plan.json
```

```javascript
import {
  captureStandardToolSave,
  runApprovedPlan,
} from "./scripts/standard_tool_browser_runner.mjs";

await captureStandardToolSave(
  page,
  ".mcp/copilot-standard-mcp-capture.json",
  stageAndAddMcp,
  cancelAndLeave,
);

const result = await runApprovedPlan(
  page,
  ".mcp/copilot-standard-mcp-plan.json",
  approvedHash,
  stageAndAddMcp,
  cancelAndLeave,
  ".mcp/copilot-standard-mcp-report.json",
);
```

`stageAndAddMcp`はAdd buttonがenabledになるまで待ってからclickする。disabled中のclickをqueueしない。
`cancelAndLeave`は失敗表示のCancelと確認dialogのLeaveを完了させる。runnerはcallback完了までrouteを
解除しないため、UIの自動retryや遅延送信を遮断できる。

## Approval hash

`changeToken`と新規`ConnectionReference.id`は同じ操作でも毎回再生成される。approval hashではこの2値だけを
runtime placeholderへ正規化する。実送信時はchange tokenが非空、IDがGUIDであることを検証する。
connector、operation、connection ID/reference、component schema/display name、target、その他payloadは
すべてhash対象であり、変更時は送信をabortする。

保存済みpayloadを後から直接PUTしてはならない。change tokenが陳腐化するため、apply時は必ずUIにfresh
requestを生成させ、`releaseApprovedToolSave()`でintentを再検証して通過させる。

## 実測結果

USProdの使い捨てStandard agentでWork IQ Mail MCPを検証した。

- approval hash一致後のPUT: HTTP 200
- Tools一覧: Model Context Protocol 1件、Enabled=On
- Dataverse read-back: componenttype 9、exact match 1件
- data: `TaskDialog`、`InvokeExternalAgentTaskAction`、`ModelContextProtocolMetadata`、Invoker
- 公開とMCP runtime tool callは実行していない

検証後はtoolをUIから削除し、UI一覧とDataverse read-backの両方で0件を確認する。