# Dataverseテーブル統合のベストプラクティス

**最終更新**: 2026年2月4日  
**対象Phase**: Phase 3（データソース統合）

---

## 📋 概要

このドキュメントは、Power Apps Code AppsでDataverseテーブルをデータソースとして追加し、CRUD操作を実装する際のベストプラクティスとトラブルシューティングガイドです。

実際の業務プロセスデザイナーアプリ開発で発見された課題と解決策を基に、効率的で確実なDataverse統合の手順をまとめています。

---

## 🎯 このドキュメントで学べること

✅ **プロジェクト初期化の正しい手順**  
✅ **Dataverseテーブル接続の確実な方法**  
✅ **CRUD操作の実装パターン**  
✅ **よくある問題とその解決方法**  
✅ **パフォーマンス最適化のヒント**  
✅ **セキュリティとエラーハンドリング**

---

## 📚 目次

1. [プロジェクト初期化](#1-プロジェクト初期化)
2. [Dataverseテーブル接続](#2-dataverseテーブル接続)
3. [スキーマ取得と型定義](#3-スキーマ取得と型定義)
4. [CRUD操作の実装](#4-crud操作の実装)
5. [エラーハンドリングとバリデーション](#5-エラーハンドリングとバリデーション)
6. [パフォーマンス最適化](#6-パフォーマンス最適化)
7. [トラブルシューティング](#7-トラブルシューティング)
8. [実装チェックリスト](#8-実装チェックリスト)

---

## 1. プロジェクト初期化

### 1.1 環境セットアップ

**前提条件:**
- Node.js (v18以上推奨)
- Power Platform CLI (`pac`)
- Visual Studio Code

```bash
# Power Platform CLIのインストール確認
pac --version

# 環境認証
pac auth create --environment [環境ID]
```

### 1.2 プロジェクト作成

⚠️ **重要**: 必ずMicrosoft標準テンプレートから開始してください。

```bash
# 1. プロジェクトフォルダ作成
mkdir YourAppName
cd YourAppName
code .

# 2. VS Codeでフォルダを開いた後、Microsoft標準テンプレートを使用
npm create vite@latest . -- --template react-ts
npm install

# 3. Power Apps SDKをインストール（最新版を推奨）
npm install @microsoft/power-apps@latest

# 4. 初期動作確認
npm run dev
```

### 1.3 Power Apps初期化

```bash
# Power Apps環境でプロジェクトを初期化
pac code init --environment [環境ID] --displayName "Your App Name"

# ローカル実行で動作確認
npm run dev

# 初回デプロイ
npm run build
pac code push
```

**✅ Phase 1完了確認:**
- [ ] Microsoft標準テンプレートが正常にデプロイされている
- [ ] Power Apps環境でアプリが表示される
- [ ] SDK初期化エラーが発生していない

---

## 2. Dataverseテーブル接続

### 2.1 接続作成の手順

#### Step 1: Power Appsポータルで接続を作成

1. [Power Apps Maker Portal](https://make.powerapps.com) にアクセス
2. 左メニューから「接続」を選択
3. 「+ 新しい接続」をクリック
4. 「Microsoft Dataverse」を検索して選択
5. 「作成」をクリック

#### Step 2: 接続IDの取得

接続作成後、URLから接続IDをコピーします。

```
URL例:
https://make.powerapps.com/environments/[環境ID]/connections/shared_commondataserviceforapps/[接続ID]/details

接続ID: [接続ID]の部分をコピー
```

### 2.2 データソースの追加

```bash
# Dataverseテーブルを追加
pac code add-data-source -a "shared_commondataserviceforapps" -c "[接続ID]" -t "[テーブル論理名]"

# 例: geek_businessprocess テーブルを追加
pac code add-data-source -a "shared_commondataserviceforapps" -c "12345678-abcd-..." -t "geek_businessprocesses"
```

**⚠️ 注意点:**
- テーブル論理名は複数形を使用（例: `geek_businessprocesses`）
- 接続IDは必ず正確にコピーする
- コマンド実行後、`src/services/` フォルダに型定義ファイルが生成される

### 2.3 生成されるファイル

```
src/
└── services/
    └── geek_businessprocesses/
        ├── index.ts              # サービスクラス
        └── types.ts              # 型定義
```

---

## 3. スキーマ取得と型定義

### 3.1 スキーマ情報の取得方法

Dataverseテーブルのスキーマ情報を取得する方法は5つあります。

#### 方法1: Make Power Appsポータル（最も簡単）

1. [Power Apps Maker Portal](https://make.powerapps.com) にアクセス
2. 「テーブル」→「すべて」を選択
3. 対象テーブルを検索
4. テーブルを開いて「列」タブでフィールド情報を確認

#### 方法2: ソリューションエクスポート（推奨）

```bash
# 1. ソリューションをエクスポート（Power Appsポータル）
# 2. zipファイルを解凍
# 3. customization.xml を確認

# customization.xml からスキーマ抽出
# XMLにテーブル定義、フィールド定義、選択肢の値が含まれる
```

詳細は [スキーマ取得方法ガイド](./HOW_TO_GET_DATAVERSE_SCHEMA.md) を参照してください。

### 3.2 TypeScript型定義の作成

```typescript
// src/types/businessprocess.ts

export interface BusinessProcess {
  geek_businessprocessid: string;
  geek_name: string;
  geek_description?: string;
  geek_status?: number;  // Choice値
  geek_priority?: number;  // Choice値
  createdon?: string;
  modifiedon?: string;
  _ownerid_value?: string;  // Lookup
}

// Choice値の型定義
export enum BusinessProcessStatus {
  Draft = 1,
  Active = 2,
  Completed = 3,
  Archived = 4
}

export enum BusinessProcessPriority {
  Low = 1,
  Medium = 2,
  High = 3,
  Critical = 4
}
```

### 3.3 Choice値のマッピング

```typescript
// src/utils/choiceMapping.ts

export const statusLabels: Record<number, string> = {
  1: "下書き",
  2: "アクティブ",
  3: "完了",
  4: "アーカイブ済み"
};

export const priorityLabels: Record<number, string> = {
  1: "低",
  2: "中",
  3: "高",
  4: "緊急"
};

// Choice値からラベルを取得するヘルパー関数
export function getStatusLabel(status?: number): string {
  return status !== undefined ? statusLabels[status] || "不明" : "-";
}

export function getPriorityLabel(priority?: number): string {
  return priority !== undefined ? priorityLabels[priority] || "不明" : "-";
}
```

---

## 4. CRUD操作の実装

### 4.1 カスタムフックの作成

SDK初期化を確認し、データアクセスをカプセル化するカスタムフックを作成します。

```typescript
// src/hooks/useBusinessProcesses.ts

import { useState, useEffect } from 'react';
import { usePowerPlatform } from '@microsoft/power-apps';
import { BusinessProcess } from '../types/businessprocess';
import { geek_businessprocesses } from '../services/geek_businessprocesses';

export function useBusinessProcesses() {
  const { isInitialized } = usePowerPlatform();
  const [processes, setProcesses] = useState<BusinessProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // データ取得
  const fetchProcesses = async () => {
    if (!isInitialized) {
      console.warn("Power Apps SDK not initialized yet");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await geek_businessprocesses.getAll();
      
      if (result.isSuccess && result.data) {
        setProcesses(result.data);
      } else {
        setError(result.error?.message || "データの取得に失敗しました");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "予期しないエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  // 初期化完了後に自動読み込み
  useEffect(() => {
    if (isInitialized) {
      fetchProcesses();
    }
  }, [isInitialized]);

  return {
    processes,
    loading,
    error,
    refetch: fetchProcesses
  };
}
```

### 4.2 Create（作成）操作

```typescript
// カスタムフックに追加

export function useBusinessProcesses() {
  // ... 既存のコード ...

  const createProcess = async (data: Partial<BusinessProcess>) => {
    if (!isInitialized) {
      throw new Error("Power Apps SDK is not initialized");
    }

    setLoading(true);
    setError(null);

    try {
      const result = await geek_businessprocesses.create({
        geek_name: data.geek_name || "",
        geek_description: data.geek_description,
        geek_status: data.geek_status || 1,  // デフォルト: 下書き
        geek_priority: data.geek_priority || 2,  // デフォルト: 中
      });

      if (result.isSuccess) {
        await fetchProcesses();  // リスト再読み込み
        return result.data;
      } else {
        throw new Error(result.error?.message || "作成に失敗しました");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "予期しないエラーが発生しました";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return {
    processes,
    loading,
    error,
    refetch: fetchProcesses,
    createProcess
  };
}
```

### 4.3 Read（読み取り）操作

```typescript
// 単一レコードの取得
const getProcessById = async (id: string) => {
  if (!isInitialized) {
    throw new Error("Power Apps SDK is not initialized");
  }

  try {
    const result = await geek_businessprocesses.getById(id);
    
    if (result.isSuccess && result.data) {
      return result.data;
    } else {
      throw new Error(result.error?.message || "データの取得に失敗しました");
    }
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "予期しないエラーが発生しました");
  }
};

// フィルター付き取得
const getProcessesByStatus = async (status: number) => {
  if (!isInitialized) {
    throw new Error("Power Apps SDK is not initialized");
  }

  try {
    const result = await geek_businessprocesses.getAll({
      filter: `geek_status eq ${status}`
    });
    
    if (result.isSuccess && result.data) {
      return result.data;
    } else {
      throw new Error(result.error?.message || "データの取得に失敗しました");
    }
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "予期しないエラーが発生しました");
  }
};
```

### 4.4 Update（更新）操作

```typescript
// カスタムフックに追加

const updateProcess = async (id: string, data: Partial<BusinessProcess>) => {
  if (!isInitialized) {
    throw new Error("Power Apps SDK is not initialized");
  }

  setLoading(true);
  setError(null);

  try {
    const result = await geek_businessprocesses.update(id, data);

    if (result.isSuccess) {
      await fetchProcesses();  // リスト再読み込み
      return result.data;
    } else {
      throw new Error(result.error?.message || "更新に失敗しました");
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "予期しないエラーが発生しました";
    setError(errorMessage);
    throw new Error(errorMessage);
  } finally {
    setLoading(false);
  }
};
```

### 4.5 Delete（削除）操作

```typescript
// カスタムフックに追加

const deleteProcess = async (id: string) => {
  if (!isInitialized) {
    throw new Error("Power Apps SDK is not initialized");
  }

  setLoading(true);
  setError(null);

  try {
    const result = await geek_businessprocesses.delete(id);

    if (result.isSuccess) {
      await fetchProcesses();  // リスト再読み込み
      return true;
    } else {
      throw new Error(result.error?.message || "削除に失敗しました");
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "予期しないエラーが発生しました";
    setError(errorMessage);
    throw new Error(errorMessage);
  } finally {
    setLoading(false);
  }
};
```

### 4.6 UI統合の例

```typescript
// src/components/BusinessProcessList.tsx

import { useBusinessProcesses } from '../hooks/useBusinessProcesses';
import { getStatusLabel, getPriorityLabel } from '../utils/choiceMapping';

export function BusinessProcessList() {
  const { processes, loading, error, createProcess, updateProcess, deleteProcess } = useBusinessProcesses();

  if (loading) {
    return <div>読み込み中...</div>;
  }

  if (error) {
    return <div className="text-red-500">エラー: {error}</div>;
  }

  return (
    <div>
      <h2>ビジネスプロセス一覧</h2>
      <table>
        <thead>
          <tr>
            <th>名前</th>
            <th>ステータス</th>
            <th>優先度</th>
            <th>作成日</th>
          </tr>
        </thead>
        <tbody>
          {processes.map((process) => (
            <tr key={process.geek_businessprocessid}>
              <td>{process.geek_name}</td>
              <td>{getStatusLabel(process.geek_status)}</td>
              <td>{getPriorityLabel(process.geek_priority)}</td>
              <td>{process.createdon ? new Date(process.createdon).toLocaleDateString('ja-JP') : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## 5. エラーハンドリングとバリデーション

### 5.1 SDK初期化チェック

⚠️ **最も重要**: SDK初期化を必ず確認してください。

```typescript
import { usePowerPlatform } from '@microsoft/power-apps';

export function App() {
  const { isInitialized } = usePowerPlatform();

  // SDK初期化が完了するまで待機
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4">Power Apps SDK 初期化中...</p>
        </div>
      </div>
    );
  }

  // 初期化完了後にコンテンツを表示
  return <YourApp />;
}
```

### 5.2 操作結果の確認

```typescript
// ✅ 正しい実装: isSuccess を必ず確認
const result = await geek_businessprocesses.create(data);

if (result.isSuccess && result.data) {
  // 成功時の処理
  console.log("作成成功:", result.data);
} else {
  // エラー時の処理
  console.error("作成失敗:", result.error?.message);
  throw new Error(result.error?.message || "作成に失敗しました");
}

// ❌ 間違った実装: isSuccess を確認せずに使用
const result = await geek_businessprocesses.create(data);
console.log(result.data.geek_businessprocessid);  // エラー時にクラッシュする
```

### 5.3 バリデーション

```typescript
// src/utils/validation.ts

export function validateBusinessProcess(data: Partial<BusinessProcess>): string[] {
  const errors: string[] = [];

  // 必須フィールド
  if (!data.geek_name || data.geek_name.trim() === "") {
    errors.push("名前は必須です");
  }

  // 文字数制限
  if (data.geek_name && data.geek_name.length > 100) {
    errors.push("名前は100文字以内で入力してください");
  }

  if (data.geek_description && data.geek_description.length > 2000) {
    errors.push("説明は2000文字以内で入力してください");
  }

  // Choice値の範囲チェック
  if (data.geek_status !== undefined && ![1, 2, 3, 4].includes(data.geek_status)) {
    errors.push("無効なステータス値です");
  }

  if (data.geek_priority !== undefined && ![1, 2, 3, 4].includes(data.geek_priority)) {
    errors.push("無効な優先度値です");
  }

  return errors;
}

// 使用例
const createProcess = async (data: Partial<BusinessProcess>) => {
  // バリデーション
  const validationErrors = validateBusinessProcess(data);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(", "));
  }

  // データ作成
  const result = await geek_businessprocesses.create(data);
  // ...
};
```

### 5.4 エラーメッセージの国際化

```typescript
// src/utils/errorMessages.ts

export const errorMessages: Record<string, string> = {
  "not_initialized": "Power Apps SDKが初期化されていません",
  "permission_denied": "このテーブルへのアクセス権限がありません",
  "not_found": "指定されたレコードが見つかりません",
  "network_error": "ネットワークエラーが発生しました",
  "validation_error": "入力内容に誤りがあります",
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "予期しないエラーが発生しました";
}
```

---

## 6. パフォーマンス最適化

### 6.1 データ取得の最適化

```typescript
// ✅ 推奨: 必要なフィールドのみを取得
const result = await geek_businessprocesses.getAll({
  select: ["geek_businessprocessid", "geek_name", "geek_status", "createdon"]
});

// ❌ 非推奨: 全フィールドを取得（パフォーマンス低下）
const result = await geek_businessprocesses.getAll();
```

### 6.2 ページネーション

```typescript
// ページング付きデータ取得
const fetchProcessesWithPaging = async (pageSize: number = 50) => {
  const result = await geek_businessprocesses.getAll({
    top: pageSize
  });

  if (result.isSuccess && result.data) {
    return result.data;
  }
  return [];
};
```

### 6.3 フィルタリング

```typescript
// サーバー側フィルタリング（推奨）
const result = await geek_businessprocesses.getAll({
  filter: `geek_status eq 2 and geek_priority ge 3`
});

// 複数条件のフィルター
const filter = [
  "geek_status eq 2",  // アクティブ
  "geek_priority ge 3",  // 優先度: 高以上
  "createdon ge 2024-01-01"  // 2024年以降
].join(" and ");

const result = await geek_businessprocesses.getAll({ filter });
```

### 6.4 キャッシング

```typescript
// React Queryを使用したキャッシング（推奨）
import { useQuery } from '@tanstack/react-query';

export function useBusinessProcesses() {
  const { isInitialized } = usePowerPlatform();

  return useQuery({
    queryKey: ['businessProcesses'],
    queryFn: async () => {
      if (!isInitialized) {
        throw new Error("SDK not initialized");
      }
      
      const result = await geek_businessprocesses.getAll();
      if (result.isSuccess && result.data) {
        return result.data;
      }
      throw new Error(result.error?.message || "Failed to fetch");
    },
    enabled: isInitialized,  // SDK初期化後のみ実行
    staleTime: 5 * 60 * 1000,  // 5分間キャッシュ
  });
}
```

---

## 7. トラブルシューティング

### 7.1 よくあるエラーと解決方法

#### エラー1: SDK初期化エラー

```
PowerDataRuntimeError: PowerDataRuntime is not initialized. 
Please call initializeRuntime() first.
```

**原因:**
- SDK初期化前にデータアクセスしている
- `isInitialized` チェックが実装されていない

**解決方法:**
```typescript
const { isInitialized } = usePowerPlatform();

useEffect(() => {
  if (isInitialized) {
    fetchData();  // SDK初期化後に実行
  }
}, [isInitialized]);
```

#### エラー2: 接続エラー

```
Error: Failed to fetch data from Dataverse
```

**原因:**
- 接続IDが正しくない
- テーブル名が間違っている
- アクセス権限がない

**解決方法:**
1. 接続IDを再確認
2. テーブル論理名を確認（複数形を使用）
3. Power Appsポータルでセキュリティロールを確認

#### エラー3: Choice値が表示されない

```
表示結果: 1, 2, 3 (数値のまま表示される)
```

**解決方法:**
```typescript
// Choice値マッピング関数を使用
import { getStatusLabel } from '../utils/choiceMapping';

// ❌ 間違い
<td>{process.geek_status}</td>

// ✅ 正しい
<td>{getStatusLabel(process.geek_status)}</td>
```

### 7.2 デバッグ方法

```typescript
// デバッグ用のログ出力
const fetchProcesses = async () => {
  console.log("🔍 Fetching processes...");
  console.log("SDK Initialized:", isInitialized);

  try {
    const result = await geek_businessprocesses.getAll();
    
    console.log("📦 Result:", {
      isSuccess: result.isSuccess,
      dataCount: result.data?.length || 0,
      error: result.error?.message
    });

    if (result.isSuccess && result.data) {
      console.log("✅ Fetched processes:", result.data.length);
      setProcesses(result.data);
    } else {
      console.error("❌ Fetch failed:", result.error);
      setError(result.error?.message || "データの取得に失敗しました");
    }
  } catch (err) {
    console.error("❌ Exception:", err);
    setError(err instanceof Error ? err.message : "予期しないエラーが発生しました");
  }
};
```

### 7.3 ネットワークトラフィックの確認

ブラウザの開発者ツールで以下を確認：

1. **Network タブ**
   - Dataverse APIへのリクエストを確認
   - ステータスコード（200, 401, 403, 500等）
   - レスポンスボディ

2. **Console タブ**
   - エラーメッセージ
   - SDK初期化ログ
   - カスタムログ出力

---

## 8. 実装チェックリスト

### 8.1 プロジェクト初期化

- [ ] Microsoft標準テンプレートから開始
- [ ] `@microsoft/power-apps` を最新版にアップデート
- [ ] `pac code init` でプロジェクトを初期化
- [ ] 初回デプロイが成功
- [ ] SDK初期化エラーが発生していない

### 8.2 Dataverseテーブル接続

- [ ] Power Appsポータルで接続を作成
- [ ] 接続IDを正確に取得
- [ ] `pac code add-data-source` コマンドを実行
- [ ] サービスクラスファイルが生成されている
- [ ] 型定義ファイルが生成されている

### 8.3 スキーマとデータ型

- [ ] テーブルスキーマを確認
- [ ] TypeScript型定義を作成
- [ ] Choice値のマッピングを定義
- [ ] Lookupフィールドの型定義を作成（該当する場合）

### 8.4 CRUD操作の実装

- [ ] カスタムフックを作成
- [ ] SDK初期化チェックを実装（`isInitialized`）
- [ ] Create操作を実装
- [ ] Read操作を実装
- [ ] Update操作を実装
- [ ] Delete操作を実装
- [ ] `IOperationResult.isSuccess` を必ず確認

### 8.5 エラーハンドリング

- [ ] SDK初期化待機ロジックを実装
- [ ] エラーメッセージの表示を実装
- [ ] バリデーション関数を作成
- [ ] try-catch でエラーをキャッチ
- [ ] ユーザーフレンドリーなエラーメッセージ

### 8.6 パフォーマンス最適化

- [ ] 必要なフィールドのみを取得（`select`）
- [ ] フィルタリングを実装（`filter`）
- [ ] ページネーションを実装（`top`）
- [ ] キャッシングを検討（React Query等）

### 8.7 UI統合

- [ ] ローディング状態を表示
- [ ] エラー状態を表示
- [ ] データが正しく表示される
- [ ] Choice値がラベル表示される
- [ ] 日付が適切にフォーマットされる

### 8.8 テストとデプロイ

- [ ] ローカル環境でテスト（`npm run dev`）
- [ ] Power Apps環境でテスト（`pac code init` + `npm run dev`）
- [ ] 本番デプロイ（`npm run build` + `pac code push`）
- [ ] 本番環境で動作確認
- [ ] エラーログを確認

---

## 🔗 関連ドキュメント

- **[Phase 3 リファレンス](../PHASE3_DATA_INTEGRATION.md)** - データソース統合の詳細
- **[Lookupフィールドガイド](./LOOKUP_FIELD_GUIDE.md)** - Lookup実装の完全ガイド
- **[スキーマ取得方法](./HOW_TO_GET_DATAVERSE_SCHEMA.md)** - 5つの取得方法
- **[Dataverseスキーマリファレンス](./DATAVERSE_SCHEMA_REFERENCE.md)** - スキーマ定義
- **[Dataverseトラブルシューティング](./DATAVERSE_TROUBLESHOOTING.md)** - よくある問題
- **[Dataverseデバッグガイド](./DATAVERSE_DEBUG.md)** - デバッグ手順

---

## 📝 まとめ

このベストプラクティスガイドに従うことで、以下が実現できます：

✅ **確実なDataverse統合** - SDK初期化からCRUD操作まで  
✅ **エラーの少ない実装** - よくある問題を事前に回避  
✅ **保守しやすいコード** - 標準パターンに従った実装  
✅ **高パフォーマンス** - 最適化されたデータアクセス  
✅ **トラブルシューティング** - 問題発生時の迅速な解決

**Happy Coding! 🚀**
