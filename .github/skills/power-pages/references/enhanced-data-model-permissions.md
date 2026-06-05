# Power Pages Enhanced Data Model — テーブル権限の教訓

> **対象**: Enhanced Data Model（datamodelversion: 2.0）を使用する Power Pages サイト。
> 2024年以降に作成されたサイトはデフォルトでこのモデルを使用する。

## 概要

Enhanced Data Model では、Power Pages ランタイムが **`mspp_` プレフィックスのテーブル**（mspp_entitypermission, mspp_webrole 等）を使用してセキュリティ評価を行う。

Web ロールの設定には 2 つのレイヤーがある:
1. **Web ロールの定義** → YAML ファイル（`create-webroles` パターン、upstream 準拠）
2. **テーブル権限への Web ロール紐付け** → type=18 の content JSON 内 `adx_entitypermission_webrole`（API）

---

## ★ Web ロールの作成（YAML ファイル — upstream 標準パターン）

> **upstream 準拠**: `microsoft/power-platform-skills create-webroles` は `.powerpages-site/web-roles/` 配下の YAML ファイルで Web ロールを定義する。`pac pages upload-code-site` でデプロイすると Dataverse に反映される。

### ディレクトリ構造

```
.powerpages-site/
└── web-roles/
    ├── administrators.yml
    ├── authenticated-users.yml
    └── anonymous-users.yml
```

### YAML ファイルフォーマット

```yaml
anonymoususersrole: false
authenticatedusersrole: false
id: <UUID v4>
name: Administrators
```

| フィールド | 説明 |
|---|---|
| `anonymoususersrole` | `true` に設定できるのは 1 ロールのみ。未認証ユーザーのデフォルトロール。 |
| `authenticatedusersrole` | `true` に設定できるのは 1 ロールのみ。認証済みユーザーのデフォルトロール。 |
| `id` | UUID v4（重複不可） |
| `name` | ロール名（表示名） |

### 標準 Web ロール定義

```yaml
# .powerpages-site/web-roles/administrators.yml
anonymoususersrole: false
authenticatedusersrole: false
id: <UUID>
name: Administrators
```

```yaml
# .powerpages-site/web-roles/authenticated-users.yml
anonymoususersrole: false
authenticatedusersrole: true    # ← ログインユーザーの既定ロール
id: <UUID>
name: Authenticated Users
```

```yaml
# .powerpages-site/web-roles/anonymous-users.yml
anonymoususersrole: true        # ← 未認証ユーザーの既定ロール
authenticatedusersrole: false
id: <UUID>
name: Anonymous Users
```

> **ルール**: `anonymoususersrole: true` と `authenticatedusersrole: true` はそれぞれ 1 ロールのみ。既存ロールに設定済みの場合、新規ロールには `false` を設定する。

### デプロイ方法

```bash
pac pages upload-code-site
```

> YAML ファイルをコミットして `pac pages upload-code-site` を実行すると、Dataverse の `powerpagecomponent` (type=11) レコードとして反映される。

### Web ロールの powerpagecomponentid 取得（API 確認）

デプロイ後にテーブル権限の N:N 紐付けで必要になる:

```python
import requests

r = requests.get(
    f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents"
    f"?$filter=powerpagecomponenttype eq 11 and name eq 'Authenticated Users'"
    f"&$select=powerpagecomponentid,name",
    headers=headers
)
role_ppc_id = r.json()["value"][0]["powerpagecomponentid"]
```

---

---

## アーキテクチャ: mspp_ vs adx_ テーブル

| テーブルプレフィックス | 用途 | ランタイムが参照 |
|---|---|---|
| `mspp_` | Power Pages ランタイムのセキュリティ評価 | ✅ 参照する |
| `adx_` | レガシー互換 / Design Studio 内部管理 | ❌ ランタイムは無視 |

> **N:N リレーション（`mspp_entitypermission_webrole` も `powerpagecomponent_powerpagecomponent` も）は API で操作してもポータルに認識されない**。代わりに type=18 の content JSON 内 `adx_entitypermission_webrole` を使う（詳細は後述）。

### 重要な関係

```
powerpagecomponent (type=18)
  ↓ 自動作成
mspp_entitypermission (ランタイムが参照)
  ↔ mspp_entitypermission_webrole (N:N) ← ❌ API で永続化しない
mspp_webrole (ランタイムが参照)

★ 正解:
powerpagecomponent (type=18) の content JSON
  └ "adx_entitypermission_webrole": ["<webrole_id>"]  ← ✅ ランタイム正本
  （powerpagecomponent_powerpagecomponent への $ref POST は 204 でも幽霊。使わない）
```

---

## powerpagecomponent テーブル — type マッピング

Power Pages Design Studio で管理されるコンポーネントの完全な type 一覧:

| type | 名称 | 備考 |
|------|------|------|
| 1 | 公開状況 (Publishing State) | |
| 2 | Web ページ (Web Page) | |
| 3 | Web ファイル (Web File) | |
| 4 | Web リンクセット (Web Link Set) | |
| 5 | Web リンク (Web Link) | |
| 6 | ページテンプレート (Page Template) | |
| 7 | コンテンツスニペット (Content Snippet) | |
| 8 | Web テンプレート (Web Template) | |
| 9 | サイト設定 (Site Setting) | |
| 10 | Web ページアクセス制御ルール (Web Page Access Control Rule) | content に `adx_webpageaccesscontrolrule_webrole` |
| 11 | Web ロール (Web Role) | |
| 12 | Web サイトのアクセス (Website Access) | content に `adx_websiteaccess_webrole` |
| 13 | サイトマーカー (Site Marker) | |
| 15 | 基本フォーム (Basic Form) | |
| 17 | リスト (List) | |
| **18** | **テーブルのアクセス許可 (Table Permission)** | **mspp_entitypermission を自動作成** |
| 19 | 詳細フォーム (Advanced Form) | |
| 28 | 列のアクセス許可プロファイル (Column Permission Profile) | |
| 29 | 列のアクセス許可 (Column Permission) | |
| 30 | リダイレクト (Redirect) | |
| 32 | ショートカット (Shortcut) | |
| 33 | クラウドフロー (Cloud Flow) | |
| 34 | UX コンポーネント (UX Component) | |
| 35 | サーバーロジック (Server Logic) | |

---

## ✅ 解決済み: type=18 の content JSON 内 `adx_entitypermission_webrole`

### 問題（N:N は API でポータルに認識されない）

`mspp_entitypermission_webrole` も `powerpagecomponent_powerpagecomponent`（自己参照 N:N）も、Dataverse Web API の `$ref` POST で 204 を返すが、**ポータル／ランタイムは認識しない（幽霊リンク）**。Design Studio の「ロール」列は空のままで 403 になる。

### 失敗した方法

| 方法 | HTTP レスポンス | 結果 |
|------|----------------|------|
| `mspp_entitypermission_webrole` へ `$ref` POST | 204 No Content | ❌ 永続化しない |
| `powerpagecomponent_powerpagecomponent` へ `$ref` POST | 204 No Content | ❌ **幽霊リンク**（N:N 展開では紐付いて見えるがポータル未認識） |
| Deep Insert（permission 作成時に role を含める） | 500 NullReferenceException | ❌ サーバーエラー |
| `$batch` リクエスト | 204 per item | ❌ 永続化しない |

### ✅ 正解: type=18 の content JSON に `adx_entitypermission_webrole` を書き込む

ランタイム／Design Studio が参照する**正本は `powerpagecomponent` type=18 の `content` JSON 内の `adx_entitypermission_webrole` 配列**。ここに Web ロール ID を入れ、`websiteid` も併せて PATCH すればランタイムに反映される。

```python
"""Table Permission → Web Role 紐付け（検証済みパターン — content JSON を PATCH）"""
import json
import requests

DATAVERSE_URL = "https://{org}.crm.dynamics.com"
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json",
           "OData-MaxVersion": "4.0", "OData-Version": "4.0"}

# テーブル権限(type=18)の powerpagecomponentid
PERM_ID = "01a5cf4c-ee5a-f111-a825-7ced8d3ce773"
# Web Role (Authenticated Users) の ID（EDM では webrole id と同一）
ROLE_ID = "7e158fa3-602e-4a62-93c3-06d54022438e"
# adx_website の ID
WEBSITE_ID = "83535722-1daf-4523-ac12-374fd93cd8eb"

# 1) 現在の content を取得
r = requests.get(
    f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({PERM_ID})?$select=content",
    headers=headers)
content = json.loads(r.json()["content"])

# 2) Web ロールと websiteid を冪等に設定
roles = content.get("adx_entitypermission_webrole") or []
if ROLE_ID not in roles:
    roles.append(ROLE_ID)
content["adx_entitypermission_webrole"] = roles
content["websiteid"] = WEBSITE_ID

# 3) content を文字列として書き戻す
r = requests.patch(
    f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({PERM_ID})",
    headers=headers, json={"content": json.dumps(content)})
assert r.status_code == 204  # 成功 & ランタイムに反映

# 4) 検証（正本＝content を直接確認。N:N 展開は幽霊なので使わない）
r = requests.get(
    f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({PERM_ID})?$select=content",
    headers=headers)
assert ROLE_ID in json.loads(r.json()["content"])["adx_entitypermission_webrole"]
```

### 発見の経緯

1. ポータル手動割当（動作）と API `$ref` 割当（動作せず）の生 intersect 行を全列 diff
2. type=18 の `content` JSON 内 `adx_entitypermission_webrole` が、動作=`["<role>"]` / 不動作=`[]` と唯一差分していた
3. content の配列に role を PATCH して restart → Design Studio「ロール」列に反映 & 403 解消を確認
4. `$ref` POST で生成される `powerpagecomponent_powerpagecomponentset` の行は存在してもポータルは読まない（幽霊）

### Web Role の ID 取得方法

```python
# Authenticated Users ロールを取得（EDM では powerpagecomponent id と webrole id が一致）
r = requests.get(
    f"{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents"
    f"?$filter=powerpagecomponenttype eq 11 and name eq 'Authenticated Users'"
    f"&$select=powerpagecomponentid,name",
    headers=headers
)
role_id = r.json()["value"][0]["powerpagecomponentid"]
```

### ワークアラウンド（API が使えない場合のみ）

1. **管理者ユーザーはテーブル権限をバイパスする** — 管理者でアクセスする場合は N:N 不要
2. **Design Studio で手動設定** — make.powerpages.microsoft.com → セキュリティ → テーブルのアクセス許可 → ロール追加

---

## Web API 有効化に必要な設定（Enhanced Data Model）

### 最小構成（管理者ユーザー向け）

管理者（System Administrator ロール）は Table Permission をバイパスするため、以下の Site Settings のみで Web API にアクセス可能:

```yaml
# サイト設定（必須）
Webapi/{table_logical_name}/enabled: "true"
Webapi/{table_logical_name}/fields: "*"    # または列名カンマ区切り
```

### 完全構成（一般ユーザー向け）

| # | 要素 | 設定方法 | 自動化可否 |
|---|------|----------|-----------|
| 1 | Site Settings (enabled/fields) | Dataverse Web API で作成 | ✅ 可能 |
| 2 | Table Permission レコード | powerpagecomponent type=18 で作成 | ✅ 可能 |
| 3 | **Web Role 紐付け** | **type=18 content JSON の `adx_entitypermission_webrole`** | ✅ 可能 |
| 4 | Site Restart | Power Platform API | ✅ 可能 |

### Site Settings の作成パターン

```python
import json
from auth_helper import get_token
import requests

DATAVERSE_URL = os.getenv("DATAVERSE_URL")
token = get_token(f"{DATAVERSE_URL}.default")
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
}

# テーブル Web API 有効化
tables = ["geek_incident", "geek_knowledge"]
for table in tables:
    for suffix, value in [("/enabled", "true"), ("/fields", "*")]:
        setting = {
            "adx_name": f"Webapi/{table}{suffix}",
            "adx_value": value,
            "adx_websiteid@odata.bind": f"/adx_websites({WEBSITE_ID})",
        }
        requests.post(
            f"{DATAVERSE_URL}api/data/v9.2/adx_sitesettings",
            headers=headers, json=setting
        )
```

---

## powerpagecomponent type=18 でテーブル権限を作成

type=18 の powerpagecomponent を作成すると、対応する `mspp_entitypermission` レコードが**自動的に作成される**。ただし content の `adx_entitypermission_webrole` が空だと Web ロール未紐付けとなり 403 になる。

### content JSON のフォーマット

```json
{
  "entitylogicalname": "geek_knowledge",
  "entityname": "ナレッジ - Global Read",
  "scope": 756150000,
  "read": true,
  "write": false,
  "create": false,
  "delete": false,
  "append": true,
  "appendto": true,
  "websiteid": "<adx_website_id>",
  "adx_entitypermission_webrole": ["<webrole_id>"]
}
```

### scope の値

| 値 | スコープ |
|---|---|
| 756150000 | Global |
| 756150001 | Contact |
| 756150002 | Account |
| 756150003 | Parent |
| 756150004 | Self |

### 作成スクリプト例

```python
component = {
    "powerpagecomponenttype": 18,
    "name": f"{display_name} - Global Read",
    "content": json.dumps({
        "entitylogicalname": table_logical_name,
        "entityname": f"{display_name} - Global Read",
        "scope": 756150000,
        "read": True, "write": False, "create": False, "delete": False,
        "append": True, "appendto": True,
        "websiteid": ADX_WEBSITE_ID,                    # ← 必須
        "adx_entitypermission_webrole": [WEBROLE_ID],   # ← 必須（ランタイム正本）
    }),
    "powerpagesiteid@odata.bind": f"/powerpagesites({POWERPAGESITE_ID})",
    "powerpagesitelanguageid@odata.bind": f"/powerpagesitelanguages({LANG_ID})",
}
requests.post(
    f"{DATAVERSE_URL}api/data/v9.2/powerpagecomponents",
    headers=headers, json=component
)
```

---

## disableentitypermissions は Enhanced Data Model で無効

| Site Setting | Standard Model | Enhanced Model |
|---|---|---|
| `Webapi/{table}/disableentitypermissions` | ✅ 有効 — 権限チェックをスキップ | ❌ 無効 — 無視される |
| `Webapi/{table}/disabletablepermissions` | ❌ 存在しない | ❌ 存在しない |

> Enhanced Data Model では `disableentitypermissions=true` を設定しても 403 は解消されない。テーブル権限 + Web Role の紐付けが必須。

---

## 管理者ユーザーによるバイパス

> **⚠️ 2024年以降の検証結果: EDM ではバイパスが機能しない**
>
> ドキュメント上は System Administrator がテーブル権限をバイパスすると記載されているが、
> **実際にはポータル上では contact として認証されるため Web ロール紐づけがないと 403 になる**。
> 管理者アカウントであっても、テーブル権限を Authenticated Users に紐づけることが MUST。

| ユーザー種別 | Table Permission 必要 | Web Role 紐付け必要 |
|---|---|---|
| System Administrator | ~~❌ 不要~~ **✅ 実際は必要** | ~~❌ 不要~~ **✅ 実際は必要** |
| Authenticated Users (一般) | ✅ 必要 | ✅ 必要 |
| Anonymous (未認証) | ✅ 必要 | ✅ 必要 (Anonymous Users role) |

### 開発時の注意

~~管理者で動作確認して OK でも、一般ユーザーでテストしないと 403 が発見できない。~~ **管理者でも 403 になる**。
**全てのテーブル権限を Authenticated Users に紐づけること。** `deploy_site.py` Phase 4.5 で自動化済み。

---

## 推奨ワークフロー: テーブル権限の設定

```
Step 1: Site Settings を API で作成（Webapi/{table}/enabled, fields）
    ↓
Step 2: powerpagecomponent type=18 を API で作成（scope, CRUD 設定）
    ↓
Step 3: type=18 の content JSON の adx_entitypermission_webrole に Authenticated Users を書き込み（setup_permissions.py）
    ↓
Step 4: Site Restart（API）
    ↓
Step 5: テスト（管理者でも一般でも同じ権限設定が必要）
```

### 自動紐づけ（推奨 — deploy_site.py Phase 4.5）

`deploy_site.py` が Phase 4.5 で全テーブル権限を Authenticated Users に自動紐づけするため、手動作業は不要。

### Design Studio での紐付け手順（手動が必要な場合のみ）

1. https://make.powerpages.microsoft.com/ にアクセス
2. 対象サイトを選択
3. **セキュリティ** → **テーブルのアクセス許可** に移動
4. 対象のテーブル権限を開く（Step 2 で自動作成済み）
5. **ロール** セクションで **Authenticated Users** を追加
6. **保存**

---

## サイト再起動 API

セキュリティ設定変更後は必ずサイトを再起動してキャッシュをクリアする。

```python
from auth_helper import get_token
import requests

ENV_ID = os.getenv("ENV_ID")
token = get_token("https://api.powerplatform.com/.default")
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# サイト一覧取得
r = requests.get(
    f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites?api-version=2024-10-01",
    headers=headers
)
site_id = r.json()["value"][0]["id"]

# 再起動
r = requests.post(
    f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites/{site_id}/restart?api-version=2024-10-01",
    headers=headers
)
# 200 OK = 成功
```

---

## トラブルシューティング

### 403 "You don't have permission to read the {table} table"

| チェック項目 | 確認方法 |
|---|---|
| Site Settings が存在するか | `adx_sitesettings?$filter=adx_name eq 'Webapi/{table}/enabled'` |
| mspp_entitypermission が存在するか | `mspp_entitypermissions?$filter=mspp_entityname eq '{table}'` |
| Web Role が紐付いているか | `mspp_entitypermissions({id})/mspp_entitypermission_webrole` |
| ユーザーが管理者か | 管理者なら権限不要で通る — 一般ユーザーでテスト |
| サイト再起動したか | 設定変更後は必ず restart |

### 403 が管理者で発生する場合

Site Settings (`Webapi/{table}/enabled=true`) が未設定。管理者でも Site Settings は必須。

### 403 が一般ユーザーのみで発生する場合

Web Role の N:N 紐付けが欠落。Design Studio で設定する。

---

## 関連する既知の制限事項

| 制限 | 詳細 |
|---|---|
| mspp_ N:N は Web API 不可 | 本ドキュメント参照 |
| adx_ テーブルはランタイムが無視 | Enhanced Model では mspp_ のみ参照 |
| type=18 content に role を含めても無効 | 試行済み: `mspp_entitypermission_webrole`, `adx_entitypermission_webrole` どちらも不可 |
| pac paportal / pac pages はmspp_を操作しない | YAML 経由で adx_ テーブルを操作するため Enhanced Model では不完全 |
