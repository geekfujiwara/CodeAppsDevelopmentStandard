# Dataverseシステムフィールド問題の修正

## 問題

プロジェクトやタスクを作成・更新する際に以下のエラーが発生していました：

```
Error creating project: Error: Failed to create project in Dataverse
Error updating task: Error: Failed to update task in Dataverse
```

## 根本原因

Dataverseのシステム管理フィールド（`ownerid`, `createdbyyominame`など）に空文字列を設定しようとしていました：

```typescript
// ❌ 問題のコード
const convertProjectToDataverse = (project: Partial<Project>) => {
  return {
    geek_name: project.name,
    // ... 他のフィールド
    ownerid: '',              // ❌ システムフィールドに空文字列
    createdbyyominame: '',    // ❌ システムフィールドに空文字列
    statecode: 'Active'       // ❌ システムフィールドに値設定
  };
};
```

### Dataverseのシステムフィールドとは

Dataverseは以下のフィールドを**自動的に管理**します：

| フィールド | 説明 | 管理者 |
|-----------|------|--------|
| `ownerid` | レコード所有者のGUID | Dataverse |
| `owneridname` | 所有者の表示名 | Dataverse |
| `createdbyyominame` | 作成者のよみがな | Dataverse |
| `modifiedbyyominame` | 更新者のよみがな | Dataverse |
| `statecode` | レコードの状態（Active/Inactive） | Dataverse |
| `createdby`, `modifiedby` | 作成者・更新者のGUID | Dataverse |

これらのフィールドは：
- ✅ **読み取り専用**として扱うべき
- ❌ **Create/Update時に送信してはいけない**
- ✅ Dataverseが現在のユーザー情報から自動設定

## 解決方法

### 修正内容

システムフィールドを完全に除外し、ビジネスフィールドのみを送信：

```typescript
// ✅ 修正後のコード
const convertProjectToDataverse = (
  project: Partial<Project>
): Partial<Geek_projecrts> => {
  return {
    // ビジネスフィールドのみ
    geek_name: project.name,
    geek_description: project.description,
    geek_start: project.start,
    geek_end: project.end,
    geek_manager: project.manager,
    geek_status: project.status
    // システムフィールド(ownerid等)は除外
    // Dataverseが自動的に設定する
  };
};
```

### 型の調整

生成されたサービスファイルは厳密な型(`Omit<T, 'id'>`)を要求しますが、実際にはPartialで動作します。型アサーションで対応：

```typescript
// プロジェクト作成
const result = await Geek_projecrtsService.create(
  dvProject as Omit<Geek_projecrts, 'geek_projecrtid'>
);

// タスク作成
const result = await Geek_project_tasksService.create(
  dvTask as Omit<Geek_project_tasks, 'geek_project_taskid'>
);
```

## 詳細なエラーログの追加

デバッグを容易にするため、詳細なログを追加：

```typescript
try {
  console.log('➕ Creating project in Dataverse...', project);
  const dvProject = convertProjectToDataverse(project);
  console.log('📝 Converted Dataverse project:', dvProject);
  
  const result = await Geek_projecrtsService.create(dvProject);
  console.log('📦 Create result:', {
    success: result.success,
    hasData: !!result.data,
    error: result.error,
    fullResult: result
  });
  
  if (!result.success || !result.data) {
    const errorMsg = `Failed to create: ${result.error || 'Unknown error'}`;
    console.error('❌', errorMsg);
    throw new Error(errorMsg);
  }
} catch (err) {
  console.error('❌ Error creating project:', err);
  console.error('❌ Error details:', {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined
  });
}
```

## 修正ファイル

### `src/hooks/useDataverseProjects.ts`

1. **`convertProjectToDataverse`**:
   - システムフィールドを完全削除
   - 戻り値の型を`Partial<Geek_projecrts>`に変更

2. **`convertTaskToDataverse`**:
   - システムフィールドを完全削除
   - 戻り値の型を`Partial<Geek_project_tasks>`に変更

3. **`createProject`**:
   - 詳細なエラーログ追加
   - 型アサーション追加

4. **`createTask`**:
   - 詳細なエラーログ追加
   - 型アサーション追加

5. **`updateTask`**:
   - 詳細なエラーログ追加

## 確認方法

アプリを開いてブラウザのコンソール（F12）で以下を確認：

### ✅ プロジェクト作成成功時:
```
➕ Creating project in Dataverse... {name: "...", ...}
📝 Converted Dataverse project: {geek_name: "...", geek_description: "...", ...}
📦 Create result: {success: true, hasData: true, ...}
✅ Project created: <GUID>
```

### ✅ タスク作成成功時:
```
➕ Creating task in Dataverse... {projectId: "...", task: {...}}
📝 Converted Dataverse task: {geek_name: "...", geek_projectid: "...", ...}
📦 Create result: {success: true, data: {...}}
✅ Task created: <GUID>
```

### ❌ エラー時:
```
❌ Failed to create project in Dataverse: <詳細なエラーメッセージ>
❌ Error details: {message: "...", stack: "..."}
```

## Dataverseフィールド設計のベストプラクティス

### ビジネスフィールド（カスタムフィールド）

プレフィックス付き（例：`geek_`）のフィールドは自由に設定可能：

```typescript
{
  geek_name: "プロジェクト名",
  geek_description: "説明",
  geek_start: new Date(),
  geek_status: "InProgress"
}
```

### システムフィールド（自動管理）

これらは**読み取り専用**として扱う：

```typescript
// ❌ 送信しない
{
  ownerid: "...",
  createdbyyominame: "...",
  statecode: "Active"
}

// ✅ Dataverseから読み取るのみ
console.log(record.ownerid);      // OK - 読み取り
console.log(record.createdby);    // OK - 読み取り
```

### Lookup参照フィールド

プロジェクトIDなどの参照フィールドは設定可能：

```typescript
{
  geek_projectid: "<GUID>"  // ✅ OK - Lookup参照
}
```

## まとめ

- ✅ **修正完了**: システムフィールドを送信対象から除外
- ✅ **詳細ログ**: エラー発生時の詳細情報を出力
- ✅ **型安全性**: 適切な型アサーションで型エラーを解決
- 📝 **ベストプラクティス**: Dataverseのフィールド管理ルールを文書化

これでDataverseへのCREATE/UPDATE操作が正常に動作するようになりました！
