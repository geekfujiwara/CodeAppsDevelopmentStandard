# agent365 — 異常系・トラブルシュート

> 秘匿化・汎用化・CI/CD・レビューゲートの問題は **`alm` スキル**を参照
> → [ALM — 異常系・トラブルシュート](../../alm/references/troubleshooting.md)

## 1. Teams アップロードで「Must upload a newer version of the title than what is already present.」

- 原因: manifest の `version` が既にアップロード済みのバージョンと同じ。
- 対処: `.env` の `TEAMS_APP_VERSION` を上げて `python scripts/build_teams_package.py` を再実行する。
  同じアプリ ID を更新するときは**毎回**上げる必要がある。

## 2. インストールしてもエージェント インスタンスが作られない（全員が同じ 1 体を共有してしまう）

- 原因: `functionsAs` 未指定（既定 `agentOnly`）、または `agenticUserTemplates` ノードが無い。
- 対処: manifest に `functionsAs: agenticUserOnly` + `agenticUserTemplateId` + `agenticUserTemplates` を入れる。
  これらは **`manifestVersion: devPreview` でのみ有効**（GA 1.25〜1.29 には `functionsAs` が無い）。
- `A365_AGENT_BLUEPRINT_ID` が未設定だと `build_teams_package.py` が
  共有エージェント用（GA 1.22）へ自動ダウングレードし、警告を出す。警告を見落とさない。

## 3. `build_teams_package.py` が `Missing environment variables: ...` で失敗する

- 原因: `.env` に manifest の `${VAR}` に対応する値が無い、または空。
- 対処: `references/.env.example` と突き合わせて不足分を追加する。
  空文字も「未設定」として扱われる。

## 4. outline アイコンが真っ白な四角になる

- 原因: 元画像にアルファチャンネルが無い（背景が不透明）。outline は元画像のアルファから生成される。
- 対処: 背景を透過させた正方形 PNG を用意する。円形イラストなら円マスクでアルファを作る。

```python
from PIL import Image, ImageDraw
src = Image.open("source.png").convert("RGBA")
w, h = src.size
mask = Image.new("L", (w * 4, h * 4), 0)
ImageDraw.Draw(mask).ellipse((0, 0, w * 4 - 1, h * 4 - 1), fill=255)
src.putalpha(mask.resize((w, h), Image.LANCZOS))
src.save("assets/agent-icon.png")
```

## 5. `create_instance.py --mode blueprint` が「blueprint cannot be shared」で失敗する

- 原因: 参照したブループリントが `lifecycle=Auto`（エージェントが暗黙に作った所有者専用のもの）。
- 対処: `python scripts/create_blueprint.py --name <name>` で `lifecycle=Manual` のブループリントを
  作り直し、そちらを参照する。既存の `Auto` は共有できないので `--mode definition` で複製する。

## 6. `FOUNDRY_PROJECT_ENDPOINT is not set` / 認証エラー

- 原因: `.env` が読み込まれていない、または `DefaultAzureCredential` が資格情報を解決できない。
- 対処: ローカルは `az login` + `az account set --subscription <id>`。
  CI は `azure/login@v2` の OIDC（`AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_SUBSCRIPTION_ID`）。
  対象アプリ登録に Foundry プロジェクトへのロール（Azure AI Developer 等）が必要。

## 7. `sanitize.py` がテンプレートを壊す / `review_sanitization.py` が Fail する

→ **`alm` スキル**の [異常系・トラブルシュート](../../alm/references/troubleshooting.md) を参照。
エージェント固有の注意点としては、`AGENT_NAME` / `BLUEPRINT_ID` を
`alm.config.json` の `non_secret_vars` に入れておくこと（散文中の名称まで置換される）。

## 8. `review_sanitization.py` が Teams / エージェントの生成物を検出する

| メッセージ | 対処 |
|---|---|
| `Rendered output is tracked` | `git rm --cached agents/**/agent.yaml` |
| `Build artifact is tracked` | `git rm --cached teams/*.zip` |
| `a365.generated.config.json is tracked` | `git rm --cached` し `.gitignore` に追加 |

その他のメッセージは **`alm` スキル**の
[異常系・トラブルシュート](../../alm/references/troubleshooting.md) を参照。

## 9. `a365` コマンドが固まる / ダイアログが出ない

→ [a365-cli.md](a365-cli.md) の 3〜5 節（パイプ禁止・`-EncodedCommand` での可視ウィンドウ起動・
Edge プロファイル）を参照。初回失敗時は同じコマンドを再実行すると冪等に修復されることが多い。

## 10. Windows PowerShell 5.1 で `&&` が使えない

- 対処: `;` で区切るか `; if ($?) { ... }` を使う。PowerShell 7（`pwsh`）なら `&&` が使える。
  その他のシェル・CI 固有の問題は [`alm`](../../alm/references/troubleshooting.md) を参照。

## 11. `publish_teams_app.py` が 403 / `Authorization_RequestDenied` で失敗する

- 確定した根本原因: `auth_helper.py` が `client_id` 未指定時に既定で使う
  **Azure CLI の well-known パブリッククライアント**（`04b07795-8ddb-461a-bbee-02f9e1bf7b46`）は、
  Graph の委任アクセス許可セットが Microsoft によって固定されており、
  **`AppCatalog.ReadWrite.All` を含まない**（テナント管理者が同意しようとしても、
  このクライアント自体にその許可が存在しないため同意画面にも出てこない）。
  この API は Application 権限にも対応しないため、アプリオンリー認証でも原理的に成功しない。
- 対処（本 PR で実装済み）: `publish_teams_app.py` は `auth_helper.get_token()` に
  `client_id="14d82eec-204b-4c2f-b7e8-296a70dab67e"`（Microsoft Graph PowerShell の
  well-known パブリッククライアント）を渡し、かつスコープは `.default` ではなく
  **明示的に `https://graph.microsoft.com/AppCatalog.ReadWrite.All` を要求する**
  （`.default` は「既に同意済みの許可だけ」を返すため、同意前に取得した `.default` トークンが
  MSAL のキャッシュに残っていると新しく同意した権限が反映されないまま古いトークンが
  返り続ける。明示スコープ要求なら未同意時に確実にインクリメンタル同意画面が出る）。
- 初回実行時は新しいクライアント ID 用の別デバイスコードサインインが必要
  （`auth_helper.py` はクライアント ID ごとに認証レコード・トークンキャッシュを分離している）。
  表示される同意画面で `AppCatalog.ReadWrite.All` を確認して同意する。
- 検証方法: JWT の `scp` クレームをデコードして `AppCatalog.ReadWrite.All` が含まれるか確認する
  （`auth_helper.get_token(scope=..., client_id=...)` の戻り値をデコードすればよい）。

## 12. `publish_teams_app.py` が 403 で「Teams 管理者ロールが必要」

- 原因: `--requires-review` 無しでの即時公開は Teams 管理者ロールを持つユーザーのみ実行できる。
- 対処: `python scripts/publish_teams_app.py --requires-review` で管理者レビューに提出し、
  Teams 管理センターで承認してもらう。

## 13. `publish_teams_app.py` が同じアプリを重複登録してしまう

- 原因: manifest の `id`（externalId）が前回実行時と変わっている、またはビルドし直した ZIP の
  `manifest.json` が古いキャッシュのまま。
- 対処: `.env` の manifest 系プレースホルダーを変更していないか確認し、
  `python scripts/build_teams_package.py` を実行してから `publish_teams_app.py` を実行する。

## 14. エージェント名を後から変えたくなった

識別子が広範囲に波及する（`.env` の変数名・フォルダ名 `agents/<name>/`・
`agenticUserTemplates[].id`・ZIP 名・Bot リソース名・Foundry のエージェント名）。
**Step 1 の時点で商標・著作権に配慮した名前を確定させる**。
既存の Foundry エージェントは削除せず残しても害はないが、Teams 側は同じアプリ ID の
バージョン更新として扱うため `TEAMS_APP_VERSION` の引き上げを忘れない。

## 15. `create_instance.py --mode blueprint` の後、`instance_identity` が取得できない

- 現象: `--mode blueprint` でエージェントを作成しても、`create_instance.py` は
  principal id / client id を標準出力に表示しない。さらに
  `client.agents.get(agent_name=...)` / `get_version(...)` の応答にも
  `instance_identity` フィールド（SDK モデル `AgentDetails.instance_identity` /
  `AgentVersionDetails.instance_identity`）が含まれないテナント・API バージョンがある
  （`blueprint` フィールドも同様に空で返ることがある）。
- 対処: ブループリント共有方式（`lifecycle=Manual` のブループリントを複数エージェントで
  共有する設計）では、エージェントは常にブループリントの Entra アプリをそのまま使う。
  そのため `.env` の `INSTANCE_IDENTITY_PRINCIPAL_ID` / `INSTANCE_IDENTITY_CLIENT_ID` には
  **`BLUEPRINT_PRINCIPAL_ID` / `BLUEPRINT_CLIENT_ID` と同じ値**を設定してよい
  （`agent_guid` は `agents.get()` の `versions.latest.agent_guid` から取得できる）。
- 既知の改善余地: `create_instance.py` が生成直後のレスポンスから
  principal id / client id / agent_guid を表示するように改善すれば、
  このワークアラウンドを判定条件つきで自動化できる（本 PR のフォローアップ候補）。

## 16. `publish_teams_app.py` が devPreview（Agent template）パッケージで 400 `"Agentic apps are not supported"` で失敗する

- 現象: 認証（#11 の `AppCatalog.ReadWrite.All`）が正しく通っていても、
  `manifestVersion: devPreview`（`agenticUserTemplates` 付き = 事前確認の質問 1 で (c)/(d) を選んだ場合に
  `--require-template` を付けてビルドしたパッケージ）を `POST /appCatalogs/teamsApps` に送ると
  **必ず** 次のエラーで拒否される:
  ```
  400 BadRequest: "Agentic apps are not supported for uploading from Teams/Teams Admin
  Center. Please use M365 Admin Center."
  ```
- 根本原因: Microsoft 側の仕様。Graph の `appCatalogs/teamsApps` エンドポイントは
  Teams 管理センター向けの汎用アップロード経路であり、`devPreview` / agentic
  （Agent 365 テンプレート化された）マニフェストのアップロードを**サーバー側で明示的に拒否**する。
  権限やスクリプトの実装では回避できないハード制約（2026-07 時点で確認）。
- 対処: **この場合のみ、Teams / Microsoft 365 管理センターへの手動アップロードが必須**
  （`https://admin.cloud.microsoft/?#/agents/all` の "Upload" または Teams 管理センターの
  "Manage apps" → "Upload new app"）。`publish_teams_app.py` は `manifest.json` の
  `manifestVersion` が `devPreview` の場合、Graph 呼び出しを試みる前にこの旨を案内して
  終了する（本 PR で実装済み）。
- 影響範囲: 事前確認の質問 1 で **(a)/(b)** を選んだ場合は公開自体を行わないため無関係。
  **(c)/(d)** を選び `--require-template` でビルドした場合は必ずこの制約に当たるため、
  SKILL.md の Step 11 は「Graph 公開は GA/共有エージェント manifest 専用、
  Agent template は手動アップロード」と明記する。

## 17. Teams で bot に無反応（サインイン カードすら出ない）／ agentUser チャットが完全無反応

> **2026-08-04 更新: 17-2 は解決済み。** 結論だけ先に書くと
> **Foundry ホストの `activityprotocol` エンドポイントでは agentUser チャットは動かない**。
> 自己ホスト（Agents SDK + Azure Bot + App Service）に切り替えれば動く（[self-hosted-agent.md](self-hosted-agent.md) / SKILL.md Step 7）。
> 続けて #18（agentic 送信認証）と #19（インスタンス SP への同意）も必要。

現象を 2 種類に切り分けて考える。

### 17-1. 直接 bot チャット（アプリとしてインストールした bot 自体への DM）が無反応

- 原因: `az bot create` は Bot Service リソースを作るだけで、Foundry の「Teams と Microsoft 365 に
  対して発行する」ボタンが裏側で行っている**エージェント オブジェクトへの `activity` プロトコル +
  `BotServiceRbac` 認可スキームの追加**を行わない（手順は [foundry-hosted-bot.md](foundry-hosted-bot.md)）。
- 対処: [foundry-hosted-bot.md](foundry-hosted-bot.md) の REST PATCH（`authorization_schemes: [Entra, BotServiceRbac]` +
  `protocol_configuration.activity: {}`）を実行する。
- 適用後の挙動: Teams で直接メッセージすると **OAuthCard（"User Sign-in" → "Open sign-in link" →
  "Open Foundry login"）が表示され、送信者がサインインを完了すると bot が応答する**ようになる
  （`BotServiceRbac` は委任認可のため、送信者本人が Foundry プロジェクトへの RBAC 権限
  ＝ Foundry User / Foundry Agent Consumer 等を持っている必要がある）。
- 確認済み: この PATCH 適用後、直接 bot チャットは実際に動作した（ユーザーのスクリーンショットで確認）。

### 17-2. agentUser（同僚アイデンティティ）チャットが 17-1 の PATCH 後も無反応 → **解決済み（2026-08-04）**

- 17-1 の `BotServiceRbac` 修正は**直接 bot チャットのみ**に効き、Agent 365 の agentUser
  （インスタンス化されたエージェントが「同僚」として持つ Teams チャット/メール ID）ルーティングは
  **完全に別のメッセージング経路**であり、上記 PATCH だけでは無反応のままになる。

#### 真の根本原因（実測で確定）

Agent 365 のコールバックを実際にキャプチャして再送した結果、**Foundry の `activityprotocol`
エンドポイント自体が Agent 365 のトークンを拒否している**ことを確認した。

| 項目 | 値 |
|---|---|
| Agent 365 が送るトークンの `aud` | ブループリント appId（GUID） |
| 同 `azp` | `5a807f24-c9de-44ee-a3a7-329e88a00ffc`（Messaging Bot API Application） |
| Foundry `activityprotocol` の応答 | **401 `Error parsing client JWT`** |

Foundry ホストでは受理する audience を変更できないため、**この構成では原理的に解決不能**。

#### 解決策: 自己ホストに切り替える（Microsoft Learn 記載の標準構成）

Microsoft 365 Agents SDK のアプリを Azure App Service に置き、ブループリントの
messaging endpoint をそこへ向ける。自己ホストなら `appsettings.json` の
`TokenValidation:Audiences` に**ブループリント appId を追加**できるので 401 が解消する。

手順は [self-hosted-agent.md](self-hosted-agent.md)（SKILL.md **Step 7**）。ただしこれだけでは応答しない。続けて **#18 と #19** が必要。

#### 効果が無かった試行（記録）

1. **Teams Developer Portal**（`.../tools/agent-blueprint/<blueprintId>/configuration`）で
   "Agent Type: Bot Based" + "Bot ID" を手動設定 → 保存は成功するが無反応のまま。
2. `POST {endpoint}/agents/{name}/microsoft365/publish?api-version=v1` は毎回
   `502 upstream_dependency_failed`。RBAC は原因ではない（呼び出し元はサブスクリプション Owner）。
3. `a365 ... --endpoint-only` の `ERROR: Configuration file not found` は **CLI のバグではない**。
   `a365.generated.config.json` があるディレクトリと**同じ CWD** で実行すれば v1.1.214 でも成功する
   （SKILL.md Step 7 の 2 段階のエンドポイント登録を参照）。
---

## 18. 自己ホスト エージェントが `Only IConfidentialClientApplication or AuthType.IdentityProxyManager is supported for Agentic.` で応答できない

```
fail: Microsoft.Agents.Hosting.AspNetCore.CloudAdapter[0]
      Only IConfidentialClientApplication or AuthType.IdentityProxyManager is supported for Agentic.
      Source: Microsoft.Agents.Authentication.Msal
```

- 原因: `MsalAuth.GetAgenticApplicationTokenAsync` は
  `AcquireTokenForClient(["api://AzureAdTokenExchange/.default"]).WithFmiPath(agentAppInstanceId)`
  を使う。**`.WithFmiPath()` は `IConfidentialClientApplication` にしか存在しない**。
  `UserManagedIdentity` / `SystemManagedIdentity` は `IManagedIdentityApplication` を返すため、
  **マネージド ID では agentic シナリオは原理的に成立しない**。
- 対処: `AuthType` を **`ClientSecret`**（または `certificate` / `FederatedCredentials`）にする。
  `IdentityProxyManager` は Foundry コンテナの IMDS 専用（`IdpmResource` とセット）。
- 併せて `ClientId` は **Agent 365 ブループリント appId**、`Scopes` は
  `["5a807f24-c9de-44ee-a3a7-329e88a00ffc/.default"]` にする（[self-hosted-agent.md](self-hosted-agent.md) の手順 3）。
- シークレットの発行と保管:

  ```powershell
  # 既存資格情報を消さないよう必ず --append を付ける。標準出力に平文で出るので変数のまま渡す
  $sec = az ad app credential reset --id <blueprintAppId> --append `
           --display-name <name> --years 1 --query password -o tsv
  az webapp config appsettings set -g <rg> -n <app> `
    --settings "Connections__ServiceConnection__Settings__ClientSecret=$sec"
  ```

- 補足: `[MessageRoute(isAgenticOnly: true)]` はルート絞り込み用で、トークン経路の判定とは**無関係**。
  素の `OnActivity(ActivityTypes.Message, ...)` でも agentic 応答できる。
  トークン経路は `activity.Recipient.Role` が `agenticUser` / `agenticIdentity` かどうかで決まる
  （`RestChannelServiceClientFactory`）。Bot の appId とブループリント appId を分けたい場合は
  `ConnectionSettings.AlternateBlueprintConnectionName` で 2 コネクションに分割できる。

---

## 19. #18 を直しても Teams で応答しない（`AADSTS65001` / `AADSTS82001`）

App Service のログに 2 種類の AADSTS エラーが出る。**片方はノイズなので取り違えないこと。**

### 19-1. `AADSTS82001` は無視してよい

```
AADSTS82001: Agentic application '<blueprintAppId>' is not permitted to
             request app-only tokens for resource '5a807f24-...'
```

agentic アプリは app-only トークンを取得できない仕様。SDK が試行して失敗するだけで、
これが応答不能の原因ではない。**権限を追加しても解消しないので追いかけない。**

### 19-2. 本当の原因は `AADSTS65001`（インスタンス SP への同意不足）

`CloudAdapter` が出すこちらが真犯人:

```
AADSTS65001: The user or administrator has not consented to use the application
             with ID '<agentInstanceAppId>' named '<インスタンス表示名>'
```

FMI トークン交換（`api://AzureAdTokenExchange/.default` + `FMI Path: <インスタンス ID>`）
自体は成功しており、足りないのは**エージェント インスタンス SP → Messaging Bot API への同意**だけ。
インスタンス ID はログの `FMI Path: <guid>` から読める。

**対処（管理者同意を明示付与）**

```powershell
# 1) インスタンス SP を確認（appId == objectId。アプリ登録オブジェクトは存在しない）
az ad sp list --filter "appId eq '<agentInstanceAppId>'" --query "[].{id:id,dn:displayName}"

# 2) リソース: Messaging Bot API Application（appId 5a807f24-c9de-44ee-a3a7-329e88a00ffc は全テナント共通）
#    objectId は**テナントごとに異なる**ので引いて使う
$resourceId = az ad sp list --filter "appId eq '5a807f24-c9de-44ee-a3a7-329e88a00ffc'" --query "[0].id" -o tsv
#    公開されているのは委任スコープ AgentData.ReadWrite のみ（appRoles は空）

# 3) AllPrincipals の oauth2PermissionGrant を作成
@"
{""clientId"":""<agentInstanceAppId>"",""consentType"":""AllPrincipals"",
 ""resourceId"":""$resourceId"",""scope"":""AgentData.ReadWrite""}
"@ | Out-File body.json -Encoding ascii -NoNewline
az rest --method POST --uri "https://graph.microsoft.com/v1.0/oauth2PermissionGrants" `
  --headers "Content-Type=application/json" --body "@body.json"

# 4) MSAL のトークンキャッシュを捨てる
az webapp restart -g <rg> -n <app>
```

付与＋再起動後、Teams で agentUser にメッセージすると応答する（2026-08-04 実証）。

- ブループリント アプリの `requiredResourceAccess` は**空のままで問題なかった**。
- インスタンスを作り直すたびに新しい SP ができるため、**この同意付与はインスタンスごとに必要**。

---

## 20. Teams アプリ カタログ公開まわりの実測メモ

### 20-1. `POST /appCatalogs/teamsApps` が 409 `AppDefinitionAlreadyExists`

- エラー本文に `AppId` と `ExternalId`（= manifest の `id`）が入っている。
  **サイドロード済みのエントリが同じ manifest `id` を占有している**ケースが典型
  （`state: Installed`）。
- 対処: manifest の `id` を新しい GUID に変えて公開し直す。
- PowerShell 7 では Graph のエラー本文は `$_.ErrorDetails.Message` で読む
  （`$_.Exception.Response` からは取れない）。

### 20-2. 201 で成功したのにアプリ一覧に出てこない

- `POST` が 201 を返しても、`GET /appCatalogs/teamsApps?$filter=...` に**しばらく出てこない**
  （読み取り側インデックスの遅延）。フィルタ自体は正常（既知の externalId では 1 件返る）。
- 存在確認は **`DELETE /appCatalogs/teamsApps/{id}` の戻り値**で判定できる
  （`404` = 実在しない / `204` = 実在した＝削除された）。**破壊的なので調査用途のみ**。
- `appCatalogs/teamsApps` は **`$top` をサポートしない**。ページングは `@odata.nextLink` を辿る。

### 20-3. Graph でユーザーにアプリをインストールできない

`POST /users/{id}/teamwork/installedApps` は `TeamsAppInstallation.ReadWriteSelfForUser` を
要求しても `Caller is not authorized.`（403）になる。**Teams UI から手動インストールが必要**。

### 20-4. デバイスコード認証のスコープ組み立てで `AADSTS650053`

```
AADSTS650053: The application asked for scope 'AppCatalog.ReadWrite.Alloffline_access' that doesn't exist
```

PowerShell が要素 1 個の `ForEach-Object` 結果を配列ではなく文字列として扱うため、
`+ 'offline_access'` が文字列連結になる。`@()` で明示的に配列化する。

```powershell
$scope = ((@($Scopes | ForEach-Object { "$Resource/$_" })) + 'offline_access') -join ' '
```

### 20-5. Teams パッケージ zip は `Compress-Archive` で作らない

`Compress-Archive` はディレクトリ エントリやパス区切りの都合で Teams 側の検証に落ちることがある。
`System.IO.Compression.ZipArchive` でエントリを 1 つずつ作る。
`[IO.Compression.ZipFile]::OpenRead()` は必ず `Dispose()` する（ファイルがロックされる）。

### 20-6. Azure CLI / PowerShell の細かい落とし穴

- `az bot create` は廃止済み API 版を使う。`az rest --method PUT` + `api-version=2022-09-15` を使う。
- Teams チャネルの `acceptedTerms=True` は **PUT でのみ**保持される。
- `az webapp deploy` は `--track-status false` を付ける。デプロイ後は `az webapp restart`。
- `az rest --url` は `&` を含む URL で壊れる。`--uri` を使い `?` をバッククォートでエスケープする。
- App Service のリージョン クォータ: eastus2 / japaneast / eastus が 0 だった。westus2 で作成できた。

---

## 21. 候補へ「お願い」と返しても会議を作らず、打診文へ戻る

- 症状: 空き時間と会議内容を提示した後、ユーザーが承認しても `create_entity` を呼ばず、
  「この環境では作成が許可されていない」と推測で断る。
- 切り分け: App Service ログに該当ターンの `create_entity` / `tools/call` が無ければ、
  権限ではなく**ツール未実行**。ツール結果に 403/allowlist エラーがある場合だけ権限問題として扱う。
- 対処: [assistant-agent-pattern.md](assistant-agent-pattern.md) の承認継続ルールをプロンプトへ入れる。
  「お願い」「OK」「それで」を直前の提案への承認とし、同じターンで書き込みツールを呼ばせる。
- Work IQ の書き込み結果が `structuredContent` にだけ入る場合がある。
  `content[].text` が空という理由で失敗扱いしない。

## 22. Dataverse にある HR・面談情報を検索前から拒否する

- 原因: 「人事情報は開示しない」という広すぎるプロンプトが、Dataverse の行レベル・列レベル権限より
  先に働いている。
- 対処: 分類名だけでは拒否せず、まず `search` / `search_data`、必要なら `describe` / `read_query` を使う。
  Dataverse が権限上返した範囲を回答し、403 やマスクされた項目だけを開示しない。
- 注意: これは Dataverse のセキュリティを迂回する指示ではない。エージェントへ過大なロールを付けず、
  最小権限をデータ層で維持する。プロンプトは接続先の認可結果に従う。

## 23. Teams / Org Explorer で agentUser が Offline（×）になる

- 原因: agentUser はディレクトリ上 `accountEnabled=true` でも Teams クライアント セッションを持たない。
  App Service が稼働していることと Teams プレゼンスは別である。
- 対処: `scripts/configure_agent_presence.py` で App Service の UAMI に Graph application permission
  `Presence.ReadWrite.All` を付与し、`PresenceWorker` から `setPresence` を定期実行する。
- `setUserPreferredPresence` だけでは不十分。presence session が無いユーザーは Offline のままなので、
  **`setPresence` でセッションを作る必要がある**。
- ログに `Graph setPresence returned HTTP 403` → UAMI の app role assignment と、実際にトークンを取った
  managed identity client ID が一致するか確認する。付与後はトークン キャッシュ反映まで待って再起動する。
- heartbeat 成功後も表示が変わらない → Teams / Org Explorer のキャッシュ反映を待つ。
  4 時間を超えて heartbeat が止まれば自動的に Offline へ戻るのが正常。

