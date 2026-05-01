# Code Apps — Copilot Studio 直接コネクタ連携

Code Apps から Microsoft Copilot Studio エージェントを **コネクタ経由で直接呼び出す** パターン。
Power Automate フローを介さずに、Code Apps SDK の `executeAsync` でエージェントと対話する。

## 前提条件

- Copilot Studio エージェントが **Dataverse バック** かつ **Generative Orchestration モード** で公開済み
- 環境内に `shared_microsoftcopilotstudio` コネクタの接続が作成済み
- エージェントのスキーマ名を把握（例: `cr377_agent`）

## データソース追加手順

```bash
# Copilot Studio コネクタを追加
npx power-apps add-data-source \
  --api-id shared_microsoftcopilotstudio \
  --resource-name microsoftcopilotstudio \
  --org-url {DATAVERSE_URL}
```

### 生成されるファイル

```
src/generated/
  services/
    MicrosoftCopilotStudioService.ts  ← ExecuteCopilotAsyncV2 メソッド
  models/
    MicrosoftCopilotStudioModel.ts    ← 型定義
.power/schemas/
  microsoftcopilotstudio/
    microsoftcopilotstudio.Schema.json ← コネクタ OpenAPI スキーマ
  appschemas/
    dataSourcesInfo.ts                 ← コネクタ定義追加
```

### power.config.json の connectionReferences

`add-data-source` 実行後、`power.config.json` に接続参照が追加される:

```json
{
  "connectionReferences": {
    "microsoftcopilotstudio": {
      "connectorId": "/providers/Microsoft.PowerApps/apis/shared_microsoftcopilotstudio",
      "connectionReferenceId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    }
  }
}
```

## ★ 最重要: dataSourcesInfo の統合（シングルトン問題）

フロー連携と同じく、Copilot Studio コネクタも `.power/schemas/appschemas/dataSourcesInfo.ts` に定義される。
`src/lib/dataSourcesInfo.ts` の統合版を使用すること。

```typescript
// src/lib/dataSourcesInfo.ts
import { dataSourcesInfo as generatedInfo } from "@/generated/appschemas/dataSourcesInfo";
import { dataSourcesInfo as powerInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";

export const dataSourcesInfo = {
  ...generatedInfo,
  ...powerInfo,
} as typeof generatedInfo & typeof powerInfo;
```

**自動生成サービスのインポートパスも変更する:**

```typescript
// src/generated/services/MicrosoftCopilotStudioService.ts

// ❌ 自動生成デフォルト（Dataverse テーブルが含まれない可能性）
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo';

// ✅ 統合版（全テーブル + フロー + Copilot Studio）
import { dataSourcesInfo } from '../../lib/dataSourcesInfo';
```

## ExecuteCopilotAsyncV2 API 仕様

### メソッドシグネチャ

```typescript
MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(
  Copilot: string,                    // エージェントスキーマ名（パスパラメータ）
  body: Record<string, unknown>,      // リクエストボディ
  x_ms_conversation_id?: string,      // 会話継続用 ID（ヘッダー）
  environmentId?: string              // オプション: 環境 ID
): Promise<IOperationResult<void>>
```

### パラメータ詳細

| パラメータ | 指定場所 | 必須 | 説明 |
|---|---|---|---|
| `Copilot` | パス | ✅ | エージェントのスキーマ名（例: `cr377_agent`） |
| `body.notificationUrl` | ボディ | ✅ | Webhook 通知 URL（プレースホルダー可） |
| `body.message` | ボディ | - | ユーザーメッセージ |
| `body.locale` | ボディ | - | BCP-47 ロケール（例: `ja-JP`） |
| `body.attachments` | ボディ | - | 添付ファイル配列 |
| `x-ms-conversation-id` | ヘッダー | - | 既存会話を継続する場合に指定 |
| `environmentId` | クエリ | - | 環境 ID（省略時はコネクタのデフォルト） |

### ⚠️ 致命的アンチパターン: body に agentName を入れてはいけない

```typescript
// ❌ 失敗する — {"success":false,"error":{}}
const body = {
  message: "質問テキスト",
  notificationUrl: "https://notificationurlplaceholder",
  agentName: "cr377_agent",  // ← スキーマ定義外のフィールド！
};

// ✅ 正しい — agentName は Copilot パスパラメータで指定済み
const body = {
  message: "質問テキスト",
  notificationUrl: "https://notificationurlplaceholder",
};
```

**教訓**: `Copilot` パスパラメータがエージェント指定。body はスキーマ定義の
`notificationUrl` / `message` / `locale` / `attachments` のみ許可。
それ以外のフィールドを含めると `{"success":false,"error":{}}` が返る。

## レスポンス解析

### レスポンス構造（Webhook パターン）

コネクタは **202 Accepted** を返し、内部で Webhook 通知を待機して最終結果を返す。
SDK がこのパターンを透過的に処理し、最終レスポンスが `IOperationResult<void>` として返る。

### Notification スキーマ（実際に返されるデータ）

```typescript
interface CopilotResponse {
  lastResponse: string;      // 最後のテキスト応答
  responses: string[];       // テキスト応答の配列
  conversationId: string;    // 会話 ID（次回リクエストで再利用）
}
```

### レスポンス解析コード

```typescript
const result = await MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(
  AGENT_NAME,
  body,
  conversationIdRef.current,
);

// IOperationResult<void> のため型アサーションが必要
const fullResult = result as unknown as Record<string, unknown>;

// data プロパティがある場合とない場合に対応
const data = (fullResult.data ?? fullResult) as Record<string, unknown>;

// --- conversationId 保持 ---
const convId = (data?.conversationId ?? data?.ConversationId) as string | undefined;
// ネストされたケースにも対応
const nestedBody = data?.body as Record<string, unknown> | undefined;
const nestedConvId = (nestedBody?.conversationId ?? nestedBody?.ConversationId) as string | undefined;
const resolvedConvId = convId || nestedConvId;
if (resolvedConvId) {
  conversationIdRef.current = resolvedConvId;
}

// --- テキスト応答取得（優先順位順） ---
let responseText = "";
if (data?.lastResponse) {
  responseText = String(data.lastResponse);
} else if (Array.isArray(data?.responses) && data.responses.length > 0) {
  responseText = (data.responses as string[]).join("\n\n");
} else if (data?.text) {
  responseText = String(data.text);
} else if (data?.message) {
  responseText = String(data.message);
} else if (data?.response) {
  responseText = String(data.response);
}
```

## 会話継続パターン（useRef）

`conversationId` を `useRef` で保持し、同一セッション内の連続対話を実現する。

```typescript
const conversationIdRef = useRef<string | undefined>(undefined);

// リクエスト時に渡す
const result = await MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(
  AGENT_NAME,
  body,
  conversationIdRef.current,  // 初回は undefined → 新規会話
);

// レスポンスから conversationId を保存
if (resolvedConvId) {
  conversationIdRef.current = resolvedConvId;
  // 次回以降は同じ会話として継続される
}
```

### ⚠️ useState ではなく useRef を使う理由

- `useState` で conversationId を保持すると、state 更新は次回レンダーまで反映されない
- 高速な連続送信で古い値が使われ、会話が途切れる
- `useRef` は即時反映されるため、連続リクエストでも正しい conversationId が渡る

## 会話リセット

```typescript
const handleResetConversation = () => {
  conversationIdRef.current = undefined;
  setChatMessages([]);
};
```

## エラーハンドリングとフォールバック

```typescript
try {
  const result = await MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(...);
  // ... レスポンス解析
  if (!responseText) {
    throw new Error("Empty response from Copilot Studio agent");
  }
} catch (err) {
  const errMsg = err instanceof Error ? err.message : String(err);
  console.error("[CopilotStudio] Call FAILED:", errMsg, err);
  
  // ローカルフォールバック検索
  const matched = localSearch(query);
  if (matched.length > 0) {
    answer = formatLocalResults(matched);
  } else {
    answer = `エラー: ${errMsg}`;
  }
}
```

## デバッグログ（開発時）

リクエスト送信前とレスポンス受信後にログを出す:

```typescript
// リクエスト前
console.log("[CopilotStudio] Request:", {
  agent: AGENT_NAME,
  body,
  conversationId: conversationIdRef.current,
});

// レスポンス後
console.log("[CopilotStudio] Full result:", JSON.stringify(fullResult));
```

## 教訓まとめ

| # | 教訓 | 詳細 |
|---|---|---|
| 1 | **body に agentName を入れない** | Copilot パスパラメータで指定済み。body に含めると `{"success":false,"error":{}}` |
| 2 | **notificationUrl は必須** | プレースホルダー `"https://notificationurlplaceholder"` でよい。SDK が内部処理する |
| 3 | **conversationId は useRef** | useState だと連続送信で古い値が使われる |
| 4 | **レスポンスは IOperationResult\<void\>** | 型が void だが実データは入っている。型アサーションで取り出す |
| 5 | **data ?? fullResult パターン** | SDK バージョンにより data でラップされるか直接返るかが変わる |
| 6 | **dataSourcesInfo 統合が必須** | フロー連携と同様、シングルトン問題を回避する統合版を使う |
| 7 | **自動生成サービスのインポートパス変更** | `add-data-source` 再実行で戻るため、再実行後に確認 |
| 8 | **レスポンスフィールド名の大文字小文字** | conversationId / ConversationId 両方に対応する |
