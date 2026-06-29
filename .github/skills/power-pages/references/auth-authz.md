# Power Pages 認証・認可・テーブル権限（詳細）

[SKILL.md](../SKILL.md) の正常系から参照する、EDM 2.0 Code Site の認証/認可/テーブル権限・Web API・SSO の詳細実装。


## ★★★ 重要教訓: EDM 2.0 Code Site の認証・認可・テーブル権限

> **実案件 (IncidentPortal01/02) のデバッグで確定した知見。geeksupport（動作済み参考サイト）との比較で裏取り済み。**

---

### 教訓 1: CSRF トークン（__RequestVerificationToken）は POST/PATCH/DELETE に必須

```
❌ NG: POST /_api/geek_incidents に __RequestVerificationToken なしで送信
       → 401 / 90040107 (anti-forgery token required)

✅ OK: /_layout/tokenhtml から取得してヘッダーに付与
       取得: fetch("/_layout/tokenhtml") → regex value="([^"]+)" で抽出
       送信: headers に { __RequestVerificationToken: token } を追加
```

**キャッシュ:** トークンはセッション中有効。初回取得後は変数にキャッシュして再利用可能。

---

### 教訓 2: EDM 2.0 テーブル権限の Web ロール紐付けは N:N association がランタイム正本（content JSON は YAML シリアライズ形）

> **重要な訂正（実機 m365status で確定）:** 以前は「content JSON が唯一の正本、N:N $ref は幽霊」と
> 記載していたが、実機検証で **逆**だと判明した。content JSON 配列が入っていても
> 自己参照 N:N `powerpagecomponent_powerpagecomponent` の **association が空なら 403**
> (90040120 EntityPermissionReadIsMissing) になる。`$ref` POST で association を作成した
> 直後に 200 になった。**ランタイム正本は N:N association**。

```
❌ NG: powerpagecomponent type=18 の content に entitylogicalname/scope/CRUD だけ設定
       → content の adx_entitypermission_webrole も N:N association も空 → 403

❌ NG: content JSON の adx_entitypermission_webrole 配列だけ PATCH して終わり
       → API 単体では N:N association が作られない → 403 (90040120) のまま
       （content 配列は YAML/git シリアライズ形であり、ランタイムは association を読む）

✅ OK: (1) content JSON に adx_entitypermission_webrole（YAML/git 形）を含めて PATCH
       (2) かつ N:N に $ref POST して association を作成（＝ランタイム正本）
       POST .../powerpagecomponents({permId})/powerpagecomponent_powerpagecomponent/$ref
            body: {"@odata.id": ".../powerpagecomponents({roleId})"}
```

> `pac pages upload-code-site` で table-permissions YAML をデプロイすると、この
> **association も自動作成される**。一方、API だけで content を編集した場合は
> association が作られないため、`$ref` POST が必須。両方そろえるのが安全。
> association は方向性があり、権限(type=18)→ロール(type=11) 方向で `$expand` すると見える
> （逆方向のロール→権限 expand は空に見えることがある）。

**Design Studio が書く完全な content JSON:**

```json
{
  "filecontent": null,
  "entitylogicalname": "geek_incident",
  "entityname": "geek_incident - Global CRUD",
  "scope": 756150000,
  "read": true,
  "write": true,
  "create": true,
  "delete": false,
  "append": true,
  "appendto": true,
  "adx_entitypermission_webrole": ["{authenticated-role-id}"],
  "parentrelationship": null,
  "parententitypermission": null,
  "contactrelationship": null,
  "accountrelationship": null,
  "childTablePermissions": [],
  "permissionfetchxml": null
}
```

**API で完結する手順:**
1. `powerpagecomponent` type=18 を POST — content に `adx_entitypermission_webrole`（＋`websiteid`）を含む
2. 既存権限に後からロールを追加する場合は `content` を GET → 配列にロール ID を冪等追加 → PATCH
3. **N:N association を `$ref` POST で作成**（`powerpagecomponent_powerpagecomponent`）。
   これがランタイム正本。API のみの content 編集では作られないため必須
4. 検証は association を `$expand`（権限→ロール方向）で確認する

---

### 教訓 3: Contact テーブル権限は Self スコープ（756150004）を使う

```
❌ NG: scope=756150001 (Contact) + contactrelationship="contact_customer_contacts"
       → リレーション設定ミスで 403、設定が複雑で壊れやすい

✅ OK: scope=756150004 (Self) + contactrelationship=null
       → リレーション不要で自分自身のレコードのみアクセス許可
```

| 項目 | 誤った設定 | 正しい設定 |
|---|---|---|
| scope | `756150001`（Contact） | `756150004`（Self） |
| contactrelationship | `"contact_customer_contacts"` | `null`（不要） |
| webroles | Administrators のみ | **Authenticated Users** |

---

### 教訓 4: Lookup バインド（@odata.bind）は正確なターゲットエンティティが必須

```
❌ NG: "geek_inquirerid@odata.bind": "/contacts(xxx)"
       → geek_inquirerid の参照先が geek_inquirer テーブルなのに contact を指定
       → 404 / 9004010D (CDS エンティティ解決失敗)

✅ OK: ManyToOneRelationships で ReferencedEntity を確認してから @odata.bind を組み立てる
       確認: GET EntityDefinitions(LogicalName='geek_incident')/ManyToOneRelationships
```

**参照先テーブルに AppendTo 権限も必要:**
- 不足 → 403 / 90040106 (AppendTo permission missing)
- 参照先テーブルの EDM content で `"appendto": true` を設定

---

### 教訓 5: ログイン後のリダイレクト先が `/profile` に強制される

```
❌ NG: デフォルトで Authentication/Registration/ProfileRedirectEnabled = true
       → SSO 完了後に returnUrl を無視して /profile に強制リダイレクト

✅ OK: 以下のサイト設定を false に（adx_sitesettings + EDM type=9 の両方）
       - Authentication/Registration/ProfileRedirectEnabled = false
       - Authentication/Registration/LoginButtonAuthEnabled = false
```

**SPA 側のリダイレクト復元パターン:**
1. ログイン前: `sessionStorage.setItem("pp_return_hash", location.hash)` で保存（`use-auth.ts` の `login()`）
2. `returnUrl: "/"` でルートに戻す
3. SPA 初期化時: `RestoreRoute` コンポーネントで `sessionStorage` から復元 → `navigate(target, { replace: true })`

> ⚠️ **保存と復元はセット**: 手順 1 の保存だけでは往復が完成せず、ログイン後にディープリンク
> （例: `#/incidents/123`）がホームに化ける。`App.tsx` の `<HashRouter>` 直下に `RestoreRoute`
> を必ず配置すること（corporate-lp テンプレートに実装済み）。

---

### 教訓 6: 認証判定で contact テーブルをクエリしてはいけない

```
❌ NG: /_api/contacts?$select=contactid&$top=1 をセッション検証に使う
       → contact の Table Permission がないと 403 EntityPermissionReadIsMissing

✅ OK: window.Microsoft.Dynamic365.Portal.User を信頼する（API 呼び出し不要）
       認証はサーバー側セッション Cookie で完結している
```

---

### 教訓 7: `redirect: "manual"` でリダイレクトを検知

```
❌ NG: fetch のデフォルト (redirect: "follow") で API 呼び出し
       → 未認証時に 302 → ログインページに自動追従 → エラー判別不能

✅ OK: redirect: "manual" + response.type === "opaqueredirect" で認証切れを検出
       または response.redirected && response.url.includes("/Account/Login") をチェック
```

---

### 教訓 8: EDM 2.0 Code Site でも Webapi/* Site Settings は必須（カスタムテーブル含む）

```
❌ NG: type=18 テーブル権限（adx_entitypermission_webrole + N:N リンク）だけ設定
       → 認可は通るが /_api/{table} エンドポイント自体が公開されず 404 (9004010C)

✅ OK: アクセスする全テーブルに以下の 2 設定を追加する（カスタムテーブルも必須）
       - Webapi/{table}/enabled = true
       - Webapi/{table}/fields  = *          ← または公開する列をカンマ区切りで列挙
```

**type=18 テーブル権限と Webapi/* 設定は役割が異なり、両方必要:**

| レイヤー | 役割 | 無いと |
|---|---|---|
| `powerpagecomponent` type=18（テーブル権限） | **認可**（誰がどの操作をできるか） | 403 EntityPermission* |
| `Webapi/{table}/enabled` + `/fields` | **エンドポイント公開**（`/_api/{table}` を有効化） | **404 (9004010C)** |

> **実証（本リポジトリの IncidentPortal セッション）**: 新規 EDM 2.0 Code Site で
> `geek_m365service` / `geek_m365incident` / `geek_inquiry` の type=18 権限を正しく
> デプロイ・検証済みでも `/_api/geek_m365services` は **404**。`Webapi/{table}/enabled=true`
> と `Webapi/{table}/fields=*` を追加して restart した直後に **404 → 302**（未認証リダイレクト＝
> エンドポイント解決成功）に変化した。`scripts/setup_permissions.py` も全テーブルに対して
> この 2 設定を作成しており、`operations-and-pitfalls.md` の「Web API が 404 → Webapi/{table}/enabled
> 未設定」とも一致する。**Webapi/* は Contact 専用のレガシー設定ではなく、カスタムテーブルにも必須。**

**`.powerpages-site/site-settings/` に YAML で永続化（upload-code-site で再デプロイされる）:**

```yaml
# .powerpages-site/site-settings/Webapi-geek_m365service-enabled.sitesetting.yml
id: <UUID v4>
name: Webapi/geek_m365service/enabled
value: "true"
---
# .powerpages-site/site-settings/Webapi-geek_m365service-fields.sitesetting.yml
id: <UUID v4>
name: Webapi/geek_m365service/fields
value: "*"
```

> デバッグ時は `Webapi/error/innererror = true` も追加すると `/_api/` のエラーレスポンスに
> `innererror` が含まれ原因特定が容易になる。

---

### 教訓 9: Website ID の取り違え

```
❌ NG: .env の WEBSITE_ID と実際の mspp_websites/powerpagesites の ID が不一致
       → テーブル権限を作っても「別サイトの権限」になり効かない

✅ OK: pac org who で確認した環境の mspp_websites から正確な ID を取得

確認コマンド:
  GET /api/data/v9.2/mspp_websites?$select=mspp_websiteid,mspp_name
  GET /api/data/v9.2/powerpagesites?$select=powerpagesiteid,name
```

---

### 教訓 10: pac CLI の認証ユーザー不一致

```
❌ NG: pac が別ユーザー/別環境に接続されたままアップロード
       → 間違ったサイトに反映 or 権限不足でエラー

✅ OK: pac auth clear → pac auth create --environment {ENV_ID} で再認証
       pac org who で接続先を確認してからデプロイ
```

---

### 教訓 11: サイト再起動の反映タイムラグ

```
⚠️ 権限変更やサイト設定変更後、restart API を叩いても 60〜90秒の反映待ちが必要
   テスト時はブラウザの InPrivate / シークレットウィンドウを使い、キャッシュを回避する
```

---

### 教訓 12: deploy.py での二重アップロードと scope 値の混同

```
❌ NG: pac pages upload-code-site を直接実行後、deploy.py --skip-build を使う
       → upload-code-site が再実行されて二重アップロードになる

✅ OK: deploy.py --restart-only で restart のみ実行
       初回フロー: pac pages upload-code-site → activate_site.py → deploy.py --restart-only
       2回目以降: deploy.py (ビルド→アップロード→リスタート全自動)

❌ NG: contact テーブル権限の scope に 756150001 (Contact scope) を使う
       → 「親 Contact 配下のレコード」であり Self ではない

✅ OK: Self scope は 756150004
       scope=756150004 + contactrelationship=null が正しい
```

---

### 教訓 13: pac CLI サブコマンドの正しい名前

```
❌ NG: pac power-pages list
       → "Not a valid command" エラー

✅ OK: pac pages list / pac pages upload-code-site / pac pages help
       サブコマンドは "pages" であり "power-pages" ではない
```

---

### 教訓 14: テーブル権限の Web ロール紐付けは N:N association がランタイム正本 → デプロイ後 / API 編集後に必ず作成する

```
❌ NG: .powerpages-site/table-permissions/*.yml を pac pages upload-code-site で
       デプロイしただけで「権限設定済み」と判断する（YAML に webrole 紐付けが無い場合）
       → powerpagecomponent type=18 は作成されるが、association が空のまま
       → 管理者を含む全ユーザーが 403（Design Studio の「ロール」列が空）

❌ NG: content JSON の adx_entitypermission_webrole 配列だけ PATCH して終わり
       → API 単体では N:N association が作られない → 403 (90040120) のまま
         （content 配列は YAML/git シリアライズ形。ランタイムは association を読む）

✅ OK: type=18 の content JSON（YAML 形）を書きつつ、N:N association を $ref POST で作成
       python scripts/setup_permissions.py        # content + association を冪等作成
       python scripts/relink_table_permissions.py # 全 type=18 を一括で content+association 修復
```

**症状（実案件 IncidentPortal で発生）:**
Design Studio の「セキュリティ → テーブルのアクセス許可」で、各権限の **「ロール」列が空欄**（Authenticated Users が割り当たっていない）。正しい `scope`/CRUD/`Webapi/*` がすべて揃っていても 403 になる。手動で Authenticated Users を割り当てると解消するが、再デプロイで再発しうる。

**根本原因（実機検証で確定 — 以前の記述を訂正）:**
ランタイムが参照する**正本は自己参照 N:N `powerpagecomponent_powerpagecomponent` の association**。
content JSON の `adx_entitypermission_webrole` 配列は YAML/git シリアライズ形であり、これが
入っていても association が空なら 403 (90040120 EntityPermissionReadIsMissing) になる。
`pac pages upload-code-site` は YAML に webrole 紐付けがあれば association を作成するが、
API だけで content を編集した場合は association が作られない。`$ref` POST で association を
作成して初めてランタイムが認識する。

**恒久対策（デプロイ手順に組み込む）:**
1. `pac pages upload-code-site` でデプロイ
2. **`python scripts/setup_permissions.py` を実行**して各 type=18 に content（webrole 配列）と
   **N:N association（$ref POST）の両方**を冪等作成
3. `python scripts/review_pre_deploy.py` の **チェック 3.7** が ✅ になることを確認
4. restart → 60〜90 秒待って `/_api/{table}` を検証

**検証クエリ（正本＝association を直接確認）:**
```
GET /api/data/v9.2/powerpagecomponents({perm_id})
    ?$expand=powerpagecomponent_powerpagecomponent($select=name,powerpagecomponenttype)
  → 展開結果に type=11 の Web ロールが含まれていれば OK（＝ランタイム正本が紐付け済み）。
    空なら未紐付け = 403 の原因。content の配列だけでは不十分。
```

> 関連: 教訓 2（N:N association がランタイム正本）/ `references/operations-and-pitfalls.md`。本教訓は「**content 配列だけ・YAML デプロイだけでは association が空になりうるので、デプロイ後 / API 編集後に必ず $ref POST で association を作成する**」というデプロイ手順上の落とし穴を明示する。

---

### 教訓 15: `upload-code-site` は既存テーブル権限の Web ロール紐付けを消す → デプロイ後に必ず再付与

```
❌ NG: 一度 Web ロールを紐付けた後、SPA 更新のために再度 upload-code-site を実行し、
       そのまま動作確認する
       → .powerpages-site/table-permissions/*.yml が既存 type=18 を上書きし、
         content.adx_entitypermission_webrole と N:N association をリセットする
       → 既存の全グローバル権限まで一斉に 403 になる（Design Studio「ロール」列が空に）

✅ OK: upload-code-site のたびに content と N:N association の両方を再付与する
       python scripts/relink_table_permissions.py   # 全 type=18 を冪等に再付与＋再起動
```

**症状（実案件 IncidentPortal で発生）:**
`/profile`（contact Self）追加のために再デプロイしたところ、それまで動いていた
`geek_inquiry` / `geek_m365incident` / `geek_m365service` の **3 つのグローバル権限の
「ロール」列がすべて空**になり 403。デプロイ後に API で作成した `Contact - Self` だけは
（YAML に含まれないため）影響を受けなかった。

**根本原因（実機検証で確定）:**
`pac pages upload-code-site` は `.powerpages-site/table-permissions/*.yml` を正として
type=18 を上書きするが、この YAML に webrole 紐付けが含まれないと、
content JSON の Web ロール配列と N:N association が **毎回リセットされる**
（教訓 14 が「デプロイのたびに」再発する）。

**恒久対策（再デプロイ手順に固定）:**
1. `npm run build && pac pages upload-code-site`
2. **`python scripts/relink_table_permissions.py`** を実行（全 type=18 に
   Authenticated Users を content + N:N association の両方で冪等再付与 →
   再起動 → 最後に全件を検証し、欠落があれば非ゼロ終了）
3. 60〜90 秒待って `/_api/{table}` を検証

> **再起動は `PAGES_WEBSITE_ID`（PP API の websites().id）を最優先**で使う（最も確実）。
> 未設定時は `PP_SUBDOMAIN` にフォールバックする。siteName と PP API 登録名が
> 不一致（例: 'm365status' ⊄ 'M365 Status Portal'）だと subdomain 照合だけでは再起動できないため。
> スクリプト末尾の検証で content webrole と N:N association の両方が揃うことを確認できる。

> `setup_permissions.py`（TABLES に列挙したテーブルのみ）と異なり、
> `relink_table_permissions.py` は**サイト上の全 type=18 を対象に一括修復**する。
> 両スクリプトとも content JSON 配列と N:N association（$ref POST）の両方を作成する。
> 環境変数 `RELINK_WEBROLE_NAMES`（既定 `Authenticated`, カンマ区切り）で対象ロールを変更可。

---

### 教訓 16: Web API は `Webapi/{table}/fields` 許可リスト外の列を要求すると 403 → クライアントの SELECT 全列を網羅する

```
❌ NG: Webapi/contact/fields = "firstname,lastname,emailaddress1,telephone1"
       なのにクライアントが ?$select=contactid,firstname,lastname,fullname,emailaddress1
       を投げる（fullname が許可リスト外）
       → テーブル権限・Web ロールが正しくても 403 Forbidden（権限不足と誤認しやすい）

✅ OK: クライアントが SELECT する全列を fields に列挙する
       Webapi/contact/fields = "firstname,lastname,emailaddress1,telephone1,fullname"
       （主キー contactid は常に許可される。迷う場合は "*"）
```

**症状（実案件 IncidentPortal で発生）:**
contact Self 権限・`Webapi/contact/enabled=true` を設定し Web ロールも紐付け済みなのに、
`/_api/contacts?$select=contactid,firstname,lastname,fullname,emailaddress1` が **403**。
フロント側は「authenticated but no contact permission」と誤って解釈していた。

**根本原因:**
`fullname` を `Webapi/contact/fields` の許可リストに入れ忘れていた。Web API は
許可リスト外の列を含むリクエストを **403** で拒否する（200＋空ではない）。

**恒久対策:**
`setup_contact_self.py` は既定で `firstname,lastname,emailaddress1,telephone1,fullname`
を設定する（`/profile` の `checkAuth` + 編集で使う全列）。クライアントの
`$select` を変更したら fields も合わせて更新し、再起動する。

> 関連スクリプト: `scripts/setup_contact_self.py`（contact Self 権限 + Webapi 設定を
> content JSON 正本方式で冪等作成）/ `scripts/relink_table_permissions.py`（デプロイ後の一括修復）。

---

### 教訓 17: フォントはコード側（HTML + CSS + Tailwind theme）で一元管理する

> **実案件 (M365 Status Portal) で公開サイトにフォントが未設定だった問題の対処で確定。**

Code Site (SPA) のフォントは Dataverse 側ではなく **ビルド対象のコード**で完結させる。
1 箇所だけ直すと取りこぼすため、以下 3 箇所を必ず揃えてからビルド→アップロード→再起動する。

```
❌ NG: :root の font-family だけ変更 → Tailwind の font-sans ユーティリティが別フォントのまま
       Google Fonts のロードを変えず CSS だけ変更 → Web フォント自体が読み込まれない

✅ OK: 以下 3 箇所を必ず揃える（例: Noto Sans JP に統一）
```

1. **index.html** の Google Fonts ロード
   ```html
   <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
   ```
2. **src/index.css** の `:root` フォントスタック（日本語フォールバックに `Segoe UI` を含める）
   ```css
   :root { font-family: "Noto Sans JP", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
   ```
3. **Tailwind v4 `@theme inline`** の `--font-sans`（`font-sans` 系ユーティリティも統一される）
   ```css
   @theme inline { --font-sans: "Noto Sans JP", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
   ```

**反映:** `npm run build` → `pac pages upload-code-site` → サイト再起動 → InPrivate で確認。

---

### 教訓 18: サイト再起動は PAGES_WEBSITE_ID（PP API のサイト ID）で行う

> **デプロイ後の自動再起動が「Site not found in PP API」で失敗した問題で確定。**

```
❌ NG: 再起動対象を powerpages.config.json の siteName（例: m365status）の部分一致で探す
       → PP API 登録名が "M365 Status Portal"（スペース入り）だと 'm365status' が
         部分文字列にならず照合失敗 → 再起動されずキャッシュが残る

✅ OK: .env に PAGES_WEBSITE_ID（PP API の websites.id）を保存し最優先で使う
       フォールバックの名前照合はスペース除去で正規化する
```

- PP API のサイト ID は Dataverse の `powerpagesiteid` / `mspp_websiteid` とは**別物**。
- 取得: `GET https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites?api-version=2024-10-01` の `value[].id`
- 再起動: `POST .../websites/{PAGES_WEBSITE_ID}/restart?api-version=2024-10-01`
- `.env` / `.env.example` に `PAGES_WEBSITE_ID` を残しておくと、名前不一致でも確実に再起動できる。

---

### まとめ: API でテーブル権限を完結する再利用パターン

```python
from create_table_permission import create_table_permission

# Global CRUD（全レコードアクセス）
create_table_permission(
    table_logical_name="geek_incident",
    display_name="geek_incident - Global CRUD",
    scope=756150000,  # Global
    read=True, write=True, create=True,
    append=True, appendto=True,
    role_ids=["{authenticated-role-id}"],  # Authenticated Users
)

# Self（自分のレコードのみ）
create_table_permission(
    table_logical_name="contact",
    display_name="contact - Self Read Write",
    scope=756150004,  # Self
    read=True, write=True, create=False,
    role_ids=["{authenticated-role-id}"],  # Authenticated Users
)
```

### scope 値一覧

| 値 | スコープ | contactrelationship | 用途 |
|---|---------|---|---|
| 756150000 | Global | null | 全レコード |
| 756150004 | Self | null | 自分のレコードのみ（★推奨） |
| 756150001 | Contact | 必要（非推奨） | 親 Contact 配下 |
| 756150002 | Account | 必要 | 自分の Account 配下 |
| 756150003 | Parent | 必要 | 親権限に紐づくレコード |

### 教訓 19: Power Pages では `createdby` はアプリケーションユーザーになる → 報告者は Contact Lookup で追跡する

> **Code Apps との違い**: Code Apps では `createdby` = 操作ユーザー（SystemUser）なので報告者追跡に使える。
> Power Pages では Web API 経由のレコード作成は**ポータルアプリケーションユーザー**が `createdby` に
> 設定されるため、**実際のログインユーザー（報告者）は `createdby` では追跡できない**。

```
❌ NG（Power Pages）: createdby で報告者を追跡する設計
       → createdby = Power Pages アプリケーションユーザー（サービスアカウント）
       → 誰が報告したか分からない

❌ NG（Power Pages）: 報告者名・メールアドレスを手入力させるフリーテキスト列
       → ログインユーザーの Contact からすべて取得可能
       → 入力ミス・なりすましリスク・UX 劣化

✅ OK（Power Pages）: Contact テーブルへの Lookup 列で報告者を追跡
       → POST 時に bindLookup(body, "geek_inquirerid", "contacts", user.contactId)
       → ログインユーザーの Contact 情報（氏名・メール・会社・組織）は checkAuth() で自動取得
       → フォームでは報告者情報を読み取り専用表示（入力不要）
```

**Power Pages の報告者パターン（標準設計）:**

| 列 | 用途 | 入力 |
|---|---|---|
| `{prefix}_inquirerid`（Contact Lookup） | 真の報告者追跡 | 自動（`user.contactId` を `@odata.bind`） |
| `{prefix}_contactname`（文字列、任意） | 非正規化スナップショット | 自動（`user.userName` を保存） |
| `{prefix}_contactemail`（文字列、任意） | 非正規化スナップショット | 自動（`user.email` を保存） |

**Contact Self 権限に AppendTo が必須:**
- Inquiry → Contact の Lookup を POST 時にバインドするには、Contact 側に `appendto: true` が必要
- 不足すると 403 / 90040106 (AppendTo permission missing)

**フォーム UX パターン:**
```tsx
// ログインユーザーの Contact 情報を checkAuth() から取得
const user = await checkAuth(); // PPUser { contactId, userName, email, ... }

// Lookup で追跡されるため、フォームでは入力不要。読み取り専用表示のみ。
{hasContactProfile ? (
  <div className="...">
    <span>報告者: {reporterName}（{reporterEmail}）</span>
    <p>ログイン中のアカウント情報が報告者として記録されます。</p>
  </div>
) : (
  // フォールバック: Contact 情報取得不可の場合のみ手入力
  <input ... />
)}
```

> **この設計原則は Power Pages 固有**。Code Apps では `createdby` = 操作ユーザーなので
> カスタム Lookup は不要。Dataverse スキルの「報告者は createdby を利用」ルールは
> Code Apps（モデル駆動型アプリ含む）に適用される。

**セットアップスクリプト:**
```bash
python .github/skills/power-pages/scripts/setup_inquiry_reporter.py
```
Lookup 列作成・ローカライズ・Contact AppendTo 付与・Web API 確認・サイト再起動を冪等に実行する。
`.env` に `PORTAL_TABLE_LOGICAL` を設定するだけで動作する（詳細は `.env.example` 参照）。

---

### エラーコード→教訓マッピング

| HTTP | OData Code | メッセージ | 原因 | 教訓 |
|------|-----------|---------|------|------|
| 401 | 90040107 | Anti-forgery token required | CSRF トークン未送信 | 教訓 1 |
| 403 | 90040120 | EntityPermissionReadIsMissing | type=18 の N:N association が空（content 配列だけでは不十分。$ref POST 未実行 / YAML デプロイで未紐付け） | 教訓 2・14 |
| 403 | 90040101 | AttributePermissionIsMissing | `Webapi/{table}/fields` 許可リスト外の列を要求（$select なし＝`*` 要求も含む） | 教訓 16 |
| 403 | 90040106 | AppendTo permission missing | 参照先テーブルに appendto=false | 教訓 4 |
| 404 | 9004010D | CDS entity resolution failed | @odata.bind のターゲットテーブルが違う | 教訓 4 |
| 404 | 9004010C | Resource not found for segment | `Webapi/{table}/enabled` 未設定 or languageid null | 教訓 8 |
| 302 | — | Redirect to /profile | ProfileRedirectEnabled=true | 教訓 5 |

---


## ★ Web API 共有クライアント (`src/shared/powerPagesApi.ts`)

**実装方法の概要**: すべての `/_api/` 呼び出しは共有クライアント `src/shared/powerPagesApi.ts` を通す。
Power Pages の SPA は Dataverse Web API（`/_api`）を**直接 fetch** する（Code Apps の
`@microsoft/power-apps/data` SDK のようなライブラリは無い）。

upstream `integrate-webapi` スキル準拠の設計:
- anti-forgery トークンを**全リクエスト**（GET 含む）に付与
- 429・5xx を指数バックオフでリトライ（最大 3 回）
- 403/90040107（トークン期限切れ）を検出してトークンを再取得・リトライ
- `buildODataUrl`・`getFormattedValue`・`fetchAllPages`・`bindLookup` など OData ヘルパー群

> **完全な実装コード**（`powerPagesFetch`/`powerPagesFetchResponse`・`WebApiErrorCode`・OData ヘルパー・
> ページネーション・サービスレイヤーパターン）は [Dataverse クライアント実装](dataverse-client.md) を参照。

最小の利用例:

```typescript
import {
  powerPagesFetch,
  buildODataUrl,
  type ODataCollectionResponse,
} from "@/shared/powerPagesApi";
import { mapIncidentEntity, type IncidentEntity } from "@/types/incident";

// 取得（ページネーション付き）
const response = await powerPagesFetch<ODataCollectionResponse<IncidentEntity>>(
  buildODataUrl("geek_incidents", { "$select": "geek_incidentid,geek_name,geek_status", "$orderby": "createdon desc" }),
  { headers: { Prefer: "odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=20" } }
);
const incidents = (response?.value ?? []).map(mapIncidentEntity);

// 作成（書き込みは内部で anti-forgery token を自動付与）
await powerPagesFetch("/_api/geek_incidents", {
  method: "POST",
  body: JSON.stringify({ geek_name: "新規チケット", geek_status: 100000000 }),
});
```

### Code Apps との接続方式の違い

| 観点 | Power Pages（このスキル） | Code Apps |
|------|--------------------------|-----------| 
| 接続 | `/_api/` を直接 `fetch` | `@microsoft/power-apps/data` SDK |
| 取得 | `powerPagesFetch`（upstream 準拠） | `client.retrieveMultipleRecordsAsync` |
| クエリ記法 | OData 文字列（`$select=...&$orderby=...`） | オブジェクト（`select: [...], orderBy: [...]`） |
| レスポンス | `ODataCollectionResponse<T>`（throw ベース） | `{ success, data, error }`（判定） |
| 認証 | セッション Cookie（相対 URL、自動） | コネクタ + SDK |
| ユーザー実体 | contact（`Portal.User`） | systemuser（`getContext().user`） |
| 書き込み保護 | anti-forgery トークン（全リクエスト自動） | SDK が内部処理 |
| 認可 | テーブル権限 + Web ロール | Dataverse セキュリティロール |

> 詳細なコード対比は [Dataverse クライアント実装 §8](dataverse-client.md) を参照。

---


## ★ SSO + プロフィール編集 (デフォルト実装)

> **公式リファレンス**: [microsoft/power-platform-skills setup-auth](https://github.com/microsoft/power-platform-skills/tree/main/plugins/power-pages/skills/setup-auth)

**実装方法の概要**: 認証はサーバー側のセッション Cookie で完結する。クライアントはトークンを
持たず、ポータルランタイムが注入する `window.Microsoft.Dynamic365.Portal.User` を信頼して
「ログイン済みか」「誰か」を判定する。**認証判定で `/_api/contacts` をクエリしてはいけない**
（教訓 6）。

`AUTH_PROVIDERS` 配列で対応 IdP を管理し、`src/hooks/use-auth.ts` の `useAuth()` が以下をすべて提供する:

| 機能 | 実現方法 |
|------|---------|
| 認証状態判定 | `Portal.User` を読むだけ（API 呼び出しなし） |
| ① SSO ログイン | `/_layout/tokenhtml` + `resolveProviderIdentifier()` → form POST to `/Account/Login/ExternalLogin` |
| ② サインアウト | `/Account/Login/LogOff?returnUrl=%2F` へ遷移（ローカルログアウト） |
| ③ セッション keepalive | 定期的に `/_layout/tokenhtml` をフェッチしてセッション Cookie を更新 |
| ④ ログインボタン | ヘッダーで `login`/`logout` を認証状態に応じて出し分け |

### 対応 Identity Provider

| 種別 | Provider Identifier | 推奨用途 |
|------|---|---|
| **Entra ID (workforce)** | `Portal.tenant` から runtime 解決（`login.windows.net/{tenantId}/`） | 社員向け内部ポータル |
| **Entra External ID (CIAM)** | `Authentication/OpenIdConnect/{name}/AuthenticationType` の値（ciamlogin.com URL） | **顧客向けポータル（推奨）** |
| **OIDC (Generic)** | `Authentication/OpenIdConnect/{name}/AuthenticationType` の値 | Okta, Auth0 など |
| **SAML2** | `Authentication/SAML2/{name}/AuthenticationType` の値 | ADFS など |
| **ローカル認証** | N/A（`/SignIn` に `PasswordValue` フィールドで POST） | 外部 IdP 不要の場合のみ |

### SSO ログインフロー（外部 IdP — 共通パターン）

```
① useAuth().login() 呼び出し
   ↓
② AUTH_PROVIDERS[0] から provider を選択
   ↓
③ fetch("/_layout/tokenhtml") → anti-forgery token 取得
   ↓
④ resolveProviderIdentifier(provider) で provider 識別子を解決
   - Entra ID: Portal.tenant → "https://login.windows.net/{tenantId}/"
   - Entra External ID / OIDC: AUTH_PROVIDERS の providerIdentifier を直接使用
   ↓
⑤ form POST → /Account/Login/ExternalLogin
   { provider, returnUrl: "/", __RequestVerificationToken }
   ↓
⑥ Power Pages → IdP へリダイレクト → SSO 認証
   ↓
⑦ IdP → callback → セッション Cookie 設定 → returnUrl へリダイレクト
```

> **重要**: Entra ID の Provider identifier は `https://login.windows.net/{tenantId}/` であり
> `https://login.microsoftonline.com/{tenantId}/` ではない。
> Entra External ID は `https://{subdomain}.ciamlogin.com/{tenantId}`（末尾 `/v2.0/` なし）。

### ローカル認証ログインフロー

```
① localLogin(email, password) 呼び出し
   ↓
② fetch("/_layout/tokenhtml") → anti-forgery token 取得
   ↓
③ form POST → /SignIn（/Account/Login/Login ではない）
   { Email, PasswordValue, ReturnUrl: "/", __RequestVerificationToken }
   ★ フィールド名は PasswordValue（Password ではない）
```

### ログアウトモード

| モード | 設定 | 動作 |
|---|---|---|
| **ローカルログアウト**（デフォルト） | `RPInitiatedLogout` 未設定 | Power Pages セッションのみクリア。次回は SSO。 |
| **フェデレーテッドログアウト** | `RPInitiatedLogout=true` + `PostLogoutRedirectUri={site-url}/` | IdP セッションも含めてクリア。 |

### セッション keepalive

SPA ではページ遷移がクライアント側で完結するため、サーバーへのリクエストが発生しない。
セッション Cookie の `SlidingExpiration` はサーバーリクエスト時にしか更新されないため、
keepalive なしだとユーザーがアクティブに操作中でもセッションがサイレントに期限切れする。

```typescript
// 10分間隔で /_layout/tokenhtml をフェッチしてセッションを維持
useEffect(() => {
  if (!isAuthenticated) return;
  const id = setInterval(() => {
    fetch("/_layout/tokenhtml", { credentials: "same-origin" }).catch(() => {});
  }, 10 * 60 * 1000);
  return () => clearInterval(id);
}, [isAuthenticated]);
```

> **完全な実装コード**（`AUTH_PROVIDERS` 配列・`use-auth.ts`・SSO/ローカルログイン・サインアウト・
> ログインボタン UI・`RequireAuth` 認証ガード・ルート組み込み・UI フロー図・
> Entra External ID・ローカル認証・フェデレーテッドログアウト・クレームマッピング）は
> [認証実装](authentication.md) を参照。

### Code Apps との認証の違い

| 観点 | Power Pages | Code Apps |
|------|-------------|-----------|
| 認証の場所 | サーバー側（セッション Cookie） | クライアント + コネクタ |
| トークン管理 | なし（Cookie 自動送信） | SDK が内部管理 |
| ログイン | `/_layout/tokenhtml` + form POST to ExternalLogin | コネクタのサインイン |
| Provider解決 | `resolveProviderIdentifier()` （Entra ID: Portal.tenant、他: providerIdentifier 直接） | コネクタが管理 |
| ユーザー情報 | `Portal.User`（contact） | `getContext().user`（systemuser） |
| セッション維持 | keepalive（`/_layout/tokenhtml` 定期フェッチ） | SDK が管理 |

---


## ★ Web ロール管理 (YAML ファイル — upstream 標準)

> **公式リファレンス**: [microsoft/power-platform-skills create-webroles](https://github.com/microsoft/power-platform-skills/tree/main/plugins/power-pages/skills/create-webroles)

Web ロールは `.powerpages-site/web-roles/` 配下の YAML ファイルで定義し、`pac pages upload-code-site` でデプロイする。

```yaml
# .powerpages-site/web-roles/authenticated-users.yml
anonymoususersrole: false
authenticatedusersrole: true   # ← ログインユーザーの既定ロール
id: <UUID v4>
name: Authenticated Users
```

**標準ロール構成:**

| ファイル | authenticatedusersrole | anonymoususersrole | 用途 |
|---|---|---|---|
| `administrators.yml` | false | false | 管理者 |
| `authenticated-users.yml` | **true** | false | ログイン済みユーザーの既定ロール |
| `anonymous-users.yml` | false | **true** | 未認証ユーザーの既定ロール |

> **ルール**: `authenticatedusersrole: true` と `anonymoususersrole: true` はそれぞれ 1 ファイルのみ設定可。

> 完全な YAML フォーマット・UUID 生成・テーブル権限との N:N 紐付けは [Enhanced Data Model テーブル権限](enhanced-data-model-permissions.md) を参照。

---


## ★ テーブル Web API 有効化 (EDM 2.0 — Contact / カスタムテーブル共通)

> ✅ **EDM 2.0 Code Site でも `Webapi/{table}/enabled` + `Webapi/{table}/fields` は必須**（教訓 8 参照）。
> Contact だけでなく **カスタムテーブルにも適用される**。type=18 テーブル権限は「認可」、
> Webapi/* 設定は「`/_api/{table}` エンドポイントの公開」で役割が異なり、両方そろって初めて
> `/_api/` が 200 を返す。どちらか欠けると 404 (9004010C)。
> 以下は Contact を例にした手順だが、`contact` を任意のテーブル論理名に置き換えてそのまま使える。

### 重大な教訓: 404 "Resource not found for the segment contact"

**エラーコード 9004010C** が発生する場合、以下の **4 つのレイヤーすべて** が正しく設定されている必要がある:

| # | レイヤー | テーブル | 紐付け先 |
|---|---------|---------|---------|
| 1 | `adx_sitesettings` | `Webapi/contact/enabled=true` | `adx_websites` |
| 2 | `adx_sitesettings` | `Webapi/contact/fields=*` | `adx_websites` |
| 3 | `powerpagecomponent` type=18 | テーブル権限 (Self) | `powerpagesites` + **`powerpagesitelanguages`** |
| 4 | N:N association（$ref POST） | `powerpagecomponent_powerpagecomponent` でロールを紐付け | type=11 (Authenticated Users) |

### ⚠️ 致命的な落とし穴: `powerpagesitelanguageid`

```
根本原因: powerpagecomponent type=18 に powerpagesitelanguageid が null だと、
         Power Pages ランタイムがテーブル権限を認識せず 404 を返す。

確認方法:
GET /api/data/v9.2/powerpagecomponents({perm_id})?$select=_powerpagesitelanguageid_value

修正方法:
PATCH /api/data/v9.2/powerpagecomponents({perm_id})
{
  "powerpagesitelanguageid@odata.bind": "/powerpagesitelanguages({lang_id})"
}
```

### powerpagecomponent type=18 の正しい content 形式

```json
{
  "entitylogicalname": "contact",
  "entityname": "contact - Self Read Write",
  "scope": 756150004,
  "read": true,
  "write": true,
  "create": false,
  "delete": false,
  "append": false,
  "appendto": false
}
```

**注意:**
- ❌ `mspp_entityname`, `mspp_scope: "756150001"` (文字列) — 古いフォーマット、動作しない場合がある
- ✅ `entitylogicalname`, `scope: 756150004` (整数), `read: true` (bool) — system format
- ⚠️ `756150001` は Contact スコープ（親 Contact 配下）であり Self ではない。Self は `756150004`。

### scope 値一覧

| 値 | スコープ | contactrelationship | 用途 |
|---|---------|---|------|
| 756150000 | Global | null | 全レコード |
| 756150004 | Self | null | 自分のレコードのみ（★推奨） |
| 756150001 | Contact | 必要（非推奨） | 親 Contact 配下 |
| 756150002 | Account | 必要 | 自分の Account 配下 |
| 756150003 | Parent | 必要 | 親権限に紐づくレコード |

### setup_contact_webapi.py（正しい実装）

```python
# 1. adx_sitesettings (→ adx_websites にバインド)
create_site_setting("Webapi/contact/enabled", "true", website_id)
create_site_setting("Webapi/contact/fields", "*", website_id)  # system table は * 推奨

# 2. powerpagecomponent type=18 (★ powerpagesitelanguageid 必須、content に webrole を含める)
content = json.dumps({
    "entitylogicalname": "contact",
    "entityname": "contact - Self Read Write",
    "scope": 756150004,  # Self (NOT 756150001 which is Contact scope)
    "read": True, "write": True, "create": False,
    "delete": False, "append": False, "appendto": False,
    "websiteid": adx_website_id,                       # ← 必須
    "adx_entitypermission_webrole": [auth_role_id],    # ← YAML/git シリアライズ形
})
body = {
    "powerpagecomponenttype": 18,
    "name": "contact - Self Read Write",
    "content": content,
    "powerpagesiteid@odata.bind": f"/powerpagesites({site_id})",
    "powerpagesitelanguageid@odata.bind": f"/powerpagesitelanguages({lang_id})",  # ★ 必須！
}

# 3. ★ N:N association を $ref POST で作成（＝ランタイム正本。content 配列だけでは 403）
#   POST .../powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent/$ref
#        body: {"@odata.id": ".../powerpagecomponents({auth_role_id})"}
#   既存権限へのロール追加も content PATCH + この $ref POST の両方を冪等に行う
```

> ⚠️ **よくあるミス（修正済み）:**
> - `powerpagesitelanguageid` が null → ランタイムが権限を無視して 404
> - **N:N association を作成せず content 配列だけ書く → 403 (90040120)**（教訓 2・14）
> - content に `mspp_` プレフィックスの文字列値 → 整数・bool 値が正しい
> - `credentials: "include"` → 正しくは `"same-origin"`
> - `Webapi/<table>/fields` に明示リストのみ → 列指定なし取得（`*`）で 403 になるため `*` 推奨（教訓 16）

---


## ★ `.powerpages-site/site-settings/` による永続化

`pac pages upload-code-site` は `.powerpages-site/` フォルダの内容を同期する。
`site-settings/` に Webapi 設定の YAML を配置すると、デプロイ時に自動反映される。

### YAML フォーマット

```yaml
# .powerpages-site/site-settings/Webapi-contact-enabled.sitesetting.yml
id: <既存レコードの adx_sitesettingid>
name: Webapi/contact/enabled
source: 0
value: "true"
```

```yaml
# .powerpages-site/site-settings/Webapi-contact-fields.sitesetting.yml
id: <既存レコードの adx_sitesettingid>
name: Webapi/contact/fields
source: 0
value: "*"
```

```yaml
# .powerpages-site/site-settings/Webapi-error-innererror.sitesetting.yml
id: <新規 GUID>
name: Webapi/error/innererror
source: 0
value: "true"
```

**ID の取得方法:** Dataverse から `adx_sitesettings` をクエリして `adx_sitesettingid` を取得。
新規の場合は任意の GUID を生成。

---
