# プレデプロイレビュー（ビルド前自動チェック）

「デプロイして」「プッシュして」が実行されるたびに、ビルド前に自動で以下のレビューを行う。

## チェック項目

### 1. dataSourcesInfo 整合性チェック

コード内で使用されている全データソース（Dataverse テーブル・Power Automate フロー・Copilot Studio コネクタ）が
`src/generated/appschemas/dataSourcesInfo.ts` または `.power/schemas/appschemas/dataSourcesInfo.ts` に登録されているか確認する。

**チェック方法:**

```bash
# 1. コード内で使用されているテーブル名を抽出
#    retrieveMultipleRecordsAsync / retrieveRecordAsync の第一引数
Select-String -Path "src/services/*.ts","src/components/*.tsx" \
  -Pattern 'Record(?:s)?Async\("([^"]+)"' -AllMatches | \
  ForEach-Object { $_.Matches | ForEach-Object { $_.Groups[1].Value } } | \
  Sort-Object -Unique

# 2. dataSourcesInfo に登録済みのテーブルを抽出
Select-String -Path "src/generated/appschemas/dataSourcesInfo.ts" \
  -Pattern '^\s+"([a-z_]+)":\s*\{' | \
  ForEach-Object { $_.Matches[0].Groups[1].Value }

# 3. 差分を確認（使用されているが未登録のテーブル）
```

**未登録テーブルが見つかった場合の対処:**

```typescript
// src/generated/appschemas/dataSourcesInfo.ts に手動追記
"opportunities": {
  "tableId": "",
  "version": "",
  "primaryKey": "opportunityid",
  "dataSourceType": "Dataverse",
  "apis": {}
},
```

> 本来は `npx power-apps add-data-source` でテーブルを追加すべきだが、
> 登録済みテーブル経由で OData FormattedValue でアクセスする場合や、
> SDK 追加後も「Data source not found」となるテーブルは手動追記で対応する。

### 2. 統合 dataSourcesInfo インポートチェック

全サービス・コンポーネントが `@/lib/dataSourcesInfo`（統合版）をインポートしているか確認する。
`@/generated/appschemas/dataSourcesInfo` を直接インポートしているファイルがあればエラー。

**チェック方法:**

```bash
# 統合版を使うべきなのに generated を直接参照しているファイルを検出
# （src/lib/dataSourcesInfo.ts 自身は除外）
Select-String -Path "src/**/*.ts","src/**/*.tsx" -Recurse \
  -Pattern 'from "@/generated/appschemas/dataSourcesInfo"' | \
  Where-Object { $_.Path -notlike "*lib/dataSourcesInfo*" }
```

**違反が見つかった場合:**

```typescript
// ❌ 直接インポート（getClient シングルトン問題でフロー・Copilot Studio が使えなくなる）
import { dataSourcesInfo } from "@/generated/appschemas/dataSourcesInfo";

// ✅ 統合版インポート（Dataverse + フロー + Copilot Studio 全て含む）
import { dataSourcesInfo } from "@/lib/dataSourcesInfo";
```

### 3. SDK 生成サービスのインポート元チェック

`src/generated/services/` のサービスファイルが `../../lib/dataSourcesInfo` をインポートしていることを確認。
SDK が再生成した際に `../appschemas/dataSourcesInfo` に戻る場合があるため。

## 実行フロー

```
「デプロイして」/「プッシュして」
  │
  ├─ ① dataSourcesInfo 整合性チェック
  │     → 未登録テーブルがあれば追記
  │
  ├─ ② 統合 dataSourcesInfo インポートチェック  
  │     → @/generated 直接参照を @/lib に修正
  │
  ├─ ③ npm run build
  │     → TypeScript エラーがあれば修正
  │
  └─ ④ npx power-apps push / pac code push
        → デプロイ完了
```

## 理由

- `getClient()` はシングルトンのため、最初に渡される `dataSourcesInfo` に全データソースが含まれていないと、
  後から初期化し直すことができない
- フロー・Copilot Studio コネクタは `.power/schemas/appschemas/dataSourcesInfo.ts` にのみ存在するため、
  `src/generated` 版だけを使うとコネクタが見つからない
- テーブルが `dataSourcesInfo` に未登録だと、ランタイムで「Data source not found」エラーになる
