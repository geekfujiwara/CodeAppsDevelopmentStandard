# Dataverseデータソース名の修正について

## 問題

`pac code add-data-source`コマンドで生成されたサービスファイルのデータソース名が`______`（アンダースコア）になっており、実際のデータソース名にマッピングされない問題がありました。

## エラー内容

```
Dataverse API call failed: Error: Retrieve multiple records operation failed: 
Data source not found: ______
```

## 根本原因

生成されたサービスファイル：
```typescript
export class Geek_projecrtsService {
  private static readonly dataSourceName = '______';  // ← 問題
  ...
}
```

正しいデータソース名は`dataSourcesInfo`に定義されています：
```typescript
export const dataSourcesInfo = {
  "geek_projecrts": {  // ← 正しい名前
    "tableId": "",
    "version": "",
    "primaryKey": "geek_projecrtid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  ...
}
```

## 解決方法

### 手動修正（今回の対応）

生成されたサービスファイルを手動で修正：

**src/generated/services/Geek_projecrtsService.ts:**
```typescript
export class Geek_projecrtsService {
  private static readonly dataSourceName = 'geek_projecrts';  // 修正
  ...
}
```

**src/generated/services/Geek_project_tasksService.ts:**
```typescript
export class Geek_project_tasksService {
  private static readonly dataSourceName = 'geek_project_tasks';  // 修正
  ...
}
```

### 注意事項

⚠️ **重要**: `pac code add-data-source`を再実行すると、手動修正が上書きされます。

その場合は、再度以下の修正が必要です：
1. `Geek_projecrtsService.ts`の`dataSourceName`を`'geek_projecrts'`に変更
2. `Geek_project_tasksService.ts`の`dataSourceName`を`'geek_project_tasks'`に変更

## 今後の対応

Microsoft Power Platform CLIのバグの可能性があります。
将来のバージョンで修正される可能性がありますが、それまでは以下の対応が必要です：

### データソース追加時の手順

1. データソースを追加：
```powershell
pac code add-data-source -a dataverse -t geek_projecrt
```

2. 生成されたサービスファイルを確認：
```powershell
# Geek_projecrtsService.ts を確認
code src/generated/services/Geek_projecrtsService.ts
```

3. dataSourceNameを修正：
```typescript
- private static readonly dataSourceName = '______';
+ private static readonly dataSourceName = 'geek_projecrts';
```

4. ビルドとデプロイ：
```powershell
npm run build
pac code push
```

## 確認方法

アプリを起動後、ブラウザコンソールで以下を確認：

### ✅ 成功（修正後）:
```
📡 Calling Geek_projecrtsService.getAll()...
📦 Dataverse getAll result: { success: true, dataLength: 0 }
```

### ❌ 失敗（修正前）:
```
❌ Dataverse API call failed: Error: Retrieve multiple records operation failed: 
Data source not found: ______
```

## dataSourcesInfoとの整合性

dataSourceNameは`dataSourcesInfo`オブジェクトのキー名と一致する必要があります：

```typescript
// .power/appschemas/dataSourcesInfo.ts
export const dataSourcesInfo = {
  "geek_projecrts": { ... },        // ← Geek_projecrtsService で使用
  "geek_project_tasks": { ... },    // ← Geek_project_tasksService で使用
  "office365users": { ... }
}
```

## まとめ

- ✅ **修正完了**: データソース名を正しい値に修正
- ✅ **動作確認**: ビルドとデプロイ成功
- ⚠️ **注意**: データソース再生成時は再修正が必要
- 📝 **記録**: この問題と対処法をドキュメント化

これでDataverseからのデータ取得が正常に動作するはずです！
