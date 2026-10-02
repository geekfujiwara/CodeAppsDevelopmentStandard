import { cn } from "@/lib/utils"

type GoogleMapEmbedProps = {
  latitude?: number
  longitude?: number
  address?: string
  label: string
  zoom?: number
  className?: string
}

export function GoogleMapEmbed({
  latitude,
  longitude,
  address,
  label,
  zoom = 15,
  className,
}: GoogleMapEmbedProps) {
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude)
  const query = hasCoordinates ? `${latitude},${longitude}` : address?.trim()

  if (!query) {
    return (
      <div className={cn("grid place-items-center rounded-lg border bg-muted", className)}>
        <p className="text-sm text-muted-foreground">位置情報がありません。</p>
      </div>
    )
  }

  const source =
    `https://maps.google.com/maps?q=${encodeURIComponent(query)}` +
    `&z=${zoom}&hl=ja&output=embed`

  return (
    <iframe
      src={source}
      title={`地図: ${label}`}
      className={cn("w-full rounded-lg border", className)}
      style={{ border: 0 }}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      sandbox="allow-scripts allow-same-origin allow-popups"
    />
  )
}
