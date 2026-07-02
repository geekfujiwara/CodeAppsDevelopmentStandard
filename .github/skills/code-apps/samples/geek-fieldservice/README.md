# geek-fieldservice — フィールドサービス管理

保守サービス業務のコール受付からスケジューリング、作業完了、年間レビューまでをカバーするフィールドサービス管理アプリケーション。

## 含まれる機能

- **ダッシュボード / マイページ**: ログインユーザーの担当案件・KPI・チーム実績 + 全体概況
- **サービスフロー**: コール→作業オーダー→日報の業務フローを ReactFlow で可視化
- **スケジューリング**: ドラッグ&ドロップで作業オーダーをエンジニアに割当。ガント/マップ切替、重複検出、Google Maps 経路確認
- **コール管理**: 顧客からの問い合わせ受付・対応ステータス管理
- **作業オーダー**: オーダーの作成・編集・ステータス管理・エンジニアアサイン
- **顧客管理**: 顧客情報の一覧・詳細・編集
- **顧客360°**: 顧客ごとの契約・コール・WO・機器を横断表示
- **機器管理**: 保守対象機器の登録・管理
- **エンジニア管理**: CE（カスタマーエンジニア）の情報・スキル・エリア管理
- **日報**: 作業日報の作成・承認ワークフロー
- **レポート**: 月次レポートの作成・管理
- **契約管理**: 保守契約の登録・更新管理
- **消費実績**: サプライ消費の追跡
- **ナレッジ / 修理事例**: ナレッジベース・改善提案の登録・検索
- **年間レビュー / 年間KPI**: 顧客別の年間評価・KPI 追跡

## 画面構成

| ページ | パス | 説明 |
|---|---|---|
| ダッシュボード | `/` | マイページ（個人KPI・担当案件）+ 全体概況タブ |
| サービスフロー | `/service-flow` | ReactFlow による業務フロー可視化 |
| スケジューリング | `/scheduling` | DnD スケジューリングボード（ガント/マップ） |
| コール | `/calls` | コール一覧・詳細・CRUD |
| 作業オーダー | `/work-orders` | WO 一覧・詳細・CRUD |
| 顧客 | `/customers` | 顧客一覧・詳細・CRUD |
| 顧客360° | `/customer-360` | 顧客横断ビュー |
| 機器 | `/equipment` | 機器一覧・詳細・CRUD |
| エンジニア | `/engineers` | CE 一覧・詳細 |
| 日報 | `/daily-reports` | 日報一覧・作成・承認 |
| レポート | `/reports` | 月次レポート |
| 契約 | `/contracts` | 保守契約管理 |
| 消費実績 | `/consumption` | サプライ消費追跡 |
| ナレッジ | `/knowledge` | ナレッジベース |
| 修理事例 | `/recommendations` | 改善提案・修理事例 |
| 年間レビュー | `/annual-review` | 顧客別年間評価 |
| 年間KPI | `/annual-kpi` | KPI ダッシュボード |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=geek` → `geek_customer`）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_customer` | 顧客 |
| `{prefix}_equipment` | 機器 |
| `{prefix}_call` | コール（問い合わせ） |
| `{prefix}_workorder` | 作業オーダー |
| `{prefix}_engineer` | エンジニア（CE） |
| `{prefix}_dailyreport` | 日報 |
| `{prefix}_report` | 月次レポート |
| `{prefix}_contract` | 保守契約 |
| `{prefix}_consumption` | 消費実績 |
| `{prefix}_knowledge` | ナレッジ |
| `{prefix}_recommendation` | 改善提案・修理事例 |
| `{prefix}_annualreview` | 年間レビュー |
| `{prefix}_area` | エリア |

## 主な技術スタック

| ライブラリ | 用途 |
|---|---|
| `@dnd-kit/core` | スケジューリングのドラッグ&ドロップ |
| `@xyflow/react` | サービスフローのノード/エッジ可視化 |
| `recharts` | ダッシュボードのチャート（棒・円グラフ） |
| `date-fns` | 日付操作（ガント表示・日付フォーマット） |
| `sonner` | トースト通知 |

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_PUBLISHER_PREFIX`（.env） | Dataverse テーブルのプレフィックスを変更 |
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `VITE_CODEAPPS_APP_SUBTITLE`（.env） | サブタイトルを変更 |
| `src/config.ts` の `NAV_SECTIONS` | ページ構成を変更（コードで直接編集） |

## セットアップ手順

```bash
# 1. 共通設定（standard/references/.env.example → .env にコピー）
# 2. サンプル固有設定（.env.example の内容を .env に追記）

# 3. Dataverse テーブルの作成
python scripts/setup_dataverse.py

# 4. データソースの追加（テーブルごとに実行）
python scripts/toggle_table_lang.py en
npx power-apps add-data-source -a dataverse -t {prefix}_customer
npx power-apps add-data-source -a dataverse -t {prefix}_equipment
# ... 全テーブルを追加
python scripts/toggle_table_lang.py jp

# 5. 動作確認
npm run dev
```

## デザインパターン（参考資料）

このサンプルで使われている実装パターンの詳細は以下を参照:

- [スケジューリングボード パターン](../../references/scheduling-pattern.md) — DnD、比例ガント、重複検出、Google Maps
- [サービスフロー パターン](../../references/service-flow-pattern.md) — ReactFlow カスタムノード、集計可視化
- [マイページ パターン](../../references/mypage-pattern.md) — ユーザー識別、リレーショナルフィルター、KPI カード
