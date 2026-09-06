# 環境戦略（Environment Strategy）

テナント全体の環境をどう分割し、どのルールで統制するかの標準設計。
機械可読な定義は [environment-strategy.json](environment-strategy.json) にある。組織固有の名称・人数はそちらを編集する。

## 大原則

| 原則 | 内容 |
| --- | --- |
| マネージド環境 | すべての対象環境で有効化する。環境グループにはマネージド環境しか入れられない |
| 環境グループ | 用途ごとにグループを分け、ルールを発行して環境側の設定をロックする |
| コネクタ ポリシー | **ACP 専用モード**。クラシック DLP は評価対象外にして一本化する |
| 許可コネクタ | Microsoft 第一者のみ（`microsoft-first-party` プロファイル）。サードパーティ / レガシーは不可 |
| 可観測性 | 環境ログ・アラート・エラーログ、テナントレベルの分析、週間ダイジェストを有効化 |
| 共有 | キャンバス アプリの「全員と共有」を禁止。共有上限はグループのルールで制御 |
| ガイドライン | SharePoint に利用ガイドラインを公開し、グループのウェルカム コンテンツから配布 |

## グループ構成

### 1. 個人開発者環境グループ

学習用。会社のポリシーを理解した市民開発者が個人の開発者環境を持つ。**本番利用は不可**。

- 既定環境ルーティングの対象グループにする（新規メーカーの環境が自動でここに入る）
- 共有可能ユーザー数: **1 名**
- 永続的な環境。定期リセットはしない
- 利用可能コネクタは市民開発者環境と同じ
- Code Apps は不可

### 2. 市民開発者環境グループ

| 環境 | 種類 | 共有上限 | Copilot クレジット | 位置づけ |
| --- | --- | --- | --- | --- |
| トレーニング環境 | Sandbox（定期リセット） | 5 名 | 無効 | 認定前。AI CoE が開発可否とスキルを確認する |
| 市民開発者環境 | Production | 10 名 | 有効 | 認定後。最低限のコネクタのみ。Code Apps 不可 |

### 3. AI CoE セントラルグループ

AI CoE / IT 部門が利用。決められたユーザーのみ。Copilot クレジット有効。

- **AI CoE 分析**: 全社向けテナント分析（CoE Starter Kit 等）
- **AI CoE 検証**: 新技術・プレビュー機能の検証

### 4. AI CoE 内製開発グループ

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
apply_environment_strategy.py  （グループ作成・テナント設定）
set_managed_environment.py     （マネージド環境化・共有上限）
apply_acp_profile.py           （ACP 許可リスト）
        ↓
管理センターでの手動作業（下表）
```

## API で自動化できる範囲

| 対象 | 自動化 | 手段 |
| --- | --- | --- |
| テナント設定の読み取り | 可 | `POST {BAP}/providers/Microsoft.BusinessAppPlatform/listTenantSettings?api-version=2020-10-01` |
| テナント設定の書き込み | 可 | `POST {BAP}/providers/Microsoft.BusinessAppPlatform/saveTenantSettings?api-version=2020-10-01` |
| 環境グループの一覧 / 作成 | 可 | `GET/POST {PP}/environmentmanagement/environmentGroups?api-version=2024-10-01` |
| マネージド環境・共有上限 | 可 | `PATCH {BAP}/.../scopes/admin/environments/{env}?api-version=2021-04-01` |
| ACP の許可リスト | 可 | `PATCH {PP}/governance/ruleBasedPolicies/{policyId}?api-version=2024-10-01` |
| Copilot クレジットの参照 | 可 | `GET {PP}/licensing/environments/{env}/allocations?api-version=2022-03-01-preview` |
| テナント容量 | 可 | `GET {PP}/licensing/tenantCapacity?api-version=2022-03-01-preview` |
| **環境をグループへ追加** | 不可 | 管理センター、または Power Platform for Admins V2（プレビュー）コネクタ |
| **グループのルール設定・発行** | 不可 | 管理センター > 環境グループ > ルール > ルールの発行 |
| **ACP 専用モードの切り替え** | 不可 | 管理センター > セキュリティ > データとプライバシー |
| **Copilot クレジットの配分** | 不可 | 管理センター > ライセンス > Copilot Credits |

## 重要な制約

- 環境グループには**マネージド環境しか入れられない**。Dataverse の無い環境はグループの選択肢に出てこない。
- 1 つの環境は 1 つのグループにしか属せない。グループの入れ子・重複は不可。
- グループのルールを発行すると、環境側で設定済みの **共有上限 / メーカー ウェルカム コンテンツ / ソリューション チェッカー / 使用状況分析 / バックアップ保持 / 生成 AI 設定**がグループの値で上書きされる。
- 環境をグループから外すと、直前の設定を保持したままロックだけが解除される。
- 既定環境ルーティングのグループを変更しても、既存の開発者環境は元のグループに残る。

## 参考

- [環境グループ](https://learn.microsoft.com/ja-jp/power-platform/admin/environment-groups)
- [環境グループのルール](https://learn.microsoft.com/ja-jp/power-platform/admin/environment-groups-rules)
- [高度なコネクタ ポリシー](https://learn.microsoft.com/ja-jp/power-platform/admin/advanced-connector-policies?tabs=new)
- [メーカー ウェルカム コンテンツ](https://learn.microsoft.com/ja-jp/power-platform/admin/welcome-content)
