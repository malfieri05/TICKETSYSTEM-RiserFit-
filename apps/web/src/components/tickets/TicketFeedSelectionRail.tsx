'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getDocumentZoom } from '@/lib/zoom';

const RAIL_PX = 3;
const TRANSITION =
  'top 0.22s cubic-bezier(0.4, 0, 0.2, 1), height 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.16s ease-out';

function measureRail(
  innerEl: HTMLElement,
  selectedId: string | null,
): { top: number; height: number; visible: boolean } {
  if (!selectedId) return { top: 0, height: 0, visible: false };
  const row = innerEl.querySelector<HTMLElement>(
    `tr.ticket-feed-table-row[data-ticket-id="${CSS.escape(selectedId)}"]`,
  );
  if (!row) return { top: 0, height: 0, visible: false };
  const zoom = getDocumentZoom();
  const ir = innerEl.getBoundingClientRect();
  const rr = row.getBoundingClientRect();
  // Convert from viewport px to zoomed CSS px for position:absolute placement.
  return {
    top:    (rr.top - ir.top) / zoom,
    height: rr.height / zoom,
    visible: true,
  };
}

export type TicketFeedSelectionRailProps = {
  selectedId: string | null;
  children: ReactNode;
  /** When set, wraps content in this scroll container (split thead/tbody feeds). */
  scrollContainerClassName?: string;
};

/**
 * Absolute accent rail that tracks the selected ticket row and animates top/height when selection changes.
 * Rows must be `tr.ticket-feed-table-row` with `data-ticket-id` (see TicketTableRow).
 */
export function TicketFeedSelectionRail({
  selectedId,
  children,
  scrollContainerClassName,
}: TicketFeedSelectionRailProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const prevSelectedRef = useRef<string | null>(null);
  const [rail, setRail] = useState({ top: 0, height: 0, visible: false });
  const [skipTransition, setSkipTransition] = useState(true);

  const measure = useCallback(() => {
    const inner = innerRef.current;
    if (!inner) return;
    setRail(measureRail(inner, selectedId));
  }, [selectedId]);

  useLayoutEffect(() => {
    if (!selectedId) {
      prevSelectedRef.current = null;
      setSkipTransition(true);
      measure();
      return;
    }
    const fromNone = prevSelectedRef.current === null;
    prevSelectedRef.current = selectedId;
    measure();
    if (fromNone) {
      setSkipTransition(true);
      requestAnimationFrame(() => {
        setSkipTransition(false);
      });
    }
  }, [selectedId, measure]);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(inner);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    const onScrollOrResize = () => measure();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [measure]);

  const inner = (
    <div ref={innerRef} className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 z-[2]"
        style={{
          width: RAIL_PX,
          top: rail.top,
          height: rail.height,
          background: 'var(--color-accent)',
          opacity: rail.visible ? 1 : 0,
          transition: skipTransition ? 'none' : TRANSITION,
        }}
      />
      {children}
    </div>
  );

  if (scrollContainerClassName) {
    return <div className={scrollContainerClassName}>{inner}</div>;
  }

  return inner;
}
