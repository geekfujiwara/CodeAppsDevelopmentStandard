import * as THREE from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"
import { CATALOG, catalogItem, expandParts, type FurnitureItem, type ShapePart } from "@/lib/furniture"
import { loadCatalogModel } from "@/lib/model-loader"

/** 家具・車の Three.js メッシュ生成（ジオメトリと材質はキャッシュして使い回す） */
export class FurnitureFactory {
  private geos = new Map<string, THREE.BufferGeometry>()
  private mats = new Map<string, THREE.Material>()
  /** 3D モデルに置き換えたアイテム数（検証用） */
  modelsShown = 0
  /** モデルの読み込みが終わって見た目が変わったとき */
  onChange?: () => void

  private geometry(part: ShapePart): THREE.BufferGeometry {
    const [w, h, d] = part.z
    const key = `${part.s}|${w}|${h}|${d}|${part.r ?? 0}|${part.axis ?? "y"}`
    let g = this.geos.get(key)
    if (g) return g
    if (part.s === "box") {
      const r = Math.min(part.r ?? 0, Math.min(w, h, d) / 2 - 1e-4)
      g = r > 0.002 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d)
    } else if (part.s === "cyl") {
      // z = [直径, 長さ, 直径]
      g = new THREE.CylinderGeometry(w / 2, w / 2, h, 24)
      if (part.axis === "x") g.rotateZ(Math.PI / 2)
      else if (part.axis === "z") g.rotateX(Math.PI / 2)
    } else {
      g = new THREE.IcosahedronGeometry(0.5, 2)
      g.scale(w, h, d)
    }
    this.geos.set(key, g)
    return g
  }

  material(key: string, color?: string): THREE.Material {
    const def = CATALOG.materials[key] ?? { color: "#cccccc", roughness: 0.6, metalness: 0 }
    const c = color ?? def.color
    const cacheKey = `${key}|${c}`
    let m = this.mats.get(cacheKey)
    if (m) return m
    if (def.coat || def.sheen) {
      const pm = new THREE.MeshPhysicalMaterial({ color: c, roughness: def.roughness, metalness: def.metalness })
      if (def.coat) {
        pm.clearcoat = def.coat
        pm.clearcoatRoughness = 0.05
      }
      if (def.sheen) {
        pm.sheen = def.sheen
        pm.sheenRoughness = 0.8
        pm.sheenColor = new THREE.Color(c).lerp(new THREE.Color("#ffffff"), 0.3)
      }
      m = pm
    } else {
      const sm = new THREE.MeshStandardMaterial({ color: c, roughness: def.roughness, metalness: def.metalness })
      if (def.emissive) {
        sm.emissive = new THREE.Color(c)
        sm.emissiveIntensity = def.emissive
      }
      m = sm
    }
    if (key === "leaf") (m as THREE.MeshStandardMaterial).flatShading = true
    this.mats.set(cacheKey, m)
    return m
  }

  /** y = 床からの持ち上げ（天井付けの器具は天井の高さ） */
  build(item: FurnitureItem, y = 0): THREE.Group | null {
    const cat = catalogItem(item.type)
    if (!cat) return null
    const g = new THREE.Group()
    for (const part of expandParts(item.type)) {
      const mat = this.material(part.m, part.m === cat.colorable ? item.color : undefined)
      const mesh = new THREE.Mesh(this.geometry(part), mat)
      mesh.position.set(...part.p)
      const rot = part.rot ?? [0, 0, 0]
      mesh.rotation.set(THREE.MathUtils.degToRad(rot[0]), THREE.MathUtils.degToRad(rot[1]), THREE.MathUtils.degToRad(rot[2]), "YXZ")
      mesh.castShadow = !cat.flat
      mesh.receiveShadow = true
      mesh.userData.furnitureId = item.id
      g.add(mesh)
    }
    g.position.set(item.x, y, item.z)
    g.rotation.y = THREE.MathUtils.degToRad(item.ry)
    g.userData.furnitureId = item.id
    g.userData.level = item.level
    // 実在の 3D モデルがあれば、読み終わったところで外形の箱と差し替える（読めなければ箱のまま）
    if (cat.model) {
      void loadCatalogModel(item.type).then(model => {
        if (!model) return
        const clone = model.clone(true)
        clone.traverse(o => (o.userData.furnitureId = item.id))
        g.clear()
        g.add(clone)
        this.modelsShown++
        this.onChange?.()
      })
    }
    return g
  }

  /** キャッシュ済みのジオメトリ・材質は共有なので、グループの破棄では dispose しない */
  dispose() {
    for (const g of this.geos.values()) g.dispose()
    for (const m of this.mats.values()) m.dispose()
    this.geos.clear()
    this.mats.clear()
  }
}
