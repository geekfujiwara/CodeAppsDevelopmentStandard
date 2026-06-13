# サンプル実装ガイド

本リポジトリは **開発標準・スキル（`.github/`）** を供給するリポジトリであり、
過去テーマの完全実装は **リファレンス実装サンプル** として各スキルの `samples/` に隔離しています。

> [!IMPORTANT]
> サンプルは **読むためのリファレンス** です。新しいテーマの雛形には使いません。
> 新規テーマは [CodeAppsStarter](https://github.com/geekfujiwara/CodeAppsStarter) テンプレートから生成し、
> `npm run setup` で本リポジトリの標準を同期します（README の「クイックスタート」参照）。
> サンプルは `npm run setup` / `npm run sync-standards` の **同期対象外** です。

## サンプル一覧

| サンプル | 場所 | 題材 | 参照する場面 |
|---|---|---|---|
| Geek Sales | [`.github/skills/code-apps/samples/geek-sales/`](./.github/skills/code-apps/samples/geek-sales/) | 営業支援（顧客・商談・パイプライン・テリトリー・Copilot 分析） | Code Apps の画面構成・Lookup 名前解決・フロー連携・Copilot Studio コネクタの実例 |
| Power Pages ポータル | [`.github/skills/power-pages/samples/portal/`](./.github/skills/power-pages/samples/portal/) | Power Pages サイト実体（web-templates / page-templates） | Power Pages のサイト構造・テンプレートパッチの実例 |
| Corporate LP テンプレート | [`.github/skills/power-pages/templates/corporate-lp/`](./.github/skills/power-pages/templates/corporate-lp/) | コーポレート LP（こちらは雛形として利用可） | Power Pages Code Site の新規構築 |

## サンプルに含まれないもの（SDK 生成物）

すべてのサンプルから以下を除外しています。**これらは手で作成・コピーせず、必ず各テーマの環境で SDK に生成させます**:

| パス | 生成コマンド |
|------|------|
| `.power/` | `pac code init`（Power Apps SDK が生成） |
| `src/generated/` | `pac code add-data-source` / `npx power-apps add-data-source` |
| `power.config.json` | `pac code init` / `npx power-apps init` |

## サンプルの読み方（シナリオ差し替えの 4 層）

新テーマを実装するとき、サンプルから踏襲するのは **パターン** であって コード一式ではありません。
ドメインに依存するのは次の 4 層だけで、それ以外（`_layout.tsx` / `components/` / `providers/` / `styles/`）は
CodeAppsStarter の雛形をそのまま使います:

| 層 | ファイル | サンプルでの実例（geek-sales） |
|----|----------|-------------|
| **型定義** | `src/types/{domain}.ts` | `src/types/dataverse.ts` |
| **サービス** | `src/services/{domain}-service.ts` | `src/services/dataverse-service.ts` |
| **フック** | `src/hooks/use-{domain}.ts` | `src/hooks/use-dataverse.ts` |
| **ページ** | `src/pages/*.tsx` | `opportunities.tsx` / `pipeline.tsx` / `territory.tsx` 等 |

ページパターンの対応:

| パターン | 構成 | geek-sales での例 |
|----------|------|-----|
| **一覧** | KPI カード + ListTable + フィルタ + FormModal | `customers.tsx` |
| **詳細** | カード群 + 関連レコード + 編集モード | `opportunity-detail.tsx` |
| **ボード** | @dnd-kit カンバン | `pipeline.tsx` |
| **ダッシュボード** | KPI + Recharts + 直近一覧 | `dashboard.tsx` |
| **AI 統合** | フロー呼び出し + Copilot 分析 | `copilot-dashboard.tsx` / `ai-insights.tsx` |

## 既存プロジェクトに開発標準だけ導入する場合

CodeAppsStarter を使わず、既存のプロジェクトに標準を取り込む場合は、本リポジトリを shallow clone して
`.github/`（スキル・エージェント）と `.github/template-root/` 配下の共有ファイル
（`auth_helper.py` / `patch-nameutils.cjs` / `public/maps/` / `scripts/` / `.env.example`）を
プロジェクトのルートに展開します（CodeAppsStarter の `scripts/sync-standards.mjs` をコピーして実行するのが最も簡単です）。

新規テーマ開始時のクリーン確認は [新規テーマ開始チェックリスト](./.github/skills/code-apps/references/new-theme-checklist.md) を参照してください。
