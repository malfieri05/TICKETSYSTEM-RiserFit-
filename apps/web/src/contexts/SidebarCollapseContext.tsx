'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'app-sidebar-collapsed';

export const SIDEBAR_EXPANDED_WIDTH_PX = 260;
/** Icon-only rail when collapsed (labels hidden). */
export const SIDEBAR_COLLAPSED_WIDTH_PX = 64;

/** Keep sidebar width, main `margin-left`, and notifications panel `left` in sync. */
export const SIDEBAR_RAIL_TRANSITION_MS = 700;
/** Smooth deceleration — less “snap” than an aggressive ease-out. */
export const SIDEBAR_RAIL_TRANSITION_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
export const SIDEBAR_RAIL_TRANSITION = `${SIDEBAR_RAIL_TRANSITION_MS}ms ${SIDEBAR_RAIL_TRANSITION_EASE}`;

type SidebarCollapseContextValue = {
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  toggle: () => void;
};

const SidebarCollapseContext = createContext<SidebarCollapseContextValue | null>(null);

export function SidebarCollapseProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') setCollapsedState(true);
    } catch {
      /* ignore */
    }
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsedState((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ collapsed, setCollapsed, toggle }),
    [collapsed, setCollapsed, toggle],
  );

  return (
    <SidebarCollapseContext.Provider value={value}>{children}</SidebarCollapseContext.Provider>
  );
}

export function useSidebarCollapse() {
  const ctx = useContext(SidebarCollapseContext);
  if (!ctx) {
    throw new Error('useSidebarCollapse must be used within SidebarCollapseProvider');
  }
  return ctx;
}
