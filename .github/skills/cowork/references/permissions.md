# 必要な権限の案内（Cowork プラグイン + Dataverse MCP）

プラグインを作る・公開する・使う人ごとに、必要な権限をまとめる。scaffold の直後に**担当者と照らし合わせて**から Step 3 へ進む。
コネクタは**利用者本人の委任**（OAuth 認可コード）で Dataverse を呼ぶため、プラグインが読める・書けるのは**その人の Dataverse の権限の範囲だけ**。

## 1. 担当ごとの権限

| 工程 | 担当 | 必要な権限（最小） | 使うもの |
|---|---|---|---|
| Cowork の利用可否 | テナント管理者 | Frontier プログラムへの参加、対象者の登録 | M365 管理センター |
| Entra の OAuth クライアント作成（Step 3） | 開発者 | **アプリケーション開発者**（アプリ登録の作成）。既存アプリの変更はそのアプリの所有者 | `setup_entra_oauth_graph.py` |
| `mcp.tools` への管理者の同意（Step 3） | テナント管理者 | **クラウド アプリケーション管理者**・**アプリケーション管理者**・**AI 管理者**のいずれか（委任権限の同意。Microsoft Graph のアプリケーション権限を除く）。特権ロール管理者は Graph のアプリケーション権限が要るときだけ（[Learn: Grant tenant-wide admin consent](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/grant-admin-consent)） | 同意 URL（`setup_entra_oauth_graph.py` が表示） |
| 許可 MCP クライアントの登録（Step 4） | 環境管理者 | 対象環境の **System Administrator**（`allowedmcpclients` の作成・有効化） | `register_mcp_client.py` |
| Dataverse MCP の有効化 | 環境管理者 | 環境の設定（Dataverse MCP・Cowork クライアントの許可） | `check_mcp_client.py cowork` |
| OAuth client registration（Step 5） | 開発者 | Teams 開発者ポータルを使えること（テナントでカスタム アプリの開発が許可されている） | 開発者ポータル private API |
| プラグインの登録・公開（Step 8 / 10） | エージェント管理者 | **AI 管理者**（Agents の追加・公開・配布）。Global Administrator は常用しない | 管理センター private API |
| ロールの作成・割り当て | 環境管理者 | 対象環境の System Administrator | 業務ごとのロール作成スクリプト |
| 利用 | 利用者 | Microsoft 365 Copilot のライセンス、Frontier の対象、プラグインの公開先に含まれる、Dataverse のライセンスとロール（下の 2） | Cowork の Customize → Plugins で有効化 → Connect |

## 2. 利用者の Dataverse のロール（業務ごとに作る）

- **Basic User** と、業務のテーブルだけを持つ**専用ロール**を割り当てる。広いロール（System Administrator・System Customizer）を利用者に付けない（プラグインが何でも読める・書ける状態になる）。
- 書き込むテーブルは、作成 = ユーザー（Basic）、書き込み = ユーザー（自分が作ったものだけ）、読み取り = 必要な範囲、にする。
- 承認・公開など**業務上の確定**はプラグインに持たせず、別のロール（事務局など）がアプリで行う運用にする（スキル本文にも「下書きとして登録」と書く）。
- 個人情報を含むテーブル（名簿・記録）は、プラグインが使わないなら権限を付けない。マニフェストのコネクタ説明にも「扱わない」と書く。

例（株主総会 Q&A アシスト・[templates/agm-qa-plugin](../templates/agm-qa-plugin/README.md)）:

| テーブル | AGM 想定問答作成者（Cowork の利用者） |
|---|---|
| 想定問答 | 作成（ユーザー）・読み取り（組織）・書き込み（ユーザー） |
| リハーサル台本 | 作成（ユーザー）・読み取り（組織）・書き込み（ユーザー） |
| IR 抜粋 | 読み取り（組織） |
| 株主名簿・発言・質問・LIVE | なし |

## 3. 確認のコマンド

```powershell
python .github/skills/standard/scripts/check_mcp_client.py cowork          # Dataverse MCP と Cowork クライアント
python .github/skills/cowork/scripts/diagnose_cowork_connector.py         # アプリ登録・管理者の同意・allowedmcpclients
```

利用者のロールは Dataverse の `systemusers(<id>)/systemuserroles_association` で読み戻す。
広いロールを持つ人は、専用ロールの制限に関係なくすべて読める・書ける。権限の確認は**専用ロールだけを持つ人**で行う。

## 4. 異常系の目安

| 症状 | 多い原因 |
|---|---|
| Connect の後に何も返らない | 管理者の同意が未了（troubleshooting #22） |
| 認証は通るがデータ取得で失敗 | `allowedmcpclients` に Client ID が無い・無効（Step 4） |
| 読めるが書けない | 利用者のロールに作成・書き込みが無い／`dataverse-mcp-tools.json` に書き込み系のツールが無い（troubleshooting #15） |
| 管理センターでアップロードできない | AI 管理者のロールが無い、または同じ manifest ID が登録済み（Step 10 の更新へ） |
