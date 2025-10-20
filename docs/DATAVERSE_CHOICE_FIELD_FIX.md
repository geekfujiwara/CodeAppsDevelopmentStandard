# Dataverse Choiceフィールドの型変換問題の修正

## 最新の問題（2025/10/17）

タスク更新時に以下のエラーが発生:

```
A validation error occurred. The value 726210001 of 'geek_priority' on record of type 'geek_project_task' is outside the valid range. 
Accepted Values: 0,1
```

### 根本原因

Dataverse Choice フィールドの値は**環境によって異なります**。

- **デフォルト値**: `726210000, 726210001, 726210002...` (Power Apps標準の自動採番)
- **この環境の実際の値**: `0, 1, 2, 3...` (シンプルな連番)

## 修正内容

### `src/utils/dataverseChoiceMapping.ts`

実際のDataverseスキーマに基づいてChoice値マッピングを修正:

```typescript
// ❌ 修正前（デフォルト値）
export const PriorityChoiceMap = {
  Low: 726210000,
  Medium: 726210001,
  High: 726210002,
  Critical: 726210003
};

// ✅ 修正後（実際のDataverseスキーマの値）
export const PriorityChoiceMap = {
  Critical: 0,  // Dataverseに実在
  High: 1,      // Dataverseに実在
  Medium: 1,    // Highと同じ値にマップ（未定義）
  Low: 1        // Highと同じ値にマップ（未定義）
};
```

### 実際のDataverseスキーマ値

**geek_priority（優先度）:**
- `0`: Critical
- `1`: High

**geek_category（カテゴリ）:**
- `0`: Planning

**geek_status（タスク状態）:**
- `0`: Completed
- `1`: InProgress
- `2`: NotStarted

**geek_status（プロジェクト状態）:**
- `0`: InProgress
- `1`: Planning

### マッピング方針

1. **Dataverseに実在する値**: そのまま使用
2. **UIのみで使用する値**: 最も近い意味の値にマップ
   - 例: `Medium` → `High(1)` にマップ
   - 例: `OnHold` → `InProgress(1)` にマップ

## Choice値の確認方法

### 方法1: エラーメッセージから確認

エラーメッセージに `Accepted Values:` が表示される:
```
Accepted Values: 0,1
```

### 方法2: 既存データから確認

既存タスクを読み取ってコンソールログで確認:
```javascript
console.log('🔍 RAW Dataverse Choice Values:', tasks.map(t => ({
  priority: { value: t.geek_priority, name: t.geek_priorityname },
  category: { value: t.geek_category, name: t.geek_categoryname },
  status: { value: t.geek_status, name: t.geek_statusname }
})));
```

### 方法3: Power Apps Makerポータルで確認

1. https://make.powerapps.com を開く
2. データバース → テーブル → `geek_project_task` を選択
3. 列 → `geek_priority` を選択
4. 「選択肢」セクションで値を確認

## デバッグコードの追加

実際のChoice値を確認するためのログを追加:

```typescript
// src/hooks/useDataverseProjects.ts
if (tasksResult.data && tasksResult.data.length > 0) {
  console.log('🔍 RAW Dataverse Choice Values:', tasksResult.data.map(t => ({
    taskId: t.geek_project_taskid,
    taskName: t.geek_name,
    priority: { value: t.geek_priority, name: t.geek_priorityname, type: typeof t.geek_priority },
    category: { value: t.geek_category, name: t.geek_categoryname, type: typeof t.geeg_category },
    status: { value: t.geek_status, name: t.geek_statusname, type: typeof t.geek_status }
  })));
}
```

タスクやプロジェクトの作成・更新時に以下のエラーが発生：

```
Error: Cannot convert the literal 'Medium' to the expected type 'Edm.Int32'
```

## 根本原因

Dataverseの**選択肢(Choice/Picklist)フィールド**は、UIでは文字列として表示されますが、内部的には**整数値**として保存されます。

### エラーの詳細

```typescript
// ❌ 問題のコード - 文字列を送信
{
  geek_priority: "Medium",      // ❌ 文字列
  geek_category: "Planning",    // ❌ 文字列
  geek_status: "InProgress"     // ❌ 文字列
}
```

Dataverseは整数値を期待しているため、文字列を送信するとエラーになります：

```
InnerException: Cannot convert the literal 'Medium' to the expected type 'Edm.Int32'
```

## Dataverse選択肢フィールドの仕組み

### スキーマ定義

`.power/schemas/dataverse/_________.Schema.json`より：

```json
{
  "geek_priority": {
    "type": "string",
    "title": "priority",
    "x-ms-dataverse-attribute": "geek_priority",
    "x-ms-dataverse-type": "PicklistType"  // ← 選択肢型
  },
  "geek_priorityname": {
    "type": "string",
    "title": "geek_priorityname",
    "x-ms-dataverse-attribute": "geek_priorityname",
    "x-ms-dataverse-type": "VirtualType"    // ← 表示用仮想フィールド
  }
}
```

### 2つのフィールド

| フィールド | 型 | 用途 | 例 |
|-----------|---|------|---|
| `geek_priority` | 整数 | データ保存 | `726210001` |
| `geek_priorityname` | 文字列 | 表示用（読み取り専用） | `"Medium"` |

- **Create/Update時**: `geek_priority`に**整数値**を送信
- **Read時**: `geek_priorityname`から**文字列**を取得（または`geek_priority`を変換）

## 解決方法

### 1. 選択肢マッピングの作成

`src/utils/dataverseChoiceMapping.ts`を作成し、文字列⇔整数の変換マップを定義：

```typescript
// Priority（優先度）のマッピング
export const PriorityChoiceMap = {
  Low: 726210000,
  Medium: 726210001,
  High: 726210002,
  Critical: 726210003
};

export const PriorityChoiceReverseMap: Record<number, string> = {
  726210000: 'Low',
  726210001: 'Medium',
  726210002: 'High',
  726210003: 'Critical'
};
```

**注意**: 整数値（726210000等）は**Dataverseで実際に設定されている値**と一致させる必要があります。

### 2. 変換関数の実装

```typescript
/**
 * UIの文字列値をDataverseの整数値に変換
 */
export function convertToDataverseChoice<T extends string>(
  value: T | undefined,
  choiceMap: Record<string, number>
): number | undefined {
  if (!value) return undefined;
  return choiceMap[value];
}

/**
 * Dataverseの整数値をUIの文字列値に変換
 */
export function convertFromDataverseChoice<T extends string>(
  value: number | string | undefined,
  reverseMap: Record<number, T>
): T | undefined {
  if (value === undefined || value === null) return undefined;
  const numValue = typeof value === 'string' ? parseInt(value, 10) : value;
  return reverseMap[numValue];
}
```

### 3. タスク変換関数の修正

**Dataverse → UI（読み取り）**:

```typescript
const convertDataverseToTask = (dvTask: Geek_project_tasks): Task => {
  return {
    // ... 他のフィールド
    // 整数値を文字列に変換
    priority: convertFromDataverseChoice(
      dvTask.geek_priority, 
      PriorityChoiceReverseMap
    ) || 'Medium',
    category: convertFromDataverseChoice(
      dvTask.geek_category, 
      CategoryChoiceReverseMap
    ) || 'Planning',
    status: convertFromDataverseChoice(
      dvTask.geek_status, 
      TaskStatusChoiceReverseMap
    ) || 'NotStarted'
  };
};
```

**UI → Dataverse（保存）**:

```typescript
const convertTaskToDataverse = (
  task: Partial<Task>,
  projectId: string
): Partial<Geek_project_tasks> => {
  return {
    // ... 他のフィールド
    // 文字列を整数値に変換
    geek_priority: convertToDataverseChoice(
      task.priority, 
      PriorityChoiceMap
    ),
    geek_category: convertToDataverseChoice(
      task.category, 
      CategoryChoiceMap
    ),
    geek_status: convertToDataverseChoice(
      task.status, 
      TaskStatusChoiceMap
    ),
    geek_projectid: projectId
  };
};
```

## 選択肢の整数値の確認方法

Dataverseの選択肢フィールドの実際の整数値は、以下の方法で確認できます：

### 方法1: Power Apps Makerポータル

1. [Power Apps Maker](https://make.powerapps.com/) を開く
2. 「テーブル」→ 対象テーブル（例: `geek_project_task`）を選択
3. 「列」→ 選択肢列（例: `geek_priority`）を選択
4. 「選択肢」セクションで各オプションの値を確認

### 方法2: Dataverseからデータを読み取る

既存のレコードを取得してコンソールログで確認：

```typescript
const result = await Geek_project_tasksService.getAll();
console.log('Task priority values:', result.data.map(t => ({
  name: t.geek_name,
  priority: t.geek_priority,        // 整数値
  priorityName: t.geek_priorityname // 文字列
})));
```

### 方法3: OData エンドポイント

```
https://[org].crm7.dynamics.com/api/data/v9.2/EntityDefinitions(LogicalName='geek_project_task')/Attributes(LogicalName='geek_priority')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet
```

## 選択肢マッピングのメンテナンス

### Dataverseで選択肢を追加/変更した場合

1. `src/utils/dataverseChoiceMapping.ts`を更新
2. 新しい選択肢の整数値を追加:

```typescript
export const PriorityChoiceMap = {
  Low: 726210000,
  Medium: 726210001,
  High: 726210002,
  Critical: 726210003,
  Urgent: 726210004  // ← 新規追加
};
```

3. リバースマップも更新:

```typescript
export const PriorityChoiceReverseMap: Record<number, Task['priority']> = {
  726210000: 'Low',
  726210001: 'Medium',
  726210002: 'High',
  726210003: 'Critical',
  726210004: 'Urgent'  // ← 新規追加
};
```

4. TypeScript型定義も更新（`src/data/sampleProjects.ts`）:

```typescript
export interface Task {
  // ...
  priority: 'Low' | 'Medium' | 'High' | 'Critical' | 'Urgent';
}
```

## 確認方法

アプリを開いてブラウザコンソール（F12）で確認：

### ✅ 成功時（修正後）:

```
📝 Converted Dataverse task: {
  geek_priority: 726210001,    // ✅ 整数値
  geek_category: 726210000,    // ✅ 整数値
  geek_status: 726210001       // ✅ 整数値
}
📦 Create result: {success: true, ...}
✅ Task created: <GUID>
```

### ❌ エラー時（修正前）:

```
📝 Converted Dataverse task: {
  geek_priority: "Medium",     // ❌ 文字列
  geek_category: "Planning",   // ❌ 文字列
  geek_status: "InProgress"    // ❌ 文字列
}
❌ Failed to create: Cannot convert the literal 'Medium' to the expected type 'Edm.Int32'
```

## 対象フィールド

以下のフィールドに変換処理を適用：

### タスク（geek_project_task）
- `geek_priority` - 優先度
- `geek_category` - カテゴリ
- `geek_status` - ステータス

### プロジェクト（geek_projecrt）
- `geek_status` - ステータス

## まとめ

- ✅ **修正完了**: 選択肢フィールドの文字列⇔整数変換を実装
- ✅ **マッピング**: 各選択肢の文字列と整数値のマッピングを定義
- ✅ **双方向変換**: UI表示用とDataverse保存用の相互変換
- ⚠️ **メンテナンス**: Dataverseで選択肢変更時は同期が必要
- 📝 **ベストプラクティス**: 選択肢値の確認方法を文書化

これでタスクとプロジェクトのCRUD操作が正常に動作するようになりました！
