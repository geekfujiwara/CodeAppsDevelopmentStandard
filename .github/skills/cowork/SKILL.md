---
name: cowork
description: "目的特化型の Copilot Cowork プラグイン（M365 アプリパッケージ）を開発する。Agent Skills（SKILL.md）と Dataverse MCP コネクタをセットにし、Entra ID SSO 認証を構成して Teams 開発者ポータルで referenceId を取得、M365 管理センターのエージェント画面からアップロード・公開して Cowork から Dataverse を利用可能にする。"
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
ビジネススキル（`SKILL.md`）と **Dataverse MCP コネクタ**をセットにし、**Entra ID SSO 認証**で
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
3. ツール: Azure CLI（`az`）、PowerShell、Python（アイコン生成）。

## ワークフロー（正常系）

### Step 1: スキル（SKILL.md）を作る

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

### Step 2: Entra アプリ（SSO クライアント）を作成・構成

Dataverse は Microsoft ファーストパーティ API のため、**Entra ID SSO 方式**を使う（シークレット不要）。
Azure CLI で自動化する。

```powershell
$env:PATH = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin;$env:PATH"
az login --use-device-code --tenant <TENANT_ID> --allow-no-subscriptions --only-show-errors

# 1. アプリ登録（リダイレクト URI は固定値2つ）
$appId = az ad app create --display-name "Cowork-DataverseMCP-OAuth" `
  --web-redirect-uris `
    "https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect" `
    "https://teams.microsoft.com/api/platform/v1.0/oAuthConsentRedirect" `
  --sign-in-audience AzureADMyOrg --query appId -o tsv

# 2. Application ID URI を設定
az ad app update --id $appId --identifier-uris "api://$appId" --only-show-errors

# 3. Dynamics CRM の委任権限 user_impersonation を付与
az ad app permission add --id $appId `
  --api 00000007-0000-0000-c000-000000000000 `
  --api-permissions 78ce3f0f-a1ce-49c2-8cde-64b5c0896db4=Scope --only-show-errors

# 4. スコープ access_as_user を公開（Graph PATCH。ボディは api でラップ）
$objId = az ad app show --id $appId --query id -o tsv
$scopeId = [guid]::NewGuid().ToString()
$scope = @{ api = @{ oauth2PermissionScopes = @(@{
  adminConsentDescription="Allow Cowork to access Dataverse MCP as the user.";
  adminConsentDisplayName="Access Dataverse MCP"; id=$scopeId; isEnabled=$true;
  type="User"; userConsentDescription="Allow Cowork to access Dataverse MCP as you.";
  userConsentDisplayName="Access Dataverse MCP"; value="access_as_user" }) } } | ConvertTo-Json -Depth 6
$scope | Out-File "$env:TEMP\scope.json" -Encoding utf8
az rest --method PATCH --uri "https://graph.microsoft.com/v1.0/applications/$objId" `
  --headers "Content-Type=application/json" --body "@$env:TEMP\scope.json" --only-show-errors

# 5. Enterprise Token Store を事前承認（スコープ公開後に別 PATCH で実行）
$pre = @{ api = @{ preAuthorizedApplications = @(@{
  appId="ab3be6b7-f5df-413d-ac2d-abf1e3fd9c0b"; delegatedPermissionIds=@($scopeId) }) } } | ConvertTo-Json -Depth 6
$pre | Out-File "$env:TEMP\preauth.json" -Encoding utf8
az rest --method PATCH --uri "https://graph.microsoft.com/v1.0/applications/$objId" `
  --headers "Content-Type=application/json" --body "@$env:TEMP\preauth.json" --only-show-errors
```

> ポイント: スコープ公開（手順4）と事前承認（手順5）は**別 PATCH に分ける**。同一ボディに含めると
> `delegatedPermissionIds has a Permission Id that cannot be found` で失敗する（→ troubleshooting）。
> `oauth2PermissionScopes` は必ず `api` プロパティでラップする。

### Step 3: Teams 開発者ポータルで SSO 登録 → referenceId 取得（ブラウザ）

[dev.teams.microsoft.com/tools](https://dev.teams.microsoft.com/tools) → Tools →
**Microsoft Entra SSO client ID registration** → New。

| フィールド | 値 |
|---|---|
| Registration name | `Dataverse MCP (<org>)` |
| Base URL | `https://<org>.crm.dynamics.com/api/mcp` |
| Restrict usage by org | `Any Microsoft 365 Organization`（複数テナント配布時） |
| Restrict usage by app | `Any Teams app`（公開前は未確定でよい） |
| Client ID | Step 2 の `$appId` |

Save すると **SSO registration ID** が発行される。

> **referenceId の形式**: manifest に書く値は `Base64( "<tenantId>##<registrationId>" )`。
> 例: `f092b281-...##dc97a18b-...` を base64 化した文字列をそのまま `referenceId` に入れる。
> ```powershell
> [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("<tenantId>##<registrationId>"))
> ```
> ポータルが既に base64 形式の ID を提示する場合はそれをそのまま使う。

### Step 4: manifest.json を作成

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
            "referenceId": "<Step 3 の SSO registration ID>"
          }
        }
      }
    }
  ]
}
```

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
- アイコンは `generate_icon_png.py`（standard/scripts）の `draw_agent_icon(192...)` / `draw_agent_icon(32, transparent_bg=True, outline_only=True)` で生成可。

### Step 5: パッケージ（.zip）をビルド

**manifest.json をルートに**置いて圧縮する（フォルダごと圧縮しない）。ツール説明 JSON も含める。

```powershell
Compress-Archive -Path manifest.json, color.png, outline.png, dataverse-mcp-tools.json, skills `
  -DestinationPath dist/<name>.zip -Force
```

ZIP 検証: ルートに `manifest.json` / `dataverse-mcp-tools.json`、`skills/<skill-name>/SKILL.md` が含まれること。

### Step 6: アップロード（M365 管理センター → エージェント画面）

> ⚠️ Cowork プラグインは**「統合アプリ」ではなく、新しい「エージェント」画面**からアップロードする（UI 変更済み）。

1. [Microsoft 365 管理センター](https://admin.cloud.microsoft/) → 左ナビ **エージェント（Agents）** (`#/agents/all`)
2. **Registry** タブ → ツールバー **More actions** → **Add agent** → **Upload agent** ウィザード起動
3. **Upload**: `<name>.zip` を選択→manifest 検証が走る（エラーが出たら troubleshooting 参照）
4. **Publish to users**: 公開対象（All users / 特定ユーザー）と事前インストール（None 推奨）を選択
5. **Apply template**（既定ポリシーで Next）→ **Accept permissions** → **Review & finish** → **Publish**
6. 「You uploaded <name>」表示で完了。詳細パネルの Status が **Available** になる
7. **Cowork → Sources & Skills** にスキル＋Dataverse MCP コネクタが表示されることを確認

> アップロード検証でエラーバーが出たら、同じファイルを再選択しても再検証されない。
> エラーバーを閉じてから zip を選び直すこと。

### Step 7: Cowork で利用・初回同意

1. Cowork でスキルのトリガー語（例: 「年間レビュー資料を作って」）を入力
2. 初回は Dataverse MCP コネクタの **OAuth 同意**が走る（Enterprise Token Store 経由）
3. 同意後、`read_query` 等が実行されデータ取得 → 資料生成

### Step 8: プラグインの更新（再公開）

スキル本文・manifest・アイコン等を変更したら、**同じ `id` のまま再公開**する。

1. manifest.json の **`version` をインクリメント**（例: `1.0.0` → `1.0.1`）。`id` は変更しない。
2. zip を再ビルド（Step 5 と同じ。`dataverse-mcp-tools.json` も忘れず含める）。
3. 管理センター → **エージェント（Agents）** → 対象エージェントを開く →
   **More actions** → **Update in store**。
4. **Update agent** ウィザードで新しい zip をアップロード（検証が再実行される）。
5. **Accept permissions** → **Review & finish** → **Publish**。
   「<name> was updated successfully」で完了。

> 注意:
> - `id` を変えると別エージェント扱いになり、既存の公開設定・同意が引き継がれない。
> - 詳細パネルの Version / 説明文表示はテナント側キャッシュで反映が数分遅れることがある。
> - 公開対象（All users 等）は更新時に再選択不要（前回設定を継承）。

## 検証チェックリスト

- [ ] `check_mcp_client.py cowork` が ✅
- [ ] フォルダ名 = SKILL.md `name`（kebab-case）
- [ ] Entra: identifierUri / redirect URI×2 / access_as_user / Enterprise Token Store 事前承認
- [ ] Teams ポータルで referenceId 発行済み → manifest に反映
- [ ] manifest に `mcpToolDescription: { file: "dataverse-mcp-tools.json" }`（JSONツール定義）
- [ ] ZIP ルートに manifest.json / dataverse-mcp-tools.json、skills/<name>/SKILL.md
- [ ] 管理センターの**エージェント画面**からアップロード→Publish→Status=Available
- [ ] Cowork に表示 → 初回同意 → データ取得成功
- [ ] 更新時: version をインクリメント（id 据え置き）→ More actions → Update in store → Publish

## 参考リンク

- [Build plugins for Cowork (Frontier)](https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-plugin-development)
- [Configure authentication for MCP and API plugins](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication)
- [Dataverse MCP 登録](../standard/references/dataverse-mcp-setup.md)
