# MCP プロトコル最小実装

Copilot Studio から呼ぶだけであれば、MCP 仕様の全体を実装する必要はない。
**JSON-RPC 2.0 over HTTP POST** で以下 3 メソッドを返せば足りる。SSE・セッション管理・通知は実装しない。

| メソッド | 役割 |
|---|---|
| `initialize` | プロトコルバージョンとサーバー情報を返す |
| `tools/list` | ツール定義（`name` / `description` / `inputSchema`）の配列を返す |
| `tools/call` | ツールを実行し、結果を `content` 配列で返す |

## ディスパッチャ

```typescript
// src/functions/mcp.ts
import { app, HttpRequest, HttpResponseInit } from '@azure/functions';
import { verifyToken } from '../lib/auth';
import { TOOLS, callTool } from '../tools/domainTools';

const PROTOCOL_VERSION = '2024-11-05';

app.http('mcp', {
  methods: ['POST'],
  authLevel: 'anonymous', // 認可はコード側の JWT 検証で行う（関数キーは使わない）
  route: 'mcp',
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const auth = await verifyToken(req.headers.get('authorization'));
    if (!auth.ok) {
      return { status: 401, jsonBody: { error: auth.reason } };
    }

    const body = (await req.json()) as { id?: unknown; method?: string; params?: any };
    const id = body.id ?? null;

    const reply = (result: unknown): HttpResponseInit => ({
      status: 200,
      jsonBody: { jsonrpc: '2.0', id, result },
    });

    switch (body.method) {
      case 'initialize':
        return reply({
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'example-mcp', version: '1.0.0' },
        });

      case 'tools/list':
        return reply({ tools: TOOLS });

      case 'tools/call': {
        const text = await callTool(body.params?.name, body.params?.arguments ?? {});
        return reply({ content: [{ type: 'text', text }] });
      }

      default:
        return {
          status: 200,
          jsonBody: { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } },
        };
    }
  },
});
```

> エラーもステータス 200 + JSON-RPC `error` オブジェクトで返す。HTTP のエラーコードで返すと
> クライアント側が JSON-RPC として解釈せず、原因が追いにくくなる。

## ツール定義

```typescript
// src/tools/domainTools.ts
export const TOOLS = [
  {
    name: 'list_categories',
    description: 'データのカテゴリ一覧を返す。検索前に必ず呼び、利用可能な語彙を把握すること。',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'search_items',
    description: 'キーワードで項目を検索する。カテゴリで絞り込める。',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '検索キーワード' },
        category: { type: 'string', description: 'list_categories が返したカテゴリ名' },
        top: { type: 'number', description: '最大取得件数（既定 20）' },
      },
      required: ['keyword'],
    },
  },
] as const;
```

### 設計のコツ

- **`list_*` を必ず用意する**。エージェントは語彙を知らないため、一覧が無いと的外れなキーワードで空振りする。
- `description` は **エージェント向けの指示文**として書く。「検索前に必ず呼ぶこと」のような使用順序も書いてよい。
- 戻り値は **人が読めるテキスト**にする（Markdown 表や箇条書き）。生 JSON を返すとエージェントの要約精度が落ちる。
- 返す件数は上限を設ける。大量に返すとコンテキストを食い潰し、回答が途中で切れる。

## 動作確認

```powershell
# 認可が効いていること（トークン無しは 401）
curl.exe -s -w "`nSTATUS:%{http_code}" -X POST "https://<app>.azurewebsites.net/api/mcp" `
  -H "Content-Type: application/json" -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}'
```

`401` が返れば **ルートは存在し認可も動いている**。`404` ならデプロイされていない。
この 401 / 404 の違いが、デプロイ成否を判定する最も確実なシグナルになる。
