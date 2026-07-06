# AI ファースト開発標準 Skills カタログ

AI ファースト開発標準（Power Platform / Azure）で使用するスキル群。

## スキル構成規約

### フォルダ構成（Progressive Disclosure モデル）

各スキルは以下の 3 層構造に従う:

```
skill-name/
  SKILL.md              # Level 1-2: フロントマター（常時読込）+ 本体（トリガー時読込）
  scripts/              # Level 3: デプロイ・ユーティリティスクリプト（オンデマンド読込）
    deploy_xxx.py
    check_xxx.py
  references/           # Level 3: 補足ドキュメント（オンデマンド読込）
    build-reference.md
    troubleshooting.md
```

### 統合方針

関連するスキルは **製品単位** で 1 つのスキルに統合する。
統合前に独立スキルだった内容は `references/` に配置し、メインの `SKILL.md` からリンクする。

```
例: code-apps/
  SKILL.md                          # 開発・デプロイの本体（旧 code-apps-dev）
  references/
    design-pattern.md                # UI 設計パターン（旧 code-apps-design）
    csp.md                          # CSP 構成（旧 code-apps-csp）
    mail-pdf.md                     # PDF メール送信（旧 code-apps-mail）
    component-catalog.md            # コンポーネントカタログ
    japan-map-pattern.md            # 日本地図パターン
    build-reference.md              # ビルドリファレンス
  scripts/
    add_app_to_solution.py
  samples/
    geek-sales/                     # リファレンス実装（テーマへの同期対象外）
```

> `samples/` には過去テーマの完全実装をリファレンスとして置く。
> テーマプロジェクトへの標準同期（sync-standards）では `samples/` は配布されない。

### サンプル実装一覧

各スキルの `samples/` にある参考実装。**読むためのリファレンス**であり、そのままコピーして新規テーマの雛形には使わない
（新規テーマは `.github/` を取得後、**@GeekPowerCode** がサンプルを参照して scaffold する）。

| サンプル | 場所 | 題材 |
|---|---|---|
| Geek Sales | `code-apps/samples/geek-sales/` | 営業支援（顧客・商談・パイプライン・テリトリー・Copilot 分析） |
| Geek Expense | `code-apps/samples/geek-expense/` | 経費精算（経費申請・承認・分析・Power Automate/Copilot 連携） |
| Geek Kaizen | `code-apps/samples/geek-kaizen/` | 改善提案（カンバン D&D・ウィザードフォーム・いいね投票） |
| Geek Event | `code-apps/samples/geek-event/` | イベント管理（月間カレンダー・参加登録・出席率・参加者 CSV 出力） |
| Geek HR | `code-apps/samples/geek-hr/` | 人事管理（社員台帳・組織図・採用・評価） |
| Geek Helpdesk | `code-apps/samples/geek-helpdesk/` | ヘルプデスク（チケット・ナレッジベース・レポート） |
| Geek Inventory | `code-apps/samples/geek-inventory/` | 在庫管理（商品マスタ・入出庫・発注・レポート） |
| Geek Asset | `code-apps/samples/geek-asset/` | 資産管理（台帳・貸出・廃棄申請・棚卸） |
| Geek Contract | `code-apps/samples/geek-contract/` | 契約台帳（契約管理・期限アラート・取引先） |
| Geek PM | `code-apps/samples/geek-pm/` | プロジェクト管理（プロジェクト・タスク・メンバー・レポート） |
| Geek Maintenance | `code-apps/samples/geek-maintenance/` | 設備保全（設備マスタ・作業指示・点検スケジュール） |
| Geek Procurement | `code-apps/samples/geek-procurement/` | 購買依頼（申請・承認・発注追跡・仕入先） |
| Geek Approval | `code-apps/samples/geek-approval/` | 稟議申請（2 段階承認ワークフロー・承認ステージ矢羽・承認箱・承認履歴） |
| Geek Quote | `code-apps/samples/geek-quote/` | 見積・請求（明細行の金額自動計算・見積書プレビュー・受注→請求作成） |
| Geek Safety | `code-apps/samples/geek-safety/` | 安全衛生（ヒヤリハット報告・是正措置追跡・重大度/拠点別集計） |
| Geek Training | `code-apps/samples/geek-training/` | 研修管理（研修カタログ・受講申込・修了率/満足度集計） |
| Geek Quality | `code-apps/samples/geek-quality/` | 製造業・品質検査（生産ライン検査・歩留まり自動計算・不良分類パレート図） |
| Geek Store | `code-apps/samples/geek-store/` | 小売業・店舗運営（臨店チェック・チェックリスト採点・店舗別スコア集計） |
| Geek Punchlist | `code-apps/samples/geek-punchlist/` | 建設業・竣工検査（指摘事項・是正ワンクリック送り・場所×分類マトリクス） |
| Geek Delivery | `code-apps/samples/geek-delivery/` | 物流・配送管理（配送便・車両・配達トラッキング・縦タイムライン） |
| Power Pages ポータル | `power-pages/samples/portal/` | Power Pages サイト実体（web-templates / page-templates） |
| Corporate LP テンプレート | `power-pages/templates/corporate-lp/` | コーポレート LP（雛形として利用可） |

**サンプルに含まれない SDK 生成物**（手で作らず各テーマで生成させる）:

| パス | 生成コマンド |
|------|------|
| `.power/` | `pac code init` |
| `src/generated/` | `pac code add-data-source` |
| `power.config.json` | `pac code init` |

サンプルの読み方（ドメイン依存は 4 層のみ。`_layout.tsx` / `components/` / `providers/` / `styles/` は雛形のまま使う）:
`src/types/{domain}.ts` / `src/services/{domain}-service.ts` / `src/hooks/use-{domain}.ts` / `src/pages/*.tsx`。
新規テーマ開始時のクリーン確認は [新規テーマ開始チェックリスト](code-apps/references/new-theme-checklist.md) を参照。

### YAML フロントマター規約

```yaml
---
name: skill-name              # kebab-case 識別子（必須）
description: "短い説明文"      # スキルの目的を簡潔に（必須）。トリガーキーワードは含めない
category: カテゴリ名           # 分類タグ（必須）: architecture / data / ui / automation / ai
argument-hint: "引数の説明"    # ユーザー入力を受け付ける場合のみ（任意）
user-invocable: true           # ユーザーが直接呼び出せる場合のみ（任意）
triggers:                      # スキル発動条件キーワード（必須）
  - "キーワード1"
  - "キーワード2"
---
```

### 命名規則

| 対象 | 規則 | 例 |
|------|------|-----|
| スキルディレクトリ名 | kebab-case | `copilot-studio` |
| YAML `name` フィールド | kebab-case（ディレクトリ名と一致） | `copilot-studio` |
| Python スクリプト | snake_case | `deploy_agent.py` |
| リファレンスドキュメント | kebab-case | `build-reference.md` |
| カテゴリ名 | 英小文字 | `architecture`, `data`, `ui`, `automation`, `ai` |

---

## スキル一覧（14 スキル）

### architecture — アーキテクチャ・基盤

| スキル | 説明 |
|--------|------|
| [architecture](architecture/SKILL.md) | Power Platform 全体の構成方針を設計し、最適なコンポーネント構成を決定する。 |
| [standard](standard/SKILL.md) | 共通認証・環境変数・ソリューション運用など、全スキル共通の開発基盤を提供する。 |
| [update-skills](update-skills/SKILL.md) | スキル（SKILL.md/references/scripts）を作成・更新し、汎用化・秘匿化した上でリモートへ PR を作成・更新する。 |

### data — データ層

| スキル | 説明 |
|--------|------|
| [dataverse](dataverse/SKILL.md) | Dataverse のテーブル設計・構築・デモデータ投入・権限設定を一括で実施する。 |

### ui — UI / フロントエンド

| スキル | 説明 |
|--------|------|
| [code-apps](code-apps/SKILL.md) | Code Apps を TypeScript/React ベースで開発し、UI 設計からデプロイまで対応する。 |
| [power-pages](power-pages/SKILL.md) | Power Pages コードサイトを pac pages CLI で開発・ビルド・デプロイする。 |
| [generative-page](generative-page/SKILL.md) | Generative Pages（genux）を開発・デバッグし、モデル駆動型アプリへデプロイする。 |
| [model-driven-app](model-driven-app/SKILL.md) | モデル駆動型アプリを作成・構成し、公開まで実行する。 |

### automation — 自動化

| スキル | 説明 |
|--------|------|
| [copilot-studio](copilot-studio/SKILL.md) | Copilot Studio エージェントを生成オーケストレーション前提で構築・運用する。 |
| [copilot-studio-v2](copilot-studio-v2/SKILL.md) | Copilot Studio の新アーキテクチャ（cliagent）エージェントを Dataverse API だけで UI 操作なし完全自動構築する。フラット Python スキル添付まで対応。 |
| [power-automate](power-automate/SKILL.md) | Power Automate クラウドフローをソリューション対応で作成・デプロイする。 |
| [cowork](cowork/SKILL.md) | 目的特化型の Copilot Cowork プラグイン（Agent Skills + Dataverse MCP）を開発し、Entra ID SSO を構成して M365 管理センターのエージェント画面から公開・更新する。 |

### ai — AI / プロンプト

| スキル | 説明 |
|--------|------|
| [ai-builder](ai-builder/SKILL.md) | AI Builder の AI プロンプトを作成し、エージェントのツールとして組み込む。 |
| [spec-builder](spec-builder/SKILL.md) | PDF・PowerPoint・Excel・画像等の一次情報から、Power Platform 開発向けの要件定義書（仕様書）一式を作成する。 |

### samples — サンプルソリューション管理

> サンプルのパッケージング（セキュリティチェック・.env.example 生成・README 生成・再利用性チェック）は
> [update-skills/references/sample-packaging.md](update-skills/references/sample-packaging.md) に統合されました。
> `update-skills` スキルの Step 1 で自動的に参照されます。

---

## 推奨開発フロー

```
0. spec-builder   → 既存資料から要件定義書（仕様書）を作成（必要時）
1. architecture       → 全体設計・コンポーネント選定
2. standard           → 共通基盤の確認（.env・認証）
3. dataverse          → テーブル設計・構築・セキュリティロール設定
4. code-apps          → Code Apps UI 設計・開発・デプロイ
   OR power-pages     → Power Pages コードサイト開発・デプロイ
   OR generative-page → Generative Pages 開発
   OR model-driven-app → モデル駆動型アプリ構築
5. power-automate     → フロー作成
6. copilot-studio     → エージェント構築・トリガー追加
7. ai-builder         → AI プロンプト追加
8. cowork             → Cowork プラグイン化（Agent Skills + Dataverse MCP）・公開・更新
```
