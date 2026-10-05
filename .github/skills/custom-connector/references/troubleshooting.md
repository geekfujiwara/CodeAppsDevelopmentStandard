# 異常系・トラブルシュート

## 1. 同意が AADSTS90008（application is misconfigured）で失敗する

**症状**: サインイン後に `error=` 付きで戻り、`must require access to Microsoft Graph by specifying at least 'Sign in and read user profile'`。

**原因**: アプリが Microsoft Graph の `User.Read` を要求していない。ポータルで作ったアプリには既定で付くが、
`az ad app create` や Graph API で作ったアプリには付かない。

**対処**: `User.Read` を追加し、**数分待ってから**やり直す（実測: 追加直後は同じエラーが続き、約 3 分後に解消）。
**恒久対策済み** — mcp-server の `configure_connector_oauth.py` の `ensure_graph_user_read()` が追加する。

## 2. API が 401（`missing scope`）を返す。CLI のトークンでは通る

**原因**: コネクタは API アプリ自身をクライアントにして v1 トークンを取る（client = resource）。
このトークンは `aud` と `appid` が API アプリ自身で、`scp` に公開スコープではなく **Graph の委任スコープ（例: `User.Read`）** が入る（実測）。

**対処**: API 側で「`scp` に公開スコープがある」か「`appid`/`azp` が信頼するクライアント（既定は API アプリ自身）」のどちらかで許可する。
委任トークン（`scp` と `oid` がある）であることは必ず確認し、アプリ専用トークンは拒否する。
拒否時は `ver` / `aud` / `scp` / `appid` だけをログに出すと原因がすぐ分かる。
**恒久対策済み** — realtime-speech の Function テンプレートの `authorizeClaims()`（テスト付き）。

## 3. 統合ブラウザで「新しい接続」を作ると、ポップアップがブロックされ接続が消える

**原因**: VS Code の統合ブラウザはポップアップを開かない。画面は失敗を検知して作成済みの接続を DELETE する。

**対処**: `create_connection.py apply`（ポップアップを使わない）を使うか、利用者に Edge で作成してもらう（`manual`）。

## 4. 接続 API が 403 `InsufficientDelegatedPermissions`（`Connectivity.Connections.*`）

**原因**: Azure CLI 互換のクライアントで取ったトークン。

**対処**: Power Platform CLI のパブリック クライアントで取る。**恒久対策済み** — `create_connection.py` が常にこのクライアントを使う。

## 5. 同意画面に「MCP サーバーへのアクセス」と出る

**原因**: mcp-server の `configure_entra_api.py` がスコープの表示名を固定していた。

**対処**: `.env` に `MCP_API_SCOPE_LABEL` / `MCP_API_SCOPE_DESCRIPTION` を設定して再実行する（既存スコープは表示名だけ更新される）。
**恒久対策済み**。

## 6. `pa app add data-source --connection-ref` が論理名を拒否する／接続 ID を解決できない

**原因**: 接続参照の論理名にハイフンが入っている（カスタム コネクタの ID 由来）、または接続参照に接続がバインドされていない。

**対処**: code-apps の `setup_connection_reference.py`（論理名を正規化）で作り、`create_connection.py --connection-reference` でバインドしてから追加する。

## 7. 「Confirmation required」が出る

正常。`redirectUrl` がポータル以外のとき、同意サーバーはフィッシング対策の確認画面を出す。
表示される作成者が自分で、自分がこの手順で作った接続であることを確かめてから、チェックして Allow access を押す。
**他人から送られた URL でこの画面が出たら Cancel する。**

## 8. `plan` が「Git リポジトリ外のため…判定できません」で止まる

**対処**: 作業フォルダーで `git init` し、`.gitignore` に `.mcp/` と `.secrets/` を追加する。

## 9. on-behalf-of を有効にしたのに plan が `mode: consent` になる

**症状**: `deploy_connector.py` は成功し、Dataverse の `connectors.connectionparameters` も `enableOnbehalfOfLogin: "true"` なのに、
RP（`api.powerapps.com` の `apis/{connector}`）は `"false"` のまま。RP の `changedTime` が更新前の時刻で止まっている。

**原因**: 同じ環境で、同じ API アプリ（リソース）に on-behalf-of を有効にした別のコネクタがある（検証用の複製など）。
2 つ目の更新は Dataverse には保存されるが RP に同期されず、エラーも返らない。

**対処**: 不要なほうのコネクタの接続を消し、Dataverse の `connectors(<connectorid>)` を削除してから、もう一度 `deploy_connector.py` で更新する。
**恒久対策済み** — `deploy_connector.py` の `find_obo_conflicts()`（更新前に止める）と `_verify_runtime_sync()`（更新後に RP を読み戻す）。

## 10. 接続のスクリプトがデバイス コード認証で止まる

**原因**: `TENANT_ID` が未設定で、`auth_helper` がテナント別のキャッシュ（`auth_record_<tenant>_<client>.json`）を見つけられない。

**対処**: プロジェクトの `.env` に `TENANT_ID` / `ENV_ID` / `DATAVERSE_URL` を書く。シェルごとに環境変数で渡すと付け忘れる。

## 11. `pac connector create` が「Connector name must be alphanumeric, '-', or '_' and start with alphanumeric」で止まる

**原因**: pac はコネクタ名を `apiDefinition.swagger.json` の `info.title` から作る。日本語や空白を含む題名は使えない。

**対処**: `info.title` を英数字・ハイフン・アンダースコアにし（例: `Contoso-Listing`）、日本語の説明は `info.description` と操作の `summary` に書く。
Code Apps の生成サービスの名前も題名から作られる（`Contoso_ListingService`）。
**恒久対策済み** — `deploy_connector.py` の `validate_definition()` が pac を呼ぶ前に題名を検査する。

## 12. 接続の作成・`invoke` が `SSLEOFError: UNEXPECTED_EOF_WHILE_READING` で落ちる

**症状**: 環境の Power Platform API（`*.environment.api.powerplatform.com`）への要求が、TLS の途中で切れる。同じ要求を数秒後に送ると通る。

**原因**: 社内のプロキシ・TLS 検査（Global Secure Access 等）を通る経路で、長い応答や接続の再利用のときに切れることがある。API 側の不具合ではない。

**対処**: 送り直す。コネクタの作成（pac）は終わっていることがあるので、スクリプトを再実行して既存のコネクタ・接続を使う。
**恒久対策済み** — `create_connection.py` の `_request()` と `invoke`（GET のみ）が一時的な通信エラー（`is_transient()`）を 3 回まで送り直す。

## 13. 公開サイトを取得する操作が 20〜30 秒かかる

**症状**: 認証なしのコネクタで公開ページを取得すると、`invoke` が 200 を返すまで 20〜30 秒かかる（ページ自体は 1 秒程度で返る）。

**原因**: コネクタのランタイム（API Management）経由の初回呼び出しと、取得先の応答の遅さが重なる。

**対処**: Code Apps 側は呼び出しに時限（60 秒など）を付け、待っている間は進み具合を表示する。失敗したときの代わりの入力
（ページの内容の貼り付け）を用意する（[public-site.md](public-site.md)）。

## 14. DLP の事前確認で、公開サイトのホストが「未分類」で NG になる

**症状**: `check_dlp.py --custom-host <host>` が「`<host>` が未分類です」と NG を出す。既定の分類（例: Non-business）に入る。

**対処**: 標準コネクタ（Dataverse 等）と同じグループに入るかを確かめる。同じなら動作はするが、外部サイトのホストを使うことを
テナント管理者に伝え、`set_dlp_custom_connector.py`（dry-run → 承認 → `--apply`）で明示的に分類してもらう。分類の変更はテナント全体に効く。

## ブラウザで接続を作る方法（on-behalf-of を使えない場合）

他社 API など、API アプリに Azure API Connections を事前承認できない場合だけ使う。plan が `mode: consent` を選ぶ（`--mode consent` で明示も可）。

**同意（apply）**: apply は接続を作成し、`http://127.0.0.1:53682/start` を表示して待つ。**接続の所有者本人のブラウザ**で開き、
アカウントを選んで（初回は同意画面で Accept）、「Confirmation required」で作成者が本人であることを確かめてチェック → Allow access。
`Connected` を読み戻して接続参照にバインドする。失敗したら作成した接続を削除する。

**利用者が自分で作る（manual）**: URL を渡し、作成を API で確認する。

```powershell
python .github/skills/custom-connector/scripts/create_connection.py manual --connector <shared_…> --connection-reference <論理名>
```

表示された URL を所有者が **Microsoft Edge** で開き、「作成」→ サインインする（統合ブラウザはポップアップが開かない。#3）。
新しい接続が `Connected` になったらバインドまで進む。
