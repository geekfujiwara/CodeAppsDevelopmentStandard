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
| [Enhanced Data Model テーブル権限](references/enhanced-data-model-permissions.md) | EDM 2.0 のテーブル権限設定・3 レイヤー権限・N:N バグ・ワークアラウンド |
| [運用と落とし穴](references/operations-and-pitfalls.md) | ビルド・デプロイ・サイト再起動・よくあるエラーと解決策 |
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

## ★★★ 重要教訓: EDM 2.0 Code Site の認証・認可・テーブル権限

> **実案件 (IncidentPortal01/02) のデバッグで確定した知見。geeksupport（動作済み参考サイト）との比較で裏取り済み。**

---

### 教訓 1: CSRF トークン（__RequestVerificationToken）は POST/PATCH/DELETE に必須

```
❌ NG: POST /_api/geek_incidents に __RequestVerificationToken なしで送信
       → 401 / 90040107 (anti-forgery token required)

✅ OK: /_layout/tokenhtml から取得してヘッダーに付与
       取得: fetch("/_layout/tokenhtml") → regex value="([^"]+)" で抽出
       送信: headers に { __RequestVerificationToken: token } を追加
```

**キャッシュ:** トークンはセッション中有効。初回取得後は変数にキャッシュして再利用可能。

---

### 教訓 2: EDM 2.0 テーブル権限の Web ロール紐付けは N:N association がランタイム正本（content JSON は YAML シリアライズ形）

> **重要な訂正（実機 m365status で確定）:** 以前は「content JSON が唯一の正本、N:N $ref は幽霊」と
> 記載していたが、実機検証で **逆**だと判明した。content JSON 配列が入っていても
> 自己参照 N:N `powerpagecomponent_powerpagecomponent` の **association が空なら 403**
> (90040120 EntityPermissionReadIsMissing) になる。`$ref` POST で association を作成した
> 直後に 200 になった。**ランタイム正本は N:N association**。

```
❌ NG: powerpagecomponent type=18 の content に entitylogicalname/scope/CRUD だけ設定
       → content の adx_entitypermission_webrole も N:N association も空 → 403

❌ NG: content JSON の adx_entitypermission_webrole 配列だけ PATCH して終わり
       → API 単体では N:N association が作られない → 403 (90040120) のまま
       （content 配列は YAML/git シリアライズ形であり、ランタイムは association を読む）

✅ OK: (1) content JSON に adx_entitypermission_webrole（YAML/git 形）を含めて PATCH
       (2) かつ N:N に $ref POST して association を作成（＝ランタイム正本）
       POST .../powerpagecomponents({permId})/powerpagecomponent_powerpagecomponent/$ref
            body: {"@odata.id": ".../powerpagecomponents({roleId})"}
```

> `pac pages upload-code-site` で table-permissions YAML をデプロイすると、この
> **association も自動作成される**。一方、API だけで content を編集した場合は
> association が作られないため、`$ref` POST が必須。両方そろえるのが安全。
> association は方向性があり、権限(type=18)→ロール(type=11) 方向で `$expand` すると見える
> （逆方向のロール→権限 expand は空に見えることがある）。

**Design Studio が書く完全な content JSON:**

```json
{
  "filecontent": null,
  "entitylogicalname": "geek_incident",
  "entityname": "geek_incident - Global CRUD",
  "scope": 756150000,
  "read": true,
  "write": true,
  "create": true,
  "delete": false,
  "append": true,
  "appendto": true,
  "adx_entitypermission_webrole": ["e7cb523c-1d5f-f111-a825-7ced8d3b33ec"],
  "parentrelationship": null,
  "parententitypermission": null,
  "contactrelationship": null,
  "accountrelationship": null,
  "childTablePermissions": [],
  "permissionfetchxml": null
}
```

**API で完結する手順:**
1. `powerpagecomponent` type=18 を POST — content に `adx_entitypermission_webrole`（＋`websiteid`）を含む
2. 既存権限に後からロールを追加する場合は `content` を GET → 配列にロール ID を冪等追加 → PATCH
3. **N:N association を `$ref` POST で作成**（`powerpagecomponent_powerpagecomponent`）。
   これがランタイム正本。API のみの content 編集では作られないため必須
4. 検証は association を `$expand`（権限→ロール方向）で確認する

---

### 教訓 3: Contact テーブル権限は Self スコープ（756150004）を使う

```
❌ NG: scope=756150001 (Contact) + contactrelationship="contact_customer_contacts"
       → リレーション設定ミスで 403、設定が複雑で壊れやすい

✅ OK: scope=756150004 (Self) + contactrelationship=null
       → リレーション不要で自分自身のレコードのみアクセス許可
```

| 項目 | 誤った設定 | 正しい設定 |
|---|---|---|
| scope | `756150001`（Contact） | `756150004`（Self） |
| contactrelationship | `"contact_customer_contacts"` | `null`（不要） |
| webroles | Administrators のみ | **Authenticated Users** |

---

### 教訓 4: Lookup バインド（@odata.bind）は正確なターゲットエンティティが必須

```
❌ NG: "geek_inquirerid@odata.bind": "/contacts(xxx)"
       → geek_inquirerid の参照先が geek_inquirer テーブルなのに contact を指定
       → 404 / 9004010D (CDS エンティティ解決失敗)

✅ OK: ManyToOneRelationships で ReferencedEntity を確認してから @odata.bind を組み立てる
       確認: GET EntityDefinitions(LogicalName='geek_incident')/ManyToOneRelationships
```

**参照先テーブルに AppendTo 権限も必要:**
- 不足 → 403 / 90040106 (AppendTo permission missing)
- 参照先テーブルの EDM content で `"appendto": true` を設定

---

### 教訓 5: ログイン後のリダイレクト先が `/profile` に強制される

```
❌ NG: デフォルトで Authentication/Registration/ProfileRedirectEnabled = true
       → SSO 完了後に returnUrl を無視して /profile に強制リダイレクト

✅ OK: 以下のサイト設定を false に（adx_sitesettings + EDM type=9 の両方）
       - Authentication/Registration/ProfileRedirectEnabled = false
       - Authentication/Registration/LoginButtonAuthEnabled = false
```

**SPA 側のリダイレクト復元パターン:**
1. ログイン前: `sessionStorage.setItem("pp_return_hash", location.hash)` で保存（`use-auth.ts` の `login()`）
2. `returnUrl: "/"` でルートに戻す
3. SPA 初期化時: `RestoreRoute` コンポーネントで `sessionStorage` から復元 → `navigate(target, { replace: true })`

> ⚠️ **保存と復元はセット**: 手順 1 の保存だけでは往復が完成せず、ログイン後にディープリンク
> （例: `#/incidents/123`）がホームに化ける。`App.tsx` の `<HashRouter>` 直下に `RestoreRoute`
> を必ず配置すること（corporate-lp テンプレートに実装済み）。

---

### 教訓 6: 認証判定で contact テーブルをクエリしてはいけない

```
❌ NG: /_api/contacts?$select=contactid&$top=1 をセッション検証に使う
       → contact の Table Permission がないと 403 EntityPermissionReadIsMissing

✅ OK: window.Microsoft.Dynamic365.Portal.User を信頼する（API 呼び出し不要）
       認証はサーバー側セッション Cookie で完結している
```

---

### 教訓 7: `redirect: "manual"` でリダイレクトを検知

```
❌ NG: fetch のデフォルト (redirect: "follow") で API 呼び出し
       → 未認証時に 302 → ログインページに自動追従 → エラー判別不能

✅ OK: redirect: "manual" + response.type === "opaqueredirect" で認証切れを検出
       または response.redirected && response.url.includes("/Account/Login") をチェック
```

---

### 教訓 8: EDM 2.0 Code Site でも Webapi/* Site Settings は必須（カスタムテーブル含む）

```
❌ NG: type=18 テーブル権限（adx_entitypermission_webrole + N:N リンク）だけ設定
       → 認可は通るが /_api/{table} エンドポイント自体が公開されず 404 (9004010C)

✅ OK: アクセスする全テーブルに以下の 2 設定を追加する（カスタムテーブルも必須）
       - Webapi/{table}/enabled = true
       - Webapi/{table}/fields  = *          ← または公開する列をカンマ区切りで列挙
```

**type=18 テーブル権限と Webapi/* 設定は役割が異なり、両方必要:**

| レイヤー | 役割 | 無いと |
|---|---|---|
| `powerpagecomponent` type=18（テーブル権限） | **認可**（誰がどの操作をできるか） | 403 EntityPermission* |
| `Webapi/{table}/enabled` + `/fields` | **エンドポイント公開**（`/_api/{table}` を有効化） | **404 (9004010C)** |

> **実証（本リポジトリの IncidentPortal セッション）**: 新規 EDM 2.0 Code Site で
> `geek_m365service` / `geek_m365incident` / `geek_inquiry` の type=18 権限を正しく
> デプロイ・検証済みでも `/_api/geek_m365services` は **404**。`Webapi/{table}/enabled=true`
> と `Webapi/{table}/fields=*` を追加して restart した直後に **404 → 302**（未認証リダイレクト＝
> エンドポイント解決成功）に変化した。`scripts/setup_permissions.py` も全テーブルに対して
> この 2 設定を作成しており、`operations-and-pitfalls.md` の「Web API が 404 → Webapi/{table}/enabled
> 未設定」とも一致する。**Webapi/* は Contact 専用のレガシー設定ではなく、カスタムテーブルにも必須。**

**`.powerpages-site/site-settings/` に YAML で永続化（upload-code-site で再デプロイされる）:**

```yaml
# .powerpages-site/site-settings/Webapi-geek_m365service-enabled.sitesetting.yml
id: <UUID v4>
name: Webapi/geek_m365service/enabled
value: "true"
---
# .powerpages-site/site-settings/Webapi-geek_m365service-fields.sitesetting.yml
id: <UUID v4>
name: Webapi/geek_m365service/fields
value: "*"
```

> デバッグ時は `Webapi/error/innererror = true` も追加すると `/_api/` のエラーレスポンスに
> `innererror` が含まれ原因特定が容易になる。

---

### 教訓 9: Website ID の取り違え

```
❌ NG: .env の WEBSITE_ID と実際の mspp_websites/powerpagesites の ID が不一致
       → テーブル権限を作っても「別サイトの権限」になり効かない

✅ OK: pac org who で確認した環境の mspp_websites から正確な ID を取得

確認コマンド:
  GET /api/data/v9.2/mspp_websites?$select=mspp_websiteid,mspp_name
  GET /api/data/v9.2/powerpagesites?$select=powerpagesiteid,name
```

---

### 教訓 10: pac CLI の認証ユーザー不一致

```
❌ NG: pac が別ユーザー/別環境に接続されたままアップロード
       → 間違ったサイトに反映 or 権限不足でエラー

✅ OK: pac auth clear → pac auth create --environment {ENV_ID} で再認証
       pac org who で接続先を確認してからデプロイ
```

---

### 教訓 11: サイト再起動の反映タイムラグ

```
⚠️ 権限変更やサイト設定変更後、restart API を叩いても 60〜90秒の反映待ちが必要
   テスト時はブラウザの InPrivate / シークレットウィンドウを使い、キャッシュを回避する
```

---

### 教訓 12: deploy.py での二重アップロードと scope 値の混同

```
❌ NG: pac pages upload-code-site を直接実行後、deploy.py --skip-build を使う
       → upload-code-site が再実行されて二重アップロードになる

✅ OK: deploy.py --restart-only で restart のみ実行
       初回フロー: pac pages upload-code-site → activate_site.py → deploy.py --restart-only
       2回目以降: deploy.py (ビルド→アップロード→リスタート全自動)

❌ NG: contact テーブル権限の scope に 756150001 (Contact scope) を使う
       → 「親 Contact 配下のレコード」であり Self ではない

✅ OK: Self scope は 756150004
       scope=756150004 + contactrelationship=null が正しい
```

---

### 教訓 13: pac CLI サブコマンドの正しい名前

```
❌ NG: pac power-pages list
       → "Not a valid command" エラー

✅ OK: pac pages list / pac pages upload-code-site / pac pages help
       サブコマンドは "pages" であり "power-pages" ではない
```

---

### 教訓 14: テーブル権限の Web ロール紐付けは N:N association がランタイム正本 → デプロイ後 / API 編集後に必ず作成する

```
❌ NG: .powerpages-site/table-permissions/*.yml を pac pages upload-code-site で
       デプロイしただけで「権限設定済み」と判断する（YAML に webrole 紐付けが無い場合）
       → powerpagecomponent type=18 は作成されるが、association が空のまま
       → 管理者を含む全ユーザーが 403（Design Studio の「ロール」列が空）

❌ NG: content JSON の adx_entitypermission_webrole 配列だけ PATCH して終わり
       → API 単体では N:N association が作られない → 403 (90040120) のまま
         （content 配列は YAML/git シリアライズ形。ランタイムは association を読む）

✅ OK: type=18 の content JSON（YAML 形）を書きつつ、N:N association を $ref POST で作成
       python scripts/setup_permissions.py        # content + association を冪等作成
       python scripts/relink_table_permissions.py # 全 type=18 を一括で content+association 修復
```

**症状（実案件 IncidentPortal で発生）:**
Design Studio の「セキュリティ → テーブルのアクセス許可」で、各権限の **「ロール」列が空欄**（Authenticated Users が割り当たっていない）。正しい `scope`/CRUD/`Webapi/*` がすべて揃っていても 403 になる。手動で Authenticated Users を割り当てると解消するが、再デプロイで再発しうる。

**根本原因（実機検証で確定 — 以前の記述を訂正）:**
ランタイムが参照する**正本は自己参照 N:N `powerpagecomponent_powerpagecomponent` の association**。
content JSON の `adx_entitypermission_webrole` 配列は YAML/git シリアライズ形であり、これが
入っていても association が空なら 403 (90040120 EntityPermissionReadIsMissing) になる。
`pac pages upload-code-site` は YAML に webrole 紐付けがあれば association を作成するが、
API だけで content を編集した場合は association が作られない。`$ref` POST で association を
作成して初めてランタイムが認識する。

**恒久対策（デプロイ手順に組み込む）:**
1. `pac pages upload-code-site` でデプロイ
2. **`python scripts/setup_permissions.py` を実行**して各 type=18 に content（webrole 配列）と
   **N:N association（$ref POST）の両方**を冪等作成
3. `python scripts/review_pre_deploy.py` の **チェック 3.7** が ✅ になることを確認
4. restart → 60〜90 秒待って `/_api/{table}` を検証

**検証クエリ（正本＝association を直接確認）:**
```
GET /api/data/v9.2/powerpagecomponents({perm_id})
    ?$expand=powerpagecomponent_powerpagecomponent($select=name,powerpagecomponenttype)
  → 展開結果に type=11 の Web ロールが含まれていれば OK（＝ランタイム正本が紐付け済み）。
    空なら未紐付け = 403 の原因。content の配列だけでは不十分。
```

> 関連: 教訓 2（N:N association がランタイム正本）/ `references/operations-and-pitfalls.md`。本教訓は「**content 配列だけ・YAML デプロイだけでは association が空になりうるので、デプロイ後 / API 編集後に必ず $ref POST で association を作成する**」というデプロイ手順上の落とし穴を明示する。

---

### 教訓 15: `upload-code-site` は既存テーブル権限の Web ロール紐付けを消す → デプロイ後に必ず再付与

```
❌ NG: 一度 Web ロールを紐付けた後、SPA 更新のために再度 upload-code-site を実行し、
       そのまま動作確認する
       → .powerpages-site/table-permissions/*.yml が既存 type=18 を上書きし、
         content.adx_entitypermission_webrole と N:N association をリセットする
       → 既存の全グローバル権限まで一斉に 403 になる（Design Studio「ロール」列が空に）

✅ OK: upload-code-site のたびに content と N:N association の両方を再付与する
       python scripts/relink_table_permissions.py   # 全 type=18 を冪等に再付与＋再起動
```

**症状（実案件 IncidentPortal で発生）:**
`/profile`（contact Self）追加のために再デプロイしたところ、それまで動いていた
`geek_inquiry` / `geek_m365incident` / `geek_m365service` の **3 つのグローバル権限の
「ロール」列がすべて空**になり 403。デプロイ後に API で作成した `Contact - Self` だけは
（YAML に含まれないため）影響を受けなかった。

**根本原因（実機検証で確定）:**
`pac pages upload-code-site` は `.powerpages-site/table-permissions/*.yml` を正として
type=18 を上書きするが、この YAML に webrole 紐付けが含まれないと、
content JSON の Web ロール配列と N:N association が **毎回リセットされる**
（教訓 14 が「デプロイのたびに」再発する）。

**恒久対策（再デプロイ手順に固定）:**
1. `npm run build && pac pages upload-code-site`
2. **`python scripts/relink_table_permissions.py`** を実行（全 type=18 に
   Authenticated Users を content + N:N association の両方で冪等再付与 → 自動で再起動）
3. 60〜90 秒待って `/_api/{table}` を検証

> `setup_permissions.py`（TABLES に列挙したテーブルのみ）と異なり、
> `relink_table_permissions.py` は**サイト上の全 type=18 を対象に一括修復**する。
> 両スクリプトとも content JSON 配列と N:N association（$ref POST）の両方を作成する。
> 環境変数 `RELINK_WEBROLE_NAMES`（既定 `Authenticated`, カンマ区切り）で対象ロールを変更可。

---

### 教訓 16: Web API は `Webapi/{table}/fields` 許可リスト外の列を要求すると 403 → クライアントの SELECT 全列を網羅する

```
❌ NG: Webapi/contact/fields = "firstname,lastname,emailaddress1,telephone1"
       なのにクライアントが ?$select=contactid,firstname,lastname,fullname,emailaddress1
       を投げる（fullname が許可リスト外）
       → テーブル権限・Web ロールが正しくても 403 Forbidden（権限不足と誤認しやすい）

✅ OK: クライアントが SELECT する全列を fields に列挙する
       Webapi/contact/fields = "firstname,lastname,emailaddress1,telephone1,fullname"
       （主キー contactid は常に許可される。迷う場合は "*"）
```

**症状（実案件 IncidentPortal で発生）:**
contact Self 権限・`Webapi/contact/enabled=true` を設定し Web ロールも紐付け済みなのに、
`/_api/contacts?$select=contactid,firstname,lastname,fullname,emailaddress1` が **403**。
フロント側は「authenticated but no contact permission」と誤って解釈していた。

**根本原因:**
`fullname` を `Webapi/contact/fields` の許可リストに入れ忘れていた。Web API は
許可リスト外の列を含むリクエストを **403** で拒否する（200＋空ではない）。

**恒久対策:**
`setup_contact_self.py` は既定で `firstname,lastname,emailaddress1,telephone1,fullname`
を設定する（`/profile` の `checkAuth` + 編集で使う全列）。クライアントの
`$select` を変更したら fields も合わせて更新し、再起動する。

> 関連スクリプト: `scripts/setup_contact_self.py`（contact Self 権限 + Webapi 設定を
> content JSON 正本方式で冪等作成）/ `scripts/relink_table_permissions.py`（デプロイ後の一括修復）。

---

### まとめ: API でテーブル権限を完結する再利用パターン

```python
from create_table_permission import create_table_permission

# Global CRUD（全レコードアクセス）
create_table_permission(
    table_logical_name="geek_incident",
    display_name="geek_incident - Global CRUD",
    scope=756150000,  # Global
    read=True, write=True, create=True,
    append=True, appendto=True,
    role_ids=["e7cb523c-1d5f-f111-a825-7ced8d3b33ec"],  # Authenticated Users
)

# Self（自分のレコードのみ）
create_table_permission(
    table_logical_name="contact",
    display_name="contact - Self Read Write",
    scope=756150004,  # Self
    read=True, write=True, create=False,
    role_ids=["e7cb523c-1d5f-f111-a825-7ced8d3b33ec"],  # Authenticated Users
)
```

### scope 値一覧

| 値 | スコープ | contactrelationship | 用途 |
|---|---------|---|---|
| 756150000 | Global | null | 全レコード |
| 756150004 | Self | null | 自分のレコードのみ（★推奨） |
| 756150001 | Contact | 必要（非推奨） | 親 Contact 配下 |
| 756150002 | Account | 必要 | 自分の Account 配下 |
| 756150003 | Parent | 必要 | 親権限に紐づくレコード |

### エラーコード→教訓マッピング

| HTTP | OData Code | メッセージ | 原因 | 教訓 |
|------|-----------|---------|------|------|
| 401 | 90040107 | Anti-forgery token required | CSRF トークン未送信 | 教訓 1 |
| 403 | 90040120 | EntityPermissionReadIsMissing | type=18 の N:N association が空（content 配列だけでは不十分。$ref POST 未実行 / YAML デプロイで未紐付け） | 教訓 2・14 |
| 403 | 90040101 | AttributePermissionIsMissing | `Webapi/{table}/fields` 許可リスト外の列を要求（$select なし＝`*` 要求も含む） | 教訓 16 |
| 403 | 90040106 | AppendTo permission missing | 参照先テーブルに appendto=false | 教訓 4 |
| 404 | 9004010D | CDS entity resolution failed | @odata.bind のターゲットテーブルが違う | 教訓 4 |
| 404 | 9004010C | Resource not found for segment | `Webapi/{table}/enabled` 未設定 or languageid null | 教訓 8 |
| 302 | — | Redirect to /profile | ProfileRedirectEnabled=true | 教訓 5 |

---

## 核心原則

1. **`pac pages upload-code-site` がサイト作成とデプロイの両方を行う** — API でサイトを事前作成する必要はない
2. **初回は Inactive Sites に作成される** → PP API (`2022-03-01-preview`) で `activate_site.py` を使ってアクティブ化
3. **2回目以降は upload-code-site → restart の2ステップだけ**
4. **Post-Upload Fix は不要** — `upload-code-site` が header/footer/page を正しく構成する
5. **`.powerpages-site/` は upload-code-site が自動管理する** — ただし `site-settings/` YAML は手動追加して永続化できる（下記参照）
6. **`adx_website` レコードは絶対に削除しない** — EDM 2.0 でもランタイムが起動時に参照する
7. **環境のクリーンアップ時は PP API のサイト一覧と照合してから削除する** — 誤削除で 500 エラー
8. **`credentials: "same-origin"` を使う** — `"include"` ではない（same-site Cookie 認証）
9. **powerpagecomponent type=18 には `powerpagesitelanguageid` が必須** — 未設定だと 404 になる

## ワークフロー

```
初回:
  npm run build
  → pac pages upload-code-site          ← Inactive Sites に作成
  → py portal/scripts/activate_site.py  ← PP API でアクティブ化 (api-version=2022-03-01-preview)
  → py portal/scripts/setup_contact_webapi.py
  → Restart (deploy.py --skip-build or PP API restart)

2回目以降:
  npm run build → pac pages upload-code-site → Restart
  (deploy.py がビルド・アップロード・リスタートを一括実行)
```

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

## ★ Web API 共有クライアント (`src/shared/powerPagesApi.ts`)

**実装方法の概要**: すべての `/_api/` 呼び出しは共有クライアント `src/shared/powerPagesApi.ts` を通す。
Power Pages の SPA は Dataverse Web API（`/_api`）を**直接 fetch** する（Code Apps の
`@microsoft/power-apps/data` SDK のようなライブラリは無い）。

upstream `integrate-webapi` スキル準拠の設計:
- anti-forgery トークンを**全リクエスト**（GET 含む）に付与
- 429・5xx を指数バックオフでリトライ（最大 3 回）
- 403/90040107（トークン期限切れ）を検出してトークンを再取得・リトライ
- `buildODataUrl`・`getFormattedValue`・`fetchAllPages`・`bindLookup` など OData ヘルパー群

> **完全な実装コード**（`powerPagesFetch`/`powerPagesFetchResponse`・`WebApiErrorCode`・OData ヘルパー・
> ページネーション・サービスレイヤーパターン）は [Dataverse クライアント実装](references/dataverse-client.md) を参照。

最小の利用例:

```typescript
import {
  powerPagesFetch,
  buildODataUrl,
  type ODataCollectionResponse,
} from "@/shared/powerPagesApi";
import { mapIncidentEntity, type IncidentEntity } from "@/types/incident";

// 取得（ページネーション付き）
const response = await powerPagesFetch<ODataCollectionResponse<IncidentEntity>>(
  buildODataUrl("geek_incidents", { "$select": "geek_incidentid,geek_name,geek_status", "$orderby": "createdon desc" }),
  { headers: { Prefer: "odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=20" } }
);
const incidents = (response?.value ?? []).map(mapIncidentEntity);

// 作成（書き込みは内部で anti-forgery token を自動付与）
await powerPagesFetch("/_api/geek_incidents", {
  method: "POST",
  body: JSON.stringify({ geek_name: "新規チケット", geek_status: 100000000 }),
});
```

### Code Apps との接続方式の違い

| 観点 | Power Pages（このスキル） | Code Apps |
|------|--------------------------|-----------| 
| 接続 | `/_api/` を直接 `fetch` | `@microsoft/power-apps/data` SDK |
| 取得 | `powerPagesFetch`（upstream 準拠） | `client.retrieveMultipleRecordsAsync` |
| クエリ記法 | OData 文字列（`$select=...&$orderby=...`） | オブジェクト（`select: [...], orderBy: [...]`） |
| レスポンス | `ODataCollectionResponse<T>`（throw ベース） | `{ success, data, error }`（判定） |
| 認証 | セッション Cookie（相対 URL、自動） | コネクタ + SDK |
| ユーザー実体 | contact（`Portal.User`） | systemuser（`getContext().user`） |
| 書き込み保護 | anti-forgery トークン（全リクエスト自動） | SDK が内部処理 |
| 認可 | テーブル権限 + Web ロール | Dataverse セキュリティロール |

> 詳細なコード対比は [Dataverse クライアント実装 §8](references/dataverse-client.md) を参照。

---

## ★ SSO + プロフィール編集 (デフォルト実装)

> **公式リファレンス**: [microsoft/power-platform-skills setup-auth](https://github.com/microsoft/power-platform-skills/tree/main/plugins/power-pages/skills/setup-auth)

**実装方法の概要**: 認証はサーバー側のセッション Cookie で完結する。クライアントはトークンを
持たず、ポータルランタイムが注入する `window.Microsoft.Dynamic365.Portal.User` を信頼して
「ログイン済みか」「誰か」を判定する。**認証判定で `/_api/contacts` をクエリしてはいけない**
（教訓 6）。

`AUTH_PROVIDERS` 配列で対応 IdP を管理し、`src/hooks/use-auth.ts` の `useAuth()` が以下をすべて提供する:

| 機能 | 実現方法 |
|------|---------|
| 認証状態判定 | `Portal.User` を読むだけ（API 呼び出しなし） |
| ① SSO ログイン | `/_layout/tokenhtml` + `resolveProviderIdentifier()` → form POST to `/Account/Login/ExternalLogin` |
| ② サインアウト | `/Account/Login/LogOff?returnUrl=%2F` へ遷移（ローカルログアウト） |
| ③ セッション keepalive | 定期的に `/_layout/tokenhtml` をフェッチしてセッション Cookie を更新 |
| ④ ログインボタン | ヘッダーで `login`/`logout` を認証状態に応じて出し分け |

### 対応 Identity Provider

| 種別 | Provider Identifier | 推奨用途 |
|------|---|---|
| **Entra ID (workforce)** | `Portal.tenant` から runtime 解決（`login.windows.net/{tenantId}/`） | 社員向け内部ポータル |
| **Entra External ID (CIAM)** | `Authentication/OpenIdConnect/{name}/AuthenticationType` の値（ciamlogin.com URL） | **顧客向けポータル（推奨）** |
| **OIDC (Generic)** | `Authentication/OpenIdConnect/{name}/AuthenticationType` の値 | Okta, Auth0 など |
| **SAML2** | `Authentication/SAML2/{name}/AuthenticationType` の値 | ADFS など |
| **ローカル認証** | N/A（`/SignIn` に `PasswordValue` フィールドで POST） | 外部 IdP 不要の場合のみ |

### SSO ログインフロー（外部 IdP — 共通パターン）

```
① useAuth().login() 呼び出し
   ↓
② AUTH_PROVIDERS[0] から provider を選択
   ↓
③ fetch("/_layout/tokenhtml") → anti-forgery token 取得
   ↓
④ resolveProviderIdentifier(provider) で provider 識別子を解決
   - Entra ID: Portal.tenant → "https://login.windows.net/{tenantId}/"
   - Entra External ID / OIDC: AUTH_PROVIDERS の providerIdentifier を直接使用
   ↓
⑤ form POST → /Account/Login/ExternalLogin
   { provider, returnUrl: "/", __RequestVerificationToken }
   ↓
⑥ Power Pages → IdP へリダイレクト → SSO 認証
   ↓
⑦ IdP → callback → セッション Cookie 設定 → returnUrl へリダイレクト
```

> **重要**: Entra ID の Provider identifier は `https://login.windows.net/{tenantId}/` であり
> `https://login.microsoftonline.com/{tenantId}/` ではない。
> Entra External ID は `https://{subdomain}.ciamlogin.com/{tenantId}`（末尾 `/v2.0/` なし）。

### ローカル認証ログインフロー

```
① localLogin(email, password) 呼び出し
   ↓
② fetch("/_layout/tokenhtml") → anti-forgery token 取得
   ↓
③ form POST → /SignIn（/Account/Login/Login ではない）
   { Email, PasswordValue, ReturnUrl: "/", __RequestVerificationToken }
   ★ フィールド名は PasswordValue（Password ではない）
```

### ログアウトモード

| モード | 設定 | 動作 |
|---|---|---|
| **ローカルログアウト**（デフォルト） | `RPInitiatedLogout` 未設定 | Power Pages セッションのみクリア。次回は SSO。 |
| **フェデレーテッドログアウト** | `RPInitiatedLogout=true` + `PostLogoutRedirectUri={site-url}/` | IdP セッションも含めてクリア。 |

### セッション keepalive

SPA ではページ遷移がクライアント側で完結するため、サーバーへのリクエストが発生しない。
セッション Cookie の `SlidingExpiration` はサーバーリクエスト時にしか更新されないため、
keepalive なしだとユーザーがアクティブに操作中でもセッションがサイレントに期限切れする。

```typescript
// 10分間隔で /_layout/tokenhtml をフェッチしてセッションを維持
useEffect(() => {
  if (!isAuthenticated) return;
  const id = setInterval(() => {
    fetch("/_layout/tokenhtml", { credentials: "same-origin" }).catch(() => {});
  }, 10 * 60 * 1000);
  return () => clearInterval(id);
}, [isAuthenticated]);
```

> **完全な実装コード**（`AUTH_PROVIDERS` 配列・`use-auth.ts`・SSO/ローカルログイン・サインアウト・
> ログインボタン UI・`RequireAuth` 認証ガード・ルート組み込み・UI フロー図・
> Entra External ID・ローカル認証・フェデレーテッドログアウト・クレームマッピング）は
> [認証実装](references/authentication.md) を参照。

### Code Apps との認証の違い

| 観点 | Power Pages | Code Apps |
|------|-------------|-----------|
| 認証の場所 | サーバー側（セッション Cookie） | クライアント + コネクタ |
| トークン管理 | なし（Cookie 自動送信） | SDK が内部管理 |
| ログイン | `/_layout/tokenhtml` + form POST to ExternalLogin | コネクタのサインイン |
| Provider解決 | `resolveProviderIdentifier()` （Entra ID: Portal.tenant、他: providerIdentifier 直接） | コネクタが管理 |
| ユーザー情報 | `Portal.User`（contact） | `getContext().user`（systemuser） |
| セッション維持 | keepalive（`/_layout/tokenhtml` 定期フェッチ） | SDK が管理 |

---

## ★ Web ロール管理 (YAML ファイル — upstream 標準)

> **公式リファレンス**: [microsoft/power-platform-skills create-webroles](https://github.com/microsoft/power-platform-skills/tree/main/plugins/power-pages/skills/create-webroles)

Web ロールは `.powerpages-site/web-roles/` 配下の YAML ファイルで定義し、`pac pages upload-code-site` でデプロイする。

```yaml
# .powerpages-site/web-roles/authenticated-users.yml
anonymoususersrole: false
authenticatedusersrole: true   # ← ログインユーザーの既定ロール
id: <UUID v4>
name: Authenticated Users
```

**標準ロール構成:**

| ファイル | authenticatedusersrole | anonymoususersrole | 用途 |
|---|---|---|---|
| `administrators.yml` | false | false | 管理者 |
| `authenticated-users.yml` | **true** | false | ログイン済みユーザーの既定ロール |
| `anonymous-users.yml` | false | **true** | 未認証ユーザーの既定ロール |

> **ルール**: `authenticatedusersrole: true` と `anonymoususersrole: true` はそれぞれ 1 ファイルのみ設定可。

> 完全な YAML フォーマット・UUID 生成・テーブル権限との N:N 紐付けは [Enhanced Data Model テーブル権限](references/enhanced-data-model-permissions.md) を参照。

---

## ★ テーブル Web API 有効化 (EDM 2.0 — Contact / カスタムテーブル共通)

> ✅ **EDM 2.0 Code Site でも `Webapi/{table}/enabled` + `Webapi/{table}/fields` は必須**（教訓 8 参照）。
> Contact だけでなく **カスタムテーブルにも適用される**。type=18 テーブル権限は「認可」、
> Webapi/* 設定は「`/_api/{table}` エンドポイントの公開」で役割が異なり、両方そろって初めて
> `/_api/` が 200 を返す。どちらか欠けると 404 (9004010C)。
> 以下は Contact を例にした手順だが、`contact` を任意のテーブル論理名に置き換えてそのまま使える。

### 重大な教訓: 404 "Resource not found for the segment contact"

**エラーコード 9004010C** が発生する場合、以下の **4 つのレイヤーすべて** が正しく設定されている必要がある:

| # | レイヤー | テーブル | 紐付け先 |
|---|---------|---------|---------|
| 1 | `adx_sitesettings` | `Webapi/contact/enabled=true` | `adx_websites` |
| 2 | `adx_sitesettings` | `Webapi/contact/fields=*` | `adx_websites` |
| 3 | `powerpagecomponent` type=18 | テーブル権限 (Self) | `powerpagesites` + **`powerpagesitelanguages`** |
| 4 | N:N association（$ref POST） | `powerpagecomponent_powerpagecomponent` でロールを紐付け | type=11 (Authenticated Users) |

### ⚠️ 致命的な落とし穴: `powerpagesitelanguageid`

```
根本原因: powerpagecomponent type=18 に powerpagesitelanguageid が null だと、
         Power Pages ランタイムがテーブル権限を認識せず 404 を返す。

確認方法:
GET /api/data/v9.2/powerpagecomponents({perm_id})?$select=_powerpagesitelanguageid_value

修正方法:
PATCH /api/data/v9.2/powerpagecomponents({perm_id})
{
  "powerpagesitelanguageid@odata.bind": "/powerpagesitelanguages({lang_id})"
}
```

### powerpagecomponent type=18 の正しい content 形式

```json
{
  "entitylogicalname": "contact",
  "entityname": "contact - Self Read Write",
  "scope": 756150004,
  "read": true,
  "write": true,
  "create": false,
  "delete": false,
  "append": false,
  "appendto": false
}
```

**注意:**
- ❌ `mspp_entityname`, `mspp_scope: "756150001"` (文字列) — 古いフォーマット、動作しない場合がある
- ✅ `entitylogicalname`, `scope: 756150004` (整数), `read: true` (bool) — system format
- ⚠️ `756150001` は Contact スコープ（親 Contact 配下）であり Self ではない。Self は `756150004`。

### scope 値一覧

| 値 | スコープ | contactrelationship | 用途 |
|---|---------|---|------|
| 756150000 | Global | null | 全レコード |
| 756150004 | Self | null | 自分のレコードのみ（★推奨） |
| 756150001 | Contact | 必要（非推奨） | 親 Contact 配下 |
| 756150002 | Account | 必要 | 自分の Account 配下 |
| 756150003 | Parent | 必要 | 親権限に紐づくレコード |

### setup_contact_webapi.py（正しい実装）

```python
# 1. adx_sitesettings (→ adx_websites にバインド)
create_site_setting("Webapi/contact/enabled", "true", website_id)
create_site_setting("Webapi/contact/fields", "*", website_id)  # system table は * 推奨

# 2. powerpagecomponent type=18 (★ powerpagesitelanguageid 必須、content に webrole を含める)
content = json.dumps({
    "entitylogicalname": "contact",
    "entityname": "contact - Self Read Write",
    "scope": 756150004,  # Self (NOT 756150001 which is Contact scope)
    "read": True, "write": True, "create": False,
    "delete": False, "append": False, "appendto": False,
    "websiteid": adx_website_id,                       # ← 必須
    "adx_entitypermission_webrole": [auth_role_id],    # ← YAML/git シリアライズ形
})
body = {
    "powerpagecomponenttype": 18,
    "name": "contact - Self Read Write",
    "content": content,
    "powerpagesiteid@odata.bind": f"/powerpagesites({site_id})",
    "powerpagesitelanguageid@odata.bind": f"/powerpagesitelanguages({lang_id})",  # ★ 必須！
}

# 3. ★ N:N association を $ref POST で作成（＝ランタイム正本。content 配列だけでは 403）
#   POST .../powerpagecomponents({perm_id})/powerpagecomponent_powerpagecomponent/$ref
#        body: {"@odata.id": ".../powerpagecomponents({auth_role_id})"}
#   既存権限へのロール追加も content PATCH + この $ref POST の両方を冪等に行う
```

> ⚠️ **よくあるミス（修正済み）:**
> - `powerpagesitelanguageid` が null → ランタイムが権限を無視して 404
> - **N:N association を作成せず content 配列だけ書く → 403 (90040120)**（教訓 2・14）
> - content に `mspp_` プレフィックスの文字列値 → 整数・bool 値が正しい
> - `credentials: "include"` → 正しくは `"same-origin"`
> - `Webapi/<table>/fields` に明示リストのみ → 列指定なし取得（`*`）で 403 になるため `*` 推奨（教訓 16）

---

## ★ デバッグ用 Site Settings

### Webapi/error/innererror

開発・デバッグ中は以下を有効にする:

```python
# Dataverse API で直接追加
body = {
    "adx_name": "Webapi/error/innererror",
    "adx_value": "true",
    "adx_websiteid@odata.bind": f"/adx_websites({website_id})",
}
requests.post(f"{DV}/api/data/v9.2/adx_sitesettings", headers=h, json=body)
```

これにより `/_api/` のエラーレスポンスに `innererror` が含まれ、デバッグが容易になる。

> ⚠️ **本番環境では `false` に戻す** — 内部エラー情報が漏洩するリスクがある。

---

## ★ `.powerpages-site/site-settings/` による永続化

`pac pages upload-code-site` は `.powerpages-site/` フォルダの内容を同期する。
`site-settings/` に Webapi 設定の YAML を配置すると、デプロイ時に自動反映される。

### YAML フォーマット

```yaml
# .powerpages-site/site-settings/Webapi-contact-enabled.sitesetting.yml
id: <既存レコードの adx_sitesettingid>
name: Webapi/contact/enabled
source: 0
value: "true"
```

```yaml
# .powerpages-site/site-settings/Webapi-contact-fields.sitesetting.yml
id: <既存レコードの adx_sitesettingid>
name: Webapi/contact/fields
source: 0
value: "*"
```

```yaml
# .powerpages-site/site-settings/Webapi-error-innererror.sitesetting.yml
id: <新規 GUID>
name: Webapi/error/innererror
source: 0
value: "true"
```

**ID の取得方法:** Dataverse から `adx_sitesettings` をクエリして `adx_sitesettingid` を取得。
新規の場合は任意の GUID を生成。

---

## エラーコード早見表

| HTTP | OData Code | メッセージ | 原因 | 対策 |
|------|-----------|---------|------|------|
| 401 | 90040107 | Anti-forgery token required | CSRF トークン未送信 | `/_layout/tokenhtml` から取得してヘッダー付与 |
| 403 | 90040120 | EntityPermissionReadIsMissing | type=18 の N:N association が空（content 配列だけでは不十分） | `$ref` POST で association を作成（教訓 2・14） |
| 403 | 90040101 | AttributePermissionIsMissing | `Webapi/{table}/fields` 許可リスト外の列を要求（$select なし＝`*` 要求も含む） | fields にクライアントの SELECT 全列を列挙（迷えば `*`）（教訓 16） |
| 403 | 90040106 | AppendTo permission missing | 参照先テーブルに appendto=false | EDM content で `"appendto": true` に更新 |
| 404 | 9004010D | CDS entity resolution failed | `@odata.bind` のターゲットテーブルが違う | `ManyToOneRelationships` で正しい参照先を確認 |
| 404 | 9004010C | Resource not found for segment | `Webapi/{table}/enabled` 未設定 or `powerpagesitelanguageid` null | enabled=true + languageid 設定（教訓 8） |
| 400 | 9004010A | Invalid column name | `$select` に存在しないカラム名 | `EntityDefinitions` でカラム名確認 |
| 302 | — | Redirect to /profile | `ProfileRedirectEnabled=true` | サイト設定で `false` に変更 |
| 302 | — | Login redirect | 未認証 | SSO ログイン or `redirect: "manual"` で検知 |

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
    "deploy": "npm run build && pac pages upload-code-site --rootPath .",
    "deploy:full": "py scripts/deploy.py"
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

```bash
cd portal
npm run build
pac pages upload-code-site --rootPath .
# ★ upload-code-site は既存 type=18 の content.adx_entitypermission_webrole を消すため、
#   デプロイのたびに全テーブル権限の Web ロールを再付与する（教訓 15）
py ../.github/skills/power-pages/scripts/relink_table_permissions.py
# → relink スクリプトが PP_SUBDOMAIN 設定時に自動で再起動する
#   （未設定の場合は手動再起動）
py ../.github/skills/standard/scripts/_restart.py
```

> `/profile`（contact Self）を使う場合は、初回のみ `setup_contact_self.py` で
> contact 権限と `Webapi/contact/enabled|fields` を作成しておく（教訓 16）:
> ```bash
> py ../.github/skills/power-pages/scripts/setup_contact_self.py
> ```

---

## 既知の無害な警告

Power Pages ホスト (React 17) と SPA (React 19) の共存により以下が発生するが、**機能に影響なし**:

```
Unsatisfied version 16.14.0 from @microsoft/powerpages-host of shared singleton module react-dom (required ^17.0.0)
Some icons were re-registered...
```

SPA は独自の React 19 バンドルで動作するため、ホスト側の React 17 とは干渉しない。

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
