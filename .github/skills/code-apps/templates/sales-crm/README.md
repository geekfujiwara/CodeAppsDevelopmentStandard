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
