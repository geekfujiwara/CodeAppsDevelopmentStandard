---
name: standard
description: "Power Platform 包括開発標準。共通認証（auth_helper.py）・.env パラメータ・ソリューション管理・アイコン生成・HTML メールテンプレートなど全スキル共通の基盤。"
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

全スキル共通の基盤。共通認証・ソリューション管理・アイコン生成・HTML メールテンプレートを提供する。

## サブリファレンス（必要に応じて参照）

| リファレンス | 内容 |
|---|---|
| [認証リファレンス](references/auth-patterns.md) | auth_helper.py の詳細実装・認証パターン |
| [アイコン作成](references/icon-creation.md) | Pillow による PNG/SVG アイコン生成・API 登録パターン |
| [HTML メールテンプレート](references/html-email-template.md) | HTML メールのデザインシステム・カラーパレット・基本原則 |
| [テンプレートコンポーネント](references/template-components.md) | HTML メールの各コンポーネント詳細 |

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
| `SOLUTION_NAME`    | ソリューション一意名           | 全フェーズ                 |
| `PUBLISHER_PREFIX` | テーブル・列のプレフィックス   | 全フェーズ                 |
| `PAC_AUTH_PROFILE` | PAC CLI の認証プロファイル名   | Phase 2 (Code Apps)        |
| `ADMIN_EMAIL`      | フロー通知先メール             | Phase 2.5 (Power Automate) |
| `BOT_ID`           | Copilot Studio Bot ID or URL   | Phase 3 (Copilot Studio)   |

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

#### 公開 API


認証パターンの詳細実装は [認証リファレンス](references/auth-patterns.md) を参照。

## 参照ドキュメント

- [開発標準](../../../docs/POWER_PLATFORM_DEVELOPMENT_STANDARD.md): 設計原則・Phase 別手順・トラブルシューティング
- [Dataverse ガイド](../../../docs/DATAVERSE_GUIDE.md): CRUD・Lookup・Choice・エラーハンドリング

## 関連スキル

| フェーズ                  | スキル                 | 内容                                             |
| ------------------------- | ---------------------- | ------------------------------------------------ |
| Phase 1: Dataverse 構築   | `dataverse`            | テーブル設計・作成・ローカライズ・デモデータ     |
| Phase 1.5: Security Role  | `security-role`        | カスタムセキュリティロール作成・権限設定         |
| Phase 2: Code Apps        | `code-apps`            | 初期化・デプロイ・Dataverse 接続                 |
| Phase 2: Code Apps UI     | `code-apps`            | CodeAppsStarter デザインシステム・コンポーネント |
| Phase 2: Model-Driven App | `model-driven-app`     | モデル駆動型アプリ作成・SiteMap・公開            |
| Phase 2.5: Power Automate | `power-automate`       | クラウドフロー作成・接続参照                     |
| Phase 3: Copilot Studio   | `copilot-studio`       | エージェント構築・生成オーケストレーション       |

## クイックリファレンス: 絶対遵守ルール

> **Dataverse テーブル構築ルール**（スキーマ設計・Lookup・ローカライズ・デモデータ等）は [`dataverse`](../dataverse/SKILL.md) スキルに移管済み。

| ルール                                                 | 理由                                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 先にデプロイしてから開発                               | Dataverse 接続確立が必要                                                                                                |
| 生成オーケストレーションモード一択                     | トピックベース開発は非推奨                                                                                              |
| Flow API は専用スコープで認証                          | Dataverse トークンの使い回し不可                                                                                        |
| 接続は環境内に事前作成                                 | API での接続自動作成は不可                                                                                              |
| フローはべき等パターンでデプロイ                       | displayName で検索 → 更新 or 新規作成                                                                                   |
| Bot 作成は Copilot Studio UI                           | API（bots INSERT）ではプロビジョニングされない                                                                          |
| Bot 作成後はプロビジョニング完了を待つ                 | UI でロード完了前にスクリプト実行→トピック削除 0 件になる                                                               |
| configuration はディープマージで PATCH                 | 丸ごと上書き→基盤モデル・gPTSettings が消える                                                                           |
| optInUseLatestModels は明示的に False                  | True だと基盤モデルが GPT に強制変更。既存 True も上書き                                                                |
| 推奨プロンプトは conversationStarters で登録           | GPT コンポーネント (type=15) YAML の title/text                                                                         |
| 挨拶メッセージはエージェントに合わせて設定             | ConversationStart トピック (type=9) の SendActivity.text                                                                |
| クイック返信は ConversationStart で登録                | ConversationStart トピック (type=9) の quickReplies                                                                     |
| トピック削除時はシステムトピックを保護                 | schemaname パターンで ConversationStart, Escalate 等を保護                                                              |
| チャネル公開は applicationmanifestinformation          | teams オブジェクトに shortDescription/longDescription 等                                                                |
| M365 Copilot は copilotChat.isEnabled                  | applicationmanifestinformation 内で true に設定                                                                         |
| 説明は publish 後に設定                                | data PATCH の非同期処理で上書きされる                                                                                   |
| appId は環境固有                                       | 別環境の appId → AppLeaseMissing (409)                                                                                  |
| Code Apps を環境で有効化                               | 未許可 → CodeAppOperationNotAllowedInEnvironment (403)                                                                  |
| dataSourcesInfo.ts は SDK コマンドで生成               | `npx power-apps add-data-source` で自動生成。手動作成禁止                                                               |
| **init スキャフォールドファイルは手動作成禁止**        | `npx power-apps init` が `power.config.json`, `plugins/plugin-power-apps.ts`, `vite.config.ts` 等を自動生成。コピー禁止 |
| PAC CLI 認証プロファイルを作成                         | 新環境では pac auth create が必須                                                                                       |
| get_token() は scope のみ指定                          | auth_helper は .env から自動読み込み                                                                                    |
| **全コンポーネントをソリューションに含める**           | AddSolutionComponent で検証・補完。ヘッダーだけに依存しない                                                             |
| **設計フェーズでユーザー承認必須**                     | テーブル設計を提示し承認を得てから構築に進む                                                                            |
| **nameUtils パッチは Node.js スクリプトで**            | PowerShell の $ エスケープで適用失敗する。`node patch-nameutils.cjs` を使う                                             |
| **SDK Lookup 名は未ポピュレート（初回から対応必須）**  | `createdbyname` 等は返らない。**初回デプロイから** `_xxx_value` + `useMemo` クライアントサイド名前解決を実装            |
| **フロー接続 ID はハードコードしない**                 | 環境が変わると接続 ID も変わる。毎回 PowerApps API で自動検索                                                           |
| **PowerApps API 接続検索はタイムアウトする**           | 504 GatewayTimeout 頻発。3回リトライ＋フォールバック接続 ID パターンで対策                                              |
| **AI Builder アクションは API でフロー定義に含めない** | PerformBoundAction → InvalidOpenApiFlow で有効化失敗。Power Automate UI で手動追加                                      |
| **api_get() は dict を返す**                           | `.json()` を呼ぶとエラー。戻り値の dict をそのまま使う                                                                  |
| **api_get() はパス文字列のみ受付**                     | `api_get("url", {"$filter": ...})` は不可。クエリパラメータは URL に直接埋め込む: `api_get("url?$filter=...")`           |
| **PowerShell インラインで `$select` 等を使わない**      | PowerShell が `$select` を変数展開しパラメータ名が消失（`?=3&=...` になる）。Python スクリプトファイルで実行すること          |
| **Dataverse API 429 レート制限にはリトライ＋再実行**    | `PublishAllXml` や `EntityDefinitions` PUT で 429 が頻発。時間を置いてスクリプト再実行で回復。べき等設計が必須              |
| **ConversationStart/GPT YAML は手動構築**              | `yaml.dump()` は PVA パーサーと非互換。会話の開始・クイック返信・推奨プロンプトが消える                                 |
| **bots PATCH には name フィールド必須**                | 省略すると `Empty or null bot name` エラー (0x80040265)。既存名を GET して再送                                          |
| **アイコンは [アイコン作成リファレンス](references/icon-creation.md) に従い API 登録**   | エージェント=PNG 3サイズ、テーブル=SVG WebResource。詳細は `references/icon-creation.md`                      |
| **基盤モデルは API で設定できない**                    | `aISettings` PATCH で `optInUseLatestModels: False` にしても基盤モデルが GPT に戻るケースあり。UI で手動選択            |
| **`npx power-apps push` テナント不一致問題**           | 環境 ID からテナント解決に失敗し `ServiceToServiceEnvironmentNotFound` (404) を返す場合がある。**`pac code push -env {ENVIRONMENT_ID} -s {SOLUTION_NAME}` を使う** |
| **`npx power-apps add-data-source` テナント不一致**    | 同様にテナント不一致で org-url プロンプトが出る。**`--org-url {DATAVERSE_URL}` を明示指定**するか、対話プロンプトで入力する |
| **メール返信は Work IQ Mail MCP を使う**               | 「メールに返信する (V3)」コネクタは Attachments 属性でスタックする。Work IQ Mail MCP（`mcp_MailTools`）を使うこと       |
| **メールトリガー時は質問禁止**                         | メールから起動時にユーザーに質問するとチャット返信できずスタック。Instructions に判定ロジックと即処理ルールが必須       |
| **ExecuteCopilot プロンプトは構造化**                  | `triggerBody()` の丸投げは不十分。メッセージID・差出人・件名・本文を個別に渡し、ツール名を明示する                      |
| **セキュリティロールは Basic User コピーから開始**     | ゼロから作成すると約480の標準権限が欠落しアプリが動かない。RetrieveRolePrivilegesRole で取得して土台にする              |
| **マスタテーブルの読み取り専用ロールにも AppendTo**    | Lookup 先テーブルに AppendTo がないとレコード作成時にエラー。Read + AppendTo: Global が最低限必要                       |
