# 地図埋め込みパターン（Google Maps iframe）

Power Platform のアプリに地図を埋め込む共通パターン。**Generative Pages / Code Apps / Power Pages で同じ URL レシピを使う**。
API キー不要の `output=embed` 方式のみを扱い、座標・住所・地名をそのまま渡すため **国内外どちらも同じ実装で表示できる**。

> **SVG 地図は採用しない**: 都道府県別 SVG は形状・粒度が固定で、市区町村・海外・拠点座標に拡張できない。
> 地図要件は Google Maps 埋め込みに一本化する。

---

## 1. ホスト別 CSP 早見表（最重要）

**ホストによって CSP の効き方が違う。** ここを取り違えると「不要な設定を促す」「必要な設定を見落とす」の両方が起きる。

| ホスト | CSP の既定 | `frame-src` の追加 |
|---|---|---|
| **Code Apps** | プラットフォームが `frame-src 'self'` を**強制**（無効化不可） | **必須** → [Code Apps CSP 構成](../../code-apps/references/csp.md) |
| **Generative Pages / モデル駆動型アプリ** | CSP は**オプトイン**。`iscontentsecuritypolicyenabled` の既定は `false` で CSP ヘッダー自体が出ない | **不要**（既定のまま埋め込める） |
| **Power Pages** | サイト側の CSP 設定に従う | サイトで CSP を有効にしている場合のみ必要 |

### モデル駆動型アプリで CSP を有効化している場合

環境が CSP を有効化している場合のみ、以下を追加する。`Frame-Src` は **Strict CSP を有効にしたときだけ効く**ディレクティブである点に注意（`Frame-Ancestor` のみ既定モードで設定可能）。

| ディレクティブ | 追加するソース |
|---|---|
| `Frame-Src` | `https://www.google.com` `https://maps.google.com` |

```powershell
# 現状確認（読み取り専用）
python .github/skills/admin/scripts/set_content_security_policy.py --environment-url <ENV_URL>

# 有効化している環境でのみ追加（--apply なしは dry-run）
python .github/skills/admin/scripts/set_content_security_policy.py --environment-url <ENV_URL> `
  --enable --strict --directive "Frame-Src=https://www.google.com,https://maps.google.com" --apply
```

> CSP の有効化は**環境全体に影響する**。地図を出すためだけに有効化してはいけない。
> 既定（無効）のままなら Generative Pages では設定不要。

---

## 2. 埋め込み URL レシピ（API キー不要）

`output=embed` を付けると認証不要の埋め込みビューになる。値は必ず `encodeURIComponent` を通す。

| 用途 | URL |
|---|---|
| 座標にピン | `https://maps.google.com/maps?q=${lat},${lon}&z=15&hl=ja&output=embed` |
| 住所・施設名にピン | `https://maps.google.com/maps?q=${encodeURIComponent(address)}&hl=ja&output=embed` |
| 海外拠点 | 同上。`q` に海外住所・地名・座標を渡すだけで表示される（別実装は不要） |
| ルート案内 | `https://maps.google.com/maps?saddr=${encodeURIComponent(from)}&daddr=${encodeURIComponent(to)}&dirflg=d&hl=ja&output=embed` |
| 周辺検索 | `https://maps.google.com/maps?q=${encodeURIComponent(keyword)}&near=${encodeURIComponent(area)}&hl=ja&output=embed` |

- `z` はズーム（1=世界全体 〜 21=建物）。世界地図として見せるなら `z=2`〜`3`。
- `hl=ja` で UI を日本語化。海外向けに出すなら省略またはユーザー言語に合わせる。
- `maps.google.com` は `www.google.com/maps/embed` に 302 リダイレクトされる。どちらを指定しても動作は同じ。

---

## 3. iframe 実装の共通ルール

```tsx
<iframe
  src={embedUrl}
  title="地図"
  loading="lazy"
  referrerPolicy="no-referrer-when-downgrade"
  sandbox="allow-scripts allow-same-origin allow-popups"
/>
```

| ルール | 理由 |
|---|---|
| `sandbox` を付けるなら **`allow-same-origin` は必須** | 外すと Maps JS が `SecurityError: Blocked a frame at "https://www.google.com" from accessing a frame at "null"` を投げる（実測） |
| `title` を必ず付ける | スクリーンリーダー対応。アクセシビリティ検査でも指摘される |
| ユーザー入力は `encodeURIComponent` で必ずエスケープ | 未エスケープの住所・キーワードを URL に連結すると、`&` 以降がパラメータとして解釈されクエリを差し替えられる |
| 座標は数値として検証してから埋め込む | Dataverse の値をそのまま連結しない |

`sandbox` を省略しても動作するが、**外部コンテンツを埋め込む以上は付けることを既定とする**。

---

## 4. Code Apps 実装（React + Tailwind + shadcn/ui）

```tsx
// src/components/map-embed.tsx
interface MapEmbedProps {
  /** 座標。address より優先される */
  lat?: number
  lon?: number
  /** 住所・施設名・地名。国内外どちらも可 */
  address?: string
  zoom?: number
  className?: string
}

export function MapEmbed({ lat, lon, address, zoom = 15, className }: MapEmbedProps) {
  const query =
    Number.isFinite(lat) && Number.isFinite(lon)
      ? `${lat},${lon}`
      : (address ?? "").trim()

  if (!query) {
    return (
      <div className={cn("grid place-items-center rounded-md border bg-muted", className)}>
        <p className="text-muted-foreground text-sm">位置情報がありません</p>
      </div>
    )
  }

  const src =
    `https://maps.google.com/maps?q=${encodeURIComponent(query)}` +
    `&z=${zoom}&hl=ja&output=embed`

  return (
    <iframe
      src={src}
      title={`地図: ${query}`}
      className={cn("w-full rounded-md border", className)}
      style={{ border: 0 }}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      sandbox="allow-scripts allow-same-origin allow-popups"
    />
  )
}
```

**CSP 設定を忘れずに行う**（Code Apps では必須）。手順は [csp.md](../../code-apps/references/csp.md) を参照。

---

## 5. Generative Pages 実装（React 17 + Fluent UI V9）

単一 `.tsx` 構成。`makeStyles` + `tokens` でスタイリングする。**CSP 設定は既定では不要**。

```typescript
/* makeStyles */
mapFrame: {
  width: "100%",
  height: "420px",
  border: "1px solid " + tokens.colorNeutralStroke2,
  borderRadius: tokens.borderRadiusMedium,
},

/* 選択拠点の埋め込み URL を組み立てる */
var [selected, setSelected] = useState<{ name: string; lat: number; lon: number } | null>(null);

var mapUrl = useMemo(function () {
  if (!selected) return "";
  if (!isFinite(selected.lat) || !isFinite(selected.lon)) return "";
  return (
    "https://maps.google.com/maps?q=" +
    encodeURIComponent(selected.lat + "," + selected.lon) +
    "&z=15&hl=ja&output=embed"
  );
}, [selected]);

/* JSX */
{mapUrl ? (
  <iframe
    src={mapUrl}
    title={"地図: " + selected.name}
    className={styles.mapFrame}
    loading="lazy"
    referrerPolicy="no-referrer-when-downgrade"
    sandbox="allow-scripts allow-same-origin allow-popups"
  />
) : (
  <Text>拠点を選択してください</Text>
)}
```

> `100vh` は禁止。高さは固定 px または flex で確保する。

---

## 6. Dataverse 連携（拠点マップ）

拠点テーブルに緯度経度または住所列を持たせ、一覧で選択した行を地図に表示する。

**Generative Pages（DataAPI・読み取り専用）**

```typescript
useEffect(function () {
  props.dataApi
    .queryTable("${PUBLISHER_PREFIX}_locations", {
      select: ["${PUBLISHER_PREFIX}_name", "${PUBLISHER_PREFIX}_latitude", "${PUBLISHER_PREFIX}_longitude"],
      pageSize: 250,
    })
    .then(function (res) {
      var items = [...res.rows].map(function (r: any) {
        return {
          name: String(r["${PUBLISHER_PREFIX}_name"] || ""),
          lat: Number(r["${PUBLISHER_PREFIX}_latitude"]),
          lon: Number(r["${PUBLISHER_PREFIX}_longitude"]),
        };
      });
      setLocations(items.filter(function (i) { return isFinite(i.lat) && isFinite(i.lon); }));
    });
}, []);
```

**Code Apps（SDK・postMessage ベースのみ CSP 安全）**

```ts
const res = await dataSource.retrieveMultipleRecordsAsync(
  `?$select=${PUBLISHER_PREFIX}_name,${PUBLISHER_PREFIX}_latitude,${PUBLISHER_PREFIX}_longitude&$top=250`
)
```

> 地図は 1 枚だけ描画し、一覧の選択に応じて `src` を差し替える。
> 拠点ごとに iframe を並べると外部リクエストが件数分発生して重くなる。

---

## 7. レイアウト

```
[KPI: 拠点数] [KPI: 対象地域] [KPI: 稼働率] [KPI: 前月比]

┌──────────────────────┐ ┌──────────────┐
│                      │ │  拠点一覧     │
│   Google Maps        │ │  （選択式）   │
│   (選択拠点を表示)    │ │              │
│                      │ │  詳細パネル   │
└──────────────────────┘ └──────────────┘
```

- 地図は左 2/3、一覧・詳細は右 1/3 のグリッドが基本。
- モバイルは 1 列に落とし、地図の高さを 240〜280px に縮める。

---

## 8. 応用: 複数ピンを同時に出す（自前オーバーレイ）

`output=embed` の埋め込みは「1 箇所を中心に表示」しかできず、**複数マーカーもマーカーのクリックも扱えない**。
Maps JavaScript API を使えば可能だが、API キーの発行・課金・`script-src` / `connect-src` の追加が要る。

**割り切り**: 埋め込み iframe を**静的な背景**として敷き、ピンは自前の DOM 要素を Web メルカトル投影で絶対配置する。
ズーム・全体表示は自前ボタンで行い、iframe の URL を作り直してピンとのズレを防ぐ。

```tsx
const TILE_SIZE = 256;

/** 緯度経度 → Web メルカトルのピクセル座標（Google Maps と同じ投影） */
function project(lat: number, lng: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return {
    x: scale * (0.5 + lng / 360),
    y: scale * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)),
  };
}

// 中心とズームは state で持ち、iframe の URL とピンの座標計算で必ず同じ値を使う
const embedUrl = `https://www.google.com/maps?ll=${view.lat},${view.lon}&z=${view.zoom}&hl=ja&output=embed`;
```

```tsx
<div className="relative">
  {/* iframe はあくまで背景。pointer-events を切らないとドラッグでピンとズレる */}
  <iframe src={embedUrl} title="拠点マップ" loading="lazy"
          className="pointer-events-none absolute inset-0 h-full w-full" />
  {visibleSites.map((site) => {
    const p = project(site.lat, site.lon, view.zoom);
    return (
      <button key={site.id} type="button"
        style={{ left: center.x + (p.x - origin.x), top: center.y + (p.y - origin.y) }}
        className="absolute -translate-x-1/2 -translate-y-full"
        onClick={() => onSelect(site.id)}>
        <MapPin style={{ color: STATUS_COLOR[site.status] }} />
      </button>
    );
  })}
</div>
```

| 守るポイント | 理由 |
|---|---|
| iframe に `pointer-events: none` を付ける | ユーザーが地図をドラッグ/ズームすると中心が変わり、ピンだけ取り残されてズレる |
| ズーム・全体表示は自前ボタンにする | `view` state を単一の真実にして iframe とピンを同期させる |
| `ResizeObserver` でコンテナ実寸を取る | 中心ピクセルが分からないとピンを配置できない |
| 表示範囲外のピンは描画しない | ズームインしたとき遠方のピンがコンテナ端に張り付くのを防ぐ |
| 「Google マップで開く」リンクを別途置く | 経路検索など本格的な地図操作は新規タブ（CSP 対象外）へ逃がす |
| 拠点マスタは Dataverse テーブルに持つ | 住所・緯度経度・稼働状況を業務側で保守する（座標をコードに埋めない） |

> 単一拠点の表示で足りるならこの節は不要。**セクション 4〜6 の「1 枚の iframe の `src` を差し替える」方式を優先する。**

---

## 9. 制約と判断材料

| 観点 | 内容 |
|---|---|
| オフライン | 不可。インターネット接続が必須 |
| データ別色分け | 不可。地図上のコロプレス（塗り分け）は `output=embed` では実現できない。**集計の可視化は地図ではなくグラフ＋一覧で行う** |
| API キー | 不要。ただし `output=embed` は公式ドキュメント化された方式ではない。契約上の保証が必要なら [Maps Embed API](https://developers.google.com/maps/documentation/embed/get-started)（キー必要）を検討する |
| 利用規約 | Google Maps Platform の利用規約に従う。業務利用時は組織の法務・調達方針を確認する |
| 代替 | 外部接続を避けたい場合は OpenStreetMap の埋め込み（`https://www.openstreetmap.org/export/embed.html?bbox=...`）も同じ iframe パターンで動作する |

---

## 10. 検証記録

`usdevgeek01`（CSP 既定＝無効）の Generative Page で 2026-09-11 に実測。

| 確認項目 | 結果 |
|---|---|
| `securitypolicyviolation` イベント | 0 件 |
| CSP 設定なしでの Google Maps 描画 | 成功（`.gm-style` 生成・タイル読込確認） |
| `sandbox="allow-scripts allow-same-origin allow-popups"` | 成功 |
| `sandbox` から `allow-same-origin` を除外 | Maps JS が `SecurityError` を送出 |
| OpenStreetMap 埋め込み（対照群） | 成功 |

> CSP を有効化＋Strict 化した環境での挙動は未検証。その構成では `Frame-Src` の追加が必要になる。
