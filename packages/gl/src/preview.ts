// preview.ts — the interactive picture (BUILD.md Phase 2): core's lighting drawn by WebGL2 in
// one pass. The reference renderer stays the truth; this imitates it within §5.11.

import { glowMaps, glowTint, wallPaint, guardKappa, prepareFinish, prepareLighting, type Doc, type Finish, type GlowMaps, type Height, type HorizonInput, type Image, type Lighting, type Space } from 'core';
import { createContext, photoTexture, program, useSpace } from './context.ts';
import { glowTextures, type GlowTextures } from './glow-gpu.ts';
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
  /** The document; `kappa` from guardKappa if already known (computed here otherwise). `glow`:
   *  Glow's maps if already made, null to draw without until they are (made here if left out). */
  setDoc(doc: Doc, opts?: { kappa?: number; glow?: GlowMaps | null }): void;
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
      p.sx, p.sy, p.sz, p.sun ? 1 : 0, p.cosOuter, p.cosInner, p.size, p.k0 + p.kt, p.r, p.g, p.b, 0,
      ...(p.pat ? [...p.pat.U, p.pat.kind, ...p.pat.V, p.pat.soft, ...p.pat.C, 0, 0] : [])], i * LAMP_VEC4S * 4); // tool:pattern
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
    bounce: loc('u_bounce'), roomSide: loc('u_roomSide'), room: loc('u_room'), // tool:bounce, tool:roomside
    even: loc('u_even'), evenA: loc('u_evenA'), evenB: loc('u_evenB'), evenT: loc('u_evenT'), // tool:even
    glow: loc('u_glow'), glowNear: loc('u_glowNear'), glowFar: loc('u_glowFar'), glowTint: loc('u_glowTint'), glowMix: loc('u_glowMix'), // tool:glow
    wall: loc('u_wall'), wallA: loc('u_wallA'), wallPaint: loc('u_wallPaint'), wallRoom: loc('u_wallRoom'), // tool:wall
    finish: loc('u_finish'), warm: loc('u_warm'), contrast: loc('u_contrast'), saturation: loc('u_saturation'),
    vignette: loc('u_vignette'), grain: loc('u_grain'), vig: loc('u_vig'), hasCurve: loc('u_hasCurve'), curve: loc('u_curve'),
  };
  let relief: ReliefTextures | null = null, building = 0;
  const dropRelief = () => {
    if (relief) for (const t of [relief.slopes, relief.table, relief.ao]) gl.deleteTexture(t);
    relief = null;
  };
  let photo: Image | null = null, tex: WebGLTexture | null = null, aspect = 1;
  let doc: Doc | null = null, lighting: Lighting | null = null, lampData = packLamps([]), kappa = 1, fin: Finish | null = null;
  let view: View = { zoom: 1, pan: [0.5, 0.5] }, q = 1;
  let glow: GlowTextures | null = null; // tool:glow
  let fbo: WebGLFramebuffer | null = null, fboTex: WebGLTexture | null = null, fboW = 0, fboH = 0;

  function relight(): void {
    if (!doc) return;
    // kappa goes in as its uniform; with Texture on but its maps not ready, the Light layer only
    const on = doc.relief.mode !== 'off' && relief ? doc : { ...doc, relief: { ...doc.relief, mode: 'off' as const } };
    lighting = prepareLighting(on, aspect, 1, on.relief.mode !== 'off' || null);
    lampData = packLamps([...lighting.lamps, ...lighting.suns]); // tool:wall: the suns folded into the room light follow, for the wall
    fin = prepareFinish(doc, aspect);
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
      const glowing = glow !== null && doc!.finish.glow > 0; // tool:glow
      gl.uniform1i(U.unit, lighting.unit && kappa === 1 && !fin && !glowing ? 1 : 0);
      gl.uniform1i(U.glow, glowing ? 1 : 0); gl.uniform1i(U.glowNear, 4); gl.uniform1i(U.glowFar, 5); // tool:glow
      if (glowing) { // tool:glow
        const t = glowTint(doc!);
        gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, glow!.near);
        gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, glow!.far);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform3f(U.glowTint, t[0], t[1], t[2]); gl.uniform1f(U.glowMix, doc!.finish.glowSpread);
      }
      gl.uniform1i(U.finish, fin ? 1 : 0);
      if (fin) {
        const w = fin.warm ?? [1, 1, 1];
        gl.uniform3f(U.warm, w[0], w[1], w[2]);
        gl.uniform1f(U.contrast, fin.contrast); gl.uniform1f(U.saturation, fin.saturation);
        gl.uniform1f(U.vignette, fin.vignette); gl.uniform1f(U.grain, fin.grain);
        gl.uniform3f(U.vig, fin.cx, fin.cy, fin.inv);
        gl.uniform1i(U.hasCurve, fin.curve ? 1 : 0);
        if (fin.curve) gl.uniform4fv(U.curve, Float32Array.from(fin.curve));
      }
      gl.uniform3f(U.base, lighting.base[0], lighting.base[1], lighting.base[2]);
      gl.uniform1f(U.kappa, kappa);
      gl.uniform1f(U.protect, doc!.tone.highlightProtect);
      gl.uniform1i(U.lamps, lighting.lamps.length);
      gl.uniform4fv(U.lamp, lampData);
      const wl = doc!.wall; // tool:wall
      gl.uniform1i(U.wall, wl.on ? 1 : 0);
      if (wl.on) {
        const pt = wallPaint(doc!), rm = lighting.room;
        gl.uniform4f(U.wallA, wl.standoff, wl.shadow, wl.margin, lighting.lamps.length + lighting.suns.length);
        gl.uniform3f(U.wallPaint, pt[0], pt[1], pt[2]); gl.uniform3f(U.wallRoom, rm[0], rm[1], rm[2]);
      }
      const ev = lighting.even; // tool:even
      gl.uniform1i(U.even, ev ? 1 : 0);
      if (ev) { gl.uniform4f(U.evenA, ev.cx, ev.cy, ev.kx, ev.ky); gl.uniform3f(U.evenB, ev.h, ev.k, ev.inv); gl.uniform3f(U.evenT, ev.T[0], ev.T[1], ev.T[2]); }
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
        const room = lighting.relief!.room ?? [0, 0, 1]; // tool:roomside
        gl.uniform1f(U.bounce, R.bounce); gl.uniform1f(U.roomSide, R.roomSide); gl.uniform3f(U.room, room[0], room[1], room[2]); // tool:bounce, tool:roomside
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
      const maps = !(d.finish.glow > 0) ? null : opts.glow !== undefined ? opts.glow : photo ? glowMaps(photo, d, kappa) : null; // tool:glow
      glow = glowTextures(gl, maps, glow); // tool:glow
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
