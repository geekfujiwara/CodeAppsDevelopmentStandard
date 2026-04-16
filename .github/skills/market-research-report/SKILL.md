---
name: market-research-report
description: "最新情報を自動収集・分析しレポートとして配信するエージェントを Copilot Studio + スケジュールフロー + RSS + Web検索 + Work IQ MCP で構築する。Use when: 自動リサーチ, レポート自動生成, RSS, Web検索, 定期配信, スケジュールトリガー, Work IQ MCP, メール配信, 情報収集エージェント, ニュースレター, ダイジェスト, 競合分析, 技術動向, 規制動向, ニュースエージェント"
---

# ニュース収集・配信エージェント構築スキル

Copilot Studio エージェント + スケジュールトリガー + RSS + Web 検索 + Work IQ MCP を組み合わせて、
**最新ニュースを自動収集し、要約・分析レポートをメールで定期配信するエージェント** を構築する。

> **リファレンス実装**: `geek_ai`（AIニュース配信）エージェント

## アーキテクチャ概要

```
┌──────────────────────────────────────────────────────────────┐
│                    Power Automate フロー                      │
│  [Recurrence トリガー] ──→ [ExecuteCopilot アクション]        │
│   (4時間ごと等)          プロンプト: 業界・役割・関心事を指定  │
└────────────────────────────────┬─────────────────────────────┘
                                 ↓
┌──────────────────────────────────────────────────────────────┐
│              Copilot Studio エージェント                       │
│                                                               │
│  Instructions（5 ステップ処理）:                               │
│    Step1: 検索キーワードを作成する                             │
│    Step2: RSS を利用して検索キーワードで検索する                │
│    Step3: Web 検索を利用して RSS 記事の詳細を検索する          │
│    Step4: コンテキストを基にレポートを作成する                  │
│    Step5: Work IQ MCP を利用して内容をメールで送信する         │
│                                                               │
│  ツール:                                                      │
│    📡 RSS コネクタ（ListFeedItems）                           │
│    🌐 Web 検索（gptCapabilities.webBrowsing: true）           │
│    📧 Work IQ Mail MCP（mcp_MailTools）                       │
└──────────────────────────────────────────────────────────────┘
```

### このスキルが依存する他のスキル

| スキル                   | 用途                                 |
| ------------------------ | ------------------------------------ |
| `copilot-studio-agent`   | エージェント構築の基本手順           |
| `copilot-studio-trigger` | スケジュールトリガーフローの構築手順 |
| `html-email-template`    | HTML メールのデザインシステム        |

> **重要**: エージェントの作成手順・YAML フォーマット・GPT コンポーネント更新等の詳細は
> 上記スキルに従うこと。このスキルは「ニュースエージェント固有のアーキテクチャ・設計パターン」に特化する。

## 前提: 設計フェーズ完了後に構築に入る（必須）

ニュースエージェントを構築する前に、以下の設計をユーザーに提示し承認を得ていること。

## 設計テンプレート

ユーザー要件をヒアリングし、以下のテンプレートを埋めて設計書として提示する。

### 1. エージェント基本情報

| 項目                     | 設計内容（例）                                            |
| ------------------------ | --------------------------------------------------------- |
| エージェント名           | AI ニュース配信                                           |
| 説明                     | AI を活用して最新ニュースを自動収集・配信するエージェント |
| 基盤モデル               | Claude Sonnet 4.6（UI で手動選択）                        |
| Web 検索                 | 有効（gptCapabilities.webBrowsing: true）                 |
| コンテンツモデレーション | High                                                      |

### 2. Instructions（指示）

ニュースエージェントの Instructions は **ステップ形式** で記述する。
エージェントが自律的にツールを呼び出して処理を完了できるよう、明確な手順を指定する。

#### テンプレート（カスタマイズ可能）

> **冒頭に「以下の5つのステップを必ず順番に全て実行してください。ステップを飛ばさないでください。」と記載する。**

```
あなたは{エージェント名}です。以下の5つのステップを必ず順番に全て実行してください。ステップを飛ばさないでください。

Step1 検索キーワードを決める
ユーザーの業界・役割・関心事から、ニュース検索用のキーワードを2個だけ決める。

Step2 RSS を利用して検索キーワードで検索する（★ 1回のみ呼び出し）
RSS ツールを **1回だけ** 呼び出し、キーワードをスペースで結合した1本の URL で検索する。
例: キーワードが「AI」「セキュリティ」なら、feedUrl に「AI セキュリティ」を含む 1 つの URL。
**RSSツールの呼び出しは合計1回のみ。キーワードごとに分けて複数回呼び出してはいけない。**
フィード URL: https://news.google.com/rss/search?q={{キーワード}}&hl=ja&gl=JP&ceid=JP%3Aja

Step3 Web 検索を利用して RSS 記事の詳細を検索する（★ 必須・スキップ禁止）
このステップは必ず実行すること。スキップ禁止。
RSS で取得した主要な記事について、Web 検索で詳細情報・一次ソースを確認する。
信頼性の高い情報源を優先する。

Step4 対象のコンテキストを基にレポートを作成する
収集した情報を分析し、ユーザーの業界・役割に関連の高い内容をピックアップして、
経営向けレポートを作成する。各記事について以下を整理する:
- 記事タイトル
- 記事 URL（元ソースへのリンク）
- 本文の要約（3〜5 文）
- なぜこの記事を選定したか（業界・役割との関連性）
- 考えられるアクションの例（具体的な次のステップ）
最後にエグゼクティブサマリー（全体の総括・3〜5 文）を作成する。

Step5 Work IQ MCP を利用して内容を HTML メールで送信する（★ 必須・スキップ禁止）
このステップは必ず実行すること。スキップ禁止。
Work IQ MCP のメール送信ツールを使って、作成したレポートを以下のメールテンプレート仕様で HTML メールとして送信する。
宛先: 配信先メールアドレス
件名: 【AIニュースレポート】と日付と業界の最新動向を組み合わせた件名にする
本文: HTML 形式で送信する。後述の「メール HTML テンプレート仕様」に従うこと。
```

> **カスタマイズポイント**: Step4 のレポート構成はユーザーの要件に合わせて変更する。
> 例: 技術動向、競合分析、規制動向、市場トレンド等。

### 3. ツール構成（Copilot Studio UI で手動追加）

| ツール           | コネクタ / MCP                 | operationId     | 用途                           |
| ---------------- | ------------------------------ | --------------- | ------------------------------ |
| RSS フィード取得 | RSS                            | `ListFeedItems` | Google News RSS から記事を取得 |
| Web 検索         | （組み込み）                   | —               | RSS 記事の詳細情報を検索       |
| Work IQ Mail MCP | Microsoft 365 Outlook Mail MCP | `mcp_MailTools` | レポートをメールで送信         |

#### RSS ツールの設定ポイント

```yaml
# RSS ツールの TaskDialog 定義（Copilot Studio が自動生成）
kind: TaskDialog
inputs:
  - kind: AutomaticTaskInput
    propertyName: feedUrl
    description: https://news.google.com/rss/search?q={{検索キーワード}}&hl=ja&gl=JP&ceid=JP%3Aja

modelDisplayName: すべての RSS フィード項目を一覧表示します
modelDescription: この操作では、RSS フィードからすべての項目を取得します。
outputs:
  - propertyName: Response

action:
  kind: InvokeConnectorTaskAction
  connectionReference: {bot_schema}.shared_rss.{connection_id}
  connectionProperties:
    mode: Invoker
  operationId: ListFeedItems

outputMode: All
```

- `feedUrl` の `description` に Google News RSS テンプレート URL を設定
- `outputMode: All` で全記事を取得（エージェントが取捨選択）
- エージェントが Instructions の Step2 で自動的にキーワードを URL エンコードして呼び出す

```
★ RSS ツール呼び出しルール（最重要）:
  ❌ キーワードごとに RSS ツールを呼び出す（「AI」で1回、「セキュリティ」で1回 → 計2回）
     → トークン消費が多く、エージェントのコンテキスト枯渇リスクが上がる
  ✅ キーワードをスペースで結合して 1 回だけ呼び出す（「AI セキュリティ」で1回）
     → Instructions に「合計1回のみ。複数回呼び出してはいけない」と明記する
```

#### RSS フィード URL テンプレート集

| ソース       | URL テンプレート                                                            |
| ------------ | --------------------------------------------------------------------------- |
| Google News  | `https://news.google.com/rss/search?q={{keyword}}&hl=ja&gl=JP&ceid=JP%3Aja` |
| Yahoo! Japan | `https://news.yahoo.co.jp/rss/topics/{{category}}.xml`                      |
| NHK News     | `https://www.nhk.or.jp/rss/news/cat0.xml`                                   |
| TechCrunch   | `https://techcrunch.com/feed/`                                              |
| Hacker News  | `https://hnrss.org/newest?q={{keyword}}`                                    |

> **ベストプラクティス**: Google News RSS が最も汎用的。検索キーワードを動的に変えられるため、
> エージェントの Instructions で「検索キーワードを作成する」ステップと組み合わせやすい。

#### Work IQ Mail MCP の設定ポイント

```yaml
# Work IQ Mail MCP の TaskDialog 定義（Copilot Studio が自動生成）
kind: TaskDialog
modelDisplayName: Work IQ Mail (Preview)
modelDescription: "Work IQ MCP server for Microsoft Outlook Mail operations..."
action:
  kind: InvokeExternalAgentTaskAction
  connectionReference: {bot_schema}.shared_a365outlookmailmcp.{connection_id}
  connectionProperties:
    mode: Invoker
  operationDetails:
    kind: ModelContextProtocolMetadata
    operationId: mcp_MailTools
```

- Work IQ Mail は **MCP Server** として接続（Copilot Studio の「ツール」→「コネクタ」から追加）
- `InvokeExternalAgentTaskAction` + `ModelContextProtocolMetadata` の組み合わせ
- **Invoker モード**: フローの実行者（=接続認証者）の Outlook から送信
- エージェントが Instructions の Step5 で宛先・件名・本文を自動構成して送信

#### Web 検索の設定ポイント

```yaml
# GPT コンポーネントの gptCapabilities で有効化
gptCapabilities:
  webBrowsing: true
  codeInterpreter: false
```

- Web 検索はツールとして追加するのではなく、**GPT コンポーネントの `gptCapabilities`** で有効化
- `webBrowsing: true` にすると、エージェントが Bing Web 検索を自動的に利用可能
- Instructions の Step3 で「Web 検索で詳細情報を確認する」と記述するだけでエージェントが自動呼び出し

### 4. スケジュールトリガーフロー

| 項目       | 設計内容（例）                                                  |
| ---------- | --------------------------------------------------------------- |
| フロー名   | {エージェント名} \| ニュースをRSSで収集                         |
| トリガー   | Recurrence（スケジュール）                                      |
| 実行間隔   | 4 時間ごと（frequency: Hour, interval: 4）                      |
| アクション | ExecuteCopilot（プロンプトでコンテキストを渡す）                |
| 必要な接続 | Microsoft Copilot Studio のみ（スケジュールはコネクタ接続不要） |

#### ExecuteCopilot プロンプトテンプレート

```
以下の条件でニュースレポートを作成し、メールで送信してください。
全ステップを必ず最後まで実行すること。途中で止めないでください。

自社の業界: {業界}
自分の業務: {役割}
関心: {関心事の詳細}

実行手順:
1. 上記の業界・関心に基づいてキーワードを決め、RSSで最新ニュースを検索する
2. 重要な記事についてWeb検索で詳細情報を調べる
3. レポートを作成する
4. 作成したレポートをHTML形式のメールで送信する（宛先: {メールアドレス}）
必ずメール送信まで完了すること。
```

> **最重要**: トリガープロンプトにはコンテキスト情報だけでなく、**全ステップの実行指示**を含めること。
> トリガープロンプト（ExecuteCopilot の body/message）は GPT Instructions より優先的にエージェントの行動を決定する。
> コンテキスト情報だけ渡すと、エージェントは最初のツール（RSS）だけ実行して止まる。

旧テンプレート（非推奨）:

```
❌ 自社の業界: {業界}
   自分の業務: {役割}
   関心: {関心事の詳細}
→ コンテキストだけでは RSS しか実行されず、Web 検索もメール送信もスキップされる
```

### 5. 推奨プロンプト（conversationStarters）

チャットでも使えるよう、推奨プロンプトを設定する:

```yaml
conversationStarters:
  - title: 最新ニュースを教えて
    text: 今日の主要なニュースを教えてください。

  - title: ジャンル別ニュース
    text: テクノロジー分野の最新ニュースをまとめてください。

  - title: 要約を依頼
    text: このニュース記事の要点を簡単にまとめてください。

  - title: 解説を依頼
    text: このニュースの背景やポイントを解説してください。

  - title: フェイクニュースの確認
    text: この情報が信頼できるか調べてください。

  - title: カスタマイズ依頼
    text: 私の興味に合わせてニュースを配信してください。
```

### 6. 会話の開始メッセージ

```
こんにちは！最新ニュースの収集・分析をお手伝いする {エージェント名} です。
気になるトピックを教えてください。自動配信もスケジュールで実行中です。
```


### HTML メールテンプレート

Step5 で使用する HTML メールテンプレートの詳細仕様は [HTML メールテンプレートリファレンス](./references/html-email-template.md) を参照。

## 構築手順

### Phase A: Copilot Studio エージェント構築

**`copilot-studio-agent` スキルに従う。** 以下はニュースエージェント固有の設定:

1. Copilot Studio UI でエージェント作成（ソリューション内）
2. `deploy_news_agent.py` でエージェント設定（公開はしない）:
   - GPT コンポーネント更新: Instructions + conversationStarters + **`gptCapabilities.webBrowsing: true`**
   - ConversationStart トピック: 挨拶メッセージ + quickReplies
   - アイコン設定（ PNG 3 サイズ）
   - チャネル構成（Teams / M365 Copilot）
   - ★ エージェントの公開は行わない（中間公開のみ。最終公開はユーザーが手動で実施）

3. **ユーザーに UI で手動設定を依頼:**
   - 基盤モデル選択（Claude Sonnet 4.6 推奨）
   - Web 検索がオンか UI で確認
   - RSS ツール追加（「ツール」→「コネクタ」→「RSS」→「すべての RSS フィード項目を一覧表示します」）
   - Work IQ Mail MCP ツール追加（「ツール」→「コネクタ」→「Microsoft 365 Outlook Mail (Preview)」→「Work IQ Mail (Preview)」）
   - Recurrence トリガー追加（「トリガー」→「Recurrence」→ フローが自動作成される）
   - 接続の認証

4. `deploy_news_flow.py` で自動作成されたフローを検索・更新:
   - ExecuteCopilot のプロンプト（業界・役割・関心事）を設定
   - スケジュール間隔を設定

5. **ユーザーが UI で最終公開:**
   - Copilot Studio UI → 右上の「公開」ボタンをクリック

```
★ 重要: 自動公開は行わない。
  ツール・トリガー・フロー設定を全て完了した後、ユーザーが手動で公開する。
  中途で公開すると、ツール未追加のまま Teams/Copilot に反映されるリスクがある。
```

#### ★ RSS ツール追加後の feedUrl description 設定

RSS ツールを追加した後、**`feedUrl` の `description` を Google News RSS テンプレートに変更**する必要がある。
これにより、エージェントがキーワードを動的に変えて検索できるようになる。

```
ツール追加後の UI 操作:
1. ツール「すべての RSS フィード項目を一覧表示します」の詳細を開く
2. 入力の「feedUrl」→「説明」フィールドを編集
3. 以下を入力:
   https://news.google.com/rss/search?q={{検索キーワード}}&hl=ja&gl=JP&ceid=JP%3Aja
4. 保存
```

> description に URL テンプレートを入れることで、エージェントの LLM が
> 「このフィールドに Google News RSS URL を入れればよい」と理解する。

### Phase B: スケジュールトリガーフロー設定（検索・更新方式）

**先にフローを API で作成しない。** ユーザーが Copilot Studio UI で Recurrence トリガーを追加すると
フローが自動作成される。そのフローを API で検索し、プロンプトとスケジュール設定を更新する。

#### フロー検索方法

```python
def find_trigger_flow(bot_id, bot_schema):
    """Bot に紐づくスケジュールトリガーフローを検索"""

    # 方法 1: ExternalTriggerComponent (componenttype=17) から workflowId を抽出
    triggers = api_get(
        f"botcomponents?$filter=_parentbotid_value eq '{bot_id}' and componenttype eq 17"
        "&$select=botcomponentid,schemaname,data"
    )
    for t in triggers.get("value", []):
        schema = t.get("schemaname", "")
        if "RecurringCopilotTrigger" in schema:
            # data YAML から workflowId を抽出
            wf_match = re.search(r'workflowId:\s*([0-9a-f-]{36})', t.get("data", ""))
            if wf_match:
                return api_get(f"workflows({wf_match.group(1)})?$select=...")

    # 方法 2: workflows テーブルから Recurrence + ExecuteCopilot(bot_schema) を検索
    for state_filter in ["statecode eq 1", "statecode eq 0"]:
        flows = api_get(f"workflows?$filter=category eq 5 and {state_filter}&$top=30")
        for f in flows.get("value", []):
            cd = json.loads(f.get("clientdata", "{}"))
            definition = cd.get("properties", {}).get("definition", {})
            has_recurrence = any(t.get("type") == "Recurrence"
                                for t in definition.get("triggers", {}).values())
            has_copilot = bot_schema in json.dumps(definition.get("actions", {}))
            if has_recurrence and has_copilot:
                return f
```

```
❌ フローを API で先に作成 → ユーザーが UI でトリガー追加時に二重フローになる
✅ ユーザーが UI で Recurrence トリガーを追加 → 自動作成されたフローを API で検索・更新
✅ ExternalTriggerComponent + workflows テーブルの二重検索で確実にフローを特定
```

#### フロー更新内容

```python
def update_flow(flow, bot_schema):
    cd = json.loads(flow["clientdata"])
    definition = cd["properties"]["definition"]

    # 1. スケジュール更新
    for trigger in definition["triggers"].values():
        if trigger.get("type") == "Recurrence":
            trigger["recurrence"]["frequency"] = "Hour"
            trigger["recurrence"]["interval"] = 4

    # 2. ExecuteCopilot プロンプト更新
    prompt = f"自社の業界: {industry}\n自分の業務: {role}\n関心: {interests}"
    for action in definition["actions"].values():
        if action.get("inputs", {}).get("host", {}).get("operationId") == "ExecuteCopilot":
            action["inputs"]["parameters"]["body/message"] = prompt

    api_patch(f"workflows({flow['workflowid']})", {"clientdata": json.dumps(cd)})
```

#### スケジュール設定パターン

| ユースケース              | frequency | interval | schedule                                                                                               | timeZone            |
| ------------------------- | --------- | -------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
| 4 時間ごと                | Hour      | 4        | —                                                                                                      | —                   |
| 毎朝 9 時                 | Day       | 1        | `{"hours": ["9"], "minutes": ["0"]}`                                                                   | Tokyo Standard Time |
| 平日毎朝 8 時             | Week      | 1        | `{"weekDays": ["Monday","Tuesday","Wednesday","Thursday","Friday"], "hours": ["8"], "minutes": ["0"]}` | Tokyo Standard Time |
| 毎日 9 時と 18 時（2 回） | Day       | 1        | `{"hours": ["9","18"], "minutes": ["0"]}`                                                              | Tokyo Standard Time |

### Phase C: ユーザー手動操作 → スクリプトでフロー設定（★ 必須）

エージェントデプロイ後、まずユーザーに Step 1 の手動操作を全て実施してもらい、
その後スクリプトでフローのプロンプト・スケジュールを設定する。

````markdown
### 手動操作ガイド

#### Step 1: Copilot Studio UI で手動設定（まとめて実施）

1. https://copilotstudio.microsoft.com/ を開く
2. エージェント「{エージェント名}」を選択

   **1-a. 基盤モデル選択:**

- 「設定」→「生成 AI」→「Anthropic Claude Sonnet 4.6」を選択

**1-b. Web 検索の確認:**

- 「設定」→「生成 AI」→「Web コンテンツ」がオンか確認
  （スクリプトで gptCapabilities.webBrowsing: true を設定済み。UI 側でもオンであることを確認）

**1-c. RSS ツール追加:**

- 「ツール」→「+ ツールの追加」→「コネクタ」→「RSS」を検索
- 「すべての RSS フィード項目を一覧表示します」を追加
- ★ feedUrl の「説明」に以下を入力:
  `https://news.google.com/rss/search?q={{検索キーワード}}&hl=ja&gl=JP&ceid=JP%3Aja`

**1-d. Work IQ Mail MCP ツール追加:**

- 「ツール」→「+ ツールの追加」→「コネクタ」→「Microsoft 365 Outlook Mail」を検索
- 「Work IQ Mail (Preview)」を追加 → 接続を認証

**1-e. Recurrence トリガー追加:**

- 「トリガー」→「+ トリガーの追加」→「Recurrence」を選択
- ★ フローが自動作成される

#### Step 2: フローのプロンプト・スケジュール設定（スクリプト）

```bash
python scripts/deploy_news_flow.py <BOT_ID or URL>
```
````

- 自動作成されたフローを検索
- ExecuteCopilot のプロンプト（業界・役割・関心事）を設定
- スケジュール間隔（デフォルト: 4 時間）を設定

#### Step 3: フローの有効化（Power Automate UI）

1. https://make.powerautomate.com を開く
2. フローを開く → 接続を認証 →「オンにする」

#### Step 4: 接続マネージャーで接続を作成（Copilot Studio UI）

1. エージェントのテスト画面を開き、接続マネージャーを開く
   URL: `https://copilotstudio.microsoft.com/c2/tenants/{TENANT_ID}/environments/{ENV_ID}/bots/{BOT_SCHEMA}/channels/pva-studio/user-connections`
2. 全ツール（RSS, Work IQ Mail MCP 等）の接続を作成・認証

> **接続マネージャー URL は `deploy_news_agent.py` が自動生成して表示する。**
> エージェントを実行する前に、ここで全接続を認証しておくこと。
> 未認証の接続があるとエージェントがツールを呼び出せない。

#### Step 5: 最終公開（全設定完了後に手動で実施）

1. Copilot Studio UI → 右上の「公開」ボタンをクリック

```
★ 重要: 公開は必ず最後。
  ツール・トリガー・フロー設定・接続認証が全て揃ってから公開する。
  手動でツール等を追加した場合は接続認証・公開が同時に完了する。
```

## リファレンスパターン（リファレンス実装からの教訓）

### ✅ 動作確認済みの構成

- **エージェント**: `geek_ai`（AIニュース配信）
- **基盤モデル**: Claude Sonnet 4.6（`modelNameHint: Sonnet46`）
- **Web 検索**: 有効（`webBrowsing: true`）
- **RSS ツール**: Google News RSS（`ListFeedItems`）
- **Work IQ Mail MCP**: `mcp_MailTools`（InvokeExternalAgentTaskAction）
- **スケジュール**: 4 時間ごと（`frequency: Hour, interval: 4`）
- **プロンプト**: 業界・役割・関心事を含むコンテキスト

### ✅ Instructions の 5 ステップ

```
Step1 検索キーワードを作成する（2個のみ）
Step2 RSS を利用して検索キーワードで検索する（★ 1回のみ呼び出し。複数回呼び出し禁止）
Step3 Web 検索を利用して RSS 記事の詳細を検索する（★ 必須・スキップ禁止）
Step4 対象のコンテキストを基にレポートを作成する（各記事のタイトル・URL・要約・選定理由・推奨アクション + エグゼクティブサマリー）
Step5 Work IQ MCP を利用して HTML メールで送信する（★ 必須・スキップ禁止。単色ヘッダー + 動的タイトル + カード型レイアウト）
```

- 冒頭に「以下の 5 つのステップを必ず順番に全て実行してください。ステップを飛ばさないでください」を記載
- Step1〜4 はエージェントが自律的にツールを選択して実行
- Step4 で各記事を「要約・選定理由・推奨アクション」の 3 セクション構造に整理
- Step5 で Work IQ MCP が HTML 形式の Outlook メールを送信
- **HTML テンプレート仕様を Instructions に含める** ことで、リッチなメールを自律生成
- **ExecuteCopilot のプロンプトでユーザーコンテキストを渡す** ことで、Step1 のキーワード生成が目的に合致

### ✅ Google News RSS テンプレートの動作

- `https://news.google.com/rss/search?q={{キーワード}}&hl=ja&gl=JP&ceid=JP%3Aja`
- エージェントが `{{キーワード}}` を実際の検索語に置換して RSS ツールを呼び出す
- `feedUrl` の `description` にテンプレートを設定することで LLM が使い方を理解
- `outputMode: All` で全記事を取得し、エージェントが要/不要を判断

### ⚠️ 注意事項

1. **Work IQ Mail MCP は Preview 機能**: 利用可能性は変更される可能性がある
2. **メール送信は Invoker モード**: フローの実行者（接続認証者）の Outlook アカウントから送信される
3. **ExecuteCopilot に戻り値なし**: フローの後続アクションでエージェントの処理結果を使うことはできない
4. **RSS フィードの rate limit**: Google News RSS は短時間に大量リクエストするとブロックされる可能性。実行間隔は最低 1 時間以上を推奨
5. **Web 検索の精度**: gptCapabilities の webBrowsing は Bing 検索を利用。検索結果はモデルの判断に依存

## バリエーション

### バリエーション A: メール通知の代わりに Teams 投稿

Work IQ Mail MCP の代わりに **Teams メッセージ投稿アクション** を使用:

- ツール: 「チャットまたはチャネルでメッセージを送信する」（Microsoft Teams コネクタ）
- Instructions の Step5 を変更: 「Teams の{チャネル名}にレポートを投稿する」

### バリエーション B: 複数 RSS ソースの統合

Instructions を拡張して複数 RSS を呼び出す:

```
Step2a Google News RSS で「{キーワード1}」を検索する
Step2b TechCrunch RSS でテクノロジーニュースを取得する
Step2c NHK News RSS で国内ニュースを取得する
Step3 Web 検索で注目記事の一次ソースを確認する
```

### バリエーション C: Dataverse にニュースログを保存

エージェントに Dataverse ツールを追加し、収集したニュースをテーブルに記録:

- テーブル: `{prefix}_NewsLog`（タイトル, URL, 要約, カテゴリ, 取得日時）
- Instructions に Step4.5 を追加: 「ニュース情報を Dataverse に記録する」
- Code Apps でニュース履歴ダッシュボードを構築可能

### バリエーション D: ユーザー別カスタマイズ配信

複数のスケジュールフローを作成し、異なるプロンプト（業界・関心事）で同じエージェントを呼び出す:

```
フロー1: 経営企画部向け（地政学・関税・サプライチェーン）→ 毎朝 8 時
フロー2: 技術部向け（AI・自動運転・EV）→ 毎朝 9 時
フロー3: 営業部向け（市場動向・競合・規制）→ 毎夕 17 時
```


## クイックリファレンス

| 項目                            | 値                                                                     |
| ------------------------------- | ---------------------------------------------------------------------- |
| RSS コネクタ operationId        | `ListFeedItems`                                                        |
| RSS フィード URL テンプレート   | `https://news.google.com/rss/search?q={{kw}}&hl=ja&gl=JP&ceid=JP%3Aja` |
| Work IQ MCP operationId         | `mcp_MailTools`                                                        |
| Work IQ MCP kind                | `InvokeExternalAgentTaskAction` + `ModelContextProtocolMetadata`       |
| Web 検索の有効化                | `gptCapabilities.webBrowsing: true`                                    |
| メール形式                      | HTML（インラインスタイル、最大幅 680px、カード型レイアウト）           |
| メール HTML ヘッダー            | 単色背景 #1e3a5f（グラデーション禁止）、動的タイトル（固定禁止）       |
| メール HTML 構成                | ヘッダー → エグゼクティブサマリー → 記事カード × N → フッター          |
| 記事カード構成                  | タイトル + URL + 📝要約 + 🎯選定理由 + 💡推奨アクション                |
| スケジュール接続                | `shared_microsoftcopilotstudio` のみ（トリガー接続不要）               |
| ExecuteCopilot パラメータ       | `Copilot`: schemaname, `body/message`: プロンプトテキスト              |
| ExecuteCopilot の戻り値         | なし（応答処理はエージェント側ツールで実行）                           |
| ExternalTrigger schema パターン | `{botSchema}.ExternalTriggerComponent.RecurringCopilotTrigger.{GUID}`  |
| triggerConnectionType           | `Schedule`                                                             |


## デプロイ詳細

再利用スクリプト・GPT コンポーネント設定・教訓の詳細は [デプロイメントガイド](./references/deployment-guide.md) を参照。
