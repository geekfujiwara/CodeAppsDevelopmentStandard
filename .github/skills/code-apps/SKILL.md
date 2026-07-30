---
name: code-apps
description: "Power Apps Code Apps（コードファースト）の初期化・Dataverse 接続・UI 設計・開発・デプロイ。TypeScript + React + Tailwind CSS で開発する。CSP 構成・メール送信パターンも含む。"
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

Power Apps Code Apps（コードファースト）を **TypeScript + React + Tailwind CSS** で開発する。
UI 設計・CSP 構成・メール送信パターンまで Code Apps 開発の全領域をカバーする統合スキル。

> [!NOTE]
> Microsoft Learn の現行概要では、Code Apps は **React / Vue などの SPA を Power Apps 上でホストする仕組み** とされている。
> この開発標準はその中でも **React ベース実装に標準化**したガイドであり、他フレームワーク一般論ではなく、このリポジトリのテンプレートと運用実績に基づく推奨事項をまとめている。

## 1. 概要

Code Apps 開発は **設計 → 初回デプロイ → データソース接続 → 改善デプロイ** の順に進む。

> [!NOTE]
> **サブエージェント並行実行パターン**: `architecture` スキルで Code Apps が確定し、`dataverse` スキルで
> スキーマが承認されたタイミングで、このスキルがサブエージェントとして起動される。
> Dataverse 構築（`--skip-localize` フェーズ）と Code Apps 開発（scaffold → deploy → add-data-source）は
> **並行して進める**。Dataverse 構築が先に終わったら `--localize-only` でローカライズ＆デモデータ投入。

### 標準ワークフロー全体像

```
[設計]  ① デザインテンプレートを選ばせる（6種・プレビュー付き）
        ② 画面設計（design-pattern）→ ユーザー承認
          │
[§2 初回デプロイ]
        ③ テンプレート scaffold + npm install（Dataverse 構築 Phase 2 と並行して即着手／VS Code では Code Apps サブエージェントとして起動）
        ④ ソリューション + 接続参照を用意（setup_connection_reference.py）★init より前
        ⑤ pac code init（power.config.json 生成）
        ⑥ vite.config.ts 必須設定の確認 / .env 設定
        ⑦ npm run deploy（build + pac code push -s）★初回 push でソリューション所属が確定
          │
[§3 データソース接続]
        ⑧ npx power-apps add-data-source --api-id shared_commondataserviceforapps -cr ... -s ...（1 回だけ）
        ⑨ MicrosoftDataverseService + *WithOrganization ラッパーを実装
          │
[§4 改善デプロイ]
        ⑩ src/ 実装 → npm run build → pac code push（反復）
```

### この後の章構成

| 章 | 内容 |
|---|---|
| §1 概要（本章） | 標準ワークフロー全体像・大前提・設計フェーズ（デザインテンプレート選択） |
| [§2 初回デプロイ](#2-初回デプロイ) | 環境前提・scaffold・ソリューション/接続参照の準備・init・初回 build & push |
| [§3 データソース接続](#3-データソース接続) | add-data-source（接続参照バインド）・MicrosoftDataverseService・Lookup 名前解決 |
| [§4 改善デプロイ](#4-改善デプロイ) | 開発時の必須ルール・再デプロイ・プレデプロイレビュー |
| [§5 リファレンス](#5-リファレンス) | 全リファレンス索引・技術スタック・.env |

> [!NOTE]
> 本スキル内のコード例は `{prefix}_tablename` 等のプレースホルダーで汎用化されています。
> 実際のテーブル名・型名は、あなたのプロジェクトのエンティティに読み替えてください。
> パターン（Lookup 名前解決、SDK ラッパー、useMemo マップ等）はそのまま適用できます。

### 設計フェーズ（実装前に必須）

**コードを書く前に、デザインテンプレートの選択と UI 設計を行い、ユーザーの承認を得ること。** 手順:

1. [デザインテンプレート集](references/design-templates.md) の 6 種を一覧＋プレビューで提示し、ユーザーに 1 つ選んでもらう（デプロイされるアプリは常に 1 テンプレート。dark/light は `ThemeProvider` + `ModeToggle`）。
2. [デザインシステム](references/design-pattern.md) を読み込み、画面構成・コンポーネント選定・Lookup 名前解決パターンを設計する。
3. 設計（選択テンプレート＋画面設計）を提示し、「この設計で進めてよいですか？」と承認を得る。承認の証跡を残す場合は、[設計承認 Issue テンプレート](references/design-approval.yml) を対象プロジェクトの `.github/ISSUE_TEMPLATE/` にコピーして Issue を作成する。
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
| ③ `npx power-apps add-data-source --api-id shared_commondataserviceforapps` | `.power/schemas/appschemas/dataSourcesInfo.ts` / `src/generated/services/MicrosoftDataverseService.ts` / `src/generated/models/MicrosoftDataverseModel.ts` |

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
# Code Apps 採用が決まった時点（設計承認後）で、Dataverse 構築（Phase 2）と並行して着手する
# （npm install はネットワーク待ちのみで Dataverse 構築をブロックしないため、待たずに並行実行する）。
# VS Code では本トラック全体を「Code Apps サブエージェント」として並行起動できる。
# 先行工程（scaffold / init / 初回 build & push）はテーブル不要。以下は Dataverse 接続情報の準備を待つ同期点:
#   ★同期①: shared_commondataserviceforapps の connectionId / orgUrl が揃ったら add-data-source を 1 回実行
#   ★同期②: pac code add-flow は Power Automate Phase 5（フロー実装）完了後に実行
# 詳細は standard §8「開発フロー全体図」を参照。
cp -n .github/skills/standard/references/gitignore-template .gitignore   # .gitignore がなければコピー
npm install --no-audit --no-fund

# Step 1: ソリューションと接続参照を用意（init より前に必須）
# 接続 ID 直バインドはソリューションに入らないため、接続参照（Connection Reference）を先に作る。
# 既存 CR 流用ファースト → 無ければ Dataverse Web API で新規作成（ポータル操作不要）。
python .github/skills/code-apps/scripts/setup_connection_reference.py
#   → 出力される {CONNECTION_REFERENCE_LOGICAL_NAME} と {SOLUTION_ID} を控える
#   → 詳細は references/solution-alm.md

# Step 2: 初期化 — power.config.json を生成（PAC CLI 認証でテナント不一致なし）
pac code init -env {ENVIRONMENT_ID} -n "AppName"

# Step 3: vite.config.ts 必須設定を確認（base: "./" / external に @microsoft/power-apps を含めない）
#         → references/build-reference.md Step 2

# Step 4: .env.example を .env にコピーしてテーマ固有の値を設定

# Step 5: 初回ビルド＆デプロイ — ★必ず -s を付ける（almMode が Solution になるのは初回 push だけ）
npm run build
pac code push -env {ENVIRONMENT_ID} -s {SOLUTION_NAME}

# Step 6: Dataverse コネクタを 1 回追加（全テーブル共通・接続参照バインド）
npx power-apps add-data-source --api-id shared_commondataserviceforapps \
  -cr {CONNECTION_REFERENCE_LOGICAL_NAME} \
  -s {SOLUTION_ID} \
  --resource-name commondataserviceforapps \
  --org-url {DATAVERSE_URL} \
  --non-interactive

# Step 7: src/ を実装（MicrosoftDataverseService を薄くラップ）→ 再ビルド＆デプロイ（反復）
npm run build
pac code push -env {ENVIRONMENT_ID} -s {SOLUTION_NAME}
```

> **Step 5 の `-s` は後戻りできない**: `pac code push -s` がアプリを `almMode: Solution` にするのは
> **`appId` 未割当の初回 push のみ**。`almMode: Environment` で作ってしまったアプリは、後から `-s` を付けて
> push してもソリューションに入らず、Power Apps ポータルの「既存の追加 → アプリ → コード アプリ」でしか
> 復旧できない。詳細は [ソリューション ALM リファレンス](references/solution-alm.md)。

> **インポート／ラッパーの必須パターン**: 生成された `MicrosoftDataverseService` を薄いラッパーで包み、`ListRecordsWithOrganization` / `CreateRecordWithOrganization` / `GetItemWithOrganization` / `UpdateRecordWithOrganization` / `DeleteRecordWithOrganization` に **Dataverse URL（organization）を必ず渡す**。`organization` を省略すると `Invalid organization URL 'null' provided` で失敗する。詳細は [ビルドリファレンス](references/build-reference.md) を参照。

### デプロイコマンドの選択

| コマンド | 認証基盤 | テナント問題 | 推奨度 |
|---|---|---|---|
| `python scripts/setup_connection_reference.py` | auth_helper（PAC プロファイル再利用） | なし | ✅ 標準（init の前に実行） |
| `pac code init -env {ID} -n "Name"` | PAC CLI プロファイル | なし | ✅ 標準 |
| `pac code push -env {ID} -s {SOL}` | PAC CLI プロファイル | なし | ✅ 標準（**初回から `-s` 必須**） |
| `npx power-apps add-data-source --api-id shared_commondataserviceforapps -cr {CR} -s {SOLUTION_ID} --resource-name commondataserviceforapps --org-url {url}` | Power Apps npm CLI + 接続参照 | `npx power-apps login` が別キャッシュ | ✅ 標準（ALM 対応） |
| `npx power-apps add-data-source ... --connection-id {id}` | Power Apps npm CLI + 接続 | 同上 | △ ソリューションに入らない（PoC のみ） |
| `pac code add-data-source -a dataverse -t {table}` | PAC CLI プロファイル | テーブルごとに再生成が必要 | △ 旧方式（強い型付けが必要な場合のみ） |
| `npm run deploy` | PAC CLI プロファイル | なし | ✅ 推奨（predeploy チェック付き） |

| 比較対象 | 参考 |
|---|---|
| `shared_commondataserviceforapps` を 1 回追加して `MicrosoftDataverseService` を共有する方式 | [connector-reference.md](references/connector-reference.md), [build-reference.md](references/build-reference.md) |
| `pac code add-data-source -a dataverse -t <table-logical-name>` をテーブル単位で追加する方式 | [Microsoft Learn: How to: Connect your code app to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-data), [Microsoft Learn: Troubleshoot adding a data source](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/troubleshoot-add-datasource) |

> [!NOTE]
> **Microsoft Learn との比較**: Learn の現行ガイド「How to: Connect your code app to Dataverse」（2026-04-07 更新）と
> 「Troubleshoot adding a data source」（2026-02-02 更新）は、どちらも
> `pac code add-data-source -a dataverse -t <table-logical-name>` を Dataverse 追加の基本手順として説明している。
> このスキルの `shared_commondataserviceforapps` 手順は **このリポジトリで採用する connector-first パターン**であり、
> Learn の基本手順をそのまま置き換えたものではない。判断基準は次のとおり:
>
> - **Learn / PAC 標準**: テーブルごとの型付き Service / Model を生成したい
> - **本スキル標準**: 1 回の接続で `MicrosoftDataverseService` を生成し、`entityName` で複数テーブルを横断したい
> - **性能面**: Microsoft Learn に両者の明確なベンチマーク差は記載されていない。通常は Dataverse 側のクエリ形状
>   （`$select` / `$filter` / `$top`）、ページング、ネットワーク待ちの影響が支配的で、接続方式そのものの差は主因になりにくい
> - **実務上の判断**: 性能よりも、型安全性・再生成コスト・複数テーブル横断のしやすさで選ぶ

## 3. データソース接続

### 正常系: Microsoft Dataverse connector（`shared_commondataserviceforapps`）

Dataverse 接続は **`shared_commondataserviceforapps` を 1 回だけ追加する方式を標準**とする。これにより、テーブルごとに `add-data-source` を繰り返さなくても、生成された `MicrosoftDataverseService` から `entityName` を実行時に渡して全テーブルへ CRUD できる。

`npx power-apps add-data-source --api-id shared_commondataserviceforapps` を 1 回実行すると、`.power/schemas/appschemas/dataSourcesInfo.ts` に加え `src/generated/services/MicrosoftDataverseService.ts` と `src/generated/models/MicrosoftDataverseModel.ts` が生成される。アプリ側ではこの生成サービスを薄いラッパーで包み、`organization` に対象環境の Dataverse URL を明示的に渡す。

バインド先は **接続 ID ではなく接続参照（`-cr`）を標準**とする。接続はソリューション コンポーネントになれないが、接続参照はなれるため、環境間移送ができる。

```bash
# Step 1 で作成済みの接続参照にバインドする
npx power-apps add-data-source --api-id shared_commondataserviceforapps \
  -cr {CONNECTION_REFERENCE_LOGICAL_NAME} \
  -s {SOLUTION_ID} \
  --resource-name commondataserviceforapps \
  --org-url {DATAVERSE_URL} \
  --non-interactive
```

接続参照にしても **「1 回の追加で全テーブルをカバーする」設計は変わらない**（`--resource-name` はコネクタ単位。生成ファイル 2 つ・生成メソッド同一・アプリコード変更不要）。`power.config.json` には `xrmConnectionReferenceLogicalName` が 1 行追加されるだけである。検証結果と確認コマンドは [ソリューション ALM リファレンス](references/solution-alm.md)。

> **接続参照は CLI では作れない**: `-cr` に未存在の論理名を渡すと
> `Failed to resolve connection ID for reference '...'` で失敗する（自動作成されない）。
> ポータル手作業を避けるため、Step 1 の
> [setup_connection_reference.py](scripts/setup_connection_reference.py)（Dataverse Web API）を標準とする。

> **PoC やソリューション不要の場合のみ**、`-cr {CR} -s {SOLUTION_ID}` を
> `--connection-id {DATAVERSE_CONNECTION_ID}`（`npx power-apps list-connections` で取得）に置き換えてもよい。
> ただしそのデータソースはソリューションに入らず、環境間移送できない。

Lookup 列の書き込みは従来どおり `parentcustomerid_account@odata.bind` のような `@odata.bind` 形式を使う。`organization` を省略した通常メソッドは `Invalid organization URL 'null' provided` で失敗しやすいため、`*WithOrganization` 系メソッドを使う。

> **旧方式の扱い**: `pac code add-data-source -a dataverse -t {table}` によるテーブル別の強い型付け生成は、既存プロジェクト互換やテーブル単位の Service が必須な場合のみに限定する。日本語 DisplayName 対策など旧方式の補足は [日本語サニタイズリファレンス](references/japanese-sanitize.md) を参照。

## 4. 改善デプロイ

### CSP（Content Security Policy）違反の回避

Power Apps ランタイムはデフォルトで `connect-src 'none'`。外部 API への `fetch` はブロックされる。
Code Apps が生成する Dataverse SDK / `MicrosoftDataverseService` のような **Power Apps ランタイム経由の API** のみ CSP 安全。

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

フロー連携時は統合 `dataSourcesInfo` が必須（Dataverse connector・フロー・Copilot Studio を同居させる場合、最初に解決されるデータソース定義へ必要なエントリをそろえておく）。

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

自前 `MicrosoftDataverseService` ラッパーを React Query で包むパターン（`useRecords` / `useCreateRecord` 等）は [構築リファレンス](references/build-reference.md#step-6-microsoftdataverseservice-ラッパーで-crud-実装) を参照。

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
| [デザインシステム](references/design-pattern.md) | Tailwind CSS v4 のコンポーネント選定・画面設計パターン |
| [コンポーネントカタログ](references/component-catalog.md) | 全コンポーネントの詳細仕様・使用例 |
| [ステージ矢羽パターン](references/stage-path-pattern.md) | OptionSet（ステージ／ステータス）を Salesforce 風の矢羽で可視化・クリックで変更 |
| [月間カレンダーパターン](references/calendar-pattern.md) | 日付を持つレコードを月間グリッドで俯瞰（date-fns のみ・依存追加なし・イベントチップ・今日ハイライト） |
| [ウィザードフォームパターン](references/wizard-form-pattern.md) | 入力項目の多いフォームを複数ステップに分割（ステップインジケーター・ステップ別バリデーション・確認画面） |
| [CSV エクスポートパターン](references/csv-export-pattern.md) | フィルター適用後の一覧を UTF-8 BOM 付き CSV でダウンロード（Excel 日本語対応・OptionSet ラベル変換） |
| [パレート図パターン](references/pareto-chart-pattern.md) | 不良分析・ABC 分析などの分類別集計を降順棒 + 累積構成比折れ線 + 80% 基準線で可視化（重点対策対象の強調色） |
| [チェックリスト採点パターン](references/checklist-scoring-pattern.md) | 点検・監査系業務の判定トグル・スコア自動計算（対象外を分母から除外）・テンプレート一括生成・親レコードへのスコア同期 |
| [クロス集計マトリクスパターン](references/cross-tab-pattern.md) | 2 軸の組み合わせ件数をヒート色付きピボット表で俯瞰（行列自動生成・合計行/列・追加依存なし） |
| [縦タイムライン/ステッパーパターン](references/timeline-stepper-pattern.md) | 順序を持つ項目の進行状態を縦に可視化（done/current/problem/pending・行ごとに操作ボタン差込可・追加依存なし） |
| [構築リファレンス](references/build-reference.md) | ビルド・デプロイの詳細手順・vite.config.ts 必須設定・TypeScript エラー対処 |
| [ソリューション ALM](references/solution-alm.md) | 接続参照バインド・`almMode` と初回 push・コンポーネント種別・共有時の権限モデル |
| [データソースパターン](references/data-source-patterns.md) | 生成サービス・dataSourcesInfo・TanStack React Query（旧/native パターン含む） |
| [Lookup 名前解決](references/lookup-resolution.md) | クライアントサイド名前解決・OData FormattedValue パターン・所有者（Owner）列の表示 |
| [日本語サニタイズ](references/japanese-sanitize.md) | 旧ネイティブ add-data-source 方式の日本語 DisplayName 回避 |
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

### スクリプト

| スクリプト | 用途 |
|---|---|
| [setup_connection_reference.py](scripts/setup_connection_reference.py) | 接続参照をソリューションに用意する（既存流用ファース→Web API で新規作成）。Step 1 で実行 |
| [pre-deploy-check.mjs](scripts/pre-deploy-check.mjs) | `.env` / `power.config.json` のデプロイ前検証（`npm run predeploy`）。プロジェクト直下の `scripts/` にコピーして使う |
| [validate_sample.py](scripts/validate_sample.py) | `samples/` 配下が欠落なくビルドできる状態か検証（必須ファイル・import 先の実在・秘匿情報） |
| [scaffold_from_cache.ps1](scripts/scaffold_from_cache.ps1) | キャッシュからのテンプレート scaffold |
| [toggle_table_lang.py](scripts/toggle_table_lang.py) | 旧方式の `pac code add-data-source` 向けにテーブル表示名を一時的に英語化 |

### 環境変数

スクリプトが参照するキーは [references/.env.example](references/.env.example) を参照（実値はリポジトリルートの `.env` に置く）。
