# Power Platform コードファースト開発標準

Power Apps Code Apps・Dataverse・Power Automate・Copilot Studio を **VS Code + GitHub Copilot** で開発するための、実践的な開発標準リポジトリです。

[![VS Code で開く](https://img.shields.io/badge/VS%20Code%E3%81%A7%E9%96%8B%E3%81%8F-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://vscode.dev/github/geekfujiwara/CodeAppsDevelopmentStandard)
[![GitHub Copilot](https://img.shields.io/badge/GitHub%20Copilot-対応-blueviolet?style=for-the-badge&logo=github)](https://github.com/features/copilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](./LICENSE)

---

## このリポジトリで提供するもの

- Power Platform 向けコードファースト開発標準（`docs/`）
- GitHub Copilot 用のカスタムエージェント / スキル（`.github/`）
- Code Apps のスターター UI コンポーネント（`src/components/`）
- Power Automate / Copilot Studio 連携の実装パターン
- `.env.example` を含むプロジェクト初期化テンプレート

> [!TIP]
> サンプル実装はあくまでリファレンスです。業務要件に合わせて `src/pages/` やスキル内スクリプトを置き換えて利用してください。

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
│   └── skills/                      # 各開発フェーズ向けスキル
├── docs/                            # 開発標準ドキュメント
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

- [docs/POWER_PLATFORM_DEVELOPMENT_STANDARD.md](./docs/POWER_PLATFORM_DEVELOPMENT_STANDARD.md)
- [docs/DATAVERSE_GUIDE.md](./docs/DATAVERSE_GUIDE.md)
- [docs/CONNECTOR_REFERENCE.md](./docs/CONNECTOR_REFERENCE.md)
- [docs/ADVANCED_PATTERNS.md](./docs/ADVANCED_PATTERNS.md)
- [SAMPLES.md](./SAMPLES.md)

---

## GitHub Copilot 活用

- VS Code で開くと `.github/agents/` と `.github/skills/` が認識されます
- `@GeekPowerCode` に実現したい内容を伝えるだけで、必要なスキルが選択されて開発タスクを進められます
- このリポジトリの開発標準はスキルとして定義済みのため、マニュアル手順ベースではなくエージェント駆動で利用します

---

## ライセンス

MIT License。詳細は [LICENSE](./LICENSE) を参照してください。

---

## フィードバック

- Issues: https://github.com/geekfujiwara/CodeAppsDevelopmentStandard/issues
- X: https://twitter.com/geekfujiwara
