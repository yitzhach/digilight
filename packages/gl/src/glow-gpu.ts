// glow-gpu.ts — Glow's two maps as textures (BUILD.md §5.12.3; tool:glow). core makes the maps
// (tools/glow.ts); the shader reads them bilinearly, edges clamped, as the reference does.

import type { GlowMaps } from 'core';

export interface GlowTextures { near: WebGLTexture; far: WebGLTexture; maps: GlowMaps }

function upload(gl: WebGL2RenderingContext, data: Float32Array, w: number, h: number): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB16F, w, h, 0, gl.RGB, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/** The textures for `maps` (those of `old` if they are the same maps; `old` is freed otherwise). */
export function glowTextures(gl: WebGL2RenderingContext, maps: GlowMaps | null, old: GlowTextures | null): GlowTextures | null {
  if (old && old.maps === maps) return old;
  if (old) { gl.deleteTexture(old.near); gl.deleteTexture(old.far); }
  if (!maps) return null;
  return { near: upload(gl, maps.near, maps.width, maps.height), far: upload(gl, maps.far, maps.width, maps.height), maps };
}
