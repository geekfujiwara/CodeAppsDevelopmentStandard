import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

interface LoadingSkeletonCardProps {
  variant?: "default" | "compact" | "detailed"
  count?: number
}

export function LoadingSkeletonCard({ variant = "default", count = 1 }: LoadingSkeletonCardProps) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} className="overflow-hidden">
          {variant === "detailed" && (
            <CardHeader className="space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-16" />
              </div>
            </CardHeader>
          )}
          {variant === "default" && (
            <CardHeader className="space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </CardHeader>
          )}
          {variant === "compact" && (
            <CardContent className="pt-6 space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          )}
        </Card>
      ))}
    </>
  )
}

interface LoadingSkeletonGridProps {
  columns?: 1 | 2 | 3 | 4
  count?: number
  variant?: "default" | "compact" | "detailed"
}

export function LoadingSkeletonGrid({ 
  columns = 3, 
  count = 9,
  variant = "default" 
}: LoadingSkeletonGridProps) {
  const gridClass = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  }[columns]

  return (
    <div className={`grid gap-6 ${gridClass}`}>
      <LoadingSkeletonCard variant={variant} count={count} />
    </div>
  )
}

interface LoadingSkeletonListProps {
  count?: number
}

export function LoadingSkeletonList({ count = 3 }: LoadingSkeletonListProps) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex flex-col gap-4 border border-border/60 rounded-lg p-4 md:flex-row md:items-start md:justify-between"
        >
          <div className="space-y-3 flex-1">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
      ))}
    </div>
  )
}
