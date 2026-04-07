'use client';

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useLayoutEffect,
  useCallback,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TOOLTIP_PORTAL_Z_INDEX } from '@/lib/tooltip-layer';
import { getZoomedRect, getZoomedViewport } from '@/lib/zoom';

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
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPosition = useCallback(() => {
    if (!isOpen || !triggerRef.current) return;
    const r = getZoomedRect(triggerRef.current);
    const vp = getZoomedViewport();
    const gap = 4;
    const maxH = Math.min(280, Math.max(120, vp.height - r.bottom - gap - 12));
    setMenuStyle({
      position: 'fixed',
      top: r.bottom + gap,
      left: r.left,
      width: r.width,
      maxHeight: maxH,
      zIndex: TOOLTIP_PORTAL_Z_INDEX,
    });
  }, [isOpen]);

  const selectedMarket = useMemo(() => markets.find((m) => m.id === value) ?? null, [markets, value]);
  const displayText = selectedMarket ? selectedMarket.name : 'All states';

  const filteredMarkets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return markets;
    return markets.filter((m) => (m.name ?? '').toLowerCase().includes(q));
  }, [markets, query]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setIsOpen(false);
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
        ref={triggerRef}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={() => setIsOpen((o) => !o)}
        className={cn(
          'relative flex items-center rounded-lg border-2 border-solid text-sm transition-[border-color] duration-[var(--duration-fast)] ease-out min-w-[160px] cursor-pointer',
          isOpen ? 'border-[var(--color-accent)]' : 'border-[var(--color-border-default)]',
          'focus-visible:border-[var(--color-accent)]',
        )}
        style={{
          background: 'var(--color-bg-surface)',
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

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            className="flex flex-col overflow-hidden rounded-lg border py-1"
            style={{
              ...menuStyle,
              background: 'var(--color-bg-surface-raised)',
              borderColor: 'var(--color-border-default)',
              boxShadow: 'var(--shadow-raised)',
            }}
          >
            <div className="shrink-0 px-2 pb-1 border-b" style={{ borderColor: 'var(--color-border-subtle)' }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type to filter states…"
                className="w-full px-2 py-1.5 text-sm rounded border-2 border-solid border-[var(--color-border-default)] outline-none transition-[border-color] duration-[var(--duration-fast)] ease-out focus:border-[var(--color-accent)]"
                style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
                autoFocus
                autoComplete="off"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto py-1" role="listbox">
              <li
                role="option"
                aria-selected={value === ''}
                className="mx-1 rounded-md px-3 py-2 cursor-pointer text-sm transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-row-selected)]"
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
                    className="mx-1 rounded-md px-3 py-2 cursor-pointer text-sm transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-row-selected)]"
                    style={{ color: 'var(--color-text-primary)' }}
                    onClick={() => handleSelect(m.id)}
                  >
                    {m.name}
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}
