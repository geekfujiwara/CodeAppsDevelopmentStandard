---
name: code-apps-csp
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
---

# Code Apps CSP 構成スキル

Code Apps で **iframe 埋め込み**・**外部 API 呼び出し**・**外部リソース読み込み** を行う場合、
CSP（Content Security Policy）ディレクティブの追加が必要。
設定なしでは `Refused to frame` エラーでブロックされる。

> **参考**: https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/how-to/content-security-policy

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

## よくあるユースケースと必要な設定

### 1. Google Maps iframe 埋め込み（地図表示）

**症状**: `Refused to frame 'https://maps.google.com/'` CSP 違反エラー

**必要な設定**:
| ディレクティブ | 追加するソース |
|---|---|
| `frame-src` | `https://www.google.com` `https://maps.google.com` |

**コード例**（iframe 埋め込み）:
```tsx
const embedUrl = `https://maps.google.com/maps?q=${lat},${lon}&z=16&output=embed`;

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

### 2. 外部 API 呼び出し（REST API / GraphQL）

**症状**: `Refused to connect to 'https://api.example.com/'`

**必要な設定**:
| ディレクティブ | 追加するソース |
|---|---|
| `connect-src` | 呼び出し先のドメイン（例: `https://api.example.com`） |

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

### 方法 B: REST API（PowerShell）

Power Platform API で CSP をプログラム的に設定できる。

**1. 認証トークン取得**:
```powershell
$tenantId = "<your-tenant-id>"
$clientId = "9cee029c-6210-4654-90bb-17e6e9d36617"  # Power Platform CLI の client ID
$token = azureauth aad --resource "https://api.powerplatform.com/" --tenant $tenantId --client $clientId --output token | ConvertTo-SecureString -AsPlainText -Force
```

**2. 現在の設定を取得**:
```powershell
# Get-CodeAppContentSecurityPolicy 関数（下記参照）を読み込み済みの前提
Get-CodeAppContentSecurityPolicy -Token $token -Env "<environment-id>"
```

**3. ディレクティブを更新**（例: Google Maps iframe 許可）:
```powershell
$env = "<environment-id>"
$directives = (Get-CodeAppContentSecurityPolicy -Token $token -Env $env).Directives

# frame-src に Google Maps を追加
$directives['Frame-Src'] = @('https://www.google.com', 'https://maps.google.com')

Set-CodeAppContentSecurityPolicy -Token $token -Env $env -Directives $directives
```

> **警告**: `-Directives` はディレクティブコレクション全体を置換する。
> 必ず既存の設定を GET してからマージして PATCH すること。

**PowerShell ヘルパー関数**: https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/how-to/content-security-policy#powershell-helper-functions

## 実装手順チェックリスト

iframe 埋め込み（地図等）を実装する場合の手順:

1. **CSP 設定を先に追加** — Power Platform 管理センターで `frame-src` にドメインを追加
2. **コード実装** — iframe コンポーネントを作成
3. **ビルド＆デプロイ** — `npm run build && pac code push`
4. **動作確認** — ブラウザの DevTools > Console で CSP 違反エラーがないことを確認

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
- Power Platform 管理センターで設定が保存されているか再確認

## 教訓（検証済み 2026-04-23）

- **Code Apps の CSP はデフォルトで厳格**。`frame-src: 'self'` のため、外部サイトの iframe は全てブロックされる
- **Google Maps iframe は `https://maps.google.com` と `https://www.google.com` の両方が必要**。リダイレクトで両ドメインを経由する
- **CSP 設定は環境レベル**。同一環境内の全 Code Apps に適用される
- **`sandbox` 属性を適切に設定**。`allow-scripts allow-same-origin allow-popups` で地図操作・ポップアップを許可
- **iframe の代替手段も検討**。CSP 設定が困難な場合は SVG 地図やリンクボタンで代替できる
