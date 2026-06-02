# Power Pages SPA デプロイ教訓集 — 認証・データソース・LP 設計

> **対象**: 初回デプロイからデータアクセス確認まで。
> M365 Incident Portal (PUBLIC サイト + SSO + Web API) プロジェクトの実体験ベース。
> **参考実装**: incidentPage — Surface PC サポートポータル

---

## TL;DR — デプロイから安定稼働までのクリティカルパス

```
1. デプロイ (deploy_site.py)
2. Identity Provider 有効化 (手動: make.powerpages.microsoft.com)
3. LoginButtonAuthenticationType 設定 (→自動リダイレクト)
4. Site Settings: Webapi/{table}/enabled + fields
5. Table Permission: powerpagecomponent type=18
6. Web Role リンク: powerpagecomponent_powerpagecomponent N:N ← ★最重要発見
7. Site Restart
8. 一般ユーザーでテスト（管理者ではバイパスされる）
```

---

## 1. LP（ランディングページ）設計パターン

### PUBLIC サイトの LP 要件

| 要素 | 未認証時 | 認証済み |
|------|----------|----------|
| Hero セクション | 表示（「ダッシュボードを見る」+「機能を見る」） | 表示（同ボタンで直接遷移） |
| 機能カード一覧 | **常に表示**（クリック→ログインモーダル） | 常に表示（リンク先に遷移可） |
| ハイライトカード | **常に表示**（価値提案・情報のみ） | 常に表示 |
| ナビゲーション | ログインボタン | ログアウトボタン + 機能メニュー |
| 保護ページへのリンク | クリック→ログインモーダル表示 | 直接遷移 |

### ★ 推奨: ログインモーダルパターン（最新）

**やってはいけない**: 「ログインして利用開始」ボタンのみのLP。ユーザーにとって機能が見えず離脱率が上がる。

**推奨パターン**:
1. Hero CTA は「ダッシュボードを見る」+「機能を見る」（ログイン文言を出さない）
2. 機能カードは常に表示し、クリック可能にする
3. 未認証でクリック時は**モーダル**で「ログインしますか？」を表示
4. モーダルには「キャンセル」と「ログイン」の2択を提示

```tsx
// ★ 推奨実装: ログインモーダル付き LP
import { useState } from "react";

function isAuthenticated() {
  const ppUser = window.__PP_USER__;
  return !!(ppUser && ppUser.contactId);
}

export default function HomePage() {
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);

  // 未認証→モーダル表示、認証済み→直接遷移
  const handleNavigate = (path: string) => {
    if (isAuthenticated()) {
      navigate(path);
    } else {
      setShowLoginModal(true);
    }
  };

  return (
    <div>
      {/* ログインモーダル */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50"
               onClick={() => setShowLoginModal(false)} />
          <div className="relative bg-card border rounded-xl shadow-2xl p-8 max-w-sm w-full mx-4 space-y-4">
            <h2 className="text-xl font-bold text-center">ログインしますか？</h2>
            <p className="text-sm text-muted-foreground text-center">
              この機能を利用するにはログインが必要です。
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1"
                      onClick={() => setShowLoginModal(false)}>キャンセル</Button>
              <Button className="flex-1" onClick={() => login()}>ログイン</Button>
            </div>
          </div>
        </div>
      )}

      {/* Hero: ログイン文言ではなく機能訴求のCTA */}
      <Button size="lg" onClick={() => handleNavigate("/dashboard")}>
        ダッシュボードを見る <ArrowRight />
      </Button>
      <Button variant="outline" size="lg"
              onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}>
        機能を見る
      </Button>

      {/* 機能カード: 常に表示・クリックで handleNavigate */}
      <FeatureCard title="サービス稼働状況" path="/services" onNavigate={handleNavigate} />
    </div>
  );
}
```

### LP 設計の教訓まとめ

| # | 教訓 | 理由 |
|---|------|------|
| L1 | LP のメインCTAに「ログイン」を入れない | 機能訴求が弱くなり離脱率が上がる |
| L2 | 機能カードは常に表示する | ログイン前に何ができるか伝えることが重要 |
| L3 | 未認証クリック→モーダルで確認 | ページ遷移→RequireAuth画面より UX が良い |
| L4 | モーダルに「キャンセル」を必ず用意 | ユーザーが LP を引き続き閲覧できるように |
| L5 | `window.__PP_USER__` で即座に判定 | API fetch による判定は遅延が生じ UX 低下 |
| L6 | ハイライトカードは情報のみ（クリック不要） | 価値提案は認証不要で見せる |

### LP の認証状態判定

```typescript
// window.__PP_USER__ の有無で判定（Liquid 注入済みなら存在）
function isAuthenticated() {
  return !!(window.__PP_USER__ && window.__PP_USER__.contactId);
}
```

**やってはいけない**: API を叩いて認証状態を判定する（遅い、エラーハンドリングが複雑）

---

## 2. ログインメニュー設計

### ヘッダーのログイン/ログアウトトグル（参考実装パターン）

```tsx
// site-header.tsx
{isAuthenticated ? (
  <>
    <span className="text-sm text-muted-foreground">{user?.fullName}</span>
    <Button variant="ghost" size="sm" onClick={logout}>
      <LogOut className="h-4 w-4" /> ログアウト
    </Button>
  </>
) : (
  <Button onClick={login}>
    <LogIn className="h-4 w-4" /> ログイン
  </Button>
)}
```

### ナビゲーション: 認証時のみ表示

```tsx
// 認証済みの場合のみナビリンクを表示
{isAuthenticated && (
  <nav className="hidden md:flex items-center gap-1">
    {navItems.map(item => <NavLink key={item.path} {...item} />)}
  </nav>
)}
```

### form POST ログイン（PUBLIC サイトのフォールバック）

```typescript
export async function login(returnUrl = "/"): Promise<void> {
  const res = await fetch("/_layout/tokenhtml");
  const html = await res.text();
  const token = html.match(/value="([^"]+)"/)?.[1];

  if (!token) {
    window.location.href = `/Account/Login?returnUrl=${encodeURIComponent(returnUrl)}`;
    return;
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/Account/Login/ExternalLogin";
  form.innerHTML = `
    <input type="hidden" name="__RequestVerificationToken" value="${token}" />
    <input type="hidden" name="provider" value="https://login.windows.net/{TENANT_ID}/" />
    <input type="hidden" name="returnUrl" value="${returnUrl}" />
  `;
  document.body.appendChild(form);
  form.submit();
}
```

### 教訓: provider 値の厳密一致

| ❌ 失敗 | ✅ 成功 |
|---------|---------|
| `https://login.microsoftonline.com/{tenant}/` | `https://login.windows.net/{tenant}/` |
| `https://login.windows.net/{tenant}` (末尾/なし) | `https://login.windows.net/{tenant}/` |

---

## 3. 認証フロー教訓

| # | 教訓 | 症状 | 解決 |
|---|------|------|------|
| A1 | LoginButtonAuthenticationType で自動リダイレクト | ログインページが一瞬見える | Authority URL を設定 |
| A2 | ProfileRedirectEnabled=false | ログイン後 /profile に飛ばされる | false に設定 |
| A3 | LocalLoginEnabled=false | ローカルログインフォームが表示 | false に設定 |
| A4 | 複数プロバイダーは厳禁 | ボタン2つ / 認証ループ | OpenAuth YAML 削除 + 1つだけ残す |
| A5 | YAML に value がないと空で上書き | デプロイ後に設定消える | YAML に正しい値を書く |
| A6 | ExternalLogin は POST 専用 | GET でアクセスすると 500 | form POST or LoginButtonAuthenticationType |
| A7 | form POST の provider 厳密一致 | 401 Unauthorized | Authority URL をそのまま使う |
| A8 | redirect: 'manual' 必須 | 302 チェーンで 500 | 全 fetch に設定 |
| A9 | opaqueredirect = 未認証 | status=0 で原因不明 | type === "opaqueredirect" をチェック |
| A10 | リダイレクトループ防止 | ログイン→API 403→ログイン→...無限 | sessionStorage タイムスタンプで10秒ガード |

---

## 4. データソース (Web API) 教訓

| # | 教訓 | 症状 | 解決 |
|---|------|------|------|
| D1 | Site Settings 必須 (`enabled` + `fields`) | 404 Not Found | 両方設定 |
| D2 | Table Permission 必須 | 403 Forbidden (一般ユーザー) | powerpagecomponent type=18 |
| D3 | Web Role リンク必須 | 403 "You don't have permission" | `powerpagecomponent_powerpagecomponent` N:N |
| D4 | `mspp_entitypermission_webrole` は不可 | 204返るが永続化しない | ↑の自己参照N:Nを使う |
| D5 | `$expand` 非対応 | 400 Bad Request | lookup は `_xxx_value` で取得 |
| D6 | **管理者バイパスは信用しない** | **管理者でも 403** | **全ユーザーに Authenticated Users リンク必須** |
| D7 | `disableentitypermissions` 無効 | Enhanced Model では無視 | 正規ルートで権限設定 |
| D8 | Site Restart 必須 | 設定変更が反映されない | restart API |
| D9 | エンティティセット名は複数形 | 404 Entity not found | `geek_m365services` (末尾s) |
| D10 | CSRF トークン不要（GET） | 不要な複雑化 | GET はトークン不要、POST/PATCH/DELETE で必要 |
| D11 | **デプロイ時に権限リンクを自動化** | 手動だと忘れる | deploy_site.py Phase 4.5 で自動紐づけ |

> **⚠️ D6 重要修正**: ドキュメントでは「System Administrator はバイパスする」とされるが、
> **EDM では管理者であってもポータル上では contact として認証され Web ロール経由でしか権限が評価されない**。
> 管理者アカウントで 403 になる原因はこれ。**全てのテーブル権限を Authenticated Users に紐づけることが MUST**。
> `deploy_site.py` の Phase 4.5 / `predeploy_check.py` のチェック 6 で自動化済み。

### ★ powerpagecomponent_powerpagecomponent 自己参照 N:N（最重要発見）

Enhanced Data Model では Table Permission (type=18) も Web Role (type=11) も同じ `powerpagecomponent` テーブル内。
従来の `mspp_entitypermission_webrole/$ref` は 204 を返すが**永続化しない**（プラットフォームバグ）。

**唯一の正解:**
```python
# powerpagecomponent 自己参照 N:N
url = f"{DV}/api/data/v9.2/powerpagecomponents({perm_ppc_id})/powerpagecomponent_powerpagecomponent/$ref"
body = {"@odata.id": f"{DV}/api/data/v9.2/powerpagecomponents({role_ppc_id})"}
r = requests.post(url, json=body, headers=headers)
# 204 & intersect テーブルに永続化される
```

---

## 5. ログ出力ガイドライン

### 初回デプロイ時に必ず含めるログ

| カテゴリ | ログ内容 | console メソッド |
|----------|----------|-----------------|
| Auth | `window.__PP_USER__` の有無・内容 | `console.log` |
| API Request | リクエスト URL + メソッド | `console.log` |
| API Success | ステータスコード + URL | `console.log` |
| API Auth Error | ステータスコード + レスポンスボディ | `console.error` |
| Opaque Redirect | 検知 | `console.warn` |

### 参考実装（incidentPage）のログパターン

```typescript
// handleResponse 内で API エラーを一律ログ
if (!res.ok) {
  const text = await res.text();
  console.error(`[API] ${url} → ${res.status}`, text);
}
```

### mspp_copy への診断ログ注入（deploy_portal.py の Phase 3.6）

```javascript
// ビルド時刻・アセット名・ユーザー情報をコンソール出力
console.log("[SPA] Build:", __BUILD_TIME__);
console.log("[SPA] User:", window.__PP_USER__ || "anonymous");
window.addEventListener("error", function(e) {
  console.error("[SPA] Script error:", e.message, e.filename, e.lineno);
});
```

### 本番リリース前

```typescript
if (import.meta.env.DEV) {
  console.log(`[API] ${method} ${url}`);
}
```

---

## 6. デプロイ直後のチェックリスト

| # | チェック | DevTools Console コマンド | 期待結果 |
|---|---------|--------------------------|----------|
| 1 | SPA レンダリング | — | LP が表示 |
| 2 | 認証状態 | `window.__PP_USER__` | オブジェクト or undefined |
| 3 | API アクセス | `fetch("/_api/{table}",{redirect:"manual",headers:{Accept:"application/json","OData-MaxVersion":"4.0","OData-Version":"4.0"}}).then(r=>console.log(r.status))` | 200 |
| 4 | Anti-forgery | `fetch("/_layout/tokenhtml").then(r=>r.text()).then(h=>console.log(h.match(/value="([^"]+)"/)?.[1]))` | トークン文字列 |

---

## 7. 403 Forbidden 診断フローチャート

```
/_api/{table} → 403
  │
  ├─ 管理者でも 403?
  │   └─ YES → Site Settings 未設定 (Webapi/{table}/enabled)
  │
  ├─ 管理者は OK、一般ユーザーは 403?
  │   ├─ Table Permission 存在する?
  │   │   └─ NO → powerpagecomponent type=18 作成
  │   └─ Table Permission ある
  │       ├─ Web Role リンク済み?
  │       │   └─ NO → powerpagecomponent_powerpagecomponent N:N で紐付け
  │       └─ リンク済みだが 403
  │           └─ Site Restart した? → restart API 実行
  │
  └─ どちらも 403
      └─ サイト URL が正しいか確認
```

---

## 8. incidentPage から学んだ改善ポイント

| # | 参考実装の工夫 | 本スキルへの反映 |
|---|---------------|-----------------|
| 1 | `shouldRedirectToLogin()` — 10秒ガードでリダイレクトループ防止 | Web API クライアントテンプレートに標準搭載 |
| 2 | `useAuth` hook — loading state 付き | PUBLIC サイト認証フックに反映 |
| 3 | `RequireAuth` — 認証ゲートコンポーネント | ルート設計パターンに標準化 |
| 4 | LP Feature Cards — `disabled` prop | LP 設計パターンに文書化 |
| 5 | `phase_fix_page_copy` — 診断ログ注入 | deploy_site.py Phase 4 に組み込み |
| 6 | `post_upload_fix.py` — Web Template 自動復元 | Post-Upload Fix 標準手順に統合 |
| 7 | `lazy()` + `Suspense` — ページ遅延ロード | `inlineDynamicImports: true` で不要（単一バンドル）だが構造参考 |
| 8 | ナビ表示の認証ゲート — 未認証時はメニュー非表示 | site-header パターンに反映 |

---

## 9. 失敗した N:N アプローチ（時間を無駄にしないために）

以下は**すべて失敗する**。試さないこと:

```python
# ❌ mspp_entitypermission_webrole/$ref — 204 返るが永続化しない
url = f"{DV}/api/data/v9.2/mspp_entitypermissions({id})/mspp_entitypermission_webrole/$ref"

# ❌ powerpagecomponent content JSON に webroles を書く — N:N は作成されない
content = json.dumps({..., "webroles": [{"id": role_id}]})

# ❌ mspp_webrole 側から $ref — 同様に永続化しない
url = f"{DV}/api/data/v9.2/mspp_webroles({id})/mspp_entitypermission_webrole/$ref"

# ❌ Deep Insert — NullReferenceException
body = {"name": "...", "mspp_entitypermission_webrole": [{"@odata.id": "..."}]}
```
