# 環境戦略（Environment Strategy）

テナント全体の環境をどう分割し、どのルールで統制するかの標準設計。
機械可読な定義は [environment-strategy.json](environment-strategy.json) にある。組織固有の名称・人数はそちらを編集する。

## 組織戦略（誰が何を作るか）

環境戦略の前に、開発の役割分担を決める。
誰が何を作るかを決めないと、市民開発者が保守の必要な業務システムを作り、
作った本人が異動した瞬間に誰も直せないアプリだけが残る。

| 役割 | 作るもの | 使うツール | GitHub Copilot | 保守 | 所属グループ |
| --- | --- | --- | --- | --- | --- |
| 市民開発者 | Copilot Cowork のスキル | Copilot Cowork / Copilot Studio（スキル用途） | 利用しない | 不要 | 市民開発者環境グループ / 個人開発者環境グループ |
| AI CoE 開発者（事業部） | 業務システム（Code Apps / モデル駆動型アプリ / フロー / エージェント） | GitHub Copilot / Power Platform パイプライン | 利用する | 必要 | AI CoE 内製開発グループ |
| AI CoE（本部） | 全社共通基盤・テナント分析・新技術検証・事例化 | GitHub Copilot / 管理 API | 利用する | 必要 | AI CoE セントラルグループ |

- **市民開発者は GitHub Copilot を使った開発を行わない。** トークン消費を抑えるため。
  GitHub Copilot が必要になるような業務システムは、そもそも市民開発の対象ではない。
- **業務システムには保守運用が必要**なので、保守できる体制を持つ AI CoE が内製開発を行い、
  Power Platform パイプラインで開発 → テスト → 本番を通す。
- **市民開発が作るのは Copilot Cowork のスキル。** スキルは保守が要らない。
  チームで共有し、うまくいった改善事例は AI CoE（事業部）へ共有する。
- 業務システムが欲しいときは、**自分が AI CoE 開発者（事業部）になる**か、
  **AI CoE に保守も含めた開発をリクエストする**かの 2 択。個人で作って個人で抱えることはしない。
- AI CoE（本部 / 事業部）は、上がってきた改善事例のテンプレート化・横展開を手伝う。

### 市民開発者の例外

Cowork スキル以外の開発（キャンバス アプリ / モデル駆動型アプリ / フロー / エージェント）は、
**どうしても必要になった場合のみ**市民開発者に許可する。次の 3 つを満たすこと。

1. Cowork スキルでは実現できない理由が説明できること
2. 保守の担当者と期限が決まっていること（決まらないなら AI CoE へ依頼する）
3. 市民開発者環境グループのルール（共有上限・コネクタ・Code Apps 不可）の範囲に収まること

満たせない場合は AI CoE 内製開発グループへ移管する。
`scan_environment_strategy.py` + `generate_strategy_report.py` は、市民開発者向けグループの環境に
アプリ + フローが `organizationStrategy.reviewThresholds.citizenBusinessSystemApps` 件以上ある場合に
「業務システム化の兆候」としてレポートへ出力する。

## 大原則

| 原則 | 内容 |
| --- | --- |
| **環境グループ優先** | 設定は環境グループのルールで行う。グループ ルールに無い項目だけを他の機能で補う |
| マネージド環境 | すべての対象環境で有効化する。環境グループにはマネージド環境しか入れられない |
| 既定環境 | 専用グループに隔離し、全コネクタブロック + 利用禁止のウェルカム メッセージで実質使用不可にする |
| コネクタ ポリシー | **ACP 専用モード**。クラシック DLP は評価対象外にして一本化する |
| 許可コネクタ | DEF は `block-all`、CTRL は `all-supported`、PSN / CTZ / COE は `microsoft-first-party`。全グループでレガシー不可 |
| Dataverse for Teams | 利用しない。非管理者による Teams 環境の作成を禁止する |
| Dataverse 検索 | 全環境で有効化する。Copilot Studio の知識と Code Apps の検索体験の前提 |
| 可観測性 | 環境ログ・アラート・エラーログ、テナントレベルの分析、週間ダイジェストを有効化 |
| 共有 | キャンバス アプリの「全員と共有」を禁止。共有上限はグループのルールで制御 |
| ガイドライン | SharePoint に利用ガイドラインを公開し、グループのウェルカム コンテンツから配布 |

### 環境グループを優先する理由

グループ ルールは発行するとグループ内の全環境へ一括適用され、環境側での上書きがロックされる。
環境ごとに設定するとドリフトが発生し、新しい環境を作るたびに設定漏れが起きる。
グループ ルールに無い項目だけを、以下の場所で補う。

| グループ ルールに無い項目 | 補う場所 |
| --- | --- |
| 環境ルーティングの有効化と宛先グループ | 新 `EnvironmentRouting` テナントポリシーと従来テナント設定を区別する（[API 手順](environment-routing.md)） |
| Dataverse for Teams 環境の作成禁止 | テナント設定 |
| 「全員と共有」の禁止 / Application Insights / レポート公開 | テナント設定 |
| Dataverse 検索の有効化 | 環境ごとの Dataverse 組織設定 |
| マネージド環境化とグループへの割り当て | 環境の設定 |
| Copilot クレジットの環境別配分数 | ライセンス（グループ ルールは消費可否のみ） |

## グループ構成

### 1. 既定環境グループ

既定環境は削除できず、テナントの全ユーザーがメーカー権限を持つ。専用グループに入れて隔離する。

- **全コネクタをブロック**（ACP は default-deny なので許可リストを空にする）
- ウェルカム コンテンツに「この環境は利用しないでください」を表示する
- アンマネージド カスタマイズを禁止（`BlockUnmanagedCustomization`）
- 共有上限 1 名 / ソリューション チェッカー `block` / Code Apps 不可 / クレジット プール無効

### 2. 個人開発者環境グループ

学習用。会社のポリシーを理解した市民開発者が個人の開発者環境を持つ。**本番利用は不可**。

- 共有可能ユーザー数: **1 名**
- 永続的な環境。定期リセットはしない
- 利用可能コネクタは市民開発者環境と同じ
- Code Apps は不可

**新旧すべての既存環境ルーティングの推奨宛先**。スキャンで差分を提案し、同意後に API で統一する。
対象ユーザー・ポータル・優先順位・有効化状態・既存環境所属は変更しない（[手順](environment-routing.md)）。

### 3. 市民開発者環境グループ

トレーニングと認定後の市民開発に利用する。個人用の開発者環境のルーティング先は個人開発者環境グループとする。

| 環境 | 種類 | 共有上限 | Copilot クレジット | 位置づけ |
| --- | --- | --- | --- | --- |
| トレーニング環境 | Sandbox（定期リセット） | 5 名 | 無効 | 認定前。AI CoE が開発可否とスキルを確認する |
| 市民開発者環境 | Production | 10 名 | 有効 | 認定後。Microsoft 第一者セット。Code Apps 不可 |

### 4. AI CoE セントラルグループ

AI CoE / IT 部門が利用。決められたユーザーのみ。Copilot クレジット有効。

ACP はカタログで確認した全コネクタを明示許可する `all-supported`。レガシー・非推奨は除く。
未来のコネクタの自動許可ではない。独自 MCP の接続・DLP・実行時検証は別ゲート。

- **AI CoE 分析**: 全社向けテナント分析（CoE Starter Kit 等）
- **AI CoE 検証**: 新技術・プレビュー機能の検証

### 5. AI CoE 内製開発グループ

本部 AI CoE / 事業部 AI CoE が利用。**Code Apps 利用可能**。Power Platform パイプラインを構成し、3 ランドスケープで開発・テスト・本番を通す。データのサイロ化を防ぎつつ安定運用する。ここで開発した Code Apps / Copilot Studio / Dataverse ソリューションは全社に公開する。

| 環境 | 種類 | 共有上限 | 備考 |
| --- | --- | --- | --- |
| AI CoE 開発 | Sandbox | 10 名 | パイプラインのソース |
| AI CoE テスト | Sandbox | 20 名 | パイプラインのステージ |
| AI CoE 検証（任意） | Sandbox | 20 名 | ユーザー受け入れテストが要件のプロジェクトだけ作る |
| AI CoE 本番 | Production | 無制限 | **マネージド ソリューションのみ**を有効化 |

#### 本番環境の方針

このグループの本番環境は条件が厳しい（アンマネージド カスタマイズ不可・デプロイはパイプライン経由のみ・コネクタはグループ共通の Microsoft 第一者セット）。
既存環境を本番へ転用すると、既に入っているアンマネージド コンポーネントを剥がせず条件を満たせない。

- **原則：新規作成**する（`create_environments.py`）。
- **例外：「アンマネージド カスタマイズ不可」が既に ON の既存環境があれば、それを本番として採用する。** ソリューション経由でしか変更できない運用が既に確立しているため。
- **検証（UAT）環境はオプション**。開発 → テスト → 本番の 3 段で足りるなら作らない（容量とライセンスを消費するため）。
- **コネクタ制限がゆるくアプリが多数ある既存環境は、このグループの「開発」として採用する。** 市民開発者グループの厳しいルールへ入れると既存アプリが止まるため。

判定基準はブループリントの `lifecyclePolicy.reuseExistingEnvironment`（既定: ACP 未割り当てまたは許可コネクタ 100 以上、かつアプリ 10 件以上）。
`scan_environment_strategy.py` が自動で提案し、`generate_migration_plan.py` が移行プランの 2-7 に出力する。

> 「アンマネージド カスタマイズ不可」の読み取りには Power Platform API の委任アクセス許可 `EnvironmentManagement.Settings.Read` が必要。
> 既定のクライアントには無いため 403 になる。許可を付与した Entra アプリを `--client-id` で渡すか、
> 管理センターの [環境] > [設定] > [製品] > [機能] で目視確認してブループリントの `environmentFacts` に手入力する。

## 使われていない環境の棚卸し

### ACP 初期セットの適用

`apply_environment_strategy.py` のグループ作成だけでは初期許可セットの適用完了としない。
`apply_group_acp_strategy.py --environment-id <ENV_ID> --report-file group-acp-plan.json` で
グループと配下環境の追加/削除差分をレビューし、承認後に `--apply`。
個別環境への ACP 設定はしない。共有・Code Apps・クレジット・ACP 専用モードも同時変更しない。
カタログ取得元は `--environment-id` の環境に限定される。他メンバーだけにあるカスタムコネクタが
必要な場合はその ID が計画に含まれるか確認し、未掲載のまま全置換を承認しない。
テナント固有の全許可例外は `--group-profile CODE=all-supported` で指定し、標準 COE は変更しない。
保存後は Publish rules、全メンバーの実効設定、Workflow 等の実行時を別々に確認する。

環境グループへ環境を入れる**前に**棚卸しする。使われていない環境をそのままグループへ入れると、
マネージド環境化のライセンスも Dataverse 容量も無駄に消費し続ける。先に削除すれば容量がテナント プールへ戻る。

| 項目 | 既定値（`lifecyclePolicy.unusedEnvironment`） |
| --- | --- |
| アプリ数 | `maxApps` = 2 件以下 |
| フロー数 | `maxFlows` = 2 件以下 |
| 未使用期間 | `inactiveDays` = 180 日以上 |
| 除外 | 既定環境、`excludeSkus` に含まれる SKU |

- 活動の有無は**アプリ / フローの最終更新日時**で判定する。環境自体の `lastModifiedTime` は管理操作でも更新されるため使わない。
- 作成から `inactiveDays` 未満の新しい環境は候補にしない。
- 削減できる容量は `Database` + `File` + `Log` の消費量（MB）の合計。`capacity.consumed` と `payGo.consumed` の両方を足す。
- 削除は元に戻せない。**所有者への確認とバックアップを先に行う**（削除後 7 日間は管理センターからリカバリできる）。
- `scan_environment_strategy.py` が候補と削減可能容量を出力し、`generate_migration_plan.py` が移行プランの 2-6 と手順 0 に反映する。

## ライセンスの前提

- マネージド環境のアプリ・フローを利用するユーザーには **Power Apps Premium 等のスタンドアロン ライセンス**が必要。Microsoft 365 に含まれるシード ライセンスでは利用できない。
- Copilot Studio のクレジット（`MCSMessages`）はテナントで購入し、環境ごとに割り当てる。割り当て済みの合計は購入数を超えられない。
- スキャン スクリプトが Microsoft Graph の `subscribedSkus` から保有数・消費数を読み取り、不足があれば警告する。

## 環境の命名規則

環境名を都度考えると表記ゆれが起きて、一覧からどのグループのどの段階の環境かを判別できなくなる。
ブループリントの `namingConvention` でパターンを決め、`environment_naming.py` が機械的に生成する。

| 項目 | 既定値 |
| --- | --- |
| 表示名 | `{orgCode}-{groupCode}-{workload}-{stageCode}`（例 `CONTOSO-COE-KBMGR-DEV`） |
| ドメイン名 | `{orgcode}{groupcode}{workload}{stagecode}`（例 `contosocoekbmgrdev`） |
| ステージ コード | `Dev`=DEV / `Test`=TST / `Prod`=PRD / `Sandbox`=SBX / `Trial`=TRL / `Personal`=PSN |

- 英数字とハイフンだけを使う。日本語・空白・記号はドメイン名に流用できないため使わない。
- 同じ `workload` の Dev / Test / Prod は `stageCode` だけが違う名前にして、パイプラインの対応関係を名前で追えるようにする。
- 個人開発者環境は Power Platform が自動命名するため対象外。既定環境は改名しない。
- `location` / `baseLanguage` / `currency` は作成後に変更できないため、`environmentDefaults` で先に固定する。

## ワークフローと成果物

```
scan_environment_strategy.py   （読み取り専用スキャン）
        ↓ scan.json
generate_strategy_report.py    （admin-strategy-report.html を生成 → ブラウザで提示して合意を得る）
generate_migration_plan.py     （admin-migration-plan.md を生成）
        ↓ ユーザー レビュー・承認
set_managed_environment.py     （マネージド環境化 = グループの前提条件）
apply_environment_strategy.py  （グループ作成・ルール発行・既定環境の割り当て・テナント設定）
environment_naming.py          （環境名の生成規則の確認）
create_environments.py         （不足している環境の作成とグループ割り当て）
setup_pipeline.py              （開発 → テストのパイプライン構成）
enable_dataverse_search.py     （全環境の Dataverse 検索）
set_environment_capacity.py    （Copilot クレジット等の環境別配分と Dataverse 容量の一覧）
set_content_security_policy.py （Code Apps / モデル駆動 / キャンバスの CSP）
apply_acp_profile.py           （ACP 許可リストの個別調整）
        ↓ results.json
generate_strategy_report.py    （--results-file で「適用結果」タブを追記して再生成）
```

`admin-strategy-report.html` は CDN 参照の無い自己完結 HTML なので、ワークスペース内に出力して
VS Code の統合ブラウザ（`file:///`）またはプレビューで開ける。ワークスペース外のパスは
`Forbidden. File does not reside within a trusted folder.` で拒否されるため、`$TEMP` などへ出力しない。

グループ ルールを個別に触る場合は `set_environment_group_rules.py` を使う。
ルール ID と API の一覧は [rule-catalog.md](rule-catalog.md) にある。

## API で自動化できる範囲

| 対象 | 手段 |
| --- | --- |
| テナント設定の読み取り | `POST {BAP}/providers/Microsoft.BusinessAppPlatform/listTenantSettings?api-version=2021-04-01` |
| テナント設定の書き込み | `POST {BAP}/.../scopes/admin/updateTenantSettings?api-version=2021-04-01`（**差分のみ**を送る） |
| 環境グループの一覧 / 作成 | `GET/POST {PP}/environmentmanagement/environmentGroups?api-version=2024-10-01` |
| 環境をグループへ割り当て | `PATCH {BAP}/.../environments/{env}` の `properties.parentEnvironmentGroup.id` |
| マネージド環境・共有上限 | `PATCH {BAP}/.../scopes/admin/environments/{env}?api-version=2021-04-01` |
| グループのクラシック ルール | `POST {T}/governance/environmentGroups/{gid}/ruleSets` / `PUT {T}/governance/ruleSets/{id}` |
| グループのポリシー ルール | `POST/PATCH {T}/governance/ruleBasedPolicies` + `.../environmentGroups/{gid}/assignments` |
| ACP の許可リスト | 同上（`ConnectorManagement` ルール）または `PATCH {PP}/governance/ruleBasedPolicies/{policyId}` |
| ACP 専用モード | グループ ルール `AdvancedConnectorPoliciesOnly` |
| アンマネージド禁止 / Code Apps / クレジット プール | グループ ルール（rule-catalog.md 参照） |
| メーカー ウェルカム コンテンツ | グループ ルール `MakerOnboardingContent` |
| Dataverse 検索 | `PATCH {dataverseUrl}/api/data/v9.2/organizations({orgId})` の `isexternalsearchindexenabled` |
| Copilot クレジットの参照 | `GET {T}/licensing/environments/entitlements/MCSMessages?searchRequest=&api-version=1` |
| **Copilot クレジット・アドオン容量の配分** | `PATCH {T}/licensing/environments/{env}/allocations?api-version=1`（`set_environment_capacity.py`） |
| Dataverse 容量（Database / File / Log） | 参照のみ。`GET {T}/licensing/environments/entitlements/{type}?searchRequest=&api-version=1`。環境ごとの配分 API は無い |
| **環境の作成** | `POST {BAP}/scopes/admin/environments?api-version=2021-04-01`（`create_environments.py`） |
| **パイプラインの構成** | パイプライン ホスト環境の `deploymentpipelines` / `deploymentstages` / `deploymentenvironments`（`setup_pipeline.py`） |
| **CSP（Code Apps を含む）** | `PATCH {dataverseUrl}/api/data/v9.2/organizations({orgId})` の `iscontentsecuritypolicyenabled` 他（`set_content_security_policy.py`） |
| テナント容量 | `GET {PP}/licensing/tenantCapacity?api-version=2022-03-01-preview` |
| アプリ数と最終更新日時 | `GET https://api.powerapps.com/providers/Microsoft.PowerApps/scopes/admin/environments/{env}/apps?api-version=2016-11-01` |
| フロー数と最終更新日時 | `GET https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/scopes/admin/environments/{env}/v2/flows?api-version=2016-11-01` |
| アンマネージド カスタマイズ不可（環境個別） | `GET {PP}/environmentmanagement/environments/{env}/settings?api-version=2022-03-01-preview`。委任アクセス許可 `EnvironmentManagement.Settings.Read` が必要で、無いと 403 |
| 環境の削除 | `DELETE {BAP}/scopes/admin/environments/{env}?api-version=2021-04-01`。**取り消し不可**。スクリプト化していない（提案までを自動化し、実行は人が行う） |

`{T}` はテナント専用ホスト。生成規則と詳細は [rule-catalog.md](rule-catalog.md) を参照。

## 重要な制約

- 環境グループには**マネージド環境しか入れられない**。Dataverse の無い環境はグループの選択肢に出てこない。
- 1 つの環境は 1 つのグループにしか属せない。グループの入れ子・重複は不可。
- グループのルールを発行すると、環境側で設定済みの **共有上限 / メーカー ウェルカム コンテンツ / ソリューション チェッカー / 使用状況分析 / バックアップ保持 / 生成 AI 設定**がグループの値で上書きされる。
- 環境をグループから外すと、直前の設定を保持したままロックだけが解除される。
- 既定環境ルーティングのグループを変更しても、既存の開発者環境は元のグループに残る。
- グループ ルールの API は非公開。仕様変更のリスクがあるので、変更前に `--list` で現在値を控えておく。

## 参考

- [環境グループ](https://learn.microsoft.com/ja-jp/power-platform/admin/environment-groups)
- [環境グループのルール](https://learn.microsoft.com/ja-jp/power-platform/admin/environment-groups-rules)
- [高度なコネクタ ポリシー](https://learn.microsoft.com/ja-jp/power-platform/admin/advanced-connector-policies?tabs=new)
- [メーカー ウェルカム コンテンツ](https://learn.microsoft.com/ja-jp/power-platform/admin/welcome-content)
