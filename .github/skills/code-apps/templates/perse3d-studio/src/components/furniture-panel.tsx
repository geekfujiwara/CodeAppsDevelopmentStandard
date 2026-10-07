import { Archive, Armchair, BedDouble, BedSingle, Car, CarFront, CookingPot, Eraser, Lamp, Monitor, MousePointerClick, Refrigerator, RotateCcw, RotateCw, Shirt, Sofa, Sparkles, Sprout, Square, Trash2, Tv, UtensilsCrossed, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CATALOG, CATEGORY_LABELS, catalogItem, type Category, type FurnitureItem } from "@/lib/furniture"
import { cn } from "@/lib/utils"

const ICONS: Record<string, LucideIcon> = {
  sofa: Sofa,
  coffeeTable: Square,
  rug: Square,
  tvBoard: Tv,
  diningSet: UtensilsCrossed,
  kitchen: CookingPot,
  fridge: Refrigerator,
  bedDouble: BedDouble,
  bedSingle: BedSingle,
  nightstand: Lamp,
  wardrobe: Shirt,
  desk: Monitor,
  shoeCabinet: Archive,
  plant: Sprout,
  car: Car,
  suv: CarFront,
  chair: Armchair,
}

const CATEGORIES: Category[] = ["living", "dining", "bedroom", "entry", "wet", "lighting", "vehicle"]

type Props = {
  items: FurnitureItem[]
  selected: FurnitureItem | null
  placeType: string | null
  disabled?: boolean
  saving?: boolean
  onAuto: () => void
  onClear: () => void
  onStartPlace: (type: string | null) => void
  onRotate: (delta: number) => void
  onDelete: () => void
  onColor: (color: string) => void
}

export function FurniturePanel({ items, selected, placeType, disabled, saving, onAuto, onClear, onStartPlace, onRotate, onDelete, onColor }: Props) {
  const sel = selected ? catalogItem(selected.type) : null
  const isVehicle = sel?.category === "vehicle"
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><Sparkles className="h-4 w-4" />おまかせ配置</CardTitle>
          <CardDescription className="text-xs">
            部屋の名前と広さから家具・水回り設備・照明を選び、壁に背を付けて配置します。ドア・掃き出し窓・階段の前は通路として空け、背の高い家具は窓の前に置きません。3D モデルがある家具は実物のモデルを使います。駐車場には車を 1 台置きます。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button size="sm" className="gap-1" onClick={onAuto} disabled={disabled} data-tour="furniture-auto">
            <Sparkles className="h-3.5 w-3.5" />全室に家具と車を配置
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={onClear} disabled={disabled || items.length === 0}>
            <Eraser className="h-3.5 w-3.5" />すべて片付ける
          </Button>
          <span className="ml-auto self-center text-xs text-muted-foreground">
            {items.length} 点{saving ? "・保存中…" : ""}
          </span>
        </CardContent>
      </Card>

      {selected && sel && (
        <Card className="border-amber-400">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              {(() => {
                const Icon = ICONS[selected.type] ?? Square
                return <Icon className="h-4 w-4" />
              })()}
              {sel.label}
            </CardTitle>
            <CardDescription className="text-xs">ドラッグで移動（壁際では自動で壁に寄せます）・R で回転・Delete で削除</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sel.colorable && (
              <div className="flex flex-wrap items-center gap-2">
                {(sel.colors ?? []).map(c => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    aria-label={`色 ${c}`}
                    onClick={() => onColor(c)}
                    className={cn("h-7 w-7 rounded-full border-2", (selected.color ?? CATALOG.materials[sel.colorable!]?.color) === c ? "border-primary" : "border-transparent")}
                    style={{ background: c }}
                  />
                ))}
                <input
                  type="color"
                  value={selected.color ?? CATALOG.materials[sel.colorable]?.color ?? "#888888"}
                  onChange={e => onColor(e.target.value)}
                  className="h-7 w-9 cursor-pointer border-0 bg-transparent p-0"
                  aria-label="色を指定"
                />
              </div>
            )}
            {sel.model && (
              <p className="text-[11px] text-muted-foreground">
                3D モデル: {sel.model.author}（{sel.model.license}）・
                <a href={sel.model.source} target="_blank" rel="noreferrer" className="underline">出典</a>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1" onClick={() => onRotate(isVehicle ? 180 : 90)}>
                <RotateCcw className="h-3.5 w-3.5" />{isVehicle ? "向きを反転" : "90° 回転"}
              </Button>
              {!isVehicle && (
                <Button size="sm" variant="outline" className="gap-1" onClick={() => onRotate(-15)}>
                  <RotateCw className="h-3.5 w-3.5" />15°
                </Button>
              )}
              <Button size="sm" variant="outline" className="ml-auto gap-1 text-destructive" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />削除
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card data-tour="furniture-catalog">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><MousePointerClick className="h-4 w-4" />置く</CardTitle>
          <CardDescription className="text-xs">選んでから 3D 上の床をクリック。屋内の家具はドールハウス表示で階を選ぶと置きやすくなります。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {CATEGORIES.map(cat => {
            const entries = Object.entries(CATALOG.items).filter(([, it]) => it.category === cat && !it.hidden)
            return (
              <div key={cat} className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">{CATEGORY_LABELS[cat]}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {entries.map(([type, it]) => {
                    const Icon = ICONS[type] ?? Square
                    const active = placeType === type
                    return (
                      <button
                        key={type}
                        type="button"
                        disabled={disabled}
                        onClick={() => onStartPlace(active ? null : type)}
                        className={cn(
                          "flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs hover:border-primary disabled:opacity-50",
                          active && "border-primary bg-primary/10 ring-1 ring-primary",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 truncate">{it.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
