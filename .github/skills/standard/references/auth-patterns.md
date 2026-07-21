# Power Platform 認証パターンリファレンス

## 前提: スクリプトは常に非対話で完走する

新規に作成・実行するスクリプトは、**初回のデバイスコード認証がキャッシュ済みであること**を前提に、以降は認証の対話待ちが一切発生せず最後まで自動実行できるように書く。

認証キャッシュ（`AuthenticationRecord`）は **`~/.power-platform-cli/auth_record_{TENANT_ID}.json`（ホームディレクトリ配下、テナント別ファイル）にマシン全体で共有保存**される。そのため、このマシンで一度でもそのテナントでデバイスコード認証を完了していれば、別プロジェクト・別リポジトリのスクリプトからでもデバイスコード認証は不要になる。

- 認証は必ず `auth_helper.py` 経由（`requests` 直呼び出し・MSAL 直接呼び出しは禁止）
- スクリプト内でユーザーに認証情報の入力を求めるプロンプトを出さない
- 実行時に対話待ちが発生した場合は、スクリプトの認証部分を疑い `auth_helper.py` の呼び出し方法を見直す（新しい認証フローを自作しない）
- テナント・アカウントを切り替えたい場合は `.env` の `TENANT_ID` を変更するだけでよい（テナントごとにキャッシュファイルが分離されているため、他テナントのキャッシュを壊さない）

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
python -c "import sys; sys.path.insert(0, '.github/skills/standard/scripts'); from auth_helper import get_token; print(get_token()[:20] + '...')"
```

#### PowerShell で `python -c "..."` に OData クエリを渡すと壊れる

`$select` / `$filter` などの `$` を含む Python コードを `python -c "..."` として
PowerShell の二重引用符内に書くと、ネストした Python 文字列の中であっても PowerShell が
`$select` / `$filter` を**変数展開**しようとして空文字列に置き換えてしまう
（`EntityDefinitions?=uniquename,...` のように `$` 以降が消えた URL になる）。

**対策**: `$` を含む OData クエリを扱うコードは `-c` のワンライナーにせず、一時的な
`.py` ファイルに書いて `python <file>.py` で実行する。実行後は忘れずに削除する。

#### MSAL Python 3.14 互換性問題

Python 3.14 では MSAL 内部トークンキャッシュ (`msal/token_cache.py`) が壊れる問題がある。

**症状**: 初回 API コールは成功するが、2回目以降で `TypeError: sequence item 0: expected str instance, dict found` が発生。`target=" ".join(target)` で scopes が dict として格納されている。

**対策** (`auth_helper.py` 実装済み):

1. `_inmemory_tokens` dict でスコープ別にトークンをインメモリキャッシュ
2. `credential.get_token()` は同じスコープで1回だけ呼び、結果をキャッシュ
3. `TypeError` や `ClientAuthenticationError` 発生時は新しい credential を永続キャッシュなしで再構築
4. `PP_NO_PERSISTENT_CACHE=1` 環境変数で OS 永続キャッシュを無効化可能

```bash
# Python 3.14 でキャッシュ破損が発生する場合
$env:PP_NO_PERSISTENT_CACHE="1"; Remove-Item .auth_record.json -ErrorAction SilentlyContinue; python ./setup_dataverse.py
```

#### マルチテナント切り替え時に「キャッシュがあるのにデバイスコード認証を要求される」問題（★ 2026-07 検証済み）

**症状**: 同一マシンで複数テナント（例: 顧客Aの環境 / 自分の検証用環境）を行き来する際、
`[auth_helper] 認証キャッシュをロードしました` のログが出ているにもかかわらず、
直後にデバイスコード認証のプロンプトが表示される。

**原因**: 旧実装では `AuthenticationRecord` を `~/.power-platform-cli/auth_record.json` という
**単一の共有ファイル**に保存していた。テナント A で認証 → テナント B に `.env` を切り替えて認証すると、
テナント B の記録がテナント A の記録を**上書き**してしまう。その後テナント A に戻ると、
ファイルには存在するがテナント B のレコードが入っているため、MSAL のサイレント認証が失敗し
再度デバイスコード認証が必要になる。

**対策**（`auth_helper.py` 実装済み）:

1. `AUTH_RECORD_PATH` を `~/.power-platform-cli/auth_record_{TENANT_ID}.json` のように
   **テナント ID ごとにファイルを分離**する
2. 旧単一ファイルからの移行時は、中身の `tenantId` が現在の `TENANT_ID` と一致する場合のみ移行する
   （不一致なら移行せず、そのテナント用に新規デバイスコード認証をさせる）
3. ロードした `AuthenticationRecord.tenant_id` が `.env` の `TENANT_ID` と食い違う場合は
   キャッシュを破棄して再認証させる（防御的チェック）

```
❌ 旧パターン: 全テナント共通で ~/.power-platform-cli/auth_record.json 1 本
   → 後から認証したテナントで上書きされ、テナントを往復するたびにデバイスコード認証が必要

✅ 新パターン: ~/.power-platform-cli/auth_record_{TENANT_ID}.json をテナントごとに保持
   → 各テナントにつき最初の1回だけデバイスコード認証すれば、以降は往復してもキャッシュが残る
```

複数テナントを扱わない（常に単一テナントのみ）場合はこの問題は発生しない。

#### `pac auth token` サブコマンドが存在しない pac CLI ディストリビューションがある

**症状**: `.env` に `PAC_AUTH_PROFILE` を設定していても、毎回 DeviceCode フローにフォールバックする
（エラーメッセージは出ないため気づきにくい）。

**原因**: `auth_helper.py` の PAC CLI 経由トークン取得は `pac auth token --resource <resource>` を
呼び出すが、pac CLI のディストリビューション/バージョンによっては（例: npm 版
`power-platform-cli` 2.9.3 系 `.NET Framework 4.8` ビルド）`auth token` サブコマンド自体が
存在せず `Not a valid command` エラーになる。`auth_helper.py` はこれを検知して黙って
DeviceCodeCredential にフォールバックする（動作はするが高速化の恩恵がない）。

**確認方法**:

```powershell
pac auth --help
# Usage: pac auth [create] [list] [select] [delete] [update] [name] [clear] [who]
# ↑ "token" が一覧に無ければこの問題に該当する
```

**対策**: 現状は DeviceCode フォールバックで機能上の問題はない（テナント別キャッシュ分離により
往復しても再認証されない）。`pac auth token` に対応した pac CLI バージョンに更新できる場合は
更新するとトークン取得が高速化する。

#### `az login` は auth_helper.py と全く別の資格情報ストア（★ 2026-07 検証済み）

**症状**: `auth_helper.py`（Python / MSAL）側は認証済みなのに、FlowAgent MCP サーバー等
Azure CLI（`az`）ベースで認証するツールを使うたびに `az login` を求められる。
複数テナント（顧客環境・自分の検証環境等）を行き来していると、その都度ブラウザでの
インタラクティブログインを要求されがちで煩わしい。

**原因**: `az login` は `~/.azure` 配下の**独自トークンキャッシュ**を使い、
`auth_helper.py` の MSAL キャッシュ（`~/.power-platform-cli/`）とは完全に別物。
Python 側で認証済みでも Azure CLI 側の資格情報には反映されない。

**対策（❌ 新規ログインを急がない）**:

```powershell
# ✅ まず az account list で対象テナント/アカウントが既にキャッシュ済みか確認する
az account list -o table --all

# ある場合 → az login 不要。account set で切り替えるだけで済む（対話不要）
az account set --subscription <該当テナントの SubscriptionId>

# 無い場合のみ、その回だけ az login --tenant <tenant-id> が必要
# （az login は一度実行したアカウントを上書きせず、az account list に追加保持される。
#   pac の AuthenticationRecord のような「単一ファイル上書き」問題は az login には無い）
```

```
❌ いきなり az login --tenant {id} を実行してユーザーにブラウザ操作を依頼する
   → az account list に既に対象テナントのアカウントがあれば不要な手間

✅ 先に az account list -o table --all を確認 → あれば az account set のみ（対話不要）
✅ 無い場合のみ、初回の1回だけインタラクティブ az login を依頼する
✅ 依頼する際は「ブラウザでアカウントを選択してください」等、必要な操作を明確に伝える
```

#### FlowAgent MCP（Node.js プロセス）は Python の auth_helper.py を直接使えない・独自の多層キャッシュを持つ（★ 2026-07 検証済み）

**症状**: `az account set` で対象テナント（テナント A）に切り替え、`az account show` でも
正しいテナントが表示されているのに、FlowAgent MCP のツール（例: `list_connections`）を呼ぶと
別テナント（テナント B）向けの 404 (`ServiceToServiceEnvironmentNotFound`) が返る。

**原因（アーキテクチャ上の制約 + プロセス内キャッシュの罠）**:

1. FlowAgent MCP は Python の `auth_helper.py` とは**別言語・別プロセス**（Node.js）で動く
   サードパーティ製バンドルのため、**auth_helper.py を直接呼び出すことは技術的に不可能**。
2. その代わり FlowAgent MCP は多くの操作で `az account get-access-token`（az CLI 自体が
   保持する資格情報）に委譲する設計になっている（`packages/core/dist/auth/az-cli-auth.js`
   の `AzCliTokenProvider`）。これは思想的には auth_helper.py と同じ「一度サインインした
   ものを使い回す」パターンであり、正しく機能すれば問題ない。
3. **しかし** `AzCliTokenProvider` は取得したトークンを **`resource` 単位でプロセス内メモリに
   キャッシュ**しており、テナント/アカウントの区別なく再利用する。そのため:
   - FlowAgent サーバープロセスが起動した時点（または前回そのリソースへ初めてアクセスした
     時点）で az CLI のアクティブテナントがテナント B だった場合、その後 `az account set`
     でテナントを切り替えても、**既に起動中の同じサーバープロセスは古いテナントのトークンを
     メモリキャッシュから返し続ける**（トークン有効期限＝60〜90分程度は再現し得る）。
   - 加えて `%LOCALAPPDATA%\flowagent\msal-cache\common.json`（接続管理 API 専用の MSAL
     インタラクティブ認証キャッシュ）も、`PA_TENANT_ID` 環境変数や az CLI のテナントが
     未確定の状態で一度作成されると `"common"` という**テナント非依存の単一ファイル**に
     なり得る（auth_helper.py で修正済みの「単一共有キャッシュ」バグと同型）。

**対策**:

```powershell
# 1. az CLI のアクティブテナントが対象と一致するか必ず確認してから使う
az account show --query tenantId -o tsv

# 2. 一致しなければ切り替える（対話不要・既存キャッシュがあれば）
az account set --subscription <対象テナントの SubscriptionId>

# 3. ★ 最重要: テナントを切り替えたら、既に起動中の FlowAgent MCP サーバーを
#    必ず再起動する（VS Code コマンドパレット → MCP: List Servers → Restart）。
#    再起動しないと、プロセス内メモリキャッシュの古いテナントのトークンを使い続ける。
```

`.vscode/mcp.json` の env には保険として `PA_TENANT_ID` と `AZURE_TENANT_ID` の両方を
設定しておく（`az account show` が失敗した場合のフォールバックとして機能する）。

**マルチテナント運用の原則**:
- マルチテナントは例外ではなく前提として扱う。テナントを切り替える操作（`.env` の
  `TENANT_ID` 変更、`az account set` 等）を行った直後は、**関連する全ての長時間駆動プロセス
  （MCP サーバー等）の再起動が必要**という前提でチェックリスト化する。
- 対象テナント・環境が一意に決まらない場合は、`vscode_askQuestions` ツールが使える場面では
  それでユーザーに選ばせる。利用できないセッションでは、チャット内で候補を提示し
  テキストで確認する。

