// horizon-gpu.ts — the relief maps on the GPU (BUILD.md §10 Phase 4, step 3): the horizon
// table rendered into an R8 2D-array two directions a frame, so the interface never stalls; the
// max pyramid comes from the CPU (core relief/horizon.ts); Tmax is found here too (D-039). Also the
// slopes texture and, for a table made on the CPU, its upload.

import { K, type Height, type HorizonInput } from 'core';
import { program } from './context.ts';
import { AO, MAX_TAPS, REDUCE, TABLE, TMAX, TMAX_DIRS } from './shaders/horizon.glsl.ts';
import { VERTEX } from './shaders/light.glsl.ts';

/** The relief textures the preview samples (§9: slopes RG16F, horizon R8 x 32, ao R8). */
export interface ReliefTextures { width: number; height: number; slopes: WebGLTexture; table: WebGLTexture; ao: WebGLTexture; tmax: number }

function tex(gl: WebGL2RenderingContext, target: number, filter: number): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(target, t);
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/** Slopes (p, q) as RG16F, filtered (bilinear, as §5.2 samples them). */
export function slopesTexture(gl: WebGL2RenderingContext, h: Height): WebGLTexture {
  const n = h.width * h.height, pq = new Float32Array(2 * n);
  for (let i = 0; i < n; i++) { pq[2 * i] = h.p[i]!; pq[2 * i + 1] = h.q[i]!; }
  const t = tex(gl, gl.TEXTURE_2D, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, h.width, h.height, 0, gl.RG, gl.FLOAT, pq);
  return t;
}

function tableTexture(gl: WebGL2RenderingContext, w: number, h: number, bytes?: Uint8Array): WebGLTexture {
  const t = tex(gl, gl.TEXTURE_2D_ARRAY, gl.LINEAR);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.R8, w, h, K);
  if (bytes) { gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, w, h, K, gl.RED, gl.UNSIGNED_BYTE, bytes); }
  return t;
}
function aoTexture(gl: WebGL2RenderingContext, w: number, h: number, bytes?: Uint8Array): WebGLTexture {
  const t = tex(gl, gl.TEXTURE_2D, gl.LINEAR);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, w, h);
  if (bytes) { gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED, gl.UNSIGNED_BYTE, bytes); }
  return t;
}

/** A table and ao made on the CPU, uploaded. */
export function uploadHorizon(gl: WebGL2RenderingContext, h: Height, table: Uint8Array, ao: Uint8Array, tmax: number): ReliefTextures {
  return { width: h.width, height: h.height, slopes: slopesTexture(gl, h), table: tableTexture(gl, h.width, h.height, table), ao: aoTexture(gl, h.width, h.height, ao), tmax };
}

/** True when this GPU can render float textures, so it can find Tmax itself (D-039). */
export const gpuTmaxSupported = (gl: WebGL2RenderingContext): boolean => gl.getExtension('EXT_color_buffer_float') !== null;

/**
 * Builds the table on the GPU: `step()` once a frame until it returns true. Without `tmax` it
 * first finds Tmax itself (two directions a frame, then a max reduction; needs
 * gpuTmaxSupported), then the table two directions a frame, then the hollows.
 */
export function gpuHorizon(gl: WebGL2RenderingContext, h: Height, inp: HorizonInput, tmax?: number) {
  const { width: w, height: hh, taps } = inp;
  if (taps.n > MAX_TAPS) throw new Error(`at most ${MAX_TAPS} taps`);
  const progs = { table: program(gl, VERTEX, TABLE), ao: program(gl, VERTEX, AO), tmax: program(gl, VERTEX, TMAX), reduce: program(gl, VERTEX, REDUCE) };
  const vao = gl.createVertexArray(), fbo = gl.createFramebuffer()!;
  const pyr = tex(gl, gl.TEXTURE_2D, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, inp.pyramid.length - 1);
  gl.texStorage2D(gl.TEXTURE_2D, inp.pyramid.length, gl.R32F, w, hh);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  inp.pyramid.forEach((L, l) => gl.texSubImage2D(gl.TEXTURE_2D, l, 0, 0, L.width, L.height, gl.RED, gl.FLOAT, L.data));
  const out: ReliefTextures = { width: w, height: hh, slopes: slopesTexture(gl, h), table: tableTexture(gl, w, hh), ao: aoTexture(gl, w, hh), tmax: tmax ?? 0 };
  const loc = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const levels = Int32Array.from({ length: MAX_TAPS }, (_, j) => taps.level[j] ?? 0);
  /** Offsets and 1 / length of directions [k, k + dirs), MAX_TAPS apart. */
  const tapsOf = (k: number, dirs: number) => {
    const off = new Int32Array(2 * dirs * MAX_TAPS), inv = new Float32Array(dirs * MAX_TAPS);
    for (let d = 0; d < dirs; d++) for (let j = 0; j < taps.n; j++) {
      const o = (k + d) * taps.n + j, u = d * MAX_TAPS + j;
      off[2 * u] = taps.ox[o]!; off[2 * u + 1] = taps.oy[o]!; inv[u] = taps.inv[o]!;
    }
    return { off, inv };
  };
  const float = (fw: number, fh: number) => { const t = tex(gl, gl.TEXTURE_2D, gl.NEAREST); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R32F, fw, fh); return t; };
  const draw = (prog: WebGLProgram, target: WebGLTexture, tw: number, th: number, src: WebGLTexture, srcName: string) => {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, tw, th);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(loc(prog, srcName), 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // Tmax on the GPU: ping-pong the per-pixel max over the directions, then reduce.
  let ping: WebGLTexture[] = [], km = tmax === undefined ? 0 : K, k = 0, done = false;
  if (tmax === undefined) {
    ping = [float(w, hh), float(w, hh)];
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    for (const t of ping) { gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  function tmaxStep(): void {
    const dirs = Math.min(TMAX_DIRS, K - km), p = progs.tmax, { off, inv } = tapsOf(km, dirs);
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pyr);
    gl.uniform1i(loc(p, 'u_pyr'), 0);
    gl.uniform1i(loc(p, 'u_n'), taps.n); gl.uniform1i(loc(p, 'u_dirs'), dirs);
    gl.uniform1iv(loc(p, 'u_level'), levels);
    gl.uniform2iv(loc(p, 'u_off'), off); gl.uniform1fv(loc(p, 'u_inv'), inv);
    draw(p, ping[1]!, w, hh, ping[0]!, 'u_prev');
    ping.reverse();
    km += dirs;
    if (km < K) return;
    let src = ping[0]!, sw = w, sh = hh; // reduce 4 x 4 blocks to one texel, then read it
    const tmp: WebGLTexture[] = [];
    while (sw > 1 || sh > 1) {
      const nw = Math.ceil(sw / 4), nh = Math.ceil(sh / 4), t = float(nw, nh);
      draw(progs.reduce, t, nw, nh, src, 'u_src');
      tmp.push(t); src = t; sw = nw; sh = nh;
    }
    const px = new Float32Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px);
    out.tmax = px[0]! * w;
    for (const t of [...ping, ...tmp]) gl.deleteTexture(t);
  }

  function tableStep(): void {
    gl.viewport(0, 0, w, hh);
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, out.table, 0, k);
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, out.table, 0, k + 1);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    const p = progs.table, { off, inv } = tapsOf(k, 2);
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pyr);
    gl.uniform1i(loc(p, 'u_pyr'), 0);
    gl.uniform1i(loc(p, 'u_n'), taps.n);
    gl.uniform1iv(loc(p, 'u_level'), levels);
    gl.uniform2iv(loc(p, 'u_off'), off); gl.uniform1fv(loc(p, 'u_inv'), inv);
    gl.uniform1f(loc(p, 'u_sc'), out.tmax > 0 ? w / out.tmax : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    k += 2;
    if (k < K) return;
    // hollows, from the finished table
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, null, 0, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out.ao, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.useProgram(progs.ao);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, out.table);
    gl.uniform1i(loc(progs.ao, 'u_table'), 0);
    gl.uniform1f(loc(progs.ao, 'u_tmax'), out.tmax);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    done = true;
  }

  function step(): boolean {
    if (done) return true;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.bindVertexArray(vao);
    if (km < K) tmaxStep(); else tableStep();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (done) {
      gl.deleteFramebuffer(fbo); gl.deleteTexture(pyr);
      for (const p of Object.values(progs)) gl.deleteProgram(p);
    }
    return done;
  }
  return { step, textures: out };
}

/** Reads a finished table and ao back (tests: GPU against CPU). */
export function readHorizon(gl: WebGL2RenderingContext, r: ReliefTextures): { table: Uint8Array; ao: Uint8Array; tmax: number } {
  const n = r.width * r.height, table = new Uint8Array(K * n), ao = new Uint8Array(n), px = new Uint8Array(4 * n), fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const read = (into: Uint8Array) => { gl.readPixels(0, 0, r.width, r.height, gl.RGBA, gl.UNSIGNED_BYTE, px); for (let i = 0; i < n; i++) into[i] = px[4 * i]!; };
  for (let k = 0; k < K; k++) { gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, r.table, 0, k); read(table.subarray(k * n, (k + 1) * n)); }
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, r.ao, 0);
  read(ao);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
  return { table, ao, tmax: r.tmax };
}
