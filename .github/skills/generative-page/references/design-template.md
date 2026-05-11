# Generative Pages デザインテンプレート

業務要件に合ったページを構築するための **UIパターンカタログ** と **構築パターン**。
Generative Pages の SDK 制約（React 17 + Fluent UI V9 + D3.js v7）内で実装可能なパターンのみ収録。

> **エージェントの使い方**:
>
> 1. ページ作成を依頼されたら **いきなり KPI ダッシュボードを作らない**
> 2. まず「何を管理・可視化したいですか？」とユーザーに質問する
> 3. 回答に基づき **構築パターン** を提案 → 承認後に実装
> 4. 初回デプロイ後、本テンプレートから **段階的改善** を提案

---

## ユーザーへの最初の質問テンプレート

```
Generative Page を作成します。最適なページを構築するため、以下を教えてください:

1. **何を管理・可視化したいですか？**
   例: 設備の稼働状況、営業パイプライン、プロジェクト進捗、人員配置...

2. **主な利用者は誰ですか？**
   例: 現場担当者、マネージャー、経営層...

3. **以下のどのパターンに近いですか？**
   A) **入力ウィザード** — ステップ形式でデータ入力・登録をガイド
   B) **KPI ダッシュボード** — 数値指標・チャートで全体像を俯瞰
   C) **カンバンボード** — ドラッグ＆ドロップでステータス管理
   D) **スケジュール管理（ガントチャート）** — タスクの期間・依存関係を可視化
   E) **日本地図ダッシュボード** — 都道府県別データの地図可視化・地域分析
   F) **オブジェクトフロー** — 特定レコード中心に関連エンティティのフロー・因果関係を可視化
   G) **分析レポート** — 多軸データの期間別集計・メンバー別比較・予実対比チャート

4. **特に見たいチャートや UI はありますか？**（任意）
   例: トレンドライン、ドーナツ、ガントチャート、地図、ヒートマップ...
```

---

## 構築パターン（7種）

### Pattern A: 入力ウィザード

**向いている場面**: データ登録・申請フォーム・新規レコード作成・セットアップ手順のガイド

**構成要素（Tier順）**:

> **Tier 1 = 初回デプロイに必ず含める**。Tier 2・3 は段階的改善で追加する。

| Tier | コンポーネント       | 説明                                                        |
| ---- | -------------------- | ----------------------------------------------------------- |
| 1    | ステッププログレス   | 横並びステップ番号 + 現在位置ハイライト                     |
| 1    | フォームセクション   | 入力フィールド群（Input, Dropdown, DatePicker, Textarea）   |
| 1    | ナビゲーションボタン | 「戻る」「次へ」「送信」の3ボタン                           |
| 1    | ボタン式 Choice      | Choice フィールドは Dropdown ではなくカラー付きトグルボタン |
| 2    | バリデーション表示   | フィールドごとのエラーメッセージ + サマリー                 |
| 2    | プレビューステップ   | 入力内容の確認画面（読み取り専用表示）                      |
| 2    | 自動保存インジケータ | 入力中のドラフト自動保存状態表示                            |
| 3    | 条件分岐ステップ     | 前ステップの回答に応じて表示ステップを変更                  |
| 3    | ファイルアップロード | ドラッグ＆ドロップ + プレビュー                             |
| 3    | 完了アニメーション   | チェックマーク + confetti 風エフェクト                      |

**レイアウト**:

```
[Step 1] ─── [Step 2] ─── [Step 3] ─── [Step 4]    ← ステッププログレス
┌──────────────────────────────────────────────┐
│  フォームセクション（ステップに応じて切替）    │    ← max-width: 640px 中央寄せ
│  [フィールド1]                                │
│  [フィールド2]                                │
│  [フィールド3]                                │
└──────────────────────────────────────────────┘
         [← 戻る]              [次へ →]             ← ナビゲーション
```

**主要ロジック**:

- `useState` で `currentStep` を管理
- 各ステップのフォームデータを `useRef` or `useState` で保持
- 「送信」で Dataverse `createRecord()` を実行
- バリデーションは `onBlur` + ステップ遷移時に一括チェック

### Pattern B: KPI ダッシュボード

**向いている場面**: 経営層・マネージャー向け、全体像の俯瞰、定量評価

**構成要素（Tier順）**:

> **Tier 1 = 初回デプロイに必ず含める**。Tier 2・3 は段階的改善で追加する。

| Tier | コンポーネント       | 説明                                               |
| ---- | -------------------- | -------------------------------------------------- |
| 1    | KPI スコアカード     | 4列グリッド、ラベル+値+変動▲▼                      |
| 1    | DataGrid             | クリック可能行、フィルター、モバイル対応           |
| 1    | モーダル編集フォーム | Dialog + ボタン式 Choice + トースト通知            |
| 1    | ボタン式 Choice      | ステータス等の選択肢をカラー付きトグルボタンで表示 |
| 2    | トレンドライン       | D3 area+line、グラデーション、ストローク描画       |
| 2    | ドーナツチャート     | 65%カットアウト、上部レジェンド、% 表示            |
| 2    | カテゴリテーブル     | バーインジケータ+ステータスドット                  |
| 3    | ゲージメーター       | 目標達成率の半円表示                               |
| 3    | ウォーターフォール   | 増減内訳の段階表示                                 |
| 3    | 混合チャート         | 棒(実績)+線(率)の2軸                               |
| 3    | 地図ビジュアル       | D3 geoMercator + バブル                            |

**レイアウト**:

```
[Tab: ダッシュボード | Tab: データ]          ← タブ切替（初回はダッシュボード）

── ダッシュボードタブ ──
[KPI] [KPI] [KPI] [KPI]          ← 4列グリッド
[==トレンドライン==] [ドーナツ]    ← 2×2 チャートグリッド
[===バーチャート===] [ドーナツ2]   ← 4枚のチャートを 2×2 で配置

── データタブ ──
[DataGrid (ソート・クリック編集)]  ← 全幅 + フィルター
```

> **設計原則**: チャートとデータを同一画面に詰め込まない。チャート4枚を初回表示し、データはタブ切替で別画面に表示する。

> **実装原則**: 全 D3 チャートの useEffect は `requestAnimationFrame` で描画を遅延すること（初回レンダー時のレイアウト未完了対策）。ガントチャート等のギャラリー行は固定 height + `boxSizing: "border-box"` で D3 側と位置計算を統一する。

> **ツールチップ原則**: 全チャートに D3 ツールチップを実装する。`position: absolute` + 親コンテナ `getBoundingClientRect()` でマウス直近に表示。`position: fixed` は禁止（ランタイムでマウスから離れる）。

### Pattern C: カンバンボード（ドラッグ＆ドロップ ステータス管理）

**向いている場面**: タスク管理、案件管理、承認フロー、チケット管理

**構成要素（Tier順）**:

> **Tier 1 = 初回デプロイに必ず含める**。Tier 2・3 は段階的改善で追加する。

| Tier | コンポーネント        | 説明                                                     |
| ---- | --------------------- | -------------------------------------------------------- |
| 1    | カンバンレーン（4列） | ステータスごとの CSS Grid 列 + カード一覧                |
| 1    | カンバンカード        | タイトル + 担当者アバター + 優先度ドット + 期限          |
| 1    | レーンヘッダー        | ステータス名 + 件数バッジ + 色付き左ボーダー             |
| 1    | モーダル編集フォーム  | カードクリックで Dialog 表示 + ボタン式 Choice + 保存    |
| 1    | ボタン式 Choice       | ステータス・優先度等の選択をカラー付きトグルボタンで実装 |
| 2    | ドラッグ＆ドロップ    | HTML5 DnD API でカード移動 → Dataverse 更新              |
| 2    | フィルター・検索      | 担当者フィルタ / 優先度フィルタ / キーワード検索         |
| 2    | ステータスサマリー    | 各レーンの件数・割合を上部に表示                         |
| 3    | スイムレーン          | 担当者・カテゴリ別の横分割                               |
| 3    | WIP リミット表示      | 進行中列の上限超過をアラート表示                         |

**レイアウト**:

```
[検索] [フィルター: 担当者] [フィルター: 優先度]     ← フィルターバー
┌──────────┬──────────┬──────────┬──────────┐
│ Backlog  │ 進行中    │ レビュー  │ 完了      │   ← レーンヘッダー
│ (5)      │ (3)      │ (2)      │ (8)      │
├──────────┼──────────┼──────────┼──────────┤
│ [Card]   │ [Card]   │ [Card]   │ [Card]   │   ← ドラッグ可能カード
│ [Card]   │ [Card]   │ [Card]   │ [Card]   │
│ [Card]   │ [Card]   │          │ [Card]   │
│ [Card]   │          │          │ ...      │
└──────────┴──────────┴──────────┴──────────┘
```

**主要ロジック**:

- `useState` で各レーンのアイテム配列を管理
- HTML5 Drag & Drop: `onDragStart`, `onDragOver`, `onDrop` で移動
- ドロップ時に Dataverse `Xrm.WebApi.online.updateRecord()` でステータス列を更新
- レーン定義は Choice 値から自動生成
- モバイル: 4列 → 1列タブ切替（`TabList` でレーン選択）

### Pattern D: スケジュール管理（ガントチャート）

**向いている場面**: 工程管理、メンテナンス計画、プロジェクトスケジュール、リソース割当

**構成要素（Tier順）**:

> **Tier 1 = 初回デプロイに必ず含める**。Tier 2・3 は段階的改善で追加する。

| Tier | コンポーネント                   | 説明                                                  |
| ---- | -------------------------------- | ----------------------------------------------------- |
| 1    | タスク一覧（左パネル）           | タスク名 + 担当者 + ステータスバッジ                  |
| 1    | タイムライングリッド（右パネル） | D3 横棒 + 日付ヘッダー                                |
| 1    | 期間バー                         | タスクの開始〜終了を色付き横棒で表示                  |
| 1    | モーダル編集フォーム             | バー/タスククリックで Dialog + ボタン式 Choice + 保存 |
| 1    | ボタン式 Choice                  | ステータス・優先度等をカラー付きトグルボタンで実装    |
| 2    | ズームコントロール               | 日/週/月 表示切替                                     |
| 2    | 今日マーカー                     | 現在日を赤い縦線で表示                                |
| 2    | 進捗率表示                       | バー内に進捗%を重ねて表示                             |
| 3    | 依存関係線                       | タスク間の矢印（D3 path）                             |
| 3    | ドラッグで期間変更               | バーの端をドラッグして日付更新                        |
| 3    | マイルストーン                   | ◆マーカーで重要日程を表示                             |

**レイアウト**:

```
[← 前月] [2026年5月] [次月 →]  [日|週|月]      ← ヘッダー + ズーム
┌─────────────┬────────────────────────────────┐
│ タスク名     │  1  2  3  4  5  6  7  8  ...  │   ← 日付ヘッダー
├─────────────┼────────────────────────────────┤
│ 要件定義     │ ████████░░                     │   ← 期間バー (80%)
│ 基本設計     │       ██████████               │
│ 開発 Ph.1   │             ████████████       │
│ テスト       │                     ████████  │
│ リリース     │                          ◆    │   ← マイルストーン
└─────────────┴──────────────── | ─────────────┘
                               ↑ 今日マーカー
```

**主要ロジック**:

- D3 `scaleTime` で X 軸（日付）、手動ピクセル計算で Y 軸（タスク行）
- **ギャラリー行の固定 height + border-box**: 左パネルの各行は `height: 36px` + `boxSizing: "border-box"` で固定。`minHeight` / padding は使わない
- **D3 側は `headerH + i * rowH` で位置計算**: `scaleBand().padding()` は HTML 側と一致しないため禁止。`var yPos = headerH + i * rowH;` で手動計算
- `useEffect` 内で SVG rect をレンダリング + アニメーション（`requestAnimationFrame` で遅延）
- ズーム: `useState` で `viewRange` を管理（日: 14日、週: 8週、月: 6ヶ月）
- 今日マーカー: `new Date()` を X スケールに変換して縦線描画
- 進捗率: バー内に 2 つの rect（背景 + 進捗分）を重ねる
- モバイル: 左パネル非表示、バーのみ表示 + タップで詳細

### Pattern E: 日本地図ダッシュボード

**向いている場面**: 地域別売上・拠点管理・設備分布・顧客分布・災害対応

詳細な実装パターン・SVG 読み込み方法・色分けロジック・Dataverse 連携パターンは [日本地図パターン](japan-map-pattern.md) を参照。

**構成要素（Tier順）**:

> **Tier 1 = 初回デプロイに必ず含める**。Tier 2・3 は段階的改善で追加する。

| Tier | コンポーネント | 説明 |
|------|---------------|------|
| 1 | SVG マップ表示 | SVG を TypeScript 文字列リテラルとして埋め込み、`innerHTML` で展開 |
| 1 | 都道府県ホバーハイライト | mouseover で `fill` 変更 + 都道府県名ツールチップ |
| 1 | 都道府県クリックイベント | クリックで詳細データ表示（Dialog モーダル） |
| 1 | 地域別カラーリング | `data-code` を基にデータ値 → 色を反映 |
| 2 | 凡例（レジェンド） | 色とデータ範囲の対応表示 |
| 2 | KPI カード連動 | 選択都道府県の KPI を上部に表示 |
| 2 | 地方別フィルタ | 八地方区分でフィルタ（CSS クラスベース） |
| 3 | ズーム＆パン | SVG transform で拡大縮小 |

**レイアウト**:

```
[KPI: 全国合計] [KPI: 選択地域] [KPI: 前月比] [KPI: 目標達成率]
[Tab: 地図 | Tab: データ]

── 地図タブ ──
[地方フィルタ: 全国 / 北海道 / 東北 / ...]
┌───────────────────┐ ┌──────────┐
│                   │ │  詳細     │
│   日本地図 SVG     │ │  パネル   │
│   (色分け表示)     │ │  (選択時) │
│                   │ │          │
└───────────────────┘ └──────────┘
[凡例: ■低 ■中 ■高]

── データタブ ──
[DataGrid (都道府県 × KPI)]
```

**主要ロジック**:

- SVG アセットは `public/maps/` に格納。Generative Pages では文字列リテラルとして埋め込む
- `useRef` + `useEffect` で SVG 内の `.prefecture` 要素にイベントをバインド
- 都道府県コードは `data-code` 属性から取得（1〜47）
- 八地方区分は CSS クラス（`hokkaido`, `tohoku`, `kanto`, `chubu`, `kinki`, `chugoku`, `shikoku`, `kyushu-okinawa`）で判定
- D3 geoMercator は不要（SVG 自体が地図形状を持つ）

### Pattern F: オブジェクトフロー（レコード選択 + 3列フロー図 + 詳細サイドバー + レコードモーダル + 関連ハイライト）

**向いている場面**: 特定レコード（資産・取引先・設備・案件等）を中心に、関連する 3 種エンティティのフロー・因果関係を可視化したい場合。IoT 資産管理・営業フォローアップ・プロジェクト管理・設備メンテナンスに広く適用できる。

**構成要素（Tier順）**:

> **Tier 1 = 初回デプロイに必ず含める**。Tier 2・3 は段階的改善で追加する。

| Tier | コンポーネント             | 説明                                                                             |
| ---- | -------------------------- | -------------------------------------------------------------------------------- |
| 1    | レコードセレクター         | Dropdown で主レコード（資産・取引先等）を選択、URL ハッシュで初期値引継ぎ       |
| 1    | レコードヘッダー           | 選択レコードのアイコン + 名称 + 属性サマリー + 「詳細」ボタン                   |
| 1    | KPI カード行（4枚）        | 関連エンティティ件数・完了数・異常数等を左ボーダーカラー付きカードで表示         |
| 1    | タブバー                   | フロー図 / 各エンティティ一覧 / 分析 の TabList 切替                            |
| 1    | 3列フロー図（D3 SVG）      | 左・中・右エンティティをベジェエッジ + ドットグリッド背景で可視化（xyflow風）   |
| 1    | 詳細サイドバー             | フロー図ノードクリックで右にスライドイン、関連アイテムへの MDA フォームリンク付き |
| 1    | レコード詳細モーダル       | ヘッダー「詳細」ボタンで Fluent UI Dialog 表示 + 「フォームを開く」ボタン       |
| 2    | エンティティ一覧タブ       | 各エンティティの詳細リスト（アコーディオン・バッジ・進捗バー付き）               |
| 2    | 分析チャートタブ           | D3 棒グラフ等で時系列・分類別集計を表示                                          |
| 3    | フィルター / 検索          | レコードセレクターへのキーワード絞り込み                                          |

**レイアウト**:

```
[レコードセレクター Dropdown]  ← 全幅上部バー
┌──────────────────────────────────────────────────┐
│ [アイコン] [レコード名]  [属性1] [属性2]  [詳細▶] │  ← ヘッダー
├──────────────────────────────────────────────────┤
│ [KPI1] [KPI2] [KPI3] [KPI4]                      │  ← KPI行
├──────────────────────────────────────────────────┤
│ [Tab: フロー図 | Tab: エンティティA | Tab: 分析]  │  ← タブバー
├──────────────────────────────────────────────────┤
│ ┌─── 3列フロー図 (D3 SVG) ───────────┐ ┌──────┐ │
│ │  ⚡ 左エンティティ   │ 📋 中エンティティ │ 🔧 右エンティティ │ │ 詳細 │ │
│ │  [ノード]            │ [ノード] ─────→ │ [ノード]           │ │ サイド│ │
│ │  [ノード] ─────→    │ [ノード]          │ [ノード]           │ │ バー  │ │
│ └────────────────────────────────────┘ └──────┘ │
└──────────────────────────────────────────────────┘
```

**主要ロジック**:

- レコードセレクター: `useState` + `Dropdown` + `useEffect` で選択時に詳細データをロード
- URLハッシュ初期値: `window.location.hash` から `recordId=xxx` を抽出（GenPage ルール #28）
- 詳細データロード: `cancelled` フラグで競合（レース条件）を防止（資産を素早く切り替えても古いリクエストが混入しない）
- MDA フォーム URL: `encodeURIComponent(etn) + encodeURIComponent(id)` で安全にURLを生成
- 3列レイアウト: `col1X / col2X / col3X = padL + n * (nodeW + colGap)` で列X座標を計算
- ノード描画: `角丸12px + ドロップシャドウ(filter) + 左カラーバー + アイコン円 + clipPathテキスト + ステータスバッジ`
- ドットグリッド背景: SVG `<pattern>` で要素数一定（個別 circle 生成は禁止）
- エッジ: ベジェ曲線 `M x1 y1 C cpx y1 cpx y2 x2 y2` + 描画アニメーション（`stroke-dashoffset`）
- ツールチップ XSS 対策: `innerHTML` 禁止 → `textContent` + `appendChild` でテキスト安全代入
- 詳細サイドバー: `useState<{type, id} | null>` でクリックされたノードを管理、サイドバーコンポーネントに渡す
- 関連アイテム行: `role="button"`, `tabIndex=0`, `onKeyDown`（Enter/Space）でアクセシビリティ担保
- onItemClick: `useCallback` で参照を安定化（FlowDiagram の useEffect 依存から安全に除外）

**実装スニペット**:

```typescript
/* === MDA フォーム URL（encodeURIComponent 必須） === */
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

/* === ドットグリッド背景（<pattern> で要素数一定） === */
var bgDotPattern = defs.append("pattern")
  .attr("id", "bgDotGrid").attr("patternUnits", "userSpaceOnUse")
  .attr("width", 24).attr("height", 24);
bgDotPattern.append("circle").attr("cx", 20).attr("cy", 20).attr("r", 1).attr("fill", P.gray200);
svg.append("rect").attr("width", W).attr("height", totalH).attr("fill", "#fafbfc");
svg.append("rect").attr("width", W).attr("height", totalH).attr("fill", "url(#bgDotGrid)");

/* === ツールチップ（XSS 安全: innerHTML 禁止） === */
while (tooltipEl.firstChild) tooltipEl.removeChild(tooltipEl.firstChild);
function appendTipBlock(text: string, style?: string) {
  var div = document.createElement("div");
  if (style) div.style.cssText = style;
  div.textContent = text;
  tooltipEl.appendChild(div);
}

/* === 詳細データロード（cancelled フラグで競合防止） === */
var loadDetails = useCallback(function (recordId: string) {
  var cancelled = false;
  (async function () {
    try {
      var rows = await loadAllRows(dataApi, "my_entity", { /* ... */ });
      if (cancelled) return;
      setItems(rows);
    } catch (e) { console.error(e); }
    finally { if (!cancelled) setLoading(false); }
  })();
  return function () { cancelled = true; };
}, [dataApi]);

useEffect(function () {
  if (selectedId) return loadDetails(selectedId);
}, [selectedId, loadDetails]);

/* === 関連アイテム行（アクセシビリティ） === */
React.createElement("div", {
  role: "button", tabIndex: 0,
  "aria-label": "レコードを開く: " + item.name,
  onClick: function () { window.open(mdaFormUrl("my_entity", item.id), "_top"); },
  onKeyDown: function (e: any) {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      window.open(mdaFormUrl("my_entity", item.id), "_top");
    }
  },
  /* ... */
})

/* === onItemClick を useCallback で安定化 === */
var handleFlowItemClick = useCallback(function (type: string, id: string) {
  setSelectedItem({ type: type, id: id });
}, []);
// FlowDiagram props に渡す
React.createElement(FlowDiagram, { onItemClick: handleFlowItemClick, /* ... */ })
```

**カスタマイズガイド（業務シナリオ別）**:

| シナリオ          | 左列（発生源）             | 中列（介在エンティティ）  | 右列（アクション）  | 主レコード           |
| ----------------- | -------------------------- | ------------------------- | ------------------- | -------------------- |
| IoT 資産管理      | IoTアラート                | サポート案件              | 作業指示書          | 顧客資産             |
| 営業フォロー      | リード                     | 商談                      | 見積もり            | 取引先担当者         |
| プロジェクト      | リスク・課題               | マイルストーン            | タスク              | プロジェクト         |
| 設備メンテナンス  | 故障報告                   | 検査記録                  | 修繕作業            | 設備                 |
| カスタマーサポート| 問い合わせ                 | エスカレーション          | 解決策              | 取引先               |

### Pattern G: 分析レポート（期間別集計 + 多軸チャート + メンバー比較 + 予実対比）

**向いている場面**: CE稼働率分析、作業指示書コスト分析、リソース活用度レポート、マネージャー向け多軸データ可視化、定期レポート自動化

**構成要素（Tier順）**:

> **Tier 1 = 初回デプロイに必ず含める**。Tier 2・3 は段階的改善で追加する。

| Tier | コンポーネント | 説明 |
|------|---------------|------|
| 1 | 期間セレクタ（年/月切替） | ボタン式トグルで「年ごと」「月ごと」を切替 + 年月ドロップダウン |
| 1 | KPIカード列（4列グリッド） | 主要指標の数値＋グラデーション背景＋カラー付きタイトル |
| 1 | 横棒グラフ（メンバー別稼働） | D3 横棒、有償/無償を色分け積み上げ、ラベル表示 |
| 1 | ドーナツチャート（比率表示） | D3 pie + arc、中央テキストで主要 KPI %表示 |
| 1 | D3 ツールチップ（全チャート共通） | `showTip/moveTip/hideTip` パターンで共有 |
| 2 | 組織/部署フィルタ（ドロップダウン） | チャート・テーブル・KPI を同時フィルタ |
| 2 | スタック横棒（メンバー×カテゴリ） | 1メンバーのバーを複数カテゴリで色分け積み上げ |
| 2 | 予実対比縦棒（dual bar） | 同一期間に予定/実績の2本を並べて差異を可視化 |
| 2 | 集計スパン切替（週次/月次/四半期） | 縦棒の時間軸粒度を切替 |
| 3 | データテーブル（カード下部） | フィルタ連動のソート可能テーブル |
| 3 | CSV/PDF エクスポート | レポートデータの出力 |

**レイアウト**:

```
[年ごと|月ごと] [◀ 2026 ▶] [1月▼]  [部署▼]     ← 期間＋フィルタ

[KPI] [KPI] [KPI] [KPI]                          ← 4列 auto-fit grid

┌──────────────┬──────────────┬─────────┐
│ メンバー別     │ メンバー別    │ 稼働率   │        ← 3カラム grid (1fr 1fr auto)
│ 稼働率(横棒)   │ WO種別(積上) │ ドーナツ  │
└──────────────┴──────────────┴─────────┘

┌────────────────────────────────────────┐
│ 予実対比 縦棒グラフ [週次|月次|四半期]   │        ← 全幅
└────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ メンバー別一覧テーブル                      │        ← 全幅テーブル
└──────────────────────────────────────────┘
```

**主要ロジック**:

- `useState` で `mode`（年/月）、`year`、`month`、`orgId`（部署フィルタ）を管理
- `useCallback` + `loadData` で期間に応じたフィルタクエリを実行
- **複数テーブル並行クエリ**: booking + workorder + resource + woType + orgUnit を一括ロード
- **Lookup FK → 名前解決マップ**: FK ID を `select` し、関連テーブルを別クエリ→ `Map<string, string>` で名前構築（OData アノテーション名は `select` 不可）
- **スタック横棒は手動配置**: `d3.stack()` は使わず、メンバーごとに `forEach` + `rect append` + `x0 += segWidth` で各セグメントを手動配置（デバッグしやすい）
- **予実対比 dual bar**: `scaleBand` の各期間バンド内で 2 つの `rect` を横にオフセットして配置
- **ツールチップ共有**: `tooltipRef` を 1 つ作り、`showTip(html, ev)` / `moveTip(ev)` / `hideTip()` で全チャートから呼び出し

**期間セレクタの実装パターン**:

```typescript
/* 年/月モード切替ボタン（インラインスタイル） */
var modeButtons = ["year", "month"];
<div style={{ display: "flex", gap: 4 }}>
  {modeButtons.map(function (m) {
    var isActive = mode === m;
    return React.createElement("button", {
      key: m,
      onClick: function () { setMode(m); },
      style: {
        padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500,
        border: "1px solid " + (isActive ? P.blue : P.gray200),
        backgroundColor: isActive ? P.blue : "transparent",
        color: isActive ? "#fff" : P.gray600, cursor: "pointer",
      },
    }, m === "year" ? t("yearly") : t("monthly"));
  })}
</div>
```

**3カラムチャートグリッドの実装パターン**:

```typescript
/* gridTemplateColumns: "1fr 1fr auto" — 左2列=データ量に応じた均等幅、右列=固定幅チャート */
React.createElement("div", {
  style: { display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 16, alignItems: "start" },
},
  /* 左: メンバー別稼働率 横棒 */
  React.createElement("div", { style: { borderRadius: 12, overflow: "hidden", border: "1px solid " + P.gray200 } },
    /* ヘッダー + SVG ref */
  ),
  /* 中: メンバー別WO種別 スタック横棒 */
  React.createElement("div", { style: { borderRadius: 12, overflow: "hidden", border: "1px solid " + P.gray200 } },
    /* ヘッダー + SVG ref */
  ),
  /* 右: ドーナツ（固定幅 minWidth: 260） */
  React.createElement("div", { style: { borderRadius: 12, overflow: "hidden", border: "1px solid " + P.gray200, minWidth: 260 } },
    /* ヘッダー + SVG ref */
  ),
)
```

**スタック横棒の D3 実装パターン**:

```typescript
/* メンバーごとにループで rect を追加（d3.stack() は使わない） */
filteredRows.forEach(function (row) {
  var x0 = 0;
  var y = yScale(row.memberName) || 0;
  var bh = yScale.bandwidth();
  row.types.forEach(function (seg, ci) {
    var segW = xScale(seg.count);
    g.append("rect")
      .attr("x", x0).attr("y", y).attr("width", segW).attr("height", bh)
      .attr("fill", colors[ci % colors.length]).attr("rx", ci === 0 ? 3 : 0)
      .style("cursor", "pointer")
      .on("mouseover", function (ev) {
        var pct = row.total > 0 ? Math.round(seg.count / row.total * 1000) / 10 : 0;
        showTip("<b>" + row.memberName + "</b><br/>" + seg.typeName + ": " + seg.count + "件 (" + pct + "%)", ev);
      })
      .on("mousemove", function (ev) { moveTip(ev); })
      .on("mouseout", function () { hideTip(); });
    x0 += segW;
  });
  /* 合計ラベル */
  g.append("text").attr("x", x0 + 4).attr("y", y + bh / 2 + 4)
    .attr("font-size", "10px").attr("fill", P.gray500).text(row.total + "件");
});
```

**予実対比 dual bar の D3 実装パターン**:

```typescript
/* 同一バンド内に2本の棒を並列配置 */
var subBand = xScale.bandwidth() * 0.35;
/* 予定棒 */
g.selectAll(".est-bar").data(rows).enter().append("rect")
  .attr("x", function (d) { return (xScale(d.period) || 0) + xScale.bandwidth() * 0.1; })
  .attr("y", function (d) { return yScale(d.estCost); })
  .attr("width", subBand)
  .attr("height", function (d) { return innerH - yScale(d.estCost); })
  .attr("fill", P.teal).attr("opacity", 0.7).attr("rx", 3)
  .style("cursor", "pointer")
  .on("mouseover", function (ev, d) {
    var diff = d.actCost - d.estCost; var sign = diff >= 0 ? "+" : "";
    showTip("<b>" + d.period + "</b><br/>予定: ¥" + d.estCost.toLocaleString()
      + "<br/>実績: ¥" + d.actCost.toLocaleString()
      + "<br/>差異: " + sign + "¥" + diff.toLocaleString(), ev);
  })
  .on("mousemove", function (ev) { moveTip(ev); })
  .on("mouseout", function () { hideTip(); });
/* 実績棒 */
g.selectAll(".act-bar").data(rows).enter().append("rect")
  .attr("x", function (d) { return (xScale(d.period) || 0) + xScale.bandwidth() * 0.1 + subBand + 2; })
  .attr("y", function (d) { return yScale(d.actCost); })
  .attr("width", subBand)
  .attr("height", function (d) { return innerH - yScale(d.actCost); })
  .attr("fill", P.blue).attr("rx", 3)
  .style("cursor", "pointer")
  .on("mouseover", function (ev, d) { /* 同上 */ })
  .on("mousemove", function (ev) { moveTip(ev); })
  .on("mouseout", function () { hideTip(); });
```

**ツールチップ共有パターン（全チャート共通）**:

```typescript
/* ref: ルート div 直下に1つだけ配置 */
var tooltipRef = useRef<HTMLDivElement>(null);

function showTip(html: string, ev: any) {
  var tip = tooltipRef.current;
  if (!tip) return;
  tip.innerHTML = html;
  tip.style.opacity = "1";
  moveTip(ev);
}
function moveTip(ev: any) {
  var tip = tooltipRef.current;
  if (!tip || !tip.parentElement) return;
  var rect = tip.parentElement.getBoundingClientRect();
  var x = ev.clientX - rect.left + tip.parentElement.scrollLeft + 12;
  var y = ev.clientY - rect.top + tip.parentElement.scrollTop - 10;
  tip.style.left = x + "px";
  tip.style.top = y + "px";
}
function hideTip() {
  var tip = tooltipRef.current;
  if (tip) tip.style.opacity = "0";
}

/* JSX: ルート div 内に1つだけ配置 */
React.createElement("div", {
  ref: tooltipRef,
  style: {
    position: "absolute", pointerEvents: "none", zIndex: 9999,
    backgroundColor: "rgba(30,30,30,0.92)", color: "#fff",
    padding: "6px 10px", borderRadius: 6, fontSize: 11, lineHeight: "1.5",
    opacity: 0, transition: "opacity 0.15s",
    maxWidth: 220, boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
  },
})
```

---

## カラーパレット

ビジネス UI ギャラリー検証済み。Fluent UI tokens と併用可能。

```typescript
const P = {
  blue: "#2d5faa", // メインアクセント、ライン、バー
  teal: "#1a8f6e", // 成功・稼働・ポジティブ
  coral: "#c4532a", // 警告・注意
  purple: "#6b5fc7", // セカンダリ
  amber: "#b8850e", // 中間・保留
  red: "#c43a3a", // エラー・危険
  pink: "#b84070", // 補助
  green: "#3a8a2e", // 完了
  navy: "#1e3a5f", // 重い強調
};

/* 背景色（薄いバリエーション — ステータスボード等に使用） */
const PBg = {
  blue: "rgba(45,95,170,0.08)",
  teal: "rgba(26,143,110,0.08)",
  coral: "rgba(196,83,42,0.08)",
  purple: "rgba(107,95,199,0.08)",
  amber: "rgba(184,133,14,0.08)",
  red: "rgba(196,58,58,0.08)",
};
```

---

## UI パターンカタログ（業務要件別）

### 0. 入力ウィザード系

#### 0.1 ステッププログレス

```typescript
/* makeStyles */
stepProgress: {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0px",
  marginBottom: "24px",
},
stepItem: {
  display: "flex",
  alignItems: "center",
  gap: "0px",
},
stepCircle: {
  width: "28px",
  height: "28px",
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "12px",
  fontWeight: "600",
},
stepLine: {
  width: "40px",
  height: "2px",
},

/* JSX */
<div className={styles.stepProgress}>
  {steps.map(function (step, i) {
    var isActive = i === currentStep;
    var isDone = i < currentStep;
    return (
      <div key={i} className={styles.stepItem}>
        <div className={styles.stepCircle} style={{
          backgroundColor: isDone ? P.teal : isActive ? P.blue : tokens.colorNeutralBackground4,
          color: isDone || isActive ? "#fff" : tokens.colorNeutralForeground3,
        }}>
          {isDone ? "\u2713" : i + 1}
        </div>
        <span style={{ fontSize: 11, marginLeft: 4, color: isActive ? P.blue : tokens.colorNeutralForeground3 }}>{step.label}</span>
        {i < steps.length - 1 && (
          <div className={styles.stepLine} style={{
            backgroundColor: isDone ? P.teal : tokens.colorNeutralStroke2, marginLeft: 8, marginRight: 8,
          }} />
        )}
      </div>
    );
  })}
</div>
```

**使いどころ**: ウィザード上部のステップインジケーター

#### 0.2 フォームセクション + ナビゲーション

```typescript
/* ステップ切替ロジック */
const [currentStep, setCurrentStep] = useState(0);
const [formData, setFormData] = useState<Record<string, any>>({});

var StepContent = stepComponents[currentStep]; // 各ステップの React コンポーネント

/* ナビゲーションボタン */
<div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
  {currentStep > 0 && (
    <Button appearance="secondary" onClick={function () { setCurrentStep(currentStep - 1); }}>
      ← 戻る
    </Button>
  )}
  <div style={{ marginLeft: "auto" }}>
    {currentStep < steps.length - 1 ? (
      <Button appearance="primary" onClick={function () {
        if (validateStep(currentStep, formData)) { setCurrentStep(currentStep + 1); }
      }}>
        次へ →
      </Button>
    ) : (
      <Button appearance="primary" onClick={handleSubmit}>
        送信
      </Button>
    )}
  </div>
</div>
```

#### 0.3 プレビューステップ（確認画面）

```typescript
/* 最終ステップで入力内容を読み取り専用で表示 */
<div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "8px 16px", fontSize: 13 }}>
  {Object.entries(formData).map(function (entry) {
    return [
      <Text key={entry[0] + "-l"} style={{ color: tokens.colorNeutralForeground3 }}>{fieldLabels[entry[0]]}</Text>,
      <Text key={entry[0] + "-v"} weight="semibold">{String(entry[1])}</Text>,
    ];
  })}
</div>
```

**使いどころ**: 送信前の最終確認

#### 0.4 カンバンボード（4列レーン + DnD）

```typescript
/* makeStyles */
kanbanContainer: {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: "12px",
  "@media (max-width: 640px)": { gridTemplateColumns: "1fr" }, // モバイル: タブ切替
},
kanbanLane: {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  minHeight: "200px",
  padding: "8px",
  borderRadius: tokens.borderRadiusMedium,
  backgroundColor: tokens.colorNeutralBackground3,
},
kanbanCard: {
  backgroundColor: tokens.colorNeutralBackground1,
  border: "1px solid " + tokens.colorNeutralStroke2,
  borderRadius: "10px",
  padding: "10px 12px",
  cursor: "grab",
  transitionProperty: "transform, box-shadow",
  transitionDuration: "0.15s",
  ":hover": { transform: "translateY(-2px)", boxShadow: tokens.shadow8 },
},

/* Drag & Drop ロジック */
const [lanes, setLanes] = useState<Record<string, Item[]>>(initialLanes);
const [dragging, setDragging] = useState<string | null>(null);

function handleDragStart(e: React.DragEvent, itemId: string) {
  setDragging(itemId);
  (e.target as HTMLElement).style.opacity = "0.5";
}
function handleDragOver(e: React.DragEvent) { e.preventDefault(); }
function handleDrop(e: React.DragEvent, targetLane: string) {
  e.preventDefault();
  if (!dragging) return;
  // lanes から dragging を削除し、targetLane に追加
  var newLanes = { ...lanes };
  var sourceLane = Object.keys(newLanes).find(function (k) {
    return newLanes[k].some(function (it) { return it.id === dragging; });
  });
  if (sourceLane && sourceLane !== targetLane) {
    var item = newLanes[sourceLane].find(function (it) { return it.id === dragging; });
    newLanes[sourceLane] = newLanes[sourceLane].filter(function (it) { return it.id !== dragging; });
    if (item) { newLanes[targetLane] = [...newLanes[targetLane], item]; }
    setLanes(newLanes);
    // Dataverse 更新
    updateRecord("my_entity", dragging, { statuscode: laneToStatus[targetLane] });
  }
  setDragging(null);
}

async function updateRecord(entityName: string, id: string, data: Record<string, any>) {
  await (window as any).Xrm.WebApi.online.updateRecord(entityName, id, data);
}

/* JSX */
<div className={styles.kanbanContainer}>
  {Object.entries(lanes).map(function (entry) {
    var laneId = entry[0], items = entry[1];
    return (
      <div key={laneId} className={styles.kanbanLane}
        onDragOver={handleDragOver}
        onDrop={function (e) { handleDrop(e, laneId); }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <Text weight="semibold" size={300} style={{ color: laneColors[laneId] }}>{laneLabels[laneId]}</Text>
          <Badge appearance="filled" color="informative" size="small">{items.length}</Badge>
        </div>
        {items.map(function (item) {
          return (
            <div key={item.id} className={styles.kanbanCard}
              draggable onDragStart={function (e) { handleDragStart(e, item.id); }}
              onDragEnd={function (e) { (e.target as HTMLElement).style.opacity = "1"; }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{item.title}</div>
              <div style={{ fontSize: 10, color: tokens.colorNeutralForeground3, display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span>{item.assignee}</span>
                <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: priorityColor(item.priority) }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  })}
</div>
```

**使いどころ**: タスク管理、案件ステータス管理、承認フロー

### 1. プロジェクト管理系

#### 1.1 ステータスボード

信号機形式でサービス・設備・タスクの状態を表示。

```typescript
/* makeStyles */
statusGrid: {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "8px",
  "@media (max-width: 640px)": { gridTemplateColumns: "repeat(2, 1fr)" },
},

/* JSX */
<div className={styles.statusGrid}>
  {items.map(function (it) {
    return (
      <div key={it.label} style={{
        borderRadius: 10, padding: "12px 14px",
        backgroundColor: it.bgColor, color: it.textColor,
      }}>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>{it.label}</div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>{it.value}</div>
        <div style={{ fontSize: 10, opacity: 0.6 }}>{it.sub}</div>
      </div>
    );
  })}
</div>
```

**使いどころ**: サービス稼働率、設備状態概要、チーム状況

#### 1.2 プログレスバー

```typescript
/* JSX */
<div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
  {items.map(function (it) {
    return (
      <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, width: 80, flexShrink: 0, color: tokens.colorNeutralForeground3 }}>{it.label}</span>
        <span style={{
          flex: 1, height: 8, borderRadius: 4, overflow: "hidden",
          backgroundColor: tokens.colorNeutralBackground4,
        }}>
          <span style={{
            display: "block", height: "100%", borderRadius: 4,
            backgroundColor: it.color, width: it.pct + "%",
            transitionProperty: "width", transitionDuration: "0.6s",
          }} />
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, width: 40, textAlign: "right" }}>{it.pct}%</span>
      </div>
    );
  })}
</div>
```

**使いどころ**: フェーズ別達成率、部門別進捗、目標達成状況

#### 1.3 タイムライン

```typescript
/* JSX */
<div style={{ position: "relative", paddingLeft: 20 }}>
  {/* 縦線 */}
  <div style={{
    position: "absolute", left: 6, top: 4, bottom: 4,
    width: 2, borderRadius: 1,
    backgroundColor: tokens.colorNeutralStroke2,
  }} />
  {events.map(function (ev, i) {
    return (
      <div key={i} style={{ position: "relative", paddingBottom: i < events.length - 1 ? 16 : 0 }}>
        <div style={{
          position: "absolute", left: -18, top: 4,
          width: 10, height: 10, borderRadius: "50%",
          border: "2px solid " + ev.color,
          backgroundColor: ev.filled ? ev.color : "transparent",
        }} />
        <div style={{ fontSize: 10, color: tokens.colorNeutralForeground3 }}>{ev.date}</div>
        <div style={{ fontSize: 12, fontWeight: 500, margin: "2px 0" }}>{ev.title}</div>
        <div style={{ fontSize: 11, color: tokens.colorNeutralForeground2 }}>{ev.desc}</div>
      </div>
    );
  })}
</div>
```

**使いどころ**: マイルストーン表示、イベント履歴、変更ログ

#### 1.4 ファネル

```typescript
/* JSX — ステージごとに幅を縮小 */
<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
  {stages.map(function (s, i) {
    var widthPct = 100 - (i * (80 / (stages.length - 1)));
    return (
      <div key={s.label} style={{
        width: widthPct + "%", borderRadius: 6, color: "#fff",
        backgroundColor: s.color, padding: "8px 12px",
        display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 500,
      }}>
        <span>{s.label}</span>
        <span style={{ opacity: 0.8 }}>{s.value.toLocaleString()}</span>
      </div>
    );
  })}
</div>
```

**使いどころ**: 営業パイプライン、ワークフローステージ、承認プロセス

#### 1.5 ガントチャート風（D3 横棒）

```typescript
/* D3 useEffect 内 */
var y = d3
  .scaleBand()
  .domain(
    tasks.map(function (t) {
      return t.name;
    }),
  )
  .range([0, h])
  .padding(0.3);
var x = d3.scaleTime().domain([startDate, endDate]).range([0, w]);

g.selectAll(".bar")
  .data(tasks)
  .enter()
  .append("rect")
  .attr("y", function (t) {
    return y(t.name) || 0;
  })
  .attr("x", function (t) {
    return x(t.start);
  })
  .attr("width", 0)
  .attr("height", y.bandwidth())
  .attr("fill", function (t) {
    return t.color;
  })
  .attr("rx", 4)
  .transition()
  .duration(600)
  .delay(function (_, i) {
    return i * 80;
  })
  .attr("width", function (t) {
    return Math.max(0, x(t.end) - x(t.start));
  });
```

**使いどころ**: 工程管理、メンテナンススケジュール、リソース計画

### 2. 営業・マーケティング系

#### 2.1 KPI スコアカード（変動インジケータ付き）

```typescript
/* makeStyles */
kpiGrid: {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "12px",
  "@media (max-width: 640px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
},

/* コンポーネント */
const KpiCard: React.FC<{
  label: string; value: string | number;
  change?: { text: string; positive: boolean };
  delay?: string;
}> = ({ label, value, change, delay }) => (
  <div className={mergeClasses(styles.kpiCard, styles.fadeInUp)}
    style={delay ? { animationDelay: delay } : undefined}>
    <div style={{ fontSize: 12, color: tokens.colorNeutralForeground3, margin: "0 0 6px" }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 500 }}>{String(value)}</div>
    {change && (
      <div style={{ fontSize: 12, marginTop: 4, display: "flex", alignItems: "center", gap: 4,
        color: change.positive ? P.teal : P.red }}>
        {change.positive ? "\u25b2" : "\u25bc"} {change.text}
      </div>
    )}
  </div>
);
```

**使いどころ**: 売上/利益/目標達成、全体KPI俯瞰

#### 2.2 カテゴリテーブル（バーインジケータ + ステータスドット）

```typescript
/* 各行 */
<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
  <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: statusColor }} />
  <Text size={300}>{name}</Text>
</div>
<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
  <span style={{ width: 80, height: 6, borderRadius: 3,
    backgroundColor: tokens.colorNeutralBackground4, overflow: "hidden" }}>
    <span style={{ display: "block", height: "100%", borderRadius: 3,
      backgroundColor: P.blue, width: pct + "%" }} />
  </span>
  <Text size={300}>{count}</Text>
</div>
```

**使いどころ**: 製品別売上、カテゴリ比較、ランキング表

### 3. 財務・分析系

#### 3.1 ゲージメーター（D3 半円）

```typescript
/* D3 useEffect 内 */
var arcBg = d3
  .arc()
  .innerRadius(r * 0.7)
  .outerRadius(r * 0.92)
  .startAngle(-Math.PI / 2)
  .endAngle(Math.PI / 2);
var arcVal = d3
  .arc()
  .innerRadius(r * 0.7)
  .outerRadius(r * 0.92)
  .startAngle(-Math.PI / 2)
  .endAngle(-Math.PI / 2 + Math.PI * (val / 100));

g.append("path")
  .attr("d", arcBg() as string)
  .attr("fill", tokens.colorNeutralBackground4);
g.append("path")
  .attr("d", "M0,0") // start empty
  .attr("fill", color)
  .transition()
  .duration(800)
  .ease(d3.easeCubicOut)
  .attrTween("d", function () {
    var interp = d3.interpolate(0, val);
    return function (tt) {
      var a = d3
        .arc()
        .innerRadius(r * 0.7)
        .outerRadius(r * 0.92)
        .startAngle(-Math.PI / 2)
        .endAngle(-Math.PI / 2 + Math.PI * (interp(tt) / 100));
      return a() as string;
    };
  });
g.append("text")
  .attr("text-anchor", "middle")
  .attr("dy", "-0.1em")
  .style("font-size", "18px")
  .style("font-weight", "600")
  .style("fill", tokens.colorNeutralForeground1)
  .text(val + "%");
```

**使いどころ**: 目標達成率、予算消化率、キャパシティ残量

#### 3.2 ウォーターフォールチャート（D3）

```typescript
/* D3 — 累積ベース + 増減バー */
var cumulative = 0;
var barData = items.map(function (it) {
  var base = cumulative;
  cumulative += it.value;
  return {
    label: it.label,
    base: base,
    value: it.value,
    end: cumulative,
    color: it.value >= 0 ? P.blue : P.red,
  };
});
// 最後のバー（合計）は base=0, value=cumulative
```

**使いどころ**: P&L分析、予算差異、コスト内訳

#### 3.3 混合チャート（棒 + 線、D3 2軸）

```typescript
/* D3 — 棒 (左Y軸) + 線 (右Y軸) */
var yLeft = d3.scaleLinear().domain([0, maxRevenue]).range([h, 0]);
var yRight = d3.scaleLinear().domain([0, maxRate]).range([h, 0]);

// 棒
g.selectAll(".bar")
  .data(data)
  .enter()
  .append("rect")
  .attr("fill", P.blue)
  .attr("opacity", 0.7);
/* ... */
// 線
var lineGen = d3
  .line()
  .x(function (d) {
    return x(d.label) + x.bandwidth() / 2;
  })
  .y(function (d) {
    return yRight(d.rate);
  })
  .curve(d3.curveCatmullRom);
g.append("path")
  .datum(data)
  .attr("d", lineGen)
  .attr("fill", "none")
  .attr("stroke", P.coral)
  .attr("stroke-width", 2);
```

**使いどころ**: 売上 vs 利益率、件数 vs 単価

#### 3.4 ヒートマップ（D3 SVG rect）

```typescript
/* D3 useEffect 内 */
var xScale = d3.scaleBand().domain(cols).range([labelW, W]).padding(0.05);
var yScale = d3.scaleBand().domain(rows).range([headerH, H]).padding(0.05);
var colorScale = d3.scaleSequential(d3.interpolateBlues).domain([0, maxVal]);

g.selectAll("rect")
  .data(flatData)
  .enter()
  .append("rect")
  .attr("x", function (d) {
    return xScale(d.col) || 0;
  })
  .attr("y", function (d) {
    return yScale(d.row) || 0;
  })
  .attr("width", xScale.bandwidth())
  .attr("height", yScale.bandwidth())
  .attr("rx", 3)
  .attr("fill", function (d) {
    return colorScale(d.value);
  })
  .attr("opacity", 0)
  .transition()
  .duration(400)
  .delay(function (_, i) {
    return i * 10;
  })
  .attr("opacity", 1);
```

**使いどころ**: 時間×曜日の活動量、月×部門のパフォーマンス

#### 3.5 バブルチャート（D3）

```typescript
/* D3 — x, y, r で3変数 */
var rScale = d3.scaleSqrt().domain([0, maxSize]).range([5, 30]);

g.selectAll("circle")
  .data(points)
  .enter()
  .append("circle")
  .attr("cx", function (d) {
    return xScale(d.x);
  })
  .attr("cy", function (d) {
    return yScale(d.y);
  })
  .attr("fill", function (d) {
    return d.color;
  })
  .attr("fill-opacity", 0.5)
  .attr("stroke", function (d) {
    return d.color;
  })
  .attr("stroke-width", 1)
  .attr("r", 0)
  .transition()
  .duration(600)
  .delay(function (_, i) {
    return i * 100;
  })
  .attr("r", function (d) {
    return rScale(d.size);
  });
```

**使いどころ**: 市場セグメント（成長率×売上×顧客数）、設備（稼働率×コスト×年数）

#### 3.6 ツリーマップ（CSS Flex）

D3 不要。CSS flex でシンプルに構成比を面積表示。

```typescript
<div style={{ display: "flex", flexWrap: "wrap", gap: 3, height: 180 }}>
  {items.map(function (it) {
    return (
      <div key={it.name} style={{
        flex: it.value, minWidth: 50, borderRadius: 6, padding: 10,
        backgroundColor: it.color, color: "#fff", fontSize: 12,
        display: "flex", flexDirection: "column", justifyContent: "center",
      }}>
        <div style={{ fontWeight: 600 }}>{it.name}</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{it.pct}%</div>
      </div>
    );
  })}
</div>
```

**使いどころ**: 部門別売上構成、カテゴリ占有率、リソース配分

#### 3.7 レーダーチャート（D3）

```typescript
/* D3 — 多角形を SVG polygon で描画 */
var angleSlice = (Math.PI * 2) / axes.length;

// グリッド (5段階)
[1, 2, 3, 4, 5].forEach(function (level) {
  var points = axes
    .map(function (_, i) {
      var r2 = (radius / 5) * level;
      return (
        cx +
        r2 * Math.cos(angleSlice * i - Math.PI / 2) +
        "," +
        (cy + r2 * Math.sin(angleSlice * i - Math.PI / 2))
      );
    })
    .join(" ");
  g.append("polygon")
    .attr("points", points)
    .attr("fill", "none")
    .attr("stroke", tokens.colorNeutralStroke2)
    .attr("stroke-width", 0.5);
});

// データ多角形
datasets.forEach(function (ds) {
  var pts = ds.values
    .map(function (v, i) {
      var r2 = (v / maxVal) * radius;
      return (
        cx +
        r2 * Math.cos(angleSlice * i - Math.PI / 2) +
        "," +
        (cy + r2 * Math.sin(angleSlice * i - Math.PI / 2))
      );
    })
    .join(" ");
  g.append("polygon")
    .attr("points", pts)
    .attr("fill", ds.color)
    .attr("fill-opacity", 0.1)
    .attr("stroke", ds.color)
    .attr("stroke-width", 1.5);
});
```

**使いどころ**: スキル評価、製品比較、バランススコアカード

### 4. 共通 UI パターン

#### 4.1 トレンドライン（D3 area + line + gradient）

```typescript
/* gradient */
var grad = defs.append("linearGradient")
  .attr("id", "trendGrad").attr("x1", "0").attr("y1", "0").attr("x2", "0").attr("y2", "1");
grad.append("stop").attr("offset", "0%").attr("stop-color", P.blue).attr("stop-opacity", 0.15);
grad.append("stop").attr("offset", "100%").attr("stop-color", P.blue).attr("stop-opacity", 0.01);

/* curve */
.curve(d3.curveCatmullRom.alpha(0.5))

/* stroke animation */
var totalLen = (pathEl.node() as SVGPathElement).getTotalLength();
pathEl.attr("stroke-dasharray", totalLen + " " + totalLen)
  .attr("stroke-dashoffset", totalLen)
  .transition().duration(1000).ease(d3.easeCubicOut)
  .attr("stroke-dashoffset", 0);
```

#### 4.2 ドーナツチャート（65% カットアウト + 上部レジェンド）

```typescript
.innerRadius(r * 0.65).outerRadius(r * 0.92)

/* レジェンドを上部に横並び */
<div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8, fontSize: 12 }}>
  {data.map(function (d) {
    return (
      <span key={d.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: d.color }} />
        {d.label} {pct}%
      </span>
    );
  })}
</div>
```

#### 4.3 積み上げ棒グラフ（D3 stacked bar）

```typescript
var stack = d3.stack().keys(categories);
var series = stack(data);

series.forEach(function (s, si) {
  g.selectAll(".bar-" + si)
    .data(s)
    .enter()
    .append("rect")
    .attr("x", function (d) {
      return xScale(d.data.label) || 0;
    })
    .attr("y", function (d) {
      return yScale(d[1]);
    })
    .attr("height", function (d) {
      return yScale(d[0]) - yScale(d[1]);
    })
    .attr("width", xScale.bandwidth())
    .attr("fill", colors[si])
    .attr("rx", si === series.length - 1 ? 2 : 0);
});
```

**使いどころ**: チャネル別コンバージョン、部門別採用実績

#### 4.4 スパークライン（テーブル行内ミニチャート）

```typescript
/* DataGrid の renderCell 内 */
renderCell: function (item) {
  var data = item.trendData as number[];
  var max = Math.max.apply(null, data);
  return (
    <div style={{ display: "inline-flex", alignItems: "flex-end", gap: 1, height: 20 }}>
      {data.map(function (v, i) {
        return <span key={i} style={{
          width: 3, borderRadius: 1,
          height: Math.round((v / max) * 100) + "%",
          backgroundColor: v >= data[0] ? P.teal : P.red,
        }} />;
      })}
    </div>
  );
}
```

**使いどころ**: DataGrid 行内のトレンド表示、比較テーブル

#### 4.5 DataGrid クリック可能行

```typescript
/* ⚠️ renderCell バグ回避: 必ず1行に記述 */
<DataGridBody<ReadableTableRow<MyEntity>>>{({ item, rowId }) => (<DataGridRow<ReadableTableRow<MyEntity>> key={rowId} className={styles.clickableRow} onClick={function () { openRecordForm("entity_name", item.myid as string); }}>{({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}</DataGridRow>)}</DataGridBody>
```

---

## アニメーションパターン

```typescript
fadeInUp: {
  animationName: {
    from: { opacity: 0, transform: "translateY(16px)" },
    to: { opacity: 1, transform: "translateY(0)" },
  },
  animationDuration: "0.5s",
  animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
  animationFillMode: "both",
},
scaleIn: {
  animationName: {
    from: { opacity: 0, transform: "scale(0.97)" },
    to: { opacity: 1, transform: "scale(1)" },
  },
  animationDuration: "0.4s",
  animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
  animationFillMode: "both",
},
```

- KPI カード: `fadeInUp` + stagger delay（0s, 0.06s, 0.12s, 0.18s）
- チャートカード: `scaleIn` + delay
- Card `:hover`: `translateY(-2px)` + `boxShadow: tokens.shadow8`
- D3 チャート: `transition().duration(600~1000).ease(d3.easeCubicOut)`

---

## ツールチップ（統一スタイル）

```typescript
{
  display: "none", position: "absolute",
  background: tokens.colorNeutralBackground1,
  border: "0.5px solid " + tokens.colorNeutralStroke2,
  borderRadius: 8, padding: "6px 12px",
  fontSize: 12, fontWeight: 500,
  pointerEvents: "none", zIndex: 10,
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
}
```

---

## 段階的改善フロー

### 初回デプロイ完了後（パターン共通）

```
デプロイが完了しました！ 現在のページには基本的な要素が含まれています。

さらに強化するなら、以下がおすすめです:

📊 **ビジュアル強化**
  - アニメーション（fadeIn/scaleIn）で体感品質を向上
  - ツールチップの統一デザインを適用
  - カードのホバーエフェクト

📈 **チャート・機能追加**（パターンに合わせて提案）
  [パターンA: 入力ウィザード] バリデーション強化 / プレビュー画面 / 条件分岐ステップ
  [パターンB: KPI] トレンドライン / ゲージメーター / ウォーターフォール
  [パターンC: カンバン] ドラッグ＆ドロップ / WIPリミット / スイムレーン
  [パターンD: ガント] ズーム切替 / 依存関係線 / 進捗率オーバーレイ
  [パターンF: オブジェクトフロー] エンティティ一覧タブ / 分析チャート / フィルター

🌍 **拡張機能**
  - ダークモード対応
  - 日本地図（D3 geoMercator + バブル）
  - リフレッシュボタン（スピンアニメーション付き）

どれを追加しますか？
```

---

## チャート選定ガイド（業務要件 → チャートの対応表）

| 可視化したいこと         | 推奨チャート/UI                     | パターン |
| ------------------------ | ----------------------------------- | -------- |
| ステップ形式のデータ登録 | 入力ウィザード (ステッププログレス) | A        |
| 入力内容の確認           | プレビューステップ                  | A        |
| 条件に応じた入力切替     | 条件分岐ステップ                    | A        |
| 時系列の推移             | トレンドライン (area+line)          | B        |
| 構成比                   | ドーナツ / ツリーマップ             | B        |
| 目標達成率               | ゲージメーター                      | B        |
| 増減の内訳               | ウォーターフォール                  | B        |
| 実績+率の同時比較        | 混合チャート (棒+線)                | B        |
| ランキング比較           | カテゴリテーブル (バーインジケータ) | B        |
| ステータス別タスク管理   | カンバンボード (4列レーン)          | C        |
| ドラッグ＆ドロップ移動   | HTML5 DnD + Dataverse 更新          | C        |
| WIP 制限                 | WIP リミット表示                    | C        |
| 期間・スケジュール       | ガントチャート (D3 横棒)            | D        |
| 今日の位置               | 今日マーカー (赤い縦線)             | D        |
| 依存関係                 | 依存関係線 (D3 path)                | D        |
| 進捗率                   | バー内進捗オーバーレイ              | D        |
| マイルストーン           | ◆マーカー                           | D        |
| 地理的分布               | 日本地図 (geoMercator)              | B        |
| 稼働状況一覧             | ステータスボード                    | B,C      |
| 特定レコード中心の関連   | 3列フロー図 + 詳細サイドバー        | F        |
| エンティティ間の因果関係 | ベジェエッジ + ノードクリック詳細   | F        |
| レコード詳細 + フォーム遷移 | レコードモーダル + MDA フォームボタン | F      |

---

## デザイン原則

1. **安定性 > 見た目** — SDK 制約（React 17, FluentProvider 禁止, D3.js のみ）を最優先
2. **ユーザーに聞いてから作る** — いきなり KPI ダッシュボードを作らない
3. **段階的改善** — Tier 1（基本）→ Tier 2（チャート）→ Tier 3（高度）
4. **一貫性** — カラーパレット・ツールチップ・アニメーション duration を統一
5. **レスポンシブ** — CSS Grid + `@media (max-width: 640px)` + `useIsMobile()` の3層
6. **パフォーマンス** — `useMemo` / ウィンドウキャッシュ / 必要最小限の select
7. **モーダル編集が標準** — レコード編集は常に Dialog モーダル。新しいタブやページ遷移は使わない
8. **Choice はボタン式** — Choice フィールド（ステータス・優先度等）は Dropdown ではなくカラー付きトグルボタンで実装
9. **書き込みは Xrm.WebApi** — `dataApi` は読み取り専用。更新・作成・削除は `Xrm.WebApi.online` を使用

---

## 検証済みリファレンス実装（2026-04-21 デプロイ済み）

以下は実際にデプロイ・動作確認済みの設計パターン。新規ページ作成時はこれらを参考にする。

### Ref-A: 入力ウィザード（WorkOrderWizard.tsx）

**検証済みのデザイン要素:**

```
全体構造:
  root: backgroundColor=colorNeutralBackground2, alignItems="center", padding="24px 16px"
  container: maxWidth="680px" で中央寄せ
  フォームは Card コンポーネント（padding="28px 24px", borderRadius="12px", shadow4）
```

**ステッププログレスの3状態:**

```typescript
/* 完了状態 */
stepCircleDone: {
  border: "2px solid #1a8f6e", color: "#ffffff", backgroundColor: "#1a8f6e",
}
/* アクティブ状態 */
stepCircleActive: {
  border: "2px solid #2d5faa", color: "#ffffff", backgroundColor: "#2d5faa",
}
/* 未来状態 */
stepCircle: {
  border: "2px solid " + tokens.colorNeutralStroke1,
  color: tokens.colorNeutralForeground3, backgroundColor: tokens.colorNeutralBackground1,
}
/* コネクター（完了済みはteal、未到達はstroke1） */
stepConnectorDone: { backgroundColor: "#1a8f6e" }
stepConnector: { backgroundColor: tokens.colorNeutralStroke1 }
/* ラベル（アクティブはblue+bold、それ以外はforeground3） */
stepLabelActive: { color: "#2d5faa", fontWeight: "600" }
```

**設備検索リスト:**

```typescript
/* 選択中のアイテム: 左ボーダー + 背景色で強調 */
equipmentItemSelected: {
  backgroundColor: "#e8f0fb",
  borderLeft: "3px solid #2d5faa",
}
/* 非選択アイテム: ホバーで背景変化 */
equipmentItem: {
  ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
}
```

**完了画面:**

```typescript
/* 成功アイコン: 大きな丸 + 淡い背景 */
successBox: { alignItems: "center", padding: "32px 0" }
successIcon: {
  width: "64px", height: "64px", borderRadius: "50%",
  backgroundColor: "#e6f7f1", color: "#1a8f6e", fontSize: "28px",
}
```

**教訓:**
- フォーム全体を `max-width: 680px` の Card に入れると読みやすい
- ステップは `flexDirection: "column"` で円+ラベルを縦に並べ、コネクターは `marginBottom: "20px"` で円の高さに揃える
- 設備選択はリスト形式（Dropdown より直感的で検索しやすい）

### Ref-B: KPI ダッシュボード（KpiDashboard.tsx）

**検証済みのデザイン要素:**

```
全体構造:
  root: padding="16px", gap="12px", overflow="auto", position="relative"
  タブ切替: TabList で「チャート」「データ」を切替（初回はチャート）
  ヘッダー: アイコン + タイトル + Badge(件数) + ステータスDropdownフィルター
```

**KPI カード（4列グリッド + アニメーション）:**

```typescript
kpiGrid: {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",  /* ★ minmax(0, 1fr) で均等配分 */
  gap: "12px",
  "@media (max-width: 640px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
}
kpiCard: {
  padding: "16px", borderRadius: "12px",
  backgroundColor: tokens.colorNeutralBackground1,
  border: "1px solid " + tokens.colorNeutralStroke2,
}
/* fadeInUp + stagger delay で順に表示 */
<div style={{ animationDelay: "0s" }}>  {/* 1枚目 */}
<div style={{ animationDelay: "0.06s" }}>  {/* 2枚目 */}
```

**チャートグリッド（2×2）:**

```typescript
chartGrid: {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "12px",
  "@media (max-width: 768px)": { gridTemplateColumns: "1fr" },
}
chartCard: {
  padding: "16px", borderRadius: "12px",
  backgroundColor: tokens.colorNeutralBackground1,
  border: "1px solid " + tokens.colorNeutralStroke2,
}
/* SVG ラッパー: position: "relative" でツールチップの基準にする */
chartSvgWrap: { position: "relative", width: "100%", overflow: "hidden" }
```

**ツールチップ（getBoundingClientRect パターン）:**

```typescript
/* ルート div に position: "relative" を設定 */
/* ツールチップ div: position: "absolute", pointerEvents: "none" */
function showTip(html: string, ev: MouseEvent) {
  var tip = tooltipRef.current;
  if (!tip) return;
  tip.innerHTML = html;
  tip.style.display = "block";
  var root = tip.parentElement;
  if (root) {
    var rect = root.getBoundingClientRect();
    tip.style.left = ev.clientX - rect.left + root.scrollLeft + 10 + "px";
    tip.style.top = ev.clientY - rect.top + root.scrollTop - 10 + "px";
  }
}
```

**DataGrid（クリック可能行）:**

```typescript
clickableRow: {
  cursor: "pointer",
  ":hover": { backgroundColor: tokens.colorSubtleBackgroundHover },
}
```

**教訓:**
- KPI カードは `minmax(0, 1fr)` で均等配分（`1fr` だけだと長いテキストで幅がずれる）
- チャートとデータは必ずタブ分離（同一画面に詰め込むと見づらい）
- D3 ツールチップは共通の `showTip/moveTip/hideTip` 関数を用意し全チャートで再利用
- `fadeInUp` に stagger delay（0.06s 刻み）をかけると高級感が出る

### Ref-C: カンバンボード（KanbanBoard.tsx）

**検証済みのデザイン要素:**

```
全体構造:
  root: height="100%", overflow="hidden"（ボードがスクロールを担う）
  ヘッダー: アイコン + タイトル + Badge(件数) + 検索Input + 優先度Dropdown
  ボード: CSS Grid 4列 + overflow="auto"
```

**レーン構成（罫線区切り）:**

```typescript
board: {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "0px",  /* ★ gap なし、borderRight で区切り → 隙間のないスッキリした見た目 */
  flex: "1", overflow: "auto",
}
lane: {
  borderRight: "1px solid " + tokens.colorNeutralStroke2,  /* ★ gap ではなく線で区切り */
}
laneHeader: {
  position: "sticky" as any, top: 0, zIndex: 2,  /* ★ sticky ヘッダーでスクロールしても見える */
  borderBottom: "1px solid " + tokens.colorNeutralStroke2,
}
/* レーンヘッダーにカラーバー（4px幅の短い縦線）*/
<span style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: lane.color }} />
```

**カード（ドラッグ状態の視覚フィードバック）:**

```typescript
card: {
  borderRadius: "8px", cursor: "grab",
  transition: "box-shadow 0.15s, transform 0.15s",
  ":hover": { boxShadow: tokens.shadow4, transform: "translateY(-1px)" },
}
cardDragging: {
  opacity: 0.6, transform: "rotate(2deg)",  /* ★ ドラッグ中は傾き + 透過 */
  border: "1px solid " + P.blue, boxShadow: tokens.shadow8,
}
/* ドラッグオーバー状態のレーン */
laneBodyDragOver: {
  outline: "2px dashed " + P.blue,  /* ★ 破線アウトラインでドロップ先を明示 */
  outlineOffset: "-4px", borderRadius: "8px",
}
```

**カード内容の構成:**

```typescript
/* 1行目: タイトル（truncate）+ 優先度ドット（8px丸） */
/* 2行目: Badge(作業種別) + 設備名（Text truncate） */
/* 3行目: 📅 予定日（fmtDate: M/d 形式） */
```

**楽観的更新 + ロールバック:**

```typescript
/* ドロップ時: UI を即座に更新 → API 成功 → トースト / API 失敗 → 元の状態に戻す */
setWorkorders(function (prev) {
  return prev.map(function (w) {
    if ((w.em_workorderid as string) === id) {
      return { ...w, em_status: targetStatus } as any;
    }
    return w;
  });
});
Xrm.WebApi.online.updateRecord(...).then(function () {
  setToast(lane.label + " に移動しました");
}).catch(function (e) {
  /* ★ ロールバック: 元の em_status に戻す */
  setWorkorders(function (prev) { ... });
});
```

**教訓:**
- レーンは `gap: 0px` + `borderRight` で区切ると隙間がなくスッキリする
- レーンヘッダーは `position: sticky` でスクロールしても常に見える
- カードのドラッグ状態は `rotate(2deg)` + `opacity: 0.6` で「持ち上げた感」を演出
- ドロップ先は `outline: 2px dashed` で明確に示す
- 楽観的更新 + 失敗時ロールバックでレスポンシブな UX を実現
- レーンヘッダーの短い色付き縦バー（4px × 16px）がステータスの色を小さく示す

### Ref-D: スケジュール管理ガント（ScheduleGantt.tsx）

**検証済みのデザイン要素:**

```
全体構造:
  root: height="100%", overflow="hidden"
  ヘッダー: 月移動ボタン + 年月表示 + フィルタードロップダウン
  メイン: flex 横並び（左パネル + 右 D3 タイムライン）
```

**ギャラリー行（固定 height の鉄則）:**

```typescript
/* ★ 全行が rowH=36px + border-box で統一 — minHeight 禁止 */
var rowH = 36;
var headerH = 28;
/* HTML ギャラリー側 */
{ height: rowH, boxSizing: "border-box", overflow: "hidden",
  display: "flex", alignItems: "center", padding: "0 8px",
  borderBottom: "1px solid " + tokens.colorNeutralStroke2 }
/* D3 SVG 側 — scaleBand を使わず手動ピクセル計算 */
var yPos = headerH + i * rowH;
rect.attr("y", yPos + 4).attr("height", rowH - 8);  /* 上下 4px マージン */
```

**今日マーカー:**

```typescript
/* 赤い縦線 + "今日" ラベル */
svg.append("line")
  .attr("x1", todayX).attr("x2", todayX)
  .attr("y1", headerH).attr("y2", svgH)
  .attr("stroke", P.red).attr("stroke-width", 1.5)
  .attr("stroke-dasharray", "4,3");
svg.append("text")
  .attr("x", todayX).attr("y", headerH - 4)
  .attr("text-anchor", "middle").text("今日")
  .style("font-size", "10px").style("fill", P.red);
```

**教訓:**
- 左パネルと D3 SVG の行高さは `rowH` 変数で統一管理（一箇所変えれば全体が連動）
- `scaleBand` は HTML 側のレンダリングと一致しないため使わない（手動 `headerH + i * rowH`）
- 今日マーカーは破線（`stroke-dasharray: "4,3"`）が見やすい

### 共通デザインパターン（全ページ共通）

**カラーパレット定義（全ページで同一）:**

```typescript
var P = {
  blue: "#2d5faa",   /* メインアクセント、レーンヘッダー、アクティブ状態 */
  teal: "#1a8f6e",   /* 成功、完了、ポジティブ、トースト背景 */
  coral: "#c4532a",  /* 修理、警告 */
  purple: "#6b5fc7", /* 改善、セカンダリ */
  amber: "#b8850e",  /* 中間優先度、保留 */
  red: "#c43a3a",    /* 高優先度、緊急、エラー、今日マーカー */
  green: "#3a8a2e",  /* 完了ステータス */
};
```

**トースト通知（全ページで同一スタイル）:**

```typescript
toast: {
  position: "fixed" as any, top: "16px", right: "16px", zIndex: 9999,
  padding: "10px 16px",  /* or "12px 20px" */
  borderRadius: "8px",
  backgroundColor: "#1a8f6e",  /* P.teal */
  color: "#fff",
  fontSize: "13px", fontWeight: 500,
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",  /* or tokens.shadow8 */
}
/* 表示: setToast("メッセージ"); setTimeout(function () { setToast(null); }, 2000~3000); */
```

**ボタン式 Choice トグル（ステータス・優先度）:**

```typescript
/* 選択中: 色付き背景 + 白文字 */
{
  padding: "6px 14px", borderRadius: "6px~8px", fontSize: "12px~13px", fontWeight: 500,
  border: isSelected ? "2px solid " + opt.color : "1.5px solid " + tokens.colorNeutralStroke2,
  backgroundColor: isSelected ? opt.color : "transparent",
  color: isSelected ? "#fff" : tokens.colorNeutralForeground1,
  cursor: "pointer", transition: "all 0.15s",
}
```

**モーダル編集フォーム（共通構造 — 全パターン初回デプロイに含める）:**

```typescript
/* ─── state ─── */
const [selectedItem, setSelectedItem] = useState<ReadableTableRow<my_entity> | null>(null);
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
function closeModal() { setSelectedItem(null); }

/* ─── save（finally 禁止 — モーダル閉じと競合） ─── */
async function handleSave() {
  if (!selectedItem) return;
  setSaving(true);
  try {
    await (window as any).Xrm.WebApi.online.updateRecord(
      "my_entity", selectedItem.my_entityid as string,
      { my_name: editName, my_status: parseInt(editStatus), my_priority: parseInt(editPriority), my_description: editDesc },
    );
    setItems(function (prev) {
      return prev.map(function (w) {
        if (w.my_entityid === selectedItem.my_entityid) {
          return { ...w, my_name: editName, my_status: parseInt(editStatus), my_priority: parseInt(editPriority), my_description: editDesc };
        }
        return w;
      });
    });
    setSaving(false);
    setSelectedItem(null);  /* ★ saving=false の後に閉じる */
    setToast("更新しました");
    setTimeout(function () { setToast(null); }, 3000);
  } catch (e) {
    console.error("save error", e);
    setSaving(false);  /* ★ エラー時はモーダルを閉じない */
  }
}

/* ─── JSX ─── */
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
            <Field label="名前">
              <Input value={editName} onChange={function (_, d) { setEditName(d.value); }} />
            </Field>
            <Field label="ステータス">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STATUS_OPTIONS.map(function (opt) {
                  var isSelected = editStatus === String(opt.value);
                  return (
                    <button key={opt.value}
                      onClick={function () { setEditStatus(String(opt.value)); }}
                      style={{
                        padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
                        border: isSelected ? "2px solid " + opt.color : "1.5px solid " + tokens.colorNeutralStroke2,
                        backgroundColor: isSelected ? opt.color : "transparent",
                        color: isSelected ? "#fff" : tokens.colorNeutralForeground1,
                        cursor: "pointer", transition: "all 0.15s",
                      }}>{opt.label}</button>
                  );
                })}
              </div>
            </Field>
            <Field label="優先度">
              {/* 同じボタン式パターン */}
            </Field>
            <Field label="説明">
              <Input value={editDesc} onChange={function (_, d) { setEditDesc(d.value); }} />
            </Field>
            {/* 読み取り専用情報（Lookup 名前解決結果を小さく表示） */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: tokens.colorNeutralForeground3 }}>
              <span>設備: {equipMap.get(fkId(selectedItem._my_equipment_value)) || "—"}</span>
              <span>|</span>
              <span>予定: {fmtDate(selectedItem.my_scheduleddate)}</span>
            </div>
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

{/* トースト通知 */}
{toast && (
  <div style={{
    position: "fixed", top: 16, right: 16, zIndex: 9999,
    padding: "10px 16px", borderRadius: 8,
    backgroundColor: P.teal, color: "#fff",
    fontSize: 13, fontWeight: 500,
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  }}>✓ {toast}</div>
)}
```

> **重要**: モーダル・トースト・ボタン式 Choice は全パターンで Tier 1 であり、**初回デプロイ時に必ず含める**。code-patterns.md §15 に完全なコードがある。

**ヘッダー構成（共通パターン）:**

```typescript
/* 左: アイコン + タイトル(size=500, weight="semibold") + Badge(件数) */
/* 右: 検索Input(SearchRegular) + フィルターDropdown */
/* borderBottom: "1px solid " + tokens.colorNeutralStroke2 で区切り */
```

**Lookup 名前解決（全ページで同一パターン）:**

```typescript
/* 1. 関連テーブルを並行ロード（Promise.all） */
/* 2. useMemo で Map<id, name> を構築 */
var equipMap = useMemo(function () {
  var m = new Map<string, string>();
  equipment.forEach(function (e) {
    m.set(e.em_equipmentid as string, e.em_equipmentname as string);
  });
  return m;
}, [equipment]);
/* 3. fkId() で FK 値から GUID を抽出 → Map.get() で名前を取得 */
var equipName = equipMap.get(fkId(wo._em_equipment_value)) || "";
```
