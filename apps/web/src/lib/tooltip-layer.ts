/**
 * Z-index for portaled hover tooltips, lightweight overlays, and floating menus.
 * Stays above app chrome (Header z-30, Sidebar z-50, drawers) so content is never clipped by stacking.
 */
export const TOOLTIP_PORTAL_Z_INDEX = 100_000;

/** Inline confirm dialogs that must sit above hover tooltips. */
export const CONFIRM_DIALOG_Z_INDEX_BACKDROP = TOOLTIP_PORTAL_Z_INDEX + 50;
export const CONFIRM_DIALOG_Z_INDEX_PANEL = TOOLTIP_PORTAL_Z_INDEX + 51;

/** Viewport inset when clamping portaled panels (matches RequesterAvatar / InstantTooltip). */
export const TOOLTIP_VIEWPORT_MARGIN = 8;

/** Shared max width so text wraps at word boundaries instead of squeezing into a narrow column. */
export const TOOLTIP_MAX_WIDTH_CLASS = 'max-w-[min(22rem,calc(100vw-1rem))]';
