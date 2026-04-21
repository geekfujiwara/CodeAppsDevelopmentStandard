# 日本地図パターン（Generative Pages 向け）

Generative Pages で日本地図を表示し、都道府県別のデータ可視化を行うデザインパターン。
SVG アセットは `public/maps/` に格納済み。

---

## SVG ファイル選定ガイド

| ファイル | 推奨場面 |
|---------|---------|
| `map-full.svg` | デスクトップ向け KPI ダッシュボード・地域分析。実際の地形に近い表示 |
| `map-mobile.svg` | モバイル対応ページ。縦長レイアウトに最適化 |
| `map-circle.svg` | デフォルメ表示（各都道府県が丸）。ヒートマップ・バブル風に使いやすい |
| `map-polygon.svg` | デフォルメ表示（各都道府県が矩形）。シンプルなエリア色分け |

---

## Pattern E: 日本地図ダッシュボード

**向いている場面**: 地域別売上・拠点管理・設備分布・顧客分布・災害対応

### 構成要素（Tier順）

> **Tier 1 = 初回デプロイに必ず含める**。Tier 2・3 は段階的改善で追加する。

| Tier | コンポーネント | 説明 |
|------|---------------|------|
| 1 | SVG マップ表示 | `dangerouslySetInnerHTML` で SVG をインライン展開 |
| 1 | 都道府県ホバーハイライト | mouseover で `fill` 変更 + 都道府県名ツールチップ |
| 1 | 都道府県クリックイベント | クリックで詳細データ表示（Dialog モーダル） |
| 1 | 地域別カラーリング | `data-code` を基にデータ値 → 色を CSS で反映 |
| 2 | 凡例（レジェンド） | 色とデータ範囲の対応表示 |
| 2 | KPI カード連動 | 選択都道府県の KPI を上部に表示 |
| 2 | 地方別フィルタ | 八地方区分でフィルタ（CSS クラスベース） |
| 3 | ズーム＆パン | SVG transform で拡大縮小 |
| 3 | データ連動アニメーション | 値の大きさでパルスアニメーション |

### レイアウト

```
[KPI: 全国合計] [KPI: 選択地域] [KPI: 前月比] [KPI: 目標達成率]

[Tab: 地図 | Tab: データ]

── 地図タブ ──
┌─────────────────────────────────────┐
│  [地方フィルタ: 全国 / 北海道 / ...]  │
│  ┌───────────────────┐ ┌──────────┐ │
│  │                   │ │  詳細     │ │
│  │   日本地図 SVG     │ │  パネル   │ │
│  │   (色分け表示)     │ │  (選択時) │ │
│  │                   │ │          │ │
│  └───────────────────┘ └──────────┘ │
│  [凡例: ■低 ■中 ■高]                │
└─────────────────────────────────────┘

── データタブ ──
[DataGrid (都道府県 × KPI)]
```

### SVG 読み込みパターン（Generative Pages — 単一ファイル構成）

```typescript
// ============================================================
// 日本地図 SVG を文字列として埋め込み（Generative Pages は外部 fetch 不可）
// map-circle.svg または map-polygon.svg の内容をそのまま変数に格納する
// ============================================================
const JAPAN_MAP_SVG = `<svg class="geolonia-svg-map" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg">
  <!-- public/maps/ から SVG の内容をコピー＆ペースト -->
</svg>`;
```

> **重要**: Generative Pages は単一 `.tsx` ファイル構成のため、SVG を外部ファイルとして fetch できない。
> `public/maps/` の SVG ファイルの内容をコピーして TypeScript 文字列リテラルとして埋め込む。

### 地図レンダリング + インタラクション

```typescript
/* makeStyles */
mapContainer: {
  position: "relative",
  width: "100%",
  maxWidth: "600px",
},
mapSvg: {
  width: "100%",
  height: "auto",
},
mapTooltip: {
  position: "absolute",
  pointerEvents: "none",
  padding: "4px 8px",
  borderRadius: "4px",
  fontSize: "12px",
  fontWeight: "500",
  whiteSpace: "nowrap",
  zIndex: 100,
},

/* JSX — SVG を div に挿入 */
var mapRef = useRef<HTMLDivElement>(null);
var [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
var [selectedCode, setSelectedCode] = useState<string | null>(null);

/* useEffect で SVG 内の都道府県要素にイベントをバインド */
useEffect(function () {
  var container = mapRef.current;
  if (!container) return;

  container.innerHTML = JAPAN_MAP_SVG;
  var prefs = container.querySelectorAll(".prefecture");

  prefs.forEach(function (pref) {
    var el = pref as SVGGElement;
    var code = el.getAttribute("data-code") || "";
    var titleEl = el.querySelector("title");
    var name = titleEl ? titleEl.textContent || "" : "";

    // データに基づく色分け
    var value = dataByCode[code];
    if (value !== undefined) {
      var color = getColorForValue(value); // 値 → 色の変換関数
      el.querySelectorAll("path, circle, polygon").forEach(function (shape) {
        (shape as SVGElement).style.fill = color;
        (shape as SVGElement).style.cursor = "pointer";
        (shape as SVGElement).style.transition = "fill 0.2s, opacity 0.2s";
      });
    }

    // ホバー
    el.addEventListener("mouseover", function (e) {
      el.querySelectorAll("path, circle, polygon").forEach(function (shape) {
        (shape as SVGElement).style.opacity = "0.7";
      });
      var rect = container.getBoundingClientRect();
      setTooltip({
        text: name + (value !== undefined ? ": " + value : ""),
        x: (e as MouseEvent).clientX - rect.left + 10,
        y: (e as MouseEvent).clientY - rect.top - 10,
      });
    });

    el.addEventListener("mouseleave", function () {
      el.querySelectorAll("path, circle, polygon").forEach(function (shape) {
        (shape as SVGElement).style.opacity = "1";
      });
      setTooltip(null);
    });

    // クリック
    el.addEventListener("click", function () {
      setSelectedCode(code);
    });
  });

  return function () {
    container.innerHTML = "";
  };
}, [dataByCode]);

/* JSX */
<div className={styles.mapContainer}>
  <div ref={mapRef} className={styles.mapSvg} />
  {tooltip && (
    <div className={styles.mapTooltip} style={{
      left: tooltip.x,
      top: tooltip.y,
      backgroundColor: tokens.colorNeutralBackground1,
      color: tokens.colorNeutralForeground1,
      boxShadow: tokens.shadow4,
    }}>
      {tooltip.text}
    </div>
  )}
</div>
```

### 色分けロジック

```typescript
/* 値の範囲に基づいてグラデーション色を返す */
function getColorForValue(value: number): string {
  // 例: 0〜100 の値を 5段階で色分け
  if (value >= 80) return P.teal;    // 高い
  if (value >= 60) return P.blue;    // やや高い
  if (value >= 40) return P.amber;   // 中間
  if (value >= 20) return P.coral;   // やや低い
  return P.red;                       // 低い
}

/* 凡例コンポーネント */
var legendItems = [
  { color: P.teal, label: "80〜100" },
  { color: P.blue, label: "60〜79" },
  { color: P.amber, label: "40〜59" },
  { color: P.coral, label: "20〜39" },
  { color: P.red, label: "0〜19" },
];

<div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 12 }}>
  {legendItems.map(function (item) {
    return (
      <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
        <div style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: item.color }} />
        <span>{item.label}</span>
      </div>
    );
  })}
</div>
```

### 地方別フィルタ

```typescript
/* SVG の CSS クラスを活用して地方ごとにハイライト */
var regions = [
  { key: "all", label: "全国" },
  { key: "hokkaido", label: "北海道" },
  { key: "tohoku", label: "東北" },
  { key: "kanto", label: "関東" },
  { key: "chubu", label: "中部" },
  { key: "kinki", label: "近畿" },
  { key: "chugoku", label: "中国" },
  { key: "shikoku", label: "四国" },
  { key: "kyushu-okinawa", label: "九州・沖縄" },
];

var [selectedRegion, setSelectedRegion] = useState("all");

/* フィルタ適用: 選択地方以外の都道府県を半透明に */
useEffect(function () {
  var container = mapRef.current;
  if (!container) return;
  var prefs = container.querySelectorAll(".prefecture");
  prefs.forEach(function (pref) {
    var el = pref as SVGGElement;
    if (selectedRegion === "all" || el.classList.contains(selectedRegion)) {
      el.style.opacity = "1";
    } else {
      el.style.opacity = "0.15";
    }
  });
}, [selectedRegion]);
```

### 都道府県コード一覧

| コード | 都道府県 | 地方 CSS クラス |
|--------|---------|----------------|
| 1 | 北海道 | `hokkaido` |
| 2 | 青森 | `tohoku` |
| 3 | 岩手 | `tohoku` |
| 4 | 宮城 | `tohoku` |
| 5 | 秋田 | `tohoku` |
| 6 | 山形 | `tohoku` |
| 7 | 福島 | `tohoku` |
| 8 | 茨城 | `kanto` |
| 9 | 栃木 | `kanto` |
| 10 | 群馬 | `kanto` |
| 11 | 埼玉 | `kanto` |
| 12 | 千葉 | `kanto` |
| 13 | 東京 | `kanto` |
| 14 | 神奈川 | `kanto` |
| 15 | 新潟 | `chubu` |
| 16 | 富山 | `chubu` |
| 17 | 石川 | `chubu` |
| 18 | 福井 | `chubu` |
| 19 | 山梨 | `chubu` |
| 20 | 長野 | `chubu` |
| 21 | 岐阜 | `chubu` |
| 22 | 静岡 | `chubu` |
| 23 | 愛知 | `chubu` |
| 24 | 三重 | `kinki` |
| 25 | 滋賀 | `kinki` |
| 26 | 京都 | `kinki` |
| 27 | 大阪 | `kinki` |
| 28 | 兵庫 | `kinki` |
| 29 | 奈良 | `kinki` |
| 30 | 和歌山 | `kinki` |
| 31 | 鳥取 | `chugoku` |
| 32 | 島根 | `chugoku` |
| 33 | 岡山 | `chugoku` |
| 34 | 広島 | `chugoku` |
| 35 | 山口 | `chugoku` |
| 36 | 徳島 | `shikoku` |
| 37 | 香川 | `shikoku` |
| 38 | 愛媛 | `shikoku` |
| 39 | 高知 | `shikoku` |
| 40 | 福岡 | `kyushu-okinawa` |
| 41 | 佐賀 | `kyushu-okinawa` |
| 42 | 長崎 | `kyushu-okinawa` |
| 43 | 熊本 | `kyushu-okinawa` |
| 44 | 大分 | `kyushu-okinawa` |
| 45 | 宮崎 | `kyushu-okinawa` |
| 46 | 鹿児島 | `kyushu-okinawa` |
| 47 | 沖縄 | `kyushu-okinawa` |

---

## Dataverse 連携パターン

### パターン 1: 都道府県別集計（DataAPI）

```typescript
/* Dataverse テーブルに都道府県コード列がある場合 */
var [prefData, setPrefData] = useState<Record<string, number>>({});

useEffect(function () {
  props.dataApi.queryTable("my_entities", {
    select: ["my_prefecturecode", "my_value"],
  }).then(function (result) {
    var aggregated: Record<string, number> = {};
    result.items.forEach(function (item) {
      var code = String(item.my_prefecturecode);
      aggregated[code] = (aggregated[code] || 0) + Number(item.my_value || 0);
    });
    setPrefData(aggregated);
  });
}, []);
```

### パターン 2: 拠点マスタからマッピング

```typescript
/* 拠点テーブルに都道府県コードがある場合 */
var [locations, setLocations] = useState<Array<{ code: string; name: string; count: number }>>([]);

useEffect(function () {
  props.dataApi.queryTable("my_locations", {
    select: ["my_locationname", "my_prefecturecode", "my_employeecount"],
  }).then(function (result) {
    var items = result.items.map(function (item) {
      return {
        code: String(item.my_prefecturecode),
        name: String(item.my_locationname),
        count: Number(item.my_employeecount || 0),
      };
    });
    setLocations(items);
  });
}, []);
```

---

## 注意事項

1. **Generative Pages は外部 fetch 禁止** — SVG を TypeScript 文字列リテラルとして埋め込むこと
2. **`dangerouslySetInnerHTML` ではなく `innerHTML`** — `useRef` + `useEffect` でDOM操作する
3. **D3 geoMercator は不要** — SVG 自体が日本地図の形状を持つため D3 の geo 投影は不要
4. **map-full.svg/map-mobile.svg は実形状** — `<path>` 要素で実際の地形。ファイルサイズ約 30KB
5. **map-circle.svg/map-polygon.svg はデフォルメ** — `<circle>` / `<path>` で簡略化。ファイルサイズ 11〜16KB。単一ファイルへの埋め込みにはこちらが軽量で推奨
