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
  }
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
const statusChoices = (
  await dataApi.getChoices("entity_name-field_name")
).map((c) => ({ label: c.label, value: c.value as number }));
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
  valueFn: (r: T) => number
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
  amountField: string
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
}

const BarChart: React.FC<BarChartProps> = ({ data, width = 500, height = 300 }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // 必ずクリーンアップ

    const margin = { top: 20, right: 20, bottom: 40, left: 60 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    const g = svg
      .attr("viewBox", `0 0 ${width} ${height}`)
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
      .attr("rx", 4)
      .on("mouseenter", (ev, d) => {
        if (tooltipRef.current) {
          tooltipRef.current.style.display = "block";
          tooltipRef.current.style.left = `${ev.offsetX + 10}px`;
          tooltipRef.current.style.top = `${ev.offsetY - 10}px`;
          tooltipRef.current.textContent = `${d.label}: ${d.value.toLocaleString()}`;
        }
      })
      .on("mouseleave", () => {
        if (tooltipRef.current) tooltipRef.current.style.display = "none";
      });
  }, [data, width, height]);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg ref={svgRef} style={{ width: "100%", height: "auto" }} />
      <div
        ref={tooltipRef}
        style={{
          display: "none",
          position: "absolute",
          background: tokens.colorNeutralBackground1,
          border: `1px solid ${tokens.colorNeutralStroke1}`,
          borderRadius: tokens.borderRadiusMedium,
          padding: "4px 8px",
          fontSize: "12px",
          pointerEvents: "none",
          zIndex: 10,
        }}
      />
    </div>
  );
};
```

### 4.2 ドーナツチャート（Donut Chart）

```typescript
interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
}

const DonutChart: React.FC<DonutChartProps> = ({ data, size = 200 }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const radius = size / 2;
    const g = svg
      .attr("viewBox", `0 0 ${size} ${size}`)
      .append("g")
      .attr("transform", `translate(${radius},${radius})`);

    const pie = d3.pie<{ label: string; value: number; color: string }>()
      .value((d) => d.value)
      .sort(null);

    const arc = d3.arc<d3.PieArcDatum<any>>()
      .innerRadius(radius * 0.55)
      .outerRadius(radius * 0.9);

    g.selectAll("path")
      .data(pie(data))
      .enter()
      .append("path")
      .attr("d", arc as any)
      .attr("fill", (d) => d.data.color);

    // 中央テキスト
    const total = data.reduce((s, d) => s + d.value, 0);
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "-0.2em")
      .style("font-size", "18px")
      .style("font-weight", "bold")
      .text(total.toLocaleString());
  }, [data, size]);

  return <svg ref={svgRef} style={{ width: "100%", maxWidth: size, height: "auto" }} />;
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
  [lang.code]
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
