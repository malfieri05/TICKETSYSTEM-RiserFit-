/**
 * CSS Zoom Coordinate Compensation
 * =================================
 * When `html { zoom: N }` is set, `getBoundingClientRect()` returns values in
 * VIEWPORT px (visual coordinates), but CSS position/size properties on elements
 * inside the zoomed html need values in ZOOMED CSS px.
 *
 * The conversion is:   zoomed_css_px = viewport_px / zoom
 *
 * Use `getZoomedRect()` instead of `el.getBoundingClientRect()` when you intend
 * to assign the result to a CSS top/left/width/height property.
 * Use `getZoomedViewport()` instead of `window.innerWidth/Height`.
 */

/** Reads the zoom factor from the --app-zoom CSS custom property on <html>. */
export function getDocumentZoom(): number {
  if (typeof window === 'undefined') return 1;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--app-zoom')
    .trim();
  const parsed = parseFloat(raw);
  return !isNaN(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Returns viewport dimensions in zoomed CSS px.
 * Use instead of window.innerWidth / window.innerHeight when setting CSS positions.
 */
export function getZoomedViewport(): { width: number; height: number } {
  const zoom = getDocumentZoom();
  return {
    width: window.innerWidth / zoom,
    height: window.innerHeight / zoom,
  };
}

/**
 * Returns a rect with all values converted from viewport px → zoomed CSS px.
 * Drop-in replacement for el.getBoundingClientRect() when assigning to CSS properties.
 */
export function getZoomedRect(el: Element): {
  top: number; bottom: number; left: number; right: number;
  width: number; height: number; x: number; y: number;
} {
  const zoom = getDocumentZoom();
  const r = el.getBoundingClientRect();
  if (zoom === 1) {
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right,
             width: r.width, height: r.height, x: r.x, y: r.y };
  }
  return {
    top:    r.top    / zoom,
    bottom: r.bottom / zoom,
    left:   r.left   / zoom,
    right:  r.right  / zoom,
    width:  r.width  / zoom,
    height: r.height / zoom,
    x:      r.x      / zoom,
    y:      r.y      / zoom,
  };
}
