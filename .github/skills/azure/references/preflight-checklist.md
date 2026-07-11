# azure スキル — 事前確認チェックリスト (実装前に「Sure」にする)

強制ポリシーで想定が覆るため、**実装前に環境制約を確定**させる。読み取りは MFA 不要、書込は MFA 必須。

| # | 確認項目 | 目的 | 確認方法(例) |
|---|---|---|---|
| 1 | データストレージのリージョン / SKU | VNet/PE/コンピュートを同一(近接)リージョンに揃える | `az storage account show -n <DATA_STORAGE> -g <RG> --query "{loc:location,sku:sku.name}"` |
| 2 | **強制ポリシーの対象リソース型** | 案 A / 案 B の分岐（コンピュートも公開禁止か） | ポリシー定義の `policyRule.if` を確認（例: `*_PublicNetwork_Modify` の対象型） |
| 3 | リソースプロバイダ登録 | PE/DNS/コンピュート作成可否 | `az provider show --namespace Microsoft.Network/Web/App --query registrationState` |
| 4 | VNet 統合対応プランの当該リージョン可用性 | バックエンド選定（Flex Consumption 等） | Learn MCP / `az functionapp list-flexconsumption-locations` |
| 5 | フロントの linked backend 対応可否 | `/api` 委譲構成の可否（プラン要件） | フロントのプラン/SKU を確認 |
| 6 | ARM 書込の MFA / リージョン制限ポリシー | 構築時の認証・配置 | 書込を1つ試す / 管理グループのポリシー割り当てを確認 |
| 7 | リソース作成権限 | 構築主体（所有者 / 貢献者） | `az role assignment list --assignee <me> --scope <RG>` |
| 8 | 既存インフラの有無 | VNet 等の再利用・重複作成回避 | `az resource list -g <RG> --query "[].{n:name,t:type}"` |

## 判断の要点
- **VNet 統合は outbound のみ**に作用する。公開可否（inbound）は別設定。設計はここを先に確定する。
- **Private Link はネットワークポリシー / NSP の影響を受けない**（常に到達）。これを土台にする。
- 公式仕様（API 名・フラグ・可用性）は **Microsoft Learn MCP** で裏取りし、推測を残さない。
