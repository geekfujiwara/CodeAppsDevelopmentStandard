---
name: ai-builder
description: "AI Builder の AI プロンプト（GPT Dynamic Prompt）を Dataverse API で作成し、Copilot Studio エージェントにツール（アクション）として追加する。Power Automate フローとの統合パターンも含む。"
category: ai
triggers:
  - "AI Builder"
  - "AI プロンプト"
  - "GPT Prompt"
  - "AIプロンプト作成"
  - "エージェントツール追加"
  - "msdyn_aimodel"
  - "InvokeAIBuilderModelTaskAction"
  - "プロンプトデプロイ"
  - "AI Prompt"
  - "aibuilderpredict"
  - "フロー AI Builder"
---

# AI Builder AI プロンプト構築スキル

AI Builder の **AI プロンプト（GPT Dynamic Prompt）** を Dataverse API で作成し、
Copilot Studio エージェントに **ツール（アクション）** として追加する。
Power Automate フローから **aibuilderpredict_customprompt** で呼び出すパターンも含む。

## ★ 最重要方針: AI プロンプトを常にプレビルトモデルより優先する

```
AI Builder で AI 処理を実装する場合、以下の方針に従う:

✅ AI プロンプト（カスタムプロンプト）を常に第一選択肢とする
  - 請求書処理、ドキュメント情報抽出、分類、要約 等すべて
  - プロンプトテキスト + document/image 入力で柔軟に対応
  - トレーニングデータ不要、即座にデプロイ・更新可能
  - プロンプト変更だけで出力形式・抽出項目を自由に調整

❌ プレビルトモデル（請求書処理モデル等）は原則使用しない
  - 従来型のプレビルトモデルやカスタムモデルはトレーニング（学習）が必要
  - AI プロンプトで同等の処理がプロンプトだけで実現できる

⚠ プレビルトモデルを使う例外ケース（稀）
  - 手書き文字の高精度 OCR が必須で AI プロンプトでは精度不足の場合
  - 既存のプレビルトモデルが組み込まれたワークフローを維持する必要がある場合
```

## 前提: 設計フェーズ完了後に構築に入る（必須）

**AI プロンプトを構築する前に、プロンプト設計をユーザーに提示し承認を得ていること。**

設計提示時に含める内容:

| 項目               | 内容                                                 |
| ------------------ | ---------------------------------------------------- |
| プロンプト名       | 英語推奨（スキーマ名に使用される）                   |
| プロンプトテキスト | リテラルテキスト＋入力変数の組み合わせ               |
| 入力変数           | 名前・型（text / document / image）・説明・テスト値  |
| 出力形式           | text or json（JSON の場合はスキーマ＋サンプル）      |
| モデルパラメータ   | モデル種別（gpt-41-mini 等）・temperature            |
| 利用先             | Copilot Studio ツール or Power Automate フロー       |
| shouldPromptUser   | 各入力変数をユーザーに自動的に尋ねるか（true/false） |

## ★ 最重要発見: AIModelPublish 1ステップ・アクティベーション

**2026-04-15 検証済み: `AIModelPublish` アクションは1ステップでモデルを完全にアクティブ化する。**

```
従来（旧パターン — ❌ 複雑で環境差異に弱い）:
  1. Create Model
  2. Create Training Config (statecode=2, statuscode=6 を指定)
  3. Create Run Config (statecode=2, statuscode=7 を指定)
  4. PATCH Model (_msdyn_activerunconfigurationid_value + statecode=1)
  → 環境によって statecode/statuscode 指定や _value PATCH が拒否される

正解（新パターン — ✅ シンプルで確実）:
  1. Create Model（msdyn_TemplateId@odata.bind 形式）
  2. AIModelPublish（msdyn_ プレフィックスなし unbound action）
     → Published Training Config (state=2, status=6) を自動生成
     → Run Config (state=2, status=7) を自動生成（RunConfigurationId の値が ID になる）
     → Model を Active (state=1, status=1) に自動変更
  → 完了! わずか 2 API コール

更新時:
  1. 既存 Model を検索 → Active Run Config の ID を取得
  2. Run Config の msdyn_customconfiguration を PATCH
  → 完了!（再公開不要）
```

### AIModelPublish の呼び出し方

```python
import requests

token = get_token()
headers = {
    "Authorization": f"Bearer {token}",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    "Content-Type": "application/json; charset=utf-8",
}
r = requests.post(
    f"{DATAVERSE_URL}/api/data/v9.2/AIModelPublish",  # ★ msdyn_ プレフィックスなし!
    headers=headers,
    json={
        "TemplateId": GPT_TEMPLATE_ID,       # GPT Dynamic Prompt テンプレート固定値
        "ModelId": model_id,                  # 作成した Model の GUID
        "RunConfigurationId": model_id,       # ★ model_id を渡すと Run Config ID = model_id
        "ModelName": PROMPT_NAME,
        "CustomConfiguration": custom_config_json_str,
        "RunConfiguration": custom_config_json_str,
    },
)
assert r.status_code < 400, f"AIModelPublish 失敗: {r.status_code}"
# → Model が Active、activeRun = model_id
```

### 重要な注意点

| 項目 | 説明 |
|------|------|
| アクション名 | `AIModelPublish`（`msdyn_AIModelPublish` ではない! プレフィックスなし） |
| RunConfigurationId | `model_id` を渡すと Run Config がその ID で自動作成される |
| 自動生成物 | Published Training (state=2,status=6) + Run Config (state=2,status=7) |
| 結果 | Model が state=1（Active）に自動変更される |
| 副作用 | Published Training Config は DELETE 不可（405）→ 無害 |
| 失敗時 | 既に Active な Run Config がある場合 `AnotherRunConfigAlreadyPublished` |

## Dataverse データ構造

AI Builder の AI プロンプトは **3 つの Dataverse テーブル** + **1 つの botcomponent** で構成される。

```
┌─────────────────────────┐
│  msdyn_aimodel          │  ← AI プロンプト本体
│  (msdyn_aimodels)       │
│                         │
│  msdyn_name             │  プロンプト名
│  _msdyn_templateid_value│  GPT Prompt テンプレート ID
│  _msdyn_activerunconfigurationid_value │  → Run Config
│  statecode=1 (Active)   │
└──────────┬──────────────┘
           │ 1:N
           ▼
┌─────────────────────────┐
│  msdyn_aiconfiguration  │  ← 設定（AIModelPublish で自動生成）
│  (msdyn_aiconfigurations│
│                         │
│  Training (type=190690000, state=2, status=6) │  Published Training
│  Run     (type=190690001, state=2, status=7)  │  Active Run Config
│    msdyn_customconfiguration = JSON            │  ← プロンプト定義本体
└─────────────────────────┘

┌─────────────────────────┐
│  botcomponent           │  ← エージェントとの紐付け（Copilot Studio 利用時のみ）
│  (botcomponents)        │
│                         │
│  componenttype=9        │  トピックと同じ型
│  kind: TaskDialog       │  AI プロンプトアクション
│  action.aIModelId       │  → msdyn_aimodel の GUID
│  _parentbotid_value     │  → エージェント (bots)
└─────────────────────────┘
```

### テンプレート ID（固定値）

| テンプレート名     | ID                                     |
| ------------------ | -------------------------------------- |
| GPT Dynamic Prompt | `edfdb190-3791-45d8-9a6c-8f90a37c278a` |

### msdyn_customconfiguration の JSON 構造

```json
{
  "version": "GptDynamicPrompt-2",
  "prompt": [
    { "type": "literal", "text": "以下の情報を分析してください: " },
    { "type": "inputVariable", "id": "input_text" },
    { "type": "literal", "text": " を基にレポートを作成。" }
  ],
  "definitions": {
    "inputs": [
      {
        "id": "input_text",
        "text": "input_text",
        "type": "text",
        "quickTestValue": "テスト用のサンプルテキスト"
      }
    ],
    "formulas": [],
    "data": [],
    "output": {
      "formats": ["json"],
      "jsonSchema": {
        "type": "object",
        "properties": {
          "summary": { "type": "string" },
          "key_points": { "type": "array", "items": { "type": "string" } }
        }
      },
      "jsonExamples": [
        { "summary": "出力例", "key_points": ["ポイント1", "ポイント2"] }
      ]
    }
  },
  "modelParameters": {
    "modelType": "gpt-41-mini",
    "gptParameters": { "temperature": 0 }
  },
  "settings": {
    "recordRetrievalLimit": 30,
    "shouldPreserveRecordLinks": null,
    "runtime": null
  },
  "code": "",
  "signature": ""
}
```

#### prompt 配列の要素型

| type            | 説明             | 必須フィールド |
| --------------- | ---------------- | -------------- |
| `literal`       | 固定テキスト     | `text`         |
| `inputVariable` | 入力変数への参照 | `id`           |

#### definitions.inputs の型

| type       | 説明             | 備考                        |
| ---------- | ---------------- | --------------------------- |
| `text`     | テキスト入力     | `quickTestValue` でテスト値 |
| `document` | ドキュメント入力 | ファイルアップロード        |
| `image`    | 画像入力         | 画像ファイル                |

#### definitions.output の形式

| formats    | 説明         | 追加フィールド                     |
| ---------- | ------------ | ---------------------------------- |
| `["text"]` | テキスト出力 | なし                               |
| `["json"]` | JSON 出力    | `jsonSchema` + `jsonExamples` 必須 |

#### modelParameters.modelType の値

| 値            | モデル       |
| ------------- | ------------ |
| `gpt-41-mini` | GPT-4.1 mini |
| `gpt-41`      | GPT-4.1      |
| `o3-mini`     | o3-mini      |

### botcomponent の YAML 構造（kind: TaskDialog）

```yaml
kind: TaskDialog

inputs:
  - kind: AutomaticTaskInput
    propertyName: text
    name: text
    shouldPromptUser: true

modelDisplayName: AI Prompt Sample

modelDescription: AI Prompt Sample

action:
  kind: InvokeAIBuilderModelTaskAction
  aIModelId: 5f6a74ff-cd92-4f6b-a7f2-37e2be122105

outputMode: All
```

## 構築手順

詳細な構築手順・デプロイスクリプトテンプレートは [構築リファレンス](references/build-reference.md) を参照。

## Power Automate フローからの AI Builder 呼び出し

AI Builder プロンプトを **Power Automate フロー内で呼び出す** パターン。
Copilot Studio ツールではなく、Dataverse トリガー等と組み合わせて自動実行する場合に使う。

詳細は [Power Automate 連携リファレンス](references/power-automate-integration.md) を参照。

## 絶対遵守ルール

### AI Model 作成（★ 最重要）

```
✅ テンプレート ID は固定値 edfdb190-3791-45d8-9a6c-8f90a37c278a（GPT Dynamic Prompt）
✅ Model 作成は msdyn_TemplateId@odata.bind 形式を使用
✅ AIModelPublish (msdyn_ プレフィックスなし) で1ステップ完全アクティブ化
✅ RunConfigurationId に model_id を渡す → Run Config がその ID で作成される
✅ 更新時は Active Run Config の msdyn_customconfiguration を PATCH するだけ
❌ _msdyn_templateid_value を使う → 一部環境で拒否される
❌ _msdyn_activerunconfigurationid_value を直接 PATCH → 一部環境で拒否される
❌ statecode/statuscode を Config 作成時に指定 → 一部環境で拒否される
❌ PublishAIConfiguration を新規モデルに使う → AIModelPublish 単体で十分
❌ msdyn_AIModelPublish（msdyn_ プレフィックス付き）→ 404
❌ msdyn_Publish → 404
❌ SetState → 404
```

### プロンプト定義

```
✅ prompt 配列は literal と inputVariable を交互に配置
✅ inputVariable の id は definitions.inputs の id と一致させる
✅ JSON 出力の場合は jsonSchema + jsonExamples の両方を定義
✅ modelType は有効な値を使用（gpt-41-mini, gpt-41, o3-mini）
✅ temperature は 0〜1 の float 値
```

### botcomponent（エージェント追加）

```
✅ componenttype=9（トピックと同じ型番）
✅ schemaname は {botSchema}.action.{PromptNameNoSpaces} 形式
✅ YAML の kind は TaskDialog
✅ action.kind は InvokeAIBuilderModelTaskAction
✅ action.aIModelId は msdyn_aimodel の GUID（ハイフン付き小文字）
✅ inputs の propertyName は customconfiguration の inputs.id と一致
✅ shouldPromptUser: true でエージェントがユーザーに入力を求める
❌ yaml.dump() で YAML を生成 → PVA パーサーと非互換
❌ componenttype を間違える → エージェントに表示されない
```

### ソリューション管理

```
✅ msdyn_aimodel の作成は solution ヘッダー付きで POST
✅ AIModelPublish 後、自動生成された Config もソリューションに含まれる
✅ AddSolutionComponent (componenttype=401) で検証・補完
❌ デフォルトソリューションに入ったままにする → 環境間移行不可
```

### Power Automate フロー連携

```
✅ aibuilderpredict_customprompt で Active Model を参照（recordId パラメータ）
✅ Model が Active でないとフロー有効化時に GetPredictionSchema 検証で失敗
✅ Model → Flow の順でデプロイ（Model が Active 必須）
✅ フロー定義の dict キーに動的値を使う場合は f-string 必須
✅ 新しい Dataverse 列を追加した後は PublishAllXml でコネクタメタデータ更新
❌ Draft Model を参照するフローを有効化 → "GetPredictionSchema failed"
```

## ファイル入力（Image or Document Input）の制限事項

公式ドキュメント: https://learn.microsoft.com/en-us/microsoft-copilot-studio/add-inputs-prompt#limitations

### 対応ファイル形式

| 条件                          | 対応形式                                                                  |
| ----------------------------- | ------------------------------------------------------------------------- |
| 標準（Code Interpreter オフ） | **PNG, JPG, JPEG, PDF** のみ                                              |
| Code Interpreter オン         | 上記 + **Word (.doc/.docx), Excel (.xls/.xlsx), PowerPoint (.ppt/.pptx)** |

### サイズ・ページ数・時間制限

| 制限項目           | 値                                         |
| ------------------ | ------------------------------------------ |
| ファイルサイズ合計 | **25 MB 未満**（全ファイル合計）           |
| ページ数           | **50 ページ未満**                          |
| 処理タイムアウト   | **100 秒**（超過するとタイムアウトエラー） |

### その他の制限

- **Copilot Studio エージェントのツールとしての AI プロンプト**では画像/ドキュメント入力は**未対応**
  - ファイル処理が必要な場合は **Power Automate フロー経由**で AI プロンプトを呼び出す
- 非対応ファイル形式の回避策: OneDrive for Business `ConvertFile` で PDF 変換してから渡す

## .env 追加パラメータ

```env
# AI Builder AI Prompt 用（既存 .env に追加）
AI_PROMPT_NAME=AI Prompt Sample
AI_PROMPT_BOT_ID=https://copilotstudio.../bots/xxxxxxxx-xxxx-.../overview
# ↑ BOT_ID と異なるエージェントに追加する場合のみ指定
```

## デプロイ・トラブルシューティング

- [構築リファレンス](references/build-reference.md) — デプロイスクリプト・トラブルシューティング
- [Power Automate 連携リファレンス](references/power-automate-integration.md) — フロー統合パターン
