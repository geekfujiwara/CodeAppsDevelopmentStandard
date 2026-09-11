---
name: csp
description: "Code Apps のコンテンツセキュリティポリシー（CSP）を構成する。iframe 埋め込み（Google Maps 等）・外部 API 接続・外部フォント/スクリプト読み込み時に CSP ディレクティブを追加する。"
category: security
triggers:
  - "iframe"
  - "embed"
  - "埋め込み"
  - "地図"
  - "Google Maps"
  - "マップ"
  - "CSP"
  - "Content Security Policy"
  - "frame-src"
  - "connect-src"
  - "frame blocked"
  - "フレームブロック"
  - "Refused to frame"
  - "外部 API"
  - "外部スクリプト"
  - "PDF"
  - "添付ファイル"
  - "ファイルプレビュー"
  - "blob:"
  - "クリップボード"
---

# Code Apps CSP 構成スキル

Code Apps で **iframe 埋め込み**・**外部 API 呼び出し**・**外部リソース読み込み** を行う場合、
CSP（Content Security Policy）ディレクティブの追加が必要。
設定なしでは `Refused to frame` エラーでブロックされる。

> **参考**: https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/how-to/content-security-policy

## ホストごとに CSP の効き方が違う（取り違え注意）

**このドキュメントの内容を他ホストにそのまま適用してはいけない。**

| ホスト | CSP の既定 | `frame-src` の追加 |
|---|---|---|
| **Code Apps**（本ドキュメントの対象） | プラットフォームが `frame-src 'self'` を**強制**（無効化不可） | **必須** |
| **Generative Pages / モデル駆動型アプリ** | CSP は**オプトイン**。`iscontentsecuritypolicyenabled` の既定は `false` | **不要**（既定のまま埋め込める） |

モデル駆動側で CSP を有効化している環境だけは `Frame-Src` の追加が必要で、かつ `Frame-Src` は
**Strict CSP を有効にしたときだけ効く**（`Frame-Ancestor` のみ既定モードで設定可）。
地図を出すためだけに環境全体の CSP を有効化してはいけない。
→ ホスト共通の地図実装は [地図埋め込みパターン](../../standard/references/map-embed-pattern.md)。

## デフォルト CSP ディレクティブ

Code Apps は以下のデフォルト CSP で動作する:

| ディレクティブ | デフォルト値 | 用途 |
|---|---|---|
| `frame-src` | `'self'` | **iframe で読み込める外部サイト** |
| `connect-src` | `'none'` | **fetch/XHR で接続できる外部 API** |
| `script-src` | `'self' <platform>` | 外部 JS スクリプト |
| `img-src` | `'self' data: <platform>` | 外部画像 |
| `style-src` | `'self' 'unsafe-inline'` | 外部 CSS |
| `font-src` | `'self'` | 外部フォント |
| `frame-ancestors` | `'self' https://*.powerapps.com` | Code Apps を iframe に埋め込むホスト |
| `media-src` | `'self' data:` | 動画・音声 |
| `default-src` | `'self'` | 上記以外のデフォルト |

> **重要**: カスタム値はデフォルト値に**マージ**される。デフォルト値が `'none'` の場合はカスタム値で**置換**される。

## CSP 安全な SDK メソッド一覧

Code Apps iframe は `connect-src: 'none'` のため、**postMessage ベースの SDK メソッドのみ使用可能**。直接 `fetch` や `executeAsync`（fetch ベース）は CSP でブロックされる。

| メソッド | 安全 | 備考 |
|---|---|---|
| `retrieveMultipleRecordsAsync` | ✅ | 一覧取得 |
| `retrieveRecordAsync` | ✅ | 単一取得 |
| `createRecordAsync` | ✅ | 作成 |
| `updateRecordAsync` | ✅ | 更新 |
| `deleteRecordAsync` | ✅ | 削除 |
| `executeAsync` | ❌ | fetch ベース → CSP ブロック |
| `fetch()` 直接 | ❌ | CSP ブロック |

> `WhoAmI` は使えないため、ログインユーザーは `systemuser` テーブルの `azureactivedirectoryobjectid` で
> `getContext().user.objectId`（AAD Object ID）→ `systemuserid` をマッピングする（→ [ユーザー識別](user-identity.md)）。

## よくあるユースケースと必要な設定

### 1. Google Maps iframe 埋め込み（地図表示）

**症状**: `Refused to frame 'https://maps.google.com/'` CSP 違反エラー

**必要な設定**:
| ディレクティブ | 追加するソース |
|---|---|
| `frame-src` | `https://www.google.com` `https://maps.google.com` |

**コード例**（iframe 埋め込み）:
```tsx
const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(`${lat},${lon}`)}&z=16&hl=ja&output=embed`;

<iframe
  src={embedUrl}
  className="w-full h-full"
  style={{ border: 0 }}
  loading="lazy"
  referrerPolicy="no-referrer-when-downgrade"
  title="地図"
  sandbox="allow-scripts allow-same-origin allow-popups"
/>
```

> **`allow-same-origin` は外せない**: 外すと Maps JS が
> `SecurityError: Blocked a frame at "https://www.google.com" from accessing a frame at "null"` を投げる（実測済）。
> URL レシピ（座標 / 住所 / ルート / 海外拠点）は [地図埋め込みパターン](../../standard/references/map-embed-pattern.md) を参照。

### 2. 外部 API 呼び出し（REST API / GraphQL）

**症状**: `Refused to connect to 'https://api.example.com/'`

**必要な設定**:
| ディレクティブ | 追加するソース |
|---|---|
| `connect-src` | 呼び出し先のドメイン（例: `https://api.example.com`） |

> Application Insights / Log Analytics へのテレメトリ転送も `connect-src` の追加が必要。
> メトリクス収集・PII サニタイズの詳細は [テレメトリ / 可観測性パターン](telemetry-pattern.md) を参照。

### 3. 外部動画/メディア埋め込み（YouTube 等）

**症状**: `Refused to frame 'https://www.youtube.com/'`

**必要な設定**:
| ディレクティブ | 追加するソース |
|---|---|
| `frame-src` | `https://www.youtube.com` |

### 4. 外部フォント読み込み（Google Fonts 等）

**必要な設定**:
| ディレクティブ | 追加するソース |
|---|---|
| `font-src` | `https://fonts.gstatic.com` |
| `style-src` | `https://fonts.googleapis.com` |

### 5. 外部 CDN スクリプト

**必要な設定**:
| ディレクティブ | 追加するソース |
|---|---|
| `script-src` | CDN ドメイン（例: `https://cdn.jsdelivr.net`） |

### 6. PDF・添付ファイルの表示（埋め込み vs リンク）

**まず「埋め込む必要が本当にあるか」を判定する。** 埋め込みは CSP 追加に加えて「ブラウザから認証なしで取得できる URL」が必須で、
エンタープライズのストレージ構成では成立しないことが多い。**成立しない場合はリンク方式に割り切る**のが正解。

#### 判定フロー

```
ファイルの実体はどこ？
├─ SharePoint / OneDrive
│   └─ 埋め込み可。frame-src に https://<tenant>.sharepoint.com を追加
├─ Dataverse の添付（annotation / fileattachment）
│   └─ retrieveRecordAsync で base64 取得 → blob: URL 化。frame-src に blob: を追加（fetch 不要なので connect-src は不要）
├─ Azure Blob Storage
│   └─ ユーザー委任 SAS を発行できれば埋め込み可。frame-src に <account>.blob.core.windows.net を追加
├─ Azure Files
│   └─ ❌ 埋め込み不可（ユーザー委任 SAS 非対応。共有キー禁止環境では署名付き URL を発行できない）→ リンク方式
└─ Entra ID 認証必須の API（Function App / APIM）
    └─ ❌ 埋め込み不可（Entra のサインイン画面は X-Frame-Options: DENY で iframe 内認証が不可）→ リンク方式
```

#### リンク方式（CSP 変更が不要）

```tsx
<a href={url} target="_blank" rel="noopener noreferrer">開く</a>
```

> **`<a target="_blank">` によるページ遷移は CSP の対象外。**
> `frame-src` は iframe、`connect-src` は fetch/XHR を制御するもので、**ナビゲーションはどちらにも該当しない**。
> したがってリンク方式なら CSP の追加設定は一切不要（ブロックされるとしたらブラウザのポップアップブロックのみ）。

基点 URL は `.env` の `VITE_*` に外出しし、未設定ならリンクを出さずパス表示とコピーだけに縮退させると、環境差分に強くなる。

#### 埋め込み方式に必要な CSP

| ディレクティブ | 既定値 | 追加する値 | 理由 |
|---|---|---|---|
| `frame-src` | `'self'` | `blob:` または配信元ドメイン | `<iframe>` / `<embed>` で表示する。**`blob:` は `'self'` に含まれない**ため明示追加が必須 |
| `connect-src` | `'none'` | 配信元ドメイン | fetch/XHR でバイト列を取得する場合。既定が `'none'` なので**追加ではなく置換**になる |
| `object-src` | `default-src` に従う | `blob:` / 配信元ドメイン | `<object>` で表示する場合 |
| `worker-src` | `default-src` に従う | `blob:` | pdf.js の Web Worker を使う場合 |
| `img-src` | `'self' data: <platform>` | `blob:` | pdf.js で canvas → 画像化する場合 |

#### クリップボードは必ずフォールバックを書く

Code Apps は cross-origin iframe で動作するため、ホストの Permissions-Policy によって `navigator.clipboard` が拒否されることがある。

```ts
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const el = document.createElement("textarea")
      el.value = text
      el.style.position = "fixed"
      el.style.opacity = "0"
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand("copy")
      document.body.removeChild(el)
      return ok
    } catch {
      return false
    }
  }
}
```

## 設定方法

### 方法 A: Power Platform 管理センター（GUI — 推奨）

1. [Power Platform 管理センター](https://admin.powerplatform.microsoft.com/) にサインイン
2. **環境** > 対象環境を選択
3. **設定** > **製品** を展開 > **プライバシー + セキュリティ**
4. **コンテンツ セキュリティ ポリシー** セクション > **アプリ** タブを選択
5. 対象ディレクティブの **「既定値を使用」トグルをオフ** にする
6. 追加したいソース URL を入力
7. **保存**

> **注意**: カスタム値はデフォルト値とマージされる。デフォルトが消えることはない。

### 方法 B: スクリプト（非対話・推奨）

[scripts/configure_code_app_csp.py](../scripts/configure_code_app_csp.py) が確認・追加・検証を一括で行う。
環境 ID は `.env` の `ENV_ID` から読む。

```powershell
# 現状確認（dry-run）
python .github/skills/code-apps/scripts/configure_code_app_csp.py

# デプロイ前チェック: 不足があれば終了コード 1（--assert は何も変更しない）
python .github/skills/code-apps/scripts/configure_code_app_csp.py `
  --directive Frame-Src --source https://www.google.com --source https://maps.google.com --assert

# 追加を適用（適用後に再取得して反映を検証する）
python .github/skills/code-apps/scripts/configure_code_app_csp.py `
  --directive Frame-Src --source https://www.google.com --source https://maps.google.com --apply
```

> **警告**: `PowerApps_CSPConfigCodeApps` の PATCH は**ディレクティブ コレクション全体を置換**する。
> スクリプトは必ず GET → マージ → PATCH の順で処理する（自前で PATCH を書く場合も同様）。

**認証（詰まりどころ）**: このエンドポイントは `EnvironmentManagement.Settings.Read` / `All.All.ReadWrite`
の委任アクセス許可を要求し、`auth_helper` の既定クライアント（Azure CLI 互換）や `az account get-access-token`
では `403 InsufficientDelegatedPermissions` になる。スクリプトは 403 を検出したら Power Platform CLI の
パブリック クライアント（`9cee029c-6210-4654-90bb-17e6e9d36617`）へ自動フォールバックする。
そのクライアントの認証キャッシュが無い初回だけ、`AUTH_MODE=interactive` を付けてブラウザ SSO で通すと
デバイスコード入力待ちで止まらない（→ [認証パターン](../../standard/references/auth-patterns.md)）。

```powershell
$env:AUTH_MODE="interactive"; python .github/skills/code-apps/scripts/configure_code_app_csp.py; Remove-Item Env:AUTH_MODE
```

**公式ドキュメント**: https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/how-to/content-security-policy

## 実装手順チェックリスト

iframe 埋め込み（地図等）を実装する場合の手順:

1. **CSP 設定を先に追加** — `configure_code_app_csp.py --apply` か管理センターで `frame-src` にドメインを追加
2. **コード実装** — iframe コンポーネントを作成
3. **デプロイ前チェック** — `configure_code_app_csp.py ... --assert` を通す（不足があれば終了コード 1）
4. **ビルド＆デプロイ** — `npm run build && pac code push`
5. **動作確認** — ブラウザの DevTools > Console で CSP 違反エラーがないことを確認

> **重要**: CSP 設定なしでデプロイすると iframe がブロックされて何も表示されない。
> 必ず **CSP 設定 → デプロイ** の順序で行う。

## トラブルシューティング

### iframe が表示されない（白い空白）

1. ブラウザ DevTools > Console を開く
2. `Refused to frame` エラーがあれば **`frame-src`** に該当ドメインを追加
3. CSP 設定後、ブラウザキャッシュをクリアしてリロード

### fetch/API 呼び出しが失敗する

1. Console で `Refused to connect` エラーを確認
2. **`connect-src`** に API ドメインを追加

### CSP 設定が反映されない

- 設定変更後、**数分のラグ** がある場合がある
- ブラウザのハードリロード（Ctrl+Shift+R）を試す
- `pac code push` 直後は Power Apps 側が旧バージョンをキャッシュしており
  「You're using an old version of this app」バナーが出る。**Refresh を押してから**確認する
- `configure_code_app_csp.py`（引数なし）で保存済みディレクティブを再確認する

### CSP 設定を確認しようとして 403 / デバイスコード待ちで止まる

- `403 InsufficientDelegatedPermissions` → 既定クライアントに権限が無い。PAC CLI クライアントへの
  フォールバックが働いているか確認する（スクリプトは自動）
- デバイスコードの入力待ちで止まる → `AUTH_MODE=interactive` を付けてブラウザ SSO で 1 回だけ通す。
  以降は `~/.power-platform-cli/auth_record_{TENANT_ID}_{CLIENT_ID}.json` から無操作で再利用される
- `pac auth token` サブコマンドは **PAC CLI 2.8 系には存在しない**ため、PAC からトークンを直接取り出す前提の手順は書かない
- `pac env list-settings` に出るのは **Dataverse 組織設定**（`iscontentsecuritypolicyenabled` 等 =
  モデル駆動/キャンバス用）で、Code Apps の CSP ではない。混同しない

## 教訓（検証済み 2026-04-23）

- **Code Apps の CSP はデフォルトで厳格**。`frame-src: 'self'` のため、外部サイトの iframe は全てブロックされる
- **Google Maps iframe は `https://maps.google.com` と `https://www.google.com` の両方が必要**。リダイレクトで両ドメインを経由する
- **CSP 設定は環境レベル**。同一環境内の全 Code Apps に適用される
- **`sandbox` 属性を適切に設定**。`allow-scripts allow-same-origin allow-popups` で地図操作・ポップアップを許可
- **iframe の代替手段も検討**。CSP 設定が困難な場合は「Google マップで開く」リンクボタンで代替できる
- **Code Apps の CSP は Power Platform API（`PowerApps_CSPConfigCodeApps`）にある**。Dataverse の組織設定
  （`iscontentsecuritypolicyenabled` / `contentsecuritypolicyconfiguration`）はモデル駆動・キャンバス用で無関係
- **設定済みかどうかは推測せず毎回スクリプトで確認する**。`--assert` をデプロイ前チェックに組み込むと、
  CSP 未設定のまま push して「真っ白な iframe」を調べ直す事故が起きない
- 複数拠点にピンを打つ地図が必要な場合は素の埋め込みでは実現できない
  （→ [地図埋め込みパターン / 複数ピンを同時に出す](../../standard/references/map-embed-pattern.md#8-応用-複数ピンを同時に出す自前オーバーレイ)）
