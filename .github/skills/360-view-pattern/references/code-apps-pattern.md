# 360度ビュー — Code Apps 実装パターン

**React 18 + TypeScript + Tailwind CSS v4 + shadcn/ui** で構築する360度ビューの実装パターン。

> **前提**: `code-apps-design` / `code-apps-dev` スキルと連携して使用する。

---

## ファイル構成

```
src/
  pages/
    master-list.tsx          # マスター一覧ページ
    master-detail.tsx        # 360度詳細ページ（タブ切替）
  hooks/
    use-master.ts            # マスター + 関連データ取得 hooks
  types/
    master.ts                # 型定義・Choice ラベル
```

---

## 1. ルーター設定

```typescript
// router.tsx に追加
const MasterListPage = lazy(() => import("@/pages/master-list"));
const MasterDetailPage = lazy(() => import("@/pages/master-detail"));

// routes 配列に追加
{ path: "masters", element: withSuspense(MasterListPage) },
{ path: "masters/:id", element: withSuspense(MasterDetailPage) },
```

---

## 2. マスター一覧ページ（master-list.tsx）

```tsx
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/list-table";
import type { TableColumn, FilterConfig } from "@/components/list-table";
import { Plus } from "lucide-react";
// hooks・型は実際のプロジェクトに合わせて置き換え

export default function MasterListPage() {
  const navigate = useNavigate();
  const { data: masters = [], isLoading } = useMasters(); // プロジェクト固有 hook

  const columns: TableColumn<MasterRow>[] = [
    { key: "name", label: "名前", sortable: true },
    { key: "type", label: "タイプ", sortable: true,
      render: (item) => <Badge variant="outline">{typeLabels[item.type]}</Badge>
    },
    { key: "status", label: "ステータス", sortable: true,
      render: (item) => <Badge className={statusColors[item.status]}>{statusLabels[item.status]}</Badge>
    },
    { key: "modifiedon", label: "更新日", sortable: true,
      render: (item) => new Date(item.modifiedon).toLocaleDateString("ja-JP")
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>マスター一覧</CardTitle>
        <Button><Plus className="mr-1 h-4 w-4" /> 新規登録</Button>
      </CardHeader>
      <CardContent>
        <ListTable
          data={masters}
          columns={columns}
          searchKeys={["name"]}
          onRowClick={(row) => navigate(`/masters/${row.id}`)}
        />
      </CardContent>
    </Card>
  );
}
```

---

## 3. 360度詳細ページ（master-detail.tsx）

### 3.1 全体構造

```tsx
import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/list-table";
import type { TableColumn } from "@/components/list-table";
import { FormModal, FormSection, FormColumns } from "@/components/form-modal";
import { LoadingSkeletonGrid } from "@/components/loading-skeleton";
import {
  ArrowLeft, Pencil, FileText, Clock, BarChart3,
  CheckCircle2, AlertCircle, Wrench, ClipboardList,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
// hooks・型は実際のプロジェクトに合わせて置き換え

export default function MasterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");

  // === データ取得 ===
  const { data: master, isLoading: masterLoading } = useMasterById(id!);
  const { data: transactionsA = [] } = useTransactionsA(id!);
  const { data: transactionsB = [] } = useTransactionsB(id!);
  const { data: lookupEntities = [] } = useLookupEntities();

  // === Lookup 名前解決 ===
  const lookupMap = useMemo(() => {
    const m = new Map<string, string>();
    lookupEntities.forEach((e) => m.set(e.id, e.name));
    return m;
  }, [lookupEntities]);

  // === KPI 集計 ===
  const kpiData = useMemo(() => ({
    totalA: transactionsA.length,
    openA: transactionsA.filter((t) => t.status === "open").length,
    totalB: transactionsB.length,
    // ...他の KPI
  }), [transactionsA, transactionsB]);

  if (masterLoading) {
    return <LoadingSkeletonGrid columns={1} count={3} variant="detailed" />;
  }

  if (!master) {
    return <div className="p-8 text-center text-muted-foreground">レコードが見つかりません</div>;
  }

  return (
    <div className="space-y-6">
      {/* === ヘッダー === */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{master.name}</h1>
            <p className="text-sm text-muted-foreground">{master.type_label}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><Pencil className="mr-1 h-4 w-4" /> 編集</Button>
        </div>
      </div>

      {/* === プロファイルセクション === */}
      <ProfileSection master={master} kpiData={kpiData} />

      {/* === タブナビゲーション + コンテンツ === */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">概要</TabsTrigger>
          <TabsTrigger value="history-a">
            履歴A <Badge variant="secondary" className="ml-1">{kpiData.totalA}</Badge>
          </TabsTrigger>
          <TabsTrigger value="history-b">
            履歴B <Badge variant="secondary" className="ml-1">{kpiData.totalB}</Badge>
          </TabsTrigger>
          <TabsTrigger value="charts">分析</TabsTrigger>
          <TabsTrigger value="timeline">タイムライン</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab master={master} transactionsA={transactionsA} />
        </TabsContent>
        <TabsContent value="history-a">
          <TransactionTableTab
            data={transactionsA}
            lookupMap={lookupMap}
            entityLabel="履歴A"
          />
        </TabsContent>
        <TabsContent value="history-b">
          <TransactionTableTab
            data={transactionsB}
            lookupMap={lookupMap}
            entityLabel="履歴B"
          />
        </TabsContent>
        <TabsContent value="charts">
          <ChartsTab transactionsA={transactionsA} transactionsB={transactionsB} />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelineTab transactionsA={transactionsA} transactionsB={transactionsB} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### 3.2 プロファイルセクション

```tsx
function ProfileSection({ master, kpiData }: { master: MasterEntity; kpiData: KpiData }) {
  const kpiCards = [
    { title: "ステータス", value: master.status_label, icon: CheckCircle2, className: "text-green-600" },
    { title: "累計履歴A", value: String(kpiData.totalA), icon: ClipboardList, className: "text-blue-600" },
    { title: "未対応", value: String(kpiData.openA), icon: AlertCircle, className: "text-orange-600" },
    { title: "累計履歴B", value: String(kpiData.totalB), icon: Wrench, className: "text-purple-600" },
  ];

  return (
    <div className="space-y-4">
      {/* KPI カード行 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
              <kpi.icon className={`h-4 w-4 ${kpi.className}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 基本属性カード */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">タイプ</span>
              <p className="font-medium">{master.type_label}</p>
            </div>
            <div>
              <span className="text-muted-foreground">場所</span>
              <p className="font-medium">{master.location || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">担当者</span>
              <p className="font-medium">{master.assignee_name || "未割当"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">登録日</span>
              <p className="font-medium">{new Date(master.createdon).toLocaleDateString("ja-JP")}</p>
            </div>
            <div>
              <span className="text-muted-foreground">最終更新</span>
              <p className="font-medium">{new Date(master.modifiedon).toLocaleDateString("ja-JP")}</p>
            </div>
            {master.remarks && (
              <div className="col-span-2 md:col-span-3">
                <span className="text-muted-foreground">備考</span>
                <p className="font-medium">{master.remarks}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 3.3 概要タブ

```tsx
function OverviewTab({ master, transactionsA }: { master: MasterEntity; transactionsA: Transaction[] }) {
  const recentItems = transactionsA.slice(0, 5);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 左: 詳細属性 */}
      <Card>
        <CardHeader><CardTitle className="text-base">詳細情報</CardTitle></CardHeader>
        <CardContent>
          <dl className="space-y-3 text-sm">
            {/* プロジェクト固有の属性をここに列挙 */}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">型番</dt>
              <dd className="font-medium">{master.model || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">シリアル番号</dt>
              <dd className="font-medium">{master.serial || "—"}</dd>
            </div>
            {/* ...追加属性 */}
          </dl>
        </CardContent>
      </Card>

      {/* 右: 直近アクティビティ */}
      <Card>
        <CardHeader><CardTitle className="text-base">直近のアクティビティ</CardTitle></CardHeader>
        <CardContent>
          {recentItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">データがありません</p>
          ) : (
            <div className="space-y-3">
              {recentItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 text-sm">
                  <div className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-muted-foreground">
                      {new Date(item.date).toLocaleDateString("ja-JP")} — {item.status_label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

### 3.4 トランザクション一覧タブ（汎用）

```tsx
function TransactionTableTab<T extends Record<string, unknown>>({
  data,
  lookupMap,
  entityLabel,
}: {
  data: T[];
  lookupMap: Map<string, string>;
  entityLabel: string;
}) {
  const [isFormOpen, setIsFormOpen] = useState(false);

  // カラム定義はプロジェクト固有に置き換え
  const columns: TableColumn<T>[] = [
    { key: "date", label: "日付", sortable: true,
      render: (item) => new Date(item.date as string).toLocaleDateString("ja-JP") },
    { key: "title", label: "タイトル", sortable: true },
    { key: "category", label: "カテゴリ", sortable: true,
      render: (item) => lookupMap.get(item._categoryid_value as string) || "—" },
    { key: "status", label: "ステータス", sortable: true,
      render: (item) => <Badge variant="outline">{statusLabels[item.status as number]}</Badge> },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{entityLabel} ({data.length}件)</CardTitle>
        <Button size="sm" onClick={() => setIsFormOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> 新規作成
        </Button>
      </CardHeader>
      <CardContent>
        <ListTable data={data} columns={columns} searchKeys={["title"]} />
      </CardContent>

      {/* 新規作成モーダル — プロジェクト固有のフォームに置き換え */}
      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={`${entityLabel}を作成`}
        onSave={() => { /* 保存処理 */ }}
      >
        <FormSection title="基本情報">
          {/* フォームフィールド */}
        </FormSection>
      </FormModal>
    </Card>
  );
}
```

### 3.5 チャートタブ

```tsx
function ChartsTab({
  transactionsA,
  transactionsB,
}: {
  transactionsA: Transaction[];
  transactionsB: Transaction[];
}) {
  // 月別集計
  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; countA: number; countB: number }>();
    const fmt = (d: string) => {
      const dt = new Date(d);
      return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
    };
    transactionsA.forEach((t) => {
      const m = fmt(t.date);
      const entry = map.get(m) || { month: m, countA: 0, countB: 0 };
      entry.countA++;
      map.set(m, entry);
    });
    transactionsB.forEach((t) => {
      const m = fmt(t.date);
      const entry = map.get(m) || { month: m, countA: 0, countB: 0 };
      entry.countB++;
      map.set(m, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [transactionsA, transactionsB]);

  // ステータス別分布
  const statusData = useMemo(() => {
    const map = new Map<string, number>();
    transactionsA.forEach((t) => {
      const label = statusLabels[t.status] || "不明";
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [transactionsA]);

  const COLORS = ["#3b82f6", "#22c55e", "#eab308", "#ef4444", "#8b5cf6"];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base">月別推移</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="countA" name="履歴A" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="countB" name="履歴B" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">ステータス分布</CardTitle></CardHeader>
        <CardContent>
          {statusData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">データがありません</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                  paddingAngle={3} dataKey="value"
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                >
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => [`${value} 件`, "件数"]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

### 3.6 タイムラインタブ

```tsx
function TimelineTab({
  transactionsA,
  transactionsB,
}: {
  transactionsA: Transaction[];
  transactionsB: Transaction[];
}) {
  // 全トランザクションを日付降順でマージ
  const timelineItems = useMemo(() => {
    const all = [
      ...transactionsA.map((t) => ({ ...t, source: "A" as const })),
      ...transactionsB.map((t) => ({ ...t, source: "B" as const })),
    ];
    return all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactionsA, transactionsB]);

  const sourceColors = { A: "bg-blue-500", B: "bg-green-500" };
  const sourceLabels = { A: "履歴A", B: "履歴B" };

  if (timelineItems.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground text-center">タイムラインデータがありません</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="relative">
          {/* 縦線 */}
          <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />

          <div className="space-y-6">
            {timelineItems.map((item, i) => (
              <div key={`${item.source}-${item.id}-${i}`} className="flex gap-4 relative">
                {/* ドット */}
                <div className={`mt-1.5 h-[10px] w-[10px] rounded-full shrink-0 z-10 ${sourceColors[item.source]}`} />

                {/* コンテンツ */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">
                      {new Date(item.date).toLocaleDateString("ja-JP")}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {sourceLabels[item.source]}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {item.status_label}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{item.title}</p>
                  {item.description && (
                    <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 4. Hooks パターン（use-master.ts）

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// Dataverse API クライアントは code-apps-dev スキルに従う

export function useMasters() {
  return useQuery({
    queryKey: ["masters"],
    queryFn: () => fetchFromDataverse("prefix_masters", {
      select: ["prefix_masterid", "prefix_name", "prefix_type", "prefix_status", "modifiedon"],
      orderby: "modifiedon desc",
    }),
  });
}

export function useMasterById(id: string) {
  return useQuery({
    queryKey: ["masters", id],
    queryFn: () => fetchFromDataverse(`prefix_masters(${id})`, {
      select: ["*"],
    }),
    enabled: !!id,
  });
}

export function useTransactionsA(masterId: string) {
  return useQuery({
    queryKey: ["transactionsA", masterId],
    queryFn: () => fetchFromDataverse("prefix_transactionas", {
      select: ["prefix_transactionaid", "prefix_name", "prefix_date", "prefix_status", "_prefix_categoryid_value"],
      filter: `_prefix_masterid_value eq ${masterId}`,
      orderby: "prefix_date desc",
    }),
    enabled: !!masterId,
  });
}

export function useTransactionsB(masterId: string) {
  return useQuery({
    queryKey: ["transactionsB", masterId],
    queryFn: () => fetchFromDataverse("prefix_transactionbs", {
      select: ["prefix_transactionbid", "prefix_name", "prefix_date", "prefix_status"],
      filter: `_prefix_masterid_value eq ${masterId}`,
      orderby: "prefix_date desc",
    }),
    enabled: !!masterId,
  });
}
```

---

## 5. カスタマイズガイド

### ドメイン適用時の置き換えチェックリスト

| 項目 | 置き換え内容 |
|------|------------|
| `MasterEntity` | 実際のマスターテーブル型（例: `Geek_equipment`） |
| `Transaction` | 実際のトランザクションテーブル型（例: `Geek_inspections`） |
| `prefix_` | 実際のテーブルプレフィックス |
| `useMasters` / `useTransactionsA` | プロジェクト固有の hook 名 |
| KPI カード | ドメイン固有の KPI（稼働率、累計コスト等） |
| タブ名 | ドメイン固有のタブ名（点検履歴、修理履歴等） |
| カラム定義 | 実際のテーブルカラム |
| ステータスラベル・カラー | Choice 値に合わせた定義 |
| フォームフィールド | 新規作成・編集モーダルのフィールド |
