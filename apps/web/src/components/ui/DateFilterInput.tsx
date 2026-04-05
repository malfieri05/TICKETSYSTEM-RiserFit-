'use client';

import { cn } from '@/lib/utils';
import { POLISH_CLASS } from '@/lib/polish';
import { useState, type ComponentPropsWithoutRef } from 'react';

export type DateFilterInputProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'type' | 'value' | 'onChange' | 'size'
> & {
  value: string;
  onChange: (value: string) => void;
  /**
   * `field` — matches form `Input` (thicker border). `filter` — same shell as filter row `ComboBox`.
   * @default 'field'
   */
  variant?: 'field' | 'filter';
  /** With `variant="filter"`, adds the same raised shadow as filter `ComboBox`es. */
  elevated?: boolean;
  /** Match input horizontal padding for hint alignment (e.g. `left-2.5` for `px-2.5`). */
  hintOffsetClassName?: string;
};

/**
 * Native `type="date"` with a compact empty hint (`m/d/y`) instead of the browser’s
 * long placeholder (e.g. mm/dd/yyyy).
 */
export function DateFilterInput({
  value,
  onChange,
  className,
  style,
  variant = 'field',
  elevated,
  hintOffsetClassName = 'left-3',
  onFocus,
  onBlur,
  ...rest
}: DateFilterInputProps) {
  const [focused, setFocused] = useState(false);
  const empty = !value;
  const showHint = empty && !focused;
  const restStyle = style
    ? (() => {
        const s = { ...style };
        delete s.border;
        delete s.borderWidth;
        delete s.borderStyle;
        delete s.borderColor;
        delete s.borderTop;
        delete s.borderRight;
        delete s.borderBottom;
        delete s.borderLeft;
        return s;
      })()
    : {};

  return (
    <div className="relative min-w-0">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={cn(
          variant === 'filter'
            ? cn(
                'block w-full box-border',
                POLISH_CLASS.filterBarControl,
                'disabled:opacity-50 disabled:cursor-not-allowed',
                elevated && 'filter-elevated-shadow',
              )
            : cn(
                'block h-9 w-full box-border rounded-[var(--radius-md)] border-2 border-solid border-[var(--color-input-border)] px-3 text-sm',
                'outline-none transition-[border-color,box-shadow,background-color] duration-[var(--duration-fast)] ease-out',
                'focus-visible:border-[var(--color-accent)]',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                elevated && 'filter-elevated-shadow',
              ),
          showHint && 'date-filter-empty',
          className,
        )}
        style={{
          ...(variant === 'filter'
            ? { background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }
            : { background: 'var(--color-input-bg)', color: 'var(--color-text-primary)' }),
          ...restStyle,
        }}
        {...rest}
      />
      {showHint ? (
        <span
          className={cn(
            'pointer-events-none absolute top-1/2 z-[1] -translate-y-1/2 text-sm select-none',
            hintOffsetClassName,
          )}
          style={{ color: 'var(--color-text-muted)' }}
          aria-hidden
        >
          mm/dd/yy
        </span>
      ) : null}
    </div>
  );
}
