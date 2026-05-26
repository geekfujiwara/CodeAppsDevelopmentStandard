# PUBLIC サイト SPA 認証パターン

> PRIVATE サイトでは SPA ロード時点で認証済みだが、**PUBLIC サイト**ではユーザーが SPA 内のログインボタンから能動的に認証フローを開始する。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│ PUBLIC Power Pages Site                                     │
│                                                             │
│  ┌──────────────┐      ┌──────────────────────────────┐    │
│  │ Web Template │      │ SPA (React + HashRouter)      │    │
│  │ (Liquid)     │      │                              │    │
│  │              │      │  未認証: ホーム + ログインBtn  │    │
│  │ {% if user %}│─────▶│  認証済: 全機能利用可能       │    │
│  │   __PP_USER__│      │                              │    │
│  │ {% endif %}  │      │  login() → form POST         │    │
│  │              │      │  logout() → /LogOff redirect │    │
│  │ {{ page. }}  │      └──────────────────────────────┘    │
│  └──────────────┘                                           │
└────────────────────────┬────────────────────────────────────┘
                         │ form POST
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ /Account/Login/ExternalLogin                                │
│   provider = Authority URL                                  │
│   __RequestVerificationToken = from /_layout/tokenhtml      │
│   returnUrl = /                                             │
└────────────────────────┬────────────────────────────────────┘
                         │ 302
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Microsoft Entra ID (login.microsoftonline.com)              │
│   → 認証完了 → callback → session cookie set → returnUrl    │
└─────────────────────────────────────────────────────────────┘
```

## PRIVATE vs PUBLIC サイト比較

| 項目 | PRIVATE | PUBLIC |
|------|---------|--------|
| ページアクセス | 認証必須 | 匿名でアクセス可 |
| SPA ロード時 | 必ず認証済み | 未認証の場合あり |
| ユーザー情報 | `window.__PP_USER__` は常に存在 | `{% if user %}` で条件出力 |
| ログインフロー | Platform が自動リダイレクト | SPA から form POST |
| `LoginButtonAuthenticationType` | 有効（自動リダイレクト） | 効かない場合あり（ホスト overlay の影響） |
| 推奨パターン | `use-auth.ts` + `redirect: 'manual'` | ExternalLogin form POST |

## 実装パターン

### 1. Web テンプレート（Liquid ユーザー注入）

```liquid
{% if user %}
<script>
window.__PP_USER__ = {
  userName: "{{ user.fullname | escape }}",
  firstName: "{{ user.firstname | escape }}",
  lastName: "{{ user.lastname | escape }}",
  email: "{{ user.emailaddress1 | escape }}",
  contactId: "{{ user.id }}",
  userRoles: ["Authenticated Users"]
};
</script>
{% endif %}
<div id="root"></div>
<script type="module" src="/assets/{hash}.js"></script>
```

> **重要**: `{{ user | json }}` は簡潔だが、出力に制御文字が含まれる場合がある。
> 個別フィールドを `| escape` 付きで出力するほうが安全。

### 2. authService.ts（SPA 側認証サービス）

```typescript
interface PowerPagesUser {
  userName: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  contactId?: string;
  userRoles?: string[];
}

declare global {
  interface Window {
    __PP_USER__?: PowerPagesUser;
  }
}

/**
 * ユーザー検出: Liquid 注入データを読み取る
 */
export function getCurrentUser(): PowerPagesUser | null {
  const user = window.__PP_USER__;
  if (user && user.userName) return user;
  return null;
}

/**
 * Anti-forgery トークン取得
 * Power Pages は /_layout/tokenhtml エンドポイントで提供
 */
async function fetchAntiForgeryToken(): Promise<string | null> {
  try {
    const res = await fetch("/_layout/tokenhtml");
    const html = await res.text();
    const match = html.match(/value="([^"]+)"/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * ログイン: ExternalLogin に form POST
 * LoginButtonAuthenticationType が効かない場合のフォールバック
 */
export async function login(returnUrl?: string): Promise<void> {
  const token = await fetchAntiForgeryToken();
  if (!token) {
    // フォールバック: 通常リダイレクト
    window.location.href = `/Account/Login?returnUrl=${encodeURIComponent(returnUrl ?? "/")}`;
    return;
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/Account/Login/ExternalLogin";

  const fields: Record<string, string> = {
    __RequestVerificationToken: token,
    provider: "https://login.windows.net/{tenant-id}/",  // ← Authority URL
    returnUrl: returnUrl ?? "/",
  };

  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

/**
 * ログアウト
 */
export function logout(): void {
  window.location.href = "/Account/Login/LogOff?returnUrl=/";
}
```

### 3. provider 値の特定方法

`provider` は Entra ID の Authority URL と完全一致が必要:

| パターン | Authority URL |
|----------|--------------|
| ビルトイン AzureAD | `https://login.windows.net/{tenant-id}/` |
| カスタム OpenIdConnect | `Authentication/OpenIdConnect/{name}/Authority` の値 |

> **`login.windows.net` ≠ `login.microsoftonline.com`** — 厳密一致が必須。
> 確認方法: `/_layout/tokenhtml` の同一ページにある hidden input の `provider` 値を参照。

### 4. LoginButtonAuthenticationType が効かない場合

| 原因 | 対策 |
|------|------|
| Power Pages ホスト overlay がキャッシュ | form POST で直接 ExternalLogin |
| サイト再起動未完了 | restart API → 60 秒待機 |
| 複数プロバイダー登録 | 不要なプロバイダーを無効化 |
| PUBLIC サイトで匿名アクセス | form POST が確実 |

## テンプレート上書き対策（post_upload_fix パターン）

### 問題

`pac pages upload-code-site` は毎回 Web テンプレートの `source` フィールドを上書きする。
Liquid ユーザー注入コードが消えてしまう。

### 解決: post_upload_fix.py

デプロイ後に Dataverse API でテンプレートを再パッチするスクリプト:

```python
"""Post-upload: verify page copy, re-patch template if needed, restart."""
import glob, os, json, requests

# アセットファイル名を自動検出
assets_dir = './portal/dist/assets'
js_name = os.path.basename(glob.glob(f'{assets_dir}/index-*.js')[0])
css_name = os.path.basename(glob.glob(f'{assets_dir}/index-*.css')[0])

# Liquid ユーザー注入 + SPA テンプレート
USER_SCRIPT = '{% if user %}<script>window.__PP_USER__={userName:"{{ user.fullname | escape }}",firstName:"{{ user.firstname | escape }}",lastName:"{{ user.lastname | escape }}",email:"{{ user.emailaddress1 | escape }}",contactId:"{{ user.id }}",userRoles:["Authenticated Users"]};</script>{% endif %}'

SPA_TEMPLATE = (
    '<link rel="stylesheet" href="/assets/' + css_name + '" />\n'
    + USER_SCRIPT + '\n'
    + '<div id="root"></div>\n'
    + '<script type="module" src="/assets/' + js_name + '"></script>'
)

# Dataverse PATCH でテンプレート復元
def patch_template(template_id: str, source: str):
    content = json.dumps({"source": source, "websiteid": WEBSITE_ID})
    r = requests.patch(
        f'{DATAVERSE_URL}/api/data/v9.2/powerpagecomponents({template_id})',
        headers=headers,
        json={"content": content}
    )
    assert r.status_code == 204

# アップロード後に毎回実行
patch_template(ENHANCED_TEMPLATE_ID, SPA_TEMPLATE)
patch_template(STANDARD_TEMPLATE_ID, SPA_TEMPLATE)
```

### デプロイパイプライン

```
npm run build:pages
  → dist-pages/ に出力

Copy dist-pages → portal/dist
  → portal/dist/index.html = '<div id="root"></div>' のみ

pac pages upload-code-site --rootPath ./portal --compiledPath ./dist
  ⚠️ テンプレートが上書きされる

python scripts/post_upload_fix.py
  → テンプレート再パッチ + サイト再起動
```

## サイト設定（PUBLIC サイト用）

| Site Setting | Value | 目的 |
|---|---|---|
| `Authentication/Registration/LocalLoginEnabled` | `false` | ローカルログイン無効 |
| `Authentication/Registration/ExternalLoginEnabled` | `true` | 外部 IdP 有効 |
| `Authentication/Registration/AzureADLoginEnabled` | `true` | ビルトイン Entra ID 有効 |
| `Authentication/Registration/LoginButtonAuthenticationType` | Authority URL | ログインページ自動リダイレクト（効く場合） |

## ブラウザ関連の既知問題（修正不可）

| エラー | 原因 | 対策 |
|--------|------|------|
| `Tracking Prevention blocked access to storage` | Edge/Safari のトラッキング防止 | 無視（機能に影響なし） |
| `$ is not defined` on login page | Power Pages の jQuery 未読込 | Platform 側の問題。form POST で回避 |
| Power Pages host overlay (`@microsoft/powerpages-host`) | Design Studio スクリプトの自動注入 | 制御不可。form POST で中間ページをバイパス |

## 教訓まとめ

1. **form POST が最も確実** — `LoginButtonAuthenticationType` より安定
2. **`/_layout/tokenhtml`** — Anti-forgery トークン取得エンドポイント
3. **Liquid `{% if user %}` で条件注入** — PUBLIC サイトでは未認証ユーザーもいる
4. **テンプレートは毎回上書きされる** — post_upload_fix パターン必須
5. **`returnUrl` にハッシュ(#)を含めない** — Power Pages が正しく処理しない
6. **provider 値は Authority URL と厳密一致** — `login.windows.net` ≠ `login.microsoftonline.com`
7. **サイト再起動後 60 秒待つ** — キャッシュ反映に時間がかかる
