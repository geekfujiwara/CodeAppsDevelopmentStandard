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
---

# Power Pages Code Site (SPA) 開発・デプロイスキル

> **公式リファレンス**: [Power Pages でシングルページ アプリケーションを作成して展開する | Microsoft Learn](https://learn.microsoft.com/ja-jp/power-pages/configure/create-code-sites)

## 核心原則

1. **`pac pages upload-code-site` がサイト作成とデプロイの両方を行う** — API でサイトを事前作成する必要はない
2. **初回は Inactive Sites に作成される** → Power Pages ポータル or PP API でアクティブ化
3. **2回目以降は upload-code-site → restart の2ステップだけ**
4. **Post-Upload Fix は不要** — `upload-code-site` が header/footer/page を正しく構成する
5. **`.powerpages-site/` は upload-code-site が自動管理する** — 手動作成・編集しない
6. **`adx_website` レコードは絶対に削除しない** — EDM 2.0 でもランタイムが起動時に参照する
7. **環境のクリーンアップ時は PP API のサイト一覧と照合してから削除する** — 誤削除で 500 エラー

## ワークフロー

```
初回:
  npm run build → pac pages upload-code-site → Activate → Restart

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
│   │   └── use-auth.ts           ← SSO 認証フック (★デフォルト実装)
│   ├── lib/
│   │   └── utils.ts              ← cn() ユーティリティ
│   └── pages/
│       ├── home.tsx              ← ランディングページ
│       └── profile.tsx           ← プロフィール編集 (★デフォルト実装)
├── dist-site/                    ← ビルド出力 (compiledPath)
│   ├── index.html
│   └── assets/
├── powerpages.config.json        ← CLI 設定ファイル (必須)
├── package.json
├── vite.config.ts
└── scripts/
    └── deploy.py                 ← デプロイスクリプト (Build→Upload→Restart)
```

> **`.powerpages-site/` は upload-code-site が自動生成・管理する。手動作成不要。**

---

## ★ デフォルト実装: SSO ログイン + プロフィール編集

**すべての Code Site プロジェクトに最初から含める必須機能:**

1. Entra ID SSO ログイン（`/SignIn` 直行方式）
2. プロフィール編集ページ（`/_api/contacts` 経由で PATCH）
3. ヘッダー右上のプロフィールアバターアイコン + ドロップダウン
4. `RequireAuth` ガードコンポーネント
5. Contact 自動作成（Power Pages のデフォルト動作）

### use-auth.ts（SSO 認証フック）

```typescript
import { useState, useEffect, useCallback } from "react";

export interface AuthUser {
  contactId: string;
  fullName: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
}

/**
 * Power Pages authentication hook.
 * Reads the portal-injected user context from the liquid-rendered global.
 * If Entra ID is the sole IdP, login redirects to /SignIn which auto-triggers SSO.
 */
export function useAuth() {
  const [state, setState] = useState<{
    isAuthenticated: boolean;
    user: AuthUser | null;
    loading: boolean;
  }>({ isAuthenticated: false, user: null, loading: true });

  useEffect(() => {
    // Power Pages injects user info via liquid template into the page
    const portalUser = (window as any)["Microsoft"]?.Dynamic365?.Portal?.User;
    const contactId = portalUser?.contactId || portalUser?.id || "";

    if (contactId) {
      setState({
        isAuthenticated: true,
        user: {
          contactId,
          fullName: portalUser?.fullName || portalUser?.fullname || "",
          email: portalUser?.emailAddress || portalUser?.emailaddress1 || "",
          firstName: portalUser?.firstName || portalUser?.firstname || "",
          lastName: portalUser?.lastName || portalUser?.lastname || "",
          phone: portalUser?.telephone1 || "",
        },
        loading: false,
      });
    } else {
      setState({ isAuthenticated: false, user: null, loading: false });
    }
  }, []);

  const login = useCallback(() => {
    // /SignIn directly triggers SSO when Entra ID is the only IdP
    const returnUrl = encodeURIComponent(window.location.pathname + window.location.hash);
    window.location.href = `/SignIn?returnUrl=${returnUrl}`;
  }, []);

  const logout = useCallback(() => {
    window.location.href = "/Account/Login/LogOff?returnUrl=%2F";
  }, []);

  return { ...state, login, logout };
}
```

**ポイント:**
- `/SignIn` は Entra ID が唯一の IdP の場合、自動で SSO に直行する
- `window.Microsoft.Dynamic365.Portal.User` は Liquid テンプレートが注入
- PRIVATE サイトの場合は SPA ロード時点で認証済み（`window.__PP_USER__` も利用可）

### require-auth.tsx（認証ガードコンポーネント）

```tsx
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogIn, Loader2 } from "lucide-react";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, login } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-6">
        <div className="text-center space-y-3">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <LogIn className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">ログインが必要です</h2>
          <p className="text-muted-foreground max-w-sm">
            この機能を利用するにはログインしてください。
          </p>
        </div>
        <Button size="lg" onClick={login} className="gap-2">
          <LogIn className="h-4 w-4" />
          ログイン
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
```

### profile.tsx（プロフィール編集ページ）

```tsx
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Save, Loader2, User } from "lucide-react";

interface ContactProfile {
  firstname: string;
  lastname: string;
  emailaddress1: string;
  telephone1: string;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ContactProfile>({
    firstname: "", lastname: "", emailaddress1: "", telephone1: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!user?.contactId) return;
    fetchProfile();
  }, [user?.contactId]);

  async function fetchProfile() {
    try {
      const res = await fetch(
        `/_api/contacts(${user!.contactId})?$select=firstname,lastname,emailaddress1,telephone1`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProfile({
        firstname: data.firstname || "",
        lastname: data.lastname || "",
        emailaddress1: data.emailaddress1 || "",
        telephone1: data.telephone1 || "",
      });
    } catch (e) {
      console.error("[Profile] fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      // Get anti-forgery token
      const tokenRes = await fetch("/_layout/tokenhtml", { credentials: "include" });
      const tokenHtml = await tokenRes.text();
      const match = tokenHtml.match(/value="([^"]+)"/);
      const token = match?.[1] || "";

      const res = await fetch(`/_api/contacts(${user!.contactId})`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          __RequestVerificationToken: token,
        },
        body: JSON.stringify({
          firstname: profile.firstname,
          lastname: profile.lastname,
          telephone1: profile.telephone1,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMessage({ type: "success", text: "プロフィールを更新しました" });
    } catch (e) {
      setMessage({ type: "error", text: "更新に失敗しました。もう一度お試しください。" });
      console.error("[Profile] save failed:", e);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      {/* ... プロフィールフォーム UI ... */}
      <form onSubmit={handleSave} className="space-y-4">
        {/* 姓・名・メール(disabled)・電話 */}
        <Button type="submit" disabled={saving} className="w-full gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存
        </Button>
      </form>
    </div>
  );
}
```

### site-layout.tsx のプロフィールドロップダウン（ヘッダー右上）

```tsx
// ヘッダー右側にプロフィールアバター + ドロップダウン
{isAuthenticated ? (
  <div className="relative" onMouseEnter={handleProfileEnter} onMouseLeave={handleProfileLeave}>
    <button
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
      onClick={() => navigate("/profile")}
    >
      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
        <User className="h-4 w-4 text-primary" />
      </div>
      <span className="text-xs text-muted-foreground max-w-[100px] truncate">
        {user?.fullName}
      </span>
    </button>
    {profileMenuOpen && (
      <div className="absolute top-full right-0 pt-1 z-50">
        <div className="min-w-[160px] rounded-xl border bg-card shadow-premium p-1.5">
          <button onClick={() => navigate("/profile")}>プロフィール編集</button>
          <button onClick={logout}>ログアウト</button>
        </div>
      </div>
    )}
  </div>
) : (
  <Button variant="outline" size="sm" onClick={login}>ログイン</Button>
)}
```

### App.tsx のルート定義

```tsx
import ProfilePage from "@/pages/profile";

// Routes 内に追加
<Route
  path="profile"
  element={
    <RequireAuth>
      <ProfilePage />
    </RequireAuth>
  }
/>
```

### Contact 自動作成

Power Pages では **Entra ID 経由で初回ログインした時に Contact レコードが自動作成される**。
サイト設定 `Authentication/Registration/OpenRegistrationEnabled = true` がデフォルト。
追加のコードは不要。

### Contact テーブルの Web API 有効化

プロフィール編集には `contact` テーブルの Web API アクセスが必要。
**3 つのレイヤーすべてを設定しないと 404 になる:**

1. **Site Settings** (`adx_sitesettings`) - Web API エンドポイント有効化
2. **mspp_entitypermission** - テーブル権限（レガシーランタイムが参照）
3. **mspp_webrole** + N:N 紐付け - 認証ユーザーへの権限付与

```python
# 1. Site Settings (adx_sitesettings → adx_websites に紐付け)
create_site_setting("Webapi/contact/enabled", "true", website_id)
create_site_setting("Webapi/contact/fields", "firstname,lastname,emailaddress1,telephone1,fullname", website_id)

# 2. mspp_webrole (※ mspp_websiteid は powerpagesites を参照する！adx_websites ではない)
body = {
    "mspp_name": "Authenticated Users",
    "mspp_authenticatedusersrole": True,
    "mspp_websiteid@odata.bind": f"/powerpagesites({SITE_ID})",  # NOT adx_websites!
}

# 3. mspp_entitypermission (Contact Self)
body = {
    "mspp_entitylogicalname": "contact",
    "mspp_entityname": "Contact - Self",
    "mspp_scope": 756150001,  # Self (Contact)
    "mspp_read": True,
    "mspp_write": True,
    "mspp_websiteid@odata.bind": f"/powerpagesites({SITE_ID})",
}

# 4. N:N 紐付け（両方必要）
#    - mspp_entitypermission_webrole (レガシー)
#    - powerpagecomponent_powerpagecomponent (新モデル)
POST /mspp_entitypermissions({perm_id})/mspp_entitypermission_webrole/$ref
POST /powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent/$ref
```

> ⚠️ **よくあるミス:**
> - `mspp_websiteid@odata.bind` に `adx_websites` を指定 → 404 エラー（正しくは `powerpagesites`）
> - `powerpagecomponent` の content に `mspp_` プレフィックス → 無視される
> - N:N 紐付けが片方だけ → ランタイムが参照できない

> **自動化スクリプト**: `portal/scripts/setup_contact_webapi.py` で上記を一括実行可能。
> `/_api/contacts` が 404 を返す場合はこのスクリプトを実行 → `pac pages upload-code-site` で反映。

### ★ 初回デプロイ後の必須手順

デプロイ直後、プロフィール編集が動作するために以下が必要:

```bash
# 1. Contact Web API 有効化 + テーブル権限設定
py portal/scripts/setup_contact_webapi.py

# 2. サイトリスタート（設定反映）
py portal/scripts/deploy.py --skip-build
```

**`/_api/contacts` が 404 を返す原因**: Site Settings (`Webapi/contact/enabled`) が未設定。
上記スクリプトで自動解決する。

### powerpages.config.json（必須）

```json
{
  "siteName": "MySite",
  "compiledPath": "dist-site",
  "defaultLandingPage": "index.html"
}
```

| フィールド | 説明 |
|-----------|------|
| `siteName` | Power Pages サイトの表示名。初回 upload 時にこの名前でサイトが作成される |
| `compiledPath` | ビルド出力ディレクトリ（`vite.config.ts` の `outDir` と一致させる） |
| `defaultLandingPage` | ランディングページファイル名 |

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
| **Hash ルーティング必須** | History API モードは直接 URL アクセスで 404（サーバーリライト不可） |
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

これだけで:
- Dataverse に Code Site レコードが作成される (Enhanced Data Model 2.0)
- ビルド済みアセット (JS/CSS) が Web File としてアップロードされる
- Home page / Header / Footer テンプレートが SPA 用に構成される
- サイトは **Inactive** 状態で作成される

### 2-C: サイトのアクティブ化

#### 方法 A: Power Pages ポータル（推奨）

1. [Power Pages](https://make.powerpages.microsoft.com/) に移動
2. **Inactive sites** でサイトを見つける
3. **再アクティブ化** をクリック

#### 方法 B: Power Platform API

```python
import requests
from auth_helper import get_token

ENV_ID = os.environ["ENV_ID"]
token = get_token(scope="https://api.powerplatform.com/.default")
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# Organization ID を取得
dv_token = get_token()
org = requests.get(
    f"{DATAVERSE_URL}/api/data/v9.2/organizations?$select=organizationid",
    headers={"Authorization": f"Bearer {dv_token}", "Accept": "application/json"},
)
org_id = org.json()["value"][0]["organizationid"]

# websiteRecordId を取得 (powerpagesites テーブルから)
sites = requests.get(
    f"{DATAVERSE_URL}/api/data/v9.2/powerpagesites?$select=powerpagesiteid,name&$orderby=createdon desc&$top=1",
    headers={"Authorization": f"Bearer {dv_token}", "Accept": "application/json"},
)
website_record_id = sites.json()["value"][0]["powerpagesiteid"]

# プロビジョニング
body = {
    "dataverseOrganizationId": org_id,
    "name": "MySite",
    "selectedBaseLanguage": 1041,
    "subdomain": "mysite01",
    "templateName": "DefaultPortalTemplate",
    "websiteRecordId": website_record_id,
    "dataModel": "Enhanced",
}
r = requests.post(
    f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites?api-version=2024-10-01",
    headers=headers, json=body,
)
# 202 Accepted → プロビジョニング開始（3〜5分で完了）
```

### 2-D: アクティブ化後の初回リスタート

```python
# PP API でサイト ID を取得してリスタート
base = f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites"
r = requests.get(f"{base}?api-version=2024-10-01", headers=headers)
for s in r.json()["value"]:
    if s["subdomain"] == "mysite01":
        requests.post(f"{base}/{s['id']}/restart?api-version=2024-10-01", headers=headers)
        break
```

> アクティブ化後、URL にアクセスできるまで **60〜90秒** かかる。

---

## Step 3: 再デプロイ（2回目以降）

```bash
cd portal
npm run build
pac pages upload-code-site --rootPath .
# → サイト再起動（API or deploy.py）
```

または Python スクリプトで一括:

```bash
py portal/scripts/deploy.py
```

### deploy.py（推奨デプロイスクリプト）

```python
"""Power Pages Code Site: Build → Upload → Restart"""
import os, sys, subprocess
# ... (auth_helper / requests をインポート)

def main():
    # [1/3] Build
    subprocess.run("npm run build", shell=True, cwd=PORTAL_DIR, check=True)

    # [2/3] Upload
    subprocess.run(f'pac pages upload-code-site --rootPath "{PORTAL_DIR}"',
                   shell=True, check=True)

    # [3/3] Restart
    token = get_token(scope="https://api.powerplatform.com/.default")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    base = f"https://api.powerplatform.com/powerpages/environments/{ENV_ID}/websites"
    r = requests.get(f"{base}?api-version=2024-10-01", headers=headers)
    for s in r.json()["value"]:
        if s["subdomain"] == SUBDOMAIN:
            requests.post(f"{base}/{s['id']}/restart?api-version=2024-10-01", headers=headers)
            break

    print(f"DONE. URL: https://{SUBDOMAIN}.powerappsportals.com")
    print("(60-90秒後にアクセス可能)")
```

---

## Step 4: 認証と承認

> **SSO ログイン + プロフィール編集は「★ デフォルト実装」セクションのコードをそのまま使う。**
> 以下は技術的な背景と追加カスタマイズ用のリファレンス。

### 認証方式の選択

| 方式 | 推奨度 | 説明 |
|------|--------|------|
| `/SignIn` 直行 (SSO) | ★推奨 | Entra ID が唯一の IdP なら自動でSSO。ログイン画面が表示されない |
| `/Account/Login/ExternalLogin` POST | ○ | 複数 IdP がある場合に特定プロバイダーを指定 |
| `/Account/Login` リダイレクト | △ | クラシックログインページ。SPA 体験が途切れる |
| PRIVATE サイト | ◎ | 全ページ認証必須。SPA ロード時点で認証済み。最もシンプル |

### ユーザーコンテキストへのアクセス

```typescript
// Power Pages がグローバルに注入するユーザー情報
const user = (window as any)["Microsoft"]?.Dynamic365?.Portal?.User;
const username = user?.userName ?? "";
const firstName = user?.firstName ?? "";
const tenantId = (window as any)["Microsoft"]?.Dynamic365?.Portal?.tenant ?? "";
const isAuthenticated = username !== "";
```

### Anti-Forgery Token（書き込み操作に必須）

```typescript
const fetchToken = async (): Promise<string> => {
  const res = await fetch("/_layout/tokenhtml", { credentials: "include" });
  const html = await res.text();
  const match = html.match(/value="([^"]+)"/);
  return match?.[1] ?? "";
};
```

### ID プロバイダー構成

1. [Power Pages](https://make.powerpages.microsoft.com/) → サイト選択
2. セキュリティ → ID プロバイダー
3. Microsoft Entra ID を有効化（新規サイトはデフォルトで設定済み）

---

## Step 5: Power Pages Web API

```typescript
// /_api/ を使用して Dataverse テーブルにアクセス
const response = await fetch("/_api/geek_incidents");
const data = await response.json();
const records = data.value;
```

### Web API を有効化する Site Settings

テーブルごとに `adx_sitesettings` に設定を追加:

```python
tables = ["geek_incident", "geek_category"]
for table in tables:
    create_adx_sitesetting(f"Webapi/{table}/enabled", "true", website_id)
    create_adx_sitesetting(f"Webapi/{table}/fields", "*", website_id)
```

> Site Settings がないとテーブルが Web API に公開されない（管理者でも 404）。

### テーブル権限 (Enhanced Data Model)

Enhanced Data Model (v2.0) では `powerpagecomponent` テーブルで管理:

```python
# type=18 がテーブル権限
component = {
    "powerpagecomponenttype": 18,
    "name": f"{table} - Global Read",
    "content": json.dumps({
        "mspp_entityname": table_logical,
        "mspp_scope": "756150000",  # Global
        "mspp_read": "true",
        "mspp_write": "false",
        "mspp_create": "false",
        "mspp_delete": "false",
    }),
    "powerpagesiteid@odata.bind": f"/powerpagesites({SITE_ID})",
}

# Web Role (type=11) との紐付け: 自己参照 N:N
url = f"{DV}/api/data/v9.2/powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent/$ref"
body = {"@odata.id": f"{DV}/api/data/v9.2/powerpagecomponents({role_ppc_id})"}
requests.post(url, json=body, headers=headers)
```

> 管理者でも Web ロール経由でないと 403。必ず一般ユーザーでもテストすること。

---

## Step 6: ローカル開発

`vite.config.ts` にプロキシを追加して localhost から Web API を呼べるようにする:

```typescript
export default defineConfig({
  server: {
    proxy: {
      "/_api": {
        target: "https://mysite01.powerappsportals.com",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
```

> Bearer 認証には Entra AD v1 エンドポイント + ADAL.js を使用。MSAL は非互換。

---

## 既存 Power Pages サイトとの違い

| 項目 | SPA Code Site |
|------|--------------|
| ルーティング | クライアント側（Hash Router）。ハードリフレッシュはルートにフォールバック |
| Liquid テンプレート | 非サポート。Web API + フレームワークテンプレートを使用 |
| ページワークスペース | 非サポート。クライアントルーティングを使用 |
| スタイル | フレームワークの CSS/Tailwind を使用 |
| ローカライゼーション | クライアント側リソース読み込みで実装 |
| SEO | 限定的（CSR のため） |

---

## Power Platform API

| 操作 | エンドポイント |
|------|------|
| 一覧取得 | `GET /powerpages/environments/{envId}/websites?api-version=2024-10-01` |
| 作成/アクティブ化 | `POST /powerpages/environments/{envId}/websites?api-version=2024-10-01` |
| 再起動 | `POST .../websites/{id}/restart?api-version=2024-10-01` |
| 開始 | `POST .../websites/{id}/start?api-version=2024-10-01` |
| 停止 | `POST .../websites/{id}/stop?api-version=2024-10-01` |

**Base URL**: `https://api.powerplatform.com`
**認証スコープ**: `https://api.powerplatform.com/.default`

---

## トラブルシューティング

| 問題 | 原因 | 対策 |
|------|------|------|
| upload-code-site で `.js blocked` | 環境で JS ブロック | 管理センター → ブロック添付ファイルから `js` 削除 |
| サイト URL が 503 | プロビジョニング未完了 or 未アクティブ | Inactive Sites でアクティブ化。60-90秒待つ |
| Web API が 403 | テーブル権限未設定 or Web ロール未紐付け | Site Settings + Table Permission + Web Role 紐付け確認 |
| Web API が 404 | `Webapi/{table}/enabled` 未設定 | adx_sitesettings に追加 |
| SPA が表示されずクラシックページ表示 | サイトが Code Site として作成されていない | **削除して `upload-code-site` で再作成**（変換不可） |
| ログイン後にブランクページ | `ProfileRedirectEnabled=true` | `false` に設定 |
| 設定変更が反映されない | サイトキャッシュ | PP API で restart + ブラウザキャッシュクリア |
| `Object reference not set` + `FetchSolutions` | `adx_website` レコードが存在しない | 下記「adx_website は絶対に削除してはいけない」参照 |
| `Object reference not set` + `ToOrganizationService` | ポータル App User の CRM 接続失敗 | サイトの Application User がロール付きで存在するか確認 |
| 起動エラー全般（500）| 孤立レコードが原因の可能性 | 下記「孤立レコード問題」参照 |
| 初回アクセスが 60 秒タイムアウト | プロビジョニング直後のコールドスタート | 正常。2〜3 分後に 120 秒タイムアウトで再試行 |
| サイトが修復不能（500 が解消しない）| adx_website 削除等で環境が壊れた | 新サブドメインで新規作成（下記「リカバリ手順」）|

---

## 危険操作（絶対にやってはいけないこと）

### 1. `adx_website` レコードを削除してはいけない

**EDM 2.0 Code Site であっても** ポータルランタイム (Adxstudio) は `adx_website` レコードを参照する。
`upload-code-site` が初回アップロード時に自動作成するこのレコードを削除すると:

- ランタイムが起動時に `NullReferenceException` → 500 エラー
- スタックトレース: `ToOrganizationService` → `FetchSolutions`
- サイトが完全にアクセス不能になる

**復旧方法**: `adx_website` を POST で再作成 → restart

```python
# 最低限のフィールドで再作成
body = {
    "adx_name": f"{SITE_NAME} - {SUBDOMAIN}",
    "adx_primarydomainname": f"{SUBDOMAIN}.powerappsportals.com",
    "adx_website_language": 1033,  # or 1041 for Japanese
}
requests.post(f"{DATAVERSE_URL}api/data/v9.2/adx_websites", headers=headers, json=body)
```

### 2. PP API `POST /websites` で Code Site を作ってはいけない

PP API の `POST /powerpages/environments/{envId}/websites` は**常にクラシックポータル**を作成する。
Code Site は `pac pages upload-code-site` でのみ作成可能。

### 3. 孤立レコードのクリーンアップ時の注意

環境に複数のテスト/失敗サイトレコードが残った場合:

| テーブル | 安全に削除可能? | 注意 |
|---------|----------------|------|
| `powerpagesites` | ⚠ 慎重に | 対応する PP API サイトが存在しないもののみ |
| `adx_websites` | ❌ 基本削除禁止 | ランタイムが参照。削除すると 500 エラー |
| `adx_websitelanguages` | ❌ 削除禁止 | サイトの言語バインディング |
| `adx_webtemplates` | ❌ 削除禁止 | Header/Footer のレンダリングに必須 |

**クリーンアップ前に必ず確認すること:**
1. PP API (`GET /websites?api-version=2024-10-01`) で現在アクティブなサイト一覧を取得
2. 各サイトの `websiteRecordId` (= `powerpagesiteid`) を確認
3. アクティブサイトに紐付く `powerpagesiteid` を持つレコードは絶対に消さない
4. `adx_websites` は基本的に消さない（どのサイトに紐付くか明確でない場合が多い）

### 4. 環境内に 1つの Code Site しか作成しない

同じ環境に複数の Code Site を作ると `adx_website` の紐付けが曖昧になる。
1 環境 = 1 Code Site を推奨。

---

## 重要な教訓

1. **Code Site は最初から Code Site として作成する必要がある** — 既存のクラシックサイトを Code Site に変換することはできない
2. **`pac pages upload-code-site` が正しいサイト作成方法** — PP API の `POST /websites` で作ったサイトはクラシックポータル
3. **Enhanced Data Model (v2.0) が自動的に使われる** — upload-code-site で作成されたサイトは EDM
4. **Standard Data Model のサイトでは `adx_sitesettings` / `adx_websites` テーブルを使用** — `mspp_` プレフィックスは EDM (powerpagecomponent) のみ
5. **サイト設定は `adx_sitesettings` に `adx_websiteid` をリンクして作成** — websiteId が異なると無視される
6. **`adx_website` レコードは EDM 2.0 でもランタイムに必須** — upload-code-site が初回に自動作成。削除禁止
7. **孤立レコードは `FetchSolutions` の NullRef を引き起こす** — ただし削除対象を間違えるとさらに悪化する
8. **デプロイ失敗時のリカバリは「再 upload-code-site」が最善** — 手動レコード操作はリスクが高い
9. **壊れたサイトは修復より新規作成が早い** — `.powerpages-site/` 削除 → `siteName` 変更 → upload-code-site で新サイト作成（下記手順参照）
10. **初回プロビジョニング後のコールドスタートには 2〜3 分かかる** — 最初の HTTP リクエストが 60 秒タイムアウトするのは正常。120秒タイムアウトで再試行すること

---

## 壊れたサイトのリカバリ手順（新規サイト再作成）

`adx_website` 削除や孤立レコードで修復不能になった場合、新しいサブドメインで作り直すのが最速:

```bash
# 1. 旧サイトバインディングを削除
cd portal
rm -rf .powerpages-site .powerpages-site-backup .paportal

# 2. powerpages.config.json の siteName を変更
#    例: "IncidentPortal" → "IncidentPortal02"

# 3. ビルド & アップロード（新サイト作成）
npm run build
pac pages upload-code-site --rootPath .

# 4. アクティブ化（PP API）
#    POST /powerpages/environments/{ENV_ID}/websites?api-version=2024-10-01
#    body: { websiteRecordId, subdomain, dataModel: "Enhanced", ... }

# 5. リスタート
#    POST .../websites/{id}/restart?api-version=2024-10-01

# 6. 2〜3分待ってアクセス確認
```

**ポイント:**
- `.powerpages-site/` を削除することで `upload-code-site` が「初回」として新サイトを作成する
- 旧サイトの `siteName` と異なる名前を使う（同名だと旧サイトに紐付く可能性）
- アクティブ化の `subdomain` も新しいものにする（旧サブドメインは DNS 的に残る）
- プロビジョニングは約 15 秒で完了するが、初回コールドスタートに 2〜3 分必要

---

## サブリファレンス

| リファレンス | 内容 |
|---|---|
| [認証リファレンス](references/authentication-reference.md) | 認証サービス・anti-forgery・Entra ID |
| [Enhanced Data Model テーブル権限](references/enhanced-data-model-permissions.md) | テーブル権限設定・自動化パターン |
| [Web API 実装パターン](references/web-api-implementation.md) | `/_api/` クライアント実装・CSRF・403 対処 |
| [デザインシステム](references/design-system.md) | カラートークン・コンポーネントパターン |
