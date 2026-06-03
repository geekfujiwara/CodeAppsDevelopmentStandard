# Copilot Studio トリガーパターンリファレンス

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
