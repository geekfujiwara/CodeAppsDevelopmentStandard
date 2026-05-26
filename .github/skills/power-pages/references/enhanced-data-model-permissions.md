# Power Pages Enhanced Data Model — テーブル権限の教訓

> **対象**: Enhanced Data Model（datamodelversion: 2.0）を使用する Power Pages サイト。
> 2024年以降に作成されたサイトはデフォルトでこのモデルを使用する。

## 概要

Enhanced Data Model では、Power Pages ランタイムが **`mspp_` プレフィックスのテーブル**（mspp_entitypermission, mspp_webrole 等）を使用してセキュリティ評価を行う。一方で、Dataverse Web API 経由でのテーブル権限の N:N Web ロール紐付けにはプラットフォームバグが存在し、**API だけでは完全な自動化ができない**。

---

## アーキテクチャ: mspp_ vs adx_ テーブル

| テーブルプレフィックス | 用途 | ランタイムが参照 |
|---|---|---|
| `mspp_` | Power Pages ランタイムのセキュリティ評価 | ✅ 参照する |
| `adx_` | レガシー互換 / Design Studio 内部管理 | ❌ ランタイムは無視 |

### 重要な関係

```
powerpagecomponent (type=18)
  ↓ 自動作成
mspp_entitypermission (ランタイムが参照)
  ↔ mspp_entitypermission_webrole (N:N) ← ★ API で設定不可
mspp_webrole (ランタイムが参照)
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

## ⚠️ CRITICAL: mspp_entitypermission_webrole N:N はAPI で設定不可

### 問題

`mspp_entitypermission_webrole` の N:N リレーションシップは、Dataverse Web API のすべての方法で設定を試みても**永続化しない**。

### 試行結果

| 方法 | HTTP レスポンス | 結果 |
|------|----------------|------|
| `$ref` POST（permission → role 方向） | 204 No Content | ❌ 永続化しない |
| `$ref` POST（role → permission 方向） | 204 No Content | ❌ 永続化しない |
| Deep Insert（permission 作成時に role を含める） | 500 NullReferenceException | ❌ サーバーエラー |
| `$batch` リクエスト | 204 per item | ❌ 永続化しない |
| powerpagecomponent content JSON に role ID を含める | 204 (更新成功) | ❌ N:N は作成されない |

### 結論

**Power Pages Design Studio（make.powerpages.microsoft.com）の UI のみが正しく N:N リンクを作成できる。** これは Design Studio が内部 API（Organization Service / 非公開エンドポイント）を使用しているためと推定される。

### ワークアラウンド

1. **管理者ユーザーはテーブル権限をバイパスする** — 管理者でアクセスする場合は N:N 不要
2. **Design Studio で手動設定** — 一般ユーザー向けには必須
3. **powerpagecomponent type=18 でレコードだけ先に作成** — Design Studio でロール紐付けのみ手動

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
| 3 | **Web Role 紐付け (N:N)** | **Design Studio のみ** | ❌ 不可能 |
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

type=18 の powerpagecomponent を作成すると、対応する `mspp_entitypermission` レコードが**自動的に作成される**。ただし Web Role の N:N リンクは含まれない。

### content JSON のフォーマット

```json
{
  "mspp_entityname": "geek_knowledge",
  "mspp_scope": "756150000",
  "mspp_read": "true",
  "mspp_write": "false",
  "mspp_create": "false",
  "mspp_delete": "false",
  "mspp_append": "true",
  "mspp_appendto": "true"
}
```

### mspp_scope の値

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
        "mspp_entityname": table_logical_name,
        "mspp_scope": "756150000",
        "mspp_read": "true",
        "mspp_write": "false",
        "mspp_create": "false",
        "mspp_delete": "false",
        "mspp_append": "true",
        "mspp_appendto": "true",
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

Power Pages の管理者ユーザー（Dataverse の System Administrator ロール）は、**テーブル権限の設定に関わらず** Web API にアクセスできる。

| ユーザー種別 | Table Permission 必要 | Web Role 紐付け必要 |
|---|---|---|
| System Administrator | ❌ 不要 | ❌ 不要 |
| Authenticated Users (一般) | ✅ 必要 | ✅ 必要 |
| Anonymous (未認証) | ✅ 必要 | ✅ 必要 (Anonymous Users role) |

### 開発時の注意

管理者で動作確認して OK でも、一般ユーザーでテストしないと 403 が発見できない。**必ず一般ユーザーでもテストすること。**

---

## 推奨ワークフロー: テーブル権限の設定

```
Step 1: Site Settings を API で作成（Webapi/{table}/enabled, fields）
    ↓
Step 2: powerpagecomponent type=18 を API で作成（scope, CRUD 設定）
    ↓
Step 3: Design Studio で Web Role 紐付け（手動）
    ↓
Step 4: Site Restart（API）
    ↓
Step 5: 一般ユーザーでテスト
```

### Design Studio での紐付け手順

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
