---
name: power-pages
description: "Power Pages Code Site (SPA) の開発・ビルド・デプロイ。pac pages upload-code-site でサイト作成からデプロイまで完結する。"
category: ui
triggers:
  - "Power Pages"
  - "pac pages"
  - "upload-code-site"
  - "コードサイト"
  - "code site"
  - "SPA"
  - "ポータル"
  - "外部サイト"
  - "Power Pages デプロイ"
  - "site settings"
  - "テーブル権限"
  - "table permissions"
  - "Web ロール"
  - "Enhanced Data Model"
  - "powerpagecomponent"
  - "403 Forbidden"
  - "404 Resource not found"
  - "9004010C"
---

# Power Pages Code Site (SPA) 開発・デプロイスキル

> **公式リファレンス**: [Power Pages でシングルページ アプリケーションを作成して展開する | Microsoft Learn](https://learn.microsoft.com/ja-jp/power-pages/configure/create-code-sites)
> **新スキル参照**: [microsoft/power-platform-skills - power-pages](https://github.com/microsoft/power-platform-skills/tree/main/plugins/power-pages)

---

## サブリファレンス（必要に応じて参照）

| リファレンス | 内容 |
|---|---|
| [Dataverse クライアント実装](references/dataverse-client.md) | `apiGet/apiPost/apiPatch/apiDelete` の実コード・anti-forgery トークン・OData クエリ・dev プロキシ・**Code Apps との対比** |
| [認証実装](references/authentication.md) | **SSO・サインアウト・ログインボタン・認証ガード・UI フロー**の実コード一式・サーバー側 IdP/サイト設定・Code Apps との対比 |
| [Enhanced Data Model テーブル権限](references/enhanced-data-model-permissions.md) | EDM 2.0 のテーブル権限設定・3 レイヤー権限・N:N バグ・ワークアラウンド |
| [運用と落とし穴](references/operations-and-pitfalls.md) | ビルド・デプロイ・サイト再起動・よくあるエラーと解決策 |
| [デザインシステム](references/design-system.md) | UI コンポーネント・テーマ・レイアウトの指針 |
| [デザインテンプレート集](references/design-templates.md) | 5 種類の配色テンプレート定義。設計時に提案→選択→適用 |

> **Dataverse 接続と認証の実装方法はこのファイルで概要を説明し、完全なサンプルコードは上記 References にまとめている。**

---

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

### 教訓 2: EDM 2.0 テーブル権限は content JSON 内の `adx_entitypermission_webrole` が必須

```
❌ NG: powerpagecomponent type=18 の content に entitylogicalname/scope/CRUD だけ設定
       → ランタイムが権限を認識せず 403

✅ OK: content JSON に adx_entitypermission_webrole（ロール ID 配列）を含める
       + powerpagecomponent_powerpagecomponent N:N リンクも設定
```

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
  "adx_entitypermission_webrole": ["e7cb523c-1d5f-f111-a825-7ced8d3b33ec"],
  "parentrelationship": null,
  "parententitypermission": null,
  "contactrelationship": null,
  "accountrelationship": null,
  "childTablePermissions": [],
  "permissionfetchxml": null
}
```

**API で完結する手順:**
1. `powerpagecomponent` type=18 を POST — content に `adx_entitypermission_webrole` 含む
2. `powerpagecomponent_powerpagecomponent` N:N で Web Role コンポーネントとリンク
3. 両方セットで初めてランタイムが認識

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
1. ログイン前: `sessionStorage.setItem("pp_return_hash", location.hash)` で保存
2. `returnUrl: "/"` でルートに戻す
3. SPA 初期化時: `RestoreRoute` コンポーネントで `sessionStorage` から復元 → `navigate()`

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

### 教訓 8: EDM 2.0 Code Site では Webapi/* Site Settings は不要

```
❌ NG: Webapi/contact/enabled, Webapi/contact/fields 等を作成
       → EDM 2.0 では不要。Standard Data Model (SDM) の legacy 設定。

✅ OK: powerpagecomponent type=18（テーブル権限）の content JSON だけで制御される
```

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
    role_ids=["e7cb523c-1d5f-f111-a825-7ced8d3b33ec"],  # Authenticated Users
)

# Self（自分のレコードのみ）
create_table_permission(
    table_logical_name="contact",
    display_name="contact - Self Read Write",
    scope=756150004,  # Self
    read=True, write=True, create=False,
    role_ids=["e7cb523c-1d5f-f111-a825-7ced8d3b33ec"],  # Authenticated Users
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

### エラーコード→教訓マッピング

| HTTP | OData Code | メッセージ | 原因 | 教訓 |
|------|-----------|---------|------|------|
| 401 | 90040107 | Anti-forgery token required | CSRF トークン未送信 | 教訓 1 |
| 403 | — | Forbidden (no permission) | content に `adx_entitypermission_webrole` なし | 教訓 2 |
| 403 | 90040106 | AppendTo permission missing | 参照先テーブルに appendto=false | 教訓 4 |
| 404 | 9004010D | CDS entity resolution failed | @odata.bind のターゲットテーブルが違う | 教訓 4 |
| 404 | 9004010C | Resource not found for segment | テーブル権限未設定 or languageid null | 教訓 2 |
| 302 | — | Redirect to /profile | ProfileRedirectEnabled=true | 教訓 5 |

---

## 核心原則

1. **`pac pages upload-code-site` がサイト作成とデプロイの両方を行う** — API でサイトを事前作成する必要はない
2. **初回は Inactive Sites に作成される** → PP API (`2022-03-01-preview`) で `activate_site.py` を使ってアクティブ化
3. **2回目以降は upload-code-site → restart の2ステップだけ**
4. **Post-Upload Fix は不要** — `upload-code-site` が header/footer/page を正しく構成する
5. **`.powerpages-site/` は upload-code-site が自動管理する** — ただし `site-settings/` YAML は手動追加して永続化できる（下記参照）
6. **`adx_website` レコードは絶対に削除しない** — EDM 2.0 でもランタイムが起動時に参照する
7. **環境のクリーンアップ時は PP API のサイト一覧と照合してから削除する** — 誤削除で 500 エラー
8. **`credentials: "same-origin"` を使う** — `"include"` ではない（same-site Cookie 認証）
9. **powerpagecomponent type=18 には `powerpagesitelanguageid` が必須** — 未設定だと 404 になる

## ワークフロー

```
初回:
  npm run build
  → pac pages upload-code-site          ← Inactive Sites に作成
  → py portal/scripts/activate_site.py  ← PP API でアクティブ化 (api-version=2022-03-01-preview)
  → py portal/scripts/setup_contact_webapi.py
  → Restart (deploy.py --skip-build or PP API restart)

2回目以降:
  npm run build → pac pages upload-code-site → Restart
  (deploy.py がビルド・アップロード・リスタートを一括実行)
```

### アクティベーション詳細

> **参照**: [microsoft/power-platform-skills activate-site](https://github.com/microsoft/power-platform-skills/tree/main/plugins/power-pages/skills/activate-site)

初回の `pac pages upload-code-site` はサイトを **Inactive Sites** に作成する。
アクティブ化は **Power Platform API** (`api-version=2022-03-01-preview`) で行う。

```
POST https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites?api-version=2022-03-01-preview

Body:
{
  "name": "<PAGES_SITE_NAME>",
  "subdomain": "<PAGES_SUBDOMAIN>",
  "templateName": "DefaultPortalTemplate",
  "dataverseOrganizationId": "<org_id>",
  "selectedBaseLanguage": 1033,
  "websiteRecordId": "<powerpagesiteid>"     ← pac pages upload-code-site が作った ID
}

Response: 202 Accepted + Operation-Location ヘッダー
→ Operation-Location を 10 秒間隔でポーリング
→ OperationComplete = 成功、OperationFailed = 失敗
```

| パラメータ | 取得方法 |
|---|---|
| `ENV_ID` | .env |
| `PAGES_SITE_NAME` | .env / powerpages.config.json の siteName |
| `PAGES_SUBDOMAIN` | .env / ユーザー指定 |
| `dataverseOrganizationId` | `GET /api/data/v9.2/organizations?$select=organizationid` |
| `websiteRecordId` | `GET /api/data/v9.2/powerpagesites` から name で検索 |

**⚠️ API バージョン注意**: `2022-03-01-preview` を使用すること。`2024-10-01` ではアクティベーションが正しく動作しない。

## 前提条件

| ツール | バージョン | 用途 |
|--------|-----------|------|
| `pac` (Power Platform CLI) | 1.44+ | サイト作成・アップロード |
| `node` + `npm` | 18+ | SPA ビルド |
| Python 3 | 3.10+ | デプロイスクリプト（任意） |

> **pac CLI 注意**: サブコマンドは `pac pages` （例: `pac pages list`, `pac pages upload-code-site`）。
> `pac power-pages` は無効。`pac pages help` でコマンド一覧を確認できる。

### .env パラメータ

```env
DATAVERSE_URL=https://{org}.crm.dynamics.com/
ENV_ID=                               # Power Platform 環境 ID
PAGES_SITE_NAME=                      # サイト名 (powerpages.config.json の siteName と一致)
PAGES_SUBDOMAIN=                      # サブドメイン (例: myportal → myportal.powerappsportals.com)
```

## プロジェクト構造（公式準拠）

```text
portal/
├── src/
│   ├── App.tsx                   ← ルート (HashRouter + Routes)
│   ├── main.tsx                  ← エントリポイント
│   ├── index.css                 ← Tailwind CSS
│   ├── components/
│   │   ├── site-layout.tsx       ← ヘッダー・ナビ・プロフィールドロップダウン
│   │   ├── require-auth.tsx      ← 認証ガードコンポーネント
│   │   ├── mode-toggle.tsx       ← ダーク/ライト切替
│   │   └── ui/                   ← shadcn/ui コンポーネント
│   ├── hooks/
│   │   └── use-auth.ts           ← SSO 認証フック
│   ├── lib/
│   │   ├── api.ts                ← ★ Web API 共有クライアント (apiGet/apiPost/apiPatch)
│   │   └── utils.ts              ← cn() ユーティリティ
│   └── pages/
│       ├── home.tsx              ← ランディングページ
│       └── profile.tsx           ← プロフィール編集 (★ api.ts を使用)
├── dist-site/                    ← ビルド出力 (compiledPath)
├── .powerpages-site/             ← upload-code-site が管理 + site-settings YAML 手動追加可
│   └── site-settings/            ← Webapi/* 設定を YAML で永続化
├── powerpages.config.json        ← CLI 設定ファイル (必須)
├── package.json
├── vite.config.ts
└── scripts/
    ├── deploy.py                 ← デプロイスクリプト (Build→Upload→Restart)
    ├── activate_site.py          ← PP API サイトアクティベーション
    ├── setup_auth.py             ← Entra ID SSO 認証設定 (Site Settings + Liquid 注入)
    └── setup_contact_webapi.py   ← Contact Web API 有効化 (EDM 2.0 対応)
```

---

## ★ Web API 共有クライアント (api.ts)

**実装方法の概要**: すべての `/_api/` 呼び出しは共有クライアント `src/lib/api.ts` を通す。
Power Pages の SPA は Dataverse Web API（`/_api`）を**直接 fetch** する（Code Apps の
`@microsoft/power-apps/data` SDK のようなライブラリは無い）。認証はブラウザのセッション
Cookie（`credentials: "same-origin"`）で行い、書き込み（POST/PATCH/DELETE）のみ anti-forgery
トークンを付与する。

> **完全な実装コード**（`apiGet`/`apiPost`/`apiPatch`/`apiDelete`・`ApiAuthError`・OData クエリ・
> Lookup の `@odata.bind`・dev プロキシ）は [Dataverse クライアント実装](references/dataverse-client.md) を参照。

最小の利用例:

```typescript
import { apiGet, apiPost, type ODataCollection } from "@/lib/api";

// 取得（OData は { value: [...] } 形式）
const res = await apiGet<ODataCollection<Incident>>(
  "geek_incidents?$select=geek_name,geek_status&$orderby=createdon desc",
);

// 作成（書き込みは内部で anti-forgery token を自動付与）
await apiPost("geek_incidents", { geek_name: "新規チケット", geek_status: 100000000 });
```

### Code Apps との接続方式の違い

| 観点 | Power Pages（このスキル） | Code Apps |
|------|--------------------------|-----------|
| 接続 | Web API を直接 `fetch("/_api/...")` | `@microsoft/power-apps/data` SDK |
| 取得 | `apiGet`（自前 fetch ラッパー） | `client.retrieveMultipleRecordsAsync` |
| クエリ記法 | OData 文字列（`$select=...&$orderby=...`） | オブジェクト（`select: [...], orderBy: [...]`） |
| レスポンス | `{ value: T[] }`（throw ベース） | `{ success, data, error }`（判定） |
| 認証 | セッション Cookie（`same-origin`、自動） | コネクタ + SDK |
| ユーザー実体 | contact（`Portal.User`） | systemuser（`getContext().user`） |
| 書き込み保護 | anti-forgery トークン | SDK が内部処理 |
| 認可 | テーブル権限 + Web ロール | Dataverse セキュリティロール |

> 詳細なコード対比は [Dataverse クライアント実装 §8](references/dataverse-client.md) を参照。

---

## ★ SSO + プロフィール編集 (デフォルト実装)

> **公式リファレンス**: [microsoft/power-platform-skills setup-auth](https://github.com/microsoft/power-platform-skills/tree/main/plugins/power-pages/skills/setup-auth)

**実装方法の概要**: 認証はサーバー側のセッション Cookie で完結する。クライアントはトークンを
持たず、ポータルランタイムが注入する `window.Microsoft.Dynamic365.Portal.User` を信頼して
「ログイン済みか」「誰か」を判定する。**認証判定で `/_api/contacts` をクエリしてはいけない**
（教訓 1）。

`src/hooks/use-auth.ts` の `useAuth()` が以下をすべて提供する:

| 機能 | 実現方法 |
|------|---------|
| 認証状態判定 | `Portal.User` を読むだけ（API 呼び出しなし） |
| ① SSO ログイン | `/_layout/tokenhtml` + `Portal.tenant` → form POST to `/Account/Login/ExternalLogin` |
| ② サインアウト | `/Account/Login/LogOff?returnUrl=%2F` へ遷移 |
| ③ セッション keepalive | 定期的に `/_layout/tokenhtml` をフェッチしてセッション Cookie を更新 |
| ④ ログインボタン | ヘッダーで `login`/`logout` を認証状態に応じて出し分け |

### SSO ログインフロー（Entra ID — 推奨パターン）

```
① useAuth().login() 呼び出し
   ↓
② fetch("/_layout/tokenhtml") → anti-forgery token 取得
   ↓
③ Portal.tenant から provider を解決: "https://login.windows.net/{tenantId}/"
   ↓
④ form POST → /Account/Login/ExternalLogin
   { provider, returnUrl: "/", __RequestVerificationToken }
   ↓
⑤ Power Pages → Entra ID へリダイレクト → SSO 認証
   ↓
⑥ Entra ID → callback → セッション Cookie 設定 → returnUrl へリダイレクト
```

> **重要**: Provider identifier は `https://login.windows.net/{tenantId}/` であり
> `https://login.microsoftonline.com/{tenantId}/` ではない。
> Power Pages は Entra ID の site settings (`Authentication/OpenIdConnect/AzureAD/AuthenticationType`)
> に `login.windows.net` を使う。

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

> **完全な実装コード**（`use-auth.ts` の SSO/サインアウト・ログインボタン UI・`RequireAuth`
> 認証ガード・ルート組み込み・UI フロー図・プロフィール編集）は
> [認証実装](references/authentication.md) を参照。

### Code Apps との認証の違い

| 観点 | Power Pages | Code Apps |
|------|-------------|-----------|
| 認証の場所 | サーバー側（セッション Cookie） | クライアント + コネクタ |
| トークン管理 | なし（Cookie 自動送信） | SDK が内部管理 |
| ログイン | `/_layout/tokenhtml` + form POST to ExternalLogin | コネクタのサインイン |
| Provider解決 | `Portal.tenant` → `login.windows.net/{tenantId}/` | コネクタが管理 |
| ユーザー情報 | `Portal.User`（contact） | `getContext().user`（systemuser） |
| セッション維持 | keepalive（`/_layout/tokenhtml` 定期フェッチ） | SDK が管理 |

---

## ★ Contact テーブル Web API 有効化 (EDM 2.0)

> ⚠️ **EDM 2.0 では `Webapi/*` Site Settings は不要**（教訓 2 参照）。
> geeksupport（動作済み参考サイト）は Webapi/* 設定なしで全テーブルにアクセス可能。
> 以下の手順は **Standard Data Model (SDM) のレガシーパターン** であり、
> 新規 Code Site では `mspp_entitypermissions` + `mspp_webroles` N:N だけで十分。

### 重大な教訓: 404 "Resource not found for the segment contact"

**エラーコード 9004010C** が発生する場合、以下の **4 つのレイヤーすべて** が正しく設定されている必要がある:

| # | レイヤー | テーブル | 紐付け先 |
|---|---------|---------|---------|
| 1 | `adx_sitesettings` | `Webapi/contact/enabled=true` | `adx_websites` |
| 2 | `adx_sitesettings` | `Webapi/contact/fields=*` | `adx_websites` |
| 3 | `powerpagecomponent` type=18 | テーブル権限 (Self) | `powerpagesites` + **`powerpagesitelanguages`** |
| 4 | `powerpagecomponent_powerpagecomponent` N:N | 権限→Web ロール紐付け | type=11 (Authenticated Users) |

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

# 2. powerpagecomponent type=18 (★ powerpagesitelanguageid 必須)
content = json.dumps({
    "entitylogicalname": "contact",
    "entityname": "contact - Self Read Write",
    "scope": 756150004,  # Self (NOT 756150001 which is Contact scope)
    "read": True, "write": True, "create": False,
    "delete": False, "append": False, "appendto": False,
})
body = {
    "powerpagecomponenttype": 18,
    "name": "contact - Self Read Write",
    "content": content,
    "powerpagesiteid@odata.bind": f"/powerpagesites({site_id})",
    "powerpagesitelanguageid@odata.bind": f"/powerpagesitelanguages({lang_id})",  # ★ 必須！
}

# 3. Authenticated Users (type=11) への N:N リンク
POST /powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent/$ref
{"@odata.id": "/api/data/v9.2/powerpagecomponents({role_id})"}
```

> ⚠️ **よくあるミス（修正済み）:**
> - `powerpagesitelanguageid` が null → ランタイムが権限を無視して 404
> - content に `mspp_` プレフィックスの文字列値 → 整数・bool 値が正しい
> - `credentials: "include"` → 正しくは `"same-origin"`
> - `Webapi/<table>/fields` に明示リストのみ → system table は `*` を使う

---

## ★ デバッグ用 Site Settings

### Webapi/error/innererror

開発・デバッグ中は以下を有効にする:

```python
# Dataverse API で直接追加
body = {
    "adx_name": "Webapi/error/innererror",
    "adx_value": "true",
    "adx_websiteid@odata.bind": f"/adx_websites({website_id})",
}
requests.post(f"{DV}/api/data/v9.2/adx_sitesettings", headers=h, json=body)
```

これにより `/_api/` のエラーレスポンスに `innererror` が含まれ、デバッグが容易になる。

> ⚠️ **本番環境では `false` に戻す** — 内部エラー情報が漏洩するリスクがある。

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

## エラーコード早見表

| HTTP | OData Code | メッセージ | 原因 | 対策 |
|------|-----------|---------|------|------|
| 401 | 90040107 | Anti-forgery token required | CSRF トークン未送信 | `/_layout/tokenhtml` から取得してヘッダー付与 |
| 403 | — | Forbidden (no permission) | content に `adx_entitypermission_webrole` なし | content JSON にロール ID 配列を含める |
| 403 | 90040106 | AppendTo permission missing | 参照先テーブルに appendto=false | EDM content で `"appendto": true` に更新 |
| 404 | 9004010D | CDS entity resolution failed | `@odata.bind` のターゲットテーブルが違う | `ManyToOneRelationships` で正しい参照先を確認 |
| 404 | 9004010C | Resource not found for segment | テーブル権限未設定 or `powerpagesitelanguageid` null | type=18 content + languageid 設定 |
| 400 | 9004010A | Invalid column name | `$select` に存在しないカラム名 | `EntityDefinitions` でカラム名確認 |
| 302 | — | Redirect to /profile | `ProfileRedirectEnabled=true` | サイト設定で `false` に変更 |
| 302 | — | Login redirect | 未認証 | SSO ログイン or `redirect: "manual"` で検知 |

---

## powerpages.config.json（必須）

```json
{
  "siteName": "MySite",
  "compiledPath": "dist-site",
  "defaultLandingPage": "index.html"
}
```

### bundleFilePatterns（オプション）

`pac pages upload-code-site` は古いバンドルファイルを自動クリーンアップする。
デフォルトパターン: `main.*.js`, `main.*.css`, `vendor.*.js`, `index-*.js`, `index-*.css` 等 10 種。
Vite のデフォルト出力（`index-{hash}.js`）はカバーされるが、カスタムの命名規則を使う場合は明示指定する:

```json
{
  "siteName": "MySite",
  "compiledPath": "dist-site",
  "defaultLandingPage": "index.html",
  "bundleFilePatterns": ["app.*.js", "app.*.css", "style.*.css"]
}
```

---

## Step 1: SPA 開発

### Vite 設定（必須制約）

```typescript
// vite.config.ts
export default defineConfig({
  base: "./",                                    // 相対パス（必須）
  build: {
    outDir: "dist-site",                         // powerpages.config.json と一致
    rollupOptions: {
      output: { inlineDynamicImports: true },    // 単一バンドル（推奨）
    },
  },
});
```

| 制約 | 理由 |
|------|------|
| `base: "./"` | Power Pages のパス構造に対応 |
| `inlineDynamicImports: true` | コード分割するとロード順問題が発生 |
| **Hash ルーティング必須** | History API モードは直接 URL アクセスで 404 |
| 静的 SPA のみ | SSR / ISR 非対応 |

### package.json scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "deploy": "npm run build && pac pages upload-code-site --rootPath .",
    "deploy:full": "py scripts/deploy.py"
  }
}
```

---

## Step 2: 初回デプロイ

### 2-A: JavaScript ファイルのアップロード許可

環境で `.js` がブロックされている場合:
1. [Power Platform 管理センター](https://admin.powerplatform.microsoft.com/) → 環境選択
2. 設定 → プライバシー + セキュリティ
3. ブロックされた添付ファイルから `js` を削除

### 2-B: ビルド & アップロード

```bash
cd portal
npm run build
pac pages upload-code-site --rootPath .
```

### 2-C: サイトのアクティブ化（PP API 経由）

```bash
py portal/scripts/activate_site.py
```

スクリプトが以下を自動実行:
1. PP API でサイトが既にアクティブか確認
2. Dataverse から Organization ID と Website Record ID を取得
3. パラメータ確認後、PP API に POST
4. Operation-Location をポーリングして完了待ち（最大 5 分）

> カスタムサブドメインを指定する場合: `py portal/scripts/activate_site.py --subdomain my-portal`

### 2-D: Contact Web API 有効化（★初回必須）

```bash
py portal/scripts/setup_contact_webapi.py
```

### 2-E: サイト再起動

```bash
py .github/skills/standard/scripts/_restart.py
```

> アクティブ化後、URL にアクセスできるまで **60〜90秒** かかる。

---

## Step 3: 再デプロイ（2回目以降）

```bash
cd portal
npm run build
pac pages upload-code-site --rootPath .
# → サイト再起動
py ../.github/skills/standard/scripts/_restart.py
```

---

## 既知の無害な警告

Power Pages ホスト (React 17) と SPA (React 19) の共存により以下が発生するが、**機能に影響なし**:

```
Unsatisfied version 16.14.0 from @microsoft/powerpages-host of shared singleton module react-dom (required ^17.0.0)
Some icons were re-registered...
```

SPA は独自の React 19 バンドルで動作するため、ホスト側の React 17 とは干渉しない。

---

## レビュースキル（品質ゲート）

Power Pages の品質を標準的に維持するための **設計前レビュー** と **デプロイ前レビュー** を提供する。

| レビュー | タイミング | ドキュメント | スクリプト |
|---|---|---|---|
| **設計前レビュー** | テーブル設計完了後、SPA 実装開始前 | [reviews/pre-design-review.md](reviews/pre-design-review.md) | `scripts/review_pre_design.py` |
| **デプロイ前レビュー** | `npm run build` 後、`pac pages upload-code-site` 前 | [reviews/pre-deploy-review.md](reviews/pre-deploy-review.md) | `scripts/review_pre_deploy.py` |

### 呼び出し方

```bash
# 設計前レビュー（ローカル静的チェックのみ、Dataverse 接続不要）
cd portal
python ../.github/skills/power-pages/scripts/review_pre_design.py

# デプロイ前レビュー（ビルド出力 + Dataverse API チェック）
cd portal
python ../.github/skills/power-pages/scripts/review_pre_deploy.py

# CI/CD でリモートチェックをスキップする場合
SKIP_REMOTE=1 python ../.github/skills/power-pages/scripts/review_pre_deploy.py
```

> **標準フロー**: 設計前レビュー → 実装 → ビルド → デプロイ前レビュー → デプロイ

---

## チェックリスト（レガシー参照用）

### 認証・認可
- [ ] POST/PATCH/DELETE に `__RequestVerificationToken` ヘッダーを付与している（教訓 1）
- [ ] `api.ts` で `credentials: "same-origin"` を使用
- [ ] `api.ts` で `redirect: "manual"` を使用し認証切れを検知している（教訓 7）
- [ ] **use-auth.ts が `/_api/contacts` をクエリしていない**（教訓 6）
- [ ] `Authentication/Registration/ProfileRedirectEnabled = false` を設定済み（教訓 5）

### テーブル権限
- [ ] EDM content JSON に `adx_entitypermission_webrole` が含まれている（教訓 2）
- [ ] `powerpagecomponent_powerpagecomponent` N:N リンクも設定済み
- [ ] テーブル権限に `append=true, appendto=true` が設定されている
- [ ] Contact 権限は scope=756150004 (Self) を使用（教訓 3）
- [ ] `@odata.bind` のターゲットが `ManyToOneRelationships` の正しい参照先テーブル（教訓 4）

### デプロイ
- [ ] `powerpages.config.json` が存在する
- [ ] `vite.config.ts` で `base: "./"` + `inlineDynamicImports: true`
- [ ] HashRouter を使用している
- [ ] `pac auth` で正しいユーザー・環境に接続されている（教訓 10）
- [ ] テーブル権限が正しい `powerpagesiteid` に紐づいている（教訓 9）
- [ ] EDM 2.0: `Webapi/*` Site Settings は不要（教訓 8）
- [ ] `Webapi/error/innererror = true` が開発環境で有効
