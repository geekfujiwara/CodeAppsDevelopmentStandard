# npm CLI リファレンス（`@microsoft/power-apps-cli`）

Code Apps 用 npm CLI（`npx pa`）の全コマンド一覧。

**推奨・検証環境**: `@microsoft/power-apps` **1.3.0** / `@microsoft/power-apps-cli` **1.0.1**。
本ドキュメントの内容は実際の `npx pa <group> <command> --help` 出力と実行検証に基づく。

> [!IMPORTANT]
> **bin 名は `pa`**。CLI 1.0.x で実行ファイル名が `power-apps` から **`pa`** にリネームされ、
> コマンドも `auth` / `app` / `connector` / `connection` / `solution` / `telemetry` の **group 制**に変わった。
> 旧名を呼ぶと `npm error could not determine executable to run` だけが出て原因が見えない。
> 旧名 → 新名の対応は [旧コマンド対応表](#旧コマンド対応表)。

> [!IMPORTANT]
> **PAC CLI（`pac`）とは別物**。`@microsoft/power-apps-cli` 1.x が提供するバイナリは `pa` だけで、
> `pac` は含まれない。PAC CLI は VS Code 拡張機能
> 「Power Platform Tools」または `dotnet tool install --global Microsoft.PowerApps.CLI.Tool` で導入する（npm 配布なし）。

## 目次

- [導入と実行方法](#導入と実行方法)
- [バージョン方針](#バージョン方針)
- [全コマンド一覧](#全コマンド一覧)
- [旧コマンド対応表](#旧コマンド対応表)
- [--help に載っているが拒否されるフラグ](#--help-に載っているが拒否されるフラグ)
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
`@microsoft/power-apps` だけを依存に持つ状態で `npx pa` を実行すると
`npm error could not determine executable to run` になる。
**devDependencies に明示的に入れる**こと。

```bash
npm install @microsoft/power-apps@latest
npm install -D @microsoft/power-apps-cli@latest
npx pa --help
```

Node.js **22 以上**が必要（`engines: { "node": ">=22" }`）。

## バージョン方針

- 新規プロジェクトは `templates/generic-base/package.json` の**検証済み最新版**を使う。
- 既存プロジェクトを更新するときも SDK / CLI ともに npm の `latest` を候補とし、古い CLI へ固定しない。
- CLI は 1.x 系で、`^1.0.0` を使うと 1.x の更新に追従する。bin 名と group コマンドの変更実績があるため、
	`npx pa --help` / `npx pa app --help` で実際の署名を確認してから採用する。
- SDK の推移的依存に CLI が含まれることを前提にせず、CLI は常に `devDependencies` へ直接指定する。
- **CLI を上げたら `npm run predeploy` を必ず通す**。チェック 11 が package.json のデプロイコマンドと
	インストール済み bin 名・group 形式の不一致を検出する。

```bash
npm install @microsoft/power-apps@latest
npm install -D @microsoft/power-apps-cli@latest
npm ls @microsoft/power-apps @microsoft/power-apps-cli
npx pa --help
npx pa app --help
npx pa app push --help
npx pa app share --help
npm run build
npm run predeploy
python .github/skills/code-apps/scripts/validate_sample.py
python .github/skills/code-apps/scripts/validate_cli_reference.py
```

`validate_sample.py` は `templates/generic-base/package.json` を基準に全サンプルの SDK / CLI 範囲を検証する。
テンプレートの基準値を更新したら、全サンプルも同じ変更で同期する。

## 全コマンド一覧

コマンドは 6 つの group に分かれている。

| group | コマンド | 用途 |
|---|---|---|
| `auth` | `login` / `logout` / `status` / `switch` | サインインとアクティブアカウント切り替え |
| `app` | `init` | コードアプリの初期化（`power.config.json` 生成） |
| `app` | `push` | 環境へ発行 |
| `app` | `share` | ユーザー／サービスプリンシパルへ共有 |
| `app` | `run` | ローカルサーバー起動 |
| `app` | `list` | 環境内のコードアプリ一覧 |
| `app` | `add data-source` / `remove data-source` / `refresh data-source` | データソースの追加・削除・再生成 |
| `app` | `add dataverse-api` / `find-dataverse-api` | Dataverse アクション／関数の検索と追加 |
| `app` | `add flow` / `remove flow` / `list-flows` | クラウドフロー連携 |
| `app` | `list-environment-variables` | 環境変数の棚卸し |
| `app` | `get-settings` / `set-setting` | `power.config.json` の参照と更新 |
| `connector` | `list` | 利用可能なコネクタ一覧 |
| `connection` | `list` / `create` | 接続の一覧と新規作成 |
| `connection` | `list-references` | 接続参照一覧 |
| `connection` | `list-datasets` / `list-tables` / `list-procedures` | データセット／テーブル／SP 一覧 |
| `solution` | `list` ほか | ソリューション操作 |
| `telemetry` | — | テレメトリ設定 |

## 旧コマンド対応表

旧手順書や旧テンプレートを移行するときの対応。

| 旧（≤ 0.13.x） | 新（1.0.x） |
|---|---|
| `npx power-apps init` | `npx pa app init` |
| `npx power-apps push` | `npx pa app push` |
| `npx power-apps share` | `npx pa app share` |
| `npx power-apps run` | `npx pa app run` |
| `npx power-apps add-data-source --api-id X --resource-name Y` | `npx pa app add data-source --connector X` |
| `npx power-apps refresh-data-source` | `npx pa app refresh data-source` |
| `npx power-apps delete-data-source` | `npx pa app remove data-source` |
| `npx power-apps add-dataverse-api` | `npx pa app add dataverse-api` |
| `npx power-apps find-dataverse-api` | `npx pa app find-dataverse-api` |
| `npx power-apps add-flow` / `remove-flow` | `npx pa app add flow` / `npx pa app remove flow` |
| `npx power-apps list-flows` | `npx pa app list-flows` |
| `npx power-apps list-codeapps` | `npx pa app list` |
| `npx power-apps list-environment-variables` | `npx pa app list-environment-variables` |
| `npx power-apps list-connectors` | `npx pa connector list` |
| `npx power-apps list-connections` | `npx pa connection list` |
| `npx power-apps list-connection-references` | `npx pa connection list-references` |
| `npx power-apps create-connection` | `npx pa connection create` |
| `npx power-apps list-datasets` / `list-tables` / `list-sqlStoredProcedures` | `npx pa connection list-datasets` / `list-tables` / `list-procedures` |
| `npx power-apps login` / `logout` | `npx pa auth login` / `npx pa auth logout` |
| `npx power-apps auth-status` / `auth-switch` | `npx pa auth status` / `npx pa auth switch` |
| `npx power-apps telemetry` | `npx pa telemetry` |

## --help に載っているが拒否されるフラグ

1.0.1 で実測した不一致。`--help` をそのまま信用しない。

| コマンド | 拒否されるフラグ | エラー | 代替 |
|---|---|---|---|
| `pa app push` | `-e` / `--environment-id` | `error: unknown option '-e'` | `power.config.json` の `environmentId` が使われる |
| `pa app add data-source` | `--environment-id` | `error: unknown option '--environment-id'` | 同上 |
| `pa app add data-source` | `--api-id` / `--resource-name` | 廃止 | `--connector <connectorId>` に統合 |

対象環境を切り替えたい場合は `npx pa app init --environment-id {ID}` をやり直すか、
`npx pa app set-setting` で `power.config.json` を更新する。

## グローバルオプション

全コマンド共通。

| オプション | 説明 |
|---|---|
| `--non-interactive` | プロンプトを出さない。必要な値はフラグか環境変数で渡す（CI 用） |
| `--json` | 出力を JSON 化（`list` 系をスクリプトから使うときに必須） |
| `--no-color` | 色付けを無効化 |
| `-v, --version` / `-h, --help` | バージョン／ヘルプ |
| `--cloud <cloud>` | `public`（既定・商用） / `usgov` / `usgovhigh` / `usgovdod` / `china` |

> `--cloud` は日本国内の通常テナントでは指定不要。GCC / DoD / 21Vianet 環境でのみ使用する。

> [!WARNING]
> `-e, --environment-id` は **`app init` と `app share` でしか使えない**。
> `app push` / `app add data-source` は `--help` に載っていても実行時に拒否する。
> これらのコマンドは `power.config.json` の `environmentId` を使う。

## アプリライフサイクル

### `app init`

```bash
npx pa app init --environment-id {ENVIRONMENT_ID} --display-name "AppName" --app-type CodeApp --non-interactive
```

| オプション | 説明 |
|---|---|
| `-e, --environment-id` | 対象環境 ID（`power.config.json` に保存される） |
| `-t, --app-type` | `CodeApp` または `MobileApp` |
| `-n, --display-name` | 表示名 |
| `-d, --description` | 説明 |
| `-b, --build-path` | ビルド出力パス（既定 `./dist`） |
| `-f, --file-entry-point` | エントリポイントファイル |
| `-a, --app-url` | ローカル実行 URL |
| `-l, --logo-path` | ロゴファイルパス |

### `app push`

```bash
npx pa app push --solution-id {SOLUTION_ID}
```

| オプション | 説明 |
|---|---|
| `-s, --solution-id <GUID>` | 追加先ソリューションの **ID（GUID）** |

> [!WARNING]
> **`-e` / `--environment-id` は拒否される**。`--help` には載っているが、実行すると
> `error: unknown option '-e'` で失敗する。デプロイ先は `power.config.json` の `environmentId`。

> [!WARNING]
> **`-s` は GUID のみ**を受け付ける。0.12.3 まではソリューション**名**を
> 渡すと内部で GUID に解決していたが、0.13.0 以降は
> `Invalid --solution-id value: expected a GUID, got '<値>'.` で即失敗する。
> `pac code push -s` はソリューション**名**なので、値を取り違えないこと。
> `-s` 省略時の自動解決挙動は [ソリューション ALM](solution-alm.md) を参照。

### `app run`

```bash
npx pa app run --port 8080 --local-app-url http://localhost:3000
```

`-p, --port` / `-l, --local-app-url` を指定できる。

## アプリ共有

### `app share`

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
npx pa app share --principal user@contoso.com

# ユーザーの Entra object ID
npx pa app share --principal {USER_OBJECT_ID} --access play

# サービスプリンシパルの Entra object ID（application/client ID ではない）
npx pa app share --principal {SERVICE_PRINCIPAL_OBJECT_ID} --access play

# 複数主体を 1 回で共有
npx pa app share \
	--principal "user@contoso.com,{USER_OBJECT_ID},{SERVICE_PRINCIPAL_OBJECT_ID}" \
	--access play

# 共同開発者だけ edit を明示
npx pa app share --principal {DEVELOPER_USER_OBJECT_ID} --access edit
```

#### push 後の CI/CD 標準

共有はデプロイ成功後にだけ実行する。環境ごとの principal 一覧は CI/CD の環境変数または変数グループで管理し、
リポジトリへ実値をコミットしない。商用クラウドでは `--cloud public` を省略できるが、ソブリンクラウドでは
対象値を明示する。

```bash
# Bash を使う CI runner 向け（PowerShell runner では行継続と環境変数構文を読み替える）
set -euo pipefail

# push に --environment-id は渡せない。対象環境は power.config.json で固定する
npx pa app push --solution-id "${SOLUTION_ID}"

npx pa app share \
	--environment-id "${ENVIRONMENT_ID}" \
	--cloud "${POWER_APPS_CLOUD:-public}" \
	--principal "${CODE_APP_PLAY_PRINCIPALS}" \
	--access play \
	--non-interactive \
	--json > share-result.json
```

`CODE_APP_PLAY_PRINCIPALS` はメールアドレス／object ID のカンマ区切りとする。`edit` 対象が必要な場合は
`CODE_APP_EDIT_PRINCIPALS` を別変数にし、空でない場合だけ 2 回目の `share --access edit` を実行する。
`share` の `--environment-id` には `power.config.json` と同じ環境を渡し、別環境への共有を防ぐ。

CLI help と本節の整合は次で検証する。スクリプトはテンプレートの
`@microsoft/power-apps-cli` バージョンを読み、実際の `app share --help` に主要オプションがあることと、
本節に全オプション・ユーザー／サービスプリンシパル例・自動化例があることを確認する。

```bash
python .github/skills/code-apps/scripts/validate_cli_reference.py
```

## データソース

### `app add data-source`

```bash
npx pa app add data-source --connector shared_commondataserviceforapps \
  --connection-ref {CONNECTION_REFERENCE_LOGICAL_NAME} \
  --solution-id {SOLUTION_ID} \
  --org-url {DATAVERSE_URL} \
  --non-interactive
```

| オプション | 説明 |
|---|---|
| `--connector` | コネクタ ID（`shared_commondataserviceforapps`, `shared_sql` など）。旧 `--api-id` の後継 |
| `-c, --connection-id` | 接続 ID（ソリューションに入らない。PoC 用） |
| `--connection-ref` | 接続参照名（**ALM 標準**） |
| `-d, --dataset` | データセット識別子 |
| `-u, --org-url` | 組織 URL |
| `-sp, --sql-stored-procedure` | SQL ストアドプロシージャ名 |
| `-s, --solution-id` | ソリューション ID（`--connection-ref` と併用） |

> [!WARNING]
> `--environment-id` は拒否される（`error: unknown option '--environment-id'`）。
> 旧版の `--api-id` / `--resource-name` は廃止され、`--connector` に統合された。

### `app refresh data-source`

Dataverse 側でテーブル定義（列追加・型変更など）を変えた後、生成コードを追従させる。

```bash
npx pa app refresh data-source                          # 全データソース
npx pa app refresh data-source -n {DATA_SOURCE_NAME}    # 個別
```

> テーブルに列を足したのに生成型に出てこない場合は、まずこれを実行する。

### `app remove data-source`

```bash
npx pa app remove data-source --data-source-name {NAME} --force
```

`-f, --force` で確認プロンプトを省略（CI 用）。`-sp` で SQL ストアドプロシージャ単位の削除も可能。

## Dataverse API（アクション／関数）

カスタム API・カスタムアクション・OOB 関数を型付きで呼び出せるようにする。

```bash
# 1. 名前で検索して正確な API 名を特定する
npx pa app find-dataverse-api --search "account" --json

# 2. アプリに追加する
npx pa app add dataverse-api --api-name {API_NAME}
```

> フロー呼び出し（`app add flow`）と違い、**Dataverse ネイティブのアクション／関数**が対象。
> `WinOpportunity` のような OOB 操作や、`msdyn_` 系のカスタム API を型安全に叩ける。

## 探索系（list）

いずれも `--json` を付けるとスクリプトからパースできる。エージェントが値を自動取得する場合は `--json` 必須。

| コマンド | 主なオプション | 用途 |
|---|---|---|
| `pa app list` | — | 環境内のコードアプリ棚卸し |
| `pa connection list` | `-s, --search` | 接続 ID の特定 |
| `pa connector list` | `-s, --search` | `--connector` に渡す値の特定 |
| `pa connection list-references` | `-s, --solution-id` | 接続参照の論理名確認 |
| `pa app list-environment-variables` | — | 環境変数の棚卸し |
| `pa connection list-datasets` | `-c, --connection-id` | SQL 等のデータベース一覧 |
| `pa connection list-tables` | `-c` / `-d, --dataset` | テーブル一覧 |
| `pa connection list-procedures` | `-c` / `-d` | ストアドプロシージャ一覧 |
| `pa app list-flows` | `-s, --search` | 呼び出し可能なフローと ID の特定 |

```bash
# 例: コネクタ ID → 接続 ID → データセット → テーブル の順に絞り込む
npx pa connector list --search sharepoint --json
npx pa connection list --search sharepoint --json
```

## クラウドフロー

```bash
# 1. 呼び出せるフローと GUID を確認
npx pa app list-flows --search "approval" --json

# 2. アプリに追加
npx pa app add flow --flow-id {FLOW_ID}

# 3. 削除（名前 or ID のどちらか）
npx pa app remove flow --flow-name {FLOW_DATA_SOURCE_NAME}
npx pa app remove flow --flow-id {FLOW_ID}
```

> `list-flows` が返すのは**ソリューション内**かつ Power Apps から呼び出せるフローのみ。
> 対象が出てこない場合は、フローがソリューションに含まれているかを先に確認する。

## 接続

以下のコマンドがブラウザを開く場合は、実行前に
[ブラウザ自動化方針](../../standard/references/browser-automation.md)に従い、
`AskUserQuestion` で使用する Edge プロファイルを確認する。回答前は実行しない。

```bash
npx pa connection create --connector {CONNECTOR_ID} --display-name "Prod SQL"
```

SSO 専用コネクタはサイレント SSO、それ以外はブラウザが開いてサインインする。

> 接続**参照**（Connection Reference）を新規作成する CLI コマンドは存在しない。
> ALM 対応が必要な場合は `scripts/setup_connection_reference.py` を使う
> （[ソリューション ALM](solution-alm.md)）。

## 認証

PAC CLI とは**別のトークンキャッシュ**を持つ。`pac auth create` 済みでも、npm CLI 側は別途サインインが要る。

| コマンド | 説明 |
|---|---|
| `pa auth login` | サインインしてアカウントをローカルキャッシュに追加。`--non-interactive` でもブラウザは開く |
| `pa auth logout` | **キャッシュ済みアカウントを全消去**。アクティブアカウントの切り替え目的で使わない |
| `pa auth status` | キャッシュ済みアカウント一覧（アクティブなものに印が付く） |
| `pa auth switch` | アクティブアカウントの切り替え。`--account {email}` 省略時は対話選択、`--non-interactive` では必須 |

```bash
npx pa auth status --json
npx pa auth switch --account user@contoso.com
```

> テナントを跨いで作業するときに `auth logout` → `auth login` を繰り返す必要はない。
> 複数アカウントをキャッシュしておき `auth switch` で切り替える。

## テレメトリ

```bash
npx pa telemetry --show-settings
npx pa telemetry --disable
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
| `pac code init` | `pa app init` | |
| `pac code push -s {名前}` | `pa app push -s {GUID}` | **`-s` の値が名前と GUID で異なる** |
| `pac code run` | `pa app run` | |
| `pac code add-data-source` | `pa app add data-source` | |
| `pac code delete-data-source` | `pa app remove data-source` | |
| `pac code list` | `pa app list` | |
| `pac code list-datasets` | `pa connection list-datasets` | |
| `pac code list-tables` | `pa connection list-tables` | |
| `pac code list-sql-stored-procedures` | `pa connection list-procedures` | |
| `pac code list-connection-references` | `pa connection list-references` | |
| （なし） | `app share` / `app refresh data-source` / `app find-dataverse-api` / `app add dataverse-api` / `app add flow` / `app remove flow` / `app list-flows` / `connection list` / `connector list` / `app list-environment-variables` / `connection create` / `auth *` | npm CLI のみ |

> 本スキルの標準は npm CLI。実行前に `pa auth status` / `pa auth switch` で対象テナントの
> アカウントを明示する。`pac code` は npm CLI で解消できない場合のみ移行時の代替手段として使う。
