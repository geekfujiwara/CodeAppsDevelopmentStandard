---
name: ai-builder-prompt
description: "AI Builder の AI プロンプトを作成し Copilot Studio エージェントにツールとして追加する。Use when: AI Builder, AI プロンプト, GPT Prompt, AIプロンプト作成, エージェントツール追加, msdyn_aimodel, InvokeAIBuilderModelTaskAction, プロンプトデプロイ, AI Prompt"
---

# AI Builder AI プロンプト構築スキル

AI Builder の **AI プロンプト（GPT Dynamic Prompt）** を Dataverse API で作成し、
Copilot Studio エージェントに **ツール（アクション）** として追加する。

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

### Step 1: AI Model 作成

```python
from auth_helper import api_get, api_post, api_patch

SOLUTION_NAME = os.environ["SOLUTION_NAME"]
GPT_PROMPT_TEMPLATE_ID = "edfdb190-3791-45d8-9a6c-8f90a37c278a"

# AI Model 作成
model_body = {
    "msdyn_name": PROMPT_NAME,
    "_msdyn_templateid_value": GPT_PROMPT_TEMPLATE_ID,
    "msdyn_sharewithorganizationoncreate": False,
    "statecode": 0,  # Draft で作成
    "statuscode": 0,
}
model_id = api_post("msdyn_aimodels", model_body, solution=SOLUTION_NAME)
print(f"AI Model created: {model_id}")
```

### Step 2: Training Configuration 作成

```python
# Training Configuration (type=190690000)
training_body = {
    "_msdyn_aimodelid_value": model_id,
    "msdyn_type": 190690000,
    "msdyn_name": f"{model_id}_Training_{datetime.utcnow().strftime('%m/%d/%Y %I:%M:%S %p')}",
    "msdyn_modelrundataspecification": json.dumps({
        "schemaVersion": 2,
        "input": {},
        "output": {}
    }),
}
training_config_id = api_post("msdyn_aiconfigurations", training_body, solution=SOLUTION_NAME)
print(f"Training config created: {training_config_id}")
```

### Step 3: Run Configuration 作成（プロンプト定義を含む）

```python
# msdyn_customconfiguration JSON を構築
custom_config = {
    "version": "GptDynamicPrompt-2",
    "prompt": PROMPT_SEGMENTS,       # [{"type":"literal","text":"..."}, {"type":"inputVariable","id":"..."}]
    "definitions": {
        "inputs": INPUT_DEFINITIONS, # [{"id":"text","text":"text","type":"text","quickTestValue":"..."}]
        "formulas": [],
        "data": [],
        "output": OUTPUT_DEFINITION  # {"formats":["text"]} or {"formats":["json"],"jsonSchema":...,"jsonExamples":...}
    },
    "modelParameters": {
        "modelType": MODEL_TYPE,     # "gpt-41-mini"
        "gptParameters": {
            "temperature": TEMPERATURE  # 0 ~ 1
        }
    },
    "settings": {
        "recordRetrievalLimit": 30,
        "shouldPreserveRecordLinks": None,
        "runtime": None
    },
    "code": "",
    "signature": ""
}

# Run Configuration (type=190690001)
run_body = {
    "_msdyn_aimodelid_value": model_id,
    "msdyn_type": 190690001,
    "msdyn_name": f"{model_id}_{datetime.utcnow().strftime('%m/%d/%Y %I:%M:%S %p')}",
    "msdyn_customconfiguration": json.dumps(custom_config, ensure_ascii=False),
    "_msdyn_trainedmodelaiconfigurationpareid_value": training_config_id,
    "statecode": 2,
    "statuscode": 7,
}
run_config_id = api_post("msdyn_aiconfigurations", run_body, solution=SOLUTION_NAME)
print(f"Run config created: {run_config_id}")
```

### Step 4: AI Model をアクティブ化

```python
# Model の active run configuration を設定 & アクティブ化
api_patch(f"msdyn_aimodels({model_id})", {
    "msdyn_name": PROMPT_NAME,
    "_msdyn_activerunconfigurationid_value": run_config_id,
    "statecode": 1,
    "statuscode": 1,
})
print("AI Model activated")
```

### Step 5: botcomponent 作成（エージェントへの追加）

```python
# Bot の schemaname を取得して schemaname を構築
bot_data = api_get(f"bots({bot_id})?$select=schemaname")
bot_schema = bot_data.get("schemaname", "")
# スペースを除去してアクション名を作成
action_name = PROMPT_NAME.replace(" ", "")
comp_schemaname = f"{bot_schema}.action.{action_name}"

# inputs YAML を構築
inputs_yaml_lines = []
for inp in INPUT_DEFINITIONS:
    inputs_yaml_lines.append(f"  - kind: AutomaticTaskInput")
    inputs_yaml_lines.append(f"    propertyName: {inp['id']}")
    inputs_yaml_lines.append(f"    name: {inp['id']}")
    inputs_yaml_lines.append(f"    shouldPromptUser: true")
    inputs_yaml_lines.append("")

inputs_yaml = "\n".join(inputs_yaml_lines)

# botcomponent YAML（PVA ダブル改行フォーマット）
comp_data = (
    f"kind: TaskDialog\n\n"
    f"inputs:\n{inputs_yaml}\n\n"
    f"modelDisplayName: {PROMPT_NAME}\n\n"
    f"modelDescription: {PROMPT_DESCRIPTION}\n\n"
    f"action:\n"
    f"  kind: InvokeAIBuilderModelTaskAction\n"
    f"  aIModelId: {model_id}\n\n"
    f"outputMode: All\n\n"
)

# botcomponent を作成
comp_body = {
    "name": PROMPT_NAME,
    "schemaname": comp_schemaname,
    "componenttype": 9,
    "_parentbotid_value": bot_id,
    "data": comp_data,
    "description": PROMPT_DESCRIPTION,
}
comp_id = api_post("botcomponents", comp_body, solution=SOLUTION_NAME)
print(f"Bot component created: {comp_id}")
```

### Step 6: エージェント再公開

```python
api_post(f"bots({bot_id})/Microsoft.Dynamics.CRM.PvaPublish", {})
print("Agent republished")
```

### Step 7: ソリューション含有検証

```python
from auth_helper import api_post

# AI Model をソリューションに追加（componenttype=401 = AIConfiguration）
# Note: AI Model 自体は componenttype=401 で登録される
api_post("AddSolutionComponent", {
    "ComponentId": training_config_id,
    "ComponentType": 401,
    "SolutionUniqueName": SOLUTION_NAME,
    "AddRequiredComponents": False,
    "IncludedComponentSettingsValues": None,
})
api_post("AddSolutionComponent", {
    "ComponentId": run_config_id,
    "ComponentType": 401,
    "SolutionUniqueName": SOLUTION_NAME,
    "AddRequiredComponents": False,
    "IncludedComponentSettingsValues": None,
})
print("Solution components verified")
```

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

## デプロイスクリプトのテンプレート

```python
"""AI Builder AI Prompt をデプロイし Copilot Studio エージェントにツールとして追加する。"""
import json
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from auth_helper import api_get, api_post, api_patch
from dotenv import load_dotenv

load_dotenv()

# === 設定 ===
SOLUTION_NAME = os.environ["SOLUTION_NAME"]
BOT_ID_OR_URL = os.environ.get("AI_PROMPT_BOT_ID") or os.environ["BOT_ID"]
GPT_PROMPT_TEMPLATE_ID = "edfdb190-3791-45d8-9a6c-8f90a37c278a"

# Bot ID 解決
m = re.search(r"bots/([0-9a-f-]{36})", BOT_ID_OR_URL)
bot_id = m.group(1) if m else BOT_ID_OR_URL

# === AI Prompt 定義 ===
PROMPT_NAME = "AI Prompt Sample"
PROMPT_DESCRIPTION = "AI Prompt Sample"
MODEL_TYPE = "gpt-41-mini"
TEMPERATURE = 0

PROMPT_SEGMENTS = [
    {"type": "literal", "text": " "},
    {"type": "inputVariable", "id": "text"},
    {"type": "literal", "text": " の情報を分析してレポートを作成する。"},
]

INPUT_DEFINITIONS = [
    {
        "id": "text",
        "text": "text",
        "type": "text",
        "quickTestValue": "テスト用サンプルテキスト",
    },
]

OUTPUT_DEFINITION = {
    "formats": ["text"],
}
# JSON 出力の場合:
# OUTPUT_DEFINITION = {
#     "formats": ["json"],
#     "jsonSchema": {"type": "object", "properties": {"summary": {"type": "string"}}},
#     "jsonExamples": [{"summary": "サンプル出力"}],
# }

# === デプロイ関数 ===
def deploy():
    now_str = datetime.now(timezone.utc).strftime("%m/%d/%Y %I:%M:%S %p")

    # Step 1: 既存 AI Model を検索（べき等）
    print("[1/7] AI Model 検索...")
    existing = api_get(
        f"msdyn_aimodels?$filter=msdyn_name eq '{PROMPT_NAME}'"
        f"&$select=msdyn_aimodelid,msdyn_name,_msdyn_activerunconfigurationid_value"
    )

    if existing.get("value"):
        model_id = existing["value"][0]["msdyn_aimodelid"]
        print(f"  既存 AI Model 発見: {model_id}")

        # Run Config を更新
        run_config_id = existing["value"][0].get("_msdyn_activerunconfigurationid_value")
        if run_config_id:
            print("[2/7] Run Configuration 更新...")
            custom_config = _build_custom_config()
            api_patch(f"msdyn_aiconfigurations({run_config_id})", {
                "msdyn_customconfiguration": json.dumps(custom_config, ensure_ascii=False),
            })
            print(f"  Run Config 更新完了: {run_config_id}")
        else:
            print("  ⚠ Active Run Config なし — 新規作成します")
            run_config_id = _create_configs(model_id, now_str)
    else:
        # 新規作成
        print("[1/7] AI Model 作成...")
        model_body = {
            "msdyn_name": PROMPT_NAME,
            "_msdyn_templateid_value": GPT_PROMPT_TEMPLATE_ID,
            "msdyn_sharewithorganizationoncreate": False,
        }
        model_id = api_post("msdyn_aimodels", model_body, solution=SOLUTION_NAME)
        print(f"  AI Model 作成完了: {model_id}")

        run_config_id = _create_configs(model_id, now_str)

    # Step 5: botcomponent 作成/更新（エージェントへの追加）
    print("[5/7] Bot Component 作成/更新...")
    _create_or_update_bot_component(model_id, bot_id)

    # Step 6: エージェント再公開
    print("[6/7] エージェント公開...")
    api_post(f"bots({bot_id})/Microsoft.Dynamics.CRM.PvaPublish", {})

    # Step 7: ソリューション検証
    print("[7/7] ソリューション含有検証...")
    # AddSolutionComponent は既に solution ヘッダーで追加済み

    print("\n✅ AI Prompt デプロイ完了!")
    print(f"  Model: {PROMPT_NAME} ({model_id})")
    print(f"  Agent: {bot_id}")


def _build_custom_config():
    return {
        "version": "GptDynamicPrompt-2",
        "prompt": PROMPT_SEGMENTS,
        "definitions": {
            "inputs": INPUT_DEFINITIONS,
            "formulas": [],
            "data": [],
            "output": OUTPUT_DEFINITION,
        },
        "modelParameters": {
            "modelType": MODEL_TYPE,
            "gptParameters": {"temperature": TEMPERATURE},
        },
        "settings": {
            "recordRetrievalLimit": 30,
            "shouldPreserveRecordLinks": None,
            "runtime": None,
        },
        "code": "",
        "signature": "",
    }


def _create_configs(model_id, now_str):
    # Training Configuration
    print("[2/7] Training Configuration 作成...")
    training_body = {
        "_msdyn_aimodelid_value": model_id,
        "msdyn_type": 190690000,
        "msdyn_name": f"{model_id}_Training_{now_str}",
        "msdyn_modelrundataspecification": json.dumps({
            "schemaVersion": 2, "input": {}, "output": {}
        }),
    }
    training_config_id = api_post("msdyn_aiconfigurations", training_body, solution=SOLUTION_NAME)
    print(f"  Training Config: {training_config_id}")

    # Run Configuration
    print("[3/7] Run Configuration 作成...")
    custom_config = _build_custom_config()
    run_body = {
        "_msdyn_aimodelid_value": model_id,
        "msdyn_type": 190690001,
        "msdyn_name": f"{model_id}_{now_str}",
        "msdyn_customconfiguration": json.dumps(custom_config, ensure_ascii=False),
        "_msdyn_trainedmodelaiconfigurationpareid_value": training_config_id,
    }
    run_config_id = api_post("msdyn_aiconfigurations", run_body, solution=SOLUTION_NAME)
    print(f"  Run Config: {run_config_id}")

    # Model アクティブ化
    print("[4/7] AI Model アクティブ化...")
    api_patch(f"msdyn_aimodels({model_id})", {
        "msdyn_name": PROMPT_NAME,
        "_msdyn_activerunconfigurationid_value": run_config_id,
        "statecode": 1,
        "statuscode": 1,
    })
    return run_config_id


def _create_or_update_bot_component(model_id, bot_id):
    # Bot の schemaname を取得
    bot_data = api_get(f"bots({bot_id})?$select=schemaname")
    bot_schema = bot_data.get("schemaname", "")
    action_name = PROMPT_NAME.replace(" ", "")
    comp_schemaname = f"{bot_schema}.action.{action_name}"

    # 既存コンポーネントを検索
    existing_comp = api_get(
        f"botcomponents?$filter=_parentbotid_value eq '{bot_id}'"
        f" and schemaname eq '{comp_schemaname}'"
        f"&$select=botcomponentid,schemaname"
    )

    # YAML 構築
    inputs_lines = []
    for inp in INPUT_DEFINITIONS:
        inputs_lines.append(f"  - kind: AutomaticTaskInput")
        inputs_lines.append(f"    propertyName: {inp['id']}")
        inputs_lines.append(f"    name: {inp['id']}")
        inputs_lines.append(f"    shouldPromptUser: true")
        inputs_lines.append("")

    comp_data = (
        "kind: TaskDialog\n\n"
        "inputs:\n" + "\n".join(inputs_lines) + "\n\n"
        f"modelDisplayName: {PROMPT_NAME}\n\n"
        f"modelDescription: {PROMPT_DESCRIPTION}\n\n"
        "action:\n"
        "  kind: InvokeAIBuilderModelTaskAction\n"
        f"  aIModelId: {model_id}\n\n"
        "outputMode: All\n\n"
    )

    if existing_comp.get("value"):
        comp_id = existing_comp["value"][0]["botcomponentid"]
        api_patch(f"botcomponents({comp_id})", {"data": comp_data})
        print(f"  Bot Component 更新: {comp_id}")
    else:
        comp_body = {
            "name": PROMPT_NAME,
            "schemaname": comp_schemaname,
            "componenttype": 9,
            "_parentbotid_value": bot_id,
            "data": comp_data,
            "description": PROMPT_DESCRIPTION,
        }
        comp_id = api_post("botcomponents", comp_body, solution=SOLUTION_NAME)
        print(f"  Bot Component 作成: {comp_id}")


if __name__ == "__main__":
    deploy()
```

## ファイル入力（Image or Document Input）の制限事項

公式ドキュメント: https://learn.microsoft.com/en-us/microsoft-copilot-studio/add-inputs-prompt#limitations

### 対応ファイル形式

| 条件                          | 対応形式                                                                  |
| ----------------------------- | ------------------------------------------------------------------------- |
| 標準（Code Interpreter オフ） | **PNG, JPG, JPEG, PDF** のみ                                              |
| Code Interpreter オン         | 上記 + **Word (.doc/.docx), Excel (.xls/.xlsx), PowerPoint (.ppt/.pptx)** |

> Code Interpreter を有効にするには: プロンプト設定 → Code Interpreter をオンにする。
> 詳細: https://learn.microsoft.com/en-us/microsoft-copilot-studio/code-interpreter-for-prompts

### サイズ・ページ数・時間制限

| 制限項目           | 値                                         |
| ------------------ | ------------------------------------------ |
| ファイルサイズ合計 | **25 MB 未満**（全ファイル合計）           |
| ページ数           | **50 ページ未満**                          |
| 処理タイムアウト   | **100 秒**（超過するとタイムアウトエラー） |

### その他の制限

- **大きなドキュメントからの情報抽出**は不正確・不完全になる場合がある（特にテーブル行）
- **Copilot Studio エージェントのツールとして追加された AI プロンプト**では、画像/ドキュメント入力は**未対応**
  - つまり、エージェントが自動的にユーザーのファイルを AI プロンプトに渡すことはできない
  - ファイル処理が必要な場合は **Power Automate フロー経由**で AI プロンプトを呼び出す
- モデルによって入出力トークン数の上限と課金レベルが異なる

### 非対応ファイルの回避策（★ ベストプラクティス）

非対応ファイル形式を処理する場合は、以下の 2 つのアプローチがある:

**アプローチ 1: OneDrive for Business PDF 変換（Power Automate フロー内）**

- OneDrive `CreateFile` → `ConvertFile`(PDF) → AI Builder → `DeleteFile`
- 変換対応: doc, docx, epub, eml, htm, html, md, msg, odp, ods, odt, pps, ppsx, ppt, pptx, rtf, tif, tiff, xls, xlsm, xlsx
- 詳細は `power-automate-flow` スキルの「OneDrive PDF 変換パターン」を参照

**アプローチ 2: Code Interpreter を有効化（AI プロンプト設定）**

- Word/Excel/PowerPoint を直接処理可能
- ただし PDF/画像以外の形式（msg, eml, html, md 等）には対応しない
- Copilot Studio エージェントのツールとしては使用不可

```
★ ユーザーへの案内テンプレート:

  AI Builder AI プロンプトのファイル入力には以下の制限があります:

  【対応ファイル形式】
  ・標準: PNG, JPG, JPEG, PDF のみ
  ・Code Interpreter 有効時: 上記 + Word, Excel, PowerPoint

  【サイズ・ページ制限】
  ・ファイルサイズ: 全ファイル合計 25 MB 未満
  ・ページ数: 50 ページ未満
  ・処理時間: 100 秒以内

  【重要な制限】
  ・エージェントのツールとしてのファイル入力は未対応です
  ・大きなドキュメント（特にテーブル）は抽出精度が下がる場合があります

  【非対応形式の対応策】
  ・Power Automate フロー内で OneDrive ConvertFile を使い PDF 変換する
  ・Code Interpreter を有効にして Word/Excel/PowerPoint を直接処理する

  参照: https://learn.microsoft.com/en-us/microsoft-copilot-studio/add-inputs-prompt#limitations
```

## トラブルシューティング

### AI Model 作成時のエラー

| エラー          | 原因                    | 対策                                              |
| --------------- | ----------------------- | ------------------------------------------------- |
| 400 Bad Request | テンプレート ID が不正  | 固定値 `edfdb190-...` を使用                      |
| 403 Forbidden   | AI Builder が環境で無効 | Power Platform 管理センターで AI Builder を有効化 |
| 409 Conflict    | 同名の AI Model が存在  | べき等パターンで検索→更新                         |

### botcomponent 作成時のエラー

| エラー               | 原因                   | 対策                         |
| -------------------- | ---------------------- | ---------------------------- |
| Duplicate schemaname | 同じ schemaname が存在 | 既存を検索して PATCH で更新  |
| YAML parse error     | YAML フォーマット不正  | yaml.dump() を使わず手動構築 |

### エージェントに表示されない

1. `componenttype=9` であることを確認
2. `_parentbotid_value` が正しい Bot ID を指していることを確認
3. `action.aIModelId` が存在する `msdyn_aimodel` を指していることを確認
4. エージェントを再公開（PvaPublish）したことを確認

### AI Model が実行時にエラーになる

1. `msdyn_customconfiguration` の JSON が正しいことを確認
2. `_msdyn_activerunconfigurationid_value` が Run Config を指していることを確認
3. `statecode=1`（Active）であることを確認
