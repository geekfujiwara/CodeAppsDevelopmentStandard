# Generative Pages モダンデザインシステム

Generative Pages のモダン UI デザインパターン。Fluent UI V9 コンポーネント + カスタムインラインスタイル + D3.js チャートで、ビジネスグレードの洗練された UI を構築する。

> **前提**: `generative-page-dev` スキル（基本ルール・DataAPI・デプロイ手順）を先に読み込むこと。
> 本スキルはデザイン面に特化したリファレンスである。

---

## カラーパレット（全ページ共通）

Tailwind CSS のカラースケールを参考に、ビジネスアプリ向けに最適化したパレット。
`var P = { ... }` としてコンポーネント外に定義する。

```typescript
var P = {
  /* プライマリ */
  blue: "#2563eb",       // アクション・選択状態・リンク
  blueDark: "#1d4ed8",   // ホバー・グラデーション終点
  blueLight: "#dbeafe",  // 選択行背景・バッジ背景

  /* セカンダリ（実績・成功） */
  teal: "#0d9488",       // 実績バー・成功トースト
  tealLight: "#ccfbf1",  // 実績バッジ背景

  /* アラート */
  coral: "#dc2626",      // 差戻し・エラー
  coralLight: "#fee2e2", // 差戻しバッジ背景

  /* 警告 */
  amber: "#d97706",      // 提出済・保留
  amberLight: "#fef3c7", // 保留バッジ背景

  /* ステータス */
  red: "#dc2626",        // 現在時刻マーカー・削除
  green: "#16a34a",      // 完了・承認
  greenLight: "#dcfce7", // 完了バッジ背景

  /* ニュートラル */
  gray50: "#f9fafb",     // テーブルヘッダー背景・偶数行
  gray100: "#f3f4f6",    // 区切り線（薄）
  gray200: "#e5e7eb",    // 区切り線・ボーダー
  gray300: "#d1d5db",    // セカンダリボーダー
  gray400: "#9ca3af",    // プレースホルダー・補助テキスト
  gray500: "#6b7280",    // ラベル・サブテキスト
  gray700: "#374151",    // 本文テキスト
  gray800: "#1f2937",    // セクションタイトル
  gray900: "#111827",    // ページタイトル
  white: "#ffffff",
};
```

### カラー使い分けルール

| 用途 | カラー | 例 |
|------|--------|-----|
| プライマリアクション | `P.blue` → `P.blueDark` グラデーション | 承認ボタン、一括承認ボタン |
| セカンダリアクション | `P.white` + `P.gray300` ボーダー | 差戻しボタン、キャンセル |
| 成功フィードバック | `P.teal` → `#0f766e` グラデーション | トースト通知 |
| 危険アクション | `P.red` | 削除ボタン、差戻し確定 |
| ステータスバッジ | 背景: `xxxLight` + 文字: `xxx` | 承認済=green、差戻し=coral、提出済=amber |

---

## セクションカード

カード型セクションの標準パターン。`border-radius: 12px` + 微かな影 + グラデーションヘッダー。

```typescript
/* セクション外枠 */
React.createElement("div", {
  style: {
    borderRadius: 12,
    overflow: "hidden",
    border: "1px solid " + P.gray200,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
},
  /* セクションヘッダー */
  React.createElement("div", {
    style: {
      padding: "12px 16px",
      background: "linear-gradient(135deg, " + P.gray50 + ", " + P.white + ")",
      borderBottom: "1px solid " + P.gray200,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    },
  },
    React.createElement("div", {
      style: { fontSize: 14, fontWeight: 600, color: P.gray800 },
    }, "セクションタイトル"),
    /* オプション: カウントバッジ */
    React.createElement("div", {
      style: {
        padding: "2px 10px", borderRadius: 12,
        backgroundColor: P.blueLight, color: P.blue,
        fontSize: 12, fontWeight: 600,
      },
    }, "12"),
  ),
  /* セクション本文 */
  // ...
)
```

---

## ステータスバッジ（ピル型）

ネイティブ `<span>` + インラインスタイルでピル型バッジを実装。Fluent UI `Badge` は色のカスタマイズが制限されるため使用しない。

```typescript
React.createElement("span", {
  style: {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
    backgroundColor:
      status === "approved" ? P.greenLight :
      status === "returned" ? P.coralLight : P.amberLight,
    color:
      status === "approved" ? P.green :
      status === "returned" ? P.coral : P.amber,
  },
}, statusLabel)
```

---

## ボタンスタイル

### プライマリボタン（グラデーション + シャドウ）

```typescript
React.createElement("button", {
  onClick: handleAction,
  style: {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "5px 14px", borderRadius: 8, border: "none",
    cursor: "pointer", outline: "none",
    background: "linear-gradient(135deg, " + P.blue + ", " + P.blueDark + ")",
    color: P.white, fontSize: 12, fontWeight: 600,
    boxShadow: "0 1px 4px rgba(37,99,235,0.25)",
  },
}, "\u2713 承認")
```

### セカンダリボタン（アウトライン）

```typescript
React.createElement("button", {
  onClick: handleSecondary,
  style: {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "5px 12px", borderRadius: 8,
    border: "1.5px solid " + P.gray300,
    backgroundColor: P.white, color: P.gray500,
    fontSize: 12, fontWeight: 500,
    cursor: "pointer", outline: "none",
  },
}, "\u00D7 差戻し")
```

### Fluent UI Button との使い分け

| 場面 | 使用するボタン |
|------|---------------|
| ツールバー（更新・タブ切替） | Fluent UI `Button` (appearance="subtle") |
| テーブル行内のアクション | ネイティブ `<button>` + カスタムスタイル |
| ダイアログのアクション | Fluent UI `Button` (appearance="primary"/"secondary") |
| 日付ナビゲーション | ネイティブ `<button>` + ピル型スタイル |
| 一括操作（一括承認等） | Fluent UI `Button` + グラデーション style オーバーライド |

---

## 日付ナビゲーション

データがある日付をピル型ボタンで横並び表示。選択中・完了・差戻し有りで色分け。

```typescript
React.createElement("div", {
  style: {
    display: "flex", flexDirection: "column", gap: 10,
    padding: "14px 18px", borderRadius: 12,
    background: "linear-gradient(135deg, " + P.gray50 + " 0%, " + P.white + " 100%)",
    border: "1px solid " + P.gray200,
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  },
},
  React.createElement("div", {
    style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  },
    /* ラベルバッジ */
    React.createElement("div", {
      style: {
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "4px 10px", borderRadius: 6,
        backgroundColor: P.blue, color: P.white,
        fontSize: 11, fontWeight: 600, letterSpacing: "0.3px",
      },
    },
      React.createElement(CalendarRegular, { style: { fontSize: 14 } }),
      "日報がある日付",
    ),
    /* 日付ボタン群 */
    dates.map(function (d) {
      var isSel = d.dateStr === selectedDate;
      var bg = isSel ? P.blue : d.allDone ? P.greenLight : d.returnedCount > 0 ? P.coralLight : P.white;
      var fg = isSel ? P.white : d.allDone ? P.green : d.returnedCount > 0 ? P.coral : P.gray700;
      var bd = isSel ? P.blue : d.allDone ? P.green : d.returnedCount > 0 ? P.coral : P.gray300;
      return React.createElement("button", {
        key: d.dateStr,
        onClick: function () { setSelectedDate(d.dateStr); },
        style: {
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "5px 12px", borderRadius: 20,
          border: "1.5px solid " + bd, backgroundColor: bg, color: fg,
          fontSize: 12, fontWeight: isSel ? 700 : 500,
          cursor: "pointer", outline: "none",
          boxShadow: isSel ? "0 2px 8px rgba(37,99,235,0.3)" : "none",
          transition: "all 0.2s ease",
        },
      },
        d.displayDate,
        !isSel && d.returnedCount > 0 ? React.createElement("span", { style: { fontSize: 10 } }, "\u26a0") : null,
        !isSel && d.allDone ? React.createElement("span", { style: { fontSize: 10 } }, "\u2713") : null,
      );
    }),
  ),
)
```

### 日付ボタンの色分けルール

| 状態 | 背景 | 文字 | ボーダー | アイコン |
|------|------|------|---------|---------|
| 選択中 | `P.blue` | `P.white` | `P.blue` | — |
| 全完了 | `P.greenLight` | `P.green` | `P.green` | ✓ |
| 差戻し有 | `P.coralLight` | `P.coral` | `P.coral` | ⚠ |
| 通常 | `P.white` | `P.gray700` | `P.gray300` | — |

---

## テーブルスタイル（makeStyles）

```typescript
var useStyles = makeStyles({
  tableRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: "10px 16px",
    borderBottom: "1px solid " + P.gray100,
    fontSize: "13px",
    cursor: "pointer",
    transition: "background-color 0.15s ease",
    ":hover": {
      backgroundColor: P.blueLight,
    },
  },
  tableHeader: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    padding: "10px 16px",
    borderBottom: "2px solid " + P.gray200,
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    backgroundColor: P.gray50,
    color: P.gray500,
  },
});
```

### テーブルの設計ルール

- ヘッダー: `uppercase` + `letterSpacing: 0.5px` + `gray50` 背景
- 行ホバー: `blueLight` で行全体をハイライト
- 番号列: 固定幅 36px + `P.gray400`
- ステータス列: ピル型バッジ（上述）
- アクション列: ネイティブボタン（上述）
- 行クリック: 詳細ダイアログを開く

---

## ガントチャート D3 デザイン

### バーのスタイル

二重レイヤー構造: 影バー（半透明）+ メインバー（不透明）でドロップシャドウ効果。

```typescript
/* 計画バー（青） */
// 影レイヤー
svg.append("rect")
  .attr("x", px1 + 1).attr("y", yBase + 5)
  .attr("width", pw).attr("height", 18)
  .attr("fill", "rgba(37,99,235,0.12)").attr("rx", 4);
// メインバー
svg.append("rect")
  .attr("x", px1).attr("y", yBase + 4)
  .attr("width", pw).attr("height", 18)
  .attr("fill", P.blue).attr("opacity", 0.85).attr("rx", 4);

/* 実績バー（ティール） */
// 影レイヤー
svg.append("rect")
  .attr("x", ax1 + 1).attr("y", yBase + 27)
  .attr("width", aw).attr("height", 18)
  .attr("fill", "rgba(13,148,136,0.12)").attr("rx", 4);
// メインバー
svg.append("rect")
  .attr("x", ax1).attr("y", yBase + 26)
  .attr("width", aw).attr("height", 18)
  .attr("fill", P.teal).attr("opacity", 0.9).attr("rx", 4);
```

### バー内ラベル

```typescript
if (barWidth > 50) {
  svg.append("text")
    .attr("x", x + 6).attr("y", yBase + 16)
    .attr("font-size", "10px").attr("fill", "#fff")
    .attr("font-weight", "500")
    .attr("pointer-events", "none")
    .text(label.substring(0, Math.floor((barWidth - 10) / 6)));
}
```

### 現在時刻マーカー

```typescript
var now = new Date();
if (now >= xStart && now <= xEnd) {
  var nowX = xScale(now);
  svg.append("line")
    .attr("x1", nowX).attr("y1", 0)
    .attr("x2", nowX).attr("y2", totalH)
    .attr("stroke", P.red).attr("stroke-width", 2)
    .attr("stroke-dasharray", "6,3").attr("opacity", 0.7);
  svg.append("circle")
    .attr("cx", nowX).attr("cy", 6).attr("r", 4)
    .attr("fill", P.red);
}
```

### 凡例

```typescript
React.createElement("div", {
  style: { display: "flex", gap: 20, fontSize: 12, alignItems: "center" },
},
  React.createElement("div", {
    style: { display: "flex", alignItems: "center", gap: 6 },
  },
    React.createElement("div", {
      style: {
        width: 24, height: 10, borderRadius: 4,
        background: "linear-gradient(90deg, " + P.blue + ", #3b82f6)",
        opacity: 0.85,
      },
    }),
    React.createElement("span", {
      style: { color: P.gray500, fontWeight: 500 },
    }, "計画"),
  ),
  React.createElement("div", {
    style: { display: "flex", alignItems: "center", gap: 6 },
  },
    React.createElement("div", {
      style: {
        width: 24, height: 10, borderRadius: 4,
        background: "linear-gradient(90deg, " + P.teal + ", #14b8a6)",
        opacity: 0.9,
      },
    }),
    React.createElement("span", {
      style: { color: P.gray500, fontWeight: 500 },
    }, "実績"),
  ),
)
```

---

## ツールチップ（D3 チャート用）

グリッドレイアウト + バックドロップブラー + 角丸のリッチツールチップ。

```typescript
/* ツールチップ要素（ルート div 内に配置） */
React.createElement("div", {
  ref: tooltipRef,
  style: {
    display: "none",
    position: "absolute",
    zIndex: 9999,
    padding: "10px 14px",
    borderRadius: 10,
    backgroundColor: "rgba(15,23,42,0.92)",
    color: "#fff",
    fontSize: 12,
    pointerEvents: "none",
    boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
    maxWidth: 280,
    lineHeight: 1.5,
  },
})

/* ツールチップ内容（グリッドレイアウト） */
var tipHtml =
  "<div style='font-weight:600;margin-bottom:4px'>" + title + "</div>" +
  "<div style='display:grid;grid-template-columns:auto 1fr;gap:2px 8px;font-size:11px'>" +
  "<span style='color:#94a3b8'>ラベル1</span><span>" + value1 + "</span>" +
  "<span style='color:#94a3b8'>ラベル2</span><span>" + value2 + "</span>" +
  "</div>";
```

### ツールチップ位置計算

```typescript
function showTip(html: string, ev: MouseEvent) {
  var tip = tooltipRef.current;
  if (!tip) return;
  tip.innerHTML = html;
  tip.style.display = "block";
  var root = tip.parentElement;
  if (root) {
    var rect = root.getBoundingClientRect();
    tip.style.left = (ev.clientX - rect.left + root.scrollLeft + 12) + "px";
    tip.style.top = (ev.clientY - rect.top + root.scrollTop - 12) + "px";
  }
}
```

---

## トースト通知

グラデーション背景 + ラウンドコーナー + シャドウ。3 秒で自動消去。

```typescript
/* state */
var [toast, setToast] = useState<string | null>(null);

useEffect(function () {
  if (!toast) return;
  var timer = setTimeout(function () { setToast(null); }, 3000);
  return function () { clearTimeout(timer); };
}, [toast]);

/* 表示 */
setToast("承認しました");

/* レンダリング */
toast && React.createElement("div", {
  style: {
    position: "fixed", top: 20, right: 20, zIndex: 9999,
    padding: "12px 20px", borderRadius: 12,
    background: "linear-gradient(135deg, " + P.teal + ", #0f766e)",
    color: "#fff", fontSize: 13, fontWeight: 600,
    boxShadow: "0 8px 24px rgba(13,148,136,0.3)",
  },
}, "\u2713 " + toast)
```

---

## ガントチャート左パネル（メンバー名）

```typescript
var useStyles = makeStyles({
  leftPanel: {
    minWidth: "140px",
    borderRight: "1px solid " + P.gray200,
    flexShrink: 0,
  },
  leftHeader: {
    height: "36px",
    display: "flex",
    alignItems: "center",
    paddingLeft: "12px",
    borderBottom: "1px solid " + P.gray200,
    fontWeight: 600,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    boxSizing: "border-box",
    backgroundColor: P.gray50,
    color: P.gray500,
  },
  leftRow: {
    height: "52px",     // GANTT_H と一致させる
    display: "flex",
    alignItems: "center",
    paddingLeft: "12px",
    borderBottom: "1px solid " + P.gray100,
    fontSize: "13px",
    fontWeight: 500,
    boxSizing: "border-box",
    color: P.gray700,
  },
});
```

---

## WO 詳細ダイアログ（フルスクリーン風）

行クリックで関連データをフルスクリーン風ダイアログで表示。行ホバーで `blueLight` ハイライト。

```typescript
React.createElement(Dialog, {
  open: dialogOpen,
  onOpenChange: function (_: any, d: any) { if (!d.open) setDialogOpen(false); },
},
  React.createElement(DialogSurface, {
    style: {
      maxWidth: "90vw", width: "90vw",
      maxHeight: "90vh", height: "90vh",
    },
  },
    React.createElement(DialogBody, null,
      React.createElement(DialogTitle, null,
        React.createElement("div", {
          style: { display: "flex", alignItems: "center", gap: 12 },
        },
          "関連作業指示書",
          /* Dataverse フォームを開くボタン */
          React.createElement("button", {
            onClick: function () {
              (window as any).Xrm.Navigation.openForm({
                entityName: "entity_name", entityId: recordId,
              });
            },
            style: {
              padding: "4px 10px", borderRadius: 6,
              border: "1px solid " + P.blue,
              backgroundColor: "transparent",
              color: P.blue, fontSize: 12,
              fontWeight: 500, cursor: "pointer", outline: "none",
            },
          }, "フォームを開く"),
        ),
      ),
      React.createElement(DialogContent, {
        style: { flex: 1, overflow: "auto" },
      },
        /* テーブルヘッダー + 行 */
      ),
      React.createElement(DialogActions, null,
        React.createElement(Button, {
          appearance: "secondary",
          onClick: function () { setDialogOpen(false); },
        }, "閉じる"),
      ),
    ),
  ),
)
```

---

## ページタイトルバー

```typescript
React.createElement("div", {
  style: {
    display: "flex", alignItems: "center", gap: 12,
    flexWrap: "wrap", paddingBottom: 4,
  },
},
  /* タイトル */
  React.createElement("div", {
    style: {
      fontSize: 22, fontWeight: 700,
      color: P.gray900, letterSpacing: "-0.3px",
    },
  }, "ページタイトル"),
  /* 日付ピッカー */
  React.createElement(Input, {
    type: "date", value: selectedDate,
    onChange: function (_: any, d: any) { if (d.value) setSelectedDate(d.value); },
    style: { maxWidth: 170 },
  }),
  /* 更新ボタン */
  React.createElement(Button, {
    icon: React.createElement(ArrowSyncRegular, null),
    appearance: "subtle",
    onClick: handleRefresh,
    style: { color: P.gray500 },
  }, "更新"),
  /* 条件付きアクションボタン */
  submittedCount > 0 && React.createElement(Button, {
    appearance: "primary",
    icon: React.createElement(CheckmarkCircleRegular, null),
    onClick: function () { setDialogOpen(true); },
    disabled: saving,
    style: {
      background: "linear-gradient(135deg, " + P.blue + ", " + P.blueDark + ")",
      borderRadius: 8, fontWeight: 600,
      boxShadow: "0 2px 8px rgba(37,99,235,0.3)",
    },
  }, "一括承認 (" + submittedCount + ")"),
)
```

---

## グローバルステータスインジケーター

日付ナビゲーションの下に全体の状態を表示。

```typescript
/* 全完了メッセージ */
globalAllDone && React.createElement("div", {
  style: {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "4px 12px", borderRadius: 20,
    backgroundColor: P.greenLight, color: P.green,
    fontSize: 12, fontWeight: 600,
  },
}, "\u2713 すべて対応完了！")

/* 差戻し件数リンクボタン */
returnedCount > 0 && React.createElement("button", {
  onClick: openReturnedView,
  style: {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "4px 12px", borderRadius: 20,
    border: "1.5px solid " + P.coral,
    backgroundColor: P.coralLight, color: P.coral,
    fontSize: 12, fontWeight: 500,
    cursor: "pointer", outline: "none",
  },
}, "\u26a0 差戻し日報をビューで確認 (" + returnedCount + ")")
```

---

## デザイン原則まとめ

1. **角丸は 12px を標準**、ピル型バッジ・ボタンは 20px、小さなバッジは 12px
2. **グラデーションは控えめに** — ヘッダー背景とプライマリボタンのみ。135deg が基本
3. **シャドウは段階的** — カード: `0 1px 4px rgba(0,0,0,0.06)`、ボタン: `0 1px 4px rgba(37,99,235,0.25)`、トースト: `0 8px 24px`
4. **文字サイズ階層** — タイトル: 22px/700、セクション: 14px/600、本文: 13px/500、ラベル: 11px/600 uppercase
5. **ホバーは `transition: all 0.2s ease`** — 日付ボタン・テーブル行・カードに適用
6. **間隔は 4px 刻み** — gap: 4, 6, 8, 10, 12, 16, 20
7. **テーブルは flex レイアウト** — DataGrid ではなく `display: flex` + 固定幅列。CSS Grid は使わない
8. **アイコンは Fluent UI React Icons** — `CheckmarkRegular`, `ArrowSyncRegular`, `CalendarRegular` 等
9. **多言語は `T` 辞書 + `t()` 関数** — すべての表示文字列をローカライズ可能にする
10. **空状態は中央寄せ + `P.gray400`** — データなし時のフォールバック表示
