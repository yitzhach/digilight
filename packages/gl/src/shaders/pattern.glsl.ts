// pattern.glsl.ts — tool:pattern (BUILD.md §5.12.5): core's tools/pattern.ts in GLSL, spliced
// into light.glsl.ts's FRAGMENT before lightingAt. Uses its smoothstep0 and (declared here,
// defined below it) pcg.

import { PATTERN_EDGE, PATTERN_FLOOR } from 'core';

export const PATTERN = `
uint pcg(uint v);
float patEdge(float x, float e) { return smoothstep0(-e, e, x); }
float patHash(float i, float j) { return float(pcg(uint(int(i)) + pcg(uint(int(j))))) / 4294967296.0; }
float patNoise(vec2 x) {
  vec2 i = floor(x), f = x - i, s = f * f * (3.0 - 2.0 * f);
  float top = mix(patHash(i.x, i.y), patHash(i.x + 1.0, i.y), s.x);
  float bot = mix(patHash(i.x, i.y + 1.0), patHash(i.x + 1.0, i.y + 1.0), s.x);
  return top + (bot - top) * s.y;
}
float patternAt(float kind, vec2 pq, float soft) {
  float e = ${PATTERN_EDGE} * soft, p = pq.x, q = pq.y;
  if (kind < 1.5) { // window
    float dp = 0.5 * (0.5 - abs(fract(2.0 * p) - 0.5)), dq = 0.5 * abs(fract(2.0 * q) - 0.5);
    return patEdge(0.5 - abs(p), e) * patEdge(0.75 - abs(q), e) * patEdge(dp - 0.04, e) * patEdge(dq - 0.04, e);
  }
  if (kind < 2.5) return patEdge(0.25 * (0.25 - abs(fract(4.0 * q) - 0.5)), e); // blinds
  float n = (patNoise(vec2(3.0 * p + 17.3, 3.0 * q + 5.1)) + 0.5 * patNoise(vec2(6.1 * p - 3.7, 6.1 * q + 11.9))
    + 0.25 * patNoise(vec2(12.3 * p + 7.7, 12.3 * q - 2.3))) / 1.75; // leaves
  return patEdge(n - 0.55, e);
}
// U, V: the basis (xyz) with the kind and the softness in w; La: the lamp's L and r0; sv: its beam
float patternFactor(vec4 U, vec4 V, bool sun, vec2 P, vec4 La, vec3 sv) {
  vec2 pq;
  if (sun) pq = vec2(dot(vec3(P, 1.0), U.xyz), dot(vec3(P, 1.0), V.xyz));
  else {
    vec3 D = vec3(P - La.xy, -La.z);
    float ds = dot(D, sv);
    if (!(ds > 0.0)) return 1.0;
    pq = (La.w / ds) * vec2(dot(D, U.xyz), dot(D, V.xyz));
  }
  return ${PATTERN_FLOOR} + ${1 - PATTERN_FLOOR} * patternAt(U.w, pq, V.w);
}
`;
