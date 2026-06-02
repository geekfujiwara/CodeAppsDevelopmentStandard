# Dataverse データ接続リファレンス（`/_api/` 再現手順）

> **目的**: Power Pages Code Site (SPA) から Dataverse データへ**確実に・再現性高く**接続する。
> このドキュメントは実環境で検証済みのパターンに基づく。手順を上から順に実行すれば 403/404 を回避できる。

---

## なぜ `/_api/` か

| 方式 | Code Apps | Power Pages Code Site |
|------|-----------|------------------------|
| `@microsoft/power-apps/data` SDK | ✅ 動作 | ❌ ランタイムなし |
| `/_api/` OData v4 エンドポイント | N/A | ✅ 推奨 |

Code Site はブラウザ上の静的 SPA。Power Apps ランタイムは存在しないため、
Dataverse へのアクセスは Power Pages の `/_api/` OData v4 エンドポイントを使う。

- **認証**: ブラウザのセッション Cookie（`credentials: 'same-origin'`）。Bearer トークン不要。
- **書き込み**: anti-forgery token（`__RequestVerificationToken`）が必須。

クライアント実装は [`templates/corporate-lp/src/lib/dataverse.ts`](../templates/corporate-lp/src/lib/dataverse.ts) がそのまま使える。

---

## データ接続が成立する 3 レイヤー（すべて必須）

`/_api/{table}` が動くには次の 3 つすべてが揃う必要がある。1 つでも欠けると 403/404 になる。

```
┌─────────────────────────────────────────────────┐
│ ① Site Settings (adx_sitesettings)              │  ← Web API エンドポイント公開
│    Webapi/{table}/enabled = true                │     これが無いと 404
│    Webapi/{table}/fields  = * (or 列名)          │
├─────────────────────────────────────────────────┤
│ ② Table Permission (powerpagecomponent type=18) │  ← どのテーブルに何ができるか
│    scope / read / write / create / delete       │     これが無いと 403
├─────────────────────────────────────────────────┤
│ ③ Web Role 紐付け (N:N)                          │  ← 誰がその権限を持つか
│    Table Permission ↔ Authenticated Users        │     これが無いと一般ユーザー 403
└─────────────────────────────────────────────────┘
```

> **管理者はテーブル権限をバイパスする。** 管理者で 200 でも一般ユーザーで 403 は頻出。必ず一般ユーザーでテストする。

### 自動化スクリプト

3 レイヤーをべき等に一括設定するスクリプトを用意している:

```bash
py .github/skills/power-pages/scripts/setup_permissions.py
```

`scripts/setup_permissions.py` の `TABLES` リストに公開テーブルを追加して実行する:

```python
TABLES = [
    # (logical_name, scope, read, write, create, delete, fields)
    # scope: 756150000=Global, 756150001=Self(Contact), 756150002=Parent, 756150003=Account
    ("contact",       756150001, True,  True,  False, False, "firstname,lastname,emailaddress1,telephone1,fullname"),
    ("geek_incident", 756150000, True,  True,  True,  False, "*"),
    ("geek_knowledge",756150000, True,  False, False, False, "*"),
]
```

スクリプトは各テーブルについて以下を実行する:
1. `adx_sitesettings` に `Webapi/{table}/enabled` と `Webapi/{table}/fields` を upsert
2. `powerpagecomponent` (type=18) でテーブル権限を作成
3. `Authenticated Users` Web Role (type=11) を取得 or 作成
4. テーブル権限 ↔ Web Role の自己参照 N:N リンクを作成
5. PP API でサイトを restart（`PP_SUBDOMAIN` が `.env` にある場合）

---

## レイヤー詳細

### ① Site Settings（`adx_sitesettings`）

```python
upsert_site_setting("Webapi/contact/enabled", "true", adx_website_id, headers)
upsert_site_setting("Webapi/contact/fields", "firstname,lastname,emailaddress1,telephone1", adx_website_id, headers)
```

| 設定 | 値 | 用途 |
|------|-----|------|
| `Webapi/{table}/enabled` | `true` | テーブルを Web API に公開 |
| `Webapi/{table}/fields` | `*` または `col1,col2` | 公開する列。最小権限なら列を明示する |

> ⚠️ **`adx_websiteid@odata.bind` は `adx_websites` レコードに紐付ける。**
> 間違った Website ID に紐付けた設定は無視される。`adx_websites` は
> `?$top=1&$orderby=createdon desc` で最新を取得する。

### ② Table Permission（`powerpagecomponent` type=18 / Enhanced Data Model）

```python
content = {
    "mspp_entityname": "contact",
    "mspp_scope": "756150001",   # Self
    "mspp_read": "true",
    "mspp_write": "true",
    "mspp_create": "false",
    "mspp_delete": "false",
}
body = {
    "powerpagecomponenttype": 18,
    "name": "contact - Self",
    "content": json.dumps(content),
    "powerpagesiteid@odata.bind": f"/powerpagesites({SITE_ID})",
}
```

| scope 値 | 意味 | 用途 |
|---------|------|------|
| `756150000` | Global | 全レコード（マスタ参照系） |
| `756150001` | Self (Contact) | ログインユーザー自身の Contact のみ（プロフィール編集） |
| `756150002` | Parent | 親レコード経由 |
| `756150003` | Account | 同じ取引先のレコード |

> ⚠️ **`powerpagesiteid@odata.bind` は `powerpagesites` を参照する。`adx_websites` ではない。**
> `adx_websites` を指定すると 404 になる。

### ③ Web Role 紐付け（N:N）

```python
# powerpagecomponent 同士の自己参照 N:N
url = f"{DV}/api/data/v9.2/powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent/$ref"
body = {"@odata.id": f"{DV}/api/data/v9.2/powerpagecomponents({role_ppc_id})"}
requests.post(url, headers=headers, json=body)  # 204=成功, 409=既存
```

> Enhanced Data Model では Web Role も `powerpagecomponent` (type=11) として表現される。
> テーブル権限（type=18）と Web Role（type=11）を `powerpagecomponent_powerpagecomponent` N:N で結ぶ。

---

## Standard Data Model の場合（`mspp_*` テーブル）

サイトが Standard Data Model（`mspp_entitypermissions` / `mspp_webroles` / `mspp_sitesettings`）の場合は
`powerpagecomponent` ではなく `mspp_*` テーブルを直接操作する。**N:N の `$ref` リンクはこちらでも成功する。**

```python
# Site Settings
POST /mspp_sitesettings
  { "mspp_name": "Webapi/contact/enabled", "mspp_value": "true",
    "mspp_websiteid@odata.bind": "/mspp_websites({SITE_ID})" }

# Table Permission
POST /mspp_entitypermissions
  { "mspp_entitylogicalname": "contact", "mspp_entityname": "Contact - Self",
    "mspp_scope": 756150001, "mspp_read": true, "mspp_write": true,
    "mspp_websiteid@odata.bind": "/mspp_websites({SITE_ID})" }

# Web Role link (N:N) — 成功する
POST /mspp_entitypermissions({perm_id})/mspp_entitypermission_webrole/$ref
  { "@odata.id": "{DV}/api/data/v9.2/mspp_webroles({role_id})" }
```

> **どちらのモデルか判定**: `pac pages upload-code-site` で作成したサイトは原則 Enhanced Data Model 2.0。
> 既存のクラシックサイトを流用する場合は Standard の可能性がある。
> `powerpagesites` にレコードがあれば Enhanced、`adx_websites` のみなら Standard と判断できる。

---

## クライアント側 OData クエリ

| パターン | 正しい書式 | 誤り |
|----------|-----------|------|
| Lookup 列の参照 | `_geek_categoryid_value` | `geek_categoryid` |
| Boolean フィルタ | `$filter=geek_approved eq true` | `eq 'true'` |
| 日時フィルタ | `createdon gt 2024-01-01T00:00:00Z` | 引用符不要 |
| 展開 | `$expand=geek_CategoryId($select=geek_name)` | — |
| 単一レコード | `contacts(00000000-...)` | `contacts/00000000-...` |

```typescript
import { apiGet, apiPatch, type ODataCollection } from "@/lib/dataverse";

// 一覧取得
const res = await apiGet<ODataCollection<Incident>>(
  "geek_incidents?$select=geek_name,statuscode&$orderby=createdon desc&$top=50",
);

// 単一レコード更新（anti-forgery token は dataverse.ts が自動付与）
await apiPatch(`contacts(${contactId})`, { telephone1: "03-1234-5678" });
```

---

## トラブルシューティング

| 症状 | 原因 | 対策 |
|------|------|------|
| `/_api/{table}` が 404 | `Webapi/{table}/enabled` 未設定 | `setup_permissions.py` の TABLES に追加して実行 |
| `/_api/{table}` が 403（管理者は OK） | Web Role 紐付け欠落 | ③ の N:N リンクを確認。`setup_permissions.py` 再実行 |
| 全ユーザー 403 | Table Permission（type=18）未作成 | ② を確認 |
| PATCH/POST が 401 | anti-forgery token 不足 | `dataverse.ts` を使う（`/_layout/tokenhtml` フォールバック実装済み） |
| 設定したのに反映されない | サイトキャッシュ | PP API で restart（最大 15 分キャッシュ） |
| `404` だが設定は正しい | `adx_websiteid` の紐付け先が別サイト | `adx_websites` の最新レコードに紐付いているか確認 |

---

## 検証手順（必須）

```
1. 管理者でログイン → /_api/{table} が 200 + データ
2. 一般ユーザーでログイン → /_api/{table} が 200 + データ   ← ここが本番
3. プロフィール編集ページで PATCH → 204 + 反映確認
```

> ステップ 2 を飛ばすと「管理者では動くのに公開したら 403」という事故になる。
