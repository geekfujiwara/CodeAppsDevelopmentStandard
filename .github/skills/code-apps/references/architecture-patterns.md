# Code Apps デザインパターンカタログ（アーキテクチャ）

Code Apps の**設計フェーズで適用するアーキテクチャデザインパターン**のカタログ。
実装を始めてからリファクタリングするのではなく、**設計時にパターンを選定し、ユーザーの承認を得た設計に従って初めから正しい構造で実装する**ために使う。

> **前提**: UI 面の設計（テンプレート・コンポーネント選定・画面構成）は [デザインシステム](design-pattern.md)。
> 本書はコード構造（レイヤー分割・状態管理・データフロー）のパターンに特化する。
> `samples/geek-*` が全パターンの参照実装。

## 原則

1. **設計時に選定する**: 画面設計と同時に、下のマトリクスから適用パターンを選び、設計提示に含めて承認を得る。
2. **カタログ優先**: 新しい構造を発明せず、本カタログ＋既存リファレンスの標準パターンを使う。該当パターンがない場合のみ設計提示で代替案を説明する。
3. **依存方向は一方向**: `pages → hooks → services → SDK` の順にのみ依存する。ページ・コンポーネントから SDK（`getClient`）を直接呼ばない。

## レイヤードアーキテクチャ（標準構成）

すべての Code Apps は以下のレイヤー構成を標準とする（`samples/geek-*` 準拠）。

```
src/
├── pages/          # 画面（ルート単位）。hooks を呼び、components を組み立てる
├── components/     # 再利用 UI（Presentational）。ui/ は shadcn プリミティブ
│   └── ui/
├── hooks/          # カスタムフック。React Query でサーバー状態を集約（use-dataverse.ts 等）
├── services/       # サービスレイヤー。SDK 呼び出しを関数として抽象化（dataverse-service.ts 等）
├── providers/      # Provider 合成（power / query / theme / sonner）
├── types/          # ドメイン型定義（Create / Update 入力型を含む）
└── lib/            # dataSourcesInfo re-export・ユーティリティ
```

| レイヤー | 責務 | 禁止事項 |
|---|---|---|
| `pages/` | ルーティング単位の画面。フックの呼び出しとレイアウト | SDK 直呼び・OData クエリ文字列の直書き |
| `components/` | props で完結する表示部品 | データ取得（フック呼び出しは原則 pages 側） |
| `hooks/` | React Query によるサーバー状態管理・キャッシュキー設計 | UI（JSX）を持つこと |
| `services/` | SDK（`getClient(dataSourcesInfo)`）呼び出しの抽象化・エラー throw | React への依存（フック・コンポーネント import） |
| `providers/` | テーマ・QueryClient 等の横断的関心事 | ドメインロジック |

## パターン選定マトリクス（設計時チェックリスト）

設計フェーズでテーブル・画面ごとに以下を確認し、該当パターンを設計提示に列挙する。

| 設計上の関心事 | 適用パターン | 適用基準 | 詳細 |
|---|---|---|---|
| データアクセスの抽象化 | **サービスレイヤー**（Facade） | 必須 | [データソースパターン](data-source-patterns.md) |
| SDK クライアント生成 | **シングルトン** `getClient(dataSourcesInfo)` | 必須 | [データソースパターン](data-source-patterns.md) |
| サーバー状態管理 | **React Query フック**（キャッシュ・invalidate） | 必須 | 本書「カスタムフック」 |
| UI とロジックの分離 | **Container / Presentational 分離** | 必須 | 本書「Container / Presentational」 |
| 横断的関心事の注入 | **Provider 合成** | 必須 | [コンポーネントカタログ](component-catalog.md)「Provider 階層」 |
| Lookup 表示名の解決 | **useMemo Map 名前解決** | Lookup 列を表示する全画面 | [Lookup 名前解決](lookup-resolution.md) |
| 体感速度が重要な更新（D&D・トグル） | **楽観的更新＋ロールバック** | カンバン・ステージ変更・チェック操作 | 本書「楽観的更新」 |
| 破壊的操作の確認 | **Promise ベース `useConfirm()`** | 削除・取り消し不能操作 | [CRUD UI 標準パターン](crud-ui-pattern.md) |
| 順序付きステータスの可視化 | **StagePath / KanbanBoard** | 順序を持つ OptionSet | [ステージ矢羽パターン](stage-path-pattern.md) |
| レコード編集権の制御 | **オーナーガード** | 担当者ベースの読み取り専用制御 | [オーナーガードパターン](owner-guard-pattern.md) |
| オプション機能の段階的有効化 | **Feature Flag**（`VITE_FEATURE_*`） | フロー連携・Copilot 等の追加機能 | [サンプル作成ガイド](sample-authoring-guide.md) |
| エラーの通知と回復 | **サービス throw → フック → toast** | 必須 | 本書「エラーハンドリング標準」 |

## カスタムフック（サーバー状態の集約）

サーバー状態（Dataverse のデータ）は **React Query のカスタムフックに集約**し、ページ側では
`useState` + `useEffect` でのデータ取得を書かない。テーブルごとに `useXxx` / `useCreateXxx` /
`useUpdateXxx` / `useDeleteXxx` を `hooks/use-dataverse.ts` にまとめる。

```typescript
// hooks/use-dataverse.ts — サービス関数を React Query で包む
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getRecords, createRecord } from "@/services/dataverse-service";
import type { RecordCreate } from "@/types/dataverse";

export function useRecords() {
  return useQuery({ queryKey: ["records"], queryFn: getRecords });
}

export function useCreateRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RecordCreate) => createRecord(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["records"] }),
  });
}
```

**状態管理の指針**（追加の状態管理ライブラリは導入しない）:

| 状態の種類 | 管理方法 |
|---|---|
| サーバー状態（Dataverse レコード） | React Query（`hooks/`） |
| 画面ローカルの UI 状態（フォーム入力・モーダル開閉・フィルター） | `useState` / `useReducer`（ページ内） |
| アプリ横断の UI 状態（テーマ・ログインユーザー） | Context（`providers/`） |

## Container / Presentational 分離

ページ（Container）がデータ取得と状態を持ち、表示部品（Presentational）は props だけで完結させる。
表示部品を Dataverse の型・フックから切り離すことで、モック props での確認・再利用ができる。

```tsx
// pages/records.tsx — Container: フック呼び出し・状態・イベント処理
export default function RecordsPage() {
  const { data: records = [], isLoading } = useRecords();
  const deleteRecord = useDeleteRecord();
  if (isLoading) return <LoadingSkeletonGrid />;
  return <RecordList records={records} onDelete={(id) => deleteRecord.mutate(id)} />;
}

// components/record-list.tsx — Presentational: props のみに依存
export function RecordList({ records, onDelete }: {
  records: RecordView[];
  onDelete: (id: string) => void;
}) {
  return <ListTable rows={records} /* ... */ />;
}
```

## 楽観的更新＋ロールバック

カンバンの D&D・ステージ矢羽クリック等、**結果を待つとカードが元の位置に戻って見える操作**では、
React Query の `onMutate` でキャッシュを先に書き換え、失敗時に `onError` で巻き戻す。

```typescript
export function useMoveRecordStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: number }) =>
      updateRecord(id, { [`{prefix}_status`]: status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["records"] });
      const previous = qc.getQueryData<RecordView[]>(["records"]);
      qc.setQueryData<RecordView[]>(["records"], (old = []) =>
        old.map((r) => (r.id === id ? { ...r, status } : r)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      qc.setQueryData(["records"], context?.previous);  // ロールバック
      toast.error("更新に失敗しました");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["records"] }),
  });
}
```

> 楽観的更新を適用しない通常のフォーム保存は `onSuccess` + `invalidateQueries` の標準パターンでよい。
> カンバン D&D での「戻りアニメーション」対策の詳細は [ReactFlow 可視化パターン](reactflow-patterns.md) を参照。

## エラーハンドリング標準

| レイヤー | 責務 |
|---|---|
| `services/` | `result.success` を検査し、失敗は **throw**（握りつぶさない） |
| `hooks/` | React Query に伝播させる（`try/catch` で吸収しない） |
| ページ / mutation | `onError` で `toast.error()`（sonner）によりユーザーへ通知 |
| 一覧表示 | `isLoading` は `LoadingSkeleton*`、`isError` は再試行ボタン付きの空状態、0 件は破線ボーダーの説明ブロック |

```typescript
// services/dataverse-service.ts — 失敗は throw（サービスレイヤーの標準形）
export async function getRecords(): Promise<RecordView[]> {
  const result = await client.retrieveMultipleRecordsAsync<RecordRow>(
    "{prefix}_records",
    "$select={prefix}_name,{prefix}_status&$orderby=createdon desc",
  );
  if (!result.success) throw result.error;
  return (result.data ?? []).map(toRecordView);
}
```

## 設計提示に含めるパターン一覧（承認用フォーマット）

設計フェーズの承認依頼には、画面設計に加えて以下の形式で適用パターンを明記する。

```markdown
### 適用デザインパターン
| 対象 | パターン | 理由 |
|---|---|---|
| 全体 | レイヤードアーキテクチャ（pages → hooks → services → SDK） | 標準構成 |
| 商談カンバン | 楽観的更新＋ロールバック | D&D の体感速度 |
| 全一覧画面 | useMemo Map 名前解決 | 所有者・顧客 Lookup の表示 |
| 削除操作 | Promise ベース useConfirm() | 破壊的操作の確認 |
| （テーブル/画面ごとに列挙） | … | … |
```

ユーザーの**承認を得てから実装を開始**し、実装中にパターン構成の変更（レイヤー追加・状態管理方式の変更等）が
必要になった場合は、差分を再提示して**再承認**を得る。
