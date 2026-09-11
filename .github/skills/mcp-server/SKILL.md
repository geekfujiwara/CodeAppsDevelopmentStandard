---
name: mcp-server
description: "Copilot Studio から利用する自前 MCP Server を Azure Functions 上に構築する。JSON-RPC 2.0 の最小実装、受信 Entra ID JWT 検証 / 送信 Managed Identity のキーレス認証、Private Endpoint 下でのデータ投入、Entra アプリ登録のスコープ公開と事前承認、デプロイの実測検証までを非対話スクリプトで完結させる。"
category: architecture
triggers:
  - "MCP Server"
  - "MCP サーバー 自作"
  - "カスタム MCP"
  - "Copilot Studio に MCP を追加"
  - "Azure Functions で MCP"
  - "tools/list"
  - "tools/call"
  - "JSON-RPC エージェント"
  - "基幹データをエージェントに繋ぐ"
  - "AADSTS650057"
  - "func publish 失敗"
  - "Entra スコープ公開"
---

# MCP Server 開発スキル

Copilot Studio のエージェントから **社内の業務データ（DB・ファイル共有・業務 API）** を参照させるための
**自前 MCP Server** を Azure Functions 上に構築する。

> **役割分離**: VNet / Private Endpoint / Managed Identity といった **Azure 基盤の構成**は
> [azure スキル](../azure/SKILL.md) に委譲する。本スキルは **MCP プロトコル層・Entra 認可・データ投入・
> Copilot Studio 登録** を担当する。

## 設計原則

| 原則 | 内容 |
|---|---|
| **データ層は非公開、コンピュート層は公開** | SQL / Storage は Private Endpoint のみ。Function App の HTTP エンドポイントは公開する（Copilot Studio は SaaS からアウトバウンド接続するため、非公開にすると到達できない） |
| **キーレス** | 受信 = Entra ID Bearer JWT 検証、送信 = Managed Identity。関数キー・接続文字列・共有キーを使わない |
| **プロトコルは最小実装** | `initialize` / `tools/list` / `tools/call` / `ping` のみ。SSE ストリーム・セッション管理は実装しないが、**Streamable HTTP の規約には従う**（Copilot Studio は Streamable のみ対応） |
| **成否はルート実測で判定** | デプロイの終了コードや ARM のメタデータを信用せず、HTTP プローブで実際のルートを確認する |
| **非対話で完走** | Azure 操作も `auth_helper` 経由（`az login` を手順に含めない）。→ [認証リファレンス](../standard/references/auth-patterns.md) |

## サブリファレンス

| リファレンス | 内容 |
|---|---|
| [MCP プロトコル最小実装](references/protocol.md) | JSON-RPC 2.0 の実装と Streamable HTTP の必須要件、ツール定義の書き方 |
| [認証モデル](references/auth-model.md) | 受信 JWT 検証 / 送信 Managed Identity の実装 |
| [Private 環境でのデータ投入](references/private-data-seeding.md) | Private Endpoint 下でシードするための管理エンドポイントパターン |
| [ファイルを読ませるツールの設計](references/file-backed-tools.md) | サイドカーテキストレイヤー・パストラバーサル対策・出力上限・プロンプトインジェクション防御 |
| [SQL バックエンドのツール設計](references/sql-tools-pattern.md) | パラメータ化クエリ・集計軸のホワイトリスト・トークン寿命と接続プール・読み取り専用権限 |
| [File / DB の認可とページ画像](references/indexed-file-db-access.md) | 本人認可、索引 ID、改訂・ページ照合、投入時画像キャッシュ、欠損404と実測ゲート |
| [Copilot Studio への登録](references/copilot-studio-registration.md) | オンボーディングウィザード、コピペ用 MD 生成、OAuth 接続。OpenAPI 方式もここ |
| [Copilot Studio の DLP 診断](references/copilot-studio-dlp.md) | MCP ツールが DLP でブロックされた場合の読み取り診断と最小変更 |
| [admin スキル](../admin/SKILL.md) | 実装着手前の環境チェックと DLP 事前チェック、カスタムコネクタの DLP 分類変更 |
| [.env サンプル](references/.env.example) | 本スキルのパラメータ |
| [異常系・トラブルシュート](references/troubleshooting.md) | 実際に踏んだ失敗と恒久対策 |

---

## ワークフロー（正常系）

### Step 1: ツール定義を先に確定する

MCP は「エージェントがツール名と入力スキーマだけを見て呼ぶ」ため、**実装より先にツール定義を決める**。

1. 接続するデータソース（Azure SQL / Azure Files / 業務 API）を列挙する。
2. データソースごとに **1 つの MCP Server** を立てる（責務分割・障害分離のため）。
3. ツールは **「一覧」「検索」「取得」の 3 系統** を基本形にする。エージェントは一覧で語彙を得てから検索するため、
   `list_*` が無いと的外れな検索語で空振りする。
4. 各ツールの `name` / `description` / `inputSchema` を確定する。→ [protocol.md](references/protocol.md)
5. 一覧・検索・取得のすべてで、認証済み利用者が参照できる範囲を決める。MI のデータアクセス権を本人権限と扱わない。設計確定後に admin の環境・DLP/ACP チェックを実行し、NG があれば停止する。索引取得は [認可契約](references/indexed-file-db-access.md) に従う。

```
例: 部品DB MCP   -> list_categories / search_parts / get_part_inquiries / search_inquiries
例: 文書共有 MCP -> list_categories / list_documents / get_document / search_documents
```

### Step 2: Entra アプリ登録でスコープを公開し、クライアントを事前承認する

MCP Server を **保護対象 API** として登録する。ここを飛ばすと、後でトークン取得が `AADSTS650057` で失敗する。

```powershell
python .github/skills/mcp-server/scripts/configure_entra_api.py
```

このスクリプトは以下を行う。

1. `identifierUris` に `api://{app-id}` を設定する。
2. OAuth2 権限スコープ（既定 `MCP.Access`）を公開する。
3. パブリッククライアント（Azure CLI / Azure PowerShell）を **事前承認**し、同意画面なしでトークンを取得できるようにする。

> **重要**: スコープ公開と事前承認を **1 回の PATCH にまとめてはいけない**。
> 新規スコープ ID が未登録扱いになり `InvalidValue ... delegatedPermissionIds` で失敗する。
> スクリプトは 2 段階に分割して送信している。

### Step 3: Azure 基盤を構築する

[azure スキル](../azure/SKILL.md) の手順で以下を構築する。本スキル固有の要件のみ以下に示す。

| リソース | 本スキル固有の要件 |
|---|---|
| Function App | **Flex Consumption** + VNet 統合 + システム割り当て MI。HTTP は公開のまま |
| データストア | Private Endpoint のみ（`publicNetworkAccess=Disabled`・共有キー禁止） |
| RBAC | Function App の MI にデータ層への**データプレーン**ロールを付与 |
| Functions 用ストレージ | 共有キー禁止のため `AzureWebJobsStorage` は使わず、`AzureWebJobsStorage__accountName` の **ID ベース接続**にする。MI に `Storage Blob Data Owner` が必要 |
| ファイル共有 | 共有の作成は**マネジメントプレーン**で行う（データプレーンのロールでは共有を作成できない） |

Function App の作成直後は `AzureWebJobsStorage` に**共有キーの接続文字列**が入る。共有キー禁止のストレージでは
この状態でホストが起動できず、**デプロイは成功するのに全ルートが 404** になる。作成直後に必ず切り替える。

```powershell
python .github/skills/mcp-server/scripts/configure_function_storage.py --app <function-app-name> --account <storage-account>
```

### Step 4: MCP Server を実装する

Azure Functions（Node.js 20 / TypeScript / v4 プログラミングモデル）で実装する。

```
<server-name>/
├── local.settings.json        # ★ 必須（Step 5 参照）
├── host.json
├── package.json
├── src/
│   ├── functions/
│   │   ├── mcp.ts             # route: mcp        認可 + JSON-RPC ディスパッチ
│   │   └── adminSeed.ts       # route: seed-*     一時的なデータ投入用（Step 8 で削除）
│   ├── lib/
│   │   ├── auth.ts            # 受信 JWT 検証
│   │   └── <datasource>.ts    # 送信 Managed Identity アクセス
│   └── tools/
│       └── <domain>Tools.ts   # ツール定義 + ハンドラ
```

- ハンドラは `authLevel: 'anonymous'` にし、**認可はコード側の JWT 検証で行う**（関数キーを使わない）。
- `src/index.ts` は各関数モジュールを `import` するだけにする。**存在しないモジュールを 1 行でも import すると worker が
  起動できず、全ルートが 404 になる**（関数を削除・退避したら import も必ず消す）。
- Copilot Studio から使うなら **Streamable HTTP の必須要件**を満たす（通知には 202 + 本文なし、
  `protocolVersion` は `2025-03-26` 以降をネゴシエート、GET / DELETE に 405）。これを外すと
  curl では成功するのにコネクタ接続だけが失敗する。
- 実装の詳細は [protocol.md](references/protocol.md) と [auth-model.md](references/auth-model.md) を参照。
- ストレージ上の文書を読ませるツールを作るなら、**パス検証・出力上限・戻り値の注意書き**を必ず入れる。
  → [file-backed-tools.md](references/file-backed-tools.md)
- SQL を読むツールを作るなら、**全クエリのパラメータ化と読み取り専用権限**を前提にする。
  → [sql-tools-pattern.md](references/sql-tools-pattern.md)
- MCP Server は Copilot Studio のツールとして登録し、Code App のデータソースへ直接追加しない。
  Code App に表示するページ画像は、認可された投入処理で描画・検証して Dataverse の索引へ保存する。
  エージェント応答へ Base64 画像を載せず、会話経路と画面表示経路を分離する。

### Step 5: デプロイする

```powershell
python .github/skills/mcp-server/scripts/deploy_mcp_function.py --project <path> --app <function-app-name>
```

このスクリプトは **デプロイ前チェック → ビルド → publish → ルート実測検証** を通しで行う。手作業で `func` を叩かない。

事前チェックの内容（いずれも実際に失敗した事象への恒久対策）:

| チェック | 理由 |
|---|---|
| `local.settings.json` の存在と `FUNCTIONS_WORKER_RUNTIME` | 無いと `Worker runtime cannot be 'None'` で publish が失敗する。このファイルは `.gitignore` 対象のため clone 直後は存在しない |
| `func` コマンドの実行可否 | npm グローバルインストールで zip が未展開のまま残ることがある。失敗時は自動で展開して復旧する |
| ビルド出力（`dist/`）の存在 | 空パッケージのままデプロイされ、ルートが 404 になるのを防ぐ |
| ビルド前の `dist/` 削除 | `tsc` は `dist/` をクリーンしない。削除した関数の `.js` が残り、ルートが復活する |
| `src/index.ts` の相対 import が全て実在すること | 解決できない import が 1 行でもあると worker が起動できず、**残すはずのルートまで含めて全滅**する |
| `AzureWebJobsStorage` が ID ベース接続であること | 共有キー禁止のストレージに接続文字列で繋ごうとするとホストが起動しない（Step 3）|
| publish 後のルート実測 | `func publish` は成功しても終了コード 1 と "appears to be unhealthy" を返すことがある。**終了コードで判定しない** |

ルートが 404 のままなら、ホストの起動ログで原因を特定する（`0 functions loaded` なら worker の起動失敗）。

```powershell
python .github/skills/mcp-server/scripts/query_host_logs.py --component <app-insights-name>
```

### Step 6: データを投入する

データ層が Private Endpoint 内にあるため、**ローカル PC からは接続できない**。
VNet 統合された Function App 内の一時的な管理エンドポイント経由で投入する。

```powershell
python .github/skills/mcp-server/scripts/seed_mcp_data.py
```

- 管理エンドポイントは **共有シークレット（`ADMIN_SEED_SECRET`）** で保護し、アプリ設定に置く。
- DB のスキーマ作成・MI へのロール付与は Entra 管理者権限が要るため、**実行者のアクセストークンを渡して**実行する。
- 詳細は [private-data-seeding.md](references/private-data-seeding.md)。
- 継続的な文書取り込みは一時シードと分け、SharePoint / 業務ストレージの作成イベントから Agent flow を起動する。
  Function は PDF 正本と検索用サイドカーを書き、図番・改訂・ページを照合した画像キャッシュを Dataverse の
  検証済み索引へ保存する。既存の人手注記サイドカーは上書きしない。

### Step 7: エンドツーエンドで検証する

```powershell
python .github/skills/mcp-server/scripts/verify_mcp_server.py
```

`api://{app-id}/.default` のトークンを取得し、**Streamable HTTP 準拠の検査**に続けて
`tools/list` でツール一覧、`tools/call` で**実データ**が返ることを確認する。
ツール一覧が返るだけでは不十分で、**必ず 1 つ以上のツールを実行して中身を見る**。

### Step 8: 管理エンドポイントを削除して Copilot Studio に登録する

1. 投入用の管理エンドポイントを削除して再デプロイする（攻撃面を残さない）。

   ```powershell
  python .github/skills/mcp-server/scripts/cleanup_admin_endpoints.py --project <path> --app <function-app-name> --route seed-upload --route seed-sql
   ```

   このスクリプトは関数ファイルの削除に加えて **`src/index.ts` から該当 `import` を除去**し、
   `dist/` をクリーンしてから再デプロイする。どちらか一方でも漏れると、残すべき `mcp` を含む全ルートが落ちる。
  `--route` は実際の削除対象すべてを列挙する必須引数。上記2ルートは例であり、関数登録の `route` と照合する。独自名の管理関数は自動検出されないため、削除計画に明示してから実行する。

2. アプリ設定から `ADMIN_SEED_SECRET` を削除する。
3. 残すルートが 401、削除したルートが 404 であることを HTTP で実測する。
4. Copilot Studio の MCP オンボーディングウィザードで、エージェントにツールとして追加する。
   → [copilot-studio-registration.md](references/copilot-studio-registration.md)

   ```powershell
   python .github/skills/mcp-server/scripts/configure_connector_oauth.py --audience $env:MCP_API_AUDIENCE --secret-out .secrets/connector-oauth.json
   python .github/skills/mcp-server/scripts/generate_copilot_studio_guide.py `
     --server-name example-files-mcp `
     --server-description "文書を検索して内容を取得します。" `
     --server-url "https://<function-app>.azurewebsites.net/api/mcp" `
     --display-name "文書 MCP 接続" `
    --environment-id $env:POWER_PLATFORM_ENVIRONMENT_ID `
     --output "<server-dir>/copilot-studio-connection.md"
   ```

   - `Server name` は **1～64 文字の英字・数字・ハイフン・ドットのみ**。日本語や空白は
     Power Platform の内部コネクタ名作成で 400 になるため、生成スクリプトが事前に拒否する。
   - 生成する Scopes は `<API scope> offline_access` とする。`offline_access` がないとリフレッシュトークンが
     発行されず、アクセストークン失効後に接続が `Missing refresh token` で無効になる。生成スクリプトが必ず付与する。
   - Copilot Studioで利用する場合は、エージェント固有の
     `https://copilotstudio.microsoft.com/c2/tenants/<tenant-id>/environments/<environment-id>/bots/<bot-schema>/channels/pva-studio/conversations/<conversation-id>/user-connections`
     を直接提示する。Power Apps / Power Automateのみで利用する場合は、コネクタ固有の
     `https://make.preview.powerapps.com/environments/<environment-id>/connections/available/<connector-id>`
     だけを提示し、Copilot Studio URLは出さない。
     接続作成、サインイン、同意、Studioでの接続選択は利用者本人が行い、エージェントは事後検証を担当する。
   - 接続作成後は `pac connection list --environment <environment-id>` で各接続のIDを取得し、
     `https://make.preview.powerapps.com/environments/<environment-id>/connections/<connector-id>/<connection-id>/details`
     形式のリンクを**接続ごとに**利用者へ提示する。接続の作成や再認証は代行しない。
   - OAuthポップアップはPower Appsへ戻るまで閉じない。認可中断で残った `Error` 接続は再利用せず、
     個別詳細ページから削除して利用者本人が新しい接続を作成する。
   - 生成 MD は Client secret を含む。**MCP Server ごとに分け**、先に `.gitignore` へ追加する。
   - `pac connector download` の `apiProperties.json` は `clientSecret`を含まない。そのまま
     `pac connector update`へ渡すと有効なsecretが失われるため、既存コネクタの更新には必ず次を使う。

     ```powershell
     python .github/skills/mcp-server/scripts/update_connector_oauth.py `
       --environment $env:POWER_PLATFORM_ENVIRONMENT_ID `
       --connector-id <connector-id> `
       --secret-file .secrets/connector-oauth.json
     ```

   - 認証は `OAuth 2.0`、構成は `Manual` を選ぶ。接続画面では任意の表示名も生成 MD から貼り付ける。
   - コネクタ作成後に表示された callback URL、または `AADSTS50011` に表示された URI は、次で Entra に追加する。

     ```powershell
     python .github/skills/mcp-server/scripts/add_connector_redirect_uri.py `
       --audience $env:MCP_API_AUDIENCE `
       --redirect-uri "https://global.consent.azure-apim.net/redirect/<connector-id>"
     ```

   - `This tool is blocked by your data loss prevention policy` と表示された場合は、公開やポリシー変更を
     繰り返さず、[Copilot Studio の DLP 診断](references/copilot-studio-dlp.md) に従って適用ポリシーと
     コネクタ分類を読み取り確認する。認証は `standard` スキルの `auth_helper.py` に統一し、
     PowerShell の対話サインインやブラウザ認証を追加しない。
   - DLP を解消したのに **Edit 画面で `Couldn't load MCP tools ... HTTP 401`** が出る場合は、
     DLP やアプリ登録を疑う前に必ず次のスクリプトで原因を分類する。

     ```powershell
     python .github/skills/mcp-server/scripts/diagnose_connector_token.py --apps $env:MCP_FUNCTION_APPS
     ```

     繰り返す `jwt expired` と診断された場合は設定不備ではなく、Copilot Studio 側が保持する
     アクセストークンが失効したまま更新されていないだけ。Copilot Studio（または Power Apps >
     Connections）で対象コネクタの接続を選び、**再認証（reconnect）**すれば解消する。
     詳細は [troubleshooting.md](references/troubleshooting.md) を参照。

   OpenAPI をコード管理する必要がある場合だけ、カスタムコネクタのインポート方式を使う。

   複数の MCP Server を 1 エージェントに束ねる場合は、コネクタの `description` とエージェントの指示文の
   **両方に「どの質問でどのサーバーを使うか」**を明記しないと選択を誤る。
   エージェント本体の構築は [copilot-studio-v2 スキル](../copilot-studio-v2/SKILL.md) に委譲する。

5. （任意）**M365 Copilot（Cowork）からも使う場合**は、同じ MCP Server を Cowork プラグインの
   `agentConnectors.remoteMcpServer` としても登録する。**Server の実装は増えない**
   （API アプリを 1 つに集約しておけば登録が 2 系統になるだけ）。
   → [cowork/references/custom-mcp-connector.md](../cowork/references/custom-mcp-connector.md)

---

## 検証チェックリスト

- [ ] ツール定義に `list_*` 系があり、エージェントが語彙を獲得できる
- [ ] Entra アプリ登録でスコープを公開し、クライアントを事前承認した（Step 2）
- [ ] Function App の HTTP は公開、データ層は Private Endpoint のみ
- [ ] 関数キー・接続文字列・共有キーを一切使っていない
- [ ] `local.settings.json` が存在し `FUNCTIONS_WORKER_RUNTIME` が設定されている
- [ ] `AzureWebJobsStorage__accountName` による ID ベース接続になっている（接続文字列が残っていない）
- [ ] `src/index.ts` の相対 import が全て実在するモジュールを指している
- [ ] デプロイ成否を **終了コードではなくルートの HTTP 実測**で判定した
- [ ] `tools/call` で実データが返ることを確認した
- [ ] Streamable HTTP 準拠（通知に 202 / バージョンネゴシエーション / GET に 405）を検証した
- [ ] 管理エンドポイントを削除し、`ADMIN_SEED_SECRET` をアプリ設定から消した
- [ ] 削除後に「残すルート = 401 / 削除したルート = 404」を HTTP で実測した
- [ ] スクリプトが `auth_helper` 経由で非対話に完走する（`az login` を要求しない）
- [ ] Copilot Studio 接続の Scopes に `<API scope> offline_access` が含まれ、再接続後に自動更新できる
- [ ] 利用者へ対象環境の Power Apps 接続一覧と Copilot Studio エージェント一覧のURLを提示した
- [ ] 作成済みの各接続について Power Apps の個別詳細URLを利用者へ提示した
- [ ] Copilot Studio の Edit 画面で 401 が出たら、DLP/設定変更の前に `diagnose_connector_token.py` で
      「未接続・トークン失効・その他」を切り分けた

## 参考リンク

- [Azure リファレンスアーキテクチャ](../azure/SKILL.md)
- [共通認証（auth_helper / azure_helper）](../standard/references/auth-patterns.md)
- [Copilot Studio v2](../copilot-studio-v2/SKILL.md)
- [異常系・トラブルシュート](references/troubleshooting.md)
