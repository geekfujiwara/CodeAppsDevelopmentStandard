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

| 項目 | 内容 |
|------|------|
| エージェント名・説明 | 名前と役割の説明 |
| Instructions | 指示テキストの全文案 |
| 会話スターター | 3〜5 個のサンプル質問 |
| ナレッジ | データソース（Dataverse テーブル / SharePoint / ファイル等） |
| ツール | MCP Server の接続先・用途 |

```
フロー: 設計提示 → ユーザー承認 → UI で Bot 作成 → スクリプトで設定適用
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

2. **configuration を PATCH する際は既存値をマージする**
   - `configuration` を丸ごと上書きすると `gPTSettings.defaultSchemaName` が消える
   - 必ず GET → マージ → PATCH

3. **余分な GPT コンポーネントは削除する**
   - `componenttype eq 15` で全取得 → `defaultSchemaName` と一致するものを UI コンポーネントとして特定 → それ以外を削除

### 指示（Instructions）の YAML 形式

```yaml
# UI が認識する形式（手動構築）
kind: GptComponentMetadata
displayName: エージェント名
instructions: |-
  指示テキスト（ブロックスカラー形式）
conversationStarters:
- title: タイトル
  text: テキスト
```

```
❌ yaml.dump() の quoted scalar → UI が認識しない
❌ sort_keys=True → kind が先頭に来ない
✅ 手動で |- ブロック形式の YAML 文字列を構築
✅ displayName キーを含める（UI が表示に使用）
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

```
1. https://copilotstudio.microsoft.com/ にアクセス
2. 「+ 作成」をクリック
3. エージェント名を入力
4. ★「エージェント設定 (オプション)」を展開:
   - 言語: 日本語 (日本)
   - ソリューション: {SOLUTION_NAME}  ← 必ず同一ソリューションを選択！
   - スキーマ名: {prefix}_agent_name
5. 「作成」をクリック
6. ブラウザ URL を .env に貼り付け:
   BOT_ID=https://copilotstudio.../bots/xxxxxxxx-xxxx-.../overview
```

### Step 1: Bot 検索
- `.env` の `BOT_ID` から取得（URL でも GUID でも可）
- URL の場合: `/bots/([0-9a-f-]{36})` で抽出
- なければ `bots` テーブルを `name` で検索

### Step 2: カスタムトピック全削除
```python
# componenttype=1 がトピック。system_ で始まるものはスキップ
topics = api_get("botcomponents",
    {"$filter": f"_parentbotid_value eq '{bot_id}' and componenttype eq 1"})
for topic in topics["value"]:
    if not topic["name"].startswith("system_"):
        api_delete(f"botcomponents({topic['botcomponentid']})")
```

### Step 3: 生成オーケストレーション有効化
```python
# 既存 configuration を読み込み → gPTSettings を保持してマージ
bot_data = api_get(f"bots({bot_id})?$select=configuration")
existing_config = json.loads(bot_data.get("configuration", "{}") or "{}")

merged = {
    "$kind": "BotConfiguration",
    "settings": {"GenerativeActionsEnabled": True},
    "aISettings": {
        "$kind": "AISettings",
        "useModelKnowledge": True,
        "isFileAnalysisEnabled": True,
        "isSemanticSearchEnabled": True,
        "optInUseLatestModels": True,
    },
    "recognizer": {"$kind": "GenerativeAIRecognizer"},
}
if "gPTSettings" in existing_config:
    merged["gPTSettings"] = existing_config["gPTSettings"]

api_patch(f"bots({bot_id})", {"configuration": json.dumps(merged)})
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

### Step 5: エージェント公開
```python
api_post(f"bots({bot_id})/Microsoft.Dynamics.CRM.PvaPublish", {})
```

### Step 6: 説明の設定（publish 後）
```python
# data PATCH の非同期処理が description を上書きするため publish 後に設定
api_patch(f"botcomponents({comp_id})", {"description": description_text})
```

### Step 7: ナレッジ・ツールの手動追加（ユーザーに依頼）
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
