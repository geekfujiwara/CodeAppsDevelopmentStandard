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
| [upstream 優先構成ガイド](references/upstream-alignment.md) | `microsoft/power-platform-skills` 基準での責務分離・実行順序・刷新方針 |
| [Dataverse クライアント実装](references/dataverse-client.md) | `powerPagesFetch`/`powerPagesFetchResponse`・`WebApiErrorCode`・OData ヘルパー・ページネーション・サービスレイヤーパターン・**Code Apps との対比** |
| [認証実装](references/authentication.md) | **SSO・サインアウト・ログインボタン・認証ガード・UI フロー**の実コード一式・サーバー側 IdP/サイト設定・Code Apps との対比 |
| [認証・認可・テーブル権限（詳細）](references/auth-authz.md) | EDM 2.0 Code Site の認証/認可/テーブル権限・Web API 共有クライアント・SSO+プロフィール編集・Web ロール管理・テーブル Web API 有効化・site-settings 永続化 |
| [Enhanced Data Model テーブル権限](references/enhanced-data-model-permissions.md) | EDM 2.0 のテーブル権限設定・3 レイヤー権限・N:N バグ・ワークアラウンド |
| [運用と落とし穴](references/operations-and-pitfalls.md) | ビルド・デプロイ・サイト再起動・よくあるエラーと解決策 |
| [トラブルシューティング](references/troubleshooting.md) | エラーコード早見表・デバッグ用 Site Settings・既知の無害な警告 |
| [レガシー参照用チェックリスト](references/legacy-checklist.md) | 旧構成の参照用チェックリスト |
| [デザインシステム](references/design-system.md) | UI コンポーネント・テーマ・レイアウトの指針 |
| [デザインテンプレート集](references/design-templates.md) | 5 種類の配色テンプレート定義。設計時に提案→選択→適用 |

> **Dataverse 接続と認証の実装方法はこのファイルで概要を説明し、完全なサンプルコードは上記 References にまとめている。**

---

## 刷新版の構成原則（upstream 優先）

このスキルは `microsoft/power-platform-skills/plugins/power-pages` の以下 4 スキルを優先参照して構成する。

| 領域 | upstream スキル | このスキル内の着地 |
|---|---|---|
| 認証・認可 | `setup-auth` | `references/authentication.md` |
| Web ロール | `create-webroles` | `references/enhanced-data-model-permissions.md` |
| Dataverse CRUD | `integrate-webapi` | `references/dataverse-client.md` |
| 権限監査 | `audit-permissions` | `reviews/*` + `scripts/review_pre_deploy.py` |

**標準実行順序（刷新後）**
1. デプロイ基盤準備（`.powerpages-site` 作成）  
2. Web ロール整備  
3. 認証導線（SSO/ログイン/ログアウト）整備  
4. Dataverse Web API CRUD 実装  
5. 権限監査（ロール・テーブル権限整合）  

> ⚠️ **デプロイ後の必須ステップ**: `pac pages upload-code-site` でテーブル権限 YAML をデプロイしても、
> type=18 の content JSON 内 `adx_entitypermission_webrole` が空のまま残り、Web ロール紐付けが効かない。デプロイ直後に
> `python scripts/setup_permissions.py` を実行して content の `adx_entitypermission_webrole` を書き込み、`review_pre_deploy.py` の
> チェック 3.7 が ✅ になることを確認する（さもないと管理者を含む全ユーザーが 403）。詳細は教訓 14。

> 詳細な責務分離と判断基準は [upstream 優先構成ガイド](references/upstream-alignment.md) を正本として扱う。

---

## microsoft/power-platform-skills 比較（認証・認可 vs Dataverse CRUD）

| 観点 | ユーザー認証・Webロール認可 | Dataverse Web API 連携 CRUD |
|---|---|---|
| 上流スキル | `setup-auth` + `create-webroles` | `integrate-webapi` |
| 主目的 | ログイン/ログアウト、認証状態判定、ロールベース UI 制御 | `/_api` 経由の読み書き（`powerPagesFetch`/`powerPagesFetchResponse`、OData ヘルパー） |
| 主な成果物 | `authService.ts`（AUTH_PROVIDERS 配列）・`use-auth.ts`・ログイン UI・Web ロール YAML（`.powerpages-site/web-roles/`） | `powerPagesApi.ts`、テーブル別 service/hooks、CRUD 画面 |
| サーバー側必須設定 | IdP site settings、Web ロール、テーブル権限へのロール紐付け | テーブル権限（type=18 + `adx_entitypermission_webrole`）、必要時のみ Webapi 設定 |
| 失敗時の代表症状 | ログインループ、`/profile` 強制遷移、未認証判定ミス | 401(90040107) / 403 / 404(9004010C, 9004010D) |
| 依存関係 | 先に認証導線を整える（ユーザー実体: contact） | 認証済みセッション Cookie 前提で CRUD を実行 |

**推奨適用順:**
1. `setup-auth` で認証導線を整備  
2. `create-webroles` でロールを確定  
3. `integrate-webapi` で CRUD 実装  
4. `audit-permissions` で権限妥当性を最終監査  

---

## 核心原則

1. **`pac pages upload-code-site` がサイト作成とデプロイの両方を行う** — API でサイトを事前作成する必要はない
2. **初回は Inactive Sites に作成される** → PP API (`2022-03-01-preview`) で `activate_site.py` を使ってアクティブ化
3. **デプロイは upload-code-site → relink → restart の3ステップ** — `upload-code-site` は既存テーブル権限の Web ロール紐付けを消すため、毎回 `scripts/relink_table_permissions.py`（または統合の `scripts/deploy_site.py`）で再付与する（教訓 15）。**`npm run deploy`（build && upload-code-site だけ）で終わらせない**
4. **Post-Upload Fix は不要** — `upload-code-site` が header/footer/page を正しく構成する
5. **`.powerpages-site/` は upload-code-site が自動管理する** — ただし `site-settings/` YAML は手動追加して永続化できる（下記参照）
6. **`adx_website` レコードは絶対に削除しない** — EDM 2.0 でもランタイムが起動時に参照する
7. **環境のクリーンアップ時は PP API のサイト一覧と照合してから削除する** — 誤削除で 500 エラー
8. **`credentials: "same-origin"` を使う** — `"include"` ではない（same-site Cookie 認証）
9. **powerpagecomponent type=18 には `powerpagesitelanguageid` が必須** — 未設定だと 404 になる
10. **報告者・作成者は Contact Lookup で追跡する** — Power Pages では `createdby` はアプリケーションユーザーになるため使えない。ログインユーザーの Contact 情報を自動取得し入力不要にする（教訓 19）

## ワークフロー

```
初回:
  npm run build
  → pac pages upload-code-site          ← Inactive Sites に作成
  → py portal/scripts/activate_site.py  ← PP API でアクティブ化 (api-version=2022-03-01-preview)
  → py portal/scripts/setup_contact_webapi.py
  → py .github/skills/power-pages/scripts/setup_inquiry_reporter.py  ← 報告者 Contact Lookup (教訓 19)
  → py .github/skills/power-pages/scripts/relink_table_permissions.py  ← ★ロール再付与＋再起動

2回目以降（推奨: 統合スクリプトで一括実行）:
  py .github/skills/power-pages/scripts/deploy_site.py
  （ビルド → upload-code-site → ★relink → 検証 → 再起動 を 1 コマンドで実行）

2回目以降（手動の場合）:
  npm run build → pac pages upload-code-site
  → py .github/skills/power-pages/scripts/relink_table_permissions.py  ← ★必須（省くと 403）
```

> ⚠️ **`npm run build && pac pages upload-code-site` だけで終わらせると、既存テーブル権限の
> Web ロール紐付けが消えて全件 403 になる**（教訓 15）。`relink_table_permissions.py` を
> 毎回実行するか、`deploy_site.py` で一括実行すること。両スクリプトともハードコードなし・
> すべて `.env` 管理（`DATAVERSE_URL` / `ENV_ID` / `PAGES_WEBSITE_ID` / `PP_SUBDOMAIN` /
> `RELINK_WEBROLE_NAMES` / `PORTAL_DIR`）。

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

## プロジェクト構造（公式準拠 / upstream 推奨）

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
│   ├── shared/
│   │   ├── powerPagesApi.ts      ← ★ Web API 共有クライアント (powerPagesFetch/buildODataUrl 等)
│   │   └── services/
│   │       └── <table>Service.ts ← テーブルごとの CRUD サービス
│   ├── types/
│   │   └── <table>.ts            ← エンティティ型・ドメイン型・マッパー
│   ├── lib/
│   │   └── utils.ts              ← cn() ユーティリティ
│   ├── config.ts                 ← サイト名・ロゴ等のブランディング設定（.env の VITE_* を集約）
│   └── pages/
│       ├── home.tsx              ← ランディングページ
│       └── profile.tsx           ← プロフィール編集 (★ powerPagesApi.ts を使用)
├── dist-site/                    ← ビルド出力 (compiledPath)
├── .powerpages-site/             ← upload-code-site が管理 + site-settings YAML 手動追加可
│   └── site-settings/            ← Webapi/* 設定を YAML で永続化
├── .env.example                  ← ★ ブランディング等の VITE_* 変数サンプル（コピーして .env を作成）
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

## サイト名・ロゴのブランディング設定（`.env` / `src/config.ts`）

デプロイごとに変わる**ブランディング値はコードに直書きせず**、ビルド時の環境変数で差し替える。
テンプレートの `.env.example` を `.env` にコピーして値を編集する（`.env` は `.gitignore` 済み）。

```bash
cp .env.example .env   # 値を編集してから npm run build
```

| 変数 | 用途 | 既定値 |
|------|------|--------|
| `VITE_SITE_NAME` | サイト/ブランド表示名（ヘッダーロゴ・フッター・ブラウザタブのタイトル） | `Power Pages` |
| `VITE_SITE_LOGO_MARK` | ヘッダーロゴのマーク（1〜2 文字の頭文字） | `P` |

- すべて `VITE_` プレフィックス必須（Vite はこの接頭辞の変数のみクライアントへ公開）。
- 値は `src/config.ts`（`SITE_NAME` / `SITE_LOGO_MARK`）に集約し、未設定時は既定値へフォールバック。
- バンドルに同梱されブラウザに露出するため、**秘密情報は置かない**。
- `home.tsx` / `site-layout.tsx` は `@/config` を import して参照、`main.tsx` が `document.title` を設定。

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
    "upload": "pac pages upload-code-site --rootPath . --compiledPath ./dist",
    "deploy": "py ../.github/skills/power-pages/scripts/deploy_site.py"
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

### 推奨: 統合スクリプトで一括実行（再現性が高い）

```bash
cd portal
py ../.github/skills/power-pages/scripts/deploy_site.py
# ビルド → upload-code-site → ★ロール再付与 → 検証 → 再起動 を 1 コマンドで実行する。
# upload-code-site が消す Web ロール紐付けを毎回必ず再付与するため、relink 忘れによる
# 全件 403 事故（教訓 15）を構造的に防ぐ。ハードコードなし・すべて .env 管理。
```

### 手動で段階実行する場合

```bash
cd portal
npm run build
pac pages upload-code-site --rootPath . --compiledPath ./dist
# ★ upload-code-site は既存 type=18 の content.adx_entitypermission_webrole を消すため、
#   デプロイのたびに全テーブル権限の Web ロールを再付与する（教訓 15）。これを省くと 403。
py ../.github/skills/power-pages/scripts/relink_table_permissions.py
# → relink スクリプトが PAGES_WEBSITE_ID（推奨）または PP_SUBDOMAIN 設定時に自動で再起動する
#   （未設定の場合は手動再起動）
```

> `/profile`（contact Self）を使う場合は、初回のみ `setup_contact_self.py` で
> contact 権限と `Webapi/contact/enabled|fields` を作成しておく（教訓 16）:
> ```bash
> py ../.github/skills/power-pages/scripts/setup_contact_self.py
> ```

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

