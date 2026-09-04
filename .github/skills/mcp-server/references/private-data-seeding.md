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

作成後に `seed-upload` を叩くと成功する。この順序を間違えると 404 / 403 の切り分けで時間を溶かす。
