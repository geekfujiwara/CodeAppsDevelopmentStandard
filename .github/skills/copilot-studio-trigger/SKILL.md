---
name: copilot-studio-trigger
description: "Copilot Studio エージェントに外部トリガー（メール受信・Teams メッセージ・スケジュール等）を追加する。Power Automate フローと ExternalTriggerComponent を連携させてエージェントを自動起動する。Use when: Copilot Studio トリガー, メール受信, エージェント自動起動, ExternalTriggerComponent, ExecuteCopilot, Power Automate トリガー, Office 365 Outlook, OnNewEmailV3, メールトリガー"
---

# Copilot Studio 外部トリガー構築スキル

Copilot Studio エージェントに **Power Automate フロー経由の外部トリガー** を追加する。
メール受信・Teams メッセージ・スケジュール等をきっかけにエージェントを自動起動する。

## 最重要方針: トリガーはすべて Copilot Studio UI で手動作成

```
❌ API でトリガーフロー（Power Automate）を事前作成 → うまくいかない。接続認証・フローID不一致等の問題が頻発
❌ ExternalTriggerComponent を API で登録 → Copilot Studio UI でアイコンが表示されない等の問題が発生
❌ フローの有効化を API で実行 → ConnectionAuthorizationFailed で失敗する
❌ ツール・ナレッジを API で追加 → API では追加不可

✅ トリガーの追加は Copilot Studio UI でユーザーが手動実行（UI がフローを自動生成・管理）
✅ フローの接続認証・有効化は Power Automate UI でユーザーが手動実行
✅ ツール・ナレッジも Copilot Studio UI でユーザーが手動追加
✅ エージェント公開は Copilot Studio UI または PvaPublish API で実行
```

### 重要な教訓

**API でメールトリガーフローを作成するアプローチは失敗する。** 理由:

- workflows テーブルへの INSERT でフロー定義は作れるが、接続認証が通らない
- Copilot Studio UI がフローを認識しない（flowId と Flow API ID の不一致）
- 手動で接続を認証してもフローが正常に動作しない

**正しいアプローチ:** Copilot Studio UI の「トリガー > + トリガーの追加」ですべてを行う。
UI がフロー作成・ExternalTriggerComponent 登録・接続参照をすべて自動で正しく生成する。

**「メールに返信する (V3)」コネクタの Attachments 属性問題:**

- 「メールに返信する (V3)」ツールは Attachments が AutomaticTaskInput として定義される
- エージェントが Attachments の値を解決できずに**処理がスタック**する
- UI でツールから Attachments 入力を削除しても根本的に不安定

**→ メール返信には「メールに返信する (V3)」コネクタではなく Work IQ Mail MCP を使うこと。**

- Work IQ Mail MCP（`mcp_MailTools`）はシンプルな MCP インターフェースで Attachments 問題が発生しない
- Copilot Studio UI で「ツール」→「+ ツールの追加」→「Microsoft 365 Outlook Mail (Preview)」→「Work IQ Mail (Preview)」で追加

### スクリプトが担当する範囲

| 作業                             | 方法                                   |
| -------------------------------- | -------------------------------------- |
| エージェントの Instructions 更新 | スクリプト（GPT コンポーネント PATCH） |
| エージェントの公開（PvaPublish） | スクリプト                             |
| トリガー・ツールの状態確認       | スクリプト（読み取りのみ）             |

### ユーザーが手動で行う範囲

| 作業                     | 場所              | 手順                                                  |
| ------------------------ | ----------------- | ----------------------------------------------------- |
| フローの接続認証・有効化 | Power Automate UI | フローを開く → 接続を認証 → 保存 → オンにする         |
| トリガーの追加           | Copilot Studio UI | エージェント → トリガー → 追加 → 作成したフローを選択 |
| ツールの追加             | Copilot Studio UI | エージェント → ツール → コネクタ/MCP Server を追加    |
| ナレッジの追加           | Copilot Studio UI | エージェント → ナレッジ → データソースを追加          |
| エージェントの公開       | Copilot Studio UI | 公開ボタンをクリック                                  |

## アーキテクチャ概要

```
外部イベント（メール / Teams / スケジュール等）
        ↓
Power Automate フロー（トリガー → ExecuteCopilot アクション）
        ↓
Copilot Studio エージェント（Instructions + ナレッジ + ツールで処理）
        ↓
応答（メール返信 / Teams 投稿 / Dataverse 更新等）
```

### コンポーネント構成

| コンポーネント               | 場所                                      | 役割                                                 |
| ---------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| **Power Automate フロー**    | workflows テーブル (category=5)           | トリガー検知 + ExecuteCopilot アクション実行         |
| **ExternalTriggerComponent** | botcomponents テーブル (componenttype=17) | Copilot Studio UI にトリガー情報を表示するメタデータ |
| **接続参照**                 | connectionreferences テーブル             | Copilot Studio コネクタ + トリガーコネクタの接続     |

### 重要: 2 つの Flow ID

ExternalTriggerComponent には 2 種類のフロー ID が存在する:

| キー                     | 説明                                          | 取得元                                               |
| ------------------------ | --------------------------------------------- | ---------------------------------------------------- |
| `flowId`                 | Dataverse `workflows` テーブルの `workflowid` | `api_get("workflows?$filter=...")`                   |
| `extensionData.flowName` | Flow API 上のフロー ID                        | Flow API `GET /flows` レスポンスの `name` フィールド |

`flowId` ≠ `extensionData.flowName` — 同じフローでも ID が異なる。

## 前提: 設計フェーズ完了後に構築に入る（必須）

**トリガーを追加する前に、設計をユーザーに提示し承認を得ていること。**

設計提示時に含める内容:

| 項目                   | 内容                                                                    |
| ---------------------- | ----------------------------------------------------------------------- |
| トリガー種別           | メール受信 / Teams メッセージ / スケジュール / Dataverse レコード変更等 |
| トリガー条件           | 件名フィルタ / チャネル / 実行スケジュール等                            |
| エージェントへの入力   | フローからエージェントに渡すメッセージの構成                            |
| エージェントの応答処理 | 応答をメール返信 / Teams 投稿 / レコード更新等に使うか                  |
| 必要な接続             | Office 365 Outlook, Microsoft Copilot Studio, Teams 等                  |

```
フロー: 設計提示 → ユーザー承認 → フロー作成（スクリプト） → ユーザーに手動操作を案内（フロー有効化 + トリガー追加 + 公開）
```

## 大前提: 一つのソリューション内に開発

フロー・接続参照・ExternalTriggerComponent は **すべてエージェントと同じソリューション内** に含める。

## 絶対遵守ルール

### ExternalTriggerComponent の構造

```yaml
kind: ExternalTriggerConfiguration
externalTriggerSource:
  kind: WorkflowExternalTrigger
  flowId: { dataverse_workflow_id }

extensionData:
  flowName: { flow_api_flow_id }
  flowUrl: /providers/Microsoft.ProcessSimple/environments/{env_id}/flows/{flow_api_flow_id}
  triggerConnectionType: { コネクタ表示名 }
```

- `componenttype=17` で botcomponents テーブルに作成
- schema 命名規則はトリガー種別で異なる:

| トリガー種別          | schema パターン（参考値）                                             | triggerConnectionType   |
| --------------------- | --------------------------------------------------------------------- | ----------------------- |
| メール受信            | `{botSchema}.ExternalTriggerComponent.{prefix}.{GUID}`                | `Office 365 Outlook`    |
| スケジュール          | `{botSchema}.ExternalTriggerComponent.RecurringCopilotTrigger.{GUID}` | `Schedule`              |
| Teams チャネル        | `{botSchema}.ExternalTriggerComponent.{prefix}.{GUID}`                | `Microsoft Teams`       |
| Teams チャット        | `{botSchema}.ExternalTriggerComponent.{prefix}.{GUID}`                | `Microsoft Teams`       |
| SharePoint            | `{botSchema}.ExternalTriggerComponent.{prefix}.{GUID}`                | `SharePoint`            |
| Dataverse             | `{botSchema}.ExternalTriggerComponent.{prefix}.{GUID}`                | `Microsoft Dataverse`   |
| OneDrive for Business | `{botSchema}.ExternalTriggerComponent.{prefix}.{GUID}`                | `OneDrive for Business` |

> **⚠️ schema prefix はランダム生成される**
> 短い 3 文字系の prefix（例: `dpT`, `gN6`, `8kY`, `fwD`, `yRl`, `V3`）は
> トリガーを削除して再作成すると**異なる値が生成される**ことが検証で確認済み。
> `RecurringCopilotTrigger`（スケジュール）のみ固定名。
>
> **→ スクリプトでトリガーを特定する際は schema prefix ではなく
> `triggerConnectionType`（YAML 内）を照合キーに使うこと。**
>
> Teams チャネルと Teams チャットは `triggerConnectionType` が同一（`Microsoft Teams`）なので、
> フローの `operationId`（`OnNewChannelMessage` vs `WebhookChatMessageTrigger`）で区別する。

### ExecuteCopilot アクションの構造

```json
{
  "type": "OpenApiConnection",
  "inputs": {
    "host": {
      "connectionName": "shared_microsoftcopilotstudio",
      "operationId": "ExecuteCopilot",
      "apiId": "/providers/Microsoft.PowerApps/apis/shared_microsoftcopilotstudio"
    },
    "parameters": {
      "Copilot": "{bot_schema_name}",
      "body/message": "{エージェントに渡すメッセージ}"
    },
    "authentication": "@parameters('$authentication')"
  }
}
```

- `Copilot` パラメータには Bot の **schemaname**（例: `{prefix}_YourAssistant`）を指定
- `body/message` にはトリガーから取得した情報を含むプロンプトテキストを渡す
- **★ `body/message` にはコンテキスト情報だけでなく、全ステップの実行指示を含めること**（上記「トリガー起動時にエージェントが途中で止まる」教訓を参照）

### 接続参照

フローには最低 2 つの接続参照が必要:

| 接続参照                        | コネクタ ID                                                         | 用途                                     |
| ------------------------------- | ------------------------------------------------------------------- | ---------------------------------------- |
| `shared_microsoftcopilotstudio` | `/providers/Microsoft.PowerApps/apis/shared_microsoftcopilotstudio` | Copilot Studio ExecuteCopilot アクション |
| トリガー用コネクタ              | トリガーに応じて異なる                                              | トリガーイベントの検知                   |

### 接続は環境内に事前作成が必要

```
❌ API で接続の自動作成はできない
✅ ユーザーが Power Automate UI で事前に接続を作成 → API で接続参照に紐付け
✅ Microsoft Copilot Studio コネクタの接続も事前に必要
✅ スケジュールトリガーはトリガー側のコネクタ接続が不要（Copilot Studio のみ）
```

### スケジュールトリガーの特性

```
✅ connectionReferences に shared_microsoftcopilotstudio のみ（トリガー用コネクタ不要）
✅ triggerConnectionType は "Schedule"（英語固定、日本語ではない）
✅ schema は .ExternalTriggerComponent.RecurringCopilotTrigger.{GUID}
✅ frequency: "Minute" / "Hour" / "Day" / "Week" / "Month"
✅ schedule オプション（hours/minutes）は frequency が Day 以上の場合に使用
✅ timeZone は schedule 指定時に設定（例: "Tokyo Standard Time"）
```

### OneDrive for Business トリガーの特性

```
✅ connectionReferences に shared_microsoftcopilotstudio + shared_onedriveforbusiness
✅ triggerConnectionType は "OneDrive for Business"（英語固定）
✅ schema は .ExternalTriggerComponent.{prefix}.{GUID}（prefix はランダム生成、照合には triggerConnectionType を使う）
✅ type は "OpenApiConnection"（ポーリング型、recurrence 必要 — SharePoint と同じ）
✅ operationId は "OnNewFileV2"（SharePoint の "GetOnNewFileItems" とは異なる）
✅ folderId はドライブアイテム ID 形式（"b!..." で始まる長い文字列）
✅ includeSubfolders でサブフォルダ内のファイル作成も検知可能
```

## 構築手順

### Step 1: 設計をユーザーに提示し承認を得る

設計提示時に含める内容:

| 項目                         | 内容                                                                    |
| ---------------------------- | ----------------------------------------------------------------------- |
| トリガー種別                 | メール受信 / Teams メッセージ / スケジュール / Dataverse レコード変更等 |
| トリガー条件                 | 件名フィルタ / チャネル / 実行スケジュール等                            |
| エージェントに追加するツール | メール返信 / Teams 投稿 / Dataverse 更新等                              |
| Instructions への追加内容    | トリガー起動時の振る舞い指示                                            |

### Step 2: ユーザーに手動操作を案内

**★ 以下のテンプレートをユーザーに提示する:**

```markdown
### 手動操作ガイド

#### Step A: トリガーの追加（Copilot Studio UI）

1. https://copilotstudio.microsoft.com/ を開く
2. 「{エージェント名}」を選択
3. 左メニュー「トリガー」を開く
4. 「+ トリガーの追加」をクリック
5. トリガー一覧から「{トリガー名}」を選択
6. 設定を確認して「トリガーの保存」

#### Step B: ツールの追加（応答処理にツールが必要な場合）

1. 左メニュー「ツール」→「+ ツールの追加」
2. メール返信が必要な場合: 「Microsoft 365 Outlook Mail (Preview)」→「Work IQ Mail (Preview)」を追加
   - ⚠️ 「メールに返信する (V3)」コネクタは使わない（Attachments 属性でスタックする問題あり）

#### Step C: フローの接続認証（Power Automate UI）

1. Copilot Studio がトリガー用に自動生成したフローを Power Automate UI で開く
2. 各アクションの接続を認証 → 保存 → オンにする

#### Step D: エージェントの公開（Copilot Studio UI）

1. 右上の「公開」ボタンをクリック
```

### Step 3: エージェントの Instructions 更新・公開（スクリプト）

ユーザーがトリガー・ツールを追加した後、必要に応じて:

- Instructions にトリガー起動時の振る舞いを追加
- PvaPublish でエージェントを公開

### （参考）廃止: API でのフロー作成パターン集

> **⚠️ 以下のコードパターンは参考資料として残していますが、実際のトリガー構築には使用しません。**
> **トリガーフローは Copilot Studio UI が自動生成するため、API での事前作成は不要です（うまくいきません）。**
> ExecuteCopilot プロンプトのテンプレートや接続参照の構造は、デバッグ時の参照用途で有用です。

```python
from auth_helper import get_token, DATAVERSE_URL
import requests

def find_connection_ref(connector_name_part):
    """接続参照をコネクタ名の部分一致で検索"""
    token = get_token()
    h = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    r = requests.get(
        f"{DATAVERSE_URL}/api/data/v9.2/connectionreferences"
        "?$select=connectionreferencelogicalname,connectionreferencedisplayname,connectorid,connectionid",
        headers=h,
    )
    results = []
    for cr in r.json().get("value", []):
        if connector_name_part in (cr.get("connectorid") or ""):
            results.append(cr)
    return results

# Copilot Studio コネクタの接続参照を検索
copilot_refs = find_connection_ref("shared_microsoftcopilotstudio")

# Office 365 Outlook コネクタの接続参照を検索
outlook_refs = find_connection_ref("shared_office365")
```

### Step 2: 接続参照の作成（なければ）

```python
def create_connection_ref(logical_name, display_name, connector_id, connection_id, solution_name):
    """接続参照をソリューション内に作成"""
    token = get_token()
    h = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "MSCRM.SolutionUniqueName": solution_name,
    }
    body = {
        "connectionreferencelogicalname": logical_name,
        "connectionreferencedisplayname": display_name,
        "connectorid": connector_id,
        "connectionid": connection_id,
    }
    r = requests.post(f"{DATAVERSE_URL}/api/data/v9.2/connectionreferences", headers=h, json=body)
    r.raise_for_status()
    return r
```

### Step 3: フロー定義の構築

#### メール受信トリガーの例

```python
import json, uuid

def build_email_trigger_flow(
    bot_schema_name,
    subject_filter,
    prompt_template,
    connref_copilot,
    connref_outlook,
):
    """メール受信時に Copilot Studio エージェントを起動するフロー定義を構築"""

    clientdata = {
        "properties": {
            "connectionReferences": {
                "shared_microsoftcopilotstudio": {
                    "runtimeSource": "embedded",
                    "connection": {
                        "connectionReferenceLogicalName": connref_copilot,
                    },
                    "api": {"name": "shared_microsoftcopilotstudio"},
                },
                "shared_office365": {
                    "runtimeSource": "embedded",
                    "connection": {
                        "connectionReferenceLogicalName": connref_outlook,
                    },
                    "api": {"name": "shared_office365"},
                },
            },
            "definition": {
                "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
                "contentVersion": "1.0.0.0",
                "parameters": {
                    "$connections": {"defaultValue": {}, "type": "Object"},
                    "$authentication": {"defaultValue": {}, "type": "SecureObject"},
                },
                "triggers": {
                    "When_a_new_email_arrives_V3": {
                        "type": "OpenApiConnectionNotification",
                        "inputs": {
                            "host": {
                                "connectionName": "shared_office365",
                                "operationId": "OnNewEmailV3",
                                "apiId": "/providers/Microsoft.PowerApps/apis/shared_office365",
                            },
                            "parameters": {
                                "subjectFilter": subject_filter,
                            },
                            "authentication": "@parameters('$authentication')",
                        },
                    },
                },
                "actions": {
                    "Send_prompt_to_Copilot": {
                        "runAfter": {},
                        "type": "OpenApiConnection",
                        "inputs": {
                            "host": {
                                "connectionName": "shared_microsoftcopilotstudio",
                                "operationId": "ExecuteCopilot",
                                "apiId": "/providers/Microsoft.PowerApps/apis/shared_microsoftcopilotstudio",
                            },
                            "parameters": {
                                "Copilot": bot_schema_name,
                                "body/message": prompt_template,
                            },
                            "authentication": "@parameters('$authentication')",
                        },
                    },
                },
            },
        },
        "schemaVersion": "1.0.0.0",
    }
    return clientdata
```

#### スケジュールトリガーの例

```python
def build_schedule_trigger_flow(
    bot_schema_name,
    prompt_message,
    connref_copilot,
    frequency="Minute",
    interval=30,
    schedule=None,
    time_zone=None,
):
    """スケジュール実行で Copilot Studio エージェントを起動するフロー定義を構築

    Args:
        frequency: "Minute" / "Hour" / "Day" / "Week" / "Month"
        interval: 実行間隔
        schedule: {"hours": ["9"], "minutes": ["0"]} （Day 以上で使用）
        time_zone: "Tokyo Standard Time" 等（schedule 指定時に必要）
    """

    recurrence = {
        "frequency": frequency,
        "interval": interval,
    }
    if schedule:
        recurrence["schedule"] = schedule
    if time_zone:
        recurrence["timeZone"] = time_zone

    clientdata = {
        "properties": {
            # ★ スケジュールは Copilot Studio コネクタのみ（トリガー用コネクタ不要）
            "connectionReferences": {
                "shared_microsoftcopilotstudio": {
                    "runtimeSource": "embedded",
                    "connection": {
                        "connectionReferenceLogicalName": connref_copilot,
                    },
                    "api": {"name": "shared_microsoftcopilotstudio"},
                },
            },
            "definition": {
                "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
                "contentVersion": "1.0.0.0",
                "parameters": {
                    "$connections": {"defaultValue": {}, "type": "Object"},
                    "$authentication": {"defaultValue": {}, "type": "SecureObject"},
                },
                "triggers": {
                    "Recurrence": {
                        "recurrence": recurrence,
                        "type": "Recurrence",
                    },
                },
                "actions": {
                    "Sends_a_prompt_to_the_specified_copilot_for_processing": {
                        "runAfter": {},
                        "type": "OpenApiConnection",
                        "inputs": {
                            "host": {
                                "connectionName": "shared_microsoftcopilotstudio",
                                "operationId": "ExecuteCopilot",
                                "apiId": "/providers/Microsoft.PowerApps/apis/shared_microsoftcopilotstudio",
                            },
                            "parameters": {
                                "Copilot": bot_schema_name,
                                "body/message": prompt_message,
                            },
                            "authentication": "@parameters('$authentication')",
                        },
                    },
                },
            },
        },
        "schemaVersion": "1.0.0.0",
    }
    return clientdata
```

#### SharePoint トリガーの例

````python
def build_sharepoint_trigger_flow(
    bot_schema_name,
    prompt_message,
    connref_copilot,
    connref_sharepoint,
    site_url,
    library_id,
):
    """SharePoint ファイル作成時に Copilot Studio エージェントを起動するフロー定義を構築

    Args:
        site_url: SharePoint サイト URL (例: "https://contoso.sharepoint.com/sites/demo")
        library_id: ドキュメントライブラリの ID (GUID)
    """

    clientdata = {
        "properties": {
            "connectionReferences": {
                "shared_microsoftcopilotstudio": {
                    "runtimeSource": "embedded",
                    "connection": {
                        "connectionReferenceLogicalName": connref_copilot,
                    },
                    "api": {"name": "shared_microsoftcopilotstudio"},
                },
                "shared_sharepointonline": {
                    "runtimeSource": "embedded",
                    "connection": {
                        "connectionReferenceLogicalName": connref_sharepoint,
                    },
                    "api": {"name": "shared_sharepointonline"},
                },
            },
            "definition": {
                "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
                "contentVersion": "1.0.0.0",
                "parameters": {
                    "$connections": {"defaultValue": {}, "type": "Object"},
                    "$authentication": {"defaultValue": {}, "type": "SecureObject"},
                },
                "triggers": {
                    "When_a_file_is_created_properties_only": {
                        "recurrence": {
                            "interval": 1,
                            "frequency": "Minute",
                        },
                        "type": "OpenApiConnection",
                        "inputs": {
                            "host": {
                                "connectionName": "shared_sharepointonline",
                                "operationId": "GetOnNewFileItems",
                                "apiId": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline",
                            },
                            "parameters": {
                                "dataset": site_url,
                                "table": library_id,
                            },
                            "authentication": "@parameters('$authentication')",
                        },
                    },
                },
                "actions": {
                    "Sends_a_prompt_to_the_specified_copilot_for_processing": {
                        "runAfter": {},
                        "type": "OpenApiConnection",
                        "inputs": {
                            "host": {
                                "connectionName": "shared_microsoftcopilotstudio",
                                "operationId": "ExecuteCopilot",
                                "apiId": "/providers/Microsoft.PowerApps/apis/shared_microsoftcopilotstudio",
                            },
                            "parameters": {
                                "Copilot": bot_schema_name,
                                "body/message": prompt_message,
                            },
                            "authentication": "@parameters('$authentication')",
                        },
                    },
                },
            },
        },
        "schemaVersion": "1.0.0.0",
    }
    return clientdata


#### OneDrive for Business トリガーの例

```python
def build_onedrive_trigger_flow(
    bot_schema_name,
    prompt_message,
    connref_copilot,
    connref_onedrive,
    folder_id,
    include_subfolders=True,
):
    """OneDrive for Business ファイル作成時に Copilot Studio エージェントを起動するフロー定義を構築

    Args:
        folder_id: OneDrive フォルダ ID（ドライブアイテム ID 形式、例: "b!FcKs..."）
        include_subfolders: サブフォルダも監視するか（デフォルト: True）
    """

    clientdata = {
        "properties": {
            # ★ OneDrive for Business は Copilot Studio + OneDrive の 2 コネクタ
            "connectionReferences": {
                "shared_microsoftcopilotstudio": {
                    "runtimeSource": "embedded",
                    "connection": {
                        "connectionReferenceLogicalName": connref_copilot,
                    },
                    "api": {"name": "shared_microsoftcopilotstudio"},
                },
                "shared_onedriveforbusiness": {
                    "runtimeSource": "embedded",
                    "connection": {
                        "connectionReferenceLogicalName": connref_onedrive,
                    },
                    "api": {"name": "shared_onedriveforbusiness"},
                },
            },
            "definition": {
                "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
                "contentVersion": "1.0.0.0",
                "parameters": {
                    "$connections": {"defaultValue": {}, "type": "Object"},
                    "$authentication": {"defaultValue": {}, "type": "SecureObject"},
                },
                "triggers": {
                    # ★ type は "OpenApiConnection"（ポーリング型、recurrence 必要）
                    # ★ operationId は "OnNewFileV2"
                    "ファイルが作成されたとき": {
                        "recurrence": {
                            "interval": 1,
                            "frequency": "Minute",
                        },
                        "type": "OpenApiConnection",
                        "inputs": {
                            "host": {
                                "connectionName": "shared_onedriveforbusiness",
                                "operationId": "OnNewFileV2",
                                "apiId": "/providers/Microsoft.PowerApps/apis/shared_onedriveforbusiness",
                            },
                            "parameters": {
                                "folderId": folder_id,
                                "includeSubfolders": include_subfolders,
                            },
                            "authentication": "@parameters('$authentication')",
                        },
                    },
                },
                "actions": {
                    "Sends_a_prompt_to_the_specified_copilot_for_processing": {
                        "runAfter": {},
                        "type": "OpenApiConnection",
                        "inputs": {
                            "host": {
                                "connectionName": "shared_microsoftcopilotstudio",
                                "operationId": "ExecuteCopilot",
                                "apiId": "/providers/Microsoft.PowerApps/apis/shared_microsoftcopilotstudio",
                            },
                            "parameters": {
                                "Copilot": bot_schema_name,
                                "body/message": prompt_message,
                            },
                            "authentication": "@parameters('$authentication')",
                        },
                    },
                },
            },
        },
        "schemaVersion": "1.0.0.0",
    }
    return clientdata
````

#### Dataverse トリガーの例

```python
def build_dataverse_trigger_flow(
    bot_schema_name,
    prompt_message,
    connref_copilot,
    connref_dataverse,
    entity_name,
    message=1,
    scope=4,
    filtering_attributes=None,
):
    """Dataverse レコード変更時に Copilot Studio エージェントを起動するフロー定義を構築

    Args:
        entity_name: テーブル論理名 (例: "{prefix}_yourtable")
        message: 1=Create, 2=Delete, 3=Update, 4=Create or Update
        scope: 1=User, 2=BusinessUnit, 3=ParentChildBusinessUnit, 4=Organization
        filtering_attributes: フィルタ列 (例: "{prefix}_status,{prefix}_priority") ※省略可
    """

    trigger_params = {
        "subscriptionRequest/message": message,
        "subscriptionRequest/entityname": entity_name,
        "subscriptionRequest/scope": scope,
    }
    if filtering_attributes:
        trigger_params["subscriptionRequest/filteringattributes"] = filtering_attributes

    clientdata = {
        "properties": {
            "connectionReferences": {
                "shared_microsoftcopilotstudio": {
                    "runtimeSource": "embedded",
                    "connection": {
                        "connectionReferenceLogicalName": connref_copilot,
                    },
                    "api": {"name": "shared_microsoftcopilotstudio"},
                },
                "shared_commondataserviceforapps": {
                    "runtimeSource": "embedded",
                    "connection": {
                        "connectionReferenceLogicalName": connref_dataverse,
                    },
                    "api": {"name": "shared_commondataserviceforapps"},
                },
            },
            "definition": {
                "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
                "contentVersion": "1.0.0.0",
                "parameters": {
                    "$connections": {"defaultValue": {}, "type": "Object"},
                    "$authentication": {"defaultValue": {}, "type": "SecureObject"},
                },
                "triggers": {
                    "行が追加、変更、または削除された場合": {
                        "type": "OpenApiConnectionWebhook",
                        "inputs": {
                            "host": {
                                "connectionName": "shared_commondataserviceforapps",
                                "operationId": "SubscribeWebhookTrigger",
                                "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
                            },
                            "parameters": trigger_params,
                            "authentication": "@parameters('$authentication')",
                        },
                    },
                },
                "actions": {
                    "Sends_a_prompt_to_the_specified_copilot_for_processing": {
                        "runAfter": {},
                        "type": "OpenApiConnection",
                        "inputs": {
                            "host": {
                                "connectionName": "shared_microsoftcopilotstudio",
                                "operationId": "ExecuteCopilot",
                                "apiId": "/providers/Microsoft.PowerApps/apis/shared_microsoftcopilotstudio",
                            },
                            "parameters": {
                                "Copilot": bot_schema_name,
                                "body/message": prompt_message,
                            },
                            "authentication": "@parameters('$authentication')",
                        },
                    },
                },
            },
        },
        "schemaVersion": "1.0.0.0",
    }
    return clientdata
```

### Step 4: フローの作成（workflow レコード）

```python
def deploy_trigger_flow(flow_name, clientdata, solution_name):
    """トリガーフローを Dataverse workflows テーブルに作成"""
    token = get_token()
    h = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "MSCRM.SolutionUniqueName": solution_name,
    }

    # べき等: 既存フロー検索
    existing = api_get("workflows", {
        "$filter": f"name eq '{flow_name}' and category eq 5",
        "$select": "workflowid,statecode",
    })

    if existing.get("value"):
        wf_id = existing["value"][0]["workflowid"]
        # 無効化 → 削除 → 再作成
        api_patch(f"workflows({wf_id})", {"statecode": 0, "statuscode": 1})
        api_delete(f"workflows({wf_id})")

    # 新規作成
    workflow_body = {
        "name": flow_name,
        "type": 1,
        "category": 5,
        "statecode": 0,
        "statuscode": 1,
        "primaryentity": "none",
        "clientdata": json.dumps(clientdata, ensure_ascii=False),
    }

    r = requests.post(
        f"{DATAVERSE_URL}/api/data/v9.2/workflows",
        headers=h, json=workflow_body,
    )
    r.raise_for_status()

    # 作成された workflow ID を取得
    wf_id = r.headers.get("OData-EntityId", "").split("(")[-1].rstrip(")")
    return wf_id
```

### Step 5: ユーザーへの手動操作案内（フロー有効化 + トリガー追加 + 公開）

フロー作成（Draft 状態）まではスクリプトで完了。以降はユーザーに手動操作を案内する。

**★ 以下のテンプレートをユーザーに提示する（フロー名・エージェント名を埋めて）:**

```markdown
### 手動操作ガイド

#### Step A: フローの接続認証と有効化（Power Automate UI）

1. https://make.powerautomate.com を開く
2. 左メニュー「ソリューション」→「{ソリューション表示名}」
3. 「{フロー名}」を開く
4. 各アクションの接続アイコンをクリックしてサインイン（認証）
5. 「保存」→「オンにする」

#### Step B: トリガーの追加（Copilot Studio UI）

1. https://copilotstudio.microsoft.com/ を開く
2. 「{エージェント名}」を選択
3. 左メニュー「トリガー」を開く
4. 「+ トリガーの追加」をクリック
5. トリガー一覧から「{トリガー名}」（例: 新しいメールが届いたとき (V3) / Office 365 Outlook）を選択
6. 「次へ」をクリック
7. 作成済みのフロー「{フロー名}」が表示されるので選択
8. 「トリガーの保存」をクリック

##### Copilot Studio で選択可能なトリガー一覧（参考）

| トリガー名                                 | コネクタ              |
| ------------------------------------------ | --------------------- |
| Recurrence                                 | Schedule              |
| 新しい応答が送信されるとき                 | Microsoft Forms       |
| 項目が作成されたとき                       | SharePoint            |
| アイテムが作成または変更されたとき         | SharePoint            |
| ファイルが作成されたとき                   | OneDrive for Business |
| チャネルに新しいメッセージが追加されたとき | Microsoft Teams       |
| 行が追加、変更、または削除された場合       | Microsoft Dataverse   |
| 新しいメールが届いたとき (V3)              | Office 365 Outlook    |
| タスクが完了したとき                       | Planner               |
| アイテムまたはファイルが修正されたとき     | SharePoint            |
| ファイルが作成されたとき (プロパティのみ)  | SharePoint            |

> 「すべて」タブで全コネクタを検索可能。上記は「おすすめ」タブの一覧。

#### Step C: ツールの追加（応答処理にツールが必要な場合）

応答処理でメール返信等が必要な場合、エージェントにツールを追加します。

1. 左メニュー「ツール」→「+ ツールの追加」
2. メール返信が必要な場合: 「Microsoft 365 Outlook Mail (Preview)」→「Work IQ Mail (Preview)」を追加
   - ⚠️ 「メールに返信する (V3)」コネクタは使わない（Attachments 属性でスタックする問題あり）

#### Step D: エージェントの公開（Copilot Studio UI）

1. 右上の「公開」ボタンをクリック
2. 公開完了を待つ
```

```
❌ ExternalTriggerComponent を API で登録
   → Copilot Studio UI でアイコンが表示されない
   → flowId と flowName の不一致で UI が認識しない
   → フロー有効化前に登録すると不整合が発生

✅ Copilot Studio UI でトリガーを追加
   → UI がフローを自動検出し、ExternalTriggerComponent を正しく生成
   → アイコン・フロー URL・接続情報が正確に設定される
   → フロー有効化後に追加するため接続エラーが発生しない
```

### Step 6（廃止）: Flow API ID の取得

> **この手順は不要になりました。** ExternalTriggerComponent は Copilot Studio UI が自動生成するため、
> Flow API ID を手動で取得する必要はありません。

### Step 7（廃止）: エージェントの再公開

> **この手順は不要になりました。** ユーザーが Copilot Studio UI でトリガーを追加した後、
> UI の「公開」ボタンで公開します。


## トリガーパターン・設計ガイド

詳細なトリガーパターン（メール受信、Teams、スケジュール、Dataverse、SharePoint、OneDrive）は [トリガーパターンリファレンス](./references/trigger-patterns.md) を参照。

Teams 連携の設計ガイド・フロー後処理パターン・トラブルシューティングは [トラブルシューティング・設計ガイド](./references/troubleshooting.md) を参照。

## .env 項目

```env
# トリガー関連は BOT_ID と SOLUTION_NAME を使用（追加設定不要）
BOT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SOLUTION_NAME={YourSolutionName}
```
