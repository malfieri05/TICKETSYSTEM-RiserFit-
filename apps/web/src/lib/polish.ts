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
  /**
   * Main ticket feed column header row and pagination footer — same as drawer tab bodies (Subtasks, etc.):
   * `--color-bg-drawer-canvas` in globals.css.
   */
  feedTheadBg: 'var(--color-bg-drawer-canvas)',
  innerBorder: 'var(--color-border-subtle)',
  rowBorder: 'var(--color-border-default)',
  rowHover: 'var(--color-bg-surface)',
  rowSelected: 'var(--color-row-selected)',
  metaSecondary: 'var(--color-text-secondary)',
  metaMuted: 'var(--color-text-muted)',
  metaDim: 'var(--color-text-muted)',
  /** Table / feed column headers — primary text so light-mode bar reads black, not washed-out muted */
  theadText: 'var(--color-text-primary)',
  accent: 'var(--color-accent)',
  listContainerShadow: 'var(--shadow-panel)',
  /** Main ticket feed list shell — floating depth above page (tickets, inbox, portal). */
  feedListFloatShadow: 'var(--shadow-feed-float)',
  /** Always-green color used for progress bars across feed and panel. */
  progressGreen: '#16a34a',
  /**
   * Selected row in admin studio/location side lists (Lease IQ, Locations).
   * Pairs with `borderLeft: 3px solid var(--color-accent)`. Hover uses `hover:bg-[var(--color-bg-surface-raised)]`.
   */
  adminStudioListSelectedBg: 'rgba(52, 120, 196, 0.12)',
  /** Elevated card shadow — used on panel shell and ticket detail header. */
  shadowElevated: 'var(--shadow-elevated)',
  /** Subtle card shadow for list containers. */
  shadowCard: 'var(--shadow-card)',
  /** Slide-over ticket panel — matches theme depth */
  drawerShadow: 'var(--shadow-drawer)',
  /** Drawer Subtasks/Comments tab row — raised over scroll body */
  drawerTabBarShadow: 'var(--shadow-drawer-tabbar)',
  /** Default orange tag capsule — solid fill, black label, vibrant hue border. */
  ticketTagCapsule: {
    background: '#fdba74',
    color: '#0a0a0a',
    border: '1.25px solid #ea580c',
  },
  /** Success green — "Saved", active status indicators */
  success: 'var(--color-success)',
  /** Due date: overdue — past due, needs attention */
  dueDateOverdue: 'var(--color-danger-hover)',
  /** Due date: today — urgent but not past due */
  dueDateToday: '#ea580c',
  /** Due date: tomorrow — approaching */
  dueDateSoon: '#ca8a04',
  /** Info blue — date highlights, linked text */
  info: '#3b82f6',
} as const;

/**
 * Canonical feed column widths — shared by tickets page, inbox, portal.
 * Values correspond to CANONICAL_FEED_HEADERS column order:
 * ID | Title | Status | Created | Tags | Due date | Progress | Requester
 */
export const FEED_COL_WIDTHS = [
  '9%',   // ID
  '28%',  // Title (inner title+comments grid unchanged; narrower % removes dead space before Status)
  '11%',  // Status
  '11%',  // Created
  '12%',  // Tags
  '10%',  // Due date
  '10%',  // Progress
  '9%',   // Requester
] as const;

/** Same 8 columns when ID is collapsed to a slim expand control (sums to 100%). */
export const FEED_COL_WIDTHS_ID_COLLAPSED = [
  '4%',   // expand control
  '33%',  // Title (absorbs hidden ID; same intent as FEED_COL_WIDTHS title column)
  '11%',  // Status
  '11%',  // Created
  '12%',  // Tags
  '10%',  // Due date
  '10%',  // Progress
  '9%',   // Requester
] as const;

/** Tailwind-compatible class names for consistent layout */
export const POLISH_CLASS = {
  /** Ticket feed tables — `border-separate` + zero spacing so `<th>` corner radii render. Row dividers must be on `<td>` (CSS ignores `tr` borders in this model). */
  feedTable: 'w-full text-sm table-fixed border-separate border-spacing-0',
  /** Table th/td cell padding */
  cellPadding: 'px-4 py-3.5',
  /** Table header text style */
  tableHeader: 'text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]',
  /** Centered table header — Created, Tags, Status, Due date, Progress, Requester */
  tableHeaderCenter: 'text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]',
  /** Section vertical gap (e.g. between title and filters) */
  sectionGap: 'space-y-5',
  /** Block vertical gap (e.g. between major sections) */
  blockGap: 'space-y-6',
  /** Empty state container padding */
  emptyStatePadding: 'py-16',
  /** Empty state icon size */
  emptyStateIcon: 'h-10 w-10',
  /**
   * Filter row controls — same chrome as `ComboBox` (`rounded-lg`, 2px border, 38px min height, accent border when focused).
   * Use for elevated `Input` / `Select` and `DateFilterInput` with `variant="filter"`.
   */
  filterBarControl:
    'min-h-[38px] rounded-lg border-2 border-solid border-[var(--color-border-default)] px-3 py-2 text-sm ' +
    'outline-none transition-[border-color,box-shadow,background-color] duration-[var(--duration-fast)] ease-out ' +
    'focus:border-[var(--color-accent)]',
  /** Row hover transition */
  rowTransition: 'transition-colors duration-150 ease-out',
  /**
   * Workflow Templates list + Subtask timing: same thead row height (subtask “Avg. Duration” stacks label + sorts).
   */
  workflowTemplatesTheadRow:
    'min-h-[5.125rem] border-b border-[var(--color-border-default)] [&>th]:align-middle [&>th]:py-3',
  /** Admin data table row — hover, transition, non-clickable. Apply alongside admin-table-row CSS class. */
  adminRow: 'admin-table-row transition-colors duration-150 ease-out',
  /** Admin table header: left-aligned, matches tableHeader spec (11px uppercase). */
  adminTableHeader: 'text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]',
  /** Admin table header: right-aligned variant. */
  adminTableHeaderRight: 'text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em]',
  /** Admin cell padding — consistent with feed rows. */
  adminCellPadding: 'px-4 py-3.5',
  /**
   * Bottom padding on scrollable regions that share the viewport with the fixed AI agent FAB
   * (`AiChatWidget`: 76×76px, `bottom-6`). Lets users scroll the last row (e.g. attachments) above the button.
   */
  drawerScrollRoomForAgentFab: 'pb-32 max-sm:pb-36',
} as const;
