# 3D 資産（モデル・材質）の共通利用

Code Apps で Three.js を使って 3D を表示し、同じデータを Blender などの制作ツールや別のアプリでも使うときの契約と注意点。
既存の [モジュール設計パターン](modular-plant-design.md)（JSON 駆動・Python との一致テスト）の上に、
**材質ライブラリ・GLB の受け渡し・CSP・描画環境**の観点を足したもの。
工事・設備の進捗を 3D で見せる（完成形を破線、施工中をクリッピングで立ち上げる）場合は [3D 施工進捗モデル](three-d-progress-model.md) も参照。

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
- [ ] 画像・図面から寸法を出すときは、**別の情報源の物理量で縮尺を確かめる**（壁の厚み 12〜18cm、物件情報の延床面積など）。延床面積で合わせるときは、
      各階の床面積の合計と比べ、**全階で同じ縮尺**にする（階ごとに合わせると、片方の階だけ違う縮尺のまま残る）。物理量から決めた値は ±2% 程度の誤差を持つので、
      その範囲の候補から構造が最も多く取れる値を選ぶ
- [ ] 画像・図面から作ったモデルは向きを正規化する（例: 建物は玄関を +z）。図面の上下は作り手次第で、直さないと入口が敷地の裏を向く。回す対象（形状・部屋・階段の向きと上り口・家具の位置と向き）は 1 つの関数にまとめ、回した後の向きを試験する

### TypeScript と Python の一致

- [ ] 同じ入力から同じ部材ができることをテストで保証する（材質ごとの頂点数、部品の位置・回転）
- [ ] 一致テストは `npm test` から Python を呼び、毎回動かす。目視で比べない
- [ ] 頂点数の一致だけでは位置のずれを見逃す。寸法を導く関数（段・開口・配置など）は両方の出力そのもの（座標の配列）を突き合わせる
- [ ] 丸めを揃える。JS の `Math.round` は四捨五入、Python の `round` は偶数丸め（`round(2.5) == 2`）。Python 側は `math.floor(x + 0.5)` を使う
- [ ] 保存するのは配置（外形・向き・形状）だけにし、寸法は両側が同じ式で導く。導いた値を保存すると、元の値（階高など）を変えたときに整合が崩れる

### 自動配置

- [ ] 評価点（近い・壁沿い など）だけで選ぶと、通路を塞ぐ案が上位に来る。上位の候補から順に「置いた後も全部の部屋へ歩いて行けるか」を格子の到達判定で確かめ、最初に通ったものを採る
- [ ] 置けない範囲（ドア・掃き出し窓の前、階段の上り口・上がり口、上の階の吹き抜け）を 1 つの関数で返し、家具の自動配置・手動配置・当たり判定が同じものを使う

### 部品の接合・内見の当たり判定

- [ ] 同じ高さに 2 つの面を作らない。下の階の壁の上面と上の階の床の下面が一致すると、上の階の床に壁の線が透ける（z-fighting。外観では見えず内見でだけ出る）。上に階がある壁は床スラブの下で止め、外壁はスラブの小口を隠す外向きの面だけ足す
- [ ] 当たり判定は「今いる階」ではなく高さの範囲で考える。階段の途中で上の階に切り替わった直後は、上の階の床の上にある物（吹き抜けの手すり壁など）が頭上にある。段の上を移動している間は外し、上の階の床からは止める。判定は純関数にして、歩く経路の試験で確かめる

### 外皮の閉じ（外壁・屋根・天井）

- [ ] 開口の検出（下限 0.5m など）の後に、外壁の途切れを**必ず窓か壁に決める**。下限より狭い小窓（トイレの縦長の窓）・記号で途切れた壁・隅の際の窓が空きのまま残ると、3D の外壁に床から天井までの縦の隙間が開く。部屋・設備・階段の数には表れず、外観でだけ見える（troubleshooting #90）
- [ ] 隅で 2 本の壁の端が数 cm 食い違う抜けは、行・列に沿った処理では拾えない。閉処理なしで外から塗って部屋まで届くときだけ、外に接するセルを壁にして塞ぐ（凹みの口は塞がない）
- [ ] 検証の指標に「外から壁を通らずに部屋の中へ入れるセルの数」を入れる。0 であること（壁の外の玄関ポーチの床は除く）を、実データ全件と合成図面の試験で確かめる
- [ ] 上の階が小さい建物は、下の階だけの部分（下の階の床 − 上の階の床）に陸屋根（上面 = 屋根、下面 = 天井）を、上の階の床と同じ高さ・厚みで作る。最上階の天井と大屋根だけでは、バルコニーの下などで天井が抜けて外から室内が見える。側面は作らない（外壁の帯と同じ面を重ねない）
- [ ] 不動産の図面の扉は「開いた状態の扉板 + 開き勝手の円弧」で描かれ、扉板の線は壁と同じ太さで壁として残る（内見で通れない）。円弧（同じ半径の 4 分の 1 円）を見つけたら、沿う壁が蝶番の先へ十分続くか（扉自身の壁か、T 字に接する壁か）で、どちらの半径が閉じた位置かを決める。壁に沿って開く扉板は隣の壁ごと消さない。外壁につながる線は扱わない
- [ ] 図面に接して描かれた表記のバッジ（「1F」の丸）は壁の網とつながり、3D に塊ができる。壁より格段に太く丸く詰まった小さな塊で、中に白抜きの文字があるものだけ外す（文字の無い灰色の塗りは残す）
### 生成の進み具合

- [ ] 画像解析・形状の組み立てのような重い同期処理は段に分け、段の間で描画の機会を与える。続けて実行すると画面が固まり、押せたのか分からない。
      待ちに `requestAnimationFrame` やタイマーを使わない: 画面に見えていないタブ・自動操作のブラウザでは `requestAnimationFrame` が呼ばれず、
      タイマーは 1 分に 1 回まで間引かれ、**処理が止まる**（troubleshooting #86）。見えていないときは `MessageChannel` で次のタスクに回す

      ```ts
      const nextTask = (fn: () => void) => {
        const ch = new MessageChannel()
        ch.port1.onmessage = () => { ch.port1.close(); fn() }
        ch.port2.postMessage(null)
      }
      export const nextFrame = () => new Promise<void>(resolve => {
        if (document.visibilityState === "hidden") return nextTask(resolve)
        let done = false
        const go = () => { if (!done) { done = true; nextTask(resolve) } }
        requestAnimationFrame(go)
        setTimeout(go, 50)
      })
      ```
      画面から通す試験は `capture_3d.mjs --simulate-hidden` でも通す
- [ ] 処理中は、結果を変える操作（例: 縮尺の自動調整中の「生成」ボタン）を押せないようにする
- [ ] 進み具合の状態はコンポーネントの外（モジュールのストア + `useSyncExternalStore`）に置く。完了後にタブ・画面が切り替わっても表示が続く。最後の段（3D の構築）は表示側が完了にし、知らせが来なくても閉じる時限を付ける

### 画像からの推定（縮尺・1 枚に描いた複数の階）

- [ ] 1 枚の画像に複数の階・区画が描かれている前提で取り込む（不動産サイトの図面は 1 枚に全階）。白い帯で再帰的に分け（XY 分割）、小さな塊（方位記号・凡例）は外す。並び（横は左から、縦 1 列は下から 1F）は純関数にし、外部の情報（物件の階数）で余分な塊（塔屋・ロフト）を外した後に並べ直す。自動で決められない並び（田の字）は入れ替えの操作を用意する
- [ ] 白い帯で分ける処理は、間に置いた小さな表記（「1F」・方位記号）1 つで分けられなくなる（小さな画像に詰めて描いた図面では表記が両側の外壁と 2〜3px）。墨の範囲に比べて小さな孤立した塊を分割の判定から外し、外壁に接する（数 px 以内）ものだけ階の範囲に戻す
- [ ] 1 枚から切り出した階は縮尺（画素/m）が共通。階ごとに別の値にせず、切り出した幅の比を保って全階に同じ倍率をかける
- [ ] 外部の情報（延床面積・間取り）で推定値（縮尺）を選ぶときは、「取れた構造が多いほど良い」にしない（分けすぎが勝つ）。期待値（階段の数・水回りの種類・洋室の数）からのずれを減点する「もっともらしさ」で候補を選ぶ
- [ ] 推定に使う外部の値と、測った値（面積は横幅の 2 乗に比例しない）が 1 回で合わないことがある。合わせ直しは回数を決めて（例: 2 回）止め、合わない場合は画面に差と手動の操作を出す
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
| GLB を読む（利用者が選んだファイル） | `GLTFLoader.load(url)` は内部で fetch するので不可 | `File.arrayBuffer()` → `parseAsync` |
| GLB を読む（アプリに同梱） | 同上。`public/` に置いても fetch できない | `import.meta.glob("./models/*.glb", { query: "?inline" })` で base64 のモジュールにし、使うときに動的 import（`script-src 'self'` で読める）。`vite.config` の `assetsInclude` に `**/*.glb` |
| テクスチャ埋め込み GLB | GLTFLoader は埋め込み画像を `blob:` URL にして `<img>` / fetch で読む。`img-src` に `blob:` が無く `connect-src 'none'` なので両方拒否され、テクスチャなしの白い表示になる | ① 色だけの材質で書き出し、キーで共有材質に差し替える ② `templates/csp-safe-gltf.ts` のローダーで読む（埋め込み画像を `createImageBitmap(Blob)` でデコード。URL を介さないので CSP の対象外） |
| Draco / KTX2 / meshopt | Web Worker が必要（`worker-src`） | 使わない（JPEG/WebP + 非圧縮）か、CSP を追加する |

実装は [templates/csp-safe-gltf.ts](../templates/csp-safe-gltf.ts) を正とし、コピーして使う（既定 CSP で検証済み: `<img src=blob:>` と `fetch(blob:)` は拒否、`createImageBitmap(Blob)` は成功）。

```ts
import { createCspSafeGltfLoader, decodeDataUrl } from "@/lib/csp-safe-gltf"
// 利用者が選んだファイル
const gltf = await createCspSafeGltfLoader().parseAsync(await file.arrayBuffer(), "")
// アプリに同梱した GLB（?inline の base64）
const sources = import.meta.glob("../assets/models/*.glb", { query: "?inline", import: "default" }) as Record<string, () => Promise<string>>
const bundled = await createCspSafeGltfLoader().parseAsync(decodeDataUrl(await sources["../assets/models/sofa.glb"]()), "")
```

`npm run predeploy` のチェック 13（`detect-csp-hazards.mjs`）がこれらの書き方を検出する。
環境に CSP を追加した場合は `.env` の `CODE_APP_CSP_ALLOW`（`connect-src` などの directive 名か、ルール ID）で外す。
個別に許可する行には `// csp-ok: <理由>` を書く。

### 描画環境

- [ ] GPU の無い環境（VDI・リモートデスクトップ・ヘッドレス試験）はソフトウェア描画（SwiftShader / WARP）になる。PMREM の環境マップを使うと、照明を受ける面がすべて黒くなる（エラーは出ない）。`WEBGL_debug_renderer_info` のレンダラー名で判定し、環境マップを外して半球光で補う
- [ ] 後処理（AO 等）は切り替え可能にし、軽量モードを用意する
- [ ] テクスチャの読み込みに失敗しても、手続き生成のテクスチャで表示を続ける
- [ ] 環境マップを外したソフトウェア描画では、下向きの面（天井）が半球光の地面色だけで照らされ、床の色に染まる（茶色い天井）。ソフトウェア描画のときは地面色を白へ寄せる。撮影はソフトウェア描画と GPU（`--gpu`）の両方で行い、片方だけで起きる差を見つける

```ts
// ソフトウェア描画の判定（初回参照時に 1 回だけ）
const gl = renderer.getContext()
const ext = gl.getExtension("WEBGL_debug_renderer_info")
const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
const software = /swiftshader|llvmpipe|software|microsoft basic render|warp/i.test(name)
scene.environment = software ? null : pmremTexture
```

### 実在の 3D モデル（家具など）を取り込む

- [ ] 取り込みは取得スクリプト + Blender（ヘッドレス）で行い、手で整えたファイルを正本にしない。整形の内容: 変換を頂点へ焼き込んで 1 メッシュにする／正面を規約の向き（例: +z）へ回す／底面の中心を原点にする／材質名を `furn_<種類>_<n>` にする／テクスチャを 512px 程度の JPEG にして埋め込む／Draco・KTX2 は使わない
- [ ] manifest に寸法（w / d / h）・ライセンス・作者・出典 URL・バイト数・SHA-256 を残し、`--check` で同梱物と突き合わせる（差し替えに気付ける）
- [ ] 読めない環境のために外形の箱（parts）を持たせ、当たり判定・自動配置は外形の寸法で行う
- [ ] 手続き生成の家具を実物のモデルに置き換えるときは、外形が元より大きければ周り（壁・家具・ドア前・階段）と重ならないことを確かめる。壁付けの家具は背を壁に付けたまま奥行きの差だけ寄せる
- [ ] 正面の向き・寸法・床からの浮き沈みは、Three.js の表示と Blender の `.blend` の外接箱の両方で確かめる

## 3. 検証

```powershell
# 材質マニフェストと GLB を共通利用の契約で検証する
python .github/skills/code-apps/scripts/validate_3d_assets.py `
  --materials src/data/material-library.json --public public `
  --glb public/models/model.glb --material-keys exteriorWall,roof,floor --material-prefix furn_
# テクスチャ埋め込みの GLB を createImageBitmap のローダーで読む場合
python .github/skills/code-apps/scripts/validate_3d_assets.py --glb src/assets/models/sofa.glb `
  --material-keys "" --material-prefix furn_ --allow-embedded-images --max-glb-bytes 1200000
# Blender でオブジェクトごとに材質を複製した GLB（例: ライトマップ付き → "floor.001"）。読み込み側も末尾 .NNN を外す
python .github/skills/code-apps/scripts/validate_3d_assets.py --glb out/model.glb --material-keys floor,ceiling --strip-blender-suffix --allow-embedded-images

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
| GLB のテクスチャが表示されない（白い・単色）。Console に `Couldn't load texture blob:...` | 埋め込み画像が `blob:` URL になり、`img-src` / `connect-src` で拒否される | テクスチャを埋め込まず共有ライブラリで差し替えるか、`createImageBitmap` のプラグインで読む |
| 同梱した GLB が読めない | `public/` の GLB を fetch している（`connect-src 'none'`） | `?inline` で base64 のモジュールにして動的 import |
| 内見の天井だけ茶色い（GPU では正常） | ソフトウェア描画で環境マップを外したため、天井が床色の照り返しだけで照らされる | ソフトウェア描画では半球光の地面色を白へ寄せる |
| 取り込んだ家具が横を向く・床に沈む・巨大 | 制作ツールごとに正面の向き・原点・単位が違う | 取り込み時に Blender で正面・原点・寸法をそろえ、manifest の寸法を `--check` で検査する |
| データが来ない・画面は出る | `fetch` が `connect-src 'none'` で拒否されている | ビルド時 import か SDK 経由にする。predeploy チェック 13 で検出 |
| 上の階の床に下の階の壁の線が白く透ける | 壁の上面と上の階の床の下面が同じ高さ（z-fighting） | 上に階がある壁は床スラブの下で止める |
| 内見で階段の途中から上がれない（2 階に切り替わった所で止まる） | 上の階の手すり壁（頭上にある開口の縁）に当たっている | 段の上を移動している間は上の階の床の上の物を当たり判定から外す |
| ヘッドレス試験のスクリーンショットが真っ白 | 開発サーバーの初回コンパイルが待ち時間内に終わっていない | 本番ビルド（`vite build` → `vite preview`）を対象にする |
