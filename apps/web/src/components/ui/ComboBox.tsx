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
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TOOLTIP_PORTAL_Z_INDEX } from '@/lib/tooltip-layer';
import { getZoomedRect, getZoomedViewport } from '@/lib/zoom';

export interface ComboBoxOption {
  value: string;
  label: string;
}

export interface ComboBoxProps {
  options: ComboBoxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  error?: string;
  /** Optional: allow clearing selection (show empty option). Default true when placeholder is set. */
  clearable?: boolean;
  /** Raised shadow for filter bars */
  elevated?: boolean;
  /** When open, close the list on any scroll outside this control (e.g. page scroll). */
  closeOnScroll?: boolean;
}

/**
 * Filterable combo box: click to open, type to filter, keyboard navigate, select.
 * Preserves same value/onChange contract as a native select (string value).
 */
export function ComboBox({
  options,
  value,
  onChange,
  placeholder = '— Select —',
  label,
  id,
  className,
  disabled = false,
  error,
  clearable = true,
  elevated = false,
  closeOnScroll = false,
}: ComboBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const updateMenuPosition = useCallback(() => {
    if (!isOpen || !triggerRef.current) return;
    const r = getZoomedRect(triggerRef.current);
    const vp = getZoomedViewport();
    const gap = 4;
    const maxH = Math.min(240, Math.max(96, vp.height - r.bottom - gap - 12));
    setMenuStyle({
      position: 'fixed',
      top: r.bottom + gap,
      left: r.left,
      width: r.width,
      maxHeight: maxH,
      zIndex: TOOLTIP_PORTAL_Z_INDEX,
    });
  }, [isOpen]);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );
  const displayLabel = selectedOption ? selectedOption.label : '';

  const filteredOptions = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, filter]);

  const listItems = useMemo(() => {
    if (!clearable) return filteredOptions;
    // Avoid duplicate empty value when options already include "All …" / placeholder row
    const hasEmpty = filteredOptions.some((o) => o.value === '');
    if (hasEmpty) return filteredOptions;
    return [{ value: '', label: placeholder }, ...filteredOptions];
  }, [clearable, placeholder, filteredOptions]);

  const open = () => {
    if (disabled) return;
    setIsOpen(true);
    setFilter('');
    const idx = listItems.findIndex((o) => o.value === value);
    setHighlightIndex(idx >= 0 ? idx : 0);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const close = () => {
    setIsOpen(false);
    setFilter('');
  };

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
      if (listRef.current?.contains(t)) return;
      close();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setHighlightIndex((i) => Math.min(i, Math.max(0, listItems.length - 1)));
  }, [listItems.length, isOpen]);

  useEffect(() => {
    if (!isOpen || !closeOnScroll) return;
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target instanceof Node && containerRef.current?.contains(target)) return;
      if (target instanceof Node && listRef.current?.contains(target)) return;
      setIsOpen(false);
      setFilter('');
    };
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, [isOpen, closeOnScroll]);

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${highlightIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && isOpen) {
      close();
      return;
    }
    if (e.key === 'Escape') {
      close();
      (e.target as HTMLElement).blur();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const opt = listItems[highlightIndex];
      if (opt) {
        onChange(opt.value);
        close();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, listItems.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
      return;
    }
  };

  return (
    <div ref={containerRef} className={cn('flex flex-col gap-1 relative', className)}>
      {label && (
        <label
          htmlFor={id}
          className="text-sm font-medium"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {label}
        </label>
      )}
      <div
        ref={triggerRef}
        className={cn(
          'flex items-center rounded-lg border-2 border-solid border-[var(--color-border-default)] text-sm min-h-[38px]',
          'transition-[border-color,box-shadow] duration-[var(--duration-fast)] ease-out',
          'focus-within:border-[var(--color-accent)]',
          elevated && 'filter-elevated-shadow',
          disabled && 'opacity-50 cursor-not-allowed',
          error && 'ring-1 ring-red-500',
        )}
        style={{
          background: 'var(--color-bg-surface)',
        }}
      >
        {!isOpen ? (
          <button
            type="button"
            id={id}
            onClick={open}
            disabled={disabled}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left rounded-lg focus:outline-none"
            style={{ color: displayLabel ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-label={label ?? placeholder}
          >
            <span className="truncate">{displayLabel || placeholder}</span>
            <ChevronDown className="h-4 w-4 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
          </button>
        ) : (
          <>
            <input
              ref={inputRef}
              id={id}
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {}}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg focus:outline-none bg-transparent placeholder:opacity-70"
              style={{ color: 'var(--color-text-primary)' }}
              placeholder="Type to filter…"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={true}
              aria-controls={id ? `${id}-listbox` : undefined}
            />
            <ChevronDown className="h-4 w-4 shrink-0 mr-2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
          </>
        )}
      </div>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <ul
            ref={listRef}
            id={id ? `${id}-listbox` : undefined}
            role="listbox"
            className="overflow-y-auto rounded-lg border py-1"
            style={{
              ...menuStyle,
              background: 'var(--color-bg-surface-raised)',
              borderColor: 'var(--color-border-default)',
              boxShadow: 'var(--shadow-raised)',
            }}
          >
            {listItems.length === 0 ? (
              <li className="px-3 py-3 text-sm" style={{ color: 'var(--color-text-muted)' }} role="option">
                No matches
              </li>
            ) : (
              listItems.map((opt, i) => (
                <li
                  key={`${i}-${opt.value === '' ? 'empty' : opt.value}`}
                  data-index={i}
                  role="option"
                  aria-selected={value === opt.value}
                  className={cn(
                    'mx-1 rounded-md px-3 py-2 cursor-pointer text-sm truncate transition-colors duration-[var(--duration-fast)]',
                    value === opt.value && 'font-medium',
                    highlightIndex === i
                      ? 'bg-[var(--color-row-selected)]'
                      : 'hover:bg-[var(--color-row-selected)]',
                  )}
                  style={{
                    color:
                      value === opt.value
                        ? 'var(--color-accent)'
                        : opt.value === ''
                          ? 'var(--color-text-muted)'
                          : 'var(--color-text-primary)',
                  }}
                  onMouseEnter={() => setHighlightIndex(i)}
                  onClick={() => {
                    onChange(opt.value);
                    close();
                  }}
                >
                  {opt.label}
                </li>
              ))
            )}
          </ul>,
          document.body,
        )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
