/* ============================================================
 * Object 360 View — 汎用オブジェクト 360 ビュー
 *
 * 任意の Dataverse エンティティに対応した「360 度ビュー」テンプレート。
 * SUBJECT_CONFIG と COLUMN_CONFIGS を変更するだけで
 * 任意のシナリオに適用できます。
 *
 * 【カスタマイズ手順】
 *   1. SUBJECT_CONFIG を主体エンティティ（中心レコード）に合わせる
 *   2. COLUMN_CONFIGS で 2〜4 列のフロー列を定義する
 *   3. 360view-RuntimeTypes.ts に使用エンティティの型を登録する
 *
 * 【適用シナリオ例】
 *   営業管理  : 取引先 → 商談 → 見積 → 受注  ← このサンプル
 *   案件管理  : 顧客 → プロジェクト → タスク
 *   採用管理  : 求人 → 応募 → 面接 → オファー
 *   設備管理  : 設備 → 点検記録 → 修繕依頼（カスタムエンティティ）
 * ============================================================ */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { ReadableTableRow, GeneratedComponentProps } from "./360view-RuntimeTypes";
import {
  makeStyles, Text, Button, Spinner, Badge,
  TabList, Tab, Dropdown, Option,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions,
} from "@fluentui/react-components";
import {
  BuildingRegular, DocumentRegular,
  ChevronRightRegular, ChevronDownRegular,
  WarningRegular, InfoRegular, OpenRegular,
  GridRegular,
} from "@fluentui/react-icons";
import * as d3 from "d3";

/* ========== カラーパレット ========== */
var P = {
  blue: "#2563eb", blueLight: "#dbeafe",
  teal: "#0d9488", tealLight: "#ccfbf1",
  amber: "#d97706", amberLight: "#fef3c7",
  red: "#dc2626", coralLight: "#fee2e2",
  green: "#16a34a", greenLight: "#dcfce7",
  violet: "#7c3aed", violetLight: "#ede9fe",
  gray50: "#f9fafb", gray100: "#f3f4f6", gray200: "#e5e7eb",
  gray300: "#d1d5db", gray400: "#9ca3af", gray500: "#6b7280",
  gray600: "#4b5563", gray700: "#374151", gray800: "#1f2937",
  gray900: "#111827", white: "#ffffff",
};

/* ============================================================
 * CONFIG INTERFACES — 設定インターフェース（変更不要）
 * ============================================================ */

/** フロー列の設定 */
interface ColumnConfig {
  /** ユニークキー（タブ識別子） */
  key: string;
  /** 列ヘッダー表示名 */
  label: string;
  /** ノードアイコン（絵文字） */
  icon: string;
  /** アクセントカラー */
  color: string;
  /** Dataverse テーブル論理名（例: "opportunity"） */
  entityName: string;
  /** 主キーフィールド名（例: "opportunityid"） */
  idField: string;
  /** ノードタイトルに表示するフィールド */
  displayField: string;
  /** サブテキストフィールド（省略可） */
  subTextField?: string;
  /** 日付フィールド（省略可） */
  dateField?: string;
  /** ステータスフィールド（省略可） */
  statusField?: string;
  /** ステータス値 → {ラベル, カラー} のマッピング */
  statusMap?: Record<string, { label: string; color: string }>;
  /** API で取得するフィールド一覧 */
  select: string[];
  /** 主体 ID を受け取り OData フィルター文字列を返す関数 */
  getFilter: (subjectId: string) => string;
  /**
   * 前列エンティティへの参照フィールド（エッジ描画用）
   * 例: quote の場合 "_opportunityid_value"
   * 省略時はこの列への入力エッジなし
   */
  prevColLookupField?: string;
}

/** 主体エンティティの設定 */
interface SubjectConfig {
  /** Dataverse テーブル論理名（例: "account"） */
  entityName: string;
  /** 主キーフィールド名（例: "accountid"） */
  idField: string;
  /** セレクタ・ヘッダーに表示するフィールド */
  displayField: string;
  /** API で取得するフィールド一覧 */
  select: string[];
  /** 並び順（OData orderBy 書式） */
  orderBy: string;
  /** ヘッダーエリアに表示するサブフィールド */
  headerFields: { field: string; label: string }[];
  /** 詳細モーダルに表示するフィールド */
  modalFields: { field: string; label: string }[];
  /** ヘッダーアイコン（Fluent UI アイコンコンポーネント） */
  icon: React.ComponentType<any>;
  /** テーマカラー */
  themeColor: string;
}

/* ============================================================
 * ★ CONFIGURATION — ここを変更してシナリオをカスタマイズ
 * ============================================================
 *
 * このサンプルは「営業管理」シナリオ:
 *   取引先 (account) → 商談 (opportunity) → 見積 (quote) → 受注 (salesorder)
 *
 * 他シナリオへの適用例:
 *   案件管理  : entityName: "cr123_project",  idField: "cr123_projectid"
 *   採用管理  : entityName: "cr123_jobposting", idField: "cr123_jobpostingid"
 *   設備管理  : entityName: "cr123_equipment",  idField: "cr123_equipmentid"
 *
 * ============================================================ */

/** 主体エンティティ設定 */
var SUBJECT_CONFIG: SubjectConfig = {
  entityName: "account",
  idField: "accountid",
  displayField: "name",
  select: ["accountid", "name", "telephone1", "emailaddress1", "address1_city", "revenue", "numberofemployees"],
  orderBy: "name asc",
  icon: BuildingRegular,
  themeColor: P.blue,
  headerFields: [
    { field: "telephone1", label: "電話番号" },
    { field: "address1_city", label: "市区町村" },
  ],
  modalFields: [
    { field: "telephone1", label: "電話番号" },
    { field: "emailaddress1", label: "メールアドレス" },
    { field: "address1_city", label: "市区町村" },
    { field: "revenue", label: "年間売上" },
    { field: "numberofemployees", label: "従業員数" },
  ],
};

/** フロー列設定（2〜4 列に変更可能） */
var COLUMN_CONFIGS: ColumnConfig[] = [
  /* ---- 列 1: 商談 ---- */
  {
    key: "col1",
    label: "商談",
    icon: "💼",
    color: P.violet,
    entityName: "opportunity",
    idField: "opportunityid",
    displayField: "name",
    dateField: "estimatedclosedate",
    statusField: "statecode",
    statusMap: {
      "0": { label: "進行中", color: P.violet },
      "1": { label: "受注", color: P.green },
      "2": { label: "失注", color: P.red },
    },
    select: ["opportunityid", "name", "estimatedclosedate", "statecode", "estimatedvalue", "_parentaccountid_value"],
    getFilter: function (sid) { return "_parentaccountid_value eq '" + sid + "'"; },
  },
  /* ---- 列 2: 見積 ---- */
  {
    key: "col2",
    label: "見積",
    icon: "📄",
    color: P.teal,
    entityName: "quote",
    idField: "quoteid",
    displayField: "name",
    dateField: "closedon",
    statusField: "statecode",
    statusMap: {
      "0": { label: "草稿", color: P.gray500 },
      "1": { label: "アクティブ", color: P.teal },
      "2": { label: "受注", color: P.green },
      "3": { label: "クローズ", color: P.red },
    },
    select: ["quoteid", "name", "closedon", "statecode", "_customerid_value", "_opportunityid_value"],
    getFilter: function (sid) { return "_customerid_value eq '" + sid + "'"; },
    prevColLookupField: "_opportunityid_value",
  },
  /* ---- 列 3: 受注 ---- */
  {
    key: "col3",
    label: "受注",
    icon: "✅",
    color: P.blue,
    entityName: "salesorder",
    idField: "salesorderid",
    displayField: "name",
    dateField: "fulfilldate",
    statusField: "statecode",
    statusMap: {
      "0": { label: "アクティブ", color: P.blue },
      "1": { label: "送信済", color: P.teal },
      "3": { label: "キャンセル", color: P.red },
      "4": { label: "完了", color: P.green },
    },
    select: ["salesorderid", "name", "fulfilldate", "statecode", "_customerid_value", "_quoteid_value"],
    getFilter: function (sid) { return "_customerid_value eq '" + sid + "'"; },
    prevColLookupField: "_quoteid_value",
  },
];

/* ============================================================
 * ユーティリティ
 * ============================================================ */

/** 全ページのレコードを取得する汎用ヘルパー */
async function loadAllRows<T>(
  api: GeneratedComponentProps["dataApi"],
  table: string,
  options: { select: string[]; filter?: string; orderBy?: string; pageSize?: number },
): Promise<ReadableTableRow<T>[]> {
  var res = await api.queryTable(table as any, {
    select: options.select as any,
    filter: options.filter,
    orderBy: options.orderBy,
    pageSize: options.pageSize || 250,
  });
  var rows = [].concat(res.rows as any) as any[];
  while (res.hasMoreRows && res.loadMoreRows) {
    res = await res.loadMoreRows();
    rows = rows.concat(res.rows);
  }
  return rows as any;
}

/** FK 参照フィールドから GUID を抽出する */
function fkId(fk: any): string {
  if (!fk) return "";
  var s = String(fk);
  var m = s.match(/\(([^)]+)\)/);
  return m ? m[1] : s;
}

function fmtDate(d: any): string {
  if (!d) return "—";
  try {
    var dt = new Date(d);
    if (isNaN(dt.getTime())) return "—";
    return dt.getFullYear() + "/" +
      String(dt.getMonth() + 1).padStart(2, "0") + "/" +
      String(dt.getDate()).padStart(2, "0");
  } catch (e) { return "—"; }
}

function fmtDateTime(d: any): string {
  if (!d) return "—";
  try {
    var dt = new Date(d);
    if (isNaN(dt.getTime())) return "—";
    return fmtDate(d) + " " +
      String(dt.getHours()).padStart(2, "0") + ":" +
      String(dt.getMinutes()).padStart(2, "0");
  } catch (e) { return "—"; }
}

/** MDA フォーム URL を生成（GenPage は MDA iframe 内で動作） */
function mdaFormUrl(etn: string, id: string): string {
  var encodedEtn = encodeURIComponent(etn);
  var encodedId = encodeURIComponent(id);
  try {
    var base = window.top?.location?.origin || window.location.origin;
    return base + "/main.aspx?pagetype=entityrecord&etn=" + encodedEtn + "&id=" + encodedId;
  } catch (e) {
    return "/main.aspx?pagetype=entityrecord&etn=" + encodedEtn + "&id=" + encodedId;
  }
}

function daysAgo(d: any): string {
  if (!d) return "";
  try {
    var dt = new Date(d);
    var diff = Math.floor((Date.now() - dt.getTime()) / 86400000);
    if (diff === 0) return "今日";
    if (diff === 1) return "昨日";
    if (diff < 0) return Math.abs(diff) + "日後";
    return diff + "日前";
  } catch (e) { return ""; }
}

/** キーボードクリックハンドラ（div をボタンとして扱う場合） */
function handleKeyboardClick(e: any, cb: () => void) {
  if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
    e.preventDefault();
    cb();
  }
}

/** ColumnConfig とテーブル行からステータス情報を取得 */
function getStatusInfo(config: ColumnConfig, row: any): { label: string; color: string } {
  if (!config.statusField) return { label: "", color: config.color };
  var val = String(row[config.statusField] ?? "");
  if (config.statusMap && config.statusMap[val]) return config.statusMap[val];
  return { label: val, color: P.gray500 };
}

/* ============================================================
 * スタイル
 * ============================================================ */
var useStyles = makeStyles({
  root: {
    display: "flex", flexDirection: "column", height: "100%",
    boxSizing: "border-box", overflow: "auto", backgroundColor: P.gray50,
  },
  selectorBar: {
    display: "flex", alignItems: "center", gap: "12px",
    padding: "12px 24px", backgroundColor: P.white,
    borderBottom: "1px solid " + P.gray200,
  },
  header: {
    display: "flex", alignItems: "center", gap: "16px",
    padding: "16px 24px 12px", backgroundColor: P.white,
    borderBottom: "1px solid " + P.gray200,
  },
  headerInfo: { display: "flex", flexDirection: "column" as any, gap: "4px", flex: 1, minWidth: 0 },
  kpiRow: { display: "flex", gap: "12px", padding: "16px 24px", flexWrap: "wrap" as any },
  kpiCard: {
    flex: "1 1 140px", minWidth: "140px", padding: "14px 16px",
    borderRadius: "10px", backgroundColor: P.white,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    display: "flex", flexDirection: "column" as any, gap: "4px",
  },
  tabBar: { padding: "0 24px", backgroundColor: P.white, borderBottom: "1px solid " + P.gray200 },
  tabContent: { flex: 1, overflow: "auto", padding: "16px 24px" },
  flowContainer: {
    backgroundColor: P.white, borderRadius: "10px", padding: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    overflow: "auto", position: "relative" as any,
  },
  flowLegend: { display: "flex", gap: "20px", padding: "8px 0 12px", flexWrap: "wrap" as any },
  legendItem: { display: "flex", alignItems: "center", gap: "6px" },
  itemRow: {
    display: "flex", alignItems: "flex-start", gap: "10px",
    padding: "12px 14px", borderRadius: "8px", backgroundColor: P.white,
    marginBottom: "8px", boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },
  chartContainer: {
    backgroundColor: P.white, borderRadius: "10px", padding: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: "12px",
  },
  tooltip: {
    position: "absolute" as any, backgroundColor: P.gray800, color: P.white,
    padding: "8px 12px", borderRadius: "6px", fontSize: "12px", lineHeight: "1.4",
    pointerEvents: "none" as any, zIndex: 100, maxWidth: "260px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
  },
});

/* ============================================================
 * FlowDiagram — 汎用フローダイアグラム（D3/SVG）
 * ============================================================ */
type SelectedItem = { columnKey: string; rowId: string } | null;

function FlowDiagram(props: {
  columnData: { config: ColumnConfig; rows: any[] }[];
  onItemClick: (columnKey: string, rowId: string) => void;
  selectedItem: SelectedItem;
}) {
  var svgRef = useRef<SVGSVGElement>(null);
  var containerRef = useRef<HTMLDivElement>(null);
  var tooltipRef = useRef<HTMLDivElement>(null);
  var { columnData, onItemClick, selectedItem } = props;

  useEffect(function () {
    if (!svgRef.current) return;
    var raf = requestAnimationFrame(function () {
      if (!svgRef.current) return;
      var svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();

      var totalRows = columnData.reduce(function (s, c) { return s + c.rows.length; }, 0);
      if (totalRows === 0) {
        svg.attr("width", 600).attr("height", 100);
        svg.append("text").attr("x", 300).attr("y", 50)
          .attr("text-anchor", "middle").attr("fill", P.gray400)
          .attr("font-size", "14px").text("データがありません");
        return;
      }

      /* === レイアウト定数 === */
      var nodeW = 260, nodeH = 82, colGap = 80, rowGap = 20;
      var padL = 30, padT = 60, handleR = 5, textMaxW = 128;
      var numCols = columnData.length;
      var colXs = columnData.map(function (_, i) { return padL + i * (nodeW + colGap); });
      var maxRows = columnData.reduce(function (m, c) { return Math.max(m, c.rows.length); }, 1);
      var totalH = padT + maxRows * (nodeH + rowGap) + 40;
      var totalW = colXs[numCols - 1] + nodeW + padL;
      var W = Math.max(totalW, containerRef.current ? containerRef.current.clientWidth - 32 : 800);
      svg.attr("width", W).attr("height", totalH);

      /* === defs === */
      var defs = svg.append("defs");

      /* ドロップシャドウ */
      var flt = defs.append("filter").attr("id", "nodeShadow")
        .attr("x", "-10%").attr("y", "-10%").attr("width", "130%").attr("height", "140%");
      flt.append("feDropShadow").attr("dx", 0).attr("dy", 2).attr("stdDeviation", 4)
        .attr("flood-color", "rgba(0,0,0,0.08)");
      var fltSel = defs.append("filter").attr("id", "nodeShadowSel")
        .attr("x", "-15%").attr("y", "-15%").attr("width", "140%").attr("height", "150%");
      fltSel.append("feDropShadow").attr("dx", 0).attr("dy", 3).attr("stdDeviation", 8)
        .attr("flood-color", "rgba(0,0,0,0.15)");

      /* 矢印マーカー */
      defs.append("marker").attr("id", "arrowGray")
        .attr("viewBox", "0 0 10 10").attr("refX", 8).attr("refY", 5)
        .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
        .append("path").attr("d", "M 0 0 L 10 5 L 0 10 z").attr("fill", P.gray400);

      /* 背景ドットグリッド（<pattern> で要素数を一定に保つ） */
      var bgDot = defs.append("pattern").attr("id", "bgDotGrid")
        .attr("patternUnits", "userSpaceOnUse").attr("width", 24).attr("height", 24);
      bgDot.append("circle").attr("cx", 20).attr("cy", 20).attr("r", 1).attr("fill", P.gray200);
      svg.append("rect").attr("width", W).attr("height", totalH).attr("fill", "#fafbfc");
      svg.append("rect").attr("width", W).attr("height", totalH).attr("fill", "url(#bgDotGrid)");

      /* === 列ヘッダー === */
      columnData.forEach(function (col, i) {
        svg.append("text")
          .attr("x", colXs[i] + nodeW / 2).attr("y", 28)
          .attr("text-anchor", "middle").attr("font-size", "13px")
          .attr("font-weight", "700").attr("fill", col.config.color)
          .text(col.config.icon + " " + col.config.label);
        svg.append("line")
          .attr("x1", colXs[i]).attr("x2", colXs[i] + nodeW)
          .attr("y1", 38).attr("y2", 38)
          .attr("stroke", col.config.color).attr("stroke-width", 2).attr("opacity", 0.3);
      });

      /* === ノードデータ構築 === */
      type FNode = {
        id: string; columnKey: string; rowId: string;
        x: number; y: number; title: string; sub: string; date: string;
        icon: string; statusLabel: string; statusColor: string; borderColor: string;
        config: ColumnConfig; raw: any;
      };
      type FEdge = { from: string; to: string };

      var nodes: FNode[] = [];
      var edges: FEdge[] = [];

      /* idToNodeId: rawId → nodeId（エッジ構築に使用） */
      var idToNodeId = new Map<string, string>();
      columnData.forEach(function (col, colIdx) {
        col.rows.forEach(function (row, rowIdx) {
          var rawId = String(row[col.config.idField] || "");
          var nodeId = col.config.key + "-" + rawId;
          var si = getStatusInfo(col.config, row);
          idToNodeId.set(rawId, nodeId);
          nodes.push({
            id: nodeId, columnKey: col.config.key, rowId: rawId,
            x: colXs[colIdx], y: padT + rowIdx * (nodeH + rowGap),
            title: String(row[col.config.displayField] || "").substring(0, 22),
            sub: col.config.subTextField ? String(row[col.config.subTextField] || "").substring(0, 30) : "",
            date: col.config.dateField ? fmtDate(row[col.config.dateField]) : "",
            icon: col.config.icon,
            statusLabel: si.label, statusColor: si.color, borderColor: si.color,
            config: col.config, raw: row,
          });
        });
      });

      /* エッジ構築（prevColLookupField で前列ノードと結ぶ） */
      columnData.forEach(function (col) {
        if (!col.config.prevColLookupField) return;
        col.rows.forEach(function (row) {
          var prevId = fkId(row[col.config.prevColLookupField!]);
          var fromNodeId = idToNodeId.get(prevId);
          var toNodeId = col.config.key + "-" + String(row[col.config.idField] || "");
          if (fromNodeId && nodes.some(function (n) { return n.id === toNodeId; })) {
            edges.push({ from: fromNodeId, to: toNodeId });
          }
        });
      });

      /* === エッジ描画 === */
      var nodePos = new Map<string, { x: number; y: number }>();
      nodes.forEach(function (n) { nodePos.set(n.id, { x: n.x, y: n.y }); });
      var edgeGroup = svg.append("g").attr("class", "edges");
      edges.forEach(function (edge, idx) {
        var fromN = nodePos.get(edge.from);
        var toN = nodePos.get(edge.to);
        if (!fromN || !toN) return;
        var x1 = fromN.x + nodeW, y1 = fromN.y + nodeH / 2;
        var x2 = toN.x, y2 = toN.y + nodeH / 2;
        var cpx = (x1 + x2) / 2;
        var pathD = "M " + x1 + " " + y1 + " C " + cpx + " " + y1 + " " + cpx + " " + y2 + " " + x2 + " " + y2;
        var pathEl = edgeGroup.append("path")
          .attr("d", pathD).attr("fill", "none").attr("stroke", P.gray400)
          .attr("stroke-width", 2).attr("marker-end", "url(#arrowGray)").attr("opacity", 0);

        /* 出口ハンドル */
        edgeGroup.append("circle").attr("cx", x1).attr("cy", y1).attr("r", 0)
          .attr("fill", P.white).attr("stroke", P.gray400).attr("stroke-width", 1.5)
          .transition().duration(300).delay(idx * 80 + 600).attr("r", handleR);

        /* 入口ハンドル */
        edgeGroup.append("circle").attr("cx", x2).attr("cy", y2).attr("r", 0)
          .attr("fill", P.gray400).attr("stroke", P.white).attr("stroke-width", 1.5)
          .transition().duration(300).delay(idx * 80 + 800).attr("r", handleR);

        /* パスアニメーション */
        var totalLen = 1000;
        try { var pNode = pathEl.node() as any; if (pNode && pNode.getTotalLength) totalLen = pNode.getTotalLength(); } catch (_) { /* ignore */ }
        pathEl
          .attr("stroke-dasharray", totalLen + " " + totalLen)
          .attr("stroke-dashoffset", totalLen)
          .transition().duration(800).delay(idx * 80 + 500).ease(d3.easeCubicOut)
          .attr("stroke-dashoffset", 0).attr("opacity", 0.6)
          .on("end", function () {
            d3.select(this as any).attr("stroke-dasharray", "6,4").attr("stroke-dashoffset", 0);
          });
      });

      /* === ノード描画 === */
      var nodeGroup = svg.append("g").attr("class", "nodes");
      nodes.forEach(function (node, idx) {
        var isSel = !!(selectedItem &&
          selectedItem.columnKey === node.columnKey &&
          selectedItem.rowId === node.rowId);
        var g = nodeGroup.append("g")
          .attr("transform", "translate(" + node.x + "," + node.y + ")")
          .attr("cursor", "pointer").attr("opacity", 0);

        /* ノード背景 */
        g.append("rect")
          .attr("width", nodeW).attr("height", nodeH).attr("rx", 12).attr("ry", 12)
          .attr("fill", P.white)
          .attr("stroke", isSel ? node.borderColor : P.gray200)
          .attr("stroke-width", isSel ? 2.5 : 1)
          .attr("filter", isSel ? "url(#nodeShadowSel)" : "url(#nodeShadow)");

        /* 左カラーバー */
        g.append("rect").attr("x", 0).attr("y", 0).attr("width", 5).attr("height", nodeH)
          .attr("rx", "2.5").attr("fill", node.borderColor);

        /* アイコン */
        g.append("circle").attr("cx", 26).attr("cy", nodeH / 2).attr("r", 16)
          .attr("fill", node.borderColor).attr("opacity", 0.1);
        g.append("text").attr("x", 26).attr("y", nodeH / 2 + 5)
          .attr("text-anchor", "middle").attr("font-size", "14px").text(node.icon);

        /* テキストクリップ（はみ出し防止） */
        var clipId = "clip-" + node.id.replace(/[^a-zA-Z0-9]/g, "");
        defs.append("clipPath").attr("id", clipId)
          .append("rect").attr("x", 50).attr("y", 0).attr("width", textMaxW).attr("height", nodeH);

        /* ステータスバッジ */
        if (node.statusLabel) {
          var badgeW = node.statusLabel.length * 8 + 12;
          var badgeX = nodeW - badgeW - 8;
          g.append("rect").attr("x", badgeX).attr("y", 8)
            .attr("width", badgeW).attr("height", 18).attr("rx", 9)
            .attr("fill", node.statusColor).attr("opacity", 0.15);
          g.append("text").attr("x", badgeX + badgeW / 2).attr("y", 21)
            .attr("text-anchor", "middle").attr("font-size", "9px")
            .attr("font-weight", "600").attr("fill", node.statusColor)
            .text(node.statusLabel);
        }

        /* タイトル */
        g.append("text").attr("x", 50).attr("y", 24)
          .attr("font-size", "12px").attr("font-weight", "600").attr("fill", P.gray900)
          .attr("clip-path", "url(#" + clipId + ")").text(node.title);

        /* サブテキスト */
        if (node.sub) {
          g.append("text").attr("x", 50).attr("y", 42)
            .attr("font-size", "10px").attr("fill", P.gray500)
            .attr("clip-path", "url(#" + clipId + ")").text(node.sub);
        }

        /* 日付 */
        if (node.date) {
          g.append("text").attr("x", 50).attr("y", node.sub ? 60 : 42)
            .attr("font-size", "9px").attr("fill", P.gray400)
            .attr("clip-path", "url(#" + clipId + ")").text(node.date);
        }

        /* クリック */
        g.on("click", function () { onItemClick(node.columnKey, node.rowId); });

        /* ホバー */
        g.on("mouseover", function (event: any) {
          d3.select(this as any).select("rect")
            .transition().duration(150)
            .attr("stroke", node.borderColor).attr("stroke-width", 2)
            .attr("filter", "url(#nodeShadowSel)");
          if (!tooltipRef.current || !containerRef.current) return;
          var rect = containerRef.current.getBoundingClientRect();
          tooltipRef.current.style.display = "block";
          tooltipRef.current.style.left = (event.clientX - rect.left + containerRef.current.scrollLeft + 12) + "px";
          tooltipRef.current.style.top = (event.clientY - rect.top + containerRef.current.scrollTop - 12) + "px";
          /* XSS 対策: innerHTML を使わず textContent で設定 */
          tooltipRef.current.innerHTML = "";
          function appendTipBlock(text: string, style?: string) {
            if (!tooltipRef.current) return;
            var div = document.createElement("div");
            if (style) div.style.cssText = style;
            div.textContent = text;
            tooltipRef.current!.appendChild(div);
          }
          appendTipBlock(node.title, "font-weight:600");
          if (node.statusLabel) appendTipBlock(node.statusLabel, "margin-top:2px;opacity:.8");
          if (node.date) appendTipBlock(node.date, "opacity:.7;margin-top:4px");
        });

        g.on("mouseout", function () {
          d3.select(this as any).select("rect")
            .transition().duration(150)
            .attr("stroke", isSel ? node.borderColor : P.gray200)
            .attr("stroke-width", isSel ? 2.5 : 1)
            .attr("filter", isSel ? "url(#nodeShadowSel)" : "url(#nodeShadow)");
          if (tooltipRef.current) tooltipRef.current.style.display = "none";
        });

        /* フェードインアニメーション */
        g.transition().duration(400).delay(idx * 60 + 200).attr("opacity", 1);
      });
    });
    return function () { cancelAnimationFrame(raf); };
  }, [columnData, selectedItem, onItemClick]);

  var styles = useStyles();
  return React.createElement("div", { ref: containerRef, className: styles.flowContainer, style: { overflow: "auto" } },
    /* 凡例 */
    React.createElement("div", { className: styles.flowLegend },
      COLUMN_CONFIGS.map(function (col) {
        return React.createElement("div", { key: col.key, className: styles.legendItem },
          React.createElement("div", { style: { width: 14, height: 14, borderRadius: 4, backgroundColor: col.color } }),
          React.createElement(Text, { size: 200 }, col.label),
        );
      }),
      React.createElement("div", { className: styles.legendItem },
        React.createElement("div", { style: { width: 24, height: 0, borderTop: "2px dashed " + P.gray400 } }),
        React.createElement(Text, { size: 200 }, "関連"),
      ),
    ),
    React.createElement("svg", { ref: svgRef }),
    React.createElement("div", { ref: tooltipRef, className: styles.tooltip, style: { display: "none" } }),
  );
}

/* ============================================================
 * DetailSidebar — 汎用詳細サイドバー
 * ============================================================ */
function DetailSidebar(props: {
  item: { columnKey: string; rowId: string };
  columnData: { config: ColumnConfig; rows: any[] }[];
  onClose: () => void;
}) {
  var { item, columnData, onClose } = props;
  var colIdx = columnData.findIndex(function (c) { return c.config.key === item.columnKey; });
  var col = colIdx >= 0 ? columnData[colIdx] : null;
  var row = col ? col.rows.find(function (r) { return String(r[col!.config.idField]) === item.rowId; }) : null;

  /* 前後列の関連アイテムを収集 */
  var prevRelated: { config: ColumnConfig; row: any }[] = [];
  var nextRelated: { config: ColumnConfig; row: any }[] = [];
  if (row && col) {
    var nextCol = colIdx < columnData.length - 1 ? columnData[colIdx + 1] : null;
    if (nextCol && nextCol.config.prevColLookupField) {
      nextCol.rows.forEach(function (nr) {
        if (fkId(nr[nextCol!.config.prevColLookupField!]) === item.rowId) {
          nextRelated.push({ config: nextCol!.config, row: nr });
        }
      });
    }
    var prevCol = colIdx > 0 ? columnData[colIdx - 1] : null;
    if (prevCol && col.config.prevColLookupField) {
      var prevId = fkId(row[col.config.prevColLookupField]);
      var prevRow = prevId ? prevCol.rows.find(function (pr) { return String(pr[prevCol!.config.idField]) === prevId; }) : null;
      if (prevRow) prevRelated.push({ config: prevCol.config, row: prevRow });
    }
  }

  /* 関連アイテム行 */
  function relatedItemEl(cfg: ColumnConfig, r: any, key: string) {
    var rowId = String(r[cfg.idField] || "");
    var url = mdaFormUrl(cfg.entityName, rowId);
    var si = getStatusInfo(cfg, r);
    var title = String(r[cfg.displayField] || "").substring(0, 60);
    var date = cfg.dateField ? fmtDate(r[cfg.dateField]) : "";
    return React.createElement("div", {
      key: key,
      style: { display: "flex", gap: "8px", padding: "6px 8px", borderRadius: "6px", backgroundColor: P.gray50, marginBottom: 4, cursor: "pointer", transition: "background .15s" },
      role: "button", tabIndex: 0,
      "aria-label": cfg.label + "を開く: " + (title || "詳細"),
      onClick: function () { window.open(url, "_top"); },
      onKeyDown: function (e: any) { handleKeyboardClick(e, function () { window.open(url, "_top"); }); },
      onMouseOver: function (e: any) { e.currentTarget.style.backgroundColor = P.gray100; },
      onMouseOut: function (e: any) { e.currentTarget.style.backgroundColor = P.gray50; },
    },
      React.createElement("div", { style: { width: 10, height: 10, borderRadius: 3, backgroundColor: si.color, marginTop: 3, flexShrink: 0 } }),
      React.createElement("div", { style: { minWidth: 0, flex: 1 } },
        React.createElement(Text, { size: 200, style: { display: "block", color: P.gray700 } }, title),
        (date || si.label) ? React.createElement(Text, { size: 100, style: { color: P.gray400 } }, [date, si.label].filter(Boolean).join(" — ")) : null,
      ),
      React.createElement(OpenRegular, { style: { fontSize: 12, color: P.gray400, flexShrink: 0, marginTop: 2 } }),
    );
  }

  if (!row || !col) {
    return React.createElement("div", {
      style: { width: "300px", padding: "16px", borderLeft: "1px solid " + P.gray200, backgroundColor: P.white },
    },
      React.createElement(Text, { size: 200, style: { color: P.gray400 } }, "データが見つかりません"),
    );
  }

  var si = getStatusInfo(col.config, row);
  var rowId = String(row[col.config.idField] || "");
  var title = String(row[col.config.displayField] || "");
  var date = col.config.dateField ? fmtDate(row[col.config.dateField]) : "";

  return React.createElement("div", {
    style: { width: "300px", borderLeft: "1px solid " + P.gray200, backgroundColor: P.white, padding: "16px", overflow: "auto", maxHeight: "600px", borderRadius: "0 10px 10px 0", flexShrink: 0 },
  },
    /* ヘッダー */
    React.createElement("div", {
      style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", paddingBottom: "8px", borderBottom: "1px solid " + P.gray200 },
    },
      React.createElement(Text, { size: 300, weight: "semibold", style: { color: P.gray800 } }, "詳細情報"),
      React.createElement(Button, { size: "small", appearance: "subtle", onClick: onClose }, "✕"),
    ),
    /* メインコンテンツ */
    React.createElement("div", null,
      React.createElement("div", { style: { display: "inline-flex", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, color: col.config.color, backgroundColor: col.config.color + "1a", marginBottom: 6 } },
        col.config.icon + " " + col.config.label),
      React.createElement(Text, { size: 300, weight: "bold", style: { display: "block", color: P.gray900, marginBottom: 4 } }, title),
      si.label ? React.createElement(Badge, { appearance: "filled", size: "small", style: { backgroundColor: si.color, marginBottom: 4 } }, si.label) : null,
      date ? React.createElement(Text, { size: 200, style: { display: "block", color: P.gray600, marginTop: 4 } }, "日付: " + date) : null,
      React.createElement(Button, {
        size: "small", appearance: "subtle",
        icon: React.createElement(OpenRegular, null),
        style: { marginTop: 8, color: P.blue, gap: 4 },
        onClick: function () { window.open(mdaFormUrl(col!.config.entityName, rowId), "_top"); },
      }, "フォームを開く"),
    ),
    /* 関連アイテム */
    (prevRelated.length > 0 || nextRelated.length > 0) ? React.createElement("div", {
      style: { marginTop: 16, paddingTop: 12, borderTop: "1px solid " + P.gray200 },
    },
      React.createElement(Text, { size: 200, weight: "semibold", style: { display: "block", marginBottom: 8, color: P.gray800 } }, "関連アイテム"),
      prevRelated.map(function (r, i) {
        return React.createElement("div", { key: "prev" + i },
          React.createElement(Text, { size: 200, weight: "semibold", style: { color: r.config.color, display: "block", marginBottom: 4 } }, "← " + r.config.label),
          relatedItemEl(r.config, r.row, "pr" + i),
        );
      }),
      nextRelated.map(function (r, i) {
        return React.createElement("div", { key: "next" + i, style: { marginTop: prevRelated.length > 0 ? 8 : 0 } },
          React.createElement(Text, { size: 200, weight: "semibold", style: { color: r.config.color, display: "block", marginBottom: 4 } }, "→ " + r.config.label),
          relatedItemEl(r.config, r.row, "nr" + i),
        );
      }),
    ) : null,
  );
}

/* ============================================================
 * ColumnItemList — 汎用リストビュー（タブコンテンツ）
 * ============================================================ */
function ColumnItemList(props: { config: ColumnConfig; rows: any[] }) {
  var { config, rows } = props;
  var styles = useStyles();

  if (rows.length === 0) {
    return React.createElement(Text, { size: 300, style: { color: P.gray400 } }, config.label + "がありません");
  }
  return React.createElement("div", null,
    rows.map(function (row, i) {
      var rowId = String(row[config.idField] || "");
      var title = String(row[config.displayField] || "");
      var date = config.dateField ? row[config.dateField] : null;
      var si = getStatusInfo(config, row);
      return React.createElement("div", { key: rowId || i, className: styles.itemRow, style: { borderLeft: "3px solid " + si.color } },
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
          React.createElement("div", { style: { display: "flex", gap: "8px", alignItems: "center" } },
            React.createElement(Text, { size: 200, weight: "semibold", style: { color: P.gray800 } }, title),
            si.label ? React.createElement(Badge, { appearance: "filled", size: "small", style: { backgroundColor: si.color } }, si.label) : null,
          ),
          date ? React.createElement(Text, { size: 100, style: { color: P.gray400, display: "block", marginTop: 2 } },
            fmtDate(date) + " (" + daysAgo(date) + ")"
          ) : null,
        ),
        React.createElement(Button, {
          size: "small", appearance: "subtle",
          icon: React.createElement(OpenRegular, null),
          "aria-label": config.label + "フォームを開く",
          onClick: function () { window.open(mdaFormUrl(config.entityName, rowId), "_top"); },
        }),
      );
    })
  );
}

/* ============================================================
 * MonthlyBarChart — 月別件数グラフ（汎用）
 * ============================================================ */
function MonthlyBarChart(props: { rows: any[]; dateField: string; color?: string }) {
  var svgRef = useRef<SVGSVGElement>(null);
  var { rows, dateField, color } = props;
  var barColor = color || P.blue;

  useEffect(function () {
    if (!svgRef.current || rows.length === 0) return;
    var raf = requestAnimationFrame(function () {
      if (!svgRef.current) return;
      var svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();
      var W = 400, H = 200;
      svg.attr("width", W).attr("height", H);

      var byMonth: Record<string, number> = {};
      rows.forEach(function (r) {
        var d = r[dateField] ? new Date(r[dateField]) : null;
        if (d && !isNaN(d.getTime())) {
          var key = (d.getMonth() + 1) + "月";
          byMonth[key] = (byMonth[key] || 0) + 1;
        }
      });
      var data = Object.entries(byMonth).map(function (e) { return { month: e[0], count: e[1] }; });
      if (data.length === 0) return;

      var margin = { top: 20, right: 20, bottom: 30, left: 40 };
      var iW = W - margin.left - margin.right;
      var iH = H - margin.top - margin.bottom;
      var g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");
      var x = d3.scaleBand().domain(data.map(function (d) { return d.month; })).range([0, iW]).padding(0.3);
      var y = d3.scaleLinear().domain([0, d3.max(data, function (d) { return d.count; }) || 1]).range([iH, 0]);
      g.append("g").attr("transform", "translate(0," + iH + ")").call(d3.axisBottom(x) as any)
        .selectAll("text").style("font-size", "10px");
      g.append("g").call(d3.axisLeft(y).ticks(4) as any)
        .selectAll("text").style("font-size", "10px");
      g.selectAll(".bar").data(data).enter().append("rect")
        .attr("x", function (d: any) { return x(d.month) || 0; })
        .attr("y", function (d: any) { return y(d.count); })
        .attr("width", x.bandwidth())
        .attr("height", function (d: any) { return iH - y(d.count); })
        .attr("fill", barColor).attr("rx", 3);
      g.selectAll(".label").data(data).enter().append("text")
        .attr("x", function (d: any) { return (x(d.month) || 0) + x.bandwidth() / 2; })
        .attr("y", function (d: any) { return y(d.count) - 4; })
        .attr("text-anchor", "middle").attr("font-size", "11px").attr("fill", P.gray700)
        .text(function (d: any) { return d.count; });
    });
    return function () { cancelAnimationFrame(raf); };
  }, [rows, dateField, barColor]);
  return React.createElement("svg", { ref: svgRef });
}

/* ============================================================
 * GeneratedComponent — メインコンポーネント
 * ============================================================ */
var GeneratedComponent = function (props: GeneratedComponentProps) {
  var styles = useStyles();
  var dataApi = props.dataApi;

  /* ---- State ---- */
  var [loading, setLoading] = useState(true);
  var [allSubjects, setAllSubjects] = useState<any[]>([]);
  var [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  var [columnData, setColumnData] = useState<any[][]>(COLUMN_CONFIGS.map(function () { return []; }));
  var [detailLoading, setDetailLoading] = useState(false);
  var [activeTab, setActiveTab] = useState<string>("flow");
  var [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  var [showSubjectModal, setShowSubjectModal] = useState(false);

  /* ---- 世代管理（高速切り替え時の競合防止） ---- */
  var loadGenRef = useRef(0);

  /* ---- コールバック安定化（FlowDiagram の不要な再描画防止） ---- */
  var handleFlowItemClick = useCallback(function (columnKey: string, rowId: string) {
    setSelectedItem({ columnKey: columnKey, rowId: rowId });
  }, []);

  /* ---- URLハッシュからの初期主体ID ---- */
  /* URL例: /main.aspx?...#subjectId=<guid>  省略時は一覧の先頭を使用 */
  var initialSubjectId = useMemo(function () {
    try {
      var hash = window.location.hash || "";
      var m = hash.match(/subjectId=([a-f0-9-]+)/i);
      if (m) return m[1];
    } catch (e) { /* ignore */ }
    return "";
  }, []);

  /* ---- 初回ロード: 主体一覧 ---- */
  useEffect(function () {
    var cancelled = false;
    (async function () {
      try {
        var rows = await loadAllRows<any>(dataApi, SUBJECT_CONFIG.entityName, {
          select: SUBJECT_CONFIG.select,
          orderBy: SUBJECT_CONFIG.orderBy,
        });
        if (cancelled) return;
        setAllSubjects(rows);
        var initId = initialSubjectId || (rows.length > 0 ? String(rows[0][SUBJECT_CONFIG.idField] || "") : "");
        setSelectedSubjectId(initId);
      } catch (e) {
        console.error("Subject list load error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return function () { cancelled = true; };
  }, [dataApi, initialSubjectId]);

  /* ---- 主体選択時: 全列データを並列ロード ---- */
  var loadSubjectDetails = useCallback(function (subjectId: string) {
    if (!subjectId) return;
    var gen = ++loadGenRef.current;
    setDetailLoading(true);
    setSelectedItem(null);
    setColumnData(COLUMN_CONFIGS.map(function () { return []; }));
    (async function () {
      try {
        var results = await Promise.all(
          COLUMN_CONFIGS.map(function (col) {
            return loadAllRows<any>(dataApi, col.entityName, {
              select: col.select,
              filter: col.getFilter(subjectId),
            });
          })
        );
        if (gen !== loadGenRef.current) return; /* 新しいリクエストが来たので破棄 */
        setColumnData(results);
      } catch (e) {
        console.error("Detail load error:", e);
      } finally {
        if (gen === loadGenRef.current) setDetailLoading(false);
      }
    })();
  }, [dataApi]);

  useEffect(function () {
    if (selectedSubjectId) loadSubjectDetails(selectedSubjectId);
  }, [selectedSubjectId, loadSubjectDetails]);

  /* ---- 現在選択している主体レコード ---- */
  var subjectRow = useMemo(function () {
    return allSubjects.find(function (r) { return String(r[SUBJECT_CONFIG.idField]) === selectedSubjectId; }) || null;
  }, [allSubjects, selectedSubjectId]);

  /* ---- columnData を FlowDiagram 用にまとめる ---- */
  var flowColumnData = useMemo(function () {
    return COLUMN_CONFIGS.map(function (config, i) { return { config: config, rows: columnData[i] || [] }; });
  }, [columnData]);

  /* ---- KPI 計算 ---- */
  var kpis = useMemo(function () {
    return COLUMN_CONFIGS.map(function (config, i) {
      var rows = columnData[i] || [];
      return {
        config: config,
        total: rows.length,
        rows: rows,
      };
    });
  }, [columnData]);

  /* ---- ローディング ---- */
  if (loading) {
    return React.createElement("div", {
      style: { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px" },
    },
      React.createElement(Spinner, { size: "medium" }),
      React.createElement(Text, { size: 400 }, "データを読み込み中..."),
    );
  }

  /* ---- 主体セレクタバー ---- */
  var SubjectIcon = SUBJECT_CONFIG.icon;
  var selectorEl = React.createElement("div", { className: styles.selectorBar },
    React.createElement(SubjectIcon, { style: { fontSize: 20, color: SUBJECT_CONFIG.themeColor } }),
    React.createElement(Text, { size: 300, weight: "semibold", style: { color: P.gray700, whiteSpace: "nowrap" } }, "対象選択:"),
    React.createElement(Dropdown, {
      placeholder: SUBJECT_CONFIG.displayField + "を選択...",
      value: subjectRow ? String(subjectRow[SUBJECT_CONFIG.displayField] || "") : "",
      selectedOptions: selectedSubjectId ? [selectedSubjectId] : [],
      onOptionSelect: function (_: any, data: any) {
        if (data.optionValue) setSelectedSubjectId(data.optionValue);
      },
      style: { minWidth: "280px", maxWidth: "400px" },
    },
      allSubjects.map(function (r) {
        var id = String(r[SUBJECT_CONFIG.idField] || "");
        var name = String(r[SUBJECT_CONFIG.displayField] || "");
        return React.createElement(Option, { key: id, value: id, text: name },
          React.createElement("div", { style: { display: "flex", flexDirection: "column" } },
            React.createElement(Text, { size: 200, weight: "semibold" }, name),
          )
        );
      })
    ),
    React.createElement(Text, { size: 200, style: { color: P.gray400 } }, allSubjects.length + " 件"),
    detailLoading ? React.createElement(Spinner, { size: "tiny" }) : null,
  );

  if (!subjectRow) {
    return React.createElement("div", { className: styles.root },
      selectorEl,
      React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", flex: 1, gap: "8px" } },
        React.createElement(WarningRegular, { style: { fontSize: 24, color: P.amber } }),
        React.createElement(Text, { size: 400 }, "レコードを選択してください"),
      ),
    );
  }

  var subjectName = String(subjectRow[SUBJECT_CONFIG.displayField] || "");
  var subjectId = String(subjectRow[SUBJECT_CONFIG.idField] || "");

  /* ---- ヘッダー ---- */
  var headerEl = React.createElement("div", { className: styles.header },
    React.createElement("div", {
      style: { width: 48, height: 48, borderRadius: "12px", backgroundColor: SUBJECT_CONFIG.themeColor + "1a", display: "flex", alignItems: "center", justifyContent: "center" },
    }, React.createElement(SubjectIcon, { style: { fontSize: 24, color: SUBJECT_CONFIG.themeColor } })),
    React.createElement("div", { className: styles.headerInfo },
      React.createElement(Text, { size: 500, weight: "bold", style: { color: P.gray900 } }, subjectName),
      React.createElement("div", { style: { display: "flex", gap: "16px", flexWrap: "wrap" } },
        SUBJECT_CONFIG.headerFields.map(function (hf, i) {
          var val = subjectRow ? subjectRow[hf.field] : null;
          return val ? React.createElement(Text, { key: i, size: 200, style: { color: P.gray500 } }, hf.label + ": " + val) : null;
        }),
      ),
    ),
    React.createElement(Button, {
      size: "small", appearance: "subtle",
      icon: React.createElement(OpenRegular, null),
      style: { color: SUBJECT_CONFIG.themeColor, flexShrink: 0 },
      onClick: function () { setShowSubjectModal(true); },
    }, "詳細"),
  );

  /* ---- KPI カード ---- */
  var kpiEl = React.createElement("div", { className: styles.kpiRow },
    kpis.map(function (kpi, i) {
      return React.createElement("div", { key: i, className: styles.kpiCard, style: { borderLeft: "3px solid " + kpi.config.color } },
        React.createElement(Text, { size: 200, style: { color: P.gray500 } }, kpi.config.icon + " " + kpi.config.label),
        React.createElement(Text, { size: 600, weight: "bold", style: { color: kpi.config.color } }, String(kpi.total)),
        React.createElement(Text, { size: 100, style: { color: P.gray400 } }, "件"),
      );
    })
  );

  /* ---- タブ定義（フロー + 各列 + 分析） ---- */
  var tabs = [
    { key: "flow", label: "フロー図", icon: GridRegular },
    ...COLUMN_CONFIGS.map(function (col) { return { key: col.key, label: col.label, icon: DocumentRegular }; }),
    { key: "analytics", label: "分析", icon: InfoRegular },
  ];

  var tabBarEl = React.createElement("div", { className: styles.tabBar },
    React.createElement(TabList, {
      selectedValue: activeTab,
      onTabSelect: function (_: any, d: any) { setActiveTab(d.value); },
      size: "small",
    },
      tabs.map(function (tab) {
        return React.createElement(Tab, { key: tab.key, value: tab.key, icon: React.createElement(tab.icon, null) }, tab.label);
      })
    )
  );

  /* ---- タブコンテンツ ---- */
  var tabContentEl: React.ReactElement | null = null;

  /* フロー図タブ */
  if (activeTab === "flow") {
    tabContentEl = React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } },
        React.createElement(Text, { size: 400, weight: "semibold", style: { color: P.gray800 } },
          COLUMN_CONFIGS.map(function (c) { return c.label; }).join(" → ") + " フロー"),
      ),
      React.createElement("div", { style: { display: "flex", gap: "0" } },
        React.createElement("div", { style: { flex: 1, minWidth: 0, overflow: "auto" } },
          React.createElement(FlowDiagram, {
            columnData: flowColumnData,
            onItemClick: handleFlowItemClick,
            selectedItem: selectedItem,
          }),
        ),
        selectedItem ? React.createElement(DetailSidebar, {
          item: selectedItem,
          columnData: flowColumnData,
          onClose: function () { setSelectedItem(null); },
        }) : null,
      ),
    );
  }

  /* 各列リストタブ */
  COLUMN_CONFIGS.forEach(function (col, i) {
    if (activeTab === col.key) {
      tabContentEl = React.createElement(ColumnItemList, {
        config: col,
        rows: columnData[i] || [],
      });
    }
  });

  /* 分析タブ */
  if (activeTab === "analytics") {
    tabContentEl = React.createElement("div", null,
      COLUMN_CONFIGS.filter(function (col) { return !!col.dateField; }).map(function (col, i) {
        var rows = columnData[COLUMN_CONFIGS.indexOf(col)] || [];
        return React.createElement("div", { key: col.key, className: styles.chartContainer },
          React.createElement(Text, { size: 400, weight: "semibold", style: { display: "block", marginBottom: 12 } },
            col.icon + " " + col.label + "（月別件数）"),
          rows.length > 0
            ? React.createElement(MonthlyBarChart, { rows: rows, dateField: col.dateField!, color: col.color })
            : React.createElement(Text, { size: 200, style: { color: P.gray400 } }, "データがありません"),
        );
      })
    );
  }

  /* ---- 主体詳細モーダル ---- */
  var subjectModalEl = React.createElement(Dialog, {
    open: showSubjectModal,
    onOpenChange: function (_: any, data: any) { setShowSubjectModal(data.open); },
  },
    React.createElement(DialogSurface, { style: { maxWidth: "520px" } },
      React.createElement(DialogBody, null,
        React.createElement(DialogTitle, null,
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "12px" } },
            React.createElement("div", {
              style: { width: 40, height: 40, borderRadius: "10px", backgroundColor: SUBJECT_CONFIG.themeColor + "1a", display: "flex", alignItems: "center", justifyContent: "center" },
            }, React.createElement(SubjectIcon, { style: { fontSize: 20, color: SUBJECT_CONFIG.themeColor } })),
            React.createElement(Text, { size: 400, weight: "bold", style: { color: P.gray900 } }, subjectName),
          ),
        ),
        React.createElement(DialogContent, null,
          React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "12px", padding: "8px 0" } },
            /* フィールド一覧 */
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" } },
              SUBJECT_CONFIG.modalFields.map(function (mf, i) {
                var val = subjectRow ? subjectRow[mf.field] : null;
                return React.createElement("div", { key: i, style: { padding: "10px 14px", borderRadius: 8, backgroundColor: P.gray50 } },
                  React.createElement(Text, { size: 100, style: { display: "block", color: P.gray400, marginBottom: 2 } }, mf.label),
                  React.createElement(Text, { size: 200, weight: "semibold", style: { color: P.gray800 } },
                    val != null && val !== "" ? String(val) : "—"),
                );
              })
            ),
            /* KPI サマリー */
            React.createElement("div", { style: { padding: "12px 14px", borderRadius: 8, backgroundColor: SUBJECT_CONFIG.themeColor + "0d", border: "1px solid " + SUBJECT_CONFIG.themeColor + "22" } },
              React.createElement(Text, { size: 200, weight: "semibold", style: { display: "block", color: SUBJECT_CONFIG.themeColor, marginBottom: 4 } }, "概要"),
              React.createElement("div", { style: { display: "flex", gap: "16px", flexWrap: "wrap" } },
                kpis.map(function (kpi, i) {
                  return React.createElement(Text, { key: i, size: 200, style: { color: P.gray700 } },
                    kpi.config.label + ": " + kpi.total + "件");
                })
              ),
            ),
          ),
        ),
        React.createElement(DialogActions, null,
          React.createElement(Button, {
            appearance: "primary",
            icon: React.createElement(OpenRegular, null),
            onClick: function () { window.open(mdaFormUrl(SUBJECT_CONFIG.entityName, subjectId), "_top"); },
          }, "フォームを開く"),
          React.createElement(Button, {
            appearance: "secondary",
            onClick: function () { setShowSubjectModal(false); },
          }, "閉じる"),
        ),
      ),
    ),
  );

  /* ---- レンダリング ---- */
  return React.createElement("div", { className: styles.root },
    selectorEl,
    headerEl,
    kpiEl,
    tabBarEl,
    React.createElement("div", { className: styles.tabContent }, tabContentEl),
    subjectModalEl,
  );
};

export default GeneratedComponent;
