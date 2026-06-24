# サンプル作成ガイド（公開リポジトリ向け）

このリポジトリのサンプル（`samples/` 配下）は**世界中の開発者が再利用・カスタマイズする前提**で公開している。
サンプルを新規作成・更新する際は以下のルールを必ず守ること。

---

## 1. セキュリティ残留の排除（必須）

サンプルコードおよび設定ファイルに**実際の値を残してはならない**。
すべてプレースホルダー形式に統一する。

### 排除・置換すべき値

| 種別 | ❌ 残してはいけない例 | ✅ 置換後のプレースホルダー |
|---|---|---|
| テナント ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`（実値） | `{your-tenant-id}` |
| 環境 ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`（実値） | `{your-environment-id}` |
| Dataverse URL | `https://myorg.crm7.dynamics.com/` | `https://{org}.crm.dynamics.com/` |
| Bot ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`（実値） | `{your-bot-id}` |
| フロー Workflow ID | 実 GUID | `{your-flow-workflow-id}` |
| 接続 ID / CONNREF | 実値 | `{your-connection-id}` |
| メールアドレス | `john@example.com`（実アドレス） | `admin@example.com` |
| PAC 認証プロファイル名 | 実プロファイル名 | `{YourProfileName}` |
| パブリッシャープレフィックス | `geek`（サンプル名由来の固定値） | `.env` の `PUBLISHER_PREFIX` から取得 |

### コード内でのテーブル名参照ルール

テーブル論理名をコードに直書き（ハードコード）してはならない。
パブリッシャープレフィックスは常に環境変数から取得して動的に構築する。

```typescript
// ❌ 絶対にやらない
"geek_expenses"
"geek_approvals"

// ✅ フロントエンド（Vite）— VITE_PUBLISHER_PREFIX から構築
const TABLE = `${import.meta.env.VITE_PUBLISHER_PREFIX}_expenses`

// ✅ Python スクリプト — PUBLISHER_PREFIX から構築
PREFIX = os.environ.get("PUBLISHER_PREFIX", "").strip()
table_logical = f"{PREFIX}_expenses"
```

### サンプル公開前チェックリスト

```
セキュリティチェック（サンプル push 前）
├── [ ] コード内に実 GUID・実 URL・実メールアドレスがないこと
├── [ ] .env / .env.local / power.config.json がコミットされていないこと
├── [ ] テーブル名が PUBLISHER_PREFIX / VITE_PUBLISHER_PREFIX を使って動的構築されていること
├── [ ] `geek_` / `myorg` 等のサンプル固有名がコード内にハードコードされていないこと
└── [ ] .gitignore に .env・power.config.json・.power/・src/generated/ が含まれていること
```

---

## 2. 環境変数の構造ルール

### 2-1. VITE 変数と非 VITE 変数の区別

| プレフィックス | 用途 | 注意 |
|---|---|---|
| `VITE_` | Vite ビルドでフロントエンドに埋め込まれる。**ブラウザから参照可能** | 秘匿情報を入れてはならない |
| なし | Python スクリプト・PAC CLI など**サーバーサイドのみ**で使用 | Dataverse URL・テナント ID 等 |

> **`VITE_` 変数はビルド成果物に平文で含まれる。** トークン・パスワード・接続文字列などを入れてはならない。

### 2-2. 必須追加変数: `VITE_PUBLISHER_PREFIX`

フロントエンド（TypeScript）でテーブル名を動的構築するために、`VITE_PUBLISHER_PREFIX` を追加している。
サンプルで Dataverse テーブルを参照するコードを書く際は、必ずこの変数を使うこと。

```typescript
// src/config.ts
export const PUBLISHER_PREFIX =
  import.meta.env.VITE_PUBLISHER_PREFIX?.trim() || ""

// src/services/expense-service.ts
import { PUBLISHER_PREFIX } from "@/config"
const EXPENSE_TABLE = `${PUBLISHER_PREFIX}_expense`
const APPROVAL_TABLE = `${PUBLISHER_PREFIX}_approval`
```

```typescript
// src/vite-env.d.ts に追加
interface ImportMetaEnv {
  readonly VITE_PUBLISHER_PREFIX?: string
  // ...その他の変数
}
```

### 2-3. 機能フラグの命名規則（`VITE_FEATURE_*`）

オプション機能（Power Automate 連携・Copilot Studio 連携等）の有効/無効は、
`VITE_FEATURE_*` 変数で明示的に制御する。
「変数が存在すれば有効」という暗黙的な判定は使わない。

```env
# ✅ 明示的なフラグ制御（推奨）
VITE_FEATURE_APPROVAL_FLOW=true    # Power Automate 承認フロー連携
VITE_FEATURE_COPILOT=false         # Copilot Studio 連携
VITE_FEATURE_EMAIL_NOTIFY=false    # メール通知
```

```typescript
// src/config.ts での読み取りパターン
export const FEATURE_APPROVAL_FLOW =
  import.meta.env.VITE_FEATURE_APPROVAL_FLOW === "true"
export const FEATURE_COPILOT =
  import.meta.env.VITE_FEATURE_COPILOT === "true"
```

```tsx
// 使用例: フラグで UI を条件表示
{FEATURE_COPILOT && <CopilotPanel />}
```

フラグが `false` でも関連コンポーネントはコードに残す（削除しない）。
学習者が「`true` にするとどうなるか」を確認できることがサンプルとしての価値。

### 2-4. ナビゲーション構成はコードに固定する

サンプルのナビゲーション構成は `src/config.ts` にコードとして直接記述する。
`VITE_CODEAPPS_NAV_SECTIONS_JSON`（env var の JSON 配列）は**サンプルでは使わない**。

**理由:**
- TypeScript で型安全に書ける（IDE 補完・コンパイルエラーが効く）
- JSON 文字列より可読性が高く、カスタマイズ箇所がコードとして明示できる
- Code Apps は変更のたびに再ビルドが必要なため、env var にしても再ビルド不要のメリットがない

```typescript
// src/config.ts — ナビゲーション構成はここに直接書く
export const NAV_SECTIONS: NavSection[] = [
  {
    category: "メイン",
    items: [
      { label: "ダッシュボード", path: "dashboard", iconKey: "dashboard" },
      { label: "経費申請",       path: "expenses",  iconKey: "receipt"   },
    ],
  },
  {
    category: "管理",
    items: [
      { label: "承認",   path: "approvals", iconKey: "check" },
      { label: "分析",   path: "analytics", iconKey: "chart" },
    ],
  },
]
```

ページを追加・削除する際は `src/config.ts` と `src/router.tsx` を合わせて編集する（ルーターとナビの整合はプレデプロイチェックで検証される）。

---

## 3. サンプル内 `.env.example` の構造

各サンプルディレクトリに `.env.example` を置き、**そのサンプル固有の変数だけ**を記載する。
共通 `.env.example`（`.github/skills/standard/references/.env.example`）に記載の共通変数（`DATAVERSE_URL` 等）は重複させない。

### ファイル配置

```
samples/
└── geek-expense/
    ├── .env.example        ← このサンプル固有の変数のみ記載
    ├── README.md
    └── src/
```

### `.env.example` の書き方テンプレート

```env
# ==========================================================
# {サンプル名}（{業務テーマ}）— カスタマイズガイド
# ==========================================================
# このファイルをプロジェクトルートの .env にコピーして値を入力してください。
# 共通 .env.example（.github/skills/standard/references/.env.example）に記載の共通変数（DATAVERSE_URL / TENANT_ID 等）も別途必要です。
# ==========================================================

# ── アプリ表示（変更推奨） ──────────────────────────────────
VITE_CODEAPPS_APP_NAME={アプリ表示名}
VITE_CODEAPPS_APP_SUBTITLE={サブタイトル}
VITE_CODEAPPS_DOCUMENT_TITLE={ブラウザタブのタイトル}
# ナビゲーション構成は src/config.ts に直接記述（env var では管理しない）

# ── 機能フラグ（変更推奨） ──────────────────────────────────
# true にすると対応タブ・機能が表示されます
VITE_FEATURE_APPROVAL_FLOW=false    # Power Automate 承認フロー連携
VITE_FEATURE_COPILOT=false          # Copilot Studio 連携

# ── Power Automate フロー（VITE_FEATURE_APPROVAL_FLOW=true の場合必須） ──
# 取得元: Power Automate > フロー詳細 URL の /workflows/{ここ}
FLOW_WORKFLOW_ID=
# 取得元: Power Automate > 接続 > 該当接続のURL末尾の ID
OUTLOOK_CONN=
# 取得元: Power Automate > ソリューション > 接続参照 > 論理名
CONNREF_OUTLOOK=

# ── Copilot Studio（VITE_FEATURE_COPILOT=true の場合必須） ────
# 取得元: Copilot Studio > 設定 > 詳細 > スキーマ名
BOT_ID=
BOT_SCHEMA=
```

### 各セクションのルール

- **取得元コメントを必ず書く**: どこから値を取得するかを1行で示す（学習者が迷わないように）
- **デフォルト値は `false` / 空**: オプション機能はデフォルトで OFF
- **カテゴリ見出しコメント**: `# ── 〇〇 ──` 形式でセクションを分ける
- **プレースホルダーは `{説明}` 形式**: 値を変える必要があることが視覚的に分かるようにする

---

## 4. ルート `.env` への集約

利用者は最終的に**プロジェクトルートに 1 つの `.env`** を置いて動かす。

```
利用者の手順:
1. 共通 .env.example（standard/references）をコピー → .env（共通変数を入力）
2. 使いたいサンプルの samples/{name}/.env.example をコピー → .env に追記（サンプル固有変数を入力）
3. npm run dev / npm run deploy
```

```env
# ===== 共通（standard/references の .env.example から） =====
DATAVERSE_URL=https://<org>.crm.dynamics.com/
TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENV_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SOLUTION_NAME=MyExpenseApp
PUBLISHER_PREFIX=myprefix
VITE_PUBLISHER_PREFIX=myprefix    # ← フロントエンド用（PUBLISHER_PREFIX と同値）
PAC_AUTH_PROFILE=MyProfile

# ===== geek-expense 固有（samples/geek-expense/.env.example からコピー） =====
VITE_CODEAPPS_APP_NAME=経費精算管理
VITE_CODEAPPS_APP_SUBTITLE=申請・承認ポータル
VITE_CODEAPPS_DOCUMENT_TITLE=経費精算管理
VITE_CODEAPPS_NAV_SECTIONS_JSON=[{"category":"メイン","items":[...]}]
VITE_FEATURE_APPROVAL_FLOW=true
FLOW_WORKFLOW_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
OUTLOOK_CONN=xxxxxxxxxxxxxxxxxxxxxxxx
CONNREF_OUTLOOK=myprefix_shared_office365_xxxxxxxx
```

> `PUBLISHER_PREFIX`（Python スクリプト用）と `VITE_PUBLISHER_PREFIX`（フロントエンド用）は**同じ値**を設定する。
> 二重管理になるが、VITE_ なしの変数はビルド時にフロントエンドに渡されないため両方必要。

---

## 5. サンプル README の必須項目

各サンプルの `README.md` には以下を必ず含める。

```markdown
# {サンプル名}

{業務テーマ}向けの Code Apps サンプル。

## 含まれる機能

- ページ1: 説明
- ページ2: 説明

## 使い方

1. 共通 `.env.example`（standard/references）を `.env` にコピーして共通設定を入力
2. `samples/{name}/.env.example` の内容を `.env` に追記
3. 機能フラグ（`VITE_FEATURE_*`）を用途に合わせて設定
4. `npm run dev` で動作確認

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/config.ts` の `NAV_SECTIONS` | ページ構成を変更（コードで直接編集） |
| `VITE_FEATURE_*`（.env） | 機能の有効/無効を切替 |

## Dataverse テーブル

このサンプルで使用するテーブル（`{prefix}` は `PUBLISHER_PREFIX` の値）:

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_expense` | 経費申請 |
| `{prefix}_approval` | 承認レコード |
```
