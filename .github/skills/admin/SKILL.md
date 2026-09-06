---
name: admin
description: "Power Platform のテナント / 環境ガバナンスを確認・設定する管理スキル。開発着手前の環境チェック（既定環境ではないか・マネージド環境・Dataverse / Code Apps / MCP の有効化・セキュリティ ロール・管理 API アクセス）と DLP 事前チェックを非対話スクリプトで実行し、必要ならマネージド環境設定・カスタムコネクタの DLP 分類・ACP（Advanced connector policies）の許可コネクタを dry-run 付きで変更する。Microsoft 第一者サービスだけを許可する ACP 推奨プロファイルの適用と、クラシック DLP から ACP への移行も支援する。クラシック DLP と ACP は既定の混成モードで併用され、より制限の厳しい方が適用されるため両方を確認する。オプションとして、既定環境 / 個人開発者環境 / 市民開発者環境 / AI CoE セントラル / AI CoE 内製開発の 5 グループからなるテナント全体の環境戦略を、読み取り専用スキャン → 移行プラン（admin-migration-plan.md）→ レビュー → 適用の順で策定・実行する。設定は環境グループのルールで行うのを原則とし、グループ ルールに無い項目（既定環境ルーティング・Dataverse for Teams 禁止・Dataverse 検索・グループへの割り当て・Copilot クレジット配分）だけをテナント設定・環境個別設定・Dataverse の組織設定で補う。IP 制限・テナント分離・監査ログ・ライセンス配分などの管理設定は references にまとめる。"
category: platform
triggers:
  - "環境チェック"
  - "環境準備"
  - "環境が使えるか"
  - "DLP"
  - "データ ポリシー"
  - "データ損失防止"
  - "ACP"
  - "Advanced connector policies"
  - "コネクタがブロックされる"
  - "DLP 推奨設定"
  - "DLP から ACP へ移行"
  - "ガバナンス"
  - "マネージド環境"
  - "Managed Environment"
  - "環境グループ"
  - "環境グループのルール"
  - "ウェルカム コンテンツ"
  - "アンマネージドカスタマイズ禁止"
  - "Dataverse 検索"
  - "Dataverse for Teams"
  - "既定環境ルーティング"
  - "環境戦略"
  - "環境設計"
  - "環境の見直し"
  - "テナント設計"
  - "CoE"
  - "市民開発者"
  - "個人の開発者環境"
  - "ACP 専用モード"
  - "IP 制限"
  - "テナント分離"
  - "監査ログ"
  - "ライセンス"
  - "セキュリティ ロール確認"
  - "管理者権限"
  - "admin"
---

# Power Platform 管理・ガバナンススキル

**開発を始める前に環境が使える状態かを確認し**、必要なガバナンス設定を API で整えるためのスキル。
他スキル（`architecture` / `standard` / `code-apps` / `copilot-studio` / `mcp-server`）から
共通ステップとして呼び出される。

| 原則 | 内容 |
|---|---|
| 実装前に確認 | 設計が固まったら**実装着手前に** Step 1・Step 2 を実行し、結果をユーザーに提示する |
| 読み取り優先 | 既定は読み取り専用。変更系は必ず **dry-run → ユーザー確認 → `--apply`** の順 |
| 非対話 | 認証は `auth_helper.py` のキャッシュを使う。`Add-PowerAppsAccount` / `az login` は使わない |
| 最小変更 | テナント全体に効く設定は、対象ホスト・対象環境だけに絞って変更する |

> 必要なロールは [管理者ロール要件](references/admin-roles.md)、
> 環境チェックの判定基準は [environment-check.md](references/environment-check.md)、
> テナント全体の環境設計は [environment-strategy.md](references/environment-strategy.md)、
> 環境グループのルール ID と非公開 API は [rule-catalog.md](references/rule-catalog.md)、
> DLP は [dlp-precheck.md](references/dlp-precheck.md)、
> IP 制限・テナント分離・監査・ライセンスは [governance-settings.md](references/governance-settings.md)、
> 異常系は [troubleshooting.md](references/troubleshooting.md) を参照。

## スキル同梱スクリプト

パラメータは引数または `.env`（[references/.env.example](references/.env.example)）から取得する。

| スクリプト | 用途 | 変更 |
|---|---|---|
| [scripts/check_environment.py](scripts/check_environment.py) | 環境チェック一式（既定環境 / マネージド環境 / Dataverse / Code Apps / MCP / 監査 / セキュリティ ロール / 管理 API / 適用 DLP） | なし |
| [scripts/check_dlp.py](scripts/check_dlp.py) | 使用コネクタが DLP で使えるかの事前チェック | なし |
| [scripts/set_dlp_custom_connector.py](scripts/set_dlp_custom_connector.py) | カスタムコネクタ（自前 MCP Server 等）の DLP 分類を設定 | `--apply` 時のみ |
| [scripts/set_acp_connector.py](scripts/set_acp_connector.py) | ACP（Advanced connector policies）の許可コネクタを確認・追加 | `--apply` 時のみ |
| [scripts/apply_acp_profile.py](scripts/apply_acp_profile.py) | ACP の許可セットを推奨プロファイル（Microsoft 第一者のみ）で一括設定 | `--apply` 時のみ |
| [scripts/migrate_dlp_to_acp.py](scripts/migrate_dlp_to_acp.py) | クラシック DLP の分類を ACP の許可リストへ移行 | `--apply` 時のみ |
| [scripts/set_managed_environment.py](scripts/set_managed_environment.py) | マネージド環境の有効化・共有制限・ソリューション チェッカー設定 | `--apply` 時のみ |
| [scripts/scan_environment_strategy.py](scripts/scan_environment_strategy.py) | 環境戦略の現状スキャン（テナント設定 / 環境グループ / 環境 / アプリ・フロー数 / Dataverse 容量 / ACP / DLP / ライセンス / Copilot クレジット）。削除候補と割り当て先も提案 | なし |
| [scripts/generate_migration_plan.py](scripts/generate_migration_plan.py) | スキャン結果から `admin-migration-plan.md` を生成 | なし |
| [scripts/apply_environment_strategy.py](scripts/apply_environment_strategy.py) | 環境グループの作成・ルール発行・既定環境の割り当て・テナント設定 | `--apply` 時のみ |
| [scripts/set_environment_group_rules.py](scripts/set_environment_group_rules.py) | 環境グループのルールを個別に確認・設定（共有上限 / ACP / アンマネージド禁止 / Code Apps / ウェルカム コンテンツ） | `--apply` 時のみ |
| [scripts/enable_dataverse_search.py](scripts/enable_dataverse_search.py) | 全環境の Dataverse 検索を有効化 | `--apply` 時のみ |
| [scripts/set_environment_capacity.py](scripts/set_environment_capacity.py) | Copilot クレジット・AI Builder クレジット等の環境別配分と、Dataverse 容量（Database / File / Log）の一覧 | `--apply` 時のみ |
| [scripts/environment_naming.py](scripts/environment_naming.py) | 環境名をルールベースで生成（表示名とドメイン名） | なし |
| [scripts/create_environments.py](scripts/create_environments.py) | ブループリントに対して不足している環境を作成し、環境グループへ割り当て | `--apply` 時のみ |
| [scripts/setup_pipeline.py](scripts/setup_pipeline.py) | Power Platform パイプライン（開発 → テスト → 本番）の構成 | `--apply` 時のみ |
| [scripts/set_content_security_policy.py](scripts/set_content_security_policy.py) | 環境の CSP（Code Apps / モデル駆動 / キャンバス）の確認と設定 | `--apply` 時のみ |
| [scripts/dlp_helper.py](scripts/dlp_helper.py) | DLP 管理 API の共通ロジック（他スクリプトから import） | なし |
| [references/acp-profiles.json](references/acp-profiles.json) | ACP 推奨許可セットの定義（パターン / ブロック / 要確認） | なし |
| [references/rule-catalog.md](references/rule-catalog.md) | 環境グループのルール ID と非公開 API の一覧 | なし |
| [references/environment-strategy.json](references/environment-strategy.json) | 環境戦略のブループリント（グループ / 環境 / 共有上限 / テナント設定） | なし |

## ワークフロー（正常系）

### Step 1: 環境チェックを実行する

対象環境が開発してよい状態かを一括で確認する。**新しい環境で作業を始める最初のステップ**。

```powershell
python .github/skills/admin/scripts/check_environment.py `
  --environment-id $env:ENV_ID `
  --require-managed --require-code-apps
```

`--require-*` を付けた項目は、満たさないと `NG`（終了コード 1）になる。
判定される項目と基準は [environment-check.md](references/environment-check.md) を参照。

出力例（抜粋）:

```text
[OK  ] 既定環境: 既定環境ではありません
[OK  ] マネージド環境: 有効（共有制限=noLimit / ソリューション チェッカー=warn）
[OK  ] Dataverse: https://<org>.crm.dynamics.com（v9.2.x）
[OK  ] Dataverse MCP: 有効（IsMCPEnabled=true）
[OK  ] Code Apps: 利用可能（この環境に N 件のコード アプリ）
[OK  ] セキュリティ ロール: System Administrator を保持しています
[INFO] 適用される DLP: 1 件: <ポリシー名>
```

### Step 2: DLP 事前チェックを実行する

ソリューションが使うコネクタを列挙して実行する。手順は [dlp-precheck.md](references/dlp-precheck.md)。

```powershell
python .github/skills/admin/scripts/check_dlp.py `
  --environment-id $env:ENV_ID `
  --tenant-id $env:TENANT_ID `
  --connector shared_commondataserviceforapps `
  --custom-host func-example-mcp.azurewebsites.net
```

### Step 3: 結果をユーザーに提示する

Step 1・Step 2 の `NG` / `WARN` を表にして提示し、**実装に入る前に**解消方針を合意する。
権限不足で読み取れない項目があれば、管理者に実行を依頼して結果を共有してもらう。

| 検出 | 典型的な対応 |
|---|---|
| 既定環境である | 開発用の専用環境を作成する |
| マネージド環境が無効 | Step 4 で有効化する（Code Apps のデプロイに必要） |
| Code Apps が確認できない | 管理センターで「コード アプリを許可する」をオンにする |
| Dataverse MCP が無効 | 管理センターの環境設定で MCP を有効化する |
| セキュリティ ロール不足 | 管理者に System Administrator（または必要な最小ロール）の割り当てを依頼 |
| コネクタが Blocked / グループ混在 / 未分類 | Step 5 または設計変更で解消する |
| クラシック DLP は OK なのにブロックされる | Step 6 で ACP の許可リストを確認する |

### Step 4: マネージド環境設定を変更する（必要な場合）

```powershell
# 既定は dry-run。現在値と変更後の値を表示するだけ
python .github/skills/admin/scripts/set_managed_environment.py `
  --environment-id $env:ENV_ID --enable --solution-checker-mode warn

# 出力を確認してもらってから適用する
python .github/skills/admin/scripts/set_managed_environment.py `
  --environment-id $env:ENV_ID --enable --solution-checker-mode warn --apply
```

既存の拡張設定は保持され、指定した項目だけが差し替わる。

### Step 5: カスタムコネクタの DLP 分類を設定する（必要な場合）

```powershell
python .github/skills/admin/scripts/set_dlp_custom_connector.py `
  --tenant-id $env:TENANT_ID --policy "<ポリシーの表示名>" `
  --host func-example-mcp.azurewebsites.net --classification General
# 内容を確認してから --apply
```

**併用する他のコネクタと同じグループ**に揃える。反映は通常 1 時間以内（最大 24 時間）。

### Step 6: ACP の許可リストを確認・追加する（必要な場合）

ACP（Advanced connector policies）は **default-deny の厳格な許可リスト**で、
既定の**混成モード**ではクラシック DLP と併用され**より制限の厳しい方**が適用される。
そのため Step 2 が `OK` でも、ACP の許可リストに無いコネクタはブロックされる。

```powershell
# 環境と環境グループの両方で許可状況を確認（読み取りのみ）
python .github/skills/admin/scripts/set_acp_connector.py `
  --environment-id $env:ENV_ID --include-group `
  --connector shared_example-custom-connector

# 内容を確認してから、環境グループ側の元ポリシーに追加する
python .github/skills/admin/scripts/set_acp_connector.py `
  --policy-id <グループ ポリシー ID> `
  --connector shared_example-custom-connector --apply
```

環境に割り当てられるのは環境グループから同期された写しなので、
**環境グループ側のポリシーを更新**しないと再同期で元に戻る。
適用後は必ず再確認し、許可コネクタ数が増えていることを確認する。

### Step 7: ACP を推奨プロファイルで一括設定する（任意）

「Microsoft 第一者サービスだけを許可し、Microsoft が公開していても実体がサードパーティの
サービス（Google Drive / Facebook / Mailchimp / YouTube / Workday / Zendesk など）と
非推奨コネクタ（Dynamics 365 レガシー）はブロックする」推奨セットを 1 コマンドで適用する。

定義は [references/acp-profiles.json](references/acp-profiles.json)。
`publisher` では第一者判定できない（Google Drive も YouTube も publisher は `Microsoft`）ため、
コネクタ ID のパターンで判定している。

```powershell
# 解決される許可セットを一覧する（読み取りのみ）
python .github/skills/admin/scripts/apply_acp_profile.py `
  --environment-id $env:ENV_ID --profile microsoft-first-party --list

# 現在の ACP との差分を確認する（dry-run）
python .github/skills/admin/scripts/apply_acp_profile.py `
  --environment-id $env:ENV_ID --profile microsoft-first-party --include-group

# 内容を確認してもらってから適用する
python .github/skills/admin/scripts/apply_acp_profile.py `
  --environment-id $env:ENV_ID --profile microsoft-first-party `
  --include-group --include-connector shared_example-mcp --apply
```

| 事項 | 挙動 |
|---|---|
| 許可リストの扱い | **置き換え**。差分（追加 / 削除）を必ずユーザーに提示してから `--apply` |
| カスタムコネクタ | 既に許可済みのものは自動で引き継ぐ（`--no-keep-custom` で無効化） |
| 要確認コネクタ | `reviewConnectors`（コンシューマー版 OneDrive / Outlook.com / GitHub 等）は実行時に一覧表示される。**AskUserQuestion で利用有無を確認**し、不要なら `--exclude-connector` で外す |
| 安全弁 | `mustNotAllow`（Google Drive 等）が許可セットに紛れ込んだら中断する |

### Step 8: クラシック DLP から ACP へ移行する（任意）

既存のクラシック DLP の分類を読み取り、ACP の許可リストへ写す。
DLP は「グループ分け」、ACP は「default-deny の許可リスト」で意味論が異なるため、
機械的に移せない部分は **未確定事項**として出力される。

```powershell
# 1. 現状分析。未確定事項を出力する（変更しない）
python .github/skills/admin/scripts/migrate_dlp_to_acp.py `
  --environment-id $env:ENV_ID --tenant-id $env:TENANT_ID `
  --report-only --report-file dlp-to-acp.json

# 2. AskUserQuestion で回答を得てから、対応するオプションを付けて dry-run
python .github/skills/admin/scripts/migrate_dlp_to_acp.py `
  --environment-id $env:ENV_ID --tenant-id $env:TENANT_ID `
  --allow-group Confidential --keep-custom --include-group

# 3. 差分を確認してもらってから適用
#    上記コマンドに --apply を付ける
```

出力される未確定事項と、AskUserQuestion で確認すべき内容:

| ID | 確認内容 | 反映するオプション |
|---|---|---|
| `default-classification` | DLP の未分類コネクタは既定で許可扱い。ACP でも許可するか（既定は許可しない＝ default-deny 維持） | `--allow-unclassified` |
| `allow-groups` | Business（Confidential）と Non-business（General）のどちらを ACP へ移すか | `--allow-group Confidential` / `--allow-group General` |
| `custom-connectors` | カスタムコネクタを許可リストに含めるか | `--keep-custom` |
| `url-rules` | DLP の Host URL 規則には ACP の等価機能がない。対象コネクタを個別に許可するか | `--include-connector shared_xxx` |

許可セットが 0 件になる指定は事故防止のため中断する（意図的なら `--allow-empty`）。

**ACP のみモード**（クラシック DLP を無視する）への切り替えは API が公開されていない。
Power Platform 管理センターの **セキュリティ > データとプライバシー** で
「Advanced connector policies only」を有効化する手動操作が必要。
移行が完了して ACP だけで運用できることを確認してから切り替える。

### Step 9: 反映を確認する

変更後に Step 1・Step 2・Step 6 を再実行し、`OK` になったことを確認してからユーザーへ報告する。
DLP は反映に時間がかかるため、直後に解消していなくても再評価まで待って判断する。

### Step 10: 環境戦略を策定する（オプション）

環境の新規設計・全体の見直し・ACP 移行の意図がある場合に実行する。
標準設計は [environment-strategy.md](references/environment-strategy.md)、機械可読な定義は
[references/environment-strategy.json](references/environment-strategy.json) にある。

#### 10-1. 推奨戦略を説明する

スキャンの前に、まず目指す姿を提示する。

- **設定は環境グループのルールで行う**ことを原則とし、グループ ルールに無い項目だけを他の機能で補うこと
- 5 つの環境グループ（既定環境 / 個人開発者環境 / 市民開発者環境 / AI CoE セントラル / AI CoE 内製開発）と各環境の役割
- 既定環境は専用グループに隔離し、全コネクタブロック + 利用禁止のウェルカム メッセージで実質使用不可にすること
- 全環境をマネージド環境にし、環境グループのルールで設定をロックすること
- コネクタは **ACP 専用モード + Microsoft 第一者のみ**にし、クラシック DLP を評価対象外にすること
- Dataverse for Teams は利用せず、Dataverse 検索は全環境で有効化すること
- 環境ログ・アラート・エラーログ、テナントレベルの分析、週間ダイジェストを有効化すること
- キャンバス アプリの共有設定と、グループごとの共有可能ユーザー数の上限
- **グループへ入れる前に、使われていない環境を削除して Dataverse 容量を取り戻すこと**

そのうえで **「これから行うスキャンは読み取りのみで、環境には一切変更を加えません」** と明示してから実行する。

```bash
python scan_environment_strategy.py --tenant-id <TENANT_ID> --report-file scan.json
```

アプリ / フロー数の収集で時間がかかる場合は `--no-usage` で省ける（ただし削除候補の判定は行われない）。
「アンマネージド カスタマイズ不可」の読み取りには委任アクセス許可 `EnvironmentManagement.Settings.Read` が必要なため、
許可を付与した Entra アプリを `--client-id <APP_ID>` で渡す。渡せない場合は管理センターの
[環境] > [設定] > [製品] > [機能] で目視確認し、`environment-strategy.json` の `environmentFacts` に手入力する。

#### 10-2. 現状の問題点とメリットを説明する

スキャン結果から以下を整理してユーザーへ提示する。

| 観点 | 説明すること |
|---|---|
| グループ未所属 / 未マネージド環境 | 環境グループにはマネージド環境しか入れられないため、先に対応が必要 |
| 共有上限 | 無制限のままだと意図しない全社共有が起きる |
| コネクタ ポリシー | クラシック DLP は既定許可で新規コネクタが素通りする。ACP は default-deny で新規コネクタも自動でブロックされる |
| ライセンス | マネージド環境のアプリ・フローを使うユーザーには **Power Apps Premium 等のスタンドアロン ライセンス**が必要。シード ライセンスでは不可 |
| Copilot クレジット | テナントの保有数と環境ごとの割り当て合計を示し、超過していれば配分案を提案する |
| **使われていない環境** | グループへ入れる前に削除を提案する。**削除すれば Dataverse 容量を 〇〇MB 削減できる**と具体的な数値で示す（スキャン出力の「使われていない環境」セクション） |
| **既存環境の割り当て先** | コネクタ制限がゆるくアプリが多数ある環境は **AI CoE 内製開発グループの「開発」**として提案する（市民開発者グループの厳しいルールでは既存アプリが止まるため） |
| **本番環境** | AI CoE 内製開発の本番は条件が厳しいため**原則新規作成**。検証（UAT）環境はオプション。ただし**「アンマネージド カスタマイズ不可」が既に ON の既存環境があれば、それを本番として採用する** |

ライセンス不足がある場合は、**不足数と対象者を具体的に示してから**次へ進む。
削除候補を示すときは、**削除は取り消せないこと・所有者への確認とバックアップが先に必要なこと**を必ず伝える。
削除の実行はスクリプト化していない（提案までを自動化し、管理センターで人が実行する）。

#### 10-3. 希望を確認して移行プランを作成する

AskUserQuestion で未確定事項を確認する（既存グループの扱い / 削除候補の環境を実際に削除するか /
本番環境を新規作成するか既存を採用するか / 検証（UAT）環境を作るか / 既定環境の扱い / 開発者環境の開放範囲 /
追加で許可したいコネクタ / Copilot クレジットの配分 / トレーニング環境のリセット周期）。
決定内容を JSON にまとめ、移行プランを生成する。

```bash
python generate_migration_plan.py --scan-file scan.json --decisions-file decisions.json --output admin-migration-plan.md
```

#### 10-4. レビュー後に適用する

`admin-migration-plan.md` をユーザーがレビューし、**承認を得てから**適用する。
使われていない環境の削除（プランの手順 0）は、マネージド環境化とグループ割り当ての**前に**行うと
ライセンスと Dataverse 容量を無駄にしない。削除は取り消せないためスクリプト化せず、管理センターで人が実行する。
マネージド環境化はグループへ入れる前提条件なので先に実行する。

```bash
python set_managed_environment.py --environment-id <ENV_ID> --apply
python apply_environment_strategy.py --tenant-id <TENANT_ID>                    # dry-run（差分の確認）
python apply_environment_strategy.py --tenant-id <TENANT_ID> --apply            # グループ作成・ルール発行・テナント設定
python enable_dataverse_search.py --apply
python set_environment_capacity.py --tenant-id <TENANT_ID>                           # 保有数と環境別割り当ての確認
```

全環境をグループへ割り当てるには、各環境を
`PATCH {BAP}/.../environments/{ENV_ID}` の `properties.parentEnvironmentGroup.id` で設定する
（既定環境は `apply_environment_strategy.py` が自動で行う）。
グループ ルールを個別に調整する場合は `set_environment_group_rules.py` を使う。

```bash
python set_environment_group_rules.py --tenant-id <TENANT_ID> --environment-group-id <GROUP_ID> --list
python set_environment_group_rules.py --tenant-id <TENANT_ID> --environment-group-id <GROUP_ID> `
  --rule "Sharing/App/MaximumShareLimit=10" `
  --policy-rule "CodeAppsFeature/PowerApps_AllowCodeApps=true" --apply
```

ルール ID の一覧は [rule-catalog.md](references/rule-catalog.md)。
Copilot クレジットの環境別配分はグループ ルールに無いため、`set_environment_capacity.py` で個別に行う。
割り当て合計がテナントの保有数を超えても API は成功するので、適用前に必ず一覧で確認する。

```bash
python set_environment_capacity.py --tenant-id <TENANT_ID> --environment-id <ENV_ID> --quantity 500 --apply
```

Dataverse 容量（Database / File / Log）はテナント プールから消費ベースで引かれるため、環境ごとの配分 API は無い。
`--storage` で環境ごとの消費量を一覧し、逼迫している環境があれば不要な環境の削除やログ保持期間の短縮で対処する。

```bash
python set_environment_capacity.py --tenant-id <TENANT_ID> --storage
```

#### 10-5. 不足している環境を作成してパイプラインを繋ぐ

環境名は都度考えず、ブループリントの `namingConvention` に従って機械的に決める。
`{orgCode}-{groupCode}-{workload}-{stageCode}` の形にすると、名前だけでどのグループのどの段階かが判別でき、
同じ workload の Dev / Test / Prod がパイプラインの対応関係として読める。

```bash
python environment_naming.py --preview                                          # 生成される名前の確認
python create_environments.py --tenant-id <TENANT_ID>                           # dry-run（不足分の一覧）
python create_environments.py --tenant-id <TENANT_ID> --apply                   # 作成 + グループ割り当て
```

`location` / `baseLanguage` / `currency` は作成後に変更できないため、ブループリントの
`environmentDefaults` で先に固定しておく。

作成した開発環境とテスト環境をパイプラインで繋ぐ。ブループリントの `pipelines` に
パイプライン ホスト環境・開発環境・ステージを書いてから実行する。

```bash
python setup_pipeline.py --host-url <PIPELINE_HOST_URL>                         # dry-run
python setup_pipeline.py --host-url <PIPELINE_HOST_URL> --apply
```

#### 10-6. Code Apps の CSP を設定する

CSP（コンテンツ セキュリティ ポリシー）は環境ごとの Dataverse 組織設定で、管理センターの
「App（モデル駆動）」タブの設定が **Code Apps にも適用される**。既定モードで変更できるのは
`Frame-Ancestor`（アプリの埋め込みを許可する親サイト）だけで、それ以外のディレクティブは
Strict CSP を有効にした場合にのみ設定できる。

```bash
python set_content_security_policy.py --environment-url <ENV_URL>                             # 現状確認
python set_content_security_policy.py --environment-url <ENV_URL> --enable `
  --directive "Frame-Ancestor='self',https://*.powerapps.com" --apply
```

いきなり強制すると既存アプリが白画面になるため、まず `--report-uri` で report-only の違反を集め、
違反が出ないことを確認してから `--enable` する。

#### 10-7. 個人開発者環境・市民開発者環境のコネクタを決める

どちらも ACP は同じ `microsoft-first-party` プロファイル（Microsoft のみ。サードパーティ・レガシー不可）を
**環境グループ単位**で適用する。プロファイルの `reviewConnectors`（個人向けサービスに繋がるコネクタなど
判断が分かれるもの）は AskUserQuestion で採否を確認し、決まったものだけを
`apply_acp_profile.py --include-connector` / `--exclude-connector` で調整する。

#### 10-8. 利用ガイドラインを公開して配布する

利用可能なコネクタ・利用できないコネクタとその理由・追加申請フロー・認定プロセス・共有上限・
Copilot クレジット・問い合わせ先をまとめたページを作成する。
**ページ作成は `sharepoint` スキルへ委譲**し、構成は
[environment-strategy.json](references/environment-strategy.json) の `guideline.sections` に従う。

公開後、そのページ URL を各環境グループの **メーカー ウェルカム コンテンツ** ルールに設定する。

```bash
python set_environment_group_rules.py --tenant-id <TENANT_ID> --environment-group-id <GROUP_ID> `
  --welcome-markdown-file welcome.md --welcome-url <GUIDELINE_URL> --apply
```

## 他スキルからの呼び出し

| 呼び出し元 | タイミング | 実行するもの |
|---|---|---|
| `architecture` | 構成確定後・実装着手前 | Step 1 → Step 2 |
| `standard` | 新しい環境で作業を開始するとき | Step 1 |
| `code-apps` | 初回デプロイ前 | Step 1（`--require-managed --require-code-apps`） |
| `copilot-studio` / `copilot-studio-v2` | エージェント作成前・MCP ツール追加前 | Step 1（`--require-mcp`）→ Step 2 → Step 6 |
| `mcp-server` | カスタムコネクタ登録前後 | Step 2 → Step 5 → Step 6 |
| ユーザー依頼 | DLP / ACP の推奨設定・移行 | Step 7（推奨プロファイル）/ Step 8（DLP → ACP 移行） |
| ユーザー依頼 | 環境戦略の策定・環境の見直し | Step 10 |
| `sharepoint` | 利用ガイドライン ページの作成依頼を受ける側 | Step 10-6 |

## 参考リンク

- [データ ポリシー（DLP）](https://learn.microsoft.com/power-platform/admin/wp-data-loss-prevention)
- [マネージド環境の概要](https://learn.microsoft.com/power-platform/admin/managed-environment-overview)
- [Advanced connector policies](https://learn.microsoft.com/power-platform/admin/advanced-connector-policies)
- [ACP をプログラムから管理する](https://learn.microsoft.com/power-platform/admin/programmability-tutorial-manage-advanced-connector-policies)
- [Power Platform 管理者ロール](https://learn.microsoft.com/power-platform/admin/use-service-admin-role-manage-tenant)
- [環境グループ](https://learn.microsoft.com/power-platform/admin/environment-groups)
- [環境グループのルール](https://learn.microsoft.com/power-platform/admin/environment-groups-rules)
- [メーカー ウェルカム コンテンツ](https://learn.microsoft.com/power-platform/admin/welcome-content)
