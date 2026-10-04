// demo:<scene>:<weather> 形式の写真キーを、アプリに同梱した画像（CSP の img-src 'self' で表示可能）へ解決する
const DEMO_PHOTOS = import.meta.glob("../assets/demo-photos/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>

export function resolvePhotoUrl(photoUrl: string): string {
  if (!photoUrl.startsWith("demo:")) return photoUrl
  const [, scene = "", weather = "sunny"] = photoUrl.split(":")
  return DEMO_PHOTOS[`../assets/demo-photos/${scene}-${weather}.svg`]
    ?? DEMO_PHOTOS[`../assets/demo-photos/${scene}-sunny.svg`]
    ?? ""
}
