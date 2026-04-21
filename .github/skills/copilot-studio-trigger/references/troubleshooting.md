# Copilot Studio トリガー トラブルシューティング・設計ガイド

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
