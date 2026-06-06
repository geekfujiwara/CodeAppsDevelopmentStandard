# Power Pages トラブルシューティング

## よくあるエラーと解決策

### E001: `.powerpages-site` が見つからない

**エラー:**

```
Error: Could not find .powerpages-site file in the specified path.
```

**原因:** `--path` で指定したディレクトリに `.powerpages-site` マーカーファイルが存在しない。

**解決策:**

1. サイトディレクトリに `.powerpages-site` ファイルを作成する
2. `--path` の指定パスが正しいか確認する

```bash
# マーカーファイル作成
touch ./site/.powerpages-site
```

---

### E002: 認証プロファイルが未設定

**エラー:**

```
Error: No active authentication profile found.
```

**原因:** `pac auth list` にアクティブなプロファイルがない。

**解決策:**

```bash
# プロファイル作成
pac auth create --environment {ENVIRONMENT_ID}

# または既存プロファイルを選択
pac auth list
pac auth select --index 1
```

---

### E003: アップロード時のタイムアウト

**エラー:**

```
Error: Request timed out while uploading site files.
```

**原因:** サイトのファイルサイズが大きい、またはネットワーク接続が不安定。

**解決策:**

1. ビルド出力のサイズを確認（ソースマップ除外、未使用アセット削除）
2. ネットワーク接続を確認
3. リトライする

```bash
# ビルドサイズ確認
du -sh ./dist/

# ソースマップ除外確認（vite.config.ts）
# build: { sourcemap: false }
```

---

### E004: SPA ルーティングで 404

**症状:** 直接 URL アクセスや F5 リロードで 404 が返る。

**原因:** History API モードのルーティングを使用しており、サーバーサイドリライトが未設定。

**解決策:**

- Hash モードに切り替える（推奨）
- または Power Pages のカスタムエラーページで `index.html` にリダイレクト

```tsx
// React Router: Hash モードに変更
import { HashRouter } from "react-router-dom";
// BrowserRouter → HashRouter に変更
```

---

### E005: テーブル権限エラー（403 Forbidden）

**症状:** Power Pages サイトから Dataverse API を呼び出すと 403 が返る。

**原因:** テーブル権限が未設定、または Web ロールが割り当てられていない。

**解決策:**

1. テーブル権限レコードが正しく作成されているか確認
2. Web ロールにテーブル権限が紐付いているか確認
3. ユーザー（コンタクト）に Web ロールが割り当てられているか確認

```python
# テーブル権限の確認（auth_helper.py 使用）
from auth_helper import api_get

permissions = api_get(
    "adx_entitypermissions?$select=adx_entityname,adx_scope,adx_read,adx_write"
)
for p in permissions.get("value", []):
    print(f"  {p['adx_entityname']}: scope={p['adx_scope']}, read={p['adx_read']}")
```

---

### E005a: Enhanced Data Model で 403（管理者 OK / 一般ユーザー NG）

**症状:** 管理者ユーザーでは Web API が動作するが、一般ユーザーで 403 が返る。

**原因:** Enhanced Data Model (datamodelversion: 2.0) では `mspp_entitypermission_webrole` の N:N リレーションが Dataverse Web API で設定不可能（プラットフォームバグ）。管理者はテーブル権限をバイパスするため問題が顕在化しない。

**解決策:**

1. Power Pages Design Studio（make.powerpages.microsoft.com）で手動設定
2. セキュリティ → テーブルのアクセス許可 → 対象レコードを開く → ロールに Authenticated Users を追加
3. サイト再起動

> **注意:** `disableentitypermissions=true` は Enhanced Data Model で無効。API での $ref POST は 204 を返すが永続化しない。

**詳細:** [Enhanced Data Model テーブル権限リファレンス](enhanced-data-model-permissions.md)

---

### E006: CORS エラー

**症状:** ブラウザコンソールに CORS エラーが表示される。

**原因:** Power Pages サイトから外部 API を呼び出す際に CORS ヘッダーが不足。

**解決策:**

- Dataverse Web API は Power Pages ドメインからのアクセスを許可済み（追加設定不要）
- 外部 API の場合は、API 側で Power Pages ドメインを許可する
- またはサーバーサイドプロキシとして Power Automate フローを経由する

---

### E007: ビルド成果物の `base` パス不正

**症状:** CSS/JS が読み込まれない（404）、画像が表示されない。

**原因:** ビルド設定の `base` が絶対パス（`/`）になっている。

**解決策:**

```ts
// vite.config.ts
export default defineConfig({
  base: "./", // 相対パスに変更
});
```

```json
// angular.json
"baseHref": "./"
```

---

### E008: pac CLI バージョン不整合

**症状:** `pac pages` コマンドが認識されない。

**原因:** pac CLI のバージョンが古く `pages` サブコマンドが未対応。

**解決策:**

```bash
# pac CLI を最新に更新
npm install -g @microsoft/power-apps-cli@latest

# バージョン確認
pac --version
```

---

## デバッグのヒント

### ログ出力の有効化

```bash
# pac コマンドの詳細ログ
pac pages upload-code-site --path ./dist --verbose
```

### SPA 側デバッグログ（初回デプロイ時は必ず含める）

初回デプロイ〜安定動作確認まで、API クライアントに以下のログを含めること。
安定後に `console.log` を削除 or `if(import.meta.env.DEV)` 条件付きに変更する。

```typescript
// lib/api.ts — デバッグログ付き fetch ラッパー
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `/_api/${path}`;
  console.log(`[API] ${init?.method ?? "GET"} ${url}`);

  const res = await fetch(url, {
    ...init,
    redirect: "manual",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      ...init?.headers,
    },
  });

  if (res.type === "opaqueredirect" || res.status === 0) {
    console.warn("[API] Opaque redirect — session expired or unauthenticated");
    throw new Error("AUTH_REQUIRED");
  }

  if (res.status === 401 || res.status === 403) {
    const body = await res.text();
    console.error(`[API] Auth error ${res.status}:`, body);
    throw new Error("AUTH_REQUIRED");
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(`[API] Error ${res.status}:`, body);
    throw new Error(`API ${res.status}: ${body}`);
  }

  console.log(`[API] ✓ ${res.status} ${url}`);
  return res.status === 204 ? (undefined as T) : res.json();
}
```

### 認証状態デバッグ

```typescript
// main.tsx or App.tsx のマウント直後
console.log("[Auth] window.__PP_USER__:", window.__PP_USER__);
console.log(
  "[Auth] contactId:",
  window.__PP_USER__?.contactId ?? "NONE (anonymous)",
);
```

### デプロイ後の即時確認コマンド（ブラウザ DevTools Console）

```javascript
// 1. 認証状態
console.table(window.__PP_USER__);

// 2. API アクセス
fetch("/_api/{entity_set}", {
  redirect: "manual",
  headers: {
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
  },
})
  .then((r) => console.log(r.status, r.type))
  .catch((e) => console.error(e));

// 3. Anti-forgery token
fetch("/_layout/tokenhtml")
  .then((r) => r.text())
  .then((h) => console.log(h.match(/value="([^"]+)"/)?.[1]));
```

### ローカルでの動作確認

アップロード前にローカルで静的ファイルの動作を確認する:

```bash
# npx serve で静的ファイルを配信
npx serve ./dist

# ブラウザで http://localhost:3000 を確認
```

### ネットワークリクエストの確認

ブラウザの DevTools > Network タブで:

- 静的アセットの読み込み状態（200 / 404）
- API 呼び出しのレスポンス（403 / CORS）
- リダイレクトの挙動

---

## Power Platform API 関連のエラー

### E009: PortalFileContentUploadFailed（.js ブロック）

**症状:** `pac pages upload-code-site` が途中で停止し `PortalFileContentUploadFailed` エラー。

**原因:** Dataverse organization の `blockedattachments` に `.js` が含まれている。

**確認方法:**

```bash
python .github/skills/power-pages/scripts/unblock_js.py --check
```

**解決策:**

```bash
python .github/skills/power-pages/scripts/unblock_js.py
```

---

### E010: DNS 未解決（ポータルデプロビジョン済み）

**症状:** `nslookup {subdomain}.powerappsportals.com` が NXDOMAIN。サイトに一切アクセスできない。

**原因:** ポータルインフラが完全にデプロビジョンされている。トライアル期限切れや管理者による停止後に発生。

**解決策:**

1. 管理画面で状態確認:
   ```
   https://make.powerpages.microsoft.com/environments/{ENV_ID}/portals/home
   ```
2. 管理画面から「開始」可能であれば開始
3. サイトが存在しない場合は再作成:
   ```bash
   python .github/skills/power-pages/scripts/manage_portal.py --action create --name "サイト名" --subdomain "サブドメイン"
   ```

> **注意**: プロビジョニングには日本リージョンで 10〜20 分かかる。

---

### E011: pac pages provision-website コマンドが存在しない

**症状:** `pac pages provision-website` で「unknown command」エラー。

**原因:** PAC CLI 2.7.x にはこのコマンドが未実装。

**代替手段:**

- Power Platform API の Create Website エンドポイント（`manage_portal.py --action create`）
- Power Pages 管理画面での手動プロビジョニング

---

### E012: Power Platform API で "Website does not exist"

**症状:** API 呼び出しで「Website does not exist in this environment」。

**原因:** レガシーポータル（Power Pages サービス移行前に作成）は Power Platform API に登録されていない。API の `websites` 一覧に表示されない。

**解決策:**

- 既存のレガシーポータルを利用する場合: 管理画面で操作する
- API で管理したい場合: 新しいポータルを Create Website API で作成する
- Dataverse の `adx_website` テーブルにレコードがあっても、それが API 管理対象とは限らない

---

### E013: Site settings が毎回リセットされる

**症状:** Dataverse で設定した site settings がデプロイ後に元の値に戻る。

**原因:** `pac pages upload-code-site` は **毎回** `.powerpages-site/site-settings/*.sitesetting.yml` の値で Dataverse を上書きする。

**解決策:**

1. YAML ファイルの `value:` フィールドを正しい値に更新する
2. 同時に Dataverse も PATCH で更新する（即時反映用）
3. 以降は YAML ファイルを設定の正として管理する

```yaml
# 正しい YAML 例:
id: { guid }
name: Authentication/Registration/LoginButtonAuthenticationType
value: "https://login.microsoftonline.com/{tenant-id}/"
```

> **注意**: `value` フィールドが存在しない YAML ファイルは、upload 時に Dataverse の値を null にリセットする。

---

### E014: "Sign in failed" （カスタム OpenIdConnect）

**症状:** ログインボタンクリック後、Azure AD で認証完了 → Power Pages に戻る → "Sign in failed" エラー。

**原因:** カスタム OpenIdConnect プロバイダー（response_type=id_token）使用時、ブラウザのトラッキング防止機能が nonce 検証用 Cookie をブロックする。

**解決策（優先順）:**

1. **ビルトインプロバイダーに切り替え**: `AzureADLoginEnabled=true`（response_type=code id_token で堅牢）
2. **Nonce 無効化**: `Authentication/OpenIdConnect/{name}/Nonce` = `false`
3. **LoginButtonAuthenticationType 設定**: platform 内部のリダイレクト機構を使用

---

### E015: SPA fetch で 500 Internal Server Error（LoginButtonAuthenticationType 設定時）

**症状:** LoginButtonAuthenticationType を設定後、SPA の API コールが 500 エラーを返す。

**原因:** 未認証時の fetch が 302 リダイレクトチェーンを follow → ExternalLogin に GET リクエスト → 500。

**解決策:**

```typescript
// 全 fetch に redirect: 'manual' を付与
const res = await fetch("/_api/incidents", {
  redirect: "manual", // ← これが必須
  headers: { Accept: "application/json" },
});

// opaqueredirect (status=0) を検知してログインページへ
if (res.type === "opaqueredirect" || res.status === 0) {
  window.location.href = "/Account/Login";
}
```

---

### E016: 白紙ページ（デプロイ後に何も表示されない）

**症状:** デプロイ後にサイトが白紙。HTML ソースを見ると空の `<body>` のみ。

**原因（複数の可能性）:**

1. Website の default language が未設定 → Root ページの mspp_copy が表示される（Content ページではなく）
2. mspp_copy が `<!doctype html>...` の full HTML になっている（ネスト問題）
3. Root ページと Content ページの両方が修正されていない

**解決策:**

1. Phase 3.6 で **Root ページ AND Content ページ** の mspp_copy を body-only に修正
2. body-only: `<div id="root"></div><script ...></script><link ...>`

---

### E017: Web API 404（/\_api/ エンドポイント）

**症状:** `/_api/{entity}` にアクセスすると 404。

**原因:** Web API 有効化に必要な4要素のいずれかが欠けている。

**チェックリスト:**

| #   | 要素                                                   | 確認方法                              |
| --- | ------------------------------------------------------ | ------------------------------------- |
| 1   | Site Setting `Webapi/{table}/enabled` = true           | Dataverse mspp_sitesettings テーブル  |
| 2   | Site Setting `Webapi/{table}/fields` = \* or 列リスト  | 同上                                  |
| 3   | Table Permission (Global scope, CRUD)                  | adx_entitypermission テーブル         |
| 4   | Web Role Link (Table Permission → Authenticated Users) | adx_entitypermission_webrole テーブル |

> 全て設定後、サイト再起動が必要。

---

### E018: 重複ログインボタン

**症状:** ログインページに同じプロバイダーのボタンが2つ表示される。

**原因:** ビルトイン Azure AD プロバイダー + カスタム OpenIdConnect が両方有効。

**解決策:**

```yaml
# .powerpages-site/site-settings/Authentication-Registration-AzureADLoginEnabled.sitesetting.yml
id: { guid }
name: Authentication/Registration/AzureADLoginEnabled
value: "false"
```
