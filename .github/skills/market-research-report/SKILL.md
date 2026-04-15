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

### 2.5. メール HTML テンプレート仕様

Step5 でメール送信する際、エージェントは以下の HTML テンプレート構造に従ってリッチな HTML メールを生成する。
Instructions にこのテンプレート仕様を含め、エージェントが自律的に HTML を組み立てられるようにする。

#### Instructions に追加するメールテンプレート指示

```
## メール本文の HTML テンプレート仕様

メール本文は以下の HTML 構造で作成すること。インラインスタイルを使用し、外部 CSS は使わない。

### 全体レイアウト
- 最大幅 680px、中央寄せ、背景色 #f0f4f8
- フォント: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif
- 本文テキスト色: #1e293b

### セクション構成（上から順に）

1. ヘッダー（単色背景 — グラデーション禁止）
   - 背景: #1e3a5f（単色。グラデーションはメールクライアント非対応のため禁止）
   - タイトル: ニュース内容を反映した動的見出し（例: 「AI規制強化とクラウドセキュリティの最新動向」）、白文字(#ffffff)、24px
   - ★ 「📊 AI ニュースレポート」等の汎用タイトルは使わない。必ず内容を反映させる
   - サブタイトル: 日付と業界名、#93c5fd 色、14px

2. エグゼクティブサマリー（青枠カード）
   - 左ボーダー 4px #2563eb
   - 背景: #eff6ff
   - 見出し: 「📋 エグゼクティブサマリー」16px 太字
   - 本文: 全体の総括（3〜5 文）

3. 注目記事カード（記事ごとに繰り返し）
   各記事を白背景カードで表示。カード構成:

   a. 記事番号バッジ + タイトル
      - バッジ: 白文字、背景 #2563eb、角丸、inline-block
      - タイトル: 18px 太字、#0f172a

   b. 記事 URL リンク
      - 「🔗 元記事を読む」リンク、色 #2563eb、14px

   c. 📝 要約セクション
      - ラベル背景: #f1f5f9、角丸、パディング 12px
      - 本文の要約（3〜5 文）

   d. 🎯 選定理由セクション
      - ラベル背景: #fef3c7（黄系）
      - なぜこの記事を選んだか（業界・役割との関連性）

   e. 💡 推奨アクション セクション
      - ラベル背景: #dcfce7（緑系）
      - 箇条書き（ul/li）で具体的なアクションを 2〜3 個

   f. 記事間の区切り線（1px #e2e8f0、最後の記事には不要）

4. フッター
   - 背景: #f8fafc
   - テキスト: 「このレポートは AI エージェントにより自動生成されました」
   - 色: #64748b、12px
```

#### HTML テンプレートサンプル（エージェントの参考用）

以下は Instructions 内にそのまま含めるか、エージェントの参考として保持する HTML テンプレート。
エージェントはこの構造を基に、実際の記事データで HTML を組み立てる。

```html
<div
  style="background-color:#f0f4f8;padding:32px 0;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;"
>
  <div
    style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);"
  >
    <!-- ヘッダー -->
    <!-- ★ 背景は単色 #1e3a5f。グラデーションはメールクライアント非対応 -->
    <div style="background:#1e3a5f;padding:32px 36px;">
      <!-- ★ タイトルはニュース内容を反映した動的見出しにする。「AI ニュースレポート」等の固定タイトル禁止 -->
      <h1
        style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.5px;"
      >
        AI規制強化とクラウドセキュリティの最新動向
      </h1>
      <p style="margin:8px 0 0;color:#93c5fd;font-size:14px;">
        2026年4月13日 ｜ 自動車産業の最新動向
      </p>
    </div>

    <div style="padding:28px 36px;">
      <!-- エグゼクティブサマリー -->
      <div
        style="border-left:4px solid #2563eb;background:#eff6ff;border-radius:0 12px 12px 0;padding:20px 24px;margin-bottom:32px;"
      >
        <h2
          style="margin:0 0 12px;font-size:16px;color:#1e40af;font-weight:700;"
        >
          📋 エグゼクティブサマリー
        </h2>
        <p style="margin:0;font-size:14px;color:#334155;line-height:1.8;">
          本日のニュースでは、米国の対中関税政策の新展開、EV
          サプライチェーンの再編動向、
          および自動運転技術の規制緩和に関する重要な進展が確認されました。
          特に関税リスクへの対応が経営企画部門にとって喫緊の課題となっています。
        </p>
      </div>

      <!-- 記事カード 1 -->
      <div style="margin-bottom:28px;">
        <div style="margin-bottom:16px;">
          <span
            style="display:inline-block;background:#2563eb;color:#ffffff;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;margin-right:8px;"
            >01</span
          >
          <span style="font-size:18px;font-weight:700;color:#0f172a;"
            >米国、EV 部品への追加関税を発表</span
          >
        </div>
        <p style="margin:0 0 16px;font-size:13px;">
          <a
            href="https://example.com/article1"
            style="color:#2563eb;text-decoration:none;"
            >🔗 元記事を読む ↗</a
          >
        </p>

        <!-- 要約 -->
        <div
          style="background:#f1f5f9;border-radius:10px;padding:16px 20px;margin-bottom:12px;"
        >
          <p
            style="margin:0 0 6px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;"
          >
            📝 要約
          </p>
          <p style="margin:0;font-size:14px;color:#334155;line-height:1.7;">
            米国政府は中国製 EV 部品に対する追加関税（25%→45%）を発表。
            バッテリーセル・モーター・インバーターが対象。
            日本の完成車メーカーにもサプライチェーン経由で影響が及ぶ見通し。
          </p>
        </div>

        <!-- 選定理由 -->
        <div
          style="background:#fef3c7;border-radius:10px;padding:16px 20px;margin-bottom:12px;"
        >
          <p
            style="margin:0 0 6px;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;"
          >
            🎯 選定理由
          </p>
          <p style="margin:0;font-size:14px;color:#451a03;line-height:1.7;">
            自動車産業の経営企画として、関税政策変更はサプライチェーンコスト・調達戦略に直結する最重要リスク要因です。
          </p>
        </div>

        <!-- 推奨アクション -->
        <div style="background:#dcfce7;border-radius:10px;padding:16px 20px;">
          <p
            style="margin:0 0 6px;font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:1px;"
          >
            💡 推奨アクション
          </p>
          <ul
            style="margin:0;padding-left:20px;font-size:14px;color:#14532d;line-height:2;"
          >
            <li>調達部門と連携し、中国製部品の依存度を緊急調査</li>
            <li>代替サプライヤー（ASEAN・インド）の候補リストを作成</li>
            <li>関税影響のコストシミュレーションを経営会議に上程</li>
          </ul>
        </div>
      </div>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 28px;" />

      <!-- 記事カード 2（同じ構造を繰り返し） -->
      <div style="margin-bottom:28px;">
        <div style="margin-bottom:16px;">
          <span
            style="display:inline-block;background:#2563eb;color:#ffffff;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;margin-right:8px;"
            >02</span
          >
          <span style="font-size:18px;font-weight:700;color:#0f172a;"
            >トヨタ、全固体電池の量産前倒しを発表</span
          >
        </div>
        <p style="margin:0 0 16px;font-size:13px;">
          <a
            href="https://example.com/article2"
            style="color:#2563eb;text-decoration:none;"
            >🔗 元記事を読む ↗</a
          >
        </p>
        <div
          style="background:#f1f5f9;border-radius:10px;padding:16px 20px;margin-bottom:12px;"
        >
          <p
            style="margin:0 0 6px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;"
          >
            📝 要約
          </p>
          <p style="margin:0;font-size:14px;color:#334155;line-height:1.7;">
            トヨタ自動車が全固体電池の量産開始を2027年から2026年後半に前倒しすると発表。
            航続距離1,200kmを実現し、充電時間は従来比60%短縮。 業界全体の EV
            技術競争が加速する見通し。
          </p>
        </div>
        <div
          style="background:#fef3c7;border-radius:10px;padding:16px 20px;margin-bottom:12px;"
        >
          <p
            style="margin:0 0 6px;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;"
          >
            🎯 選定理由
          </p>
          <p style="margin:0;font-size:14px;color:#451a03;line-height:1.7;">
            競合他社の技術ロードマップ変更は中長期の経営戦略策定に直結。 自社の
            EV 戦略・投資計画の見直しが必要になる可能性があります。
          </p>
        </div>
        <div style="background:#dcfce7;border-radius:10px;padding:16px 20px;">
          <p
            style="margin:0 0 6px;font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:1px;"
          >
            💡 推奨アクション
          </p>
          <ul
            style="margin:0;padding-left:20px;font-size:14px;color:#14532d;line-height:2;"
          >
            <li>技術部門に全固体電池の技術動向レビューを依頼</li>
            <li>自社 EV ロードマップとの差分分析を実施</li>
          </ul>
        </div>
      </div>

      <!-- ★ 記事カードは 3〜5 件繰り返す。最後の記事には hr 区切り線を入れない -->
    </div>

    <!-- フッター -->
    <div
      style="background:#f8fafc;padding:20px 36px;text-align:center;border-top:1px solid #e2e8f0;"
    >
      <p style="margin:0;font-size:12px;color:#64748b;">
        このレポートは AI エージェントにより自動生成されました ｜ Powered by
        Copilot Studio
      </p>
    </div>
  </div>
</div>
```

#### Instructions への組み込み方

HTML テンプレート仕様は Instructions の末尾に追加する。
全文を Instructions に含めると長くなるため、**構造指示（セクション構成 + スタイル要件）** のみ含め、
サンプル HTML は含めない方針を推奨する。

```
## メール HTML テンプレート仕様（Step5 で使用）

メール本文は HTML 形式で作成する。インラインスタイルのみ使用。

### 構成
1. ヘッダー: 単色背景 #1e3a5f（グラデーション禁止）、白文字タイトル（ニュース内容を反映した動的見出し）、日付
2. エグゼクティブサマリー: 左青ボーダー、薄青背景(#eff6ff)の総括カード
3. 記事カード（各記事）:
   - 番号バッジ(青丸) + タイトル(18px 太字)
   - 🔗 元記事リンク
   - 📝 要約（灰背景 #f1f5f9）本文 3〜5 文
   - 🎯 選定理由（黄背景 #fef3c7）なぜこの記事が重要か
   - 💡 推奨アクション（緑背景 #dcfce7）箇条書き 2〜3 個
4. フッター: 自動生成の注記

### スタイル要件
- 最大幅 680px、角丸 16px、白背景カード
- フォント: Segoe UI, Helvetica Neue, Arial, sans-serif
- 各セクションは角丸 10px カードで視覚的に区切る
- 記事間は 1px の区切り線(#e2e8f0)、最後の記事には不要
```

> **エージェントの LLM は HTML テンプレート仕様から自律的にリッチな HTML を生成する。**
> サンプル HTML を逐語的に再現するのではなく、仕様に基づいて記事データを動的に組み込む。

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

## GPT コンポーネント構築時の追加設定

`copilot-studio-agent` スキルの GPT コンポーネント更新手順に加えて、
ニュースエージェントでは `gptCapabilities` セクションを必ず含める:

```python
def _build_news_gpt_yaml(bot_name, instructions, prompts):
    """ニュースエージェント用 GPT YAML を構築（webBrowsing 有効）"""

    # instructions ブロック（シングル改行）
    inst_block = "\n".join(f"  {line}" for line in instructions.splitlines())

    # conversationStarters（ダブル改行）
    starter_lines = []
    for p in prompts:
        starter_lines.append(f"  - title: {p['title']}")
        starter_lines.append(f"    text: {p['text']}")
    starters_block = "\n\n".join(starter_lines)

    # ★ gptCapabilities で webBrowsing を有効化
    return (
        "kind: GptComponentMetadata\n\n"
        f"displayName: {bot_name}\n\n"
        f"instructions: |-\n{inst_block}\n\n"
        "gptCapabilities:\n\n"
        "  webBrowsing: true\n\n"
        "  codeInterpreter: false\n\n"
        f"conversationStarters:\n\n{starters_block}\n\n"
    )
```

```
❌ gptCapabilities を省略 → Web 検索が使えず Step3 が失敗
❌ webBrowsing: false → 同上
✅ gptCapabilities.webBrowsing: true を明示的に含める
✅ codeInterpreter: false（ニュースエージェントではコード実行不要）
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

## 再利用スクリプト

ニュースエージェント構築で使用するスクリプト一覧。
別のニュースエージェントを構築する際は、これらをコピー・カスタマイズして再利用する。

### スクリプト一覧

| スクリプト                      | 用途                                                                       | Usage                                                 |
| ------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| `scripts/generate_news_icon.py` | ニュース用 PNG アイコン生成（新聞＋稲妻＋棒グラフ、240/192/32px）          | `python scripts/generate_news_icon.py`                |
| `scripts/deploy_news_agent.py`  | エージェント設定デプロイ（Instructions、アイコン、会話開始、チャネル構成） | `python scripts/deploy_news_agent.py <BOT_ID or URL>` |
| `scripts/deploy_news_flow.py`   | スケジュールフロー検索・プロンプト/スケジュール更新                        | `python scripts/deploy_news_flow.py <BOT_ID or URL>`  |

### `generate_news_icon.py`

- Pillow で PNG アイコンを 3 サイズ生成（240x240, 192x192, 32x32）
- 青背景 + 白い新聞モチーフ + 琥珀色の稲妻 + 棒グラフ
- `generate_news_icons()` → `{"main": {"base64": ..., "dimensions": "240x240"}, "color": ..., "outline": ...}`
- `deploy_news_agent.py` から `from generate_news_icon import generate_news_icons` でインポート

### `deploy_news_agent.py`

Bot ID はコマンドライン引数で受け取る（`.env` に専用キーを作らない）。

**実行するステップ:**

| Step | 内容                                                                          | 自動公開    |
| ---- | ----------------------------------------------------------------------------- | ----------- |
| 1    | Bot 検索（引数 or 名前検索）                                                  | —           |
| 1.5  | プロビジョニング待ち（最大 120 秒）                                           | —           |
| 1.1  | アイコン設定（iconbase64 = 240x240 PNG）                                      | —           |
| 2    | カスタムトピック削除（システムトピック保護）                                  | —           |
| 3    | 生成オーケストレーション有効化（ディープマージ、optInUseLatestModels: False） | —           |
| 4    | Instructions + conversationStarters + webBrowsing:true（aISettings 保持）     | —           |
| 4.5  | 会話の開始メッセージ + クイック返信                                           | —           |
| 5    | 中間公開（説明設定のために必要）                                              | ✅ 中間のみ |
| 6    | 説明設定（botcomponents.description）                                         | —           |
| 7    | Teams / M365 Copilot チャネル設定（colorIcon/outlineIcon）                    | —           |
| 8    | チャネル構成（msteams + Microsoft365Copilot）                                 | —           |

**カスタマイズポイント:**

```python
# スクリプト冒頭の定数を変更してカスタマイズ
BOT_NAME = "ニュースレポーター"       # エージェント名
BOT_SCHEMA = f"{PREFIX}_newsreporter"  # スキーマ名
GPT_INSTRUCTIONS = "..."               # Instructions テキスト
PREFERRED_PROMPTS = [...]              # 推奨プロンプト
QUICK_REPLIES = [...]                  # クイック返信
GREETING_MESSAGE = "..."               # 会話の開始メッセージ
BOT_DESCRIPTION = "..."                # 説明
TEAMS_SHORT_DESCRIPTION = "..."        # Teams 簡単な説明
TEAMS_LONG_DESCRIPTION = "..."         # Teams 詳細な説明
```

### `deploy_news_flow.py`

**先にフローを作成しない。** ユーザーが UI で Recurrence トリガーを追加した後、
自動作成されたフローを検索してプロンプトとスケジュールを更新する。

**フロー検索の 2 段階:**

1. `ExternalTriggerComponent` (componenttype=17) → `data` YAML 内の `workflowId` を抽出
2. フォールバック: `workflows` テーブルから Recurrence + ExecuteCopilot(bot_schema) を検索

**カスタマイズポイント:**

```python
# スクリプト冒頭の定数を変更
FREQUENCY = "Hour"                     # スケジュール頻度
INTERVAL = 4                           # 実行間隔
INDUSTRY = "IT・テクノロジー"           # ユーザーの業界
ROLE = "エンジニアリングマネージャー"    # ユーザーの業務
INTERESTS = "..."                       # 関心事の詳細
```

## 教訓（テスト実装からのフィードバック）

### ✅ フローは API で先に作成しない

```
❌ 旧方式: API で workflows テーブルにフロー作成 → ユーザーに UI でトリガー追加を依頼
   → 二重フローが発生（API 作成分 + UI 作成分）
   → ユーザーが混乱し、不要フローの削除が必要に

✅ 新方式: ユーザーが UI で Recurrence トリガーを追加 → フローが自動作成される
   → API でフローを検索して clientdata (プロンプト・スケジュール) を PATCH
   → フローは 1 つだけ。クリーン。
```

### ✅ Bot ID は .env に専用キーを作らず引数で渡す

```
❌ 旧方式: .env に NEWS_BOT_ID=xxx を追加
   → エージェントごとに .env にキーが増えて管理が煩雑

✅ 新方式: python scripts/deploy_news_agent.py <BOT_ID or URL>
   → URL をそのまま渡せる（/bots/GUID を自動抽出）
   → フォールバック: 名前で検索
```

### ✅ エージェントの公開はスクリプトで行わない

```
❌ 旧方式: スクリプト最後で PvaPublish を実行
   → ツール・トリガー未追加の状態で Teams/Copilot に公開されるリスク
   → ユーザーが手動でツールを追加した場合、再公開が必要

✅ 新方式: スクリプトは中間公開（説明設定用）のみ。最終公開はユーザーが手動で実施
   → 全設定（ツール・トリガー・フロー）が揃った状態で公開される
   → 手動でツールを追加すると接続認証・公開が同時に完了する
```

### ✅ Web 検索は gptCapabilities + UI 両方で確認

```
❌ gptCapabilities.webBrowsing: true だけ設定 → UI で「Web コンテンツ」がオフだと機能しない可能性
✅ スクリプトで gptCapabilities を設定 + ユーザーに UI で「Web コンテンツ」オンを確認させる
```

### ✅ Recurrence トリガーの ExternalTriggerComponent から workflowId を抽出可能

```
ExternalTriggerComponent (componenttype=17) の data YAML 構造:

kind: ExternalTriggerConfiguration
externalTriggerSource:
  kind: WorkflowExternalTrigger
  flowId: {workflows テーブルの GUID}

extensionData:
  flowName: {Flow API の GUID}
  flowUrl: /providers/Microsoft.ProcessSimple/environments/{env_id}/flows/{Flow API GUID}
  triggerConnectionType: Schedule

→ flowId が workflows テーブルの workflowid に対応
→ flowName が Flow API の ID（別物なので注意）
```

### ✅ トリガープロンプトに全ステップの指示を含める（最重要）

```
❌ 旧方式: トリガープロンプトにコンテキスト情報（業界・役割・関心事）だけを渡す
   → エージェントは GPT Instructions の 5 ステップを認識するが、
     トリガープロンプトの「情報提供」だけに応えようとして最初のツール（RSS）で止まる
   → Web 検索もメール送信も実行されない

✅ 新方式: トリガープロンプトに「全ステップを実行してメール送信まで完了すること」を明示
   → コンテキスト情報 + 実行手順（RSS→Web検索→レポート作成→メール送信）を含める
   → 「必ずメール送信まで完了すること」と念押し

理由: トリガープロンプト（ExecuteCopilot の body/message）は GPT Instructions より
      優先的にエージェントの行動を決定する。Instructions に手順が書かれていても、
      トリガープロンプトが単なる情報提供だとエージェントはそれに応答するだけで終わる。
```

#### トリガープロンプトのテンプレート

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

### ✅ Instructions 内で波括弧 `{}` を使わない（PVA 式パーサーエラー）

```
❌ 件名: 【AIニュースレポート】{日付} {業界}の最新動向
   → PVA が {日付} {業界} を Power Fx 式の変数として解釈
   → 公開時に "IdentifierNotRecognized" エラー
   → componenttype=15 (GPT) の data YAML 内の instructions に波括弧があると発生

✅ 件名: 【AIニュースレポート】と日付と業界の最新動向を組み合わせた件名にする
   → 波括弧なしの自然言語で記述
   → LLM は自然言語の指示から適切に値を埋める

注意: RSS の URL テンプレート内の {{キーワード}} は二重波括弧なので問題なし。
　　PVA が式として認識するのは {単一波括弧} のみ。
```

### ✅ メール HTML のヘッダーはグラデーション禁止・単色背景を使う

```
❌ グラデーション背景: background: linear-gradient(135deg, #0f172a 0%, #1e40af 100%)
   → Outlook / Gmail / モバイル等の主要メールクライアントで linear-gradient が無視される
   → 背景が透明になり、白文字タイトルが読めなくなる

✅ 単色背景: background: #1e3a5f
   → どのメールクライアントでも確実に表示される
   → 白文字(#ffffff)とのコントラストが保たれる
```

### ✅ メールのヘッダータイトルは動的にする

```
❌ 固定タイトル: 「📊 AI ニュースレポート」
   → 毎回同じ見出しで、メールの内容が一見でわからない

✅ 動的タイトル: ニュース内容を反映した要約見出し
   → 例: 「AI規制強化とクラウドセキュリティの最新動向」
   → Instructions に「汎用タイトルは使わない。必ず内容を反映させる」と明記
```

### ✅ Instructions でツール呼び出し回数とスキップ禁止を明示する

```
❌ 曖昧な指示: 「RSS で検索する」「Web 検索で詳細を確認する」
   → エージェントが RSS をキーワードごとに 5 回呼び出す
   → Web 検索やメール送信を任意と判断してスキップ

✅ 明示的な制約:
   ・ RSS: 「1回だけ呼び出す」「複数回呼び出してはいけない」
   ・ Web 検索: 「このステップは必ず実行すること。スキップ禁止」
   ・ メール送信: 「このステップは必ず実行すること。スキップ禁止」
   ・ 全体: 「以下の 5 つのステップを必ず順番に全て実行してください。ステップを飛ばさないでください」
```
