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

> **Dataverse 接続と認証の実装方法はこのファイルで概要を説明し、完全なサンプルコードは上記 References にまとめている。**

---

## ★★★ 重要教訓: EDM 2.0 Code Site のテーブル権限とSSO

> **実案件 (IncidentPortal02) のデバッグで確定した知見。geeksupport（動作済み参考サイト）との比較で裏取り済み。**

### 教訓 1: 認証判定で contact テーブルをクエリしてはいけない

```
❌ NG: /_api/contacts?$select=contactid&$top=1 をセッション検証に使う
       → contact の Table Permission がないと 403 EntityPermissionReadIsMissing

✅ OK: window.Microsoft.Dynamic365.Portal.User を信頼する（API 呼び出し不要）
       認証はサーバー側セッション Cookie で完結している
```

**根拠:** geeksupport（動作済み参考サイト）は contact テーブル権限を持たず、`/_api/contacts` を一切呼ばないが正常動作する。認証はポータルランタイムが注入する `window.Microsoft.Dynamic365.Portal.User` だけで判定すべき。

### 教訓 2: EDM 2.0 Code Site では Webapi/* Site Settings は不要

```
❌ NG: Webapi/contact/enabled, Webapi/contact/fields 等を作成
       → EDM 2.0 では不要。Standard Data Model (SDM) の legacy 設定。

✅ OK: mspp_entitypermissions（テーブル権限）+ mspp_webroles（Web ロール）の
       N:N 関連付けだけで /_api/ アクセスが制御される
```

**根拠:** geeksupport は Webapi/* Site Settings が 0 件だが、`/_api/` で全ビジネステーブルに正常アクセスできる。

### 教訓 3: Website ID の取り違え

```
❌ NG: .env の WEBSITE_ID と実際の mspp_websites/powerpagesites の ID が不一致
       → テーブル権限を作っても「別サイトの権限」になり効かない

✅ OK: pac org who で確認した環境の mspp_websites から正確な ID を取得

確認コマンド:
  GET /api/data/v9.2/mspp_websites?$select=mspp_websiteid,mspp_name
  GET /api/data/v9.2/powerpagesites?$select=powerpagesiteid,name
```

**注意:** EDM 2.0 では `mspp_websites` と `powerpagesites` の両方にレコードが存在する。ID は共通。

### 教訓 4: pac CLI の環境接続ミス

```
❌ NG: pac が別環境に接続されたままアップロード → 間違ったサイトに反映
       pac org select は InvalidOperationException で crash することがある

✅ OK: pac auth create --name "xxx" --environment "https://{org}.crm.dynamics.com/"
       で明示的に新規プロファイルを作成してから pac org who で確認
```

### 教訓 5: テーブル権限には append/appendto = true が必要

```
❌ NG: Read/Write/Create だけ true にして append/appendto が false
       → リレーション（Lookup）のあるテーブルで書き込みが 403

✅ OK: 全ビジネステーブルで append=true, appendto=true を設定
```

### 教訓 6: Authenticated Users ロールは「認証済み全ユーザーに自動付与」ロール

```
確認: mspp_authenticatedusersrole = true のロールを使う
      （手動で contact に N:N 関連付けする必要なし）
```

### まとめ: EDM 2.0 Code Site の正しい権限設定パターン

```python
# geeksupport と同じ構成:
# 1. mspp_entitypermissions を作成（Global scope, R/W/C/Append/AppendTo）
# 2. mspp_entitypermission_webrole N:N で「Authenticated Users」にリンク
# 3. Webapi/* Site Settings は作らない
# 4. 認証フックで /_api/contacts をクエリしない

SCOPE_GLOBAL = 756150000

permissions = [
    {"table": "geek_incident", "read": True, "write": True, "create": True,
     "delete": False, "append": True, "appendto": True},
    {"table": "geek_incidentcategory", "read": True, "write": False, "create": False,
     "delete": False, "append": True, "appendto": True},
    {"table": "geek_incidentcomment", "read": True, "write": True, "create": True,
     "delete": False, "append": True, "appendto": True},
]

# contact テーブル権限はプロフィール編集が必要な場合のみ追加
# 認証チェック目的では不要
```

---

## 核心原則

1. **`pac pages upload-code-site` がサイト作成とデプロイの両方を行う** — API でサイトを事前作成する必要はない
2. **初回は Inactive Sites に作成される** → Power Pages ポータル or PP API でアクティブ化
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
  npm run build → pac pages upload-code-site → Activate → setup_contact_webapi.py → Restart

2回目以降:
  npm run build → pac pages upload-code-site → Restart
```

## 前提条件

| ツール | バージョン | 用途 |
|--------|-----------|------|
| `pac` (Power Platform CLI) | 1.44+ | サイト作成・アップロード |
| `node` + `npm` | 18+ | SPA ビルド |
| Python 3 | 3.10+ | デプロイスクリプト（任意） |

### .env パラメータ

```env
DATAVERSE_URL=https://{org}.crm.dynamics.com/
ENV_ID=                               # Power Platform 環境 ID
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

**実装方法の概要**: 認証はサーバー側のセッション Cookie で完結する。クライアントはトークンを
持たず、ポータルランタイムが注入する `window.Microsoft.Dynamic365.Portal.User` を信頼して
「ログイン済みか」「誰か」を判定する。**認証判定で `/_api/contacts` をクエリしてはいけない**
（教訓 1）。

`src/hooks/use-auth.ts` の `useAuth()` が以下をすべて提供する:

| 機能 | 実現方法 |
|------|---------|
| 認証状態判定 | `Portal.User` を読むだけ（API 呼び出しなし） |
| ① シングルサインオン（login） | `/SignIn` から token+provider を抽出し `/Account/Login/ExternalLogin` へ form POST（プロバイダー選択ページをスキップ） |
| ② サインアウト（logout） | `/Account/Login/LogOff?returnUrl=%2F` へ遷移 |
| ③ ログインボタン | ヘッダーで `login`/`logout` を認証状態に応じて出し分け |

> **完全な実装コード**（`use-auth.ts` の SSO/サインアウト・ログインボタン UI・`RequireAuth`
> 認証ガード・ルート組み込み・UI フロー図・プロフィール編集）は
> [認証実装](references/authentication.md) を参照。

### Code Apps との認証の違い

| 観点 | Power Pages | Code Apps |
|------|-------------|-----------|
| 認証の場所 | サーバー側（セッション Cookie） | クライアント + コネクタ |
| トークン管理 | なし（Cookie 自動送信） | SDK が内部管理 |
| ログイン | Entra ID へ form POST | コネクタのサインイン |
| ユーザー情報 | `Portal.User`（contact） | `getContext().user`（systemuser） |

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
  "scope": 756150001,
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
- ✅ `entitylogicalname`, `scope: 756150001` (整数), `read: true` (bool) — system format

### scope 値一覧

| 値 | スコープ | 用途 |
|---|---------|------|
| 756150000 | Global | 全レコード読み取り |
| 756150001 | Self (Contact) | 自分の Contact レコードのみ |
| 756150002 | Account | 自分の Account 配下 |
| 756150003 | Parent | 親権限に紐づくレコード |

### setup_contact_webapi.py（正しい実装）

```python
# 1. adx_sitesettings (→ adx_websites にバインド)
create_site_setting("Webapi/contact/enabled", "true", website_id)
create_site_setting("Webapi/contact/fields", "*", website_id)  # system table は * 推奨

# 2. powerpagecomponent type=18 (★ powerpagesitelanguageid 必須)
content = json.dumps({
    "entitylogicalname": "contact",
    "entityname": "contact - Self Read Write",
    "scope": 756150001,
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
| 404 | 9004010C | Resource not found for the segment `<table>` | テーブル権限未設定 or `powerpagesitelanguageid` が null | `setup_contact_webapi.py` 実行 |
| 400 | 9004010A | Invalid column name | `$select` に存在しないカラム名 | `EntityDefinitions` でカラム名確認 |
| 403 | — | Forbidden | `Webapi/<table>/fields` にカラムが含まれていない | fields を `*` に設定、または具体カラム追加 |
| 302 | — | Login redirect | 未認証 | SSO ログインさせる |

---

## powerpages.config.json（必須）

```json
{
  "siteName": "MySite",
  "compiledPath": "dist-site",
  "defaultLandingPage": "index.html"
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

### 2-C: サイトのアクティブ化

Power Pages ポータルの Inactive sites から **再アクティブ化** をクリック。

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

## チェックリスト

- [ ] `powerpages.config.json` が存在する
- [ ] `vite.config.ts` で `base: "./"` + `inlineDynamicImports: true`
- [ ] HashRouter を使用している
- [ ] `api.ts` で `credentials: "same-origin"` を使用
- [ ] **use-auth.ts が `/_api/contacts` をクエリしていない**（教訓 1）
- [ ] テーブル権限 (`mspp_entitypermissions`) が正しい `powerpagesiteid` に紐づいている（教訓 3）
- [ ] テーブル権限に `append=true, appendto=true` が設定されている（教訓 5）
- [ ] テーブル権限が `Authenticated Users` ロールに N:N リンクされている
- [ ] `pac org who` で正しい環境に接続されていることを確認（教訓 4）
- [ ] EDM 2.0: `Webapi/*` Site Settings は不要（教訓 2）
- [ ] `Webapi/error/innererror = true` が開発環境で有効
- [ ] `.powerpages-site/site-settings/` に Webapi YAML が配置済み（SDM の場合のみ）
