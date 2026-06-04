# Power Platform コードファースト開発標準

Power Apps Code Apps・Dataverse・Power Automate・Copilot Studio を **VS Code + GitHub Copilot / Claude Code** で開発するための、実践的な開発標準リポジトリです。
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
- Code Apps のスターター UI コンポーネント（`src/components/`）
- Power Automate / Copilot Studio 連携の実装パターン
- `.env.example` を含むプロジェクト初期化テンプレート

> [!TIP]
> サンプル実装はあくまでリファレンスです。業務要件に合わせて `src/pages/` やスキル内スクリプトを置き換えて利用してください。

---

## 目次

- [クイックスタート](#クイックスタート)
- [環境準備プロンプト（1回実行用）](#環境準備プロンプト1回実行用)
- [環境事前チェックとブートストラップ](#環境事前チェックとブートストラップ)
- [カスタムエージェント前提の利用方法](#カスタムエージェント前提の利用方法)
- [リポジトリ構成](#リポジトリ構成)
- [主要ドキュメント](#主要ドキュメント)
- [GitHub Copilot / Claude Code 活用](#github-copilot--claude-code-活用)
- [ライセンス](#ライセンス)

---

## クイックスタート

```bash
git clone https://github.com/geekfujiwara/CodeAppsDevelopmentStandard .
npm install

```

> [!NOTE]
> `.` へ clone するため、空ディレクトリで実行してください。既存ファイルがある場所で実行すると上書きリスクがあります。

`npm install` では `postinstall` で **環境事前チェック (preflight)** を実行し、Node.js / npm / Python（`python` or `py -3`）/ pip / `npx power-apps` / `pac` を確認します。

Python と pip が利用可能な場合は、`spec-to-markdown` 用 `.venv` の作成と `requirements.txt` の導入まで自動で試行します。未導入ツールがある場合は、次に実行すべきコマンドを表示します。

セットアップ後は、GitHub Copilot または Claude Code のカスタムエージェントに「実現したいこと」をそのまま伝えて開発を進めます。

---

## 環境準備プロンプト（1回実行用）

以下を GitHub Copilot / Claude Code にそのまま貼り付けると、Windows 端末の初期環境準備を 1 回の依頼で実行できます。

```text
Windows 端末の開発環境を初期化してください。リポジトリの clone と npm install はこの段階では実行しないでください。

要件:
1. PowerShell 7 を最優先で導入し、以後の作業は PowerShell 7 で確認する。
2. Git / Node.js LTS / Python 3.12 を導入する。
3. Power Platform は PP CLI のみ導入する（VS Code 拡張は入れない）。
4. PATH 未反映の可能性を考慮し、実体パス確認と PATH 反映を行う。
5. 最後に各ツールの動作確認を実施する。

検証コマンド:
- $PSVersionTable.PSVersion
- git --version
- node --version
- npm --version
- python --version
- py --version
- pac help  （ヘッダの Version を確認）
- where.exe pac

実施ルール:
- PowerShell 5.1 では && が使えないため、; if ($?) { ... } 形式で連結する。
- 長いワンライナーは避け、一時的な `.ps1` ファイルに処理を書いて PS7 で実行する。
- PS7 への初回切り替えは `pwsh` が未解決でも進められるよう、`C:\Users\<user>\AppData\Local\Microsoft\WindowsApps\pwsh.exe` の実体パス実行を優先する。
- VS Code CLI など PATH 未反映の可能性があるコマンドは実体パス呼び出しを優先する。
- clone / npm install は実行しない。
- 最終検証は「PS7 セッション」と「作業開始時の既存セッション」の両方で確認する。
- 実行結果は「導入済み」「要再起動」「PATH 反映待ち」を分けて報告する。
```

> [!TIP]
> `pac --version` は無効なため、バージョン確認は `pac help` のヘッダ表示を利用します。

---

## 環境事前チェックとブートストラップ

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
- GitHub Copilot の入力例（バッククオート不要）: @GeekPowerCode 在庫管理アプリを Dataverse + Code Apps で作りたい
- Claude Code の入力例: GeekPowerCode エージェントを選択して「在庫管理アプリを Dataverse + Code Apps で作りたい」
- 既存仕様書がある場合の入力例: spec-to-markdown を実行して
- 既定以外の場所を使う場合の入力例: /home/.../input の仕様書を requirements markdown に変換して

> [!NOTE]
> Microsoft Learn の現行 Code Apps 概要に合わせ、このリポジトリでは **Code Apps は SPA をホストする機能** として扱います。
> 公式の推奨 CLI は `npx power-apps` 系に移行中で、`pac code` は将来廃止予定です。本リポジトリ内で `pac code push` を併記している箇所は、既知のテナント解決問題に対する暫定ワークアラウンドです。

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
│       └── spec-to-markdown/        # 仕様書→要件 markdown 変換
├── .claude/
│   └── agents/                      # Claude Code カスタムエージェント定義
├── src/
│   ├── components/                  # 再利用 UI コンポーネント
│   ├── pages/                       # サンプルページ実装
│   ├── providers/                   # Context / Provider 群
│   ├── hooks/                       # カスタムフック
│   ├── lib/                         # 共通ユーティリティ
│   └── types/                       # 型定義
├── scripts/                         # 環境チェック・ブートストラップ
├── plugins/                         # Power Apps Vite プラグイン
├── styles/                          # Tailwind スタイル
├── .env.example                     # 環境変数テンプレート
├── SAMPLES.md                       # サンプル実装の置き換えガイド
└── README.md
```

---

## 主要ドキュメント

- [.github/skills/standard/references/power-platform-development-standard.md](./.github/skills/standard/references/power-platform-development-standard.md)
- [.github/skills/dataverse/references/dataverse-guide.md](./.github/skills/dataverse/references/dataverse-guide.md)
- [.github/skills/code-apps/references/connector-reference.md](./.github/skills/code-apps/references/connector-reference.md)
- [.github/skills/code-apps/references/advanced-patterns.md](./.github/skills/code-apps/references/advanced-patterns.md)
- [SAMPLES.md](./SAMPLES.md)

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
