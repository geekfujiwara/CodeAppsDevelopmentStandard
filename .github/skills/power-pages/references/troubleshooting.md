# Power Pages 異常系・トラブルシューティング

正常系は [SKILL.md](../SKILL.md) を参照。


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


## エラーコード早見表

| HTTP | OData Code | メッセージ | 原因 | 対策 |
|------|-----------|---------|------|------|
| 401 | 90040107 | Anti-forgery token required | CSRF トークン未送信 | `/_layout/tokenhtml` から取得してヘッダー付与 |
| 403 | 90040120 | EntityPermissionReadIsMissing | type=18 の N:N association が空（content 配列だけでは不十分） | `$ref` POST で association を作成（教訓 2・14） |
| 403 | 90040101 | AttributePermissionIsMissing | `Webapi/{table}/fields` 許可リスト外の列を要求（$select なし＝`*` 要求も含む） | fields にクライアントの SELECT 全列を列挙（迷えば `*`）（教訓 16） |
| 403 | 90040106 | AppendTo permission missing | 参照先テーブルに appendto=false | EDM content で `"appendto": true` に更新（account リレーション時は `account` 権限に付与・教訓 21） |
| 403 | — | Account スコープで read は通るが create が 403 | POST 本文に account Lookup が無い／`contact.parentcustomerid` 未設定／権限が create=false | POST で `@odata.bind`、contact に取引先企業を紐付け、create=true を付与（教訓 21） |
| 404 | 9004010D | CDS entity resolution failed | `@odata.bind` のターゲットテーブルが違う | `ManyToOneRelationships` で正しい参照先を確認 |
| 404 | 9004010C | Resource not found for segment | `Webapi/{table}/enabled` 未設定 or `powerpagesitelanguageid` null | enabled=true + languageid 設定（教訓 8） |
| 400 | 9004010A | Invalid column name | `$select` に存在しないカラム名 | `EntityDefinitions` でカラム名確認 |
| 302 | — | Redirect to /profile | `ProfileRedirectEnabled=true` | サイト設定で `false` に変更 |
| 302 | — | Login redirect | 未認証 | SSO ログイン or `redirect: "manual"` で検知 |

---


## 見出しの文字色が黒くなる（教訓 20）

**症状**: `<h1>` などの見出しが、親要素に `color: #fff` を設定していても黒／濃いグレーで表示される。`localhost`（`npm run dev`）では正しく白で表示されるのに、本番デプロイ後だけ黒くなる。

**原因**: Power Pages のサイト自体が読み込む既定のテーマ CSS（Bootstrap ベース）が `h1`/`h2` 等の見出し要素に既定の文字色を指定しており、これが CSS の継承より優先される。継承された `color`（祖先要素の指定）は、要素自身に対する明示的な `color` 指定（たとえ詳細度の低いタグセレクタでも）には勝てない。この既定テーマ CSS は Power Pages 本番ランタイムでのみ読み込まれるため、**ローカル（`npm run dev`）では再現しない**。

**対策**: 見出し要素のセレクタに**必ず明示的に `color` を指定**する（祖先要素の `color` に依存しない）。

```css
.hero h1 {
  color: #fff;   /* 明示指定が必須。祖先の color: #fff だけでは効かない */
}
```

**確認方法**: ブラウザの devtools で `getComputedStyle(el).color` を確認する、または Playwright で:

```js
const color = await page.locator('h1').first().evaluate(el => getComputedStyle(el).color);
```

> この問題は localhost では再現しないため、デザイン変更を `npm run dev` で確認した後も、**見出し色は本番デプロイ後に必ず目視確認**する（[SKILL.md](../SKILL.md) の核心原則 11 参照）。

---


## アクセススコープ（Self / Account）の異常系

まず [SKILL.md](../SKILL.md) Step 4 の `--verify-only` を実行して、欠落を機械的に洗い出す。

```powershell
python ../.github/skills/power-pages/scripts/setup_access_scope.py --scope account --verify-only
```

### 症状別の切り分け

| # | 症状 | 主な原因 | 対処 |
|---|---|---|---|
| 1 | read はできるが create が 403 | 業務テーブル権限の `create` が false | `--scope account` を再実行する |
| 2 | create が 403 / `90040106` | `account` 権限が無い、または `appendto` が false | `account` 権限（read + appendto）を作成する |
| 3 | create が 403（エラーコードなし） | POST 本文に account への `@odata.bind` が無い | `bindLookup()` で Lookup をバインドする |
| 4 | read が 0 件・create も 403 | `contact.parentcustomerid` が未設定 | 管理者が紐づける（[紐づけ依頼フロー](account-link-request-flow.md)） |
| 5 | 403 / `90040120` | 権限と Web ロールの N:N association が無い | スクリプト再実行（手動作成した権限も対象） |
| 6 | 404 | `Webapi/{table}/enabled` が未設定 | スクリプトが作成する |
| 7 | 一部ユーザーだけ 403 | 専用 Web ロールが contact に割り当てられていない | 対象 contact にロールを割り当てる |
| 8 | デプロイ後に急に 403 | `upload-code-site` で association が切れた（教訓 15） | `relink_table_permissions.py` を実行する |

### 「他社のデータが見える」場合（最優先で対応）

| 原因 | 確認方法 |
|---|---|
| scope が Global（`756150000`）になっている | `--verify-only` の出力に `scope=Global` が無いか |
| `accountrelationship` が未設定（null） | 同上。Account スコープでリレーションが空だと絞り込みが効かない |
| `contact.parentcustomerid` が誤った account を指す | 管理画面／モデル駆動型アプリで確認 |
| Web ロールを匿名ユーザーロールに割り当てた | ロールの `anonymoususersrole` が false か |

原因を直したうえでサイトを再起動し、影響範囲（誰がいつ何を見られたか）を Dataverse の監査ログで確認する。

### リレーションのスキーマ名が分からない

```powershell
python ../.github/skills/power-pages/scripts/setup_access_scope.py --list-relationships
```

表示名（例:「取引先企業」）や Lookup 列の論理名を指定しているケースがほとんど。
`verify_relationship()` は不一致を検出すると候補を出力する。

### `parentcustomerid` が SSO サインイン時に空になる

Entra 外部 ID などでサインインして自動生成された contact には、既定で `parentcustomerid` が
設定されない（仕様）。管理者による紐づけを前提とした運用で埋める。
メールドメインだけで会社を推測して自動紐づけするのは危険（フリーメール・共有ドメイン・子会社の取り違え）。

### スクリプトが途中で止まる

| メッセージ | 意味 |
|---|---|
| `不正な scope 値です` | content に想定外の scope を渡した |
| `account 権限に write=true が指定されています` | 取引先企業の読み取り専用要件に違反している |
| `リレーション '...' が account に存在しません` | スキーマ名の指定ミス。出力された候補から選ぶ |
| `powerpagesitelanguages が見つかりません` | サイトの言語設定が未構成（教訓 8） |
| `auth_helper.py が見つかりません` | standard スキルの scripts が同じリポジトリにあるか確認 |

---


## 既知の無害な警告

Power Pages ホスト (React 17) と SPA (React 19) の共存により以下が発生するが、**機能に影響なし**:

```
Unsatisfied version 16.14.0 from @microsoft/powerpages-host of shared singleton module react-dom (required ^17.0.0)
Some icons were re-registered...
```

SPA は独自の React 19 バンドルで動作するため、ホスト側の React 17 とは干渉しない。

---
