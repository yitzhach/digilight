// preview.ts — the interactive picture (BUILD.md Phase 2): core's lighting drawn by WebGL2 in
// one pass. The reference renderer stays the truth; this imitates it within §5.11.

import { guardKappa, prepareLighting, type Doc, type Height, type HorizonInput, type Image, type Lighting, type Space } from 'core';
import { createContext, photoTexture, program, useSpace } from './context.ts';
import { gpuHorizon, gpuTmaxSupported, readHorizon, uploadHorizon, type ReliefTextures } from './horizon-gpu.ts';
import { FRAGMENT, LAMP_VEC4S, MAX_LAMPS, VERTEX } from './shaders/light.glsl.ts';

export interface View {
  /** 1 fits the whole picture in the canvas; 8 is 800%. */
  zoom: number;
  /** The picture point (box units, §5.1) at the canvas centre. */
  pan: [number, number];
}

export interface Preview {
  /** The photo (RGBA8, as decoded) and its colour space. */
  setPhoto(photo: Image, space?: Space): void;
  /** The document; `kappa` from guardKappa if already known (computed here otherwise). */
  setDoc(doc: Doc, opts?: { kappa?: number }): void;
  setView(view: Partial<View>): void;
  /** Draw at a reduced scale q (0 < q <= 1) while the pointer is down (§9). */
  setScale(q: number): void;
  draw(): void;
  /** Draws, then returns the canvas pixels top row first. */
  readPixels(): Image;
  /** Waits until the GPU has finished what was drawn (reads one pixel); for timing. */
  sync(): void;
  readonly kappa: number;
  /** Texture's maps, built on the GPU from the CPU's pyramid, a few directions a frame (`frame`
   *  waits for the next one); used once done. Tmax is found on the GPU where it can render
   *  floats, else `cpuTmax` gives it. A newer call or setRelief cancels it. */
  buildRelief(h: Height, inp: HorizonInput, frame: () => Promise<unknown>, cpuTmax: () => Promise<number>): Promise<boolean>;
  /** Texture's maps made on the CPU (tests), or null for none. */
  setRelief(m: (Height & { table: Uint8Array; ao: Uint8Array; tmax: number }) | null): void;
  readonly reliefReady: boolean;
  /** The finished table and ao read back (tests). */
  readRelief(): { table: Uint8Array; ao: Uint8Array; tmax: number } | null;
}

type Lamp = Lighting['lamps'][number];

/** The lamps as u_lamp's vec4s (layout in shaders/light.glsl.ts). */
export function packLamps(lamps: readonly Lamp[]): Float32Array {
  if (lamps.length > MAX_LAMPS) throw new Error(`at most ${MAX_LAMPS} lights`);
  const u = new Float32Array(MAX_LAMPS * LAMP_VEC4S * 4);
  lamps.forEach((p, i) => {
    u.set([p.Lx, p.Ly, p.Lz, p.r0, p.l0z, p.falloff, p.intensity, p.spot ? 1 : 0,
      p.sx, p.sy, p.sz, p.sun ? 1 : 0, p.cosOuter, p.cosInner, p.size, p.k0 + p.kt, p.r, p.g, p.b, 0], i * LAMP_VEC4S * 4);
  });
  return u;
}

export function createPreview(canvas: HTMLCanvasElement | OffscreenCanvas): Preview {
  const gl = createContext(canvas);
  const prog = program(gl, VERTEX, FRAGMENT);
  const vao = gl.createVertexArray();
  const loc = (n: string) => gl.getUniformLocation(prog, n);
  const U = {
    photo: loc('u_photo'), target: loc('u_target'), aspect: loc('u_aspect'), scale: loc('u_scale'),
    centre: loc('u_centre'), unit: loc('u_unit'), base: loc('u_base'), kappa: loc('u_kappa'),
    protect: loc('u_protect'), lamps: loc('u_lamps'), lamp: loc('u_lamp'),
    relief: loc('u_relief'), slopes: loc('u_slopes'), horizon: loc('u_horizon'), aoTex: loc('u_aoTex'), rAspect: loc('u_rAspect'),
    tmax: loc('u_tmax'), depth: loc('u_depth'), shadows: loc('u_shadows'), ao: loc('u_ao'), sheen: loc('u_sheen'), sharp: loc('u_sharp'),
  };
  let relief: ReliefTextures | null = null, building = 0;
  const dropRelief = () => {
    if (relief) for (const t of [relief.slopes, relief.table, relief.ao]) gl.deleteTexture(t);
    relief = null;
  };
  let photo: Image | null = null, tex: WebGLTexture | null = null, aspect = 1;
  let doc: Doc | null = null, lighting: Lighting | null = null, lampData = packLamps([]), kappa = 1;
  let view: View = { zoom: 1, pan: [0.5, 0.5] }, q = 1;
  let fbo: WebGLFramebuffer | null = null, fboTex: WebGLTexture | null = null, fboW = 0, fboH = 0;

  function relight(): void {
    if (!doc) return;
    // kappa goes in as its uniform; with Texture on but its maps not ready, the Light layer only
    const on = doc.relief.mode !== 'off' && relief ? doc : { ...doc, relief: { ...doc.relief, mode: 'off' as const } };
    lighting = prepareLighting(on, aspect, 1, on.relief.mode !== 'off' || null);
    lampData = packLamps(lighting.lamps);
  }

  function target(w: number, h: number): WebGLFramebuffer {
    if (fbo && fboW === w && fboH === h) return fbo;
    if (fbo) { gl.deleteFramebuffer(fbo); gl.deleteTexture(fboTex); }
    fboTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, fboTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTex, 0);
    fboW = w; fboH = h;
    return fbo;
  }

  function draw(): void {
    const W = canvas.width, H = canvas.height;
    const tw = q < 1 ? Math.max(1, Math.round(W * q)) : W, th = q < 1 ? Math.max(1, Math.round(H * q)) : H;
    gl.bindFramebuffer(gl.FRAMEBUFFER, q < 1 ? target(tw, th) : null);
    gl.viewport(0, 0, tw, th);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (tex && lighting) {
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(U.photo, 0);
      gl.uniform2f(U.target, tw, th);
      gl.uniform1f(U.aspect, aspect);
      gl.uniform1f(U.scale, view.zoom * Math.min(tw, th / aspect));
      gl.uniform2f(U.centre, view.pan[0], view.pan[1] * aspect);
      gl.uniform1i(U.unit, lighting.unit && kappa === 1 ? 1 : 0);
      gl.uniform3f(U.base, lighting.base[0], lighting.base[1], lighting.base[2]);
      gl.uniform1f(U.kappa, kappa);
      gl.uniform1f(U.protect, doc!.tone.highlightProtect);
      gl.uniform1i(U.lamps, lighting.lamps.length);
      gl.uniform4fv(U.lamp, lampData);
      const R = lighting.relief && relief ? doc!.relief : null;
      gl.uniform1i(U.relief, R ? 1 : 0);
      gl.uniform1i(U.slopes, 1); gl.uniform1i(U.horizon, 2); gl.uniform1i(U.aoTex, 3);
      if (R && relief) {
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, relief.slopes);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D_ARRAY, relief.table);
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, relief.ao);
        gl.uniform1f(U.rAspect, relief.width / relief.height);
        gl.uniform1f(U.tmax, relief.tmax); gl.uniform1f(U.depth, R.depth); gl.uniform1f(U.shadows, R.shadows);
        gl.uniform1f(U.ao, R.ao); gl.uniform1f(U.sheen, R.sheen); gl.uniform1f(U.sharp, 2 ** R.sheenSharpness);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (q < 1) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(0, 0, tw, th, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  return {
    setPhoto(p, space = 'srgb') {
      useSpace(gl, space);
      photo = p; aspect = p.height / p.width;
      tex = photoTexture(gl, p, tex);
      relight();
    },
    setDoc(d, opts = {}) {
      doc = d;
      if (!photo) aspect = d.photo.height / d.photo.width;
      kappa = opts.kappa ?? (photo && d.tone.protectWhites ? guardKappa(photo, d) : 1);
      relight();
    },
    setView(v) { view = { ...view, ...v }; },
    setScale(s) {
      if (!(s > 0 && s <= 1)) throw new Error('scale must be over 0 and at most 1');
      q = s;
    },
    draw,
    readPixels() {
      draw();
      const W = canvas.width, H = canvas.height, row = W * 4;
      const raw = new Uint8Array(row * H), data = new Uint8ClampedArray(row * H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      for (let j = 0; j < H; j++) data.set(raw.subarray((H - 1 - j) * row, (H - j) * row), j * row);
      return { data, width: W, height: H };
    },
    sync() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    },
    get kappa() { return kappa; },
    async buildRelief(h, inp, frame, cpuTmax) {
      const me = ++building;
      dropRelief(); relight();
      const tmax = gpuTmaxSupported(gl) ? undefined : await cpuTmax();
      if (me !== building) return false;
      const job = gpuHorizon(gl, h, inp, tmax);
      for (;;) {
        if (me !== building) { for (const t of [job.textures.slopes, job.textures.table, job.textures.ao]) gl.deleteTexture(t); return false; }
        if (job.step()) break;
        await frame();
      }
      relief = job.textures; relight();
      return true;
    },
    setRelief(m) {
      building++;
      dropRelief();
      if (m) relief = uploadHorizon(gl, m, m.table, m.ao, m.tmax);
      relight();
    },
    get reliefReady() { return relief !== null; },
    readRelief: () => (relief ? readHorizon(gl, relief) : null),
  };
}
