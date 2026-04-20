import * as React from 'react';
import { cn } from '@/lib/utils';
import { Minus, Plus } from 'lucide-react';

interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  className?: string;
}

export function NumberStepper({
  value,
  onChange,
  min = 1,
  max = 90,
  step = 1,
  suffix,
  className,
}: NumberStepperProps) {
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  // Round to avoid floating point drift (e.g. 0.1 + 0.2 = 0.30000000000000004)
  const round = (v: number) => parseFloat(v.toFixed(10));

  function increment() {
    onChange(clamp(round(value + step)));
  }

  function decrement() {
    onChange(clamp(round(value - step)));
  }

  function startHold(direction: 'up' | 'down') {
    const fn = direction === 'up' ? increment : decrement;
    // Initial delay before repeat starts
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        fn();
      }, 80);
    }, 400);
  }

  function stopHold() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  }

  // Clean up on unmount
  React.useEffect(() => stopHold, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      increment();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      decrement();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw === '') return;
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      onChange(clamp(round(parsed)));
    }
  }

  // Format display value: drop trailing .0 for integers
  const displayValue = Number.isInteger(value) ? String(value) : value.toFixed(1);

  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <div className={cn('inline-flex items-center rounded-lg border bg-card shadow-sm', className)}>
      {/* Decrement */}
      <button
        type="button"
        aria-label="Decrease value"
        disabled={atMin}
        onClick={decrement}
        onMouseDown={() => startHold('down')}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
        className={cn(
          'flex items-center justify-center h-9 w-9 rounded-l-lg transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          atMin
            ? 'text-muted-foreground/30 cursor-not-allowed'
            : 'text-red-500 hover:bg-red-500/10 active:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/15 dark:active:bg-red-500/25',
        )}
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>

      {/* Value display / input */}
      <div className="relative flex items-center border-x">
        <input
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          aria-label={suffix ? `Value in ${suffix}` : 'Value'}
          className={cn(
            'h-9 bg-transparent text-center font-semibold tabular-nums text-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:rounded-sm',
            'selection:bg-primary/20',
            suffix ? 'w-12 pr-0' : 'w-14',
          )}
        />
        {suffix && (
          <span className="text-xs text-muted-foreground pr-2.5 select-none">{suffix}</span>
        )}
      </div>

      {/* Increment */}
      <button
        type="button"
        aria-label="Increase value"
        disabled={atMax}
        onClick={increment}
        onMouseDown={() => startHold('up')}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
        className={cn(
          'flex items-center justify-center h-9 w-9 rounded-r-lg transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          atMax
            ? 'text-muted-foreground/30 cursor-not-allowed'
            : 'text-green-600 hover:bg-green-500/10 active:bg-green-500/20 dark:text-green-400 dark:hover:bg-green-500/15 dark:active:bg-green-500/25',
        )}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}
