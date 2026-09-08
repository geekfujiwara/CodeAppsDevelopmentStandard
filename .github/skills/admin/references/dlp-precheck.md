# DLP 事前チェック（開発着手前に必ず実行）

Power Platform のデータ ポリシー（DLP）は、**どのコネクタを組み合わせられるか**を環境単位で制限する。
設計が終わってから発覚すると、コネクタ選定・アーキテクチャごとやり直しになるため、
**実装を始める前に**、そのソリューションが使うコネクタが利用可能かを確認する。

## いつ実行するか

- `architecture` スキルで構成を決めた直後（Phase 1 の最後）。環境チェック（[environment-check.md](environment-check.md)）の次に実行する。
- 自前 MCP Server / カスタムコネクタを新規に作る前と、Copilot Studio へ登録する前。
- 既存ソリューションに新しいコネクタを追加するとき。

## 前提

- 認証は `auth_helper.py` のキャッシュを使う。`Add-PowerAppsAccount` や `az login` は使わない。
- 管理 API の読み取りには Power Platform 管理者相当の権限が必要。権限がない場合は、
  管理者にこのスクリプトを実行してもらい、出力を共有してもらう。
- `.env` に `ENV_ID`（対象環境 ID）と `TENANT_ID` を設定しておく。

## Step 1: ソリューションが使うコネクタを洗い出す

| 構成要素 | 確認するコネクタ |
|---|---|
| Dataverse（Code Apps / MDA / エージェント） | `shared_commondataserviceforapps` |
| Copilot Studio エージェント | `shared_powervirtualagents` |
| Outlook / メール送信 | `shared_office365` |
| Teams 通知・チャット | `shared_teams` |
| SharePoint / ファイル | `shared_sharepointonline` |
| Azure SQL | `shared_sql` |
| 外部 API 呼び出し（HTTP） | `shared_http` |
| 自前 MCP Server / カスタムコネクタ | `--custom-host <ホスト名>` で指定 |

`--connector` には **通称も渡せる**（`sharepoint` → `shared_sharepointonline`）。
対応表は [コネクタ ID カタログ](../../standard/references/connector-catalog.json)。
一覧は `python .github/skills/standard/scripts/connector_catalog.py --list` で確認できる。
候補が複数になる通称（`azure` など）は問い合わせずに候補を出して停止するため、コネクタ ID で指定し直す。

## Step 2: 事前チェックを実行する

```powershell
python .github/skills/admin/scripts/check_dlp.py `
  --environment-id $env:ENV_ID `
  --tenant-id $env:TENANT_ID `
  --connector shared_commondataserviceforapps `
  --connector shared_office365 `
  --custom-host func-example-mcp.azurewebsites.net
```

読み取り専用でポリシーは変更しない。終了コードは 0（問題なし）/ 1（要解消）。

スクリプトは対象環境に**適用される**ポリシーだけを評価する
（`OnlyEnvironments` は一覧にあるとき、`ExceptEnvironments` は一覧にないときに適用）。

## Step 3: 結果をユーザーに提示する

判定は 3 種類。実装に入る前に、該当する場合はユーザー（および管理者）と解消方針を合意する。

| 判定 | 意味 | 対応 |
|---|---|---|
| `Blocked` | そのコネクタはこの環境で使えない | 代替コネクタへ設計変更、または管理者にポリシー変更を依頼 |
| Business / Non-business の混在 | 同一アプリ・フロー・エージェントで併用できない | どちらかのグループへ寄せる。寄せられないなら構成を分割する |
| 未分類（カスタムコネクタ） | `Ignore *` に委ねられ分類が確定していない。Copilot Studio でツールがブロック表示になることがある | Step 4 で明示分類する |

## Step 4: カスタムコネクタを明示分類する（必要な場合）

```powershell
# 既定は dry-run。変更前後の URL 規則を表示するだけ
python .github/skills/admin/scripts/set_dlp_custom_connector.py `
  --tenant-id $env:TENANT_ID `
  --policy "<ポリシーの表示名>" `
  --host func-example-mcp.azurewebsites.net `
  --classification General

# 内容を確認してから --apply を付けて適用する
```

- `--classification` は **併用する他のコネクタと同じグループ**にする
  （Dataverse が Non-business なら `General`）。違うグループにすると今度は混在で使えなくなる。
- 既存規則と末尾の `*` 規則は保持され、対象ホストの規則だけが先頭に追加される。
- テナント全体のポリシーを変更するため、**適用前に必ず dry-run の出力をユーザーに確認してもらう**。
- 反映には通常 1 時間程度（最大 24 時間）かかる。反映後に Step 2 を再実行して確認する。

## 参考

- [Connector classification](https://learn.microsoft.com/power-platform/admin/dlp-connector-classification)
- [Custom connector classification](https://learn.microsoft.com/power-platform/admin/dlp-custom-connector-parity)
- [Configure data policies for agents](https://learn.microsoft.com/microsoft-copilot-studio/admin-data-loss-prevention)
