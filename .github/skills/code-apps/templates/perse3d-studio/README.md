# パース3D内見スタジオ（Perse3D Studio）テンプレート

2D のパース・間取り図（不動産サイトの掲載画像・CG・写真など）から 3D 建築モデルを生成し、
設計チームと営業チームが同じモデルで **内見・提案** まで進める Power Apps Code App です。
同じモデル定義（BuildingSpec JSON）を Blender に渡して、フォトリアル画像・360° パノラマ・日影図・GLB を生成します。
物件ページの URL（SUUMO）から物件概要・外観・間取り図を取り込み、間取り図を階ごとに切り出して延床面積で縮尺を合わせます。

## 生成

```powershell
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/code-apps/templates/perse3d-studio --target <出力先> --var PUBLISHER_PREFIX=<接頭辞>
```

`generic-base` を継承します（共通の UI 部品・プロバイダー・デプロイ前チェックはベースから展開）。

## デプロイ

| 手順 | コマンド | 外部に作るもの |
|---|---|---|
| 1 | `Copy-Item .env.example .env` → `ENV_ID` / `DATAVERSE_URL` / `TENANT_ID` / `VITE_DATAVERSE_URL` を入力 | — |
| 2 | `npm install --no-audit --no-fund` / `npm test` | — |
| 3 | `python scripts/setup_dataverse.py` | ソリューション・テーブル `<接頭辞>_perseproject`（案件）/ `<接頭辞>_persecomment`（コメント）・サンプル案件 |
| 4 | `python .github/skills/code-apps/scripts/setup_connection_reference.py --write-env .env` | Dataverse の接続参照 |
| 5 | `npx --no pa app init --environment-id $env:ENV_ID --display-name "パース3D内見スタジオ" --app-type CodeApp --non-interactive` | Code App |
| 6 | `python .github/skills/code-apps/scripts/add_data_source.py --connector dataverse --connection-ref $env:CONNECTION_REFERENCE_LOGICAL_NAME --solution-id $env:SOLUTION_ID` | Dataverse のデータソース |
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
| Blender 連携 | ジョブ JSON 書き出し → Blender で GLB・Cycles 画像・360°・色違い・冬至日影図・数量 → GLB をアプリで内見 |

## 構成

| パス | 内容 |
|---|---|
| `src/lib/building-spec.ts` | BuildingSpec 型・仕上げ材・手続き生成・概算数量・JSON 検証 |
| `src/lib/building-geometry.ts` | 部材ジオメトリ（壁・開口ディテール・基礎・屋根・雨樋）。Blender の `blender/geometry.py` と同一構成 |
| `src/lib/procedural-textures.ts` | 仕上げ材の PBR テクスチャ生成（外部画像なし・CSP 対応） |
| `src/data/furniture-catalog.json` | 家具・車の形状カタログ（Three.js と Blender で共有） |
| `src/lib/furniture.ts` / `furniture-render.ts` | 家具の自動配置・スナップ・当たり判定 / Three.js 描画 |
| `src/lib/floorplan-analyzer.ts` | 間取り図解析 |
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
