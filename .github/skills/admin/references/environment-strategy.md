# 環境戦略（Environment Strategy）

テナント全体の環境をどう分割し、どのルールで統制するかの標準設計。
機械可読な定義は [environment-strategy.json](environment-strategy.json) にある。組織固有の名称・人数はそちらを編集する。

## 大原則

| 原則 | 内容 |
| --- | --- |
| **環境グループ優先** | 設定は環境グループのルールで行う。グループ ルールに無い項目だけを他の機能で補う |
| マネージド環境 | すべての対象環境で有効化する。環境グループにはマネージド環境しか入れられない |
| 既定環境 | 専用グループに隔離し、全コネクタブロック + 利用禁止のウェルカム メッセージで実質使用不可にする |
| コネクタ ポリシー | **ACP 専用モード**。クラシック DLP は評価対象外にして一本化する |
| 許可コネクタ | Microsoft 第一者のみ（`microsoft-first-party` プロファイル）。サードパーティ / レガシーは不可 |
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
| 既定環境ルーティングの有効化と宛先グループ | テナント設定 |
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
### 3. 市民開発者環境グループ

**既定環境ルーティングの宛先グループ**にする。新規メーカーの開発者環境が自動でここに入る。

| 環境 | 種類 | 共有上限 | Copilot クレジット | 位置づけ |
| --- | --- | --- | --- | --- |
| トレーニング環境 | Sandbox（定期リセット） | 5 名 | 無効 | 認定前。AI CoE が開発可否とスキルを確認する |
| 市民開発者環境 | Production | 10 名 | 有効 | 認定後。最低限のコネクタのみ。Code Apps 不可 |

### 4. AI CoE セントラルグループ

AI CoE / IT 部門が利用。決められたユーザーのみ。Copilot クレジット有効。

- **AI CoE 分析**: 全社向けテナント分析（CoE Starter Kit 等）
- **AI CoE 検証**: 新技術・プレビュー機能の検証

### 5. AI CoE 内製開発グループ

本部 AI CoE / 事業部 AI CoE が利用。**Code Apps 利用可能**。Power Platform パイプラインを構成し、3 ランドスケープで開発・テスト・本番を通す。データのサイロ化を防ぎつつ安定運用する。ここで開発した Code Apps / Copilot Studio / Dataverse ソリューションは全社に公開する。

| 環境 | 種類 | 共有上限 | 備考 |
| --- | --- | --- | --- |
| AI CoE 開発 | Sandbox | 10 名 | パイプラインのソース |
| AI CoE テスト | Sandbox | 20 名 | パイプラインのステージ |
| AI CoE 本番 | Production | 無制限 | **マネージド ソリューションのみ**を有効化 |

## ライセンスの前提

- マネージド環境のアプリ・フローを利用するユーザーには **Power Apps Premium 等のスタンドアロン ライセンス**が必要。Microsoft 365 に含まれるシード ライセンスでは利用できない。
- Copilot Studio のクレジット（`MCSMessages`）はテナントで購入し、環境ごとに割り当てる。割り当て済みの合計は購入数を超えられない。
- スキャン スクリプトが Microsoft Graph の `subscribedSkus` から保有数・消費数を読み取り、不足があれば警告する。

## ワークフローと成果物

```
scan_environment_strategy.py   （読み取り専用スキャン）
        ↓ scan.json
generate_migration_plan.py     （admin-migration-plan.md を生成）
        ↓ ユーザー レビュー・承認
set_managed_environment.py     （マネージド環境化 = グループの前提条件）
apply_environment_strategy.py  （グループ作成・ルール発行・既定環境の割り当て・テナント設定）
enable_dataverse_search.py     （全環境の Dataverse 検索）
apply_acp_profile.py           （ACP 許可リストの個別調整）
```

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
| Copilot クレジットの参照 | `GET {PP}/licensing/environments/{env}/allocations?api-version=2022-03-01-preview` |
| テナント容量 | `GET {PP}/licensing/tenantCapacity?api-version=2022-03-01-preview` |
| **Copilot クレジットの配分** | 未判明。管理センター > ライセンス > Copilot Credits |

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
