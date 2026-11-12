// Handles.tsx — the lights on the picture and the gestures over it (§8): drag a handle to move
// its light (anywhere, also past the edge), drag the selected light's cross to aim it, scroll on
// a handle for brightness, double-click to switch it, wheel or pinch to zoom, drag to pan.
// A drag shows its document live (preview) and commits once on release: one undo step.

import type { Doc, Light } from 'core';
import { useRef } from 'preact/hooks';
import { cmd, photo, preview, run, selected, shown } from '../state.ts';
import { geo } from './Stage.tsx';
import { maxZoom, toPicture, toScreen, zoomAt, type Geometry } from './view.ts';

const R = 11, PAD = 14;
/** How far from its centre a handle answers: 22 px for a finger (§8), the drawn circle for a mouse. */
const HIT = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 22 : R;
const clampPos = (x: number) => Math.min(3, Math.max(-2, x));
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const withLight = (d: Doc, id: string, part: Partial<Light>): Doc =>
  ({ ...d, lights: d.lights.map((l) => (l.id === id ? { ...l, ...part } : l)) });

/** A sun has no place: its handle sits on a ring round the centre, toward where it shines from. */
function sunAt(g: Geometry, l: Light): [number, number] {
  const [cx, cy] = toScreen(g, 0.5, 0.5), r = Math.min(g.w, g.h) * 0.4, a = (l.azimuth * Math.PI) / 180;
  return [cx + Math.cos(a) * r, cy - Math.sin(a) * r];
}
function handleAt(g: Geometry, l: Light): [number, number] {
  const [x, y] = l.kind === 'sun' ? sunAt(g, l) : toScreen(g, l.pos[0], l.pos[1]);
  return [Math.min(g.w - PAD, Math.max(PAD, x)), Math.min(g.h - PAD, Math.max(PAD, y))];
}

type Drag =
  | { kind: 'light'; id: string; part: 'pos' | 'aim'; moved: boolean; last?: Partial<Light> }
  | { kind: 'pan'; x: number; y: number; pan: [number, number] };

export function Handles() {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, [number, number]>());
  const pinch = useRef(0);
  const wheelTimer = useRef(0);
  const d = shown.value!, g = geo.value;
  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const zoomMax = () => maxZoom(geo.value, photo.value!.image.width, window.devicePixelRatio || 1);

  function down(e: PointerEvent) {
    const t = (e.target as Element).closest('[data-light]');
    svg.current!.setPointerCapture(e.pointerId);
    const [x, y] = local(e);
    pointers.current.set(e.pointerId, [x, y]);
    if (pointers.current.size === 2) { drag.current = null; pinch.current = 0; return; }
    if (t) {
      const id = t.getAttribute('data-light')!, part = t.getAttribute('data-part') as 'pos' | 'aim';
      selected.value = id;
      drag.current = { kind: 'light', id, part, moved: false };
    } else drag.current = { kind: 'pan', x, y, pan: geo.value.pan };
  }

  function move(e: PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    const [x, y] = local(e);
    const ps = pointers.current;
    if (ps.size === 2) {
      const [a, b] = [...ps.values()] as [[number, number], [number, number]];
      ps.set(e.pointerId, [x, y]);
      const [a2, b2] = [...ps.values()] as [[number, number], [number, number]];
      const dist = Math.hypot(a2[0] - b2[0], a2[1] - b2[1]), was = pinch.current || Math.hypot(a[0] - b[0], a[1] - b[1]);
      pinch.current = dist;
      geo.value = zoomAt(geo.value, dist / was, (a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2, zoomMax());
      return;
    }
    ps.set(e.pointerId, [x, y]);
    const dr = drag.current, gg = geo.value;
    if (!dr) return;
    if (dr.kind === 'pan') {
      if (gg.zoom === 1) return;
      const [u0, v0] = toPicture(gg, dr.x, dr.y), [u1, v1] = toPicture(gg, x, y);
      geo.value = { ...gg, pan: [dr.pan[0] - (u1 - u0), dr.pan[1] - (v1 - v0)] };
      dr.x = x; dr.y = y; dr.pan = geo.value.pan;
      return;
    }
    const doc = shown.value!, l = doc.lights.find((k) => k.id === dr.id);
    if (!l) return;
    const [u, v] = toPicture(gg, x, y);
    let part: Partial<Light>;
    if (l.kind === 'sun' && dr.part === 'pos') {
      const [cx, cy] = toScreen(gg, 0.5, 0.5);
      const az = (Math.atan2(-(y - cy), x - cx) * 180) / Math.PI;
      part = { azimuth: Math.round((az + 360) % 360) };
    } else if (dr.part === 'pos') part = { pos: [round3(clampPos(u)), round3(clampPos(v)), l.pos[2]] };
    else part = { aim: [round3(clampPos(u)), round3(clampPos(v))] };
    dr.moved = true; dr.last = part;
    preview(withLight(doc, dr.id, part));
  }

  function up(e: PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    const dr = drag.current;
    drag.current = null;
    if (dr?.kind === 'light' && dr.moved && dr.last) run(() => cmd.updateLight(dr.id, dr.last!));
  }

  function wheel(e: WheelEvent) {
    e.preventDefault();
    const t = (e.target as Element).closest('[data-light]');
    if (t && !e.ctrlKey) {
      // Brightness: live while scrolling, one undo step when it stops.
      const id = t.getAttribute('data-light')!, doc = shown.value!, l = doc.lights.find((k) => k.id === id)!;
      const intensity = Math.round(Math.min(4, Math.max(0, l.intensity * Math.exp(-e.deltaY * 0.002))) * 100) / 100;
      preview(withLight(doc, id, { intensity }));
      clearTimeout(wheelTimer.current);
      wheelTimer.current = window.setTimeout(() => run(() => cmd.updateLight(id, { intensity })), 300);
      return;
    }
    const [x, y] = local(e);
    geo.value = zoomAt(geo.value, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), x, y, zoomMax());
  }

  function dbl(e: MouseEvent) {
    const t = (e.target as Element).closest('[data-light]');
    if (!t) return;
    const id = t.getAttribute('data-light')!, l = shown.value!.lights.find((k) => k.id === id);
    if (l) run(() => cmd.updateLight(id, { on: !l.on }));
  }

  const sel = d.lights.find((l) => l.id === selected.value);
  return (
    <svg class="handles" ref={svg} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onWheel={wheel} onDblClick={dbl} width={g.w} height={g.h}>
      {sel && sel.kind === 'lamp' && <Aim g={g} l={sel} />}
      {d.lights.map((l, i) => {
        const [x, y] = handleAt(g, l), on = l.id === selected.value;
        return (
          <g key={l.id} data-light={l.id} data-part="pos" class={`handle${on ? ' selected' : ''}${l.on ? '' : ' off'}`}>
            <title>{`Light ${i + 1}: drag to move, scroll for brightness, double-click to switch ${l.on ? 'off' : 'on'}`}</title>
            <circle cx={x} cy={y} r={HIT} class="hit" />
            <circle cx={x} cy={y} r={R} />
            <text x={x} y={y + 4} text-anchor="middle">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Aim({ g, l }: { g: Geometry; l: Light }) {
  const [hx, hy] = handleAt(g, l), [ax, ay] = toScreen(g, l.aim[0], l.aim[1]);
  return (
    <g class="aim">
      <line x1={hx} y1={hy} x2={ax} y2={ay} />
      <g data-light={l.id} data-part="aim">
        <title>Drag to aim this light</title>
        <circle cx={ax} cy={ay} r={Math.max(10, HIT)} class="hit" />
        <path d={`M${ax - 7} ${ay}H${ax + 7}M${ax} ${ay - 7}V${ay + 7}`} />
      </g>
    </g>
  );
}
