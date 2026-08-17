# npm CLI リファレンス（`@microsoft/power-apps-cli`）

Code Apps 用 npm CLI（`npx power-apps`）の全コマンド一覧。

**推奨・検証環境（2026-08-17）**: `@microsoft/power-apps` **1.2.13** / `@microsoft/power-apps-cli` **0.15.3**。
本ドキュメントの内容は実際の `npx power-apps <command> --help` 出力に基づく。

> [!IMPORTANT]
> **PAC CLI（`pac`）とは別物**。`@microsoft/power-apps-cli` 0.15.x が提供するバイナリは
> `power-apps` と短縮 alias の `pa` で、
> `pac` は含まれない。PAC CLI は VS Code 拡張機能「Power Platform Tools」または
> `dotnet tool install --global Microsoft.PowerApps.CLI.Tool` で導入する（npm 配布なし）。

## 目次

- [導入と実行方法](#導入と実行方法)
- [バージョン方針](#バージョン方針)
- [全コマンド一覧](#全コマンド一覧)
- [グローバルオプション](#グローバルオプション)
- [アプリライフサイクル](#アプリライフサイクル)
- [アプリ共有](#アプリ共有)
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

`@microsoft/power-apps` **1.2.12 以降は `@microsoft/power-apps-cli` を依存に含まない**ため、
`@microsoft/power-apps` だけを依存に持つ状態で `npx power-apps` を実行すると
`npm error could not determine executable to run` になる（検証済 2026-08-10）。
**devDependencies に明示的に入れる**こと。

```bash
npm install @microsoft/power-apps@latest
npm install -D @microsoft/power-apps-cli@latest
npx power-apps --help
```

Node.js **22 以上**が必要（`engines: { "node": ">=22" }`）。

## バージョン方針

- 新規プロジェクトは `templates/generic-base/package.json` の**検証済み最新版**を使う。
- 既存プロジェクトを更新するときも SDK / CLI ともに npm の `latest` を候補とし、古い CLI へ固定しない。
- CLI は 0.x のため、例えば `^0.15.3` は 0.16.x へ自動更新されない。新しい minor を取り込むときは
	`@latest` を明示し、次の検証をすべて通してから採用する。
- SDK の推移的依存に CLI が含まれることを前提にせず、CLI は常に `devDependencies` へ直接指定する。

```bash
npm install @microsoft/power-apps@latest
npm install -D @microsoft/power-apps-cli@latest
npm ls @microsoft/power-apps @microsoft/power-apps-cli
npx power-apps --help
npx power-apps push --help
npx power-apps share --help
npm run build
python .github/skills/code-apps/scripts/validate_sample.py
python .github/skills/code-apps/scripts/validate_cli_reference.py
```

`validate_sample.py` は `templates/generic-base/package.json` を基準に全サンプルの SDK / CLI 範囲を検証する。
テンプレートの基準値を更新したら、全サンプルも同じ変更で同期する。

## 全コマンド一覧

| コマンド | 用途 |
|---|---|
| `init` | コードアプリの初期化（`power.config.json` 生成） |
| `push` | 環境へ発行 |
| `share` | 現在のコードアプリをユーザー／サービスプリンシパルへ共有 |
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
| `--cloud <cloud>` | `public`（既定・商用） / `usgov` / `usgovhigh` / `usgovdod` / `china` |

> `--cloud` は日本国内の通常テナントでは指定不要。GCC / DoD / 21Vianet 環境でのみ使用する。

> [!WARNING]
> CLI 0.13.0 は `push` / `add-data-source` / `list-codeapps` の `--environment-id` を実行時に拒否した。
> 0.15.3 では3コマンドともhelpに同オプションを公開する。0.13.0を使い続ける場合だけ、先に `init` で
> `power.config.json` を生成し、そこに保存された `environmentId` を使用する。

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
npx power-apps push --environment-id {ENVIRONMENT_ID} --solution-id {SOLUTION_ID}
```

| オプション | 説明 |
|---|---|
| `-e, --environment-id <GUID>` | デプロイ先の環境 ID |
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

## アプリ共有

### `share`

現在の `power.config.json` が指す Code App を、ユーザーまたはサービスプリンシパルへ共有する。
**通常利用者は既定の `play`** とし、共同開発者やデプロイ主体など編集が必要な principal に限って
`--access edit` を明示する。閲覧・実行だけの主体へ `edit` を付与しない。

| オプション | 説明 |
|---|---|
| `-p, --principal <principal>` | メールアドレスまたは Entra object ID。カンマ区切りで複数指定でき、object ID はユーザー／サービスプリンシパルのどちらも指定可能 |
| `--access <access>` | `play`（既定）または `edit`。最小権限のため通常は `play` |
| `-e, --environment-id <environment-id>` | 共有先の環境 ID。CI/CD と複数環境運用では必ず明示 |
| `--cloud <cloud>` | `public`（既定）/ `usgov` / `usgovhigh` / `usgovdod` / `china` |
| `--non-interactive` | 確認プロンプトを出さない。CI/CD では必須 |
| `--json` | 結果を機械可読な JSON で出力。CI/CD では必須 |

```bash
# ユーザーのメールアドレス（--access 省略時も play）
npx power-apps share --principal user@contoso.com

# ユーザーの Entra object ID
npx power-apps share --principal {USER_OBJECT_ID} --access play

# サービスプリンシパルの Entra object ID（application/client ID ではない）
npx power-apps share --principal {SERVICE_PRINCIPAL_OBJECT_ID} --access play

# 複数主体を 1 回で共有
npx power-apps share \
	--principal "user@contoso.com,{USER_OBJECT_ID},{SERVICE_PRINCIPAL_OBJECT_ID}" \
	--access play

# 共同開発者だけ edit を明示
npx power-apps share --principal {DEVELOPER_USER_OBJECT_ID} --access edit
```

#### push 後の CI/CD 標準

共有はデプロイ成功後にだけ実行する。環境ごとの principal 一覧は CI/CD の環境変数または変数グループで管理し、
リポジトリへ実値をコミットしない。商用クラウドでは `--cloud public` を省略できるが、ソブリンクラウドでは
対象値を明示する。

```bash
# Bash を使う CI runner 向け（PowerShell runner では行継続と環境変数構文を読み替える）
set -euo pipefail

npx power-apps push \
	--environment-id "${ENVIRONMENT_ID}" \
	--solution-id "${SOLUTION_ID}"

npx power-apps share \
	--environment-id "${ENVIRONMENT_ID}" \
	--cloud "${POWER_APPS_CLOUD:-public}" \
	--principal "${CODE_APP_PLAY_PRINCIPALS}" \
	--access play \
	--non-interactive \
	--json > share-result.json
```

`CODE_APP_PLAY_PRINCIPALS` はメールアドレス／object ID のカンマ区切りとする。`edit` 対象が必要な場合は
`CODE_APP_EDIT_PRINCIPALS` を別変数にし、空でない場合だけ 2 回目の `share --access edit` を実行する。
`--environment-id` は push と share で同じ値を渡し、別環境への共有を防ぐ。

CLI help と本節の整合は次で検証する。スクリプトはテンプレートの
`@microsoft/power-apps-cli` バージョンを読み、実際の `share --help` に主要オプションがあることと、
本節に全オプション・ユーザー／サービスプリンシパル例・自動化例があることを確認する。

```bash
python .github/skills/code-apps/scripts/validate_cli_reference.py
```

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

以下のコマンドがブラウザを開く場合は、実行前に
[ブラウザ自動化方針](../../standard/references/browser-automation.md)に従い、
`AskUserQuestion` で使用する Edge プロファイルを確認する。回答前は実行しない。

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
| （なし） | `share` / `refresh-data-source` / `find-dataverse-api` / `add-dataverse-api` / `add-flow` / `remove-flow` / `list-flows` / `list-connections` / `list-connectors` / `list-environment-variables` / `create-connection` / `auth-*` | npm CLI のみ |

> 本スキルの標準は npm CLI。実行前に `auth-status` / `auth-switch` で対象テナントの
> アカウントを明示する。`pac code` は npm CLI で解消できない場合のみ移行時の代替手段として使う。
