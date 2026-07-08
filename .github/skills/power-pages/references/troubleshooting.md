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
| 403 | 90040106 | AppendTo permission missing | 参照先テーブルに appendto=false | EDM content で `"appendto": true` に更新 |
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


## 既知の無害な警告

Power Pages ホスト (React 17) と SPA (React 19) の共存により以下が発生するが、**機能に影響なし**:

```
Unsatisfied version 16.14.0 from @microsoft/powerpages-host of shared singleton module react-dom (required ^17.0.0)
Some icons were re-registered...
```

SPA は独自の React 19 バンドルで動作するため、ホスト側の React 17 とは干渉しない。

---
