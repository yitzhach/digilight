// horizon.glsl.ts — the horizon table (BUILD.md §5.6) on the GPU, two directions a frame, and
// the hollows (ao) from the finished table. They mirror core's relief/horizon.ts: the same
// whole-pixel taps into the same max pyramid (uploaded from the CPU), the same Tmax.

/** Most taps a direction has (reach 0.2 widths at 1.35 apart: 21 at 2048 px). */
export const MAX_TAPS = 24;

export const TABLE = `#version 300 es
precision highp float;
precision highp int;

uniform highp sampler2D u_pyr;  // hs and its max pyramid, R32F, one mip level per level
uniform int u_n;                // taps
uniform int u_level[${MAX_TAPS}];
uniform ivec2 u_off[${2 * MAX_TAPS}]; // direction A's taps, then direction B's
uniform float u_inv[${2 * MAX_TAPS}];
uniform float u_sc;             // relief width / Tmax

layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;

float rise(ivec2 P, ivec2 size, float h0, int base) {
  float best = 0.0;
  for (int j = 0; j < ${MAX_TAPS}; j++) {
    if (j >= u_n) break;
    ivec2 X = P + u_off[base + j];
    if (X.x < 0 || X.y < 0 || X.x >= size.x || X.y >= size.y) break; // and every later tap
    int l = u_level[j];
    ivec2 t = min(X >> l, textureSize(u_pyr, l) - 1);
    best = max(best, (texelFetch(u_pyr, t, l).r - h0) * u_inv[base + j]);
  }
  return best;
}

float byteOf(float r) { return round(255.0 * sqrt(r * u_sc)) / 255.0; }

void main() {
  ivec2 P = ivec2(gl_FragCoord.xy), size = textureSize(u_pyr, 0); // row 0 is the top (as stored)
  float h0 = texelFetch(u_pyr, P, 0).r;
  outA = vec4(byteOf(rise(P, size, h0, 0)), 0.0, 0.0, 1.0);
  outB = vec4(byteOf(rise(P, size, h0, ${MAX_TAPS})), 0.0, 0.0, 1.0);
}`;

/** Directions a frame for Tmax (as the table: a frame stays well under 100 ms). */
export const TMAX_DIRS = 2;

/** Tmax, step 1: per pixel, the largest rise so far over the directions done (ping-pong R32F). */
export const TMAX = `#version 300 es
precision highp float;
precision highp int;

uniform highp sampler2D u_pyr;
uniform highp sampler2D u_prev; // the largest rise of the directions before (R32F)
uniform int u_n, u_dirs;
uniform int u_level[${MAX_TAPS}];
uniform ivec2 u_off[${4 * MAX_TAPS}];
uniform float u_inv[${4 * MAX_TAPS}];
out vec4 outMax;

void main() {
  ivec2 P = ivec2(gl_FragCoord.xy), size = textureSize(u_pyr, 0);
  float h0 = texelFetch(u_pyr, P, 0).r, best = texelFetch(u_prev, P, 0).r;
  for (int d = 0; d < 4; d++) {
    if (d >= u_dirs) break;
    for (int j = 0; j < ${MAX_TAPS}; j++) {
      if (j >= u_n) break;
      int o = d * ${MAX_TAPS} + j;
      ivec2 X = P + u_off[o];
      if (X.x < 0 || X.y < 0 || X.x >= size.x || X.y >= size.y) break;
      int l = u_level[j];
      ivec2 t = min(X >> l, textureSize(u_pyr, l) - 1);
      best = max(best, (texelFetch(u_pyr, t, l).r - h0) * u_inv[o]);
    }
  }
  outMax = vec4(best, 0.0, 0.0, 1.0);
}`;

/** Tmax, step 2: the max of each 4 x 4 block, until one texel is left. */
export const REDUCE = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D u_src;
out vec4 outMax;
void main() {
  ivec2 P = ivec2(gl_FragCoord.xy) * 4, size = textureSize(u_src, 0);
  float m = 0.0;
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    ivec2 Q = P + ivec2(x, y);
    if (Q.x < size.x && Q.y < size.y) m = max(m, texelFetch(u_src, Q, 0).r);
  }
  outMax = vec4(m, 0.0, 0.0, 1.0);
}`;

export const AO = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;

uniform sampler2DArray u_table;
uniform float u_tmax;
out vec4 outAo;

void main() {
  ivec2 P = ivec2(gl_FragCoord.xy);
  float x = 0.0;
  for (int k = 0; k < 32; k++) { float b = texelFetch(u_table, ivec3(P, k), 0).r; x += b * b * u_tmax / 32.0; }
  outAo = vec4(round(255.0 * x / (1.0 + x)) / 255.0, 0.0, 0.0, 1.0);
}`;
