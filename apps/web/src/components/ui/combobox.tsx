import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { Check, ChevronsUpDown, Search } from "lucide-react"

import { cn } from "@/lib/utils"

export interface ComboboxOption {
  value: string
  label: string
}

export interface ComboboxProps {
  options: ComboboxOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
}

const Combobox = React.forwardRef<HTMLButtonElement, ComboboxProps>(
  (
    {
      options,
      value,
      onValueChange,
      placeholder = "Select...",
      searchPlaceholder = "Search...",
      emptyText = "No results found.",
      disabled = false,
      className,
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false)
    const [search, setSearch] = React.useState("")
    const [highlightedIndex, setHighlightedIndex] = React.useState(0)
    const listRef = React.useRef<HTMLDivElement>(null)
    const inputRef = React.useRef<HTMLInputElement>(null)

    const selectedOption = options.find((o) => o.value === value)

    const filtered = React.useMemo(() => {
      if (!search) return options
      const lower = search.toLowerCase()
      return options.filter((o) => o.label.toLowerCase().includes(lower))
    }, [options, search])

    // Reset search and highlighted index when popover opens/closes
    React.useEffect(() => {
      if (open) {
        setSearch("")
        setHighlightedIndex(0)
        // Focus the search input when the popover opens
        setTimeout(() => inputRef.current?.focus(), 0)
      }
    }, [open])

    // Keep highlighted index in bounds
    React.useEffect(() => {
      if (highlightedIndex >= filtered.length) {
        setHighlightedIndex(Math.max(0, filtered.length - 1))
      }
    }, [filtered.length, highlightedIndex])

    // Scroll highlighted item into view
    React.useEffect(() => {
      if (!listRef.current) return
      const items = listRef.current.querySelectorAll("[data-combobox-item]")
      const item = items[highlightedIndex] as HTMLElement | undefined
      item?.scrollIntoView({ block: "nearest" })
    }, [highlightedIndex])

    const handleSelect = (optionValue: string) => {
      onValueChange(optionValue)
      setOpen(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1))
          break
        case "ArrowUp":
          e.preventDefault()
          setHighlightedIndex((i) => Math.max(i - 1, 0))
          break
        case "Enter":
          e.preventDefault()
          if (filtered[highlightedIndex]) {
            handleSelect(filtered[highlightedIndex].value)
          }
          break
        case "Escape":
          e.preventDefault()
          setOpen(false)
          break
      }
    }

    return (
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            ref={ref}
            type="button"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              className
            )}
          >
            <span className={cn("truncate", !selectedOption && "text-muted-foreground")}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            className="z-50 w-[var(--radix-popover-trigger-width)] rounded-md border bg-popover p-0 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
            sideOffset={4}
            align="start"
            onKeyDown={handleKeyDown}
          >
            {/* Search input */}
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setHighlightedIndex(0)
                }}
                placeholder={searchPlaceholder}
                className="flex h-9 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            {/* Options list */}
            <div
              ref={listRef}
              role="listbox"
              className="max-h-60 overflow-y-auto p-1"
              onWheel={e => e.stopPropagation()}
            >
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {emptyText}
                </p>
              ) : (
                filtered.map((option, index) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    data-combobox-item
                    aria-selected={option.value === value}
                    className={cn(
                      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none",
                      index === highlightedIndex && "bg-accent text-accent-foreground",
                      option.value === value && "font-medium"
                    )}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => handleSelect(option.value)}
                  >
                    <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                      {option.value === value && (
                        <Check className="h-4 w-4" />
                      )}
                    </span>
                    <span className="truncate">{option.label}</span>
                  </button>
                ))
              )}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    )
  }
)
Combobox.displayName = "Combobox"

export { Combobox }
