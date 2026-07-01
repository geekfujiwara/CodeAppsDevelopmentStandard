# WebChat SDK ライトモード・デザインテンプレート集（複数バリエーション）

外部公開 WebChat の**ライトモード**デザインテンプレート集。用途に応じて選べる 5 レイアウトと、
**全テンプレート標準搭載の「新しい会話（初期化）」ボタン**パターンをまとめる。

> [デザインテンプレート（ダーク・単一標準）](webchat-sdk-design-template.md) のライトモード派生。
> 認証を組み込む場合は [手動認証（SSO）](webchat-sdk-manual-auth.md) と併用する。

## テンプレート一覧

| テンプレート | レイアウト | 用途 | アクセントカラー例 |
|---|---|---|---|
| **workspace** | 2 カラム（左プロンプトパネル + 右チャット） | カテゴリ別プロンプトが多い業務ポータル | teal `#0f766e` |
| **minimal** | 中央 1 カラム | シンプルに会話だけを見せたい LP | indigo `#4f46e5` |
| **hero-cards** | ヒーロー + 特徴カード + 下部チャット | サービス紹介を兼ねたランディング | orange `#ea580c` |
| **dashboard** | KPI スタットカード + 右スティッキーチャット | 数値サマリと会話を並置する管理画面 | sky `#0284c7` |
| **sidebar** | 固定左ナビ + フル高さチャット | ナビ項目からプロンプト送信する SaaS 風 | purple `#7c3aed` |

いずれも共通で:
- ライトモード（背景 `#f6f8fa` 系）、Inter + Noto Sans JP
- 角丸 12〜16px、控えめな影、ホバーで translateY
- WebChat は白背景の `styleOptions`（下記）
- **「新しい会話」ボタンを標準搭載**（ヘッダー等に配置）

## 共通 styleOptions（ライト）

```javascript
const styleOptions = {
  accent: "#0f766e",                 // ← テンプレートのアクセントカラーに変更
  backgroundColor: "#ffffff",
  botAvatarBackgroundColor: "#ccfbf1",
  botAvatarInitials: "PS",
  userAvatarBackgroundColor: "#0f766e",
  userAvatarInitials: "U",
  avatarBorderRadius: 10,
  avatarSize: 34,
  bubbleBackground: "#f1f5f9",
  bubbleBorderColor: "#e2e8f0",
  bubbleBorderRadius: 16,
  bubbleBorderWidth: 1,
  bubbleTextColor: "#1e293b",
  bubbleFromUserBackground: "#0f766e",
  bubbleFromUserTextColor: "#ffffff",
  bubbleFromUserBorderRadius: 16,
  bubbleFromUserBorderWidth: 0,
  sendBoxBackground: "#ffffff",
  sendBoxBorderTop: "solid 1px #e2e8f0",
  sendBoxButtonColor: "#0f766e",
  sendBoxButtonColorOnHover: "#115e59",
  sendBoxHeight: 54,
  sendBoxTextColor: "#1e293b",
  sendBoxPlaceholderColor: "#94a3b8",
  suggestedActionBackgroundColor: "#f0fdfa",
  suggestedActionTextColor: "#0f766e",
  suggestedActionBorderColor: "#99f6e4",
  suggestedActionBorderRadius: 999,
  suggestedActionBorderWidth: 1,
  suggestedActionLayout: "flow",
  primaryFont: "'Inter', 'Noto Sans JP', sans-serif",
  hideUploadButton: true,
};
```

## 「新しい会話（初期化）」ボタン — 全テンプレート標準

ワンクリックで会話履歴をクリアし、新しい会話 ID で DirectLine を再接続する。
UI 上はヘッダーやチャットヘッダーにボタンを置く。

### ⚠️ 最重要: `#webchat` は毎回作り直す（React 再マウント対策）

会話初期化で **`el.innerHTML = ""` を使ってはいけない**。
WebChat（React）の内部ルートが正しくアンマウントされず、次の `renderWebChat` が
**例外も投げずに 0 ノードのまま描画されない**（`await` は完了するのに DOM が生成されない）罠がある。

**対策**: `#webchat` の DOM ノード自体を `createElement` で作り直してから `renderWebChat` する。

```javascript
let directLine = null;
let store = null;

// WebChat の React ルートを確実に破棄するため #webchat を作り直す
function freshWebchatEl() {
  const old = document.getElementById("webchat");
  const neu = document.createElement("div");
  neu.id = "webchat";
  neu.setAttribute("role", "main");
  old.replaceWith(neu);
  return neu;
}

async function initializeChat() {
  const el = freshWebchatEl(); // ← innerHTML="" ではなくノード再生成
  try {
    const envEnd = TOKEN_ENDPOINT.slice(0, TOKEN_ENDPOINT.indexOf("/powervirtualagents"));
    const apiVer = TOKEN_ENDPOINT.slice(TOKEN_ENDPOINT.indexOf("api-version")).split("=")[1];
    const settingsURL = `${envEnd}/powervirtualagents/regionalchannelsettings?api-version=${apiVer}`;
    const [sRes, tRes] = await Promise.all([fetch(settingsURL), fetch(TOKEN_ENDPOINT)]);
    const settings = await sRes.json();
    const conv = await tRes.json();
    const dlUrl = settings.channelUrlsById?.directline;
    if (!dlUrl || !conv.token) throw new Error("token/URL 取得失敗");
    directLine = window.WebChat.createDirectLine({ domain: `${dlUrl}v3/directline`, token: conv.token });
    store = window.WebChat.createStore({}, () => (next) => (action) => next(action));
    window.WebChat.renderWebChat({ directLine, styleOptions, store }, el);
  } catch (e) {
    el.innerHTML = `<div style="display:grid;place-items:center;height:100%;color:#64748b;gap:12px;">
      <p>チャットに接続できませんでした</p>
      <button onclick="initializeChat()" style="padding:8px 16px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;">再試行</button></div>`;
  }
}

// 新しい会話（初期化）: 旧接続を終了し、新トークン=新会話IDで再初期化
function newConversation() {
  if (directLine && directLine.end) { try { directLine.end(); } catch (_) {} }
  directLine = null;
  store = null;
  initializeChat();
}
document.getElementById("btn-reset").addEventListener("click", newConversation);

// 起動
initializeChat();
```

> **認証（SSO）併用時**: `newConversation()` は未サインインなら `signIn()` を呼ぶ。
> `initializeChat()` 冒頭で `if (!account) { reflectAuthState(); return; }` のガードを入れ、
> `store` は [手動認証（SSO）](webchat-sdk-manual-auth.md) の `createSsoStore(userID)` を使う。
> サインアウト時も `freshWebchatEl()` でチャットを空ノードに戻す。

### ボタン HTML（例: チャットヘッダー右）

```html
<button class="btn-reset" id="btn-reset" title="会話履歴をクリアして新しい会話を開始">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>
  </svg>
  新しい会話
</button>
```

```css
.btn-reset {
  display: inline-flex; align-items: center; gap: 6px;
  font: inherit; font-size: 0.8rem; font-weight: 600;
  color: var(--primary); background: var(--primary-soft);
  border: 1px solid transparent; padding: 7px 12px; border-radius: 10px;
  cursor: pointer; transition: all .15s;
}
.btn-reset:hover { background: var(--primary); color: #fff; }
.btn-reset svg { width: 15px; height: 15px; }
```

## レスポンシブ: sticky 要素の重なり回避

2 カラム/サイドバー系で `position: sticky` を使う場合、**単一カラムに切り替わるブレークポイントで
sticky を解除**しないと、スクロール時にチャットが左パネルやリストに重なる。

さらに、`@media` ブロックが基本ルール **より前**に書かれていると同一詳細度では基本ルールが優先され
上書きできない。**親クラスを付けて詳細度を上げる**（または media を後ろに置く）。

```css
/* 基本（デスクトップ）*/
.workspace .panel-left { position: sticky; top: 92px; }

/* 単一カラム時は必ず解除。詳細度を上げて確実に上書き */
@media (max-width: 1024px) {
  .workspace { grid-template-columns: 1fr; }
  .workspace .panel-left { position: static; top: auto; }
  .workspace .chat-shell { height: 70vh; }
}
```

## 各テンプレートの骨子

### workspace（2 カラム）
- `grid-template-columns: 460px 1fr`、左 `.panel-left`（sticky）にカテゴリ別カードグリッド + チップス
- 右 `.chat-shell`（`height: 78vh`）のヘッダーに status + `#btn-reset`

### minimal（中央 1 カラム）
- `max-width: 720px; margin: 0 auto` のチャットカードを中央配置
- チャット下にクイックプロンプトチップスを横並び

### hero-cards（ランディング）
- ヒーロー見出し + 3 特徴カード → その下にチャットカード
- チャットヘッダーに `#btn-reset`

### dashboard（KPI + チャット）
- 左に KPI スタットカード + 最近リスト、右に `.chat-shell`（sticky, `height: calc(100vh - 124px)`）
- 単一カラム時は `.layout .chat-shell { position: static; }` で解除

### sidebar（固定ナビ）
- 固定左ナビ（264px）の `nav-item` に `data-prompt` を持たせ、クリックで送信 + active トグル
- 右はフル高さチャット、トップバーに `#btn-reset`

## ローカル確認

`file://` では `fetch` が CORS で失敗するため、簡易サーバー経由で確認する。

```powershell
cd website
python -m http.server 8123
# http://localhost:8123/templates/workspace.html 等
```

> ボットが「サインイン必須（手動認証）」の場合、認証コード（MSAL）を組み込んだページでないと
> チャットは表示されない。デザイン確認は匿名ボットか、認証込みの本番ページで行う。

## 実装フロー

1. 用途に合うテンプレートをユーザーに提示（上表から選択）
2. アクセントカラー・カテゴリ/プロンプトを案件に合わせて調整
3. `#btn-reset` の「新しい会話」ボタンは既定で組み込む（`freshWebchatEl()` 必須）
4. 認証が必要なら [手動認証（SSO）](webchat-sdk-manual-auth.md) を統合
5. `py scripts/deploy_website.py` で Azure Storage にデプロイ

## 適用条件

- 外部顧客向け AI エージェント Web サイト（ライトモード希望）
- Azure Storage 静的 Web サイト + WebChat SDK（BotFramework）
- 会話初期化（新しい会話）を UI から提供したいケース
