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
Get-ChildItem -Path "src" -Recurse -Include *.ts,*.tsx | \
  Select-String -Pattern 'Record(?:s)?Async\("([^"]+)"' -AllMatches | \
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

### 2. 統合 dataSourcesInfo インポートチェック（最重要）

全サービス・コンポーネントが **統合版 `@/lib/dataSourcesInfo`** をインポートしているか確認する。
`@/generated/appschemas/dataSourcesInfo` を直接インポートしているファイルがあればエラー。

> **実際に発生した障害（2026-05-01）:**
> `src/services/booking-service.ts` が `@/generated/appschemas/dataSourcesInfo`（Dataverse のみ）を直接使用していた。
> `getClient()` はシングルトンのため、booking-service が先に初期化されると `dataSourcesInfo` に
> Copilot Studio コネクタ（`microsoftcopilotstudio`）やフローコネクタ（`logicflows`）が含まれず、
> `MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2` が `{"success":false,"error":{}}` を返した。
> 統合版 `@/lib/dataSourcesInfo` に修正することで解決。

**チェック方法:**

```bash
# アプリコード（src/services, src/components, src/pages 等）で
# generated 版を直接参照しているファイルを検出
# ※ src/lib/dataSourcesInfo.ts 自身と src/generated/ 内は除外
Get-ChildItem -Path "src" -Recurse -Include "*.ts","*.tsx" -File |
  Where-Object { $_.FullName -notlike "*\lib\dataSourcesInfo*" -and $_.FullName -notlike "*\generated\*" } |
  Select-String -Pattern 'from\s+[''"]@/generated/appschemas/dataSourcesInfo[''"]'
```

**違反が見つかった場合:**

```typescript
// ❌ 直接インポート（getClient シングルトン問題でフロー・Copilot Studio が使えなくなる）
import { dataSourcesInfo } from "@/generated/appschemas/dataSourcesInfo";

// ✅ 統合版インポート（Dataverse + フロー + Copilot Studio 全て含む）
import { dataSourcesInfo } from "@/lib/dataSourcesInfo";
```

**なぜ統合版が必要か:**

| ファイル | 含むもの |
|---|---|
| `src/generated/appschemas/dataSourcesInfo.ts` | Dataverse テーブルのみ |
| `.power/schemas/appschemas/dataSourcesInfo.ts` | フロー・Copilot Studio コネクタのみ |
| `src/lib/dataSourcesInfo.ts`（統合版） | 上記両方をマージ（`{...generated, ...power}`） |

### 3. SDK 生成サービスのインポート元チェック

`src/generated/services/` のサービスファイルが `../../lib/dataSourcesInfo` をインポートしていることを確認。
**`npx power-apps add-data-source` でテーブル追加すると、SDK がサービスファイルを再生成し、
インポート先が `../appschemas/dataSourcesInfo` に戻ることがある。**

**チェック方法:**

```bash
# generated サービスが appschemas 版を直接参照していないか確認
Select-String -Path "src/generated/services/*.ts" `
  -Pattern 'from\s+[''"]\.\.\/appschemas\/dataSourcesInfo[''"]'
```

**違反が見つかった場合:**

```typescript
// ❌ SDK 再生成でリセットされた状態
import { dataSourcesInfo } from '../appschemas/dataSourcesInfo';

// ✅ 統合版を参照
import { dataSourcesInfo } from '../../lib/dataSourcesInfo';
```

### 4. カスタム getClient() の dataSourcesInfo 引数チェック

`getClient(dataSourcesInfo)` を呼ぶカスタムサービスが、統合版の `dataSourcesInfo` を使っていることを確認する。

**チェック方法:**

```bash
# getClient を呼んでいるファイルを列挙し、それぞれの dataSourcesInfo の import 元を確認
Get-ChildItem -Path "src" -Recurse -Include "*.ts","*.tsx" -File |
  Where-Object { $_.FullName -notlike "*\generated\*" } |
  Select-String -Pattern 'getClient\(dataSourcesInfo\)' |
  ForEach-Object {
    $file = $_.Path
    $importLine = Select-String -Path $file -Pattern 'import.*dataSourcesInfo.*from' | Select-Object -First 1
    [PSCustomObject]@{ File = $file; Import = $importLine.Line.Trim() }
  } | Format-Table -Wrap
```

## 実行フロー

```
「デプロイして」/「プッシュして」
  │
  ├─ ① dataSourcesInfo 整合性チェック
  │     → 未登録テーブルがあれば追記
  │
  ├─ ② 統合 dataSourcesInfo インポートチェック（アプリコード）
  │     → @/generated 直接参照を @/lib に修正
  │
  ├─ ③ SDK 生成サービスのインポート元チェック
  │     → ../appschemas/ を ../../lib/ に修正
  │
  ├─ ④ カスタム getClient() の引数チェック
  │     → 全て統合版 dataSourcesInfo を使用していることを確認
  │
  ├─ ⑤ npm run build
  │     → TypeScript エラーがあれば修正
  │
  └─ ⑥ npx power-apps push / pac code push
        → デプロイ完了
```

## 理由

- `getClient()` はシングルトンのため、最初に渡される `dataSourcesInfo` に全データソースが含まれていないと、
  後から初期化し直すことができない
- フロー・Copilot Studio コネクタは `.power/schemas/appschemas/dataSourcesInfo.ts` にのみ存在するため、
  `src/generated` 版だけを使うとコネクタが見つからない
- テーブルが `dataSourcesInfo` に未登録だと、ランタイムで「Data source not found」エラーになる
- `{"success":false,"error":{}}` が返る場合、CSP 問題ではなくデータソース未登録が原因であることが多い

## トラブルシューティング

### `{"success":false,"error":{}}` が `executeAsync` / Copilot Studio で返る

1. **最初にチェック**: `dataSourcesInfo` のインポート元（チェック②③④）
2. コネクタが `dataSourcesInfo` 統合版に含まれているか確認
3. `.power/schemas/appschemas/dataSourcesInfo.ts` にコネクタ定義があるか確認
4. なければ `npx power-apps add-data-source --api-id microsoftcopilotstudio ...` で再追加
