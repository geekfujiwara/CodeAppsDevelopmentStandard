# 外部公開 WebChat SDK 手動認証（SSO）パターン

外部顧客向け Web サイトに公開したエージェントを **Microsoft Entra ID でサインインさせ、
ユーザー権限に基づいて Dataverse へアクセス**（RLS / OBO）させる推奨パターン。

認証なし版（[webchat-sdk-embed.md](webchat-sdk-embed.md)）との違いは以下。

| 項目 | 認証なし版 | 手動認証版（本パターン） |
|---|---|---|
| 利用者 | 匿名（誰でも） | Entra ID サインイン必須 |
| データアクセス | エージェントの権限（全ユーザー同一） | **サインインユーザーの権限**（RLS 適用） |
| OAuth カード | 出ない | 出るが **裏で silent トークン交換**（SSO・コード入力なし） |
| アプリ登録 | 不要 | 認証用 + キャンバス用の 2 つ |
| 認証方式 | — | Entra ID V2 + FIC（シークレットレス） |

> 前提: エージェントは既に「認証なし」で WebChat 公開できている状態から始める。
> トークンエンドポイント取得・ホスト導出は [webchat-sdk-embed.md](webchat-sdk-embed.md) を参照。

## アーキテクチャ

```
[ブラウザ(MSAL)]                [Copilot Studio エージェント]      [Entra ID]
  キャンバスアプリ  --loginPopup-->  (手動認証: 認証用アプリ + FIC)
  (SPA / PublicClient)                        |
      |  DirectLine                           |  OAuth カード送信
      |<--------------------------------------|
      |  acquireTokenSilent(scope=            |
      |   api://{authApp}/access_as_user)     |
      |-------------------> [Entra ID] --OBO--> user_impersonation
      |  signin/tokenExchange(token)          |
      |-------------------------------------->|  検証OK → 以降ユーザー権限で Dataverse
```

- **キャンバス用アプリ**: ブラウザ SPA（MSAL PublicClient）。ユーザーをサインインさせ、
  認証用アプリのスコープ `access_as_user` のトークンを silent 取得する。
- **認証用アプリ**: エージェントが手動認証に使う。Graph(openid/profile) と
  Dataverse(user_impersonation) を委任で持ち、`access_as_user` を公開する。
- **FIC**: Copilot Studio が保存時に発行する issuer/subject を認証用アプリに登録して
  シークレットレスにトークン交換する。

## Step 1: アプリ登録（Graph・冪等）

`.env` に `TENANT_ID` / `DATAVERSE_URL` / `WEBSITE_URL` を設定し実行する。

```powershell
$env:PYTHONUTF8=1
python .github/skills/copilot-studio/scripts/setup_webchat_auth.py
```

[setup_webchat_auth.py](../scripts/setup_webchat_auth.py) が以下を冪等に構成し、
`WEBCHAT_AUTH_APP_ID` / `WEBCHAT_CANVAS_APP_ID` / `WEBCHAT_AUTH_SCOPE_URI` を `.env` へ書き込む。

- 認証用アプリ（Web リダイレクト `https://token.botframework.com/.auth/web/redirect`、
  Graph openid/profile + Dataverse user_impersonation、Expose API `access_as_user`）
- キャンバス用アプリ（SPA リダイレクト = `WEBSITE_URL`、v2 トークン、認証用スコープ要求）
- サービスプリンシパル + `oauth2PermissionGrant`（**管理者同意**まで自動）

> ⚠️ **2 段階 PATCH が必須**: `oauth2PermissionScopes`（スコープ登録）と
> `preAuthorizedApplications`（事前承認）を 1 回の PATCH にまとめると
> `400 Permission Id ... cannot be found` になる。スコープを先に PATCH → 別 PATCH で
> 事前承認を追加する（スクリプト実装済み）。

## Step 2: Copilot Studio で手動認証を構成

Copilot Studio > 対象エージェント > **設定（歯車）> セキュリティ > 認証** で
「**手動で認証する**」を選択し、以下を入力して保存する。

| 項目 | 値 |
|---|---|
| サービスプロバイダー | Microsoft Entra ID V2 **with federated credentials** |
| Client ID | `WEBCHAT_AUTH_APP_ID`（認証用アプリ） |
| Token exchange URL | `WEBCHAT_AUTH_SCOPE_URI`（= `api://{authApp}/access_as_user`） |
| Scopes | `profile openid {DATAVERSE_URL}/user_impersonation` |
| ユーザーをサインインさせる必要がある | **ON** |

> 💡 設定画面の各セクションアイコンは `<a href="/manage/{section}">`（security 等）。
> Settings ナビはオーバーフローに隠れることがあるが JS クリックで開ける。

保存すると **Federated credential issuer** と **value(subject)** が表示される。

## Step 3: FIC を認証用アプリに登録（シークレットレス）

Step 2 で表示された issuer / value を引数に渡す。

```powershell
$env:PYTHONUTF8=1
python .github/skills/copilot-studio/scripts/add_fic.py "<issuer>" "<subject/value>"
```

[add_fic.py](../scripts/add_fic.py) が `audiences=api://AzureADTokenExchange` で
FIC を冪等登録する。issuer/value は保存時に自動生成されるためテキストボックスから読み取って渡す。

## Step 4: サイト側 MSAL + SSO トークン交換

認証なし版の `index.html` に以下を追加する（実装は [webchat-sdk-design-template.md](webchat-sdk-design-template.md) の
デザインをベースに、サインインゲートを重ねる）。`clientId`・`tenantId` は**公開情報**（機密ではない）。

**1. MSAL 読み込み**（jsDelivr が確実。`alcdn.msauth.net` は CORS/404 になることがある）

```html
<script src="https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.4/lib/msal-browser.min.js"></script>
```

**2. MSAL 初期化とサインイン**

```js
const AUTH_CONFIG = {
  canvasClientId: "{WEBCHAT_CANVAS_APP_ID}",
  tenantId: "{TENANT_ID}",
  userIdPrefix: "webchat-",
};
const msalInstance = new msal.PublicClientApplication({
  auth: {
    clientId: AUTH_CONFIG.canvasClientId,
    authority: `https://login.microsoftonline.com/${AUTH_CONFIG.tenantId}`,
    redirectUri: window.location.origin + "/",
  },
  cache: { cacheLocation: "localStorage" },
});
async function signIn() {
  const result = await msalInstance.loginPopup({ scopes: ["openid", "profile"] });
  account = result.account;
  msalInstance.setActiveAccount(account);
  initializeChat();
}
```

**3. OAuth カードを silent 交換するストアミドルウェア**（SSO の要）

```js
function getOAuthCardResourceUri(activity) {
  const att = activity?.attachments?.[0];
  if (att?.contentType === "application/vnd.microsoft.card.oauth" &&
      att.content?.tokenExchangeResource) {
    return att.content.tokenExchangeResource.uri;
  }
}
async function exchangeTokenAsync(resourceUri) {
  const resp = await msalInstance.acquireTokenSilent({ scopes: [resourceUri], account });
  return resp.accessToken;
}
function createSsoStore(userID) {
  return window.WebChat.createStore({}, ({ dispatch }) => (next) => (action) => {
    if (action.type === "DIRECT_LINE/CONNECT_FULFILLED") {
      dispatch({ type: "WEB_CHAT/SEND_EVENT",
        payload: { name: "startConversation", type: "event", value: { text: "hello" } } });
      return next(action);
    }
    if (action.type === "DIRECT_LINE/INCOMING_ACTIVITY") {
      const a = action.payload.activity;
      let uri;
      if (a.from?.role === "bot" && (uri = getOAuthCardResourceUri(a))) {
        exchangeTokenAsync(uri).then((token) => {
          if (!token) return next(action);
          directLine.postActivity({
            type: "invoke", name: "signin/tokenExchange",
            value: {
              id: a.attachments[0].content.tokenExchangeResource.id,
              connectionName: a.attachments[0].content.connectionName, token,
            },
            from: { id: userID, name: account.name, role: "user" },
          }).subscribe(
            (id) => { if (id === "retry") return next(action); }, // 失敗時のみカード表示
            () => next(action),
          );
        });
        return; // カードは描画しない（SSO）
      }
    }
    return next(action);
  });
}
```

**4. サインイン済みユーザーで WebChat 描画**

```js
window.WebChat.renderWebChat(
  { directLine, styleOptions, store: createSsoStore(userID), userID },
  document.getElementById("webchat")
);
```

`userID` はアカウント安定 ID（`localAccountId`）を `userIdPrefix + id` で生成し 64 文字以内にする。

## Step 5: デプロイ・公開・検証

1. `python .github/skills/copilot-studio/scripts/deploy_website.py` でサイトを再デプロイ。
2. Copilot Studio でエージェントを **公開**（手動認証設定の反映に必須）。
3. サイトを開きサインイン → メッセージ送信。

**成功の判定**: サインイン後、**検証コードを求められず**そのまま応答が返り、
ユーザー権限に基づく実データ（RLS 適用）が返る。コード入力カードが出たら SSO 失敗。

## 運用上の注意

- 「ユーザーをサインインさせる必要がある」ON にすると、エージェントを**共有された利用者のみ**が
  利用できる。外部ユーザーには対象ユーザー/グループへの共有設定が別途必要。
- 自動トリガー（メール等）は認証ユーザー文脈を持たないため、手動認証エージェントでは応答しない。
- 初回は MCP コネクタ/接続の同意カードが出ることがある。一度承認すれば以降は不要。

> 異常系（popup ブロック・`msal is not defined`・400 PATCH 等）は
> [troubleshooting.md](troubleshooting.md) を参照。
