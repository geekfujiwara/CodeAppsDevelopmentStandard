# WebChat SDK 外部公開デザインテンプレート（標準）

外部顧客向け AI エージェント Web サイトの **標準デザインテンプレート**。
左パネルにカテゴリ別プロンプトカード、右パネルに美しい WebChat UI を配置するレイアウトパターン。

> このテンプレートはユーザーに**設計として提案**し、承認後に実装を進める。
>
> **ライトモードや複数レイアウト（workspace / minimal / hero-cards / dashboard / sidebar）を希望する場合、
> および「新しい会話（初期化）」ボタンを組み込む場合は [ライトモード・テンプレート集](webchat-sdk-light-templates.md) を参照。**

## 設計提案テンプレート（ユーザーに提示）

```
## 外部公開 Web サイト 設計案

### レイアウト構成

| セクション | 内容 |
|---|---|
| ヘッダー | ブランドロゴ + AI バッジ + 統計値 |
| ヒーロー + 特徴カード | キャッチコピー + 3 カラム特徴紹介 |
| ワークスペース（左） | カテゴリ別カードグリッド + プロンプトチップス（sticky） |
| ワークスペース（右） | WebChat パネル（グラデーション枠 + AI タイピングインジケーター ※送信ボックス直上に配置） |
| フッター | 著作権表示 |
| モーダル | 画像拡大 + お気に入り登録 |

### デザイン方針

- ダーク UI（背景 #050a18）+ AI グラデーション（emerald → cyan → indigo → purple）
- Inter + Noto Sans JP フォント
- グラスモーフィズム（backdrop-filter: blur）
- 角丸 20px / カード 14px
- ホバーアニメーション（translateY + glow）

### 左パネル（500px 固定幅・sticky）

- カテゴリラベル（絵文字 + テキスト、ピル型バッジ）
- 3 カラムカードグリッド（画像 + ラベル + メタ情報）
- カードクリック → WebChat にプロンプト送信
- カテゴリごとプロンプトチップス（ピル型ボタン）
- チップスクリック → WebChat にプロンプト送信

### 右パネル（WebChat）

- AI グラデーション枠線（::before pseudo-element）
- ダークヘッダー（アバター + エージェント名 + オンラインステータス）
- AI タイピングインジケーター（3 ドットアニメーション + ローテーションTips）
- 白背景チャットエリア
- 丸角送信ボックス（24px radius）
- 画像クリック → モーダル拡大表示

### カテゴリ・プロンプト案

| カテゴリ | プロンプト例 |
|---|---|
| {カテゴリ1} | {プロンプト1-1}, {プロンプト1-2}, {プロンプト1-3} |
| {カテゴリ2} | {プロンプト2-1}, {プロンプト2-2}, {プロンプト2-3} |
| {カテゴリ3} | {プロンプト3-1}, {プロンプト3-2}, {プロンプト3-3} |
```

## UI アーキテクチャ

```
┌──────────────────────────────────────────────────┐
│ [Header] Brand + AI Badge + Stats                │
├──────────────────────────────────────────────────┤
│ [Hero] Gradient Title + Description              │
│ [Features] 3-col feature cards                   │
├─────────────────────┬────────────────────────────┤
│ [Left Panel]        │ [Right Panel]              │
│ (500px, sticky)     │ (1fr, flex)                │
│                     │                            │
│ ┌─Category Label─┐  │ ┌──Chat Container───────┐  │
│ │ Card Card Card │  │ │ ╔═ Gradient Border ═╗ │  │
│ │ Card Card Card │  │ │ ║ Dark Header      ║ │  │
│ └────────────────┘  │ │ ║ Avatar + Status  ║ │  │
│ [Prompt] [Prompt]   │ │ ╠═══════════════════╣ │  │
│                     │ │ ║ AI Typing Tips   ║ │  │
│ ┌─Category Label─┐  │ │ ╠═══════════════════╣ │  │
│ │ Card Card Card │  │ │ ║                  ║ │  │
│ └────────────────┘  │ │ ║   Chat Body      ║ │  │
│ [Prompt] [Prompt]   │ │ ║   (WebChat SDK)  ║ │  │
│                     │ │ ║                  ║ │  │
│                     │ │ ╠═══════════════════╣ │  │
│                     │ │ ║ Rounded SendBox  ║ │  │
│                     │ │ ╚═════════════════════╝ │  │
│                     │ └────────────────────────┘  │
├─────────────────────┴────────────────────────────┤
│ [Footer]                                         │
└──────────────────────────────────────────────────┘
```

## CSS デザインシステム

### カラーパレット（CSS Variables）

```css
:root {
  /* プライマリ: サービスのブランドカラーに変更 */
  --color-primary: #10b981;
  /* 背景: ダークネイビー */
  --color-bg: #050a18;
  --color-surface: rgba(15, 23, 42, 0.6);
  --color-surface-solid: #0f172a;
  --color-surface-hover: #1e293b;
  /* テキスト */
  --color-text: #f1f5f9;
  --color-text-muted: #94a3b8;
  /* ボーダー */
  --color-border: rgba(99, 102, 241, 0.15);
  --color-accent: #818cf8;
  /* AI グラデーション（メイン） */
  --gradient-ai: linear-gradient(135deg, #10b981, #06b6d4, #6366f1, #a78bfa);
  --gradient-ai-subtle: linear-gradient(
    135deg,
    rgba(16, 185, 129, 0.08),
    rgba(99, 102, 241, 0.08)
  );
  /* 角丸 */
  --radius: 20px;
  --radius-lg: 28px;
  /* グロー */
  --shadow-glow:
    0 0 80px -20px rgba(99, 102, 241, 0.3),
    0 0 60px -30px rgba(16, 185, 129, 0.2);
}
```

### レイアウト（Grid Split）

```css
.workspace {
  display: grid;
  grid-template-columns: 500px 1fr;
  gap: 1.5rem;
  align-items: start;
}

.left-panel {
  position: sticky;
  top: 76px;
  max-height: calc(100vh - 92px);
  overflow-y: auto;
  padding-right: 0.75rem;
  scrollbar-width: thin;
  scrollbar-color: rgba(99, 102, 241, 0.2) transparent;
}
```

### カードグリッド

```css
.plan-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.6rem;
}

.plan-card {
  background: var(--color-surface);
  backdrop-filter: blur(12px);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.plan-card:hover {
  transform: translateY(-3px) scale(1.02);
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.12);
}
```

### チャットコンテナ（グラデーション枠）

```css
.chat-container {
  background: #ffffff;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-glow);
  position: relative;
}

/* AI グラデーション枠線 */
.chat-container::before {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: var(--radius-lg);
  padding: 1.5px;
  background: var(--gradient-ai);
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  opacity: 0.4;
  z-index: 2;
}

.chat-container:hover {
  box-shadow:
    0 0 100px -20px rgba(99, 102, 241, 0.35),
    0 0 80px -30px rgba(16, 185, 129, 0.25),
    0 40px 80px -20px rgba(0, 0, 0, 0.35);
}
```

### 送信ボックス（丸角オーバーライド）

```css
/* WebChat 送信ボックスを丸角に */
.chat-body [class*="webchat__send-box"] {
  padding: 0.6rem 0.75rem !important;
  background: #f9fafb !important;
}

.chat-body [class*="webchat__send-box__main"] {
  border-radius: 24px !important;
  border: 1px solid #e2e8f0 !important;
  background: #ffffff !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;
  overflow: hidden !important;
}

.chat-body [class*="webchat__send-box"] input,
.chat-body [class*="webchat__send-box"] textarea {
  border: none !important;
  outline: none !important;
  background: transparent !important;
}
```

### バブル角丸オーバーライド

```css
.chat-body [class*="webchat__bubble"] [class*="content"] {
  border-radius: 18px !important;
}
```

### プロンプトチップス

```css
.left-prompts-list button {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 99px;
  padding: 0.45rem 0.9rem;
  font-size: 0.73rem;
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  font-family: inherit;
  font-weight: 500;
}

.left-prompts-list button:hover {
  background: rgba(99, 102, 241, 0.15);
  border-color: var(--color-accent);
  color: #fff;
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.2);
}
```

## WebChat styleOptions（標準設定）

```javascript
const styleOptions = {
  accent: "#6366f1",
  backgroundColor: "#fafbfc",
  botAvatarBackgroundColor: "#6366f1",
  botAvatarInitials: "{EMOJI}",
  userAvatarBackgroundColor: "#6366f1",
  userAvatarInitials: "U",
  avatarBorderRadius: "12px",
  avatarSize: 34,
  bubbleBackground: "#ffffff",
  bubbleBorderColor: "#e5e7eb",
  bubbleBorderRadius: 18,
  bubbleBorderWidth: 1,
  bubbleFromUserBackground: "#eef2ff",
  bubbleFromUserBorderColor: "#c7d2fe",
  bubbleFromUserBorderRadius: 18,
  bubbleFromUserBorderWidth: 1,
  bubbleFromUserTextColor: "#1e1b4b",
  bubbleTextColor: "#1f2937",
  bubbleMinHeight: 40,
  bubbleNubSize: 0,
  bubbleFromUserNubSize: 0,
  sendBoxBackground: "#f9fafb",
  sendBoxBorderTop: "none",
  sendBoxButtonColor: "#6366f1",
  sendBoxButtonColorOnHover: "#4f46e5",
  sendBoxHeight: 56,
  sendBoxPlaceholderColor: "#9ca3af",
  sendBoxTextColor: "#1f2937",
  suggestedActionBackgroundColor: "#6366f1",
  suggestedActionBorderRadius: 20,
  suggestedActionTextColor: "#ffffff",
  suggestedActionLayout: "flow",
  primaryFont: "'Inter', 'Noto Sans JP', sans-serif",
  hideUploadButton: true,
  autoScrollSnapOnPage: true,
  rootHeight: "100%",
  rootWidth: "100%",
  typingAnimationDuration: 0,
  typingAnimationHeight: 0,
};
```

## AI タイピングインジケーター（Tips ローテーション）

ボットが応答生成中にユーザーの待ち時間を有効活用するパターン。

### 配置ルール

> **重要**: AI タイピングインジケーターは **送信ボックス直上** に表示する。
> ヘッダー直下ではなく、ユーザーの入力エリアに近い位置に配置することで自然な UX になる。

HTML では `chat-body` の後に配置し、WebChat レンダリング後に MutationObserver で送信ボックス直前に挿入する（後述の「送信ボックス直上への配置」セクション参照）。

### HTML 構造

```html
<!-- chat-body の後に配置（JS で送信ボックス直上に移動される） -->
<div class="ai-typing" id="ai-typing">
  <div class="ai-typing-dots"><span></span><span></span><span></span></div>
  <div class="ai-typing-content">
    <span class="ai-typing-label">AIが探索中…</span>
    <span class="ai-typing-tip" id="ai-tip"></span>
  </div>
</div>
```

### WebChat 組み込みタイピングインジケーター非表示 CSS

WebChat SDK には組み込みのタイピングインジケーター（●●●）がある。
カスタム AI タイピングインジケーターと重複するため、3 重の対策で非表示にする。

```css
/* 1. CSS で非表示 */
.chat-body [class*="webchat__typing-indicator"],
.chat-body [class*="typing-indicator"],
.chat-body [class*="typing-activity"],
#webchat [class*="webchat__typing-indicator"],
#webchat [class*="typing-indicator"],
#webchat [class*="typing-activity"] {
  display: none !important;
  height: 0 !important;
  overflow: hidden !important;
  visibility: hidden !important;
}
```

```javascript
// 2. styleOptions で無効化
typingAnimationDuration: 0,
typingAnimationHeight: 0,

// 3. store ミドルウェアで typing アクティビティをブロック（後述の WebChat Store 統合を参照）
```

### CSS

```css
.ai-typing {
  display: none;
  align-items: center;
  gap: 0.6rem;
  padding: 0.65rem 1.25rem;
  background: linear-gradient(
    90deg,
    rgba(99, 102, 241, 0.03),
    rgba(16, 185, 129, 0.03)
  );
  border-top: 1px solid rgba(99, 102, 241, 0.05);
}
.ai-typing.active {
  display: flex;
}

.ai-typing-dots {
  display: flex;
  gap: 3px;
}
.ai-typing-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--gradient-ai);
  animation: bounce 1.4s ease-in-out infinite;
}
.ai-typing-dots span:nth-child(2) {
  animation-delay: 0.15s;
}
.ai-typing-dots span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-5px);
    opacity: 1;
  }
}

.ai-typing-tip {
  font-size: 0.7rem;
  color: #64748b;
  animation: tipFade 0.4s ease;
}
@keyframes tipFade {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### JavaScript

```javascript
const tips = [
  "💡 {ドメイン固有のTip1}",
  "🏗️ {ドメイン固有のTip2}",
  // ... 10-12 個用意
];
let tipIndex = 0;
let tipInterval = null;

function showTyping() {
  typingEl.classList.add("active");
  if (tipInterval) return; // 重複防止: 既に回転中なら何もしない
  tipIndex = Math.floor(Math.random() * tips.length);
  tipEl.textContent = tips[tipIndex];
  tipInterval = setInterval(() => {
    tipIndex = (tipIndex + 1) % tips.length;
    tipEl.textContent = tips[tipIndex];
    tipEl.style.animation = "none";
    tipEl.offsetHeight;
    tipEl.style.animation = "";
  }, 5000); // 5秒: 豆知識を読める程度の表示時間
}

function hideTyping() {
  typingEl.classList.remove("active");
  if (tipInterval) {
    clearInterval(tipInterval);
    tipInterval = null;
  }
}
```

### WebChat Store 統合

```javascript
function createCustomStore() {
  return window.WebChat.createStore(
    {},
    ({ dispatch }) =>
      (next) =>
      (action) => {
        if (action.type === "DIRECT_LINE/CONNECT_FULFILLED") {
          dispatch({
            type: "DIRECT_LINE/POST_ACTIVITY",
            meta: { method: "keyboard" },
            payload: {
              activity: {
                channelData: { postBack: true },
                name: "startConversation",
                type: "event",
              },
            },
          });
        }
        // タイピング検出
        if (action.type === "DIRECT_LINE/INCOMING_ACTIVITY") {
          const a = action.payload?.activity;
          if (a?.type === "typing") {
            showTyping();
            return; // WebChat 組み込みタイピングインジケーターをブロック
          }
          if (a?.type === "message" && a?.from?.role === "bot")
            hideTyping();
        }
        if (action.type === "WEB_CHAT/SEND_MESSAGE") showTyping();
        return next(action);
      },
  );
}
```

### 送信ボックス直上への配置（MutationObserver）

WebChat SDK は非同期に DOM を構築するため、送信ボックス要素はレンダリング後にしか存在しない。
MutationObserver で送信ボックスの出現を検知し、AI タイピングインジケーターをその直前に挿入する。

```javascript
// renderWebChat() 呼び出し直後に配置
window.WebChat.renderWebChat(
  { directLine, styleOptions, store },
  document.getElementById("webchat"),
);

// AI タイピングインジケーターを送信ボックス直上に移動
const webchatEl = document.getElementById("webchat");
const typingEl = document.getElementById("ai-typing");
const observer = new MutationObserver(() => {
  const sendBox = webchatEl.querySelector('[class*="webchat__send-box"]');
  if (sendBox) {
    sendBox.parentNode.insertBefore(typingEl, sendBox);
    observer.disconnect();
  }
});
observer.observe(webchatEl, { childList: true, subtree: true });
```

> **なぜ `chat-body` の後に HTML 配置 + JS で移動するのか**:
> WebChat SDK の内部 DOM 構造は `#webchat` 内に `webchat__send-box` として構築される。
> 静的 HTML でその位置に要素を置くことはできないため、MutationObserver で動的に挿入する。

## カテゴリ別カード + プロンプト（JavaScript データ構造）

```javascript
const categories = [
  {
    name: "{EMOJI} {カテゴリ名}",
    plans: [
      { id: 1, label: "{ラベル}", meta: "{メタ情報}" },
      // 3-6 カード / カテゴリ
    ],
    prompts: [
      { text: "{短縮ラベル}", prompt: "{送信するフルプロンプト}" },
      // 3 プロンプト / カテゴリ
    ],
  },
  // 2-4 カテゴリ
];
```

### カード → メッセージ送信

```javascript
card.addEventListener("click", () => {
  if (selectedCard) selectedCard.classList.remove("selected");
  card.classList.add("selected");
  selectedCard = card;
  sendMessage(
    `${cat.name.replace(/^\S+\s/, "")}に最適な「${plan.label}」によく似た{ITEM}の例をいくつか提案して`,
  );
});
```

### プロンプトチップス → メッセージ送信

```javascript
btn.addEventListener("click", () => sendMessage(p.prompt));
```

## 画像モーダル（WebChat 内画像クリック対応）

```javascript
document.getElementById("webchat").addEventListener("click", (e) => {
  const img = e.target.closest("img");
  if (img && img.src && !img.closest('[class*="send-box"]')) {
    modalImg.src = img.src;
    imgModal.classList.add("active");
  }
});
```

## レスポンシブ対応

```css
@media (max-width: 900px) {
  .workspace {
    grid-template-columns: 1fr;
  }
  .left-panel {
    position: static;
    max-height: none;
  }
}

@media (max-width: 600px) {
  .features-row {
    grid-template-columns: 1fr;
  }
  .plan-grid {
    grid-template-columns: 1fr 1fr;
  }
  .chat-container {
    border-radius: var(--radius);
  }
}
```

## ファイル構成

```
website/
  index.html           ← 本テンプレートで生成
scripts/
  deploy_website.py    ← Azure Storage デプロイ
```

## カスタマイズポイント一覧

| 項目                  | 変更箇所                    | 説明                             |
| --------------------- | --------------------------- | -------------------------------- |
| ブランドカラー        | `--color-primary`           | emerald → 任意のブランドカラーに |
| グラデーション        | `--gradient-ai`             | 4色グラデーション配色            |
| アバター              | `.avatar-invader`           | CSS ピクセルアート or 絵文字     |
| カテゴリ数            | `categories[]`              | 2〜4 カテゴリ推奨                |
| カード数/カテゴリ     | `plans[]`                   | 3〜6 カード推奨                  |
| プロンプト数/カテゴリ | `prompts[]`                 | 3 プロンプト推奨                 |
| Tips                  | `tips[]`                    | ドメイン固有 10〜12 個推奨       |
| 画像ベース URL        | `BLOB_BASE`                 | Azure Blob Storage URL           |
| トークン              | `tokenEndpoint`             | Copilot Studio DirectLine URL    |
| モーダル              | 画像モーダル / 登録モーダル | 要件に応じて有効/無効            |

## 実装フロー

1. **設計提案**: 本テンプレートのレイアウト + カテゴリ/プロンプト案をユーザーに提示
2. **承認**: ユーザーが承認
3. **実装**: `website/index.html` をテンプレートベースで生成
4. **カスタマイズ**: カテゴリ・プロンプト・Tips・カラーを案件に合わせて調整
5. **デプロイ**: `py scripts/deploy_website.py` で Azure Storage にデプロイ

## 適用条件

- 外部顧客向け AI エージェント Web サイト
- 認証なし（匿名アクセス）
- Azure Storage 静的 Web サイト
- WebChat SDK（BotFramework）
- カテゴリ分類可能な提案コンテンツが存在する
