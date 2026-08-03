# npm CLI リファレンス（`@microsoft/power-apps-cli`）

Code Apps 用 npm CLI（`npx power-apps`）の全コマンド一覧。

**検証環境**: `@microsoft/power-apps-cli` **0.13.0**（`@microsoft/power-apps` 1.2.7 の依存として導入）。
本ドキュメントの内容は実際の `npx power-apps <command> --help` 出力に基づく。

> [!IMPORTANT]
> **PAC CLI（`pac`）とは別物**。`@microsoft/power-apps-cli` が提供するバイナリは `power-apps` のみで、
> `pac` は含まれない。PAC CLI は VS Code 拡張機能「Power Platform Tools」または
> `dotnet tool install --global Microsoft.PowerApps.CLI.Tool` で導入する（npm 配布なし）。

## 目次

- [導入と実行方法](#導入と実行方法)
- [全コマンド一覧](#全コマンド一覧)
- [グローバルオプション](#グローバルオプション)
- [アプリライフサイクル](#アプリライフサイクル)
- [データソース](#データソース)
- [Dataverse API（アクション／関数）](#dataverse-apiアクション関数)
- [探索系（list-\*）](#探索系list-)
- [クラウドフロー](#クラウドフロー)
- [接続](#接続)
- [認証](#認証)
- [テレメトリ](#テレメトリ)
- [PAC CLI との対応表](#pac-cli-との対応表)

---

## 導入と実行方法

`@microsoft/power-apps`（SDK）の依存として自動的に入るため、**単体インストールは不要**。

```bash
npm install            # @microsoft/power-apps 経由で CLI も入る
npx power-apps --help
```

Node.js **22 以上**が必要（`engines: { "node": ">=22" }`）。

## 全コマンド一覧

| コマンド | 用途 |
|---|---|
| `init` | コードアプリの初期化（`power.config.json` 生成） |
| `push` | 環境へ発行 |
| `run` | ローカルサーバー起動（接続をローカル読み込み） |
| `add-data-source` | データソース追加 |
| `refresh-data-source` | データソースのスキーマ／生成コード再取得 |
| `delete-data-source` | データソース削除 |
| `find-dataverse-api` | Dataverse のアクション／関数を名前検索 |
| `add-dataverse-api` | Dataverse のアクション／関数をアプリに追加 |
| `list-codeapps` | 環境内のコードアプリ一覧 |
| `list-datasets` | 接続配下のデータセット一覧 |
| `list-tables` | データセット配下のテーブル一覧 |
| `list-sqlStoredProcedures` | SQL ストアドプロシージャ一覧 |
| `list-environment-variables` | 環境変数一覧 |
| `list-connection-references` | 接続参照一覧 |
| `list-connections` | 接続一覧 |
| `list-connectors` | 利用可能なコネクタ一覧 |
| `list-flows` | Power Apps から呼び出せるソリューション内クラウドフロー一覧 |
| `add-flow` | クラウドフローをアプリに追加 |
| `remove-flow` | クラウドフローをアプリから削除 |
| `create-connection` | コネクタの接続を新規作成 |
| `login` / `logout` | サインイン／キャッシュ全消去 |
| `auth-status` / `auth-switch` | キャッシュ済みアカウントの確認／切り替え |
| `telemetry` | テレメトリ設定 |

## グローバルオプション

全コマンド共通。

| オプション | 説明 |
|---|---|
| `--non-interactive` | プロンプトを出さない。必要な値はフラグか環境変数で渡す（CI 用） |
| `--json` | 出力を JSON 化（`list-*` をスクリプトから使うときに必須） |
| `--no-color` | 色付けを無効化 |
| `-v, --version` / `-h, --help` | バージョン／ヘルプ |
| `-e, --environment-id <id>` | 接続先環境 ID |
| `--cloud <cloud>` | `prod`（既定・商用） / `gccmoderate` / `gcchigh` / `dod` / `mooncake` |

> `--cloud` は日本国内の通常テナントでは指定不要。GCC / DoD / 21Vianet 環境でのみ使用する。

## アプリライフサイクル

### `init`

```bash
npx power-apps init --environment-id {ENVIRONMENT_ID} --display-name "AppName"
```

| オプション | 説明 |
|---|---|
| `-t, --app-type` | `CodeApp` または `MobileApp` |
| `-n, --display-name` | 表示名 |
| `-d, --description` | 説明 |
| `-b, --build-path` | ビルド出力パス（既定 `./dist`） |
| `-f, --file-entry-point` | エントリポイントファイル |
| `-a, --app-url` | ローカル実行 URL |
| `-l, --logo-path` | ロゴファイルパス |

### `push`

```bash
npx power-apps push --solution-id {SOLUTION_ID}
```

| オプション | 説明 |
|---|---|
| `-s, --solution-id <GUID>` | 追加先ソリューションの **ID（GUID）** |

> [!WARNING]
> **0.13.0 の破壊的変更**: `-s` は **GUID のみ**を受け付ける。0.12.3 まではソリューション**名**を
> 渡すと内部で GUID に解決していたが、0.13.0 では
> `Invalid --solution-id value: expected a GUID, got '<値>'.` で即失敗する。
> `pac code push -s` はソリューション**名**なので、値を取り違えないこと。
> `-s` 省略時の自動解決挙動は [ソリューション ALM](solution-alm.md) を参照。

### `run`

```bash
npx power-apps run --port 8080 --local-app-url http://localhost:3000
```

`-p, --port` / `-l, --local-app-url` を指定できる。

## データソース

### `add-data-source`

| オプション | 説明 |
|---|---|
| `-a, --api-id` | API 識別子（`shared_commondataserviceforapps`, `shared_sql` など） |
| `-c, --connection-id` | 接続 ID（ソリューションに入らない。PoC 用） |
| `-cr, --connection-ref` | 接続参照名（**ALM 標準**） |
| `-t, --resource-name` | テーブル／リソース名 |
| `-d, --dataset` | データセット識別子 |
| `-u, --org-url` | 組織 URL |
| `-sp, --sql-stored-procedure` | SQL ストアドプロシージャ名 |
| `-s, --solution-id` | ソリューション ID（`-cr` と併用） |

### `refresh-data-source`

Dataverse 側でテーブル定義（列追加・型変更など）を変えた後、生成コードを追従させる。

```bash
npx power-apps refresh-data-source                          # 全データソース
npx power-apps refresh-data-source -n {DATA_SOURCE_NAME}    # 個別
```

> テーブルに列を足したのに生成型に出てこない場合は、まずこれを実行する。

### `delete-data-source`

```bash
npx power-apps delete-data-source --api-id {API_ID} --data-source-name {NAME} --force
```

`-f, --force` で確認プロンプトを省略（CI 用）。`-sp` で SQL ストアドプロシージャ単位の削除も可能。

## Dataverse API（アクション／関数）

カスタム API・カスタムアクション・OOB 関数を型付きで呼び出せるようにする。

```bash
# 1. 名前で検索して正確な API 名を特定する
npx power-apps find-dataverse-api --search "account" --json

# 2. アプリに追加する
npx power-apps add-dataverse-api --api-name {API_NAME}
```

> フロー呼び出し（`add-flow`）と違い、**Dataverse ネイティブのアクション／関数**が対象。
> `WinOpportunity` のような OOB 操作や、`msdyn_` 系のカスタム API を型安全に叩ける。

## 探索系（list-*）

いずれも `--json` を付けるとスクリプトからパースできる。エージェントが値を自動取得する場合は `--json` 必須。

| コマンド | 主なオプション | 用途 |
|---|---|---|
| `list-codeapps` | — | 環境内のコードアプリ棚卸し |
| `list-connections` | `-s, --search` | 接続 ID の特定 |
| `list-connectors` | `-s, --search` | `--api-id` に渡す値の特定 |
| `list-connection-references` | `-s, --solution-id` | 接続参照の論理名確認 |
| `list-environment-variables` | — | 環境変数の棚卸し |
| `list-datasets` | `-a, --api-id` / `-c, --connection-id` | SQL 等のデータベース一覧 |
| `list-tables` | `-a` / `-c` / `-d, --dataset` | テーブル一覧 |
| `list-sqlStoredProcedures` | `-c` / `-d` | ストアドプロシージャ一覧 |
| `list-flows` | `-s, --search` | 呼び出し可能なフローと ID の特定 |

```bash
# 例: コネクタ ID → 接続 ID → データセット → テーブル の順に絞り込む
npx power-apps list-connectors --search sharepoint --json
npx power-apps list-connections --search sharepoint --json
```

## クラウドフロー

```bash
# 1. 呼び出せるフローと GUID を確認
npx power-apps list-flows --search "approval" --json

# 2. アプリに追加
npx power-apps add-flow --flow-id {FLOW_ID}

# 3. 削除（名前 or ID のどちらか）
npx power-apps remove-flow --flow-name {FLOW_DATA_SOURCE_NAME}
npx power-apps remove-flow --flow-id {FLOW_ID}
```

> `list-flows` が返すのは**ソリューション内**かつ Power Apps から呼び出せるフローのみ。
> 対象が出てこない場合は、フローがソリューションに含まれているかを先に確認する。

## 接続

```bash
npx power-apps create-connection --api-id {API_ID} --display-name "Prod SQL"
```

SSO 専用コネクタはサイレント SSO、それ以外はブラウザが開いてサインインする。

> 接続**参照**（Connection Reference）を新規作成する CLI コマンドは存在しない。
> ALM 対応が必要な場合は `scripts/setup_connection_reference.py` を使う
> （[ソリューション ALM](solution-alm.md)）。

## 認証

PAC CLI とは**別のトークンキャッシュ**を持つ。`pac auth create` 済みでも、npm CLI 側は別途サインインが要る。

| コマンド | 説明 |
|---|---|
| `login` | サインインしてアカウントをローカルキャッシュに追加。`--non-interactive` でもブラウザは開く |
| `logout` | **キャッシュ済みアカウントを全消去**。アクティブアカウントの切り替え目的で使わない |
| `auth-status` | キャッシュ済みアカウント一覧（アクティブなものに印が付く） |
| `auth-switch` | アクティブアカウントの切り替え。`--account {email}` 省略時は対話選択、`--non-interactive` では必須 |

```bash
npx power-apps auth-status --json
npx power-apps auth-switch --account user@contoso.com
```

> テナントを跨いで作業するときに `logout` → `login` を繰り返す必要はない。
> 複数アカウントをキャッシュしておき `auth-switch` で切り替える。

## テレメトリ

```bash
npx power-apps telemetry --show-settings
npx power-apps telemetry --disable
```

| オプション | 説明 |
|---|---|
| `-ts, --show-settings` | 現在の設定表示 |
| `-te, --enable` / `-td, --disable` | 有効化／無効化 |
| `-tc, --console-only <v>` | コンソール出力のみ（送信しない） |
| `-to, --output-to-console <v>` | 送信に加えてコンソールにも出力 |

> 顧客環境・機微データを扱うプロジェクトでは、着手時に `--show-settings` で状態を確認する。

## PAC CLI との対応表

`pac code` 系コマンドは将来非推奨予定（Learn 記載）。npm CLI が後継となる。

| PAC CLI | npm CLI | 備考 |
|---|---|---|
| `pac code init` | `power-apps init` | |
| `pac code push -s {名前}` | `power-apps push -s {GUID}` | **`-s` の値が名前と GUID で異なる** |
| `pac code run` | `power-apps run` | |
| `pac code add-data-source` | `power-apps add-data-source` | |
| `pac code delete-data-source` | `power-apps delete-data-source` | |
| `pac code list` | `power-apps list-codeapps` | 名称が異なる |
| `pac code list-datasets` | `power-apps list-datasets` | |
| `pac code list-tables` | `power-apps list-tables` | |
| `pac code list-sql-stored-procedures` | `power-apps list-sqlStoredProcedures` | ハイフンとキャメルケースの違いに注意 |
| `pac code list-connection-references` | `power-apps list-connection-references` | |
| （なし） | `refresh-data-source` / `find-dataverse-api` / `add-dataverse-api` / `add-flow` / `remove-flow` / `list-flows` / `list-connections` / `list-connectors` / `list-environment-variables` / `create-connection` / `auth-*` | npm CLI のみ |

> 現時点の本スキルの標準は `pac code push`（テナント解決の安定性のため）。
> npm CLI 主体への全面移行は別途検証のうえ切り替える。
