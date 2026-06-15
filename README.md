# Power Platform コードファースト開発標準

Power Apps Code Apps, モデル駆動型アプリ, Generative page, Dataverse, Power Automate, Power Pages, Copilot Studio を **VS Code + GitHub Copilot / Claude Code** で開発するための、実践的な開発標準リポジトリです。
Code Apps 自体は React / Vue などの SPA フレームワークに対応していますが、このリポジトリの実装標準は **TypeScript + React + Tailwind CSS + shadcn/ui** を前提にしています。

[![VS Code で開く](https://img.shields.io/badge/VS%20Code%E3%81%A7%E9%96%8B%E3%81%8F-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://vscode.dev/github/geekfujiwara/CodeAppsDevelopmentStandard)
[![GitHub Copilot](https://img.shields.io/badge/GitHub%20Copilot-対応-blueviolet?style=for-the-badge&logo=github)](https://github.com/features/copilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](./LICENSE)

## 使い方動画

- [使い方を説明した動画（YouTube）](https://youtu.be/-BU7KnjvYoc?si=iO8MtVLq__gOfTqw)

---

## このリポジトリで提供するもの

- Power Platform 向けコードファースト開発標準（`.github/skills/*/references/`）
- GitHub Copilot / Claude Code 用のカスタムエージェント / スキル（`.github/`, `.claude/`）
- Power Automate / Copilot Studio 連携の実装パターン
- リファレンス実装サンプル（`.github/skills/*/samples/` — Geek Sales ほか）
- `.env.example` を含むプロジェクト初期化テンプレート

> [!IMPORTANT]
> **このリポジトリは開発標準（スキル・リファレンス）の供給元です。**
> 新しいテーマは `npx degit` でこのリポジトリの `.github/`（エージェント・スキル）を取得し、
> **@GeekPowerCode** にプロジェクト全体の scaffold を依頼して開発を開始します。

---

## 目次

- [クイックスタート](#クイックスタート)
- [環境準備プロンプト](#環境準備プロンプト)
- [環境チェックを再実行する場合](#環境チェックを再実行する場合)
- [カスタムエージェント前提の利用方法](#カスタムエージェント前提の利用方法)
- [リポジトリ構成](#リポジトリ構成)
- [主要ドキュメント](#主要ドキュメント)
- [GitHub Copilot / Claude Code 活用](#github-copilot--claude-code-活用)
- [ライセンス](#ライセンス)

---

## クイックスタート

個人でのプロトタイピングをローカルでクイックに始める方法をご紹介します。[チーム開発](#チーム開発のためにリモートを用意する場合)は次のセクションをご覧ください。

> [!IMPORTANT]
> 以下の手順は **Git / Node.js** などの開発環境が整っている前提です。まだの方は先に [環境準備プロンプト](#環境準備プロンプト) を実行してください。

### 手順

テーマ用ワークスペースフォルダを開いた状態で、以下のコマンドを実行してエージェント・スキルを取得します。

```bash
npx degit geekfujiwara/CodeAppsDevelopmentStandard .github
```

取得後、**@GeekPowerCode** に新規テーマ開発を依頼します。`spec/input/` フォルダにドキュメントや画像を配置して **/spec-to-markdown** で依頼することもできます。

エージェントが Vite + React + Tailwind CSS + shadcn/ui のプロジェクト一式を scaffold し、デザインテンプレート選択・Dataverse 接続・デプロイまでをガイドします。

> [!TIP]
> チームで開発する場合は、後から [リモートを用意](#チーム開発のためにリモートを用意する場合) して移行・統合できます。

### チーム開発のためにリモートを用意する場合

最初からチーム用の private リポジトリを作りたい場合は以下を実行します。

```bash
# 1. GitHub 上で空の private リポジトリを作成してクローン
gh repo create <your-account>/<your-theme-repo> --private --clone && cd <your-theme-repo>

# 2. エージェント・スキルを取得
npx degit geekfujiwara/CodeAppsDevelopmentStandard .github

# 3. @GeekPowerCode にプロジェクト scaffold を依頼
```

> [!TIP]
> GitHub Copilot, Claude Code などに上記 bash をプロンプトとして入れることで対話型で進めることもできます。
>
> Azure DevOps / 社内 Git / ローカル NAS など GitHub 以外のリモートを使う場合も、同じ手順で `git remote add origin <url>` を実行すれば、GitHub には何も公開せずに済みます。

### 上流の開発標準更新を取り込む

git merge は不要です。テーマのリポジトリで以下を再実行するだけで、最新の標準（`.github/` のエージェント・スキル）に追従できます。

```bash
npx degit geekfujiwara/CodeAppsDevelopmentStandard .github --force
```

> [!TIP]
> 同期対象は `.github/` のみで、テーマ固有のコード（`src/` 等）には触れません。
> 同期後は `git diff` で差分を確認してからコミットしてください。

### 環境チェックを実行する

```bash
npm run check:env   # Node.js / Python / pac 等の確認のみ
npm run setup       # 上記 + Python venv bootstrap
```

`npm run setup` で **環境事前チェック (preflight) + Python bootstrap** をまとめて実行し、Node.js / npm / Python（`python` or `py -3`）/ pip / `npx power-apps` / `pac` を確認します。`gh` が利用可能かつ `gh auth login` 済みの場合は、デフォルトブランチの **Copilot 承認バイパス設定**（Branch protection の bypass app）も確認します。

Python と pip が利用可能な場合は、`spec-to-markdown` 用 `.venv` の作成と `requirements.txt` の導入まで自動で試行します。未導入ツールがある場合は、次に実行すべきコマンドを表示します。

セットアップ後は、GitHub Copilot または Claude Code のカスタムエージェントに「実現したいこと」をそのまま伝えて開発を進めます。

---

## 環境準備プロンプト

以下を GitHub Copilot / Claude Code にそのまま貼り付けると、Windows 端末の **開発ツール導入と動作確認** までを実行できます。リポジトリの clone や `npm install` は行わず、完了後は [クイックスタート](#クイックスタート) に進んでください。

```text
Windows 端末の開発環境準備（開発ツールの導入と動作確認まで）を実行してください。
リポジトリの clone や npm install は行いません。完了したらクイックスタートに進む案内をしてください。

要件:
1. PowerShell 7 を最優先で導入し、以後の作業は PowerShell 7 で確認する。
2. Git / Node.js LTS / Python 3.12 を導入する。
3. Power Platform は PP CLI のみ導入する（VS Code 拡張は入れない）。
4. PATH 未反映の可能性を考慮し、実体パス確認と PATH 反映を行う。
5. `gh auth status` で GitHub CLI のログイン状態を確認する（未ログインなら `gh auth login` を案内）。
6. リポジトリの fork / clone / `npm install` は実行しない。次のステップとしてクイックスタートへ案内する。

検証コマンド:
- $PSVersionTable.PSVersion
- git --version
- node --version
- npm --version
- python --version
- py --version
- pac help  （ヘッダの Version を確認）
- where.exe pac
- gh --version
- gh auth status

実施ルール:
- 長いワンライナーは避け、一時的な `.ps1` ファイルに処理を書いて PS7 で実行する。
- PS7 への初回切り替えは `pwsh` が未解決でも進められるよう、`C:\Users\<user>\AppData\Local\Microsoft\WindowsApps\pwsh.exe` の実体パス実行を優先する。
- VS Code CLI など PATH 未反映の可能性があるコマンドは実体パス呼び出しを優先する。
- 最終検証は「PS7 セッション」と「作業開始時の既存セッション」の両方で確認する。
- 実行結果は「導入済み」「要再起動」「PATH 反映待ち」を分けて報告する。
- 最後のユーザー向けコメントには以下を含める:
  - 「環境準備 OK（ツール導入と動作確認まで完了）」の明示
  - 次のアクションとして README の「クイックスタート」を実行してローカルに clone することを案内
  - クイックスタートはリモートに fork せず、本リポジトリをローカルに直接 clone する方針である旨を補足
  - クイックスタート完了後は GitHub Copilot 側で `GeekPowerCode` カスタムエージェントへ切り替え、作りたいテーマを伝えて開発開始すること
  - 可能なら現在ディレクトリ名からテーマ候補を推測し、推奨プロンプトを 1 つ提案すること
```

> [!TIP]
> `pac --version` は無効なため、バージョン確認は `pac help` のヘッダ表示を利用します。

---

## 環境チェックを再実行する場合

```bash
# 事前チェックのみ（不足がある場合は exit 1）
npm run check:env

# 事前チェック + Python bootstrap を再実行
npm run setup
```

不足時の対応:

- Python 未検出: Python 3.10+ を導入して `python --version` または `py -3 --version` を通す
- pip 未検出: `python -m ensurepip --upgrade`（または `py -3 -m ensurepip --upgrade`）
- `pac` 未検出: `npm install -g @microsoft/power-apps-cli` 後、`pac auth create --environment {ENVIRONMENT_ID}`
- `npx power-apps` 未検出: `npm install` を再実行し `@microsoft/power-apps` 依存を確認

---

## カスタムエージェント前提の利用方法

- この開発標準の実装・運用ルールは、GitHub Copilot / Claude Code で共通利用するスキル（`.github/skills/`）に定義されています。
- 利用者は手順書を読み込んで操作するのではなく、カスタムエージェントに要件を伝えて進める前提です。
- GitHub Copilot や Claude Code での依頼例: GeekPowerCode エージェントを選択して、 `在庫管理をもっと効率的に行いたい。`
- 既存仕様書がある場合の入力例: spec-to-markdown を実行して

---

## リポジトリ構成

```text
.
├── .github/
│   ├── agents/                      # Copilot カスタムエージェント定義
│   └── skills/                      # 製品単位で統合された 11 スキル
│       ├── architecture/            # アーキテクチャ設計
│       ├── standard/                # 共通基盤（認証・アイコン・メールテンプレート）
│       ├── dataverse/               # テーブル設計・構築・セキュリティロール
│       ├── code-apps/               # Code Apps 開発（UI 設計・CSP・メール送信含む）
│       ├── power-pages/             # Power Pages コードサイト開発・デプロイ
│       ├── generative-page/         # Generative Pages 開発
│       ├── model-driven-app/        # モデル駆動型アプリ構築
│       ├── copilot-studio/          # エージェント構築・トリガー・ニュース配信
│       ├── power-automate/          # クラウドフロー作成・デプロイ
│       ├── ai-builder/              # AI プロンプト作成
│       ├── spec-to-markdown/        # 仕様書→要件 markdown 変換
│       │
│       │   # スキルが所有するアセットはそのスキル配下に置く（例）:
│       ├── standard/scripts/auth_helper.py              # MSAL 認証ヘルパー
│       ├── code-apps/references/patch-nameutils.cjs     # 日本語 DisplayName パッチ
│       ├── code-apps/references/maps/                   # 日本地図 SVG
│       └── */samples/                                   # リファレンス実装（同期対象外）
├── .claude/
│   └── agents/                      # Claude Code カスタムエージェント定義
├── .env.example                     # 環境変数テンプレート
├── .gitignore
├── package.json
├── LICENSE
└── README.md
```

> **root には慣習的なリポ直下ファイル（README / .env.example / .gitignore / package.json / LICENSE）だけを置く。**
> 認証ヘルパー・日本語パッチ・地図 SVG など「特定スキルが所有するアセット」はそのスキル配下に置き、`.github/` 同期でテーマに配布する。
> 環境セットアップ（bootstrap.mjs）は `standard/scripts/`、デプロイ前チェック（pre-deploy-check.mjs）は `code-apps/scripts/` に配置。
> アプリの実装（`src/` / `vite.config.ts` 等）は本リポジトリには置かない（リファレンス実装は各スキルの `samples/`）。
> 新規テーマの scaffold は **@GeekPowerCode** がサンプルを参照して生成する。

---

## 主要ドキュメント

- [.github/skills/standard/references/power-platform-development-standard.md](./.github/skills/standard/references/power-platform-development-standard.md)
- [.github/skills/dataverse/references/dataverse-guide.md](./.github/skills/dataverse/references/dataverse-guide.md)
- [.github/skills/code-apps/references/connector-reference.md](./.github/skills/code-apps/references/connector-reference.md)
- [.github/skills/code-apps/references/advanced-patterns.md](./.github/skills/code-apps/references/advanced-patterns.md)
- [サンプル実装一覧（.github/skills/README.md）](./.github/skills/README.md#サンプル実装一覧)

---

## GitHub Copilot / Claude Code 活用

- GitHub Copilot では `.github/agents/` と `.github/skills/` が認識されます
- Claude Code では `.claude/agents/` を利用して同じスキル群（`.github/skills/`）を参照できます
- `GeekPowerCode` に実現したい内容を伝えるだけで、必要なスキルが選択されて開発タスクを進められます
- このリポジトリの開発標準はスキルとして定義済みのため、マニュアル手順ベースではなくエージェント駆動で利用します

### スキル一覧

スキルの一覧・説明・推奨開発フローは **[スキルカタログ（.github/skills/README.md）](.github/skills/README.md)** で一元管理しています。スキルの追加・変更時はそちらを更新してください。

---

## ライセンス

MIT License。詳細は [LICENSE](./LICENSE) を参照してください。

---

## フィードバック

- Issues: https://github.com/geekfujiwara/CodeAppsDevelopmentStandard/issues
- X: https://twitter.com/geekfujiwara
