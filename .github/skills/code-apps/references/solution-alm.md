# ソリューション ALM（接続参照バインド）詳細リファレンス

Code App を **ソリューション同梱**にして環境間で移送できる状態にするための手順と、
検証で判明した仕様・制約をまとめる。正常系の手順は [SKILL.md](../SKILL.md) の §2 を参照。

---

## 目次

- [なぜ接続参照が必要か](#なぜ接続参照が必要か)
- [almMode は初回 push でしか決まらない](#almmode-は初回-push-でしか決まらない)
- [接続参照の用意（既存流用ファースト）](#接続参照の用意既存流用ファースト)
- [接続参照バインドの効果](#接続参照バインドの効果)
- [ソリューション コンポーネント種別](#ソリューション-コンポーネント種別)
- [確認コマンド](#確認コマンド)
- [共有時の権限モデル](#共有時の権限モデル)

---

## なぜ接続参照が必要か

`add-data-source --connection-id {id}` で追加した **接続（connection）はソリューション コンポーネントになれない**。
そのため接続 ID 直バインドのままでは、ソリューションをエクスポートしても接続情報が持ち運べない。

**接続参照（connection reference）はソリューション コンポーネント**なので、
接続参照にバインドしておけば Dev → Test → Prod の移送時に接続だけ差し替えられる。

| バインド方式 | `power.config.json` のキー | ソリューション格納 | 移送 |
|---|---|---|---|
| 接続 ID 直バインド | `authenticationType: "Oauth"` | ✗ | 不可 |
| **接続参照バインド** | `xrmConnectionReferenceLogicalName` | ✅ | 可 |

> 補足: Code Apps のネイティブ Dataverse 方式（`pac code add-data-source -a dataverse -t {table}`）は
> `power.config.json` の `databaseReferences` 側に載るため、そもそも接続参照にできない。
> **connector-first（`shared_commondataserviceforapps`）方式の方が ALM 適性が高い。**

---

## almMode は初回 push でしか決まらない

Power Apps API でアプリのメタデータを見ると `almMode` プロパティがある。

| 値 | 意味 |
|---|---|
| `Environment` | ソリューション非対応。Dataverse に `canvasapp` レコードが作られない |
| `Solution` | ソリューション対応。`solutioncomponent` に登録される |

検証で判明した挙動:

- `pac code push -s {SOLUTION_NAME}` は **アプリ新規作成時（`power.config.json` の `appId` が未割当の初回 push）にのみ** `almMode` を `Solution` にする。
- 既に `almMode: Environment` で作られたアプリは、後から `-s` を付けて push しても
  ソリューションに入らない（`solutioncomponent` は空のまま／`canvasapps({appId})` は `Does Not Exist`）。
- `pac code init` にソリューション指定オプションは無い（`-env / -n / -d / -b / -f / -a / -l / -c` のみ）。
  つまり **ソリューション所属は初回 push で決まる**。

> **正規プロセス**: ソリューションと接続参照を**先に**用意し、`pac code init` の直後の
> **初回 push で必ず `-s {SOLUTION_NAME}` を付ける**。
> 既に `Environment` で作ってしまった場合の復旧は
> [Learn: ALM for code apps](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/alm)
> の「Add to a solution in Power Apps UI」（ソリューション → 既存の追加 → アプリ → コード アプリ）。

### npm CLI (`npx pa app push`) の場合は GUID を渡す

`pac code push -s` はソリューション**名**だが、npm CLI の `npx pa app push -s` は
**ソリューション ID（GUID）**を要求する。同じ `-s` でも受け付ける値が違うので注意。

```bash
npx pa app push --solution-id {SOLUTION_ID}
```

| CLI バージョン | `-s` に名前を渡した場合 |
|---|---|
| `@microsoft/power-apps-cli` 0.12.3 以前 | 内部で `friendlyname` / `uniquename` を検索し GUID に解決（動いていた） |
| `@microsoft/power-apps-cli` 0.13.0 以降 | `Invalid --solution-id value: expected a GUID, got '<値>'.` で即失敗（**破壊的変更**） |

`-s` を**省略**したときの 0.13.0 の自動解決（初回 push のみ適用。二回目以降は既存の所属を変えない）:

1. 環境の優先ソリューション（未設定なら Common Data Service Default Solution）
2. それも無ければ全コンポーネントの Default solution
3. Dataverse が無効な環境ならソリューション無しで push

意図しない Default ソリューションへの混入を避けるため、**初回 push では `--solution-id` を明示する**。
なお `--solution-id ""`（空文字）は
`Invalid --solution-id value: expected a GUID, got an empty value.` でエラーになる。

---

## 接続参照の用意（既存流用ファースト）

接続参照を**新規作成できる CLI コマンドは存在しない**（検証済み）。

| 手段 | 可否 |
|---|---|
| `npx pa app add data-source --connection-ref {未存在の名前}` | ✗ `Failed to resolve connection ID for reference '...'` |
| `pac connection create` | ✗ サービス プリンシパル用の **接続**を作る（接続参照ではない） |
| `npx pa connection create` | ✗ **接続**を作る（接続参照ではない） |
| **Dataverse Web API `POST /connectionreferences`** | ✅ 自動化可能 |
| Power Apps ポータル（ソリューション → 新規 → その他 → 接続参照） | ✅ 手動 |

したがって [scripts/setup_connection_reference.py](../scripts/setup_connection_reference.py) を正常系とする。
処理順は次のとおり。

1. 対象ソリューション内に対象コネクタの接続参照があれば**そのまま流用**
2. 無ければ環境内の既存接続参照を探し、`AddSolutionComponent` で**ソリューションへ追加して流用**
3. それも無ければ `POST /connectionreferences` で**新規作成**してソリューションへ追加

```powershell
python .github/skills/code-apps/scripts/setup_connection_reference.py
# 流用せず必ず新規作成したいとき
python .github/skills/code-apps/scripts/setup_connection_reference.py --force-create
```

出力の末尾に、そのまま実行できる `pa app add data-source` コマンドが表示される。

---

## 接続参照バインドの効果

`shared_commondataserviceforapps` を接続参照にバインドしても、
**「1 回の追加で全テーブルをカバーする」設計は一切変わらない**（検証済み）。

```powershell
npx pa app add data-source --connector shared_commondataserviceforapps `
  --connection-ref {CONNECTION_REFERENCE_LOGICAL_NAME} `
  --solution-id {SOLUTION_ID} `
  --org-url {DATAVERSE_URL} --non-interactive
```

| 観点 | 結果 |
|---|---|
| `--connector` | `shared_commondataserviceforapps`（**コネクタ単位**。テーブル名ではない） |
| 生成ファイル | `MicrosoftDataverseService.ts` / `MicrosoftDataverseModel.ts` の 2 つのみ（テーブル数に非依存） |
| 生成メソッド数 | 接続 ID 直バインド時と同一 |
| テーブル指定 | 従来どおり実行時の `entityName` 引数（EntitySetName／複数形） |
| アプリ側コード変更 | **不要**（データソース名が変わらなければ再ビルドのみ） |

`power.config.json` の差分は 1 行の追加だけ。

```jsonc
"connectionReferences": {
  "{GUID}": {
    "id": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
    "displayName": "Microsoft Dataverse",
    "dataSources": ["commondataserviceforapps"],
    "authenticationType": "Oauth",
    "dataSets": {},
    "xrmConnectionReferenceLogicalName": "{CONNECTION_REFERENCE_LOGICAL_NAME}"
  }
}
```

> **バインドを差し替えるとき**: `pa app add data-source` は既存データソースを上書きしない（`_1` 等の別名で増える）。
> 先に `npx pa app remove data-source --connector shared_commondataserviceforapps
> --data-source-name commondataserviceforapps --force` で削除してから再追加する。

---

## ソリューション コンポーネント種別

`AddSolutionComponent` / `pac solution add-solution-component` で使う値。

| コンポーネント | Web API の `ComponentType` | `pac` の `--componentType` |
|---|---|---|
| 接続参照 | `10132` | `connectionreference` |
| キャンバス アプリ | `300` | `canvasapp` |
| テーブル | `1` | `entity` |
| クラウド フロー | `29` | `workflow` |

> `pac solution add-solution-component` は**数値を受け付けない**（`Component Type Id (10132) is not known`）。
> **型名**を渡す。逆に Web API は数値のみ。

---

## 確認コマンド

```powershell
# ソリューション ID を取得（日本語名がある環境では先に UTF-8 に切り替える）
[Console]::OutputEncoding = [Text.Encoding]::UTF8
pac solution list --json | ConvertFrom-Json | Format-Table

# ソリューション内の接続参照
pac code list-connection-references -env {DATAVERSE_URL} -s {SOLUTION_ID}

# ソリューション コンポーネント一覧
pac env fetch --xml "<fetch><entity name='solutioncomponent'><attribute name='objectid'/><attribute name='componenttype'/><filter><condition attribute='solutionid' operator='eq' value='{SOLUTION_ID}'/></filter></entity></fetch>"

# Code App が Dataverse 側に登録されているか（almMode: Solution なら取得できる）
pac env fetch --xml "<fetch><entity name='canvasapp'><attribute name='name'/><attribute name='displayname'/><filter><condition attribute='displayname' operator='eq' value='{APP_DISPLAY_NAME}'/></filter></entity></fetch>"
```

---

## 共有時の権限モデル

Dataverse コネクタは **明示的に共有されるコネクタ**（OAuth / Entra ID 認証）である。

- アプリを他ユーザーに共有すると、そのユーザーは**自分自身の接続**を作る（同意ダイアログ）。
- 実行時の権限は**そのユーザーの Dataverse セキュリティ ロール**に従う。開発者の権限は継承されない。
- したがって共有時は「アプリの共有」に加えて**セキュリティ ロールの割り当て**が別途必要。
- 接続参照は **ALM のための仕組み**であって、権限を昇格させるものではない。
- 権限を昇格させたい場合は Power Automate フロー（`shared_logicflows`）を経由する。
  フローは**フロー作成者の接続**で実行されるため、意図的な昇格経路になる。

参考: [Learn: Share resources used by canvas apps](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/share-app-resources)
