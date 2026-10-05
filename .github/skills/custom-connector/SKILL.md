---
name: custom-connector
description: "Entra ID（OAuth 認可コード）で保護された自前の API を、Power Platform のカスタム コネクタとして作成し、on-behalf-of ログインで接続の作成・接続参照へのバインド・操作の呼び出し確認・Code Apps へのデータソース追加までブラウザ操作なしで進める。公開 API の無い接続作成は、画面の要求を観測した非公開 API（plan → hash 承認 → apply → read-back）で行う。on-behalf-of を使えない場合のブラウザ同意・利用者による手動作成も用意する。Code Apps の CSP で直接読めない公開サイト・公開 API は、認証なし・ホスト固定・GET だけのコネクタ（public-site テンプレート）で読む。"
category: automation
triggers:
  - "カスタムコネクタ"
  - "カスタム コネクタ"
  - "custom connector"
  - "コネクタ 作成"
  - "接続の作成"
  - "OAuth コネクタ"
  - "pac connector"
  - "getConsentLink"
  - "AADSTS90008"
  - "接続 ポップアップ ブロック"
  - "Code Apps から自前 API"
  - "on-behalf-of"
  - "createoboconnection"
  - "外部サイト 取得"
  - "認証なし コネクタ"
---

# カスタム コネクタ作成スキル

自前の API（Azure Functions 等。Entra ID で保護）を、Code Apps・Power Automate・Copilot Studio から
**利用者本人の権限で**呼べるカスタム コネクタにする。正常系は**ブラウザ操作なし**で、コネクタ作成から
接続・接続参照・API 呼び出しの確認まで終わる（on-behalf-of ログイン）。

```
Entra API アプリ（スコープ公開 + Graph User.Read + シークレット + Azure API Connections の事前承認）
   └─ カスタム コネクタ（OpenAPI + OAuth: aad + on-behalf-of）── 接続（利用者ごと）── 接続参照 ── Code Apps のデータソース
```

| 段階 | 方法 | 公開 API |
|---|---|---|
| コネクタの作成・更新 | `pac connector create / update` + ランタイム側の読み戻し | あり |
| 接続の作成（on-behalf-of） | 画面の要求を観測した Power Platform API（`createoboconnection`） | **無い**（[観測 contract](references/connection-api-contract.md)） |
| 接続参照のバインド | Dataverse Web API | あり |
| 操作の呼び出し確認 | コネクタのランタイム URL（Code Apps を介さない） | あり |
| データソース追加 | `pa app add data-source` | あり |

リファレンス: [観測 contract](references/connection-api-contract.md) / [異常系・ブラウザで作る方法](references/troubleshooting.md) / [公開サイト（認証なし）](references/public-site.md) / [パラメータ](references/.env.example)

## Step 0: 事前確認（会話の最初に 1 回だけ）

[standard の共通契約](../standard/SKILL.md#共通の事前確認契約会話の最初に-1-回だけ)に加え、1 回の AskUserQuestion で確認する。

| # | 質問 | 合格条件 |
|---|---|---|
| 1 | 対象の環境・ソリューション・API のホスト名 | `ENV_ID` / `DATAVERSE_URL` / `SOLUTION_NAME` と API のホストが決まっている |
| 2 | Entra アプリ登録とシークレット発行の担当者 | アプリ登録の作成・更新権限がある。シークレットの保存先（`.secrets/`、Git 除外）を合意 |
| 3 | 接続の所有者（誰の権限で API を呼ぶか） | スクリプトを実行するサインイン ユーザーが所有者になる。別の人が所有者なら、その人が実行する |
| 4 | 同じ Entra アプリを使う既存コネクタ | 同じ環境で同じ API アプリに on-behalf-of を有効にできるコネクタは 1 つだけ。検証用の複製は作らない |
| 5 | DLP の分類 | API のホストをどのグループ（Business / Non-business）に入れるか、変更の承認者 |

## Step 1: Entra API アプリを用意する

mcp-server のスクリプトを使う。スコープの表示名は同意画面にそのまま出るので、用途に合わせて `.env` で指定する。

```powershell
python .github/skills/mcp-server/scripts/configure_entra_api.py            # スコープ公開 + CLI の事前承認
python .github/skills/mcp-server/scripts/configure_connector_oauth.py --audience api://<app-id> --scope <scope> --secret-out .secrets/<name>.json
```

2 本目はリダイレクト URI、自分自身のスコープ、**Graph の `User.Read`**（無いと同意が AADSTS90008）、シークレットに加え、
**Azure API Connections（`fe053c5f-3692-4f14-aef2-ee34fc081cae`）をスコープの事前承認クライアント**に追加する。
これが on-behalf-of で同意画面を出さない条件になる（使わないなら `--no-obo`）。

## Step 2: API 側の認可をコネクタに合わせる

on-behalf-of でも同意経由でも、API に届くのは **API アプリ自身をクライアントにした委任の v1 トークン**
（`appid` = API アプリ、`scp` = Graph の `User.Read`、利用者の `oid` あり）。API は次のどちらかで許可し、それ以外は 401 にする。

- 委任トークン（`scp` と `oid` がある）で、`scp` に公開スコープがある（CLI など別クライアント）
- 委任トークンで、`appid` / `azp` が信頼するクライアント（既定は API アプリ自身。シークレットを持つコネクタだけが取れる）

実装例は realtime-speech の Function テンプレートの `authorizeClaims()`。

## Step 3: コネクタを作成する

```powershell
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/custom-connector/templates/oauth-api --target <出力先> --dry-run
```

`connector/` の `paths` を API に合わせて書き換え、作成する（更新は `--connector-id <GUID>` を付ける）。
`info.title` は pac がコネクタ名に使うので英数字・ハイフン・アンダースコアだけにする（日本語は `description`）。

> **認証なしの公開サイト・公開 API**（Code Apps の CSP でブラウザから読めない外部ページ）は、テンプレート `public-site` を使い、
> `--secret-file` を付けずに作成する。Step 1・2 は不要で、Step 6 の plan は `mode: noauth`（同意なしで Connected）になる。
> ホスト固定・GET だけ・利用者の操作ごとに 1 ページの約束は [public-site.md](references/public-site.md)。
テンプレートの `apiProperties.json` は on-behalf-of が有効（`IsOnbehalfofLoginSupported: true` と `enableOnbehalfOfLogin: "true"`）。

```powershell
python .github/skills/custom-connector/scripts/deploy_connector.py --connector-dir <出力先>/connector `
  --secret-file .secrets/<name>.json --solution <solution> `
  --var API_HOST=<host> --var CONNECTOR_TITLE="<表示名>" --var PUBLISHER="<発行元>"
```

スクリプトは次を自動で行う。

1. 同じ API アプリで on-behalf-of を有効にした別コネクタが無いことを確かめる（あれば止まる）
2. `pac connector create / update` を実行し、Dataverse からコネクタ ID（`shared_…`）を読む
3. ランタイム側（PowerApps RP）に on-behalf-of が反映されたことを読み戻す（`[sync] ランタイム側に反映済み`）
4. コネクタ固有のリダイレクト URI を Entra アプリへ登録する

最後に表示される `connector: shared_…` を以降で使う。

## Step 4: DLP でホストを分類する

```powershell
python .github/skills/admin/scripts/check_dlp.py --environment-id <env> --tenant-id <tenant> --custom-host <host>
python .github/skills/admin/scripts/set_dlp_custom_connector.py --policy <ポリシー名> --host <host> --classification General --apply
```

未分類のままだと、ほかのコネクタと同じグループかどうかが既定の扱いで決まる。分類の変更はテナント全体に効くため承認を得る。

## Step 5: 接続参照を用意する

```powershell
python .github/skills/code-apps/scripts/setup_connection_reference.py --api-id <shared_…> --solution-name <solution> --prefix <prefix>
```

## Step 6: 接続を作成してバインドする

plan を作り、内容とハッシュを承認してから apply する。plan はコネクタ定義を読み、`mode: obo（ブラウザ不要）` と表示する。

```powershell
python .github/skills/custom-connector/scripts/create_connection.py plan --connector <shared_…> `
  --display-name "<表示名>" --connection-reference <接続参照の論理名>
python .github/skills/custom-connector/scripts/create_connection.py apply --plan .mcp/connection-plan.json --plan-hash <sha256>
```

apply は on-behalf-of 接続を作成し（名前はサーバーが `shared-<コネクタ>-<GUID>` の形で決める）、`Connected` を読み戻して接続参照にバインドする。
失敗したら作成した接続を削除する。所要時間は数秒。

> plan が `mode: consent` になったら、コネクタの on-behalf-of がランタイムに届いていない。Step 3 を再実行して `[sync]` を確かめる。
> on-behalf-of を使えない API でブラウザ同意する方法、所有者にポータルで作ってもらう方法は [troubleshooting](references/troubleshooting.md#ブラウザで接続を作る方法on-behalf-of-を使えない場合) を参照。

## Step 7: 操作を呼んで確かめる

Code Apps を作る前に、接続経由で操作を 1 回呼ぶ。値は表示せず、ステータスと応答の形だけを出す。

```powershell
python .github/skills/custom-connector/scripts/create_connection.py invoke --connector <shared_…> `
  --connection-name <接続名> --path <操作のパス>
```

`200` と応答の形が出れば、コネクタ → 接続 → API の認可までつながっている。API のログで呼び出し元（`oid`）も確認する。

## Step 8: Code Apps に追加して呼ぶ

```powershell
npx --no pa app add data-source --connector <shared_…> --connection-ref <論理名> --solution-id <GUID> --non-interactive
```

`src/generated/services/<Title>Service.ts` が生成され、OpenAPI の `operationId` がメソッドになる。
生成サービスは遅延読み込みにする（未追加でもビルドできる。realtime-speech の `token.ts` の方式）。
初回起動時にプレイヤーが「Allow &lt;アプリ&gt; to access your data?」を出したら、接続が「Connection Complete」と表示されることを確かめて Allow する。

## Step 9: 後片付け

```powershell
python .github/skills/custom-connector/scripts/create_connection.py status --connector <shared_…>
python .github/skills/custom-connector/scripts/create_connection.py delete --connector <shared_…> --connection-name <name> --yes
```

検証用に作った接続は `delete` で消す（読み戻しで消えたことを確認する）。検証用のコネクタを作った場合も、
接続を消してから Dataverse の `connectors(<connectorid>)` を削除する（残すと本番コネクタの on-behalf-of が同期されない）。

## 検証チェックリスト

- [ ] Step 0 を 1 回の質問で確認し、接続の所有者と同じ API アプリを使う既存コネクタを把握した
- [ ] アプリに自分自身のスコープ・Graph `User.Read`・Azure API Connections の事前承認があり、シークレットは `.secrets/` にだけある
- [ ] API がコネクタのトークン（`scp=User.Read`、`appid`=API アプリ）を許可し、アプリ専用トークンを拒否する
- [ ] `deploy_connector.py` が `[sync] ランタイム側に反映済み（on-behalf-of=有効）` とリダイレクト URI を表示した
- [ ] DLP でホストを分類した（または承認を得て既定のままにした）
- [ ] 認証なしのコネクタは https・GET だけで、取得先の利用規約を確かめ、取得に失敗したときの代わりの入力（貼り付け）を用意した
- [ ] plan が `mode: obo`、apply で接続が `Connected` になり、接続参照にバインドされた
- [ ] `invoke` が 200 を返し、API のログに呼び出し元が出た
- [ ] 検証用の接続・コネクタを削除した
