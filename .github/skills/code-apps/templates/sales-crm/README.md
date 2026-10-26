# sales-crm — 営業支援 CRM テンプレート

営業が **目標を達成できる** ことと、マネージャーが **チームの障害を取り除ける** ことに絞った Code Apps テンプレート。
`generic-base` を継承（`scaffold.json` の `extends`）するため、1 コマンドで完全なプロジェクトが生成される。

| 画面 | 対象 | できること |
|---|---|---|
| チーム ダッシュボード `/dashboard` | マネージャー | 期間・範囲（組織 / 自分のチーム）ごとの目標・受注・着地見込み・カバレッジ、メンバー別達成、障害ボード（期限超過・停滞・次アクション未設定・期限切れ活動）から 1on1 設定 / Teams 声かけ / 支援の記録 / Cowork 依頼 |
| 営業ホーム `/my` | 営業 | 目標までの残り、優先商談と次の一手（日程調整・メール下書き・商談更新）、期限切れ活動の完了、活動報告、Cowork 日報 |
| 商談 `/opportunities` | 共通 | 検索・ステージ/担当者フィルター・件数/合計、詳細（ステージ矢羽・インライン編集・関連活動・削除確認） |
| リード / 営業活動 / 取引先企業 / 取引先担当者 / 売上目標 | 共通 | 設定駆動の一覧・作成・詳細インライン編集・削除（`src/crm/schema.ts`） |

Outlook / Teams への連携は **下書きを開くディープリンク**（送信・予定作成は利用者が確認して実行）。
予定表・メール・チャットからの報告は Cowork プラグイン [`cowork/templates/sales-crm-plugin`](../../../cowork/templates/sales-crm-plugin/README.md) が担い、同じ Dataverse を共有する。

## 使うテーブル（`{prefix}` = `PUBLISHER_PREFIX`）

`{prefix}_crmopportunity` / `{prefix}_crmlead` / `{prefix}_crmactivity` / `{prefix}_crmsalestarget` / `{prefix}_crmfiscalperiod` と、
標準の `account` / `contact` / `systemuser`（上長 = `parentsystemuserid` で「自分のチーム」を判定）。
既存テーブルがあればそのまま使い、無ければ `scripts/setup_crm_dataverse.py --apply` で作成する。

### ステージはBPFではなく通常テーブルのChoice列

業務テーブルは通常のDataverseテーブル（`TableType=Standard`、`IsBPFEntity=false`、
`IsActivity=false`）。商談の `{prefix}_stage` はChoice（Picklist）列であり、
矢羽はReactの表示部品で、Business Process Flow（BPF）ではない。
ステージ変更は商談本体の該当列だけを更新する。`processstage`、BPFインスタンス、
`activestageid`、進捗履歴を変更先にしない。Code AppsとCopilot Studioの両方で同じ更新先を使う。

`setup_crm_dataverse.py` は確認時・構築前に既存テーブルの種類とステージ列を検証し、
BPF・活動・非StandardテーブルやChoice以外のステージ列を検出すると書き込み前に停止する。
既存の別種テーブルを自動変換・削除しない。APIの403/500も「テーブルなし」と扱わない。
同期商談規則と自動履歴プラグインを標準同梱する（`server/SalesCrm.Plugins`）。
履歴は通常の従属テーブル `{prefix}_crmstagehistory` で、本体更新と同じトランザクションで生成する。
「進捗履歴は…直接変更できません」という独自プラグインのエラーはBPF使用の証拠ではない。
実際の更新テーブル・操作・送信列を確認し、正しい商談更新でも失敗する場合は
プラグイントレースと実ツールの入出力で調査する。履歴保護を解除して回避しない。

## 空のディレクトリから始める

```powershell
# 0. 作業ルートに .github/（このリポジトリのスキル）を置く。.git / .github だけのフォルダは「空」とみなされる
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/code-apps/templates/sales-crm --target . --dry-run   # 確認後 --dry-run を外す

Copy-Item .env.example .env                       # 共通値と VITE_* を入力
python scripts/setup_crm_dataverse.py             # 読み取り専用の確認。空環境は --apply（デモは --apply --seed-demo）
npm install --no-audit --no-fund
npx --no pa auth status                           # 対象テナントのアカウントか確認（--no で別パッケージの取得を防ぐ）
npx --no pa app init --environment-id <ENV_ID> --display-name "Sales Command Center" --app-type CodeApp --non-interactive
npm run deploy -- --solution-id <SOLUTION_ID>     # 初回。データソース追加前でもビルドできる
# 専用接続の作成・ブラウザ認証・Edge プロファイルの承認後に実行
python .github/skills/code-apps/scripts/setup_connection_reference.py `
  --create-connection --allow-interactive --write-env .env
python .github/skills/code-apps/scripts/add_data_source.py --connector dataverse `
  --allow-interactive
npm run deploy                                    # 2 回目以降
```

## 標準の商談規則・自動履歴を配備する

初回Code Apps pushを止めず、その後の標準工程として実行する。scaffoldはソースを生成するだけで、
Dataverseへの配備は変更承認後に行う。WindowsのPowerShellと.NET SDKが必要。

```powershell
# 新規配備のみ: ローカルで署名鍵を生成し、プラグインと34項目のC#試験をビルド・実行
powershell -NoProfile -File scripts/build_opportunity_rules.ps1 -InitializeSigningKey
# 既存配備では元のSalesCrm.Plugins.snkを安全に復元して、同フラグなしでビルド
python scripts/deploy_opportunity_rules.py --expected-url <DATAVERSE_URL>
# スキーマ・7同期step・プラグイン更新の承認後
python scripts/deploy_opportunity_rules.py --expected-url <DATAVERSE_URL> --apply
# 合成商談の作成・更新・削除の承認後（既存業務商談は変更しない）
python scripts/verify_stage_update.py --expected-url <DATAVERSE_URL> --apply
```

- Createでステージ省略/nullなら見込み。明示ステージは維持し、初期履歴も生成する。
- ステージ変更時のみ履歴を1件生成。同値再送では追加せず、失敗時は本体・履歴ともrollbackする。
- 受注は確度100、失注は0で理由必須。実クローズ日を補完し、再開時はクリアする。
- UIの失注矢羽は理由入力の編集へ移り、理由とステージを一緒に保存する。
- 履歴の直接Create/Update/Deleteを保護し、本体削除・所有者連動だけ従来のcascadeを許可する。
- 自動Createの正当性はHMAC-SHA256で履歴GUID・内容・本人・correlation・5分の期限に束縛する。
  搬送専用の任意String(128)列 `{prefix}_historypermit` をPreOperationで検証・除去する。
  フォーム・AIの更新列に含めず、監査無効、保存値はnull。tagや祖先SharedVariablesには書き込まない。
- 要求署名鍵はDataverse secure configurationにランダム生成し、7stepで共有・再利用する。
  `.env`・ソース・ログ・検証JSON・Gitへ鍵を書かない。ビルド用の`.snk`もGit除外・安全にバックアップする。
- secure configurationはソリューションexportに含まれない。移行先は承認後に登録スクリプトで生成・結線する。
- 再配備は既存の通常テーブル種別・Choice列・署名列型・鍵構成・assembly署名identityを事前検証する。
  他プラグインを含む既存assemblyは上書きせず停止する。元ソースを含む専用配備手順を使う。
- 権限は本人contextを維持する。履歴のCreate・Read・関連商談へのAppend/AppendTo等は
  Dataverseのセキュリティロール設計で付与し、管理者権限やプラグイン回避を利用者に要求しない。

仕様根拠: [プラグイン登録・secure configuration・同期ステージ](https://learn.microsoft.com/power-apps/developer/data-platform/register-plug-in)。
secure configurationはstepのconstructor引数で受け取り、PreOperationでTargetを変更する。

### Copilot Studio / Coworkのステージ更新契約

本人接続のDataverse MCPから商談LogicalName `{prefix}_crmopportunity` を検索し、
依頼されたID・変更先・失注理由を確定後、`{prefix}_stage`（失注時は`{prefix}_lossreason`も）を更新する。
BPF・表示ラベル・履歴・署名列は更新しない。
履歴検索は `_{prefix}_opportunityid_value` のLookup列で絞り、
`{prefix}_fromstage` / `{prefix}_tostage` / `createdon` を読む。
読み戻しで本体と履歴1件の一致を確認する。応答エラー時は再更新せず状態照合・調査に止める。
SDKの13項目成功はMCPの実会話成功ではない。本人接続でのCreate・ステージ変更・同値再送・
履歴保護を実環境の受け入れゲートとする。診断で一時的に有効化したtraceは検証後に元へ戻す。

> データソース未追加の状態でも初回 push できるよう、`src/lib/dataverse-client.ts` は生成サービスを
> `import.meta.glob` で遅延解決する。未追加のまま開くと各画面に追加手順が表示される。
> ソリューションの GUID は初回 push より前に確定する。専用接続は init 後に作成する。
> 既存接続を明示的に選ぶ場合は `--create-connection` の代わりに `--connection-id`。
> 既存の異なるバインドは変更せず、新しい `--logical-name` を明示して専用参照を作る。
> `.env` は実行アプリを優先する。サブフォルダーへ生成した場合はスキルへのパスを読み替える。

## 検証ゲート

1. `python scripts/setup_crm_dataverse.py` でスキーマを照合する。不足テーブルは承認後に `--apply`。
2. `python scripts/verify_crm_crud.py --expected-url <DATAVERSE_URL>` で主キー・EntitySetName・
   書き込み列のMaxLength・LookupのNavigationPropertyとReferencingAttributeを読み戻す。既定は書き込まない。
3. 一時データの作成・更新・削除の承認後に同コマンドへ `--apply` を付ける。
   公式Python SDKを使用し、固有マーカーの7レコードだけを作り、金額・Choice・Lookupと更新を読み戻す。
   失敗時も作成済みIDだけを逆順削除し、不在を確認する。cleanup失敗は対象ID付きのエラーで止める。
4. predeploy / lint / build / push を確認する。生成サービスの引数順と `organization` をラッパーと照合する。
5. 配信後の接続同意、一覧表示、画面経由のテスト用作成・編集・削除とcleanupを別に確認する。
   SDKのCRUDやbuildの成功をUI試験の合格とは扱わない。権限別・承認・AI試験も別ゲート。

Python SDKが未導入の場合は実際のimport失敗を確認した後、
`python -m pip install --pre PowerPlatform-Dataverse-Client` を使用する。
本試験は既存業務レコードを変更せず、デモデータも投入しない。

## 運用オプション

| 機能 | コマンド | 内容 |
|---|---|---|
| 朝の営業ダイジェスト | `python scripts/deploy_manager_digest_flow.py --apply --run-now` | 平日朝に、期限超過・次アクション未設定の商談と期限切れの活動をマネージャーへメール。Power Automate の定期フローをソリューション内に作成し、Outlook 接続参照は既存を流用する。障害 0 件の日は送らない |
| 上長の同期 | `python scripts/sync_manager_hierarchy.py`（反映は `--apply`） | Entra ID の上長を Dataverse の `parentsystemuserid` へ同期。「自分のチーム」表示と、Dataverse の階層セキュリティ（上長が部下のレコードを参照）の前提になる |

> 階層セキュリティ自体の有効化とセキュリティ ロールの設計は [dataverse スキルのセキュリティ ロール](../../../dataverse/references/security-role.md) で行う。
> 営業は「ユーザー（自分のレコード）」、マネージャーは「階層（部下のレコード）」で参照できる構成を基本にする。

## カスタマイズ

| 変更したいもの | 場所 |
|---|---|
| テーブル・列・選択肢・Lookup の `@odata.bind` 名 | `src/crm/schema.ts`（`scripts/setup_crm_dataverse.py` の定義と揃える） |
| 達成・停滞・健全性の判定 | `src/crm/metrics.ts`（停滞日数は `.env` の `VITE_CRM_STALL_DAYS`） |
| Cowork への依頼文 | `src/crm/prompts.ts`（プラグインのスキル description のトリガー語と揃える） |
| 通貨・ロケール | `.env` の `VITE_CRM_CURRENCY` / `VITE_CRM_LOCALE` |
| 配色 | `styles/index.pcss`（[デザインテンプレート集](../../references/design-templates.md)） |

## セキュリティ

- 行の可視範囲は Dataverse のセキュリティ ロールに従う（アプリ側でデータを絞っても権限の代わりにはならない）。
- メール・予定の自動送信は行わない。Cowork 側も書き込み・送信前に確認を取る。
> **認証の正常フロー**: 開始手順の `.env`・依存準備後、業務APIや初回デプロイより前に
> [認証運用](../../references/authentication-lifecycle.md)の `setup_code_app_auth.py` を実行し、
> 本人が承認したアカウント・Edgeプロファイル・必要時の追加認証許可を保存する。
> app init後に再実行して接続resourceまで確認する。以後の `npm run deploy` はキャッシュ優先で、
> 追加認証要求だけ保存済み許可に従って復旧する。CLIのプロファイル強制指定はできない。
