# Power Pages トラブルシューティング

## よくあるエラーと解決策

### E001: `.powerpages-site` が見つからない

**エラー:**
```
Error: Could not find .powerpages-site file in the specified path.
```

**原因:** `--path` で指定したディレクトリに `.powerpages-site` マーカーファイルが存在しない。

**解決策:**
1. サイトディレクトリに `.powerpages-site` ファイルを作成する
2. `--path` の指定パスが正しいか確認する

```bash
# マーカーファイル作成
touch ./site/.powerpages-site
```

---

### E002: 認証プロファイルが未設定

**エラー:**
```
Error: No active authentication profile found.
```

**原因:** `pac auth list` にアクティブなプロファイルがない。

**解決策:**
```bash
# プロファイル作成
pac auth create --environment {ENVIRONMENT_ID}

# または既存プロファイルを選択
pac auth list
pac auth select --index 1
```

---

### E003: アップロード時のタイムアウト

**エラー:**
```
Error: Request timed out while uploading site files.
```

**原因:** サイトのファイルサイズが大きい、またはネットワーク接続が不安定。

**解決策:**
1. ビルド出力のサイズを確認（ソースマップ除外、未使用アセット削除）
2. ネットワーク接続を確認
3. リトライする

```bash
# ビルドサイズ確認
du -sh ./dist/

# ソースマップ除外確認（vite.config.ts）
# build: { sourcemap: false }
```

---

### E004: SPA ルーティングで 404

**症状:** 直接 URL アクセスや F5 リロードで 404 が返る。

**原因:** History API モードのルーティングを使用しており、サーバーサイドリライトが未設定。

**解決策:**
- Hash モードに切り替える（推奨）
- または Power Pages のカスタムエラーページで `index.html` にリダイレクト

```tsx
// React Router: Hash モードに変更
import { HashRouter } from 'react-router-dom'
// BrowserRouter → HashRouter に変更
```

---

### E005: テーブル権限エラー（403 Forbidden）

**症状:** Power Pages サイトから Dataverse API を呼び出すと 403 が返る。

**原因:** テーブル権限が未設定、または Web ロールが割り当てられていない。

**解決策:**
1. テーブル権限レコードが正しく作成されているか確認
2. Web ロールにテーブル権限が紐付いているか確認
3. ユーザー（コンタクト）に Web ロールが割り当てられているか確認

```python
# テーブル権限の確認（auth_helper.py 使用）
from auth_helper import api_get

permissions = api_get(
    "adx_entitypermissions?$select=adx_entityname,adx_scope,adx_read,adx_write"
)
for p in permissions.get("value", []):
    print(f"  {p['adx_entityname']}: scope={p['adx_scope']}, read={p['adx_read']}")
```

---

### E006: CORS エラー

**症状:** ブラウザコンソールに CORS エラーが表示される。

**原因:** Power Pages サイトから外部 API を呼び出す際に CORS ヘッダーが不足。

**解決策:**
- Dataverse Web API は Power Pages ドメインからのアクセスを許可済み（追加設定不要）
- 外部 API の場合は、API 側で Power Pages ドメインを許可する
- またはサーバーサイドプロキシとして Power Automate フローを経由する

---

### E007: ビルド成果物の `base` パス不正

**症状:** CSS/JS が読み込まれない（404）、画像が表示されない。

**原因:** ビルド設定の `base` が絶対パス（`/`）になっている。

**解決策:**
```ts
// vite.config.ts
export default defineConfig({
  base: './',  // 相対パスに変更
})
```

```json
// angular.json
"baseHref": "./"
```

---

### E008: pac CLI バージョン不整合

**症状:** `pac pages` コマンドが認識されない。

**原因:** pac CLI のバージョンが古く `pages` サブコマンドが未対応。

**解決策:**
```bash
# pac CLI を最新に更新
npm install -g @microsoft/power-apps-cli@latest

# バージョン確認
pac --version
```

---

## デバッグのヒント

### ログ出力の有効化

```bash
# pac コマンドの詳細ログ
pac pages upload-code-site --path ./dist --verbose
```

### ローカルでの動作確認

アップロード前にローカルで静的ファイルの動作を確認する:

```bash
# npx serve で静的ファイルを配信
npx serve ./dist

# ブラウザで http://localhost:3000 を確認
```

### ネットワークリクエストの確認

ブラウザの DevTools > Network タブで:
- 静的アセットの読み込み状態（200 / 404）
- API 呼び出しのレスポンス（403 / CORS）
- リダイレクトの挙動

---

## Power Platform API 関連のエラー

### E009: PortalFileContentUploadFailed（.js ブロック）

**症状:** `pac pages upload-code-site` が途中で停止し `PortalFileContentUploadFailed` エラー。

**原因:** Dataverse organization の `blockedattachments` に `.js` が含まれている。

**確認方法:**
```bash
python .github/skills/power-pages/scripts/unblock_js.py --check
```

**解決策:**
```bash
python .github/skills/power-pages/scripts/unblock_js.py
```

---

### E010: DNS 未解決（ポータルデプロビジョン済み）

**症状:** `nslookup {subdomain}.powerappsportals.com` が NXDOMAIN。サイトに一切アクセスできない。

**原因:** ポータルインフラが完全にデプロビジョンされている。トライアル期限切れや管理者による停止後に発生。

**解決策:**
1. 管理画面で状態確認:
   ```
   https://make.powerpages.microsoft.com/environments/{ENV_ID}/portals/home
   ```
2. 管理画面から「開始」可能であれば開始
3. サイトが存在しない場合は再作成:
   ```bash
   python .github/skills/power-pages/scripts/manage_portal.py --action create --name "サイト名" --subdomain "サブドメイン"
   ```

> **注意**: プロビジョニングには日本リージョンで 10〜20 分かかる。

---

### E011: pac pages provision-website コマンドが存在しない

**症状:** `pac pages provision-website` で「unknown command」エラー。

**原因:** PAC CLI 2.7.x にはこのコマンドが未実装。

**代替手段:**
- Power Platform API の Create Website エンドポイント（`manage_portal.py --action create`）
- Power Pages 管理画面での手動プロビジョニング

---

### E012: Power Platform API で "Website does not exist"

**症状:** API 呼び出しで「Website does not exist in this environment」。

**原因:** レガシーポータル（Power Pages サービス移行前に作成）は Power Platform API に登録されていない。API の `websites` 一覧に表示されない。

**解決策:**
- 既存のレガシーポータルを利用する場合: 管理画面で操作する
- API で管理したい場合: 新しいポータルを Create Website API で作成する
- Dataverse の `adx_website` テーブルにレコードがあっても、それが API 管理対象とは限らない
