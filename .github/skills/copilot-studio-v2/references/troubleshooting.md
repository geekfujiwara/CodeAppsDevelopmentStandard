# copilot-studio-v2 — 異常系・よくあるエラー

新アーキテクチャ（cliagent）でのデプロイ・公開時に遭遇しやすいエラーと対処。
正常系の手順は [SKILL.md](../SKILL.md) を参照。

## よくあるエラー

| 症状 | 原因 | 対処 |
|---|---|---|
| `0x8004023b "Connection State is closed"` | Bot プロビジョニング直後で認可セッション未確立 | 数秒待って **リトライ**（一時エラー） |
| `undeclared property 'parentbotcomponentid'` | 親ナビ名が誤り | `ParentBotComponentId`（Pascalケース）を使う |
| `bot $select` で 400 | 新アーキに存在しない列を指定 | 全列取得してから必要列をフィルタ |
| `0x80040265`（bots 更新不可） | PATCH に `name` 列を含めていない | アイコン等の PATCH でも `name` を同送 |
| 公開時 `1 missing connection reference` | MCP サーバー追加後に接続参照が正しくバインドされていない | 対象 MCP サーバーを UI から削除→再追加→再公開（references/mcp-servers.md） |
| 公開後も MCP がエラー | UI の「確認(Confirm)」未実施 | UI で MCP サーバーを **Confirm**（再公開だけでは消えないことがある） |
| **UI の Confirm を押しても接続できない** | 接続参照バインドが古い状態で残っている（新 UI で頻発） | UI で対象 MCP サーバーを削除→再追加 → 再公開 → UI で再 Confirm（references/mcp-servers.md） |
| 日本語出力で `UnicodeEncodeError`（cp932） | Windows コンソール既定 | `sys.stdout.reconfigure(encoding="utf-8")` |
