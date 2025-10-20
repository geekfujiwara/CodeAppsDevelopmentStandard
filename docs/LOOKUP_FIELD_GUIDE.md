# Dataverse Lookupフィールドの実装ガイド
## Power Apps SDK を使用したビュー切り替え機能付きコンボボックス

**バージョン**: 1.9.7  
**最終更新**: 2025年10月21日  
**対象**: Power Apps Code Apps with TypeScript + React

---

## 📋 目次

1. [概要](#概要)
2. [できること・できないこと](#できること・できないこと)
3. [アーキテクチャ](#アーキテクチャ)
4. [実装手順](#実装手順)
5. [テストチェックリスト](#テストチェックリスト)
6. [トラブルシューティング](#トラブルシューティング)
7. [ベストプラクティス](#ベストプラクティス)

---

## 概要

このガイドでは、Dataverse の Lookup フィールドに対して、ビュー切り替え機能を持つ検索可能なコンボボックスを実装する方法を説明します。

### 実装例

- **カスタムテーブル**: `geek_project_tasks`（プロジェクトタスク）
- **Lookupフィールド**: `geek_lookup_assignee`（担当者）
- **参照先テーブル**: `systemusers`（SystemUser - Dataverse標準テーブル）
- **機能**: 
  - ビュー切り替え（アクティブなユーザー、有効なユーザー、無効なユーザー）
  - リアルタイム検索
  - キーボード操作対応

---

## できること・できないこと

### ✅ できること

#### データ取得
- ✅ Dataverse標準テーブル（systemusers等）からのデータ取得
- ✅ カスタムテーブルからのデータ取得
- ✅ ビュー（SavedQuery）のフィルター条件を使用したデータ取得
- ✅ `$expand` を使用したLookupフィールドの展開
- ✅ `$select` によるフィールドの選択
- ✅ `$filter` によるカスタムフィルター
- ✅ `$orderby` による並び替え
- ✅ ページネーション（`top`, `skip`）

#### データ保存
- ✅ `@odata.bind` 構文を使用したLookup参照の作成
- ✅ Lookup参照の更新
- ✅ Lookup参照のクリア（null設定）
- ✅ 複数のLookupフィールドを持つレコードの保存

#### UI機能
- ✅ リアルタイム検索（クライアント側フィルタリング）
- ✅ ビュー切り替えによるデータセット変更
- ✅ キーボード操作（矢印キー、Enter、Escape）
- ✅ マウスホイールによるスクロール
- ✅ ロード中状態の表示
- ✅ エラー状態の表示

### ❌ できないこと・制限事項

#### データアクセス
- ❌ `savedQuery` パラメータによる直接的なビュー指定（Power Apps SDKの型定義に含まれていない）
- ❌ **ビュー一覧の取得は可能だが、フィルターとして機能しない** - `retrieveMultipleRecordsAsync`に`savedQuery`パラメータを渡してもフィルタリングされない。代わりにODataフィルター式を使用する必要がある
- ❌ `savedqueries` テーブルへの直接アクセス（権限が必要な場合がある）
- ❌ FetchXMLの直接実行（Power Apps SDK経由では不可）
- ❌ 複雑な JOIN クエリ（`$expand` の制限）

#### UI制限
- ❌ サーバーサイド検索（常にすべてのデータを取得してクライアント側でフィルター）
- ❌ 仮想スクロール（大量データには不向き）
- ❌ 複数選択（Multiple Lookup）

#### パフォーマンス
- ⚠️ 100件以上のレコードではパフォーマンスが低下する可能性
- ⚠️ `$expand` の深さは1階層まで推奨

---

## アーキテクチャ

### コンポーネント構成

```
TaskDialog.tsx
  └─ Combobox (UI コンポーネント)
      └─ useDataverseUsers (カスタムフック)
          └─ SystemUsersService (データアクセス層)
              └─ Power Apps SDK Client
                  └─ Dataverse Web API
```

### データフロー

```
1. ビュー選択
   User -> changeView(viewId) -> useDataverseUsers

2. データ取得
   useDataverseUsers -> SystemUsersService.getUsersByView(viewId)
   -> retrieveMultipleRecordsAsync({ filter: "..." })
   -> Dataverse Web API

3. データ変換
   Dataverse Response -> convertToStandardUser()
   -> StandardUser[] -> Combobox

4. ユーザー選択
   Combobox -> onValueChange(userId)
   -> TaskDialog.formData.assigneeId

5. データ保存
   TaskDialog -> toDataverseTask()
   -> { "geek_lookup_assignee@odata.bind": "/systemusers(GUID)" }
   -> Geek_project_tasksService.create()
   -> Dataverse Web API
```

---

## 実装手順

### Step 1: データソースの設定

#### 1.1 power.config.json に参照先テーブルを追加

```json
{
  "databaseReferences": {
    "default.cds": {
      "dataSources": {
        "SystemUsers": {
          "entitySetName": "systemusers",
          "logicalName": "systemuser",
          "isHidden": false
        },
        "Geek_project_tasks": {
          "entitySetName": "geek_project_tasks",
          "logicalName": "geek_project_task",
          "isHidden": false
        }
      }
    }
  }
}
```

#### 1.2 スキーマファイルの作成（必要に応じて）

`.power/schemas/dataverse/SystemUsers.Schema.json`

```json
{
  "name": "systemuser",
  "title": "User",
  "x-ms-dataverse-entityset": "systemusers",
  "x-ms-dataverse-primary-id": "systemuserid",
  "properties": {
    "systemuserid": {
      "type": "string",
      "format": "uuid",
      "x-ms-dataverse-primary-id": true
    },
    "fullname": {
      "type": "string",
      "title": "Full Name"
    },
    "internalemailaddress": {
      "type": "string",
      "title": "Email"
    },
    "isdisabled": {
      "type": "boolean",
      "title": "Is Disabled"
    }
  }
}
```

### Step 2: サービス層の実装

#### 2.1 SystemUsersService の作成

**ファイル**: `src/generated/services/SystemUsersService.ts`

```typescript
import { dataSourcesInfo } from '../../../.power/appschemas/dataSourcesInfo';
import type { IOperationResult } from '@microsoft/power-apps/data';
import { getClient } from '@microsoft/power-apps/data';
import type { IGetOptions, IGetAllOptions } from '../models/CommonModels';

export interface SystemUser {
  systemuserid?: string;
  fullname?: string;
  internalemailaddress?: string;
  title?: string;
  isdisabled?: boolean;
  azureactivedirectoryobjectid?: string;
}

export interface SystemUserView {
  savedqueryid: string;
  name: string;
  returnedtypecode: string;
}

export class SystemUsersService {
  private static readonly dataSourceName = 'systemusers';
  private static readonly client = getClient(dataSourcesInfo);
  
  // ビューID定数
  public static readonly VIEWS = {
    ACTIVE_USERS: '00000000-0000-0000-00aa-000010001019',
    ENABLED_USERS: '00000000-0000-0000-00aa-000010001039',
    DISABLED_USERS: '00000000-0000-0000-00aa-000010001029',
  };
  
  // 事前定義されたビューリスト
  public static readonly PREDEFINED_VIEWS: SystemUserView[] = [
    { 
      savedqueryid: '00000000-0000-0000-00aa-000010001019', 
      name: 'アクティブなユーザー', 
      returnedtypecode: 'systemuser' 
    },
    { 
      savedqueryid: '00000000-0000-0000-00aa-000010001039', 
      name: '有効なユーザー', 
      returnedtypecode: 'systemuser' 
    },
    { 
      savedqueryid: '00000000-0000-0000-00aa-000010001029', 
      name: '無効なユーザー', 
      returnedtypecode: 'systemuser' 
    },
  ];
  
  // ビューごとのフィルター条件
  private static readonly VIEW_FILTERS: Record<string, string> = {
    '00000000-0000-0000-00aa-000010001019': 'isdisabled eq false and accessmode ne 4',
    '00000000-0000-0000-00aa-000010001039': 'isdisabled eq false',
    '00000000-0000-0000-00aa-000010001029': 'isdisabled eq true',
  };

  /**
   * ビュー一覧を取得
   * 注意: savedqueries テーブルへのアクセス権限がない場合があるため、
   * 事前定義されたビューリストを返す
   * 
   * ⚠️ 重要: ビュー一覧の取得は可能だが、retrieveMultipleRecordsAsync に
   * savedQuery パラメータを渡してもフィルタリングは機能しない。
   * ビューのフィルター条件は手動でODataフィルター式に変換して使用する必要がある。
   */
  public static async getViews(): Promise<IOperationResult<SystemUserView[]>> {
    return {
      success: true,
      data: SystemUsersService.PREDEFINED_VIEWS
    };
  }

  /**
   * 指定したビューでユーザー一覧を取得
   * ビューのフィルター条件を適用してデータを取得
   * 
   * ⚠️ 注意: savedQuery パラメータは機能しないため、
   * VIEW_FILTERS で定義したODataフィルター式を使用
   */
  public static async getUsersByView(
    viewId: string, 
    options?: IGetAllOptions
  ): Promise<IOperationResult<SystemUser[]>> {
    const viewFilter = SystemUsersService.VIEW_FILTERS[viewId];
    
    const queryOptions: IGetAllOptions = {
      ...options,
      select: options?.select || [
        'systemuserid', 
        'fullname', 
        'internalemailaddress', 
        'title', 
        'azureactivedirectoryobjectid', 
        'isdisabled'
      ],
      filter: viewFilter || options?.filter,
      orderBy: ['fullname asc']
    };

    console.log('🔧 getUsersByView:', { viewId, filter: queryOptions.filter });

    const result = await SystemUsersService.client.retrieveMultipleRecordsAsync<SystemUser>(
      SystemUsersService.dataSourceName,
      queryOptions
    );

    console.log('✅ Result:', { 
      viewId, 
      dataLength: result.data?.length, 
      filter: queryOptions.filter 
    });

    return result;
  }

  /**
   * IDでユーザーを取得
   */
  public static async get(id: string, options?: IGetOptions): Promise<IOperationResult<SystemUser>> {
    return await SystemUsersService.client.retrieveRecordAsync<SystemUser>(
      SystemUsersService.dataSourceName,
      id.toString(),
      options
    );
  }
}
```

**重要なポイント:**

1. **`savedQuery` パラメータの制限**: Power Apps SDKの型定義に含まれていないため、代わりにフィルター条件を使用
2. **フィルター条件の定義**: 各ビューに対応するODataフィルター式を事前定義
3. **`VIEW_FILTERS` の管理**: ビューIDをキーとした辞書で管理
4. **エラーハンドリング**: ビューが見つからない場合のフォールバック

### Step 3: カスタムフックの実装

#### 3.1 useDataverseUsers フックの作成

**ファイル**: `src/hooks/useDataverseUsers.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { SystemUsersService, SystemUserView } from '../generated/services/SystemUsersService';
import type { SystemUser } from '../generated/services/SystemUsersService';
import { usePowerApps } from '../PowerProvider';

export interface StandardUser {
  id: string;
  displayName: string;
  email?: string;
  jobTitle?: string;
  azureADObjectId?: string;
}

const isPowerAppsEnvironment = (): boolean => {
  return typeof window !== 'undefined' && (
    window.location.hostname.includes('apps.powerapps.com') ||
    window.location.hostname.includes('make.powerapps.com') ||
    process.env.NODE_ENV === 'production'
  );
};

export const useDataverseUsers = () => {
  const { isInitialized } = usePowerApps();
  const [currentUser, setCurrentUser] = useState<StandardUser | null>(null);
  const [users, setUsers] = useState<StandardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [views, setViews] = useState<SystemUserView[]>([]);
  const [currentViewId, setCurrentViewId] = useState<string>(
    SystemUsersService.VIEWS.ACTIVE_USERS
  );
  const [viewsLoading, setViewsLoading] = useState(false);

  // ビュー一覧を取得
  useEffect(() => {
    const fetchViews = async () => {
      if (!isPowerAppsEnvironment()) return;

      try {
        setViewsLoading(true);
        const viewsResult = await SystemUsersService.getViews();
        
        if (viewsResult.success && viewsResult.data && viewsResult.data.length > 0) {
          setViews(viewsResult.data);
        } else {
          setViews(SystemUsersService.PREDEFINED_VIEWS);
        }
      } catch (err) {
        console.error('❌ Error fetching views:', err);
        setViews(SystemUsersService.PREDEFINED_VIEWS);
      } finally {
        setViewsLoading(false);
      }
    };

    if (isInitialized) {
      fetchViews();
    }
  }, [isInitialized]);

  // 選択したビューでユーザーを取得
  useEffect(() => {
    const fetchUsers = async () => {
      if (!isPowerAppsEnvironment()) {
        setUsers([]);
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      if (!isInitialized) {
        setLoading(true);
        return;
      }

      try {
        setLoading(true);
        
        const usersResult = await SystemUsersService.getUsersByView(currentViewId, {
          select: [
            'systemuserid', 
            'fullname', 
            'internalemailaddress', 
            'title', 
            'azureactivedirectoryobjectid', 
            'isdisabled'
          ],
          top: 100
        });

        if (usersResult.success && usersResult.data && usersResult.data.length > 0) {
          const standardUsers: StandardUser[] = usersResult.data
            .filter(user => user.systemuserid)
            .map((user: SystemUser) => ({
              id: user.systemuserid!,
              displayName: user.fullname || 'ユーザー名なし',
              email: user.internalemailaddress,
              jobTitle: user.title,
              azureADObjectId: user.azureactivedirectoryobjectid || undefined
            }));

          setUsers(standardUsers);
          
          if (standardUsers.length > 0) {
            setCurrentUser(standardUsers[0]);
          }
        } else {
          setUsers([]);
          setCurrentUser(null);
        }

        setLoading(false);
      } catch (err) {
        console.error('❌ Error fetching users:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setUsers([]);
        setCurrentUser(null);
        setLoading(false);
      }
    };

    fetchUsers();
  }, [isInitialized, currentViewId]);

  const changeView = useCallback((viewId: string) => {
    console.log('🔄 Changing view to:', viewId);
    setCurrentViewId(viewId);
  }, []);

  return { 
    currentUser, 
    users, 
    loading, 
    error,
    views,
    viewsLoading,
    currentViewId,
    changeView
  };
};
```

**重要なポイント:**

1. **依存配列の管理**: `[isInitialized, currentViewId]` でビュー変更時に再取得
2. **標準化されたユーザー型**: Dataverse固有の型から汎用的な型に変換
3. **エラーハンドリング**: 各段階でエラーをキャッチしてフォールバック
4. **環境判定**: Power Apps環境でのみデータ取得を実行

### Step 4: UI コンポーネントの実装

#### 4.1 TaskDialog での使用

**ファイル**: `src/components/TaskDialog.tsx`

```typescript
import { useDataverseUsers, StandardUser } from '@/hooks/useDataverseUsers';
import { Combobox } from '@/components/ui/combobox';

export function TaskDialog({ task, onSave, onClose }: TaskDialogProps) {
  const { 
    users, 
    loading: usersLoading, 
    currentUser,
    views,
    viewsLoading,
    currentViewId,
    changeView
  } = useDataverseUsers();
  
  const [formData, setFormData] = useState({
    assignee: '',
    assigneeId: '',
    // ... other fields
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        {/* ビュー切り替えセレクター */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="assignee">担当者</Label>
            {views.length > 0 && (
              <select
                value={currentViewId}
                onChange={(e) => changeView(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                title="ビューを選択"
              >
                {views.map((view) => (
                  <option key={view.savedqueryid} value={view.savedqueryid}>
                    {view.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          
          {/* ユーザー選択コンボボックス */}
          {usersLoading ? (
            <div className="flex items-center space-x-2">
              <User className="h-4 w-4 animate-spin" />
              <span className="text-sm">ユーザー読み込み中...</span>
            </div>
          ) : (
            <Combobox
              value={formData.assigneeId || ""}
              onValueChange={(value) => {
                const selectedUser = users.find((u: StandardUser) => u.id === value);
                setFormData({ 
                  ...formData, 
                  assignee: selectedUser ? selectedUser.displayName : "",
                  assigneeId: value || ""
                });
              }}
              options={[
                { value: "", label: "担当者なし" },
                ...users.map((user: StandardUser) => ({
                  value: user.id,
                  label: user.displayName,
                  description: user.email || user.jobTitle
                }))
              ]}
              placeholder="担当者を検索..."
              searchPlaceholder="名前またはメールアドレスで検索"
              emptyMessage="該当するユーザーが見つかりません"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### Step 5: データ保存の実装

#### 5.1 Lookup参照の保存

**ファイル**: `src/hooks/useDataverseProjects.ts`

```typescript
/**
 * タスクをDataverse形式に変換
 * Lookupフィールドは @odata.bind 構文を使用
 */
const convertTaskToDataverse = (
  task: Partial<Task>,
  projectId: string
): any => {
  const dataverseTask: any = {
    geek_name: task.name,
    geek_description: task.description,
    geek_start: task.start,
    geek_end: task.end,
    // プロジェクトへのLookup参照
    'geek_projectid@odata.bind': `/geek_projecrts(${projectId})`
  };

  // 担当者が指定されている場合、Lookupフィールドに設定
  if (task.assigneeId && task.assigneeId.length > 0) {
    // GUIDのバリデーション
    const guidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    
    if (guidRegex.test(task.assigneeId)) {
      // SystemUserへのLookup参照
      dataverseTask['geek_lookup_assignee@odata.bind'] = `/systemusers(${task.assigneeId})`;
      
      console.log('👤 Assignee lookup set:', {
        assigneeId: task.assigneeId,
        assigneeName: task.assignee,
        odataBind: `/systemusers(${task.assigneeId})`
      });
    } else {
      console.warn('⚠️ Invalid GUID format for assigneeId:', task.assigneeId);
    }
  }
  
  return dataverseTask;
};

/**
 * タスクを作成
 */
const createTask = async (
  projectId: string, 
  task: Omit<Task, 'id'>
): Promise<Task | null> => {
  try {
    const dvTask = convertTaskToDataverse(task, projectId);
    
    const result = await Geek_project_tasksService.create(
      dvTask as Omit<Geek_project_tasks, 'geek_project_taskid'>
    );

    if (!result.success || !result.data) {
      throw new Error('Failed to create task');
    }

    const newTask = convertDataverseToTask(result.data);
    return newTask;
  } catch (err) {
    console.error('❌ Error creating task:', err);
    return null;
  }
};
```

**重要なポイント:**

1. **@odata.bind 構文**: `/entitysetname(GUID)` の形式で指定
2. **GUIDバリデーション**: 正しいGUID形式かチェック
3. **ログ出力**: デバッグ用に詳細なログを出力
4. **エラーハンドリング**: 不正なGUIDの場合は警告を出力

#### 5.2 Lookup参照の読み取り

**ファイル**: `src/hooks/useDataverseProjects.ts`

```typescript
/**
 * Dataverseタスクを標準タスク型に変換
 * 展開されたLookupフィールドから担当者情報を取得
 */
const convertDataverseToTask = (dvTask: Geek_project_tasks): Task => {
  let assigneeId: string | undefined = undefined;
  let assigneeName: string = '';
  
  // @ts-ignore - 展開されたナビゲーションプロパティ
  const expandedAssignee = dvTask.geek_lookup_assignee;
  
  if (expandedAssignee && typeof expandedAssignee === 'object') {
    // $expand で展開された場合
    // @ts-ignore
    assigneeId = expandedAssignee.systemuserid;
    // @ts-ignore
    assigneeName = expandedAssignee.fullname || '';
  } else if ((dvTask as any)._geek_lookup_assignee_value) {
    // _value プロパティから取得（フォールバック）
    assigneeId = (dvTask as any)._geek_lookup_assignee_value;
    // @ts-ignore
    assigneeName = dvTask['_geek_lookup_assignee_value@OData.Community.Display.V1.FormattedValue'] || '';
  }
  
  return {
    id: dvTask.geek_project_taskid,
    name: dvTask.geek_name || '',
    assignee: assigneeName,
    assigneeId: assigneeId,
    // ... other fields
  };
};

/**
 * タスク一覧を取得（Lookupフィールドを展開）
 */
const fetchTasks = async (projectId: string) => {
  const tasksResult = await Geek_project_tasksService.getAll({
    filter: `_geek_projectid_value eq '${projectId}'`,
    // $expand を使用して Lookup フィールド（担当者）を展開
    // @ts-ignore - expand は Power Apps SDK でサポートされているが、型定義にない
    expand: ['geek_lookup_assignee($select=systemuserid,fullname)']
  });
  
  if (tasksResult.success && tasksResult.data) {
    const tasks = tasksResult.data.map(convertDataverseToTask);
    return tasks;
  }
  
  return [];
};
```

**重要なポイント:**

1. **$expand の使用**: Lookupフィールドを展開して関連データを取得
2. **複数の取得方法**: 展開されたオブジェクトと_valueプロパティの両方に対応
3. **型アサーション**: 型定義にないプロパティへのアクセスには`@ts-ignore`を使用
4. **FormattedValue**: 表示名は`@OData.Community.Display.V1.FormattedValue`から取得可能

---

## テストチェックリスト

### 1. 開発環境でのテスト

#### 1.1 ローカル開発サーバー
```bash
npm run dev
```

- [ ] アプリが起動する
- [ ] コンソールに「Development mode」のログが出る
- [ ] ユーザー一覧が空配列で表示される

#### 1.2 型チェック
```bash
npm run build
```

- [ ] TypeScriptエラーがない
- [ ] ビルドが成功する

### 2. Power Apps環境でのテスト

#### 2.1 デプロイ
```bash
pac code push
```

- [ ] デプロイが成功する
- [ ] 「アプリが正常にプッシュされました」と表示される

#### 2.2 初期表示

**テスト手順:**
1. アプリを開く (Ctrl+F5でキャッシュクリア)
2. F12でブラウザコンソールを開く
3. タスクフォームを開く

**チェック項目:**
- [ ] コンソールに以下のログが出る:
  ```
  🔍 useDataverseUsers: Fetching SystemUser views...
  ✅ Views result: { success: true, count: 3, views: [...] }
  👥 Fetching users from SystemUsers using view: 00000000-0000-0000-00aa-000010001019
  ✅ SystemUsers result: { dataLength: XX }
  ```
- [ ] ビュー選択ドロップダウンが表示される
- [ ] デフォルトで「アクティブなユーザー」が選択されている
- [ ] コンボボックスにユーザーが表示される

#### 2.3 ビュー切り替え

**テスト手順:**
1. ビュー選択ドロップダウンをクリック
2. 「無効なユーザー」を選択

**チェック項目:**
- [ ] コンソールに以下のログが出る:
  ```
  🔄 Changing view to: 00000000-0000-0000-00aa-000010001029
  🔧 getUsersByView: { viewId: "...", filter: "isdisabled eq true" }
  ✅ Result: { dataLength: YY }
  ```
- [ ] ユーザー数が変化する（`dataLength`の値が異なる）
- [ ] コンボボックスのユーザーリストが更新される
- [ ] ローディング状態が表示される

#### 2.4 ユーザー検索

**テスト手順:**
1. コンボボックスをクリック
2. 検索ボックスに「Geek」と入力

**チェック項目:**
- [ ] リアルタイムでユーザーがフィルタリングされる
- [ ] 部分一致で検索される
- [ ] メールアドレスでも検索できる
- [ ] 該当するユーザーがない場合、「該当するユーザーが見つかりません」と表示される

#### 2.5 ユーザー選択

**テスト手順:**
1. コンボボックスからユーザーを選択
2. フォームを確認

**チェック項目:**
- [ ] 選択したユーザーがコンボボックスに表示される
- [ ] `formData.assigneeId`にGUIDが設定される
- [ ] `formData.assignee`にユーザー名が設定される
- [ ] コンソールに選択ログが出る:
  ```
  📝 Combobox onValueChange: { value: "GUID" }
  👤 Selected user: { id: "GUID", displayName: "Name" }
  ```

#### 2.6 タスク保存

**テスト手順:**
1. タスク名を入力
2. 担当者を選択
3. 「保存」ボタンをクリック

**チェック項目:**
- [ ] コンソールに以下のログが出る:
  ```
  💾 handleTaskSave called: { isPowerApps: true, ... }
  🔧 convertTaskToDataverse called: { assigneeId: "GUID", ... }
  👤 Assignee lookup set: { 
    assigneeId: "GUID",
    assigneeName: "Name",
    odataBind: "/systemusers(GUID)"
  }
  📦 Create result: { success: true }
  ```
- [ ] タスクが作成される
- [ ] ダイアログが閉じる
- [ ] タスク一覧に新しいタスクが表示される

#### 2.7 Dataverse確認

**テスト手順:**
1. Power Apps Maker Portal を開く
2. テーブル → Project Tasks (`geek_project_tasks`) を開く
3. 作成したタスクを開く

**チェック項目:**
- [ ] タスクレコードが存在する
- [ ] `geek_lookup_assignee`フィールドにSystemUserへの参照が設定されている
- [ ] 担当者の名前が表示される（Lookupフィールドとして）
- [ ] レコードを開いたときに担当者が正しく表示される

#### 2.8 タスク再読み込み

**テスト手順:**
1. ブラウザをリロード (F5)
2. プロジェクトを選択
3. 作成したタスクをクリック

**チェック項目:**
- [ ] コンソールに以下のログが出る:
  ```
  👤 Expanded assignee: { assigneeId: "GUID", assigneeName: "Name" }
  ```
- [ ] タスクフォームに担当者が表示される
- [ ] コンボボックスに正しいユーザーが選択された状態で表示される
- [ ] グリッド（タスク一覧）に担当者名が表示される

#### 2.9 タスク更新

**テスト手順:**
1. タスクを開く
2. 担当者を変更
3. 「保存」ボタンをクリック

**チェック項目:**
- [ ] コンソールに更新ログが出る:
  ```
  👤 Assignee update: {
    hasAssigneeBind: true,
    assigneeBind: "/systemusers(NEW_GUID)",
    updatesAssigneeId: "NEW_GUID"
  }
  📦 Update result: { success: true }
  ```
- [ ] タスクが更新される
- [ ] 担当者が変更される
- [ ] Dataverseで確認すると`geek_lookup_assignee`が更新されている

#### 2.10 担当者クリア

**テスト手順:**
1. タスクを開く
2. コンボボックスで「担当者なし」を選択
3. 「保存」ボタンをクリック

**チェック項目:**
- [ ] `formData.assigneeId`が空文字列になる
- [ ] タスクが更新される
- [ ] Dataverseで確認すると`geek_lookup_assignee`がnullになる

### 3. パフォーマンステスト

#### 3.1 大量データ

**テスト手順:**
1. 100人以上のユーザーがいる環境でテスト
2. ビューを切り替える

**チェック項目:**
- [ ] 1秒以内にユーザーが表示される
- [ ] スクロールがスムーズ
- [ ] 検索が1秒以内に反応する

#### 3.2 ネットワーク遅延

**テスト手順:**
1. ブラウザのデベロッパーツールでネットワークスロットリングを有効化
2. ビューを切り替える

**チェック項目:**
- [ ] ローディング状態が表示される
- [ ] データが取得されるまでUIがフリーズしない
- [ ] エラーハンドリングが機能する

### 4. エラーケーステスト

#### 4.1 権限エラー

**テスト手順:**
1. SystemUsersテーブルへの読み取り権限がないユーザーでログイン
2. タスクフォームを開く

**チェック項目:**
- [ ] エラーメッセージが表示される
- [ ] コンソールにエラーログが出る
- [ ] アプリがクラッシュしない

#### 4.2 不正なGUID

**テスト手順:**
1. 手動で`formData.assigneeId`に不正な値を設定
2. タスクを保存

**チェック項目:**
- [ ] コンソールに警告が出る:
  ```
  ⚠️ Invalid GUID format for assigneeId: "invalid"
  ```
- [ ] Lookupフィールドが設定されない
- [ ] エラーが発生しない

---

## トラブルシューティング

### 問題1: ビューが表示されない

**症状:**
- ビュー選択ドロップダウンが表示されない
- `viewsCount: 0`とログに出る

**原因と解決策:**

**原因1: `views.length === 0`**
```javascript
// 確認
console.log('views:', views);
```

**解決策:**
- `PREDEFINED_VIEWS`へのフォールバックが機能しているか確認
- `useDataverseUsers`の`useEffect`が実行されているか確認

**原因2: UIの条件分岐**
```tsx
// 確認
{views.length > 0 && (
  <select>...</select>
)}
```

**解決策:**
- 条件式を修正: `{views.length > 0 ? (...) : null}`

### 問題2: ビューを切り替えてもユーザー数が変わらない

**症状:**
- ビューを切り替えても同じユーザーが表示される
- `dataLength`が変わらない

**原因と解決策:**

**原因: `savedQuery`パラメータが機能しない**

⚠️ **重要**: Power Apps SDKの`retrieveMultipleRecordsAsync`では、`savedQuery`パラメータを渡してもビューのフィルター条件は適用されません。これはSDKの制限事項です。

```typescript
// ❌ 機能しない方法
const queryOptions: any = {
  savedQuery: viewId  // このパラメータは無視される
};
```

**解決策: ODataフィルター式を使用**

ビューのフィルター条件を手動でODataフィルター式に変換して使用します。

```typescript
// ✅ 正しい方法
// 1. ビューごとのフィルター条件を事前定義
private static readonly VIEW_FILTERS: Record<string, string> = {
  '00000000-0000-0000-00aa-000010001019': 'isdisabled eq false and accessmode ne 4',
  '00000000-0000-0000-00aa-000010001039': 'isdisabled eq false',
  '00000000-0000-0000-00aa-000010001029': 'isdisabled eq true',
};

// 2. フィルター条件を適用
const viewFilter = VIEW_FILTERS[viewId];
const queryOptions: IGetAllOptions = {
  filter: viewFilter,  // ODataフィルター式を使用
  // ...
};
```

**フィルター条件の調べ方:**

1. **Power Apps Maker Portalでビューを確認**:
   - テーブル → SystemUsers → ビュー → 対象のビュー
   - 「フィルターの編集」をクリック
   - フィルター条件を確認

2. **OData形式に変換**:
   - `Is Disabled` = `false` → `isdisabled eq false`
   - `Access Mode` ≠ `Non-Interactive` (4) → `accessmode ne 4`
   - AND条件 → `and`
   - OR条件 → `or`

**確認方法:**
```javascript
// コンソールで確認
console.log('🔧 getUsersByView:', { viewId, filter: queryOptions.filter });
console.log('✅ Result:', { viewId, dataLength: result.data?.length });
```

各ビューでユーザー数が異なることを確認してください。

### 問題3: 担当者が保存されない

**症状:**
- タスクを保存しても担当者が設定されない
- Dataverseで`geek_lookup_assignee`がnull

**原因と解決策:**

**原因1: GUIDバリデーション失敗**
```javascript
// 確認
console.log('👤 Assignee lookup set:', { assigneeId, odataBind });
```

**解決策:**
- `assigneeId`が正しいGUID形式か確認
- GUIDバリデーションの正規表現を確認

**原因2: @odata.bind構文の誤り**
```typescript
// 誤り
dataverseTask['geek_lookup_assignee'] = assigneeId;

// 正しい
dataverseTask['geek_lookup_assignee@odata.bind'] = `/systemusers(${assigneeId})`;
```

**原因3: フィールド名の誤り**
```typescript
// Dataverseのフィールド名を確認
// Power Apps Maker Portal → テーブル → Project Tasks → 列 → Assignee
// 論理名: geek_lookup_assignee
```

### 問題4: 担当者が読み込まれない

**症状:**
- タスクを開いても担当者が空欄
- グリッドに担当者名が表示されない

**原因と解決策:**

**原因1: `$expand`が機能していない**
```javascript
// 確認
console.log('👤 Expanded assignee:', { assigneeId, assigneeName });
```

**解決策:**
```typescript
// @ts-ignore を追加
const tasksResult = await Geek_project_tasksService.getAll({
  filter: `_geek_projectid_value eq '${projectId}'`,
  // @ts-ignore
  expand: ['geek_lookup_assignee($select=systemuserid,fullname)']
});
```

**原因2: `convertDataverseToTask`の誤り**
```typescript
// 確認: 展開されたオブジェクトの構造
console.log('Raw dvTask:', dvTask);
console.log('geek_lookup_assignee:', dvTask.geek_lookup_assignee);
```

**解決策:**
```typescript
// 展開されたオブジェクトとフォールバックの両方に対応
if (expandedAssignee && typeof expandedAssignee === 'object') {
  assigneeId = expandedAssignee.systemuserid;
  assigneeName = expandedAssignee.fullname;
} else if ((dvTask as any)._geek_lookup_assignee_value) {
  assigneeId = (dvTask as any)._geek_lookup_assignee_value;
  assigneeName = dvTask['_geek_lookup_assignee_value@OData.Community.Display.V1.FormattedValue'];
}
```

### 問題5: 検索が機能しない

**症状:**
- コンボボックスで検索しても結果が変わらない
- 入力しても反応がない

**原因と解決策:**

**原因: `searchQuery`の状態管理**
```typescript
// Combobox内で確認
const [searchQuery, setSearchQuery] = React.useState("")

const filteredOptions = React.useMemo(() => {
  if (!searchQuery) return options
  const query = searchQuery.toLowerCase()
  return options.filter((option) => {
    const searchText = `${option.label} ${option.description || ""}`.toLowerCase()
    return searchText.includes(query)
  })
}, [options, searchQuery])
```

**解決策:**
- `CommandInput`の`value`と`onValueChange`が正しく設定されているか確認
- `filteredOptions`が`CommandItem`に渡されているか確認

### 問題6: マウスホイールでスクロールできない

**症状:**
- コンボボックス内でマウスホイールが効かない

**原因と解決策:**

**解決策: ホイールイベントの処理**
```typescript
// Combobox.tsx
const listRef = React.useRef<HTMLDivElement>(null)

React.useEffect(() => {
  const listElement = listRef.current
  if (!listElement) return
  
  const handleWheel = (e: WheelEvent) => {
    e.stopPropagation()
  }
  
  listElement.addEventListener('wheel', handleWheel, { passive: true })
  
  return () => {
    listElement.removeEventListener('wheel', handleWheel)
  }
}, [open])

// PopoverContent と CommandList にも追加
<PopoverContent onWheel={(e) => { e.stopPropagation() }}>
  <CommandList 
    ref={listRef}
    className="max-h-[300px] overflow-y-auto"
    style={{ touchAction: 'pan-y' }}
  >
```

---

## ベストプラクティス

### 1. データアクセス

#### 1.0 ビューフィルターの実装

**⚠️ 重要な制限事項:**

Power Apps SDKの`retrieveMultipleRecordsAsync`では、`savedQuery`パラメータは機能しません。ビューのフィルター条件を使用したい場合は、以下の手順で実装してください。

**推奨アプローチ:**

```typescript
// Step 1: ビューのフィルター条件をOData形式で定義
private static readonly VIEW_FILTERS: Record<string, string> = {
  // Power Apps Maker Portal でビューを開き、フィルター条件を確認して変換
  '00000000-0000-0000-00aa-000010001019': 'isdisabled eq false and accessmode ne 4',  // アクティブなユーザー
  '00000000-0000-0000-00aa-000010001039': 'isdisabled eq false',                        // 有効なユーザー
  '00000000-0000-0000-00aa-000010001029': 'isdisabled eq true',                         // 無効なユーザー
};

// Step 2: ビューIDからフィルター条件を取得
const viewFilter = VIEW_FILTERS[viewId];

// Step 3: フィルター条件を適用
const queryOptions: IGetAllOptions = {
  filter: viewFilter,  // ODataフィルター式を使用
  select: ['systemuserid', 'fullname', 'isdisabled'],
  orderBy: ['fullname asc']
};

const result = await client.retrieveMultipleRecordsAsync(dataSourceName, queryOptions);
```

**非推奨（機能しない）:**

```typescript
// ❌ savedQuery パラメータは無視される
const queryOptions: any = {
  savedQuery: viewId,  // この値は適用されない
};

const result = await client.retrieveMultipleRecordsAsync(dataSourceName, queryOptions);
// 結果: すべてのレコードが返される（フィルタリングなし）
```

**フィルター条件の調べ方:**

1. Power Apps Maker Portal にアクセス
2. テーブル → 対象のテーブル（例: SystemUsers）→ ビュー
3. 使用したいビューをクリック
4. 「フィルターの編集」をクリック
5. フィルター条件を確認し、OData形式に変換

**OData変換例:**

| Power Apps UI | OData式 |
|--------------|---------|
| Is Disabled が false に等しい | `isdisabled eq false` |
| Access Mode が 4 に等しくない | `accessmode ne 4` |
| Full Name に "Test" が含まれる | `contains(fullname, 'Test')` |
| Created On が 2024-01-01 より大きい | `createdon gt 2024-01-01T00:00:00Z` |
| AND条件 | `condition1 and condition2` |
| OR条件 | `condition1 or condition2` |

#### 1.1 フィルター条件の定義

**推奨:**
```typescript
// 定数として定義し、再利用可能にする
private static readonly VIEW_FILTERS: Record<string, string> = {
  'view-id-1': 'field1 eq value1 and field2 ne value2',
  'view-id-2': 'field1 eq value3',
};
```

**非推奨:**
```typescript
// ハードコードやマジックナンバー
const filter = 'isdisabled eq false';
```

#### 1.2 エラーハンドリング

**推奨:**
```typescript
try {
  const result = await Service.getData();
  if (!result.success) {
    throw new Error(result.error || 'Unknown error');
  }
  return result.data;
} catch (err) {
  console.error('❌ Error:', err);
  // フォールバックデータを返す
  return [];
}
```

**非推奨:**
```typescript
// エラーを無視
const result = await Service.getData();
return result.data || [];
```

#### 1.3 ログ出力

**推奨:**
```typescript
console.log('🔧 Method called:', { param1, param2 });
console.log('✅ Success:', { resultCount: result.length });
console.error('❌ Error:', error);
console.warn('⚠️ Warning:', warning);
```

**非推奨:**
```typescript
// ログなし、または不十分なログ
console.log('success');
```

### 2. 状態管理

#### 2.1 依存配列の管理

**推奨:**
```typescript
useEffect(() => {
  fetchData();
}, [dependency1, dependency2]); // 必要な依存関係のみ
```

**非推奨:**
```typescript
useEffect(() => {
  fetchData();
}, []); // 依存関係を忘れている
```

#### 2.2 ローディング状態

**推奨:**
```typescript
const [loading, setLoading] = useState(true);

useEffect(() => {
  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getData();
      setData(data);
    } finally {
      setLoading(false); // 必ず実行
    }
  };
  fetchData();
}, []);

return loading ? <Spinner /> : <Content data={data} />;
```

**非推奨:**
```typescript
// ローディング状態なし
const data = await getData();
return <Content data={data} />;
```

### 3. 型安全性

#### 3.1 型定義

**推奨:**
```typescript
export interface StandardUser {
  id: string;
  displayName: string;
  email?: string;
  jobTitle?: string;
}

// 型を明示的に指定
const users: StandardUser[] = [];
```

**非推奨:**
```typescript
// any型の使用
const users: any[] = [];
```

#### 3.2 型アサーション

**推奨:**
```typescript
// 必要な場合のみ @ts-ignore を使用し、コメントで理由を説明
// @ts-ignore - Power Apps SDK の型定義に expand が含まれていない
expand: ['geek_lookup_assignee($select=systemuserid,fullname)']
```

**非推奨:**
```typescript
// 無闇に @ts-ignore を使用
// @ts-ignore
const data = something;
```

### 4. パフォーマンス

#### 4.1 useMemoの使用

**推奨:**
```typescript
const filteredOptions = React.useMemo(() => {
  if (!searchQuery) return options;
  return options.filter((option) => 
    option.label.toLowerCase().includes(searchQuery.toLowerCase())
  );
}, [options, searchQuery]);
```

**非推奨:**
```typescript
// 毎回フィルタリング
const filteredOptions = options.filter((option) => 
  option.label.toLowerCase().includes(searchQuery.toLowerCase())
);
```

#### 4.2 useCallbackの使用

**推奨:**
```typescript
const changeView = useCallback((viewId: string) => {
  setCurrentViewId(viewId);
}, []); // 依存関係なし
```

**非推奨:**
```typescript
// 毎回新しい関数を作成
const changeView = (viewId: string) => {
  setCurrentViewId(viewId);
};
```

#### 4.3 データ取得の最適化

**推奨:**
```typescript
// 必要なフィールドのみ取得
const queryOptions: IGetAllOptions = {
  select: ['systemuserid', 'fullname', 'internalemailaddress'],
  top: 100,  // 件数制限
  orderBy: ['fullname asc']
};
```

**非推奨:**
```typescript
// すべてのフィールドを取得
const queryOptions: IGetAllOptions = {};
```

### 5. セキュリティ

#### 5.1 GUIDバリデーション

**推奨:**
```typescript
const guidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

if (!guidRegex.test(id)) {
  console.warn('⚠️ Invalid GUID:', id);
  return;
}
```

**非推奨:**
```typescript
// バリデーションなし
dataverseTask['geek_lookup_assignee@odata.bind'] = `/systemusers(${id})`;
```

#### 5.2 入力サニタイゼーション

**推奨:**
```typescript
// ODataクエリでは ' を '' にエスケープ
const sanitizedValue = value.replace(/'/g, "''");
const filter = `name eq '${sanitizedValue}'`;
```

**非推奨:**
```typescript
// エスケープなし
const filter = `name eq '${value}'`;
```

### 6. コード構成

#### 6.1 関心の分離

**推奨:**
```
src/
├── components/          # UIコンポーネント
│   └── TaskDialog.tsx
├── hooks/               # カスタムフック
│   └── useDataverseUsers.ts
├── generated/
│   └── services/        # データアクセス層
│       └── SystemUsersService.ts
└── utils/               # ユーティリティ関数
    └── dataverseHelpers.ts
```

**非推奨:**
```
// すべてを1ファイルに記述
src/TaskDialog.tsx (2000行)
```

#### 6.2 命名規則

**推奨:**
```typescript
// PascalCase: コンポーネント、型、クラス
export function TaskDialog() {}
export interface StandardUser {}
export class SystemUsersService {}

// camelCase: 変数、関数
const currentUser = ...;
function fetchUsers() {}

// SCREAMING_SNAKE_CASE: 定数
const ACTIVE_USERS_VIEW_ID = '...';
```

#### 6.3 コメント

**推奨:**
```typescript
/**
 * ビュー一覧を取得
 * 
 * 注意: savedqueries テーブルへのアクセス権限がない場合があるため、
 * 事前定義されたビューリストを返す
 * 
 * @returns ビュー一覧
 */
public static async getViews(): Promise<IOperationResult<SystemUserView[]>> {
  return {
    success: true,
    data: SystemUsersService.PREDEFINED_VIEWS
  };
}
```

**非推奨:**
```typescript
// コメントなし、または不十分
public static async getViews() {
  return { success: true, data: PREDEFINED_VIEWS };
}
```

---

## まとめ

このガイドでは、Dataverse Lookupフィールドに対するビュー切り替え機能付きコンボボックスの実装方法を包括的に説明しました。

### 主要なポイント

1. **⚠️ savedQueryパラメータの制限**: Power Apps SDKでは`savedQuery`パラメータは機能しない。ビューのフィルター条件は手動でODataフィルター式に変換して使用する必要がある
2. **フィルター条件の事前定義**: ビューごとのODataフィルター式を`VIEW_FILTERS`として定義
3. **$expandによるLookup展開**: 関連データを効率的に取得
4. **@odata.bind構文**: Lookup参照の正しい保存方法
5. **エラーハンドリング**: 各段階での適切なエラー処理
6. **パフォーマンス最適化**: useMemo、useCallbackの活用
7. **型安全性**: TypeScriptの型システムを最大限に活用

### 次のステップ

- [ ] 他のLookupフィールドにも同じパターンを適用
- [ ] Multiple Lookup（N:N関係）のサポート
- [ ] サーバーサイド検索の実装
- [ ] 仮想スクロールによる大量データ対応
- [ ] キャッシュ機能の実装

---

**参考資料:**
- [Power Apps Component Framework](https://learn.microsoft.com/ja-jp/power-apps/developer/component-framework/)
- [Dataverse Web API](https://learn.microsoft.com/ja-jp/power-apps/developer/data-platform/webapi/overview)
- [OData Query Options](https://learn.microsoft.com/ja-jp/power-apps/developer/data-platform/webapi/query-data-web-api)

**更新履歴:**
- 2025-10-21: 初版作成（v1.9.7）
