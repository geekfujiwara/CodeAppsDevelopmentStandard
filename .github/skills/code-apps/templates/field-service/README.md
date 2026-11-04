# フィールドサービス管理 — Scaffold テンプレート

顧客からの受付、作業オーダー、担当者スケジュール、顧客署名、日報を一元管理する Power Apps Code App。
`generic-base` を継承し、React / TypeScript / Tailwind CSS / React Flow / Dataverse で構成します。
既存アプリの ID・接続・認証情報・業務レコードは含みません。生成先ごとに新しい Code App を初期化してください。

## Scaffold

開発標準を取得したワークスペースのルートで実行します。生成先は空のワークスペースルートを推奨します
（`.github`・`.git`・`.vscode`・`.env` は存在していても構いません）。
別フォルダーへ生成した場合、以下の `.github` スクリプトへのパスは標準の配置に合わせてください。

```powershell
python .github\skills\update-skills\scripts\scaffold_from_template.py `
  --template .github\skills\code-apps\templates\field-service `
  --target . --var PUBLISHER_PREFIX=fsdemo --dry-run
# 計画確認後、同じコマンドから --dry-run を外して生成
```

`PUBLISHER_PREFIX` は承認済みの発行者に合わせた 2〜8 文字の英小文字・数字（先頭は英字）。
`.env.example` の `PUBLISHER_PREFIX` と `VITE_PUBLISHER_PREFIX` に同じ値が展開されます。
生成先の既存 `.env` は保持されるので、必要な項目だけ `.env.example` から追記してください。

## 含まれる機能・画面

| 画面 | パス | 機能 |
|---|---|---|
| ダッシュボード | `/dashboard` | 担当状況・KPI。デモのコール／オーダーは通常集計から除外 |
| サービスフロー | `/service-flow` | 受付・現場対応・完了／報告のカテゴリグループ、ズーム・パン・ミニマップ |
| コール管理 | `/calls` | 故障受付・検索・詳細／編集・作成・削除、デモ表示切替 |
| 作業オーダー | `/work-orders` | 作業内容・担当者・状態・顧客署名、デモ表示切替 |
| スケジューリング | `/scheduling` | 日／週表示、担当者別予定、未割当オーダーのドラッグ＆ドロップ |
| 日報 | `/daily-reports` | オーダー連携、全件完了・署名を確認した提出／承認 |
| ナレッジ・修理事例 | `/knowledge`, `/reports` | 対応知識・修理履歴 |
| 年間レビュー | `/annual-review`, `/annual-kpi`, `/consumption`, `/recommendations` | KPI・消費実績・改善提案 |
| 顧客分析 | `/customer-360` | 顧客単位の情報・履歴 |
| マスタ | `/customers`, `/equipment`, `/contracts`, `/engineers` | 顧客・機器・保守契約・担当者 |

初回は 5 枚のガイドを表示し、9 ステップの読み取り専用ツアーを開始できます。
**「使い方」ボタンはヘッダー右上、テーマ切替の右側**に常設します。
ツアーはレコードを作成・送信・更新しません。再表示の判定はブラウザーの localStorage です。

## Dataverse テーブル

`{prefix}` は生成時の `PUBLISHER_PREFIX`。システムテーブル `systemuser` はプレフィックスなしです。
列と Choice 値の定義は [scripts/setup_field_service.py](scripts/setup_field_service.py) が正です。

| 論理名 | 用途 |
|---|---|
| `{prefix}_customer` | 顧客・住所・SLA |
| `{prefix}_engineer` | 担当者・スキル・稼働状態・ユーザー／エリア連携 |
| `{prefix}_area` | 担当エリア |
| `{prefix}_equipment` | 機器・稼働状態・設置日 |
| `{prefix}_maintenancecontract` | 保守契約 |
| `{prefix}_call` | コール受付 |
| `{prefix}_workorder` | 作業・予定・担当者・署名 |
| `{prefix}_maintenancereport` | 修理履歴 |
| `{prefix}_dailyreport` | 日報 |
| `{prefix}_consumptionrecord` | 消費実績 |
| `{prefix}_annualkpi` | 年間 KPI |
| `{prefix}_recommendation` | 改善提案 |

## セットアップ・初回デプロイ

対象環境・発行者・ソリューションを決め、認証／書き込みの承認を得てから実行してください。
既存の発行者と、その発行者を使用するソリューションが必要です。構築スクリプトは発行者・ソリューションを新規作成しません。
スキーマ作成にはカスタマイズ権限、アプリ利用者には対象テーブルの必要な CRUD 権限が必要です。
このテンプレートは管理者権限や業務ロールを自動付与しません。

```powershell
# 既存 .env がない場合だけコピーし、接続先・ソリューション・表示名を入力
Copy-Item .env.example .env
npm install --no-audit --no-fund
python -m pip install -r scripts\requirements.txt

# 本人のアカウント・Edge プロファイル・追加認証の継続許可を確認後
python .github\skills\code-apps\scripts\setup_code_app_auth.py `
  --account <approved-upn> --edge-profile "Profile N" --approve-interactive

# 計画／既存スキーマ確認（既定は書き込まない）
python scripts\setup_field_service.py
# 承認後にテーブル・列・リレーションを構築。合成マスタ投入は明示指定
python scripts\setup_field_service.py --apply --seed-demo

# 既存アプリの power.config.json はコピーしない。対象環境で新規作成
npx --no pa app init --environment-id <ENV_ID> `
  --display-name "フィールドサービス管理" --app-type CodeApp --non-interactive
npm run deploy -- --solution-id <SOLUTION_ID>

# 専用接続と接続参照を準備（接続作成／本人認証の承認後）
python .github\skills\code-apps\scripts\setup_connection_reference.py `
  --create-connection --allow-interactive --write-env .env
python .github\skills\code-apps\scripts\add_data_source.py --connector dataverse --allow-interactive
npm run deploy
```

初回 push は生成サービスの追加前でもビルドできます。未接続時はデータ取得エラーとして
接続手順を表示し、データが存在するようには見せません。`organization` は Power Apps ホストから取得し、
生成サービスの `*WithOrganization` メソッドへ渡します。
SDK 管理ファイルを手で追加・修正しないでください。

担当者のユーザー紐付けは担当者画面で対象の Dataverse ユーザーを選択してください。
合成デモ担当者に実ユーザーを勝手に紐付けません。共有は必要な利用者への `play` 権限に限定してください。

## デモ予定の自動補充（任意）

```powershell
python scripts\deploy_demo_schedule_flow.py             # 計画・事前確認
python scripts\deploy_demo_schedule_flow.py --apply --run # 承認後に配備・初回実行
```

- 日本時間の毎朝 6 時に実行し、稼働中担当者ごとに未来の未完了予定を 2 件維持。
- 未割当・日付未設定のデモオーダーを 3 件維持。割当済み・完了済みのオーダーを書き戻しません。
- 名称は「定期保守｜顧客名｜予定日」等、業務内容が分かる形式。
- マスタがなければ [scripts/setup_field_service.py](scripts/setup_field_service.py) の合成デモ投入を先に実行。
- 特定年度・日付の過去実績を自動投入しません。既存環境の過去履歴・顧客名も同梱しません。
- フローの接続は対象環境の本人の権限で準備し、配備後は実行履歴と Dataverse の予定を読み戻してください。

デモは説明／作業内容等のマーカーで判別するため、専用のデモ列ではありません。
スケジューリングでは未割当デモを表示します。通常のコール／オーダー一覧は「デモデータを含める」で表示できます。

## カスタマイズ

| 設定／ファイル | 用途 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`, `VITE_CODEAPPS_APP_SUBTITLE`, `VITE_CODEAPPS_DOCUMENT_TITLE` | アプリ表示名 |
| `src/config.ts` の `NAV_SECTIONS` | ナビゲーション（JSON の env 変数では管理しない） |
| `src/guide-config.ts` | ガイド 5 枚とツアー 9 ステップ |
| `VITE_FEATURE_MAPS=false` | 地図の任意機能。既定 OFF。顧客住所を Google に渡すため、外部送信と CSP の承認が必要 |
| `styles/index.pcss` | 配色・テーマ |

地図を有効化する前に開発標準の `configure_code_app_csp.py --directive Frame-Src --source https://www.google.com`
で必要な許可を承認付きで設定してください。`npm run predeploy` が `--assert` で実際の許可状態を検証します。
`VITE_*` は公開ビルド設定です。トークン・パスワード・シークレットは入れないでください。
基盤のテレメトリは既定では外部へ転送せず、サニタイズしたブラウザーイベントのみです。

## 検証

```powershell
npm run build              # データソース未追加でも成功すること
npm run lint
npm run test:template      # 右上の使い方ボタン、遅延接続、地図の opt-in
python -B -m unittest discover -s scripts\tests -p "test_*.py"
npm run predeploy          # .env / 初期化済みアプリがない場合は停止すること
```

CI は実環境に接続せず、別プレフィックスでの生成・build・lint・契約テストを実行します。
新しい環境での CRUD、署名付き日報、ドラッグ＆ドロップ後の保存、
フローの初回／再実行、実プレイヤーでのガイド・React Flow 表示は導入時に別途確認してください。

### 構成上の注意

- 発行者を変える場合、生成時のプレフィックス・スキーマ・`VITE_PUBLISHER_PREFIX` を揃えてください。
  デプロイ前の [scripts/check-field-service.mjs](scripts/check-field-service.mjs) が不一致を止めます。
- 一覧は継続リンクで全ページ取得します。トークン循環や 20 ページ超過はエラーとし、不完全な成功結果は返しません。
- 詳細ペインの長文は通常の縦スクロールに閉じ込め、カードの可変カラムは `minmax(0,1fr)` を使用します。
  既知のレイアウト問題は標準の `pre-deploy-check.mjs` でも毎回検出します。
- ツアー対象を削除したのに検証が通る場合、CSS セレクターの文字列を JSX 属性と誤認していないか確認してください。
  `check-field-service.mjs` は属性を抽出して検証し、対象を実際に削除する回帰テストでも停止を確認します。
