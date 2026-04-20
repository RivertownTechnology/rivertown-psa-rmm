import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export interface PopoverFilterOption {
  value: string
  label: string
}

export interface PopoverFilterProps {
  label: string
  options: PopoverFilterOption[]
  selected: string[]
  onSelectionChange: (selected: string[]) => void
}

function PopoverFilter({
  label,
  options,
  selected,
  onSelectionChange,
}: PopoverFilterProps) {
  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onSelectionChange(selected.filter((v) => v !== value))
    } else {
      onSelectionChange([...selected, value])
    }
  }

  const handleClear = () => {
    onSelectionChange([])
  }

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <span>{label}</span>
          {selected.length > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
              {selected.length}
            </span>
          )}
          <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="z-50 w-56 rounded-md border bg-popover p-2 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
          sideOffset={4}
          align="start"
        >
          <div className="max-h-60 overflow-y-auto">
            {options.map((option) => {
              const isChecked = selected.includes(option.value)
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
                    isChecked && "font-medium"
                  )}
                >
                  <CheckboxPrimitive.Root
                    checked={isChecked}
                    onCheckedChange={() => handleToggle(option.value)}
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary shadow-sm transition-colors",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                      isChecked && "bg-primary text-primary-foreground"
                    )}
                  >
                    <CheckboxPrimitive.Indicator>
                      <Check className="h-3 w-3" />
                    </CheckboxPrimitive.Indicator>
                  </CheckboxPrimitive.Root>
                  <span className="truncate">{option.label}</span>
                </label>
              )
            })}
          </div>
          {selected.length > 0 && (
            <>
              <div className="my-1 border-t" />
              <button
                type="button"
                onClick={handleClear}
                className="w-full rounded-sm px-2 py-1.5 text-center text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Clear filters
              </button>
            </>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
PopoverFilter.displayName = "PopoverFilter"

export { PopoverFilter }
