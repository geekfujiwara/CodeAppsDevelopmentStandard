# Power Platform コードファースト開発標準

Power Apps Code Apps・Dataverse・Power Automate・Copilot Studio を **VS Code + GitHub Copilot** で開発するための、実践的な開発標準リポジトリです。

[![VS Code で開く](https://img.shields.io/badge/VS%20Code%E3%81%A7%E9%96%8B%E3%81%8F-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://vscode.dev/github/geekfujiwara/CodeAppsDevelopmentStandard)
[![GitHub Copilot](https://img.shields.io/badge/GitHub%20Copilot-対応-blueviolet?style=for-the-badge&logo=github)](https://github.com/features/copilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](./LICENSE)

---

## このリポジトリで提供するもの

- Power Platform 向けコードファースト開発標準（`.github/skills/standard/references/`）
- GitHub Copilot 用のカスタムエージェント / スキル（`.github/`）
- Code Apps のスターター UI コンポーネント（`.github/skills/code-apps/template/src/components/`）
- Power Automate / Copilot Studio 連携の実装パターン
- `.env.example` を含むプロジェクト初期化テンプレート（`.github/skills/code-apps/template/`）

> [!TIP]
> サンプル実装はあくまでリファレンスです。業務要件に合わせてテンプレート内の `src/pages/` やスキル内スクリプトを置き換えて利用してください。

---

## 目次

- [クイックスタート](#クイックスタート)
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

セットアップ後は、GitHub Copilot のカスタムエージェントに「実現したいこと」をそのまま伝えて開発を進めます。

---

## カスタムエージェント前提の利用方法

- この開発標準の実装・運用ルールは、GitHub Copilot カスタムエージェントのスキル（`.github/skills/`）に定義されています。
- 利用者は手順書を読み込んで操作するのではなく、カスタムエージェントに要件を伝えて進める前提です。
- チャット入力例 （バッククオート不要）: @GeekPowerCode 在庫管理アプリを Dataverse + Code Apps で作りたい

---

## リポジトリ構成

```text
.
├── .github/
│   ├── agents/                      # Copilot カスタムエージェント定義
│   └── skills/                      # 製品単位で統合された 9 スキル
│       ├── architecture/            # アーキテクチャ設計
│       ├── standard/                # 共通基盤（認証・アイコン・メールテンプレート）
│       │   └── references/
│       │       ├── power-platform-development-standard.md  # 開発標準
│       │       └── samples.md       # サンプル実装ガイド
│       ├── dataverse/               # テーブル設計・構築・セキュリティロール
│       │   └── references/
│       │       └── dataverse-guide.md  # Dataverse 統合ガイド
│       ├── code-apps/               # Code Apps 開発（UI 設計・CSP・メール送信含む）
│       │   ├── references/
│       │   │   ├── advanced-patterns.md     # 高度な実装パターン
│       │   │   └── connector-reference.md   # コネクタ設定リファレンス
│       │   └── template/            # Code Apps スターターテンプレート
│       │       ├── src/             # React ソース（components, providers, lib, pages）
│       │       ├── plugins/         # Power Apps Vite プラグイン
│       │       ├── styles/          # Tailwind スタイル
│       │       ├── public/          # 静的アセット
│       │       ├── package.json     # 依存関係
│       │       ├── vite.config.ts   # Vite 設定
│       │       └── .env.example     # 環境変数テンプレート
│       ├── generative-page/         # Generative Pages 開発
│       ├── model-driven-app/        # モデル駆動型アプリ構築
│       ├── copilot-studio/          # エージェント構築・トリガー・ニュース配信
│       ├── power-automate/          # クラウドフロー作成・デプロイ
│       └── ai-builder/              # AI プロンプト作成
├── .gitignore
├── LICENSE
└── README.md
```

---

## 主要ドキュメント

- [開発標準](.github/skills/standard/references/power-platform-development-standard.md)
- [Dataverse 統合ガイド](.github/skills/dataverse/references/dataverse-guide.md)
- [コネクタ設定リファレンス](.github/skills/code-apps/references/connector-reference.md)
- [高度な実装パターン](.github/skills/code-apps/references/advanced-patterns.md)
- [サンプル実装ガイド](.github/skills/standard/references/samples.md)

---

## GitHub Copilot 活用

- VS Code で開くと `.github/agents/` と `.github/skills/` が認識されます
- `@GeekPowerCode` に実現したい内容を伝えるだけで、必要なスキルが選択されて開発タスクを進められます
- このリポジトリの開発標準はスキルとして定義済みのため、マニュアル手順ベースではなくエージェント駆動で利用します

### スキル一覧（9 スキル）

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

> 詳細は [スキルカタログ](.github/skills/README.md) を参照してください。

---

## ライセンス

MIT License。詳細は [LICENSE](./LICENSE) を参照してください。

---

## フィードバック

- Issues: https://github.com/geekfujiwara/CodeAppsDevelopmentStandard/issues
- X: https://twitter.com/geekfujiwara
