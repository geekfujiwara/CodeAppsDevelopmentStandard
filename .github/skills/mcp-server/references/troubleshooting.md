# 異常系・トラブルシュート

すべて実案件で実際に踏んだ事象。**恒久対策は `scripts/` に事前チェックとして組み込み済み**なので、
正常系のワークフローどおりに進めれば再発しない。ここは原因を理解したいときに読む。

---

## デプロイ

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

### publish がハングしたように見えて進捗が分からない

**原因**: PowerShell で `| Select-Object -Last N` を挟むと、コマンドの全出力がバッファされて完了まで何も表示されない。

**対処**: ログをファイルにリダイレクトし、別途 tail する。

```powershell
func azure functionapp publish <app> *> "$env:TEMP\publish.log"
Get-Content "$env:TEMP\publish.log" -Tail 30
```

---

## 認証・認可

### トークン取得が `AADSTS650057: Invalid resource ... List of valid resources from app registration: .`

**原因**: 末尾の一覧が空になっているとおり、**アプリ登録がスコープを 1 つも公開していない**。
加えて、公開してもクライアントが事前承認されていなければ同意が必要になり、非対話では取れない。

**対処**: `scripts/configure_entra_api.py` を実行する（SKILL.md の Step 2）。

### Graph が `InvalidValue: Property api.preAuthorizedApplications.delegatedPermissionIds has a Permission Id that cannot be found in the AppPermissions sets.`

**原因**: スコープの新規追加と、そのスコープ ID を参照する事前承認を**同一 PATCH** で送っている。
Graph は同一トランザクション内の新規スコープ ID を未登録として扱う。

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

---

## データアクセス

### Azure Files への REST 呼び出しが 403 になる

**原因**: OAuth トークンで Files を操作する場合、`x-ms-file-request-intent: backup` ヘッダーが必須。

**対処**: 全リクエストに固定で付与する。

### 共有（share）の作成が権限エラーになる

**原因**: `Storage File Data Privileged Contributor` などのデータプレーンロールには
共有作成の権限（`Microsoft.Storage/storageAccounts/fileServices/shares/write`）が含まれない。

**対処**: 共有はマネジメントプレーンで先に作成する。→ [private-data-seeding.md](private-data-seeding.md)

### ローカルから SQL / Storage に接続できない

**原因**: 組織ポリシーで `publicNetworkAccess=Disabled` が強制されている。仕様どおりの挙動。

**対処**: ポリシーと戦わない。VNet 統合済み Function App 内の一時的な管理エンドポイント経由で投入する。
→ [private-data-seeding.md](private-data-seeding.md)

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
