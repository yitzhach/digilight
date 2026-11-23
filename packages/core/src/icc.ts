// icc.ts — what a photo's ICC colour profile says (D-016, BUILD.md Phase 7): whether its
// primaries reach past sRGB's (the photo is then worked in Display P3), and whether it is sRGB's
// or Display P3's own profile (its stored values are then already in that space).

/** The chromaticity x of the red and green primaries, adapted to D50 as ICC stores them. */
function primaries(icc: Uint8Array): { r: number; g: number } | null {
  if (icc.length < 132) return null;
  const v = new DataView(icc.buffer, icc.byteOffset, icc.byteLength), sig = (i: number) => String.fromCharCode(...icc.subarray(i, i + 4));
  const xyz: Record<string, number[]> = {};
  for (let k = 0, n = v.getUint32(128); k < n && 132 + k * 12 + 12 <= icc.length; k++) {
    const t = 132 + k * 12, name = sig(t), at = v.getUint32(t + 4);
    if ((name === 'rXYZ' || name === 'gXYZ') && at + 20 <= icc.length && sig(at) === 'XYZ ') xyz[name] = [0, 1, 2].map((j) => v.getInt32(at + 8 + 4 * j) / 65536);
  }
  const x = (c?: number[]) => (c ? c[0]! / (c[0]! + c[1]! + c[2]!) : NaN);
  const r = x(xyz.rXYZ), g = x(xyz.gXYZ);
  return Number.isFinite(r) && Number.isFinite(g) ? { r, g } : null;
}

/** Whether a profile's primaries reach past sRGB's (Display P3, Adobe RGB, ProPhoto...): sRGB red
 *  is at x 0.648 and green 0.321; Display P3 0.683 and 0.284; Adobe RGB 0.648 and 0.215. */
export function iccWide(icc: Uint8Array): boolean {
  const p = primaries(icc);
  return !!p && (p.r > 0.66 || p.g < 0.30);
}

/** 'srgb' or 'display-p3' for those spaces' own primaries; 'wide' for another wide profile (Adobe
 *  RGB...); 'other' for anything else, a grey profile included. */
export function iccKind(icc: Uint8Array): 'srgb' | 'display-p3' | 'wide' | 'other' {
  const p = primaries(icc), near = (a: number, b: number) => Math.abs(a - b) < 0.004;
  if (p && near(p.r, 0.648) && near(p.g, 0.321)) return 'srgb';
  if (p && near(p.r, 0.683) && near(p.g, 0.284)) return 'display-p3';
  return iccWide(icc) ? 'wide' : 'other';
}
