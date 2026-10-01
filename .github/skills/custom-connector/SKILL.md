---
name: custom-connector
description: "Entra ID（OAuth 認可コード）で保護された自前の API を、Power Platform のカスタム コネクタとして作成し、接続の作成・接続参照へのバインド・Code Apps へのデータソース追加まで非対話スクリプトで進める。公開 API の無い接続作成は、画面の要求を観測した非公開 API（plan → hash 承認 → apply → read-back）で行い、利用者が自分のブラウザで作成して API で完了を確認する手順も用意する。"
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
---

# カスタム コネクタ作成スキル

自前の API（Azure Functions 等。Entra ID で保護）を、Code Apps・Power Automate・Copilot Studio から
**利用者本人の権限で**呼べるカスタム コネクタにする。

```
Entra API アプリ（スコープ公開 + Graph User.Read + シークレット）
   └─ カスタム コネクタ（OpenAPI + OAuth: aad）──── 接続（利用者ごと・OAuth）──── 接続参照 ──── Code Apps のデータソース
```

| 段階 | 方法 | 公開 API |
|---|---|---|
| コネクタの作成・更新 | `pac connector create / update` | あり |
| 接続の作成（OAuth） | 画面の要求を観測した Power Platform API | **無い**（[観測 contract](references/connection-api-contract.md)） |
| 接続参照のバインド | Dataverse Web API | あり |
| データソース追加 | `pa app add data-source` | あり |

リファレンス: [観測 contract](references/connection-api-contract.md) / [異常系](references/troubleshooting.md) / [パラメータ](references/.env.example)

## Step 0: 事前確認（会話の最初に 1 回だけ）

[standard の共通契約](../standard/SKILL.md#共通の事前確認契約会話の最初に-1-回だけ)に加え、1 回の AskUserQuestion で確認する。

| # | 質問 | 合格条件 |
|---|---|---|
| 1 | 対象の環境・ソリューション・API のホスト名 | `ENV_ID` / `DATAVERSE_URL` / `SOLUTION_NAME` と API のホストが決まっている |
| 2 | Entra アプリ登録とシークレット発行の担当者 | アプリ登録の作成・更新権限がある。シークレットの保存先（`.secrets/`、Git 除外）を合意 |
| 3 | 接続の所有者（誰の権限で API を呼ぶか） | 所有者本人がサインインできる。代理作成はしない |
| 4 | 接続の作成方法 | 自動（`apply`: 所有者のブラウザで localhost の URL を開く）か、手動（`manual`: 所有者がポータルで作成）か |
| 5 | DLP の分類 | API のホストをどのグループ（Business / Non-business）に入れるか、変更の承認者 |

## Step 1: Entra API アプリを用意する

mcp-server のスクリプトを使う。スコープの表示名は同意画面にそのまま出るので、用途に合わせて `.env` で指定する。

```powershell
python .github/skills/mcp-server/scripts/configure_entra_api.py            # スコープ公開 + CLI の事前承認
python .github/skills/mcp-server/scripts/configure_connector_oauth.py --audience api://<app-id> --scope <scope> --secret-out .secrets/<name>.json
```

2 本目はリダイレクト URI、自分自身のスコープ、**Graph の `User.Read`**（無いと同意が AADSTS90008）、シークレットを設定する。
`User.Read` を追加した直後は反映に数分かかる。

## Step 2: API 側の認可をコネクタに合わせる

コネクタは API アプリ自身をクライアントにして v1 トークンを取る。このトークンの `scp` は公開スコープではなく
Graph の委任スコープ（`User.Read`）になる。API は次のどちらかで許可し、それ以外は 401 にする。

- 委任トークン（`scp` と `oid` がある）で、`scp` に公開スコープがある（CLI など別クライアント）
- 委任トークンで、`appid` / `azp` が信頼するクライアント（既定は API アプリ自身。シークレットを持つコネクタだけが取れる）

実装例は realtime-speech の Function テンプレートの `authorizeClaims()`。

## Step 3: コネクタを作成する

```powershell
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/custom-connector/templates/oauth-api --target <出力先> --dry-run
```

`connector/` の `paths` を API に合わせて書き換え、作成する（更新は `--connector-id <GUID>` を付ける）。

```powershell
python .github/skills/custom-connector/scripts/deploy_connector.py --connector-dir <出力先>/connector `
  --secret-file .secrets/<name>.json --solution <solution> `
  --var API_HOST=<host> --var CONNECTOR_TITLE="<表示名>" --var PUBLISHER="<発行元>"
```

作成後に Dataverse からコネクタ ID（`shared_…`）を読み、コネクタ固有のリダイレクト URI を Entra アプリへ登録する。
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

## Step 6: 接続を作成する

**自動（標準）**: plan を作り、内容とハッシュを承認してから apply する。

```powershell
python .github/skills/custom-connector/scripts/create_connection.py plan --connector <shared_…> `
  --display-name "<表示名>" --connection-reference <接続参照の論理名>
python .github/skills/custom-connector/scripts/create_connection.py apply --plan .mcp/connection-plan.json --plan-hash <sha256>
```

apply は接続を作成し、`http://127.0.0.1:53682/start` を表示して待つ。**接続の所有者本人のブラウザ**で開き、
アカウントを選んで（初回は同意画面で Accept）、「Confirmation required」で作成者が本人であることを確かめてチェック → Allow access。
`Connected` を読み戻して接続参照にバインドする。失敗したら作成した接続を削除する。

**手動（所有者が自分で作る）**: URL を渡し、作成を API で確認する。

```powershell
python .github/skills/custom-connector/scripts/create_connection.py manual --connector <shared_…> --connection-reference <論理名>
```

表示された URL を所有者が **Microsoft Edge** で開き、「作成」→ サインインする（統合ブラウザはポップアップが開かない）。
新しい接続が `Connected` になったらバインドまで進む。

## Step 7: Code Apps に追加して呼ぶ

```powershell
npx --no pa app add data-source --connector <shared_…> --connection-ref <論理名> --solution-id <GUID> --non-interactive
```

`src/generated/services/<Title>Service.ts` が生成され、OpenAPI の `operationId` がメソッドになる。
生成サービスは遅延読み込みにする（未追加でもビルドできる。realtime-speech の `token.ts` の方式）。
デプロイ後、初回起動時にプレイヤーが出す「Allow &lt;アプリ&gt; to access your data?」で接続が「Connection Complete」と表示されることを確かめ、Allow する。

## Step 8: 確認と後片付け

```powershell
python .github/skills/custom-connector/scripts/create_connection.py status --connector <shared_…>
python .github/skills/custom-connector/scripts/create_connection.py delete --connector <shared_…> --connection-name <name> --yes
```

アプリから操作を 1 回呼び、API のログで呼び出し元（`oid`）を確認する。検証用に作った接続は `delete` で消す（読み戻しで消えたことを確認する）。

## 検証チェックリスト

- [ ] Step 0 を 1 回の質問で確認し、接続の所有者と作成方法を決めた
- [ ] アプリに自分自身のスコープと Graph `User.Read` があり、シークレットは `.secrets/`（Git 除外）にだけある
- [ ] API がコネクタのトークン（`scp=User.Read`、`appid`=API アプリ）を許可し、アプリ専用トークンを拒否する
- [ ] `deploy_connector.py` がコネクタ ID とリダイレクト URI を表示した
- [ ] DLP でホストを分類した（または承認を得て既定のままにした）
- [ ] 接続が `Connected` で、接続参照にバインドされている
- [ ] Code Apps から操作を呼び、API のログに呼び出し元が出た
- [ ] 検証用の接続を削除した
