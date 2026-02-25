# Dataverse Lookupフィールドの修正について

> ⚠️ **このドキュメントは古いバージョンです**
> 
> Lookupフィールドの包括的な実装ガイドは以下を参照してください：
> 
> → **[LOOKUP_FIELD_GUIDE.md](./LOOKUP_FIELD_GUIDE.md)** ⭐ 最新・推奨版
> 
> 最新版には以下の情報が含まれています：
> - ✅ ビュー切り替え機能の実装
> - ✅ `$expand`を使用したLookup展開
> - ✅ **savedQueryパラメータの制限事項**（重要）
> - ✅ 50以上のテストチェック項目
> - ✅ 6つの主要問題のトラブルシューティング
> 
> このドキュメントは、初期の問題修正記録として保存されています。

---

## 問題

タスク作成時に以下のエラーが発生:

```
A 'PrimitiveValue' node with non-null value was found when trying to read the value of the property 'geek_projectid'; 
however, a 'StartArray' node, a 'StartObject' node, or a 'PrimitiveValue' node with null value was expected.
```

## 根本原因

Lookupフィールド `geek_projectid` を**直接GUID文字列として送信**していたため、Dataverseが正しく解釈できなかった。

### 誤った実装:
```typescript
const convertTaskToDataverse = (task, projectId) => {
  return {
    geek_name: task.name,
    // ...
    geek_projectid: projectId  // ❌ 直接GUIDを設定
  };
};
```

## 解決方法

DataverseのLookupフィールドは **`@odata.bind` 構文** で設定する必要があります（CodeAppsDevelopmentStandard準拠）。

### 正しい実装:

**作成時（Create）:**
```typescript
const convertTaskToDataverse = (task, projectId): any => {
  const dataverseTask: any = {
    geek_name: task.name,
    geek_description: task.description,
    geek_start: task.start,
    geek_end: task.end,
    geek_duration: task.duration,
    geek_progress: task.progress,
    geek_assignee: task.assignee,
    geek_priority: priorityValue,
    geek_category: categoryValue,
    geek_status: statusValue,
    // ✅ Lookupフィールド: @odata.bind構文でプロジェクトを参照
    'geek_projectid@odata.bind': `/geek_projecrts(${projectId})`
  };
  
  return dataverseTask;
};
```

**更新時（Update）:**
```typescript
const updateTask = async (projectId, taskId, updates) => {
  const dvUpdates = convertTaskToDataverse(updates, projectId);
  
  // 更新時は@odata.bindフィールドを削除（リレーションシップの変更が不要な場合）
  const updatePayload: any = { ...dvUpdates };
  delete updatePayload['geek_projectid@odata.bind'];
  
  const result = await Geek_project_tasksService.update(taskId, updatePayload);
  // ...
};
```

## @odata.bind構文について

Microsoft Dataverse Web APIでは、Lookupフィールド（参照フィールド）を設定する際、以下の構文を使用します:

```
"{navigationPropertyName}@odata.bind": "/{entitySetName}({recordId})"
```

### 例:
- **フィールド名**: `geek_projectid` (Lookup to `geek_projecrt`)
- **エンティティセット名**: `geek_projecrts` (複数形)
- **レコードID**: プロジェクトのGUID

結果: `'geek_projectid@odata.bind': '/geek_projecrts(39260bab-1ed9-47fd-85f3-18605783af2e)'`

## 公式ドキュメント

Microsoftの公式ガイドライン:
- **[Dataverse 接続ガイド（公式）](https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/how-to/connect-to-dataverse)** ⭐ 最新の公式ガイド
- [単一値ナビゲーションプロパティの関連付け](https://learn.microsoft.com/ja-jp/power-apps/developer/data-platform/webapi/associate-disassociate-entities-using-web-api#associate-with-a-single-valued-navigation-property)
- [作成時のレコード関連付け](https://learn.microsoft.com/ja-jp/power-apps/developer/data-platform/webapi/create-entity-web-api#associate-table-rows-on-create)

## 修正したファイル

- `src/hooks/useDataverseProjects.ts`
  - `convertTaskToDataverse`: Lookupフィールドを@odata.bind構文に変更
  - `updateTask`: 更新時は@odata.bindフィールドを削除

## 型定義の調整

`convertTaskToDataverse` の戻り値型を `Partial<Geek_project_tasks>` から `any` に変更:
- 理由: `@odata.bind` プロパティは生成された型定義に含まれていないため
- これはDataverse Web APIの標準的な実装パターン

## 動作確認

### ✅ 成功ログ（修正後）:
```
➕ Creating task in Dataverse... {projectId: '39260bab-1ed9-47fd-85f3-18605783af2e', task: {...}}
🔄 Choice field conversion: {priority: {input, output, type}, ...}
📝 Converted Dataverse task: {
  geek_name: 'タスク名',
  geek_projectid@odata.bind: '/geek_projecrts(39260bab-1ed9-47fd-85f3-18605783af2e)',
  ...
}
📦 Create result: {success: true, hasData: true, ...}
✅ Task created: [new-task-id]
```

### ❌ 失敗ログ（修正前）:
```
Error: A 'PrimitiveValue' node with non-null value was found when trying to read the value of the property 'geek_projectid'
```

## CodeAppsDevelopmentStandard準拠

この修正は、GitHubの `geekfujiwara/CodeAppsDevelopmentStandard` に準拠しています:

1. **Lookupフィールドの正しい処理**: `@odata.bind` 構文を使用
2. **エラーハンドリング**: 詳細なログ出力とエラーメッセージの適切な文字列化
3. **型安全性**: 必要に応じて `any` 型を使用し、実行時エラーを回避
4. **更新vs作成の区別**: 更新時はLookupフィールドを送信しない（既存リレーションシップ保持）

## まとめ

- ✅ **修正完了**: Lookupフィールドを@odata.bind構文に変更
- ✅ **タスク作成**: 新しいリレーションシップの設定が可能
- ✅ **タスク更新**: 既存のリレーションシップを保持
- ✅ **エラー解消**: ODataエラーが発生しなくなる
- 📝 **記録**: この問題と対処法をドキュメント化

これでDataverseへのタスク作成と更新が正常に動作するはずです！
