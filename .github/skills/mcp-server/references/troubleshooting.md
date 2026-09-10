# 異常系・トラブルシュート

すべて実案件で実際に踏んだ事象。**恒久対策は `scripts/` に事前チェックとして組み込み済み**なので、
正常系のワークフローどおりに進めれば再発しない。ここは原因を理解したいときに読む。

---

## デプロイ

### 管理ルートの削除確認を実行せず成功終了する

`cleanup_admin_endpoints.py` の旧実装は `--route` 省略時に HTTP 確認を0件で終え、`seedSql.ts` を検出しなかった。
恒久対策済み: `main` で `--route` を必須にし、`find_admin_sources` に SQL シードを追加。
`test_cleanup_admin_endpoints.py` で変更前の停止と検出を検証する。ルート名はファイル名から推測せず、登録定義の全削除対象を列挙する。
`strip_entrypoint_imports` は import のモジュール名を完全一致させ、`seedSqlReport` のような別モジュールとコメントを保持する回帰テストも同梱する。
英語 Windows の cp1252 標準出力では日本語ログが例外になるため、スクリプト起動時に出力を UTF-8 へ固定する。cp1252 を指定した子プロセスの回帰テストで確認する。

### PDF が PNG として返るのに文字が空白になる

PDF.js と canvas の版不整合、および日本語代替フォント未登録を切り分ける。
対策と導入先で必須の非白紙・異ページ内容チェックは [PDFページ描画](indexed-file-db-access.md#pdf-ページ描画) を参照。
PNG シグネチャ成功や単一ページのハッシュ一致だけを表示成功としない。

### `func publish` が「Worker runtime cannot be 'None'」「Can't determine project language」で失敗する

**原因**: プロジェクト直下に `local.settings.json` が無い。`func` はこのファイルからワーカーランタイムを判定する。
このファイルは `.gitignore` 対象なので、**clone 直後や新規作成直後は必ず存在しない**。

**対処**: 以下を作成する。`deploy_mcp_function.py` が存在確認し、無ければ自動生成する。

```json
{
  "IsEncrypted": false,
  "Values": { "FUNCTIONS_WORKER_RUNTIME": "node", "AzureWebJobsStorage": "" }
}
```

### `func` コマンドが見つからない（npm でグローバルインストール済みなのに）

**原因**: `azure-functions-core-tools` の postinstall が zip を展開しないまま終わることがある。
`node_modules/azure-functions-core-tools/bin/` に `Azure.Functions.Cli.*.zip` だけが残る。

**対処**: 手動で展開する。`deploy_mcp_function.py` が `func --version` に失敗したら自動で展開して復旧する。

### publish が終了コード 1 で "Deployment was successful but the app appears to be unhealthy"

**原因**: Flex Consumption のヘルスチェックが起動直後のコールドスタートを拾って誤判定している。
**デプロイ自体は成功している**。

**対処**: **終了コードで成否を判定しない**。ルートに HTTP プローブして判定する。

| 応答 | 意味 |
|---|---|
| `401` | ルートは存在し、認可も動いている → **成功** |
| `404` | ルートが存在しない → デプロイされていない |

### ルートが 404 のまま。ARM 上は関数が存在することになっている

**原因**: `Microsoft.Web/sites/functions` のメタデータは**古いまま残る**ことがある。
過去のデプロイの残骸が表示され、実際に動いているパッケージの内容とは一致しない。

**対処**: ARM のメタデータを信用しない。**HTTP プローブを唯一の真実**として扱う。

### 関数一覧には出るのに、呼ぶと本文が空の 404 が返る

**原因**: ルート名が Functions ホストの**組み込みルートと衝突**している。代表例は
`route: 'admin-seed'` のように **`admin` で始まる**ルート（`/admin/host/status` などと衝突する）。
衝突した関数だけが読み込まれず、ホストが 404 を返す。ビルドもデプロイも成功し、
`az functionapp function list` にも `Invoke url` 付きで表示されるため気付きにくい。

ホストログに理由がそのまま出る。

```
The 'adminSeed' function is in error: The specified route conflicts with one or more built in routes.
```

**対処**: ルート名を変える（`seed-data` など）。切り分けは `curl -i` で本文の有無を見る。

| 404 の見え方 | 発生源 |
|---|---|
| `Content-Length: 0` / `Server: Kestrel`（本文なし） | **ホスト**。ルートが未登録＝ルート衝突かデプロイ漏れ |
| `{"error":"not found"}` のような JSON 本文あり | **自作ハンドラー**。鍵の不一致・メソッド違い等 |

### 削除したはずの関数のルートが、再デプロイ後も 401 を返す（404 にならない）

**原因**: `tsc` は `dist/` をクリーンせず、削除・退避したソースのコンパイル済み `.js` が `dist/` に残る。
Azure Functions は `dist/` 内の全 `.js` を走査して関数を登録するため、ルートが復活する。

**対処**: ビルド前に `dist/` を削除する。

**恒久対策済**: `deploy_mcp_function.py` の `build()` が毎回 `dist/` を削除してからビルドする。

### 関数を削除・退避したら、残すはずの `mcp` を含む**全ルート**が 404 になった

**原因**: エントリポイント（`src/index.ts`）が削除済みモジュールを `import` したまま。
worker が `Cannot find module './functions/adminDbSetup'` で起動に失敗し、**0 functions loaded** になる。
Functions ホスト自体は 200 を返す（ルート URL は生きている）ため、原因が見えにくい。

**対処**: 関数ファイルを消したら必ずエントリポイントの `import` も消す。
`cleanup_admin_endpoints.py` は削除と同時に `src/index.ts` から該当 `import` を除去する。

**恒久対策済**: `deploy_mcp_function.py` の `check_entrypoint_imports()` が、毎回のデプロイ前に
`src/index.ts` の相対 import を全て解決できるか検査し、未解決なら publish 前に中断する。

**切り分け**: Application Insights の `traces` を見る。`Worker was unable to load entry point` が出ていれば確定。

```kql
union traces, exceptions
| where timestamp > ago(1h)
| project timestamp, severityLevel, msg = coalesce(message, outerMessage)
| order by timestamp desc | take 40
```

### `0 functions loaded` かつ `AzureWebJobsStorage` が接続文字列

**原因**: ストレージの `allowSharedKeyAccess=false` にすると、共有キーの接続文字列ではホストが起動できない。
デプロイ（`func publish`）はマネージド ID で成功するため、**デプロイは成功したのにアプリだけ動かない**という状態になる。

**対処**: `AzureWebJobsStorage` を削除し、ID ベース接続に置き換える。ホスト ID 管理に `Storage Blob Data Owner` が要る。

```powershell
python .github/skills/mcp-server/scripts/configure_function_storage.py --app <app> --account <storage-account>
```

**恒久対策済**: `deploy_mcp_function.py` の `check_storage_auth()` が、接続文字列の `AzureWebJobsStorage` と
`allowSharedKeyAccess=false` の組み合わせをデプロイ前に検出して中断する。

### publish がハングしたように見えて進捗が分からない

**原因**: PowerShell で `| Select-Object -Last N` を挟むと、コマンドの全出力がバッファされて完了まで何も表示されない。

**対処**: ログをファイルにリダイレクトし、別途 tail する。

```powershell
func azure functionapp publish <app> *> "$env:TEMP\publish.log"
Get-Content "$env:TEMP\publish.log" -Tail 30
```

---

## Copilot Studio との接続

### Add MCP server が `POST .../connectors/apim 400` で失敗する

**症状**: Response に `Name ... did not match validation regex ^[a-zA-Z0-9\-\.]{1,64}$` と表示される。
Console の Initiator に出る JavaScript スタックだけでは原因は分からないため、ブラウザ開発者ツールの
**Network > connectors/apim > Response** を確認する。Request Payload は Client secret を含むため共有しない。

**原因**: `Server name` に日本語、空白、アンダースコア等を使い、Power Platform が生成する
内部コネクタ名の制約に違反している。

**対処**: `Server name` を 1～64 文字の英字・数字・ハイフン・ドットだけにする。

**恒久対策済み**: `generate_copilot_studio_guide.py` の `validate_server_name()` が、入力ガイド生成時に
不正な名前を検出して、Copilot Studio へ入力する前に中断する。

### curl では `tools/list` が返るのに、Copilot Studio のコネクタからは接続できない

**原因**: Copilot Studio は **Streamable トランスポートのみ**対応する（SSE は 2025 年 8 月で廃止）。
自前実装で以下のいずれかを外していると、自前の curl では成功するのに接続だけが失敗する。

| 違反 | 症状 |
|---|---|
| `id` なしの通知（`notifications/initialized`）に JSON-RPC 本文を返す | initialize 直後のハンドシェイクで切断される |
| `protocolVersion` を `2024-11-05` 等に固定し、クライアント提示版を無視する | Streamable と見なされない |
| `methods: ['POST']` のみで GET が 404 | サーバー不在と誤判定される |

**対処**: [protocol.md](protocol.md) の「Streamable HTTP の必須要件」に従い、通知は **202 + 本文なし**、
`protocolVersion` は `2025-03-26` 以降をネゴシエート、GET / DELETE は **405** を返す。

**恒久対策済み**: `verify_mcp_server.py` の `check_streamable_compliance()` が、
毎回の E2E 検証で上記 3 点を実測して違反を列挙する（`tools/list` の前に実行される）。

### カスタムコネクタの OAuth 同意でリダイレクトが失敗する

**症状**: サインイン時に `AADSTS50011: The redirect URI ... does not match` が表示される。

**原因**: オンボーディングウィザードが作るカスタムコネクタは、共通 URI
`https://global.consent.azure-apim.net/redirect` ではなく、末尾にコネクタ ID が付いた URI を送る。
Entra の Redirect URI は完全一致のため、共通 URI だけでは認証できない。

**対処**: callback URL、または `AADSTS50011` に表示された URI をそのまま追加する。

```powershell
python .github/skills/mcp-server/scripts/add_connector_redirect_uri.py `
  --audience $env:MCP_API_AUDIENCE `
  --redirect-uri "https://global.consent.azure-apim.net/redirect/<connector-id>"
```

**恒久対策済み**: `add_connector_redirect_uri.py` が URI のホストとパスを検証し、既存 URI を保持したまま
追加して、Graph の再取得で反映を確認する。Client secret は再発行しない。

### MCP ツールが DLP ポリシーでブロックされ、公開できない

**症状**: ツールに `This tool is blocked by your data loss prevention policy` と表示される。

**原因**: MCP Server は Power Platform のカスタムコネクタとして DLP 評価される。対象コネクタが
`Blocked` の場合だけでなく、エージェント内でデータを受け渡す他のコネクタと `Business` / `Non-Business`
グループが異なる場合も違反になる。OAuth の `AADSTS50011` は別問題で、Redirect URI の追加だけでは
DLP 分類は変わらない。

**対処**: [Copilot Studio の DLP 診断](copilot-studio-dlp.md) に従い、まず読み取り専用スクリプトで
適用ポリシー、コネクタの明示分類、Host URL パターンを確認する。Copilot Studio のエラー詳細も
ダウンロードし、違反したポリシー名とコネクタ名を一致させてから管理者が最小変更する。

**恒久対策済み**: `diagnose_copilot_dlp.py` は `standard/scripts/auth_helper.py` のキャッシュ認証を使い、
対象環境に適用されるポリシーだけを抽出する。対象カスタムコネクタが明示分類されていなければ
既定グループを表示する。スクリプトはポリシーを変更せず、ブラウザ認証も開始しない。

### DLP を解消したのに、Edit 画面で `Couldn't load MCP tools ... HTTP 401` が出続ける

**症状**: DLP ブロックのエラーは消えたのに、ツールの Edit 画面を開くたびに
「The MCP server rejected the request (HTTP 401)」が表示される。サーバー側の Entra アプリ登録・
JWT 検証ロジック・Function App はすべて正常で、こちらが取得したトークンでは `tools/list` / `tools/call`
が問題なく成功する。

**原因**: Copilot Studio 側が保持している OAuth アクセストークンが期限切れになったまま、
**自動でリフレッシュされずに同じ古いトークンを送り続けている**。Application Insights の `traces` を見ると、
数時間〜十数時間にわたって同一の `jwt expired` が繰り返し記録される（DLP や Entra 設定の問題ではない）。

```kql
traces
| where timestamp > ago(6h)
| where message has '認証失敗'
| project timestamp, message
| order by timestamp desc
```

**対処**: Copilot Studio（または Power Apps > Connections）で対象コネクタの接続を開き、
組織アカウントで**再認証（reconnect）**する。新しいアクセストークンが発行され、即座に解消する。
ポリシー変更・アプリ登録変更・Client secret のローテーションは不要（かつ無関係）。

**恒久対策済み**: `diagnose_connector_token.py` が Application Insights の認証失敗ログを
「未接続（Authorization ヘッダーなし）」「トークン失効（繰り返し発生かどうかで一時的か放置かを判定）」
「aud/iss 不一致」に自動分類する。401 を見たら DLP を疑う前にこのスクリプトを実行し、
`token_expired` が閾値（既定 15 分）を超えて繰り返していれば再認証、`not_connected` なら
接続未完了と即座に切り分けられる。読み取り専用でポリシー・アプリ設定は変更しない。

### Power Apps の接続一覧で頻繁に「再接続」表示になり、ツールチップが `Missing refresh token`

**症状**: Copilot Studio の Tools 画面でツールが `Failed`（`reasonCode: ConnectionInvalid` /
`HttpStatusCode: unauthorized`）になる。Power Apps > Connections の状態列は「再接続」で、
ツールチップは `Failed to refresh access token for service: oauth2pkce ... Error: Missing refresh token.`

**原因**: 上の「HTTP 401 が出続ける」問題とは別の事象。カスタムコネクタの **Scopes に
`offline_access` を含めていない**ため、Entra がそもそもリフレッシュトークンを発行していない。
アクセストークンの既定の有効期限（60〜90 分）が切れるたびに接続が無効化され、
Copilot Studio・Power Apps 側にリフレッシュしようにも使えるリフレッシュトークンがない。
「リフレッシュが早い／すぐ使えなくなる」という体感は、リフレッシュ間隔の問題ではなく
リフレッシュトークン自体が存在しないことが原因。

**対処**: 対象コネクタの Scopes を `api://<app-id>/<scope> offline_access` に変更し、
Power Apps > Connections で対象接続を再接続（初回サインインをやり直す）する。
以後はアクセストークン期限切れ時にリフレッシュトークンで自動更新され、手動再接続の頻度が下がる。
複数コネクタが同じ Entra アプリ登録を共有している場合は、すべてのコネクタの Scopes を同様に修正する。

### 接続作成時に `OAuth2 authorization flow failed` の PromiseRejection が出る

**症状**: Power Apps のシェルに `OAuth2 authorization flow failed for service 'Generic Oauth 2 with PKCE'`
という未処理の PromiseRejection が表示され、`pac connection list` では作成途中の接続が `Error` になる。

**切り分け**: コネクタ定義の `identityProvider`、Scopes、Authorization/Token/Refresh URL、redirect URLを
exportして確認する。Entra側のredirect URIとClient secretの有効期限も確認する。これらが正しく、同時刻の
Function App認証ログに要求がなければ、失敗はMCPサーバー到達前のPower Apps OAuth画面で発生している。

**対処**: OAuthポップアップを許可し、サインイン・同意後にPower Appsへ戻るまで閉じない。途中で作られた
`Error` 接続は再利用せず、接続ごとの詳細URLから削除して新規作成する。`Connected` の既存接続や
カスタムコネクタ定義を削除しない。エラー接続の再作成後は `pac connection list` で状態を再確認する。

`AADSTS7000215: Invalid client secret provided` が応答本文にある場合は、ポップアップ中断ではなく
コネクタに保存されたsecretが無効。`pac connector download` はsecret valueをexportしないため、取得した
`apiProperties.json`をそのまま更新に使うとsecretが失われる。Entraで有効なcredential valueを保持する
Git無視済みファイルを指定し、`update_connector_oauth.py`で対象コネクタへ再注入する。secret IDではなく
作成時に一度だけ返されたvalueを使う。更新後、利用者本人が接続を再認証する。

---

## 認証・認可

### トークン取得が `AADSTS650057: Invalid resource ... List of valid resources from app registration: .`

**原因**: 末尾の一覧が空になっているとおり、**アプリ登録がスコープを 1 つも公開していない**。
加えて、公開してもクライアントが事前承認されていなければ同意が必要になり、非対話では取れない。

**対処**: `scripts/configure_entra_api.py` を実行する（SKILL.md の Step 2）。

### Graph が `InvalidValue: Property api.preAuthorizedApplications.delegatedPermissionIds has a Permission Id that cannot be found in the AppPermissions sets.`

**原因**: スコープの新規追加と、そのスコープ ID を参照する事前承認を**同一 PATCH** で送っている。
Graph は同一トランザクション内の新規スコープ ID を未登録として扱う。

### `preAuthorizedApplications` の一部クライアントだけ scope id が食い違っている

**症状**: `GET /applications` で確認すると、同じスコープ（例: `MCP.Access`）を指しているはずの
`delegatedPermissionIds` が、クライアントごとに異なる GUID になっている
（例: 一方は `...4830...`、もう一方は `...483a...`）。Graph は既存の無効な id を書き込み時に
エラーにしないため、気付かずに残り続ける。

**原因**: スコープを一度削除・作り直す、または手動でポータル編集すると id が変わる。
`configure_entra_api.py` は以前、既存の `delegatedPermissionIds` を無条件にマージしていたため、
古いスコープを指す無効な id が新しい id と混在・残存したまま更新され続けていた。

**対処**: 現在有効なスコープ id の集合と突き合わせ、無効な id を検出して削除してから
現在のスコープ id を付与し直す。

**恒久対策済み**: `configure_entra_api.py` が毎回の実行で `oauth2PermissionScopes` の現行 id 集合を計算し、
`preAuthorizedApplications` の既存エントリからその集合に無い id を削除してから現行スコープ id を
付与し直す（`valid_scope_ids` によるプルーニング）。正常系の実行でも毎回このチェックが動作する。

**対処**: PATCH を 2 段階に分ける。

1. `identifierUris` + `oauth2PermissionScopes` を PATCH
2. その後に `preAuthorizedApplications` を PATCH

`configure_entra_api.py` は分割済み。

### JWT 検証が `jwt audience invalid` で失敗する

**原因**: トークンの `aud` はクライアントによって `api://{app-id}` の場合と `{app-id}` の場合がある。
`iss` も v1.0（`sts.windows.net`）と v2.0（`login.microsoftonline.com/.../v2.0`）が混在する。

**対処**: 両形式を配列で許容する。→ [auth-model.md](auth-model.md)

### `az login --use-device-code` が「Retrieving tenants and subscriptions」でハングする

**原因**: 全テナントを列挙しようとして応答が返らない。

**対処**: そもそも **`az` を手順に含めない**。Azure 操作は `azure_helper.py`（`auth_helper` 経由）で行う。
どうしても `az` が必要な場合のみ `--tenant <tenant-id>` を明示して列挙をスキップする。

### リソースの書き込みが `AADSTS50076` / `RequestDisallowedByAzure ... without authenticating through MFA` で失敗する

**原因**: 読み取りは通るがリソースの作成・更新・削除には MFA 済みトークンが必要、という条件付きアクセスポリシー。
`az` でも `auth_helper` のキャッシュトークンでも、MFA を経ていなければ同じく弾かれる。

**対処**: エラーに含まれる `--claims-challenge` を付けて対話サインインし直す。ブラウザで MFA を完了させる。

```powershell
az login --tenant <tenant-id> --scope "https://management.core.windows.net//.default" --claims-challenge <challenge>
```

---

## データアクセス

### Azure Files への REST 呼び出しが 403 になる

**原因**: OAuth トークンで Files を操作する場合、`x-ms-file-request-intent: backup` ヘッダーが必須。

**対処**: 全リクエストに固定で付与する。

### 共有（share）の作成が権限エラーになる

**原因**: `Storage File Data Privileged Contributor` などのデータプレーンロールには
共有作成の権限（`Microsoft.Storage/storageAccounts/fileServices/shares/write`）が含まれない。

**対処**: 共有はマネジメントプレーンで先に作成する。→ [private-data-seeding.md](private-data-seeding.md)

### 共有は実在するのに `This request is not authorized to perform this operation using this permission.`

**原因**: コードが `share.exists()` / `share.create()` を呼んでいる。これらは **share レベル操作**で、
Entra 認証（OAuth）では実行できない。ファイルの読み書きができる権限でも、この 2 つだけは通らない。

**対処**: 共有は事前にマネジメントプレーンで作る前提にし、コードからは
ディレクトリ・ファイルレベルの操作だけを行う（存在確認も含めて share レベルは触らない）。

### SQL で `CREATE SCHEMA failed due to previous errors.` になる

**原因**: MI のデータベースユーザーに DDL 権限（`db_owner` / `db_ddladmin` 相当）が無い。
`publicNetworkAccess=Disabled` のため、開発 PC から `GRANT` を流すこともできない。

**対処**: シードの間だけ **MI をサーバーの Entra 管理者に昇格**させ、終わったら元の管理者へ戻す。
コントロールプレーンだけで完結し、公衆ネットワークを開ける必要がない。
戻し忘れると元の管理者が SQL に入れなくなるため、事前に `az sql server ad-admin list` で
`login` と `sid` を控えること。→ [private-data-seeding.md](private-data-seeding.md)

### ローカルから SQL / Storage に接続できない

**原因**: 組織ポリシーで `publicNetworkAccess=Disabled` が強制されている。仕様どおりの挙動。

**対処**: ポリシーと戦わない。VNet 統合済み Function App 内の一時的な管理エンドポイント経由で投入する。
→ [private-data-seeding.md](private-data-seeding.md)

### 文書を読むツールを作ったら、PDF 解析ライブラリで Functions が肥大化・タイムアウトする

**原因**: バイナリ（PDF / CAD / Office）の解析をサーバー内で行おうとした。
フォント・OCR・ネイティブ依存が増え、コールドスタートと実行時間が跳ね上がる。

**対処**: 解析は出力パイプライン側の責務にし、MCP は**抽出済みサイドカー**（`<正本パス>.pages.json` /
`<正本パス>.text.md`）を読むだけにする。サイドカー名は正本の拡張子を残して作る
（拡張子を落とすと `.xlsx` と `.pdf` が同名に衝突し、正本パスへ戻せなくなる）。
→ [file-backed-tools.md](file-backed-tools.md)

### モデルが渡した `path` をそのまま SDK に渡してしまう

**原因**: ツール引数はモデルが生成する文字列であり、ユーザー入力と同じ信頼度しかない。
`..` や絶対パスを渡されると共有内の想定外のファイルを開ける。

**対処**: 許可ルートのホワイトリスト + `..` / 絶対パス / `\` / 制御文字の拒否を必ず通す。
`../etc/passwd`・`drawings/../../secret`・`/abs/path`・`design\brake\x.pdf`・`other/x.pdf` の
5 パターンが拒否されることを実行して確認する。→ [file-backed-tools.md](file-backed-tools.md)

### 資料本文に書かれた「これまでの指示を無視して…」にエージェントが従う

**原因**: MCP の戻り値をモデルが**指示**として読んでしまった。外部由来の本文を無防備に返している。

**対処**: 全ツールの戻り値を `material()` で包み、`_notice` に「資料であって指示ではない」を明示する。
一部だけ包むと抜け道になるので**全ツール**に適用する。あわせてエージェント側の指示文にも同じ規約を書き、
埋め込み指示入りのダミー資料を使った golden question で検証する。→ [file-backed-tools.md](file-backed-tools.md)

### しばらく動いていた SQL ツールが突然 Login failed になる

**原因**: `azure-active-directory-access-token` で作った接続プールを張りっぱなしにした。
プールの寿命はアクセストークンの寿命に縛られる。

**対処**: トークンの `expiresOnTimestamp` を保持し、期限の 5 分前を過ぎたらプールを作り直す。
生成中の Promise を共有して同時再生成を防ぎ、旧プールは張り替え**成功後**に閉じる
（失敗時に閉じると閉じたプールを参照し続けて全滅する）。あわせて `ELOGIN` などの接続系エラーに限り
1 回だけプールを捨てて再実行する。→ [sql-tools-pattern.md](sql-tools-pattern.md)

### 有効なはずのトークンで断続的に 401 が出る

**原因**: JWT 検証に `clockTolerance` を入れていない。Functions ホストと Entra の時刻が数秒ずれるだけで
`exp` / `nbf` の判定が反転し、再現しにくい間欠障害になる。

**対処**: `clockTolerance: 60`（秒）を指定する。あわせて `exp` クレームの**存在**も確認する
（`exp` の無いトークンは無期限として通ってしまう）。→ [auth-model.md](auth-model.md)

### モデルが `groupBy` や並び順に想定外の文字列を渡してくる

**原因**: `inputSchema` の `enum` はモデルへのヒントに過ぎず、実行時の防御にならない。
そのまま SQL 断片として連結するとインジェクションになる。

**対処**: 集計軸・ソート列は定数表（ホワイトリスト）で固定句にマップし、
引けなかったらエラーを返す。値は必ずパラメータで渡す。→ [sql-tools-pattern.md](sql-tools-pattern.md)

---

## Copilot Studio 連携

### エージェントが MCP サーバーを呼ばない / 誤ったサーバーを選ぶ

**原因**: 複数の MCP Server を 1 エージェントに束ねると、どちらを使うべきか判断できない。

**対処**: エージェントの指示文に「どの質問でどのサーバーを使うか」を明記する。
また各ツールの `description` に用途と使用順序（例: 「検索前に `list_categories` を呼ぶ」）を書く。

### Copilot Studio から Function App に到達できない

**原因**: セキュリティを優先して Function App の `publicNetworkAccess` まで無効化した。

**対処**: **コンピュート層の HTTP は公開のままにする**。Copilot Studio は SaaS からアウトバウンド接続するため、
非公開にすると到達できない。保護は Entra ID の JWT 検証で担保する。データ層のみ Private Endpoint にする。
