# Edit details（Teams + M365 チャネル メタデータ）の設定（API）

公開ダイアログ「**Teams + Microsoft 365 ＞ Edit details**」の保存先は **Dataverse ではなく**、
その環境の **PVA(Power Virtual Agents) bot management ゲートウェイ**である（実機の保存トレースで確定）。
スクリプトは [scripts/set_app_details.py](../scripts/set_app_details.py)。

> 旧版は `bots.applicationmanifestinformation` を PATCH していたが、新 UI はそこを読まない。
> アイコンを含む Edit details は下記ゲートウェイ API が唯一の正。

## エンドポイント

```
GET  {gw}/api/botmanagement/v1/channels/msteams/app
PUT  {gw}/api/botmanagement/v1/channels/msteams/app/save
        ?isCopilotExtensionEnabled={M365有効}&isConsentProvidedToChangeACPToAny=true
```

- `{gw}` … その環境の PVA ゲートウェイ
  （例: `https://powervamg.us-il102.gateway.prod.island.powerapps.com`）。
- **トークン audience**: `96ff4394-9197-43aa-b393-6a41652e21f8`
  （`auth_helper.get_token("96ff4394-9197-43aa-b393-6a41652e21f8/.default")`）。
- **GET は公開済み状態、PUT(save) はドラフトに保存**する。GET 直後は値が反映されないことがあるが、
  PUT が 200 で保存後ペイロードをエコーすれば成功。`publish_agent.py`（PvaPublish）で確定する。
  → UI の「**Save and publish**」と同じ流れ。

### ゲートウェイ URL / BAP 環境 ID の自動取得（ハードコード禁止）

BAP 環境 API から、Dataverse org の `instanceUrl` 一致で当該環境を特定して取得する:

```
GET https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform
      /scopes/admin/environments?api-version=2021-04-01&$expand=properties
```

- `runtimeEndpoints["microsoft.PowerVirtualAgents"]` … ゲートウェイ base URL（`{gw}`）
- `name` … BAP 環境 ID（`x-cci-bapenvironmentid` に使う）

`.env` の `PVA_GATEWAY_BASE` / `BAP_ENVIRONMENT_ID` を指定すれば自動取得をスキップできる。

### 必須ヘッダー

| ヘッダー | 値 |
|---|---|
| `Authorization` | `Bearer <PVA トークン>` |
| `Content-Type` | `application/json` |
| `x-cci-applicationsource` | `Web` |
| `x-cci-bapenvironmentid` | BAP 環境 ID |
| `x-cci-cdsbotid` | 対象 bot の botid（Dataverse） |
| `x-cci-tenantid` / `x-cci-routing-tenantid` | テナント ID（トークン claims `tid`） |
| `x-cci-routing-userid` | ユーザー oid（トークン claims `oid`） |

## UI 項目 → ペイロード キーの対応

| UI（Edit details / チャネル トグル） | ペイロード キー | 型・備考 |
|---|---|---|
| Short description *（80字） | `shortDescription` | 文字列。M365 公開の必須項目 |
| Long description（3400字） | `longDescription` | 文字列 |
| Show an agent disclaimer in M365 Copilot | `disclaimer` | 文字列（空可） |
| Developer name | `developerName` | 文字列 |
| Website | `websiteLink` | URL |
| Terms of use | `termsLink` | URL |
| Privacy statement | `privacyLink` | URL |
| Microsoft Partner Network ID | `microsoftPartnerNetworkId` | 文字列（空可） |
| Discoverable in Power Platform store | `isPowerPlatformStoreDiscoverable` | bool |
| Users can add this agent to a team | `scopes` に `team` | 配列 |
| Use this agent for group and meeting chats | `scopes` に `groupchat` | 配列 |
| （個人チャット・常時） | `scopes` に `personal` | 配列 |
| （team/groupchat いずれか有効時） | `teamsCollaborationEnabled` | bool（scopes から導出） |
| Supports calling | `supportsCalling` / `isTeamsIvrEnabled` | bool |
| Teams Resource Account ID | `teamsRaId` | 文字列（calling 用 / 任意） |
| SSO Application (client) ID | `singleSignOnAadApplicationClientId` | GUID（既定 `00000000-...`） |
| SSO Resource URI | `singleSignOnResourceUri` | URL（任意 / null 可） |
| アイコン | `colorIcon`(192) / `outlineIcon`(32) / `accentColor` | base64 PNG / HEX |
| Make agent available in M365 Copilot | save の `isCopilotExtensionEnabled` クエリ | true/false |

`scopes` の例: `["personal", "team", "groupchat"]`（個人＋チーム追加＋グループ/会議チャット）。

### ★アイコンは null 不可

save は `colorIcon` と `outlineIcon` が **両方とも null 不可**（`OutlineIcon cannot be null.` 400）。
`set_app_details.py` は次の優先順でアイコンを供給する:

1. Dataverse の `applicationmanifestinformation.teams.colorIcon/outlineIcon`（`set_icon.py` の生成物）
2. ゲートウェイ現在値（GET 結果）
3. `set_icon.py` の描画ロジックでその場生成（`colorIcon`=192、`outlineIcon`=32 白・透明背景）

アイコン要件: **PNG・100KB 未満・白の透明画像**（outline）。機密情報を埋め込まない。

## 設定方法（GET → マージ → PUT save）

ゲートウェイ現在値を GET し、`.env` / アイコン / デフォルトを上書きマージして PUT save する
（既存値を壊さない）。`set_app_details.py` が自動で行う。

```python
current = GET(.../channels/msteams/app)         # 公開済み（多くは null）
payload = merge(current, env_overrides, icons, defaults)
PUT(.../channels/msteams/app/save?isCopilotExtensionEnabled=true&isConsentProvidedToChangeACPToAny=true, payload)
# → 200 + 保存後ペイロードのエコー。publish_agent.py(PvaPublish) で確定。
```

## デフォルト補完の方針

`set_app_details.py` は未指定項目を妥当な既定で自動補完する（`.env` で上書き可）:

- `shortDescription` … `APP_SHORT_DESCRIPTION` 未指定なら Instructions の1文目、無ければ `<名前> エージェント`。
- `longDescription` … 未指定なら shortDescription を流用。
- `disclaimer` … 未指定なら空文字。
- `developerName` … 未指定なら `DEVELOPER_NAME` か `Copilot Studio Maker`。
- `websiteLink` / `termsLink` / `privacyLink` … 未指定なら Copilot Studio 標準の fwlink:
  - website: `https://go.microsoft.com/fwlink/?linkid=2138949`
  - terms: `https://go.microsoft.com/fwlink/?linkid=2138865`
  - privacy: `https://go.microsoft.com/fwlink/?linkid=2138950`
- `isPowerPlatformStoreDiscoverable` … 未指定なら `false`。
- `scopes` … 未指定なら `["personal"]`。
- `supportsCalling` … 未指定なら `false`。
- `singleSignOnAadApplicationClientId` … 未指定なら `00000000-0000-0000-0000-000000000000`。
- アイコン … 未指定・未生成なら `set_icon.py` のロジックでその場生成。

**未設定時に確認させたい場合**は `--require-confirm`（または `APP_DETAILS_REQUIRE_CONFIRM=true`）。
自動補完が1つでも発生したら停止し、`.env` への明示設定を促す。`--dry-run` で PUT せずプレビュー。
これにより「わからない項目はユーザーに確認してから公開」を実現する。
