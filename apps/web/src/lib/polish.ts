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
  innerBorder: 'var(--color-border-subtle)',
  rowBorder: 'var(--color-border-default)',
  rowHover: 'var(--color-bg-surface)',
  rowSelected: 'var(--color-bg-surface-raised)',
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
} as const;

/** Tailwind-compatible class names for consistent layout */
export const POLISH_CLASS = {
  /** Table th/td cell padding */
  cellPadding: 'px-4 py-3',
  /** Table header text style */
  tableHeader: 'text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide',
  /** Section vertical gap (e.g. between title and filters) */
  sectionGap: 'space-y-4',
  /** Block vertical gap (e.g. between major sections) */
  blockGap: 'space-y-5',
  /** Empty state container padding */
  emptyStatePadding: 'py-16',
  /** Empty state icon size */
  emptyStateIcon: 'h-10 w-10',
  /** Row hover transition */
  rowTransition: 'transition-colors duration-150',
} as const;
