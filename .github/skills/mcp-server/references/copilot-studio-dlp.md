# Copilot Studio MCP の DLP 診断

Copilot Studio の MCP Server は Power Platform のカスタムコネクタとして DLP 評価される。
`This tool is blocked by your data loss prevention policy` が表示されたら、OAuth 接続エラーとは分けて診断する。

## 前提

- 読み取りには対象環境の管理権限、変更には Power Platform 管理者または対象ポリシーを編集できる権限が必要。
- 認証は [standard スキルの `auth_helper.py`](../../standard/references/auth-patterns.md) に統一する。
  PowerShell の `Add-PowerAppsAccount`、Azure CLI、独自の MSAL 実装、ブラウザ認証を追加しない。
- `TENANT_ID` を `.env` に設定し、standard スキルの認証キャッシュを事前に作成しておく。
- カスタムコネクタは、環境レベルポリシーではコネクタ ID、テナントレベルポリシーでは Host URL パターンで
  分類される。環境レベルの明示分類がある場合は URL パターンより優先される。
- `Business` が常に正解とは限らない。エージェント内でデータを受け渡すコネクタは同じグループに置く。

## Step 1: 読み取り診断を実行する

```powershell
python .github/skills/mcp-server/scripts/diagnose_copilot_dlp.py `
  --environment-id $env:POWER_PLATFORM_ENVIRONMENT_ID `
  --connector-host $env:MCP_CONNECTOR_HOST `
  --tenant-id $env:TENANT_ID
```

スクリプトは `auth_helper.get_token()` から次のキャッシュ済みトークンを取得する。

| API | スコープ | 用途 |
|---|---|---|
| BAP Governance API | `https://api.bap.microsoft.com/.default` | DLP ポリシーと Host URL 規則の取得 |
| Power Apps Admin API | `https://service.powerapps.com/.default` | 対象環境のカスタムコネクタ取得 |

PowerShell 管理モジュールが使用する管理 API を読み取り専用で呼び、次を表示する。

1. 対象環境で見つかったカスタムコネクタ。
2. 対象環境に適用される DLP ポリシー。
3. コネクタの明示分類、または未分類時の既定グループ。
4. Host URL に一致するテナントレベルの URL パターン。

`OnlyEnvironments` は対象環境が一覧にある場合だけ適用し、`ExceptEnvironments` は一覧にない場合に適用する。
この判定をせず全ポリシーを一括編集してはいけない。

## Step 2: Copilot Studio の違反詳細と照合する

Copilot Studio で公開エラーの **Details > Download** を選び、次を確認する。

- 違反したポリシー名
- ブロックまたはグループ不一致になったコネクタ名
- 対象リソースと環境

診断結果に `Blocked` 規則がなく、違反詳細にも対象 MCP が出ない場合は DLP を変更しない。
OAuth 接続を作り直し、ツールを開き直してから再評価する。

## Step 3: 管理者が最小変更する

DLP ポリシーの書き込みには安定した公開 REST 契約がないため、診断スクリプトは変更を行わない。
Power Platform 管理センターで、違反詳細に示されたポリシーだけを編集する。

1. **Security > Data and privacy > Data policy** を開く。
2. 違反したポリシーを選ぶ。
3. 環境レベルポリシーでは対象カスタムコネクタ 1 件だけを、連携先と同じグループへ移す。
4. テナントレベルポリシーでは **Custom connectors** で対象 Host の規則だけを追加または変更する。
5. `*` 規則、他の Host 規則、対象外環境は変更しない。

既に別グループへ明示分類されている場合、削除と追加による API 更新は非アトミックになる。
公開スキルでは自動実行せず、管理センターの差分確認を通して更新する。

## Step 4: 再評価する

ポリシー変更は通常 1 時間以内、最大 24 時間の反映遅延があり得る。反映後に診断スクリプトを再実行し、
接続を再作成して Copilot Studio でツールを開き直してから公開する。

## 公式情報

- [PowerShell support for Power Apps and Power Automate](https://learn.microsoft.com/power-platform/admin/powerapps-powershell)
- [Connector classification](https://learn.microsoft.com/power-platform/admin/dlp-connector-classification)
- [Custom connector classification](https://learn.microsoft.com/power-platform/admin/dlp-custom-connector-parity)
- [Configure data policies for agents](https://learn.microsoft.com/microsoft-copilot-studio/admin-data-loss-prevention)