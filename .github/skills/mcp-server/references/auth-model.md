# 認証モデル（キーレス）

MCP Server は **受信・送信の両方でシークレットを持たない**。
ここでいうキーレスは「関数キー・接続文字列・共有キーを使わない」という意味であり、
受信側の Bearer JWT 検証や送信側の Managed Identity トークン取得が不要になるわけではない。

```
Copilot Studio ──(Entra ID Bearer JWT)──▶ Function App ──(Managed Identity)──▶ Azure SQL / Azure Files
                    受信: JWT 検証                        送信: トークン取得
```

| 方向 | 方式 | 使わないもの |
|---|---|---|
| 受信 | Entra ID が発行した Bearer JWT を JWKS で署名・標準クレーム検証 | 関数キー・API キー |
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
      },
      (err) => resolve(err ? { ok: false, reason: err.message } : { ok: true }),
    );
  });
}
```

### 押さえるポイント

- **`audience` は 2 パターン許容する**。トークンの `aud` は `api://{app-id}` の場合と `{app-id}` の場合がある。
- **`issuer` も v1.0 / v2.0 の両方**を許容する。クライアントによって発行元が異なる。
- **期限切れ（`exp`）は拒否する**。`jsonwebtoken` は既定で `exp` を検証するため、`ignoreExpiration` は使わない。
- `algorithms: ['RS256']` を必ず指定する。省略すると `alg: none` を受け入れる脆弱性になる。
- JWKS はキャッシュする。毎リクエストで取りに行くとコールドスタート時にタイムアウトする。
- MCP Server は受信トークンを更新しない。期限切れは 401 とし、Copilot Studio または検証クライアントが
  Entra ID から新しいアクセストークンを取得して再送する。

---

## 送信: Managed Identity

### Azure SQL Database

```typescript
import { DefaultAzureCredential } from '@azure/identity';
import sql from 'mssql';

const credential = new DefaultAzureCredential();

export async function getPool(): Promise<sql.ConnectionPool> {
  const token = await credential.getToken('https://database.windows.net/.default');
  return new sql.ConnectionPool({
    server: process.env.SQL_SERVER!,
    database: process.env.SQL_DATABASE!,
    options: { encrypt: true },
    authentication: { type: 'azure-active-directory-access-token', options: { token: token!.token } },
  }).connect();
}
```

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

検証スクリプトや管理スクリプトで長時間処理する場合は、送信直前に `get_api_access_token()` を呼び直す。
更新トークンやキャッシュの扱いは `auth_helper` / Azure SDK など呼び出し側の責務であり、MCP Server 本体に
更新トークンを保存しない。
