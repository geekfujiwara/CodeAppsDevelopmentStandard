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

## 注意

- ここに記載した API は Microsoft の公開ドキュメントに無い。予告なく変更される可能性がある。
- 変更前に `--list` で現在値を保存し、ロールバックできるようにしておく。
- ルールを発行すると、グループ内の各環境で個別に設定していた同じ項目はグループの値で上書きされる。
