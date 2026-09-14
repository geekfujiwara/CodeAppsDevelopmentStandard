# Connector action の追加と検証

Copilot Studio v2 の Outlook / Teams connector action は MCP と同じ `botcomponents`
`componenttype=9` に保存されるが、`data.kind` は `ConnectorTool` である。MCP の
`McpTool` write allowlist を緩めて扱ってはいけない。

> **観測状況**: 2026-09-14、USProd の Copilot Studio Preview で実機確認した。
> Save requestを`captureToolSave`で捕捉できるbuildでは、`ConnectorTool`専用contractとしてplan化し、
> 初回投入manifestへ含める。Service Worker等で捕捉できないbuildではwrite contractを推測せず、
> 追加はUI、保存後の検証はDataverse read-backで行う。

## 観測済み read-back 契約

| UI action | kind | connectorId | operationId | authMode |
|---|---|---|---|---|
| Office 365 Outlook: Get emails (V3) | `ConnectorTool` | `shared_office365` | `GetEmailsV3` | `Invoker` |
| Microsoft Teams: List chats | `ConnectorTool` | `shared_teams` | `GetChats` | `Invoker` |

どちらも `connectionReference` が空でないことを必須とする。完全な logical name、connection ID、
bot ID は `.mcp/` だけに保存し、文書、fixture、ログへ記録しない。

## UI 追加

1. 保存済み agent を reload し、Save が `No unsaved changes` であることを確認する。
2. Tools > Add tool > Connectors で操作名を検索する。
3. 読み取り専用操作であることを説明と Microsoft Docs で確認して Add する。
4. `captureToolSave`でSave PUTを非変更捕捉できればplan/hashを作り、初回投入manifestへ含める。
  捕捉できない場合だけUI Saveへfallbackする。
5. `connector_tool_verify.py` で type 9 read-back を完全一致検証する。

```powershell
python scripts/connector_tool_verify.py `
  --connector-id /providers/Microsoft.PowerApps/apis/shared_office365 `
  --operation-id GetEmailsV3

python scripts/connector_tool_verify.py `
  --connector-id /providers/Microsoft.PowerApps/apis/shared_teams `
  --operation-id GetChats
```

`DATAVERSE_URL` と `AGENT_BOTID` を事前に設定する。既知の connection reference がある場合は
`--connection-reference` も指定する。verifier は type 9、`ConnectorTool`、connector、operation、
`Invoker`、非空 connection reference が完全一致する1件だけを許可する。

## Preview の最小データ検証

- Dataverse MCP: aggregate count だけを要求し、row、name、ID を返さない。
- Outlook: 最新1件まで、存在有無、subject、received time だけを要求する。body、preview、address、
  recipient、attachment、ID を返さない。
- Teams: recent chat の件数だけを要求する。topic、message、participant、ID、timestamp を返さない。

ツールカードの表示だけでは成功としない。最終応答が完了し、実データ由来の count または許可した
metadata が返ることを確認する。送信、投稿、作成、更新、削除操作は検証に使わない。

Previewの検証値はchat log全体の`innerText`だけで判定しない。citation番号が直前の数値へ連結され、
例えばcount `7`とcitation `1`が`71`に見えることがある。回答本文の要素とcitation payloadを分離して
確認し、両方が一致した値だけを実測結果として記録する。

## OAuth / consent

既存の有効な Invoker connection が選択された実機検証では、追加時・Preview 実行時とも consent card は
表示されなかった。この場合、同意 API は観測できないため自動化を実装しない。

connection 作成、repair、OAuth、consent card が表示された場合は、利用者が内容を確認できる UI 操作を
維持する。token、Cookie、authorization code、CSRF を capture や plan へ保存してはいけない。安定した
product API、bounded action、明示的な利用者承認を実測できるまで private API で同意を代行しない。

## fail closed

- Save body を捕捉できない: UI Save + read-back に戻す。
- `Maker` auth、connection reference 空、0件、複数件: 公開・Preview を中止する。
- 未観測 operation: operation ID を推測せず UI 追加後に read-back する。
- consent 画面が変化した: 自動クリックせず、接続名、requested permissions、対象 account を確認する。