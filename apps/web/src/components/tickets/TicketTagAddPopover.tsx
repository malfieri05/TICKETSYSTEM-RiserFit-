'use client';

import { useState, useRef, useLayoutEffect, useEffect, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { POLISH_THEME } from '@/lib/polish';
import { TOOLTIP_PORTAL_Z_INDEX } from '@/lib/tooltip-layer';
import type { TagColor } from '@/types';
/** Wide enough for swatch row + actions without clipping (positioning math uses same value). */
const POPOVER_W = 280;

const TAG_COLORS: { key: TagColor; swatch: string; ring: string }[] = [
  { key: 'red',    swatch: '#ef4444', ring: 'rgba(239,68,68,0.5)' },
  { key: 'orange', swatch: '#f97316', ring: 'rgba(249,115,22,0.5)' },
  { key: 'yellow', swatch: '#eab308', ring: 'rgba(234,179,8,0.5)' },
  { key: 'green',  swatch: '#22c55e', ring: 'rgba(34,197,94,0.5)' },
  { key: 'blue',   swatch: '#3b82f6', ring: 'rgba(59,130,246,0.5)' },
  { key: 'purple', swatch: '#a855f7', ring: 'rgba(168,85,247,0.5)' },
];

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  tagInput: string;
  onTagInputChange: (v: string) => void;
  tagError: string | null;
  onSave: (color: TagColor) => void;
  onCancel: () => void;
  isAddingTag: boolean;
};

/**
 * Rounded overlay anchored to the + control; portaled so table overflow never clips it.
 */
export function TicketTagAddPopover({
  open,
  anchorRef,
  tagInput,
  onTagInputChange,
  tagError,
  onSave,
  onCancel,
  isAddingTag,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [selectedColor, setSelectedColor] = useState<TagColor>('orange');

  useLayoutEffect(() => {
    if (!open) return;

    const run = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || typeof window === 'undefined') return;
      const ar = anchor.getBoundingClientRect();
      const ph = panel?.offsetHeight ?? 160;
      const vw = window.innerWidth;
      let left = ar.left + ar.width / 2 - POPOVER_W / 2;
      left = Math.max(8, Math.min(left, vw - POPOVER_W - 8));
      let top = ar.top - ph - 8;
      if (top < 8) {
        top = ar.bottom + 8;
      }
      setPos({ top, left });
    };

    run();
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(run);
    });
    window.addEventListener('resize', run);
    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
      window.removeEventListener('resize', run);
    };
  }, [open, anchorRef, tagInput, tagError]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onCancel();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onCancel, anchorRef]);

  // Reset color to orange when popover re-opens
  useEffect(() => {
    if (open) setSelectedColor('orange');
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const selectedSwatch = TAG_COLORS.find((c) => c.key === selectedColor)?.swatch ?? TAG_COLORS[1].swatch;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Add tag"
      className="fixed box-border rounded-2xl px-3 pb-3 pt-5 shadow-[var(--shadow-elevated)]"
      style={{
        top: pos.top,
        left: pos.left,
        width: POPOVER_W,
        zIndex: TOOLTIP_PORTAL_Z_INDEX,
        background: 'var(--color-bg-surface-raised)',
        border: `1px solid ${POLISH_THEME.listBorder}`,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Label input */}
      <input
        type="text"
        value={tagInput}
        onChange={(e) => onTagInputChange(e.target.value)}
        maxLength={80}
        disabled={isAddingTag}
        className="box-border w-full min-w-0 text-xs rounded-xl border-2 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-offset-0"
        style={{
          borderColor: selectedSwatch,
          background: 'var(--color-bg-surface)',
          color: 'var(--color-text-primary)',
          // Match focus ring to selected tag colour
          ['--tw-ring-color' as string]: selectedSwatch,
        }}
        placeholder="Tag label"
        aria-label="New tag label"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(selectedColor);
        }}
      />
      {tagError ? (
        <p className="text-[10px] leading-tight mt-1.5" style={{ color: 'var(--color-danger, #c00)' }}>
          {tagError}
        </p>
      ) : null}

      {/* Colours on their own row, actions below — avoids horizontal overflow in narrow popovers */}
      <div className="mt-2.5 flex min-w-0 flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-center gap-1.5" role="radiogroup" aria-label="Tag colour">
          {TAG_COLORS.map(({ key, swatch, ring }) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              aria-checked={selectedColor === key}
              role="radio"
              disabled={isAddingTag}
              onClick={() => setSelectedColor(key)}
              className="shrink-0 rounded-full transition-transform hover:scale-110 focus:outline-none"
              style={{
                width: 14,
                height: 14,
                background: swatch,
                boxShadow:
                  selectedColor === key
                    ? `0 0 0 2px var(--color-bg-surface-raised), 0 0 0 3.5px ${ring}`
                    : 'none',
              }}
            />
          ))}
        </div>

        <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="!h-[28.8px] shrink-0 !rounded-[10.8px] !px-[10.8px] !py-[3.6px] !text-[10.8px] [&_svg]:!h-[14.4px] [&_svg]:!w-[14.4px]"
            disabled={isAddingTag}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="!h-[28.8px] shrink-0 !rounded-[10.8px] !px-[10.8px] !py-[3.6px] !text-[10.8px] [&_svg]:!h-[14.4px] [&_svg]:!w-[14.4px]"
            disabled={isAddingTag}
            loading={isAddingTag}
            onClick={() => onSave(selectedColor)}
          >
            Save
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
