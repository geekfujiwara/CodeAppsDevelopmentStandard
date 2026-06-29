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


## 既知の無害な警告

Power Pages ホスト (React 17) と SPA (React 19) の共存により以下が発生するが、**機能に影響なし**:

```
Unsatisfied version 16.14.0 from @microsoft/powerpages-host of shared singleton module react-dom (required ^17.0.0)
Some icons were re-registered...
```

SPA は独自の React 19 バンドルで動作するため、ホスト側の React 17 とは干渉しない。

---
