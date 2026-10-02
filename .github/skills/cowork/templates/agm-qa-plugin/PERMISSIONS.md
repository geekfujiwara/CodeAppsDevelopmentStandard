# 必要な権限（株主総会 想定問答アシスタント）

このプラグインは利用者本人の権限（委任）で Dataverse（${DATAVERSE_ORIGIN}）を呼ぶ。読める・書けるのは利用者のロールの範囲だけ。
共通の考え方と確認コマンドは cowork スキルの `references/permissions.md`。

## 担当と権限

| 工程 | 必要な権限 | 確認 |
|---|---|---|
| Entra の OAuth クライアント作成 | アプリケーション開発者（アプリ登録の作成） | `setup_entra_oauth_graph.py` |
| `mcp.tools`（Dynamics CRM）への管理者の同意 | クラウド アプリケーション管理者・アプリケーション管理者・AI 管理者のいずれか | `diagnose_cowork_connector.py` |
| 許可 MCP クライアントの登録 | 環境の System Administrator | `register_mcp_client.py --check` |
| OAuth client registration | Teams 開発者ポータルの利用（カスタム アプリの開発が許可されていること） | registrationId を `.env` に |
| プラグインの登録・公開 | AI 管理者 | 管理センター Agents → Tools → Plugins |
| ロールの作成・割り当て | 環境の System Administrator | `setup_security_roles.py --assign-author ${COWORK_AUTHOR_UPN}` |
| 利用 | Microsoft 365 Copilot のライセンス・Frontier の対象・公開先に含まれる・下のロール | Cowork の Customize → Plugins → Connect |

## 利用者のロール「AGM 想定問答作成者」（＋ Basic User）

| テーブル | 権限 |
|---|---|
| `${PUBLISHER_PREFIX}_agmqa`（想定問答） | 作成（ユーザー）・読み取り（組織）・書き込み（自分が作ったもの） |
| `${PUBLISHER_PREFIX}_agmscript`（リハーサル台本） | 作成（ユーザー）・読み取り（組織）・書き込み（自分が作ったもの） |
| `${PUBLISHER_PREFIX}_agmirexcerpt`（IR 抜粋） | 読み取り（組織） |
| 株主名簿・発言・質問・総会・LIVE・設定 | なし（個人情報と記録は扱わない） |

- 想定問答・台本はプラグインからは**下書き**として登録する。質疑応答の検索に使うかどうか（承認）は、ロール「AGM オペレーター」を持つ事務局がアプリの想定問答の画面で決める。
- システム管理者など広いロールを持つ人は、この制限に関係なくすべて読める・書ける。権限の確認はこのロールだけを持つ人で行う。
