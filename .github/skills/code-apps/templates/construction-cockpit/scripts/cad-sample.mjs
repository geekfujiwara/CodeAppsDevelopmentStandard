// CAD（BIM）から書き出したモデルを模したサンプルを作る。CAD 取り込み機能の検証・デモ用。
// 工程の部位情報（extras）を消し、IFC 風の部品名・階層・Z-up・mm 単位に変換するため、
// アプリ側は「名前からの自動対応付け」と「座標・単位の正規化」を通らないと工程と結び付かない。
import { Group, Matrix4, Mesh, PropertyBinding } from "three"

/** 部位キー → CAD 側のカテゴリ名（IFC クラス名 + 日本語） */
const CATEGORY = {
  pile: "IfcPile 場所打ち杭",
  foundation: "IfcFooting 基礎",
  frame: "IfcColumn 鉄骨柱梁",
  slab: "IfcSlab 床",
  scaffold: "Temporary 足場",
  envelope: "IfcCurtainWall 外装",
  roof: "IfcRoof 屋上",
  mep: "IfcFlowSegment 設備",
  interior: "IfcWall 内装",
  exterior: "Hardscape 外構",
}

/**
 * @param {{ root: Group, title: string }} model 生成コードのモデル（Y-up・m）
 * @returns {{ scene: Group, rules: Record<string, { zone: string, grow: string, kind: string }> }}
 *   rules のキーは GLTFLoader が読み込んだ後のノード名（空白などは _ に置換される）
 */
export function toCadStyle(model) {
  model.root.updateMatrixWorld(true)
  // Y-up（m）→ Z-up（mm）: x→x, y→z, z→-y
  const toCad = new Matrix4().makeRotationX(Math.PI / 2).premultiply(new Matrix4().makeScale(1000, 1000, 1000))
  const scene = new Group()
  scene.name = model.title
  const categories = new Map()
  const others = new Group()
  others.name = "Site Equipment 仮設・周辺"
  const terrainGroup = new Group()
  terrainGroup.name = "Topography 地盤"
  let serial = 0
  const meshes = []
  model.root.traverse((object) => { if (object instanceof Mesh) meshes.push(object) })
  for (const mesh of meshes) {
    const data = mesh.userData ?? {}
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(toCad)
    const cadMesh = new Mesh(geometry, mesh.material)
    cadMesh.name = `Mesh_${String(++serial).padStart(4, "0")}`
    if (mesh.name.startsWith("terrain")) {
      terrainGroup.add(cadMesh)
      continue
    }
    const zone = data.zone
    if (!zone || !CATEGORY[zone]) {
      others.add(cadMesh)
      continue
    }
    let category = categories.get(zone)
    if (!category) {
      category = { group: new Group(), levels: new Map(), grow: data.grow ?? "y", kind: data.invert ? "remove" : data.temporary ? "temporary" : "build" }
      category.group.name = CATEGORY[zone]
      categories.set(zone, category)
    }
    // segment（階・区画）ごとに「Level n」のグループへまとめる。CAD の階別グループに相当する
    const index = data.segment ? data.segment[0] + 1 : 1
    let level = category.levels.get(index)
    if (!level) {
      level = new Group()
      level.name = `${CATEGORY[zone].split(" ")[0]} Level ${index}`
      category.levels.set(index, level)
    }
    level.add(cadMesh)
  }
  scene.add(terrainGroup)
  for (const { group, levels } of categories.values()) {
    for (const key of [...levels.keys()].sort((a, b) => a - b)) group.add(levels.get(key))
    scene.add(group)
  }
  if (others.children.length) scene.add(others)
  const sanitize = (name) => PropertyBinding.sanitizeNodeName(name)
  const rules = Object.fromEntries([...categories].map(([zone, item]) => [sanitize(CATEGORY[zone]), { zone, grow: item.grow, kind: item.kind }]))
  rules[sanitize("Topography 地盤")] = { zone: "@terrain", grow: "y", kind: "build" }
  return { scene, rules }
}
