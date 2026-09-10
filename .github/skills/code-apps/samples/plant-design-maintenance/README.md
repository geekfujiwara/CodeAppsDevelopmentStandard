# Plant Design & Maintenance

JSON 正本のプラント設計と設備起点の保守履歴を統合した React / Vite サンプル。
既存の設計・保守アプリから画面、検証器、合成モデル、回帰テストを抽出したものです。
実環境の資格情報、接続定義、業務レコードは同梱しません。

## 含まれる機能

- 敷地・除外区域・ユニット・配管／電源端点、配置・回転・複製・削除、Undo / Redo、JSON 入出力。
- ギャラリーからの配置、接続候補の選択・確認、3D と平面配置図。
- AI 候補の変更前／変更後の同縮尺2カラム比較、確定による下書き反映、取り消し。小画面は縦並び。
- 3種類の合成プラント、設備・部位選択、期間／未解決フィルター、故障件数ヒートマップ、故障と修理の相互参照。
- 50 MB 以下の自己完結した静的 GLB をローカルで閲覧。実資料への名前一致による自動紐付けはしません。
- Dataverse の共有改訂・提案、非同期 AI 要求と結果照合、出典検査、索引 ID ベースの図面画像取得の接続コード。

## 起動

Node.js 24 以上、Python 3.10 以上が必要です。このフォルダーを作業ディレクトリにします。

```powershell
npm ci
python -m pip install -r plant-design-skill/requirements.txt
npm run generate
npm run predeploy
npm run dev
```

環境設定なしで設計と合成保守データの閲覧が動きます。外部 AI の代わりに応答を捏造する機能はありません。
「AI と設計」の手動受け渡しで依頼文を作り、生成済み候補 JSON を取り込むと、検査・比較・確定を試せます。
サンプルだけで外部 AI の生成や Dataverse 共有保存が成功したとは扱わないでください。

## 画面構成

既定のナビゲーションは設計・3D保守のみです。外部接続用の画面は `VITE_FEATURE_LIVE=true` で表示します。

| パス | 用途 | 未接続時 |
|---|---|---|
| `/#/plant-designer` | 初期画面。JSON 設計・配置・AI 候補比較 | ローカル編集と手動候補確認 |
| `/#/plant-3d` | 設備・部位・保守履歴・GLB | 合成データを明示して閲覧 |
| `/#/drawings` | 図面・改訂・取得索引 | Dataverse 接続エラーを明示 |
| `/#/incidents`, `/#/knowledge` | 問い合わせ・ナレッジ管理 | Dataverse 接続エラーを明示 |
| `/#/dashboard`, `/#/plant-sites`, `/#/traceability`, `/#/lifecycle` | 既存業務との統合ビュー | Dataverse 接続エラーを明示 |

## Dataverse テーブル

`{prefix}` は `VITE_PUBLISHER_PREFIX`。実際の EntitySetName、Lookup、Choice は対象環境で照合します。

| 論理名 | 用途 |
|---|---|
| `{prefix}_kbplantdesign` | 設計台帳 |
| `{prefix}_kbplantrevision` | 追記専用改訂・JSON・SHA-256 |
| `{prefix}_kbplantproposal` | 未審査候補・基準改訂／ハッシュ・採否 |
| `{prefix}_kbplantrequest`, `{prefix}_kbplantresult` | 利用者所有の非同期要求・結果 |
| 設備対応・資料索引・図面・図面改訂 | モデル改訂／設備／部位の完全一致と認可済み原本参照 |

保守履歴の表示データは `src/data/plant-maintenance.ts` の合成データです。実 SQL を自動的に取り込むものではありません。
改訂テーブルには設計＋改訂番号の代替キー、要求・結果には一意キーと所有者単位のアクセスを設定してください。

## 接続・配備

1. 対象環境・ソリューション・公開範囲を設計し、admin の環境・DLP/ACP チェックを通します。
2. code-apps の標準テンプレートで Code App を初期化し、共通 `.env` と本サンプルの `.env.example` を設定します。
3. スキルリポジトリ側の [add_data_source.py](../../scripts/add_data_source.py) で Dataverse、必要なら Copilot Studio と図面ページ API のデータソースを生成します。既存プロジェクトの `power.config.json` や `src/generated/` をコピーしません。
4. `src/integrations/connectors.ts` の未接続アダプターを、自分の環境で生成されたサービスの import / export に置き換えます。メソッド契約はコンパイルで検査してください。
5. 標準テンプレートの Power Apps Vite plugin、CSP、プレデプロイゲートを保持して画面・データ・ロジックを導入します。本サンプルの Vite はローカル用です。
6. 非同期 Worker は agent-flows の要求／結果パターンを使用します。認証済み作成者・所有者・相関・対象をサーバーでも検査し、管理者1名の成功を全利用者への公開許可にしません。
7. File / DB 接続は mcp-server の [認可・ページ画像契約](../../../mcp-server/references/indexed-file-db-access.md) を適用します。
8. 標準の `npm run predeploy` 成功後に `npm run deploy`。公開ホストで本人認可・実応答・改訂保存を別途確認します。本サンプル自身に push コマンドはありません。

## カスタマイズ

| 設定・コード | 用途 |
|---|---|
| `.env.example` | 表示名・環境・bot・AI Builder 設定。VITE 変数に秘密値を入れない |
| `src/config.ts` | 型付きナビゲーション。業務ビューを追加／削除 |
| `src/integrations/connectors.ts` | 外部サービスの交換点。既定は例外を返し、成功を装わない |
| `plant-design-skill/design_plant.py` | ローカル候補生成・検証。Copilot Studio 添付は既存 modular-plant テンプレートの手順に従う |
| `src/data/plant-catalog.ts`, `plant-maintenance.ts` | 合成設備・部位・故障・修理。実データと混在させない |

## 機能フラグ

| フラグ | 既定 | 有効化条件 |
|---|---|---|
| `VITE_FEATURE_LIVE` | false | Power Apps ホストと接続アダプターを構成済み |
| `VITE_FEATURE_RETRIEVAL` | false | 本人認可付き取得と引用照合の受入済み |
| `VITE_PLANT_CONVERSATION_ENABLED` | false | 要求／結果 Worker、利用者所有、許可主体を構成済み |
| `VITE_PLANT_KNOWLEDGE_CONVERSATION_ENABLED` | false | 上記に加えて資料取得経路を検証済み |

フラグは UI の制御であり認可ではありません。SQL の MI 権限や Azure Files の backup intent は本人の行／ファイル権限を継承しません。

## 検証範囲

`npm test` は形状・端点・敷地・出典・モデル改訂・対象・非同期相関・遅延応答・共有保存競合を検証します。
`npm run generate` は CSP 対応の事前コンパイル検証器、JSON、GLB を再生成します。
`npm run check:sample` は実 ID・固定 publisher・組織 URL・環境ファイルの混入を拒否します。
CI の `check-sample.mjs --tracked` は lockfile・設定例・Python生成器の Git 追跡も検査します。
親リポジトリの `package-lock.json` 除外により初回CIで `npm ci` が失敗したため、サンプルの `.gitignore` で例外化し、存在確認だけでなく追跡確認も必須にしました。
これはソース配布ゲートです。自分の `.env` を置いた本番作業フォルダーでは code-apps の環境対応プレデプロイを使ってください。

概念設計用です。法規・耐震・防爆・流体解析・3D干渉・設備の運転可否は評価しません。
実 AI 応答、公開ホスト、一般利用者の権限、原本 ACL と索引権限の一致は導入先での別ゲートです。