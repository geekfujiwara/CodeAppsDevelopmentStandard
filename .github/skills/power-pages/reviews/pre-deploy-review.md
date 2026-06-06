# Power Pages デプロイ前レビュー

> **タイミング**: `npm run build` 完了後、`pac pages upload-code-site` 実行前に実行する。
> **目的**: デプロイ先の環境設定が正しいことを Dataverse API で検証し、デプロイ後の 403/404 を予防する。

---

## チェック項目一覧

### 1. ローカルビルド検証

| # | チェック項目 | 自動 | 根拠 |
|---|---|---|---|
| 1.1 | `dist-site/index.html` が存在する | ✅ | ビルド出力確認 |
| 1.2 | `dist-site/assets/` に `.js` ファイルが 1 つだけ存在する | ✅ | inlineDynamicImports |
| 1.3 | `dist-site/index.html` が相対パス (`./assets/`) で JS/CSS を参照 | ✅ | `base: "./"` |
| 1.4 | TypeScript ビルドエラーがないこと (`tsc --noEmit`) | ✅ | 型安全 |
| 1.5 | `api.ts` に `credentials: "same-origin"` がある | ✅ | 核心原則8 |
| 1.6 | `api.ts` に `redirect: "manual"` がある | ✅ | 教訓7 |
| 1.7 | `api.ts` に `__RequestVerificationToken` 取得ロジックがある | ✅ | 教訓1 |
| 1.8 | POST ペイロードにカスタム reporter @odata.bind が含まれていない | ✅ | CreatedBy 標準 |

### 2. 環境接続検証

| # | チェック項目 | 自動 | 根拠 |
|---|---|---|---|
| 2.1 | `pac org who` で接続先環境が `.env` の `DATAVERSE_URL` と一致 | ✅ | 教訓10: 環境取り違え |
| 2.2 | `pac auth list` でアクティブプロファイルが存在する | ✅ | 教訓10 |
| 2.3 | `powerpagesites` に対象サイトが Active 状態で存在する | ✅ | Step 2-C |
| 2.4 | `powerpagesitelanguages` にサイトの言語レコードが存在する | ✅ | languageid null 防止 |

### 3. テーブル権限検証（Dataverse API）

| # | チェック項目 | 自動 | 根拠 |
|---|---|---|---|
| 3.1 | 対象テーブルに `powerpagecomponent` type=18 が存在する | ✅ | 教訓2: 未設定 → 403 |
| 3.2 | content JSON に `adx_entitypermission_webrole` が含まれている | ✅ | 教訓2 |
| 3.3 | `_powerpagesitelanguageid_value` が null でない | ✅ | 核心: null → 404 9004010C |
| 3.4 | scope が意図通り（Global=756150000 / Self=756150004）| ✅ | 教訓3 |
| 3.5 | Contact 用権限は scope=756150004 (Self) | ✅ | 教訓3 |
| 3.6 | `append=true, appendto=true` が設定されている（Lookup 使用テーブル） | ✅ | 教訓4: 403 90040106 |
| 3.7 | 全権限の content JSON に `adx_entitypermission_webrole` がある（N:N は幽霊なので検証に使わない） | ✅ | 教訓2・14 |

### 4. サイト設定検証

| # | チェック項目 | 自動 | 根拠 |
|---|---|---|---|
| 4.1 | `Authentication/Registration/ProfileRedirectEnabled` = `false` | ✅ | 教訓5 |
| 4.2 | `Authentication/Registration/LoginButtonAuthEnabled` = `false` | ✅ | 教訓5 |
| 4.3 | `Webapi/error/innererror` = `true`（開発環境のみ） | ✅ | デバッグ用 |
| 4.4 | 不要な `Webapi/{table}/enabled` 設定が存在しない（EDM 2.0 では不要） | ✅ | 教訓8 |

### 5. セキュリティ検証（本番デプロイ時）

| # | チェック項目 | 自動 | 根拠 |
|---|---|---|---|
| 5.1 | `Webapi/error/innererror` = `false`（本番環境） | ✅ | 情報漏洩防止 |
| 5.2 | テーブル権限が Global scope ではなく Self/Contact scope（必要最小限） | ⚠️手動 | 最小権限原則 |
| 5.3 | CORS / CSP 設定が過度に緩和されていない | ⚠️手動 | OWASP |

---

## 実行方法

```bash
cd portal
python ../.github/skills/power-pages/scripts/review_pre_deploy.py
```

### 出力例

```
╔══════════════════════════════════════════════════╗
║  Power Pages デプロイ前レビュー                   ║
╚══════════════════════════════════════════════════╝

[1/5] ローカルビルド検証
  ✅ dist-site/index.html が存在
  ✅ assets/ に JS ファイルが 1 つ (index-Abc123.js)
  ✅ index.html が相対パス参照
  ✅ api.ts: credentials: "same-origin"
  ✅ api.ts: redirect: "manual"
  ✅ api.ts: __RequestVerificationToken 取得ロジック
  ✅ POST に reporter @odata.bind なし

[2/5] 環境接続検証
  ✅ pac auth アクティブプロファイル: org123.crm7.dynamics.com
  ✅ .env DATAVERSE_URL と一致
  ✅ サイト "IncidentPortal" (Active)
  ✅ 言語レコード: 1e12c1b1-... (Japanese)

[3/5] テーブル権限検証
  ✅ geek_incident: type=18 あり, languageid 設定済み, scope=Global
  ✅ geek_incident: adx_entitypermission_webrole あり
  ✅ geek_incident: N:N リンク あり
  ✅ geek_incident: append=true, appendto=true
  ✅ contact: type=18 あり, scope=Self(756150004)

[4/5] サイト設定検証
  ✅ ProfileRedirectEnabled = false
  ✅ LoginButtonAuthEnabled = false
  ✅ Webapi/error/innererror = true (開発環境)
  ✅ 不要な Webapi/* 設定なし

[5/5] セキュリティ検証
  ⚠️  Webapi/error/innererror = true — 本番デプロイ時は false にしてください

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
結果: 19/20 PASS, 0 FAIL, 1 WARN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 不合格時のアクション

| 不合格項目 | 自動修復コマンド |
|---|---|
| 3.1 テーブル権限なし | `python scripts/setup_permissions.py` |
| 3.3 languageid null | `python scripts/setup_permissions.py` (languageid パッチ含む) |
| 3.7 N:N リンクなし | `python scripts/setup_permissions.py` (N:N 設定含む) |
| 4.1 ProfileRedirect | `python scripts/setup_auth.py` |
| 5.1 innererror=true (本番) | サイト設定を `false` に PATCH |

---

## CI/CD 統合

GitHub Actions で `npm run build` 後に `review_pre_deploy.py` を実行する:

```yaml
- name: Pre-deploy review
  run: python .github/skills/power-pages/scripts/review_pre_deploy.py
  env:
    DATAVERSE_URL: ${{ secrets.DATAVERSE_URL }}
    TENANT_ID: ${{ secrets.TENANT_ID }}
    # CI 用: サービスプリンシパル認証
    CLIENT_ID: ${{ secrets.CLIENT_ID }}
    CLIENT_SECRET: ${{ secrets.CLIENT_SECRET }}
```
