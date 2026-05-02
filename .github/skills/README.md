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

| スキル | 説明 | 統合元 |
|--------|------|--------|
| [architecture](architecture/SKILL.md) | 全体アーキテクチャ設計。コンポーネント選定・統合パターン | 旧 `architecture-design` |
| [standard](standard/SKILL.md) | 全スキル共通基盤。共通認証・.env・ソリューション管理・アイコン生成・HTML メールテンプレート | 旧 `power-platform-standard` + `icon-creation` + `html-email-template` |

### data — データ層

| スキル | 説明 | 統合元 |
|--------|------|--------|
| [dataverse](dataverse/SKILL.md) | Dataverse テーブル設計・構築・デモデータ投入・セキュリティロール | 旧 `dataverse-setup` + `security-role` |

### ui — UI / フロントエンド

| スキル | 説明 | 統合元 |
|--------|------|--------|
| [code-apps](code-apps/SKILL.md) | Code Apps 開発・UI 設計・CSP 構成・メール送信（フル機能） | 旧 `code-apps-dev` + `code-apps-design` + `code-apps-csp` + `code-apps-mail` |
| [generative-page](generative-page/SKILL.md) | Generative Pages 開発・デバッグ・デプロイ | 旧 `generative-page-dev` |
| [model-driven-app](model-driven-app/SKILL.md) | モデル駆動型アプリ構築・公開 | 変更なし |

### automation — 自動化

| スキル | 説明 | 統合元 |
|--------|------|--------|
| [copilot-studio](copilot-studio/SKILL.md) | Copilot Studio エージェント構築・外部トリガー・ニュース配信（生成オーケストレーション） | 旧 `copilot-studio-agent` + `copilot-studio-trigger` + `market-research-report` |
| [power-automate](power-automate/SKILL.md) | Power Automate クラウドフロー作成・デプロイ | 旧 `power-automate-flow` |

### ai — AI / プロンプト

| スキル | 説明 | 統合元 |
|--------|------|--------|
| [ai-builder](ai-builder/SKILL.md) | AI Builder AI プロンプト作成・エージェントツール追加 | 旧 `ai-builder-prompt` |

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

---

## 統合履歴

17 スキル → 9 スキルに統合（製品単位での統合）:

| 旧スキル | 統合先 | 配置場所 |
|----------|--------|----------|
| `architecture-design` | `architecture` | SKILL.md |
| `power-platform-standard` | `standard` | SKILL.md |
| `icon-creation` | `standard` | references/icon-creation.md |
| `html-email-template` | `standard` | references/html-email-template.md |
| `dataverse-setup` | `dataverse` | SKILL.md |
| `security-role` | `dataverse` | references/security-role.md |
| `code-apps-dev` | `code-apps` | SKILL.md |
| `code-apps-design` | `code-apps` | references/design-system.md |
| `code-apps-csp` | `code-apps` | references/csp.md |
| `code-apps-mail` | `code-apps` | references/mail-pdf.md |
| `generative-page-dev` | `generative-page` | SKILL.md |
| `model-driven-app` | `model-driven-app` | 変更なし |
| `copilot-studio-agent` | `copilot-studio` | SKILL.md |
| `copilot-studio-trigger` | `copilot-studio` | references/trigger.md |
| `market-research-report` | `copilot-studio` | references/market-research-report.md |
| `power-automate-flow` | `power-automate` | SKILL.md |
| `ai-builder-prompt` | `ai-builder` | SKILL.md |
