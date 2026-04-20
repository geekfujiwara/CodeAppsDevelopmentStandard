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

4. **特に見たいチャートや UI はありますか？**（任意）
   例: トレンドライン、ドーナツ、ガントチャート、地図、ヒートマップ...
```

---

## 構築パターン（4種）

### Pattern A: 入力ウィザード

**向いている場面**: データ登録・申請フォーム・新規レコード作成・セットアップ手順のガイド

**構成要素（Tier順）**:

| Tier | コンポーネント       | 説明                                                      |
| ---- | -------------------- | --------------------------------------------------------- |
| 1    | ステッププログレス   | 横並びステップ番号 + 現在位置ハイライト                   |
| 1    | フォームセクション   | 入力フィールド群（Input, Dropdown, DatePicker, Textarea） |
| 1    | ナビゲーションボタン | 「戻る」「次へ」「送信」の3ボタン                         |
| 1    | ボタン式 Choice     | Choice フィールドは Dropdown ではなくカラー付きトグルボタン |
| 2    | バリデーション表示   | フィールドごとのエラーメッセージ + サマリー               |
| 2    | プレビューステップ   | 入力内容の確認画面（読み取り専用表示）                    |
| 2    | 自動保存インジケータ | 入力中のドラフト自動保存状態表示                          |
| 3    | 条件分岐ステップ     | 前ステップの回答に応じて表示ステップを変更                |
| 3    | ファイルアップロード | ドラッグ＆ドロップ + プレビュー                           |
| 3    | 完了アニメーション   | チェックマーク + confetti 風エフェクト                    |

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

| Tier | コンポーネント     | 説明                                         |
| ---- | ------------------ | -------------------------------------------- |
| 1    | KPI スコアカード   | 4列グリッド、ラベル+値+変動▲▼                |
| 1    | DataGrid           | クリック可能行、フィルター、モバイル対応     |
| 1    | モーダル編集フォーム | Dialog + ボタン式 Choice + トースト通知 |
| 1    | ボタン式 Choice     | ステータス等の選択肢をカラー付きトグルボタンで表示 |
| 2    | トレンドライン     | D3 area+line、グラデーション、ストローク描画 |
| 2    | ドーナツチャート   | 65%カットアウト、上部レジェンド、% 表示      |
| 2    | カテゴリテーブル   | バーインジケータ+ステータスドット            |
| 3    | ゲージメーター     | 目標達成率の半円表示                         |
| 3    | ウォーターフォール | 増減内訳の段階表示                           |
| 3    | 混合チャート       | 棒(実績)+線(率)の2軸                         |
| 3    | 地図ビジュアル     | D3 geoMercator + バブル                      |

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

| Tier | コンポーネント        | 説明                                             |
| ---- | --------------------- | ------------------------------------------------ |
| 1    | カンバンレーン（4列） | ステータスごとの CSS Grid 列 + カード一覧        |
| 1    | カンバンカード        | タイトル + 担当者アバター + 優先度ドット + 期限  |
| 1    | レーンヘッダー        | ステータス名 + 件数バッジ + 色付き左ボーダー     |
| 1    | モーダル編集フォーム | カードクリックで Dialog 表示 + ボタン式 Choice + 保存 |
| 1    | ボタン式 Choice     | ステータス・優先度等の選択をカラー付きトグルボタンで実装 |
| 2    | ドラッグ＆ドロップ    | HTML5 DnD API でカード移動 → Dataverse 更新      |
| 2    | フィルター・検索      | 担当者フィルタ / 優先度フィルタ / キーワード検索 |
| 2    | ステータスサマリー    | 各レーンの件数・割合を上部に表示                 |
| 3    | スイムレーン          | 担当者・カテゴリ別の横分割                       |
| 3    | WIP リミット表示      | 進行中列の上限超過をアラート表示                 |

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

| Tier | コンポーネント                   | 説明                                 |
| ---- | -------------------------------- | ------------------------------------ |
| 1    | タスク一覧（左パネル）           | タスク名 + 担当者 + ステータスバッジ |
| 1    | タイムライングリッド（右パネル） | D3 横棒 + 日付ヘッダー               |
| 1    | 期間バー                         | タスクの開始〜終了を色付き横棒で表示 |
| 1    | モーダル編集フォーム             | バー/タスククリックで Dialog + ボタン式 Choice + 保存 |
| 1    | ボタン式 Choice                 | ステータス・優先度等をカラー付きトグルボタンで実装 |
| 2    | ズームコントロール               | 日/週/月 表示切替                    |
| 2    | 今日マーカー                     | 現在日を赤い縦線で表示               |
| 2    | 進捗率表示                       | バー内に進捗%を重ねて表示            |
| 3    | 依存関係線                       | タスク間の矢印（D3 path）            |
| 3    | ドラッグで期間変更               | バーの端をドラッグして日付更新       |
| 3    | マイルストーン                   | ◆マーカーで重要日程を表示            |

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
