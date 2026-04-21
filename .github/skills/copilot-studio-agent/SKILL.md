---
name: copilot-studio-agent
description: "Copilot Studio エージェントを生成オーケストレーション（Generative Orchestration）モードで構築・設定する。トピックベース開発は行わない。"
category: automation
triggers:
  - "Copilot Studio"
  - "エージェント作成"
  - "Bot"
  - "生成オーケストレーション"
  - "Instructions"
  - "指示"
  - "ナレッジ"
  - "MCP Server"
  - "PvaPublish"
  - "ボット設定"
  - "エージェント公開"
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

> **アイコンの設計・生成・登録の詳細は `icon-creation` スキル（`.github/skills/icon-creation/SKILL.md`）を参照。**
> ここではエージェント固有の手順のみ記載する。

エージェント設計が承認されたら、**Bot 作成前にアイコン画像を提案**する。
`icon-creation` スキルのアイコン画像提案フローに従い、3〜4 パターンを提案 → ユーザー選択 → PNG 3 サイズ生成（240, 192, 32）→ `bots.iconbase64` + Teams マニフェストに API 登録。

## 大前提: 一つのソリューション内に開発

Dataverse テーブル・Code Apps・Power Automate フロー・Copilot Studio エージェントは **すべて同一のソリューション内** に含める。

```
SOLUTION_NAME=IncidentManagement  ← .env で定義。全フェーズで同じ値を使用
PUBLISHER_PREFIX=geek              ← ソリューション発行者の prefix
```

- API ヘッダーに `MSCRM.SolutionName: {SOLUTION_NAME}` を付けることでソリューション内に作成

> **認証**: Python スクリプトの認証は `power-platform-standard` スキルの `auth_helper.py` を使用。
> `from auth_helper import get_token, get_session, api_get, api_post, api_patch` で利用する。

- Bot 作成時（Copilot Studio UI）は「エージェント設定」でソリューションを明示的に選択
- ソリューション外で作成したコンポーネントはリリース管理・環境間移行ができない

## 絶対遵守ルール

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
✅ instructions 内で単一波括弧 {変数名} を使わない → PVA が Power Fx 式として解釈し IdentifierNotRecognized エラー。自然言語で記述する
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

詳細な構築手順・スクリプトコードは [構築リファレンス](references/build-reference.md) を参照。

高レベルの手順:

1. **Step 0**: Copilot Studio UI で Bot 作成（ユーザー手動）
2. **Step 1-1.5**: Bot 検索 + プロビジョニング完了待ち
3. **Step 2**: カスタムトピック削除（システムトピック保護）
4. **Step 3**: 生成オーケストレーション有効化
5. **Step 4-4.5**: Instructions + 会話の開始設定
6. **Step 5-6**: エージェント公開 + 説明設定
7. **Step 7-8**: Teams / Copilot チャネル公開設定
8. **Step 9**: ナレッジ・ツール・トリガーの手動追加案内

Instructions テンプレート・既存エージェント改善パターンは [構築リファレンス](references/build-reference.md#instructions-テンプレート) を参照。

## .env 必須項目

```env
DATAVERSE_URL=https://xxx.crm7.dynamics.com
SOLUTION_NAME=SolutionName
PUBLISHER_PREFIX=prefix
BOT_ID=https://copilotstudio.../bots/xxxxxxxx-xxxx-.../overview
# ↑ Copilot Studio URL をそのまま貼り付け可。GUID だけでも OK
```
