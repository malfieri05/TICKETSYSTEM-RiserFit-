import { getZoomedRect } from '@/lib/zoom';

/**
 * Position/size for a “sliding thumb” in the same coordinate system as `position: absolute`
 * inside `container` (layout CSS px). Uses offsetParent walking so global `html { zoom }`
 * does not skew measurements; falls back to {@link getZoomedRect} deltas if the chain
 * does not reach `container`.
 */
export function measureThumbInsideContainer(
  container: HTMLElement,
  target: HTMLElement,
): { left: number; top: number; width: number; height: number } | null {
  let left = 0;
  let top = 0;
  let node: HTMLElement | null = target;
  while (node !== null && node !== container) {
    left += node.offsetLeft;
    top += node.offsetTop;
    const op: Element | null = node.offsetParent;
    if (!(op instanceof HTMLElement)) {
      break;
    }
    node = op;
  }
  if (node === container) {
    return {
      left,
      top,
      width: target.offsetWidth,
      height: target.offsetHeight,
    };
  }

  const cr = getZoomedRect(container);
  const tr = getZoomedRect(target);
  return {
    left: tr.left - cr.left,
    top: tr.top - cr.top,
    width: tr.width,
    height: tr.height,
  };
}
