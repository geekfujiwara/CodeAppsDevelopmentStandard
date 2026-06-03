# Power Pages 設計前レビュー

> **タイミング**: テーブル設計完了後、SPA コード実装の開始前に実行する。
> **目的**: 実装で手戻りを起こさない設計判断がされていることを確認する。

---

## チェック項目一覧

### 1. テーブル設計

| # | チェック項目 | 根拠 |
|---|---|---|
| 1.1 | 報告者・作成者にカスタム Lookup 列を作っていない（`createdby` で代用） | 教訓4: @odata.bind ターゲット不一致 404 / AppendTo 403 の連鎖を防止 |
| 1.2 | ユーザー参照は `systemuser` テーブルへの Lookup（カスタムユーザーテーブルを作っていない） | Dataverse 標準 |
| 1.3 | テーブル / 列のスキーマ名が英語（日本語スキーマ名は pac code add-data-source で失敗） | Dataverse 標準 |
| 1.4 | Choice 値は `100000000` 始まり | カスタム Choice の制約 |
| 1.5 | 全 Lookup リレーションが設計書に明記されている | @odata.bind のターゲットテーブル誤り防止 |

### 2. 認証設計

| # | チェック項目 | 根拠 |
|---|---|---|
| 2.1 | 認証方式が「サーバー側セッション Cookie + Portal.User」になっている | 教訓6: contacts クエリ禁止 |
| 2.2 | 認証判定で `/_api/contacts` をクエリする設計になっていない | 教訓6: 403 EntityPermissionReadIsMissing |
| 2.3 | ログイン後のリダイレクト先を制御する設計（ProfileRedirectEnabled=false）になっている | 教訓5: /profile 強制リダイレクト |
| 2.4 | SSO auto-redirect パターン（`/SignIn` → ExternalLogin form POST）が計画されている | 教訓5: プロバイダー選択スキップ |

### 3. API 設計

| # | チェック項目 | 根拠 |
|---|---|---|
| 3.1 | 共有クライアント `api.ts` パターンを使う設計（fetch を直接散在させない） | コード品質・教訓横断適用 |
| 3.2 | POST/PATCH/DELETE に __RequestVerificationToken を付与する設計 | 教訓1: 401 anti-forgery |
| 3.3 | `credentials: "same-origin"` を使用（`"include"` ではない） | 核心原則8 |
| 3.4 | `redirect: "manual"` で認証切れを検知する設計 | 教訓7: 302 → ログインページ追従防止 |
| 3.5 | 報告者はPOST時に送らず、GET時に `_createdby_value` で取得する設計 | CreatedBy 標準 |
| 3.6 | @odata.bind 使用列の参照先テーブルが ManyToOneRelationships で確認済み | 教訓4: 404 9004010D |

### 4. テーブル権限設計

| # | チェック項目 | 根拠 |
|---|---|---|
| 4.1 | EDM 2.0 前提（`Webapi/*` Site Settings は使わない） | 教訓8 |
| 4.2 | テーブル権限 content JSON に `adx_entitypermission_webrole` を含める設計 | 教訓2: 403 |
| 4.3 | N:N リンク（`powerpagecomponent_powerpagecomponent`）も同時に設定する | 教訓2 |
| 4.4 | Contact 権限は scope=756150004 (Self) を使用 | 教訓3: contactrelationship 不要 |
| 4.5 | Lookup 参照先テーブルに `appendto=true` を設定する計画がある | 教訓4: 403 90040106 |
| 4.6 | `powerpagesitelanguageid` を設定する計画がある | 核心: null → 404 9004010C |

### 5. デプロイ構成

| # | チェック項目 | 根拠 |
|---|---|---|
| 5.1 | HashRouter を使用（History API は直接 URL で 404） | SPA 制約 |
| 5.2 | Vite `base: "./"` + `inlineDynamicImports: true` | Power Pages パス構造制約 |
| 5.3 | `powerpages.config.json` が存在し `compiledPath` が一致 | pac pages 必須 |
| 5.4 | 環境の `.js` ファイルアップロードブロックを解除する計画がある | Step 2-A |

---

## 実行方法

### 手動レビュー

上記チェック項目をプルリクエストレビュー時 or 設計レビュー会で確認する。

### 自動チェック（ローカルファイルのみ）

```bash
cd portal
python ../.github/skills/power-pages/scripts/review_pre_design.py
```

スクリプトは以下のローカルファイルを静的にチェックする:
- `vite.config.ts` の `base` と `inlineDynamicImports`
- `powerpages.config.json` の存在と `compiledPath`
- `src/lib/api.ts` の `credentials`/`redirect`/`__RequestVerificationToken` パターン
- `src/**/*.ts{x}` で `@odata.bind` 使用時の参照先確認
- `src/**/*.ts{x}` で `createdby` 標準の遵守（カスタム reporter 列不使用）
- ルーターが `HashRouter` であること

---

## 不合格時のアクション

| 不合格項目 | 次のアクション |
|---|---|
| 1.1 報告者にカスタム Lookup | テーブルから列を削除し createdby 利用に設計変更 |
| 2.2 contacts クエリ | Portal.User + セッション Cookie に変更 |
| 3.6 @odata.bind 未確認 | `EntityDefinitions/ManyToOneRelationships` で参照先を確認 |
| 4.6 languageid 計画なし | setup_permissions.py に languageid 設定を追加 |
| 5.1 BrowserRouter | HashRouter に変更 |
