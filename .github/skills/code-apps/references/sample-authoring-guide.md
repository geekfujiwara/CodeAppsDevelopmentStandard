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

## 6. 利用者が持ち込んだ実データで試すとき

不動産サイトの間取り図・撮影した写真・顧客の帳票など、**掲載元・権利者のあるデータはリポジトリ（サンプル・テスト・fixture）に入れない**。
それでも回帰を止めるために、次の 2 段で試験する。

| 段 | 内容 |
|---|---|
| 合成データの試験（コミットする） | 実データの**特徴**（色・線の太さ・解像度・ノイズ・記号・余白の表記など）を再現したデータをテストの中で生成し、期待する結果を確かめる。実データで見つかった失敗は、まずこの合成データで再現してから直す |
| 実データの試験（ローカルのみ） | `.tools/` など `.gitignore` 済みの場所に実データがあるときだけ動く試験にする（`test(..., { skip: !existsSync(...) })`）。CI では skip になる |

- 合成データは「実データで起きた失敗の原因」を含めて作る（例: 灰色の壁と明るい色の塗り、窓の細い 2 本線、敷地の破線、階の表記）。正常な見本だけでは、直した内容が試験されない
- 実データのファイル名・パスはコードに直書きしない（ローカルの所定の場所を見る）
- アプリが取り込み時に前処理（縮小・JPEG への再圧縮など）をするなら、**同じ前処理を通したデータでも試す**。元のファイルでは通るのに、画面から取り込むと結果が変わることがある（線の端が数 cm ずれる、圧縮の切れ端が残る）

### 6.1 2 件目の実データ・入力のゆれ

- **2 件目の実データ（別の作り・別のサイト）で必ず崩れる**。色の意味（居室が水色の図面も桃色の図面もある）・線の太さ・外形の描き方は作り手ごとに違う。
  新しい判定は**入力の種類で限定**し（例: 色付きの図面だけ、外形が閉じていない図面だけ）、**同梱サンプルの出力が 1 バイトも変わらないこと**（ハッシュ）を変更のたびに確かめる。
  変わったら差分を読み、正しい変化（バグの修正）だけを受け入れる
- **入力の数値を少しずつ変えて試す**（縮尺・しきい値などを ±2% の範囲で数点）。結果が途中で入れ替わるなら、格子・量子化の境目に乗っている。
  入力の数値には誤差がある前提で、候補の中から「取れた構造」が最も多いものを選ぶ純関数を用意し、その選び方を試験する
- **画面から通しで試す**（取り込み → 自動入力 → 生成）。単体の試験では、部品をつないだときの順序の問題が見えない
  （例: 1 枚目の図面だけ取り込んだ時点で縮尺の自動調整が走り、後から足した 2 枚目が既定値のまま残る。貼り付けた文字列で、取り込まない見出しが値に混ざる）

### 6.2 代表 N 件の実データで通し検証する

1 件ずつ直した後は、公開されている実データから**代表的な N 件（例: 10 件。種類・作り手が偏らないように選ぶ）**を集め、取り込みから生成まで一括で試す。
1 件ずつでは見えない「データの描き方の幅」と「直した内容が別の件を壊していないか」が分かる。

- 集めるときは取得先の `robots.txt`（`Crawl-delay` など）と利用規約に従い、間隔を空けて取得する。集めたデータは `.gitignore` 済みの場所に置き、コミットしない
- 1 つのファイルに複数の単位が入っていることを前提にする（例: 不動産サイトの図面は 1 枚に全階を描く。横に並べる・縦に積む・田の字・塔屋/ロフトつき・注記の吹き出しつき）。
  自動で決められない並びは利用者が直せる操作（入れ替えボタン）を用意し、対象外の形（敷地図に重ねた図面など）は警告を出して手での入力を求める
- 評価は 2 段で行う。**純関数の評価**（解析 → 生成を Node で直接呼ぶ）と、**画面を通す評価**（ヘッドレスのブラウザで新規作成 → 取り込み → 自動入力 → 生成を UI 操作で行う）。
  純関数の評価がすべて通っても、画面では自動処理が一度も動いていないことがある（troubleshooting #87）
- 時間は**待ち（時限）と処理を分けて**記録する。時限に達した待ちを含めた所要時間を処理の遅さと読み違えやすい
- 一部の件の問題を直す**一般的な処理**（例: 細い線を数えない）は、別の件の正しい部分を壊しやすい。全件の**中間結果（切り出し範囲・推定値）を変更前後で差分**し、狙った件以外が変わらないことを確かめてから採用する
- 結果は件ごとの表（推定誤差・取れた構造の数・期待値との一致・処理時間）で残し、対象外・弱い点も書く
