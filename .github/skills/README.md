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

### YAML フロントマター規約

```yaml
---
name: skill-name              # kebab-case 識別子（必須）
description: "短い説明文"      # スキルの目的を簡潔に（必須）。トリガーキーワードは含めない
category: カテゴリ名           # 分類タグ（必須）: architecture / data / ui / automation / ai / shared
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
| スキルディレクトリ名 | kebab-case | `copilot-studio-agent` |
| YAML `name` フィールド | kebab-case（ディレクトリ名と一致） | `copilot-studio-agent` |
| Python スクリプト | snake_case | `deploy_agent.py` |
| リファレンスドキュメント | kebab-case | `build-reference.md` |
| カテゴリ名 | 英小文字 | `architecture`, `data`, `ui`, `automation`, `ai`, `shared` |

---

## スキル一覧

### architecture — アーキテクチャ・基盤

| スキル | 説明 |
|--------|------|
| [power-platform-standard](power-platform-standard/SKILL.md) | 全スキル共通の基盤。共通認証（auth_helper.py）・.env・ソリューション管理 |
| [architecture-design](architecture-design/SKILL.md) | 全体アーキテクチャ設計。コンポーネント選定・統合パターン |

### data — データ層

| スキル | 説明 |
|--------|------|
| [dataverse-setup](dataverse-setup/SKILL.md) | Dataverse テーブル設計・構築・デモデータ投入 |
| [security-role](security-role/SKILL.md) | カスタムセキュリティロール作成・権限設定 |

### ui — UI / フロントエンド

| スキル | 説明 |
|--------|------|
| [code-apps-design](code-apps-design/SKILL.md) | Code Apps デザインシステム・コンポーネント選定 |
| [code-apps-dev](code-apps-dev/SKILL.md) | Code Apps 初期化・Dataverse 接続・開発・デプロイ |
| [generative-page-dev](generative-page-dev/SKILL.md) | Generative Pages 開発・デバッグ・デプロイ |
| [model-driven-app](model-driven-app/SKILL.md) | モデル駆動型アプリ構築・公開 |
| [html-email-template](html-email-template/SKILL.md) | HTML メールテンプレートデザインシステム |

### automation — 自動化

| スキル | 説明 |
|--------|------|
| [copilot-studio-agent](copilot-studio-agent/SKILL.md) | Copilot Studio エージェント構築（生成オーケストレーション） |
| [copilot-studio-trigger](copilot-studio-trigger/SKILL.md) | 外部トリガー（メール・Teams・スケジュール）でエージェント自動起動 |
| [power-automate-flow](power-automate-flow/SKILL.md) | Power Automate クラウドフロー作成・デプロイ |
| [market-research-report](market-research-report/SKILL.md) | ニュース収集・配信エージェント構築 |

### ai — AI / プロンプト

| スキル | 説明 |
|--------|------|
| [ai-builder-prompt](ai-builder-prompt/SKILL.md) | AI Builder AI プロンプト作成・エージェントツール追加 |

### shared — 共通ユーティリティ

| スキル | 説明 |
|--------|------|
| [icon-creation](icon-creation/SKILL.md) | Pillow による PNG/SVG アイコン生成・API 登録 |

---

## 推奨開発フロー

```
1. architecture-design      → 全体設計・コンポーネント選定
2. power-platform-standard  → 共通基盤の確認（.env・認証）
3. dataverse-setup          → テーブル設計・構築
4. security-role            → セキュリティロール設定
5. code-apps-design/dev     → Code Apps UI 設計・開発
   OR generative-page-dev   → Generative Pages 開発
   OR model-driven-app      → モデル駆動型アプリ構築
6. power-automate-flow      → フロー作成
7. copilot-studio-agent     → エージェント構築
8. copilot-studio-trigger   → トリガー追加
9. ai-builder-prompt        → AI プロンプト追加
10. icon-creation           → アイコン生成（各フェーズで必要時に参照）
```
