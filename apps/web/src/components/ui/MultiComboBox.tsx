'use client';

import { useState, useRef, useEffect, useLayoutEffect, useCallback, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MultiComboBoxOption {
  value: string;
  label: string;
}

export interface MultiComboBoxProps {
  options: MultiComboBoxOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Multi-select dropdown: same shell styling as ComboBox; pick one or more options with checkmarks.
 */
export function MultiComboBox({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  label,
  id,
  className,
  disabled = false,
}: MultiComboBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const updateMenuPosition = useCallback(() => {
    if (!isOpen || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const gap = 4;
    const maxH = Math.min(240, Math.max(96, window.innerHeight - r.bottom - gap - 12));
    setMenuStyle({
      position: 'fixed',
      top: r.bottom + gap,
      left: r.left,
      width: r.width,
      maxHeight: maxH,
      zIndex: 100,
    });
  }, [isOpen]);

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

  const selectedLabels = options
    .filter((o) => value.includes(o.value))
    .map((o) => o.label);
  const displayText =
    selectedLabels.length === 0 ? '' : selectedLabels.join(', ');

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!isOpen) return;
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const toggle = (v: string) => {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v));
    } else {
      onChange([...value, v]);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn('flex min-w-0 flex-col gap-1 relative', className)}
    >
      {label && (
        <label
          htmlFor={id}
          className="text-sm font-medium"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {label}
        </label>
      )}
      <button
        ref={buttonRef}
        type="button"
        id={id}
        onClick={() => !disabled && setIsOpen((o) => !o)}
        disabled={disabled}
        title={displayText || placeholder}
        className={cn(
          'w-full min-w-0 max-w-full overflow-hidden flex items-center justify-between gap-2 px-3 text-left rounded-lg border text-sm h-9',
          'focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
        style={{
          background: 'var(--color-bg-surface)',
          borderColor: 'var(--color-border-default)',
          color: displayText ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label ?? placeholder}
        aria-multiselectable="true"
      >
        <span className="min-w-0 flex-1 truncate text-left">{displayText || placeholder}</span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 transition-transform', isOpen && 'rotate-180')}
          style={{ color: 'var(--color-text-muted)' }}
        />
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            id={id ? `${id}-listbox` : undefined}
            className="overflow-y-auto rounded-lg border py-1"
            style={{
              ...menuStyle,
              background: 'var(--color-bg-surface-raised)',
              borderColor: 'var(--color-border-default)',
              boxShadow: 'var(--shadow-raised)',
            }}
          >
            {options.map((opt) => {
              const checked = value.includes(opt.value);
              return (
                <li key={opt.value} role="option" aria-selected={checked}>
                  <button
                    type="button"
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm text-left',
                      'hover:bg-[var(--color-bg-surface)] focus:outline-none focus:bg-[var(--color-bg-surface)]',
                    )}
                    style={{ color: 'var(--color-text-primary)' }}
                    onClick={() => toggle(opt.value)}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                        checked && 'border-[var(--color-accent)] bg-[var(--color-accent)]',
                      )}
                      style={{
                        borderColor: checked ? undefined : 'var(--color-border-default)',
                      }}
                    >
                      {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </span>
                    {opt.label}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}
