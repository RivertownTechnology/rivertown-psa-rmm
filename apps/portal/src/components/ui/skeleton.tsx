import * as React from "react"

import { cn } from "@/lib/utils"

const Skeleton = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("bg-muted animate-pulse rounded-md", className)}
    {...props}
  />
))
Skeleton.displayName = "Skeleton"

interface SkeletonTableProps extends React.HTMLAttributes<HTMLDivElement> {
  rows?: number
  columns?: number
}

function SkeletonTable({
  rows = 5,
  columns = 4,
  className,
  ...props
}: SkeletonTableProps) {
  return (
    <div className={cn("w-full rounded-md border", className)} {...props}>
      {/* Header */}
      <div className="flex items-center gap-4 border-b bg-muted/50 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={`header-${i}`}
            className="h-4"
            style={{ width: `${100 / columns}%` }}
          />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={`row-${rowIndex}`}
          className={cn(
            "flex items-center gap-4 px-4 py-3",
            rowIndex < rows - 1 && "border-b"
          )}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={`cell-${rowIndex}-${colIndex}`}
              className="h-4"
              style={{ width: `${100 / columns}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
SkeletonTable.displayName = "SkeletonTable"

function SkeletonList({
  rows = 3,
  className,
  ...props
}: { rows?: number } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("space-y-2", className)} {...props}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-lg border p-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-1/4" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  )
}
SkeletonList.displayName = "SkeletonList"

export { Skeleton, SkeletonTable, SkeletonList }
