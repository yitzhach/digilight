// PatternBox.tsx — tool:pattern (BUILD.md §5.12.5, D-068): the selected light's pattern as a box
// on the picture while "Edit pattern" is on (Lights.tsx). Drag inside it to move the pattern, a
// corner to scale it, the right edge's handle to stretch it, the top edge's handle to slant it or
// change its height. Handles.tsx runs the drags (core's dragPattern); the turn stays a slider.

import { signal } from '@preact/signals';
import { patternExtent, patternPlane, shapeToPlane, type Light } from 'core';
import { toScreen, type Geometry } from './view.ts';

export const editingPattern = signal(false);

export function PatternBox({ g, l }: { g: Geometry; l: Light }) {
  const plane = patternPlane(l, g.aspect), [ex, ey] = patternExtent(l.pattern);
  const at = (sp: number, sq: number) => {
    const q = plane.toPicture(...shapeToPlane(l, sp, sq));
    return q ? toScreen(g, q[0], q[1] / g.aspect) : null;
  };
  const corners = [at(-ex, ey), at(ex, ey), at(ex, -ey), at(-ex, -ey)];
  if (corners.some((c) => !c)) return null; // a corner the lamp's rays never take to the wall
  const right = at(ex, 0), top = at(0, ey);
  const knob = (p: [number, number] | null, handle: string, title: string, shape: 'square' | 'circle') => p && (
    <g data-for={l.id} data-pattern={handle} class={`pattern-handle ${handle}`}>
      <title>{title}</title>
      <circle cx={p[0]} cy={p[1]} r={16} class="hit" />
      {shape === 'square' ? <rect x={p[0] - 6} y={p[1] - 6} width={12} height={12} /> : <circle cx={p[0]} cy={p[1]} r={7} />}
    </g>
  );
  return (
    <g class="pattern-box">
      <polygon data-for={l.id} data-pattern="move" points={corners.map((c) => c!.join(',')).join(' ')}>
        <title>Drag to move the pattern</title>
      </polygon>
      {corners.map((c, i) => <g key={i}>{knob(c, 'scale', 'Drag to make the pattern larger or smaller', 'square')}</g>)}
      {knob(right, 'stretch', 'Drag to stretch the pattern wider or narrower', 'circle')}
      {knob(top, 'top', 'Drag sideways to slant the pattern, up or down to change its height', 'circle')}
    </g>
  );
}
