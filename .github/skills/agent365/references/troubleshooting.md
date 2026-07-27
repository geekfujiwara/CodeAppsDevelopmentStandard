# agent365 — 異常系・トラブルシュート

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

## 7. `sanitize.py` がテンプレートを壊す（散文中の語まで `${VAR}` になる）

- 原因: `AGENT_NAME` のような短い公開識別子が置換対象に入っている。
- 対処: `NON_SECRET_VARS` に追加する（または `--non-secret <NAME>` を渡す）。
  置換は**長い値から順に**実行される（部分文字列による取り違え防止）。

## 8. `review_sanitization.py` が Fail する

| メッセージ | 対処 |
|---|---|
| `.env is tracked` | `git rm --cached .env` し `.gitignore` に追加 |
| `Rendered manifest is tracked` | `git rm --cached agents/**/agent.yaml` |
| `Built Teams package is tracked` | `git rm --cached teams/*.zip` |
| `contains a real GUID` | 該当箇所を `${VAR}` へ置換し `.env.example` にプレースホルダーを追加 |
| `no ${VAR} placeholders found` | テンプレートが汎用化されていない。`sanitize.py` を実行する |

すべてゼロ GUID（`00000000-...`）はプレースホルダーとして許可される。

## 9. `a365` コマンドが固まる / ダイアログが出ない

→ [a365-cli.md](a365-cli.md) の 3〜5 節（パイプ禁止・`-EncodedCommand` での可視ウィンドウ起動・
Edge プロファイル）を参照。初回失敗時は同じコマンドを再実行すると冪等に修復されることが多い。

## 10. Windows PowerShell 5.1 で `&&` が使えない

- 対処: `;` で区切るか `; if ($?) { ... }` を使う。PowerShell 7（`pwsh`）なら `&&` が使える。

## 11. エージェント名を後から変えたくなった

識別子が広範囲に波及する（`.env` の変数名・フォルダ名 `agents/<name>/`・
`agenticUserTemplates[].id`・ZIP 名・Bot リソース名・Foundry のエージェント名）。
**Step 0 の時点で商標・著作権に配慮した名前を確定させる**。
既存の Foundry エージェントは削除せず残しても害はないが、Teams 側は同じアプリ ID の
バージョン更新として扱うため `TEAMS_APP_VERSION` の引き上げを忘れない。
