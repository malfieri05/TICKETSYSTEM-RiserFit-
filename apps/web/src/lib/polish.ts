/**
 * Stage 27: Minimal UI polish tokens.
 * Single source for spacing, surfaces, and typography used across ticket list, inbox, portal, drawer, and detail.
 * Not a full design system — keep additions minimal.
 */

/** Border and surface colors for list containers and panels */
export const POLISH = {
  listBorder: '#2a2a2a',
  listBg: '#1a1a1a',
  listBgHeader: '#141414',
  innerBorder: '#252525',
  rowBorder: '#222222',
  rowHover: '#222222',
  rowSelected: '#1e2a1e',
  /** Secondary content (e.g. "Requested by", dates) */
  metaSecondary: '#aaaaaa',
  /** Muted labels and tertiary text */
  metaMuted: '#666666',
  metaDim: '#888888',
  theadText: '#555555',
  accent: '#14b8a6',
  /** Subtle shadow for main list card only */
  listContainerShadow: '0 1px 3px rgba(0,0,0,0.35)',
} as const;

/**
 * Stage 31: Theme-aware tokens. Use these instead of POLISH for colors so light/dark toggle applies.
 * Values reference CSS variables from globals.css ([data-theme="dark"] | [data-theme="light"]).
 */
export const POLISH_THEME = {
  listBg: 'var(--color-bg-surface-raised)',
  listBorder: 'var(--color-border-default)',
  listBgHeader: 'var(--color-bg-surface)',
  /** Table thead, card section headers, in-content toolbars (`--color-bg-content-header` in globals.css) */
  contentHeaderBg: 'var(--color-bg-content-header)',
  tableHeaderBg: 'var(--color-bg-content-header)',
  innerBorder: 'var(--color-border-subtle)',
  rowBorder: 'var(--color-border-default)',
  rowHover: 'var(--color-bg-surface)',
  rowSelected: 'var(--color-row-selected)',
  metaSecondary: 'var(--color-text-secondary)',
  metaMuted: 'var(--color-text-muted)',
  metaDim: 'var(--color-text-muted)',
  theadText: 'var(--color-text-muted)',
  accent: 'var(--color-accent)',
  listContainerShadow: 'var(--shadow-panel)',
  /** Always-green color used for progress bars across feed and panel. */
  progressGreen: '#16a34a',
  /** Elevated card shadow — used on panel shell and ticket detail header. */
  shadowElevated: 'var(--shadow-elevated)',
  /** Subtle card shadow for list containers. */
  shadowCard: 'var(--shadow-card)',
  /** Slide-over ticket panel — matches theme depth */
  drawerShadow: 'var(--shadow-drawer)',
  /** Drawer Subtasks/Comments tab row — raised over scroll body */
  drawerTabBarShadow: 'var(--shadow-drawer-tabbar)',
} as const;

/** Tailwind-compatible class names for consistent layout */
export const POLISH_CLASS = {
  /** Table th/td cell padding */
  cellPadding: 'px-4 py-3.5',
  /** Table header text style */
  tableHeader: 'text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]',
  /** Centered table header — used for Progress, Requester, Comments columns */
  tableHeaderCenter: 'text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]',
  /** Section vertical gap (e.g. between title and filters) */
  sectionGap: 'space-y-5',
  /** Block vertical gap (e.g. between major sections) */
  blockGap: 'space-y-6',
  /** Empty state container padding */
  emptyStatePadding: 'py-16',
  /** Empty state icon size */
  emptyStateIcon: 'h-10 w-10',
  /** Row hover transition */
  rowTransition: 'transition-colors duration-150 ease-out',
} as const;
