# 3D 資産（モデル・材質）の共通利用

Code Apps で Three.js を使って 3D を表示し、同じデータを Blender などの制作ツールや別のアプリでも使うときの契約と注意点。
既存の [モジュール設計パターン](modular-plant-design.md)（JSON 駆動・Python との一致テスト）の上に、
**材質ライブラリ・GLB の受け渡し・CSP・描画環境**の観点を足したもの。

## 1. 正本は「JSON + 組み立てロジック + 材質マニフェスト」

| 層 | 共有するもの | 実装の例 |
|---|---|---|
| 形の定義 | 寸法・種類・配置のパラメトリック JSON。メッシュではなく「作り方」 | `spec.json`、家具カタログ JSON |
| 組み立てロジック | JSON → メッシュの手順。表示側（TypeScript）と制作側（Python）で同じにする | `geometry.ts` ⇔ `geometry.py` |
| 材質 | 部位キー（`exteriorWall` 等）と、キーに紐づくテクスチャ・実寸・色合わせ係数 | `material-library.json` + `public/materials/` |
| 成果物 | GLB（表示用）、`.blend`（制作用）、画像、数量 | 生成物。正本にしない |

GLB を正本にすると、寸法の編集・数量計算・ルールに基づく自動配置ができなくなる。

## 2. 契約チェックリスト

### スキーマ・座標

- [ ] 座標系と単位を 1 か所に書く（例: 右手系・Y-up・m）。Z-up のツールとの変換行列は 1 つに固定する
- [ ] Euler 回転の順序を明記する（three.js の `YXZ` = 行列 `Ry·Rx·Rz`。Python 側も同じ積の順にする）
- [ ] スキーマに `version` を持ち、外部から来た JSON は検証関数（有限数・値域・既知の列挙値）を通す

### TypeScript と Python の一致

- [ ] 同じ入力から同じ部材ができることをテストで保証する（材質ごとの頂点数、部品の位置・回転）
- [ ] 一致テストは `npm test` から Python を呼び、毎回動かす。目視で比べない

### 材質ライブラリ

- [ ] 材質は部位キーで参照する。GLB の材質名もキーにして、読み込み側で共有材質に差し替える（キー以外は `furn_` などの接頭辞で名前空間を分ける）
- [ ] UV はワールド座標の m。マニフェストに 1 枚の実寸（`tile`）を持たせ、`repeat = 1 / tile` で貼る
- [ ] 利用者の色で塗り替える素材（塗装・金属・屋根材）は、色テクスチャをグレー化して同梱する（`tint: luminance`）。写真の色相が残ると「色 ÷ 平均色」で掛けたとき色かぶりする（黄色い羽目板 × 生成り色 → 黄緑）
- [ ] 焼きむら・木目の色差を残したい素材だけ色比で合わせる（`tint: ratio`）
- [ ] CC0 素材でも粗さ・法線・明るさの基準は素材ごとにばらつく。補正値（粗さの下限・法線の強さ・鏡面反射・反射率係数）をマニフェストに持ち、両レンダラーで同じ値を使う。磨いた床など艶のある素材は `glossy: true`
- [ ] ライセンスと出典 URL をマニフェストに残す。同梱サイズの上限を決めて機械的に検査する
- [ ] 同梱アセットは取得スクリプトで再生成できるようにする（手で置いたファイルを正本にしない）

材質マニフェストの最小形:

```json
{
  "version": 1,
  "materials": [
    {
      "slot": "wall:siding", "path": "materials/wall-siding", "tile": 1.6,
      "tint": "luminance", "avgLinear": [0.41, 0.41, 0.41],
      "normalStrength": 1.0, "specular": 0.5, "albedoScale": 1.0,
      "license": "CC0-1.0", "source": "https://example.com/asset"
    }
  ]
}
```

### 配信（Code Apps の既定 CSP）

| やりたいこと | 既定 CSP で | 代わりの方法 |
|---|---|---|
| 同梱 JSON を読む | `fetch` は `connect-src 'none'` でブロック | ビルド時に `import x from "./x.json"` |
| テクスチャを読む | `TextureLoader`（`<img>`）は可 | `img-src 'self'` の範囲で同梱する |
| GLB を読む | `GLTFLoader.load(url)` は内部で fetch するので不可 | `File.arrayBuffer()` → `parseAsync` |
| テクスチャ埋め込み GLB | 画像が `blob:` URL になり表示されない | 色だけの材質で書き出し、キーで共有材質に差し替える |
| Draco / KTX2 / meshopt | Web Worker が必要（`worker-src`） | 使わない（JPEG/WebP + 非圧縮）か、CSP を追加する |

`npm run predeploy` のチェック 13（`detect-csp-hazards.mjs`）がこれらの書き方を検出する。
環境に CSP を追加した場合は `.env` の `CODE_APP_CSP_ALLOW`（`connect-src` などの directive 名か、ルール ID）で外す。
個別に許可する行には `// csp-ok: <理由>` を書く。

### 描画環境

- [ ] GPU の無い環境（VDI・リモートデスクトップ・ヘッドレス試験）はソフトウェア描画（SwiftShader / WARP）になる。PMREM の環境マップを使うと、照明を受ける面がすべて黒くなる（エラーは出ない）。`WEBGL_debug_renderer_info` のレンダラー名で判定し、環境マップを外して半球光で補う
- [ ] 後処理（AO 等）は切り替え可能にし、軽量モードを用意する
- [ ] テクスチャの読み込みに失敗しても、手続き生成のテクスチャで表示を続ける

```ts
// ソフトウェア描画の判定（初回参照時に 1 回だけ）
const gl = renderer.getContext()
const ext = gl.getExtension("WEBGL_debug_renderer_info")
const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
const software = /swiftshader|llvmpipe|software|microsoft basic render|warp/i.test(name)
scene.environment = software ? null : pmremTexture
```

## 3. 検証

```powershell
# 材質マニフェストと GLB を共通利用の契約で検証する
python .github/skills/code-apps/scripts/validate_3d_assets.py `
  --materials src/data/material-library.json --public public `
  --glb public/models/model.glb --material-keys exteriorWall,roof,floor --material-prefix furn_

# 本番ビルドをヘッドレス Edge で描画し、3D の状態とスクリーンショットを取る（追加インストール不要）
npx vite build; npx vite preview --port 4173
node .github/skills/code-apps/scripts/capture_3d.mjs --url "http://127.0.0.1:4173/?debug3d#/<route>" `
  --wait 20000 --eval "window.__viewer?.materialSource" --out .tools/shots/viewer.png
# 既定はソフトウェア描画。GPU 経路も 1 回確かめる
node .github/skills/code-apps/scripts/capture_3d.mjs --gpu --url "..." --out .tools/shots/viewer-gpu.png
```

- ビルドが通っても画面が黒いことがある。本番ビルドを実際に描画して確かめる
- 3D の内部状態（材質の読み込み元、配置数など）は `?debug3d` のような明示フラグを付けたときだけ `window` に公開する
- 新しい検出ルールは、既存のサンプル・テンプレートで誤検出がないことを確かめてから入れる

## 4. 異常系

| 症状 | 原因 | 対処 |
|---|---|---|
| 照明を受ける面だけ真っ黒（空は表示される） | ソフトウェア描画で PMREM の環境マップが壊れる | レンダラー名で判定して `scene.environment = null`、半球光を強める |
| 外壁・屋根が黄色や緑にかぶる | 写真の色相が残った素材を「色 ÷ 平均色」で塗った | 色テクスチャをグレー化して同梱（`tint: luminance`） |
| 芝や地面が遠景で白っぽい | 素材の粗さが低い・法線が強い・既定の鏡面反射で空を映す | 粗さの下限を焼き込む、法線を弱める、鏡面反射を下げる、反射率係数で暗くする |
| GLB を読み込むと元の色のまま／材質が差し替わらない | 制作側の材質名が部位キーになっていない | 書き出し時に材質名をキーにする。`validate_3d_assets.py --material-keys` で検出 |
| GLB のテクスチャが表示されない | 埋め込み画像が `blob:` URL になり既定 CSP で拒否される | テクスチャを埋め込まず、共有ライブラリで差し替える |
| データが来ない・画面は出る | `fetch` が `connect-src 'none'` で拒否されている | ビルド時 import か SDK 経由にする。predeploy チェック 13 で検出 |
| ヘッドレス試験のスクリーンショットが真っ白 | 開発サーバーの初回コンパイルが待ち時間内に終わっていない | 本番ビルド（`vite build` → `vite preview`）を対象にする |
