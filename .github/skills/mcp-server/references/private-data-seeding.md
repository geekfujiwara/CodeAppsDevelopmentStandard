# Private Endpoint 環境でのデータ投入

## 問題

組織ポリシーで `publicNetworkAccess=Disabled` / 共有キー禁止が強制されていると、
**開発 PC から SQL にもストレージにも到達できない**。ローカルからのシードスクリプトは全て失敗する。

```
開発 PC ──✕── Azure SQL (Private Endpoint のみ)
開発 PC ──✕── Storage  (Private Endpoint のみ・共有キー禁止)
```

VPN や Bastion を用意するのは重い。ポリシーの一時解除は却下される（そして戻し忘れる）。

## 解決: VNet 内の一時的な管理エンドポイント

**すでに VNet 統合済みの Function App 自身**にシード用の HTTP エンドポイントを置く。
Function App はデータ層に Private Endpoint 経由で到達できるため、外部からは HTTP を叩くだけで済む。

```
開発 PC ──(HTTPS + 共有シークレット)──▶ Function App ──(MI + Private Endpoint)──▶ データ層
```

| エンドポイント | 役割 |
|---|---|
| `internal-db-setup` | スキーマ作成 + MI へのロール付与（**実行者のトークン**を受け取る） |
| `internal-seed` | 業務データの投入（べき等・既存データがあればスキップ） |
| `seed-upload` | ファイル共有へのドキュメント一括アップロード |

### 保護

- 共有シークレット（`ADMIN_SEED_SECRET`）をアプリ設定に置き、`x-admin-seed-secret` ヘッダーで検証する。
- **比較は固定時間比較にする**（タイミング攻撃対策）。
- ソースに「投入完了後はこのファイルごと削除・再デプロイすること」とコメントを残す。
- **投入後は必ず削除する**（SKILL.md の Step 8）。アプリ設定のシークレットも消す。

```typescript
import { timingSafeEqual } from 'crypto';

function isAuthorized(req: HttpRequest): boolean {
  const expected = process.env.ADMIN_SEED_SECRET ?? '';
  const actual = req.headers.get('x-admin-seed-secret') ?? '';
  if (!expected || expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}
```

## SQL の MI 権限付与だけは特別扱いする

`CREATE USER ... FROM EXTERNAL PROVIDER` は **Entra 管理者権限**が必要で、Function App の MI では実行できない。
そのため、**実行者（開発者）のアクセストークンをリクエストボディで渡し**、Function App 側はそれを使って接続する。

```python
# クライアント側
from azure_helper import get_sql_access_token
body = {"accessToken": get_sql_access_token()}
```

```typescript
// サーバー側（internal-db-setup）
const pool = await new sql.ConnectionPool({
  server, database,
  options: { encrypt: true },
  authentication: { type: 'azure-active-directory-access-token', options: { token: body.accessToken } },
}).connect();
```

> トークンは**ログに出さない**。レスポンスにも含めない。返すのは `{"status":"ok","principalName":"..."}` 程度に留める。

## べき等にする

シードは何度でも安全に実行できるようにする。デプロイ検証のたびに再実行するため。

```json
{"status":"skipped","reason":"already seeded","itemCount":40}
```

## ファイル共有はマネジメントプレーンで先に作る

`Storage File Data Privileged Contributor` などのデータプレーンロールには
**共有（share）を作成する権限が含まれない**。共有だけは先にマネジメントプレーンで作成しておく。

```bash
az storage share-rm create -g <rg> --storage-account <account> -n <share> --quota 100
```

さらに、**コード側から `share.exists()` / `share.create()` を呼んではいけない**。
これらは share レベル操作で Entra 認証（OAuth）では実行できず、共有が実在していても次のエラーになる。

```
RestError: This request is not authorized to perform this operation using this permission.
```

シード関数は「共有は既に在る」前提で、ディレクトリとファイル（ディレクトリ／ファイルレベル操作）だけを扱う。

作成後に `seed-upload` を叩くと成功する。この順序を間違えると 404 / 403 の切り分けで時間を溶かす。

## ルート名を `admin` で始めない

`route: "admin-seed"` のように **`admin` で始まるルートは Functions ホストの組み込みルート
（`/admin/host/status` など）と衝突し、その関数だけが読み込まれない**。
デプロイもビルドも成功し、`az functionapp function list` にも出るのに、呼ぶと
**本文が空の 404（`Content-Length: 0` / `Server: Kestrel`）** が返る。

ホストログに理由が出ているので、404 が出たらまずここを見る。

```
The 'adminSeed' function is in error: The specified route conflicts with one or more built in routes.
```

```typescript
app.http('seedData', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'seed-data',   // ❌ "admin-seed" は不可
  handler,
});
```

> 見分け方: **本文が空の 404 はホスト（ルート未登録）**、`{"error":"not found"}` のように
> **JSON 本文がある 404 は自作ハンドラー**。切り分けは `curl -i` で本文の有無を見る。

## 一時エンドポイントは失敗理由を返す

Private Endpoint 越しの失敗は手元から再現できない。原因を掴むまでのデプロイ往復を減らすため、
**シード関数は try/catch で例外メッセージをレスポンスに載せる**（一時エンドポイントであり、
共有シークレットで保護されているため許容できる）。撤去時に一緒に消える。

```typescript
try {
  return await seed(context);
} catch (err) {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  context.error(`シード投入に失敗: ${message}`);
  return { status: 500, jsonBody: { error: message } };
}
```

## SQL の DDL 権限は「MI を一時的に Entra 管理者にする」で通す

`CREATE SCHEMA` / `CREATE TABLE` を MI で実行するには DDL 権限が要るが、
`publicNetworkAccess=Disabled` では開発 PC から `GRANT` を流せない。
**コントロールプレーンだけで完結する回避策**として、シードの間だけ MI をサーバーの Entra 管理者にする。

```bash
# 1) MI を一時的に Entra 管理者にする
az sql server ad-admin update -g <rg> -s <server> --display-name <func-app> --object-id <mi-principal-id>
az functionapp restart -g <rg> -n <func-app>          # 権限を反映させる

# 2) シードを流す
curl -s -X POST -H "x-seed-key: $KEY" https://<func-app>.azurewebsites.net/api/seed-data

# 3) 元の管理者へ戻す（必須）
az sql server ad-admin update -g <rg> -s <server> --display-name <original-admin-upn> --object-id <original-sid>
az functionapp restart -g <rg> -n <func-app>
```

注意点:
- Entra 管理者は**同時に 1 つだけ**。手順 3 を忘れると元の管理者が SQL に入れなくなる。事前に元の
  `login` と `sid` を `az sql server ad-admin list` で控えておく。
- 常用の読み取りは MI の**通常のデータベースユーザー**（`db_datareader` 相当）で行う。管理者を戻した後に
  `tools/call` が通ることまで実測して初めて完了とみなす。

