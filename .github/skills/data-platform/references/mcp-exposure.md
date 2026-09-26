# MCP 公開

`verify_platform.py --emit-mcp` は、**initialize・tools/list・tools/call がすべて `verified` の基盤だけ**を書き出す。
トークンは含まない。公開先スキルはこのファイルを入力に登録作業を行う。

```json
{
  "foundry-iq": {
    "endpoint": "https://<search>.search.windows.net/knowledgebases/<kb>/mcp?api-version=2026-08-01-preview",
    "tokenKind": "search",
    "tool": "knowledge_base_retrieve",
    "role": "Search Index Data Reader",
    "clientSkills": ["copilot-studio", "ai-teammate"]
  }
}
```

## 基盤ごとの接続

| 基盤 | エンドポイント | トークン audience | 利用者に必要な権限 |
|---|---|---|---|
| Dataverse | `https://{org}.crm.dynamics.com/api/mcp` | Dataverse 組織 URL | セキュリティロール + `allowedmcpclients` |
| Fabric IQ Ontology | `https://api.fabric.microsoft.com/v1/mcp/dataPlane/workspaces/{ws}/items/{ontology}/ontologyEndpoint` | `https://api.fabric.microsoft.com` | workspace / item の閲覧権限 |
| Databricks Genie | `https://{host}/api/2.0/mcp/genie/{space}` | Azure Databricks | Genie space と Unity Catalog の権限 |
| Foundry IQ | `https://{search}.search.windows.net/knowledgebases/{kb}/mcp?api-version=2026-08-01-preview` | `https://search.azure.com` | Search Index Data Reader |

## 公開先

| 公開先 | 手順 | 注意 |
|---|---|---|
| Copilot Studio | [copilot-studio](../../copilot-studio/SKILL.md) / [copilot-studio-v2 の MCP](../../copilot-studio-v2/references/mcp-servers.md) | カスタムコネクタの OAuth audience を上表に合わせる。DLP / ACP を admin スキルで確認 |
| Cowork | [cowork のカスタム MCP コネクタ](../../cowork/references/custom-mcp-connector.md) | Scope を対象 audience の `/.default` にする |
| Foundry Agent | [ai-teammate](../../ai-teammate/SKILL.md) | Foundry IQ は project connection 経由で接続できる |

## 検証の原則

- 公開後は **公開先の実利用者 ID** で E2E を実行する（[テスト計画 §6](test-plan.md#6-e2e-テストmcp-クライアント)）。
- サービスのマネージド ID の権限を利用者本人の権限として扱わない。
- 権限の無い利用者でデータが返らないこと（401 / 403 / `isError`）も確認する。
