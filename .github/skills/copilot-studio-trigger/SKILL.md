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

## トリガーパターン集

### パターン 1: メール受信 → エージェント起動

```python
# ★ リファレンスフロー定義（新しいメールが届いたとき (V3)）
# Dataverse workflow ID: 98f51416-e036-f111-88b4-7c1e527df0b0
# Flow API ID: f2ebc605-2439-a8e2-1987-97877e6371f7

# connectionReferences: Copilot Studio + Office 365 Outlook の 2 つ
connection_refs = {
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
}

# トリガー: Office 365 Outlook OnNewEmailV3
trigger = {
    "新しいメールが届いたとき_(V3)": {
        "type": "OpenApiConnectionNotification",
        "inputs": {
            "host": {
                "connectionName": "shared_office365",
                "operationId": "OnNewEmailV3",
                "apiId": "/providers/Microsoft.PowerApps/apis/shared_office365",
            },
            "parameters": {
                "subjectFilter": "【社内インシデント】",  # 件名フィルタ
            },
            "authentication": "@parameters('$authentication')",
        },
    },
}

# ExecuteCopilot アクション
action = {
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
                "Copilot": bot_schema_name,  # ★ schemaname（GUID 不可）
                "body/message": (
                    "以下のメールを受信しました。内容を分析し適切に対応してください。\n\n"
                    "メールの本文:\n@{triggerBody()}"
                ),
            },
            "authentication": "@parameters('$authentication')",
        },
    },
}

# ExternalTriggerComponent
# triggerConnectionType: "Office 365 Outlook"
# schema: {botSchema}.ExternalTriggerComponent.{prefix}.{GUID}  ※prefix はランダム生成
# ★ 照合は triggerConnectionType(Office 365 Outlook) で行う
```

### パターン 2: Teams メッセージ → エージェント起動

Teams 連携はユーザーの要望を正確にヒアリングして 3 つの方式から選択する。
詳細は後述の **「Teams 連携の設計ガイド」** セクションを参照。

#### パターン 2a: Teams チャネルメッセージ → エージェント起動

```python
# ★ リファレンスフロー定義（チャネルに新しいメッセージが追加されたとき）
# Dataverse workflow ID: 2aa1648c-fa36-f111-88b4-7c1e527df0b0
# Flow API ID: 98cbd6c3-99e1-7a13-acbc-1b888a3e67a3

# connectionReferences: Copilot Studio + Microsoft Teams
connection_refs = {
    "shared_microsoftcopilotstudio": {
        "runtimeSource": "embedded",
        "connection": {
            "connectionReferenceLogicalName": connref_copilot,
        },
        "api": {"name": "shared_microsoftcopilotstudio"},
    },
    "shared_teams": {
        "runtimeSource": "embedded",
        "connection": {
            "connectionReferenceLogicalName": connref_teams,
        },
        "api": {"name": "shared_teams"},
    },
}

# トリガー: チャネルに新しいメッセージが追加されたとき
# ★ type は "OpenApiConnection"（Notification ではない）
# ★ operationId は "OnNewChannelMessage"（V2 ではない）
# ★ recurrence が必要（ポーリング型トリガー）
trigger = {
    "チャネルに新しいメッセージが追加されたとき": {
        "recurrence": {
            "interval": 1,
            "frequency": "Minute",
        },
        "type": "OpenApiConnection",
        "inputs": {
            "host": {
                "connectionName": "shared_teams",
                "operationId": "OnNewChannelMessage",
                "apiId": "/providers/Microsoft.PowerApps/apis/shared_teams",
            },
            "parameters": {
                "groupId": group_id,      # Teams チームの ID
                "channelId": channel_id,   # Teams チャネルの ID
            },
            "authentication": "@parameters('$authentication')",
        },
    },
}

# ExecuteCopilot アクション
action = {
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
                "body/message": "チャネルのメッセージ: @{triggerBody()}",
            },
            "authentication": "@parameters('$authentication')",
        },
    },
}

# ExternalTriggerComponent
# triggerConnectionType: "Microsoft Teams"
# schema: {botSchema}.ExternalTriggerComponent.{prefix}.{GUID}  ※prefix はランダム生成
# ★ 照合は triggerConnectionType + operationId(OnNewChannelMessage) で行う
```

##### groupId と channelId の取得方法

ユーザーに **Teams チャネルのリンク** を提供してもらい、URL からパラメータを抽出する:

```
例: https://teams.cloud.microsoft/l/channel/19%3Aabcdef1234567890abcdef1234567890%40thread.tacv2/%E4%B8%80%E8%88%AC?groupId=11111111-2222-3333-4444-555555555555&tenantId=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
```

```python
from urllib.parse import urlparse, parse_qs, unquote

def parse_teams_channel_url(url):
    """Teams チャネル URL から groupId と channelId を抽出"""
    parsed = urlparse(url)
    # channelId は URL パスの /channel/{channelId}/ 部分
    path_parts = parsed.path.split("/")
    channel_idx = path_parts.index("channel") if "channel" in path_parts else -1
    channel_id = unquote(path_parts[channel_idx + 1]) if channel_idx >= 0 else None

    # groupId はクエリパラメータ
    qs = parse_qs(parsed.query)
    group_id = qs.get("groupId", [None])[0]

    return {"groupId": group_id, "channelId": channel_id}

# 使用例
info = parse_teams_channel_url("https://teams.cloud.microsoft/l/channel/19%3A...%40thread.tacv2/...?groupId=11111111-...")
# → {"groupId": "11111111-...", "channelId": "19:abcdef12...@thread.tacv2"}
```

#### パターン 2b: Teams チャットメッセージ → エージェント起動

```python
# ★ リファレンスフロー定義（チャットに新しいメッセージが追加されたとき）
# Dataverse workflow ID: 37ec69e6-fa36-f111-88b4-7c1e527df0b0
# Flow API ID: 1385db20-9a7d-3c86-489c-3488cac530fc

# connectionReferences: Copilot Studio + Microsoft Teams（チャネルと同じ）
connection_refs = {
    "shared_microsoftcopilotstudio": {
        "runtimeSource": "embedded",
        "connection": {
            "connectionReferenceLogicalName": connref_copilot,
        },
        "api": {"name": "shared_microsoftcopilotstudio"},
    },
    "shared_teams": {
        "runtimeSource": "embedded",
        "connection": {
            "connectionReferenceLogicalName": connref_teams,
        },
        "api": {"name": "shared_teams"},
    },
}

# トリガー: チャットに新しいメッセージが追加されたとき
# ★ type は "OpenApiConnectionWebhook"（チャネルの OpenApiConnection と異なる）
# ★ operationId は "WebhookChatMessageTrigger"
# ★ recurrence 不要（Webhook 型トリガー）
# ★ parameters は空（特定チャットのフィルタは UI で設定）
trigger = {
    "チャットに新しいメッセージが追加されたとき": {
        "type": "OpenApiConnectionWebhook",
        "inputs": {
            "host": {
                "connectionName": "shared_teams",
                "operationId": "WebhookChatMessageTrigger",
                "apiId": "/providers/Microsoft.PowerApps/apis/shared_teams",
            },
            "parameters": {},
            "authentication": "@parameters('$authentication')",
        },
    },
}

# ExecuteCopilot アクション（チャネルと同じ構造）
action = {
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
                "body/message": "チャットのメッセージ: @{triggerBody()}",
            },
            "authentication": "@parameters('$authentication')",
        },
    },
}

# ExternalTriggerComponent
# triggerConnectionType: "Microsoft Teams"
# schema: {botSchema}.ExternalTriggerComponent.{prefix}.{GUID}  ※prefix はランダム生成
# ★ 照合は triggerConnectionType + operationId(WebhookChatMessageTrigger) で行う
```

##### チャネルトリガー vs チャットトリガーの違い

| 項目                | チャネル                               | チャット                             |
| ------------------- | -------------------------------------- | ------------------------------------ |
| operationId         | `OnNewChannelMessage`                  | `WebhookChatMessageTrigger`          |
| type                | `OpenApiConnection` (ポーリング)       | `OpenApiConnectionWebhook` (Webhook) |
| recurrence          | 必要（interval: 1, frequency: Minute） | 不要                                 |
| parameters          | `groupId` + `channelId` 必須           | 空（全チャットが対象）               |
| schema サフィックス | ランダム生成（例: `.dpT.`）            | ランダム生成（例: `.gN6.`）          |

### パターン 3: スケジュール → エージェント起動

スケジュールトリガーはコネクタ接続が不要。`shared_microsoftcopilotstudio` のみ必要。

```python
# ★ リファレンスフロー定義（Recurring Copilot Trigger）
# Dataverse workflow ID: 1c816283-f936-f111-88b4-7c1e527df0b0
# Flow API ID: a7e51ff0-c5dd-28fb-98b9-889bd198cb4e

# connectionReferences: Copilot Studio コネクタのみ（トリガー用コネクタ不要）
connection_refs = {
    "shared_microsoftcopilotstudio": {
        "runtimeSource": "embedded",
        "connection": {
            "connectionReferenceLogicalName": connref_copilot,
        },
        "api": {"name": "shared_microsoftcopilotstudio"},
    },
}

# トリガー定義
trigger = {
    "Recurrence": {
        "recurrence": {
            "frequency": "Minute",   # Minute / Hour / Day / Week / Month
            "interval": 30,
        },
        "type": "Recurrence",
    },
}

# 日次 9:00 実行の場合
trigger_daily = {
    "Recurrence": {
        "recurrence": {
            "frequency": "Day",
            "interval": 1,
            "schedule": {
                "hours": ["9"],
                "minutes": ["0"],
            },
            "timeZone": "Tokyo Standard Time",
        },
        "type": "Recurrence",
    },
}

# ExecuteCopilot アクション（triggerBody() でスケジュール情報を渡す）
action = {
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
                "Copilot": bot_schema_name,  # ★ schemaname（GUID 不可）
                "body/message": "定期実行プロンプト: ... @{triggerBody()}",
            },
            "authentication": "@parameters('$authentication')",
        },
    },
}

# ExternalTriggerComponent の triggerConnectionType
# triggerConnectionType: "Schedule"
# schema 命名規則: {botSchema}.ExternalTriggerComponent.RecurringCopilotTrigger.{GUID}
```

#### スケジュールトリガーの ExternalTriggerComponent 実データ

```yaml
kind: ExternalTriggerConfiguration
externalTriggerSource:
  kind: WorkflowExternalTrigger
  flowId: { dataverse_workflow_id }

extensionData:
  flowName: { flow_api_id }
  flowUrl: /providers/Microsoft.ProcessSimple/environments/{env_id}/flows/{flow_api_id}
  triggerConnectionType: Schedule
```

注意:

- schema は `.ExternalTriggerComponent.RecurringCopilotTrigger.{GUID}`（メールの `.V3.{GUID}` とは異なる）
- `triggerConnectionType` は `"Schedule"`（`"スケジュール"` ではない — 英語固定）
- Copilot Studio UI では「トリガー」セクションに「Recurring Copilot Trigger」として表示される

### パターン 4: Dataverse レコード変更 → エージェント起動

```python
# ★ リファレンスフロー定義（行が追加、変更、または削除された場合）
# Dataverse workflow ID: 10530cf4-fd36-f111-88b4-002248262d0e
# Flow API ID: 650ed264-3581-9e43-fb23-de6b2acfb21d

# connectionReferences: Copilot Studio + Dataverse
connection_refs = {
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
}

# トリガー: 行が追加、変更、または削除された場合
# ★ type は "OpenApiConnectionWebhook"（Webhook 型、recurrence 不要）
# ★ operationId は "SubscribeWebhookTrigger"
trigger = {
    "行が追加、変更、または削除された場合": {
        "type": "OpenApiConnectionWebhook",
        "inputs": {
            "host": {
                "connectionName": "shared_commondataserviceforapps",
                "operationId": "SubscribeWebhookTrigger",
                "apiId": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
            },
            "parameters": {
                "subscriptionRequest/message": message,       # 1=Create, 2=Delete, 3=Update, 4=Create or Update
                "subscriptionRequest/entityname": entity_name, # テーブル論理名 (例: "{prefix}_yourtable")
                "subscriptionRequest/scope": 4,                # 4=Organization
            },
            "authentication": "@parameters('$authentication')",
        },
    },
}

# ★ message 値:
# 1 = Create（レコード追加）
# 2 = Delete（レコード削除）
# 3 = Update（レコード変更）
# 4 = Create or Update（追加または変更）

# ★ オプション: 特定列の変更のみ検知する場合
# "subscriptionRequest/filteringattributes": "{prefix}_status"  # カンマ区切りで複数指定可

# ★ scope 値:
# 1 = User（自分のレコードのみ）
# 2 = BusinessUnit（部署内）
# 3 = ParentChildBusinessUnit（親子部署）
# 4 = Organization（全組織）

# ExecuteCopilot アクション
action = {
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
                "body/message": "Dataverse レコードが変更されました。\n@{triggerBody()}",
            },
            "authentication": "@parameters('$authentication')",
        },
    },
}

# ExternalTriggerComponent
# triggerConnectionType: "Microsoft Dataverse"
# schema: {botSchema}.ExternalTriggerComponent.{prefix}.{GUID}  ※prefix はランダム生成
# ★ 照合は triggerConnectionType(Microsoft Dataverse) で行う
```

#### Dataverse トリガーのパラメータ

| パラメータ                                | 説明                     | 例                                               |
| ----------------------------------------- | ------------------------ | ------------------------------------------------ |
| `subscriptionRequest/message`             | トリガーイベント         | 1=Create, 2=Delete, 3=Update, 4=Create or Update |
| `subscriptionRequest/entityname`          | テーブルの論理名         | `{prefix}_yourtable`                             |
| `subscriptionRequest/scope`               | スコープ                 | 4=Organization（全組織）                         |
| `subscriptionRequest/filteringattributes` | フィルタ列（オプション） | `{prefix}_status,{prefix}_priority`              |

ユーザーからは以下をヒアリングする:

- **対象テーブル**: どのテーブルの変更を検知するか
- **イベント種別**: 追加 / 変更 / 削除 / 追加または変更
- **フィルタ列**（オプション）: 特定列の変更のみに絞る場合

### パターン 5: SharePoint ファイル作成 → エージェント起動

```python
# ★ リファレンスフロー定義（ファイルが作成されたとき (プロパティのみ)）
# Dataverse workflow ID: 9fea80e2-fc36-f111-88b4-7c1e527df0b0
# Flow API ID: 1450ecd5-70da-03a2-5455-4e7894d61dac

# connectionReferences: Copilot Studio + SharePoint
connection_refs = {
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
}

# トリガー: ファイルが作成されたとき (プロパティのみ)
# ★ type は "OpenApiConnection"（ポーリング型、recurrence 必要）
# ★ operationId は "GetOnNewFileItems"
# ★ dataset = SharePoint サイト URL、table = ライブラリ ID
trigger = {
    "ファイルが作成されたとき_(プロパティのみ)": {
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
                "dataset": site_url,   # SharePoint サイト URL (例: "https://contoso.sharepoint.com/sites/demo")
                "table": library_id,   # ドキュメントライブラリ ID (GUID)
            },
            "authentication": "@parameters('$authentication')",
        },
    },
}

# ExecuteCopilot アクション
action = {
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
                "body/message": "SharePoint に新しいファイルが作成されました。内容を確認してください。\n@{triggerBody()}",
            },
            "authentication": "@parameters('$authentication')",
        },
    },
}

# ExternalTriggerComponent
# triggerConnectionType: "SharePoint"
# schema: {botSchema}.ExternalTriggerComponent.{prefix}.{GUID}  ※prefix はランダム生成
# ★ 照合は triggerConnectionType(SharePoint) で行う
```

#### SharePoint トリガーのパラメータ

| パラメータ | 説明                               | 例                                          |
| ---------- | ---------------------------------- | ------------------------------------------- |
| `dataset`  | SharePoint サイト URL              | `https://contoso.sharepoint.com/sites/demo` |
| `table`    | ドキュメントライブラリの ID (GUID) | `54fe7b63-ec46-4800-8c2f-e6e6ab27adbb`      |

#### SharePoint トリガーの 2 種類

| 項目        | OnNewFile (Notification型)                                | GetOnNewFileItems (Polling型)                        |
| ----------- | --------------------------------------------------------- | ---------------------------------------------------- |
| operationId | `OnNewFile`                                               | `GetOnNewFileItems`                                  |
| type        | `OpenApiConnectionNotification`                           | `OpenApiConnection`                                  |
| recurrence  | **不要**                                                  | 必要（interval: 1, frequency: Minute）               |
| 取得内容    | **ファイルコンテンツ（body）含む**                        | プロパティのみ（名前・パス・更新日等）               |
| パラメータ  | `dataset` + `folderId`(フォルダパス) + `inferContentType` | `dataset` + `table`(ライブラリID)                    |
| 用途        | AI 解析等でファイル内容が必要な場合                       | メタデータだけで十分な場合（Copilot トリガーで多い） |

> **注意**: Copilot Studio トリガーではほとんどの場合 `GetOnNewFileItems`（Polling型）で十分。
> ファイル内容を AI Builder 等で解析する場合のみ `OnNewFile`（Notification型）を使う。

ユーザーからは以下をヒアリングする:

- **SharePoint サイト URL**: ライブラリがあるサイトの URL
- **ライブラリ名**: 監視対象のドキュメントライブラリ名（ライブラリ ID はフロー作成後に Power Automate UI で設定するか、SharePoint REST API で取得）
- **ファイル内容が必要か**: AI 解析が必要 → OnNewFile、メタデータだけ → GetOnNewFileItems

### パターン 6: OneDrive for Business ファイル作成 → エージェント起動

```python
# ★ リファレンスフロー定義（ファイルが作成されたとき）
# Dataverse workflow ID: 9b8af32c-ff36-f111-88b4-002248262d0e
# Flow API ID: 6c8f0e4d-5a03-1d74-13a8-8b1ee291c73d

# connectionReferences: Copilot Studio + OneDrive for Business
connection_refs = {
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
}

# トリガー: ファイルが作成されたとき
# ★ type は "OpenApiConnection"（ポーリング型、recurrence 必要）
# ★ operationId は "OnNewFileV2"（SharePoint とは異なる — SharePoint は "GetOnNewFileItems"）
# ★ folderId = OneDrive フォルダ ID（ドライブアイテム ID 形式）
trigger = {
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
                "folderId": folder_id,            # OneDrive フォルダ ID
                "includeSubfolders": True,         # サブフォルダも監視
            },
            "authentication": "@parameters('$authentication')",
        },
    },
}

# ExecuteCopilot アクション
action = {
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
                "body/message": "OneDrive に新しいファイルが作成されました。内容を確認してください。\n@{triggerBody()}",
            },
            "authentication": "@parameters('$authentication')",
        },
    },
}

# ExternalTriggerComponent
# triggerConnectionType: "OneDrive for Business"
# schema: {botSchema}.ExternalTriggerComponent.{prefix}.{GUID}  ※prefix はランダム生成
# ★ 照合は triggerConnectionType(OneDrive for Business) で行う
```

#### OneDrive for Business トリガーのパラメータ

| パラメータ | 説明 | 例 |
|------------|------|----||
| `folderId` | OneDrive フォルダ ID（ドライブアイテム ID 形式） | `b!FcKsSYkm_Ei0wi...` |
| `includeSubfolders` | サブフォルダ内のファイルも検知するか | `true` / `false` |

#### OneDrive for Business vs SharePoint の違い

| 項目                  | OneDrive for Business               | SharePoint                                   |
| --------------------- | ----------------------------------- | -------------------------------------------- |
| コネクタ名            | `shared_onedriveforbusiness`        | `shared_sharepointonline`                    |
| operationId           | `OnNewFileV2`                       | `GetOnNewFileItems`                          |
| パラメータ            | `folderId` + `includeSubfolders`    | `dataset`(サイトURL) + `table`(ライブラリID) |
| schema prefix         | `.yRl.`                             | `.8kY.`                                      |
| triggerConnectionType | `OneDrive for Business`             | `SharePoint`                                 |
| type                  | `OpenApiConnection`（ポーリング型） | `OpenApiConnection`（ポーリング型）          |

ユーザーからは以下をヒアリングする:

- **監視対象フォルダ**: どのフォルダを監視するか（フォルダ ID は Power Automate UI で選択するか、Graph API で取得）
- **サブフォルダ含む**: サブフォルダ内のファイル作成も検知するか

## フロー後処理パターン

### ExecuteCopilot の応答は利用できない（重要）

```
❌ ExecuteCopilot アクションの出力（body/text）をフローの後続アクションで使用
   → ExecuteCopilot には戻り値がない
   → outputs('Send_prompt_to_Copilot')?['body/text'] は空

✅ エージェントのツール（Outlook コネクタ等）で応答処理を実行
   → ExecuteCopilot のプロンプトに「ツールで返信して」と指示
   → エージェントが自身のツールでメール返信・Teams 投稿等を実行
```

### メール返信パターン（推奨 — Work IQ Mail MCP を使用）

フローは Trigger → ExecuteCopilot のみ。メール返信はエージェントの **Work IQ Mail MCP** で実行。

> **⚠️ 「メールに返信する (V3)」コネクタは使わない。** Attachments が AutomaticTaskInput として
> 定義されており、エージェントが Attachments の値を解決できず処理がスタックする。
> Work IQ Mail MCP（`mcp_MailTools`）はこの問題が発生しない。

```python
# ExecuteCopilot のプロンプトにメッセージ ID と返信指示を含める
prompt_template = (
    "以下のメールを受信しました。メール本文から情報を抽出し、処理してください。\n"
    "処理が完了したら、Work IQ Mail MCP を使って元メールに返信してください。\n"
    "質問はせず、即座に処理してください。\n\n"
    "メッセージID: @{triggerOutputs()?['body/id']}\n"
    "差出人: @{triggerOutputs()?['body/from']}\n"
    "件名: @{triggerOutputs()?['body/subject']}\n"
    "受信日時: @{triggerOutputs()?['body/dateTimeReceived']}\n"
    "本文:\n@{triggerOutputs()?['body/body']}"
)
```

> **注意 1**: メール返信の指示は Instructions と ExecuteCopilot プロンプトの**両方**に入れる。
>
> - ExecuteCopilot プロンプト: メッセージ ID 等の動的値 + 「返信して」の指示
> - Instructions: メールトリガー判定ロジック + 「質問せず即処理」のルール

> **注意 2**: Instructions のメールトリガーセクションでは「ユーザーに質問しない」ルールを厳守。
> メールトリガーからの起動時にユーザーに質問するとチャットで返信できないためスタックする。

### ツールの事前追加が必要

エージェントがメール返信する場合、**事前に Copilot Studio UI で Work IQ Mail MCP を追加**しておく必要がある。

- 「ツール」→「+ ツールの追加」→「Microsoft 365 Outlook Mail (Preview)」→「Work IQ Mail (Preview)」
- フロー設計時にユーザーに案内する。

### Instructions メールトリガーセクション テンプレート

メールトリガーを持つエージェントの Instructions に以下のセクションを追加する。
チャット経由とメールトリガー経由の両方に対応するために必須。

```yaml
  # メールトリガー時の動作（最重要 — 会話フローとは異なる）
  外部トリガー（メール受信）から起動された場合、入力メッセージに「メッセージID:」が含まれる。
  この場合、以下のルールに厳守で従うこと:

  ## 判定方法
  - 入力に「メッセージID:」「差出人:」「件名:」が含まれていたら、メールトリガーからの起動と判断する。

  ## メールトリガー時のルール（厳守）
  1. ユーザーに一切質問しない。チャットで返信できないため、質問するとスタックする。
  2. メール本文から必要な情報を自動的に抽出する。
  3. 不足情報はデフォルト値を使う（日付→今日、氏名→差出人等）。
  4. プレビュー表示・最終確認はスキップする。
  5. 即座に処理を実行する（MCP ツール呼び出し等）。
  6. 処理後、必ず Work IQ Mail MCP を使ってメール返信する。
  7. Work IQ Mail MCP による返信が実行されなければ処理未完了とみなす。
  8. 「メールに返信する (V3)」コネクタは使用しない。Work IQ Mail MCP のみを使うこと。

  ## メールトリガー時の処理順序（この順番を厳守）
  1. メール本文を解析 → 情報を抽出（質問しない）
  2. 必要な処理を実行
  3. Work IQ Mail MCP で元メールに返信
  4. 完了
```

> **注意**: このセクションの位置は Instructions の末尾（`gptCapabilities:` の直前）に配置する。
> チャット経由の通常フロー（ヒアリング→確認→出力）と競合しないよう、
> 「メッセージID:」の有無で明確に分岐させる。

### ExecuteCopilot プロンプトの構造化が必須

```
❌ "Use content from @{triggerBody()}"  — 情報が非構造化で不十分
✅ メッセージID・差出人・件名・受信日時・本文を個別フィールドで渡す
✅ 「質問せず即座に処理して」の明示的指示を含める
✅ 使用すべきツール名（Work IQ Mail MCP）を明示
```

## 設計テンプレート

トリガー追加時にユーザーに提示する設計書のテンプレート:

```markdown
## Copilot Studio トリガー設計

### 基本情報

- **対象エージェント**: {エージェント名} ({bot_schema})
- **トリガー種別**: メール受信 / Teams / スケジュール / Dataverse
- **フロー名**: {フロー表示名}

### トリガー条件

- **コネクタ**: {Office 365 Outlook 等}
- **条件**: {件名に「○○」を含む等}

### エージェントへの入力

- **メッセージ構成**:
```

{プロンプトテンプレート}

```

### 応答処理
- {メール返信 / Teams 投稿 / なし（エージェント内で完結）}

### 必要な接続
| コネクタ | 状態 |
|---------|------|
| Microsoft Copilot Studio | ✅ 確認済 / ❌ 要作成 |
| {トリガーコネクタ} | ✅ 確認済 / ❌ 要作成 |
```

## Teams 連携の設計ガイド（最重要 — ユーザーヒアリング必須）

ユーザーが「Teams でエージェントを使いたい」と要望した場合、以下の 3 方式を案内し **どれを希望するかヒアリングする**。
ユーザーは「チャネル」「チャット」の違いを意識しないことが多いため、利用シーンを説明して選択してもらう。

### 方式比較テーブル（ユーザーに提示する）

| #     | 方式                               | 起動方法                                                        | メリット                                                                     | デメリット                                          | 必要情報                     |
| ----- | ---------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------- |
| **1** | Teams チャネル公開 + メンション    | グループチャットで `@エージェント名` とメンションして話しかける | メンションで明示的に起動でき、他のメッセージに反応しない。最も自然な利用体験 | エージェントをチームに追加する手順が必要            | なし（チャネル公開設定のみ） |
| **2** | チャットトリガー（メンション不要） | 特定のグループチャットにメッセージを投稿するだけで自動起動      | メンション不要で手軽                                                         | 全メッセージに反応する。特定チャット限定            | グループチャットの URL       |
| **3** | チャネルトリガー（メンション不要） | 特定チャネルにメッセージを投稿するだけで自動起動                | メンション不要。チャネル全体を監視                                           | 全メッセージに反応する。ポーリング型で最大1分の遅延 | チャネルの URL               |

### 方式 1: Teams チャネル公開 + メンション起動（推奨）

**外部トリガー（Power Automate フロー）は不要。** Copilot Studio の Teams チャネル公開機能のみで実現。

#### 設定手順（スクリプトから自動化可能な部分 + ユーザー手動部分）

**Step A: チャネル公開設定**（deploy_agent.py の Phase 3 Step 10-11 で実行）

`applicationmanifestinformation` の PATCH で以下を有効化:

```python
ami = json.loads(bot_data.get("applicationmanifestinformation", "{}") or "{}")
ami.setdefault("teams", {})

# ★ 以下 2 つのフラグを True にする
# 「ユーザーはこのエージェントをチームに追加できます」
ami["teams"]["canBeAddedToTeam"] = True
# 「グループや会議のチャットには、このエージェントを使用します」
ami["teams"]["canBeUsedInGroupChat"] = True
```

参照: https://learn.microsoft.com/ja-jp/microsoft-copilot-studio/publication-add-bot-to-microsoft-teams#known-limitations-in-teams

**Step B: ユーザーへの利用案内**（設計承認後にユーザーに伝える）

```markdown
### エージェントの Teams 利用方法

1. Teams で任意のグループチャットを開く
2. 右上の **メンバーアイコン** をクリック → **エージェントとボットの追加** を選択
3. エージェント名（例:「{エージェント表示名}」）を検索して追加
4. チャット内で `@{エージェント表示名} 〇〇について教えて` とメンションして利用
```

### 方式 2: チャットトリガー（メンション不要・自動起動）

特定のグループチャットへのメッセージすべてにエージェントが自動応答。

#### ユーザーから取得する情報

グループチャットの URL（グループチャットを右クリック → 「リンクのコピー」）:

```
例: https://teams.cloud.microsoft/l/chat/19:meeting_YjhlMjBiMTAtNTYzYi00ZmNkLWI5ZTEtN2Q1OWYzNWE1Zjcx@thread.v2/conversations?context=%7B%22contextType%22%3A%22chat%22%7D
```

#### URL からチャット ID を抽出

```python
from urllib.parse import urlparse, unquote

def parse_teams_chat_url(url):
    """Teams チャット URL からチャット ID を抽出"""
    parsed = urlparse(url)
    # パス: /l/chat/{chatId}/conversations
    path_parts = parsed.path.split("/")
    chat_idx = path_parts.index("chat") if "chat" in path_parts else -1
    chat_id = unquote(path_parts[chat_idx + 1]) if chat_idx >= 0 else None
    return chat_id

# 使用例
chat_id = parse_teams_chat_url("https://teams.cloud.microsoft/l/chat/19:meeting_Yjhl...@thread.v2/conversations?...")
# → "19:meeting_YjhlMjBiMTAtNTYzYi00ZmNkLWI5ZTEtN2Q1OWYzNWE1Zjcx@thread.v2"
```

#### フロー構築

パターン 2b の `WebhookChatMessageTrigger` を使用。
現在の検証データでは parameters は空（全チャットが対象）だが、特定チャットの ID でフィルタする場合は Power Automate フローの条件アクションでフィルタリングを追加するか、フロー作成後に Power Automate UI でトリガー条件を設定する。

### 方式 3: チャネルトリガー（メンション不要・自動起動）

特定チャネルへのメッセージすべてにエージェントが自動応答。

#### ユーザーから取得する情報

チャネルの URL（チャネルを右クリック → 「リンクのコピー」）:

```
例: https://teams.cloud.microsoft/l/channel/19%3Aabcdef1234567890abcdef1234567890%40thread.tacv2/%E4%B8%80%E8%88%AC?groupId=11111111-2222-3333-4444-555555555555&tenantId=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
```

#### URL から groupId と channelId を抽出

```python
from urllib.parse import urlparse, parse_qs, unquote

def parse_teams_channel_url(url):
    """Teams チャネル URL から groupId と channelId を抽出"""
    parsed = urlparse(url)
    path_parts = parsed.path.split("/")
    channel_idx = path_parts.index("channel") if "channel" in path_parts else -1
    channel_id = unquote(path_parts[channel_idx + 1]) if channel_idx >= 0 else None

    qs = parse_qs(parsed.query)
    group_id = qs.get("groupId", [None])[0]

    return {"groupId": group_id, "channelId": channel_id}
```

#### フロー構築

パターン 2a の `OnNewChannelMessage` を使用。groupId と channelId を parameters に設定。

### Teams ヒアリングフロー（設計時に必ず実行）

```
ユーザー「Teams でエージェントを使いたい」
  ↓
Q: どのように起動しますか？
  ↓
  ├─ 「メンションして話しかけたい」 → 方式 1（推奨）
  │     → 追加情報不要。チャネル公開設定のみ
  │
  ├─ 「メンションなしでグループチャットに対応させたい」 → 方式 2
  │     → Q: グループチャットの URL を教えてください
  │       （右クリック → リンクのコピー）
  │
  └─ 「メンションなしでチャネルに対応させたい」 → 方式 3
        → Q: チャネルの URL を教えてください
          （チャネルを右クリック → リンクのコピー）
```

## .env 項目

```env
# トリガー関連は BOT_ID と SOLUTION_NAME を使用（追加設定不要）
BOT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SOLUTION_NAME={YourSolutionName}
```

## トラブルシューティング

### フロー有効化が失敗する

```
❌ statecode=1, statuscode=2 → AzureResourceManagerRequestFailed
✅ Power Automate UI で手動有効化
✅ 接続参照の connectionid が正しく設定されていることを確認
```

### ExternalTriggerComponent が UI に表示されない

```
❌ componenttype を間違えた（17 以外）
❌ parentbotid が正しくない
❌ data YAML のフォーマットが不正
✅ エージェントを再公開（PvaPublish）してから UI をリロード
```

### トリガー起動時にエージェントが途中で止まる（最重要教訓）

```
❌ トリガープロンプトにコンテキスト情報（業界・メール本文等）だけを渡す
   → エージェントは GPT Instructions の手順を認識するが、
     トリガープロンプトの「情報提供」だけに応えて最初のツールで止まる
   → 後続ステップ（Web検索、メール送信等）がスキップされる

✅ トリガープロンプトに「全ステップの実行指示」を明示する
   → コンテキスト情報 + 具体的な実行手順を含める
   → 「必ず最後のステップまで完了すること」と念押しする

理由: ExecuteCopilot の body/message（トリガープロンプト）は
      GPT Instructions より優先的にエージェントの行動を決定する。
      Instructions に詳細な手順が書かれていても、トリガープロンプトが
      単なる情報提供に見えるとエージェントはそれに応答するだけで終わる。
```

**トリガープロンプトのベストプラクティス:**

```
✅ 「以下の条件で○○を実行し、△△まで完了してください」と命令形で書く
✅ 実行手順を番号付きで明記する（1. ○○する 2. △△する 3. □□する）
✅ 最終ステップ（メール送信、Teams 投稿等）を明示し「必ず完了すること」と念押し
✅ コンテキスト情報（業界、メール本文等）は手順の前に配置
❌ コンテキスト情報だけ渡して Instructions 任せにしない
```

**テンプレート:**

```
以下の条件で{タスク名}を実行してください。
全ステップを必ず最後まで実行すること。途中で止めないでください。

{コンテキスト情報}

実行手順:
1. {ステップ1の説明}
2. {ステップ2の説明}
3. {最終ステップの説明}（必ず実行すること）
```

### ExecuteCopilot で "Bot not found"

```
❌ Copilot パラメータに Bot ID を指定（GUID は不可）
✅ Copilot パラメータには Bot の schemaname を指定（例: {prefix}_YourAssistant）
```

### Flow API ID が取得できない

```
❌ workflows テーブルの workflowid を extensionData.flowName に使用
✅ Flow API (service.flow.microsoft.com) で workflowEntityId を照合して Flow API ID を取得
✅ フロー有効化後でないと Flow API に表示されない場合がある
```
