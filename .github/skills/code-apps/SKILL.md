---
name: code-apps
description: "Power Apps Code Apps（コードファースト）の初期化・Dataverse 接続・UI 設計・開発・デプロイ。TypeScript + React + Tailwind CSS で開発する。CSP 構成・メール送信パターンも含む。"
category: ui
triggers:
  - "Code Apps"
  - "pa app init"
  - "pa app push"
  - "pa app share"
  - "power-apps init"
  - "power-apps push"
  - "power-apps share"
  - "Code Apps 共有"
  - "add data-source"
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
> 本スキルは React + Vite の **Web Code Apps** 用。Expo／React Native、camera／barcode／location 等の
> 端末ネイティブ機能、Power Apps Developer app、Wrap が要件なら
> [`mobile-apps`](../mobile-apps/SKILL.md) へ切り替える。Native は Private Preview で本番利用できない。

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
        ⑤ npx pa app init（power.config.json 生成）
        ⑥ vite.config.ts 必須設定の確認 / .env 設定
        ⑦ npm run deploy -- --solution-id {GUID}（build + pa app push）★初回 push でソリューション所属が確定
          │
[§3 データソース接続]
        ⑧ npx pa app add data-source --connector shared_commondataserviceforapps --connection-ref ... -s ...（1 回だけ）
        ⑨ MicrosoftDataverseService + *WithOrganization ラッパーを実装
          │
[§4 改善デプロイ]
  ⑩ src/ 実装 → npm run deploy（pa app push を反復）
  ⑪ 最終 push 後に pa app share（利用者は play、共同開発者だけ edit）
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

> **画面の骨格は [デザインシステム](references/design-pattern.md#ページの骨格新規画面はここから書き始める) からコピーして書き始める**: マルチカラムは `grid-cols-[minmax(0,1fr)_...]`（素の `1fr` は使わない）＋**直接の子すべてに `min-w-0`**、長文は `break-words` ではなく `[overflow-wrap:anywhere]`、コード・表・JSON は `overflow-x-auto` で閉じ込める。`min-w-0` は後付けすると必ず抜けるため最初から書く。`npm run predeploy` のチェック 7 が抜けを警告する。

> **設計で提示する内容**: 選択テンプレート、画面一覧（ページ名・ルート）、各画面のコンポーネント構成、カラム定義、Lookup 名前解決方法（`_xxx_value` + `useMemo` Map）、ナビゲーション構造、テレメトリの転送先と監視する SLI（転送しない場合も明記）。

> **大前提（ソリューション運用）**: Dataverse テーブル・Code Apps・Power Automate・Copilot Studio は同一ソリューション内に開発し、`.env` の `SOLUTION_NAME` / `PUBLISHER_PREFIX` を全フェーズで統一する。詳細は [`standard` スキル](../standard/SKILL.md)。

## 2. 初回デプロイ

### 環境の前提条件（デプロイ前に必ず確認）

```
1. Power Platform 管理センターで「コード アプリを許可する」がオン
   → オフの場合: CodeAppOperationNotAllowedInEnvironment (403) エラー

2. npm CLI のアクティブアカウントが対象テナント用
  npx pa auth status
  npx pa auth switch --account user@contoso.com

3. power.config.json は npx pa app init で生成する
   → テンプレートから手動コピーしない
   → 別環境の appId が残っていると: AppLeaseMissing (409) エラー
  → 新規環境では必ず npx pa app init で新規生成
```

> [!IMPORTANT]
> **CLI の実行ファイル名は `pa`**。`@microsoft/power-apps-cli` は bin を `power-apps` から **`pa`** にリネームし、
> コマンドも group 化した（`init` → `app init`、`push` → `app push`、`auth-status` → `auth status`）。
> 旧名を呼ぶと `npm error could not determine executable to run` だけが出て原因が見えない。
> `npm run predeploy`（チェック 11）が package.json のデプロイコマンドとインストール済み bin 名の不一致を検出する。
> 全コマンドの対応表は [npm CLI リファレンス](references/cli-reference.md)。

### プロジェクトの 3 つの生成段階（生成物は手動作成・コピー禁止）

| 生成元 | 主な生成物 |
|---|---|
| ① テンプレート scaffold | `vite.config.ts` / `plugins/` / `styles/` / `src/` / `tsconfig*` / `package.json` 一式 |
| ② `npx pa app init` | `power.config.json`（＋ `.power/`）。`vite.config.ts` や `plugins/` は生成**しない** |
| ③ `npx pa app add data-source --connector shared_commondataserviceforapps` | `.power/schemas/appschemas/dataSourcesInfo.ts` / `src/generated/services/MicrosoftDataverseService.ts` / `src/generated/models/MicrosoftDataverseModel.ts` |

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

テンプレートは `src/lib/telemetry.ts` を含み、起動時に `initializeLogger` を登録する。既定では外部送信せず、
クエリ文字列・フラグメント・GUID を除去したメトリクスだけを `code-apps:telemetry` イベントへ出力する。
Application Insights 等へ転送する場合は custom sink と CSP の `connect-src` を合わせて設計する
（[テレメトリ / 可観測性パターン](references/telemetry-pattern.md)）。

### 標準ワークフロー

上から順に実行すれば動く正常系フロー。各 Step の詳細・必須設定・型定義は [ビルドリファレンス](references/build-reference.md) を参照。

```bash
# Step 0: テンプレート scaffold（標準では @GeekPowerCode が scaffold）
# Code Apps 採用が決まった時点（設計承認後）で、Dataverse 構築（Phase 2）と並行して着手する
# （npm install はネットワーク待ちのみで Dataverse 構築をブロックしないため、待たずに並行実行する）。
# VS Code では本トラック全体を「Code Apps サブエージェント」として並行起動できる。
# 先行工程（scaffold / init / 初回 build & push）はテーブル不要。以下は Dataverse 接続情報の準備を待つ同期点:
#   ★同期①: shared_commondataserviceforapps の connectionId / orgUrl が揃ったら add data-source を 1 回実行
#   ★同期②: pa app add flow は Power Automate Phase 5（フロー実装）完了後に実行
# 詳細は standard §8「開発フロー全体図」を参照。
cp -n .github/skills/standard/references/gitignore-template .gitignore   # .gitignore がなければコピー
# scaffold の取得元は templates/generic-base のみ（samples/geek-* は業務ページ実装の参照専用）
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/skills/code-apps/templates/generic-base .
npm install --no-audit --no-fund

# 既存プロジェクトを更新するときは SDK / CLI とも latest を候補にし、build と CLI help を再検証する
npm install @microsoft/power-apps@latest
npm install -D @microsoft/power-apps-cli@latest
npx pa --help          # ★ bin 名は pa。コマンドは auth / app / connector / connection / solution の group 制
npm run build
# バージョン方針と検証項目: references/cli-reference.md#バージョン方針

# Step 1: ソリューションと接続参照を用意（init より前に必須）
# 接続 ID 直バインドはソリューションに入らないため、接続参照（Connection Reference）を先に作る。
# 既存 CR 流用ファースト → 無ければ Dataverse Web API で新規作成（ポータル操作不要）。
python .github/skills/code-apps/scripts/setup_connection_reference.py
#   → 出力される {CONNECTION_REFERENCE_LOGICAL_NAME} と {SOLUTION_ID} を控える
#   → 詳細は references/solution-alm.md

# Step 2: npm CLI の認証先を確認して初期化
npx pa auth status
npx pa auth switch --account user@contoso.com
npx pa app init --environment-id {ENVIRONMENT_ID} --display-name "AppName" --app-type CodeApp

# Step 3: vite.config.ts 必須設定を確認（base: "./" / external に @microsoft/power-apps を含めない）
#         → references/build-reference.md Step 2

# Step 4: .env.example を .env にコピーしてテーマ固有の値を設定

# Step 5: 初回ビルド＆デプロイ — ★必ず -s を付ける（almMode が Solution になるのは初回 push だけ）
#         対象環境は power.config.json の environmentId を使う（push には --environment-id が無い）
npm run build
npx pa app push --solution-id {SOLUTION_ID}

# Step 6: Dataverse コネクタを 1 回追加（全テーブル共通・接続参照バインド）
npx pa app add data-source --connector shared_commondataserviceforapps \
  --connection-ref {CONNECTION_REFERENCE_LOGICAL_NAME} \
  --solution-id {SOLUTION_ID} \
  --org-url {DATAVERSE_URL} \
  --non-interactive

# Step 7: src/ を実装（MicrosoftDataverseService を薄くラップ）
#   業務ロジックに入る前に 1 回 predeploy を通し、config.ts と router.tsx の不整合を早期検知する
npm run predeploy
#   → 以降はページを追加するたびに実行する（ナビとルートの不一致はデプロイ後にしか見えない）

# 再ビルド＆デプロイ（反復）
npm run build
npx pa app push

# Step 8: 最終 push 後に共有（カンマ区切りで複数指定可）
#   共有先環境は power.config.json で決まる（share に --environment-id は無い）
npx pa app share --principal "${CODE_APP_PLAY_PRINCIPALS}" \
  --access play --non-interactive --json
```

共有対象のユーザー／サービスプリンシパル、`edit` の最小権限ルール、CI/CD 例は
[npm CLI リファレンスの `app share`](references/cli-reference.md#app-share)を参照する。

> **Step 5 の `--solution-id` は後戻りできない**: 初回の `pa app push --solution-id` がアプリを `almMode: Solution` にするのは
> **`appId` 未割当の初回 push のみ**。`almMode: Environment` で作ってしまったアプリは、後から `-s` を付けて
> push してもソリューションに入らず、Power Apps ポータルの「既存の追加 → アプリ → コード アプリ」でしか
> 復旧できない。詳細は [ソリューション ALM リファレンス](references/solution-alm.md)。

> **`-s` に渡す値は CLI で違う**: `pac code push -s` はソリューション**名**だが、
> `npx pa app push -s` は **GUID** を要求する（CLI 0.13.0 で GUID 検証が入り、名前はエラーになった）。
> 詳細は [ソリューション ALM](references/solution-alm.md)。

> **インポート／ラッパーの必須パターン**: 生成された `MicrosoftDataverseService` を薄いラッパーで包み、`ListRecordsWithOrganization` / `CreateRecordWithOrganization` / `GetItemWithOrganization` / `UpdateRecordWithOrganization` / `DeleteRecordWithOrganization` に **Dataverse URL（organization）を必ず渡す**。`organization` を省略すると `Invalid organization URL 'null' provided` で失敗する。詳細は [ビルドリファレンス](references/build-reference.md) を参照。

### デプロイコマンドの選択

| コマンド | 認証基盤 | テナント問題 | 推奨度 |
|---|---|---|---|
| `python scripts/setup_connection_reference.py` | auth_helper（PAC プロファイル再利用） | なし | ✅ 標準（init の前に実行） |
| `npx pa auth status` / `pa auth switch --account {UPN}` | Power Apps npm CLI | アクティブアカウントを明示 | ✅ テナント切り替え時に必須 |
| `npx pa app init --environment-id {ID} --display-name "Name" --app-type CodeApp` | Power Apps npm CLI | 上記で確認 | ✅ 標準 |
| `npx pa app push --solution-id {GUID}` | Power Apps npm CLI | 上記で確認 | ✅ 標準（**初回から GUID 必須**。環境は power.config.json から） |
| `npx pa app add data-source --connector shared_commondataserviceforapps --connection-ref {CR} --solution-id {GUID} --org-url {url}` | Power Apps npm CLI + 接続参照 | `pa auth` が別キャッシュ | ✅ 標準（ALM 対応） |
| `npx pa app add data-source ... --connection-id {id}` | Power Apps npm CLI + 接続 | 同上 | △ ソリューションに入らない（PoC のみ） |
| `pac code *` | PAC CLI プロファイル | npm CLI と別キャッシュ | △ npm CLI で解決できない場合のみの移行時代替 |
| `npm run deploy -- --solution-id {GUID}` | Power Apps npm CLI | auth switch で切り替え | ✅ 初回デプロイに推奨（predeploy チェック付き） |

### CI/CD・秘匿化（チーム開発で継続的にデプロイする場合）

`.env` の秘匿化・`${VAR}` テンプレートの汎用化・pre-commit ゲート・レビューゲート・
承認付きデプロイ・リリース記録は **`alm` スキル** が担当する。
`npm run deploy` を `alm` のデプロイジョブに差し込むだけで、同じ ALM 基盤に載せられる。

#### Code Apps での `alm` 実行可否チェック（最小検証）

```bash
# 1) ALM スクリプトと設定雛形を取り込む
cp .github/skills/alm/scripts/*.py scripts/
cp .github/skills/alm/alm.config.example.json alm.config.json

# 2) Code Apps 用にパス定義を最小調整（例）
#    templates: ["power.config.template.json"]
#    rendered : ["power.config.json"]
#    artifacts: ["dist/**"]
#    non_secret_vars: ["APP_NAME"]

# 3) 決定論ゲートを実行
python scripts/review_sanitization.py
python scripts/gate_rules.py --gate quality --out .gate/quality.json
python scripts/gate_rules.py --gate generalization --out .gate/generalization.json
python scripts/review_report.py --verdict-dir .gate --out .gate/review-report.md
```

#### 運用モジュール（選択式）

| モジュール | 構成 | 使うとき |
|---|---|---|
| `pp-only` | Power Platform 単体（PAC CLI + `npm run deploy`） | まず Code Apps 単体で ALM を確立したい |
| `pp-azure-gha` | GitHub Actions + Azure（OIDC） | GitHub 中心で Azure 連携も必要 |
| `pp-azure-ado` | Azure DevOps + Azure（WIF） | Azure DevOps の承認・監査を使いたい |

モジュール別の詳細は [`alm/references/ci-providers.md`](../alm/references/ci-providers.md) を参照。

→ 詳細: [`alm`](../alm/SKILL.md) スキル

### 接続方式の比較

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

Dataverse 接続は **`shared_commondataserviceforapps` を 1 回だけ追加する方式を標準**とする。これにより、テーブルごとに `add data-source` を繰り返さなくても、生成された `MicrosoftDataverseService` から `entityName` を実行時に渡して全テーブルへ CRUD できる。

`npx pa app add data-source --connector shared_commondataserviceforapps` を 1 回実行すると、`.power/schemas/appschemas/dataSourcesInfo.ts` に加え `src/generated/services/MicrosoftDataverseService.ts` と `src/generated/models/MicrosoftDataverseModel.ts` が生成される。アプリ側ではこの生成サービスを薄いラッパーで包み、`organization` に対象環境の Dataverse URL を明示的に渡す。

バインド先は **接続 ID ではなく接続参照（`--connection-ref`）を標準**とする。接続はソリューション コンポーネントになれないが、接続参照はなれるため、環境間移送ができる。

```bash
# Step 1 で作成済みの接続参照にバインドする
npx pa app add data-source --connector shared_commondataserviceforapps \
  --connection-ref {CONNECTION_REFERENCE_LOGICAL_NAME} \
  --solution-id {SOLUTION_ID} \
  --org-url {DATAVERSE_URL} \
  --non-interactive
```

接続参照にしても **「1 回の追加で全テーブルをカバーする」設計は変わらない**（`--connector` はコネクタ単位。生成ファイル 2 つ・生成メソッド同一・アプリコード変更不要）。`power.config.json` には `xrmConnectionReferenceLogicalName` が 1 行追加されるだけである。検証結果と確認コマンドは [ソリューション ALM リファレンス](references/solution-alm.md)。

> **接続参照は CLI では作れない**: `--connection-ref` に未存在の論理名を渡すと
> `Failed to resolve connection ID for reference '...'` で失敗する（自動作成されない）。
> ポータル手作業を避けるため、Step 1 の
> [setup_connection_reference.py](scripts/setup_connection_reference.py)（Dataverse Web API）を標準とする。

> **`add data-source` に `--environment-id` は渡せない**: `--help` には載っているが実際には
> `error: unknown option '--environment-id'` で拒否される。対象環境は `power.config.json` から読まれる。
> 同じく `pa app push` も `-e` / `--environment-id` を拒否する。

> **PoC やソリューション不要の場合のみ**、`--connection-ref {CR} --solution-id {SOLUTION_ID}` を
> `--connection-id {DATAVERSE_CONNECTION_ID}`（`npx pa connection list` で取得）に置き換えてもよい。
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

### 環境接続前のモックデータ開発

取得系画面は `createMockDataExecutor` でローカル確認できる。モックは `import.meta.env.DEV` と
`VITE_USE_MOCK=1` の両方で制限し、動的 import して本番成果物から除去する。
SDK 1.2.7 の標準 executor は作成・更新・削除をサポートしないため、書き込み成功のテストには使わない。

→ 詳細: **[モックデータ開発パターン](references/mock-data-pattern.md)**

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

scaffold の取得元は **[templates/generic-base](templates/generic-base/)** のみとする。
`samples/geek-*` は**業務ページ実装の参照専用**で、scaffold 元にはしない
（業務固有のページ・型・サービス、および `samples/geek-sales` の `CommandPalette` / `QuickActivityFab` のような
テーマ固有コンポーネントが混入するため）。

外部 API 呼び出しを含むデモページ（`design-examples.tsx` / `use-learn-catalog.ts` / `learn-client.ts` 等）は CSP 違反になるため、業務テーマに不要なものは最初から生成しない。標準コンポーネント（`form-modal.tsx` / `list-table.tsx` / `inline-edit-table.tsx` / `sidebar*.tsx` / `ui/` 等）は残す。

→ 含める／含めないファイルの完全な一覧は **[新規テーマ開始チェックリスト](references/new-theme-checklist.md)**。

### アドオンテンプレート（generic-base に重ねる差分）

`templates/` には scaffold 元の `generic-base` に加えて、**特定業務の画面だけを差分ファイルとして重ねるアドオン**を置く。
scaffold 元は `generic-base` のまま変えず、`src/` を上書きコピーしてから README の手順どおりルートとナビを追加する。

| アドオン | 用途 | 使う場面 |
|---|---|---|
| [templates/account-link-admin](templates/account-link-admin/) | `contact` に `account`（取引先企業）を割り当てる管理画面 | Power Pages で **Account アクセス**を選んだとき（[power-pages スキル](../power-pages/SKILL.md) Step 4-G）。必須 |

### SDK に触れる面を 1 ファイルに閉じる

`@microsoft/power-apps` は 2〜4 週ごとに更新され、マイナーバージョンでも破壊的変更が入る。
影響範囲を押さえるため、**SDK を import してよいのは `src/lib` / `src/services` / `src/providers` の 3 階層だけ**とし、
ページ・コンポーネントからは直接呼ばない（`validate_sample.py` が検出する）。

Dataverse CRUD ラッパーは **[templates/dataverse-client.ts](templates/dataverse-client.ts) を正**とし、手書きせずコピーして使う。

```bash
cp .github/skills/code-apps/templates/dataverse-client.ts src/lib/
```

SDK の破壊的変更への追従は、この 1 ファイルを直して `python scripts/sync_dataverse_client.py` で配布する。

> [!NOTE]
> `templates/generic-base` にはこのファイルを同梱していない。
> `@/generated/services/MicrosoftDataverseService` に依存しており、`add-data-source` 前の状態では `tsc -b` が通らないため。
> Step 6 で接続を追加した後にコピーする。
>
> `samples/geek-asset` / `geek-hr` / `geek-expense` / `geek-sales` / `geek-fieldservice` は、このラッパーではなく
> `getClient()` の `*Async` 系・テーブル別生成サービスを使う別パターンの参照実装。上記 3 階層の制約は同じく適用される。

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

フロー追加は `npx pa app add flow --flow-id {id}` を使う（`add data-source --connector logicflows` は旧方式）。
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
| [一覧ペイン（マスター詳細）パターン](references/master-detail-pane-pattern.md) | 詳細画面の左にレコード一覧を常駐させて遷移しないで切り替え（Dataverse 側検索・デバウンス・見切れ防止の落とし穴表） |
| [AI 評価ルールのマスタ化パターン](references/ai-evaluation-master-pattern.md) | LLM の判定基準をテーブルに出してアプリから編集・ジョブ行キューで過去データを再評価・根拠ハイライトと改善提案（OData キーの URL エンコード落とし穴） |
| [構築リファレンス](references/build-reference.md) | ビルド・デプロイの詳細手順・vite.config.ts 必須設定・TypeScript エラー対処 |
| [npm CLI リファレンス](references/cli-reference.md) | SDK 1.3.0 / CLI 1.0.0 検証済み・最新版への更新方針・`push -s` の GUID 要件・`share` の最小権限運用・`create-connection` / `refresh-data-source` / `auth-switch` |
| [ソリューション ALM](references/solution-alm.md) | 接続参照バインド・`almMode` と初回 push・コンポーネント種別・共有時の権限モデル |
| [データソースパターン](references/data-source-patterns.md) | 生成サービス・dataSourcesInfo・TanStack React Query（旧/native パターン含む）・外部システムの資産を Dataverse にミラーして読む |
| [モックデータ開発パターン](references/mock-data-pattern.md) | 開発限定の `createMockDataExecutor` 導入・本番バンドル混入防止・SDK 1.2.7 の取得専用制約 |
| [Lookup 名前解決](references/lookup-resolution.md) | クライアントサイド名前解決・OData FormattedValue パターン・所有者（Owner）列の表示 |
| [日本語サニタイズ](references/japanese-sanitize.md) | 旧ネイティブ add-data-source 方式の日本語 DisplayName 回避 |
| [CSP 構成](references/csp.md) | iframe 埋め込み・外部 API 接続時の CSP 設定・CSP 安全な SDK メソッド一覧 |
| [テレメトリ / 可観測性パターン](references/telemetry-pattern.md) | `initializeLogger` / `Metric` 判別共用体・`sessionLoadSummary` SLI・PII サニタイズ規約・Application Insights 連携時の CSP |
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
| [check_code_apps_environment.py](scripts/check_code_apps_environment.py) | マネージド環境 / Code Apps 許可の前提条件を確認（`pa app init` の前に実行） |
| [setup_connection_reference.py](scripts/setup_connection_reference.py) | 接続参照をソリューションに用意する（既存流用ファースト→Web API で新規作成）。Step 1 で実行 |
| [pre-deploy-check.mjs](scripts/pre-deploy-check.mjs) | `.env` / `power.config.json` / モック実行基盤の本番混入を検証（`npm run predeploy`）。プロジェクト直下の `scripts/` にコピーして使う |
| [inspect_table_metadata.py](scripts/inspect_table_metadata.py) | 既存テーブルの EntitySetName / 主キー / 列 / 参照先 / 選択肢を調査（既存テーブル接続時は実装前に必須） |
| [validate_cli_reference.py](scripts/validate_cli_reference.py) | テンプレート採用版の `pa app share --help` と CLI リファレンスの主要オプション・実行例が一致することを検証 |
| [validate_sample.py](scripts/validate_sample.py) | `samples/` 配下の完全性と generic-base のテレメトリ契約を検証（必須ファイル・import 先の実在・秘匿情報・SDK の使い方） |
| [sync_dataverse_client.py](scripts/sync_dataverse_client.py) | [templates/dataverse-client.ts](templates/dataverse-client.ts) を `samples/` 配下の全コピーへ反映（SDK の破壊的変更への追従はこの 1 ファイルを直して配布） |
| [scaffold_from_cache.ps1](scripts/scaffold_from_cache.ps1) | キャッシュからのテンプレート scaffold |
| [toggle_table_lang.py](scripts/toggle_table_lang.py) | 旧方式の `pac code add-data-source` 向けにテーブル表示名を一時的に英語化 |

### 環境変数

スクリプトが参照するキーは [references/.env.example](references/.env.example) を参照（実値はリポジトリルートの `.env` に置く）。
