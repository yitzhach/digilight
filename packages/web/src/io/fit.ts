// fit.ts — a picture this browser can save: Safari on a phone cannot hold a canvas past about
// 16.7 megapixels (the wall makes a full-size picture over twice the photo's), and the export
// encodes through a canvas.

/** True when this browser can hold a w x h canvas (Safari on a phone stops near 16.7 megapixels:
 *  past it the canvas has no context, so the picture could not be saved). */
export function canvasFits(w: number, h: number): boolean {
  try {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    let ok = false;
    if (g) { g.fillRect(w - 1, h - 1, 1, 1); ok = g.getImageData(w - 1, h - 1, 1, 1).data[3] === 255; }
    c.width = c.height = 0;
    return ok;
  } catch { return false; }
}

/** The largest width up to `width` whose picture (`size`) passes `fits`: the width itself, else
 *  10% smaller at a time. */
export function fitWidth(width: number, size: (w: number) => { width: number; height: number }, fits: (w: number, h: number) => boolean): number {
  for (let w = width; w >= 64; w = Math.floor(w * 0.9)) { const s = size(w); if (fits(s.width, s.height)) return w; }
  return Math.min(width, 64);
}
