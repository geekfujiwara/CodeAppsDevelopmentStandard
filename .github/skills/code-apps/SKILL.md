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
  - "詳細画面"
  - "詳細ページ"
  - "detail page"
  - "RecordListPanel"
  - "レコード一覧パネル"
  - "インライン編集"
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

### 設計フェーズ（実装前に必須）

**コードを書く前に、デザインテンプレートの選択と UI 設計を行い、ユーザーの承認を得ること。** 手順:

1. [デザインテンプレート集](references/design-templates.md) の 6 種を一覧＋プレビューで提示し、ユーザーに 1 つ選んでもらう（デプロイされるアプリは常に 1 テンプレート。dark/light は `ThemeProvider` + `ModeToggle`）。
2. [デザインシステム](references/design-system.md) を読み込み、画面構成・コンポーネント選定・Lookup 名前解決パターンを設計する。
3. 設計（選択テンプレート＋画面設計）を提示し、「この設計で進めてよいですか？」と承認を得る。
4. 承認後、選択テンプレートの CSS Variables を `styles/index.pcss` に適用してから実装する（変数一式・適用手順は [デザインテンプレート集](references/design-templates.md)）。

> **CRUD 画面は [CRUD UI 標準パターン](references/crud-ui-pattern.md) に必ず従う**: 一覧は行／カード全体をクリックして詳細を開く（目アイコン等の小さなクリック領域は使わない）、詳細の編集はモーダルではなくインライン編集モード、行内の削除・クイック操作は `e.stopPropagation()`、削除確認はブラウザの `confirm()` ではなくモーダル（`useConfirm()` / AlertDialog）。**指示がなくても、テーブルごとに「一覧・詳細（インライン編集）・作成・削除」を標準実装すること。**

> **設計で提示する内容**: 選択テンプレート、画面一覧（ページ名・ルート）、各画面のコンポーネント構成、カラム定義、Lookup 名前解決方法（`_xxx_value` + `useMemo` Map）、ナビゲーション構造。

> **大前提（ソリューション運用）**: Dataverse テーブル・Code Apps・Power Automate・Copilot Studio は同一ソリューション内に開発し、`.env` の `SOLUTION_NAME` / `PUBLISHER_PREFIX` を全フェーズで統一する。詳細は [`standard` スキル](../standard/SKILL.md)。

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

### プロジェクトの 3 つの生成段階（生成物は手動作成・コピー禁止）

| 生成元 | 主な生成物 |
|---|---|
| ① テンプレート scaffold | `vite.config.ts` / `plugins/` / `styles/` / `src/` / `tsconfig*` / `package.json` 一式 |
| ② `pac code init` | `power.config.json`（＋ `.power/`）。`vite.config.ts` や `plugins/` は生成**しない** |
| ③ `pac code add-data-source` | `.power/schemas/appschemas/dataSourcesInfo.ts` / `src/generated/` |

> どのファイルを誰が生成し、何をカスタマイズしてよいかの一覧は [ビルドリファレンス](references/build-reference.md)。SDK 管理ファイル（`power.config.json` / `dataSourcesInfo.ts` / `src/generated/`）は手動編集禁止。

### テンプレートのプレースホルダー設計

テンプレートのデモメニューには `template: true` フラグが付いている。このフラグが残ったまま `npm run predeploy` を実行するとエラーになるため、削除忘れを防げる。

```typescript
// template: true が付いた行はデプロイ前に削除 or テーマ用に書き換える
{ label: "顧客", path: "customers", iconKey: "customers", template: true },
// テーマ固有のメニュー（template フラグなし）
{ label: "ダッシュボード", path: "dashboard", iconKey: "dashboard" },
```

デプロイ前は `npm run predeploy`（`.env`・`power.config.json` を自動検証）→ `npm run deploy`（predeploy + build + push を一括実行）。

### 標準ワークフロー

上から順に実行すれば動く正常系フロー。各 Step の詳細・必須設定・型定義は [ビルドリファレンス](references/build-reference.md) を参照。

```bash
# Step 0: テンプレート scaffold（標準では @GeekPowerCode が scaffold）
cp -n .github/skills/standard/references/gitignore-template .gitignore   # .gitignore がなければコピー
npm install

# Step 1: 初期化 — power.config.json を生成（PAC CLI 認証でテナント不一致なし）
pac code init -env {ENVIRONMENT_ID} -n "AppName"

# Step 2: vite.config.ts 必須設定を確認（base: "./" / external に @microsoft/power-apps を含めない）
#         → references/build-reference.md Step 2

# Step 3: .env.example を .env にコピーしてテーマ固有の値を設定

# Step 4: 初回ビルド＆デプロイ → Dataverse 接続が確立
npm run build
pac code push -env {ENVIRONMENT_ID} -s {SOLUTION_NAME}

# Step 5: データソース追加（日本語表示名は toggle_table_lang.py で英語に切替）
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_{table_basename}  # 全テーブルに繰り返す
python scripts/toggle_table_lang.py jp

# Step 6: src/ を実装 → 再ビルド＆デプロイ（反復）
npm run build
pac code push -env {ENVIRONMENT_ID} -s {SOLUTION_NAME}
```

> **インポート／getClient の必須パターン**: `@microsoft/power-apps/data` 等のサブパスからインポートし、`getClient(dataSourcesInfo)` のように `dataSourcesInfo` を必ず渡す。よくある失敗（`base` 未設定で 404・`external` 指定でモジュール解決エラー・`getClient()` 引数なし・`vite-env.d.ts` の手動型宣言等）は [トラブルシューティング](references/troubleshooting.md) と [ビルドリファレンス](references/build-reference.md) にまとめている。

### デプロイコマンドの選択

| コマンド | 認証基盤 | テナント問題 | 推奨度 |
|---|---|---|---|
| `pac code init -env {ID} -n "Name"` | PAC CLI プロファイル | なし | ✅ 標準 |
| `pac code push -env {ID} -s {SOL}` | PAC CLI プロファイル | なし | ✅ 標準 |
| `pac code add-data-source -a dataverse -t {table}` | PAC CLI プロファイル | なし | ✅ 標準 |
| `npm run deploy` | PAC CLI プロファイル | なし | ✅ 推奨（predeploy チェック付き） |

## 3. データソース接続

### 正常系: pac code add-data-source

テーブルごとに `pac code add-data-source -a dataverse -t {table}` を実行すると、`.power/schemas/appschemas/dataSourcesInfo.ts` が自動更新される（`systemuser`・`bot` 等のシステムテーブルも同じ）。`src/lib/dataSourcesInfo.ts` はこの生成ファイルを **re-export するだけ**（手書き追記はコネクタ等 add-data-source で追加できないものに限る）。

```bash
python scripts/toggle_table_lang.py en   # 日本語表示名エラーを回避（英語に切替）
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_{table_basename}
python scripts/toggle_table_lang.py jp   # 日本語に復元
```

> **日本語 DisplayName で `Failed to sanitize string` エラーが出る場合**、および `npx power-apps add-data-source` をフォールバックで使う場合（`patch-nameutils.cjs` 適用）の判断フロー・詳細手順は [日本語サニタイズリファレンス](references/japanese-sanitize.md) を参照。

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

フロー連携時は統合 `dataSourcesInfo` が必須（`getClient(dataSourcesInfo)` はシングルトンのため、最初の呼び出しで全データソースを含める必要がある）。

→ 詳細: **[データソースパターン](references/data-source-patterns.md)**

### Lookup 名はクライアントサイド名前解決が必須

SDK 生成サービスは Lookup 名フィールド（`createdbyname` 等）を返さない。
`_xxx_value`（GUID）+ `useMemo` マップで名前解決する。
データソース未登録テーブルの場合は OData FormattedValue アノテーションを使う。
**所有者（「誰のレコードか」）の表示は `_owninguser_value` + `systemusers` Map で解決する**（取得 hook の `$select` に `_owninguser_value` を含めること）。

→ 詳細: **[Lookup 名前解決リファレンス](references/lookup-resolution.md)**

### 一覧の検索・フィルター・重要列（所有者・金額）

営業系の一覧は名称検索だけで終わらせず、**所有者列・金額列などの重要項目を表示し、ステータス／所有者で絞り込み・横断検索できる**構成を標準とする。所有者フィルターは実データに存在する所有者のみを列挙し、絞り込み結果の件数・合計をツールバーに表示する。

→ 詳細: **[CRUD UI 標準パターン](references/crud-ui-pattern.md)** の「一覧の検索・フィルター・重要列」

### ステージ矢羽（Stage Path）— OptionSet の進捗を可視化＆クリックで変更

商談ステージ・リードステータス等、順序を持つ OptionSet を Salesforce 風の矢羽（シェブロン）で表示する。`onSelect` でその場ステージ変更（patch）も可能。失注・不認定など否定的終端は `negativeValue` で赤表示。

→ 詳細: **[ステージ矢羽パターン](references/stage-path-pattern.md)**

### scaffold 時に含めないファイル

外部 API 呼び出しを含むデモページ（`design-examples.tsx` / `use-learn-catalog.ts` / `learn-client.ts` 等）は CSP 違反になるため、業務テーマに不要なものは最初から生成しない。標準コンポーネント（`form-modal.tsx` / `list-table.tsx` / `inline-edit-table.tsx` / `sidebar*.tsx` / `ui/` 等）は残す。

→ 含める／含めないファイルの完全な一覧は **[新規テーマ開始チェックリスト](references/new-theme-checklist.md)**。

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
| [ステージ矢羽パターン](references/stage-path-pattern.md) | OptionSet（ステージ／ステータス）を Salesforce 風の矢羽で可視化・クリックで変更 |
| [構築リファレンス](references/build-reference.md) | ビルド・デプロイの詳細手順・vite.config.ts 必須設定・TypeScript エラー対処 |
| [データソースパターン](references/data-source-patterns.md) | SDK 生成サービス・dataSourcesInfo・getClient(dataSourcesInfo)・TanStack React Query |
| [Lookup 名前解決](references/lookup-resolution.md) | クライアントサイド名前解決・OData FormattedValue パターン・所有者（Owner）列の表示 |
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
| [.env サンプル](references/.env.example) | `scripts/` が参照する環境変数のプレースホルダー定義（実値はルートの `.env`） |
