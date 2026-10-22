# パース3D内見スタジオ（Perse3D Studio）テンプレート

2D のパース・間取り図（不動産サイトの掲載画像・CG・写真など）から 3D 建築モデルを生成し、
設計チームと営業チームが同じモデルで **内見・提案** まで進める Power Apps Code App です。
同じモデル定義（BuildingSpec JSON）を Blender に渡して、フォトリアル画像・360° パノラマ・日影図・GLB を生成します。
物件ページの URL（SUUMO）から物件概要・外観・間取り図を取り込み、間取り図を階ごとに切り出して延床面積で縮尺を合わせます。
HOME'S・at home・Yahoo!不動産の本文/保存HTMLの取り込みと、販売用の日本語PDF出力にも対応します。

## 生成

```powershell
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/code-apps/templates/perse3d-studio --target <出力先> --var PUBLISHER_PREFIX=<接頭辞>
```

`generic-base` を継承します（共通の UI 部品・プロバイダー・デプロイ前チェックはベースから展開）。

## デプロイ

### 図面の手動補正

各階の「クリック・ドラッグで手動補正」で、自動判定結果を下書きとして修正できます。

- 「追加・分類」でカテゴリ（壁・窓・掃き出し窓・扉・通路・床範囲、収納・LDK・洋室・廊下・玄関・トイレ・浴室・洗面所）を選び、検出部分をクリック、未検出部分をドラッグする。
- 「選択・移動・サイズ」で補正枠を移動し、右下のハンドルでサイズ変更。選択後のカテゴリ変更、削除と「元に戻す」に対応。
- 自動検出が全くできない場合は、先に「床範囲」で建物全体を指定し、壁・窓・扉を手描きする。用途の指定だけでは仕切り壁は作らない。
- 「補正・縮尺を案件に保存」または3D生成で保存する。元画像比率の座標で保存するため、拡大・縮尺変更・再解析でも指定を維持する。階の入れ替えでは画像と一緒に移動し、画像の差し替え時は該当階の補正を解除する。
- 保存せずタブ移動・再読み込みをすると下書きは破棄される。未保存の表示を確認すること。

`npm test` は補正・保存形式・3D生成の回帰試験を含む。実マウス操作の試験はビルド後、
`npx --no vite preview --host 127.0.0.1 --port 5186` を起動して別端末で次を実行する
（専用の一時ブラウザプロファイル内の合成画像だけを変更する）。

```powershell
node scripts/capture_3d.mjs --url "http://127.0.0.1:5186/?debug3d#/projects" `
  --scenario-file scripts/manual-editor-scenario.mjs --wait 1500 --timeout 240 `
  --out .tools/shots/manual-editor-e2e.png --fail-on-error
```

クリック・ドラッグ・サイズ変更 → 取消・削除 → 保存・再読込 → 3D生成 → 扉の通行判定まで確認する。

| 手順 | コマンド | 外部に作るもの |
|---|---|---|
| 1 | `Copy-Item .env.example .env` → `ENV_ID` / `DATAVERSE_URL` / `TENANT_ID` / `VITE_DATAVERSE_URL` を入力 | — |
| 2 | `npm install --no-audit --no-fund` / `python -m pip install -r requirements.txt` / `npm test` | — |
| 3 | `python scripts/setup_dataverse.py` | ソリューション・テーブル `<接頭辞>_perseproject`（案件）/ `<接頭辞>_persecomment`（コメント）・サンプル案件 |
| 4 | `npx --no pa app init --environment-id $env:ENV_ID --display-name "パース3D内見スタジオ" --app-type CodeApp --non-interactive` | Code App |
| 5 | `python .github/skills/code-apps/scripts/setup_connection_reference.py --create-connection --allow-interactive --write-env .env`（作成・本人認証・Edge プロファイルの承認後） | 専用接続・Dataverse の接続参照 |
| 6 | `python .github/skills/code-apps/scripts/add_data_source.py --connector dataverse --allow-interactive` | Dataverse のデータソース |
| 7 | `python scripts/setup_listing_connector.py --add-to-app` | 物件ページ取得のカスタム コネクタ（認証なし・ホスト `suumo.jp` 固定・GET だけ）と接続、アプリのデータソース |
| 8 | `npm run deploy` | test → build → predeploy → `pa app push` |

- データソースを追加する前でもビルドできます（生成サービスは遅延読み込み）。追加前は DEMO（ブラウザ保存）で動きます
- `npm run deploy` の predeploy（`scripts/check-data-sources.mjs`）は、`VITE_DATA_MODE=dataverse` なのに Dataverse のデータソースが無いと止めます。物件ページ取得のコネクタが無いときは警告します（URL からの自動取得の代わりに、ページの内容の貼り付けで取り込めます）
- 物件ページの取得は、利用者の操作ごとに 1 件分だけです（巡回・一括取得はしない）。取得先の利用規約・robots.txt を確認してから使ってください。DLP では取得先のホストを分類してもらいます
- 共有: `npx pa app share --principal "<UPN またはグループ>" --access play --non-interactive --json`
## 主な機能

| 機能 | 内容 |
|---|---|
| 画像から 3D 化 | 間取り図から壁・窓・掃き出し窓・ドア・部屋を自動検出（ブラウザ内処理）。外観パースから外壁・屋根・地面の色を抽出 |
| 3D 内見 | 外観 / ドールハウス / 内見（玄関から歩く・衝突判定・部屋ジャンプ・ミニマップ・タッチパッド）、日照の時刻、室内照明 |
| 素材感 | 外壁 5 種・屋根 3 種・床 2 種の仕上げ材を、手続き生成の PBR テクスチャ（色・法線・粗さ、実寸スケール）で表現。基礎・サッシ・水切り・窓台・額縁・巾木・扉・軒天・破風・雨樋を自動付与。時刻連動の空と環境光、アンビエントオクルージョン |
| 家具・車 | 「全室に家具と車を配置」で部屋名と広さから家具を選び、壁付け・ドア前の通路確保・窓前に背の高い家具を置かない・重ならない、のルールで自動配置。カタログから選んで床をクリック、ドラッグで移動（壁際は壁に背を付けて内向きにスナップ）、R で回転、Delete で削除、色変更。車は駐車場の中央に道路向きで駐車。内見中は家具・車にぶつかる。Blender でも同じ形状でレンダリング |
| 提案 | カラーバリエーション・屋根形状を提案プランとして保存（サムネイル付き）、設計/営業/依頼主の立場付きピン留めコメント |
| 物件情報 | SUUMOはURL自動取得。HOME'S・at home・Yahoo!不動産は詳細URL＋本文の貼り付け/保存HTML（UTF-8・Shift_JIS・EUC-JP、3MBまで）。新サイトの自動接続は未追加。画像は掲載権限を確認してアップロード |
| 販売用PDF | 外観または参考3D・物件概要・各階原図・会社/連絡先/免許番号/取引態様/期限をA4の日本語PDFで出力。ブラウザ内で生成し外部サービスへ送信しない |
| Blender 連携 | ジョブ JSON 書き出し → Blender で GLB・Cycles 画像・360°・色違い・冬至日影図・数量 → GLB をアプリで内見 |

## 構成

### 他サイトの取り込みと販売用PDF

- 新規案件または案件概要に、HOME'S・at home・Yahoo!不動産の詳細URLを入力し、ページ本文を貼り付けるか保存HTMLを選択する。新サイトへ自動接続はせず、外観・間取り画像はアップロードする。SUUMOの既存自動取得は維持する。
- 新サイトの自動取得を追加する場合は、サイトの利用条件/取得制限とホストのDLP分類を先に確認する。認証・取得制限を迂回しない。保存HTMLのscriptやJSON-LDは実行しない。
- 案件の「販売用PDF」、または3D内見の「この視点で販売用PDF」から出力する。販売価格・物件概要と会社情報・発行日/情報有効期限を入力し、権利と広告内容の確認をチェックする。
- 建築予算を販売価格に、再構成3Dの計算値を販売用の面積に流用しない。不明項目は確認・修正し、対象外の場合も理由を記載する。PDFの入力は画面内の下書きで、案件を変更しない。
- 原図は1ページ最大2階分。3Dは参考イメージと注記し、会社/期限/取り込み元を併記する。日本語フォントは `src/assets/fonts/` にOFLライセンスとともに同梱。外部フォント通信は不要。全グリフを埋め込むためPDFは画像枚数により約3.5MB以上になる。
- `npm test` にPDF構造・数字/日本語抽出・字形の実描画・画像・A4範囲内の検証を含む。抽出/描画試験はPyMuPDFがある場合に実行する。

ビルド後、`npx --no vite preview --host 127.0.0.1 --port 5188` を別端末で起動すると、次で
3サイトの情報取込→案件作成→3D視点からPDFの実ダウンロードを確認できる
（一時プロファイルの合成データのみ使用、新サイトへの通信0件を検査）。

```powershell
node scripts/capture_3d.mjs --url "http://127.0.0.1:5188/?debug3d#/projects" `
  --scenario-file scripts/portal-brochure-scenario.mjs --wait 1500 --timeout 420 `
  --out .tools/brochure/brochure-ui.png --fail-on-error
```

| パス | 内容 |
|---|---|
| `src/lib/building-spec.ts` | BuildingSpec 型・仕上げ材・手続き生成・概算数量・JSON 検証 |
| `src/lib/building-geometry.ts` | 部材ジオメトリ（壁・開口ディテール・基礎・屋根・雨樋）。Blender の `blender/geometry.py` と同一構成 |
| `src/lib/procedural-textures.ts` | 仕上げ材の PBR テクスチャ生成（外部画像なし・CSP 対応） |
| `src/data/furniture-catalog.json` | 家具・車の形状カタログ（Three.js と Blender で共有） |
| `src/lib/furniture.ts` / `furniture-render.ts` | 家具の自動配置・スナップ・当たり判定 / Three.js 描画 |
| `src/lib/floorplan-analyzer.ts` | 間取り図解析 |
| `src/lib/listing.ts` / `components/listing-import.tsx` | 物件URL・本文/HTML/JSON-LDの取り込み（SUUMOのみ自動接続） |
| `src/lib/brochure.ts` / `brochure-pdf.ts` / `components/brochure-panel.tsx` | 販売用の入力・確認・日本語PDF生成/ダウンロード |
| `src/lib/perspective-analyzer.ts` | パースの色抽出・画像縮小 |
| `src/lib/building-scene.ts` | Three.js シーン（空・環境光・AO・内見操作・ピン・GLB） |
| `src/data/` | リポジトリ（Dataverse / DEMO）、Dataverse クライアント、サンプル JSON |
| `blender/build_from_spec.py` / `geometry.py` / `materials.py` / `furniture.py` | Blender ヘッドレス生成（本体 / 部材 / 仕上げ材シェーダー / 家具・車） |
| `scripts/setup_dataverse.py` | Dataverse テーブル構築・ローカライズ・デモデータ |
| `scripts/generate_sample_floorplans.py` / `generate-sample-spec.mjs` / `generate-sample-job.mjs` | サンプル間取り図・サンプル spec・Blender ジョブ生成 |
| `tests/` | 解析器・spec の単体テスト、Three.js と Blender の部材一致テスト、家具の自動配置・スナップ・カタログ一致テスト（`npm test`） |

## 構成

| パス | 内容 |
|---|---|
| `src/lib/floorplan-sheet.ts` / `floorplan-analyzer.ts` | 1 枚に全階を描いた図面の切り出し / 間取り図解析（壁・窓・扉・部屋・設備・階段・外皮の閉じ） |
| `src/lib/listing.ts` / `listing-source.ts` / `listing-images.ts` | 物件概要の解析・物件ページ取得（コネクタ）・画像の取り込みと切り出し |
| `src/lib/building-spec.ts` / `building-geometry.ts` / `building-scene.ts` | BuildingSpec・部材ジオメトリ（Blender の `blender/geometry.py` と同一構成）・Three.js シーン |
| `src/lib/furniture.ts` / `stairs.ts` | 家具の自動配置・当たり判定 / 階段の配置・上り下り |
| `src/data/` | リポジトリ（Dataverse / DEMO）、Dataverse クライアント、カタログ・サンプル JSON |
| `connectors/listing/` | 物件ページ取得のカスタム コネクタ定義（応答は `default` だけで宣言。Code Apps の SDK が JSON として読まないため） |
| `blender/` | Blender ヘッドレス生成（本体 / 部材 / 仕上げ材 / 家具・車） |
| `scripts/setup_dataverse.py` / `setup_listing_connector.py` / `check-data-sources.mjs` | Dataverse 構築 / コネクタ作成とアプリへの追加 / デプロイ前のデータソース確認 |
| `scripts/capture_3d.mjs` | ヘッドレス Edge で 3D 画面を撮る（ローカル検証） |
| `tests/` | 解析器・spec・階段・家具・コネクタ応答の試験、Three.js と Blender の部材一致（`npm test`） |
| `public/materials/` | 仕上げ材 PBR テクスチャ（ambientCG、CC0） |
## Code Apps 上の制約メモ

- 既定 CSP は `connect-src 'none'` のため `fetch` は使わない（サンプル JSON はバンドル、GLB はファイル選択で読み込み）。
- テクスチャを含む GLB はテクスチャが blob: URL 経由になるため既定 CSP では表示されない。Blender 出力は色のみのマテリアル。
- iframe 内で localStorage・クリップボード・全画面が制限される場合のフォールバックを実装済み。
> **認証の正常フロー**: `.env`・依存準備後、業務APIや初回デプロイより前に
> [認証運用](../../references/authentication-lifecycle.md)でアカウント・Edgeプロファイル・
> 必要時の追加認証許可を保存する。app init後に接続resourceまでキャッシュを確認する。
> 以後の `npm run deploy` は既存test/buildを保持し、キャッシュ優先でpushする。
> npm CLIにプロファイル強制指定はなく、必要なら本人が保存済みプロファイルを選ぶ。
