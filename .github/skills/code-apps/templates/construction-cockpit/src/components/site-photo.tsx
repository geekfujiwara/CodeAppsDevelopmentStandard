import { cn } from "@/lib/utils"
import { resolvePhotoUrl } from "@/lib/site-photos"

type SitePhotoProps = {
  photoUrl: string
  caption: string
  projectName: string
  reportDate: string
  className?: string
  showBoard?: boolean
}

/** 工事写真。日本の工事写真と同様に、工事名・工種・測点・日付を記した工事黒板を重ねて表示する */
export function SitePhoto({ photoUrl, caption, projectName, reportDate, className, showBoard = true }: SitePhotoProps) {
  const source = resolvePhotoUrl(photoUrl)
  const [work = caption, station = ""] = caption.split("測点").map((value) => value.trim())
  if (!source) {
    return <div className={cn("grid aspect-video place-items-center bg-slate-200 text-sm text-slate-500", className)}>写真を表示できません</div>
  }
  return (
    <figure className={cn("relative aspect-video overflow-hidden bg-slate-900", className)}>
      <img src={source} alt={caption || projectName} className="h-full w-full object-cover" loading="lazy" />
      {showBoard && (
        <figcaption className="absolute bottom-2 left-2 w-[min(15rem,58%)] rounded-sm border-2 border-[#d6c7a1] bg-[#1f4d3a]/95 p-2 text-[0.62rem] leading-4 text-white shadow-lg">
          <dl className="grid min-w-0 grid-cols-[2.8rem_minmax(0,1fr)] gap-x-1">
            <dt className="min-w-0 text-[#d9f99d]">工事名</dt><dd className="min-w-0 truncate">{projectName}</dd>
            <dt className="min-w-0 text-[#d9f99d]">工種</dt><dd className="min-w-0 truncate">{work}</dd>
            {station && <><dt className="min-w-0 text-[#d9f99d]">測点</dt><dd className="min-w-0 truncate">{station}</dd></>}
            <dt className="min-w-0 text-[#d9f99d]">撮影日</dt><dd className="min-w-0">{reportDate.slice(0, 10)}</dd>
          </dl>
        </figcaption>
      )}
    </figure>
  )
}
