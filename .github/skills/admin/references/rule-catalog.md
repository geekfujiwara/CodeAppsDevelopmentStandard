# 環境グループのルール カタログ（非公開 API）

Power Platform 管理センターの「環境グループ > ルール」は公開 API に無い。管理センターが使う
**テナント専用ホスト**の governance API を直接叩く。`set_environment_group_rules.py` がこれを実装している。

## ベース URL とトークン

```text
tenantId  = <TENANT_ID>
compact   = tenantId.replace("-", "")
host      = https://{compact[:30]}.{compact[30:]}.tenant.api.powerplatform.com
```

ハイフンを除いた 32 文字を 30 文字 + 2 文字に割ってサブドメインにする。

- 認証: `auth_helper` の既存トークン（スコープ `https://api.powerplatform.com/.default`）でそのまま通る
- API バージョン: `api-version=2021-10-01-preview`

## ルールは 2 系統ある

| 系統 | 保存先 | 対象ルール |
| --- | --- | --- |
| クラシック ルール | `ruleSets`（`parameters` 配列） | 共有 / ソリューション チェッカー / バックアップ保持 / 使用状況分析 / 生成 AI 設定 |
| ポリシー ルール | `ruleBasedPolicies`（`ruleSets` 配列 + `inputs`） | コネクタ / ACP 専用モード / アンマネージド禁止 / Code Apps / クレジット プール / ウェルカム コンテンツ / リリース チャネル |

同じ画面に並んで見えるが保存先も API も別なので、両方を扱う必要がある。

## 読み取り

| 用途 | 呼び出し |
| --- | --- |
| グループのクラシック ルール | `GET {host}/governance/environmentGroups/{groupId}/ruleSets` |
| グループのポリシー ルール | `GET {host}/governance/environmentGroups/{groupId}/ruleBasedPolicies?includeCustomerContent=true` |
| ポリシー単体（ウェルカム本文を含む） | `GET {host}/governance/ruleBasedPolicies/{policyId}?includeCustomerContent=true` |
| テナント全体の ruleSets | `GET {host}/governance/ruleSets` |
| ルールの UI 定義（既定値・型） | `GET {host}/governance/ruleSetUIConfigurations` |
| 環境ルーティング ポリシー | `GET {host}/governance/tenantRuleBasedPolicies` |

`includeCustomerContent=true` を付けないと、ウェルカム コンテンツの本文が空で返る。

## 書き込み

| 用途 | 呼び出し | ボディ |
| --- | --- | --- |
| クラシック ルールを初回追加 | `POST {host}/governance/environmentGroups/{groupId}/ruleSets` | `{"parameters":[{...,"hasStagedChanges":true}]}` |
| クラシック ルールを更新 | `PUT {host}/governance/ruleSets/{ruleSetId}` | `{"id":...,"parameters":[...],"environmentFilter":null,"lastModified":null}` |
| ポリシーを新規作成 | `POST {host}/governance/ruleBasedPolicies` | `{"name":"Default Policy Name","ruleSets":[...]}` |
| ポリシーを更新 | `PATCH {host}/governance/ruleBasedPolicies/{policyId}` | `{"id":...,"name":...,"ruleSets":[...]}` |
| ポリシーをグループへ割り当て | `POST {host}/governance/ruleBasedPolicies/{policyId}/environmentGroups/{groupId}/assignments` | `{}` |

`PUT`／`PATCH` はいずれも**全置換**なので、GET した内容を編集して送り返す。

### 型の落とし穴

GET は Boolean も整数も**文字列**で返す（`"False"` / `"1"`）が、`PATCH` は JSON の型どおりでないと
400 `InputValidationError: Expected Boolean but got String` になる。送信前に型を戻すこと
（`set_environment_group_rules.py` の `_coerce()`）。`MakerOnboardingContent` の値は常に文字列。

## クラシック ルールのパラメータ

書式は `type` / `resourceType` / `value[].id`。スクリプトでは `Type[/ResourceType]/Id=value` で指定する。

| type | resourceType | id | 値 |
| --- | --- | --- | --- |
| `Sharing` | `App` / `Flow` / `AuthoringBot` / `UsersBot` | `MaximumShareLimit` | `-1`（無制限）または人数 |
| `Sharing` | 同上 | `CanShareWithSecurityGroups` | `noLimit` / `noSecurityGroup` |
| `Sharing` | `App` | `IsGroupSharingDisabled` | `true` / `false` |
| `SolutionChecker` | `NotSpecified` | `solutionCheckerMode` | `none` / `warn` / `block` |
| `SolutionChecker` | `NotSpecified` | `suppressValidationEmails` | `true` / `false` |
| `SolutionChecker` | `NotSpecified` | `solutionCheckerRuleOverrides` | ルール ID のカンマ区切り |
| `Lifecycle` | `NotSpecified` | `RetentionPeriod` | `7.00:00:00` / `14.00:00:00` / `21.00:00:00` / `28.00:00:00` |
| `AdminDigest` | `NotSpecified` | `IncludeOnHomePageInsights` | `true` / `false` |
| `AdminDigest` | `NotSpecified` | `ExcludeEnvironmentFromAnalysis` | `true` / `false` |
| `GenerativeAISettings` | `NotSpecified` | `crossGeoCopilotDataMovementEnabled` | `true` / `false` |
| `GenerativeAISettings` | `NotSpecified` | `bingChatEnabled` | `true` / `false` |
| `Copilot` | `App` | `DisableAiGeneratedDescriptions` | `true` / `false` |
| `MakerOnboarding` | `NotSpecified` | `MakerContentRuleBasedPolicy` | ポリシー参照（管理センターが自動設定） |

## ポリシー ルールの inputs

書式は `RuleSetId/InputKey=value`。

| ruleSetId | inputs | 型 | 用途 |
| --- | --- | --- | --- |
| `ConnectorManagement` | `AllowedConnectorList` | 配列 | ACP の許可コネクタ。空配列で全ブロック |
| `AdvancedConnectorPoliciesOnly` | `EnableAdvancedConnectorPoliciesOnly` | Boolean | ACP 専用モード（クラシック DLP を評価しない） |
| `BlockUnmanagedCustomization` | `IsLockdownOfUnmanagedCustomizationEnabled` | Boolean | アンマネージド カスタマイズを禁止 |
| `CodeAppsFeature` | `PowerApps_AllowCodeApps` | Boolean | Power Apps code apps の可否 |
| `CostControlsDrawFromTenantCreditPool` | `DrawFromTenantCreditPool` | Boolean | テナント クレジット プールからの消費可否 |
| `ReleaseChannel` | `ReleaseChannel` | 整数 | 1=セミアニュアル / 2=マンスリー |
| `MakerOnboardingContent` | `makerOnboardingMarkdown` / `makerOnboardingUrl` / `makerOnboardingTimestamp` / `makerOnboardingPortals` | 文字列 | メーカー ウェルカム コンテンツ |
| `CopilotStudioCodeInterpreter` | `CopilotStudio_CodeInterpreter` | Boolean | コード インタープリター |
| `CopilotComputerUse` | `CopilotStudio_ComputerUseEnabled` | Boolean | Computer Use |
| `CopilotComputerUseAccessControl` | `CopilotStudio_ComputerUseAppAllowlist` / `...WebAllowlist` | 文字列 | Computer Use の許可リスト |
| `CopilotStudioExternalModels` | `CopilotStudio_ExternalModels` | Boolean | Anthropic 等の外部モデル |
| `DynamicsProjectIntegration` | `EnableProjectLink` / `InitialProjectUsers` | Boolean / 文字列 | Dynamics 365 実装プロジェクト |

`ConnectorManagement` の要素は次の形。

```json
{
  "AllowedConnector": "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps",
  "AllowedActionsMode": "AllAllowed",
  "AllowedConnectionTypesMode": "AllAllowed"
}
```

`makerOnboardingTimestamp` は RFC 1123（`Thu, 21 Nov 2024 21:35:42 GMT`）。更新時は現在時刻を入れる。

## 環境グループで設定できるルール（管理センターの一覧）

エージェントからの追加候補を洗い出すために、UI に出る 38 件を記録しておく。

```text
Accessing transcripts from conversations in Copilot Studio agents
Advanced connector policies
Advanced connector policies only (preview)
Agent access channels (preview)
AI prompts
AI-generated descriptions (preview)
AI-powered Copilot features (preview)
Authentication for agents
Backup retention
Computer Use
Computer Use Access Control
Content security policy
Control maker credential options (preview)
Copilot GSA Settings
Cost controls - Draw from tenant credit pool
Default deployment pipeline
Dynamics 365 Implementation Project
Enable Code Interpreter
Enable IP Cookie Binding
Generative AI settings
IP Firewall setting
Knowledge sources for agents
Maker welcome content
Power Apps code apps
Power Apps component framework for canvas apps
Power Platform Anthropic
Preview and experimental AI models
Release channel
Sharing agents with Editor permissions
Sharing agents with Viewer permissions
Sharing controls for canvas apps
Sharing controls for solution-aware cloud flows
Sharing Copilot Studio agent data with Viva Insights
Showing Images And URLs
Skills in Copilot Studio
Solution checker enforcement
Unmanaged customizations
Usage insights
```

未知のルールの `ruleSetId` と `inputs` を調べたいときは、管理センターで対象ルールを空のグループへ
追加して「変更の適用」を実行し、`GET .../ruleBasedPolicies` または `.../ruleSets` の差分を見る。

## 環境グループ本体の API

| 用途 | 呼び出し |
| --- | --- |
| 一覧 / 作成 | `GET` / `POST https://api.powerplatform.com/environmentmanagement/environmentGroups?api-version=2024-10-01` |
| 環境をグループへ割り当て | `PATCH {bap}/.../environments/{envId}?api-version=2021-04-01` に `{"properties":{"parentEnvironmentGroup":{"id":"<groupId>"}}}` |
| 現在の所属を確認 | 同 URL の `GET` → `properties.parentEnvironmentGroup.id` |

割り当ての `PATCH` は `202 Accepted` を返す非同期処理で、反映まで数十秒かかる。グループに入れられるのは
**マネージド環境のみ**なので、先に `set_managed_environment.py` でマネージド化する。

## Copilot クレジットの環境別配分（同じテナント専用ホスト、`api-version=1`）

環境グループのルールには「テナント クレジット プールから消費するか」（`CostControlsDrawFromTenantCreditPool`）
しか無く、環境ごとの配分数はここでしか設定できない。`set_environment_capacity.py` が実装している。

| 用途 | 呼び出し |
| --- | --- |
| テナントの保有・割り当て合計 | `GET {host}/licensing/entitlements/MCSMessages?api-version=1` |
| 環境ごとの割り当てと消費 | `GET {host}/licensing/environments/entitlements/MCSMessages?searchRequest=&api-version=1` |
| 割り当てだけを一覧 | `GET {host}/licensing/AllocationsByEnvironment?api-version=1` |
| 消費の推移 | `GET {host}/licensing/entitlements/MCSMessages/trends?fromDate=MM-DD-YYYY&toDate=MM-DD-YYYY&interval=daily&api-version=1` |
| **配分を変更** | `PATCH {host}/licensing/environments/{envId}/allocations?api-version=1` |

配分のボディは次の形。`currencyType` は `MCSMessages`（Copilot クレジット）と `MCSSessions`（セッション）。

```json
{ "currencyAllocations": [ { "currencyType": "MCSMessages", "allocated": 500, "autoAllocated": 0.0 } ] }
```

- 保有数を超えて割り当てても API は成功する。合計が超過していないか `--list` で必ず確認する。
- レスポンスの `enforcementRules` に `{"ruleType":"TenantPool","enabled":true|false}` が入る。これは
  環境グループの `CostControlsDrawFromTenantCreditPool` の結果なので、ここでは変更しない。
- `PATCH {host}/licensing/AllocationsByEnvironment` は 400（配列を受け付けない）。環境単位で呼ぶ。

同じエンドポイントで `currencyType` を変えれば、他のアドオン容量も同じ形で配分できる。

`MCSMessages` / `MCSSessions` / `AI`（AI Builder クレジット）/ `AppPass` / `AppPassForTeams` /
`PAHostedRPA` / `PAUnattendedRPA` / `PerFlowPlan` / `PowerAutomatePerProcess` / `PortalLogins` /
`PortalViews` / `PowerPagesAnonymous` / `PowerPagesAuthenticated` / `ProcessMiningDataStorage`

## Dataverse 容量（Database / File / Log）

Dataverse ストレージは**環境ごとに配分できない**。テナント プールから消費ベースで引かれる。

| 用途 | 呼び出し |
| --- | --- |
| テナントの保有と消費 | `GET {host}/licensing/entitlements/{Database\|File\|Log}?api-version=1` |
| 環境ごとの消費 | `GET {host}/licensing/environments/entitlements/{Database\|File\|Log}?searchRequest=&api-version=1` |
| 環境ごとの消費（集計用） | `GET {host}/licensing/environments/entitlementConsumptions/{Database\|File\|Log}?api-version=1` |
| テナント全体のサマリー | `GET {host}/licensing/tenantCapacity?api-version=2022-03-01-preview` |
| 予約済み容量の合計 | `GET {host}/licensing/allocationsV2/entitlements/reserved?$filter=EntitlementId in (Database,Log,File)&api-version=1` |

- `PATCH {host}/licensing/environments/{envId}/allocations` に `currencyType: "Database"` を渡すと
  400（`Error converting value "Database"`）。ストレージは配分できないという意味。
- `PUT {host}/licensing/allocationsV2` は存在するが、ボディの `scope` が非公開のモデルで
  400 `Invalid scope or Allocations` になる。ストレージの予約用途では使わない。
- 環境ごとに上限を掛けたい場合は、環境の作成数と種類（Developer / Sandbox）で制御する。

## 環境の作成（`{bap}`）

| 用途 | 呼び出し |
| --- | --- |
| 作成 | `POST {bap}/scopes/admin/environments?api-version=2021-04-01` |
| 一覧（グループ所属込み） | `GET {bap}/scopes/admin/environments?api-version=2021-04-01&$expand=properties` |

```json
{
  "location": "japan",
  "properties": {
    "displayName": "CONTOSO-COE-KBMGR-DEV",
    "environmentSku": "Sandbox",
    "databaseType": "CommonDataService",
    "linkedEnvironmentMetadata": {
      "baseLanguage": 1041,
      "domainName": "contosocoekbmgrdev",
      "currency": { "code": "JPY" },
      "templates": []
    }
  }
}
```

`202 Accepted` を返す非同期処理。`location` / `baseLanguage` / `currency` / `domainName` は作成後に変更できない。

## パイプライン（パイプライン ホスト環境の Dataverse Web API）

| テーブル | エンティティ セット | 主な列 |
| --- | --- | --- |
| `deploymentpipeline` | `deploymentpipelines` | `name` / `description` |
| `deploymentenvironment` | `deploymentenvironments` | `name` / `environmentid` / `environmenttype` |
| `deploymentstage` | `deploymentstages` | `name` / `deploymentpipelineid` / `targetdeploymentenvironmentid` / `previousdeploymentstageid` |

`environmenttype` は `200000000`（開発環境）と `200000001`（配布先環境）の 2 値。
ステージの参照列は `deploymentpipelineid@odata.bind` のように、列名と同じ名前のナビゲーション プロパティで束縛する。

## CSP（コンテンツ セキュリティ ポリシー、環境の Dataverse `organization`）

管理センターの「環境 > 設定 > プライバシー + セキュリティ」に相当する。
**「App（モデル駆動）」タブの設定が Code Apps にも適用される。**

| 列 | 型 | 意味 |
| --- | --- | --- |
| `iscontentsecuritypolicyenabled` | Boolean | CSP 違反をブロックする（モデル駆動 / Code Apps） |
| `iscontentsecuritypolicyenabledforcanvas` | Boolean | 同上（キャンバス アプリ） |
| `contentsecuritypolicyconfiguration` | 文字列（JSON） | ディレクティブの上書き |
| `contentsecuritypolicyconfigurationforcanvas` | 文字列（JSON） | 同上（キャンバス アプリ） |
| `contentsecuritypolicyoptions` | 整数（ビット） | `1` = Strict CSP |
| `contentsecuritypolicyreporturi` | 文字列 | 違反レポートの送信先（report-only） |

`contentsecuritypolicyconfiguration` は **JSON を文字列として** 格納する。

```json
{"Frame-Ancestor":{"sources":[{"source":"'self'"},{"source":"https://*.powerapps.com"}]},"Script-Src":{"sources":[{"source":"'self'"}]}}
```

- ディレクティブ名は `Frame-Ancestor` / `Script-Src` / `Img-Src` / `Style-Src` / `Font-Src` /
  `Connect-Src` / `Frame-Src` / `Form-Action`。
- 既定モードで上書きできるのは `Frame-Ancestor` だけ。他は `contentsecuritypolicyoptions=1`（Strict CSP）が前提。
- キーを省略すると既定値が使われ、`sources` を空配列にするとそのディレクティブは無効になる。
- `contentsecuritypolicyconfiguration` に `null` を PATCH すると 400（必須項目）。空に戻すときは `"{}"` を送る。
- 更新は `PATCH {orgUrl}/api/data/v9.2/organizations({organizationid})`。

## 注意

- ここに記載した API は Microsoft の公開ドキュメントに無い。予告なく変更される可能性がある。
- 変更前に `--list` で現在値を保存し、ロールバックできるようにしておく。
- ルールを発行すると、グループ内の各環境で個別に設定していた同じ項目はグループの値で上書きされる。
