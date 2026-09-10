/**
 * Google マップ埋め込みの上に自前のピンを重ねるための投影計算。
 * 埋め込み iframe は複数ピンを打てないため、地図は背景として静的に表示し、
 * ピン位置だけをここで Web メルカトルで計算して一致させる。
 */

/** 日本全域が収まる初期表示 */
export const JAPAN_VIEW = { latitude: 37.2, longitude: 137.6, zoom: 5 }
export const MIN_ZOOM = 4
export const MAX_ZOOM = 16

const TILE_SIZE = 256
/** 画面外のピンを描かないための余白（ピクセル） */
const PIN_MARGIN = 40

export type MapView = { latitude: number; longitude: number; zoom: number }
export type MapSize = { width: number; height: number }
export type Point = { x: number; y: number }

/** Web メルカトル。Google マップの埋め込みと同じ投影なのでピクセル位置を一致させられる。 */
export function project(latitude: number, longitude: number, zoom: number): Point {
  const scale = TILE_SIZE * 2 ** zoom
  const sin = Math.sin((latitude * Math.PI) / 180)
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

type Located = { latitude: number; longitude: number }

/** 緯度経度が未設定（0,0）の拠点は地図に出さない */
export function hasLocation(site: Located): boolean {
  return site.latitude !== 0 || site.longitude !== 0
}

/** 表示中の地図に対するピンの CSS 位置。表示範囲外のものは除外する。 */
export function pinPositions<T extends Located>(
  sites: T[],
  view: MapView,
  size: MapSize,
): { site: T; left: number; top: number }[] {
  const center = project(view.latitude, view.longitude, view.zoom)
  return sites
    .filter(hasLocation)
    .map((site) => {
      const point = project(site.latitude, site.longitude, view.zoom)
      return {
        site,
        left: size.width / 2 + (point.x - center.x),
        top: size.height / 2 + (point.y - center.y),
      }
    })
    .filter(
      (pin) =>
        pin.left > -PIN_MARGIN &&
        pin.left < size.width + PIN_MARGIN &&
        pin.top > -PIN_MARGIN &&
        pin.top < size.height + PIN_MARGIN,
    )
}
