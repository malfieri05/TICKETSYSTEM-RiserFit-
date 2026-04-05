'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

export interface TicketFeedSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  elevated?: boolean;
  /** Width / utility classes for the input (e.g. `w-64 pl-9` → use `w-64`; left padding is applied here). */
  className?: string;
  id?: string;
}

export function TicketFeedSearchField({
  value,
  onChange,
  placeholder = 'Search tickets...',
  elevated,
  className,
  id = 'ticket-feed-search',
}: TicketFeedSearchFieldProps) {
  const showClear = value.length > 0;

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
        style={{ color: 'var(--color-text-muted)' }}
        aria-hidden
      />
      <Input
        id={id}
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        elevated={elevated}
        className={cn('pl-9', showClear && 'pr-9', className)}
      />
      {showClear && (
        <button
          type="button"
          className="focus-ring absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-btn-ghost-hover-bg)] hover:text-[var(--color-text-primary)]"
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      )}
    </div>
  );
}
