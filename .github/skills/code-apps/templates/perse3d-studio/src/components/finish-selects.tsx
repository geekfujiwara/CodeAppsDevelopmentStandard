import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  FLOOR_FINISH_LABELS,
  ROOF_FINISH_LABELS,
  WALL_FINISH_LABELS,
  finishesOf,
  type FloorFinish,
  type Materials,
  type RoofFinish,
  type WallFinish,
} from "@/lib/building-spec"

/** 外壁材・屋根材・床材の選択（色とは独立して、テクスチャ・凹凸・反射が変わる） */
export function FinishSelects({ materials, onChange, compact }: { materials: Materials; onChange: (m: Materials) => void; compact?: boolean }) {
  const f = finishesOf(materials)
  const rows: { label: string; value: string; options: Record<string, string>; set: (v: string) => Materials }[] = [
    { label: "外壁材", value: f.wall, options: WALL_FINISH_LABELS, set: v => ({ ...materials, wallFinish: v as WallFinish }) },
    { label: "屋根材", value: f.roof, options: ROOF_FINISH_LABELS, set: v => ({ ...materials, roofFinish: v as RoofFinish }) },
    { label: "床材", value: f.floor, options: FLOOR_FINISH_LABELS, set: v => ({ ...materials, floorFinish: v as FloorFinish }) },
  ]
  return (
    <div className={compact ? "grid grid-cols-1 gap-2" : "grid grid-cols-1 gap-2 sm:grid-cols-3"}>
      {rows.map(r => (
        <div key={r.label} className="min-w-0 space-y-1">
          <Label className="text-xs text-muted-foreground">{r.label}</Label>
          <Select value={r.value} onValueChange={v => onChange(r.set(v))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(r.options).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  )
}
