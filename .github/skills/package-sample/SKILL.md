---
name: package-sample
description: "Code Apps サンプルをパブリックリポジトリ向けに仕上げる。セキュリティチェック（秘匿情報の除去・プレースホルダー化）、カスタマイズ用 .env.example 生成、機能説明と使い方マニュアル（README.md）生成、コード再利用性チェック（PUBLISHER_PREFIX 動的化・feature flag・ナビ固定化）を一括で実施する。"
category: samples
triggers:
  - "サンプル仕上げ"
  - "サンプルをパッケージ"
  - "sample をパッケージ"
  - "package sample"
  - "サンプルソリューション化"
  - "サンプル化"
  - "公開用に仕上げ"
  - "セキュリティチェック"
  - "サンプルのセキュリティ"
  - "README 生成"
  - "env.example 生成"
  - "サンプル README"
  - "サンプル公開"
---

# サンプルソリューション パッケージングスキル

Code Apps サンプルを**世界中の開発者が再利用・カスタマイズできる形**に仕上げる。
実行すると以下の 5 フェーズを順に処理する。

> [!NOTE]
> このスキルは `samples/{sample-name}/` ディレクトリに対して実行する。
> 対象サンプルが指定されていない場合はユーザーに確認すること。

---

## フェーズ 1: セキュリティスキャン・修正

### 1-1. 検出対象

以下のパターンをコード・設定ファイル全体から検出する。

| カテゴリ | 検出パターン | 対処 |
|---|---|---|
| テナント ID | 32桁 GUID（`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` 形式の実値） | `{your-tenant-id}` に置換 |
| 環境 ID | 同上 | `{your-environment-id}` に置換 |
| Dataverse URL | `https://[a-z0-9]+\.crm[0-9]*\.dynamics\.com` 形式の実 URL | `https://{org}.crm.dynamics.com/` に置換 |
| Bot ID / Schema | 実 GUID、実スキーマ名（`xxx_yyy` 形式で明らかに固有のもの） | `{your-bot-id}` / `{your-bot-schema}` に置換 |
| フロー Workflow ID | GUID 形式の実値 | `{your-flow-workflow-id}` に置換 |
| 接続 ID / CONNREF | 実接続 ID 文字列 | `{your-connection-id}` に置換 |
| メールアドレス | `@` を含む実アドレス（example.com 以外） | `admin@example.com` に置換 |
| PAC 認証プロファイル名 | 実プロファイル名 | `{YourProfileName}` に置換 |

### 1-2. コード内ハードコードチェック

```
検出: テーブル名の直書き
  - NG: "geek_customers" / "myco_incidents" 等の実プレフィックス文字列
  - OK: `${P}_customers` / `${PUBLISHER_PREFIX}_incidents`

検出: VITE_ 変数への秘匿情報混入
  - NG: VITE_API_SECRET / VITE_TOKEN 等
  - VITE_ 変数はビルド成果物に平文で含まれる（ブラウザから参照可能）

検出: .env / power.config.json のコミット漏れ
  - .gitignore に .env / power.config.json / .power/ / src/generated/ が含まれているか確認
```

### 1-3. スキャン手順

```bash
# 実 GUID のパターンを検出（36文字形式）
grep -rn "[0-9a-f]\{8\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{4\}-[0-9a-f]\{12\}" \
  --include="*.ts" --include="*.tsx" --include="*.py" --include="*.env*" \
  --exclude-dir=".power" --exclude-dir="node_modules" .

# 実 Dataverse URL を検出
grep -rn "\.crm[0-9]*\.dynamics\.com" \
  --include="*.ts" --include="*.tsx" --include="*.py" --include="*.env*" .

# テーブル名のハードコードを検出（サンプル名以外のプレフィックスが使われていないか）
# ※ PUBLISHER_PREFIX を使わない直書きを検出
grep -rn '"[a-z]\+_[a-z]\+s"' --include="*.ts" --include="*.tsx" src/services/
```

---

## フェーズ 2: コード再利用性チェック・修正

[sample-authoring-guide.md](../code-apps/references/sample-authoring-guide.md) のルールに従い、以下を確認・修正する。

### 2-1. `VITE_PUBLISHER_PREFIX` の使用確認

```typescript
// src/config.ts に必須
export const PUBLISHER_PREFIX =
  import.meta.env.VITE_PUBLISHER_PREFIX?.trim() ?? ""

// src/vite-env.d.ts に必須
interface ImportMetaEnv {
  readonly VITE_PUBLISHER_PREFIX?: string
  // ...
}

// src/services/*.ts — テーブル名はすべて動的
const P = PUBLISHER_PREFIX
client().retrieveMultipleRecordsAsync(`${P}_customers`, ...)

// src/lib/dataSourcesInfo.ts — カスタムテーブルも動的
[`${import.meta.env.VITE_PUBLISHER_PREFIX ?? "fallback"}_incidents`]: { ... }
```

### 2-2. 機能フラグの確認

オプション機能は `VITE_FEATURE_*` で明示制御されているか確認する。

```typescript
// src/config.ts
export const FEATURE_COPILOT =
  import.meta.env.VITE_FEATURE_COPILOT === "true"

// 使用箇所
{FEATURE_COPILOT && <CopilotPanel />}
```

### 2-3. ナビゲーション構成の確認

`VITE_CODEAPPS_NAV_SECTIONS_JSON`（JSON env var）ではなく、`src/config.ts` にコードとして固定されているか確認する。

```typescript
// ✅ src/config.ts に直接記述
export const NAV_SECTIONS: NavSection[] = [
  { category: "メイン", items: [...] },
]

// ❌ 以下は使わない
parseJsonEnv("VITE_CODEAPPS_NAV_SECTIONS_JSON", defaultNav)
```

---

## フェーズ 3: `.env.example` 生成・更新

サンプルディレクトリ直下に `.env.example` を作成する。

### テンプレート構造

```env
# ==========================================================
# {サンプル名}（{業務テーマ}）— カスタマイズガイド
# ==========================================================
# このファイルをプロジェクトルートの .env にコピーして値を入力してください。
# ルート .env.example に記載の共通変数（DATAVERSE_URL / TENANT_ID 等）も別途必要です。
# ==========================================================

# ── アプリ表示（変更推奨） ──────────────────────────────────
VITE_CODEAPPS_APP_NAME={アプリ表示名}
VITE_CODEAPPS_APP_SUBTITLE={サブタイトル}
VITE_CODEAPPS_DOCUMENT_TITLE={ブラウザタブのタイトル}
# ナビゲーション構成は src/config.ts に直接記述（env var では管理しない）

# ── 機能フラグ（変更推奨） ──────────────────────────────────
# true にすると対応タブ・機能が表示されます
VITE_FEATURE_{機能名}=false    # {機能の説明}

# ── {機能名}（VITE_FEATURE_{機能名}=true の場合必須） ─────────
# 取得元: {管理画面パス > 該当項目}
{VARIABLE_NAME}=
```

### 記載ルール

- **取得元コメント**を必ず書く（どこから値を取得するかを 1 行で示す）
- **デフォルト値は `false` / 空**（オプション機能はデフォルト OFF）
- **カテゴリ見出し**を `# ── 〇〇 ──` 形式で区切る
- **プレースホルダーは `{説明}` 形式**（変更が必要と視覚的に分かるように）

---

## フェーズ 4: README.md 生成

サンプルディレクトリ直下に `README.md` を作成・更新する。

### 必須構成

```markdown
# {サンプル名} — {業務テーマ}

{サンプルの一行説明}

## 含まれる機能

- **{ページ名}**: {説明}
- ...

## 画面構成

| ページ | パス | 説明 |
|---|---|---|
| {ページ名} | `/{path}` | {説明} |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_{table}`）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_{table}` | {説明} |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/config.ts` の `NAV_SECTIONS` | ページ構成を変更（コードで直接編集） |
| `VITE_FEATURE_*`（.env） | 機能の有効/無効を切替 |

## セットアップ手順

```bash
# 1. 共通設定（ルート .env.example → .env にコピー）
# 2. サンプル固有設定（samples/{name}/.env.example の内容を .env に追記）
# 3. Dataverse テーブルの作成
python scripts/setup_dataverse.py

# 4. データソースの追加
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_{table}
python scripts/toggle_table_lang.py jp

# 5. 動作確認
npm run dev
\```

## 機能フラグ詳細

| フラグ | デフォルト | 有効化すると |
|---|---|---|
| `VITE_FEATURE_{機能名}` | `false` | {説明} |
```

---

## フェーズ 5: 仕上げチェックリスト

すべてのフェーズが完了したら、以下を確認する。

```
[ ] .env.example が samples/{name}/ 直下に存在する
[ ] README.md が samples/{name}/ 直下に存在し、必須構成を満たしている
[ ] コード内に実 GUID・実 URL・実メールアドレスがない
[ ] VITE_PUBLISHER_PREFIX が vite-env.d.ts に宣言されている
[ ] src/config.ts に PUBLISHER_PREFIX エクスポートがある
[ ] テーブル名が services/*.ts で動的構築されている（P = PUBLISHER_PREFIX）
[ ] lib/dataSourcesInfo.ts のカスタムテーブルが動的プレフィックスを使っている
[ ] VITE_FEATURE_* による機能フラグが実装されている（オプション機能がある場合）
[ ] ナビゲーションが src/config.ts に固定記述されている（JSON env var 不使用）
[ ] .gitignore に .env / power.config.json / .power/ / src/generated/ が含まれている
[ ] src/types/ のコメントにプレフィックス置換の注意書きがある
```

---

## 実行例

```
「geek-sales をサンプルソリューション化して」
→ samples/geek-sales/ に対してフェーズ 1〜5 を実行

「このサンプルを公開用に仕上げて」
→ 現在作業中のサンプルに対してフェーズ 1〜5 を実行
```

完了後に変更内容のサマリーを報告する。修正なし・生成済みの項目は ✅、修正・生成した項目は ✨ で示す。
