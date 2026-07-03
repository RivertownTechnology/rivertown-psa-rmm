import { cn } from "@/lib/utils"

interface BrandLockupProps {
  /** Visual size of the lockup. */
  size?: "sm" | "md" | "lg"
  /** Stack the logo above the label and center it (used on auth screens). */
  stacked?: boolean
  className?: string
}

const LOGO_SIZE = { sm: "h-7", md: "h-8", lg: "h-16" }
const LABEL_SIZE = { sm: "text-base", md: "text-lg", lg: "text-2xl" }

/**
 * The single brand lockup used across every portal surface
 * (login, MFA, change-password, dashboard header): the Rivertown
 * logo paired with the "Customer Portal" wordmark.
 */
export function BrandLockup({ size = "md", stacked = false, className }: BrandLockupProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        stacked && "flex-col gap-3 text-center",
        className
      )}
    >
      <img src="/logo.png" alt="Rivertown Technology" className={cn(LOGO_SIZE[size], "w-auto")} />
      <span className={cn("font-semibold tracking-tight", LABEL_SIZE[size], stacked && "font-bold")}>
        Customer Portal
      </span>
    </div>
  )
}
