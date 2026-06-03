# サンプル実装ガイド

本リポジトリには **開発標準・スキル（汎用テンプレート）** と **インシデント管理サンプル（リファレンス実装）** の 2 種類のコードが含まれています。

## 構成の区分

### そのまま再利用できるもの（開発標準・テンプレート）

| パス | 内容 |
|------|------|
| `.github/agents/` | GitHub Copilot カスタムエージェント定義 |
| `.claude/agents/` | Claude Code カスタムエージェント定義 |
| `.github/skills/` | 各フェーズの開発スキル（検証済み教訓・パターン集） |
| `.github/skills/**/references/` | 開発標準ドキュメント |
| `src/components/` | shadcn/ui + カスタム UI コンポーネント |
| `src/providers/` | React Context Providers |
| `src/lib/utils.ts` | ユーティリティ |
| `.github/skills/standard/scripts/auth_helper.py` | MSAL 認証ヘルパー |
| `plugins/` | Vite プラグイン |
| `styles/` | Tailwind CSS テーマ |
| `patch-nameutils.cjs` | 日本語 DisplayName パッチ |
| `.env.example` | 環境変数テンプレート |
| `package.json` | 依存関係（shadcn/ui, TanStack Query 等） |
| `vite.config.ts`, `tsconfig*.json` | ビルド設定 |

### サンプル実装（プロジェクトに合わせて置き換え）

> インシデント管理（IT Service Management）を題材とした End-to-End のリファレンス実装です。
> テーブル名・エージェント名・フロー名等をあなたのプロジェクトに書き換えてください。

| パス | 内容 | 置き換え対象 |
|------|------|-------------|
| `.github/skills/dataverse/scripts/setup_dataverse.py` | Dataverse テーブル構築 | テーブル定義・列・Lookup・デモデータ |
| `.github/skills/copilot-studio/scripts/deploy_agent.py` | Copilot Studio エージェント設定 | BOT_NAME・Instructions・推奨プロンプト |
| `.github/skills/power-automate/scripts/deploy_flow.py` | ステータス変更通知フロー | テーブル名・通知メール本文 |
| `.github/skills/power-automate/scripts/deploy_flow_*.py` | 各種 Power Automate フロー | フロー定義全体 |
| `.github/skills/ai-builder/scripts/deploy_ai_prompt.py` | AI Builder プロンプト | プロンプト内容・入出力定義 |
| `.github/skills/standard/scripts/add_to_solution.py` | ソリューション包含検証 | テーブル名リスト |
| `src/pages/incidents.tsx` | インシデント一覧ページ | ページ全体 |
| `src/pages/incident-detail.tsx` | インシデント詳細ページ | ページ全体 |
| `src/pages/dashboard.tsx` | ダッシュボード | 集計ロジック・KPI |
| `src/pages/kanban.tsx` | カンバンボード | データソース |
| `src/hooks/use-incidents.ts` | データフェッチフック | テーブル名・クエリ |
| `src/types/incident.ts` | 型定義 | エンティティ型 |

### SDK 自動生成（環境ごとに再生成）

| パス | 内容 |
|------|------|
| `src/generated/` | `npx power-apps add-data-source` で自動生成（.gitignore 対象） |
| `.power/` | Power Apps SDK 内部ファイル（.gitignore 対象） |
| `power.config.json` | `npx power-apps init` で自動生成（.gitignore 対象） |

## 新しいプロジェクトの始め方

### 推奨: デザインテンプレート先行デプロイ → シナリオ差し替え

> **戦略**: デザインテンプレートをまずデプロイし動作確認した後、ユーザーの業務シナリオに置き換える。
> デザイン（レイアウト・コンポーネント・テーマ）はそのまま維持し、中身だけ差し替える。

```
Phase 1: テンプレートデプロイ（デザイン確認）
  ├── git clone → npm install → .env 設定
  ├── npm run build:pages → pac pages upload
  ├── ブラウザでデザイン確認（サンプルデータ表示）
  └── ✅ Power Pages / Code Apps 上で動作する SPA を確認
         ↓
Phase 2: シナリオ差し替え（ドメイン変更）
  ├── GeekPowerCode エージェントに業務要件を伝える
  ├── src/types/ → 新しい型定義
  ├── src/services/ → 新しい CRUD サービス
  ├── src/hooks/ → 新しい React Query フック
  ├── src/pages/ → 新しいページ群
  └── ✅ レイアウト・コンポーネント・認証はそのまま
         ↓
Phase 3: Dataverse + バックエンド構築
  ├── setup_dataverse.py でテーブル構築
  ├── deploy_agent.py でエージェント構築
  ├── deploy_flow.py でフロー構築
  └── ✅ End-to-End 動作確認
```

#### Phase 2 で差し替える対象（4 層のみ）

| 層 | ファイル | 差し替え内容 |
|----|----------|-------------|
| **型定義** | `src/types/{domain}.ts` | エンティティ型・ラベル・カラーマップ |
| **サービス** | `src/services/{domain}-service.ts` | Dataverse CRUD (テーブル名・列名) |
| **フック** | `src/hooks/use-{domain}.ts` | React Query (useQuery/useMutation) |
| **ページ** | `src/pages/*.tsx` | 画面 UI (KPI・一覧・詳細・ボード等) |

#### Phase 2 で差し替え **ない** もの（デザインテンプレートとして維持）

| パス | 内容 |
|------|------|
| `src/pages/_layout.tsx` | ナビ構造・ヘッダー・フッター・テーマ切替 |
| `src/components/` | ListTable, FormModal, KPI, DataTable 等の共通 UI |
| `src/providers/` | PowerProvider, ThemeProvider, QueryProvider |
| `src/services/authService.ts` | Power Pages 認証 (form POST + Liquid) |
| `src/router.tsx` | ルート定義（パス名のみ変更） |
| `styles/` | Tailwind CSS テーマ |
| `vite.config.ts` | ビルド構成 |
| `scripts/post_upload_fix.py` | テンプレート再パッチ + サイト再起動 |

#### ページパターンの踏襲

新しいシナリオでも以下のページパターンをそのまま適用:

| パターン | 構成 | 例 |
|----------|------|-----|
| **一覧** | KPI カード + ListTable + フィルタ + FormModal | incidents.tsx |
| **詳細** | カード群 + コメントスレッド + 編集モード | incident-detail.tsx |
| **ボード** | @dnd-kit カンバン（5列） | board.tsx |
| **ダッシュボード** | KPI + Recharts (Pie/Bar) + 直近一覧 | dashboard.tsx |
| **マスタ** | シンプル CRUD (ListTable + FormModal) | categories.tsx |

### 方法 1: テンプレートとしてクローン

```bash
git clone https://github.com/geekfujiwara/CodeAppsDevelopmentStandard my-project
cd my-project

# 1. .env を設定
cp .env.example .env
# DATAVERSE_URL, TENANT_ID, SOLUTION_NAME, PUBLISHER_PREFIX を編集

# 2. デザインテンプレートをまずデプロイして動作確認
npm install && npm run build:pages
# → ブラウザで確認（サンプルデータでデザインが正しく表示される）

# 3. GitHub Copilot / Claude Code に指示（GeekPowerCode エージェント）
# Copilot: @GeekPowerCode {あなたのアプリ}に置き換えてください
# Claude Code: GeekPowerCode エージェントを選択して同じ指示を入力
# → エージェントが types → services → hooks → pages を自動生成
```

### 方法 2: 開発標準だけ導入（既存プロジェクトに追加）

```powershell
$base = "https://raw.githubusercontent.com/geekfujiwara/CodeAppsDevelopmentStandard/main"
@(".github/agents", ".claude/agents", ".github/skills/standard", ".github/skills/standard/references") | ForEach-Object {
  New-Item -ItemType Directory -Path $_ -Force
}
@(
  @{Src="$base/.github/agents/GeekPowerCode.agent.md"; Dst=".github/agents/GeekPowerCode.agent.md"},
  @{Src="$base/.claude/agents/GeekPowerCode.md"; Dst=".claude/agents/GeekPowerCode.md"},
  @{Src="$base/.github/skills/standard/SKILL.md"; Dst=".github/skills/standard/SKILL.md"},
  @{Src="$base/.github/skills/standard/references/power-platform-development-standard.md"; Dst=".github/skills/standard/references/power-platform-development-standard.md"}
) | ForEach-Object { Invoke-WebRequest -Uri $_.Src -OutFile $_.Dst }
```

## サンプルの置き換え手順

1. **デザインテンプレートをまずデプロイ**
   - `npm run build:pages` → `pac pages upload-code-site` → `post_upload_fix.py`
   - ブラウザでデザインが正しく表示されることを確認
   - 認証フロー（ログイン/ログアウト）が動作することを確認

2. **GeekPowerCode エージェントに業務要件を伝える**
   - エージェントが Phase 0（設計）から自動でガイド
   - テーブル設計・UI 設計・エージェント設計をそれぞれ提案 → 承認後に実装

3. **エージェントが自動で行う差し替え**
   - `src/types/` — 新ドメインの型定義（ラベル・カラーマップ含む）
   - `src/services/` — Dataverse CRUD サービス
   - `src/hooks/` — React Query フック
   - `src/pages/` — 業務画面（同じページパターンで新コンテンツ）
   - `src/router.tsx` — ルート定義のパス名変更
   - `src/pages/_layout.tsx` — ナビグループ（navGroups）の項目変更
   - `setup_dataverse.py` を要件に合わせて新規生成
   - `deploy_agent.py` のエージェント名・Instructions を更新
   - `deploy_flow.py` のフロー定義を更新

4. **手動で行うこと**
   - `.env` の設定
   - Power Pages admin center で Identity Provider 有効化
   - Copilot Studio UI でのエージェント作成
   - Power Automate 接続の事前作成
   - Design Studio で Table Permission → Web Role 紐付け
   - ナレッジ・MCP Server の UI での追加
