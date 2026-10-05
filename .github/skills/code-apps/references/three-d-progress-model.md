# 3D 施工進捗モデル（Three.js / glTF）

工事・設備・建物などの「完成形」と「いまの進捗」を 1 つの 3D で見せるパターン。
実装例は [templates/construction-cockpit](../templates/construction-cockpit/README.md) の `src/lib/models/` と
`src/components/project-model-3d.tsx`。

GLB の読み込み方・素材・CSP の詳細は [3D 資産の共通利用](3d-asset-sharing.md) を正とし、ここでは「進捗をどう見せるか」に絞る。
異常系は [troubleshooting.md](troubleshooting.md) の #69〜#81。

## 原則

| 原則 | 内容 |
|---|---|
| 外部素材を実行時に取らない | drei の `<Environment preset>` は HDR を CDN から取り、CSP で失敗するとアプリ全体が落ちる（#77）。照明は `hemisphereLight` / `directionalLight` で組む |
| GLB は共通部品で読む | `?inline` で同梱し、[templates/csp-safe-gltf.ts](../templates/csp-safe-gltf.ts) の `createCspSafeGltfLoader().parseAsync` で解析する（`useGLTF(url)` や `loader.load` は fetch する） |
| 部位と工程を名前で結ぶ | メッシュの `userData`（glTF の `extras`）に `zone`・`segment: [順番, 総数]`・`grow`・`invert`・`temporary` を持たせ、作業の部位キー（例 `{prefix}_zone`）と突き合わせる |
| 完成形は点線で常に出す | 未着手でも輪郭が見えるので、どこを造る工事かが分かる。仮設物（足場・桟橋・規制）は完成形に含めない |
| ラベルは Canvas の外 | drei `<Html>` は別 React root を作り、再描画で unmount 競合のエラーを出す（#78）。DOM のボタンを Canvas に重ね、`useFrame` で 3D 座標を画面座標に投影する |

`npm run predeploy` のチェック 13（`detect-csp-hazards.mjs`）とチェック 14 が、上の 1・2・5 番目の違反を毎回検出する。

## 進捗の表し方

| 状態 | 表示 |
|---|---|
| 未着手 | 実体は極薄（不透明度 0.05）＋ `EdgesGeometry` を `LineDashedMaterial` で破線表示（`computeLineDistances()` が必須） |
| 施工中 | 材質を複製して `clippingPlanes` を設定し、部位の外接箱を施工方向（`grow`: `y` は下から上、`-z` は坑口から奥）に進捗分だけ残す。`gl.localClippingEnabled = true` が必要。発光色で施工中／遅延を分ける |
| 施工済 | 元の材質。`invert`（切土・床掘）は非表示にして「削り終わった」ことを示す |
| 選択 | 黄色の発光と破線。部位・ピン・工程バーのどれを選んでも同じ作業を強調する |

`segment` を持つ部位（杭 6 本、覆工 12 スパン、12 階分の鉄骨など）は、進捗 × 総数で何個目まで完成かを決め、
境目の 1 個だけをクリッピングで途中表示する。

## モデルの作り方

- 単位はメートルで実寸にする。断面は `ExtrudeGeometry` で作る（H 形鋼、小判形の柱、円環の覆工、U 型水路）。箱だけで作らない。
- 同じ部位・同じ材質の形状は `mergeGeometries` で 1 メッシュにまとめる（描画呼び出しを減らす）。
- 左右対称の部材を `scale(-1, 1, 1)` で作らない。面の向きが裏返り、片側だけ黒く見える。断面の座標で作り分ける。
- 地形は `PlaneGeometry` の高さを関数で変え、頂点色で草地・法面・河床を塗り分ける。地中の杭やトンネルを見せる種別は、地盤を半透明にする切り替えを既定で有効にする。
- ブラウザと Node の両方で動くよう、モデル生成コードは three だけに依存させ、相対 import に拡張子（`./kit.ts`）を付ける。

## GLB の書き出し

```powershell
npm run export:models            # 同梱する GLB を更新（src/assets/models/）
npm run export:models -- --all   # 全種別を exports/models/ に書き出す（コミットしない）
```

- Node 24 以降は型除去で `.ts` のモデル生成コードをそのまま import できる。`GLTFExporter` のバイナリ出力は `FileReader` を使うため、Node 用の最小実装を先に置く。
- テクスチャを使わないなら UV を消し、`mergeVertices` でインデックス化する。実測で橋のモデルが 3.2 MB → 1.35 MB になった。
- ルートの `userData`（表題・カメラ位置）は、読み込み時にシーン直下の子ノードの `extras` 側に入る。読み込み側は `root.children[0].userData` も見る。
- 同梱するのは代表の 1〜2 モデルに絞る。JS に base64 で入るため、GLB 1 MB はチャンク約 1.8 MB（gzip 後約 0.4 MB）になる。3D の画面だけで読むよう遅延読み込みにする。

## BIM/CIM の glTF を使う

`extras` が無い glTF は、ノード名で部位を対応付ける。

| ノード名 | 意味 |
|---|---|
| `P1-column#2/5` | 部位 `P1-column` の 5 個中 2 個目 |
| `zone:P1-footing` | 部位 `P1-footing`（分割なし） |
| 上記以外 | 周辺物（進捗に関係なく常に表示） |

外部 URL を使う場合は CSP の `connect-src` にホストを追加し（その行には `// csp-ok: <理由>`）、読み込めないときは標準モデルに切り替えて理由を画面に出す。

## 目視確認

WebGL は描画完了までが長い（GLB の解析・影の計算）。固定時間で撮ると背景だけの画面になるため、準備完了の条件を待って撮る（#81）。

```powershell
node .github/skills/code-apps/scripts/capture_3d.mjs --url "http://127.0.0.1:5173/#/projects/<id>" `
  --ready "document.querySelector('canvas') && !document.body.innerText.includes('読み込み中')" --ready-timeout 180 `
  --out .tools/shots/model.png --fail-on-error
```

ページの例外と `console.error` は `problems` に出力される（CSP 違反や React root の競合は画面に出ないため）。
