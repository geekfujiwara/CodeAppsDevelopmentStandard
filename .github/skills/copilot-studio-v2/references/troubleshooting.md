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
| **UI の Model が「廃止されたモデル」になる** | `agentSettings.model.series` に旧命名（`Sonnet46` / `Sonnet5` / `Opus5`）を指定した | ベンダーのモデル ID 形式（例 `claude-opus-5`）を指定する。既存エージェントは `python set_model.py claude-opus-5` → `publish_agent.py`（[model-series.md](model-series.md)） |
| `Teams channel must be enabled`（set_app_details.py が 404 / ErrorCode 7513） | Teams + Microsoft 365 チャネルが未有効 | Copilot Studio UI の「チャネル」で Teams + Microsoft 365 を有効化してから再実行する |
| 公開時 `1 missing connection reference` | MCP サーバー追加後に接続参照が正しくバインドされていない | 対象 MCP サーバーを UI から削除→再追加→再公開（references/mcp-servers.md） |
| 公開後も MCP がエラー | UI の「確認(Confirm)」未実施 | UI で MCP サーバーを **Confirm**（再公開だけでは消えないことがある） |
| **UI の Confirm を押しても接続できない** | 接続参照バインドが古い状態で残っている（新 UI で頻発） | UI で対象 MCP サーバーを削除→再追加 → 再公開 → UI で再 Confirm（references/mcp-servers.md） |
| **設定を更新したら手動追加した MCP ツールが消えた** | `configuration` を丸ごと上書きしたか、`componenttype eq 9` を名前で絞らずに削除した（MCP ツールも type=9） | GET → deep-merge → PATCH にする。スキル削除は `name eq '<SKILL_NAME>'` で絞る。`update_agent.py` を使う（前後差分で消失を検知）。**恒久対策済み**: `verify_config.assert_intact()` を set_instructions/set_model/set_prompts の PATCH 直前に組み込み済み |
| 更新のたびにエージェントが重複作成される | `deploy_agent.py` は `create_agent.py` から始まる | 運用中のエージェントの更新には `update_agent.py` を使う |
| 初期メッセージが `Hello! I'm <名前>. How can I help you today?` のまま | `agentSettings.greetingText` / `conversationStarters` が未設定（既定文が出る） | `agent/prompts.json` を用意して `AGENT_PROMPTS_FILE` を指定し、`python set_prompts.py --file agent/prompts.json` → `publish_agent.py`。新規作成時は `create_agent.py` が自動で取り込む |
| 日本語出力で `UnicodeEncodeError`（cp932） | Windows コンソール既定 | `sys.stdout.reconfigure(encoding="utf-8")` |
| 生成したファイルが UI 上でダウンロードできない | **同じファイル名**で複数回出力すると UI がダウンロードリンクを解決できない | Instructions（システムプロンプト）に「ファイルを出力する際は毎回異なるファイル名にする（例: 日時やUUIDを付与）」を明記する（[SKILL.md](../SKILL.md) の Instructions 設計を参照） |
