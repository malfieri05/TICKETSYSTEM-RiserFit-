'use client';

import { useState, useRef, useLayoutEffect, useEffect, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { POLISH_THEME } from '@/lib/polish';

const POPOVER_Z = 260;
const POPOVER_W = 240;

type Props = {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  tagInput: string;
  onTagInputChange: (v: string) => void;
  tagError: string | null;
  onSave: () => void;
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

  useLayoutEffect(() => {
    if (!open) return;

    const run = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || typeof window === 'undefined') return;
      const ar = anchor.getBoundingClientRect();
      const ph = panel?.offsetHeight ?? 132;
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

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Add tag"
      className="fixed rounded-2xl px-3 pb-3 pt-5 shadow-[var(--shadow-elevated)]"
      style={{
        top: pos.top,
        left: pos.left,
        width: POPOVER_W,
        zIndex: POPOVER_Z,
        background: 'var(--color-bg-surface-raised)',
        border: `1px solid ${POLISH_THEME.listBorder}`,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        type="text"
        value={tagInput}
        onChange={(e) => onTagInputChange(e.target.value)}
        maxLength={80}
        disabled={isAddingTag}
        className="w-full text-xs rounded-xl border px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-0"
        style={{
          borderColor: POLISH_THEME.listBorder,
          background: 'var(--color-bg-surface)',
          color: 'var(--color-text-primary)',
        }}
        placeholder="Tag label"
        aria-label="New tag label"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') void onSave();
        }}
      />
      {tagError ? (
        <p className="text-[10px] leading-tight mt-1.5" style={{ color: 'var(--color-danger, #c00)' }}>
          {tagError}
        </p>
      ) : null}
      <div className="mt-2.5 flex min-h-8 items-center justify-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="!h-[28.8px] !rounded-[10.8px] !px-[10.8px] !py-[3.6px] !text-[10.8px] [&_svg]:!h-[14.4px] [&_svg]:!w-[14.4px]"
          disabled={isAddingTag}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="!h-[28.8px] !rounded-[10.8px] !px-[10.8px] !py-[3.6px] !text-[10.8px] [&_svg]:!h-[14.4px] [&_svg]:!w-[14.4px]"
          disabled={isAddingTag}
          loading={isAddingTag}
          onClick={() => void onSave()}
        >
          Save
        </Button>
      </div>
    </div>,
    document.body,
  );
}
