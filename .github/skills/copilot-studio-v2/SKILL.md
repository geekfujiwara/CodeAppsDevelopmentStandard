---
name: copilot-studio-v2
description: "Copilot Studio の「全く新しいアーキテクチャ」（cliagent テンプレート）エージェントを Dataverse Web API だけで完全自動構築する。UI 手動作成不要。Bot 作成・Instructions/モデル/メモリ設定・フラット Python スキル添付までスクリプトで完結。"
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
  - "Sonnet46"
  - "エージェント v2"
---

# Copilot Studio v2（新アーキテクチャ）エージェント構築スキル

Copilot Studio の **「全く新しいアーキテクチャ」（`cliagent` テンプレート）** エージェントを
**Dataverse Web API だけで完全自動構築** する。

## v1（旧）スキルとの最大の違い

| 観点 | v1（`copilot-studio` スキル / 旧アーキ） | **v2（本スキル / 新アーキ `cliagent`）** |
|---|---|---|
| **Bot 作成** | ❌ API 不可。Copilot Studio UI で手動作成必須 | ✅ **`POST /bots` で API 作成可能**。UI 不要・完全自動 |
| 設定の保存先 | GPT コンポーネント（componenttype=15）+ PVA ダブル改行 YAML | `bots.configuration` の **BotConfiguration JSON にインライン** |
| recognizer | （クラシック PVA） | `CLICopilotRecognizer` |
| モデル指定 | GPT data の `aISettings.model.modelNameHint` | `agentSettings.model.series`（例 `Sonnet46`） |
| Instructions | GPT data YAML（ダブル改行フォーマット注意） | `agentSettings.instructions.segments[].value`（プレーン文字列） |
| メモリ | （個別設定） | `agentSettings.enableMemory: true` |
| スキル | （ナレッジ/トピック） | **フラット Python スキルバンドル**（type=9 + type=14 子ファイル） |
| 自動化適性 | △ UI 介在が必要 | ◎ **エンドツーエンドでスクリプト完結** |

> **このスキルを選ぶ理由**: Bot 作成からスキル添付まで **人手の UI 操作ゼロ** で構築できる。
> CI/再現構築・量産・プログラム的な改変に向く。

## いつ v2 を使うか（architecture スキルでの分岐）

`architecture` スキルの Copilot Studio 選定時に、ユーザーへ **v2 / v1 のどちらで作るか** を確認する。
**特に希望がなければ v2 を推奨**（自動構築できるため）。判断材料は下表。

| v2（新アーキ）が向く | v1（旧アーキ）が向く |
|---|---|
| UI 操作なしで自動構築したい | conversationStarters / 会話の開始 / クイック返信を細かく作り込みたい |
| フラット Python スキルでツール挙動を実装したい | 既存の v1 references（外部公開・トリガー・ニュース配信）資産を流用したい |
| 再現構築・量産・プログラム的改変 | クラシックなナレッジ/トピック中心の構成 |

## 構築フロー（完全自動）

```
1. .env 準備（DATAVERSE_URL / TENANT_ID / 任意で SOLUTION_NAME・PUBLISHER_PREFIX）
2. 設計提示 → ユーザー承認（名前・Instructions・モデル・スキル構成）
3. scripts/create_agent.py     … cliagent Bot を API 作成 + プロビジョニング待ち
4. scripts/attach_skill.py     … フラット Python スキルを添付（type=9 + type=14）
5. scripts/verify_agent.py     … 構造検証（filedata 実体ダウンロード確認）
6. pac copilot list            … Provisioned / Active を確認
7. Preview で動作テスト（ユーザー）
```

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
    "model": { "$kind": "ModelConfig", "series": "Sonnet46" },
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

### よくあるエラー

| 症状 | 原因 | 対処 |
|---|---|---|
| `0x8004023b "Connection State is closed"` | Bot プロビジョニング直後で認可セッション未確立 | 数秒待って **リトライ**（一時エラー） |
| `undeclared property 'parentbotcomponentid'` | 親ナビ名が誤り | `ParentBotComponentId`（Pascalケース）を使う |
| `bot $select` で 400 | 新アーキに存在しない列を指定 | 全列取得してから必要列をフィルタ |
| 日本語出力で `UnicodeEncodeError`（cp932） | Windows コンソール既定 | `sys.stdout.reconfigure(encoding="utf-8")` |

## スクリプト一覧

| スクリプト | 用途 |
|---|---|
| [scripts/create_agent.py](scripts/create_agent.py) | cliagent Bot を API 作成 + プロビジョニング待ち |
| [scripts/attach_skill.py](scripts/attach_skill.py) | フラット Python スキルを添付（type=9 + type=14） |
| [scripts/verify_agent.py](scripts/verify_agent.py) | 構造検証（filedata 実体ダウンロード確認） |
| [scripts/analyze_agent.py](scripts/analyze_agent.py) | 既存エージェントの構成・コンポーネントをダンプ |

> **認証**: 全スクリプトは `standard` スキルの `auth_helper.py` を使用する（`requests` 直呼び禁止）。

## サブリファレンス

| リファレンス | 内容 |
|---|---|
| [新アーキテクチャ構造](references/new-architecture.md) | cliagent の BotConfiguration / botcomponents 全体像と v1 との対比 |
| [フラット Python スキルの書き方](references/flat-python-skill.md) | JS 不使用・Base64 画像・フラット構成の実装テンプレート |
| [スキルバンドル構造](references/skill-bundle-structure.md) | type=9/14・親バインド・filedata アップロードの詳細 |

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
AGENT_MODEL_SERIES=Sonnet46
```
