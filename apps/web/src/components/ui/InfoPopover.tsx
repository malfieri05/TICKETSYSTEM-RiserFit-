'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getZoomedRect, getZoomedViewport } from '@/lib/zoom';

const DEFAULT_PANEL_WIDTH = 288; // w-72
const GAP = 8; // px gap between button and popover

export interface InfoPopoverProps {
  /** Content rendered inside the popover. */
  children: ReactNode;
  /** Accessible label for the trigger button. */
  ariaLabel?: string;
  /** Extra class names on the trigger button. */
  className?: string;
  /** Preferred opening direction. Defaults to 'up'. */
  direction?: 'up' | 'down';
  /** `info` = Lucide icon; `letterI` = outlined circled i; `letterISolidAccent` = solid accent fill, white i. */
  trigger?: 'info' | 'letterI' | 'letterISolidAccent';
  /** Fixed panel width in CSS px (positioning uses the same value). */
  panelWidth?: number;
  /**
   * `popover` = anchored near the trigger (default).
   * `center` = full-viewport overlay, panel centered (modal-style).
   */
  variant?: 'popover' | 'center';
  /** Shown in the bottom-right inside the panel when set (e.g. `/favicon.png`). */
  footerLogoSrc?: string;
  /**
   * Scales padding, type size, border, shadows, and close control for `variant="center"` (logo size unchanged).
   * @default 1
   */
  centerScale?: number;
  /** Extra px below the text (beyond scaled reserve) before the footer logo area. `variant="center"` + logo only. */
  centerFooterExtraGapPx?: number;
}

/**
 * Click-triggered popover portaled to document.body so it is never clipped
 * by overflow:hidden parents or low z-index stacking contexts.
 */
export function InfoPopover({
  children,
  ariaLabel = 'More information',
  className,
  direction = 'up',
  trigger = 'info',
  panelWidth = DEFAULT_PANEL_WIDTH,
  variant = 'popover',
  footerLogoSrc,
  centerScale = 1,
  centerFooterExtraGapPx = 0,
}: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isCenter = variant === 'center';
  const s = centerScale;
  const centerPad = Math.round(16 * s);
  const centerFontPx = Math.round(12 * s * 10) / 10;
  const centerBorderPx = Math.max(2, Math.round(2 * s));
  const centerMaxH = Math.round(640 * s);
  const centerCloseInset = Math.round(8 * s);
  const centerCloseIcon = Math.round(12 * s);
  const centerContentBottomPad =
    isCenter && footerLogoSrc
      ? Math.round(40 * s) + centerFooterExtraGapPx
      : undefined;
  const closeBtnTop = isCenter ? centerCloseInset : 8;
  const closeBtnRight = isCenter ? centerCloseInset : 8;
  const closeBtnPad = isCenter ? Math.max(4, Math.round(4 * s)) : 2;
  const closeIconSize = isCenter ? centerCloseIcon : 12;

  // Recalculate position whenever the popover opens or the window scrolls/resizes.
  useEffect(() => {
    if (!open || !btnRef.current || isCenter) return;

    const reposition = () => {
      // Use zoomed coords so position:fixed values land in the right CSS px space.
      const rect = getZoomedRect(btnRef.current!);
      const vp = getZoomedViewport();
      // offsetHeight is already in zoomed CSS px (layout measurement).
      const panelHeight = panelRef.current?.offsetHeight ?? 200;

      const spaceAbove = rect.top;
      const spaceBelow = vp.height - rect.bottom;
      const goUp =
        direction === 'up' ? spaceAbove >= panelHeight + GAP || spaceAbove > spaceBelow
          : spaceBelow < panelHeight + GAP && spaceAbove > spaceBelow;

      // position:fixed — no scroll offset needed.
      const top = goUp
        ? rect.top - panelHeight - GAP
        : rect.bottom + GAP;

      const idealLeft = rect.left + rect.width / 2 - panelWidth / 2;
      const left = Math.max(8, Math.min(idealLeft, vp.width - panelWidth - 8));

      setCoords({ top, left });
    };

    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, direction, panelWidth, isCenter]);

  // Lock scroll while center modal is open.
  useEffect(() => {
    if (!open || !isCenter) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isCenter]);

  // Close on Escape or outside click.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onOutside = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        panelRef.current && !panelRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
    };
  }, [open]);

  const panelInner = (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(false);
        }}
        className="absolute z-[1] rounded transition-colors hover:bg-[var(--color-bg-surface)]"
        style={{
          color: 'var(--color-text-muted)',
          top: closeBtnTop,
          right: closeBtnRight,
          padding: closeBtnPad,
        }}
        aria-label="Close"
      >
        <X className="shrink-0" style={{ width: closeIconSize, height: closeIconSize }} strokeWidth={2.2} />
      </button>
      <div style={centerContentBottomPad != null ? { paddingBottom: centerContentBottomPad } : undefined}>
        {children}
      </div>
      {isCenter && footerLogoSrc ? (
        <div className="pointer-events-none absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center overflow-hidden rounded-md opacity-90 ring-1 ring-[var(--color-border-default)]/60">
          <Image src={footerLogoSrc} alt="" width={36} height={36} className="object-contain" />
        </div>
      ) : null}
    </>
  );

  const panel =
    open && isCenter
      ? createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998]"
              style={{
                background: 'rgba(0, 0, 0, 0.52)',
                boxShadow: 'inset 0 0 120px rgba(0, 0, 0, 0.28)',
              }}
              onMouseDown={() => setOpen(false)}
              aria-hidden
            />
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
                className="pointer-events-auto relative w-full overflow-y-auto"
                style={{
                  maxWidth: panelWidth,
                  maxHeight: `min(90vh, ${centerMaxH}px)`,
                  background: 'var(--color-bg-surface-raised)',
                  border: `${centerBorderPx}px solid var(--color-accent)`,
                  color: 'var(--color-text-primary)',
                  boxShadow: `0 ${Math.round(4 * s)}px ${Math.round(6 * s)}px rgba(0, 0, 0, 0.07), 0 ${Math.round(24 * s)}px ${Math.round(48 * s)}px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.04)`,
                  borderRadius: 'var(--radius-md)',
                  padding: centerPad,
                  fontSize: centerFontPx,
                  lineHeight: 1.55,
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {panelInner}
              </div>
            </div>
          </>,
          document.body,
        )
      : open && coords && !isCenter
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="false"
              style={{
                position: 'fixed',
                top: coords.top,
                left: coords.left,
                width: panelWidth,
                zIndex: 9999,
                background: 'var(--color-bg-surface-raised)',
                border: '1px solid var(--color-border-default)',
                color: 'var(--color-text-primary)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                fontSize: '12px',
                lineHeight: '1.55',
              }}
            >
              {panelInner}
            </div>,
            document.body,
          )
        : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label={ariaLabel}
        aria-expanded={open}
        className={cn(
          'focus-ring inline-flex shrink-0 items-center justify-center rounded-full transition-colors',
          trigger === 'info' &&
            cn(
              'h-4 w-4 hover:bg-[var(--color-bg-surface-raised)]',
              open && 'bg-[var(--color-bg-surface-raised)]',
            ),
          trigger === 'letterI' &&
            cn(
              'h-5 w-5 border text-[9px] font-semibold leading-none hover:bg-[var(--color-btn-ghost-hover-bg)]',
              open
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                : 'border-[var(--color-text-primary)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]',
            ),
          trigger === 'letterISolidAccent' &&
            cn(
              'h-5 w-5 border-0 text-[9px] font-semibold leading-none text-white',
              'bg-[var(--color-accent)] shadow-sm',
              'hover:brightness-110',
              open && 'outline outline-2 outline-offset-2 outline-[rgba(255,255,255,0.75)]',
            ),
          className,
        )}
        style={
          trigger === 'info' ? { color: 'var(--color-text-muted)' } : undefined
        }
      >
        {trigger === 'letterI' || trigger === 'letterISolidAccent' ? (
          <span aria-hidden>i</span>
        ) : (
          <Info className="h-3 w-3" strokeWidth={2.2} aria-hidden />
        )}
      </button>
      {panel}
    </>
  );
}
