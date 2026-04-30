# Code Apps フロー連携パターン

Code Apps から Power Automate フローを呼び出し、AI Builder の結果を受け取るパターン。

## 前提条件

- フローは **PowerApps (V2) トリガー** を使用するインスタントフロー
- フローはソリューション内に含まれている
- `npx power-apps add-flow` で Code Apps にフローを追加済み
- `@microsoft/power-apps` npm パッケージ v1.1.1 以上

## フロー追加手順

```bash
# 1. 利用可能なフローを一覧表示
npx power-apps list-flows

# 2. フローを Code Apps に追加（Flow ID を指定）
npx power-apps add-flow --flow-id <flow-id>

# 3. ビルド & デプロイ
npm run build
npx power-apps push
```

### 生成されるファイル

```
src/generated/
  services/
    {FlowName}Service.ts       ← 型付きサービスクラス（Run メソッド）
  models/
    {FlowName}Model.ts         ← 入出力の TypeScript 型
.power/schemas/
  appschemas/dataSourcesInfo.ts ← フローの Connector 定義が追加される
  logicflows/
    {flowName}.Schema.json      ← フローの OpenAPI スキーマ
```

## ★ 最重要: dataSourcesInfo の統合（シングルトン問題）

### 問題

SDK の `getClient()` はシングルトンで、最初に呼ばれた `dataSourcesInfo` で初期化される。

- `src/generated/appschemas/dataSourcesInfo.ts` → Dataverse テーブルのみ（`npx power-apps add-data-source` で生成）
- `.power/schemas/appschemas/dataSourcesInfo.ts` → フローコネクタ含む（`npx power-apps add-flow` で生成）

**アプリ起動時に `src/generated` 版で先に初期化されると、フローサービスが `Data source not found` エラーになる。**

```
Error: Execute operation failure: Data source not found: 
Unable to find data source: {flowName} in data sources info.
```

### 解決策: 統合 dataSourcesInfo を作成

```typescript
// src/lib/dataSourcesInfo.ts
import { dataSourcesInfo as generatedInfo } from "@/generated/appschemas/dataSourcesInfo";
import { dataSourcesInfo as powerInfo } from "../../.power/schemas/appschemas/dataSourcesInfo";

export const dataSourcesInfo = {
  ...generatedInfo,
  ...powerInfo,
} as typeof generatedInfo & typeof powerInfo;
```

### 全コードでこの統合版を使用する

```typescript
// ❌ 手書きコード — これだとフローが見つからない
import { dataSourcesInfo } from "@/generated/appschemas/dataSourcesInfo";

// ✅ 統合版を使う
import { dataSourcesInfo } from "@/lib/dataSourcesInfo";
```

**フローサービス（自動生成）のインポートも変更する:**

```typescript
// src/generated/services/{FlowName}Service.ts

// ❌ 自動生成のデフォルト（Dataverse テーブルが含まれない）
import { dataSourcesInfo } from '../../../.power/schemas/appschemas/dataSourcesInfo';

// ✅ 統合版（全テーブル + フロー）
import { dataSourcesInfo } from '../../lib/dataSourcesInfo';
```

> [!WARNING]
> `npx power-apps add-flow` や `npx power-apps add-data-source` を再実行すると
> 自動生成ファイルが上書きされる。再実行後はフローサービスのインポートパスを再確認すること。

## フロー呼び出しコード

```typescript
import { SomeFlowService } from "@/generated/services/SomeFlowService";

const result = await SomeFlowService.Run({
  text: "パラメータ1",
  text_1: "パラメータ2",
  // ... 入力パラメータは ManualTriggerInput 型で定義
});

if (result.success) {
  console.log("フロー成功:", result.data);
} else {
  console.error("フロー失敗:", result.error);
}
```

## AI Builder 連携時の JSON パース処理

AI Builder のプロンプト出力は以下のいずれかの形式で返る可能性がある:

1. **正しい JSON** — そのまま `JSON.parse()` 可能
2. **\`\`\`json で囲まれた JSON** — コードブロック記号をストリップしてからパース
3. **プレーンテキスト** — JSON パースできないのでフォールバック処理

### 堅牢なパース実装

```typescript
if (flowResult.success && flowResult.data?.airesult) {
  let raw = flowResult.data.airesult.trim();
  
  // ```json ... ``` で囲まれている場合はストリップ
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "").trim();
  }
  
  let parsed: Record<string, string> | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // AI がプレーンテキストを返した場合のフォールバック
    console.warn("airesult is not JSON:", raw.slice(0, 100));
  }
  
  if (parsed && typeof parsed === "object") {
    // 正常: JSON フィールドを使用
    result = {
      field1: parsed.field1 ?? "",
      field2: parsed.field2 ?? "",
    };
  } else {
    // フォールバック: テキスト全体を特定フィールドに入れる
    result = {
      field1: "タイトル",
      field2: raw,
    };
  }
}
```

## AI Builder プロンプトに JSON 出力を強制する

AI Builder の `msdyn_customconfiguration` は API で PATCH できない（`Unexpected parameter` エラー）。
代わりに、**フローの Compose ステップで AI Builder に渡すテキストに JSON 出力指示を含める**。

### フロー Compose アクション例

```python
# フロー定義の Compose ステップ
"作業情報を構成": {
    "type": "Compose",
    "inputs": "@concat("
        "'以下の情報から修理事例を生成してください。"
        "必ずJSON形式のみで返してください。マークダウンのコードブロック記号は含めないでください。', "
        "'\\n\\n【情報】\\n項目1: ', triggerBody()['text_1'], "
        "'\\n項目2: ', triggerBody()['text_2'], "
        "'\\n\\n【出力JSON形式】\\n"
        "{\"field1\": \"値1\", \"field2\": \"値2\"}\\n\\n"
        "上記JSON形式のみで応答してください。')"
    ),
},
```

### ポイント

- プロンプトに「JSON形式のみ」「コードブロック記号を含めない」を明示
- 期待する JSON スキーマをプロンプト内にサンプルとして提示
- `temperature: 0` でモデルの創造性を抑制し、形式遵守を高める
- フロー側でフォールバック処理も実装しておく（上記パース処理）

## フロー応答アクション（PowerApp 応答）の定義

```python
"応答": {
    "runAfter": {"AI_Builder_プロンプト実行": ["Succeeded"]},
    "type": "Response",
    "kind": "PowerApp",
    "inputs": {
        "statusCode": 200,
        "body": {
            "airesult": "@{outputs('AI_Builder_プロンプト実行')?['body/responsev2/predictionOutput/text']}",
            "bookingid": "@{triggerBody()['text']}",
        },
        "schema": {
            "type": "object",
            "properties": {
                "airesult": {
                    "title": "airesult",
                    "type": "string",
                    "x-ms-content-hint": "TEXT",
                    "x-ms-dynamically-added": True,
                },
                "bookingid": {
                    "title": "bookingid",
                    "type": "string",
                    "x-ms-content-hint": "TEXT",
                    "x-ms-dynamically-added": True,
                },
            },
            "additionalProperties": {},
        },
    },
},
```

## 教訓まとめ

| # | 教訓 | 詳細 |
|---|------|------|
| 1 | **dataSourcesInfo シングルトン問題** | SDK の getClient はシングルトン。`src/generated` 版と `.power` 版を統合した `src/lib/dataSourcesInfo.ts` を作り、全コードでそれを使う |
| 2 | **PowerApps トリガー必須** | Code Apps から呼べるのは PowerApps (V2) トリガーのインスタントフローのみ |
| 3 | **AI Builder JSON 出力はプロンプト側で強制** | `msdyn_customconfiguration` は API で更新不可。Compose ステップで JSON 指示を含める |
| 4 | **JSON パースは堅牢に** | AI は \`\`\`json 付き / プレーンテキスト / 正しい JSON のいずれかで返す。全パターン対応 |
| 5 | **add-flow 再実行後はインポートパス確認** | 自動生成ファイルが上書きされるため、フローサービスの dataSourcesInfo インポートを再修正 |
| 6 | **executeAsync は CSP 安全** | フローの executeAsync は Connector 経由（postMessage ベース）であり、Dataverse fetch とは異なり CSP でブロックされない |
