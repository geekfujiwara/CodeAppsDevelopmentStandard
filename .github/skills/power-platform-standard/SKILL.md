---
name: power-platform-standard
description: "Power Platform 包括開発標準を参照して開発する。Use when: Power Platform 開発, Dataverse テーブル作成, Code Apps, Power Automate, フロー作成, Copilot Studio, エージェント開発, ソリューション, デプロイ, トラブルシューティング, スキーマ設計, ローカライズ, SystemUser, createdby, 生成オーケストレーション"
---

# Power Platform 包括開発標準スキル

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
SOLUTION_NAME=IncidentManagement
PUBLISHER_PREFIX=geek

# === オプション ===
PAC_AUTH_PROFILE=IncidentManager           # PAC CLI 認証プロファイル名
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

`scripts/auth_helper.py` が全デプロイスクリプトの認証を一元管理する。
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

```python
from auth_helper import get_token, get_session, api_get, api_post, api_patch, api_delete, retry_metadata

# Dataverse Web API 用トークン（デフォルトスコープ）
token = get_token()

# Flow API 用トークン（スコープ指定）
token = get_token(scope="https://service.flow.microsoft.com/.default")

# PowerApps API 用トークン（接続検索用）
token = get_token(scope="https://service.powerapps.com/.default")

# Bearer ヘッダー付き Session
session = get_session()

# Dataverse CRUD ヘルパー
api_get("accounts?$top=1")
api_post("accounts", {"name": "Test"}, solution="SolutionName")
api_patch("accounts(id)", {"name": "Updated"})
api_delete("accounts(id)")

# メタデータ操作のリトライ（0x80040237, 0x80044363 対応）
retry_metadata(lambda: api_post("EntityDefinitions", body), "テーブル作成")

# Flow API ヘルパー
from auth_helper import flow_api_call
flow_api_call("GET", f"/providers/Microsoft.ProcessSimple/environments/{env_id}/flows")
```

#### 認証テスト

```bash
# 初回のみデバイスコード認証が走る。以降はサイレント。
python -c "from scripts.auth_helper import get_token; print(get_token()[:20] + '...')"
```

## 参照ドキュメント

- [開発標準](../../docs/POWER_PLATFORM_DEVELOPMENT_STANDARD.md): 設計原則・Phase 別手順・トラブルシューティング
- [Dataverse ガイド](../../docs/DATAVERSE_GUIDE.md): CRUD・Lookup・Choice・エラーハンドリング

## 関連スキル

| フェーズ                  | スキル                 | 内容                                             |
| ------------------------- | ---------------------- | ------------------------------------------------ |
| Phase 2: Code Apps        | `code-apps-dev`        | 初期化・デプロイ・Dataverse 接続                 |
| Phase 2: Code Apps UI     | `code-apps-design`     | CodeAppsStarter デザインシステム・コンポーネント |
| Phase 2.5: Power Automate | `power-automate-flow`  | クラウドフロー作成・接続参照                     |
| Phase 3: Copilot Studio   | `copilot-studio-agent` | エージェント構築・生成オーケストレーション       |

## クイックリファレンス: 絶対遵守ルール

| ルール                                                | 理由                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| スキーマ名は英語のみ                                  | `npx power-apps add-data-source` が日本語で失敗                                                              |
| SystemUser を Lookup 先に                             | カスタムユーザーテーブル不要                                                                                 |
| createdby を報告者として使用                          | カスタム ReportedBy Lookup 不要                                                                              |
| Choice 値は 100000000 始まり                          | Dataverse の仕様                                                                                             |
| 先にデプロイしてから開発                              | Dataverse 接続確立が必要                                                                                     |
| 生成オーケストレーションモード一択                    | トピックベース開発は非推奨                                                                                   |
| PUT + MetadataId でローカライズ                       | PATCH では反映されないケースあり                                                                             |
| テーブル作成はリトライ付き                            | 0x80040237 メタデータロック対策                                                                              |
| Flow API は専用スコープで認証                         | Dataverse トークンの使い回し不可                                                                             |
| 接続は環境内に事前作成                                | API での接続自動作成は不可                                                                                   |
| フローはべき等パターンでデプロイ                      | displayName で検索 → 更新 or 新規作成                                                                        |
| Bot 作成は Copilot Studio UI                          | API（bots INSERT）ではプロビジョニングされない                                                               |
| Bot 作成後はプロビジョニング完了を待つ                | UI でロード完了前にスクリプト実行→トピック削除 0 件になる                                                    |
| configuration はディープマージで PATCH                | 丸ごと上書き→基盤モデル・gPTSettings が消える                                                                |
| optInUseLatestModels は明示的に False                 | True だと基盤モデルが GPT に強制変更。既存 True も上書き                                                     |
| 推奨プロンプトは conversationStarters で登録          | GPT コンポーネント (type=15) YAML の title/text                                                              |
| 挨拶メッセージはエージェントに合わせて設定            | ConversationStart トピック (type=9) の SendActivity.text                                                     |
| クイック返信は ConversationStart で登録               | ConversationStart トピック (type=9) の quickReplies                                                          |
| トピック削除時はシステムトピックを保護                | schemaname パターンで ConversationStart, Escalate 等を保護                                                   |
| チャネル公開は applicationmanifestinformation         | teams オブジェクトに shortDescription/longDescription 等                                                     |
| M365 Copilot は copilotChat.isEnabled                 | applicationmanifestinformation 内で true に設定                                                              |
| 説明は publish 後に設定                               | data PATCH の非同期処理で上書きされる                                                                        |
| appId は環境固有                                      | 別環境の appId → AppLeaseMissing (409)                                                                       |
| Code Apps を環境で有効化                              | 未許可 → CodeAppOperationNotAllowedInEnvironment (403)                                                       |
| dataSourcesInfo.ts は SDK コマンドで生成              | `npx power-apps add-data-source` で自動生成。手動作成禁止                                                    |
| power.config.json は SDK で生成                       | `npx power-apps init` で生成。テンプレからコピー禁止                                                         |
| PAC CLI 認証プロファイルを作成                        | 新環境では pac auth create が必須                                                                            |
| get_token() は scope のみ指定                         | auth_helper は .env から自動読み込み                                                                         |
| **全コンポーネントをソリューションに含める**          | AddSolutionComponent で検証・補完。ヘッダーだけに依存しない                                                  |
| **設計フェーズでユーザー承認必須**                    | テーブル設計を提示し承認を得てから構築に進む                                                                 |
| **設計前に既存環境の名前衝突を検索**                  | ソリューション名・テーブルスキーマ名が既存と重複しないことを API で確認                                      |
| 全テーブルにデモデータを投入                          | 従属テーブル（コメント等）含め漏れなく                                                                       |
| 全 Lookup を設計書に明記                              | リレーション漏れは機能不全の原因                                                                             |
| **nameUtils パッチは Node.js スクリプトで**           | PowerShell の $ エスケープで適用失敗する。`node patch-nameutils.cjs` を使う                                  |
| **SDK Lookup 名は未ポピュレート（初回から対応必須）** | `createdbyname` 等は返らない。**初回デプロイから** `_xxx_value` + `useMemo` クライアントサイド名前解決を実装 |
| **フロー接続 ID はハードコードしない**                | 環境が変わると接続 ID も変わる。毎回 PowerApps API で自動検索                                                |
| **api_get() は dict を返す**                          | `.json()` を呼ぶとエラー。戻り値の dict をそのまま使う                                                       |
| **ConversationStart/GPT YAML は手動構築**             | `yaml.dump()` は PVA パーサーと非互換。会話の開始・クイック返信・推奨プロンプトが消える                      |
| **bots PATCH には name フィールド必須**               | 省略すると `Empty or null bot name` エラー (0x80040265)。既存名を GET して再送                               |
| **アイコンは SVG→Base64 で API 登録**                 | `data:image/svg+xml;base64,...` を `bots.iconbase64` に PATCH。ユーザーに UI アップロードを求めない          |
| **基盤モデルは API で設定できない**                   | `aISettings` PATCH で `optInUseLatestModels: False` にしても基盤モデルが GPT に戻るケースあり。UI で手動選択 |
