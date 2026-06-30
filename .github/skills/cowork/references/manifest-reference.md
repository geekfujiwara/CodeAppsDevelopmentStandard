# Cowork manifest.json リファレンス

[SKILL.md](../SKILL.md) の Step 6 で作成する M365 アプリパッケージ manifest.json の完全テンプレートと注意点。

```jsonc
{
  "$schema": "https://developer.microsoft.com/json-schemas/teams/v1.28/MicrosoftTeams.schema.json",
  "manifestVersion": "1.28",
  "version": "1.0.0",
  "id": "<決定的GUID: uuid5 から生成>",
  "developer": { "name": "...", "websiteUrl": "...", "privacyUrl": "...", "termsOfUseUrl": "..." },
  "name": { "short": "...", "full": "..." },
  "description": { "short": "...", "full": "..." },
  "icons": { "color": "color.png", "outline": "outline.png" },
  "accentColor": "#D5001C",
  "agentSkills": [ { "folder": "./skills/<skill-name>" } ],
  "agentConnectors": [
    {
      "id": "dataverse-mcp",
      "displayName": "Dataverse MCP",
      "description": "Dataverse のテーブル/レコードへ MCP 経由でアクセス。",
      "toolSource": {
        "remoteMcpServer": {
          "mcpServerUrl": "https://<org>.crm.dynamics.com/api/mcp",
          "mcpToolDescription": { "file": "dataverse-mcp-tools.json" },
          "authorization": {
            "type": "OAuthPluginVault",
            "referenceId": "<Step 5 の OAuth registration ID（.env の COWORK_OAUTH_REGISTRATION_ID）>"
          }
        }
      }
    }
  ]
}
```

- `id` は `python -c "import uuid; print(uuid.uuid5(uuid.NAMESPACE_URL, '<安定URL>'))"` で決定的に生成。
- **`mcpToolDescription` は必須**（公式 docs の例は省略しているが、M365 管理センターのアップロード検証が必須化）。
  値は **オブジェクト `{ "file": "<相対パス>" }`**（文字列不可）。参照先ファイルは **JSON 形式の tools 定義**でなければ
  `is invalid or not found in manifest package` になる（`.md` は invalid）。

  `dataverse-mcp-tools.json`（パッケージルートに配置）:
  ```json
  {
    "tools": [
      { "name": "read_query", "description": "FetchXML クエリでレコード取得。",
        "annotations": { "readOnlyHint": true, "title": "Read Query" } },
      { "name": "search_data", "description": "テーブル内を条件検索。",
        "annotations": { "readOnlyHint": true, "title": "Search Data" } },
      { "name": "search", "description": "Dataverse 全体を横断検索。",
        "annotations": { "readOnlyHint": true, "title": "Search" } },
      { "name": "describe", "description": "テーブル/列のメタデータを取得。",
        "annotations": { "readOnlyHint": true, "title": "Describe" } }
    ]
  }
  ```
- アイコンは `generate_icon_png.py`（standard/scripts）の `draw_agent_icon(192...)` / `draw_agent_icon(32, transparent_bg=True, outline_only=True)` で生成可。
