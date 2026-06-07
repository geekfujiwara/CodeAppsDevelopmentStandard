# 運用上の落とし穴とリカバリ手順

> Power Pages Code Site の実運用で踏みやすい地雷と、壊れたときの復旧手順。
> 実環境で検証済みの教訓をまとめる。

---

## 危険操作（絶対にやってはいけないこと）

### 1. `adx_website` レコードを削除してはいけない

**EDM 2.0 Code Site であっても** ポータルランタイム (Adxstudio) は `adx_website` レコードを参照する。
`upload-code-site` が初回アップロード時に自動作成するこのレコードを削除すると:

- ランタイムが起動時に `NullReferenceException` → 500 エラー
- スタックトレース: `ToOrganizationService` → `FetchSolutions`
- サイトが完全にアクセス不能になる

**復旧方法**: `adx_website` を POST で再作成 → restart

```python
body = {
    "adx_name": f"{SITE_NAME} - {SUBDOMAIN}",
    "adx_primarydomainname": f"{SUBDOMAIN}.powerappsportals.com",
    "adx_website_language": 1033,  # or 1041 for Japanese
}
requests.post(f"{DATAVERSE_URL}api/data/v9.2/adx_websites", headers=headers, json=body)
```

### 2. PP API `POST /websites` で Code Site を作ってはいけない

PP API の `POST /powerpages/environments/{envId}/websites` は**常にクラシックポータル**を作成する。
Code Site は `pac pages upload-code-site` でのみ作成可能。

### 3. 孤立レコードのクリーンアップ時の注意

| テーブル | 安全に削除可能? | 注意 |
|---------|----------------|------|
| `powerpagesites` | ⚠ 慎重に | 対応する PP API サイトが存在しないもののみ |
| `adx_websites` | ❌ 基本削除禁止 | ランタイムが参照。削除すると 500 エラー |
| `adx_websitelanguages` | ❌ 削除禁止 | サイトの言語バインディング |
| `adx_webtemplates` | ❌ 削除禁止 | Header/Footer のレンダリングに必須 |

**クリーンアップ前に必ず確認すること:**
1. PP API (`GET /websites?api-version=2024-10-01`) でアクティブなサイト一覧を取得
2. 各サイトの `websiteRecordId` (= `powerpagesiteid`) を確認
3. アクティブサイトに紐付くレコードは絶対に消さない
4. `adx_websites` は基本的に消さない

### 4. 環境内に 1つの Code Site しか作成しない

同じ環境に複数の Code Site を作ると `adx_website` の紐付けが曖昧になる。
1 環境 = 1 Code Site を推奨。

---

## 重要な教訓

1. **Code Site は最初から Code Site として作成する** — クラシックサイトからの変換は不可
2. **`pac pages upload-code-site` が正しい作成方法** — PP API の `POST /websites` はクラシックポータル
3. **Enhanced Data Model (v2.0) が自動的に使われる**
4. **Site Settings は `adx_sitesettings` + `adx_websiteid` バインド** — テーブルレコードとして作成
5. **`adx_website` レコードは EDM 2.0 でもランタイムに必須** — 削除禁止
6. **孤立レコードは `FetchSolutions` の NullRef を引き起こす** — 削除対象を間違えると悪化する
7. **デプロイ失敗時のリカバリは「再 upload-code-site」が最善**
8. **壊れたサイトは修復より新規作成が早い**
9. **初回プロビジョニング後のコールドスタートには 2〜3 分かかる** — 60 秒タイムアウトは正常
10. **`LoginButtonAuthenticationType` の値は Authority URL** — `https://login.microsoftonline.com/{TENANT_ID}/`（`sts.windows.net` ではない）
11. **SSO 設定変更後は必ず PP API で restart** — Site Settings は起動時キャッシュ（最大 15 分）
12. **テーブル権限は 3 レイヤー全て必要** — `adx_sitesettings` + `powerpagecomponent type=18` + N:N リンク
13. **`/_api/` は Cookie 認証（same-origin）** — Bearer トークンではない
14. **Anti-Forgery Token は PATCH/PUT/DELETE に必須** — `/_layout/tokenhtml` から取得
15. **再起動は `PAGES_WEBSITE_ID`（PP API の websites.id）で行う** — `siteName` の部分一致照合は登録名にスペースがあると失敗する。`.env` に ID を保存して明示的に restart する
16. **フォントはコード側で一元管理する** — `index.html` の Google Fonts ロード + `:root` の `font-family` + Tailwind `@theme inline` の `--font-sans` の 3 箇所を揃えてビルド→再起動

---

## 壊れたサイトのリカバリ手順（新規サイト再作成）

`adx_website` 削除や孤立レコードで修復不能になった場合、新しいサブドメインで作り直すのが最速:

```bash
# 1. 旧サイトバインディングを削除
rm -rf .powerpages-site .powerpages-site-backup .paportal

# 2. powerpages.config.json の siteName を変更
#    例: "IncidentPortal" → "IncidentPortal02"

# 3. ビルド & アップロード（新サイト作成）
npm run build
pac pages upload-code-site --rootPath .

# 4. アクティブ化（PP API）
#    POST /powerpages/environments/{ENV_ID}/websites?api-version=2024-10-01
#    body: { websiteRecordId, subdomain, dataModel: "Enhanced", ... }

# 5. リスタート
#    POST .../websites/{id}/restart?api-version=2024-10-01

# 6. 2〜3分待ってアクセス確認
```

**ポイント:**
- `.powerpages-site/` を削除することで `upload-code-site` が「初回」として新サイトを作成する
- 旧サイトと異なる `siteName` を使う（同名だと旧サイトに紐付く可能性）
- アクティブ化の `subdomain` も新しいものにする
- プロビジョニングは約 15 秒、初回コールドスタートに 2〜3 分

---

## adx_sitesettings の正しいバインド方法

Site Settings は **`adx_websiteid@odata.bind` で正しい `adx_websites` レコードに紐付ける**。
誤った Website ID に紐付けた設定は無視される。

```python
def upsert_adx_sitesetting(name: str, value: str, adx_website_id: str):
    filter_q = f"adx_name eq '{name}' and _adx_websiteid_value eq '{adx_website_id}'"
    existing = requests.get(
        f"{DV_URL}/api/data/v9.2/adx_sitesettings?$filter={filter_q}", headers=headers,
    ).json()["value"]
    body = {
        "adx_name": name,
        "adx_value": value,
        "adx_websiteid@odata.bind": f"/adx_websites({adx_website_id})",
    }
    if existing:
        requests.patch(
            f"{DV_URL}/api/data/v9.2/adx_sitesettings({existing[0]['adx_sitesettingid']})",
            headers=headers, json=body)
    else:
        requests.post(f"{DV_URL}/api/data/v9.2/adx_sitesettings", headers=headers, json=body)

# adx_websiteid の取得
r = requests.get(f"{DV_URL}/api/data/v9.2/adx_websites?$top=1&$orderby=createdon desc")
adx_website_id = r.json()["value"][0]["adx_websiteid"]
```

`scripts/setup_auth.py` がこのパターンを実装している。

---

## トラブルシューティング

| 問題 | 原因 | 対策 |
|------|------|------|
| upload-code-site で `.js blocked` | 環境で JS ブロック | 管理センター → ブロック添付ファイルから `js` 削除（`scripts/unblock_js.py`） |
| サイト URL が 503 | プロビジョニング未完了 or 未アクティブ | Inactive Sites でアクティブ化。60-90秒待つ |
| Web API が 403 | テーブル権限未設定 or Web ロール未紐付け（**`upload-code-site` 後は type=18 content の `adx_entitypermission_webrole` が空で 403 になりがち**。N:N の `$ref` は 204 でも幽霊で無効） | `relink_table_permissions.py` 実行（content + N:N association を再付与） |
| Web API が 404 | `Webapi/{table}/enabled` 未設定 | `setup_permissions.py` 実行 |
| `/SignIn` でログインフォーム表示 | `LoginButtonAuthenticationType` 未設定/値誤り | `setup_auth.py` 実行（Authority URL を設定） |
| SSO ボタンが 2つ表示 | `AzureADLoginEnabled=true` のまま | `AzureADLoginEnabled=false` を設定 |
| ログイン後ブランクページ | `ProfileRedirectEnabled=true` | `setup_auth.py` 実行（`false` に） |
| SPA でなくクラシックページ表示 | Code Site として作成されていない | 削除して `upload-code-site` で再作成 |
| 設定変更が反映されない | サイトキャッシュ | PP API で restart + ブラウザキャッシュクリア |
| `Object reference not set` + `FetchSolutions` | `adx_website` レコードが存在しない | 上記「adx_website は削除禁止」参照 |
| `Object reference not set` + `ToOrganizationService` | ポータル App User の CRM 接続失敗 | Application User がロール付きで存在するか確認 |
| 初回アクセスが 60 秒タイムアウト | コールドスタート | 正常。2〜3 分後に再試行 |
| サイトが修復不能（500 が解消しない）| 環境が壊れた | 新サブドメインで新規作成（上記リカバリ手順）|
