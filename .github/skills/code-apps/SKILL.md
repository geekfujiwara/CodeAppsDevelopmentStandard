---
name: code-apps
description: "Power Apps Code Apps（コードファースト）の初期化・Dataverse 接続・UI 設計・開発・デプロイ。TypeScript + React + Tailwind CSS + shadcn/ui で開発する。CSP 構成・メール送信パターンも含む。"
category: ui
triggers:
  - "Code Apps"
  - "power-apps init"
  - "power-apps push"
  - "add-data-source"
  - "DataverseService"
  - "Tailwind"
  - "shadcn"
  - "React"
  - "TypeScript"
  - "Vite"
  - "Code Apps デプロイ"
  - "nameUtils パッチ"
  - "日本語サニタイズ"
  - "Code Apps デザイン"
  - "UI 設計"
  - "コンポーネント選定"
  - "画面レイアウト"
  - "ギャラリー"
  - "テーブル"
  - "カンバン"
  - "ガントチャート"
  - "ダッシュボード"
  - "フォーム"
  - "デザイン例"
  - "iframe"
  - "embed"
  - "埋め込み"
  - "CSP"
  - "Content Security Policy"
  - "frame-src"
  - "connect-src"
  - "メール送信"
  - "PDF添付"
  - "PDF生成"
  - "htmlToPdfBase64"
  - "ContentBytes"
  - "base64"
  - "html2canvas"
  - "jsPDF"
  - "日本地図"
  - "地図"
  - "マップ"
  - "JapanMap"
  - "add-flow"
  - "list-flows"
  - "フロー呼び出し"
  - "フロー連携"
  - "AI Builder"
  - "executeAsync"
  - "dataSourcesInfo"
  - "Copilot Studio コネクタ"
  - "Copilot Studio 直接"
  - "ExecuteCopilotAsyncV2"
  - "shared_microsoftcopilotstudio"
  - "エージェント呼び出し"
  - "会話継続"
  - "conversationId"
  - "デプロイして"
  - "プッシュして"
  - "ディープリンク"
  - "deep link"
  - "queryParams"
  - "パラメータ渡し"
  - "URL パラメータ"
---

# Code Apps 開発スキル

Power Apps Code Apps（コードファースト）を **TypeScript + React + Tailwind CSS + shadcn/ui** で開発する。
UI 設計・CSP 構成・メール送信パターンまで Code Apps 開発の全領域をカバーする統合スキル。

> [!NOTE]
> Microsoft Learn の現行概要では、Code Apps は **React / Vue などの SPA を Power Apps 上でホストする仕組み** とされている。
> この開発標準はその中でも **React ベース実装に標準化**したガイドであり、他フレームワーク一般論ではなく、このリポジトリのテンプレートと運用実績に基づく推奨事項をまとめている。

## 1. 概要

Code Apps 開発は **設計 → 初回デプロイ → データソース接続 → 改善デプロイ** の順に進む。
本ファイルは各段階の **正常系フロー** をまとめ、異常系・詳細・トラブルシューティングは [§5 リファレンス](#5-リファレンス) の各ドキュメントに逃がしている。

### 公式概要との整合メモ（2026-05 時点）

- Code Apps は **Single-Page Application (SPA)** を対象とする。
- Microsoft の推奨 CLI は `npx power-apps` 系で、`pac code` は将来廃止予定。
- ただし本スキルでは、`npx power-apps push` のテナント解決不具合に当たる場合のみ `pac code push` を **暫定ワークアラウンド** として許容する。
- 利用者には **Power Apps Premium ライセンス** が必要。
- Power Apps mobile / Windows アプリ、Power Platform Git integration、SharePoint forms integration など、Code Apps では未対応の機能がある前提で設計する。

### 標準ワークフロー全体像

```
[設計]  ① デザインテンプレートを選ばせる（6種・プレビュー付き）
        ② 画面設計（design-system）→ ユーザー承認
          │
[§2 初回デプロイ]
        ③ テンプレート scaffold + npm install
        ④ pac code init（power.config.json 生成）
        ⑤ vite.config.ts 必須設定の確認 / .env 設定
        ⑥ npm run deploy（build + pac code push）→ Dataverse 接続確立
          │
[§3 データソース接続]
        ⑦ pac code add-data-source（toggle_table_lang.py で日本語回避）
        ⑧ dataSourcesInfo は re-export / getClient(dataSourcesInfo)
          │
[§4 改善デプロイ]
        ⑨ src/ 実装 → npm run build → pac code push（反復）
```

### この後の章構成

| 章 | 内容 |
|---|---|
| §1 概要（本章） | 標準ワークフロー全体像・大前提・設計フェーズ（デザインテンプレート選択） |
| [§2 初回デプロイ](#2-初回デプロイ) | 環境前提・scaffold・init・初回 build & push |
| [§3 データソース接続](#3-データソース接続) | add-data-source・dataSourcesInfo・Lookup 名前解決 |
| [§4 改善デプロイ](#4-改善デプロイ) | 開発時の必須ルール・再デプロイ・プレデプロイレビュー |
| [§5 リファレンス](#5-リファレンス) | 全リファレンス索引・技術スタック・.env |

> [!NOTE]
> 本スキル内のコード例は `{prefix}_tablename` 等のプレースホルダーで汎用化されています。
> 実際のテーブル名・型名は、あなたのプロジェクトのエンティティに読み替えてください。
> パターン（Lookup 名前解決、SDK ラッパー、useMemo マップ等）はそのまま適用できます。

> [!IMPORTANT]
> publisher prefix は環境ごとに異なる（`.env` の `PUBLISHER_PREFIX`）。
> シェル例では `${PUBLISHER_PREFIX}_tablename`、Python スクリプトでは `os.environ["PUBLISHER_PREFIX"]` を使い、

### 設計フェーズ（実装前に必須）

**このスキルでコードを書く前に、デザインテンプレートの選択と UI 設計を行い、ユーザーの承認を得ていること。**

```
① デザインテンプレートを選ばせる（references/design-templates.md）
   → 6 種の配色テンプレートを一覧 + プレビューで提示し、ユーザーに 1 つ選んでもらう
② デザインシステムリファレンス（references/design-system.md）を読み込む
③ 画面構成・コンポーネント選定・Lookup 名前解決パターンを設計
④ ユーザーに設計（選択テンプレート + 画面設計）を提示し、「この設計で進めてよいですか？」と承認を得る
⑤ 承認後、選択テンプレートの CSS Variables を styles/index.pcss に適用してから実装
```

### ① デザインテンプレートの選択（実装前に必ず提示）

[デザインテンプレート集](references/design-templates.md) を読み込み、以下の一覧とプレビューをユーザーに提示して 1 つ選んでもらう。
**デプロイされるアプリは常に 1 テンプレート**（ダーク/ライト切替は `ThemeProvider` + `ModeToggle`）。

```
## デザインテンプレートを選んでください

| # | テンプレート名 | 配色 | 印象 | プレビュー |
|---|--------------|------|------|-----------|
| 1 | Ocean Blue      | 🔵 ブルー              | 爽やか・標準・業務アプリ全般       | references/previews/ocean-blue.html |
| 2 | Indigo / Violet | 🟣 インディゴ+バイオレット | モダン・先進的・クリエイティブ   | references/previews/indigo-violet.html |
| 3 | Emerald / Teal  | 🟢 エメラルド+ティール  | ナチュラル・安心感・ヘルスケア     | references/previews/emerald-teal.html |
| 4 | Amber / Orange  | 🟠 アンバー+オレンジ    | エネルギッシュ・製造・建設         | references/previews/amber-orange.html |
| 5 | Rose / Pink     | 🌸 ローズ+ピンク        | 親しみやすい・カジュアル・サービス業 | references/previews/rose-pink.html |
| 6 | Slate Mono      | ⚫ スレート（モノトーン） | ミニマル・堅実・エンタープライズ   | references/previews/slate-mono.html |

プレビュー HTML をブラウザで開くと実際の配色・レイアウトを確認できます。
番号で選んでください（デフォルト: 1）
```

> 選択後、テンプレートの CSS Variables（`:root` / `.dark` + `--radius`）を `styles/index.pcss` に適用する。
> 詳細な変数一式・適用手順は [デザインテンプレート集](references/design-templates.md) を参照。

> **設計で提示する内容**: 選択したデザインテンプレート、画面一覧（ページ名・ルート）、各画面のコンポーネント構成（ListTable / InlineEditTable / StatsCards / FormModal 等）、
> カラム定義、Lookup 名前解決の方法（`_xxx_value` + `useMemo` Map）、ナビゲーション構造

### 大前提: 一つのソリューション内に開発

Dataverse テーブル・Code Apps・Power Automate フロー・Copilot Studio エージェントは **すべて同一のソリューション内** に含める。

```
SOLUTION_NAME={YourSolutionName}  ← .env で定義。全フェーズで同じ値を使用
PUBLISHER_PREFIX={prefix}          ← ソリューション発行者の prefix
```

- Code Apps は `npx power-apps push` でソリューション内にデプロイされる（環境 ID で紐づけ）
- Dataverse データソース追加時はソリューション内のテーブルを参照
- 開発・テスト・本番の環境間移行はソリューションのエクスポート/インポートで行う

## 2. 初回デプロイ

### 環境の前提条件（デプロイ前に必ず確認）

```
1. Power Platform 管理センターで「コード アプリを許可する」がオン
   → オフの場合: CodeAppOperationNotAllowedInEnvironment (403) エラー

2. PAC CLI 認証プロファイルが対象環境用に作成済み
   pac auth create --name {profile-name} --environment {ENVIRONMENT_ID}
   pac auth list  # * が付いているのがアクティブ

3. power.config.json は pac code init で生成する
   → テンプレートから手動コピーしない
   → 別環境の appId が残っていると: AppLeaseMissing (409) エラー
   → 新規環境では必ず pac code init で新規生成
```

### 標準ワークフロー（概要）

Code Apps のプロジェクトは **3 つの生成段階** で構成される。**各段階の生成物を手動作成・他プロジェクトからコピーしてはならない。**

```
① テンプレート scaffold    → React/Vite プロジェクト一式
   （vite.config.ts, plugins/plugin-power-apps.ts, styles/, src/, tsconfig*, package.json, index.html, eslint.config.js）
② pac code init            → power.config.json のみ（+ .power/ ディレクトリ）
③ pac code add-data-source → .power/schemas/appschemas/dataSourcesInfo.ts, src/generated/
```

> **重要**: `pac code init` は `vite.config.ts` や `plugins/plugin-power-apps.ts` を生成**しない**。
> これらは①のテンプレート由来。`init` がやるのは認証と `power.config.json` の生成だけ。
> 詳細手順は下記「標準ワークフロー（この順序で進める）」と [ビルドリファレンス](references/build-reference.md) を参照。

### ファイルの出所（誰が生成するか — 手動作成禁止）

| 生成元 | 生成されるファイル | カスタマイズ |
|---|---|---|
| **① テンプレート scaffold**<br>（`@GeekPowerCode` の scaffold / `npx degit` の Vite スターター） | `vite.config.ts` | ⚠ `base: "./"` 必須・`external` に `@microsoft/power-apps` を含めない。`manualChunks` 追加のみ → [ビルドリファレンス Step 2](references/build-reference.md) |
| | `plugins/plugin-power-apps.ts` | ❌ 変更不要（Vite 開発サーバー用・`apply: "serve"` の dev 専用） |
| | `styles/index.pcss` | ✅ 配色テンプレートで差し替え可 → [デザインテンプレート集](references/design-templates.md) |
| | `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` | ⚠ パスエイリアス等の追加のみ |
| | `eslint.config.js` | ⚠ ルール追加のみ |
| | `index.html` | ❌ 不要 |
| | `package.json` | ⚠ 依存追加のみ |
| | `src/main.tsx` / `src/App.tsx` / `src/index.css` | ✅ 自由にカスタマイズ |
| **② `pac code init`** | `power.config.json`（環境 ID・アプリ ID） | ❌ 禁止（環境固有） |
| **③ `pac code add-data-source`** | `.power/schemas/appschemas/dataSourcesInfo.ts` / `src/generated/` | ❌ 手動編集禁止（SDK が管理） |

> **よくある失敗**: サンプルの `src/` だけを別プロジェクトにコピーして始めると、①由来の `plugins/` や `styles/` が欠落しビルドが失敗する → [トラブルシューティング #25](references/troubleshooting.md)。
>
> **`pac code init` vs `npx power-apps init`**: どちらも認証して `power.config.json` を生成するだけだが、`pac code init` は PAC CLI 認証プロファイルを使うためテナント不一致が起きない。`npx power-apps init` は npm パッケージ独自の MSAL 認証で、マルチテナント環境で `Environment not found` エラーが出ることがある。**本開発標準では `pac code init` を標準とする。**

### テンプレートのプレースホルダー設計

テンプレートにはサンプルの営業管理ページ（顧客・商談・テリトリー等）が含まれるが、
これらは **テーマ開発の参考実装** であり、そのままデプロイしてはならない。

テンプレートのデモメニューには `template: true` フラグが付いている。
このフラグが残ったまま `npm run predeploy` を実行するとエラーになるため、削除忘れを防げる。

```typescript
// テンプレートの config.ts（初期状態）— template: true 付き
{ label: "顧客", path: "customers", iconKey: "customers", template: true },
// ↑ template: true が付いた行はデプロイ前に削除 or テーマ用に書き換え

// テーマ固有のメニュー（template フラグなし）
{ label: "AI CoE ダッシュボード", path: "copilot-dashboard", iconKey: "copilot" },
```

```
テンプレート構成:
  src/config.ts         → デフォルトはダッシュボード1画面のみ。テーマに合わせて変更する
  src/router.tsx        → デフォルトはダッシュボード1ルートのみ。テーマのページを追加する
  src/pages/dashboard.tsx → プレースホルダー。テーマ固有のダッシュボードに置き換える
  .env.example          → テーマ固有の設定を .env にコピーして値を設定する

デプロイ前チェック:
  npm run predeploy     → .env 設定・power.config.json 存在を自動検証
  npm run deploy        → predeploy + build + pac code push を一括実行
```

### .power/ と src/generated/ は SDK コマンドで生成（手動作成禁止）

`.power/` は `.gitignore` で除外されているため、git clone 後は `dataSourcesInfo.ts` が存在しない。
**カスタムスクリプトで生成せず、SDK コマンドで必ず再生成すること。**

```
❌ git clone 直後に npm run build
   → TS2307: Cannot find module '../../../.power/schemas/appschemas/dataSourcesInfo'

❌ カスタムスクリプト（generate_datasources_info.py 等）で手動生成
   → SDK が管理するファイルを自前で作ると整合性が崩れる

❌ src/lib/dataSourcesInfo.ts にカスタムテーブル定義を手動追記
   → SDK 自動生成と重複し、将来の add-data-source 実行時に不整合が起きる
   → 手動追記だけでは Power Apps プラットフォームがテーブルへのアクセスを許可しない

✅ pac code add-data-source -a dataverse -t {table} で各テーブルを追加
   → .power/schemas/appschemas/dataSourcesInfo.ts が自動更新される
   → その後 npm run build が成功する
   → 日本語表示名エラー時は toggle_table_lang.py で英語に切り替えてから実行
   → systemuser・bot 等のシステムテーブルも同じコマンドで追加できる
```

> **`src/lib/dataSourcesInfo.ts` は生成ファイルを re-export するだけ。**
> `export { dataSourcesInfo as default } from "../../.power/schemas/appschemas/dataSourcesInfo"` の 1 行でよい。
> 手動でテーブルを書き足すのは、コネクタ等 add-data-source で追加できないものに限る。

### 標準ワークフロー（この順序で進める）

以下が **上から順に実行すれば問題なく動く** 統一フローである。

```bash
# ── Step 0: テンプレート scaffold ──
# 空フォルダに Code Apps テンプレート（Vite スターター）を展開する。
# vite.config.ts / plugins/plugin-power-apps.ts / styles/ / tsconfig* / index.html / src/ 一式がここで揃う。
# 標準では @GeekPowerCode が scaffold する。手動で行う場合:
#   npx degit github:microsoft/PowerAppsCodeApps/templates/vite .
npm install

# ── Step 1: Power Apps 初期化（power.config.json を生成）──
pac code init -env {ENVIRONMENT_ID} -n "AppName"
# ↑ power.config.json がここで生成される（environmentId, buildPath 等が記録される）
# ⚠ vite.config.ts や plugins/ は生成しない（それらは Step 0 のテンプレート由来）
# PAC CLI 認証プロファイルを使用するためテナント不一致なし

# ── Step 2: vite.config.ts 必須設定の確認 ──
# テンプレートに含まれる vite.config.ts を確認し、以下を検証する:
#   □ base: "./" が設定されている（未設定 → アセット 404）
#   □ rollupOptions.external に "@microsoft/power-apps" が含まれていない（含めると → モジュール解決エラー）
#   □ plugins に powerApps() が含まれている
# 詳細テンプレートは → references/build-reference.md Step 2

# ── Step 3: 環境設定 ──
# .env.example を .env にコピーし、テーマ固有の値を設定する
# VITE_CODEAPPS_APP_NAME, VITE_CODEAPPS_APP_SUBTITLE 等

# ── Step 4: 初回ビルド＆デプロイ ──
# ⚠ power.config.json が存在しないと pac code push は失敗する（Step 1 の init が必須）
npm run build
pac code push -env {ENVIRONMENT_ID} -s {SOLUTION_NAME}
# この時点で Power Platform にアプリが登録され Dataverse 接続が確立
# power.config.json に appId が追記される

# ── Step 5: データソース追加 ──
# テーブル論理名は .env の ${PUBLISHER_PREFIX} を変数展開して組み立てる。
# `geek_*` 等の literal をハードコードしないこと。

# 日本語表示名エラー回避: 一時的に英語に切替
python scripts/toggle_table_lang.py en

# pac code add-data-source で追加（PAC CLI 認証を使用、テナント不一致なし）
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_{table_basename}
# 全テーブルに対して繰り返す

# 日本語に復元
python scripts/toggle_table_lang.py jp

# ── Step 6: 開発 → 再デプロイ ──
# src/ 配下のアプリコードを実装
# ⚠ @microsoft/power-apps はサブパスインポートを使用すること:
#   import { getClient } from "@microsoft/power-apps/data";
#   import { getContext } from "@microsoft/power-apps/app";
#   ❌ import { getClient } from "@microsoft/power-apps";  ← ルートインポートはビルドエラー
#
# ⚠ getClient は dataSourcesInfo を必須引数として渡すこと:
#   const client = getClient(dataSourcesInfo);  ← ✅
#   const client = getClient();                 ← ❌ Dataverse に接続できない
#   → dataSourcesInfo は .power/schemas/appschemas/dataSourcesInfo.ts から import
#   → 詳細テンプレートは → references/build-reference.md Step 6
#
# ⚠ vite-env.d.ts に declare module "@microsoft/power-apps/data" を書かない:
#   SDK が正式な .d.ts を提供しているため、手動宣言すると型が上書きされ
#   getClient() が引数なしで呼べてしまう（実行時にデータ取得不可）
npm run build
pac code push -env {ENVIRONMENT_ID} -s {SOLUTION_NAME}
```

```
❌ vite.config.ts の base: "./" を設定せずにデプロイ
   → Power Apps 上でアセット（CSS/JS/フォント）がすべて 404

❌ @microsoft/power-apps を rollupOptions.external に指定
   → ブラウザが "Failed to resolve module specifier" エラーでアプリが起動しない

❌ @microsoft/power-apps をルートからインポート
   → "." is not exported from package エラーでビルド失敗

❌ getClient() を引数なしで呼ぶ
   → SDK がデータソース情報を持たず Dataverse に接続できない（空データ / 無反応）
   → 必ず getClient(dataSourcesInfo) と dataSourcesInfo を渡すこと

❌ vite-env.d.ts に declare module "@microsoft/power-apps/data" を手動追記
   → SDK の正式な型定義を上書きし getClient() が引数なしで通ってしまう
   → 実行時に Dataverse 接続不可。SDK パッケージの .d.ts をそのまま使用すること

❌ ローカルで全部作ってから最後にデプロイ
   → Dataverse 接続が確立されず add-data-source が失敗する

❌ テンプレートの src/hooks/ をワイルドカード削除
   → use-theme.ts が消えてビルドが壊れる

❌ テンプレートをそのままデプロイ
   → npm run predeploy が .env 未設定を検知して失敗する

❌ 手動で dataSourcesInfo.ts にカスタムテーブル定義を追記
   → SDK が管理する .power/schemas/appschemas/dataSourcesInfo.ts と重複・不整合になる
   → pac code add-data-source で正しく追加すること
```

### デプロイコマンドの選択（pac code を標準とする）

| コマンド | 認証基盤 | テナント問題 | 推奨度 |
|---|---|---|---|
| `pac code init -env {ID} -n "Name"` | PAC CLI プロファイル | なし | ✅ 標準 |
| `pac code push -env {ID} -s {SOL}` | PAC CLI プロファイル | なし | ✅ 標準 |
| `pac code add-data-source -a dataverse -t {table}` | PAC CLI プロファイル | なし | ✅ 標準 |
| `npm run deploy` | PAC CLI プロファイル | なし | ✅ 推奨（predeploy チェック付き） |
| `npx power-apps init` | npm パッケージ独自 MSAL | Environment not found 頻発 | ⚠ 動くならOK |
| `npx power-apps push` | npm パッケージ独自 MSAL | 403/404 頻発 | ⚠ 動くならOK |
| `npx power-apps add-data-source` | npm パッケージ独自 MSAL | 403 頻発 | ⚠ 動くならOK |

> **注**: Microsoft は `npx power-apps` を推奨ツールとしているが、テナント解決の不具合が
> 2026-06 時点で未修正のため、本開発標準では `pac code` 系を標準採用する。
> `npx power-apps` が正常動作する環境ではそちらを使っても良い。

## 3. データソース接続

### データソース追加の判断フロー（検証済 2026-06-10）

```
┌─ pac code add-data-source -a dataverse -t {table}
│   └─ 成功 → 完了（.power/schemas/appschemas/dataSourcesInfo.ts が自動更新）✅
│   └─ 失敗: "Failed to sanitize string 会話サマリー"
│       └─ toggle_table_lang.py ワークアラウンド適用
│           python scripts/toggle_table_lang.py en  ← 英語に切替
│           pac code add-data-source -a dataverse -t {table}
│           python scripts/toggle_table_lang.py jp  ← 日本語に復元
│
├─ フォールバック: npx power-apps add-data-source
│   └─ node .github/skills/code-apps/references/patch-nameutils.cjs  ← 日本語パッチ適用
│   └─ npx power-apps add-data-source --api-id dataverse
│        --resource-name {table} --org-url {DATAVERSE_URL} --non-interactive
│   └─ 成功 → 完了（Model/Service ファイルも生成される）✅
│   └─ 失敗: 403 テナント不一致 → pac code 版を使う
└─────────────────────────────────────────────────────────────
```

**原則**: `pac code add-data-source` を最初に試す（PAC CLI 認証 = テナント不一致なし）。
日本語エラー時は `toggle_table_lang.py` で一時的に英語に切り替えて実行する。
`npx power-apps add-data-source` はフォールバック（`patch-nameutils.cjs` 適用が必要）。

**`dataSourcesInfo.ts` にテーブルを手書きしない。**
SDK が `.power/schemas/appschemas/dataSourcesInfo.ts` を自動生成し、`src/lib/dataSourcesInfo.ts` はそれを re-export するだけ。

### 日本語 DisplayName サニタイズエラーの回避

日本語テーブル表示名で `Failed to sanitize string` エラーが発生する。
`pac code add-data-source` 使用時は `toggle_table_lang.py` で英語に切り替えてから実行する。
`npx power-apps add-data-source` 使用時は `patch-nameutils.cjs` で CJK 許容パッチを適用する。

→ 詳細: **[日本語サニタイズリファレンス](references/japanese-sanitize.md)**

## 4. 改善デプロイ

### CSP（Content Security Policy）違反の回避

Power Apps ランタイムはデフォルトで `connect-src 'none'`。外部 API への `fetch` はブロックされる。
Dataverse SDK（`getClient(dataSourcesInfo)`）経由のデータアクセスのみ CSP 安全。

→ 詳細: **[CSP 構成](references/csp.md)**

### ログインユーザーの systemuserid 取得

SDK `getContext().user.objectId`（Entra AAD Object ID）を取得し、`systemuser` テーブルの
`azureactivedirectoryobjectid` でマッピングして `systemuserid` を解決する。
`Xrm`・`fetch`・`executeAsync` は CSP でブロックされるため使用不可。

→ 詳細: **[ユーザー識別リファレンス](references/user-identity.md)**

### ディープリンク: 外部から Code Apps の特定ページに遷移

SDK の `getContext().app.queryParams` で親ウィンドウの URL パラメータを取得する（cross-origin iframe のため `window.location.search` は不可）。

→ 詳細: **[ディープリンクリファレンス](references/deep-link.md)**

### 基本設計方針: モーダル操作 + z-index ルール

**新規作成・編集・削除はすべてモーダル（Dialog / AlertDialog）で操作する。**
サイドバー z-40 / Dialog z-[300]/z-[400] で重なり問題を回避。

### SDK 生成サービスとデータソースパターン

`pac code add-data-source` で `.power/schemas/appschemas/dataSourcesInfo.ts` が自動更新される（systemuser 等も同様）。
`src/lib/dataSourcesInfo.ts` はこの生成ファイルを re-export するだけ。手書き追記はコネクタ等に限る。

フロー連携時は統合 `dataSourcesInfo` が必須（`getClient(dataSourcesInfo)` はシングルトンのため、最初の呼び出しで全データソースを含める必要がある）。

→ 詳細: **[データソースパターン](references/data-source-patterns.md)**

### Lookup 名はクライアントサイド名前解決が必須

SDK 生成サービスは Lookup 名フィールド（`createdbyname` 等）を返さない。
`_xxx_value`（GUID）+ `useMemo` マップで名前解決する。
データソース未登録テーブルの場合は OData FormattedValue アノテーションを使う。

→ 詳細: **[Lookup 名前解決リファレンス](references/lookup-resolution.md)**

### scaffold 時に含めないファイル（注意）

エージェントが新規テーマを scaffold する際、以下のファイルは**生成しない**。
外部 API 呼び出しを含むデモページは CSP 違反になるため、業務テーマに不要なものは最初から作らない。

```
生成しないファイル（例）:
├── src/pages/design-examples.tsx ← 外部API呼出=CSP違反
├── src/hooks/use-learn-catalog.ts ← Microsoft Learn API（CSP違反）
├── src/lib/learn-client.ts        ← 外部API呼出（CSP違反の根本原因）
├── src/lib/gallery-utils.ts       ← デモ専用ユーティリティ
├── src/components/chart-dashboard.tsx  ← recharts 依存（不要な場合）
├── src/components/gantt-chart.tsx      ← デモ用
├── src/components/kanban-*.tsx         ← デモ用（業務要件がない場合）
├── src/components/tree-structure.tsx   ← mermaid 依存
└── src/components/ui/chart.tsx         ← recharts 依存（不要な場合）
```

> **標準コンポーネント（必ず含める）**: `form-modal.tsx`, `inline-edit-table.tsx`, `list-table.tsx`,
> `loading-skeleton.tsx`, `fullscreen-wrapper.tsx`, `sidebar-layout.tsx`, `sidebar.tsx`,
> `mode-toggle.tsx`, `ui/` 配下全て。これらは将来の画面実装で活用できる汎用コンポーネント。


### 構築手順の詳細

詳細な構築手順（初期化・Dataverse 接続・ビルド・デプロイ）は [構築リファレンス](references/build-reference.md) を参照。

### TanStack React Query パターン

自前 `DataverseService` を React Query で包むパターン（`useRecords` / `useCreateRecord` 等）は [データソースパターン](references/data-source-patterns.md) を参照。

### プレデプロイレビュー（「デプロイして」「プッシュして」時の必須チェック）

「デプロイして」「プッシュして」が指示されたとき、ビルド前に必ずレビューを実行する。
`dataSourcesInfo` 整合性・インポート元・ルーター種別（createHashRouter 必須）・サイドバー fixed レイアウト等を確認。

→ 詳細: **[プレデプロイレビューリファレンス](references/pre-deploy-review.md)**

### ビルド・デプロイの注意事項

- `noUnusedLocals: true` のため未使用 import は即削除
- PowerShell で `npm run build 2>&1` の後にテキストを付けない（Vite が入力パスと誤解）

→ 詳細: **[ビルドリファレンス](references/build-reference.md)**

### Power Automate フロー統合

フロー追加は `npx power-apps add-flow --flow-id {id}` を使う（`add-data-source --api-id logicflows` は旧方式）。
Copilot Studio 応答は JSON 配列文字列で返るため `JSON.parse()` → 配列の最初の要素を取得する。
502 タイムアウト対策としてローカル検索へのフォールバックを必ず実装する。

→ 詳細: **[フロー連携リファレンス](references/flow-integration.md)**

---

## 5. リファレンス

正常系の流れは本ファイル（§1〜§4）に集約し、**異常系・詳細手順・トラブルシューティングは references/ に逃がしている**。各トピックの詳細は以下を参照。

| リファレンス | 内容 |
|---|---|
| [デザインテンプレート集](references/design-templates.md) | 設計時に選択する配色テンプレート 6 種（プレビュー HTML・CSS Variables 一式・light/dark 対応） |
| [デザインシステム](references/design-system.md) | shadcn/ui + Tailwind CSS v4 のコンポーネント選定・画面設計パターン |
| [コンポーネントカタログ](references/component-catalog.md) | 全コンポーネントの詳細仕様・使用例 |
| [構築リファレンス](references/build-reference.md) | ビルド・デプロイの詳細手順・vite.config.ts 必須設定・TypeScript エラー対処 |
| [データソースパターン](references/data-source-patterns.md) | SDK 生成サービス・dataSourcesInfo・getClient(dataSourcesInfo)・TanStack React Query |
| [Lookup 名前解決](references/lookup-resolution.md) | クライアントサイド名前解決・OData FormattedValue パターン |
| [日本語サニタイズ](references/japanese-sanitize.md) | 日本語 DisplayName エラーの回避（toggle_table_lang.py / patch-nameutils.cjs） |
| [CSP 構成](references/csp.md) | iframe 埋め込み・外部 API 接続時の CSP 設定・CSP 安全な SDK メソッド一覧 |
| [ユーザー識別](references/user-identity.md) | ログインユーザーの systemuserid 取得パターン（CSP 安全） |
| [ディープリンク](references/deep-link.md) | MDA / Power Automate から特定ページへパラメータ付き遷移 |
| [フロー連携](references/flow-integration.md) | Power Automate フロー呼び出し・Copilot Studio 応答パース・エラーハンドリング |
| [Copilot Studio コネクタ](references/copilot-studio-connector.md) | Copilot Studio エージェント直接呼び出し・会話継続・レスポンス解析 |
| [コネクタリファレンス](references/connector-reference.md) | Code Apps で利用する主要コネクタの追加方法・使用例 |
| [メール・PDF 送信](references/mail-pdf.md) | HTML→PDF 変換・Power Automate 経由メール添付送信パターン |
| [日本地図パターン](references/japan-map-pattern.md) | SVG 都道府県地図の実装パターン |
| [高度な実装パターン](references/advanced-patterns.md) | マルチ環境・オフライン・i18n・パフォーマンス最適化パターン |
| [プレデプロイレビュー](references/pre-deploy-review.md) | 「デプロイして」「プッシュして」時の自動チェック手順 |
| [新規テーマ開始チェックリスト](references/new-theme-checklist.md) | 前テーマの残骸がないクリーン開始の確認手順・scaffold 時に含めないファイル |
| [トラブルシューティング](references/troubleshooting.md) | 頻出エラーと対処法（GUID フィルタ・`.toLowerCase()` 統一・テンプレート削除時の use-theme 巻き添え 等） |
| [サンプル作成ガイド](references/sample-authoring-guide.md) | 公開リポジトリ向けサンプルのセキュリティ要件・環境変数ルール・feature flag 命名規則 |

### 技術スタック

| レイヤー       | 技術                                   |
| -------------- | -------------------------------------- |
| UI             | React 18 + TypeScript                  |
| スタイリング   | Tailwind CSS + shadcn/ui               |
| データフェッチ | TanStack React Query                   |
| ルーティング   | React Router                           |
| ビルド         | Vite                                   |
| 状態管理       | React Query キャッシュ + React Context |
| Dataverse 通信 | DataverseService パターン              |

### .env 必須項目

```env
DATAVERSE_URL=https://xxx.crm7.dynamics.com
ENVIRONMENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  # pac code push -env で使用
SOLUTION_NAME=SolutionName
PUBLISHER_PREFIX=prefix
```

> **Dataverse テーブル作成時のメタデータロック**（`0x80040237`）対策は [dataverse スキル](../dataverse/SKILL.md) を参照（`retry_metadata()` / 累進的 sleep）。
