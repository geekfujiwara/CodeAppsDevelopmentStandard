# Power Platform コードファースト開発標準

Power Apps Code Apps・Dataverse・Power Automate・Copilot Studio を **VS Code + GitHub Copilot** で開発するための、実践的な開発標準リポジトリです。
Code Apps 自体は React / Vue などの SPA フレームワークに対応していますが、このリポジトリの実装標準は **TypeScript + React + Tailwind CSS + shadcn/ui** を前提にしています。

[![VS Code で開く](https://img.shields.io/badge/VS%20Code%E3%81%A7%E9%96%8B%E3%81%8F-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://vscode.dev/github/geekfujiwara/CodeAppsDevelopmentStandard)
[![GitHub Copilot](https://img.shields.io/badge/GitHub%20Copilot-対応-blueviolet?style=for-the-badge&logo=github)](https://github.com/features/copilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](./LICENSE)

## 使い方動画

- [使い方を説明した動画（YouTube）](https://youtu.be/-BU7KnjvYoc?si=iO8MtVLq__gOfTqw)

---

## このリポジトリで提供するもの

- Power Platform 向けコードファースト開発標準（`.github/skills/*/references/`）
- GitHub Copilot 用のカスタムエージェント / スキル（`.github/`）
- Code Apps のスターター UI コンポーネント（`src/components/`）
- Power Automate / Copilot Studio 連携の実装パターン
- `.env.example` を含むプロジェクト初期化テンプレート

> [!TIP]
> サンプル実装はあくまでリファレンスです。業務要件に合わせて `src/pages/` やスキル内スクリプトを置き換えて利用してください。

---

## 目次

- [クイックスタート](#クイックスタート)
- [環境事前チェックとブートストラップ](#環境事前チェックとブートストラップ)
- [カスタムエージェント前提の利用方法](#カスタムエージェント前提の利用方法)
- [リポジトリ構成](#リポジトリ構成)
- [主要ドキュメント](#主要ドキュメント)
- [GitHub Copilot 活用](#github-copilot-活用)
- [ライセンス](#ライセンス)

---

## クイックスタート

```bash
git clone https://github.com/geekfujiwara/CodeAppsDevelopmentStandard . && npm install
```

> [!NOTE]
> `.` へ clone するため、空ディレクトリで実行してください。既存ファイルがある場所で実行すると上書きリスクがあります。

`npm install` では `postinstall` で **環境事前チェック (preflight)** を実行し、Node.js / npm / Python（`python` or `py -3`）/ pip / `npx power-apps` / `pac` を確認します。

Python と pip が利用可能な場合は、`spec-to-markdown` 用 `.venv` の作成と `requirements.txt` の導入まで自動で試行します。未導入ツールがある場合は、次に実行すべきコマンドを表示します。

セットアップ後は、GitHub Copilot のカスタムエージェントに「実現したいこと」をそのまま伝えて開発を進めます。

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

- この開発標準の実装・運用ルールは、GitHub Copilot カスタムエージェントのスキル（`.github/skills/`）に定義されています。
- 利用者は手順書を読み込んで操作するのではなく、カスタムエージェントに要件を伝えて進める前提です。
- チャット入力例 （バッククオート不要）: @GeekPowerCode 在庫管理アプリを Dataverse + Code Apps で作りたい
- 既存仕様書がある場合の入力例: @GeekPowerCode spec-to-markdown
- 既定以外の場所を使う場合の入力例: @GeekPowerCode /home/.../input の仕様書を requirements markdown に変換して

> [!NOTE]
> Microsoft Learn の現行 Code Apps 概要に合わせ、このリポジトリでは **Code Apps は SPA をホストする機能** として扱います。
> 公式の推奨 CLI は `npx power-apps` 系に移行中で、`pac code` は将来廃止予定です。本リポジトリ内で `pac code push` を併記している箇所は、既知のテナント解決問題に対する暫定ワークアラウンドです。

---

## リポジトリ構成

```text
.
├── .github/
│   ├── agents/                      # Copilot カスタムエージェント定義
│   └── skills/                      # 製品単位で統合された 10 スキル
│       ├── architecture/            # アーキテクチャ設計
│       ├── standard/                # 共通基盤（認証・アイコン・メールテンプレート）
│       ├── dataverse/               # テーブル設計・構築・セキュリティロール
│       ├── code-apps/               # Code Apps 開発（UI 設計・CSP・メール送信含む）
│       ├── generative-page/         # Generative Pages 開発
│       ├── model-driven-app/        # モデル駆動型アプリ構築
│       ├── copilot-studio/          # エージェント構築・トリガー・ニュース配信
│       ├── power-automate/          # クラウドフロー作成・デプロイ
│       ├── ai-builder/              # AI プロンプト作成
│       └── spec-to-markdown/        # 仕様書→要件 markdown 変換
├── src/
│   ├── components/                  # 再利用 UI コンポーネント
│   ├── pages/                       # サンプルページ実装
│   ├── providers/                   # Context / Provider 群
│   ├── hooks/                       # カスタムフック
│   ├── lib/                         # 共通ユーティリティ
│   └── types/                       # 型定義
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

## GitHub Copilot 活用

- VS Code で開くと `.github/agents/` と `.github/skills/` が認識されます
- `@GeekPowerCode` に実現したい内容を伝えるだけで、必要なスキルが選択されて開発タスクを進められます
- このリポジトリの開発標準はスキルとして定義済みのため、マニュアル手順ベースではなくエージェント駆動で利用します

### スキル一覧（10 スキル）

| スキル | 説明 |
|--------|------|
| [architecture](.github/skills/architecture/SKILL.md) | 全体アーキテクチャ設計・コンポーネント選定 |
| [standard](.github/skills/standard/SKILL.md) | 共通基盤（認証・.env・アイコン生成・HTML メールテンプレート） |
| [dataverse](.github/skills/dataverse/SKILL.md) | テーブル設計・構築・セキュリティロール |
| [code-apps](.github/skills/code-apps/SKILL.md) | Code Apps 開発（UI 設計・CSP・メール送信含む） |
| [generative-page](.github/skills/generative-page/SKILL.md) | Generative Pages 開発・デバッグ・デプロイ |
| [model-driven-app](.github/skills/model-driven-app/SKILL.md) | モデル駆動型アプリ構築・公開 |
| [copilot-studio](.github/skills/copilot-studio/SKILL.md) | エージェント構築・トリガー・ニュース配信 |
| [power-automate](.github/skills/power-automate/SKILL.md) | クラウドフロー作成・デプロイ |
| [ai-builder](.github/skills/ai-builder/SKILL.md) | AI プロンプト作成・エージェントツール追加 |
| [spec-to-markdown](.github/skills/spec-to-markdown/SKILL.md) | 仕様書を markdown 化し、Power Platform 向け factsheet / document を生成 |

> この一覧で担当領域を選び、構成規約・詳細ガイドは [スキルカタログ](.github/skills/README.md) を参照してください。

---

## ライセンス

MIT License。詳細は [LICENSE](./LICENSE) を参照してください。

---

## フィードバック

- Issues: https://github.com/geekfujiwara/CodeAppsDevelopmentStandard/issues
- X: https://twitter.com/geekfujiwara
