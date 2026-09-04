# 認証モデル（キーレス）

MCP Server は **受信・送信の両方でシークレットを持たない**。

```
Copilot Studio ──(Entra ID Bearer JWT)──▶ Function App ──(Managed Identity)──▶ Azure SQL / Azure Files
                    受信: JWT 検証                        送信: トークン取得
```

| 方向 | 方式 | 使わないもの |
|---|---|---|
| 受信 | Entra ID が発行した JWT を JWKS で署名検証 | 関数キー・API キー |
| 送信 | `DefaultAzureCredential`（システム割り当て MI） | 接続文字列・ストレージ共有キー |

---

## 受信: Entra ID JWT の検証

```typescript
// src/lib/auth.ts
import jwt, { JwtHeader, SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const TENANT_ID = process.env.ENTRA_TENANT_ID!;
const AUDIENCE = process.env.MCP_API_AUDIENCE!; // api://{app-id}

const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxAge: 10 * 60 * 1000,
});

function getKey(header: JwtHeader, cb: SigningKeyCallback) {
  client.getSigningKey(header.kid!, (err, key) => cb(err, key?.getPublicKey()));
}

export async function verifyToken(authorization: string | null): Promise<{ ok: boolean; reason?: string }> {
  if (!authorization?.startsWith('Bearer ')) {
    return { ok: false, reason: 'missing bearer token' };
  }
  const token = authorization.slice('Bearer '.length);

  return new Promise((resolve) => {
    jwt.verify(
      token,
      getKey,
      {
        audience: [AUDIENCE, AUDIENCE.replace(/^api:\/\//, '')], // aud は api:// 付き/無しの両方があり得る
        issuer: [
          `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
          `https://sts.windows.net/${TENANT_ID}/`,
        ],
        algorithms: ['RS256'],
        clockTolerance: 60, // 秒。サーバー間の時計ずれで有効なトークンを弾かないための許容
      },
      (err) => resolve(err ? { ok: false, reason: err.message } : { ok: true }),
    );
  });
}
```

### 押さえるポイント

- **`audience` は 2 パターン許容する**。トークンの `aud` は `api://{app-id}` の場合と `{app-id}` の場合がある。
- **`issuer` も v1.0 / v2.0 の両方**を許容する。クライアントによって発行元が異なる。
- `algorithms: ['RS256']` を必ず指定する。省略すると `alg: none` を受け入れる脆弱性になる。
- **有効期限は検証ライブラリ任せにしつつ、`exp` の存在自体も確認する**。`exp` を持たないトークンは
  期限なしとして通ってしまう。デコード結果の `typeof decoded.exp !== 'number'` を弾く。
- **`clockTolerance` を 60 秒程度入れる**。入れないと、時計が数秒ずれただけで断続的に 401 が出て
  「たまに繋がらない」という再現しにくい障害になる。
- 期限切れトークンは**必ず 401 で返す**（200 + エラー本文にしない）。クライアントは 401 を見て再取得する。
- JWKS はキャッシュする。毎リクエストで取りに行くとコールドスタート時にタイムアウトする。

---

## 送信: Managed Identity

### Azure SQL Database

```typescript
import { DefaultAzureCredential } from '@azure/identity';
import sql from 'mssql';

const credential = new DefaultAzureCredential();
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

let pool: sql.ConnectionPool | undefined;
let expiresOn = 0;
let connecting: Promise<sql.ConnectionPool> | undefined;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected && Date.now() < expiresOn - REFRESH_MARGIN_MS) return pool;
  connecting ??= refresh();
  return connecting;
}

async function refresh(): Promise<sql.ConnectionPool> {
  const previous = pool;
  try {
    const token = await credential.getToken('https://database.windows.net/.default');
    const created = await new sql.ConnectionPool({
      server: process.env.SQL_SERVER!,
      database: process.env.SQL_DATABASE!,
      options: { encrypt: true },
      authentication: { type: 'azure-active-directory-access-token', options: { token: token!.token } },
    }).connect();
    pool = created;
    expiresOn = token!.expiresOnTimestamp;
    previous?.close().catch(() => undefined); // 切り替え後に旧プールを閉じる
    return created;
  } finally {
    connecting = undefined;
  }
}
```

> **毎回 `new ConnectionPool(...).connect()` しない。** 接続が積み上がって枯渇する。
> 逆に**張りっぱなしにもしない**。アクセストークンで作ったプールはトークンと寿命を共にするため、
> 期限の手前で作り直す必要がある。取りこぼしに備えて `ELOGIN` 等での 1 回リトライも入れる。
> → [sql-tools-pattern.md](sql-tools-pattern.md)

MI は事前に SQL 側でユーザーとして作成し、ロールを付与しておく必要がある
（Entra 管理者権限が必要なため、[private-data-seeding.md](private-data-seeding.md) の管理エンドポイント経由で実行する）。

```sql
CREATE USER [<function-app-name>] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [<function-app-name>];
ALTER ROLE db_datawriter ADD MEMBER [<function-app-name>];
```

### Azure Files（共有キー禁止環境）

共有キーが禁止されている場合、Files は **REST API を OAuth トークンで叩く**。

```typescript
const token = await credential.getToken('https://storage.azure.com/.default');

const res = await fetch(url, {
  headers: {
    Authorization: `Bearer ${token!.token}`,
    'x-ms-version': '2022-11-02',
    'x-ms-file-request-intent': 'backup', // ★ OAuth で Files を操作する場合は必須
  },
});
```

| 落とし穴 | 対処 |
|---|---|
| `x-ms-file-request-intent: backup` が無いと 403 | 全リクエストに固定で付ける |
| データプレーンのロールでは**共有そのものを作成できない** | 共有はマネジメントプレーン（`Microsoft.Storage/.../fileServices/shares` の PUT）で先に作る |
| `x-ms-version` が古いと OAuth 非対応 | `2022-11-02` 以降を指定する |

---

## クライアント側のトークン取得

```python
from azure_helper import get_api_access_token
token = get_api_access_token(os.environ["MCP_API_AUDIENCE"])
```

`AADSTS650057: Invalid resource` が返る場合、**呼び出し側ではなくアプリ登録側の設定不足**。
`scripts/configure_entra_api.py` でスコープ公開と事前承認を行う（SKILL.md の Step 2）。
