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

- 原因: `.env` が読み込まれていない、または `standard/scripts/auth_helper.py` の認証キャッシュを解決できない。
- 対処: ローカルは `.env` の `AZURE_TENANT_ID` / `AZURE_SUBSCRIPTION_ID` と standard の `auth_helper.py` キャッシュを確認する。agent365 用に個別 `az login` しない。
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

→ [a365-cli.md](a365-cli.md) の 4〜6 節（パイプ禁止・`-EncodedCommand` での可視ウィンドウ起動・
Edge プロファイル）を参照。初回失敗時は同じコマンドを再実行すると冪等に修復されることが多い。
ただし通常の認証は standard の `auth_helper.py` キャッシュを使うため、`a365` で新しい認証キャッシュを作る運用にはしない。

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
- 初回実行時は standard の `auth_helper.py` が管理するクライアント ID 別キャッシュを利用する
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
  SKILL.md の Step 10 は「Graph 公開は GA/共有エージェント manifest 専用、
  Agent template は手動アップロード」と明記する。

## 17. Teams で bot に無反応（サインイン カードすら出ない）／ agentUser チャットが完全無反応

> **2026-08-04 更新: 17-2 は解決済み。** 結論だけ先に書くと
> **Foundry ホストの `activityprotocol` エンドポイントでは agentUser チャットは動かない**。
> 自己ホスト（Agents SDK + Azure Bot + App Service）に切り替えれば動く（[self-hosted-agent.md](self-hosted-agent.md) / SKILL.md Step 6）。
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

手順は [self-hosted-agent.md](self-hosted-agent.md)（SKILL.md **Step 6**）。ただしこれだけでは応答しない。続けて **#18 と #19** が必要。

#### 効果が無かった試行（記録）

1. **Teams Developer Portal**（`.../tools/agent-blueprint/<blueprintId>/configuration`）で
   "Agent Type: Bot Based" + "Bot ID" を手動設定 → 保存は成功するが無反応のまま。
2. `POST {endpoint}/agents/{name}/microsoft365/publish?api-version=v1` は毎回
   `502 upstream_dependency_failed`。RBAC は原因ではない（呼び出し元はサブスクリプション Owner）。
3. `a365 ... --endpoint-only` の `ERROR: Configuration file not found` は **CLI のバグではない**。
   `a365.generated.config.json` があるディレクトリと**同じ CWD** で実行すれば v1.1.214 でも成功する
   （SKILL.md Step 6 のエンドポイント登録を参照）。
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

## 24. Teams のチャットを作れない / メッセージを送れない

- Work IQ の `create_entity` で `/chats` を呼ぶと下記が返る。**仕様であり、リトライやパスの換えでは通らない。**

  ```json
  { "error": { "message": "Path is not in the policy allowlist." } }
  ```

  対処: Microsoft Graph を直接呼ぶ（[agent-brain.md](agent-brain.md) §8、[feature-blocks.md](feature-blocks.md) §2）。
- Graph が 403 `Authorization_RequestDenied` → インスタンス SP に委任スコープが無い。
  `python scripts/grant_agent_graph_scopes.py --check` で確認する。同意は**インスタンス単位**なので、
  インスタンスを作り直したら付け直す。
- 同意を入れたのに Dataverse / Work IQ が死んだ → `oauth2PermissionGrants` を POST で上書きしている。
  (クライアント, リソース) につき 1 行しか持てないので、**既存 scope にマージして PATCH** する。
- 400 で members が重複 → モデルが自分自身を参加者に入れている。コード側で自分を除外してから先頭に付け直す。
- 400 で topic が拒否 → 1 対 1（`oneOnOne`）に件名は付けられない。グループのときだけ送る。
- チャットは作られたのに相手に届かない → **作成だけでは通知されない。**メッセージ送信まで行わせる。
- app-only トークンで投稿して 403 → アプリ権限でのチャット投稿は `Teamwork.Migrate.All`（保護 API）が必要で、
  しかもエージェント本人の発言にならない。委任トークンを使う。

## 25. コード実行が 403 Forbidden で返る（B12）

- ほぼ確実に、**セッション プールに対する Azure ContainerApps Session Executor ロールが
  App Service の UAMI に付いていない**。プールの作成もアプリ設定も正常に見えるので気づきにくい。
  作った本人は動作確認までにこの行程を踏まないため、**最初に依頼したユーザーが最初の被害者**になる。

  ```bash
  python scripts/provision_code_sandbox.py --check
  ```

  このコマンドは成功時にもロール付与を検証するので、プロビジョニング直後に必ず 1 回通す。
- ロールは**プールのリソース ID をスコープ**に、UAMI の**オブジェクト ID**（クライアント ID ではない）へ割り当てる。
- トークンのスコープが違うのも 403 になる。`https://dynamicsessions.io/.default` を使う。

## 26. コード実行が 404 Not Found で返る（B12）

- エンドポイントを手で組み立てている。ARM が返す `properties.poolManagementEndpoint` を**そのまま**使う。

  ```bash
  az rest --method GET --url "https://management.azure.com/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.App/sessionPools/<pool>?api-version=2025-02-02-preview" --query properties.poolManagementEndpoint
  ```

  リージョン表記やホスト名は環境によって変わる。形が分かるからといって文字列連結で作らない。
- `identifier` クエリ文字列が抜けている場合も 404 になる。全リクエストに付ける。

## 27. サンドボックスの中で `pip install` が必ず失敗する（B12）

- `sessionNetworkConfiguration.status` が **既定の `EgressDisabled`** のまま。
  外向き通信が閉じているので、pip も外部 API も届かない。
  モデルは原因が分からないまま同じインストールを繰り返し、ターンが延びる。
- 有効化するとセッションから外部へ持ち出せるようになる。**取り込むファイルの機微度で決める**。
  有効にするなら、生成コードに資格情報を渡さないことをシステム プロンプトに明記する。

## 28. サンドボックスへのファイル アップロードが 400 で返る（B12）

- multipart のフィールド名が `file` **以外**になっている。ここは固定。実ファイル名や `files` では通らない。
- 大きすぎるファイルも失敗する。取り込み側で上限（40 MB 程度）を先に検査し、
  利用者に分かる言葉で返す。

## 29. 会話をまたぐとサンドボックスのファイルが消えている（B12）

- セッション識別子が会話に紐づいていない。会話 ID のハッシュ先頭を `identifier` に使う。
- または `cooldownPeriodInSeconds` を超えて放置された。**仕様であり、延ばしても本質的には解決しない。**
  成果物は `deliver_file` で必ず外へ出す。「作った」で終わらせないことをツールの説明文に書く。

## 30. python-pptx で `AttributeError: '_Paragraph' object has no attribute 'paragraph_format'`

- `_Paragraph` に `paragraph_format` は存在しない。字下げは XML を直接触る。

  ```python
  pPr = paragraph._p.get_or_add_pPr()
  pPr.set('marL', str(Emu(Inches(0.4))))
  pPr.set('indent', str(-Emu(Inches(0.2))))
  ```

- 入れ子の箇条書きで `paragraph.level` を設定すると、レイアウト側の書式が優先されて崩れる。
  レベルではなく字下げ幅で表現する。

## 31. 数分かかるターンで「反応がない」と言われる（B13）

- 入力中インジケーターは多くのチャネルで数十秒で消える。**タイマーで送り続ける**必要がある。
- エージェント自身の `report_progress` だけに任せると、モデルが呼び忘れたターンが無言になる。
  自動の状況通知と併用する（→ [progress-updates.md](progress-updates.md)）。
- 逆に通知が多すぎて本文が流れる場合は、初回しきい値と間隔を延ばす。
  同じラウンドでモデルが経過報告を呼んだときに自動通知を抑止しているかも確認する。

## 32. 最終返信のあとも「入力中…」が残る（B13）

- ハートビートを停止していない。**返信を送る前に**停止する。エラーで終わるターンでも、
  エラー返信の前に停止させる。
- 停止処理の待機で例外が飛んで本来の結果を覆い隠すことがある。待機は try/catch で囲み、警告ログに落とす。
- ハートビートと最終返信が同じターン コンテキストへ同時に書き込むと不安定になる。送信は排他制御する。

## 33. Kudu の VFS API が 401 を返す（デプロイ内容の確認時）

- 基本認証が無効化されている環境では、**ARM のベアラー トークン**が要る。

  ```powershell
  $tok = az account get-access-token --resource https://management.core.windows.net/ -o tsv --query accessToken
  Invoke-RestMethod -Uri 'https://<app>.scm.azurewebsites.net/api/vfs/site/wwwroot/<path>' `
    -Headers @{ Authorization = "Bearer $tok" } -Method Get
  ```

## 34. メール返信の URL がリンクにならない（B6）

- Work IQ の `do_action /me/messages/{id}/reply` が運べるのは `{"comment": "..."}` の
  **プレーン テキストだけ**。書式を指定する余地がない。
  `POST /me/messages/{id}/reply` を自前ツールで呼び、`message.body.contentType = "HTML"` にする
  （→ [outbound-formatting.md](outbound-formatting.md)）。
- 委任スコープに **`Mail.Send`** が要る。`Mail.ReadWrite` だけでは 403 になる。
- プロンプトで「HTML で書け」と指示するのは**逆効果**。タグの閉じ忘れとエスケープ漏れが出る。
  モデルには Markdown を書かせ、変換はコードで行う。
- 「HTML タグは書かず、改行は `<br>` を使う」のような**自己矛盾した指示が残っていないか**を確認する。
  変換をコードに移したら、その手の書式指示はプロンプトから消す。

## 35. メール経由の依頼だけ成果物の質が落ちる（B6 + B12）

**症状**: 同じ「資料を作って」でも、Teams からだと整った資料が返るのに、
メールからだと素の白いスライドが返る。システム プロンプトには正しい手順が書いてある。

**原因**: `MailboxWorker` が付ける実行時コンテキストの「このターンでやること」が、
システム プロンプトを**事実上置き換えている**。手順に書いていない能力
（スキルの読み込み、デザイン ガイド、コード実行）は使われない。

**対処**:

- 短期: メール経路のコンテキストに、**扱いうる仕事の分岐をすべて書く**。
  資料作成なら手順（ガイドを読む → コードで生成 → 受け渡し）をそのまま再掲する。
- 原則: チャネル コンテキストには「今どこにいて、誰が待っているか」だけを書く。
  判断基準はシステム プロンプトに一本化する（→ [outbound-formatting.md](outbound-formatting.md) §5）。
- **確認は必ず両方の入口から同じ依頼を投げて成果物を並べる。**
  片方だけで見ていると、この種の劣化は永久に見つからない。

## 36. 共有を頼むと必ず「区分が未記録」で止まる（B14）

- 台帳を入れる前に作ったファイルには依頼元も区分も無い。**仕様どおりの挙動**。
  中身を読ませて `classify_document` で記録してからやり直す。過去分の一括分類はしない。
- 新しく作ったファイルでも起きる場合、生成ツール（`create_office_file` / `deliver_file`）の
  引数に `owner` / `sensitivity` を足し忘れているか、保存処理から台帳への記録を呼んでいない。
- 一覧に出てこない場合は、生成側と共有側で `Documents__Folder` の値がずれている。

## 37. `decide_share` が「あなたは依頼元ではありません」と拒否する（B14）

- **仕様どおり**。許可は台帳上の依頼元本人からしか受け付けない。代理承認は通さない。
- 誰が承認しても拒否される場合は、**話し相手のアドレスがツール組み立て時に解決されていない**。
  解決処理をツール接続より**前**に移し、引数として渡す。順番だけの問題で、エラーは出ない。
- 受信トレイ経路・定期実行では意図的に受け付けない。**メールの返信は許可の根拠にならない**
  （差出人は偽装できる）。許可は Teams チャットで取る。

## 38. 社外の相手が共有リンクを開けない（B14）

- リンクの `scope` は常に `organization`。**想定どおりの挙動**。
- `anonymous` に落として解決してはいけない。URL が転送されるだけで統制が消える。
- `existingAccess` も解決にならない。何の権限も付かず、リンクだけ渡って相手が困る。
- ゲスト招待など、テナント側の手当てを人間が行う。エージェントは「この宛先では開けない」と伝えるまでが仕事。

## 39. 定期配信が一度も届かない（B11）

**症状**: 「平日 8:00 にニュースを送って」で登録は成功し、`list_schedules` にも出る。
しかし時間になっても Teams チャットに何も来ない。エラー ログも出ない。

**原因**: App Service が **Free / Shared プラン（F1・D1）**で、**Always On が無い**。
リクエストが約 20 分来ないとアプリがアンロードされ、`BackgroundService` ごと止まる。
8:00 に誰も話しかけていなければ、期限判定そのものが走らない。

紛らわしいのは、**受信トレイ監視（B6）は動いているように見える**こと。
Teams のメッセージ受信が HTTP でアプリを起こすため、人が触っている時間帯だけ処理が進む。
「メールは処理されているのに定期配信だけ来ない」はこの差。

**対処**:

```powershell
az webapp config show -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME --query alwaysOn
az appservice plan update -g $env:AZURE_RESOURCE_GROUP -n <plan> --sku B1
az webapp config set -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME --always-on true
```

Free プランでは Always On のトグル自体が存在しない。B1 以上へのスケールアップが前提。
F1 には 1 日 60 CPU 分のクォータもあり、超えるとその日はアプリが停止する。

**恒久対策済み**: `scripts/provision_selfhost.py` が F1/D1 を指定するとエラーで停止し、
作成時に `--always-on true` を適用する。あわせて `ScheduleWorker` は起動時に登録済みジョブと
次回実行時刻をログへ出し、`tokens.Identity` が null のときも**無言で return せず警告を出す**
（以前は完全に無言だったため、止まっていることに気づけなかった）。

## 40. Teams / メールに長い URL がそのまま表示される（B6 / B9）

**症状**: リンクとしては機能しているが、本文に SharePoint の長い URL が生で並ぶ。
または「こちら」としか書かれておらず、何のファイルか分からない。

**原因は 2 つあり、両方直さないと再発する**。

1. `MessageHtml` の裸 URL 変換が、**表示文字に URL をそのまま使っていた**。
2. ツールの戻り値に「**この URL をそのまま相手に伝えること**」と書いてあった。
   プロンプト側で「URL を裸で貼るな」と指示していても、直近のツール結果のほうが強い。

**対処**（→ [outbound-formatting.md](outbound-formatting.md) §3）:

- 変換器側で、パス末尾やクエリの `file=` から**ファイル名**を、取れなければ**ホスト名**を
  表示文字にする。Markdown リンクの表示文字が URL そのものだった場合も同じ処理に通す。
- ツールの戻り値では、書式を説明せず**そのまま貼れる `[<実ファイル名>](<URL>)` を組み立てて返す**。

**恒久対策済み**: `templates/MessageHtml.template.cs` の `LinkLabel()` / `Shorten()`。
表示文字の 60 文字打ち切りが HTML エンティティを割らないようにする処理も同時に入れた。

## 41. `az webapp log tail` に何も出ない / 自分のログが見つからない

**症状**: 不具合の切り分けにログを見ようとしたら、何も流れてこない。
あるいは MSAL の出力ばかりで、`ILogger` に書いたはずの行が見当たらない。

**原因は 3 つある**。

1. **App Service のログ設定が既定で無効**。有効化しないとストリームは空のまま。

   ```powershell
   az webapp log config -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME `
     --application-logging filesystem --docker-container-logging filesystem --level information
   ```

2. **MSAL と `HttpClient` の既定ログが多すぎる**。トークン取得 1 回で数十行出るため、
   自作のログが端末のスクロール バックから押し出される。`appsettings.json` の
   `Logging:LogLevel` で両方 `Warning` に落とす（→ [self-hosted-agent.md](self-hosted-agent.md) 手順 3）。

3. **見たい行が起動時にしか出ない**のに、`restart` の後から `log tail` を繋いでいる。
   `log tail` を先に繋いでから restart し、コンテナ起動（1〜2 分）を待ち切る。
   `az` はファイルへリダイレクトすると出力をバッファするので、別プロセスで走らせる
   （手順は [self-hosted-agent.md](self-hosted-agent.md) 手順 7）。

`az webapp log download` はアーカイブ済みのファイルしか返さず、直近の起動は入らない。
Kudu の VFS API で直接読む手も、SCM の基本認証が無効なテナントでは 401 になる（→ #33）。

**恒久対策済み**: `scripts/provision_selfhost.py` が Web アプリ作成時にファイル システム ログを
有効化する。必要になってから慌てて設定しても、**その時点より前のログは残っていない**。

## 42. 「誰がいくら使っているか」が Azure ポータルで出せない（B15）

**症状**: コストの内訳を見たいと言われて Cost Management を開いたが、
リソース別・メーター別までしか割れない。人別・処理別・ツール別が出せない。

**原因**: エージェントからの呼び出しは**全部が同じマネージド ID**として Azure に届く。
Azure から見れば、朝の定期配信も誰かの雑談も同じ「Azure OpenAI への API 呼び出し」でしかない。
診断ログを有効にすればリクエスト単位のトークン数までは残せるが、
**そこにも「誰の依頼か」「どのツールを呼んだか」は含まれない**（アプリ内の出来事だから）。

| 知りたいこと | Azure ポータル |
|---|---|
| リソース別・モデル別・入出力別の料金 | 出せる |
| リクエスト単位のトークン数 | 出せる（診断ログ） |
| 誰が使ったか / 何の処理が使ったか / どのツールが高いか / 1 依頼あたりの費用 | **原理的に出せない** |

**対処**: アプリ側で 1 ターンごとに記録する（B15 → [usage-accounting.md](usage-accounting.md)）。
**さかのぼれない**のが最大の落とし穴で、「必要になってから入れる」が成立しない。
`ChatCompletion.Usage` を読んでいなければ、その期間の実績は永久に失われている。

**恒久対策済み**: `scripts/provision_selfhost.py` が Web アプリ作成時に
`Usage__Enabled` / `Usage__StorePath` を設定する。アプリに `UsageStore` を入れた瞬間から
永続領域へ記録が積まれ、「有効化し忘れて空だった」が起きない。

## 43. 利用レポートの金額が実際の請求額と合わない（B15）

**症状**: `usage_report` の概算費用と Azure の請求額がずれる。

**原因と切り分け**:

- **デプロイの SKU を取り違えている**。GlobalStandard / DataZone / Batch で単価が違う。
  `az cognitiveservices account deployment list --query "[].{name:name, sku:sku.name}"` で実物を見る。
- **キャッシュ入力を入力単価で二重に数えている**。`InputTokenCount` は
  `CachedTokenCount` を**含む**。キャッシュ分は概ね 1/10 の単価なので、差し引かないと過大になる。
- **単価の分母が違う**。価格表は 1M トークンあたり、設定は 1000 トークンあたり。
- **円換算のレート**。Azure のメーターは USD 建てで、円換算は前月末 2 営業日前の
  ロンドン市場終値で毎月変わる。設定に焼き込んだ固定レートは必ずズレる（併記に留める）。
- **App Service とサンドボックスは含まれない**。プランは定額、サンドボックスはセッション時間課金で、
  どちらもトークン費用の外側にある。
- **スケールアウトしている**。インスタンスごとに別ファイルへ書くため、
  1 台分しか集計されない。`numberOfWorkers=1` を維持するか共有ストアへ移す（→ #39 と同じ構造）。

## 44. しばらく放置した後、Teams の 1 通目だけ無視される

**症状**: 何日か使わずにいてから話しかけると 1 通目に反応が無い。もう一度同じことを送ると普通に返る。
毎回ではなく「久しぶりに使うとき」だけ起きるので、モデルやプロンプトの不調に見える。

**原因**: **App Service プランが Free / Shared で Always On が無効**。20 分リクエストが無いと
アプリがアンロードされ、次の 1 通が**コールド スタートを待たされる**。
そして **Bot Framework のチャネルは Activity を再送しない**ので、その 1 通は失われる。
2 通目は温まった後なので通る——これが「1 回めだけ無視される」の正体。

実測した内訳（Linux / `DOTNETCORE:8.0`）:

| 区間 | 所要 |
|---|---|
| コンテナ起動 → oryx の起動スクリプト生成（証明書更新を含む） | 約 30 秒 |
| `dotnet <App>.dll` → `Now listening on http://[::]:8080` | 約 25 秒 |
| **合計（プラットフォームの warm-up プローブ成功まで）** | **約 55〜80 秒** |

チャネル側のタイムアウトは十数秒なので、**コールド スタートに当たった時点で確実に負ける**。

**切り分け**: アプリのログを追う前に**プランと Always On を見る**。ここが原因なら、
アプリ側のログには「そもそも受信していない」以上の情報が出ない。

```powershell
az webapp show -g <rg> -n <app> --query "siteConfig.alwaysOn"
az appservice plan show --ids $(az webapp show -g <rg> -n <app> --query serverFarmId -o tsv) --query "sku.name"
```

**対処**: プランを B1 以上に上げて Always On を有効化する。

```powershell
az appservice plan update -g <rg> -n <plan> --sku B1
az webapp config set -g <rg> -n <app> --always-on true
```

**同時に直っていること**: アンロードは `BackgroundService` も道連れにする。
Free のままだと定期配信（B11）・受信トレイ監視（B6）・在席同期（B12）は、
たまたま誰かが直前に話しかけていた時だけ動く、という状態になっていた。

**残る穴**: B1 でも**デプロイ・再起動の直後だけ**は約 1 分のコールド スタート窓が残る。
Always On が消せるのは「放置による」アンロードだけなので、再デプロイ後は自分で 1 通投げて温める。

**恒久対策済み**: `provision_selfhost.py` が作成時に F1/D1 を拒否するだけでなく、
`verify_hosting()` で**成功時にもプランと Always On を読み戻して検証**する。
後からプランを下げたドリフトは `--check` で検出できる。

```powershell
python scripts/provision_selfhost.py --check
```


## 45. 利用レポートの「相手」に `(不明)` が並ぶ（B15）

**症状**: `group_by=actor` の内訳に `(不明)` の行が出る。件数が受信トレイ監視（`mailbox`）の
処理件数とちょうど一致する。

**原因**: その入口が `UsageContext` に `Actor` を渡していない。とくに `MailboxWorker` は
**1 回のスイープで複数の未読を 1 ターンにまとめる**作りにしがちで、差出人が 2 人いると
そのターンはどちらの利用でもなくなる（`UsageRecord.Actor` は 1 つしか持てない）。
結果、実装の都合で `null` を渡すことになる。

**対処**:

- 差出人アドレスで `GroupBy` し、**1 差出人 = 1 ターン**にしてから `UsageContext` を渡す。
  未読は通常 0〜1 件なのでターンはほとんど増えず、インジェクションの影響範囲も差出人ごとに閉じる。
- `Actor` は素のメール アドレス（`from.emailAddress.address`）を使う。
  表示名付きの `"名前 <アドレス>"` を混ぜると、同じ人が 2 行に割れる。
- **記録済みの `(不明)` は後から埋められない。** 識別子そのものを保存していないので、
  そこは正直に「計測の不備で相手を特定できない期間」と伝える。

**恒久対策済み**: `UsageTools.template.cs` が `Actor` の空いている記録の件数をレポート末尾に出す。
`(不明)` が静かに増え続ける状態にならない（→ [usage-accounting.md](usage-accounting.md) §2）。

## 46. ファイルを添付しても「ファイルを送ってください」と返る（B16）

**症状**: Teams で画像や資料を添付して依頼すると、エージェントが
「共有リンクを貼るか、ファイルを添付してください」と返す。添付し直しても同じ。
**例外もエラー ログも出ない。**

**原因**: 次のどちらか（両方のことも多い）。

| 原因 | 見分け方 |
|---|---|
| マニフェストの `bots[].supportsFiles` が `false` | Teams が添付情報を配信しないので、ログに `Received ...` が一切出ない |
| ターン ハンドラーが `Activity.Attachments` を読んでいない | 実装に `Attachments` が出てこない |

Teams は**ファイルの中身を送らない**。送るのは取りに行くための参照だけなので、
取りに行かない実装からは添付が付いていたことすら見えない。

**対処**:

1. マニフェストで `supportsFiles: true` にして**パッケージを作り直し、Teams アプリを更新する**。
   コードだけ直しても届かない。
2. [templates/IncomingFiles.template.cs](templates/IncomingFiles.template.cs) を入れ、
   ターンの先頭で `CollectAsync` → `StageAsync` を呼ぶ（→ [incoming-files.md](incoming-files.md)）。
3. 画像は vision で見せるだけでなく **`/mnt/data` にも置く**。見せるだけでは加工できない。

**関連する詰まり方**:

- 添付だけで本文が空の発言が「テキストが読み取れませんでした」で弾かれる
  → 空判定を「本文が空**かつ**添付も無い」に変える。
- 貼り付け画像だけ取れない → 署名済み URL と違い、チャネルのトークンが要ることがある。
  認証なしで GET し、`401` / `403` のときだけトークンを付けて 1 回再試行する。
- `.bmp` などを送るとターンごと落ちる → vision に渡すのは png / jpeg / gif / webp だけにする。

**恒久対策済み**: `build_teams_package.py` の `assert_supports_files()` が、
パッケージのたびに `bots[].supportsFiles` を検証して `false` なら中止する。

## 47. Always On を有効にしても、翌朝には必ず無効に戻っている

**症状**: #44 の手順でプランを上げて Always On を有効にしたのに、
数日おきに「1 通目が無視される」が再発する。確認すると **Free に戻っている**。
自分で下げた覚えはない。

**原因**: サブスクリプションのコスト ガバナンス自動化が、定期的にプランを最小 SKU へ戻している。
デモ用・社内配布のサブスクリプションでは珍しくない。**人ではないので誰にも心当たりがない。**

**確認**:

```powershell
az monitor activity-log list -g <rg> --offset 7d --max-events 2000 --namespace Microsoft.Web `
  -o json | ConvertFrom-Json |
  Where-Object { $_.operationName.value -like '*serverfarms/write*' -and $_.status.value -eq 'Succeeded' } |
  Select-Object @{n='JST';e={([datetime]$_.eventTimestamp).ToLocalTime()}}, caller | Sort-Object JST
```

`caller` が**メール アドレスではなく GUID** で、しかも毎日ほぼ同じ時刻に並んでいたら自動化。
その GUID の 1 件を `ConvertTo-Json` で開き、`claims.tenantid` が**自分のテナントと違えば**
サブスクリプションを配布している側の統制。`az consumption budget list` に予算が出ることも多い。

**対処**: 上げ直しても翌朝に戻るので、**Always On に依存しない形へ寄せる**。
統制そのものを止めるのは、例外申請という正規の手続きで行う。ロックなどで自動化の書き込みを
ブロックするのは、組織のコスト統制の迂回にあたるので選ばない。

### Always On を前提から外す

1. **依存を持たない `/health` を生やす**（→ [templates/AgentHealth.template.cs](templates/AgentHealth.template.cs)）。
   資格情報も MCP クライアントもモデルも温まる前に答えられる必要があるので、
   認証も下流呼び出しも入れない。

   ```csharp
   app.MapGet("/health", (AgentHealth health) => Results.Json(health.Snapshot())).AllowAnonymous();
   ```

2. **可用性テストで叩き続ける。** Application Insights の標準テストは最短 5 分間隔で、
   **地点数だけ並列に飛ぶ**。5 地点なら実質 1 分に 1 回になり、アイドル アンロード（約 20 分）に
   届かない。監視とウォーム アップが 1 つのリソースで済む。

   ```powershell
   az rest --method put --body "@webtest.json" `
     --uri "https://management.azure.com/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.Insights/webtests/<name>?api-version=2022-06-15"
   ```

   `tags` に `"hidden-link:<Application Insights のリソース ID>": "Resource"` を入れないと、
   作成はできてもポータルの可用性ブレードに出てこない。

3. **ワーカーの拍動を `/health` に出す。** `BackgroundService` が止まっても
   例外も失敗リクエストも出ず、次の訪問者には正常に見える。
   外形監視だけでは「Web は生きているが受信トレイ監視だけ死んでいる」を検出できない。

   ```json
   { "status": "ok", "uptimeSeconds": 8626,
     "workers": { "mailbox": { "agoSeconds": 43 }, "schedule": { "agoSeconds": 45 } } }
   ```

**残る制約**: 最小 SKU には 1 日あたりの CPU 割り当てがあり、超えると翌 UTC 0 時まで 403 を返す。
ping 自体は軽いが、モデル呼び出しの多い日は届きうる。`/health` に重い処理を足さないこと。

## 48. リソース グループをまとめようとすると、一部だけ移動できない

エージェント一式を専用の RG に集めるときに 2 か所で止まる。**先に検証だけ流す。**

```powershell
az rest --method post --body "@move.json" `
  --uri "https://management.azure.com/subscriptions/<sub>/resourceGroups/<src>/validateMoveResources?api-version=2021-04-01"
# 202 が返るので Location ヘッダーをポーリングする。204 なら通過、400 なら details に理由
```

| リソース | 挙動 | どうするか |
|---|---|---|
| `Microsoft.ManagedIdentity/userAssignedIdentities` | 検証で `ResourceMoveNotSupported` | **据え置く。** 作り直すと `clientId` が変わり、ボット登録の `msaAppId` と付与済みロールが全部外れる |
| `Microsoft.App/sessionPools` | **検証は通るのに移動が 409 で失敗**する | 移動先で作り直す。セッションは使い捨てなので失うものはない |

sessionPools は**検証の偽陽性**なので、一括移動に混ぜると他のリソースだけ移った中途半端な状態になる。
最初から外しておく。作り直したら次の 3 つを忘れない。

1. 実行者（エージェントのマネージド ID と自分）へ **Azure ContainerApps Session Executor** を再付与
2. 設定のプール エンドポイント（**RG 名が URL に入っている**）を書き換えて再デプロイ
3. 新しいプールで 1 行動かして確認してから、古いプールを消す

Web App とプラン、Cognitive Services、ボット登録は移動できる。
**Web App は移動しても再起動しない**（`uptimeSeconds` が連続する）ので、会話中でも切れない。

## 49. 貼り付けたスクリーンショットだけ見てもらえない（B16）

**症状**: ファイルとして添付した画像は読めるのに、**Ctrl+V で貼り付けた**スクリーンショットだけ
「画像が見えません」と返る。同じ会話・同じ相手・同じ形式でも、貼り付けたときだけ落ちる。

**原因**: 貼り付け画像の `contentUrl` が指す
`.../v3/attachments/{id}/views/original` は、**Agent 365 のエージェントからは取得できない**。

| 取り方 | 結果 |
|---|---|
| 認証なしで GET | `401` |
| エージェントのトークンを付けて GET | **`500`** |
| `IConnectorClient.Attachments.GetAttachmentAsync` | 同じ URL を叩くので **`500`** |

従来のボットは `MicrosoftAppCredentials`（`https://api.botframework.com` 宛のアプリ トークン）で
この API を叩く。Agent 365 のエージェントは**アプリ単体のトークンを取得できない**ので、その手は使えない。

```text
AADSTS82001: Agentic application '<blueprint appId>' is not permitted to
request app-only tokens for resource '<resource>'
```

`client_credentials` で試すと、`https://api.botframework.com/.default` でも
`5a807f24-.../.default` でも同じ `82001` が返る。**スコープの付け忘れではなく、この登録の性質**。

**見分け方**: Application Insights の依存関係を見る。同じ `smba.trafficmanager.net` 宛でも、
`/v3/conversations/...` は `200`／`202` なのに `/v3/attachments/...` だけ `500` になる。
認証は通っていて、この API だけが応答していない。

```kusto
AppDependencies
| where Data has "/v3/attachments/"
| project TimeGenerated, ResultCode, Data
```

**対処**: 貼り付け画像は**どこにもアップロードされていない**。実体は Teams のメッセージそのものの中にあり、
そのチャットの**参加者にだけ**配られる。エージェントは参加者なので、B9 のチャット読み取りと同じ経路で取れる。

```text
GET /chats/{chatId}/messages/{messageId}/hostedContents
GET /chats/{chatId}/messages/{messageId}/hostedContents/{id}/$value
```

- `chatId` は `Activity.Conversation.Id`、`messageId` は `Activity.Id` をそのまま使う
- トークンは `AgenticTokenSource`（エージェント自身のユーザー）から取る
- 委任スコープは **`Chat.Read`**。`grant_agent_graph_scopes.py` の既定に含まれるので追加同意は要らない
- 添付と `hostedContents` は同じ順で並ぶので、順に取り出して対応させる

実装は [templates/IncomingFiles.template.cs](templates/IncomingFiles.template.cs) の
`PastedImagesAsync`。`403` が返るならスコープ不足、`404` ならメッセージ ID の取り違え。

**同時に直すこと**: 貼り付け画像には**名前が無く**、`contentType` は文字どおり `image/*` で、
URL にも拡張子が無い。`image/*` は vision が受け取れる形式ではないので、そのまま渡すと
**取得には成功しているのに 1 枚も見せられない**。ログには
`Received file.bin (image/*, 254321 bytes)` と出るのに、エージェントは「画像が見えません」と答えるので、
バイト列の先頭で形式を判定して名前を付け直す（同テンプレートの `Describe` / `Sniff`）。

**受け入れ確認に入れる**: 「ファイルとして添付」と「Ctrl+V で貼り付け」は**別の経路**なので、
片方だけ試しても意味がない。両方を確認手順に入れる。
