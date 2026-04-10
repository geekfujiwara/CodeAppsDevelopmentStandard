---
name: copilot-studio-agent
description: "Copilot Studio エージェントを生成オーケストレーションモードで構築・設定する。Use when: Copilot Studio, エージェント作成, Bot, 生成オーケストレーション, Instructions, 指示, ナレッジ, MCP Server, PvaPublish, ボット設定, エージェント公開"
---

# Copilot Studio エージェント構築スキル

Copilot Studio エージェントを **生成オーケストレーション（Generative Orchestration）モード一択** で構築する。
トピックベース開発は行わない。

## 前提: 設計フェーズ完了後に構築に入る（必須）

**エージェントを構築する前に、エージェント設計をユーザーに提示し承認を得ていること。**

設計提示時に含める内容:

| 項目                     | 内容                                                                          |
| ------------------------ | ----------------------------------------------------------------------------- |
| エージェント名・説明     | 名前と役割の説明                                                              |
| Instructions             | 指示テキストの全文案                                                          |
| 推奨プロンプト           | 3〜5 個のタイトル＋プロンプト文（GPT コンポーネントの conversationStarters）  |
| 会話の開始のメッセージ   | エージェントに合った挨拶テキスト（ConversationStart トピックの SendActivity） |
| 会話の開始のクイック返信 | 3〜5 個のクイック返信テキスト（ConversationStart トピックの quickReplies）    |
| ナレッジ                 | データソース（Dataverse テーブル / SharePoint / ファイル等）                  |
| ツール                   | MCP Server の接続先・用途                                                     |
| チャネル公開設定         | 簡単な説明・詳細な説明・背景色・開発者名（デフォルト値を提案）                |

```
フロー: 設計提示 → ユーザー承認 → アイコン画像提案 → ユーザー選択 → UI で Bot 作成 → スクリプトで設定適用
```

## アイコン画像提案（設計承認後・構築前）

エージェント設計が承認されたら、**Bot 作成前にアイコン画像を提案**する。

### 提案方法

1. エージェントの目的・役割に合ったアイコンを **3〜4 パターン** テキストで提案
2. 各パターンに簡単な説明を付けて提示
3. ユーザーに選択してもらう
4. **選択されたパターンの SVG を生成 → Base64 → `bots.iconbase64` に API で登録**

### アイコン設計ガイドライン

- **サイズ**: 240x240px（`viewBox="0 0 240 240"`）
- **形式**: SVG（`data:image/svg+xml;base64,...` 形式で登録）
- **スタイル**: シンプルで視認性の高いデザイン。フラット or モダン
- **背景**: 角丸正方形（`rx="48" ry="48"`）。ブランドカラー推奨
- **モチーフ**: エージェントの目的を象徴するアイコン（例: インシデント管理 → 盾・ライトニング・レンチ）
- **バリエーション例**:
  - パターン A: 目的を象徴するアイコン + 企業カラー背景
  - パターン B: ロボット / AI エージェント風 + グラデーション
  - パターン C: ミニマル・モノライン + モダン
  - パターン D: キャラクター風 / 親しみやすいデザイン

### アイコン登録方法（PNG Base64 → API）

Teams チャネルは SVG を受け付けない。**PNG 形式**で登録する必要がある。

#### Teams アイコン要件

- **iconbase64**: `data:` prefix なしの生 Base64 PNG（任意サイズ）
- **colorIcon**: 192x192 PNG, < 100KB
- **outlineIcon**: 32x32 PNG, 白い透明背景
- 参照: https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/build-and-test/apps-package#app-icons

#### PNG 生成（Pillow）

```python
from PIL import Image, ImageDraw
import io, base64

def draw_icon(size, transparent_bg=False, outline_only=False):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if not transparent_bg:
        draw.rounded_rectangle([0, 0, size-1, size-1], radius=int(size*0.2), fill=(30, 41, 59, 255))
    # ... シールド＋ライトニング等を描画 ...
    return img

# 3 サイズ生成
icon_main = draw_icon(240)                                    # iconbase64 用
icon_color = draw_icon(192)                                   # colorIcon 用
icon_outline = draw_icon(32, transparent_bg=True, outline_only=True)  # outlineIcon 用

def to_base64(img):
    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return base64.b64encode(buf.getvalue()).decode('ascii')
```

#### API 登録

```python
# ★ iconbase64 は data: prefix なしの生 Base64 PNG
icon_b64 = to_base64(icon_main)

# ★ bots PATCH には name フィールドが必須
bot_info = api_get(f"bots({bot_id})?$select=name")
api_patch(f"bots({bot_id})", {"name": bot_info["name"], "iconbase64": icon_b64})

# Teams マニフェストの colorIcon / outlineIcon を専用サイズで設定
ami = json.loads(bot_data.get("applicationmanifestinformation", "{}") or "{}")
ami.setdefault("teams", {})["colorIcon"] = to_base64(icon_color)    # 192x192
ami["teams"]["outlineIcon"] = to_base64(icon_outline)                # 32x32
api_patch(f"bots({bot_id})", {"name": bot_info["name"], "applicationmanifestinformation": json.dumps(ami)})
```

```
❌ SVG で登録 → Teams チャネルのアイコンが表示されない
❌ data:image/svg+xml;base64,... 形式 → Teams が受け付けない
❌ colorIcon と outlineIcon を同じ画像で登録 → outlineIcon は 32x32 白い透明背景が必要
❌ bots PATCH で name を省略 → "Empty or null bot name" エラー (0x80040265)
✅ PNG 形式で 3 サイズ生成（240, 192, 32）
✅ data: prefix なしの生 Base64 PNG で登録
✅ outlineIcon は白い透明背景の 32x32 PNG
✅ PATCH 時は必ず name フィールドを含める
```

## 大前提: 一つのソリューション内に開発

Dataverse テーブル・Code Apps・Power Automate フロー・Copilot Studio エージェントは **すべて同一のソリューション内** に含める。

```
SOLUTION_NAME=IncidentManagement  ← .env で定義。全フェーズで同じ値を使用
PUBLISHER_PREFIX=geek              ← ソリューション発行者の prefix
```

- API ヘッダーに `MSCRM.SolutionName: {SOLUTION_NAME}` を付けることでソリューション内に作成

> **認証**: Python スクリプトの認証は `power-platform-standard` スキルに記載の `scripts/auth_helper.py` を使用。
> `from auth_helper import get_token, get_session, api_get, api_post, api_patch` で利用する。

- Bot 作成時（Copilot Studio UI）は「エージェント設定」でソリューションを明示的に選択
- ソリューション外で作成したコンポーネントはリリース管理・環境間移行ができない

## 絶対遵守ルール（検証済み教訓）

### Bot 作成は API 不可 → Copilot Studio UI 必須

```
❌ Dataverse bots テーブルへの直接 INSERT
   → PVA Bot Management Service にプロビジョニングされない
   → Copilot Studio UI で「エージェントの作成中に問題が発生しました」エラー
   → botroutinginfo が 404 になる

✅ Copilot Studio UI で手動作成 → API で設定変更のみ
```

### GPT コンポーネント（componenttype=15）の扱い

1. **UI が作成したコンポーネントを特定して更新する**
   - `bots(id)?$select=configuration` → `configuration.gPTSettings.defaultSchemaName` で UI コンポーネントの schemaname を取得
   - API で新しい GPT コンポーネントを INSERT すると UI と API で別々のコンポーネントが存在し、UI は自分のコンポーネントしか読まない

2. **configuration を PATCH する際は既存値をディープマージする**
   - `configuration` を丸ごと上書きすると `gPTSettings.defaultSchemaName` やモデル設定が消える
   - 必ず GET → ディープマージ → PATCH
   - `optInUseLatestModels` は明示的に `False` を設定 — `True` だと UI で選択した基盤モデル（Claude Sonnet 等）が GPT に強制変更される
   - `aISettings` も丸ごと上書きせずディープマージで既存のモデル選択を保持

3. **余分な GPT コンポーネントは削除する**
   - `componenttype eq 15` で全取得 → `defaultSchemaName` と一致するものを UI コンポーネントとして特定 → それ以外を削除

### 指示（Instructions）の YAML 形式 — PVA ダブル改行フォーマット

PVA パーサーは標準 YAML のシングル改行 (`\n`) を**構造行**として認識しない。
YAML の**構造行**（kind, displayName, conversationStarters 等）はダブル改行 (`\n\n`) で区切る必要がある。
ただし `instructions: |-` ブロック内のテキストはシングル改行で記述する。

```python
# ✅ 正しい構築方法
def _build_gpt_yaml():
    # instructions ブロック（シングル改行）
    inst_block = "\n".join(f"  {line}" for line in GPT_INSTRUCTIONS.splitlines())

    # conversationStarters（ダブル改行）
    starter_lines = []
    for p in PREFERRED_PROMPTS:
        starter_lines.append(f"  - title: {p['title']}")
        starter_lines.append(f"    text: {p['text']}")
    starters_block = "\n\n".join(starter_lines)

    return (
        "kind: GptComponentMetadata\n\n"
        f"displayName: {BOT_NAME}\n\n"
        f"instructions: |-\n{inst_block}\n\n"
        f"conversationStarters:\n\n{starters_block}\n\n"
    )
```

```
❌ yaml.dump() → PVA パーサーと非互換
❌ 全行シングル改行 → conversationStarters / quickReplies が UI に反映されない
❌ 全行ダブル改行 → instructions テキストが空行だらけになる
❌ conversationStarters の title/text をダブルクォートで囲む → PVA に反映されない
✅ 構造行はダブル改行、instructions ブロック内はシングル改行
✅ conversationStarters の title/text はクォートなし
✅ displayName キーを含める（UI が表示に使用）
```

### ConversationStart トピックの YAML 形式

ConversationStart トピック（componenttype=9）も同じダブル改行フォーマット。

```python
lines = []
lines.append("kind: AdaptiveDialog")
lines.append("beginDialog:")
lines.append("  kind: OnConversationStart")
lines.append("  id: main")
lines.append("  actions:")
lines.append("    - kind: SendActivity")
lines.append(f"      id: {send_id}")
lines.append("      activity:")
lines.append("        text:")
lines.append(f"          - {greeting_text}")  # クォートなし
lines.append("        speak:")
lines.append(f'          - "{greeting_text}"')
lines.append("        quickReplies:")
for qr in QUICK_REPLIES:
    lines.append(f"          - kind: MessageBack")
    lines.append(f"            text: {qr}")
# ダブル改行で結合
new_data = "\n\n".join(lines) + "\n\n"
```

```
❌ シングル改行 → 送信ノードが消え、quickReplies が UI に反映されない
❌ 挨拶テキストに生改行 \n を含める → YAML が壊れる（スペースに置換する）
✅ 全行ダブル改行で結合
✅ actions 配下は 4 スペースインデント
```

### 基盤モデル選択の保持（aISettings）

PVA は GPT コンポーネントの `data` YAML 末尾に基盤モデル情報を格納する:

```yaml
aISettings:
  model:
    modelNameHint: Sonnet46
```

GPT コンポーネントの `data` を上書きすると、この `aISettings` セクションが消えて
デフォルトモデル（GPT 4.1）に戻る。

```python
# ✅ 更新前に既存データから aISettings セクションを抽出 → 新 YAML の末尾に付加
existing_data = ui_comp.get("data", "")
ai_idx = existing_data.find("\naISettings:")
if ai_idx < 0:
    ai_idx = existing_data.find("aISettings:")
if ai_idx >= 0:
    ai_settings_section = existing_data[ai_idx:].rstrip()
    final_yaml = new_yaml.rstrip("\n") + "\n\n" + ai_settings_section + "\n\n"
```

```
❌ GPT data を丸ごと上書き → 基盤モデルがデフォルトに戻る
✅ 更新前に aISettings セクションを抽出して保持
✅ 初回デプロイ後にユーザーが UI でモデルを設定 → 2 回目以降のデプロイで保持される
```

### 説明（Description）の保存場所

```
❌ YAML 内の description キー → UI が読まない
❌ bot エンティティの description プロパティ → 存在しない
✅ botcomponents テーブルの description カラム

注意: data PATCH の非同期処理が description を上書きする
→ 対策: publish 後に description を別途 PATCH する
```

## 構築手順

### Step 0: Copilot Studio UI での Bot 作成（ユーザー手動）

ユーザーに依頼する際は、ソリューションの **スキーマ名（`SOLUTION_NAME`）** と **表示名** の両方を伝える。
Copilot Studio UI のドロップダウンには表示名が表示されるため、スキーマ名だけではユーザーが特定できない。

**⚠️ プロビジョニング完了を待つこと（重要）**

Bot を「作成」した直後は Dataverse に `bots` レコードが即座に作成されるが、
**デフォルトトピック・GPT コンポーネント等は PVA Bot Management Service が非同期でプロビジョニング**する。
Bot ID URL をコピーしてすぐにスクリプトを実行すると、カスタムトピック削除が 0 件になる。

ユーザーには以下を案内する:

```
1. Copilot Studio UI でエージェントを作成
2. ★ 作成後、Copilot Studio UI でエージェントが完全にロードされるまで待つ
   （トピック一覧・概要ページが表示されるまで）
3. ブラウザ URL を .env に貼り付け
4. python scripts/deploy_agent.py を実行
```

```
1. https://copilotstudio.microsoft.com/ にアクセス
2. 「+ 作成」をクリック
3. エージェント名を入力
4. ★「エージェント設定 (オプション)」を展開:
   - 言語: 日本語 (日本)
   - ソリューション: 「{SOLUTION_DISPLAY_NAME}」を選択
     （スキーマ名: {SOLUTION_NAME}、表示名: {SOLUTION_DISPLAY_NAME}）
   - スキーマ名: {prefix}_agent_name
5. 「作成」をクリック
6. ★ エージェントが完全にロードされるまで待つ（トピック一覧が表示されるまで）
7. ブラウザ URL を .env に貼り付け:
   BOT_ID=https://copilotstudio.../bots/xxxxxxxx-xxxx-.../overview
```

> **教訓**: UI のドロップダウンにはソリューションの「表示名」が表示される。スキーマ名だけ伝えるとユーザーがどれを選ぶか迷う。必ず「表示名: ○○○（スキーマ名: △△△）」の形式で伝える。

### Step 1: Bot 検索

- `.env` の `BOT_ID` から取得（URL でも GUID でも可）
- URL の場合: `/bots/([0-9a-f-]{36})` で抽出
- なければ `bots` テーブルを `name` で検索

### Step 1.5: プロビジョニング完了待ち（スクリプト内で自動）

```python
# Bot 作成後、デフォルトトピック・GPT コンポーネントが非同期プロビジョニングされる
# トピック（componenttype=1）または GPT コンポーネント（componenttype=15）が
# 出現するまで最大 120 秒リトライする
# → 0 件のままトピック削除に進むことを防止
```

### Step 2: カスタムトピック削除（システムトピック保護）

**削除対象**: ユーザー作成のカスタムトピック（あいさつ、ありがとう、お問い合わせありがとう、最初からやり直す等）
**保護対象**: システムトピック（ConversationStart, Escalate, Fallback, OnError, Search, Signin 等）と MCP Server アクション

```python
# 保護対象の schemaname パターン
PROTECTED_TOPIC_PATTERNS = [
    "ConversationStart", "Escalate", "Fallback", "OnError",
    "EndofConversation", "MultipleTopicsMatched", "Search",
    "Signin", "ResetConversation",
]

# componenttype=1 と 9 の両方を取得
topics = api_get("botcomponents",
    {"$filter": f"_parentbotid_value eq '{bot_id}' and (componenttype eq 1 or componenttype eq 9)",
     "$select": "botcomponentid,name,schemaname,componenttype"})
for topic in topics["value"]:
    schema = topic.get("schemaname", "")
    # システムトピック・アクションは保護
    if any(p in schema for p in PROTECTED_TOPIC_PATTERNS):
        continue
    if ".action." in schema:
        continue
    api_delete(f"botcomponents({topic['botcomponentid']})")
```

```
❌ system_ プレフィックスだけで判定 → ConversationStart 等が削除されるリスク
❌ componenttype=1 だけを対象 → プロビジョニング時のトピックタイプが変わる可能性
✅ schemaname パターンでシステムトピックを明示的に保護
✅ .action. を含む MCP Server アクションも保護
```

### Step 3: 生成オーケストレーション有効化

**⚠️ 基盤モデル（Claude / GPT 等）を変更しないこと（重要）**

```python
# 既存 configuration を読み込み → ディープマージで既存設定を保持
bot_data = api_get(f"bots({bot_id})?$select=configuration")
existing_config = json.loads(bot_data.get("configuration", "{}") or "{}")

# ★ 必要最小限のオーバーライドのみ指定
overrides = {
    "$kind": "BotConfiguration",
    "settings": {"GenerativeActionsEnabled": True},
    "aISettings": {
        "$kind": "AISettings",
        "useModelKnowledge": True,
        "isFileAnalysisEnabled": True,
        "isSemanticSearchEnabled": True,
        "optInUseLatestModels": False,  # ★ 明示的に False — True だと基盤モデルが GPT に強制変更される
    },
    "recognizer": {"$kind": "GenerativeAIRecognizer"},
}

# ★ ディープマージ: 既存の gPTSettings・モデル選択・その他 UI 設定を全て保持
merged = _deep_merge(existing_config, overrides)

api_patch(f"bots({bot_id})", {"configuration": json.dumps(merged)})
```

```
❌ optInUseLatestModels: True → UI で選択した基盤モデル（Claude 等）が GPT に強制変更される
❌ aISettings を丸ごと上書き → モデル設定が消える
❌ gPTSettings だけ保持して他の既存キーを落とす → 設定が欠損
✅ ディープマージで既存 configuration を保持し、必要な設定のみ追加・更新
✅ optInUseLatestModels は明示的に False — UI で選択した基盤モデルを維持
✅ 既存 config に True が残っていても False で上書きする
```

### Step 4: 指示（Instructions）設定

```python
# UI コンポーネント特定 → defaultSchemaName で照合
default_schema = saved_config.get("gPTSettings", {}).get("defaultSchemaName", "")

existing = api_get("botcomponents",
    {"$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 15",
     "$select": "botcomponentid,name,schemaname,data"})

# defaultSchemaName と一致 → UI コンポーネント、それ以外 → 削除対象
# フォールバック: defaultSchemaName がなければ最初のものを使う
# 更新: api_patch("botcomponents(comp_id)", {"data": GPT_YAML})
```

### Step 4.5: 会話の開始設定（メッセージ + クイック返信）

**⚠️ yaml.dump() / yaml.safe_load() → yaml.dump() のパイプラインは使用禁止（最重要）**

```
❌ yaml.safe_load() → 値を変更 → yaml.dump() で書き戻す
   → yaml.dump() が PVA パーサーと非互換な YAML を出力する
   → 改行入り文字列が single-quoted multiline になり UI が認識しない
   → quickReplies が消える / 会話の開始メッセージが空になる

✅ ConversationStart YAML は全体を手動で文字列構築する
   → 既存の SendActivity ID のみ正規表現で抽出して再利用
   → YAML テンプレートに変数を埋め込んで生成
```

```python
import re

# ConversationStart トピック（componenttype=9）を検索
result = api_get("botcomponents", {
    "$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 9 and contains(schemaname,'ConversationStart')",
    "$select": "botcomponentid,schemaname,data",
})
topic = result["value"][0]
topic_id = topic["botcomponentid"]
existing_data = topic.get("data", "")

# 既存の SendActivity ID を抽出（再利用）
id_match = re.search(r'id:\s+(sendMessage_\w+)', existing_data)
send_id = id_match.group(1) if id_match else "sendMessage_fix01"

# ★ YAML を手動で全体構築（yaml.dump() 禁止）
new_data = f'''kind: AdaptiveDialog
beginDialog:
  kind: OnConversationStart
  id: main
  actions:
  - kind: SendActivity
    id: {send_id}
    activity:
      text:
      - "{GREETING_MESSAGE}"
      speak:
      - "{GREETING_MESSAGE}"
      quickReplies:
      - kind: MessageBack
        text: クイック返信テキスト1
      - kind: MessageBack
        text: クイック返信テキスト2
'''

api_patch(f"botcomponents({topic_id})", {"data": new_data})
```

> **挨拶メッセージ**: 設計時にエージェントの目的に合ったテキストを提案する。
> 例: 「こんにちは！インシデント管理アシスタントです。インシデントの起票・検索・ステータス更新など、お気軽にお申し付けください。」

### Step 5: エージェント公開

```python
api_post(f"bots({bot_id})/Microsoft.Dynamics.CRM.PvaPublish", {})
```

### Step 6: 説明の設定（publish 後）

```python
# data PATCH の非同期処理が description を上書きするため publish 後に設定
api_patch(f"botcomponents({comp_id})", {"description": description_text})
```

### Step 7: Teams / Copilot チャネル公開設定

```python
# applicationmanifestinformation.teams を PATCH して Teams マニフェストを設定
bot_data = api_get(f"bots({bot_id})?$select=applicationmanifestinformation,iconbase64")
existing_ami = json.loads(bot_data.get("applicationmanifestinformation", "{}") or "{}")
existing_teams = existing_ami.get("teams", {})

# 設定値の更新（エージェントに合わせた内容を設計時に提案）
existing_teams["shortDescription"] = "簡単な説明（最大80文字）"
existing_teams["longDescription"] = "詳細な説明（最大3400文字）"
existing_teams["accentColor"] = "#0078D4"  # 背景色
existing_teams["developerName"] = "開発者名（最大32文字）"
# アイコンは Bot の iconbase64 を colorIcon/outlineIcon に設定
existing_teams["colorIcon"] = icon_b64
existing_teams["outlineIcon"] = icon_b64

existing_ami["teams"] = existing_teams

# M365 Copilot 可用性を有効化
existing_ami["copilotChat"] = {"isEnabled": True}

api_patch(f"bots({bot_id})", {"applicationmanifestinformation": json.dumps(existing_ami)})
```

```
アイコン画像の要件:
- SVG 形式推奨（`data:image/svg+xml;base64,...` で API 登録）
- 240x240px、角丸正方形
- PNG の場合は 100 KB 未満

設定項目:
| 項目 | 最大文字数 | デフォルト |
|------|-----------|-----------|
| 簡単な説明 | 80 | Microsoft Copilot Studio を使用して構築します。 |
| 詳細な説明 | 3400 | （デフォルトは汎用テキスト） |
| 開発者名 | 32 | 自分の開発者名 |
| 背景色 | - | #FFFFFF（白/透明推奨） |
| Web サイト | - | go.microsoft.com/fwlink/?linkid=2138949 |
| プライバシー | - | go.microsoft.com/fwlink/?linkid=2138950 |
| 使用条件 | - | go.microsoft.com/fwlink/?linkid=2138865 |
| M365 Copilot | - | copilotChat.isEnabled = true |
```

### Step 8: チャネル公開実行

```python
# configuration.channels に msteams / Microsoft365Copilot を追加
config = json.loads(bot_data.get("configuration", "{}") or "{}")
channels = config.get("channels", [])
# 未設定なら追加
channels.append({"channelId": "msteams", ...})
channels.append({"channelId": "Microsoft365Copilot", ...})
config["channels"] = channels
api_patch(f"bots({bot_id})", {"configuration": json.dumps(config)})

# 最終公開
api_post(f"bots({bot_id})/Microsoft.Dynamics.CRM.PvaPublish", {})
```

### Step 9: ナレッジ・ツールの手動追加（ユーザーに依頼）

```
★ API では追加不可 — Copilot Studio UI で手動操作が必要

1. ナレッジ: Copilot Studio → エージェント → ナレッジ タブ → Dataverse テーブルを追加
2. ツール: ツール タブ → Dataverse MCP Server を追加 → CRUD アクションを有効化
```

## Instructions テンプレート

```
あなたは「{エージェント名}」です。{目的の説明}。

## 利用可能なテーブル

### {prefix}_tablename（日本語名）
- {prefix}_column: 型（説明）
- {prefix}_status: Choice（ステータス）
  - 100000000 = 値A
  - 100000001 = 値B
- {prefix}_lookupid: Lookup → {prefix}_target_table
- createdby: システム列（作成者）

## 行動指針
1. ユーザーの意図を正確に理解し、Dataverse のデータ操作を実行する
2. レコード作成時は必須項目を必ず確認してから実行
3. 検索結果は見やすく整形して表示する（テーブル形式推奨）
4. 日本語で丁寧に応答する
5. Choice 値は整数値で指定する

## 条件分岐ルール
### データの照会 → ナレッジから検索
### 新規レコード作成 → ツール（Dataverse MCP Server）で実行
### レコード更新 → ツールで PATCH 操作
```

## .env 必須項目

```env
DATAVERSE_URL=https://xxx.crm7.dynamics.com
SOLUTION_NAME=SolutionName
PUBLISHER_PREFIX=prefix
BOT_ID=https://copilotstudio.../bots/xxxxxxxx-xxxx-.../overview
# ↑ Copilot Studio URL をそのまま貼り付け可。GUID だけでも OK
```
