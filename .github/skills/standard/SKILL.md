---
name: standard
description: "Power Platform 包括開発標準。共通認証（auth_helper.py）・.env パラメータ・ソリューション運用など全スキル共通の開発基盤を提供する。アイコン生成・HTML メールは横断参照用の共有ユーティリティとして保持。"
category: architecture
triggers:
  - "Power Platform 開発"
  - "Code Apps"
  - "Power Automate"
  - "フロー作成"
  - "Copilot Studio"
  - "エージェント開発"
  - "ソリューション"
  - "デプロイ"
  - "トラブルシューティング"
  - "生成オーケストレーション"
  - "アイコン作成"
  - "アイコン生成"
  - "icon"
  - "PNG"
  - "SVG"
  - "Pillow"
  - "iconbase64"
  - "WebResource"
  - "テーブルアイコン"
  - "エージェントアイコン"
  - "アプリアイコン"
  - "HTML メール"
  - "メールテンプレート"
  - "HTMLメールデザイン"
  - "リッチメール"
  - "メール通知"
  - "ニュースレター"
  - "レポートメール"
  - "メールフォーマット"
---

# Power Platform 包括開発標準スキル

全スキル共通の開発基盤。このスキルが扱うのは **認証 / .env / ソリューション運用** の 3 テーマのみ。
個別コンポーネントの設計・構築ルールは各専門スキルが持つ（→ [スキルカタログ README](https://github.com/geekfujiwara/CodeAppsDevelopmentStandard/blob/main/.github/skills/README.md)）。

## サブリファレンス（必要に応じて参照）

| リファレンス | 内容 |
|---|---|
| [Power Platform 開発標準](references/power-platform-development-standard.md) | 設計原則・Phase 別手順・チェックリストをまとめた全体ガイド |
| [認証リファレンス](references/auth-patterns.md) | auth_helper.py の詳細実装・認証パターン |
| [.env サンプル](references/.env.example) | 全フェーズ共通の `.env` テンプレート（各テーマで `.env` にコピーして値を設定） |

### 共有ユーティリティ（複数スキルから参照される横断リファレンス）

以下は単一の専門スキルに属さず複数スキルから参照されるため、共通基盤である standard/references に置いている。各スキルの SKILL.md からリンク済み。

| リファレンス | 主な参照元スキル |
|---|---|
| [アイコン作成](references/icon-creation.md) | dataverse / copilot-studio / model-driven-app / generative-page |
| [HTML メールテンプレート](references/html-email-template.md)・[テンプレートコンポーネント](references/template-components.md) | power-automate / copilot-studio |

## 大前提: 一つのソリューション内に開発

Dataverse テーブル・Code Apps・Power Automate フロー・Copilot Studio エージェントは **すべて同一のソリューション内** に含める。
`.env` の `SOLUTION_NAME` と `PUBLISHER_PREFIX` を全フェーズで統一して使用する。

## 共通基盤: .env と認証

すべてのデプロイスクリプトは以下の **共通パラメータ** と **共通認証** を使用する。
各スキルから個別に認証を設定する必要はない。

### .env 共通パラメータ

環境情報は **Power Apps ポータル > 設定（右上の⚙）> セッション詳細** から取得する。

```env
# === 必須（全フェーズ共通）===
DATAVERSE_URL=https://{org}.crm7.dynamics.com/   # セッション詳細: Instance URL
TENANT_ID={your-tenant-id}                       # セッション詳細: Tenant ID
SOLUTION_NAME={YourSolutionName}
PUBLISHER_PREFIX={prefix}

# === オプション ===
PAC_AUTH_PROFILE={YourProfileName}         # PAC CLI 認証プロファイル名
ADMIN_EMAIL=admin@example.com              # Power Automate 通知先
BOT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  # Copilot Studio Bot ID（URL でも可）
```

> **セッション詳細の Environment ID** は `pac auth create --environment {env-id}` でも使用する。

| パラメータ         | 用途                           | 使用フェーズ               |
| ------------------ | ------------------------------ | -------------------------- |
| `DATAVERSE_URL`    | Dataverse Web API のベース URL | 全フェーズ                 |
| `TENANT_ID`        | Azure AD テナント ID           | 全フェーズ                 |
| `ENV_ID`           | Power Platform 環境 ID         | 全フェーズ                           |
| `SOLUTION_NAME`    | ソリューション一意名           | 全フェーズ                 |
| `PUBLISHER_PREFIX` | テーブル・列のプレフィックス   | 全フェーズ                 |
| `PAC_AUTH_PROFILE` | PAC CLI の認証プロファイル名   | Phase 6 (Code Apps)        |
| `ADMIN_EMAIL`      | フロー通知先メール             | Phase 5 (Power Automate)   |
| `BOT_ID`           | Copilot Studio Bot ID or URL   | Phase 7 (Copilot Studio)   |

### 共通認証: auth_helper.py

`./auth_helper.py` が全デプロイスクリプトの認証を一元管理する。
**ユーザーに何度もデバイスコード認証を求めない** 2 層キャッシュ構成。

```
層1: AuthenticationRecord (.auth_record.json)
  - アカウント情報（テナント・ユーザー ID）を保存
  - プロジェクトルートに .auth_record.json として永続化

層2: TokenCachePersistenceOptions (MSAL OS 資格情報ストア)
  - リフレッシュトークン・アクセストークンを永続化
  - サイレントリフレッシュでデバイスコード不要

初回: DeviceCodeCredential → ブラウザで認証 → キャッシュ保存
2回目以降: キャッシュから自動取得（認証プロンプトなし）
```

認証の公開 API・パターンの詳細実装は [認証リファレンス](references/auth-patterns.md) を参照。

## 設計・要件ヒアリングは architecture スキルへ

要件ヒアリング → コンポーネント選定 → 全体アーキテクチャ設計は **`architecture` スキル** が担当する。
Phase 1（設計）の最初に必ず `architecture` を参照し、IT に詳しくないユーザーから業務課題を引き出して設計提案・承認を得てから、各専門スキルでの構築に進む。

→ 詳細: [`architecture`](../architecture/SKILL.md) スキル

## 関連スキルと推奨開発フロー

各スキルの説明・カテゴリ・推奨開発フローは **スキルカタログ** に一元化している（standard には重複記載しない）。

→ [Power Platform Skills カタログ（README）](https://github.com/geekfujiwara/CodeAppsDevelopmentStandard/blob/main/.github/skills/README.md)

## クイックリファレンス: standard が扱うテーマ

このスキルが扱うのは以下の **共通基盤テーマのみ**。

| テーマ | 内容 |
|---|---|
| 共通認証 | `auth_helper.py` による 2 層キャッシュ認証（デバイスコードを繰り返さない）。詳細は [認証リファレンス](references/auth-patterns.md) |
| `.env` パラメータ | 全フェーズ共通の環境変数（`DATAVERSE_URL` / `TENANT_ID` / `SOLUTION_NAME` / `PUBLISHER_PREFIX` 等）の一元管理 |
| ソリューション運用 | 全コンポーネントを同一ソリューションに含める。`SOLUTION_NAME` / `PUBLISHER_PREFIX` を全フェーズで統一 |

> **個別の構築ルール・トラブルシューティング**（Copilot Studio・Code Apps・Power Automate・Dataverse・Security Role・AI Builder・Model-Driven App 等）は **各専門スキルの SKILL.md / references** に記載している。standard には重複して持たない。
> どのスキルに何があるかは [スキルカタログ README](https://github.com/geekfujiwara/CodeAppsDevelopmentStandard/blob/main/.github/skills/README.md) を参照。

