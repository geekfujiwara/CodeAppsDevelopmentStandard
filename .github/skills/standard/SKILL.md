---
name: standard
description: "Power Platform 共通開発基盤。クイックスタートは標準配置・環境情報取得・共通認証と .env・仕様整理から、AI 改善と Mermaid 図を含む architecture 提案まで一気通貫で進める。通常開発は Dataverse を既定とし、環境診断は明示依頼時・障害時だけ。共通認証（auth_helper.py）・ソリューション運用と横断ユーティリティを提供する。"
category: architecture
triggers:
  - "Power Platform 開発"
  - "クイックスタート"
  - "quickstart"
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

## クイックスタートは配置から提案まで継続する

リポジトリ URL と「クイックスタート」を依頼されたら [quickstart.md](references/quickstart.md) を優先する。
`.github/agents` / `.github/skills` / `.gitignore` を安全に配置しただけでは停止せず、
利用可能な環境情報取得 → 共通認証・`.env` → ローカル資料の `spec-builder`
（資料なしならフォルダー名からアプリ案を提案して AskUserQuestion）→ `architecture` まで継続する。
白紙の業務ヒアリングではなく、事実・仮説を分けた業務改善と AI 活用の推奨を先に示す。
業務フローと構成の Mermaid 図をチャットと Markdown の両方へ出し、必要な意思決定だけを質問する。
環境スキャンは接続先等のメタデータ取得であり、DLP / ACP・Code Apps 許可の事前診断とは分ける。
共通認証・承認・既存ファイル保護は省略せず、サインインや回答待ちの後は同じタスクを再開する。

## サブリファレンス（必要に応じて参照）

| リファレンス | 内容 |
|---|---|
| [一気通貫クイックスタート](references/quickstart.md) | 標準配置、環境情報・認証、資料探索、仕様整理、AI 改善と Mermaid 図を含む architecture 提案まで実行する。配置は `scripts/initialize_workspace.py` |
| [クイックスタートの異常系](references/troubleshooting.md) | 配置の競合・権限不足・資料なしの場合の継続方法と恒久対策 |
| [Power Platform 開発標準](references/power-platform-development-standard.md) | 設計原則・Phase 別手順・チェックリストをまとめた全体ガイド |
| [インタラクティブ環境セットアップ](references/interactive-setup.md) | PAC CLI + Dataverse API で `.env` を対話的に構成する手順（**プロジェクト開始時に最初に参照**） |
| [認証リファレンス](references/auth-patterns.md) | auth_helper.py の詳細実装・認証パターン（Dataverse / Flow / **ARM・Azure SQL・Graph・自前 API** のスコープ一覧を含む） |
| [.env サンプル](references/.env.example) | 全フェーズ共通の `.env` テンプレート（各テーマで `.env` にコピーして値を設定） |
| [コネクタ ID カタログ](references/connector-catalog.json) | コネクタの通称（SharePoint / Outlook / SQL 等）→ `shared_xxx` の対応表。`scripts/connector_catalog.py` で解決する |
| [環境チェック・障害復旧](../admin/SKILL.md) | 明示的なチェック依頼時、または開発・デプロイ障害時だけ使用する。通常開発の事前ゲートにしない |
| [Dataverse MCP 登録](references/dataverse-mcp-setup.md) | VS Code / Copilot から Dataverse を直接操作する MCP サーバー登録手順（upsert_skill 等） |
| [ブラウザ自動化方針](references/browser-automation.md) | ブラウザ起動前に **AskUserQuestion で Edge プロファイルを確認**し、回答前は操作しない。ポータル操作は **VS Code 統合 Playwright ブラウザ**（`playwright-browser_navigate` / `playwright-browser_click` / `playwright-browser_type` / `playwright-browser_handle_dialog` 等）を使う。Playwright MCP サーバー・Playwright 単体ブラウザのインストール・起動は禁止 |

### 共有ユーティリティ（複数スキルから参照される横断リファレンス）

以下は単一の専門スキルに属さず複数スキルから参照されるため、共通基盤である standard/references に置いている。各スキルの SKILL.md からリンク済み。

| リファレンス | 主な参照元スキル |
|---|---|
| [アイコン作成](references/icon-creation.md) | dataverse / copilot-studio / model-driven-app / generative-page |
| [HTML メールテンプレート](references/html-email-template.md)・[テンプレートコンポーネント](references/template-components.md) | power-automate / copilot-studio |
| [デザイン言語（トークン/配色/UXパターン選定）](references/design-language.md) | code-apps / power-pages / azure |
| [デモ用 PDF 生成（reportlab / 日本語 CID フォント）](references/demo-pdf-generation.md) | dataverse / code-apps / mcp-server |
| [地図埋め込み（Google Maps iframe・ホスト別 CSP）](references/map-embed-pattern.md) | generative-page / code-apps / power-pages |

## 大前提: 一つのソリューション内に開発

Dataverse テーブル・Code Apps・Power Automate フロー・Copilot Studio エージェントは **すべて同一のソリューション内** に含める。
`.env` の `SOLUTION_NAME` と `PUBLISHER_PREFIX` を全フェーズで統一して使用する。

## 既定の開発契約（全スキル共通）

- **SharePoint URL だけでは直接接続の指示と解釈しない。** Code Apps の業務データは **Dataverse に移行して利用**する。URL は既存仕様・移行元の参照情報であり、`shared_sharepointonline` を自動追加しない。SharePoint の継続利用・直接接続が明示された場合だけ例外とする。
- 移行は [dataverse](../dataverse/SKILL.md) でスキーマを構築し、[data-migration](../data-migration/SKILL.md) で取得済み CSV / JSON のマッピング・承認・投入・照合を行う。URL の受領だけをデータ読み取り・書き込み・削除・同期への承認としない。移行元の変更や削除は行わない。
- **環境チェックを明示的に依頼されない限り、すぐに開発を開始する。** DLP / ACP、Code Apps 許可、マネージド環境、MCP、管理者ロールの網羅確認を先行させず、管理 API が読めないことを開発停止理由にしない。
- 既知の対象環境・ソリューション・認証を再利用し、Code Apps は **scaffold → init → ローカル predeploy / build → 対象環境への初回 push** を優先する。初回 push はテーブル全件構築・データ移行・ローカライズの完了を待たない。未接続画面はその旨を表示し、データ接続後に改善デプロイする。
- 障害時だけ [admin の権限確認付き復旧](../admin/references/development-recovery.md) へ進む。原因に関係する委任権限・対象範囲を確認し、実行可能な診断・承認済み最小修復・限定リトライを行う。権限なし・不明なら無駄な管理操作をせず管理者へ依頼する。
- これは**事前の網羅的な環境診断を省く**契約であり、既知の組織ポリシー、デプロイ先の確認、設計・移行・公開・設定変更の承認、ローカル品質チェックは省略しない。

## 共通の事前確認契約（会話の最初に 1 回だけ）

依頼文・既存 `.env`・認証プロファイルから分かる事項は再質問せず使う。
**Code Apps では上の既定の開発契約を優先**し、ローカル開発に不要な管理者確認やライセンス棚卸の回答を待たない。
実操作に必要な実装先や承認範囲が不明な場合だけ、AskUserQuestion で不足事項を 1 問ずつ確認する。
以下は確認事項の分類であり、全項目の調査完了を一律の着手条件にしない。以降の Step で同じ内容を聞き直さない。

```text
既知の値を再利用し、実操作に必要な不足事項だけ確認する。
1. 対象テナント、Power Platform 環境、Azure サブスクリプションなどの実装先
2. 開発、テスト、本番のどこまで実施するかと、デプロイまたは公開の承認範囲
3. 必要な製品ライセンス、容量、プレビュー参加条件が満たされているか
4. 作成・変更・公開・管理者同意・ロール割り当てを行う担当者と最小権限
5. 対象ソリューション、パブリッシャー、命名、利用者または公開対象
6. 認証方式、接続、シークレットストア、データ分類と外部共有の可否
7. 検証担当者、受け入れ条件、ロールバックまたはクリーンアップ方針
```

各専門スキルは、この7分類から不要な項目を省き、必要な固有質問を加えた
「事前確認（会話の最初に 1 回だけ）」を持つ。最低限、次を守る。

- 製品ライセンスとプレビュー制度を別項目として扱う。
- 「管理者権限が必要」とだけ書かず、工程ごとの最小ロールまたは必要な具体的権限を示す。
- 開発者が全ロールを持つと仮定せず、ライセンス、公開、管理者同意、Azure RBAC の担当者を分けて記録する。
- `Global Administrator`、`Owner`、`System Administrator` は、より狭いロールで完了できない工程に限定する。
- デプロイや公開の前に対象・承認範囲・ローカル品質を確認する。既知の必須条件が未充足ならその操作を停止するが、管理 API による環境診断は明示依頼時・障害時だけとする。
- 検証チェックリストに、実際の対象環境・公開範囲・承認を確認したことを含める。製品固有の公開・プレビュー承認は各スキルに従う。

## 共通基盤: .env と認証

すべてのデプロイスクリプトは以下の **共通パラメータ** と **共通認証** を使用する。
各スキルから個別に認証を設定する必要はない。

### .env 共通パラメータ

**推奨: [インタラクティブセットアップ](references/interactive-setup.md)** で `pac` CLI から対話的に `.env` を構成する（PAC 認証 → 環境選択 → パブリッシャー/ソリューション選択を AskUserQuestion で進行）。

**PAC 認証プロファイルがない場合**（PAC CLI 未インストール・auth create 不可）は、**Power Apps ポータル > 設定（右上の⚙）> セッション詳細** から以下の値を取得して手動設定する（インタラクティブセットアップの Step 2 参照）。

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
**同一マシン上では、どのプロジェクトでもインタラクティブ認証は最初の1回だけ**で済む 2 層キャッシュ構成。

```
層1: AuthenticationRecord (~/.power-platform-cli/auth_record_{TENANT_ID}.json)
  - アカウント情報（テナント・ユーザー ID）を保存
  - ホームディレクトリ配下の固定パスに永続化（プロジェクトフォルダに依存しない）
  - そのため、別プロジェクトを新規に開いても再度ブラウザ認証を求められない

層2: TokenCachePersistenceOptions (MSAL OS 資格情報ストア)
  - リフレッシュトークン・アクセストークンを永続化（同一マシンで共有）
  - サイレントリフレッシュで再認証不要

初回（このマシンで最初の1回のみ）: InteractiveBrowserCredential → ブラウザで認証 → グローバルキャッシュに保存
2回目以降（別プロジェクトでも）: キャッシュから自動取得（認証プロンプトなし）
テナント/アカウント切替時のみ: ~/.power-platform-cli/auth_record.json を削除して再認証
```

PAC CLI プロファイルでトークンを取得できない場合は、ローカルブラウザでのインタラクティブ認証
（`InteractiveBrowserCredential`）を使用する。デバイスコード認証は行わず、初回の認証後はキャッシュから
サイレントにトークンを取得する。
初期セットアップで tenant/client ID ごとにインタラクティブ認証を 1 回行い、
`AuthenticationRecord` をホームディレクトリの JSON に保存する。トークン自体は JSON に含めず、
OS 資格情報ストアに保存する。以後のスキルは共通 `auth_helper.py` からキャッシュを再利用し、
個別の認証フローやプロジェクト内の認証 JSON を作らない。
Foundry 上で動作するエージェント本体の Managed Identity など、実行環境固有の資格情報はこのローカル開発者認証の共有対象外とする。

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
| インタラクティブセットアップ | PAC CLI + Dataverse API で `.env` を対話的に構成。環境選択・パブリッシャー/ソリューション選択を AskUserQuestion で進行。詳細は [インタラクティブ環境セットアップ](references/interactive-setup.md) |
| 共通認証 | `auth_helper.py` による 2 層キャッシュ付きインタラクティブ認証。詳細は [認証リファレンス](references/auth-patterns.md) |
| 環境チェック・障害復旧 | **明示依頼時または障害時だけ** `admin` を使用。通常は開発・初回デプロイを優先し、障害時は委任権限を確認して診断・最小修復・限定リトライ、権限不足なら管理者へ依頼する |
| コネクタ ID の解決 | コネクタ ID（`shared_xxx`）を対話プロンプトで聞かずに確定させる。`scripts/connector_catalog.py --resolve sharepoint` で `shared_sharepointonline` を得る。Code Apps のデータソース追加は [`add_data_source.py`](../code-apps/scripts/add_data_source.py) がこれを使って非対話で完走する |
| Azure リソース操作 | `scripts/azure_helper.py`（ARM / Graph / Azure SQL / 自前 API）。**`az login` 前提の手順は書かない** — 対話が必要でテナント列挙のハングやセッション失効により非対話完走が崩れるため |
| `.env` パラメータ | 全フェーズ共通の環境変数（`DATAVERSE_URL` / `TENANT_ID` / `SOLUTION_NAME` / `PUBLISHER_PREFIX` 等）の一元管理 |
| ソリューション運用 | 全コンポーネントを同一ソリューションに含める。`SOLUTION_NAME` / `PUBLISHER_PREFIX` を全フェーズで統一 |

> **個別の構築ルール・トラブルシューティング**（Copilot Studio・Code Apps・Power Automate・Dataverse・Security Role・AI Builder・Model-Driven App 等）は **各専門スキルの SKILL.md / references** に記載している。standard には重複して持たない。
> どのスキルに何があるかは [スキルカタログ README](https://github.com/geekfujiwara/CodeAppsDevelopmentStandard/blob/main/.github/skills/README.md) を参照。
