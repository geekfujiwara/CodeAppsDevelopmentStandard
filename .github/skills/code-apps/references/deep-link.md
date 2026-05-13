# ディープリンクパターン — Code Apps へのパラメータ渡し

## 概要

Code Apps は Power Apps の cross-origin iframe 内で動作するため、
親ウィンドウの URL パラメータに直接アクセスすることはできない。

**Code Apps SDK の `getContext().app.queryParams` を使うことで、
Power Apps play URL のクエリパラメータを iframe 内から安全に読み取れる。**

参考: [Diana Birkelbach - How to make Deep Links with Code Apps](https://dianabirkelbach.wordpress.com/2026/02/28/how-to-make-deep-links-with-code-apps-and-call-them-from-model-driven-apps/)

## 仕組み

```
┌─ ブラウザ ──────────────────────────────────────────┐
│                                                      │
│  apps.powerapps.com/play/e/{envId}/app/{appId}       │
│    ?tenantId=xxx                                     │
│    &Bookingid=yyy    ← クエリパラメータ              │
│                                                      │
│  ┌─ iframe (cross-origin) ────────────────────────┐  │
│  │                                                 │  │
│  │  Code Apps (powerplatformusercontent.com)        │  │
│  │                                                 │  │
│  │  ❌ window.location.search  → 空               │  │
│  │  ❌ window.parent.location  → SecurityError     │  │
│  │  ❌ document.referrer       → origin のみ       │  │
│  │  ❌ CSP で解決不可          → Same-Origin Policy │  │
│  │                                                 │  │
│  │  ✅ getContext().app.queryParams → {             │  │
│  │       "Bookingid": "yyy",                       │  │
│  │       "tenantId": "xxx"                         │  │
│  │     }                                           │  │
│  │     → SDK が postMessage 経由で親の情報を橋渡し  │  │
│  └─────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## 実装パターン

### 1. ルーターでの自動遷移（推奨）

ルートの index（`/`）で SDK からクエリパラメータを読み取り、
対象ページに `Navigate` する。

```typescript
import { createBrowserRouter, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";

// ディープリンク: Code Apps SDK の getContext().app.queryParams で
// 親 URL のクエリパラメータを取得して内部ルートに遷移
function DeepLinkRedirect() {
  const [target, setTarget] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getContext } = await import("@microsoft/power-apps/app");
        const ctx = await getContext();
        const params = ctx?.app?.queryParams;
        console.log("[DeepLink] queryParams:", JSON.stringify(params));

        // パラメータ名は大文字小文字の揺れに対応
        const bookingId =
          params?.["Bookingid"] ?? params?.["bookingid"] ?? params?.["bookingId"];
        if (bookingId && !cancelled) {
          console.log("[DeepLink] → navigating to /bookings/" + bookingId);
          setTarget(`/bookings/${bookingId}`);
        }
      } catch (e) {
        console.log("[DeepLink] getContext failed (local dev?):", e);
      }
      if (!cancelled) setChecked(true);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!checked) return null; // SDK 応答待ち
  if (target) return <Navigate to={target} replace />;
  return <Navigate to="/dashboard" replace />;
}

// ルーター定義
export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <Layout />,
      children: [
        { index: true, element: <DeepLinkRedirect /> },
        { path: "dashboard", element: <DashboardPage /> },
        { path: "bookings/:id", element: <BookingDetailPage /> },
        // ...
      ],
    },
  ],
  { basename: BASENAME },
);
```

### 2. 任意のページでの useEffect パターン

特定ページ（Welcome ページ等）でパラメータを読み取って遷移する場合:

```typescript
import { getContext } from "@microsoft/power-apps/app";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export function WelcomePage() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const ctx = await getContext();
        const params = ctx.app.queryParams;
        const recordId = params["id"] ?? params["recordId"];
        if (recordId) {
          navigate(`/records/${recordId}`);
        }
      } catch (error) {
        console.error("Error reading queryParams:", error);
      }
    })();
  }, [navigate]);

  return <div>...</div>;
}
```

## 呼び出し元の URL 構成

### Power Automate フローから（Teams 通知等）

```
https://apps.powerapps.com/play/e/{ENV_ID}/app/{APP_ID}
  ?tenantId={TENANT_ID}
  &Bookingid=@{triggerOutputs()?['body/bookableresourcebookingid']}
```

フロー定義の HTML リンク:
```html
<a href="https://apps.powerapps.com/play/e/{ENV_ID}/app/{APP_ID}?tenantId={TENANT_ID}&amp;Bookingid=@{triggerOutputs()?['body/bookableresourcebookingid']}">
  アプリで開く
</a>
```

### MDA フォームの JavaScript ボタンから

```javascript
const APP_ID = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
const { organizationSettings } = Xrm.Utility.getGlobalContext();
const envId = organizationSettings.bapEnvironmentId;
const recordId = Xrm.Page.data.entity.getId().replace(/[{}]/g, "");

const url = `https://apps.powerapps.com/play/e/${envId}/app/${APP_ID}?id=${recordId}`;
Xrm.Navigation.openUrl(url);
```

## NG パターン（動作しないアプローチ）

```
❌ window.location.search
   → iframe 独自の URL が返る。親 URL のパラメータは含まれない

❌ window.location.hash
   → 同上。iframe 内のハッシュのみ

❌ window.parent.location
   → cross-origin（apps.powerapps.com ↔ powerplatformusercontent.com）で
     SecurityError: Blocked a frame with origin ... from accessing a cross-origin frame

❌ document.referrer
   → "https://apps.powerapps.com/" のみ。パスやパラメータは含まれない

❌ CSP ディレクティブで解決
   → CSP は connect-src / script-src 等を制御するもの。
     Same-Origin Policy はブラウザの根本的なセキュリティ機構であり、
     CSP とは別のレイヤー。CSP で cross-origin iframe のアクセスは許可できない

❌ URL パスに /records/{id} を追加
   → Power Apps ホストが不明なパスとしてホワイトページを返す。
     Code Apps iframe にルートが到達しない

✅ getContext().app.queryParams が唯一の正解
   → SDK が postMessage 経由で親フレームの情報を安全に橋渡しする
```

## 注意事項

### AppId は環境間で変わる

Code Apps の AppId はソリューションの環境間移行時に変更される（by design）。
ハードコードすると移行先で動かなくなる。

**対策**: 環境変数（Environment Variable）に AppId を格納し、動的に取得する。

### queryParams のキー名は大文字小文字を区別する

`ctx.app.queryParams` のキーは、URL に指定した通りの大文字小文字で格納される。
`?Bookingid=xxx` と `?bookingid=xxx` では異なるキーになる。

**対策**: 複数のケースに対応する
```typescript
const id = params?.["Bookingid"] ?? params?.["bookingid"] ?? params?.["bookingId"];
```

### ローカル開発時は getContext が失敗する

`npm run dev` でローカル起動した場合、SDK コンテキストが取得できないことがある。
`try/catch` で囲み、失敗時はデフォルトページに遷移するようにする。

### 検証済み: 2026-05-13

- Power Apps play URL に `?Bookingid={GUID}` を付けて Code Apps を開く
- `getContext().app.queryParams` で `Bookingid` が正しく取得できる
- react-router-dom の `Navigate` で予約詳細ページに自動遷移する
