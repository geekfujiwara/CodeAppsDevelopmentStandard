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
**Step 0 の時点で商標・著作権に配慮した名前を確定させる**。
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
  `manifestVersion: devPreview`（`agenticUserTemplates` 付き = Step 6 (b)/(c) で
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
- 影響範囲: Step 6 で **(a) テンプレート公開のみ**を選んだ場合は Step 10 自体を実施しないため無関係。
  **(b)/(c)** を選び `--require-template` でビルドした場合は必ずこの制約に当たるため、
  SKILL.md の Step 10 は「Graph 公開は GA/共有エージェント manifest 専用、
  Agent template は手動アップロード」と明記する。

