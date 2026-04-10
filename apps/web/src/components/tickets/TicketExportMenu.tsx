'use client';

import { useState, useRef, useEffect } from 'react';
import { ticketsApi } from '@/lib/api';
import type { TicketFilters } from '@/types';
import { cn } from '@/lib/utils';

function triggerClass(disabled: boolean): string {
  return cn(
    'focus-ring rounded-md px-2.5 py-1.5 text-sm font-medium transition-[color,opacity,background-color] duration-[var(--duration-fast)]',
    disabled
      ? 'cursor-default opacity-40'
      : 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)]',
  );
}

function menuItemClass(itemDisabled: boolean): string {
  return cn(
    'focus-ring w-full rounded-md px-3 py-2.5 text-left text-sm font-medium transition-[color,opacity,background-color] duration-[var(--duration-fast)]',
    itemDisabled
      ? 'cursor-not-allowed opacity-45'
      : 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)]',
  );
}

export type TicketExportMenuProps = {
  exportParams: TicketFilters;
  disabled: boolean;
};

/**
 * Export control + CSV menu anchored in the feed footer row (absolute, left of the button).
 * In-document positioning avoids CSS `zoom` / containing-block bugs from portaled `fixed` menus.
 */
export function TicketExportMenu({ exportParams, disabled }: TicketExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer, true);
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [open]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const onDownloadCsv = async () => {
    if (csvBusy || disabled) return;
    setCsvBusy(true);
    try {
      const res = await ticketsApi.exportTicketsCsv(exportParams);
      const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      downloadBlob(
        new Blob([res.data], { type: 'text/csv;charset=utf-8' }),
        `tickets-${stamp}.csv`,
      );
      setOpen(false);
    } catch (err) {
      console.error(err);
      window.alert(
        'CSV download failed. Very large result sets must be narrowed in the filters (max 25,000 rows).',
      );
    } finally {
      setCsvBusy(false);
    }
  };

  const triggerDisabled = disabled || csvBusy;
  const triggerLabel = csvBusy ? 'Working…' : 'Export';

  return (
    <div ref={wrapRef} className="relative inline-flex shrink-0 items-center">
      {open ? (
        <div
          id="ticket-export-menu"
          role="menu"
          aria-label="Export as CSV"
          className="absolute right-full top-1/2 z-[200] mr-2 w-[min(16.5rem,calc(100vw-2rem))] -translate-y-1/2 rounded-lg p-1 shadow-lg"
          style={{
            background: 'var(--color-bg-elevated)',
            border: '2px solid var(--color-accent)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          }}
        >
          <button
            type="button"
            role="menuitem"
            className={menuItemClass(disabled || csvBusy)}
            style={{
              color:
                disabled || csvBusy
                  ? 'var(--color-text-muted)'
                  : 'var(--color-text-primary)',
            }}
            disabled={disabled || csvBusy}
            onClick={onDownloadCsv}
          >
            {csvBusy ? 'Preparing CSV…' : 'Download CSV (.csv)'}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Export tickets"
        aria-expanded={open}
        aria-haspopup="menu"
        className={triggerClass(triggerDisabled)}
        style={{
          color: triggerDisabled ? 'var(--color-text-muted)' : 'var(--color-text-primary)',
        }}
        disabled={triggerDisabled}
        onClick={() => {
          if (triggerDisabled) return;
          setOpen((o) => !o);
        }}
      >
        {triggerLabel}
      </button>
    </div>
  );
}
