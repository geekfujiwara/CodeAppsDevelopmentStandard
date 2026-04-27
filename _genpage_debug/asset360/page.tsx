import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type {
  ReadableTableRow,
  GeneratedComponentProps,
  msdyn_customerasset,
  msdyn_workorder,
  msdyn_workorderservicetask,
  bookableresourcebooking,
  bookableresource,
  msdyn_iotalert,
  msdyn_iotdevice,
  incident,
  msdyn_incidenttype,
} from "./RuntimeTypes";
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Spinner,
  Card,
  Badge,
  TabList,
  Tab,
  Input,
  Dropdown,
  Option,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@fluentui/react-components";
import {
  BuildingRegular,
  WrenchRegular,
  AlertRegular,
  ClipboardTaskRegular,
  DocumentRegular,
  ChevronRightRegular,
  ChevronDownRegular,
  SearchRegular,
  ArrowSyncRegular,
  CheckmarkCircleRegular,
  CalendarRegular,
  WarningRegular,
  InfoRegular,
  OpenRegular,
} from "@fluentui/react-icons";
import * as d3 from "d3";

/* ========== カラーパレット ========== */
var P = {
  blue: "#2563eb", blueDark: "#1d4ed8", blueLight: "#dbeafe",
  teal: "#0d9488", tealLight: "#ccfbf1",
  coral: "#dc2626", coralLight: "#fee2e2",
  amber: "#d97706", amberLight: "#fef3c7",
  red: "#dc2626", green: "#16a34a", greenLight: "#dcfce7",
  violet: "#7c3aed", violetLight: "#ede9fe",
  gray50: "#f9fafb", gray100: "#f3f4f6", gray200: "#e5e7eb",
  gray300: "#d1d5db", gray400: "#9ca3af", gray500: "#6b7280",
  gray600: "#4b5563", gray700: "#374151", gray800: "#1f2937",
  gray900: "#111827", white: "#ffffff",
};

/* ========== ユーティリティ ========== */
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
    var y = dt.getFullYear();
    var mo = String(dt.getMonth() + 1).padStart(2, "0");
    var dd = String(dt.getDate()).padStart(2, "0");
    return y + "/" + mo + "/" + dd;
  } catch (e) { return "—"; }
}

function fmtDateTime(d: any): string {
  if (!d) return "—";
  try {
    var dt = new Date(d);
    if (isNaN(dt.getTime())) return "—";
    var y = dt.getFullYear();
    var mo = String(dt.getMonth() + 1).padStart(2, "0");
    var dd = String(dt.getDate()).padStart(2, "0");
    var hh = String(dt.getHours()).padStart(2, "0");
    var mm = String(dt.getMinutes()).padStart(2, "0");
    return y + "/" + mo + "/" + dd + " " + hh + ":" + mm;
  } catch (e) { return "—"; }
}

/* MDA フォーム URL を構築（同一アプリ内の pagetype=entityrecord） */
function mdaFormUrl(etn: string, id: string): string {
  /* GenPage は MDA 内 iframe なので parent の origin を使い、
     /main.aspx?pagetype=entityrecord&etn=...&id=... で直接開く */
  try {
    var base = window.top?.location?.origin || window.location.origin;
    return base + "/main.aspx?pagetype=entityrecord&etn=" + etn + "&id=" + id;
  } catch (e) {
    /* cross-origin の場合は相対パスで */
    return "/main.aspx?pagetype=entityrecord&etn=" + etn + "&id=" + id;
  }
}

function daysAgo(d: any): string {
  if (!d) return "";
  try {
    var dt = new Date(d);
    var now = new Date();
    var diff = Math.floor((now.getTime() - dt.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return "今日";
    if (diff === 1) return "昨日";
    if (diff < 0) return Math.abs(diff) + "日後";
    return diff + "日前";
  } catch (e) { return ""; }
}

/* ========== スタイル ========== */
var useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    boxSizing: "border-box",
    overflow: "auto",
    backgroundColor: P.gray50,
  },
  selectorBar: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 24px",
    backgroundColor: P.white,
    borderBottom: "1px solid " + P.gray200,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "16px 24px 12px",
    backgroundColor: P.white,
    borderBottom: "1px solid " + P.gray200,
  },
  headerInfo: {
    display: "flex",
    flexDirection: "column" as any,
    gap: "4px",
    flex: 1,
    minWidth: 0,
  },
  kpiRow: {
    display: "flex",
    gap: "12px",
    padding: "16px 24px",
    flexWrap: "wrap" as any,
  },
  kpiCard: {
    flex: "1 1 140px",
    minWidth: "140px",
    padding: "14px 16px",
    borderRadius: "10px",
    backgroundColor: P.white,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    display: "flex",
    flexDirection: "column" as any,
    gap: "4px",
  },
  tabBar: {
    padding: "0 24px",
    backgroundColor: P.white,
    borderBottom: "1px solid " + P.gray200,
  },
  tabContent: {
    flex: 1,
    overflow: "auto",
    padding: "16px 24px",
  },
  ganttContainer: {
    backgroundColor: P.white,
    borderRadius: "10px",
    padding: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    overflow: "auto",
    position: "relative" as any,
  },
  ganttLegend: {
    display: "flex",
    gap: "20px",
    padding: "8px 0 12px",
    flexWrap: "wrap" as any,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  alertRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    padding: "10px 12px",
    borderRadius: "8px",
    backgroundColor: P.white,
    marginBottom: "8px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },
  taskRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 12px",
    borderBottom: "1px solid " + P.gray100,
  },
  woCard: {
    padding: "14px 16px",
    borderRadius: "10px",
    backgroundColor: P.white,
    marginBottom: "10px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    cursor: "pointer",
  },
  expandedTasks: {
    padding: "8px 0 0 28px",
  },
  chartContainer: {
    backgroundColor: P.white,
    borderRadius: "10px",
    padding: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    marginBottom: "12px",
  },
  caseRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    padding: "12px 14px",
    borderRadius: "8px",
    backgroundColor: P.white,
    marginBottom: "8px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },
  tooltip: {
    position: "absolute" as any,
    backgroundColor: P.gray800,
    color: P.white,
    padding: "8px 12px",
    borderRadius: "6px",
    fontSize: "12px",
    lineHeight: "1.4",
    pointerEvents: "none" as any,
    zIndex: 100,
    maxWidth: "280px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
  },
});

/* ========== 型定義 ========== */
type AssetRow = ReadableTableRow<msdyn_customerasset>;
type WORow = ReadableTableRow<msdyn_workorder>;
type TaskRow = ReadableTableRow<msdyn_workorderservicetask>;
type BookingRow = ReadableTableRow<bookableresourcebooking>;
type ResourceRow = ReadableTableRow<bookableresource>;
type AlertRow = ReadableTableRow<msdyn_iotalert>;
type CaseRow = ReadableTableRow<incident>;
type IncidentTypeRow = ReadableTableRow<msdyn_incidenttype>;

type SelectedGanttItem = {
  type: string;
  id: string;
};

/* ========== タブ定義 ========== */
var TABS = [
  { key: "gantt", label: "フロー図", icon: CalendarRegular },
  { key: "workorders", label: "作業指示書", icon: WrenchRegular },
  { key: "alerts", label: "IoTアラート", icon: AlertRegular },
  { key: "cases", label: "サポート案件", icon: DocumentRegular },
  { key: "chart", label: "分析", icon: InfoRegular },
] as const;

/* ========== IoTアラート種別 ========== */
function alertTypeLabel(t: any): { label: string; color: string; bg: string } {
  var v = Number(t);
  if (v === 192350000) return { label: "Anomaly", color: P.red, bg: P.coralLight };
  if (v === 192350001) return { label: "Info", color: P.blue, bg: P.blueLight };
  if (v === 192350002) return { label: "Threshold", color: P.amber, bg: P.amberLight };
  return { label: "Unknown", color: P.gray500, bg: P.gray100 };
}

/* ========== WO種別判定ヘルパー ========== */
function woCategory(wo: WORow, incidentTypeMap: Map<string, string>): { label: string; color: string } {
  var hasCase = !!fkId((wo as any)._msdyn_servicerequest_value);
  var hasAlert = !!fkId((wo as any)._msdyn_iotalert_value);
  if (hasCase || hasAlert) return { label: "IoT起因", color: "#ea580c" };
  var itName = (incidentTypeMap.get(fkId(wo._msdyn_primaryincidenttype_value)) || "").toLowerCase();
  if (itName.indexOf("spot") >= 0 || itName.indexOf("スポット") >= 0 || itName.indexOf("reactive") >= 0 || itName.indexOf("corrective") >= 0) {
    return { label: "スポット", color: P.violet };
  }
  return { label: "定期メンテナンス", color: P.blue };
}

/* ========== フローダイアグラム（xyflow風 D3 実装） ========== */
function FlowDiagram(props: {
  workOrders: WORow[];
  alerts: AlertRow[];
  cases: CaseRow[];
  incidentTypeMap: Map<string, string>;
  bookingByWO: Map<string, BookingRow>;
  resourceMap: Map<string, string>;
  onItemClick: (type: string, id: string) => void;
  selectedItem: SelectedGanttItem | null;
}) {
  var svgRef = useRef<SVGSVGElement>(null);
  var containerRef = useRef<HTMLDivElement>(null);
  var tooltipRef = useRef<HTMLDivElement>(null);
  var { workOrders, alerts, cases, incidentTypeMap, bookingByWO, resourceMap, onItemClick, selectedItem } = props;

  useEffect(function () {
    if (!svgRef.current) return;

    var raf = requestAnimationFrame(function () {
      if (!svgRef.current) return;
      var svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();

      if (workOrders.length === 0 && alerts.length === 0 && cases.length === 0) {
        svg.attr("width", 600).attr("height", 100);
        svg.append("text").attr("x", 300).attr("y", 50)
          .attr("text-anchor", "middle").attr("fill", P.gray400)
          .attr("font-size", "14px").text("データがありません");
        return;
      }

      /* === レイアウト定数 === */
      var nodeW = 280;
      var nodeH = 82;
      var colGap = 80;
      var rowGap = 20;
      var padL = 30;
      var padT = 60;
      var handleR = 5;
      var textMaxW = 140; /* タイトルテキスト最大幅（バッジと被らないよう制限） */

      /* 3列: IoTアラート | サポート案件 | 作業指示書 */
      var col1X = padL;
      var col2X = padL + nodeW + colGap;
      var col3X = padL + (nodeW + colGap) * 2;
      var totalW = col3X + nodeW + padL;

      /* === ノードデータ構築 === */
      type FNode = {
        id: string; type: string; x: number; y: number;
        title: string; sub: string; date: string;
        color: string; bg: string; borderColor: string;
        icon: string; statusLabel: string; statusColor: string;
        raw: any;
      };
      type FEdge = { from: string; to: string; color: string };

      var nodes: FNode[] = [];
      var edges: FEdge[] = [];

      /* IoTアラートノード */
      var sortedAlerts = alerts.slice().sort(function (a, b) {
        return new Date(a.msdyn_alerttime).getTime() - new Date(b.msdyn_alerttime).getTime();
      });
      sortedAlerts.forEach(function (alert, i) {
        var at = alertTypeLabel(alert.msdyn_alerttype);
        nodes.push({
          id: "alert-" + alert.msdyn_iotalertid,
          type: "alert",
          x: col1X,
          y: padT + i * (nodeH + rowGap),
          title: at.label,
          sub: (alert.msdyn_description || "").substring(0, 40),
          date: fmtDateTime(alert.msdyn_alerttime),
          color: at.color, bg: "#fff", borderColor: at.color,
          icon: "⚡", statusLabel: at.label, statusColor: at.color,
          raw: alert,
        });
      });

      /* サポート案件ノード */
      var sortedCases = cases.slice().sort(function (a, b) {
        return new Date(a.createdon as any).getTime() - new Date(b.createdon as any).getTime();
      });
      sortedCases.forEach(function (c, i) {
        var isResolved = Number(c.statecode) === 1 || Number(c.statecode) === 2;
        nodes.push({
          id: "case-" + c.incidentid,
          type: "case",
          x: col2X,
          y: padT + i * (nodeH + rowGap),
          title: (c.title || "案件").substring(0, 24),
          sub: fmtDate(c.createdon),
          date: fmtDate(c.createdon),
          color: isResolved ? P.green : P.violet,
          bg: "#fff", borderColor: isResolved ? P.green : P.violet,
          icon: "📋", statusLabel: isResolved ? "解決済" : "オープン",
          statusColor: isResolved ? P.green : P.violet,
          raw: c,
        });
      });

      /* 作業指示書ノード */
      var sortedWO = workOrders.slice().sort(function (a, b) {
        return new Date(a.msdyn_datewindowstart || a.createdon as any).getTime() -
               new Date(b.msdyn_datewindowstart || b.createdon as any).getTime();
      });
      sortedWO.forEach(function (wo, i) {
        var isCompleted = String(wo.msdyn_systemstatus) === "690970005";
        var cat = woCategory(wo, incidentTypeMap);
        var itName = incidentTypeMap.get(fkId(wo._msdyn_primaryincidenttype_value)) || "";
        var booking = bookingByWO.get(wo.msdyn_workorderid);
        var resName = booking ? (resourceMap.get(fkId(booking._resource_value)) || "") : "";
        nodes.push({
          id: "wo-" + wo.msdyn_workorderid,
          type: "wo",
          x: col3X,
          y: padT + i * (nodeH + rowGap),
          title: (wo.msdyn_name || "").substring(0, 22),
          sub: (itName ? itName + " " : "") + (resName ? "/ " + resName : ""),
          date: fmtDate(wo.msdyn_datewindowstart) + "～" + fmtDate(wo.msdyn_datewindowend),
          color: isCompleted ? P.green : cat.color,
          bg: "#fff", borderColor: isCompleted ? P.green : cat.color,
          icon: "🔧",
          statusLabel: isCompleted ? "完了" : cat.label,
          statusColor: isCompleted ? P.green : cat.color,
          raw: wo,
        });
      });

      /* === エッジ構築 === */
      var caseIdSet = new Map<string, string>();
      sortedCases.forEach(function (c) { caseIdSet.set(c.incidentid, "case-" + c.incidentid); });

      /* Alert → Case */
      sortedAlerts.forEach(function (alert) {
        var cId = fkId(alert._msdyn_case_value);
        if (cId && caseIdSet.has(cId)) {
          edges.push({
            from: "alert-" + alert.msdyn_iotalertid,
            to: caseIdSet.get(cId) as string,
            color: P.gray400,
          });
        }
      });

      /* Case → WO */
      sortedWO.forEach(function (wo) {
        var cId = fkId((wo as any)._msdyn_servicerequest_value);
        if (cId && caseIdSet.has(cId)) {
          edges.push({
            from: caseIdSet.get(cId) as string,
            to: "wo-" + wo.msdyn_workorderid,
            color: P.gray400,
          });
        }
      });

      /* Alert → WO 直結 */
      sortedAlerts.forEach(function (alert) {
        var wId = fkId(alert._msdyn_workorder_value);
        if (wId && !fkId(alert._msdyn_case_value)) {
          var woNodeId = "wo-" + wId;
          if (nodes.some(function (n) { return n.id === woNodeId; })) {
            edges.push({
              from: "alert-" + alert.msdyn_iotalertid,
              to: woNodeId,
              color: P.amber,
            });
          }
        }
      });

      /* === SVGサイズ計算 === */
      var maxNodesInCol = Math.max(sortedAlerts.length, sortedCases.length, sortedWO.length, 1);
      var totalH = padT + maxNodesInCol * (nodeH + rowGap) + 40;
      var W = Math.max(totalW, containerRef.current ? containerRef.current.clientWidth - 32 : 800);
      svg.attr("width", W).attr("height", totalH);

      /* === defs: フィルター・マーカー === */
      var defs = svg.append("defs");

      /* ドロップシャドウ */
      var filter = defs.append("filter").attr("id", "nodeShadow")
        .attr("x", "-10%").attr("y", "-10%").attr("width", "130%").attr("height", "140%");
      filter.append("feDropShadow")
        .attr("dx", 0).attr("dy", 2).attr("stdDeviation", 4)
        .attr("flood-color", "rgba(0,0,0,0.08)");

      /* 選択時の強いシャドウ */
      var filterSel = defs.append("filter").attr("id", "nodeShadowSel")
        .attr("x", "-15%").attr("y", "-15%").attr("width", "140%").attr("height", "150%");
      filterSel.append("feDropShadow")
        .attr("dx", 0).attr("dy", 3).attr("stdDeviation", 8)
        .attr("flood-color", "rgba(0,0,0,0.15)");

      /* 矢印マーカー */
      defs.append("marker").attr("id", "arrowGray")
        .attr("viewBox", "0 0 10 10").attr("refX", 8).attr("refY", 5)
        .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
        .append("path").attr("d", "M 0 0 L 10 5 L 0 10 z").attr("fill", P.gray400);

      defs.append("marker").attr("id", "arrowAmber")
        .attr("viewBox", "0 0 10 10").attr("refX", 8).attr("refY", 5)
        .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
        .append("path").attr("d", "M 0 0 L 10 5 L 0 10 z").attr("fill", P.amber);

      /* === 背景ドットグリッド === */
      svg.append("rect").attr("width", W).attr("height", totalH).attr("fill", "#fafbfc");
      var dotG = svg.append("g").attr("class", "dots");
      for (var dx = 20; dx < W; dx += 24) {
        for (var dy = 20; dy < totalH; dy += 24) {
          dotG.append("circle").attr("cx", dx).attr("cy", dy).attr("r", 1).attr("fill", P.gray200);
        }
      }

      /* === 列ヘッダー === */
      var headers = [
        { x: col1X, label: "IoTアラート", icon: "⚡", color: P.red },
        { x: col2X, label: "サポート案件", icon: "📋", color: P.violet },
        { x: col3X, label: "作業指示書", icon: "🔧", color: P.blue },
      ];
      headers.forEach(function (h) {
        svg.append("text")
          .attr("x", h.x + nodeW / 2).attr("y", 28)
          .attr("text-anchor", "middle").attr("font-size", "13px")
          .attr("font-weight", "700").attr("fill", h.color)
          .text(h.icon + " " + h.label);
        svg.append("line")
          .attr("x1", h.x).attr("x2", h.x + nodeW)
          .attr("y1", 38).attr("y2", 38)
          .attr("stroke", h.color).attr("stroke-width", 2).attr("opacity", 0.3);
      });

      /* === ノードID→位置 マップ === */
      var nodePos = new Map<string, { x: number; y: number }>();
      nodes.forEach(function (n) { nodePos.set(n.id, { x: n.x, y: n.y }); });

      /* === エッジ描画（ベジェ曲線 + アニメーション） === */
      var edgeGroup = svg.append("g").attr("class", "edges");
      edges.forEach(function (edge, idx) {
        var fromN = nodePos.get(edge.from);
        var toN = nodePos.get(edge.to);
        if (!fromN || !toN) return;

        var x1 = fromN.x + nodeW;
        var y1 = fromN.y + nodeH / 2;
        var x2 = toN.x;
        var y2 = toN.y + nodeH / 2;
        var cpx = (x1 + x2) / 2;

        var pathD = "M " + x1 + " " + y1 + " C " + cpx + " " + y1 + " " + cpx + " " + y2 + " " + x2 + " " + y2;
        var markerEnd = edge.color === P.amber ? "url(#arrowAmber)" : "url(#arrowGray)";

        /* ベジェ曲線パス */
        var pathEl = edgeGroup.append("path")
          .attr("d", pathD)
          .attr("fill", "none")
          .attr("stroke", edge.color)
          .attr("stroke-width", 2)
          .attr("stroke-dasharray", "6,4")
          .attr("marker-end", markerEnd)
          .attr("opacity", 0);

        /* 出口ハンドル */
        edgeGroup.append("circle")
          .attr("cx", x1).attr("cy", y1).attr("r", 0)
          .attr("fill", P.white).attr("stroke", edge.color).attr("stroke-width", 1.5)
          .transition().duration(300).delay(idx * 80 + 600)
          .attr("r", handleR);

        /* 入口ハンドル */
        edgeGroup.append("circle")
          .attr("cx", x2).attr("cy", y2).attr("r", 0)
          .attr("fill", edge.color).attr("stroke", P.white).attr("stroke-width", 1.5)
          .transition().duration(300).delay(idx * 80 + 800)
          .attr("r", handleR);

        /* パスアニメーション（描画） */
        pathEl
          .transition().duration(600).delay(idx * 80 + 500)
          .attr("opacity", 0.6);

        /* ダッシュアニメーション */
        var totalLen = 1000;
        try {
          var pNode = pathEl.node() as any;
          if (pNode && pNode.getTotalLength) totalLen = pNode.getTotalLength();
        } catch (e) { /* ignore */ }

        pathEl
          .attr("stroke-dasharray", totalLen + " " + totalLen)
          .attr("stroke-dashoffset", totalLen)
          .transition().duration(800).delay(idx * 80 + 500)
          .ease(d3.easeCubicOut)
          .attr("stroke-dashoffset", 0)
          .attr("opacity", 0.6)
          .on("end", function () {
            d3.select(this as any)
              .attr("stroke-dasharray", "6,4")
              .attr("stroke-dashoffset", 0);
          });
      });

      /* === ノード描画 === */
      var nodeGroup = svg.append("g").attr("class", "nodes");

      nodes.forEach(function (node, idx) {
        var isSel = selectedItem && (
          (node.type === "alert" && selectedItem.type === "alert" && node.id === "alert-" + selectedItem.id) ||
          (node.type === "case" && selectedItem.type === "case" && node.id === "case-" + selectedItem.id) ||
          (node.type === "wo" && selectedItem.type === "wo" && node.id === "wo-" + selectedItem.id)
        );
        var g = nodeGroup.append("g")
          .attr("transform", "translate(" + node.x + "," + node.y + ")")
          .attr("cursor", "pointer")
          .attr("opacity", 0);

        /* ノード背景 */
        g.append("rect")
          .attr("width", nodeW).attr("height", nodeH)
          .attr("rx", 12).attr("ry", 12)
          .attr("fill", P.white)
          .attr("stroke", isSel ? node.borderColor : P.gray200)
          .attr("stroke-width", isSel ? 2.5 : 1)
          .attr("filter", isSel ? "url(#nodeShadowSel)" : "url(#nodeShadow)");

        /* 左カラーバー */
        g.append("rect")
          .attr("x", 0).attr("y", 0)
          .attr("width", 5).attr("height", nodeH)
          .attr("rx", "2.5").attr("fill", node.borderColor);

        /* アイコン円 */
        g.append("circle")
          .attr("cx", 26).attr("cy", nodeH / 2)
          .attr("r", 16)
          .attr("fill", node.borderColor).attr("opacity", 0.1);
        g.append("text")
          .attr("x", 26).attr("y", nodeH / 2 + 5)
          .attr("text-anchor", "middle").attr("font-size", "14px")
          .text(node.icon);

        /* テキストクリップ領域（はみ出し防止） */
        var clipId = "clip-" + node.id.replace(/[^a-zA-Z0-9]/g, "");
        var clip = defs.append("clipPath").attr("id", clipId);
        clip.append("rect").attr("x", 50).attr("y", 0).attr("width", textMaxW).attr("height", nodeH);

        /* ステータスバッジ（右上に配置、タイトルより先に描画） */
        var badgeW = node.statusLabel.length * 8 + 12;
        var badgeX = nodeW - badgeW - 8;
        g.append("rect")
          .attr("x", badgeX).attr("y", 8)
          .attr("width", badgeW).attr("height", 18)
          .attr("rx", 9).attr("fill", node.statusColor).attr("opacity", 0.15);
        g.append("text")
          .attr("x", badgeX + badgeW / 2).attr("y", 21)
          .attr("text-anchor", "middle").attr("font-size", "9px")
          .attr("font-weight", "600").attr("fill", node.statusColor)
          .text(node.statusLabel);

        /* タイトル（クリップ付き） */
        g.append("text")
          .attr("x", 50).attr("y", 24)
          .attr("font-size", "12px").attr("font-weight", "600")
          .attr("fill", P.gray900)
          .attr("clip-path", "url(#" + clipId + ")")
          .text(node.title);

        /* サブテキスト（クリップ付き） */
        g.append("text")
          .attr("x", 50).attr("y", 42)
          .attr("font-size", "10px").attr("fill", P.gray500)
          .attr("clip-path", "url(#" + clipId + ")")
          .text(node.sub.substring(0, 30));

        /* 日付 */
        g.append("text")
          .attr("x", 50).attr("y", 60)
          .attr("font-size", "9px").attr("fill", P.gray400)
          .attr("clip-path", "url(#" + clipId + ")")
          .text(node.date);

        /* クリック・ホバー */
        g.on("click", function () {
          if (node.type === "alert") onItemClick("alert", (node.raw as AlertRow).msdyn_iotalertid);
          else if (node.type === "case") onItemClick("case", (node.raw as CaseRow).incidentid);
          else if (node.type === "wo") onItemClick("wo", (node.raw as WORow).msdyn_workorderid);
        });

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
          if (node.type === "alert") {
            var a = node.raw as AlertRow;
            tooltipRef.current.innerHTML = "<div style='font-weight:600'>" + alertTypeLabel(a.msdyn_alerttype).label + "</div><div>" + (a.msdyn_description || "").substring(0, 150) + "</div><div style='opacity:.7;margin-top:4px'>" + fmtDateTime(a.msdyn_alerttime) + "</div>";
          } else if (node.type === "case") {
            var c = node.raw as CaseRow;
            tooltipRef.current.innerHTML = "<div style='font-weight:600'>" + (c.title || "") + "</div><div>" + (Number(c.statecode) > 0 ? "解決済み" : "オープン") + " — " + fmtDate(c.createdon) + "</div>";
          } else {
            var w = node.raw as WORow;
            var cat = woCategory(w, incidentTypeMap);
            tooltipRef.current.innerHTML = "<div style='font-weight:600'>" + (w.msdyn_name || "") + "</div><div style='display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;color:#fff;background:" + cat.color + "'>" + cat.label + "</div><div style='margin-top:4px'>" + fmtDate(w.msdyn_datewindowstart) + " ～ " + fmtDate(w.msdyn_datewindowend) + "</div>";
          }
        });

        g.on("mouseout", function () {
          var sel = isSel;
          d3.select(this as any).select("rect")
            .transition().duration(150)
            .attr("stroke", sel ? node.borderColor : P.gray200)
            .attr("stroke-width", sel ? 2.5 : 1)
            .attr("filter", sel ? "url(#nodeShadowSel)" : "url(#nodeShadow)");
          if (tooltipRef.current) tooltipRef.current.style.display = "none";
        });

        /* フェードインアニメーション */
        g.transition().duration(400).delay(idx * 60 + 200)
          .attr("opacity", 1);
      });
    });

    return function () { cancelAnimationFrame(raf); };
  }, [workOrders, alerts, cases, incidentTypeMap, bookingByWO, resourceMap, selectedItem, onItemClick]);

  var styles = useStyles();

  return React.createElement("div", { ref: containerRef, className: styles.ganttContainer, style: { overflow: "auto" } },
    React.createElement("div", { className: styles.ganttLegend },
      React.createElement("div", { className: styles.legendItem },
        React.createElement("div", { style: { width: 14, height: 14, borderRadius: 4, backgroundColor: P.blue, border: "2px solid " + P.blueLight } }),
        React.createElement(Text, { size: 200 }, "定期メンテナンス"),
      ),
      React.createElement("div", { className: styles.legendItem },
        React.createElement("div", { style: { width: 14, height: 14, borderRadius: 4, backgroundColor: "#ea580c", border: "2px solid " + P.amberLight } }),
        React.createElement(Text, { size: 200 }, "IoT起因"),
      ),
      React.createElement("div", { className: styles.legendItem },
        React.createElement("div", { style: { width: 14, height: 14, borderRadius: 4, backgroundColor: P.violet, border: "2px solid " + P.violetLight } }),
        React.createElement(Text, { size: 200 }, "スポット"),
      ),
      React.createElement("div", { className: styles.legendItem },
        React.createElement("div", { style: { width: 14, height: 14, borderRadius: 4, backgroundColor: P.green, border: "2px solid " + P.greenLight } }),
        React.createElement(Text, { size: 200 }, "完了"),
      ),
      React.createElement("div", { className: styles.legendItem },
        React.createElement("div", { style: { width: 24, height: 0, borderTop: "2px dashed " + P.gray400 } }),
        React.createElement(Text, { size: 200 }, "関連"),
      ),
    ),
    React.createElement("svg", { ref: svgRef }),
    React.createElement("div", {
      ref: tooltipRef,
      className: styles.tooltip,
      style: { display: "none" },
    }),
  );
}

/* ========== 詳細サイドバー ========== */
function DetailSidebar(props: {
  item: SelectedGanttItem;
  workOrders: WORow[];
  alerts: AlertRow[];
  cases: CaseRow[];
  incidentTypeMap: Map<string, string>;
  bookingByWO: Map<string, BookingRow>;
  resourceMap: Map<string, string>;
  onClose: () => void;
}) {
  var { item, workOrders, alerts, cases, incidentTypeMap, bookingByWO, resourceMap, onClose } = props;

  var wo: WORow | undefined;
  var alertItem: AlertRow | undefined;
  var caseItem: CaseRow | undefined;

  if (item.type === "wo") {
    wo = workOrders.find(function (w) { return w.msdyn_workorderid === item.id; });
  } else if (item.type === "alert") {
    alertItem = alerts.find(function (a) { return a.msdyn_iotalertid === item.id; });
  } else if (item.type === "case") {
    caseItem = cases.find(function (c) { return c.incidentid === item.id; });
  }

  var relatedAlerts: AlertRow[] = [];
  var relatedCases: CaseRow[] = [];
  var relatedWOs: WORow[] = [];

  if (wo) {
    relatedAlerts = alerts.filter(function (a) { return fkId(a._msdyn_workorder_value) === wo!.msdyn_workorderid; });
    var cId = fkId((wo as any)._msdyn_servicerequest_value);
    if (cId) { var lc = cases.find(function (c) { return c.incidentid === cId; }); if (lc) relatedCases.push(lc); }
    /* IoTアラート → Case 経由の場合、Case に紐づくアラートも探す */
    if (relatedAlerts.length === 0 && cId) {
      var caseAlerts = alerts.filter(function (a) { return fkId(a._msdyn_case_value) === cId; });
      relatedAlerts = relatedAlerts.concat(caseAlerts);
    }
  } else if (alertItem) {
    var wId = fkId(alertItem._msdyn_workorder_value);
    if (wId) { var lw = workOrders.find(function (w) { return w.msdyn_workorderid === wId; }); if (lw) relatedWOs.push(lw); }
    var cId2 = fkId(alertItem._msdyn_case_value);
    if (cId2) { var lc2 = cases.find(function (c) { return c.incidentid === cId2; }); if (lc2) relatedCases.push(lc2); }
  } else if (caseItem) {
    relatedWOs = workOrders.filter(function (w) { return fkId((w as any)._msdyn_servicerequest_value) === caseItem!.incidentid; });
    relatedAlerts = alerts.filter(function (a) { return fkId(a._msdyn_case_value) === caseItem!.incidentid; });
  }

  var headerContent: React.ReactElement;
  /* MDA フォームへのリンクボタンを生成するヘルパー */
  function openFormBtn(etn: string, id: string, label?: string) {
    return React.createElement(Button, {
      size: "small",
      appearance: "subtle",
      icon: React.createElement(OpenRegular, null),
      style: { marginTop: 8, color: P.blue, gap: 4 },
      onClick: function () { window.open(mdaFormUrl(etn, id), "_top"); },
    }, label || "フォームを開く");
  }

  if (wo) {
    var isCompleted = String(wo.msdyn_systemstatus) === "690970005";
    var itName = incidentTypeMap.get(fkId(wo._msdyn_primaryincidenttype_value)) || "";
    var booking = bookingByWO.get(wo.msdyn_workorderid);
    var resName = booking ? (resourceMap.get(fkId(booking._resource_value)) || "") : "";
    var cat = woCategory(wo, incidentTypeMap);
    headerContent = React.createElement("div", null,
      React.createElement(Text, { size: 300, weight: "bold", style: { display: "block", color: P.gray900 } }, wo.msdyn_name || ""),
      React.createElement("div", { style: { display: "flex", gap: "4px", marginTop: 4, flexWrap: "wrap" } },
        React.createElement(Badge, { appearance: "filled", color: isCompleted ? "success" : "brand", size: "small" }, isCompleted ? "完了" : "進行中/予定"),
        React.createElement("span", { style: { display: "inline-block", padding: "1px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, color: "#fff", backgroundColor: cat.color } }, cat.label),
        itName ? React.createElement(Badge, { appearance: "outline", size: "small" }, itName) : null,
      ),
      React.createElement("div", { style: { marginTop: 8 } },
        React.createElement(Text, { size: 200, style: { display: "block", color: P.gray600 } },
          "期間: " + fmtDate(wo.msdyn_datewindowstart) + " ～ " + fmtDate(wo.msdyn_datewindowend)),
        resName ? React.createElement(Text, { size: 200, style: { display: "block", color: P.gray600, marginTop: 2 } }, "担当: " + resName) : null,
        wo.msdyn_workordersummary ? React.createElement(Text, { size: 200, style: { display: "block", color: P.gray500, marginTop: 4 } },
          String(wo.msdyn_workordersummary).substring(0, 200)) : null,
      ),
      openFormBtn("msdyn_workorder", wo.msdyn_workorderid),
    );
  } else if (alertItem) {
    var at = alertTypeLabel(alertItem.msdyn_alerttype);
    headerContent = React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
        React.createElement("div", { style: { padding: "2px 8px", borderRadius: 4, backgroundColor: at.bg, fontSize: 11, fontWeight: 600, color: at.color } }, at.label),
        React.createElement(Text, { size: 300, weight: "bold", style: { color: P.gray900 } }, "IoTアラート"),
      ),
      React.createElement("div", { style: { marginTop: 8 } },
        React.createElement(Text, { size: 200, style: { display: "block", color: P.gray700 } }, (alertItem.msdyn_description || "").substring(0, 200)),
        React.createElement(Text, { size: 200, style: { display: "block", color: P.gray500, marginTop: 4 } }, "発生日時: " + fmtDateTime(alertItem.msdyn_alerttime)),
      ),
      openFormBtn("msdyn_iotalert", alertItem.msdyn_iotalertid),
    );
  } else if (caseItem) {
    var isRes = Number(caseItem.statecode) === 1 || Number(caseItem.statecode) === 2;
    headerContent = React.createElement("div", null,
      React.createElement(Text, { size: 300, weight: "bold", style: { display: "block", color: P.gray900 } }, caseItem.title || "サポート案件"),
      React.createElement(Badge, { appearance: "filled", color: isRes ? "success" : "warning", size: "small", style: { marginTop: 4 } }, isRes ? "解決済み" : "オープン"),
      React.createElement("div", { style: { marginTop: 8 } },
        React.createElement(Text, { size: 200, style: { display: "block", color: P.gray600 } }, "作成日: " + fmtDate(caseItem.createdon)),
        caseItem.description ? React.createElement(Text, { size: 200, style: { display: "block", color: P.gray500, marginTop: 4 } },
          String(caseItem.description).substring(0, 200)) : null,
      ),
      openFormBtn("incident", caseItem.incidentid),
    );
  } else {
    headerContent = React.createElement(Text, { size: 200, style: { color: P.gray400 } }, "データが見つかりません");
  }

  var chainEls: React.ReactElement[] = [];

  if (relatedAlerts.length > 0) {
    chainEls.push(React.createElement("div", { key: "al" },
      React.createElement(Text, { size: 200, weight: "semibold", style: { color: P.red, display: "block", marginBottom: 4 } },
        "関連 IoTアラート (" + relatedAlerts.length + ")")));
    relatedAlerts.forEach(function (a, i) {
      var at2 = alertTypeLabel(a.msdyn_alerttype);
      chainEls.push(React.createElement("div", { key: "a" + i, style: { display: "flex", gap: "8px", padding: "6px 8px", borderRadius: "6px", backgroundColor: P.gray50, marginBottom: 4, cursor: "pointer", transition: "background .15s" },
        onClick: function () { window.open(mdaFormUrl("msdyn_iotalert", a.msdyn_iotalertid), "_top"); },
        onMouseOver: function (e: any) { e.currentTarget.style.backgroundColor = P.gray100; },
        onMouseOut: function (e: any) { e.currentTarget.style.backgroundColor = P.gray50; },
      },
        React.createElement("div", { style: { width: 8, height: 8, transform: "rotate(45deg)", backgroundColor: at2.color, marginTop: 4, flexShrink: 0 } }),
        React.createElement("div", { style: { minWidth: 0, flex: 1 } },
          React.createElement(Text, { size: 200, style: { display: "block", color: P.gray700 } }, (a.msdyn_description || "").substring(0, 60)),
          React.createElement(Text, { size: 100, style: { color: P.gray400 } }, fmtDateTime(a.msdyn_alerttime))),
        React.createElement(OpenRegular, { style: { fontSize: 12, color: P.gray400, flexShrink: 0, marginTop: 2 } }),
      ));
    });
  }

  if (relatedCases.length > 0) {
    chainEls.push(React.createElement("div", { key: "cl", style: { marginTop: chainEls.length > 0 ? 8 : 0 } },
      React.createElement(Text, { size: 200, weight: "semibold", style: { color: P.violet, display: "block", marginBottom: 4 } },
        "関連サポート案件 (" + relatedCases.length + ")")));
    relatedCases.forEach(function (c, i) {
      var isR = Number(c.statecode) === 1 || Number(c.statecode) === 2;
      chainEls.push(React.createElement("div", { key: "c" + i, style: { display: "flex", gap: "8px", padding: "6px 8px", borderRadius: "6px", backgroundColor: P.gray50, marginBottom: 4, cursor: "pointer", transition: "background .15s" },
        onClick: function () { window.open(mdaFormUrl("incident", c.incidentid), "_top"); },
        onMouseOver: function (e: any) { e.currentTarget.style.backgroundColor = P.gray100; },
        onMouseOut: function (e: any) { e.currentTarget.style.backgroundColor = P.gray50; },
      },
        React.createElement("div", { style: { width: 8, height: 8, borderRadius: "50%", backgroundColor: isR ? P.green : P.violet, marginTop: 4, flexShrink: 0 } }),
        React.createElement("div", { style: { minWidth: 0, flex: 1 } },
          React.createElement(Text, { size: 200, style: { display: "block", color: P.gray700 } }, c.title || ""),
          React.createElement(Text, { size: 100, style: { color: P.gray400 } }, fmtDate(c.createdon) + " — " + (isR ? "解決済み" : "オープン"))),
        React.createElement(OpenRegular, { style: { fontSize: 12, color: P.gray400, flexShrink: 0, marginTop: 2 } }),
      ));
    });
  }

  if (relatedWOs.length > 0) {
    chainEls.push(React.createElement("div", { key: "wl", style: { marginTop: chainEls.length > 0 ? 8 : 0 } },
      React.createElement(Text, { size: 200, weight: "semibold", style: { color: P.blue, display: "block", marginBottom: 4 } },
        "関連作業指示書 (" + relatedWOs.length + ")")));
    relatedWOs.forEach(function (w, i) {
      var isDone = String(w.msdyn_systemstatus) === "690970005";
      chainEls.push(React.createElement("div", { key: "w" + i, style: { display: "flex", gap: "8px", padding: "6px 8px", borderRadius: "6px", backgroundColor: P.gray50, marginBottom: 4, cursor: "pointer", transition: "background .15s" },
        onClick: function () { window.open(mdaFormUrl("msdyn_workorder", w.msdyn_workorderid), "_top"); },
        onMouseOver: function (e: any) { e.currentTarget.style.backgroundColor = P.gray100; },
        onMouseOut: function (e: any) { e.currentTarget.style.backgroundColor = P.gray50; },
      },
        React.createElement("div", { style: { width: 10, height: 10, borderRadius: 3, backgroundColor: isDone ? P.green : P.blue, marginTop: 3, flexShrink: 0 } }),
        React.createElement("div", { style: { minWidth: 0, flex: 1 } },
          React.createElement(Text, { size: 200, style: { display: "block", color: P.gray700 } }, w.msdyn_name || ""),
          React.createElement(Text, { size: 100, style: { color: P.gray400 } }, fmtDate(w.msdyn_datewindowstart) + " — " + (isDone ? "完了" : "進行中"))),
        React.createElement(OpenRegular, { style: { fontSize: 12, color: P.gray400, flexShrink: 0, marginTop: 2 } }),
      ));
    });
  }

  return React.createElement("div", {
    style: {
      width: "320px", borderLeft: "1px solid " + P.gray200, backgroundColor: P.white,
      padding: "16px", overflow: "auto", maxHeight: "500px", borderRadius: "0 10px 10px 0", flexShrink: 0,
    },
  },
    React.createElement("div", {
      style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", paddingBottom: "8px", borderBottom: "1px solid " + P.gray200 },
    },
      React.createElement(Text, { size: 300, weight: "semibold", style: { color: P.gray800 } }, "詳細情報"),
      React.createElement(Button, { size: "small", appearance: "subtle", onClick: onClose }, "✕"),
    ),
    headerContent,
    chainEls.length > 0 ? React.createElement("div", {
      style: { marginTop: 16, paddingTop: 12, borderTop: "1px solid " + P.gray200 },
    },
      React.createElement(Text, { size: 200, weight: "semibold", style: { display: "block", marginBottom: 8, color: P.gray800 } }, "関連アイテム"),
      chainEls,
    ) : null,
  );
}

/* ========== D3 IoTアラート棒グラフ ========== */
function AlertBarChart(props: { alerts: AlertRow[] }) {
  var svgRef = useRef<SVGSVGElement>(null);
  var { alerts } = props;

  useEffect(function () {
    if (!svgRef.current || alerts.length === 0) return;
    var raf = requestAnimationFrame(function () {
      if (!svgRef.current) return;
      var svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();

      var W = 400, H = 200;
      svg.attr("width", W).attr("height", H);

      var byMonth: Record<string, number> = {};
      alerts.forEach(function (a) {
        var d = new Date(a.msdyn_alerttime);
        if (!isNaN(d.getTime())) {
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
        .attr("fill", P.coral).attr("rx", 3);

      g.selectAll(".label").data(data).enter().append("text")
        .attr("x", function (d: any) { return (x(d.month) || 0) + x.bandwidth() / 2; })
        .attr("y", function (d: any) { return y(d.count) - 4; })
        .attr("text-anchor", "middle").attr("font-size", "11px").attr("fill", P.gray700)
        .text(function (d: any) { return d.count; });
    });
    return function () { cancelAnimationFrame(raf); };
  }, [alerts]);

  return React.createElement("svg", { ref: svgRef });
}

/* ========== メインコンポーネント ========== */
var GeneratedComponent = function (props: GeneratedComponentProps) {
  var styles = useStyles();
  var dataApi = props.dataApi;

  /* ---- State ---- */
  var [loading, setLoading] = useState(true);
  var [allAssets, setAllAssets] = useState<AssetRow[]>([]);
  var [selectedAssetId, setSelectedAssetId] = useState<string>("");
  var [workOrders, setWorkOrders] = useState<WORow[]>([]);
  var [tasks, setTasks] = useState<TaskRow[]>([]);
  var [bookings, setBookings] = useState<BookingRow[]>([]);
  var [resources, setResources] = useState<ResourceRow[]>([]);
  var [alerts, setAlerts] = useState<AlertRow[]>([]);
  var [cases, setCases] = useState<CaseRow[]>([]);
  var [incidentTypes, setIncidentTypes] = useState<IncidentTypeRow[]>([]);
  var [activeTab, setActiveTab] = useState("gantt");
  var [expandedWO, setExpandedWO] = useState<string | null>(null);
  var [detailLoading, setDetailLoading] = useState(false);
  /* timeScale は FlowDiagram では不要 */
  var [selectedGanttItem, setSelectedGanttItem] = useState<SelectedGanttItem | null>(null);
  var [showAssetModal, setShowAssetModal] = useState(false);

  /* ---- URLハッシュからの初期資産ID ---- */
  var initialAssetId = useMemo(function () {
    try {
      var hash = window.location.hash || "";
      var m = hash.match(/assetId=([a-f0-9-]+)/i);
      if (m) return m[1];
    } catch (e) { /* ignore */ }
    return "f1c03c49-f741-f111-bec6-7c1e52244441";
  }, []);

  /* ---- 初回ロード: 全資産一覧 + リソース + インシデントタイプ ---- */
  useEffect(function () {
    var cancelled = false;
    (async function () {
      try {
        var assetRows = await loadAllRows<msdyn_customerasset>(dataApi, "msdyn_customerasset", {
          select: ["msdyn_customerassetid", "msdyn_name", "_msdyn_account_value",
            "msdyn_deviceid", "msdyn_alertcount", "msdyn_lastalerttime",
            "msdyn_latitude", "msdyn_longitude", "msdyn_registrationstatus"],
          orderBy: "msdyn_name asc",
        });
        if (cancelled) return;
        setAllAssets(assetRows);

        var initId = initialAssetId || (assetRows.length > 0 ? assetRows[0].msdyn_customerassetid : "");
        setSelectedAssetId(initId);

        var resRows = await loadAllRows<bookableresource>(dataApi, "bookableresource", {
          select: ["bookableresourceid", "name"],
        });
        if (!cancelled) setResources(resRows);

        var itRows = await loadAllRows<msdyn_incidenttype>(dataApi, "msdyn_incidenttype", {
          select: ["msdyn_incidenttypeid", "msdyn_name"],
        });
        if (!cancelled) setIncidentTypes(itRows);

      } catch (e) {
        console.error("Asset list load error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return function () { cancelled = true; };
  }, [dataApi, initialAssetId]);

  /* ---- 資産選択時に詳細データロード ---- */
  var loadAssetDetails = useCallback(function (assetId: string) {
    if (!assetId) return;
    setDetailLoading(true);
    setExpandedWO(null);

    (async function () {
      try {
        var woRows = await loadAllRows<msdyn_workorder>(dataApi, "msdyn_workorder", {
          select: ["msdyn_workorderid", "msdyn_name", "msdyn_workordersummary",
            "msdyn_instructions", "msdyn_systemstatus", "msdyn_datewindowstart",
            "msdyn_datewindowend", "_msdyn_primaryincidenttype_value",
            "_msdyn_serviceaccount_value", "_msdyn_workordertype_value",
            "_msdyn_servicerequest_value", "_msdyn_iotalert_value",
            "createdon"],
          filter: "_msdyn_customerasset_value eq '" + assetId + "'",
          orderBy: "msdyn_datewindowstart desc",
        });
        setWorkOrders(woRows);

        var woIds = woRows.map(function (w) { return w.msdyn_workorderid; });
        var allTasks: TaskRow[] = [];
        for (var bi = 0; bi < woIds.length; bi += 5) {
          var batch = woIds.slice(bi, bi + 5);
          var filterParts = batch.map(function (id) { return "_msdyn_workorder_value eq '" + id + "'"; });
          var batchTasks = await loadAllRows<msdyn_workorderservicetask>(dataApi, "msdyn_workorderservicetask", {
            select: ["msdyn_workorderservicetaskid", "msdyn_name", "msdyn_lineorder",
              "msdyn_percentcomplete", "_msdyn_workorder_value", "_msdyn_tasktype_value",
              "msdyn_estimatedduration"],
            filter: filterParts.join(" or "),
            orderBy: "msdyn_lineorder asc",
          });
          allTasks = allTasks.concat(batchTasks);
        }
        setTasks(allTasks);

        var bookingRows = await loadAllRows<bookableresourcebooking>(dataApi, "bookableresourcebooking", {
          select: ["bookableresourcebookingid", "name", "starttime", "endtime",
            "_msdyn_workorder_value", "_resource_value", "_bookingstatus_value"],
          filter: woIds.length > 0 ? woIds.map(function (id) { return "_msdyn_workorder_value eq '" + id + "'"; }).join(" or ") : "bookableresourcebookingid eq '00000000-0000-0000-0000-000000000000'",
        });
        setBookings(bookingRows);

        var alertRows = await loadAllRows<msdyn_iotalert>(dataApi, "msdyn_iotalert", {
          select: ["msdyn_iotalertid", "msdyn_description", "msdyn_alerttime",
            "msdyn_alerttype", "msdyn_alertdata",
            "_msdyn_workorder_value", "_msdyn_customerasset_value",
            "_msdyn_case_value"],
          filter: "_msdyn_customerasset_value eq '" + assetId + "'",
          orderBy: "msdyn_alerttime desc",
        });
        setAlerts(alertRows);

        var caseIds: string[] = [];
        woRows.forEach(function (wo) {
          var cid = fkId((wo as any)._msdyn_servicerequest_value);
          if (cid && caseIds.indexOf(cid) === -1) caseIds.push(cid);
        });
        alertRows.forEach(function (a) {
          var cid = fkId(a._msdyn_case_value);
          if (cid && caseIds.indexOf(cid) === -1) caseIds.push(cid);
        });
        if (caseIds.length > 0) {
          var caseFilter = caseIds.map(function (id) { return "incidentid eq '" + id + "'"; }).join(" or ");
          var caseRows = await loadAllRows<incident>(dataApi, "incident", {
            select: ["incidentid", "title", "description", "prioritycode",
              "createdon", "statecode"],
            filter: caseFilter,
          });
          setCases(caseRows);
        } else {
          setCases([]);
        }

      } catch (e) {
        console.error("Detail load error:", e);
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [dataApi]);

  useEffect(function () {
    if (selectedAssetId) {
      loadAssetDetails(selectedAssetId);
    }
  }, [selectedAssetId, loadAssetDetails]);

  var asset = useMemo(function () {
    return allAssets.find(function (a) { return a.msdyn_customerassetid === selectedAssetId; }) || null;
  }, [allAssets, selectedAssetId]);

  /* ---- 名前解決マップ ---- */
  var resourceMap = useMemo(function () {
    var m = new Map<string, string>();
    resources.forEach(function (r) { m.set(r.bookableresourceid, r.name); });
    return m;
  }, [resources]);

  var incidentTypeMap = useMemo(function () {
    var m = new Map<string, string>();
    incidentTypes.forEach(function (it) { m.set(it.msdyn_incidenttypeid, it.msdyn_name); });
    return m;
  }, [incidentTypes]);

  var tasksByWO = useMemo(function () {
    var m = new Map<string, TaskRow[]>();
    tasks.forEach(function (t) {
      var woid = fkId(t._msdyn_workorder_value);
      if (!woid) return;
      var arr = m.get(woid) || [];
      arr.push(t);
      m.set(woid, arr);
    });
    m.forEach(function (arr) {
      arr.sort(function (a, b) { return (a.msdyn_lineorder || 0) - (b.msdyn_lineorder || 0); });
    });
    return m;
  }, [tasks]);

  var bookingByWO = useMemo(function () {
    var m = new Map<string, BookingRow>();
    bookings.forEach(function (b) {
      var woid = fkId(b._msdyn_workorder_value);
      if (woid) m.set(woid, b);
    });
    return m;
  }, [bookings]);

  /* ---- KPI計算 ---- */
  var kpis = useMemo(function () {
    var totalWO = workOrders.length;
    var completedWO = workOrders.filter(function (wo) {
      return String(wo.msdyn_systemstatus) === "690970005";
    }).length;
    var openWO = totalWO - completedWO;
    var totalAlerts = alerts.length;
    var anomalyAlerts = alerts.filter(function (a) { return Number(a.msdyn_alerttype) === 192350000; }).length;
    var avgTaskCompletion = tasks.length > 0
      ? Math.round(tasks.reduce(function (s, t) { return s + (t.msdyn_percentcomplete || 0); }, 0) / tasks.length)
      : 0;
    return { totalWO: totalWO, completedWO: completedWO, openWO: openWO, totalAlerts: totalAlerts, anomalyAlerts: anomalyAlerts, avgTaskCompletion: avgTaskCompletion };
  }, [workOrders, alerts, tasks]);

  /* ---- ローディング ---- */
  if (loading) {
    return React.createElement("div", {
      style: { display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px" },
    },
      React.createElement(Spinner, { size: "medium" }),
      React.createElement(Text, { size: 400 }, "データを読み込み中...")
    );
  }

  /* ---- 資産セレクタバー ---- */
  var selectorEl = React.createElement("div", { className: styles.selectorBar },
    React.createElement(BuildingRegular, { style: { fontSize: 20, color: P.blue } }),
    React.createElement(Text, { size: 300, weight: "semibold", style: { color: P.gray700, whiteSpace: "nowrap" } }, "資産選択:"),
    React.createElement(Dropdown, {
      placeholder: "資産を選択...",
      value: asset ? asset.msdyn_name || "" : "",
      selectedOptions: selectedAssetId ? [selectedAssetId] : [],
      onOptionSelect: function (_: any, data: any) {
        if (data.optionValue) setSelectedAssetId(data.optionValue);
      },
      style: { minWidth: "280px", maxWidth: "400px" },
    },
      allAssets.map(function (a) {
        return React.createElement(Option, {
          key: a.msdyn_customerassetid,
          value: a.msdyn_customerassetid,
          text: a.msdyn_name || "",
        },
          React.createElement("div", { style: { display: "flex", flexDirection: "column" } },
            React.createElement(Text, { size: 200, weight: "semibold" }, a.msdyn_name || ""),
            React.createElement(Text, { size: 100, style: { color: P.gray400 } },
              (a.msdyn_deviceid ? "Device: " + a.msdyn_deviceid : "") +
              (a.msdyn_alertcount ? "  アラート: " + a.msdyn_alertcount : "")
            ),
          )
        );
      })
    ),
    React.createElement(Text, { size: 200, style: { color: P.gray400 } },
      allAssets.length + " 件の資産"),
    detailLoading ? React.createElement(Spinner, { size: "tiny" }) : null,
  );

  if (!asset) {
    return React.createElement("div", { className: styles.root },
      selectorEl,
      React.createElement("div", {
        style: { display: "flex", alignItems: "center", justifyContent: "center", flex: 1, gap: "8px" },
      },
        React.createElement(WarningRegular, { style: { fontSize: 24, color: P.amber } }),
        React.createElement(Text, { size: 400 }, "資産を選択してください")
      ),
    );
  }

  /* ---- ヘッダー ---- */
  var headerEl = React.createElement("div", { className: styles.header },
    React.createElement("div", {
      style: {
        width: 48, height: 48, borderRadius: "12px", backgroundColor: P.blueLight,
        display: "flex", alignItems: "center", justifyContent: "center",
      },
    }, React.createElement(BuildingRegular, { style: { fontSize: 24, color: P.blue } })),
    React.createElement("div", { className: styles.headerInfo },
      React.createElement(Text, { size: 500, weight: "bold", style: { color: P.gray900 } }, asset.msdyn_name || ""),
      React.createElement("div", { style: { display: "flex", gap: "16px", flexWrap: "wrap" } },
        asset.msdyn_deviceid ? React.createElement(Text, { size: 200, style: { color: P.gray500 } },
          "デバイスID: " + asset.msdyn_deviceid) : null,
        React.createElement(Text, { size: 200, style: { color: P.gray500 } },
          "アラート数: " + (asset.msdyn_alertcount || 0)),
        asset.msdyn_lastalerttime ? React.createElement(Text, { size: 200, style: { color: P.gray500 } },
          "最終アラート: " + fmtDate(asset.msdyn_lastalerttime)) : null,
      )
    ),
    React.createElement(Button, {
      size: "small",
      appearance: "subtle",
      icon: React.createElement(OpenRegular, null),
      style: { color: P.blue, flexShrink: 0 },
      onClick: function () { setShowAssetModal(true); },
    }, "資産詳細"),
  );

  /* ---- KPI カード ---- */
  var kpiData = [
    { label: "作業指示書", value: String(kpis.totalWO), sub: kpis.completedWO + " 完了", color: P.blue, bg: P.blueLight },
    { label: "未完了WO", value: String(kpis.openWO), sub: "対応予定", color: kpis.openWO > 0 ? P.amber : P.green, bg: kpis.openWO > 0 ? P.amberLight : P.greenLight },
    { label: "IoTアラート", value: String(kpis.totalAlerts), sub: kpis.anomalyAlerts + " 異常", color: kpis.anomalyAlerts > 0 ? P.red : P.teal, bg: kpis.anomalyAlerts > 0 ? P.coralLight : P.tealLight },
    { label: "タスク完了率", value: kpis.avgTaskCompletion + "%", sub: tasks.length + " タスク", color: P.teal, bg: P.tealLight },
  ];

  var kpiEl = React.createElement("div", { className: styles.kpiRow },
    kpiData.map(function (kpi, i) {
      return React.createElement("div", { key: i, className: styles.kpiCard, style: { borderLeft: "3px solid " + kpi.color } },
        React.createElement(Text, { size: 200, style: { color: P.gray500 } }, kpi.label),
        React.createElement(Text, { size: 600, weight: "bold", style: { color: kpi.color } }, kpi.value),
        React.createElement(Text, { size: 100, style: { color: P.gray400 } }, kpi.sub),
      );
    })
  );

  /* ---- タブバー ---- */
  var tabBarEl = React.createElement("div", { className: styles.tabBar },
    React.createElement(TabList, {
      selectedValue: activeTab,
      onTabSelect: function (_: any, d: any) { setActiveTab(d.value); },
      size: "small",
    },
      TABS.map(function (tab) {
        return React.createElement(Tab, { key: tab.key, value: tab.key, icon: React.createElement(tab.icon, null) }, tab.label);
      })
    )
  );

  /* ---- タブコンテンツ ---- */
  var tabContentEl: React.ReactElement | null = null;

  if (activeTab === "gantt") {
    tabContentEl = React.createElement("div", null,
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } },
        React.createElement(Text, { size: 400, weight: "semibold", style: { color: P.gray800 } },
          "IoTアラート → サポート案件 → 作業指示書 フロー"),
      ),
      React.createElement("div", { style: { display: "flex", gap: "0" } },
        React.createElement("div", { style: { flex: 1, minWidth: 0, overflow: "auto" } },
          React.createElement(FlowDiagram, {
            workOrders: workOrders,
            alerts: alerts,
            cases: cases,
            incidentTypeMap: incidentTypeMap,
            bookingByWO: bookingByWO,
            resourceMap: resourceMap,
            onItemClick: function (type: string, id: string) { setSelectedGanttItem({ type: type, id: id }); },
            selectedItem: selectedGanttItem,
          }),
        ),
        selectedGanttItem ? React.createElement(DetailSidebar, {
          item: selectedGanttItem,
          workOrders: workOrders,
          alerts: alerts,
          cases: cases,
          incidentTypeMap: incidentTypeMap,
          bookingByWO: bookingByWO,
          resourceMap: resourceMap,
          onClose: function () { setSelectedGanttItem(null); },
        }) : null,
      ),
    );
  }

  if (activeTab === "workorders") {
    tabContentEl = React.createElement("div", null,
      workOrders.length === 0
        ? React.createElement(Text, { size: 300, style: { color: P.gray400 } }, "作業指示書がありません")
        : workOrders.map(function (wo) {
            var woId = wo.msdyn_workorderid;
            var isExpanded = expandedWO === woId;
            var isCompleted = String(wo.msdyn_systemstatus) === "690970005";
            var itName = incidentTypeMap.get(fkId(wo._msdyn_primaryincidenttype_value)) || "";
            var booking = bookingByWO.get(woId);
            var resourceName = booking ? (resourceMap.get(fkId(booking._resource_value)) || "") : "";
            var woTasks = tasksByWO.get(woId) || [];

            return React.createElement("div", { key: woId },
              React.createElement("div", {
                className: styles.woCard,
                onClick: function () { setExpandedWO(isExpanded ? null : woId); },
                style: { borderLeft: "3px solid " + (isCompleted ? P.green : P.blue) },
              },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
                  isExpanded
                    ? React.createElement(ChevronDownRegular, { style: { fontSize: 14, color: P.gray400 } })
                    : React.createElement(ChevronRightRegular, { style: { fontSize: 14, color: P.gray400 } }),
                  React.createElement(Text, { size: 300, weight: "semibold" }, wo.msdyn_name || ""),
                  React.createElement(Badge, {
                    appearance: "filled",
                    color: isCompleted ? "success" : "brand",
                    size: "small",
                  }, isCompleted ? "完了" : "予定"),
                  itName ? React.createElement(Badge, { appearance: "outline", size: "small" }, itName) : null,
                ),
                React.createElement("div", { style: { display: "flex", gap: "16px", marginTop: 4 } },
                  React.createElement(Text, { size: 100, style: { color: P.gray400 } },
                    fmtDate(wo.msdyn_datewindowstart) + " (" + daysAgo(wo.msdyn_datewindowstart) + ")"),
                  React.createElement(Text, { size: 100, style: { color: P.gray400 } },
                    "担当: " + resourceName),
                  React.createElement(Text, { size: 100, style: { color: P.gray400 } },
                    "タスク: " + woTasks.length + "件"),
                ),
                wo.msdyn_workordersummary
                  ? React.createElement(Text, { size: 200, style: { color: P.gray500, marginTop: 4, display: "block" } },
                      String(wo.msdyn_workordersummary).substring(0, 120))
                  : null,
              ),
              isExpanded && woTasks.length > 0
                ? React.createElement("div", { className: styles.expandedTasks },
                    woTasks.map(function (task, ti) {
                      var pct = task.msdyn_percentcomplete || 0;
                      var isDone = pct >= 100;
                      return React.createElement("div", { key: ti, className: styles.taskRow },
                        React.createElement("div", {
                          style: {
                            width: 20, height: 20, borderRadius: "50%",
                            backgroundColor: isDone ? P.green : P.gray200,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, color: P.white,
                          },
                        }, isDone ? "✓" : String(task.msdyn_lineorder || ti + 1)),
                        React.createElement(Text, { size: 200, style: { flex: 1, color: P.gray800 } }, task.msdyn_name || ""),
                        React.createElement("div", {
                          style: { width: 60, height: 6, borderRadius: 3, backgroundColor: P.gray200, overflow: "hidden" },
                        },
                          React.createElement("div", {
                            style: { width: pct + "%", height: "100%", backgroundColor: isDone ? P.green : P.blue, borderRadius: 3 },
                          })
                        ),
                        React.createElement(Text, { size: 100, style: { color: P.gray400, width: 36, textAlign: "right" } }, pct + "%"),
                      );
                    })
                  )
                : null,
            );
          })
    );
  }

  if (activeTab === "alerts") {
    tabContentEl = React.createElement("div", null,
      alerts.length === 0
        ? React.createElement(Text, { size: 300, style: { color: P.gray400 } }, "IoTアラートがありません")
        : alerts.map(function (alert, i) {
            var at = alertTypeLabel(alert.msdyn_alerttype);
            var woName = "";
            if (alert._msdyn_workorder_value) {
              var woId = fkId(alert._msdyn_workorder_value);
              var wo = workOrders.find(function (w) { return w.msdyn_workorderid === woId; });
              if (wo) woName = wo.msdyn_name || "";
            }
            return React.createElement("div", { key: i, className: styles.alertRow },
              React.createElement("div", {
                style: { padding: "2px 8px", borderRadius: 4, backgroundColor: at.bg, fontSize: 11, fontWeight: 600, color: at.color, whiteSpace: "nowrap" },
              }, at.label),
              React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                React.createElement(Text, { size: 200, weight: "semibold", style: { display: "block", color: P.gray800 } },
                  (alert.msdyn_description || "").substring(0, 80)),
                React.createElement("div", { style: { display: "flex", gap: "12px", marginTop: 2 } },
                  React.createElement(Text, { size: 100, style: { color: P.gray400 } }, fmtDateTime(alert.msdyn_alerttime)),
                  woName ? React.createElement(Text, { size: 100, style: { color: P.blue } }, "→ " + woName) : null,
                ),
              ),
            );
          })
    );
  }

  if (activeTab === "cases") {
    tabContentEl = React.createElement("div", null,
      cases.length === 0
        ? React.createElement(Text, { size: 300, style: { color: P.gray400 } }, "サポート案件がありません")
        : cases.map(function (c, i) {
            var isResolved = Number(c.statecode) === 1 || Number(c.statecode) === 2;
            var priorityColor = Number(c.prioritycode) === 1 ? P.red : P.amber;
            return React.createElement("div", { key: i, className: styles.caseRow },
              React.createElement("div", {
                style: { width: 8, height: 8, borderRadius: "50%", backgroundColor: priorityColor, marginTop: 6, flexShrink: 0 },
              }),
              React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                React.createElement("div", { style: { display: "flex", gap: "8px", alignItems: "center" } },
                  React.createElement(Text, { size: 200, weight: "semibold", style: { color: P.gray800 } }, c.title || ""),
                  React.createElement(Badge, {
                    appearance: "filled",
                    color: isResolved ? "success" : "warning",
                    size: "small",
                  }, isResolved ? "解決済み" : "オープン"),
                ),
                React.createElement(Text, { size: 100, style: { color: P.gray400, display: "block", marginTop: 2 } },
                  fmtDate(c.createdon) + " — " + String(c.description || "").substring(0, 100)),
              ),
            );
          })
    );
  }

  if (activeTab === "chart") {
    tabContentEl = React.createElement("div", null,
      React.createElement("div", { className: styles.chartContainer },
        React.createElement(Text, { size: 400, weight: "semibold", style: { display: "block", marginBottom: 12 } },
          "IoTアラート (月別)"),
        alerts.length > 0
          ? React.createElement(AlertBarChart, { alerts: alerts })
          : React.createElement(Text, { size: 200, style: { color: P.gray400 } }, "アラートデータがありません"),
      ),
    );
  }

  /* ---- 資産詳細モーダル ---- */
  var assetModalEl = React.createElement(Dialog, {
    open: showAssetModal,
    onOpenChange: function (_: any, data: any) { setShowAssetModal(data.open); },
  },
    React.createElement(DialogSurface, { style: { maxWidth: "540px" } },
      React.createElement(DialogBody, null,
        React.createElement(DialogTitle, null,
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "12px" } },
            React.createElement("div", {
              style: {
                width: 40, height: 40, borderRadius: "10px", backgroundColor: P.blueLight,
                display: "flex", alignItems: "center", justifyContent: "center",
              },
            }, React.createElement(BuildingRegular, { style: { fontSize: 20, color: P.blue } })),
            React.createElement("div", null,
              React.createElement(Text, { size: 400, weight: "bold", style: { display: "block", color: P.gray900 } }, asset.msdyn_name || ""),
              React.createElement(Text, { size: 200, style: { color: P.gray500 } }, "顧客資産"),
            ),
          ),
        ),
        React.createElement(DialogContent, null,
          React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "12px", padding: "8px 0" } },
            /* 資産情報の詳細カード */
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" } },
              React.createElement("div", { style: { padding: "10px 14px", borderRadius: 8, backgroundColor: P.gray50 } },
                React.createElement(Text, { size: 100, style: { display: "block", color: P.gray400, marginBottom: 2 } }, "デバイスID"),
                React.createElement(Text, { size: 200, weight: "semibold", style: { color: P.gray800 } }, asset.msdyn_deviceid || "—"),
              ),
              React.createElement("div", { style: { padding: "10px 14px", borderRadius: 8, backgroundColor: P.gray50 } },
                React.createElement(Text, { size: 100, style: { display: "block", color: P.gray400, marginBottom: 2 } }, "アラート数"),
                React.createElement(Text, { size: 200, weight: "semibold", style: { color: P.gray800 } }, String(asset.msdyn_alertcount || 0)),
              ),
              React.createElement("div", { style: { padding: "10px 14px", borderRadius: 8, backgroundColor: P.gray50 } },
                React.createElement(Text, { size: 100, style: { display: "block", color: P.gray400, marginBottom: 2 } }, "最終アラート"),
                React.createElement(Text, { size: 200, weight: "semibold", style: { color: P.gray800 } }, fmtDate(asset.msdyn_lastalerttime)),
              ),
              React.createElement("div", { style: { padding: "10px 14px", borderRadius: 8, backgroundColor: P.gray50 } },
                React.createElement(Text, { size: 100, style: { display: "block", color: P.gray400, marginBottom: 2 } }, "登録ステータス"),
                React.createElement(Text, { size: 200, weight: "semibold", style: { color: P.gray800 } },
                  asset.msdyn_registrationstatus != null ? String(asset.msdyn_registrationstatus) : "—"),
              ),
            ),
            /* 位置情報 */
            (asset.msdyn_latitude || asset.msdyn_longitude) ? React.createElement("div", { style: { padding: "10px 14px", borderRadius: 8, backgroundColor: P.gray50 } },
              React.createElement(Text, { size: 100, style: { display: "block", color: P.gray400, marginBottom: 2 } }, "位置情報"),
              React.createElement(Text, { size: 200, weight: "semibold", style: { color: P.gray800 } },
                "緯度: " + (asset.msdyn_latitude || "—") + "  経度: " + (asset.msdyn_longitude || "—")),
            ) : null,
            /* KPI サマリー */
            React.createElement("div", { style: { padding: "12px 14px", borderRadius: 8, backgroundColor: P.blueLight, border: "1px solid " + P.blue + "22" } },
              React.createElement(Text, { size: 200, weight: "semibold", style: { display: "block", color: P.blue, marginBottom: 4 } }, "この資産の概要"),
              React.createElement("div", { style: { display: "flex", gap: "16px", flexWrap: "wrap" } },
                React.createElement(Text, { size: 200, style: { color: P.gray700 } }, "WO: " + kpis.totalWO + "件 (" + kpis.completedWO + "完了)"),
                React.createElement(Text, { size: 200, style: { color: P.gray700 } }, "アラート: " + kpis.totalAlerts + "件"),
                React.createElement(Text, { size: 200, style: { color: P.gray700 } }, "案件: " + cases.length + "件"),
              ),
            ),
          ),
        ),
        React.createElement(DialogActions, null,
          React.createElement(Button, {
            appearance: "primary",
            icon: React.createElement(OpenRegular, null),
            onClick: function () {
              window.open(mdaFormUrl("msdyn_customerasset", asset.msdyn_customerassetid), "_top");
            },
          }, "資産フォームを開く"),
          React.createElement(Button, {
            appearance: "secondary",
            onClick: function () { setShowAssetModal(false); },
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
    assetModalEl,
  );
};

export default GeneratedComponent;