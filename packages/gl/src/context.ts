// context.ts — WebGL2 plumbing for the preview: the context, the colour space, shaders, the
// photo texture. No lighting here (that is shaders/ and preview.ts).

import { thumbnail, type Image, type Space } from 'core';

export function createContext(canvas: HTMLCanvasElement | OffscreenCanvas): WebGL2RenderingContext {
  // No antialiasing: the drawing buffer must be a plain one so a reduced-scale frame can be
  // blitted onto it, and readPixels gives the shader's own values.
  const gl = canvas.getContext('webgl2', { antialias: false, depth: false, stencil: false, premultipliedAlpha: true });
  if (!gl) throw new Error('This browser has no WebGL2, which DigiLight needs. Try Safari 16 or a current Chrome.');
  return gl as WebGL2RenderingContext;
}

/** Display P3 photos draw in Display P3 (ported from v1 src/colour.js `useSpace`). */
export function useSpace(gl: WebGL2RenderingContext, space: Space): void {
  const working = space === 'display-p3' ? space : 'srgb';
  const g = gl as WebGL2RenderingContext & { drawingBufferColorSpace?: string; unpackColorSpace?: string };
  if ('drawingBufferColorSpace' in g) { g.drawingBufferColorSpace = working; g.unpackColorSpace = working; }
}

function shader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(s)}`);
  return s;
}

export function program(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`program: ${gl.getProgramInfoLog(p)}`);
  return p;
}

/** Largest photo side the preview holds: min(MAX_TEXTURE_SIZE, 8192) (§9). */
export const maxSide = (gl: WebGL2RenderingContext): number => Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, 8192);

/**
 * The photo as one RGBA8 texture with mipmaps, area-averaged down first if a side is over
 * maxSide. Bytes go up as they are (no colour conversion), so the neutral picture is exact.
 */
export function photoTexture(gl: WebGL2RenderingContext, photo: Image, old?: WebGLTexture | null): WebGLTexture {
  const limit = maxSide(gl);
  const img = Math.max(photo.width, photo.height) > limit ? thumbnail(photo, limit) : photo;
  if (old) gl.deleteTexture(old);
  const t = gl.createTexture()!;
  const levels = Math.floor(Math.log2(Math.max(img.width, img.height))) + 1;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, img.width, img.height);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
  const bytes = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.length);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, img.width, img.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
