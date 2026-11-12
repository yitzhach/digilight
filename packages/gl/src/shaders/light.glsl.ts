// light.glsl.ts — the preview's one pass: BUILD.md §5.3 to §5.5 in float32, with Texture (relief:
// rel, sh, occl, sheen) when its maps are ready. It mirrors core's light.ts lightingAt and tone.ts
// toneMap line for line; the lamps (and, with relief, the suns) arrive already prepared by core's
// prepareLighting (colours carry the white-adapt factor).

/** Most lights a document holds (§6), so the uniform arrays are this long. */
export const MAX_LAMPS = 8;
/** vec4s per lamp in u_lamp (see packLamps in preview.ts). */
export const LAMP_VEC4S = 5;

export const VERTEX = `#version 300 es
void main() {
  // One triangle that covers the screen.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_photo;
uniform vec2 u_target;   // size of what is drawn, in pixels
uniform float u_aspect;  // a = H / W of the picture
uniform float u_scale;   // target pixels per picture width
uniform vec2 u_centre;   // the picture point (picture widths) at the target's centre
uniform bool u_unit;     // E is exactly (1, 1, 1) everywhere: show the photo as it is
uniform vec3 u_base;     // ambient and suns, white-adapted
uniform float u_kappa;   // protect whites (5.7)
uniform float u_protect; // tone.highlightProtect
uniform int u_lamps;
uniform vec4 u_lamp[${MAX_LAMPS * LAMP_VEC4S}];
uniform bool u_relief;   // Texture on and its maps ready
uniform sampler2D u_slopes;          // RG16F: hHat slopes p, q per picture width
uniform highp sampler2DArray u_horizon; // R8 x 32: the horizon table (5.6)
uniform sampler2D u_aoTex;           // R8: hollows
uniform float u_rAspect; // relief width / height
uniform float u_tmax, u_depth, u_shadows, u_ao, u_sheen, u_sharp;

out vec4 outColour;

float smoothstep0(float a, float b, float x) { // core's smoothstep, defined when b <= a
  if (!(b > a)) return x < a ? 0.0 : 1.0;
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 decode(vec3 v) { // the sRGB curve (Display P3 shares it)
  return mix(v / 12.92, pow((v + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), v));
}
vec3 encode(vec3 v) {
  v = clamp(v, 0.0, 1.0);
  return mix(v * 12.92, 1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), v));
}

const float PI = 3.141592653589793;
float horizonAt(vec2 uv, float f) { // f: direction in layers, [0, 32)
  float k0 = floor(f), t = f - k0, k1 = mod(k0 + 1.0, 32.0);
  float a = texture(u_horizon, vec3(uv, k0)).r, b = texture(u_horizon, vec3(uv, k1)).r;
  float ta = a * a * u_tmax, tb = b * b * u_tmax;
  return ta + (tb - ta) * t;
}

vec3 lightingAt(vec2 P, out vec3 S) {
  vec3 E = u_base, n = vec3(0.0, 0.0, 1.0);
  vec2 ruv = vec2(P.x, P.y * u_rAspect);
  S = vec3(0.0);
  if (u_relief) {
    vec2 pq = texture(u_slopes, ruv).rg;
    float bo = texture(u_aoTex, ruv).r, x = bo / (bo < 1.0 ? 1.0 - bo : 1e-12), xd = 2.0 * u_depth * x;
    E *= 1.0 - u_ao * xd / (1.0 + xd);
    n = normalize(vec3(-u_depth * pq, 1.0));
  }
  for (int i = 0; i < ${MAX_LAMPS}; i++) {
    if (i >= u_lamps) break;
    vec4 a = u_lamp[i * ${LAMP_VEC4S}];     // Lx, Ly, Lz, r0 (a sun: its direction)
    vec4 b = u_lamp[i * ${LAMP_VEC4S} + 1]; // l0z, falloff, intensity, spot
    vec4 s = u_lamp[i * ${LAMP_VEC4S} + 2]; // sx, sy, sz, sun
    vec4 c = u_lamp[i * ${LAMP_VEC4S} + 3]; // cosOuter, cosInner, size, a sun's horizon layer
    vec3 col = u_lamp[i * ${LAMP_VEC4S} + 4].rgb;
    vec3 l;
    float e, omega, lam = 1.0;
    if (s.w > 0.5) {
      l = a.xyz; e = b.z; omega = c.z;
    } else {
      vec3 D = vec3(a.x - P.x, a.y - P.y, a.z);
      float d = length(D);
      float q = a.w / d;
      float fall = 1.0 + (q * q - 1.0) * b.y;
      lam = min(D.z / d / b.x, 8.0);
      e = b.z * fall * lam;
      if (b.w > 0.5) e *= smoothstep0(c.x, c.y, -dot(D, s.xyz) / d);
      l = D / d; omega = c.z / d;
    }
    if (u_relief) {
      float w = min(omega, 0.5);
      float rel = clamp(max(dot(n, l) + w, 0.0) / (l.z + w), 0.0, 4.0);
      float tanE = l.z / max(length(l.xy), 1e-6);
      float f = c.w;
      if (s.w < 0.5) { f = 32.0 * atan(-l.y, l.x) / (2.0 * PI); if (f < 0.0) f += 32.0; if (f >= 32.0) f -= 32.0; }
      float T = u_depth * horizonAt(ruv, f);
      float pw = max(omega, 0.004) * (1.0 + tanE * tanE);
      float sh = 1.0 - u_shadows * (1.0 - smoothstep0(-pw, pw, tanE - T));
      if (u_sheen > 0.0) {
        float cs = max(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0);
        if (cs > 0.0 && lam > 0.0) S += u_sheen * (e / lam) * sh * pow(cs, u_sharp) * col;
      }
      e *= rel * sh;
    }
    E += e * col;
  }
  return E;
}

vec3 toneMap(vec3 c, vec3 E, vec3 S) {
  vec3 lit = c * E + S;
  float Y = luma(c), Ylit = luma(lit);
  if (Y < 1e-6 || !(Ylit > 0.0)) return clamp(lit, 0.0, 1.0);
  float gain = Ylit / Y;
  float Yl = min(Ylit, 1.0);
  float Yp = gain <= 1.0 ? Ylit : Y >= 1.0 ? 1.0 : Y + (Y * (1.0 - Y) * (gain - 1.0)) / (1.0 - 2.0 * Y + Y * gain);
  float Yo = Yl + (Yp - Yl) * u_protect;
  lit *= Yo / Ylit;
  float m = max(lit.r, max(lit.g, lit.b));
  if (m > 1.0) lit = Yo + (lit - Yo) * ((1.0 - Yo) / (m - Yo));
  return max(lit, 0.0);
}

void main() {
  // Picture point of this pixel (5.1: x right, y down, in picture widths).
  vec2 f = vec2(gl_FragCoord.x, u_target.y - gl_FragCoord.y);
  vec2 P = u_centre + (f - 0.5 * u_target) / u_scale;
  vec2 uv = vec2(P.x, P.y / u_aspect);
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) { outColour = vec4(0.0); return; }
  vec4 px = texture(u_photo, uv);
  if (u_unit) { outColour = px; return; }
  vec3 S;
  vec3 E = lightingAt(P, S) * u_kappa;
  S *= u_kappa;
  if (all(equal(E, vec3(1.0))) && all(equal(S, vec3(0.0)))) { outColour = px; return; }
  outColour = vec4(encode(toneMap(decode(px.rgb), E, S)), px.a);
}`;
