# Power Pages レガシー参照用チェックリスト

旧構成の参照用。現行の正常系は [SKILL.md](../SKILL.md) を参照。


## チェックリスト（レガシー参照用）

### 認証・認可
- [ ] `src/shared/powerPagesApi.ts` を使用している（`src/lib/api.ts` は旧パターン）
- [ ] **use-auth.ts が `/_api/contacts` をクエリしていない**（教訓 6）
- [ ] `Authentication/Registration/ProfileRedirectEnabled = false` を設定済み（教訓 5）
- [ ] `AUTH_PROVIDERS` 配列で IdP を管理している（`resolveProviderIdentifier()` パターン）
- [ ] 顧客向けポータルの場合は Entra External ID (CIAM) を使用している

### Web ロール
- [ ] `.powerpages-site/web-roles/` に YAML ファイルを配置している（upstream `create-webroles` パターン）
- [ ] `authenticated-users.yml` に `authenticatedusersrole: true` が設定されている
- [ ] `anonymous-users.yml` に `anonymoususersrole: true` が設定されている（未認証アクセスを許可する場合）
- [ ] 各 YAML の `id` が UUID v4 形式で一意になっている

### Dataverse CRUD（upstream `integrate-webapi` 準拠）
- [ ] `powerPagesFetch` / `powerPagesFetchResponse` を使用（旧 `apiGet/apiPost/apiPatch` ではない）
- [ ] `buildODataUrl` で OData URL を構築している
- [ ] `$select` に必要なカラムを明示している（`*` を使っていない）
- [ ] ページネーションは `Prefer: odata.maxpagesize=N` + `@odata.nextLink`（`$skip` は非サポート: 9004010B）
- [ ] Lookup の `@odata.bind` に `ManyToOneRelationships` の Navigation Property 名を使用（教訓 4）
- [ ] テーブルごとに `src/shared/services/<table>Service.ts` + `src/types/<table>.ts` を作成

### テーブル権限
- [ ] EDM content JSON に `adx_entitypermission_webrole`（Web ロール ID 配列）が含まれている（教訓 2）
- [ ] content に `websiteid` が含まれている
- [ ] **`upload-code-site` 後に `setup_permissions.py` を実行し、各テーブル権限 content の `adx_entitypermission_webrole` に Authenticated Users が入っている（Design Studio の「ロール」列が空でない）（教訓 14）**
- [ ] **再デプロイのたびに `relink_table_permissions.py` を実行し、`upload-code-site` で消えた全 type=18 の Web ロールを再付与した（教訓 15）**
- [ ] テーブル権限に `append=true, appendto=true` が設定されている
- [ ] Contact 権限は scope=756150004 (Self) を使用（教訓 3）
- [ ] **`/profile`（contact Self）を使う場合、`setup_contact_self.py` で contact 権限 + `Webapi/contact/enabled|fields` を設定し、`fields` にクライアントの SELECT 全列（`fullname` 含む）を網羅した（教訓 16）**

### デプロイ
- [ ] `powerpages.config.json` が存在する
- [ ] `vite.config.ts` で `base: "./"` + `inlineDynamicImports: true`
- [ ] HashRouter を使用している
- [ ] `pac auth` で正しいユーザー・環境に接続されている（教訓 10）
- [ ] テーブル権限が正しい `powerpagesiteid` に紐づいている（教訓 9）
- [ ] アクセスする全テーブルに `Webapi/{table}/enabled=true` + `Webapi/{table}/fields=*` を設定済み（教訓 8）
- [ ] `Webapi/error/innererror = true` が開発環境で有効
