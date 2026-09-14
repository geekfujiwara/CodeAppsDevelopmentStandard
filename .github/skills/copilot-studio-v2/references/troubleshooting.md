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
| `Teams channel must be enabled`（set_app_details.py が 404 / ErrorCode 7513） | 作成直後でプロビジョニングが完了しておらず Teams チャネルがまだ張られていない（`deploy_agent.py` の一括実行で頻発）／または Teams + Microsoft 365 チャネルが未有効 | まず `pac copilot list` が **Published / Active / Provisioned** になるのを待って `python set_app_details.py` を単体で再実行する（UI 操作なしで通ることが多い）。それでも 404 なら Copilot Studio UI の「チャネル」で Teams + Microsoft 365 を有効化してから再実行する |
| API 作成した bot が `synchronizationstatus=Provisioning` のまま、editor の Save が `Fix errors to save`、`pac copilot list` に存在しない | Dataverse の `/bots` POST は成功したが、Copilot component の backend provisioning が開始・完了していない | bot configuration の必須キーだけを確認し、欠落がなければその record への tool 追加を中止する。既存 agent を変更せず、対象環境の UI から専用 v2 agent を新規作成する。`pac copilot list` に現れる実体を検証対象にする |
| 公開時 `1 missing connection reference` | MCP サーバー追加後に接続参照が正しくバインドされていない | 対象 MCP サーバーを UI から削除→再追加→再公開（references/mcp-servers.md） |
| 公開後も MCP がエラー | UI の「確認(Confirm)」未実施 | UI で MCP サーバーを **Confirm**（再公開だけでは消えないことがある） |
| **UI の Confirm を押しても接続できない** | 接続参照バインドが古い状態で残っている（新 UI で頻発） | UI で対象 MCP サーバーを削除→再追加 → 再公開 → UI で再 Confirm（references/mcp-servers.md） |
| MCP capture が timeout | Save request の host/path が観測済み契約から変わった、または Save 前に監視を開始していない | API を推測せず停止。統合ブラウザで通信を再観測し、portal build と sanitized method/path/schema を記録する |
| planner が `Unexpected Copilot Studio gateway URL` | gateway host/path/query の drift、または別環境の capture | 対象環境・bot を確認して再捕捉。allowlist を実測なしで緩めない |
| planner が `Capture contains unrelated changes` | MCP 以外の未保存変更が Save body に混入 | agent を reload し、MCP 追加だけを行って再捕捉する |
| planner が `Only Invoker authMode is allowed` | toolがMaker接続として保存され、実行者本人の権限で動く契約になっていない | UIで対象toolを削除し、利用者接続を選び直して`User` / InvokerでAddする。Saveを再捕捉して新しいplan/hashを作る。plan内のauthModeを手修正しない |
| apply が hash mismatch で停止 | 承認後に plan が変更された、または別 plan の hash を指定 | 新しい dry-run を提示し、再承認する。hash を手計算・上書きしない |
| private API が 401 / 403 / 404 | browser session 失効、権限不足、または非公開契約の drift | token を外へ取り出さず同じ profile で再サインイン。解消しなければ UI Save へ fallback |
| `0x80072042 UnmanagedCustomizationsNotAllowed` | Environment Group 等のポリシーがアンマネージド変更を禁止 | 許可された開発環境または管理ソリューション経路を使う。API schema の問題として再試行しない |
| apply 後の read-back が 0件 / 複数件 / 不一致 | 保存未反映、重複、stale connection reference、schema drift | 公開せず停止。UI で対象ツールを確認し、必要なら削除・再追加して新しい capture/hash を作る |
| **設定を更新したら追加済み MCP / connector tool が消えた** | `configuration` を丸ごと上書きしたか、`componenttype eq 9` を名前で絞らずに削除した（どちらのtoolもtype=9） | GET → deep-merge → PATCH にする。スキル削除は `name eq '<SKILL_NAME>'` で絞る。`update_agent.py` を使う（`McpTool` / `ConnectorTool` と接続参照の前後差分で消失を検知）。**恒久対策済み**: `verify_config.assert_intact()` と `update_agent.snapshot_tools()` を正常系で毎回実行 |
| 更新のたびにエージェントが重複作成される | `deploy_agent.py` は `create_agent.py` から始まる | 運用中のエージェントの更新には `update_agent.py` を使う |
| 初期メッセージが `Hello! I'm <名前>. How can I help you today?` のまま | `agentSettings.greetingText` / `conversationStarters` が未設定（既定文が出る） | `agent/prompts.json` を用意して `AGENT_PROMPTS_FILE` を指定し、`python set_prompts.py --file agent/prompts.json` → `publish_agent.py`。新規作成時は `create_agent.py` が自動で取り込む |
| 日本語出力で `UnicodeEncodeError`（cp932） | Windows コンソール既定 | `sys.stdout.reconfigure(encoding="utf-8")` |
| 生成したファイルが UI 上でダウンロードできない | **同じファイル名**で複数回出力すると UI がダウンロードリンクを解決できない | Instructions（システムプロンプト）に「ファイルを出力する際は毎回異なるファイル名にする（例: 日時やUUIDを付与）」を明記する（[SKILL.md](../SKILL.md) の Instructions 設計を参照） |
