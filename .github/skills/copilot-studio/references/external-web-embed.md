# 外部公開 Web サイト埋め込みパターン

外部顧客向けにエージェントを Web サイトに公開する際のパターン。
Copilot Studio の埋め込みコード（iframe）を使い、Azure Storage 静的 Web サイトでホスティングする。

## 前提条件

- Copilot Studio エージェントが「**認証なし**」で公開済み
- Azure Storage Account（静的 Web サイト有効）

## アーキテクチャ

```
[外部ユーザー] → [Azure Storage 静的 Web サイト] → [iframe: Copilot Studio WebChat]
                                                           ↓
                                                   [Copilot Studio エージェント]
                                                           ↓
                                                   [Dataverse MCP Server / ナレッジ]
```

## Copilot Studio 認証設定

外部公開エージェントは「認証なし」を選択する必要がある:

1. Copilot Studio → エージェント → 設定 → セキュリティ → 認証
2. 「**認証なし**」を選択 → 保存
3. 「**公開**」をクリック

> ⚠️ 認証なし以外では埋め込みコードが表示されない

## 埋め込みコードの取得

1. 設定 → チャネル → 「**Web アプリまたはネイティブアプリ**」
2. 「**埋め込みコード**」セクションの iframe スニペットをコピー

取得されるスニペットの形式:
```html
<iframe src="https://copilotstudio.preview.microsoft.com/environments/{ENVIRONMENT_ID}/bots/{BOT_SCHEMA_NAME}/webchat?__version__=2"
  frameborder="0" style="width: 100%; height: 100%;"></iframe>
```

## Web サイト実装テンプレート

### ファイル構成

```
website/
  index.html     ← チャットウィジェット付きランディングページ
```

### index.html テンプレート

```html
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{サイト名} - AIアシスタント</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            min-height: 100vh;
        }
        header {
            background: {ACCENT_COLOR};
            color: white;
            padding: 1rem 2rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        header h1 { font-size: 1.5rem; font-weight: 600; }
        header p { font-size: 0.85rem; opacity: 0.9; margin-top: 0.25rem; }
        .hero {
            text-align: center;
            padding: 3rem 1rem;
        }
        .hero h2 { font-size: 2rem; color: {DARK_COLOR}; margin-bottom: 1rem; }
        .hero p {
            font-size: 1.1rem; color: #555;
            max-width: 600px; margin: 0 auto 2rem; line-height: 1.8;
        }
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem; max-width: 900px;
            margin: 0 auto 3rem; padding: 0 1rem;
        }
        .feature-card {
            background: white; border-radius: 12px;
            padding: 1.5rem; box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            text-align: center;
        }
        .feature-card .icon { font-size: 2.5rem; margin-bottom: 0.75rem; }
        .feature-card h3 { color: {ACCENT_COLOR}; margin-bottom: 0.5rem; }
        .feature-card p { color: #666; font-size: 0.9rem; line-height: 1.6; }

        /* Chat Widget */
        #chat-container { position: fixed; bottom: 24px; right: 24px; z-index: 9999; }
        #chat-toggle {
            width: 64px; height: 64px; border-radius: 50%;
            background: {ACCENT_COLOR}; border: none; cursor: pointer;
            box-shadow: 0 4px 16px rgba(0,0,0,0.3);
            display: flex; align-items: center; justify-content: center;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        #chat-toggle:hover { transform: scale(1.1); }
        #chat-toggle svg { width: 32px; height: 32px; fill: white; }
        #chat-window {
            display: none; position: fixed;
            bottom: 100px; right: 24px;
            width: 400px; height: 600px;
            border-radius: 16px; overflow: hidden;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
            flex-direction: column; background: white;
        }
        #chat-window.open { display: flex; }
        #chat-header {
            background: {ACCENT_COLOR}; color: white;
            padding: 1rem; display: flex;
            align-items: center; justify-content: space-between;
        }
        #chat-header h4 { font-size: 1rem; }
        #chat-close {
            background: none; border: none; color: white;
            font-size: 1.5rem; cursor: pointer; line-height: 1;
        }
        #webchat-iframe { flex: 1; }
        @media (max-width: 480px) {
            #chat-window {
                width: calc(100vw - 16px); height: calc(100vh - 120px);
                right: 8px; bottom: 80px; border-radius: 12px;
            }
        }
    </style>
</head>
<body>
    <header>
        <h1>{HEADER_ICON} {サイト名}</h1>
        <p>{サイト説明}</p>
    </header>
    <section class="hero">
        <h2>{ヒーローテキスト}</h2>
        <p>{説明文}</p>
    </section>
    <section class="features">
        <!-- 特徴カードを3つ程度配置 -->
        <div class="feature-card">
            <div class="icon">{ICON}</div>
            <h3>{タイトル}</h3>
            <p>{説明}</p>
        </div>
    </section>

    <!-- Chat Widget -->
    <div id="chat-container">
        <div id="chat-window">
            <div id="chat-header">
                <h4>{HEADER_ICON} {エージェント名}</h4>
                <button id="chat-close">&times;</button>
            </div>
            <iframe
                id="webchat-iframe"
                src="https://copilotstudio.preview.microsoft.com/environments/{ENVIRONMENT_ID}/bots/{BOT_SCHEMA_NAME}/webchat?__version__=2"
                frameborder="0"
                style="width: 100%; height: 100%; border: none;"
            ></iframe>
        </div>
        <button id="chat-toggle" aria-label="チャットを開く">
            <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
        </button>
    </div>

    <script>
        const chatToggle = document.getElementById('chat-toggle');
        const chatWindow = document.getElementById('chat-window');
        const chatClose = document.getElementById('chat-close');

        chatToggle.addEventListener('click', () => {
            chatWindow.classList.add('open');
            chatToggle.style.display = 'none';
        });

        chatClose.addEventListener('click', () => {
            chatWindow.classList.remove('open');
            chatToggle.style.display = 'flex';
        });
    </script>
</body>
</html>
```

## Azure Storage 静的 Web サイトデプロイ

### Python デプロイスクリプト

```python
"""Azure Storage 静的 Web サイトを有効化し、index.html をデプロイする"""
from azure.storage.blob import BlobServiceClient, ContentSettings

ACCOUNT_NAME = "{STORAGE_ACCOUNT_NAME}"
ACCOUNT_KEY = "{STORAGE_ACCOUNT_KEY}"  # または os.environ から取得

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

### 必要パッケージ

```bash
pip install azure-storage-blob
```

### .env 追加項目

```env
AZURE_STORAGE_ACCOUNT=mystorageaccount
AZURE_STORAGE_KEY=xxxxx
COPILOT_EMBED_URL=https://copilotstudio.preview.microsoft.com/environments/{ENV_ID}/bots/{SCHEMA}/webchat?__version__=2
```

## Storage Account 作成（ARM REST API）

`az storage account create` で SubscriptionNotFound が発生する場合、ARM REST API を直接使用する:

```bash
# 1. リクエストボディを JSON ファイルに保存
# storage-body.json:
# {"sku":{"name":"Standard_LRS"},"kind":"StorageV2","location":"japaneast","properties":{"allowBlobPublicAccess":true,"minimumTlsVersion":"TLS1_2"}}

az rest --method put \
  --url "https://management.azure.com/subscriptions/{SUB_ID}/resourceGroups/{RG}/providers/Microsoft.Storage/storageAccounts/{ACCOUNT}?api-version=2023-05-01" \
  --headers "Content-Type=application/json" \
  --body "@storage-body.json"
```

> **教訓**: `az storage account create` が SubscriptionNotFound で失敗する場合でも `az rest` で ARM API を直接呼べば成功する。Microsoft.Storage リソースプロバイダーの登録が完了していなくても REST API は動作する。

## 注意事項

```
❌ /copilotstudio/dataverse-backed/authenticated/.../conversations API を使う
   → 認証付き API で外部匿名ユーザーはアクセスできない（404）
✅ Bot Framework WebChat SDK + DirectLine トークンエンドポイント
   → 「認証なし」エージェントでも /powervirtualagents/botsbyschema/{SCHEMA}/directline/token は
     HTTP 200 でトークンを返す（検証済み）。UI 完全カスタマイズ・多言語対応が可能。
   → 詳細は webchat-sdk-embed.md（推奨パターン）を参照
✅ Copilot Studio 埋め込みコード（iframe）を使用する
   → 認証なしエージェント専用、最もシンプル（カスタマイズ不要な場合）
```

## 適用条件

このパターンは以下の条件で使用する:

| 条件 | 値 |
|------|-----|
| 対象ユーザー | 外部顧客（匿名） |
| 認証設定 | 認証なし |
| チャネル | カスタム Web サイト |
| ホスティング | Azure Storage 静的 Web サイト |
| チャット表示方式 | フローティングボタン + iframe パネル |
