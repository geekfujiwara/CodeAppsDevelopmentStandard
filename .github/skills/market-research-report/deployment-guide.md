# ニュースエージェント デプロイメントガイド

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

## 再利用スクリプト

ニュースエージェント構築で使用するスクリプト一覧。
別のニュースエージェントを構築する際は、これらをコピー・カスタマイズして再利用する。

### スクリプト一覧

| スクリプト                      | 用途                                                                       | Usage                                                 |
| ------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| `./generate_news_icon.py` | ニュース用 PNG アイコン生成（新聞＋稲妻＋棒グラフ、240/192/32px）          | `python ./generate_news_icon.py`                |
| `./deploy_news_agent.py`  | エージェント設定デプロイ（Instructions、アイコン、会話開始、チャネル構成） | `python ./deploy_news_agent.py <BOT_ID or URL>` |
| `./deploy_news_flow.py`   | スケジュールフロー検索・プロンプト/スケジュール更新                        | `python ./deploy_news_flow.py <BOT_ID or URL>`  |

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

✅ 新方式: python ./deploy_news_agent.py <BOT_ID or URL>
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
