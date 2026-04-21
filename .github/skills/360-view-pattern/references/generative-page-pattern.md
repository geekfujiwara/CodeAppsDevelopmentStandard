# 360度ビュー — Generative Pages 実装パターン

**React 17 + TypeScript + Fluent UI V9 + D3.js v7** の単一ファイル構成で構築する360度ビューの実装パターン。

> **前提**: `generative-page-dev` スキルと連携して使用する。絶対遵守ルール・DataAPI パターンはそちらを参照。

---

## 全体構成（単一 .tsx ファイル）

Generative Pages は単一ファイル構成のため、以下のサブコンポーネントをすべて1ファイル内に定義する。

```
MasterDetail360.tsx
├── loadAllRows()           — ページネーション対応データ取得
├── fkId() / num()          — ユーティリティ
├── ProfileSection()        — プロファイルカード
├── OverviewTab()           — 概要タブ
├── TransactionTab()        — トランザクション一覧タブ（汎用）
├── ChartTab()              — チャート・分析タブ
├── TimelineTab()           — タイムラインタブ
└── GeneratedComponent()    — メインコンポーネント（export default）
```

---

## 1. ベーステンプレート

```typescript
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type {
  ReadableTableRow,
  GeneratedComponentProps,
  prefix_master,        // 実際のテーブル型に置き換え
  prefix_transactiona,  // 実際のテーブル型に置き換え
  prefix_transactionb,  // 実際のテーブル型に置き換え
} from "./RuntimeTypes";
import {
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Text,
  Button,
  Spinner,
  Input,
  Badge,
  TabList,
  Tab,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Field,
  DataGrid,
  DataGridHeader,
  DataGridRow,
  DataGridHeaderCell,
  DataGridBody,
  DataGridCell,
  createTableColumn,
} from "@fluentui/react-components";
import type { TableColumnDefinition } from "@fluentui/react-components";
import {
  ArrowLeftRegular,
  EditRegular,
  AddRegular,
  SearchRegular,
  DismissRegular,
  SaveRegular,
  OpenRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
} from "@fluentui/react-icons";
import * as d3 from "d3";

/* ========== カラーパレット ========== */
var P = {
  blue: "#2d5faa", teal: "#1a8f6e", coral: "#c4532a",
  purple: "#6b5fc7", amber: "#b8850e", red: "#c43a3a", green: "#3a8a2e",
};
var PBg = {
  blue: "rgba(45,95,170,0.08)", teal: "rgba(26,143,110,0.08)",
  coral: "rgba(196,83,42,0.08)", purple: "rgba(107,95,199,0.08)",
};

/* ========== ユーティリティ ========== */
async function loadAllRows<T>(
  api: GeneratedComponentProps["dataApi"],
  table: string,
  options: { select: string[]; filter?: string; orderBy?: string; pageSize?: number },
): Promise<ReadableTableRow<T>[]> {
  var rows: ReadableTableRow<T>[] = [];
  var res = await api.queryTable(table as any, {
    select: options.select as any,
    filter: options.filter,
    orderBy: options.orderBy,
    paging: { pageSize: options.pageSize || 250 },
  } as any);
  rows = rows.concat(res.items as ReadableTableRow<T>[]);
  while (res.hasNextPage) {
    res = await res.getNextPage();
    rows = rows.concat(res.items as ReadableTableRow<T>[]);
  }
  return rows;
}

function fkId(row: any, field: string): string {
  var v = row["_" + field + "_value"];
  return v ? String(v) : "";
}
function num(v: any): number { return typeof v === "number" ? v : 0; }
function fmtDate(v: any): string {
  if (!v) return "—";
  var d = new Date(v);
  return d.getFullYear() + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0");
}
```

---

## 2. スタイル定義

```typescript
var useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
    height: "100%",
    boxSizing: "border-box",
    overflow: "auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: tokens.spacingHorizontalM,
    "@media (max-width: 640px)": { gridTemplateColumns: "repeat(2, 1fr)" },
  },
  kpiCard: {
    padding: "16px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    border: "1px solid " + tokens.colorNeutralStroke2,
  },
  attrGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "12px 24px",
    padding: "16px",
    "@media (max-width: 640px)": { gridTemplateColumns: "repeat(2, 1fr)" },
  },
  twoCol: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: tokens.spacingHorizontalM,
    "@media (max-width: 640px)": { gridTemplateColumns: "1fr" },
  },
  timeline: {
    position: "relative",
    paddingLeft: "24px",
  },
  timelineLine: {
    position: "absolute",
    left: "7px",
    top: "8px",
    bottom: "8px",
    width: "2px",
    backgroundColor: tokens.colorNeutralStroke2,
  },
  timelineItem: {
    position: "relative",
    paddingBottom: "20px",
  },
  timelineDot: {
    position: "absolute",
    left: "-20px",
    top: "6px",
    width: "10px",
    height: "10px",
    borderRadius: "50%",
  },
  chartContainer: {
    position: "relative",
  },
  searchBar: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalM,
  },
});
```

---

## 3. プロファイルセクション

```typescript
function ProfileSection(props: {
  master: ReadableTableRow<prefix_master>;
  kpiData: { totalA: number; openA: number; totalB: number; completedRate: number };
}) {
  var styles = useStyles();
  var m = props.master;
  var kpi = props.kpiData;

  var kpiCards = [
    { label: "ステータス", value: "稼働中" /* Choice 値から解決 */, color: P.teal },
    { label: "累計履歴A", value: String(kpi.totalA), color: P.blue },
    { label: "未対応", value: String(kpi.openA), color: P.coral },
    { label: "完了率", value: kpi.completedRate.toFixed(0) + "%", color: P.purple },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* KPI カード */}
      <div className={styles.kpiGrid}>
        {kpiCards.map(function (k) {
          return (
            <div key={k.label} className={styles.kpiCard}>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{k.label}</Text>
              <Text size={600} weight="bold" style={{ display: "block", color: k.color }}>{k.value}</Text>
            </div>
          );
        })}
      </div>

      {/* 基本属性 */}
      <Card>
        <div className={styles.attrGrid}>
          <div>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>タイプ</Text>
            <Text size={300} weight="semibold" style={{ display: "block" }}>
              {/* 実際の属性に置き換え */ "ポンプ"}
            </Text>
          </div>
          <div>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>場所</Text>
            <Text size={300} weight="semibold" style={{ display: "block" }}>
              {(m as any).prefix_location || "—"}
            </Text>
          </div>
          <div>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>登録日</Text>
            <Text size={300} weight="semibold" style={{ display: "block" }}>
              {fmtDate((m as any).createdon)}
            </Text>
          </div>
          {/* 追加属性はここに列挙 */}
        </div>
      </Card>
    </div>
  );
}
```

---

## 4. タブ切替メインコンポーネント

```typescript
var GeneratedComponent = function (props: GeneratedComponentProps) {
  var styles = useStyles();
  var dataApi = props.dataApi;

  /* === State === */
  var [loading, setLoading] = useState(true);
  var [masters, setMasters] = useState<ReadableTableRow<prefix_master>[]>([]);
  var [selectedMaster, setSelectedMaster] = useState<ReadableTableRow<prefix_master> | null>(null);
  var [transA, setTransA] = useState<ReadableTableRow<prefix_transactiona>[]>([]);
  var [transB, setTransB] = useState<ReadableTableRow<prefix_transactionb>[]>([]);
  var [lookupEntities, setLookupEntities] = useState<ReadableTableRow<any>[]>([]);
  var [activeTab, setActiveTab] = useState("overview");
  var [search, setSearch] = useState("");

  /* === Lookup Map === */
  var lookupMap = useMemo(function () {
    var m = new Map<string, string>();
    lookupEntities.forEach(function (e) { m.set((e as any).entityid, (e as any).name); });
    return m;
  }, [lookupEntities]);

  /* === 初回ロード: マスター一覧 === */
  useEffect(function () {
    loadAllRows<prefix_master>(dataApi, "prefix_masters", {
      select: ["prefix_masterid", "prefix_name", "prefix_type", "prefix_status", "modifiedon"],
      orderBy: "modifiedon desc",
    }).then(function (rows) {
      setMasters(rows);
      setLoading(false);
    });
  }, [dataApi]);

  /* === マスター選択時: 関連データ取得 === */
  useEffect(function () {
    if (!selectedMaster) return;
    var masterId = (selectedMaster as any).prefix_masterid;
    setLoading(true);
    Promise.all([
      loadAllRows<prefix_transactiona>(dataApi, "prefix_transactionas", {
        select: ["prefix_transactionaid", "prefix_name", "prefix_date", "prefix_status", "_prefix_categoryid_value"],
        filter: "_prefix_masterid_value eq " + masterId,
        orderBy: "prefix_date desc",
      }),
      loadAllRows<prefix_transactionb>(dataApi, "prefix_transactionbs", {
        select: ["prefix_transactionbid", "prefix_name", "prefix_date", "prefix_status"],
        filter: "_prefix_masterid_value eq " + masterId,
        orderBy: "prefix_date desc",
      }),
    ]).then(function (results) {
      setTransA(results[0]);
      setTransB(results[1]);
      setLoading(false);
    });
  }, [selectedMaster, dataApi]);

  /* === KPI 集計 === */
  var kpiData = useMemo(function () {
    var totalA = transA.length;
    var openA = transA.filter(function (t) { return num((t as any).prefix_status) === 1; }).length;
    var totalB = transB.length;
    var completed = transA.filter(function (t) { return num((t as any).prefix_status) === 3; }).length;
    return {
      totalA: totalA,
      openA: openA,
      totalB: totalB,
      completedRate: totalA > 0 ? (completed / totalA) * 100 : 0,
    };
  }, [transA, transB]);

  /* === ローディング === */
  if (loading && !selectedMaster) {
    return <div className={styles.root}><Spinner label="読み込み中..." /></div>;
  }

  /* === マスター未選択: 一覧表示 === */
  if (!selectedMaster) {
    return (
      <div className={styles.root}>
        <Text size={500} weight="bold">マスター一覧</Text>
        <div className={styles.searchBar}>
          <SearchRegular />
          <Input
            placeholder="検索..."
            value={search}
            onChange={function (_, d) { setSearch(d.value); }}
            style={{ flex: 1 }}
          />
        </div>
        {masters
          .filter(function (m) {
            if (!search) return true;
            return ((m as any).prefix_name || "").toLowerCase().indexOf(search.toLowerCase()) >= 0;
          })
          .map(function (m) {
            return (
              <Card key={(m as any).prefix_masterid}
                style={{ padding: "12px 16px", cursor: "pointer" }}
                onClick={function () { setSelectedMaster(m); setActiveTab("overview"); }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <Text weight="semibold">{(m as any).prefix_name}</Text>
                    <Text size={200} style={{ display: "block", color: tokens.colorNeutralForeground3 }}>
                      {fmtDate((m as any).modifiedon)}
                    </Text>
                  </div>
                  <Badge appearance="outline">
                    {/* ステータスラベル */}
                  </Badge>
                </div>
              </Card>
            );
          })}
      </div>
    );
  }

  /* === マスター選択済: 360度詳細ビュー === */
  return (
    <div className={styles.root}>
      {/* ヘッダー */}
      <div className={styles.header}>
        <Button
          icon={<ArrowLeftRegular />}
          appearance="subtle"
          onClick={function () { setSelectedMaster(null); setTransA([]); setTransB([]); }}
        />
        <div>
          <Text size={500} weight="bold">{(selectedMaster as any).prefix_name}</Text>
        </div>
      </div>

      {/* プロファイル */}
      <ProfileSection master={selectedMaster} kpiData={kpiData} />

      {/* タブ */}
      <TabList
        selectedValue={activeTab}
        onTabSelect={function (_, d) { setActiveTab(d.value as string); }}
      >
        <Tab value="overview">概要</Tab>
        <Tab value="historyA">
          履歴A <Badge appearance="tint" size="small" style={{ marginLeft: 4 }}>{kpiData.totalA}</Badge>
        </Tab>
        <Tab value="historyB">
          履歴B <Badge appearance="tint" size="small" style={{ marginLeft: 4 }}>{kpiData.totalB}</Badge>
        </Tab>
        <Tab value="charts">分析</Tab>
        <Tab value="timeline">タイムライン</Tab>
      </TabList>

      {/* タブコンテンツ */}
      {loading ? (
        <Spinner label="データ読み込み中..." />
      ) : (
        <div>
          {activeTab === "overview" && (
            <OverviewTab master={selectedMaster} transA={transA} />
          )}
          {activeTab === "historyA" && (
            <TransactionTab data={transA} lookupMap={lookupMap} label="履歴A" />
          )}
          {activeTab === "historyB" && (
            <TransactionTab data={transB} lookupMap={lookupMap} label="履歴B" />
          )}
          {activeTab === "charts" && (
            <ChartTab transA={transA} transB={transB} />
          )}
          {activeTab === "timeline" && (
            <TimelineTab transA={transA} transB={transB} />
          )}
        </div>
      )}
    </div>
  );
};

export default GeneratedComponent;
```

---

## 5. 概要タブ

```typescript
function OverviewTab(props: {
  master: ReadableTableRow<prefix_master>;
  transA: ReadableTableRow<prefix_transactiona>[];
}) {
  var styles = useStyles();
  var m = props.master;
  var recent = props.transA.slice(0, 5);

  return (
    <div className={styles.twoCol}>
      {/* 左: 詳細属性 */}
      <Card style={{ padding: "16px" }}>
        <Text weight="semibold" size={400} style={{ marginBottom: 12, display: "block" }}>詳細情報</Text>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "8px 16px", fontSize: 13 }}>
          <Text style={{ color: tokens.colorNeutralForeground3 }}>型番</Text>
          <Text weight="semibold">{(m as any).prefix_model || "—"}</Text>
          <Text style={{ color: tokens.colorNeutralForeground3 }}>シリアル</Text>
          <Text weight="semibold">{(m as any).prefix_serial || "—"}</Text>
          {/* 追加属性をここに列挙 */}
        </div>
      </Card>

      {/* 右: 直近アクティビティ */}
      <Card style={{ padding: "16px" }}>
        <Text weight="semibold" size={400} style={{ marginBottom: 12, display: "block" }}>直近のアクティビティ</Text>
        {recent.length === 0 ? (
          <Text style={{ color: tokens.colorNeutralForeground3, textAlign: "center", padding: "24px" }}>
            データがありません
          </Text>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {recent.map(function (item, i) {
              return (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <div style={{
                    marginTop: 6, width: 8, height: 8, borderRadius: "50%",
                    backgroundColor: P.blue, flexShrink: 0,
                  }} />
                  <div>
                    <Text weight="semibold" size={300}>{(item as any).prefix_name}</Text>
                    <Text size={200} style={{ display: "block", color: tokens.colorNeutralForeground3 }}>
                      {fmtDate((item as any).prefix_date)}
                    </Text>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
```

---

## 6. トランザクション一覧タブ（汎用 DataGrid）

```typescript
function TransactionTab(props: {
  data: ReadableTableRow<any>[];
  lookupMap: Map<string, string>;
  label: string;
}) {
  var [search, setSearch] = useState("");
  var [editItem, setEditItem] = useState<any | null>(null);
  var [saving, setSaving] = useState(false);
  var [toast, setToast] = useState<string | null>(null);
  var styles = useStyles();

  var filtered = useMemo(function () {
    if (!search) return props.data;
    var q = search.toLowerCase();
    return props.data.filter(function (r) {
      return ((r as any).prefix_name || "").toLowerCase().indexOf(q) >= 0;
    });
  }, [props.data, search]);

  /* DataGrid カラム定義 — プロジェクト固有に置き換え */
  var columns: TableColumnDefinition<any>[] = [
    createTableColumn({ columnId: "date", renderHeaderCell: function () { return "日付"; },
      renderCell: function (item) { return <Text size={300}>{fmtDate(item.prefix_date)}</Text>; },
    }),
    createTableColumn({ columnId: "name", renderHeaderCell: function () { return "タイトル"; },
      renderCell: function (item) { return <Text size={300} weight="semibold">{item.prefix_name}</Text>; },
    }),
    createTableColumn({ columnId: "status", renderHeaderCell: function () { return "ステータス"; },
      renderCell: function (item) {
        return <Badge appearance="outline">{/* ステータスラベル */}</Badge>;
      },
    }),
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Text weight="semibold" size={400}>{props.label} ({filtered.length}件)</Text>
        <Button icon={<AddRegular />} appearance="primary" size="small">新規作成</Button>
      </div>

      <div className={styles.searchBar}>
        <SearchRegular />
        <Input placeholder="検索..." value={search}
          onChange={function (_, d) { setSearch(d.value); }}
          style={{ flex: 1 }} />
      </div>

      <DataGrid items={filtered} columns={columns}
        getRowId={function (item) { return item.prefix_transactionaid || item.prefix_transactionbid; }}
      >
        <DataGridHeader>
          <DataGridRow>
            {function (p) { return <DataGridHeaderCell {...p} />; }}
          </DataGridRow>
        </DataGridHeader>
        <DataGridBody<any>>
          {function (p) {
            return (
              <DataGridRow<any> key={p.rowId} {...p}
                style={{ cursor: "pointer" }}
                onClick={function () { setEditItem(p.item); }}
              >
                {function (cellProps) { return <DataGridCell {...cellProps} />; }}
              </DataGridRow>
            );
          }}
        </DataGridBody>
      </DataGrid>

      {/* 編集モーダル */}
      <Dialog open={!!editItem} onOpenChange={function (_, d) { if (!d.open) setEditItem(null); }}>
        <DialogSurface style={{ maxWidth: 520 }}>
          <DialogBody>
            <DialogTitle>レコード編集</DialogTitle>
            <DialogContent>
              {/* フォームフィールド — プロジェクト固有に置き換え */}
              <Field label="タイトル">
                <Input value={editItem ? editItem.prefix_name || "" : ""} />
              </Field>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={function () { setEditItem(null); }}>キャンセル</Button>
              <Button appearance="primary" icon={<SaveRegular />} disabled={saving}>保存</Button>
              <Button appearance="subtle" icon={<OpenRegular />}
                onClick={function () {
                  if (editItem) {
                    var id = editItem.prefix_transactionaid || editItem.prefix_transactionbid;
                    (window as any).Xrm?.Navigation?.openForm({ entityName: "prefix_transactiona", entityId: id });
                  }
                }}
              >詳細を開く</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* トースト通知 */}
      {toast && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 9999,
          backgroundColor: P.green, color: "#fff", padding: "10px 20px",
          borderRadius: 8, fontSize: 13, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
```

---

## 7. チャートタブ（D3.js）

```typescript
function ChartTab(props: {
  transA: ReadableTableRow<prefix_transactiona>[];
  transB: ReadableTableRow<prefix_transactionb>[];
}) {
  var styles = useStyles();
  var barRef = useRef<SVGSVGElement>(null);
  var pieRef = useRef<SVGSVGElement>(null);

  /* 月別集計 */
  var monthlyData = useMemo(function () {
    var map = new Map<string, { month: string; countA: number; countB: number }>();
    function fmt(v: any) {
      var d = new Date(v);
      return d.getFullYear() + "/" + String(d.getMonth() + 1).padStart(2, "0");
    }
    props.transA.forEach(function (t) {
      var m = fmt((t as any).prefix_date);
      var entry = map.get(m) || { month: m, countA: 0, countB: 0 };
      entry.countA++;
      map.set(m, entry);
    });
    props.transB.forEach(function (t) {
      var m = fmt((t as any).prefix_date);
      var entry = map.get(m) || { month: m, countA: 0, countB: 0 };
      entry.countB++;
      map.set(m, entry);
    });
    return Array.from(map.values()).sort(function (a, b) { return a.month.localeCompare(b.month); });
  }, [props.transA, props.transB]);

  /* ステータス分布 */
  var statusData = useMemo(function () {
    var map = new Map<number, number>();
    props.transA.forEach(function (t) {
      var s = num((t as any).prefix_status);
      map.set(s, (map.get(s) || 0) + 1);
    });
    var result: { label: string; value: number; color: string }[] = [];
    map.forEach(function (count, status) {
      result.push({
        label: statusLabels[status] || "不明",
        value: count,
        color: statusColors[status] || P.blue,
      });
    });
    return result;
  }, [props.transA]);

  /* D3 棒グラフ — requestAnimationFrame で遅延描画 */
  useEffect(function () {
    if (monthlyData.length === 0) return;
    var rafId = requestAnimationFrame(function () {
      var svg = d3.select(barRef.current);
      if (!barRef.current) return;
      svg.selectAll("*").remove();

      var W = 400, H = 240, margin = { top: 20, right: 20, bottom: 40, left: 40 };
      var w = W - margin.left - margin.right;
      var h = H - margin.top - margin.bottom;
      svg.attr("width", W).attr("height", H);

      var g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");
      var x0 = d3.scaleBand().domain(monthlyData.map(function (d) { return d.month; })).range([0, w]).padding(0.3);
      var x1 = d3.scaleBand().domain(["countA", "countB"]).range([0, x0.bandwidth()]).padding(0.05);
      var maxVal = d3.max(monthlyData, function (d) { return Math.max(d.countA, d.countB); }) || 1;
      var y = d3.scaleLinear().domain([0, maxVal]).nice().range([h, 0]);

      g.append("g").attr("transform", "translate(0," + h + ")").call(d3.axisBottom(x0)).selectAll("text").style("font-size", "10px");
      g.append("g").call(d3.axisLeft(y).ticks(5));

      monthlyData.forEach(function (d) {
        g.append("rect").attr("x", (x0(d.month) || 0) + (x1("countA") || 0)).attr("y", y(d.countA))
          .attr("width", x1.bandwidth()).attr("height", h - y(d.countA)).attr("fill", P.blue).attr("rx", 3);
        g.append("rect").attr("x", (x0(d.month) || 0) + (x1("countB") || 0)).attr("y", y(d.countB))
          .attr("width", x1.bandwidth()).attr("height", h - y(d.countB)).attr("fill", P.teal).attr("rx", 3);
      });
    });
    return function () { cancelAnimationFrame(rafId); };
  }, [monthlyData]);

  /* D3 ドーナツチャート — requestAnimationFrame で遅延描画 */
  useEffect(function () {
    if (statusData.length === 0) return;
    var rafId = requestAnimationFrame(function () {
      var svg = d3.select(pieRef.current);
      if (!pieRef.current) return;
      svg.selectAll("*").remove();

      var W = 260, H = 240;
      svg.attr("width", W).attr("height", H);
      var g = svg.append("g").attr("transform", "translate(" + W / 2 + "," + H / 2 + ")");
      var arc = d3.arc<d3.PieArcDatum<any>>().innerRadius(50).outerRadius(90);
      var pie = d3.pie<any>().value(function (d) { return d.value; }).padAngle(0.03);
      var arcs = pie(statusData);

      arcs.forEach(function (a) {
        g.append("path").attr("d", arc(a)).attr("fill", (a.data as any).color);
      });

      /* レジェンド */
      statusData.forEach(function (d, i) {
        g.append("rect").attr("x", -W / 2 + 10).attr("y", -H / 2 + 10 + i * 18).attr("width", 10).attr("height", 10).attr("fill", d.color).attr("rx", 2);
        g.append("text").attr("x", -W / 2 + 24).attr("y", -H / 2 + 19 + i * 18).text(d.label + " (" + d.value + ")").style("font-size", "11px").attr("fill", tokens.colorNeutralForeground1);
      });
    });
    return function () { cancelAnimationFrame(rafId); };
  }, [statusData]);

  return (
    <div className={styles.twoCol}>
      <Card style={{ padding: "16px" }}>
        <Text weight="semibold" size={400} style={{ marginBottom: 12, display: "block" }}>月別推移</Text>
        {monthlyData.length === 0 ? (
          <Text style={{ color: tokens.colorNeutralForeground3, textAlign: "center", padding: 24 }}>データがありません</Text>
        ) : (
          <div style={{ height: 240 }}><svg ref={barRef}></svg></div>
        )}
      </Card>
      <Card style={{ padding: "16px" }}>
        <Text weight="semibold" size={400} style={{ marginBottom: 12, display: "block" }}>ステータス分布</Text>
        {statusData.length === 0 ? (
          <Text style={{ color: tokens.colorNeutralForeground3, textAlign: "center", padding: 24 }}>データがありません</Text>
        ) : (
          <div style={{ height: 240 }}><svg ref={pieRef}></svg></div>
        )}
      </Card>
    </div>
  );
}
```

---

## 8. タイムラインタブ

```typescript
function TimelineTab(props: {
  transA: ReadableTableRow<prefix_transactiona>[];
  transB: ReadableTableRow<prefix_transactionb>[];
}) {
  var styles = useStyles();

  var items = useMemo(function () {
    var all = ([] as any[])
      .concat(props.transA.map(function (t) { return { data: t, source: "A", date: (t as any).prefix_date }; }))
      .concat(props.transB.map(function (t) { return { data: t, source: "B", date: (t as any).prefix_date }; }));
    all.sort(function (a, b) { return new Date(b.date).getTime() - new Date(a.date).getTime(); });
    return all;
  }, [props.transA, props.transB]);

  var sourceColors: Record<string, string> = { A: P.blue, B: P.teal };
  var sourceLabels: Record<string, string> = { A: "履歴A", B: "履歴B" };

  if (items.length === 0) {
    return (
      <Card style={{ padding: "32px", textAlign: "center" }}>
        <Text style={{ color: tokens.colorNeutralForeground3 }}>タイムラインデータがありません</Text>
      </Card>
    );
  }

  return (
    <Card style={{ padding: "16px" }}>
      <div className={styles.timeline}>
        <div className={styles.timelineLine} />
        {items.map(function (item, i) {
          return (
            <div key={i} className={styles.timelineItem}>
              <div className={styles.timelineDot} style={{ backgroundColor: sourceColors[item.source] }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Text size={200} weight="semibold">{fmtDate(item.date)}</Text>
                <Badge appearance="outline" size="small" style={{ backgroundColor: sourceColors[item.source] + "15", color: sourceColors[item.source] }}>
                  {sourceLabels[item.source]}
                </Badge>
              </div>
              <Text size={300} weight="semibold">{(item.data as any).prefix_name}</Text>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
```

---

## 9. カスタマイズガイド

### ドメイン適用時の置き換えチェックリスト

| 項目 | 置き換え内容 |
|------|------------|
| `prefix_master` / `prefix_transactiona` | RuntimeTypes.ts の実際の型名 |
| `prefix_` カラム名 | RuntimeTypes.ts の実際のカラム名 |
| `loadAllRows` の `select` / `filter` | 実際のテーブル・カラムに合わせる |
| KPI 計算 | ドメイン固有の集計ロジック |
| タブ名 | ドメイン固有の名前（点検履歴、修理履歴等） |
| DataGrid カラム | 実際のテーブルカラム定義 |
| ステータスラベル・カラー | Choice 値から `getChoices()` で取得 |
| 編集フォームフィールド | Dialog 内のフォームを実際のフィールドに置き換え |
| D3 チャート | ドメイン固有の可視化（稼働率推移、コスト内訳等） |

### 注意事項（[generative-page-dev スキル](../../generative-page-dev/SKILL.md) の絶対遵守ルール準拠）

- **React 17 構文のみ** — `useId`, `useTransition` 等は使用不可
- **DataAPI は読み取り専用** — 書き込みは `(window as any).Xrm.WebApi.online` を使用
- **`Map` / `Set` に `for...of` 禁止** — `.forEach()` でイテレーション
- **D3 の useEffect は `requestAnimationFrame` で描画遅延**
- **SVG は明示的 `width` / `height`** — `viewBox` は使わない
- **ツールチップは `position: absolute`** — `position: fixed` は禁止
- **Lookup 展開フィールドを `select` に含めない** — `_xxx_value` のみ select し、Map で名前解決
