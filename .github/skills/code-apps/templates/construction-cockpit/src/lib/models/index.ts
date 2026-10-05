// 工事種別ごとの 3D 施工モデルの入口。ブラウザと Node（GLB 書き出し）の両方から使う。
import { Group } from "three"
import { buildBridge } from "./bridge.ts"
import { buildBuilding } from "./building.ts"
import { buildChannel } from "./channel.ts"
import { buildEarthwork } from "./earthwork.ts"
import { box, terrain, zoneParts, type ConstructionModel } from "./kit.ts"
import { buildRoad } from "./road.ts"
import { buildTunnel } from "./tunnel.ts"

export type { ConstructionModel, GrowAxis, Vec3, ZoneInfo } from "./kit.ts"
export { disposeModel } from "./kit.ts"

export const MODEL_TYPE = { bridge: 100000000, earthwork: 100000001, tunnel: 100000002, building: 100000003, channel: 100000004, road: 100000005 } as const

export const MODEL_TYPE_LABEL: Record<number, string> = {
  100000000: "橋梁",
  100000001: "造成",
  100000002: "トンネル",
  100000003: "建築",
  100000004: "水路・護岸",
  100000005: "道路",
}

/** 作業の ${PUBLISHER_PREFIX}_zone に設定できる部位キー（Cowork の新規工事ガイドと同じ一覧） */
export const MODEL_ZONES: Record<number, string[]> = {
  100000000: ["site", "A1-pile", "A1-body", "P1-pile", "P1-footing", "P1-column", "P2-pile", "P2-footing", "P2-column", "A2-body", "river", "superstructure"],
  100000001: ["site", "cut-1", "cut-2", "fill-1", "fill-2", "retaining", "drain", "slope", "road"],
  100000002: ["portal", "upper", "lower", "invert", "lining", "portal-finish", "equip"],
  100000003: ["pile", "foundation", "frame", "slab", "scaffold", "envelope", "roof", "mep", "interior", "exterior"],
  100000004: ["site", "excavation", "base", "precast", "revetment", "backfill", "pave"],
  100000005: ["site", "subgrade", "subbase", "base", "binder", "surface", "marking"],
}

/** 地中の杭や山体内部を見せるため、既定で地盤を半透明にするモデル */
export const SEE_THROUGH_DEFAULT: Record<number, boolean> = { 100000000: true, 100000002: true, 100000003: true }

/** アプリに同梱する GLB。容量を抑えるため橋梁のみ。他の種別は同じ生成コードで実行時に組み立てる */
export const BUNDLED_MODELS: Record<string, () => ConstructionModel> = {
  "bridge-3span": buildBridge,
}

/** GLB として書き出せる全モデル（npm run export:models -- --all） */
export const EXPORTABLE_MODELS: Record<string, () => ConstructionModel> = {
  ...BUNDLED_MODELS,
  "earthwork-terrace": buildEarthwork,
  "tunnel-natm": buildTunnel,
  "channel-revetment": buildChannel,
  "road-pavement": buildRoad,
  "building-12f": () => buildBuilding({ floors: 12, width: 4, depth: 4 }),
}

export function parseModelParams(value: string): Record<string, number> {
  return Object.fromEntries(
    value.split(";").map((pair) => pair.split("=")).filter(([key, raw]) => key && raw !== undefined && raw !== "" && !Number.isNaN(Number(raw)))
      .map(([key, raw]) => [key.trim(), Number(raw)]),
  )
}

/** 工事種別が未設定のときの汎用モデル（作業ごとのブロック） */
function buildGeneric(zones: Array<{ zone: string; label: string }>): ConstructionModel {
  const group = new Group()
  group.name = "generic"
  group.add(terrain(40, 40, 0, 0, () => 0, 4))
  zones.slice(0, 16).forEach(({ zone, label }, index) => {
    const x = ((index % 4) - 1.5) * 6
    const z = (Math.floor(index / 4) - 1.5) * 6
    zoneParts(group, { zone, label, grow: "y" }, [["concrete", [box(4, 5, 4, [x, 2.5, z])]]])
  })
  return { title: "工程モデル", root: group, camera: [26, 22, 30], target: [0, 2, 0] }
}

export function buildConstructionModel(modelType: number, params: string, fallbackZones: Array<{ zone: string; label: string }> = []): ConstructionModel {
  switch (modelType) {
    case MODEL_TYPE.bridge: return buildBridge()
    case MODEL_TYPE.earthwork: return buildEarthwork()
    case MODEL_TYPE.tunnel: return buildTunnel()
    case MODEL_TYPE.building: return buildBuilding(parseModelParams(params))
    case MODEL_TYPE.channel: return buildChannel()
    case MODEL_TYPE.road: return buildRoad()
    default: return buildGeneric(fallbackZones)
  }
}
