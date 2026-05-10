# Power Platform Skills カタログ

Power Platform コードファースト開発で使用するスキル群。
Anthropic「The Complete Guide to Building Skills for Claude」の Planning and Design チャプターに基づき構成。

## スキル構成規約

### フォルダ構成（Progressive Disclosure モデル）

各スキルは以下の 3 層構造に従う:

```
skill-name/
  SKILL.md              # Level 1-2: フロントマター（常時読込）+ 本体（トリガー時読込）
  scripts/              # Level 3: デプロイ・ユーティリティスクリプト（オンデマンド読込）
    deploy_xxx.py
    check_xxx.py
  references/           # Level 3: 補足ドキュメント（オンデマンド読込）
    build-reference.md
    troubleshooting.md
```

### 統合方針

関連するスキルは **製品単位** で 1 つのスキルに統合する。
統合前に独立スキルだった内容は `references/` に配置し、メインの `SKILL.md` からリンクする。

```
例: code-apps/
  SKILL.md                          # 開発・デプロイの本体（旧 code-apps-dev）
  references/
    design-system.md                # UI 設計パターン（旧 code-apps-design）
    csp.md                          # CSP 構成（旧 code-apps-csp）
    mail-pdf.md                     # PDF メール送信（旧 code-apps-mail）
    component-catalog.md            # コンポーネントカタログ
    japan-map-pattern.md            # 日本地図パターン
    build-reference.md              # ビルドリファレンス
  scripts/
    add_app_to_solution.py
```

### YAML フロントマター規約

```yaml
---
name: skill-name              # kebab-case 識別子（必須）
description: "短い説明文"      # スキルの目的を簡潔に（必須）。トリガーキーワードは含めない
category: カテゴリ名           # 分類タグ（必須）: architecture / data / ui / automation / ai
argument-hint: "引数の説明"    # ユーザー入力を受け付ける場合のみ（任意）
user-invocable: true           # ユーザーが直接呼び出せる場合のみ（任意）
triggers:                      # スキル発動条件キーワード（必須）
  - "キーワード1"
  - "キーワード2"
---
```

### 命名規則

| 対象 | 規則 | 例 |
|------|------|-----|
| スキルディレクトリ名 | kebab-case | `copilot-studio` |
| YAML `name` フィールド | kebab-case（ディレクトリ名と一致） | `copilot-studio` |
| Python スクリプト | snake_case | `deploy_agent.py` |
| リファレンスドキュメント | kebab-case | `build-reference.md` |
| カテゴリ名 | 英小文字 | `architecture`, `data`, `ui`, `automation`, `ai` |

---

## スキル一覧（9 スキル）

### architecture — アーキテクチャ・基盤

| スキル | 説明 |
|--------|------|
| [architecture](architecture/SKILL.md) | Power Platform 全体の構成方針を設計し、最適なコンポーネント構成を決定する。 |
| [standard](standard/SKILL.md) | 共通認証・環境変数・ソリューション運用など、全スキル共通の開発基盤を提供する。 |

### data — データ層

| スキル | 説明 |
|--------|------|
| [dataverse](dataverse/SKILL.md) | Dataverse のテーブル設計・構築・デモデータ投入・権限設定を一括で実施する。 |

### ui — UI / フロントエンド

| スキル | 説明 |
|--------|------|
| [code-apps](code-apps/SKILL.md) | Code Apps を TypeScript/React ベースで開発し、UI 設計からデプロイまで対応する。 |
| [generative-page](generative-page/SKILL.md) | Generative Pages（genux）を開発・デバッグし、モデル駆動型アプリへデプロイする。 |
| [model-driven-app](model-driven-app/SKILL.md) | モデル駆動型アプリを作成・構成し、公開まで実行する。 |

### automation — 自動化

| スキル | 説明 |
|--------|------|
| [copilot-studio](copilot-studio/SKILL.md) | Copilot Studio エージェントを生成オーケストレーション前提で構築・運用する。 |
| [power-automate](power-automate/SKILL.md) | Power Automate クラウドフローをソリューション対応で作成・デプロイする。 |

### ai — AI / プロンプト

| スキル | 説明 |
|--------|------|
| [ai-builder](ai-builder/SKILL.md) | AI Builder の AI プロンプトを作成し、エージェントのツールとして組み込む。 |

---

## 推奨開発フロー

```
1. architecture       → 全体設計・コンポーネント選定
2. standard           → 共通基盤の確認（.env・認証）
3. dataverse          → テーブル設計・構築・セキュリティロール設定
4. code-apps          → Code Apps UI 設計・開発・デプロイ
   OR generative-page → Generative Pages 開発
   OR model-driven-app → モデル駆動型アプリ構築
5. power-automate     → フロー作成
6. copilot-studio     → エージェント構築・トリガー追加
7. ai-builder         → AI プロンプト追加
```
