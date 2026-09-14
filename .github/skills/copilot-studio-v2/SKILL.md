---
name: copilot-studio-v2
description: "Copilot Studio の「全く新しいアーキテクチャ」（cliagent テンプレート）を開発標準の第一候補として構築・公開・連携する。Bot 作成、Instructions/モデル/メモリ、フラット Python スキル、アイコン、公開に加え、ブラウザで観測した private API による承認付き初回ツール・接続参照追加、Code Apps iframe、Agent flows を扱う。"
category: automation
triggers:
  - "Copilot Studio v2"
  - "新しいアーキテクチャ"
  - "全く新しいアーキテクチャ"
  - "cliagent"
  - "CLICopilotRecognizer"
  - "エージェント自動構築"
  - "API でエージェント作成"
  - "コードファースト エージェント"
  - "フラットスキル"
  - "Python スキル"
  - "InlineAgentSkill"
  - "スキルバンドル"
  - "BotConfiguration"
  - "agentSettings"
  - "enableMemory"
  - "モデルは廃止されました"
  - "claude-opus-5"
  - "エージェント v2"
  - "エージェント アイコン"
  - "Dataverse MCP"
  - "ConnectorTool"
  - "接続参照追加"
  - "初回ツール投入"
  - "Work IQ"
  - "Web app iframe"
  - "Code Apps 埋め込み"
  - "Agent flows"
  - "Agent node"
  - "Dataverse トリガー"
  - "PvaPublish"
  - "エージェント 公開"
  - "推奨プロンプト"
  - "初期メッセージ"
  - "greetingText"
  - "conversationStarters"
---

# Copilot Studio v2（新アーキテクチャ）エージェント構築スキル

Copilot Studio の **「全く新しいアーキテクチャ」（`cliagent` テンプレート）** エージェントを、
Dataverse Web API と、必要時はログイン済みブラウザの observed/private API で構築する。

> **標準方針**: 新規の Copilot Studio 開発は v2 を第一候補にする。Code Apps では Web app チャネルの
> iframe を表示でき、Agent flows では既存の発行済み v2 を Agent ノードから利用できる。
> iframe 表示、ブラウザー SDK によるプログラム的な会話制御、Workflow のサーバー側呼び出しは
> 異なる連携方式であり、可否・認証・受入を分けて判定する。

## v1（旧）スキルとの最大の違い

| 観点 | v1（`copilot-studio` スキル / 旧アーキ） | **v2（本スキル / 新アーキ `cliagent`）** |
|---|---|---|
| **Bot 作成** | ❌ API 不可。Copilot Studio UI で手動作成必須 | `POST /bots` を第一候補にし、`pac copilot list` に現れない場合だけ UI 作成へ fallback |
| 設定の保存先 | GPT コンポーネント（componenttype=15）+ PVA ダブル改行 YAML | `bots.configuration` の **BotConfiguration JSON にインライン** |
| recognizer | （クラシック PVA） | `CLICopilotRecognizer` |
| モデル指定 | GPT data の `aISettings.model.modelNameHint` | `agentSettings.model.series`（例 `claude-opus-5`） |
| Instructions | GPT data YAML（ダブル改行フォーマット注意） | `agentSettings.instructions.segments[].value`（プレーン文字列） |
| メモリ | （個別設定） | `agentSettings.enableMemory: true` |
| スキル | （ナレッジ/トピック） | **フラット Python スキルバンドル**（type=9 + type=14 子ファイル） |
| 自動化適性 | △ UI 介在が必要 | ◎ 基本構築 + 承認済み初回ツール投入。OAuth/consent は browser session |

> **このスキルを選ぶ理由**: Bot 作成からスキル添付まで **人手の UI 操作ゼロ** で構築できる。
> CI/再現構築・量産・プログラム的な改変に向く。

## いつ v2 を使うか（architecture スキルでの分岐）

`architecture` スキルの Copilot Studio 選定では、**新規開発は v2 を標準の第一候補**にする。
v1 は既存 v1 資産の継続、または v2 で満たせない直接 SDK 要件がある場合に限って選ぶ。

| 利用方式 | 標準選択 | 境界 |
|---|---|---|
| Teams / Copilot Studio で対話 | **v2** | 公開先ごとに認証と本人権限を受入確認する |
| Code Apps に標準チャット画面を表示 | **v2 Web app iframe** | iframe 内 UI。親アプリからの任意メッセージ注入、応答イベント取得、SSO/OBO を自動的には保証しない |
| Dataverse レコード作成・更新から自動実行 | **Agent flows + v2 Agent ノード** | Workflow の接続所有者、ACP/DLP、実行完了、業務出力を個別に検証する |
| Code Apps で要求・結果を業務 UI と統合 | **Dataverse + Agent flows + v2** | 非同期の要求/結果方式。相関、Claim、行所有、再実行防止が必要 |
| 親アプリで会話をプログラム制御 | **要件確認後に v1** | `ExecuteCopilotAsyncV2`、WebChat SDK、トークンストリーミング等が必須の場合 |

Web app iframe の表示可否と、`ExecuteCopilotAsyncV2` / WebChat SDK による直接呼び出し可否を混同しない。
v2 iframe は実際の公開 URL、Code Apps の `frame-src`、サインイン、一般利用者の本人認可を公開ホストで確認する。
Agent flows の既存 Agent ノードは製品 UI のサポート経路を使い、直接 API Hub 呼び出しを標準実装にしない。
構築・検証は [agent-flows](../agent-flows/SKILL.md) に従う。

## 事前確認（会話の最初に 1 回だけ）

本スキルの利用が確定したら、[standard の共通契約](../standard/SKILL.md#共通の事前確認契約会話の最初に-1-回だけ)に加え、
**1 回の AskUserQuestion で次をまとめて確認する**。

| # | 質問 | 合格条件 |
|---|---|---|
| 1 | v2 の利用経路はどれか | Teams / Copilot Studio、Code Apps iframe、Agent flows、Dataverse 要求/結果を確定。直接 SDK 制御が必須の場合だけ v1 を比較する |
| 2 | 対象環境で Copilot Studio を作成・公開できるか | 必要なライセンス / capacity と、環境で bot / botcomponent を作成・更新できる権限がある |
| 3 | 使用モデルは対象環境で選択可能か | `AGENT_MODEL_SERIES` を確定し、廃止表示時の代替モデルも合意している |
| 4 | MCP サーバーを使うか | connector / operation、接続、認証、データ範囲、private API 利用可否と UI fallback が確定している |
| 5 | 名前、Instructions、メモリ、スキル、アイコン、公開範囲は承認済みか | 設計全文とテスト担当者を記録している |

`System Administrator` を前提にせず、対象環境で必要な Dataverse テーブル権限と Copilot Studio
作成・公開権限を持つロールを確認する。MCP 追加を含む場合は接続の作成・共有権限も別途確認する。
いずれかが未確認なら `scripts/deploy_agent.py` を実行しない。

## 構築フロー

```
1. .env 準備（DATAVERSE_URL / TENANT_ID / 任意で SOLUTION_NAME・PUBLISHER_PREFIX）
2. 設計提示 → ユーザー承認（名前・Instructions・モデル・スキル・アイコン・MCP 構成）
   - ファイル出力を伴うスキルを添付する場合は、Instructions に
     「ファイルを出力する際は毎回異なるファイル名にする」旨を含める（同名だと UI でダウンロード不可）
   - 初期メッセージ（greeting）と推奨プロンプトを agent/prompts.json に用意し、AGENT_PROMPTS_FILE で指定する
3. scripts/deploy_agent.py --defer-publish
  … Bot 作成、icon、Edit details、skill を構築。初回ツール投入まで公開を保留
4. pac copilot list
  … 対象 Bot が Active / Provisioned であることを確認。存在しなければ UI で専用 v2 agent を作成
5. 統合ブラウザで各 MCP / ConnectorTool の Add + Save PUT を captureToolSave で非変更捕捉
6. scripts/mcp_tool_plan.py
  … 各 capture の tool + ConnectionReferenceInsert を検証し、plan / PLAN_HASH を作成して承認
7. scripts/create_initial_tools_manifest.py
  … 同一 environment / bot の承認済み plan を .mcp/initial-tools.json に集約
8. runInitialToolProvisioning(page, manifestPath, reportPath)
  … 全 plan/hash を書き込み前に検証し、tool + connection reference を順次 apply / read-back
9. scripts/publish_agent.py    … ツール投入済みの agent を PvaPublish で最終公開
10. scripts/verify_agent.py + pac copilot list
   … 構造と Published / Active / Provisioned を確認
11. UI で Build ＞ Model と Tools を確認し、Preview で最小データの golden question を実行
```

> **ツールなし**: `python scripts/deploy_agent.py` で作成→アイコン→Edit details→スキル→公開を
> ワンショット実行する。**初回ツールあり**: `--defer-publish` で基礎構築し、承認済みmanifestを
> 同一browser sessionで投入してから公開する。詳細は
> [MCP サーバーの追加](references/mcp-servers.md) と
> [Connector action の追加と検証](references/connector-tools.md) を参照。

> **1 つのエージェントに複数スキルを添付する**場合は、`SKILL_DIR` / `SKILL_NAME` を変えて
> `attach_skill.py` を必要な回数だけ実行する（削除は同名スキル限定のため、先に添付した分は残る）。
> 対話系のスキルと、Agentflow から呼ばれる自動処理系のスキルは**分けて書く**。
> → [データ参照エージェントの SKILL.md 執筆パターン](references/data-agent-skill-authoring.md)

> **設計 JSON の候補生成と人による採用**: Code Apps の [モジュール設計パターン](../code-apps/references/modular-plant-design.md)
> と [フラット候補生成バンドル](../code-apps/templates/modular-plant/agent-skill/SKILL.md) を再利用できる。
> 対話は Teams、提案の差分・採用は共有 Dataverse を介した Code Apps 側で行う（v2 の直接呼び出し・埋め込みではない）。
> 公開・添付成功と Python 依存解決・Teams 実応答は別々に検証する。

## 運用中エージェントの更新（★新規作成しない）

`deploy_agent.py` は `create_agent.py` から始まるため、**実行するたびに新しい Bot が作られる**。
すでに UI で MCP ツールを追加した運用中のエージェントを更新するときは
[scripts/update_agent.py](scripts/update_agent.py) を使う。

```
1. set_instructions.py … Instructions を差し替え（configuration を GET → deep-merge → PATCH）
2. set_model.py        … モデル系列を差し替え（AGENT_MODEL_SERIES 指定時のみ）
3. set_prompts.py      … 初期メッセージ・推奨プロンプトを差し替え（指定時のみ）
4. attach_skill.py     … 同名スキルだけを入れ替え
5. publish_agent.py    … 再公開
```

```bash
python update_agent.py                # 全ステップ
python update_agent.py --no-publish   # 公開せず確認のみ
python update_agent.py --skip-skill   # スキルは触らない
```

### 追加済みツール（MCP）が消えない理由

| 更新対象 | 保存先 | ツールへの影響 |
|---|---|---|
| Instructions / モデル / メモリ / 初期メッセージ / 推奨プロンプト | `bots.configuration`（JSON 文字列カラム） | **なし**（別レコード） |
| フラット Python スキル | `botcomponents` type=9 + 子 type=14 | **なし**（`attach_skill.py` は `name eq '<SKILL_NAME>' and componenttype eq 9` で絞って削除する） |
| MCP / connector tool | `botcomponents` type=9（`data` が `kind: McpTool` / `ConnectorTool`、接続参照を保持） | 上記のどれも触らない |

守るべき点は 2 つ。

- `configuration` は**丸ごと上書きせず GET → deep-merge → PATCH**（`name` 列を同送）。
  `set_instructions.py` / `set_model.py` / `set_prompts.py` は送信直前に
  [scripts/verify_config.py](scripts/verify_config.py) で他のキーが欠落していないか検証し、
  消失を検知したら PATCH を中止する。
- `attach_skill.py` の削除は**同名スキル限定**。`componenttype eq 9` だけで一括削除してはいけない
  （MCP ツールも type=9 のため、全消しすると接続参照ごと消える）。

`update_agent.py` は更新の前後で MCP / connector tool の schemaname と接続参照をスナップショットして差分を
表示し、**消失を検知したら公開せずに異常終了する**。

> 実機検証（MCP ツール追加済みのエージェント）:
> Instructions 更新 + スキル全ファイル再添付 + 再公開を実行しても、MCP ツールの schemaname と
> `connectionReference` は同一のまま維持された。

## 初期メッセージと推奨プロンプト

UI の「設定 ＞ Greeting & prompts」に相当する設定も `bots.configuration` に入る。

```jsonc
"agentSettings": {
  "greetingText": "こんにちは。〇〇エージェントです。",          // 初期メッセージ
  "conversationStarters": [                                      // 推奨プロンプト
    { "$kind": "ConversationStarter", "title": "進捗を確認", "text": "今月の進捗は？" }
  ]
}
```

- 未設定だと Teams / M365 側で `Hello! I'm <名前>. How can I help you today?` という既定文が出る。
- `AGENT_PROMPTS_FILE`（JSON）を `.env` に置けば、`create_agent.py` が**初回作成の時点で**
  configuration に含めるため、後からの手当ては不要。
- 運用中エージェントの差し替えは [scripts/set_prompts.py](scripts/set_prompts.py)
  （`--show` / `--file` / `--clear`）。`update_agent.py` からも自動で呼ばれる。
- 反映には**再公開**が必要。

```jsonc
// agent/prompts.json
{
  "greeting": "こんにちは。〇〇エージェントです。",
  "prompts": [{ "title": "進捗を確認", "text": "今月の進捗は？" }]
}
```

### 初回ツールと接続参照は承認済み manifest で一括投入する（重要）

MCP / ConnectorTool 追加は、Copilot Studio v2 UI の Save が送る PVA gateway の change-set を
**対象環境・対象 bot ごとに捕捉**して行う。Dataverse へ `McpTool` を直接 INSERT しない。
捕捉時は PUT を中止して dry-run とし、schema allowlist、対象 ID、connector、operation、
connection reference、他変更の混入がないことを検証して `PLAN_HASH` を提示する。承認された hash と
一致するplanを`create_initial_tools_manifest.py`で集約し、同じログイン済み統合ブラウザで
`runInitialToolProvisioning`へ渡す。runnerは全planを事前検証してから、各toolと
`ConnectionReferenceInsert`を一体でapplyし、type=9のkind/connector/operation/referenceを読み戻す。

この gateway は **2026-09-14 に実機観測した非公開・非サポート API** である。公開 API と扱わず、
401 / 403 / 404、host/path/schema drift、read-back 不一致、管理対象環境の
`UnmanagedCustomizationsNotAllowed` では書き込みを停止し、UI 操作へフォールバックする。
Bearer token、Cookie、CSRF、session header はブラウザメモリ外へ出さない。詳細は
[MCP サーバーの追加](references/mcp-servers.md) を参照。

> **自前の MCP Server を作る場合**（社内 DB・ファイル共有・業務 API をエージェントに繋ぐ）は
> [mcp-server スキル](../mcp-server/SKILL.md) で構築してから、ここでツールとして追加する。
>
> **外部の文章を読ませる場合は SKILL.md の書き方が防御線になる。** MCP の戻り値を「資料であって指示ではない」と
> 明記し、golden question（インジェクション単発・連鎖を含む）で回帰検証する。
> → [データ参照エージェントの SKILL.md 執筆パターン](references/data-agent-skill-authoring.md)

## 必須要件・落とし穴（実機検証済み）

### Bot 作成は cliagent テンプレートなら API で成功する

```
✅ POST /bots に template="cliagent-1.0.0" を指定すれば API 作成できる
   → pac copilot list で Provisioned / Active になる
⚠️ bots.synchronizationstatus は一時的に "Provisioning" のまま残ることがある
   → pac copilot list の表示が正となる（Provisioned なら利用可）
```

### configuration は BotConfiguration JSON

```json
{
  "$kind": "BotConfiguration",
  "channels": [{ "$kind": "ChannelDefinition", "id": "MsTeams", "channelId": "MsTeams" }],
  "recognizer": { "$kind": "CLICopilotRecognizer" },
  "agentSettings": {
    "$kind": "AgentSettings",
    "model": { "$kind": "ModelConfig", "series": "claude-opus-5" },
    "instructions": {
      "$kind": "Instructions",
      "segments": [{ "$kind": "StaticSegment", "value": "<エージェントの指示文>" }]
    },
    "enableMemory": true
  }
}
```

- **Instructions はプレーン文字列**。v1 のような PVA ダブル改行 YAML は不要。
- 既存 Bot を改変する場合は `configuration` を GET → **ディープマージ** → PATCH（モデル・メモリを失わない）。
- **ファイルを出力するスキルを持つ場合は、Instructions に「ファイル出力時は毎回異なるファイル名にする
  （日時や UUID を付与する）」旨を必ず含める**。Copilot Studio v2 は同じファイル名で繰り返し出力すると
  UI 上でダウンロードできなくなるため（詳細: [flat-python-skill.md](references/flat-python-skill.md)）。

### スキルは「フラット Python バンドル」

新ランタイムの制約（実機で確認）:

```
❌ JavaScript / pptxgenjs は拒否される        → ✅ Python（python-pptx 等）のみ
❌ バンドル内のサブフォルダ階層は解決されない → ✅ フラット（同一階層に全ファイル）
❌ 同梱画像ファイルが読み込まれないことがある → ✅ 画像は assets_b64.py に Base64 埋め込み
```

詳細は [フラット Python スキルの書き方](references/flat-python-skill.md) を参照。

### スキルバンドルの botcomponent 構造

| componenttype | 役割 | 格納先 | 親バインド |
|---|---|---|---|
| **9** | InlineAgentSkill（スキル本体） | `data` 列 | `parentbotid@odata.bind` → `/bots(...)` |
| **14** | FileAttachmentComponent（同梱ファイル） | `filedata` File 列 | `ParentBotComponentId@odata.bind` → `/botcomponents(...)` |

- type=9 の `data`: `kind: InlineAgentSkill\r\ncontent: <!-- bic:bundle={bundle_id} -->`
- type=14 子の **親ナビゲーションプロパティは `ParentBotComponentId`**（Pascalケース。`parentbotcomponentid` は不可）
- `filedata` は `PATCH /botcomponents({id})/filedata` に生バイト + ヘッダ `x-ms-file-name` でアップロード

詳細は [スキルバンドル構造](references/skill-bundle-structure.md) を参照。

### アイコン・公開（実機検証済み）

```
✅ アイコンは bots.iconbase64(240) ＋ teams.colorIcon(192)/outlineIcon(32) の 3 か所へ登録
   ⚠ bots を PATCH する際は name 列を必ず同送（無いと 0x80040265 エラー）
✅ 公開は PvaPublish。状態確認は pac copilot list（publishedon は None のことがある）
```

MCP サーバーの追加は observed/private gateway API を承認付きで実行する。接続作成・OAuth、
契約不一致時の fallback は UI を使う。手順は [MCP サーバーの追加](references/mcp-servers.md) を参照。

詳細は [アイコン登録と公開](references/icon-and-publish.md) を参照。

### よくあるエラー

異常系（症状→原因→対処の一覧）は [references/troubleshooting.md](references/troubleshooting.md) を参照。

## スクリプト一覧

| スクリプト | 用途 |
|---|---|
| [scripts/create_agent.py](scripts/create_agent.py) | cliagent Bot を API 作成 + プロビジョニング待ち（廃止モデル名は作成前に弾く） |
| [scripts/set_model.py](scripts/set_model.py) | モデル系列の確認（`--show`）と変更（GET → deep-merge → PATCH） |
| [scripts/set_instructions.py](scripts/set_instructions.py) | Instructions の確認（`--show`）と差し替え（`--file` でファイル指定） |
| [scripts/set_prompts.py](scripts/set_prompts.py) | 初期メッセージ（greetingText）と推奨プロンプト（conversationStarters）の確認・設定・削除 |
| [scripts/set_icon.py](scripts/set_icon.py) | アイコン登録（iconbase64 / Teams color / outline） |
| [scripts/set_app_details.py](scripts/set_app_details.py) | Edit details 設定（PVA ゲートウェイ）。アイコン・説明文・開発元・リンク・MPN・store表示・Teams scopes・通話・SSO・M365 有効化。未設定はデフォルト補完 |
| [scripts/attach_skill.py](scripts/attach_skill.py) | フラット Python スキルを添付（type=9 + type=14） |
| [scripts/publish_agent.py](scripts/publish_agent.py) | PvaPublish で公開（リトライ付き） |
| [scripts/deploy_agent.py](scripts/deploy_agent.py) | 一括: 作成→アイコン→Edit details→スキル→公開。初回ツールありは `--defer-publish` で公開保留 |
| [scripts/mcp_tool_plan.py](scripts/mcp_tool_plan.py) | 捕捉した `McpTool` / `ConnectorTool` change-set と接続参照を allowlist 検証し、plan / SHA-256 hash を生成 |
| [scripts/create_initial_tools_manifest.py](scripts/create_initial_tools_manifest.py) | 複数の承認済みplan/hashを同一target・重複なしで検証し、初回投入manifestを生成 |
| [scripts/mcp_tool_browser_runner.mjs](scripts/mcp_tool_browser_runner.mjs) | Save PUT の非変更捕捉、全plan事前検証、同一browser sessionでtool + connection referenceをapply、Dataverse read-back |
| [scripts/connector_tool_verify.py](scripts/connector_tool_verify.py) | UI 追加した Outlook / Teams `ConnectorTool` を type 9 read-back で完全一致検証。MCP write allowlist とは分離 |
| [scripts/update_agent.py](scripts/update_agent.py) | 一括: **既存**エージェントを Instructions→モデル→推奨プロンプト→スキル→公開 で更新。MCP ツールの保全を前後差分で検証 |
| [scripts/verify_config.py](scripts/verify_config.py) | `configuration` の PATCH 直前に、更新対象以外のキー（model / instructions / memory / greeting 等）が消えていないか検証する共通ガード |
| [scripts/verify_agent.py](scripts/verify_agent.py) | 構造検証（filedata 実体ダウンロード確認） |
| [scripts/analyze_agent.py](scripts/analyze_agent.py) | 既存エージェントの構成・コンポーネントをダンプ |

> **認証**: 全スクリプトは `standard` スキルの `auth_helper.py` を使用する（`requests` 直呼び禁止）。

## サブリファレンス

| リファレンス | 内容 |
|---|---|
| [新アーキテクチャ構造](references/new-architecture.md) | cliagent の BotConfiguration / botcomponents 全体像と v1 との対比 |
| [モデル系列の指定](references/model-series.md) | `agentSettings.model.series` の現行命名・廃止値・確認方法・後からの変更 |
| [フラット Python スキルの書き方](references/flat-python-skill.md) | JS 不使用・Base64 画像・フラット構成の実装テンプレート |
| [データ参照エージェントの SKILL.md 執筆パターン](references/data-agent-skill-authoring.md) | MCP 経由で社内データを読むエージェントの手順設計・インジェクション規約・golden question の作り方 |
| [スキルバンドル構造](references/skill-bundle-structure.md) | type=9/14・親バインド・filedata アップロードの詳細 |
| [MCP サーバーの追加](references/mcp-servers.md) | observed/private API の捕捉、dry-run、承認、apply、read-back と UI fallback |
| [Connector action の追加と検証](references/connector-tools.md) | Outlook / Teams の UI 追加、`ConnectorTool` read-back、Preview 最小データ検証、consent 境界 |
| [アイコン登録と公開](references/icon-and-publish.md) | iconbase64/Teams アイコン・PvaPublish・name 同送の注意 |
| [Edit details(チャネル メタデータ)](references/app-details.md) | Publish の Edit details を保存する PVA ゲートウェイ API・ペイロード対応・アイコン要件・ドラフト→公開 |

## .env 必須項目

`.env.example` は [references/.env.example](references/.env.example) を参照。

```env
DATAVERSE_URL=https://<org>.crm.dynamics.com
TENANT_ID=<tenant-guid>
# 任意（ソリューション運用する場合）
SOLUTION_NAME=SampleSolution
PUBLISHER_PREFIX=geek
# create_agent.py 用パラメータ
AGENT_NAME=my-new-agent
AGENT_SCHEMA=geek_mynewagent
AGENT_MODEL_SERIES=claude-opus-5
# set_icon.py 用（任意）
ICON_TEXT=A
ICON_BG_COLOR=#2563EB
ICON_ACCENT_COLOR=#22C55E
```
