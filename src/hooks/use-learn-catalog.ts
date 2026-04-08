import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchLearnCatalog } from "@/lib/learn-client"
import type { LearnCatalogOptions, LearnCatalogSnapshot } from "@/lib/learn-client"

const QUERY_KEY = ["learn", "catalog"] as const

export function useLearnCatalog(options?: LearnCatalogOptions) {
  const query = useQuery<LearnCatalogSnapshot, Error>({
    queryKey: options ? [...QUERY_KEY, options] : QUERY_KEY,
    queryFn: () => fetchLearnCatalog(options),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 2 * 60 * 60 * 1000 // 2 hours
  })

  const summary = useMemo(() => {
    if (!query.data) {
      return null
    }

    const moduleCount = query.data.modules.length
    const learningPathCount = query.data.learningPaths.length
    const certificationCount = query.data.certifications.length
    const averageDuration = moduleCount
      ? Math.round(
          query.data.modules.reduce((total, module) => total + module.durationInMinutes, 0) /
            moduleCount
        )
      : 0

    return {
      moduleCount,
      learningPathCount,
      certificationCount,
      averageDuration
    }
  }, [query.data])

  return {
    ...query,
    summary
  }
}
