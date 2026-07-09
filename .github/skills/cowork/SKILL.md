---
name: cowork
description: "目的特化型の Copilot Cowork プラグイン（M365 アプリパッケージ）を開発する。Agent Skills（SKILL.md）と Dataverse MCP コネクタをセットにし、Entra ID の OAuth 2.0 認可コードフロー認証を構成して Teams 開発者ポータルで registrationId を取得、M365 管理センターのエージェント画面からアップロード・公開して Cowork から Dataverse を利用可能にする。"
category: automation
triggers:
  - "Cowork"
  - "Cowork プラグイン"
  - "Copilot Cowork"
  - "Frontier"
  - "M365 アプリパッケージ"
  - "agentSkills"
  - "agentConnectors"
  - "Agent Skills"
  - "SKILL.md"
  - "Dataverse MCP コネクタ"
  - "remoteMcpServer"
  - "OAuthPluginVault"
  - "Teams 開発者ポータル"
  - "OAuth client registration"
  - "SSO client registration"
  - "referenceId"
  - "Enterprise Token Store"
  - "サイドロード"
  - "カスタムアプリのアップロード"
  - "M365 管理センター"
  - "Cowork スキル"
---

# Cowork プラグイン開発（Dataverse MCP セット）

目的特化型の **Copilot Cowork プラグイン**（M365 アプリパッケージ `.zip`）を作る。
ビジネススキル（`SKILL.md`）と **Dataverse MCP コネクタ**をセットにし、**Entra ID の OAuth 2.0 認可コードフロー認証**で
Cowork から Dataverse を直接操作できるようにする。

> 前提: 利用テナントが [Frontier プレビュー](https://adoption.microsoft.com/en-us/copilot/frontier-program/) に参加していること。
> 異常系・トラブルシュートは [references/troubleshooting.md](references/troubleshooting.md) を参照。

## パッケージ構成（Skills + remote connector）

```
<plugin-root>/
├── manifest.json                 # M365 Unified App Manifest v1.28
├── color.png                     # 192×192 フルカラーアイコン
├── outline.png                   # 32×32 アウトラインアイコン
├── build-package.ps1             # .zip 生成（検証付き）
└── skills/
    └── <skill-name>/             # kebab-case。フォルダ名 = SKILL.md の name と一致必須
        └── SKILL.md              # frontmatter(name/description) + ワークフロー本文
```

## 前提条件（最初に確認）

1. **環境で Microsoft Cowork が許可されていること**
   `python .github/skills/standard/scripts/check_mcp_client.py cowork` → ✅ なら OK。
   未許可なら Power Platform 管理センター → 環境 → `allowedmcpclient` で有効化。
2. **Frontier 参加**（管理者も Copilot → Settings → Frontier に登録）。
3. ツール: Python 3（auth_helper.py / アイコン生成）、PowerShell（パッケージビルド）。

## スキル同梱スクリプト（再利用）

`scripts/` のスクリプトは汎用化されており、どのテナント・環境でも `.env`（`TENANT_ID` /
`DATAVERSE_URL` / `PUBLISHER_PREFIX` / `COWORK_OAUTH_CLIENT_ID`）を参照して動作する。

| スクリプト | 用途 |
|---|---|
| [scripts/setup_entra_oauth_graph.py](scripts/setup_entra_oauth_graph.py) | **（推奨）** Entra OAuth クライアントアプリを Microsoft Graph API 経由で作成。auth_helper.py のキャッシュ済み認証を利用するため追加のデバイスコード認証が不要（Step 3） |
| [scripts/setup_entra_oauth.ps1](scripts/setup_entra_oauth.ps1) | （代替）az CLI 経由で同等の処理。az login のデバイスコード認証が必要（Step 3） |
| [scripts/register_mcp_client.py](scripts/register_mcp_client.py) | Client ID を Dataverse 許可 MCP クライアント（`allowedmcpclients`）に登録・有効化・確認（Step 4） |
| [scripts/build_agent_package.ps1](scripts/build_agent_package.ps1) | `.env` の `COWORK_OAUTH_REGISTRATION_ID`（引用符付きでも可）を manifest.json のプレースホルダーに注入し、必須ファイルを検証して .zip を生成（Step 7） |

## ワークフロー（正常系）

### Step 0: ヒアリング（プラグイン構想の提案）

ユーザーが「プラグインを作りたい」「Cowork で〜したい」と相談してきたら、**いきなり実装に入らず**
まず構想を提案する。以下の流れで会話を始める。

1. **目的の確認**: 「Cowork 用のプラグインとして作りますか？ 例えば『〇〇業務を Cowork から
   Dataverse のデータで支援する』ような形を想定しています」と確認する。
2. **対象データの把握**: 連携する Dataverse 環境／テーブル（顧客・契約・実績など）をヒアリング。
   不明なら `describe` / `search` 系で既存テーブルを軽く調べて候補を出す。
3. **スキル案を5つ提案**: その業務ドメインで Cowork が役立つ**スキルを5つ程度**列挙する。
   各スキルは「名前（kebab-case）＋一言の用途＋トリガー語の例」をセットで示す。

   例（保守契約ドメインの場合）:
   | スキル名 | 用途 | トリガー語の例 |
   |---|---|---|
   | `annual-customer-review` | 年次レビュー資料作成 | 「年間レビュー資料を作って」 |
   | `contract-renewal-proposal` | 契約更新提案の下書き | 「更新提案をまとめて」 |
   | `incident-trend-report` | 障害傾向レポート | 「故障傾向を分析して」 |
   | `equipment-lifecycle-plan` | 機器更新計画 | 「更新計画を提案して」 |
   | `cost-optimization-summary` | コスト最適化提案 | 「コスト削減案を出して」 |

4. **プラグイン名を提案**: 5つのスキル群を束ねる**プラグイン名（短縮名 / 正式名）を 2〜3 案**提示する。
   個社名は避け、業務ドメインが伝わる名前にする（例: 「MFP 年間レビュー」「保守契約アシスタント」）。
5. **合意**: ユーザーが採用するスキル（1つでも複数でも可）とプラグイン名を選んだら、Step 1 以降に進む。

> 最初は **1スキル + Dataverse MCP コネクタ**の最小構成で公開・疎通確認し、動いたら
> 残りのスキルを追加する流れが安全（コネクタ認証の検証を先に済ませられる）。

### Step 1: 対象テーブルを `describe` でスキーマ確認（クエリを書く前に必須）

**スキル本文にクエリを書く前に、必ず `describe` で対象テーブルの実スキーマを確認する。**
テーブル名・列名・**ルックアップ（外部キー）列の正確な名前**を推測で書かない（推測は実行時の
`Read query Failed` の主因。特に FK 列は環境やクエリ方式で表記が異なる）。

1. 対象テーブルごとに `describe` を実行し、以下を確定する:
   - **テーブル名**（論理名 / コレクション名のどちらをクエリで使うか）
   - **列の論理名**（表示名ではなく論理名）
   - **ルックアップ列の表記**: `describe` の結果に出る実際の列名を使う。
     `read_query` のクエリ方式に合わせること（Web API/OData 形式の `_xxxid_value` と
     SQL/論理名 `xxxid` は別物。**describe が返す名前をそのまま使う**）。
   - **選択肢（Picklist）の値とラベル**の対応
2. 確認できたスキーマだけを使ってクエリを書く。describe に無い列・テーブルは使わない。
3. スキル本文の冒頭にも「Step 1: 対象テーブルを `describe` で確認してからクエリする」を入れ、
   **生成するスキル自身も実行時に describe で裏取りする**手順にする（下のテンプレート参照）。

> 確認結果は「対象データ（テーブル）」表に**論理名で**まとめる。表示名は補足に留める。

### Step 2: スキル（SKILL.md）を作る

`skills/<skill-name>/SKILL.md` を作成。**フォルダ名と frontmatter `name` を完全一致**させ、
`name` は kebab-case（小文字英数とハイフン、連続/先頭/末尾ハイフン禁止）。

```yaml
---
name: annual-customer-review
description: |
  <何をするスキルか>。Use when ユーザーが「<トリガー語1>」「<トリガー語2>」と依頼したとき。
  Dataverse MCP コネクタ（read_query / search_data / search / describe）を使用する。
license: MIT
metadata:
  author: <作者>
  version: "1.0"
---
```

本文は **ワークフロー**として書く（番号付き手順／使用ツール名を明示／出力フォーマットを定義）。
本文は約 1,500〜2,000 語以内。詳細は `references/` に逃がす（コンパニオンファイルは最大20・各5MB）。

> **生成するスキル本文の必須ルール**: ワークフローの最初の Step を
> 「対象テーブルを `describe` でスキーマ確認（列名・FK 列名を確定）」とする。
> クエリ例の列名は describe で確認済みのものだけを使い、未確認の列を推測で書かない。

### Step 3: Entra アプリ（OAuth クライアント）を作成・構成

Dataverse MCP は Microsoft ファーストパーティ API のため、トークンの **audience が Dataverse 自身**
（`https://<org>.crm.dynamics.com`）である必要がある。**SSO 方式は audience が「自前アプリ」になり失敗する**
（→ troubleshooting #14）。そのため **OAuth 2.0 認可コードフロー**を使い、Enterprise Token Store に
Dataverse 宛のトークンを直接取得させる。**クライアントシークレットが必要**。値は `.env` に保存する。

**再利用スクリプト（推奨）**: [scripts/setup_entra_oauth_graph.py](scripts/setup_entra_oauth_graph.py) が
Microsoft Graph API 経由でアプリ登録・`mcp.tools` 権限付与・シークレット作成・`.env` 書き込みを一括で行う。
**auth_helper.py のキャッシュ済み認証を利用**するため、az CLI の追加デバイスコード認証が不要。

```powershell
# auth_helper.py のキャッシュ済みトークンで Graph API を呼ぶ（追加認証なし）
python .github/skills/cowork/scripts/setup_entra_oauth_graph.py
# 例: python .github/skills/cowork/scripts/setup_entra_oauth_graph.py --display-name "MyApp-Cowork-OAuth" --secret-years 1
```

**代替（az CLI 版）**: [scripts/setup_entra_oauth.ps1](scripts/setup_entra_oauth.ps1)（`az login` のデバイスコード認証が必要）:

```powershell
./.github/skills/cowork/scripts/setup_entra_oauth.ps1 -DisplayName "Contoso-Cowork-OAuth"
```

az CLI で手動で行う場合の同等コマンド:

```powershell
$env:PATH = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;$env:PATH"
az login --use-device-code --tenant <TENANT_ID> --allow-no-subscriptions --only-show-errors

# 1. アプリ登録（リダイレクト URI は固定値2つ）
$appId = az ad app create --display-name "Cowork-DataverseMCP-OAuth" `
  --web-redirect-uris `
    "https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect" `
    "https://teams.microsoft.com/api/platform/v1.0/oAuthConsentRedirect" `
  --sign-in-audience AzureADMyOrg --query appId -o tsv

# 2. Dynamics CRM の委任権限 mcp.tools を付与（Dataverse MCP 専用スコープ）
az ad app permission add --id $appId `
  --api 00000007-0000-0000-c000-000000000000 `
  --api-permissions a4c5bee6-25ff-4bb5-b926-b7eb8062ae7a=Scope --only-show-errors

# 3. クライアントシークレットを作成（OAuth 認可コードフローに必須）→ .env に保存
$secret = az ad app credential reset --id $appId --display-name "cowork-oauth" `
  --years 2 --query password -o tsv
# .env の COWORK_OAUTH_CLIENT_ID / COWORK_OAUTH_CLIENT_SECRET に書き込む（Git にコミットしない）
(Get-Content .env) `
  -replace '^COWORK_OAUTH_CLIENT_ID=.*', "COWORK_OAUTH_CLIENT_ID=$appId" `
  -replace '^COWORK_OAUTH_CLIENT_SECRET=.*', "COWORK_OAUTH_CLIENT_SECRET=$secret" |
  Set-Content .env
```

> ポイント:
> - SSO と違い `Expose an API`（スコープ公開）も `preAuthorizedApplications` 事前承認も**不要**。
>   認可コードフローは Dynamics CRM の委任スコープ `mcp.tools` を直接同意するため。
> - API 権限は **`mcp.tools` のみ**でよい（`user_impersonation` は不要）。OAuth registration の scope を
>   `.default` にすることで、このアプリに静的設定された `mcp.tools` が要求される。
> - **シークレットは機密**。`.env` は `.gitignore` で除外する。スキルや manifest には絶対に書かない。

### Step 4: Entra Client ID を許可 MCP クライアントに登録（必須）

OAuth 認可コードフローでは Dataverse に提示されるトークンの **appid がこのカスタムアプリ**になる。
そのため、**Entra の Client ID を `allowedmcpclients` テーブルに登録・有効化**しないと、認証は通っても
データ取得時に失敗する（ブログでも「抜けると plugin は正常に見えても Dataverse 利用時に失敗」と強調）。

**再利用スクリプト（推奨）**: [scripts/register_mcp_client.py](scripts/register_mcp_client.py)（汎用・どのテナントでも可）。

```powershell
# .env の COWORK_OAUTH_CLIENT_ID を登録（未登録なら作成、既存なら有効化）
python .github/skills/cowork/scripts/register_mcp_client.py

# 状態確認のみ（副作用なし）
python .github/skills/cowork/scripts/register_mcp_client.py --check
# 一覧
python .github/skills/cowork/scripts/register_mcp_client.py --list
# app id を明示
python .github/skills/cowork/scripts/register_mcp_client.py --app-id <CLIENT_ID> --name "Cowork Dataverse MCP"
```

> uniquename 未指定時は `<PUBLISHER_PREFIX>_<name のスラッグ>` で生成される。
> GUI なら Power Platform 管理センター → 環境 → 設定 → 機能 →
> Dataverse MCP の詳細設定（`etn=allowedmcpclient`）で +New。

### Step 5: Teams 開発者ポータルで OAuth client 登録 → registrationId 取得（ブラウザ）

[dev.teams.microsoft.com/tools](https://dev.teams.microsoft.com/tools) → Tools →
**OAuth client registration** → New（**SSO client registration ではない**）。

| フィールド | 値 |
|---|---|
| Registration name | `Dataverse MCP OAuth (<org>)` |
| Base URL | `https://<org>.crm.dynamics.com`（**`/api/mcp` は付けない**。MCP URL は manifest 側に書く） |
| Client ID | `.env` の `COWORK_OAUTH_CLIENT_ID` |
| Client secret | `.env` の `COWORK_OAUTH_CLIENT_SECRET`（**画面に直接貼る／質問ツール禁止**） |
| Authorization endpoint | `https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/authorize` |
| Token endpoint | `https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token` |
| Refresh endpoint | `https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/token` |
| Scope | `https://<org>.crm.dynamics.com/.default,offline_access`（**カンマ区切り**。UI のヘルプ文言が
  「separated by a comma」のため半角スペース区切りでは受け付けない環境がある。`.default` で静的権限＝
  `mcp.tools`、`offline_access` でリフレッシュトークン） |
| Enable PKCE | 有効（推奨） |
| Restrict usage by org | `My organization only`（単一テナント）／`Any Microsoft 365 Organization`（複数テナント配布時） |
| Restrict usage by app | `Any Teams app`（**ストア検証が通るまではこちら**。公開・疎通確認後に Existing Teams app へ切替可） |

Save すると **OAuth client registration ID** が発行される。これを `.env` の
`COWORK_OAUTH_REGISTRATION_ID` に保存する。

> **referenceId の値**: OAuth 方式では発行された **registration ID をそのまま** `referenceId` に使う
> （SSO 方式のような `Base64("<tenantId>##<regId>")` 変換は不要）。


### Step 6: manifest.json を作成

```jsonc
{
  "$schema": "https://developer.microsoft.com/json-schemas/teams/v1.28/MicrosoftTeams.schema.json",
  "manifestVersion": "1.28",
  "version": "1.0.0",
  "id": "<決定的GUID: uuid5 から生成>",
  "developer": { "name": "...", "websiteUrl": "...", "privacyUrl": "...", "termsOfUseUrl": "..." },
  "name": { "short": "...", "full": "..." },
  "description": { "short": "...", "full": "..." },
  "icons": { "color": "color.png", "outline": "outline.png" },
  "accentColor": "#D5001C",
  "agentSkills": [ { "folder": "./skills/<skill-name>" } ],
  "agentConnectors": [
    {
      "id": "dataverse-mcp",
      "displayName": "Dataverse MCP",
      "description": "Dataverse のテーブル/レコードへ MCP 経由でアクセス。",
      "toolSource": {
        "remoteMcpServer": {
          "mcpServerUrl": "https://<org>.crm.dynamics.com/api/mcp",
          "mcpToolDescription": { "file": "dataverse-mcp-tools.json" },
          "authorization": {
            "type": "OAuthPluginVault",
            "referenceId": "__COWORK_OAUTH_REGISTRATION_ID__"
          }
        }
      }
    }
  ]
}
```

- **`referenceId` はプレースホルダー `__COWORK_OAUTH_REGISTRATION_ID__` のまま source に残す**（Step 5 の
  実 registration ID を直接コミットしない）。実値は `.env` の `COWORK_OAUTH_REGISTRATION_ID` に置き、
  Step 7 のビルドスクリプトが zip 生成時に注入する。
- `id` は `python -c "import uuid; print(uuid.uuid5(uuid.NAMESPACE_URL, '<安定URL>'))"` で決定的に生成。
- **`mcpToolDescription` は必須**（公式 docs の例は省略しているが、M365 管理センターのアップロード検証が必須化）。
  値は **オブジェクト `{ "file": "<相対パス>" }`**（文字列不可）。参照先ファイルは **JSON 形式の tools 定義**でなければ
  `is invalid or not found in manifest package` になる（`.md` は invalid）。

  `dataverse-mcp-tools.json`（パッケージルートに配置）:
  ```json
  {
    "tools": [
      { "name": "read_query", "description": "FetchXML クエリでレコード取得。",
        "annotations": { "readOnlyHint": true, "title": "Read Query" } },
      { "name": "search_data", "description": "テーブル内を条件検索。",
        "annotations": { "readOnlyHint": true, "title": "Search Data" } },
      { "name": "search", "description": "Dataverse 全体を横断検索。",
        "annotations": { "readOnlyHint": true, "title": "Search" } },
      { "name": "describe", "description": "テーブル/列のメタデータを取得。",
        "annotations": { "readOnlyHint": true, "title": "Describe" } }
    ]
  }
  ```

  > **ツール名は Dataverse MCP 側の変更に追従させる**（廃止された `describe_table`/`list_tables`/`fetch` や
  > 旧 `search`（データ検索の意味）をそのまま書かない。現在の正しいツール名一覧は
  > [standard/references/dataverse-mcp-setup.md](../standard/references/dataverse-mcp-setup.md#主な-mcpツール) を参照）。
  > 古いツール名のまま公開すると、Cowork 側で該当ツールが認識されずスキルが動作しない（→ troubleshooting #15）。
- **アイコンはドメイン文脈を読んでから設計する**（→ [standard/references/icon-creation.md](../standard/references/icon-creation.md)
  の「アイコン画像提案フロー」）。`generate_icon_png.py` の汎用スパークルをそのまま登録しない。
  この manifest の `name`/`description`（プラグインの業務目的）と `accentColor` からモチーフ・配色を決め、
  プラグイン専用の `draw_<theme>_icon()` を実装してから `color.png`（192×192）/ `outline.png`（32×32,
  白い透明背景）を生成する。

### Step 7: パッケージ（.zip）をビルド

**manifest.json をルートに**置いて圧縮する（フォルダごと圧縮しない）。ツール説明 JSON も含める。
**`.env` から `COWORK_OAUTH_REGISTRATION_ID` を読み `__COWORK_OAUTH_REGISTRATION_ID__` に注入**してから zip 化する
（手作業で referenceId を manifest に直接埋めない＝取り違え・コミット事故を防ぐ）。

**再利用スクリプト（推奨）**: [scripts/build_agent_package.ps1](scripts/build_agent_package.ps1)。
`.env` の値が `'...'`／`"..."` で囲まれていても**引用符を自動で取り除いて**から注入する
（引用符付きのまま注入すると `referenceId` が壊れ、Cowork 初回同意時にコネクタ認証が失敗する）。

```powershell
pwsh .github/skills/cowork/scripts/build_agent_package.ps1 -PluginRoot <plugin-root> -OutputName <name>
```

手動で行う場合の同等コマンド（quote-stripping を忘れないこと）:

```powershell
$regId = (Get-Content .env | Select-String '^COWORK_OAUTH_REGISTRATION_ID=').ToString().Split('=',2)[1].Trim("'", '"')
(Get-Content manifest.json -Raw) -replace '__COWORK_OAUTH_REGISTRATION_ID__', $regId | Set-Content manifest.built.json
Compress-Archive -Path manifest.built.json, color.png, outline.png, dataverse-mcp-tools.json, skills `
  -DestinationPath dist/<name>.zip -Force
```

ZIP 検証: ルートに `manifest.json`（build 後、プレースホルダーが実 ID に置換済み）/ `dataverse-mcp-tools.json`、
`skills/<skill-name>/SKILL.md` が含まれること。

### Step 8: アップロード（M365 管理センター → エージェント画面）

> ⚠️ Cowork プラグインは**「統合アプリ」ではなく、新しい「エージェント」画面**からアップロードする（UI 変更済み）。

> **ブラウザ自動化で実施する場合の既知の落とし穴**（詳細は troubleshooting #17-19）。事前に把握してから進めると手戻りがない。
> ブラウザ操作は **VS Code 統合 Playwright ブラウザ**（`playwright-browser_navigate` / `playwright-browser_click` / `playwright-browser_handle_dialog` 等）を使う
> （Playwright MCP サーバー・Playwright 単体ブラウザは使わない → [ブラウザ自動化方針](../standard/references/browser-automation.md)）。
> 1. Teams 開発者ポータル → 管理センターへの遷移で **SSO 自動サインインが「Trying to sign you in」で止まる**ことがある。数秒進まなければアカウントピッカーを探してクリックする。
> 2. **「Choose file」は OS ネイティブのファイル選択ダイアログ**を開くため、通常の `playwright-browser_click` では選択できない。
>    クリック後に **`playwright-browser_handle_dialog`** の `paths` にローカルの `.zip` の絶対パスを渡す。
> 3. **Publish to users / Install のラジオボタン**は `<label>` が pointer-events を奪っていることがあり、`input` への直接クリックはタイムアウトする。`label[for=<id>]` をクリックする。

1. [Microsoft 365 管理センター](https://admin.cloud.microsoft/) → 左ナビ **エージェント（Agents）** (`#/agents/all`)
2. **Registry** タブ → ツールバー右の **More actions（…、Export の隣）** → **Add agent** → **Upload agent** ウィザード起動
3. **Upload**: `<name>.zip` を選択→manifest 検証が走る（エラーが出たら troubleshooting 参照）
4. **Publish to users**: 公開対象（All users / 特定ユーザー）と Install（None 推奨）を選択
5. **Apply template**（Default で Next）→ **Accept permissions**（権限不要なら「No required permissions」）→ **Review & finish** → **Publish**
6. 「You uploaded <name>」表示で完了 → **Close**。詳細パネルの Status が **Available** になる
7. **Cowork → Sources & Skills** にスキル＋Dataverse MCP コネクタが表示されることを確認

> アップロード検証でエラーバーが出たら、同じファイルを再選択しても再検証されない。
> エラーバーを閉じてから zip を選び直すこと。

### Step 9: Cowork で利用・初回同意

1. Cowork でスキルのトリガー語（例: 「年間レビュー資料を作って」）を入力
2. 初回は Dataverse MCP コネクタの **OAuth 同意**が走る（Enterprise Token Store 経由）
3. 同意後、`read_query` 等が実行されデータ取得 → 資料生成

### Step 10: プラグインの更新（再公開）

スキル本文・manifest・アイコン等を変更したら、**同じ `id` のまま再公開**する。
更新も新規と同じ **Add agent → Upload agent ウィザード**を使う（専用の更新メニューはない）。

1. manifest.json の **`version` をインクリメント**（例: `1.0.2` → `1.0.3`）。`id` は変更しない。
2. zip を再ビルド（Step 7 と同じ。`dataverse-mcp-tools.json` も忘れず含める）。
3. 管理センター → **エージェント（Agents）** (`#/agents/all`) → **Registry** タブ →
   ツールバー右の **More actions（…、Export の隣）** → **Add agent**。
4. **Upload agent** で新しい zip を選択 → 検証が再実行される（`id` が一致するため更新として処理される）。
5. **Publish to users**（公開対象と Install を選択。**更新時も再選択が必要**） →
   **Apply template**（Default で Next）→ **Accept permissions** → **Review & finish** → **Publish**。
6. 「**You uploaded \<name\>**」表示で完了 → **Close**。

> 注意:
> - `id` を変えると別エージェント扱いになり、既存の公開設定・同意が引き継がれない。
> - 詳細パネルの Version / 説明文表示はテナント側キャッシュで反映が数分遅れることがある。
> - **公開対象（All users / Install None 等）はウィザードで毎回選択**する（前回設定は自動継承されない）。

## 検証チェックリスト

- [ ] `check_mcp_client.py cowork` が ✅
- [ ] **対象テーブルを `describe` で確認**し、テーブル名・列名・**FK 列名**を確定（推測でクエリを書かない）
- [ ] 生成したスキル本文の最初の Step が「`describe` でスキーマ確認」になっている
- [ ] フォルダ名 = SKILL.md `name`（kebab-case）
- [ ] Entra: redirect URI×2 / Dynamics CRM **mcp.tools** / クライアントシークレット（.env）— `scripts/setup_entra_oauth.ps1`
- [ ] Power Platform: Entra の **Client ID** を許可された MCP クライアントとして登録・有効化— `scripts/register_mcp_client.py`（`--check` で検証）
- [ ] Teams ポータル **OAuth client registration**（SSO ではない）: Base URL は `/api/mcp` なし、scope は `.default offline_access`、Restrict by app = Any Teams app → registrationId を manifest に反映
- [ ] manifest に `mcpToolDescription: { file: "dataverse-mcp-tools.json" }`（JSONツール定義）
- [ ] ZIP ルートに manifest.json / dataverse-mcp-tools.json、skills/<name>/SKILL.md
- [ ] 管理センターの**エージェント画面**からアップロード→Publish→Status=Available
- [ ] Cowork に表示 → 初回同意 → データ取得成功
- [ ] 更新時: version をインクリメント（id 据え置き）→ More actions → Update in store → Publish

## 参考リンク

- [Build plugins for Cowork (Frontier)](https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-plugin-development)
- [Configure authentication for MCP and API plugins](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication)
- [Dataverse MCP 登録](../standard/references/dataverse-mcp-setup.md)
