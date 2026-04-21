# Generative Pages コードパターンリファレンス

## 1. コンポーネント基本構造

```typescript
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type {
  ReadableTableRow,
  GeneratedComponentProps,
  my_entity,
} from "./RuntimeTypes";
import {
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Text,
  Button,
  Spinner,
  TabList,
  Tab,
  Dropdown,
  Option,
  Switch,
  Badge,
  DataGrid,
  DataGridHeader,
  DataGridRow,
  DataGridHeaderCell,
  DataGridBody,
  DataGridCell,
  TableColumnDefinition,
  createTableColumn,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  Tooltip,
} from "@fluentui/react-components";
import {
  ChevronLeftRegular,
  ChevronRightRegular,
  ArrowUpRegular,
  ArrowDownRegular,
  FilterRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import * as d3 from "d3";

/* ---------- スタイル ---------- */
const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
    height: "100%",
    boxSizing: "border-box",
    overflow: "auto",
  },
  card: {
    padding: tokens.spacingHorizontalM,
  },
  row: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
    flexWrap: "wrap",
  },
});

/* ---------- メインコンポーネント ---------- */
const GeneratedComponent = (props: GeneratedComponentProps) => {
  const styles = useStyles();
  const { dataApi } = props;

  // state, effects, render...
  return <div className={styles.root}>{/* 内容 */}</div>;
};

export default GeneratedComponent;
```

## 2. DataAPI パターン

### 2.1 全件取得（ページネーション対応）

```typescript
async function loadAllRows<T>(
  api: GeneratedComponentProps["dataApi"],
  table: string,
  options: {
    select: string[];
    filter?: string;
    orderBy?: string;
    pageSize?: number;
  },
): Promise<ReadableTableRow<T>[]> {
  let res = await api.queryTable(table as any, {
    select: options.select as any,
    filter: options.filter,
    orderBy: options.orderBy,
    pageSize: options.pageSize || 250,
  });
  let rows = [...res.rows]; // 必須: スプレッドで配列化
  while (res.hasMoreRows && res.loadMoreRows) {
    res = await res.loadMoreRows();
    rows = rows.concat(res.rows);
  }
  return rows as any;
}
```

### 2.2 Choice フィールドの取得

```typescript
const statusChoices = (await dataApi.getChoices("entity_name-field_name")).map(
  (c) => ({ label: c.label, value: c.value as number }),
);
```

### 2.3 Lookup ID 抽出

Lookup（外部キー）フィールドの値は `EntityReference(guid)` 形式で返る:

```typescript
function fkId(fk: any): string {
  if (!fk) return "";
  const s = String(fk);
  const m = s.match(/\(([^)]+)\)/);
  return m ? m[1] : s;
}
```

### 2.4 数値フィールドの安全な変換

Dataverse から返る数値は文字列の場合がある:

```typescript
function num(v: any): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
```

### 2.5 日付フィールドの処理

```typescript
function parseDate(v: any): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}
```

## 3. 集計パターン

### 3.1 Map ベースの集計（forEach 必須）

```typescript
function aggregateByKey<T>(
  rows: T[],
  keyFn: (r: T) => string,
  valueFn: (r: T) => number,
): Map<string, number> {
  const map = new Map<string, number>();
  rows.forEach((r) => {
    const k = keyFn(r);
    map.set(k, (map.get(k) || 0) + valueFn(r));
  });
  return map;
}

// Map の利用時は forEach または スプレッド
const entries: [string, number][] = [];
map.forEach((v, k) => entries.push([k, v]));
// または
const entries2 = [...map.entries()];
```

> **⚠️ `for...of` は Map / Set に対して使用禁止** — Power Apps ランタイムでイテレータエラーが発生する。

### 3.2 月次集計

```typescript
interface MonthlyData {
  yearMonth: string; // "2024-04"
  total: number;
}

function aggregateMonthly(
  rows: ReadableTableRow<any>[],
  dateField: string,
  amountField: string,
): MonthlyData[] {
  const map = new Map<string, number>();
  rows.forEach((r) => {
    const d = parseDate(r[dateField]);
    if (!d) return;
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map.set(ym, (map.get(ym) || 0) + num(r[amountField]));
  });
  const result: MonthlyData[] = [];
  map.forEach((total, yearMonth) => result.push({ yearMonth, total }));
  return result.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}
```

## 4. D3.js チャートパターン

### 4.1 棒グラフ（Bar Chart）

```typescript
interface BarChartProps {
  data: { label: string; value: number }[];
  width?: number;
  height?: number;
  activeTab: string;
}

const BarChart: React.FC<BarChartProps> = ({ data, width = 500, height = 300, activeTab }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (data.length === 0 || activeTab !== "charts") return;

    // ★ requestAnimationFrame で次フレームに遅延（初回レンダー時のレイアウト未完了対策）
    var raf = requestAnimationFrame(() => {
      if (!svgRef.current) return;

      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove(); // 必ずクリーンアップ

      // ★ 明示的 width/height を設定（viewBox は使わない）
      svg.attr("width", width).attr("height", height);

      const margin = { top: 20, right: 20, bottom: 40, left: 60 };
      const w = width - margin.left - margin.right;
      const h = height - margin.top - margin.bottom;

      const g = svg
        .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleBand()
      .domain(data.map((d) => d.label))
      .range([0, w])
      .padding(0.2);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.value) || 0])
      .nice()
      .range([h, 0]);

    // X 軸
    g.append("g")
      .attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("transform", "rotate(-30)")
      .style("text-anchor", "end")
      .style("font-size", "11px");

    // Y 軸
    g.append("g").call(d3.axisLeft(y).ticks(5));

    // バー
    g.selectAll(".bar")
      .data(data)
      .enter()
      .append("rect")
      .attr("x", (d) => x(d.label) || 0)
      .attr("y", (d) => y(d.value))
      .attr("width", x.bandwidth())
      .attr("height", (d) => h - y(d.value))
      .attr("fill", tokens.colorBrandBackground)
      .attr("rx", 4);
    }); // ★ rAF 終了
    return () => { cancelAnimationFrame(raf); }; // ★ クリーンアップ
  }, [data, width, height, activeTab]);

  return (
    <div style={{ position: "relative", width: "100%", overflow: "hidden", height: height }}>
      <svg ref={svgRef} style={{ display: "block" }} />
    </div>
  );
};
```

> **⚠️ `viewBox` + `height: "auto"` は使用禁止** — Generative Pages ランタイムでチャートが表示されない原因になる。必ず `svg.attr("width", W).attr("height", H)` でピクセル指定し、ラッパー div にも明示的 height を設定する。

> **⚠️ 全チャートの useEffect は `requestAnimationFrame` で描画を遅延する** — 初回データ取得完了時の同一レンダーサイクルではブラウザのレイアウトが未完了で `clientWidth` が 0 になる。ref チェックは rAF コールバック内で行い、クリーンアップで `cancelAnimationFrame` を返す。

### 4.2 ドーナツチャート（Donut Chart）

```typescript
interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
  activeTab: string;
}

const DonutChart: React.FC<DonutChartProps> = ({ data, size = 240, activeTab }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (data.length === 0 || activeTab !== "charts") return;

    // ★ requestAnimationFrame で次フレームに遅延
    var raf = requestAnimationFrame(() => {
      if (!svgRef.current) return;

      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();

      // ★ 明示的 width/height（viewBox は使わない）
      svg.attr("width", size).attr("height", size);

    const radius = size / 2;
    const g = svg
      .append("g")
      .attr("transform", `translate(${radius},${radius})`);

    const pie = d3.pie<{ label: string; value: number; color: string }>()
      .value((d) => d.value)
      .sort(null);

    const arc = d3.arc<d3.PieArcDatum<any>>()
      .innerRadius(radius * 0.6)
      .outerRadius(radius * 0.88);

    g.selectAll("path")
      .data(pie(data))
      .enter()
      .append("path")
      .attr("d", arc as any)
      .attr("fill", (d) => d.data.color)
      .attr("opacity", 0)
      .transition().duration(500).delay((_, i) => i * 80)
      .attr("opacity", 1);

    // 中央テキスト
    const total = data.reduce((s, d) => s + d.value, 0);
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.1em")
      .attr("font-size", "24px")
      .attr("font-weight", "600")
      .attr("fill", tokens.colorNeutralForeground1)
      .text(total.toLocaleString());
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "1.4em")
      .attr("font-size", "11px")
      .attr("fill", tokens.colorNeutralForeground3)
      .text("総件数");
    }); // ★ rAF 終了
    return () => { cancelAnimationFrame(raf); }; // ★ クリーンアップ
  }, [data, size, activeTab]);

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <svg ref={svgRef} style={{ display: "block" }} />
    </div>
  );
};
```

### 4.3 SVG 地図 + バブルオーバーレイ

地図データは SVG パスの座標配列として定義し、バブル（円）を重ねる:

```typescript
interface MapRegion {
  id: string;
  name: string;
  path: string; // SVG path data
  cx: number; // バブル中心 X
  cy: number; // バブル中心 Y
}

interface BubbleMapProps {
  regions: MapRegion[];
  values: Map<string, number>;
  onRegionClick?: (id: string) => void;
}

const BubbleMap: React.FC<BubbleMapProps> = ({ regions, values, onRegionClick }) => {
  const maxVal = Math.max(1, ...([...values.values()]));
  const rScale = d3.scaleSqrt().domain([0, maxVal]).range([4, 30]);

  return (
    <svg viewBox="0 0 800 1000" style={{ width: "100%", height: "auto" }}>
      {/* 地域パス */}
      {regions.map((r) => (
        <path
          key={r.id}
          d={r.path}
          fill={tokens.colorNeutralBackground3}
          stroke={tokens.colorNeutralStroke1}
          strokeWidth={0.5}
          onClick={() => onRegionClick?.(r.id)}
          style={{ cursor: onRegionClick ? "pointer" : "default" }}
        />
      ))}
      {/* バブル */}
      {regions.map((r) => {
        const val = values.get(r.id) || 0;
        if (val === 0) return null;
        return (
          <circle
            key={`bubble-${r.id}`}
            cx={r.cx}
            cy={r.cy}
            r={rScale(val)}
            fill={tokens.colorBrandBackground}
            fillOpacity={0.6}
            stroke={tokens.colorBrandForeground1}
            strokeWidth={1}
            onClick={() => onRegionClick?.(r.id)}
            style={{ cursor: "pointer" }}
          />
        );
      })}
    </svg>
  );
};
```

### 4.4 日付入力（Input type="date"）

`DatePicker` は Generative Pages で透明ポップアップ問題があるため、`Input type="date"` を使う:

```typescript
var [scheduledDate, setScheduledDate] = useState<Date | null>(null);

// JSX
React.createElement(Input, {
  type: "date",
  value: scheduledDate
    ? scheduledDate.getFullYear() +
      "-" +
      String(scheduledDate.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(scheduledDate.getDate()).padStart(2, "0")
    : "",
  onChange: function (_: any, d: any) {
    if (d.value) {
      var parts = d.value.split("-");
      setScheduledDate(
        new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])),
      );
    } else {
      setScheduledDate(null);
    }
  },
  style: { maxWidth: 300 },
});
```

> **⚠️ `@fluentui/react-datepicker-compat` の `DatePicker` は使用禁止** — Generative Pages ランタイムでポップアップが透明になる。

### 4.6 D3 チャートのツールチップ

D3 SVG 要素には Fluent UI `Tooltip` が使えないため、生の HTML div で実装する。
**`position: fixed` は禁止**— Generative Pages ランタイムでマウスから大きく離れる。

```typescript
// ─── セットアップ ───
// 1. root div に position: "relative" を設定
const useStyles = makeStyles({
  root: {
    position: "relative",
    overflow: "auto",
    // ... other styles
  },
});

// 2. tooltip ref
const tooltipRef = useRef<HTMLDivElement>(null);

// 3. 共通ヘルパー関数
function showTip(html: string, ev: MouseEvent) {
  var tip = tooltipRef.current;
  if (!tip) return;
  tip.innerHTML = html;
  tip.style.display = "block";
  var root = tip.parentElement;
  if (root) {
    var rect = root.getBoundingClientRect();
    tip.style.left = (ev.clientX - rect.left + root.scrollLeft + 10) + "px";
    tip.style.top = (ev.clientY - rect.top + root.scrollTop - 10) + "px";
  }
}
function moveTip(ev: MouseEvent) {
  var tip = tooltipRef.current;
  if (!tip) return;
  var root = tip.parentElement;
  if (root) {
    var rect = root.getBoundingClientRect();
    tip.style.left = (ev.clientX - rect.left + root.scrollLeft + 10) + "px";
    tip.style.top = (ev.clientY - rect.top + root.scrollTop - 10) + "px";
  }
}
function hideTip() {
  var tip = tooltipRef.current;
  if (!tip) return;
  tip.style.display = "none";
}

// 4. D3 の useEffect 内でホバーイベントを追加
g.selectAll("path").data(pie(data)).enter()
  .append("path")
  .attr("d", arc as any)
  .attr("fill", (d) => d.data.color)
  .attr("cursor", "pointer")
  .on("mouseover", function (ev: MouseEvent, d: any) {
    showTip("<b>" + d.data.label + "</b><br/>" + d.data.count + "件", ev);
    d3.select(this).attr("opacity", 0.8);
  })
  .on("mousemove", function (ev: MouseEvent) { moveTip(ev); })
  .on("mouseout", function () { hideTip(); d3.select(this).attr("opacity", 1); });

// 5. JSX—root div の直下にツールチップ div を配置
<div className={styles.root}>
  <div ref={tooltipRef} style={{
    display: "none", position: "absolute", zIndex: 10000,
    padding: "6px 10px", borderRadius: 6,
    backgroundColor: "rgba(30,30,30,0.92)", color: "#fff",
    fontSize: 12, lineHeight: 1.4, pointerEvents: "none",
    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
    maxWidth: 200, whiteSpace: "nowrap",
  }} />
  {/* ... チャート等 ... */}
</div>
```

> **⚠️ `position: fixed` は使用禁止** — Generative Pages ランタイムではコンテナのオフセットが大きく、ツールチップがマウスから遠く離れる。
> **Fluent UI `Tooltip` コンポーネントは D3 SVG 要素には使えない** — D3 が動的に生成した SVG 要素に React のイベントハンドラはバインドできない。

### 4.5 createRecord 時の Lookup バインド

Dataverse の `createRecord` で Lookup フィールドを設定するには `@odata.bind` を使う:

```typescript
var record: any = {
  em_workordername: "点検作業",
  em_status: 100000000,
};

// Lookup 設定（ナビゲーションプロパティ名 + @odata.bind）
if (equipmentId) {
  record["em_Equipment@odata.bind"] = "/em_equipments(" + equipmentId + ")";
}

await (window as any).Xrm.WebApi.online.createRecord("em_workorder", record);
```

> **注意**: `@odata.bind` のキー名はナビゲーションプロパティ名（大文字/小文字を区別する）。列の論理名ではない。
> 日付フィールドは ISO 形式の日付部分のみ: `date.toISOString().split("T")[0]`

## 5. ダークモード対応

### themeToVars パターン（FluentProvider 不要）

```typescript
import { webDarkTheme, webLightTheme } from "@fluentui/react-components";

function themeToVars(
  theme: Record<string, string>
): React.CSSProperties {
  const v: Record<string, string> = {};
  Object.entries(theme).forEach(([k, val]) => {
    v["--" + k] = val;
  });
  return v as React.CSSProperties;
}

// コンポーネント内
const [isDark, setIsDark] = useState(false);

// JSX: 外側 div にテーマ CSS 変数を適用
<div
  style={{
    ...themeToVars(
      (isDark ? webDarkTheme : webLightTheme) as unknown as Record<string, string>
    ),
    height: "100%",
    overflow: "auto",
  }}
>
  <div className={styles.root}>
    <Switch
      label={isDark ? "ダークモード" : "ライトモード"}
      checked={isDark}
      onChange={(_, d) => setIsDark(d.checked)}
    />
    {/* コンテンツ */}
  </div>
</div>
```

## 6. 多言語対応（i18n）

```typescript
function detectLanguage(): { code: string; name: string } {
  const uiLang =
    (typeof Xrm !== "undefined" &&
      Xrm.Utility?.getGlobalContext()?.userSettings?.languageId) ||
    1041;
  if (uiLang === 1033) return { code: "en-US", name: "English" };
  return { code: "ja-JP", name: "Japanese" };
}

const T: Record<string, Record<string, string>> = {
  "ja-JP": {
    title: "ダッシュボード",
    loading: "読み込み中...",
    error: "エラーが発生しました",
    noData: "データがありません",
    save: "保存",
    cancel: "キャンセル",
  },
  "en-US": {
    title: "Dashboard",
    loading: "Loading...",
    error: "An error occurred",
    noData: "No data available",
    save: "Save",
    cancel: "Cancel",
  },
};

// コンポーネント内での使用
const lang = useMemo(() => detectLanguage(), []);
const t = useCallback(
  (k: string): string => T[lang.code]?.[k] || T["en-US"]?.[k] || k,
  [lang.code],
);
```

## 7. KPI カード

```typescript
interface KpiCardProps {
  title: string;
  value: string;
  subValue?: string;
  trend?: { value: number; label: string };
  icon?: React.ReactNode;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, subValue, trend, icon }) => (
  <Card style={{ minWidth: 180, flex: "1 1 180px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {title}
        </Text>
        <div>
          <Text size={600} weight="bold">{value}</Text>
        </div>
        {subValue && (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            {subValue}
          </Text>
        )}
        {trend && (
          <Badge
            appearance="filled"
            color={trend.value >= 0 ? "success" : "danger"}
            style={{ marginTop: 4 }}
          >
            {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value).toFixed(1)}%{" "}
            {trend.label}
          </Badge>
        )}
      </div>
      {icon && <div style={{ color: tokens.colorBrandForeground1 }}>{icon}</div>}
    </div>
  </Card>
);
```

## 8. DataGrid テーブル

```typescript
const columns: TableColumnDefinition<MyRow>[] = [
  createTableColumn({
    columnId: "name",
    renderHeaderCell: () => "名前",
    renderCell: (item) => <Text>{item.name}</Text>,
    compare: (a, b) => a.name.localeCompare(b.name),
  }),
  createTableColumn({
    columnId: "amount",
    renderHeaderCell: () => "売上",
    renderCell: (item) => <Text>{item.amount.toLocaleString()}円</Text>,
    compare: (a, b) => a.amount - b.amount,
  }),
];

// JSX
<DataGrid items={items} columns={columns} sortable>
  <DataGridHeader>
    <DataGridRow>
      {({ renderHeaderCell }) => (
        <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
      )}
    </DataGridRow>
  </DataGridHeader>
  <DataGridBody<MyRow>>
    {({ item, rowId }) => (
      <DataGridRow<MyRow> key={rowId}>
        {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
      </DataGridRow>
    )}
  </DataGridBody>
</DataGrid>
```

## 9. フィルター UI（Dropdown）

```typescript
const [selectedArea, setSelectedArea] = useState<string>("all");

<Dropdown
  placeholder="エリアを選択"
  value={selectedArea === "all" ? "全エリア" : selectedArea}
  onOptionSelect={(_, d) => setSelectedArea(d.optionValue || "all")}
>
  <Option value="all">全エリア</Option>
  {areas.map((a) => (
    <Option key={a.id} value={a.id}>{a.name}</Option>
  ))}
</Dropdown>
```

## 10. ウィンドウキャッシュ

Power Apps ページ遷移時にデータを保持する:

```typescript
const CACHE_KEY = "__ppMyPageData";

let _cache: MyData | null = (window as any)[CACHE_KEY] ?? null;

// データロード完了後
_cache = result;
(window as any)[CACHE_KEY] = result;

// useState の初期値にキャッシュを使用
const [data, setData] = useState<MyData | null>(_cache);
const [loading, setLoading] = useState(_cache === null);

useEffect(() => {
  if (_cache) {
    setData(_cache);
    setLoading(false);
    return;
  }
  // fetch data...
}, []);
```

## 11. 数値フォーマット

```typescript
function fmtN(v: number): string {
  if (Math.abs(v) >= 1e8) return (v / 1e8).toFixed(1) + "億";
  if (Math.abs(v) >= 1e4) return (v / 1e4).toFixed(1) + "万";
  return v.toLocaleString();
}

function fmtPct(v: number): string {
  return (v * 100).toFixed(1) + "%";
}

function fmtCurrency(v: number, currency = "JPY"): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(v);
}
```

## 12. DataGrid クリック可能行（renderCell バグ回避）

行全体をクリック可能にする場合、DataGridRow の render prop で空白バグを回避する:

```typescript
/* makeStyles */
clickableRow: {
  cursor: "pointer",
  ":hover": { backgroundColor: tokens.colorSubtleBackgroundHover },
},

/* JSX: 必ず1行に記述（空白テキストノードを防ぐ） */
<DataGrid items={items} columns={columns} sortable getRowId={function (item) { return item.myid as string; }}>
  <DataGridHeader>
    <DataGridRow>{({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}</DataGridRow>
  </DataGridHeader>
  <DataGridBody<ReadableTableRow<MyEntity>>>{({ item, rowId }) => (<DataGridRow<ReadableTableRow<MyEntity>> key={rowId} className={styles.clickableRow} onClick={function () { openRecordForm("entity_name", item.myid as string); }}>{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}</DataGridRow>)}</DataGridBody>
</DataGrid>
```

> 参照: [トラブルシューティング](troubleshooting.md) セクション 2.7

## 13. レコードフォーム遷移

```typescript
function openRecordForm(entityName: string, recordId: string): void {
  if (typeof Xrm !== "undefined" && Xrm.Navigation) {
    Xrm.Navigation.openForm({ entityName, entityId: recordId });
  }
}

function openNewForm(entityName: string): void {
  if (typeof Xrm !== "undefined" && Xrm.Navigation) {
    Xrm.Navigation.openForm({ entityName });
  }
}
```

## 14. モバイル対応パターン

```typescript
/* useIsMobile フック */
function useIsMobile(bp = 640): boolean {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth <= bp : false);
  useEffect(() => {
    const h = () => setM(window.innerWidth <= bp);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [bp]);
  return m;
}

/* DataGrid カラムの出し分け（splice パターン） */
var cols: TableColumnDefinition<MyRow>[] = [
  createTableColumn({ columnId: "name", /* 必ず表示 */ }),
  createTableColumn({ columnId: "status", /* 必ず表示 */ }),
];
if (!isMobile) {
  cols.splice(1, 0,
    createTableColumn({ columnId: "detail1", /* デスクトップのみ */ }),
    createTableColumn({ columnId: "detail2", /* デスクトップのみ */ }),
  );
}

/* タブ: モバイルではアイコンのみ */
<Tab value="tab1" icon={<MyIcon />}>{isMobile ? "" : "ラベル"}</Tab>

/* ボタン: モバイルではテキスト非表示 */
<Button icon={<AddRegular />}>{isMobile ? "" : t("newRecord")}</Button>
```

## 15. モーダル編集フォーム（全パターン共通 — 標準 UI — Tier 1 初回デプロイ必須）

> **★ このセクションのコードは初回デプロイ時に必ず含める。** 「段階的改善で後から追加」ではなく、最初のファイルに含める。

レコードの詳細表示・編集は **常に Fluent UI Dialog モーダル** で実装する。新しいタブやページ遷移は使わない。
Choice フィールド（ステータス・優先度等）は **ボタン式トグル** で実装する（Dropdown は使わない）。

### 15.1 モーダル状態管理

```typescript
// 選択中のレコード（null = モーダル閉じ）
const [selectedItem, setSelectedItem] =
  useState<ReadableTableRow<my_entity> | null>(null);
// 編集フィールド
const [editName, setEditName] = useState("");
const [editStatus, setEditStatus] = useState<string>("");
const [editPriority, setEditPriority] = useState<string>("");
const [editDesc, setEditDesc] = useState("");
const [saving, setSaving] = useState(false);
const [toast, setToast] = useState<string | null>(null);

function openModal(item: ReadableTableRow<my_entity>) {
  setSelectedItem(item);
  setEditName((item.my_name as string) || "");
  setEditStatus(String(item.my_status || 100000000));
  setEditPriority(String(item.my_priority || 100000001));
  setEditDesc((item.my_description as string) || "");
}
function closeModal() {
  setSelectedItem(null);
}
```

### 15.2 保存（Xrm.WebApi — dataApi には書き込みメソッドがない）

```typescript
async function handleSave() {
  if (!selectedItem) return;
  setSaving(true);
  try {
    await (window as any).Xrm.WebApi.online.updateRecord(
      "my_entity",
      selectedItem.my_entityid as string,
      {
        my_name: editName,
        my_status: parseInt(editStatus),
        my_priority: parseInt(editPriority),
        my_description: editDesc,
      },
    );
    setItems(function (prev) {
      return prev.map(function (w) {
        if (w.my_entityid === selectedItem.my_entityid) {
          return {
            ...w,
            my_name: editName,
            my_status: parseInt(editStatus),
            my_priority: parseInt(editPriority),
            my_description: editDesc,
          };
        }
        return w;
      });
    });
    setSaving(false);
    setSelectedItem(null);
    setToast("更新しました");
    setTimeout(function () {
      setToast(null);
    }, 3000);
  } catch (e) {
    console.error("save error", e);
    setSaving(false);
  }
}
```

> **⚠️ `dataApi.updateRecord` は存在しない** — 書き込みは必ず `Xrm.WebApi.online` を使用。
> **⚠️ `finally { setSaving(false) }` は使わない** — モーダル閉じと競合する。

### 15.3 ボタン式 Choice セレクター（Dropdown の代替）

Choice フィールドは Dropdown ではなく、カラー付きトグルボタンで実装する:

```typescript
<Field label="ステータス">
  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
    {[
      { value: "100000000", label: "未着手", color: tokens.colorNeutralForeground3 },
      { value: "100000001", label: "作業中", color: P.blue },
      { value: "100000002", label: "完了", color: P.teal },
      { value: "100000003", label: "保留", color: P.amber },
    ].map(function (opt) {
      var isSelected = editStatus === opt.value;
      return (
        <button key={opt.value}
          onClick={function () { setEditStatus(opt.value); }}
          style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
            border: isSelected ? "2px solid " + opt.color : "1.5px solid " + tokens.colorNeutralStroke2,
            backgroundColor: isSelected ? opt.color : "transparent",
            color: isSelected ? "#fff" : tokens.colorNeutralForeground1,
            cursor: "pointer",
            transitionProperty: "all", transitionDuration: "0.15s",
          }}>{opt.label}</button>
      );
    })}
  </div>
</Field>
```

### 15.4 Dialog JSX（モーダル本体）

```typescript
<Dialog open={selectedItem !== null}
  onOpenChange={function (_, data) { if (!data.open) closeModal(); }}>
  <DialogSurface style={{ maxWidth: 480 }}>
    <DialogBody>
      <DialogTitle action={
        <Button appearance="subtle" icon={<DismissRegular />} onClick={closeModal} />
      }>レコード編集</DialogTitle>
      <DialogContent>
        {selectedItem && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="名前"><Input value={editName} onChange={function (_, d) { setEditName(d.value); }} /></Field>
            <Field label="ステータス">{/* ボタン式セレクター (§15.3) */}</Field>
            <Field label="優先度">{/* ボタン式セレクター (§15.3) */}</Field>
            <Field label="説明"><Input value={editDesc} onChange={function (_, d) { setEditDesc(d.value); }} /></Field>
          </div>
        )}
      </DialogContent>
      <DialogActions>
        <Button appearance="subtle" icon={<OpenRegular />}
          onClick={function () { if (selectedItem) openDetailForm(selectedItem.my_entityid as string); }}>
          詳細を開く
        </Button>
        <Button appearance="primary" icon={<SaveRegular />}
          onClick={handleSave} disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </Button>
      </DialogActions>
    </DialogBody>
  </DialogSurface>
</Dialog>
```

### 15.5 トースト通知

```typescript
{toast && (
  <div style={{
    position: "fixed", top: 16, right: 16, zIndex: 9999,
    display: "flex", alignItems: "center", gap: 8,
    padding: "10px 16px", borderRadius: 8,
    backgroundColor: P.teal, color: "#fff",
    fontSize: 13, fontWeight: 500,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    animationName: "fadeInDown", animationDuration: "0.3s",
  }}>✓ {toast}</div>
)}
```

### 15.6 「詳細を開く」ボタン（同タブでフォームへ遷移）

モーダル内に「詳細を開く」ボタンを配置し、同じタブでモデル駆動型アプリのレコードフォームに遷移:

```typescript
function openDetailForm(id: string) {
  var url = (window as any).location?.origin || "";
  window.location.href =
    url + "/main.aspx?etn=my_entity&id=" + id + "&pagetype=entityrecord";
}
```

## 16. 追加 D3 チャートパターン（design-template.md 参照）

以下のチャートのコードスニペットは [design-template.md](design-template.md) の「UI パターンカタログ」に収録:

| チャート種別              | design-template.md セクション | D3 依存                        |
| ------------------------- | ----------------------------- | ------------------------------ |
| ステータスボード          | 1.1                           | なし（CSS Grid）               |
| プログレスバー            | 1.2                           | なし（CSS）                    |
| タイムライン              | 1.3                           | なし（CSS）                    |
| ファネル                  | 1.4                           | なし（CSS）                    |
| ガントチャート風          | 1.5                           | D3 scaleBand + scaleTime       |
| KPI スコアカード          | 2.1                           | なし（makeStyles）             |
| カテゴリテーブル          | 2.2                           | なし（CSS）                    |
| ゲージメーター            | 3.1                           | D3 arc                         |
| ウォーターフォール        | 3.2                           | D3 scaleBand + scaleLinear     |
| 混合チャート (棒+線)      | 3.3                           | D3 2軸                         |
| ヒートマップ              | 3.4                           | D3 scaleBand + scaleSequential |
| バブルチャート            | 3.5                           | D3 scaleSqrt                   |
| ツリーマップ              | 3.6                           | なし（CSS Flex）               |
| レーダーチャート          | 3.7                           | D3 polygon                     |
| トレンドライン (gradient) | 4.1                           | D3 area + line                 |
| ドーナツ (上部レジェンド) | 4.2                           | D3 arc                         |
| 積み上げ棒グラフ          | 4.3                           | D3 stack                       |
| スパークライン            | 4.4                           | なし（CSS）                    |

## 17. Xrm.WebApi 書き込みパターン

Generative Pages の `dataApi` は読み取り専用。書き込み操作は `Xrm.WebApi.online` を使用:

```typescript
// 更新
await (window as any).Xrm.WebApi.online.updateRecord("my_entity", recordId, {
  my_field1: newValue1,
  my_status: parseInt(statusValue),
});

// 作成
var result = await (window as any).Xrm.WebApi.online.createRecord("my_entity", {
  my_field1: value1,
  my_status: 100000000,
});
var newId = result.id;

// 削除
await (window as any).Xrm.WebApi.online.deleteRecord("my_entity", recordId);
```

> **注意**: `(window as any).Xrm` はモデル駆動型アプリのランタイムでのみ利用可能。ローカル開発環境では存在しない。

**注意**: Gallery 原本は Chart.js を使用しているが、Generative Pages では **D3.js v7 のみ使用可能**。
上記すべてのパターンは D3.js または純 CSS/HTML で実装済み。
