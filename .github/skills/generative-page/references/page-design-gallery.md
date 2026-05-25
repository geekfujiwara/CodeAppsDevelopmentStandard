# Generative Pages ページデザインギャラリー

美しく洗練されたページデザインの **完全テンプレート集**。  
各テンプレートは GenUx の制約（React 17 + Fluent UI V9 + D3.js + 単一ファイル）内で実装可能。  
コピー＆カスタマイズですぐに使える **ページ全体のデザイン設計図**。

---

## 目次

1. [Executive Summary（経営サマリー）](#design-1-executive-summary)
2. [Modern CRM Dashboard（顧客管理）](#design-2-modern-crm-dashboard)
3. [Team Activity Feed（チーム活動フィード）](#design-3-team-activity-feed)
4. [Resource Planner（リソース計画）](#design-4-resource-planner)
5. [Approval Center（承認センター）](#design-5-approval-center)
6. [共通デザイン基盤](#共通デザイン基盤)

---

## Design 1: Executive Summary

**コンセプト**: ガラスモーフィズム風カードと大胆なグラデーションヘッダーで、経営層向けの高級感ある俯瞰ページ。

### 全体レイアウト

```
┌─────────────────────────────────────────────────────────────┐
│  ▓▓▓▓▓▓ グラデーションヘッダー（紺→青）▓▓▓▓▓▓              │
│  白文字タイトル + サブタイトル + 期間セレクタ                │
├─────────────────────────────────────────────────────────────┤
│  [KPI①]    [KPI②]    [KPI③]    [KPI④]                       │
│  ガラスカード  ガラスカード  ガラスカード  ガラスカード       │
├───────────────────────────────┬─────────────────────────────┤
│                               │                             │
│  トレンドエリアチャート         │  ドーナツ + 中央KPI          │
│  (グラデーション塗り)          │  (パステルカラー)            │
│                               │                             │
├───────────────────────────────┴─────────────────────────────┤
│  ランキングテーブル（ホバーエフェクト + ミニバー）              │
└─────────────────────────────────────────────────────────────┘
```

### カラースキーム

```typescript
var P = {
  /* プライマリグラデーション */
  headerStart: "#0f172a",   // slate-900
  headerEnd: "#1e40af",     // blue-800
  headerAccent: "#3b82f6",  // blue-500

  /* ガラスカード */
  glass: "rgba(255,255,255,0.7)",
  glassBorder: "rgba(255,255,255,0.2)",
  glassBlur: "blur(12px)",

  /* KPIカラー */
  revenue: "#2563eb",       // 売上
  profit: "#059669",        // 利益
  customers: "#7c3aed",     // 顧客数
  growth: "#ea580c",        // 成長率

  /* ニュートラル */
  bg: "#f8fafc",
  cardBg: "#ffffff",
  text: "#0f172a",
  textSub: "#64748b",
  border: "#e2e8f0",
};
```

### ヘッダーセクション

```typescript
React.createElement("div", {
  style: {
    background: "linear-gradient(135deg, " + P.headerStart + " 0%, " + P.headerEnd + " 100%)",
    padding: "32px 28px 48px",
    borderRadius: "0 0 24px 24px",
    position: "relative",
    overflow: "hidden",
  },
},
  /* 背景デコレーション（抽象的な円） */
  React.createElement("div", {
    style: {
      position: "absolute", top: -60, right: -40,
      width: 200, height: 200, borderRadius: "50%",
      background: "radial-gradient(circle, rgba(59,130,246,0.3) 0%, transparent 70%)",
    },
  }),
  React.createElement("div", {
    style: {
      position: "absolute", bottom: -30, left: "30%",
      width: 150, height: 150, borderRadius: "50%",
      background: "radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)",
    },
  }),
  /* タイトル */
  React.createElement("div", {
    style: { position: "relative", zIndex: 1 },
  },
    React.createElement("div", {
      style: { fontSize: 11, fontWeight: 500, letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: 6 },
    }, "EXECUTIVE DASHBOARD"),
    React.createElement("div", {
      style: { fontSize: 26, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.5px" },
    }, "経営サマリー"),
    React.createElement("div", {
      style: { fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 4 },
    }, "2026年5月 · リアルタイム"),
  ),
)
```

### ガラスモーフィズム KPI カード

```typescript
/* KPI カードグリッド（ヘッダーに -24px オーバーラップ） */
React.createElement("div", {
  style: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 16,
    margin: "-24px 20px 24px",
    position: "relative",
    zIndex: 2,
  },
},
  kpiItems.map(function (kpi, i) {
    return React.createElement("div", {
      key: i,
      style: {
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderRadius: 16,
        padding: "20px 18px",
        border: "1px solid rgba(255,255,255,0.3)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      },
    },
      /* アイコン円 */
      React.createElement("div", {
        style: {
          width: 36, height: 36, borderRadius: 10,
          background: "linear-gradient(135deg, " + kpi.color + "15, " + kpi.color + "25)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 12,
        },
      }, React.createElement(kpi.icon, { style: { fontSize: 18, color: kpi.color } })),
      /* ラベル */
      React.createElement("div", {
        style: { fontSize: 11, color: P.textSub, fontWeight: 500, marginBottom: 4 },
      }, kpi.label),
      /* 値 */
      React.createElement("div", {
        style: { fontSize: 24, fontWeight: 700, color: P.text, letterSpacing: "-0.5px" },
      }, kpi.value),
      /* 変動 */
      React.createElement("div", {
        style: {
          fontSize: 11, fontWeight: 600, marginTop: 6,
          color: kpi.positive ? "#059669" : "#dc2626",
          display: "flex", alignItems: "center", gap: 3,
        },
      }, (kpi.positive ? "▲ " : "▼ ") + kpi.change),
    );
  }),
)
```

### ランキングテーブル（プレミアムスタイル）

```typescript
/* テーブル外枠 */
React.createElement("div", {
  style: {
    margin: "0 20px 24px",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: P.cardBg,
    border: "1px solid " + P.border,
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },
},
  /* テーブルヘッダー */
  React.createElement("div", {
    style: {
      display: "grid", gridTemplateColumns: "40px 1fr 120px 100px 80px",
      padding: "12px 20px",
      backgroundColor: "#f8fafc",
      borderBottom: "1px solid " + P.border,
      fontSize: 11, fontWeight: 600, color: P.textSub,
      textTransform: "uppercase", letterSpacing: "0.5px",
    },
  }, "順位", "部門", "売上", "達成率", "推移"),
  /* テーブル行 */
  rows.map(function (row, i) {
    return React.createElement("div", {
      key: i,
      style: {
        display: "grid", gridTemplateColumns: "40px 1fr 120px 100px 80px",
        padding: "14px 20px",
        alignItems: "center",
        borderBottom: i < rows.length - 1 ? "1px solid #f1f5f9" : "none",
        cursor: "pointer",
        transition: "background-color 0.15s ease",
      },
      onMouseOver: function (e: any) { e.currentTarget.style.backgroundColor = "#f0f9ff"; },
      onMouseOut: function (e: any) { e.currentTarget.style.backgroundColor = "transparent"; },
    },
      /* 順位メダル */
      React.createElement("div", {
        style: {
          width: 24, height: 24, borderRadius: "50%",
          background: i === 0 ? "linear-gradient(135deg, #fbbf24, #f59e0b)" :
                      i === 1 ? "linear-gradient(135deg, #94a3b8, #64748b)" :
                      i === 2 ? "linear-gradient(135deg, #d97706, #b45309)" : "#f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700,
          color: i < 3 ? "#fff" : P.textSub,
        },
      }, String(i + 1)),
      /* 部門名 */
      React.createElement("div", {
        style: { fontSize: 13, fontWeight: 500, color: P.text },
      }, row.name),
      /* 売上 */
      React.createElement("div", {
        style: { fontSize: 13, fontWeight: 600, color: P.text },
      }, "¥" + row.revenue.toLocaleString()),
      /* 達成率バー */
      React.createElement("div", {
        style: { display: "flex", alignItems: "center", gap: 8 },
      },
        React.createElement("div", {
          style: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "#e2e8f0", overflow: "hidden" },
        },
          React.createElement("div", {
            style: {
              height: "100%", borderRadius: 3,
              width: Math.min(row.rate, 100) + "%",
              background: row.rate >= 100 ? "linear-gradient(90deg, #059669, #10b981)" :
                          row.rate >= 80 ? "linear-gradient(90deg, #2563eb, #3b82f6)" :
                          "linear-gradient(90deg, #f59e0b, #fbbf24)",
            },
          }),
        ),
        React.createElement("span", {
          style: { fontSize: 11, fontWeight: 600, color: row.rate >= 100 ? "#059669" : P.textSub, minWidth: 32 },
        }, row.rate + "%"),
      ),
      /* ミニスパークライン */
      React.createElement("div", {
        style: { display: "flex", alignItems: "flex-end", gap: 1, height: 20 },
      },
        row.trend.map(function (v: number, j: number) {
          return React.createElement("div", {
            key: j,
            style: {
              width: 4, borderRadius: 2,
              height: Math.max(4, (v / Math.max.apply(null, row.trend)) * 20) + "px",
              backgroundColor: v >= row.trend[0] ? "#059669" : "#f87171",
              opacity: 0.7 + (j / row.trend.length) * 0.3,
            },
          });
        }),
      ),
    );
  }),
)
```

---

## Design 2: Modern CRM Dashboard

**コンセプト**: 左サイドバー + メインコンテンツの2カラム構成。角丸カード・微細シャドウ・タイポグラフィ階層で情報を整理。

### 全体レイアウト

```
┌──────────┬──────────────────────────────────────────┐
│ サイドバー │  ヘッダー（顧客検索 + アクション）        │
│           ├──────────────────────────────────────────┤
│ [概要]    │  [KPI] [KPI] [KPI] [KPI]                 │
│ [取引先]  │                                          │
│ [商談]    │  ┌────────────────┐ ┌────────────────┐    │
│ [活動]    │  │ パイプライン     │ │ 直近の活動     │    │
│           │  │ ファネル         │ │ タイムライン    │    │
│ ──────── │  │                  │ │                │    │
│ [設定]    │  └────────────────┘ └────────────────┘    │
└──────────┴──────────────────────────────────────────┘
```

### サイドバーデザイン

```typescript
React.createElement("div", {
  style: {
    width: 220,
    flexShrink: 0,
    background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
    padding: "20px 0",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    borderRadius: "16px 0 0 16px",
  },
},
  /* ロゴ/アプリ名 */
  React.createElement("div", {
    style: { padding: "0 20px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" },
  },
    React.createElement("div", {
      style: { fontSize: 15, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.3px" },
    }, "CRM Dashboard"),
    React.createElement("div", {
      style: { fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 },
    }, "営業管理ポータル"),
  ),
  /* ナビゲーション項目 */
  React.createElement("div", {
    style: { padding: "16px 12px", display: "flex", flexDirection: "column", gap: 2 },
  },
    navItems.map(function (item) {
      var isActive = item.id === activeNav;
      return React.createElement("div", {
        key: item.id,
        onClick: function () { setActiveNav(item.id); },
        style: {
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 12px", borderRadius: 10,
          backgroundColor: isActive ? "rgba(59,130,246,0.15)" : "transparent",
          color: isActive ? "#60a5fa" : "rgba(255,255,255,0.6)",
          fontSize: 13, fontWeight: isActive ? 600 : 400,
          cursor: "pointer",
          transition: "all 0.15s ease",
        },
      },
        React.createElement(item.icon, { style: { fontSize: 18 } }),
        item.label,
        item.badge && React.createElement("div", {
          style: {
            marginLeft: "auto",
            padding: "2px 7px", borderRadius: 10,
            backgroundColor: isActive ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.1)",
            fontSize: 10, fontWeight: 600,
          },
        }, item.badge),
      );
    }),
  ),
)
```

### パイプラインファネル（モダンスタイル）

```typescript
React.createElement("div", {
  style: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: "20px 24px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },
},
  /* ヘッダー */
  React.createElement("div", {
    style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  },
    React.createElement("div", {
      style: { fontSize: 14, fontWeight: 600, color: "#0f172a" },
    }, "パイプライン"),
    React.createElement("div", {
      style: { fontSize: 11, color: "#64748b", fontWeight: 500 },
    }, "全 " + totalDeals + " 件"),
  ),
  /* ファネルステージ */
  React.createElement("div", {
    style: { display: "flex", flexDirection: "column", gap: 8 },
  },
    stages.map(function (stage, i) {
      var widthPct = 100 - (i * 15);
      return React.createElement("div", {
        key: stage.label,
        style: {
          display: "flex", alignItems: "center", gap: 12,
        },
      },
        /* ステージバー */
        React.createElement("div", {
          style: {
            width: widthPct + "%",
            padding: "10px 16px",
            borderRadius: 10,
            background: "linear-gradient(90deg, " + stage.color + "12, " + stage.color + "06)",
            border: "1px solid " + stage.color + "20",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            transition: "transform 0.2s ease",
          },
        },
          React.createElement("span", {
            style: { fontSize: 12, fontWeight: 500, color: "#334155" },
          }, stage.label),
          React.createElement("span", {
            style: { fontSize: 13, fontWeight: 700, color: stage.color },
          }, stage.count + "件"),
        ),
        /* 金額 */
        React.createElement("span", {
          style: { fontSize: 11, color: "#94a3b8", fontWeight: 500, whiteSpace: "nowrap" },
        }, "¥" + stage.amount.toLocaleString()),
      );
    }),
  ),
)
```

### アクティビティタイムライン

```typescript
React.createElement("div", {
  style: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: "20px 24px",
    border: "1px solid #e2e8f0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },
},
  /* ヘッダー */
  React.createElement("div", {
    style: { fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 16 },
  }, "直近の活動"),
  /* タイムライン */
  React.createElement("div", {
    style: { position: "relative", paddingLeft: 28 },
  },
    /* 縦の接続線 */
    React.createElement("div", {
      style: {
        position: "absolute", left: 9, top: 8, bottom: 8,
        width: 2, borderRadius: 1,
        background: "linear-gradient(180deg, #e2e8f0 0%, transparent 100%)",
      },
    }),
    activities.map(function (act, i) {
      return React.createElement("div", {
        key: i,
        style: {
          position: "relative",
          paddingBottom: i < activities.length - 1 ? 20 : 0,
        },
      },
        /* ドットインジケーター */
        React.createElement("div", {
          style: {
            position: "absolute", left: -23, top: 4,
            width: 12, height: 12, borderRadius: "50%",
            border: "2.5px solid " + act.color,
            backgroundColor: act.isLatest ? act.color : "#ffffff",
          },
        }),
        /* コンテンツ */
        React.createElement("div", {
          style: { fontSize: 10, color: "#94a3b8", fontWeight: 500, marginBottom: 2 },
        }, act.timeAgo),
        React.createElement("div", {
          style: { fontSize: 13, fontWeight: 500, color: "#1e293b" },
        }, act.title),
        React.createElement("div", {
          style: { fontSize: 12, color: "#64748b", marginTop: 2 },
        }, act.description),
      );
    }),
  ),
)
```

---

## Design 3: Team Activity Feed

**コンセプト**: カード型フィード + リアルタイム感。SNS風のモダンフィードデザインで、チームの活動をリアルタイムに表示。

### 全体レイアウト

```
┌─────────────────────────────────────────────────────────────┐
│  ヘッダー（チーム名 + メンバーアバター群 + 新規投稿ボタン）    │
├─────────────────────────────────────────────────────────────┤
│  [フィルタ: 全て | 完了 | レビュー | コメント]               │
├──────────────────────────────────────┬──────────────────────┤
│                                      │  サマリーカード       │
│  アクティビティカード①                 │  ┌──────────────┐   │
│  ┌──────────────────────────────┐    │  │ 今日の活動     │   │
│  │ [Avatar] 名前 · 3分前        │    │  │  完了: 12      │   │
│  │ 「商談を完了しました」         │    │  │  進行中: 5     │   │
│  │ [リアクション] [コメント]     │    │  └──────────────┘   │
│  └──────────────────────────────┘    │                      │
│                                      │  ┌──────────────┐   │
│  アクティビティカード②                 │  │ 週間トレンド   │   │
│  ┌──────────────────────────────┐    │  │  [ミニチャート] │   │
│  │ ...                          │    │  └──────────────┘   │
│  └──────────────────────────────┘    │                      │
└──────────────────────────────────────┴──────────────────────┘
```

### アクティビティカード

```typescript
React.createElement("div", {
  style: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: "18px 20px",
    border: "1px solid #f1f5f9",
    boxShadow: "0 1px 3px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.02)",
    transition: "box-shadow 0.2s ease",
  },
},
  /* カードヘッダー（アバター + 名前 + 時刻） */
  React.createElement("div", {
    style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 },
  },
    /* アバター */
    React.createElement("div", {
      style: {
        width: 36, height: 36, borderRadius: "50%",
        background: "linear-gradient(135deg, " + user.avatarColor1 + ", " + user.avatarColor2 + ")",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700, color: "#ffffff",
      },
    }, user.initials),
    /* 名前 + 時刻 */
    React.createElement("div", { style: { flex: 1 } },
      React.createElement("div", {
        style: { fontSize: 13, fontWeight: 600, color: "#1e293b" },
      }, user.name),
      React.createElement("div", {
        style: { fontSize: 11, color: "#94a3b8" },
      }, activity.timeAgo),
    ),
    /* アクションタイプバッジ */
    React.createElement("div", {
      style: {
        padding: "3px 10px", borderRadius: 20,
        fontSize: 10, fontWeight: 600,
        backgroundColor: activity.typeBg,
        color: activity.typeColor,
      },
    }, activity.typeLabel),
  ),
  /* コンテンツ */
  React.createElement("div", {
    style: { fontSize: 13, color: "#334155", lineHeight: "1.6", marginBottom: 14 },
  }, activity.content),
  /* リンクカード（任意） */
  activity.linkedRecord && React.createElement("div", {
    style: {
      padding: "10px 14px", borderRadius: 10,
      backgroundColor: "#f8fafc",
      border: "1px solid #e2e8f0",
      display: "flex", alignItems: "center", gap: 10,
      cursor: "pointer",
      marginBottom: 14,
    },
  },
    React.createElement("div", {
      style: { width: 32, height: 32, borderRadius: 8, backgroundColor: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center" },
    }, React.createElement(DocumentRegular, { style: { fontSize: 16, color: "#2563eb" } })),
    React.createElement("div", null,
      React.createElement("div", { style: { fontSize: 12, fontWeight: 500, color: "#1e293b" } }, activity.linkedRecord.name),
      React.createElement("div", { style: { fontSize: 10, color: "#94a3b8" } }, activity.linkedRecord.entity),
    ),
  ),
  /* リアクション行 */
  React.createElement("div", {
    style: { display: "flex", alignItems: "center", gap: 16 },
  },
    React.createElement("button", {
      style: {
        display: "flex", alignItems: "center", gap: 4,
        padding: "4px 10px", borderRadius: 8,
        border: "1px solid #e2e8f0", backgroundColor: "transparent",
        fontSize: 11, color: "#64748b", cursor: "pointer",
        transition: "all 0.15s ease",
      },
    }, "👍 " + activity.likes),
    React.createElement("button", {
      style: {
        display: "flex", alignItems: "center", gap: 4,
        padding: "4px 10px", borderRadius: 8,
        border: "1px solid #e2e8f0", backgroundColor: "transparent",
        fontSize: 11, color: "#64748b", cursor: "pointer",
      },
    }, "💬 " + activity.comments),
  ),
)
```

### メンバーアバター群（重なりスタイル）

```typescript
React.createElement("div", {
  style: { display: "flex", alignItems: "center" },
},
  members.slice(0, 5).map(function (m, i) {
    return React.createElement("div", {
      key: m.id,
      style: {
        width: 32, height: 32, borderRadius: "50%",
        background: "linear-gradient(135deg, " + m.color1 + ", " + m.color2 + ")",
        border: "2px solid #ffffff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700, color: "#ffffff",
        marginLeft: i > 0 ? -8 : 0,
        zIndex: 10 - i,
        position: "relative",
      },
      title: m.name,
    }, m.initials);
  }),
  members.length > 5 && React.createElement("div", {
    style: {
      width: 32, height: 32, borderRadius: "50%",
      backgroundColor: "#f1f5f9", border: "2px solid #ffffff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 10, fontWeight: 600, color: "#64748b",
      marginLeft: -8, position: "relative",
    },
  }, "+" + (members.length - 5)),
)
```

---

## Design 4: Resource Planner

**コンセプト**: カレンダーベースの横軸 + リソース縦軸のプランニングビュー。モダンなタイムスロットとドラッグ感のあるデザイン。

### 全体レイアウト

```
┌─────────────────────────────────────────────────────────────┐
│  ヘッダー: [← 前週] 2026年5月第4週 [次週 →]  [日|週|月]     │
├─────────────────────────────────────────────────────────────┤
│  [リソース利用率: ██████████░░ 78%]  [空き: 5スロット]       │
├──────────┬──────────────────────────────────────────────────┤
│ リソース  │  月     │  火     │  水     │  木     │  金      │
├──────────┼──────────────────────────────────────────────────┤
│ 田中太郎  │ ████████│ ████    │         │ ████████████│     │
│ 鈴木花子  │ ████    │ ████████████████  │         │ ████   │
│ 佐藤健    │         │ ████████│ ████████│ ████    │ ████   │
│ 高橋美咲  │ ████████████████  │ ████    │         │        │
└──────────┴──────────────────────────────────────────────────┘
```

### タイムスロットカード（D3 描画）

```typescript
/* D3 useEffect 内 — モダンなリソースバー */

/* 背景グリッド（交互背景） */
resources.forEach(function (_, i) {
  svg.append("rect")
    .attr("x", 0).attr("y", headerH + i * rowH)
    .attr("width", W).attr("height", rowH)
    .attr("fill", i % 2 === 0 ? "#ffffff" : "#f8fafc");
});

/* 日付区切り線 */
days.forEach(function (d, i) {
  var x = leftPanelW + i * dayW;
  svg.append("line")
    .attr("x1", x).attr("y1", headerH)
    .attr("x2", x).attr("y2", headerH + resources.length * rowH)
    .attr("stroke", "#e2e8f0").attr("stroke-width", 1);
});

/* スケジュールバー（角丸 + グラデーション + ラベル） */
allocations.forEach(function (alloc) {
  var y = headerH + alloc.resourceIndex * rowH + 8;
  var x1 = leftPanelW + xScale(alloc.start);
  var barW = xScale(alloc.end) - xScale(alloc.start);
  var barH = rowH - 16;

  /* シャドウ */
  svg.append("rect")
    .attr("x", x1 + 1).attr("y", y + 2)
    .attr("width", barW).attr("height", barH)
    .attr("rx", 8).attr("fill", "rgba(0,0,0,0.06)");

  /* メインバー */
  var grad = defs.append("linearGradient")
    .attr("id", "bar-" + alloc.id)
    .attr("x1", "0").attr("y1", "0").attr("x2", "1").attr("y2", "0");
  grad.append("stop").attr("offset", "0%").attr("stop-color", alloc.color);
  grad.append("stop").attr("offset", "100%").attr("stop-color", alloc.colorEnd);

  svg.append("rect")
    .attr("x", x1).attr("y", y)
    .attr("width", barW).attr("height", barH)
    .attr("rx", 8).attr("fill", "url(#bar-" + alloc.id + ")")
    .style("cursor", "pointer")
    .on("mouseover", function (ev) {
      showTip("<b>" + alloc.projectName + "</b><br/>" + alloc.hours + "h", ev);
    })
    .on("mousemove", function (ev) { moveTip(ev); })
    .on("mouseout", function () { hideTip(); });

  /* バー内ラベル */
  if (barW > 60) {
    svg.append("text")
      .attr("x", x1 + 10).attr("y", y + barH / 2 + 4)
      .attr("font-size", "11px").attr("fill", "#ffffff")
      .attr("font-weight", "500").attr("pointer-events", "none")
      .text(alloc.projectName.substring(0, Math.floor((barW - 20) / 7)));
  }
});

/* 今日マーカー */
var todayX = leftPanelW + xScale(new Date());
svg.append("line")
  .attr("x1", todayX).attr("y1", 0)
  .attr("x2", todayX).attr("y2", headerH + resources.length * rowH)
  .attr("stroke", "#ef4444").attr("stroke-width", 2)
  .attr("stroke-dasharray", "6,4").attr("opacity", 0.8);
svg.append("circle")
  .attr("cx", todayX).attr("cy", 4).attr("r", 4).attr("fill", "#ef4444");
```

### リソース利用率バー

```typescript
React.createElement("div", {
  style: {
    margin: "16px 20px",
    padding: "14px 18px",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    display: "flex", alignItems: "center", gap: 16,
  },
},
  React.createElement("div", {
    style: { fontSize: 12, fontWeight: 500, color: "#64748b", whiteSpace: "nowrap" },
  }, "リソース利用率"),
  React.createElement("div", {
    style: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "#e2e8f0", overflow: "hidden" },
  },
    React.createElement("div", {
      style: {
        height: "100%", borderRadius: 4,
        width: utilization + "%",
        background: utilization > 90 ? "linear-gradient(90deg, #ef4444, #f87171)" :
                    utilization > 70 ? "linear-gradient(90deg, #2563eb, #60a5fa)" :
                    "linear-gradient(90deg, #059669, #34d399)",
        transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
      },
    }),
  ),
  React.createElement("div", {
    style: {
      fontSize: 14, fontWeight: 700, minWidth: 42,
      color: utilization > 90 ? "#ef4444" : utilization > 70 ? "#2563eb" : "#059669",
    },
  }, utilization + "%"),
)
```

---

## Design 5: Approval Center

**コンセプト**: 承認待ちアイテムをカード形式で一覧表示し、スワイプ風の「承認/差戻し」アクションを提供。明確な視覚的階層。

### 全体レイアウト

```
┌─────────────────────────────────────────────────────────────┐
│  ヘッダー: 承認センター  [フィルタ▼]  バッジ: 未対応 8件      │
├─────────────────────────────────────────────────────────────┤
│  [Tab: 未承認(8) | 承認済(24) | 差戻し(3)]                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [緊急] 出張申請 — 田中太郎                            │    │
│  │ 申請日: 5/20  金額: ¥85,000                          │    │
│  │                     [差戻し] [承認 ✓]                │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ [通常] 購買申請 — 鈴木花子                            │    │
│  │ 申請日: 5/19  金額: ¥320,000                         │    │
│  │                     [差戻し] [承認 ✓]                │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 承認カード

```typescript
React.createElement("div", {
  style: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
  },
},
  /* 優先度バー（上部カラーライン） */
  React.createElement("div", {
    style: {
      height: 3,
      background: item.priority === "high" ? "linear-gradient(90deg, #ef4444, #f87171)" :
                  item.priority === "medium" ? "linear-gradient(90deg, #f59e0b, #fbbf24)" :
                  "linear-gradient(90deg, #2563eb, #60a5fa)",
    },
  }),
  /* カード本体 */
  React.createElement("div", {
    style: { padding: "16px 20px" },
  },
    /* 上段: タイプ + 優先度バッジ + 日時 */
    React.createElement("div", {
      style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
    },
      React.createElement("div", {
        style: {
          padding: "3px 8px", borderRadius: 6,
          fontSize: 10, fontWeight: 600,
          backgroundColor: item.priority === "high" ? "#fef2f2" : item.priority === "medium" ? "#fffbeb" : "#eff6ff",
          color: item.priority === "high" ? "#dc2626" : item.priority === "medium" ? "#d97706" : "#2563eb",
        },
      }, item.priorityLabel),
      React.createElement("div", {
        style: { fontSize: 11, color: "#94a3b8", marginLeft: "auto" },
      }, item.submittedDate),
    ),
    /* 中段: タイトル + 申請者 */
    React.createElement("div", {
      style: { fontSize: 14, fontWeight: 600, color: "#1e293b", marginBottom: 4 },
    }, item.title),
    React.createElement("div", {
      style: { fontSize: 12, color: "#64748b", marginBottom: 12 },
    }, "申請者: " + item.requester + " · " + item.department),
    /* 詳細情報行 */
    React.createElement("div", {
      style: {
        display: "flex", gap: 16, marginBottom: 16,
        padding: "10px 12px", borderRadius: 8,
        backgroundColor: "#f8fafc",
      },
    },
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 10, color: "#94a3b8" } }, "金額"),
        React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "#1e293b" } }, "¥" + item.amount.toLocaleString()),
      ),
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 10, color: "#94a3b8" } }, "カテゴリ"),
        React.createElement("div", { style: { fontSize: 13, fontWeight: 500, color: "#1e293b" } }, item.category),
      ),
      React.createElement("div", null,
        React.createElement("div", { style: { fontSize: 10, color: "#94a3b8" } }, "期限"),
        React.createElement("div", { style: { fontSize: 13, fontWeight: 500, color: item.isOverdue ? "#dc2626" : "#1e293b" } }, item.dueDate),
      ),
    ),
    /* アクションボタン */
    React.createElement("div", {
      style: { display: "flex", justifyContent: "flex-end", gap: 8 },
    },
      React.createElement("button", {
        onClick: function () { handleReject(item.id); },
        style: {
          padding: "8px 16px", borderRadius: 8,
          border: "1.5px solid #fca5a5",
          backgroundColor: "#ffffff", color: "#dc2626",
          fontSize: 12, fontWeight: 600, cursor: "pointer",
          transition: "all 0.15s ease",
        },
      }, "✕ 差戻し"),
      React.createElement("button", {
        onClick: function () { handleApprove(item.id); },
        style: {
          padding: "8px 16px", borderRadius: 8,
          border: "none",
          background: "linear-gradient(135deg, #059669, #10b981)",
          color: "#ffffff",
          fontSize: 12, fontWeight: 600, cursor: "pointer",
          boxShadow: "0 2px 8px rgba(5,150,105,0.3)",
          transition: "all 0.15s ease",
        },
      }, "✓ 承認"),
    ),
  ),
)
```

### 一括承認フローティングバー

```typescript
/* 選択アイテムがある場合にフローティング表示 */
selectedIds.length > 0 && React.createElement("div", {
  style: {
    position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
    padding: "12px 24px", borderRadius: 16,
    background: "linear-gradient(135deg, #0f172a, #1e293b)",
    color: "#ffffff",
    display: "flex", alignItems: "center", gap: 16,
    boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
    zIndex: 9999,
  },
},
  React.createElement("span", {
    style: { fontSize: 13, fontWeight: 500 },
  }, selectedIds.length + " 件選択中"),
  React.createElement("button", {
    onClick: handleBulkApprove,
    style: {
      padding: "8px 20px", borderRadius: 10,
      border: "none",
      background: "linear-gradient(135deg, #059669, #10b981)",
      color: "#ffffff", fontSize: 12, fontWeight: 600,
      cursor: "pointer",
      boxShadow: "0 2px 8px rgba(5,150,105,0.4)",
    },
  }, "一括承認"),
  React.createElement("button", {
    onClick: function () { setSelectedIds([]); },
    style: {
      padding: "8px 16px", borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.2)",
      backgroundColor: "transparent", color: "#94a3b8",
      fontSize: 12, cursor: "pointer",
    },
  }, "キャンセル"),
)
```

---

## 共通デザイン基盤

### モダンカラーパレット（全テンプレート共通）

```typescript
var P = {
  /* ベース */
  bg: "#f8fafc",            // ページ背景
  cardBg: "#ffffff",        // カード背景
  border: "#e2e8f0",        // ボーダー
  borderLight: "#f1f5f9",   // 薄いボーダー

  /* テキスト */
  text: "#0f172a",          // メインテキスト
  textSub: "#64748b",       // サブテキスト
  textMuted: "#94a3b8",     // ミュートテキスト

  /* プライマリ */
  primary: "#2563eb",
  primaryDark: "#1d4ed8",
  primaryLight: "#dbeafe",
  primaryGlow: "rgba(37,99,235,0.15)",

  /* セマンティック */
  success: "#059669",
  successLight: "#dcfce7",
  warning: "#d97706",
  warningLight: "#fef3c7",
  danger: "#dc2626",
  dangerLight: "#fef2f2",
  info: "#0891b2",
  infoLight: "#cffafe",

  /* アクセント */
  purple: "#7c3aed",
  pink: "#db2777",
  orange: "#ea580c",
};
```

### シャドウシステム

```typescript
var shadows = {
  sm: "0 1px 2px rgba(0,0,0,0.04)",
  md: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)",
  lg: "0 4px 16px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.04)",
  xl: "0 8px 24px rgba(0,0,0,0.08), 0 20px 48px rgba(0,0,0,0.06)",
  glow: function (color: string) { return "0 4px 16px " + color + "25"; },
};
```

### タイポグラフィシステム

```typescript
var type = {
  /* サイズ + ウェイト のペア */
  hero: { fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", lineHeight: "1.2" },
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.3px", lineHeight: "1.3" },
  h2: { fontSize: 16, fontWeight: 600, letterSpacing: "-0.2px", lineHeight: "1.4" },
  h3: { fontSize: 14, fontWeight: 600, lineHeight: "1.4" },
  body: { fontSize: 13, fontWeight: 400, lineHeight: "1.6" },
  caption: { fontSize: 11, fontWeight: 500, lineHeight: "1.4" },
  overline: { fontSize: 10, fontWeight: 600, letterSpacing: "1px", textTransform: "uppercase" as const },
};
```

### スペーシングシステム

```typescript
var space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 32,
};
```

### ボーダーラディウスシステム

```typescript
var radius = {
  sm: 6,        // バッジ、タグ
  md: 10,       // ボタン、入力
  lg: 14,       // カード
  xl: 16,       // セクションカード
  pill: 999,    // ピル型（完全な丸角）
};
```

### モダンアニメーション（makeStyles）

```typescript
var useStyles = makeStyles({
  fadeIn: {
    animationName: {
      from: { opacity: 0 },
      to: { opacity: 1 },
    },
    animationDuration: "0.3s",
    animationTimingFunction: "ease-out",
    animationFillMode: "both",
  },
  slideUp: {
    animationName: {
      from: { opacity: 0, transform: "translateY(12px)" },
      to: { opacity: 1, transform: "translateY(0)" },
    },
    animationDuration: "0.4s",
    animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
    animationFillMode: "both",
  },
  scaleIn: {
    animationName: {
      from: { opacity: 0, transform: "scale(0.95)" },
      to: { opacity: 1, transform: "scale(1)" },
    },
    animationDuration: "0.3s",
    animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
    animationFillMode: "both",
  },
  shimmer: {
    animationName: {
      from: { backgroundPosition: "-200% 0" },
      to: { backgroundPosition: "200% 0" },
    },
    animationDuration: "1.5s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    backgroundImage: "linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)",
    backgroundSize: "200% 100%",
  },
});
```

### ローディングスケルトン

```typescript
/* コンテンツ読み込み中のスケルトン表示 */
function Skeleton(props: { width: string; height: string; radius?: number }) {
  return React.createElement("div", {
    className: styles.shimmer,
    style: {
      width: props.width,
      height: props.height,
      borderRadius: props.radius || 8,
    },
  });
}

/* 使用例: KPI カードのスケルトン */
loading && React.createElement("div", {
  style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, padding: "0 20px" },
},
  [0, 1, 2, 3].map(function (i) {
    return React.createElement("div", {
      key: i,
      style: { padding: 20, borderRadius: 16, backgroundColor: "#ffffff", border: "1px solid #e2e8f0" },
    },
      Skeleton({ width: "40%", height: "12px" }),
      React.createElement("div", { style: { height: 8 } }),
      Skeleton({ width: "60%", height: "24px" }),
      React.createElement("div", { style: { height: 8 } }),
      Skeleton({ width: "30%", height: "12px" }),
    );
  }),
)
```

### 空状態デザイン

```typescript
React.createElement("div", {
  style: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: "48px 24px", textAlign: "center",
  },
},
  /* イラスト的アイコン */
  React.createElement("div", {
    style: {
      width: 64, height: 64, borderRadius: 16,
      background: "linear-gradient(135deg, #eff6ff, #dbeafe)",
      display: "flex", alignItems: "center", justifyContent: "center",
      marginBottom: 16,
    },
  }, React.createElement(SearchRegular, { style: { fontSize: 28, color: "#60a5fa" } })),
  React.createElement("div", {
    style: { fontSize: 15, fontWeight: 600, color: "#1e293b", marginBottom: 4 },
  }, "データがありません"),
  React.createElement("div", {
    style: { fontSize: 13, color: "#94a3b8", maxWidth: 280 },
  }, "条件に一致するレコードが見つかりませんでした。フィルターを変更してお試しください。"),
)
```

### レスポンシブブレークポイント

```typescript
/* makeStyles 内で使用 */
"@media (max-width: 768px)": {
  /* タブレット以下 */
  gridTemplateColumns: "repeat(2, 1fr)",  // 4列 → 2列
},
"@media (max-width: 480px)": {
  /* モバイル */
  gridTemplateColumns: "1fr",             // 2列 → 1列
  padding: "12px",                        // padding 縮小
},
```

---

## デザイン選定ガイド

| ユースケース | 推奨テンプレート | 特徴 |
|---|---|---|
| 経営層向けダッシュボード | Design 1: Executive Summary | グラデーションヘッダー + ガラスKPI + ランキング |
| 営業・顧客管理 | Design 2: Modern CRM | サイドバー + ファネル + タイムライン |
| チームコラボレーション | Design 3: Team Activity Feed | カードフィード + アバター + リアクション |
| リソース・スケジュール管理 | Design 4: Resource Planner | タイムライン + D3バー + 利用率表示 |
| ワークフロー承認 | Design 5: Approval Center | 承認カード + 一括アクション + フローティングバー |

---

## デザイン品質チェックリスト

新しいページを作成する際、以下をすべて満たしているか確認:

- [ ] **カラー一貫性**: `P` オブジェクトからのみ色を参照している
- [ ] **シャドウ階層**: sm → md → lg の適切な使い分け
- [ ] **角丸統一**: radius システムに従っている（6/10/14/16）
- [ ] **テキスト階層**: hero → h1 → h2 → h3 → body → caption の明確な区別
- [ ] **ホバーエフェクト**: インタラクティブ要素すべてに `transition: all 0.15s ease` 適用
- [ ] **ローディング状態**: データ取得中にスケルトンまたはスピナーを表示
- [ ] **空状態**: データが0件のときの美しいフォールバック
- [ ] **アニメーション**: 初期表示時に `slideUp` / `fadeIn` のスタガーディレイ
- [ ] **レスポンシブ**: 768px / 480px で適切にレイアウト変更
- [ ] **アクセシビリティ**: `cursor: pointer` + `role` + `tabIndex` + `aria-label`
