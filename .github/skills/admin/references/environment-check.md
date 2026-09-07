# 環境チェックの判定基準

`scripts/check_environment.py` が確認する項目と、その判定に使っている API・データソース。
すべて読み取り専用で、設定は一切変更しない。

## 判定項目

| # | 項目 | 判定ソース | OK の条件 |
|---|---|---|---|
| 1 | 環境の基本情報 | BAP `GET /providers/Microsoft.BusinessAppPlatform/scopes/admin/environments/{env}?api-version=2021-04-01` | 表示のみ（名前 / SKU / リージョン） |
| 2 | 既定環境ではないか | `properties.isDefault` / `properties.environmentSku` | `isDefault=false` かつ SKU が `Default` 以外 |
| 3 | 環境の状態 | `properties.states.runtime.id` | `Enabled` |
| 4 | マネージド環境 | `properties.governanceConfiguration.protectionLevel` | `Standard`（共有制限・ソリューション チェッカーの現在値も表示） |
| 5 | Dataverse | `properties.linkedEnvironmentMetadata.instanceUrl` / `instanceState` | `instanceState=Ready` |
| 6 | 監査 | Dataverse `organizations.isauditenabled` | `true` |
| 7 | Dataverse MCP | Dataverse `organizations.orgdborgsettings` の `IsMCPEnabled` | `true` |
| 8 | MCP クライアント許可 | Dataverse `allowedmcpclients`（`isenabled`） | 有効な行が 1 件以上 |
| 9 | Code Apps | Dataverse `canvasapps` の `canvasapptype eq 4`（= Code App） | 1 件以上存在する |
| 10 | セキュリティ ロール | `WhoAmI()` + `systemuserroles_association` + チーム経由の `teamroles_association` | System Administrator を保持 |
| 11 | 管理 API アクセス | BAP `GET /providers/PowerPlatform.Governance/v1/policies` | 呼び出しが成功する（管理者ロール相当） |
| 12 | 適用される DLP | 同上（`OnlyEnvironments` / `ExceptEnvironments` を解釈） | 表示のみ |

## 判定レベル

| レベル | 意味 |
|---|---|
| `OK` | 問題なし |
| `INFO` | 参考情報（合否に影響しない） |
| `WARN` | 用途によっては問題。`--require-*` を付けると `NG` に昇格する |
| `NG` | 開発着手前に解消が必要。終了コード 1 |

昇格オプション:

| オプション | 昇格対象 | 使う場面 |
|---|---|---|
| `--require-managed` | マネージド環境 | Code Apps・環境グループのルールを使う構成 |
| `--require-code-apps` | Code Apps | Code Apps を開発・デプロイする構成 |
| `--require-mcp` | Dataverse MCP | Copilot Studio / Cowork から Dataverse MCP を使う構成 |

## 注意点

- **Dataverse 側の項目（#6〜#10）は `.env` の `DATAVERSE_URL` が対象環境の `instanceUrl` と
  一致するときだけ実行される。** 一致しない場合は誤った組織を検査しないよう `WARN` を出してスキップする。
- **Code Apps の「許可する」トグル自体を読む公開 API は無い。** 代わりに環境内にコード アプリが
  存在するかで判定している（存在すれば機能は有効）。0 件の場合は `WARN` になるので、
  管理センター（環境 > 設定 > 製品 > 機能）でトグルを確認する。
- 管理 API アクセス（#11）が `WARN` の場合、DLP の確認は管理者に依頼する必要がある。
  権限の一覧は [admin-roles.md](admin-roles.md) を参照。

## 参考

- [環境の管理](https://learn.microsoft.com/power-platform/admin/environments-administration)
- [マネージド環境の概要](https://learn.microsoft.com/power-platform/admin/managed-environment-overview)
- [Dataverse の監査](https://learn.microsoft.com/power-platform/admin/manage-dataverse-auditing)
