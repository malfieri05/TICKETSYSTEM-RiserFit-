'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MarketOption {
  id: string;
  name: string;
}

export interface MarketSearchSelectProps {
  markets: MarketOption[];
  /** Selected market id, or '' for "All states". */
  value: string;
  onChange: (marketId: string) => void;
  label?: string;
  className?: string;
}

/**
 * Searchable state/market dropdown. Closed: shows "All states" or selected market name.
 * Open: type to filter states; select one or "All states".
 */
export function MarketSearchSelect({
  markets,
  value,
  onChange,
  label,
  className,
}: MarketSearchSelectProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedMarket = useMemo(() => markets.find((m) => m.id === value) ?? null, [markets, value]);
  const displayText = selectedMarket ? selectedMarket.name : 'All states';

  const filteredMarkets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return markets;
    return markets.filter((m) => (m.name ?? '').toLowerCase().includes(q));
  }, [markets, query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange('');
    setQuery('');
    setIsOpen(false);
  };

  const handleSelect = (marketId: string) => {
    onChange(marketId);
    setQuery('');
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn('flex flex-col gap-1 relative', className)}>
      {label && (
        <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          {label}
        </label>
      )}
      <div
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={() => setIsOpen((o) => !o)}
        className={cn(
          'flex items-center rounded-lg border text-sm transition-colors min-w-[160px] cursor-pointer',
          isOpen && 'ring-1 ring-[var(--color-accent)]',
        )}
        style={{
          background: 'var(--color-bg-surface)',
          borderColor: isOpen ? 'var(--color-accent)' : 'var(--color-border-default)',
        }}
      >
        <span className="flex-1 min-w-0 truncate pl-3 py-2 pr-8" style={{ color: 'var(--color-text-primary)' }}>
          {displayText}
        </span>
        {selectedMarket ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-8 p-1 rounded transition-colors hover:text-[var(--color-text-primary)]"
            style={{ color: 'var(--color-text-muted)' }}
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <ChevronDown className="absolute right-3 h-4 w-4 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
      </div>

      {isOpen && (
        <div
          className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border py-1"
          style={{
            background: 'var(--color-bg-surface-raised)',
            borderColor: 'var(--color-border-default)',
            boxShadow: 'var(--shadow-raised)',
          }}
        >
          <div className="px-2 pb-1 border-b" style={{ borderColor: 'var(--color-border-subtle)' }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter states…"
              className="w-full px-2 py-1.5 text-sm rounded focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)' }}
              autoFocus
              autoComplete="off"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1" role="listbox">
            <li
              role="option"
              aria-selected={value === ''}
              className="px-3 py-2 cursor-pointer transition-colors text-sm hover:bg-[var(--color-bg-surface)]"
              style={{ color: 'var(--color-text-primary)' }}
              onClick={() => handleSelect('')}
            >
              All states
            </li>
            {filteredMarkets.length === 0 ? (
              <li className="px-3 py-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No matching states
              </li>
            ) : (
              filteredMarkets.map((m) => (
                <li
                  key={m.id}
                  role="option"
                  aria-selected={value === m.id}
                  className="px-3 py-2 cursor-pointer transition-colors text-sm hover:bg-[var(--color-bg-surface)]"
                  style={{ color: 'var(--color-text-primary)' }}
                  onClick={() => handleSelect(m.id)}
                >
                  {m.name}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
