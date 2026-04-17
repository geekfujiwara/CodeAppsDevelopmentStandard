---
name: ai-builder-prompt
description: "AI Builder の AI プロンプトを作成し Copilot Studio エージェントにツールとして追加する。Use when: AI Builder, AI プロンプト, GPT Prompt, AIプロンプト作成, エージェントツール追加, msdyn_aimodel, InvokeAIBuilderModelTaskAction, プロンプトデプロイ, AI Prompt"
---

# AI Builder AI プロンプト構築スキル

AI Builder の **AI プロンプト（GPT Dynamic Prompt）** を Dataverse API で作成し、
Copilot Studio エージェントに **ツール（アクション）** として追加する。

## ★ 最重要方針: AI プロンプトを常にプレビルトモデルより優先する

```
AI Builder で AI 処理を実装する場合、以下の方針に従う:

✅ AI プロンプト（カスタムプロンプト）を常に第一選択肢とする
  - 請求書処理、ドキュメント情報抽出、分類、要約 等すべて
  - プロンプトテキスト + document/image 入力で柔軟に対応
  - トレーニングデータ不要、即座にデプロイ・更新可能
  - プロンプト変更だけで出力形式・抽出項目を自由に調整

❌ プレビルトモデル（請求書処理モデル等）は原則使用しない
  - 従来型のプレビルトモデルやカスタムモデルはトレーニング（学習）が必要で手間がかかる
  - モデルの再学習・精度チューニングにも時間とコストがかかる
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
| 対象エージェント   | どのエージェントにツールとして追加するか             |
| shouldPromptUser   | 各入力変数をユーザーに自動的に尋ねるか（true/false） |

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
│  msdyn_aiconfiguration  │  ← 設定（Training + Run の 2 レコード）
│  (msdyn_aiconfigurations│
│                         │
│  Training (type=190690000, statuscode=6) │  ベース設定
│  Run     (type=190690001, statuscode=7)  │  プロンプト定義本体
│    msdyn_customconfiguration = JSON      │
└─────────────────────────┘

┌─────────────────────────┐
│  botcomponent           │  ← エージェントとの紐付け
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
      },
      {
        "id": "document",
        "text": "document",
        "type": "document"
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
          "key_points": {
            "type": "array",
            "items": { "type": "string" }
          }
        }
      },
      "jsonExamples": [
        {
          "summary": "出力例のサマリー",
          "key_points": ["ポイント1", "ポイント2"]
        }
      ]
    }
  },
  "modelParameters": {
    "modelType": "gpt-41-mini",
    "gptParameters": {
      "temperature": 0
    }
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

  - kind: AutomaticTaskInput
    propertyName: document
    name: document
    shouldPromptUser: true

modelDisplayName: AI Prompt Sample
modelDescription: AI Prompt Sample
action:
  kind: InvokeAIBuilderModelTaskAction
  aIModelId: 5f6a74ff-cd92-4f6b-a7f2-37e2be122105

outputMode: All
```

#### botcomponent YAML フィールド

| フィールド                  | 説明                                                     |
| --------------------------- | -------------------------------------------------------- |
| `kind`                      | 常に `TaskDialog`                                        |
| `inputs[].kind`             | 常に `AutomaticTaskInput`                                |
| `inputs[].propertyName`     | 入力変数の ID（customconfiguration の inputs.id と一致） |
| `inputs[].name`             | 入力変数の表示名                                         |
| `inputs[].shouldPromptUser` | `true`: エージェントがユーザーに自動的に入力を求める     |
| `modelDisplayName`          | AI プロンプトの表示名                                    |
| `modelDescription`          | AI プロンプトの説明                                      |
| `action.kind`               | 常に `InvokeAIBuilderModelTaskAction`                    |
| `action.aIModelId`          | `msdyn_aimodel` の GUID                                  |
| `outputMode`                | `All`（全出力を返す）                                    |

#### schemaname 命名規則

```
{prefix}_{botSchemaBaseName}.action.{PromptNameNoSpaces}
```

例: `geek_Word.action.AIPromptSample`

- `prefix`: ソリューション発行者プレフィックス
- `botSchemaBaseName`: Bot の schemaname からプレフィックスを除いた部分
- `PromptNameNoSpaces`: プロンプト名からスペースを除去


## 構築手順

詳細な構築手順・デプロイスクリプトテンプレートは [構築リファレンス](build-reference.md) を参照。

## 絶対遵守ルール

### AI Model 作成

```
✅ テンプレート ID は固定値 edfdb190-3791-45d8-9a6c-8f90a37c278a（GPT Dynamic Prompt）
✅ Training Config → Run Config の順で作成（Run は Training を参照する）
✅ Run Config の statecode=2, statuscode=7 で公開済み状態にする
✅ Model の _msdyn_activerunconfigurationid_value に Run Config ID を設定
✅ Model を statecode=1 でアクティブ化
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
✅ msdyn_aiconfiguration も solution ヘッダー付きで作成
✅ ソリューションコンポーネントタイプ: 401（AIConfiguration）
✅ AddSolutionComponent で検証・補完
❌ デフォルトソリューションに入ったままにする → 環境間移行不可
```

### 既存 AI プロンプトの検索・更新

```python
# 名前で AI Model を検索
existing = api_get(f"msdyn_aimodels?$filter=msdyn_name eq '{PROMPT_NAME}'&$select=msdyn_aimodelid,msdyn_name,_msdyn_activerunconfigurationid_value")
if existing.get("value"):
    model = existing["value"][0]
    model_id = model["msdyn_aimodelid"]
    run_config_id = model["_msdyn_activerunconfigurationid_value"]

    # Run Configuration のプロンプトを更新
    api_patch(f"msdyn_aiconfigurations({run_config_id})", {
        "msdyn_customconfiguration": json.dumps(updated_config, ensure_ascii=False)
    })
```

### べき等パターン（推奨）

```python
# 既存 AI Model を検索 → あれば更新、なければ新規作成
existing = api_get(f"msdyn_aimodels?$filter=msdyn_name eq '{PROMPT_NAME}'")
if existing.get("value"):
    model_id = existing["value"][0]["msdyn_aimodelid"]
    # Run Config を更新
    ...
else:
    # 新規作成
    model_id = api_post("msdyn_aimodels", model_body, solution=SOLUTION_NAME)
    ...
```

## .env 追加パラメータ

```env
# AI Builder AI Prompt 用（既存 .env に追加）
AI_PROMPT_NAME=AI Prompt Sample
AI_PROMPT_BOT_ID=https://copilotstudio.../bots/xxxxxxxx-xxxx-.../overview
# ↑ BOT_ID と異なるエージェントに追加する場合のみ指定
```


## デプロイ・トラブルシューティング

デプロイスクリプトテンプレート・ファイル入力制限事項・トラブルシューティングは [構築リファレンス](build-reference.md) を参照。
