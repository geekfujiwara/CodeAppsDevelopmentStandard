# Blender パイプライン

Code App と同じ BuildingSpec（JSON）から、Blender でシーンを組み立ててレンダリング・書き出しを行います。

## 必要なもの

- Blender 4.2 LTS 以降（4.5.14 LTS で検証。NVIDIA GPU があれば OptiX / CUDA を自動使用、なければ CPU）
- ポータブル版を使う場合はリポジトリ直下の `.tools/`（Git 管理外）に展開して使えます

## 使い方

```powershell
# アプリの「Blender 出力」タブでダウンロードしたジョブ JSON を渡す
blender -b --factory-startup -P blender/build_from_spec.py -- `
  --spec blender-job-xxxx.json --out blender/out/xxxx

# BuildingSpec 単体でも可（サンプル）
blender -b --factory-startup -P blender/build_from_spec.py -- `
  --spec blender/samples/sample-spec.json --out blender/out/sample --variants --sun-study --samples 32
```

| オプション | 内容 |
|---|---|
| `--renders exterior,interior,panorama` | 出力するレンダリング（ジョブの `renders` が既定） |
| `--variants` | ジョブの `variants`（提案プラン）の色で外観を一括レンダリング |
| `--sun-study` | 冬至 9/12/15 時の日影図（真上から） |
| `--samples` / `--res` | 品質・解像度（ジョブの `samples` / `resolution` が既定） |
| `--engine eevee` | 高速プレビュー用 |
| `--hour 10` | 外観・内観の時刻 |
| `--no-render` | GLB / .blend / 数量のみ |

## 出力

| ファイル | 用途 |
|---|---|
| `model.glb` | Code App の「3D 内見・提案」→「Blender GLB を表示」で内見 |
| `model.blend` | 設計チームが家具・素材・照明を作り込む元データ |
| `renders/exterior.png` / `interior.png` | 提案書・掲載用のフォトリアル画像 |
| `renders/panorama.png` | 360° パノラマ（2048×1024） |
| `renders/variant-*.png` | カラーバリエーション |
| `renders/sun-winter-*.png` | 冬至の日影図 |
| `quantities.json` | 延床・外壁・屋根面積、開口数、部屋面積 |
| `manifest.json` | 生成物一覧 |

## 実測（サンプル邸 2 階建て、OptiX）

旧版（32 samples、1200×675）: 外観 26 秒 / 内観 66 秒 / 360° 165 秒。
質感強化版（96 samples、1600×900、ディテール・プロシージャル材質・ガラス越しの日だまり）の実測は下の「出力」をレンダリングしたログ（manifest.json）を参照。
出力例はアプリの「Blender 連携」画面と `public/samples/blender/` にあります。

## 座標系

spec は three.js 準拠（x=間口, y=上, z=奥行、正面=+z=南）。Blender では X=x, Y=-z, Z=y に変換し、
glTF 書き出し（+Y up）で元の座標に戻るため、GLB はアプリの手続き生成モデルとぴったり重なります。
1F 床は地盤面から 450mm（基礎、`FLOOR_LEVEL`）上がっています。

## 部材と仕上げ材

| ファイル | 内容 | Code App 側の対応 |
|---|---|---|
| `geometry.py` | 基礎・玄関ポーチ・サッシ（引き違い）・水切り・窓台・額縁・巾木・開いた扉・厚みのある屋根（軒天・破風）・雨樋・竪樋・外構。bpy 非依存 | `src/lib/building-geometry.ts`（`tests/geometry-parity.test.mjs` で材質ごとの頂点数一致を検証） |
| `materials.py` | 外壁 5 種・屋根 3 種・床 2 種のプロシージャルシェーダー（UV は m 単位）。ガラスは影だけ素通しにして室内に日だまりを作る | `src/lib/procedural-textures.ts` |
| `furniture.py` | 家具・車（`spec.furniture`）を `src/data/furniture-catalog.json` の部品定義からメッシュ化（角丸・材質・色）。ジョブ JSON に `furnitureCatalog` があればそれを使う | `src/lib/furniture.ts` / `furniture-render.ts`（`tests/furniture.test.mjs` で部品展開の一致を検証） |

GLB の材質名は部位キー（`exteriorWall` / `roof` / `floor` …）です。Code App で読み込むと同名の PBR 材質に差し替わり、
アプリと同じ質感で内見できます（GLB 自体は色だけの軽い材質で、テクスチャ画像を含みません）。
