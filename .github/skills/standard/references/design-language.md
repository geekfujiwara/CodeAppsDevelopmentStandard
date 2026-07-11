# デザイン言語（トークン / 配色 / UX パターン選定）— 共通基盤

> **位置づけ**: 複数スキル（code-apps / power-pages / azure）から参照される **共通のデザイン言語**。
> 「**デザイントークンの体系・命名・配色切替の規約・UX パターン選定**」を単一の真実として定義する。
> **プラットフォーム固有のコンポーネント実装は各スキルに置く**（下記「実装の参照先」）。ここに React/HTML の実装コードは置かない。

分担:
- **standard（本ファイル）**= デザイン言語（トークン体系・規約・UX 選定・プラットフォーム差分）
- **code-apps** = shadcn/ui + Tailwind CSS v4 の **React 実装**（内部業務アプリ）
- **power-pages** = 公開サイト/ポータルの **実装**
- **azure** = 上記を **参照** + Azure 固有の適応メモ（独自パレットは持たない）

---

## 1. デザイントークン体系（共通）

shadcn/ui 流の **CSS 変数**で定義する。役割ベースのトークン名を共通とする（値はテーマで切替）。

| トークン | 役割 |
|---|---|
| `--background` / `--foreground` | 画面地色 / 既定文字色 |
| `--card` / `--card-foreground` | カード面 / その文字色 |
| `--primary` / `--primary-foreground` | 主要アクション色 / その上の文字 |
| `--secondary` / `--secondary-foreground` | 補助色 / その上の文字 |
| `--muted` / `--muted-foreground` | 抑えた面 / 補足文字 |
| `--border` / `--input` / `--ring` | 罫線 / 入力枠 / フォーカスリング |
| `--radius` | 角丸の基準値 |

**規約（共通）**
- **配色は設計時に 1 テンプレートを選択**（ランタイム切替ではない）。デプロイ物は常に 1 パレット。
- **ダーク/ライトは `:root` / `.dark`** の2系統で定義（切替は各実装の ThemeProvider 等）。
- テンプレートで切り替えるのは **配色と `--radius` のみ**を基本とする。

---

## 2. フォント / CSP ポリシー（プラットフォーム差分）

**ここが各プラットフォームで異なる**。共通化せず、差分として明示する。

| プラットフォーム | フォント / CSP |
|---|---|
| **Code Apps** | **Google Fonts 禁止（外部通信・CSP 制約）。フォント固定**。切替は配色のみ。 |
| **Power Pages** | 和欧混植で崩れるためフォント固定、配色のみ切替。 |
| **Azure（SWA / App Service）** | **CSP のフォント制約は無い** → カスタム Web フォント / 可変フォント / モーション / SEO 最適化が使える（下記 azure 適応）。 |

> 配色トークンの**命名・切替方式は共通**。既定パレット**値**は各プラットフォームの `design-templates.md` が保持する。
> 値の一本化（例: `--background` の `#f0f7ff` と `#f8fafc` の差）は**意図的な差か統一かをオーナー判断**で決める（未確定なら現状維持）。

---

## 3. UX パターン選定マップ（プラットフォーム非依存 → 実装へリンク）

「データ/目的の形」から使うパターンを選び、各プラットフォームの実装を参照する。

| データ / 目的 | 推奨パターン | 実装参照 |
|---|---|---|
| 一覧・表形式（検索/フィルタ/インライン編集） | Table / Gallery | [code-apps: crud-ui / design-pattern](../../code-apps/references/crud-ui-pattern.md) |
| パイプライン / ステータス遷移 | Kanban | [code-apps: design-pattern（KanbanBoard）](../../code-apps/references/design-pattern.md) |
| 集計 / KPI / ダッシュボード | StatsCards / Charts | [code-apps: design-pattern / pareto-chart](../../code-apps/references/pareto-chart-pattern.md) |
| 多段入力 / 申請 | Wizard フォーム | [code-apps: wizard-form](../../code-apps/references/wizard-form-pattern.md) |
| 時系列 / 進捗 / 承認段階 | Timeline / Stepper | [code-apps: timeline-stepper](../../code-apps/references/timeline-stepper-pattern.md) |
| スケジュール / 予約 | Calendar | [code-apps: calendar](../../code-apps/references/calendar-pattern.md) |
| **公開 LP / マーケ / 企業サイト** | Hero / Pricing / CTA | [power-pages: design-pattern / design-templates](../../power-pages/references/design-pattern.md) |
| **外部ポータル（認証後）** | Portal レイアウト | [power-pages: design-pattern](../../power-pages/references/design-pattern.md) |

---

## 4. 実装の参照先

| 用途 | 実装スキル |
|---|---|
| 内部業務アプリ（React / shadcn/ui + Tailwind v4） | [code-apps デザインパターン](../../code-apps/references/design-pattern.md) / [テンプレート](../../code-apps/references/design-templates.md) |
| 外部公開サイト / ポータル | [power-pages デザインパターン](../../power-pages/references/design-pattern.md) / [テンプレート](../../power-pages/references/design-templates.md) |
| Azure 上の Web フロント | [azure スキル](../../azure/SKILL.md)（本ファイルを配色の単一ソースとして参照 + Azure 固有適応） |

> 新しい実装パターンは各プラットフォームスキルに追加し、本ファイルの UX 選定マップに1行足す。
