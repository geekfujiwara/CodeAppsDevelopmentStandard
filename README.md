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
- [推奨開発フロー](#推奨開発フロー)
- [主な設計原則](#主な設計原則)
- [リポジトリ構成](#リポジトリ構成)
- [主要ドキュメント](#主要ドキュメント)
- [GitHub Copilot 活用](#github-copilot-活用)
- [既知の注意点](#既知の注意点)
- [ライセンス](#ライセンス)

---

## クイックスタート

```bash
git clone https://github.com/geekfujiwara/CodeAppsDevelopmentStandard.git
cd CodeAppsDevelopmentStandard
npm install
cp .env.example .env
```

### 開発コマンド

```bash
npm run dev     # ローカル開発
npm run lint    # ESLint
npm run build   # TypeScript + Vite ビルド
npm run preview # ビルド成果物確認
```

### Power Platform 接続の基本手順

```bash
# 1) 初回はビルドしてアプリをデプロイ
npm run build
npx power-apps push --solution-id {SolutionName}

# 2) Dataverse データソースを追加
pac code add-data-source -a dataverse -t {table_logical_name}
```

> [!IMPORTANT]
> `pac code add-data-source` は英語スキーマ名前提です。テーブル名・列名は英語で定義してください。

---

## 推奨開発フロー

1. **設計**: テーブル定義・命名・ロール・連携方式を確定
2. **Dataverse 構築**: ソリューション作成、テーブル・列・リレーション作成
3. **Code Apps 実装**: 画面・データ取得・更新処理を実装
4. **Power Automate（任意）**: 通知/バックグラウンド処理を追加
5. **Copilot Studio（任意）**: エージェント作成、ナレッジ/ツール連携

---

## 主な設計原則

- スキーマ名は英語のみ（日本語スキーマは CLI 連携で問題になりやすい）
- User 参照は `systemuser` を優先
- 作成者情報は `createdby` を優先活用
- Choice 値は `100000000` から採番
- 「先にデプロイ、後から開発」の順で接続確立
- Dataverse メタデータ操作はリトライ設計を推奨

詳細は `docs/POWER_PLATFORM_DEVELOPMENT_STANDARD.md` を参照してください。

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
- `@GeekPowerCode` を使うと、Power Platform 開発タスクを会話ベースで進められます
- 開発標準を参照させたい場合は `/power-platform-standard` を利用します

---

## 既知の注意点

- `src/generated/` は Dataverse 接続追加時に自動生成されます（通常は Git 管理対象外）
- サンプルページはプロジェクト要件に合わせて差し替える前提です
- Power Automate の接続は環境側で事前作成が必要です
- Copilot Studio の一部設定（ナレッジ追加など）は UI での手動設定が必要です

---

## ライセンス

MIT License。詳細は [LICENSE](./LICENSE) を参照してください。

---

## フィードバック

- Issues: https://github.com/geekfujiwara/CodeAppsDevelopmentStandard/issues
- X: https://twitter.com/geekfujiwara
