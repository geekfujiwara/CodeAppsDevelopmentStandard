# モデル駆動型アプリ トラブルシューティング

## トラブルシューティング

### 複数グループがあるのに最初のグループしか表示されない（最重要）

- **原因**: `ShowGroups="true"` が Area 要素に指定されていない
- **解決**: `<Area Id="MainArea" ShowGroups="true" IntroducedVersion="7.0.0.0">` を使用
- **注意**: ValidateApp はこの問題を**検出しない**。エラーなしで公開でき、見た目だけが壊れる
- ブラウザキャッシュをクリア（Ctrl+Shift+R）して確認

### レガシー Web クライアント警告が表示される

- **原因**: `clienttype` が未指定または `4` 以外
- **解決**: AppModule 作成/更新時に `"clienttype": 4` を必ず指定
- 既存アプリは PATCH で `clienttype` を `4` に更新可能

### "App can't have multiple site maps" (0x80050111)（最重要）

既存アプリの SiteMap を変更したい場合に `AddAppComponents` で**新しい SiteMap を追加しようとすると必ず発生する**。
アプリには SiteMap を 1 つしか持てない。

```
❌ 新しい SiteMap を作成 → AddAppComponents で追加 → 0x80050111 エラー
✅ 既存 SiteMap を見つけて PATCH で XML を直接更新する
```

**既存 SiteMap の特定方法**:

```python
# Step 1: appmodulecomponent テーブルから componenttype=62 (SiteMap) を取得
# ★ appmoduleidunique でのフィルタは不可（プロパティが存在しない）
resp = requests.get(
    f"{DATAVERSE_URL}/api/data/v9.2/appmodulecomponents"
    f"?$filter=componenttype eq 62"
    f"&$select=appmodulecomponentid,objectid"
    f"&$top=100",
    headers=headers,
)
# objectid が SiteMap の ID

# Step 2: 各 SiteMap ID で sitemaps テーブルを GET して XML を確認
for comp in resp.json()["value"]:
    sm = requests.get(
        f"{DATAVERSE_URL}/api/data/v9.2/sitemaps({comp['objectid']})"
        f"?$select=sitemapxml,sitemapnameunique",
        headers=headers,
    ).json()
    # XML 内のテーブル参照で目的のアプリの SiteMap を特定

# Step 3: 既存 SiteMap の XML を PATCH で更新
requests.patch(
    f"{DATAVERSE_URL}/api/data/v9.2/sitemaps({existing_sm_id})",
    headers=headers,
    json={"sitemapxml": new_sitemap_xml},
)
```

> **教訓**: SiteMap を誤って新規作成してしまった場合は `DELETE sitemaps({id})` で削除する。
> `appmodulecomponent` テーブルは `appmoduleidunique` プロパティを持たないため、
> アプリ ID でフィルタできない。全件取得して objectid で照合する。

### "App does not contain Site Map" (ValidateApp)

- SiteMap が作成されていないか、`AddAppComponents` でアプリに追加されていない
- `isappaware: true` が設定されていない

### "already exists" (AppModule 作成時)

- `uniquename` が既に使用されている
- べき等パターンで既存を検索してから作成すること

### "webresourceid is required"

- `webresourceid` が省略されている
- デフォルト ID `953b9fac-1e5e-e611-80d6-00155ded156f` を使用

### フォーム/ビューが見つからない

- テーブル作成直後はメタデータ同期に時間がかかる場合がある
- `PublishAllXml` を事前に実行:
  ```python
  api_post("PublishAllXml", {})
  ```

### アプリが表示されない

- セキュリティロールが関連付けられていない
- `PublishXml` が実行されていない
- ブラウザキャッシュをクリア（Ctrl+Shift+Del）

### appmodulecomponent の直接作成がエラーになる

- **原因**: `appmodulecomponent` テーブルは Web API での `Create` 操作を**サポートしていない**
- **対処**: `AddAppComponents` アクションでビュー・フォーム・SiteMap を追加する（Entity Type=1 は不要）
- **詳細**: UI で作成したアプリには Entity (Type=1) コンポーネントが登録されるが、API 作成では savedquery/systemform のみ。動作に影響なし
