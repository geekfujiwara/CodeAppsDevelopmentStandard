# 外部公開 WebChat SDK 埋め込みパターン（推奨）

外部顧客向けにエージェントを Web サイトに公開する際の **標準パターン**。
BotFramework WebChat SDK を使い、プログラム的なメッセージ送信・UI フルカスタマイズを実現する。

> ⚠️ iframe 方式（`external-web-embed.md`）は簡易版。本パターンが推奨。
>
> 📐 **UI デザイン標準**: [webchat-sdk-design-template.md](webchat-sdk-design-template.md) を参照。
> 外部公開 Web サイトを新規構築する際は、デザインテンプレートのレイアウト
> （左パネル: カテゴリ別カード＋プロンプトチップス / 右パネル: WebChat）を
> 標準として提案し、承認後に実装を進めること。

## iframe 方式との違い

| 項目                       | iframe 方式           | WebChat SDK 方式（本パターン） |
| -------------------------- | --------------------- | ------------------------------ |
| UI カスタマイズ            | 不可                  | `styleOptions` で完全制御      |
| プログラム的メッセージ送信 | 不可                  | `store.dispatch()` で可能      |
| カルーセル連携             | 不可                  | カード選択 → 自動送信          |
| デザイン統合               | iframe の境界が見える | ページと完全に統合             |
| 認証設定                   | 認証なし              | 認証なし（トークンは自動取得） |

## 前提条件

- Copilot Studio エージェントが「**認証なし**」で公開済み
- Azure Storage Account（静的 Web サイト有効）
- エージェントの DirectLine トークンエンドポイント URL

## トークンエンドポイントの取得

「認証なし」エージェントでも DirectLine トークンエンドポイントは取得可能:

1. Copilot Studio → エージェント → **チャネル** タブ
2. 「**ネイティブ アプリ**」を選択
3. 表示される **接続文字列** から URL を取得

接続文字列の形式（Conversations API）:

```
https://{ENV_ID}.environment.api.powerplatform.com/copilotstudio/dataverse-backed/authenticated/bots/{BOT_SCHEMA}/conversations?api-version=2022-03-01-preview
```

**DirectLine トークンエンドポイント** はこの URL を変換して取得:

```
https://{ENV_ID}.environment.api.powerplatform.com/powervirtualagents/botsbyschema/{BOT_SCHEMA}/directline/token?api-version=2022-03-01-preview
```

変換ルール:

```
/copilotstudio/dataverse-backed/authenticated/bots/{SCHEMA}/conversations
  ↓
/powervirtualagents/botsbyschema/{SCHEMA}/directline/token
```

> ✅ **検証済み**: 「認証なし」エージェントでもこのトークンエンドポイントは HTTP 200 で
> DirectLine トークン（JWT）を返す。サインイン不要で匿名利用できる。

### ホスト名は ENV_ID から導出する（ハイフン除去 + 分割）

トークンエンドポイントのホストは環境 ID（`ENV_ID`）そのものではなく、
**ハイフンを除いた 32 桁 16 進数を「先頭 30 桁 . 末尾 2 桁」に分割**した形式:

```
ENV_ID = aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
  → ハイフン除去: aaaaaaaabbbbccccddddeeeeeeeeeeee （32 桁）
  → 分割:         aaaaaaaabbbbccccddddeeeeeeeeee . ee
ホスト = aaaaaaaabbbbccccddddeeeeeeeeee.ee.environment.api.powerplatform.com
```

> 接続文字列をコピーできる場合はそのまま使えばよいが、ENV_ID から組み立てる場合は
> この分割規則に従うこと（`{ENV_ID}.environment...` のようにそのまま入れると解決しない）。

## アーキテクチャ

```
[外部ユーザー] → [Azure Storage 静的 Web サイト]
                        ↓
                  [WebChat SDK (BotFramework)]
                        ↓ DirectLine token
                  [Copilot Studio エージェント]
                        ↓
                  [Dataverse MCP Server / ナレッジ]
```

## Web サイト実装テンプレート

### デザイン方針

- **チャットを画面中央に配置**（フローティングではない）
- **ダーク UI + モダンデザイン**（Inter + Noto Sans JP）
- **カルーセル** で代表パターンを表示 → クリックでメッセージ送信
- **プロンプトチップス** でクイック入力 → クリックでメッセージ送信
- **WebChat SDK** で `styleOptions` 完全カスタマイズ

### ファイル構成

```
website/
  index.html     ← WebChat SDK 統合ランディングページ
scripts/
  deploy_website.py  ← Azure Storage デプロイ
```

### index.html テンプレート

```html
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{サイト名} — {サブタイトル}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
          --color-primary: {PRIMARY_COLOR};       /* e.g. #10b981 */
          --color-primary-dark: {PRIMARY_DARK};   /* e.g. #059669 */
          --color-bg: #0f172a;
          --color-surface: #1e293b;
          --color-surface-hover: #334155;
          --color-text: #f1f5f9;
          --color-text-muted: #94a3b8;
          --color-border: #334155;
          --color-accent: {ACCENT_COLOR};         /* e.g. #6366f1 */
          --radius: 16px;
          --shadow-lg: 0 20px 60px rgba(0,0,0,0.4);
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html { scroll-behavior: smooth; }
      body {
          font-family: 'Inter', 'Noto Sans JP', sans-serif;
          background: var(--color-bg);
          color: var(--color-text);
          min-height: 100vh;
          overflow-x: hidden;
      }

      /* ── Header ── */
      .header {
          position: sticky;
          top: 0;
          z-index: 100;
          backdrop-filter: blur(20px);
          background: rgba(15, 23, 42, 0.8);
          border-bottom: 1px solid var(--color-border);
          padding: 0 2rem;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
      }
      .header-brand {
          display: flex;
          align-items: center;
          gap: 0.75rem;
      }
      .header-brand svg {
          width: 28px; height: 28px;
          color: var(--color-primary);
      }
      .header-brand h1 {
          font-size: 1.125rem;
          font-weight: 600;
          letter-spacing: -0.02em;
      }
      .header-badge {
          font-size: 0.7rem; font-weight: 500;
          background: var(--color-primary); color: #000;
          padding: 0.2rem 0.6rem; border-radius: 99px;
      }

      /* ── Main Layout ── */
      .main {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem 1.5rem 3rem;
          display: flex;
          flex-direction: column;
          gap: 2rem;
      }

      /* ── Hero Section ── */
      .hero { text-align: center; padding: 2rem 0 1rem; }
      .hero h2 {
          font-size: clamp(1.5rem, 4vw, 2.5rem);
          font-weight: 700;
          letter-spacing: -0.03em;
          background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 0.75rem;
      }
      .hero p {
          font-size: 1rem;
          color: var(--color-text-muted);
          max-width: 540px;
          margin: 0 auto;
          line-height: 1.7;
      }

      /* ── Carousel ── */
      .carousel-section { position: relative; }
      .carousel-section h3 {
          font-size: 0.85rem; font-weight: 500;
          color: var(--color-text-muted);
          text-transform: uppercase; letter-spacing: 0.08em;
          margin-bottom: 1rem;
      }
      .carousel-track {
          display: flex; gap: 1rem;
          overflow-x: auto; scroll-snap-type: x mandatory;
          scrollbar-width: none; padding: 0.5rem 0 1rem;
      }
      .carousel-track::-webkit-scrollbar { display: none; }
      .plan-card {
          flex: 0 0 220px; scroll-snap-align: start;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 12px; overflow: hidden;
          cursor: pointer; transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
      }
      .plan-card:hover {
          transform: translateY(-4px);
          border-color: var(--color-primary);
          box-shadow: 0 8px 24px rgba(16, 185, 129, 0.15);
      }
      .plan-card.selected {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 2px var(--color-primary);
      }
      .plan-card img {
          width: 100%; height: 150px;
          object-fit: cover; background: #f8fafc;
      }
      .plan-card-info { padding: 0.75rem; }
      .plan-card-info .label { font-size: 0.8rem; font-weight: 600; }
      .plan-card-info .meta { font-size: 0.7rem; color: var(--color-text-muted); }

      /* ── Chat Center ── */
      .chat-section { flex: 1; display: flex; flex-direction: column; }
      .chat-container {
          background: #ffffff;
          border-radius: 20px; overflow: hidden;
          box-shadow:
              0 0 0 1px rgba(255,255,255,0.05),
              0 25px 60px -12px rgba(0, 0, 0, 0.5),
              0 0 120px -30px rgba(16, 185, 129, 0.1);
          display: flex; flex-direction: column;
      }
      .chat-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1rem 1.5rem;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
          position: relative; overflow: hidden;
      }
      .chat-header::before {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), transparent 60%);
          pointer-events: none;
      }
      .chat-header-left {
          display: flex; align-items: center; gap: 0.875rem;
          position: relative; z-index: 1;
      }
      .chat-header-left .avatar {
          width: 44px; height: 44px; border-radius: 14px;
          background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
          display: flex; align-items: center; justify-content: center;
          font-size: 1.25rem;
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.35);
      }
      .chat-header-left .info h4 {
          font-size: 1.05rem; font-weight: 700;
          letter-spacing: -0.02em; color: #f1f5f9;
      }
      .chat-header-left .info p {
          font-size: 0.75rem; color: #94a3b8; margin-top: 0.2rem;
      }
      .chat-status {
          font-size: 0.78rem; color: var(--color-primary); font-weight: 500;
          background: rgba(16, 185, 129, 0.08);
          padding: 0.45rem 0.9rem; border-radius: 99px;
          border: 1px solid rgba(16, 185, 129, 0.15);
          position: relative; z-index: 1;
      }
      .chat-status .dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--color-primary); display: inline-block;
          animation: pulse 2s ease-in-out infinite;
          margin-right: 0.4rem;
      }
      @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
      }
      .chat-body {
          height: clamp(500px, calc(100vh - 320px), 900px);
          overflow: hidden; resize: vertical;
          min-height: 400px; max-height: 1200px;
          background: #f9fafb;
      }
      .chat-body #webchat { height: 100%; width: 100%; }
      .chat-body #webchat > * { height: 100%; }

      /* ── Prompt Chips ── */
      .prompt-chips {
          display: flex; flex-wrap: wrap; gap: 0.5rem;
          padding: 1rem 1.5rem;
          border-top: 1px solid rgba(0,0,0,0.06);
          background: linear-gradient(180deg, #f8fafc, #f1f5f9);
      }
      .prompt-chips-label {
          width: 100%; font-size: 0.7rem; text-transform: uppercase;
          letter-spacing: 0.06em; color: #64748b;
          margin-bottom: 0.25rem; font-weight: 600;
      }
      .prompt-chips button {
          background: #ffffff; border: 1px solid #e2e8f0;
          border-radius: 99px; padding: 0.5rem 1rem;
          font-size: 0.8rem; color: #334155;
          cursor: pointer; transition: all 0.2s;
          font-family: inherit; font-weight: 500;
      }
      .prompt-chips button:hover {
          background: var(--color-primary); border-color: var(--color-primary);
          color: #fff; transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.3);
      }

      @media (max-width: 768px) {
          .header { padding: 0 1rem; }
          .main { padding: 1.5rem 1rem; }
          .plan-card { flex: 0 0 180px; }
          .chat-body { height: clamp(360px, calc(100vh - 200px), 700px); }
      }
    </style>
  </head>
  <body>
    <header class="header">
      <div class="header-brand">
        <!-- SVG アイコンを変更 -->
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <h1>{サイト名}</h1>
        <span class="header-badge">AI</span>
      </div>
    </header>

    <main class="main">
      <section class="hero">
        <h2>{ヒーローテキスト}</h2>
        <p>{説明文}</p>
      </section>

      <!-- カルーセル: 代表パターン -->
      <section class="carousel-section">
        <h3>{カルーセルタイトル}</h3>
        <div class="carousel-track" id="carousel-track"></div>
      </section>

      <!-- チャット: ページ中央 -->
      <section class="chat-section">
        <div class="chat-container">
          <div class="chat-header">
            <div class="chat-header-left">
              <div class="avatar">{EMOJI}</div>
              <div class="info">
                <h4>{エージェント名}</h4>
                <p>{サブタイトル}</p>
              </div>
            </div>
            <div class="chat-status"><span class="dot"></span> オンライン</div>
          </div>
          <div class="chat-body">
            <div id="webchat" role="main"></div>
          </div>
          <div class="prompt-chips" id="prompt-chips">
            <span class="prompt-chips-label">こんな質問を試してみよう</span>
            <!-- ボタンを配置: data-prompt にフル質問文を設定 -->
            <button data-prompt="{質問全文}">{短縮ラベル}</button>
          </div>
        </div>
      </section>
    </main>

    <script src="https://cdn.botframework.com/botframework-webchat/latest/webchat.js"></script>
    <script>
      // ========================================
      // WebChat SDK Configuration
      // ========================================
      const tokenEndpoint = "{TOKEN_ENDPOINT}";

      const styleOptions = {
        accent: "{PRIMARY_COLOR}",
        backgroundColor: "#f9fafb",
        botAvatarBackgroundColor: "{PRIMARY_COLOR}",
        botAvatarInitials: "{BOT_INITIALS}",
        userAvatarBackgroundColor: "{ACCENT_COLOR}",
        userAvatarInitials: "U",
        avatarBorderRadius: "8px",
        avatarSize: 32,
        bubbleBackground: "#ffffff",
        bubbleBorderColor: "#e2e8f0",
        bubbleBorderRadius: 16,
        bubbleBorderWidth: 1,
        bubbleFromUserBackground: "#eef2ff",
        bubbleFromUserBorderColor: "#c7d2fe",
        bubbleFromUserBorderRadius: 16,
        bubbleFromUserBorderWidth: 1,
        bubbleFromUserTextColor: "#1e293b",
        bubbleTextColor: "#1e293b",
        bubbleMinHeight: 40,
        sendBoxBackground: "#ffffff",
        sendBoxBorderTop: "solid 1px #e2e8f0",
        sendBoxButtonColor: "{PRIMARY_COLOR}",
        sendBoxButtonColorOnHover: "{PRIMARY_DARK}",
        sendBoxHeight: 56,
        sendBoxPlaceholderColor: "#94a3b8",
        sendBoxTextColor: "#1e293b",
        suggestedActionBackgroundColor: "{PRIMARY_COLOR}",
        suggestedActionBorderRadius: 20,
        suggestedActionTextColor: "#ffffff",
        suggestedActionLayout: "flow",
        primaryFont: "'Inter', 'Noto Sans JP', sans-serif",
        hideUploadButton: true,
        autoScrollSnapOnPage: true,
        typingAnimationDuration: 0,
        typingAnimationHeight: 0,
      };

      let directLine = null;
      let store = null;

      // startConversation イベントを送信
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
              return next(action);
            },
        );
      }

      // プログラム的にメッセージを送信
      function sendMessage(text) {
        if (!store) return;
        store.dispatch({
          type: "WEB_CHAT/SEND_MESSAGE",
          payload: { text },
        });
      }

      // WebChat 初期化
      async function initializeChat() {
        try {
          const environmentEndPoint = tokenEndpoint.slice(
            0,
            tokenEndpoint.indexOf("/powervirtualagents"),
          );
          const apiVersion = tokenEndpoint
            .slice(tokenEndpoint.indexOf("api-version"))
            .split("=")[1];
          const regionalChannelSettingsURL = `${environmentEndPoint}/powervirtualagents/regionalchannelsettings?api-version=${apiVersion}`;

          const [settingsRes, tokenRes] = await Promise.all([
            fetch(regionalChannelSettingsURL),
            fetch(tokenEndpoint),
          ]);

          const settings = await settingsRes.json();
          const conversationInfo = await tokenRes.json();
          const directLineUrl = settings.channelUrlsById?.directline;

          if (!directLineUrl || !conversationInfo.token) {
            throw new Error("Failed to get DirectLine URL or token");
          }

          directLine = window.WebChat.createDirectLine({
            domain: `${directLineUrl}v3/directline`,
            token: conversationInfo.token,
          });

          store = createCustomStore();

          window.WebChat.renderWebChat(
            { directLine, styleOptions, store },
            document.getElementById("webchat"),
          );
        } catch (err) {
          console.error("Chat init failed:", err);
          document.getElementById("webchat").innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:1rem;color:#64748b;">
                        <p>チャットの接続に失敗しました</p>
                        <button onclick="initializeChat()" style="padding:0.5rem 1rem;border-radius:8px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;">再試行</button>
                    </div>`;
        }
      }

      // ========================================
      // Carousel: カードクリック → メッセージ送信
      // ========================================
      const items = [
        // { id: 1, label: 'ラベル', meta: '説明', imageUrl: 'https://...' }
      ];

      const track = document.getElementById("carousel-track");
      let selectedCard = null;

      items.forEach((item) => {
        const card = document.createElement("div");
        card.className = "plan-card";
        card.innerHTML = `
                <img src="${item.imageUrl}" alt="${item.label}" loading="lazy">
                <div class="plan-card-info">
                    <div class="label">${item.label}</div>
                    <div class="meta">${item.meta}</div>
                </div>
            `;
        card.addEventListener("click", () => {
          if (selectedCard) selectedCard.classList.remove("selected");
          card.classList.add("selected");
          selectedCard = card;
          sendMessage(`${item.label} について詳しく教えて`);
          document
            .querySelector(".chat-section")
            .scrollIntoView({ behavior: "smooth", block: "center" });
        });
        track.appendChild(card);
      });

      // ========================================
      // Prompt Chips: クリック → メッセージ送信
      // ========================================
      document.querySelectorAll(".prompt-chips button").forEach((btn) => {
        btn.addEventListener("click", () => {
          sendMessage(btn.getAttribute("data-prompt"));
          document
            .querySelector(".chat-section")
            .scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });

      // Initialize on page load
      initializeChat();
    </script>
  </body>
</html>
```

## デプロイ（推奨: auth_helper で az login 不要）

デプロイは [scripts/deploy_website.py](../scripts/deploy_website.py) を使う。
standard スキルの `auth_helper` で ARM トークンを取得するため **`az login` / az CLI 不要**。
ARM でリソースグループ・ストレージアカウントを冪等作成し、データプレーンは
**Entra（AAD）認証**でアップロードする。

```powershell
python .github/skills/copilot-studio/scripts/deploy_website.py
```

> ⚠️ **組織の Azure Policy に注意**: 共有キー認証（`allowSharedKeyAccess`）や公開 BLOB アクセス
> （`allowBlobPublicAccess`）がポリシーで無効化されている環境では、アカウントキー方式は
> `KeyBasedAuthenticationNotPermitted` で失敗する。上記スクリプトは **AAD データプレーン認証**
> （自分に Storage Blob Data Owner を割り当て → RBAC 反映待ちリトライ）で回避する。
> 静的 Web サイトエンドポイント（`*.z*.web.core.windows.net`）は `allowBlobPublicAccess=false`
> でも匿名配信される（詳細は [troubleshooting.md](troubleshooting.md)）。

### 多言語（i18n）対応

外部サイトを多言語化する場合は、UI ラベル・カテゴリ・プロンプトを言語別の辞書オブジェクトに
持ち、`localStorage` で選択言語を永続化する。プロンプトは**選択言語の文面**で送信し、
エージェント側の Instructions も対象言語（例: 日本語/英語/中国語）で応答するよう記述しておく。

## deploy_website.py テンプレート（アカウントキー方式・ポリシー未制限環境のみ）

> ポリシーで共有キーが禁止されている場合は上記 `scripts/deploy_website.py`（AAD 方式）を使う。

```python
"""Azure Storage 静的 Web サイトを有効化し、index.html をデプロイする"""
from azure.storage.blob import BlobServiceClient, ContentSettings
import os
from dotenv import load_dotenv

load_dotenv()

ACCOUNT_NAME = os.getenv("AZURE_STORAGE_ACCOUNT")
ACCOUNT_KEY = os.getenv("AZURE_STORAGE_KEY")

conn_str = f"DefaultEndpointsProtocol=https;AccountName={ACCOUNT_NAME};AccountKey={ACCOUNT_KEY};EndpointSuffix=core.windows.net"
blob_service = BlobServiceClient.from_connection_string(conn_str)

# 静的 Web サイト有効化
blob_service.set_service_properties(
    static_website={
        "enabled": True,
        "index_document": "index.html",
        "error_document404_path": "index.html",
    }
)
print("Static website enabled")

# index.html を $web コンテナにアップロード
web_client = blob_service.get_container_client("$web")
with open("website/index.html", "rb") as f:
    web_client.upload_blob(
        name="index.html",
        data=f,
        overwrite=True,
        content_settings=ContentSettings(content_type="text/html; charset=utf-8"),
    )
print(f"Deployed: https://{ACCOUNT_NAME}.z11.web.core.windows.net/")
```

## .env 追加項目

```env
# Azure Storage（静的 Web サイトホスティング / auth_helper AAD 方式）
AZURE_SUBSCRIPTION_ID={subscription-id}   # 省略時は最初の有効サブスクリプションを使用
AZURE_RESOURCE_GROUP=rg-agent-website
AZURE_LOCATION=japaneast
AZURE_STORAGE_ACCOUNT={mystorageaccount}  # 3-24 文字・小文字英数字・グローバル一意
# アカウントキー方式を使う場合のみ（ポリシー未制限環境）
AZURE_STORAGE_KEY={account-key}

# WebChat SDK（ホストは ENV_ID のハイフン除去 32 桁を「先頭30.末尾2」に分割）
WEBCHAT_TOKEN_ENDPOINT=https://{env30}.{env2}.environment.api.powerplatform.com/powervirtualagents/botsbyschema/{BOT_SCHEMA}/directline/token?api-version=2022-03-01-preview
```

## 実装手順サマリー

### Phase 1: Copilot Studio 設定

1. エージェントを「**認証なし**」で設定・公開
2. **チャネル → ネイティブ アプリ** から接続文字列を取得
3. 接続文字列から DirectLine トークンエンドポイント URL を導出

### Phase 2: Web サイト構築

1. `website/index.html` を上記テンプレートから作成
2. プレースホルダーを置換:
   - `{TOKEN_ENDPOINT}` → DirectLine トークンエンドポイント
   - `{PRIMARY_COLOR}` → ブランドカラー
   - `{サイト名}` / `{エージェント名}` → プロジェクト固有値
3. カルーセルの `items` 配列にデータを設定
4. プロンプトチップスの `data-prompt` を設定

### Phase 3: デプロイ

1. `scripts/deploy_website.py` を作成
2. `py scripts/deploy_website.py` を実行
3. URL で動作確認: `https://{ACCOUNT}.z11.web.core.windows.net/`

## 注意事項

```
✅ WebChat SDK + DirectLine トークンエンドポイント
   → 「認証なし」でもネイティブアプリチャネルからトークンが取得できる
   → store.dispatch() でプログラム的にメッセージ送信可能
   → styleOptions で UI を完全カスタマイズ可能

❌ iframe 方式
   → UI カスタマイズ不可、postMessage 不可

❌ /copilotstudio/dataverse-backed/authenticated/ API
   → 認証なしエージェントでは外部ユーザーからアクセス不可（404）
```

## 適用条件

| 条件             | 値                                  |
| ---------------- | ----------------------------------- |
| 対象ユーザー     | 外部顧客（匿名）                    |
| 認証設定         | 認証なし                            |
| チャネル         | ネイティブ アプリ（トークン取得用） |
| ホスティング     | Azure Storage 静的 Web サイト       |
| チャット表示方式 | ページ中央埋め込み（WebChat SDK）   |
| UI カスタマイズ  | styleOptions で完全制御             |
| メッセージ連携   | カルーセル / チップス → 自動送信    |
