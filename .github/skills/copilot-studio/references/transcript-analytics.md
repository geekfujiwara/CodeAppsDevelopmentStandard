# Copilot Studio トランスクリプト分析パターン

conversationtranscript テーブルのデータを分析する際のパターンと注意点。

---

## 1. ボット識別: BotId ではなく BotName で照合する

### 問題

トランスクリプトの `metadata` JSON に含まれる `BotId` と、`bot` テーブルの `botid` は **異なる GUID** である。
`BotId` で `bot.botid` にフィルタしても 0 件になる。

### 原因

- `metadata.BotId`: Copilot Studio 内部の Component ID（`botcomponent` の ID に近い）
- `bot.botid`: Dataverse `bot` テーブルの主キー

この 2 つは別物であり、直接照合できない。

### 解決策

`metadata.BotName` = `bot.schemaname` で照合する。

```python
# Python（バックフィルスクリプト等）
import json

meta = json.loads(transcript["metadata"] or "{}")
bot_name = meta.get("BotName", "")  # → "geek_agent1" 等（= bot.schemaname）
```

```typescript
// TypeScript（Code Apps フロントエンド）
// ボット一覧から schemaname → name のマップを作成
const botNameMap = useMemo(() => {
  const m: Record<string, string> = {};
  for (const b of bots ?? []) m[b.schemaname] = b.name;
  return m;
}, [bots]);

// サマリーの botname（= schemaname）から表示名を取得
const displayName = botNameMap[summary.geek_botname] ?? summary.geek_botname;
```

### 検証クエリ

```python
# metadata.BotId と bot.botid が一致しないことを確認
from auth_helper import api_get

bots = api_get("bots?$select=botid,schemaname,name")
for b in bots.get("value", []):
    print(f"  botid={b['botid']}  schema={b['schemaname']}  name={b['name']}")

# トランスクリプトの metadata.BotId を確認
t = api_get("conversationtranscripts?$select=metadata&$top=1")
meta = json.loads(t["value"][0]["metadata"])
print(f"  metadata.BotId={meta.get('BotId')}")
print(f"  metadata.BotName={meta.get('BotName')}")
# → BotName は bot.schemaname と一致する
```

---

## 2. ユーザー識別: _ownerid_value ではなく activity.from.aadObjectId を使う

### 問題

conversationtranscript の `_ownerid_value` は **Copilot Studio のシステムアカウント** であり、
実際にエージェントと会話したユーザーではない。

### 原因

Copilot Studio がトランスクリプトを書き込む際、所有者はシステムサービスアカウントになる。
会話したユーザーの情報は、`content` JSON 内の各 activity の `from` オブジェクトに格納されている。

### 解決策

`content.activities` からユーザーロール（`from.role === 1`）のメッセージを探し、
`from.aadObjectId` を取得する。

```python
# Python: トランスクリプトからユーザー AAD ID を抽出
import json

content = json.loads(transcript.get("content") or "{}")
user_aad_id = None
for a in content.get("activities", []):
    if a.get("type") == "message":
        frm = a.get("from") or {}
        if frm.get("role") == 1 and frm.get("aadObjectId"):
            user_aad_id = frm["aadObjectId"]
            break
```

### AAD Object ID → systemuser の解決

```python
# Python: systemuser テーブルから照合
from auth_helper import api_get

user = api_get(
    f"systemusers?$filter=azureactivedirectoryobjectid eq '{user_aad_id}'"
    f"&$select=systemuserid,fullname,internalemailaddress"
)
if user.get("value"):
    print(user["value"][0]["fullname"])
```

```typescript
// TypeScript: Code Apps フロントエンドでのバッチ照合
export async function getSystemUsersByAadIds(
  aadIds: string[],
): Promise<Record<string, UserInfo>> {
  if (aadIds.length === 0) return {};
  const filterParts = aadIds.map(
    (id) => `azureactivedirectoryobjectid eq '${id}'`,
  );
  const result = await client().retrieveMultipleRecordsAsync<UserInfo>(
    "systemusers",
    {
      select: [
        "systemuserid", "fullname",
        "internalemailaddress", "jobtitle",
        "azureactivedirectoryobjectid",
      ],
      filter: filterParts.join(" or "),
    },
  );
  if (!result.success) throw result.error;
  const map: Record<string, UserInfo> = {};
  for (const u of result.data ?? []) {
    map[u.azureactivedirectoryobjectid] = u;
  }
  return map;
}
```

### 推奨: バックフィル時に AAD ID を保存

トランスクリプトの content JSON は巨大なため、フロントエンドで毎回パースするのは非効率。
サマリーテーブルのカラム（例: `geek_useraadid`）にバックフィルスクリプトで事前抽出しておく。

```python
# backfill_summaries.py に追加
user_aad_id = None
for a in acts:
    if a.get("type") == "message":
        frm = a.get("from") or {}
        if frm.get("role") == 1 and frm.get("aadObjectId"):
            user_aad_id = frm["aadObjectId"]
            break

summary[f"{PREFIX}_useraadid"] = (user_aad_id or "")[:100]
```

---

## 3. metadata で取得できる情報一覧

| フィールド | 説明 | 照合先 |
|---|---|---|
| `BotName` | ボットのスキーマ名 | `bot.schemaname` ✅ |
| `BotId` | Copilot Studio 内部 ID | `bot.botid` とは **不一致** ❌ |
| `ConversationType` | 会話種別（`Unifiedrouting` 等） | — |
| `IsBillable` | 課金対象か | — |

### activity.from で取得できるユーザー情報

| フィールド | 説明 | 条件 |
|---|---|---|
| `from.role` | `1` = ユーザー, `2` = ボット | — |
| `from.aadObjectId` | Entra ID (AAD) Object ID | ユーザーメッセージのみ |
| `from.name` | 表示名 | チャネルによっては空 |
| `from.id` | チャネル固有のユーザー ID | — |
