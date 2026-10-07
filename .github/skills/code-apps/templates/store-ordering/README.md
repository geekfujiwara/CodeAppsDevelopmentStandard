# 店舗発注システム（Code Apps テンプレート）

コンビニなど小売店の店舗で使われている発注端末を模した、**昔ながらの業務端末風 Web UI** の Power Apps Code App と、
その元になる Dataverse のテーブル・合成デモデータ一式です。`generic-base` を継承します。

- 単品発注（夕方便・朝便）→ 確認 → 送信、発注照会と取消、在庫照会（直近 14 日の販売と廃棄）、天気・催事。F1〜F10 キーで操作。
- 同じテーブルを Cowork の「店長アシスト」プラグイン（cowork スキルの `templates/store-assist-plugin`）が読み、店長が承認した発注を登録すると、この端末の発注照会に並ぶ。
- データはすべて**架空店舗の合成データ**（50 品目 × 90 日・天気・周辺イベント・在庫。シードから決まる）。単位（個・本・パック）をデータに持つ。

## 画面

| 画面 | ルート | 画面 ID | 内容 |
|---|---|---|---|
| 業務メニュー | `#/menu` | MN-000 | 1〜4 の業務・本日の状況 |
| 単品発注 | `#/order` | OD-110 | 便・分類タブ・過去 7 日の販売・在庫・廃棄率・欠品・発注数 → 確認 → 送信 |
| 発注照会 | `#/orders` | OD-210 | 本日以降の発注・明細・取消（締め時刻まで） |
| 在庫照会 | `#/stock` | ST-310 | 在庫・本日残りの見込み・過不足・直近 14 日の販売と廃棄（文字の棒グラフ） |
| 天気・催事 | `#/weather` | WX-410 | 週間予報（前日差）・周辺の催事・直近 7 日の天気 |

初回起動で「操作説明」（5 枚）を自動で表示する（localStorage `order-terminal-help-seen`）。

## 開始の手順

```powershell
# 0. 生成（テンプレートの questions を 1 問ずつ聞いて answers.env に入れてから）
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/code-apps/templates/store-ordering --target . --env answers.env --write-env .env

npm install --no-audit --no-fund

# 1. 環境チェック（admin スキル。既定環境でない・Dataverse・Code Apps が有効）
python .github/skills/admin/scripts/check_environment.py --environment-id $env:ENV_ID --require-code-apps

# 2. デモデータを作る（シードから決まる。数秒）
npm run data:seed      # 合成データに「気づける癖」が出ているかも表示
npm run data:export    # Dataverse に入れる形（demo-data/export/<シナリオ>.json）

# 3. Dataverse のソリューション・8 テーブル・デモデータ（べき等）
npm run dv:setup
npm run dv:verify

# 4. Code App（code-apps スキルの手順 Step 1〜6）
python .github/skills/code-apps/scripts/setup_connection_reference.py --write-env .env
npx --no pa app init --environment-id $env:ENV_ID --display-name "店舗発注システム" --app-type CodeApp
npm run deploy -- --solution-id $env:SOLUTION_ID     # 初回。データソース未追加でもビルドできる
python .github/skills/code-apps/scripts/add_data_source.py --connector dataverse --connection-ref $env:CONNECTION_REFERENCE_LOGICAL_NAME --solution-id $env:SOLUTION_ID
npm run deploy

# 5. 実データでの確認（アプリと同じ列・フィルターで取得し、発注の登録 → 取消 → 削除を再現）
npm run dv:check-terminal
```



## デモの操作

| コマンド | 内容 |
|---|---|
| `npm run dv:reset` | 発注を消し、シナリオを書き直す（デモの前に） |
| `npm run dv:state` | 今のシナリオ・デモ時刻・発注件数 |
| `python -u scripts/dataverse/demo_data.py clock --time 10:30` | デモの時刻を変える（締め時刻を過ぎた状態を見せる。引数なしで 08:30 に戻す） |
| `python -u scripts/dataverse/demo_data.py load --scenario demo-sunny-hot` | シナリオの切り替え（`demo-data/scenarios/*.json`） |
| `npm run dv:role` | ロール「店長アシスト デモ利用者」（全テーブルの読み取り＋発注の作成だけ） |

## 発注ルール

| 便 | 納品 | 締め | 対象 |
|---|---|---|---|
| 夕方便 | 当日 16:00 | 当日 10:00 | リードタイム 0 で、在庫の「夕方便」が「可」の品目 |
| 朝便 | 翌日 06:00 | 当日 21:00（常温・冷凍は 11:00） | すべて |

- 数量は発注単位の倍数・1 品目 200 個まで。発注番号は `PO-<納品日>-<便>-<連番>`、明細は本文（「コード 品名 ×数」の行）。
- デモの「今」はデモ設定（`${PUBLISHER_PREFIX}_tksetting`）の営業日・業務時刻。

## 権限

| 操作 | 必要な権限（`${PUBLISHER_PREFIX}_tkorder`） | 「店長アシスト デモ利用者」ロール |
|---|---|---|
| 照会・発注の送信 | 読み取り・作成 | ✅ |
| 取消 | 書き込み | ❌（Cowork に更新させないため付けていない） |

デモ利用者で取消すと「発注の更新（取消）の権限がありません」と表示する。

## 開発

```powershell
npm run dev:mock     # 模擬データで起動（demo-data/export から src/mock/mock-data.json を作り、VITE_USE_MOCK=1）
npm run predeploy
```

- 模擬データの分岐は `import.meta.env.DEV` でも絞っているので、本番のビルドには入らない。送信・取消はブラウザーのメモリだけで動く。
- Dataverse へのアクセスは [src/lib/store-api.ts](src/lib/store-api.ts)（クライアントは遅延版の [dataverse-client.ts](src/lib/dataverse-client.ts)）、発注ルールは [src/lib/order-rules.ts](src/lib/order-rules.ts)、見た目は [src/terminal.css](src/terminal.css)。
- テーブル定義は [dataverse/schema.json](dataverse/schema.json)（唯一の定義元）。合成データの生成は [demo-data/](demo-data/)（Node.js 22.18 以上。`node:sqlite` と型の除去を使う）。

## 構成ファイル

| ファイル | 中身 |
|---|---|
| `.env` | `VITE_*`（接頭辞・Dataverse URL・アプリ名）と共通の環境値。コミットしない |
| `power.config.json` / `.power/` / `src/generated/` | `pa app init` / `add data-source` の生成物。手で直さない |
| `demo-data/store.db`・`demo-data/export/` | 合成データ（生成物。コミットしない） |
