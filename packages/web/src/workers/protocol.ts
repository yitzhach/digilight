// protocol.ts — messages between the app and the render workers.
import type { Blurred, Channels, Doc, Height, HorizonInput, Image, Region } from 'core';

export type Request =
  | { type: 'photo'; data: Uint8ClampedArray; width: number; height: number }
  | { type: 'render'; id: number; doc: Doc; width: number; region: Region; kappa: number }
  | { type: 'thumbs'; id: number; doc: Doc; width: number; flip: boolean }
  // Texture (relief/*.ts in core): the height, then Tmax and the table split by direction.
  // The estimate in stages across the workers (shared memory): rows of the photo at relief size,
  // rows of the channels, one blur each, rows of the raw height; then hHat and the pyramid.
  | { type: 'relief-thumb'; id: number; out: Uint8ClampedArray; width: number; height: number; y0: number; y1: number }
  | { type: 'relief-chan'; id: number; img: Image; ch: Channels; y0: number; y1: number }
  | { type: 'relief-blur'; id: number; src: Float32Array; width: number; height: number; sigma: number; out: Float32Array }
  | { type: 'relief-raw'; id: number; ch: Channels; bl: Blurred; width: number; raw: Float32Array; y0: number; y1: number }
  | { type: 'relief-height'; id: number; shared: boolean; raw?: { data: Float32Array; width: number; height: number } }
  | { type: 'relief-input'; height: Height; inp: HorizonInput }
  | { type: 'relief-tmax'; id: number; k0: number; k1: number }
  | { type: 'relief-layers'; id: number; k0: number; k1: number; tmax: number; table: Uint8Array | null }
  | { type: 'relief-ao'; id: number; tmax: number; ao: Uint8Array | null }
  | { type: 'relief-maps'; table: Uint8Array | null; ao: Uint8Array | null; tmax: number };

export type Reply =
  | { type: 'pixels'; id: number; data: Uint8ClampedArray }
  | { type: 'thumb'; id: number; look: string; data: Uint8ClampedArray; width: number; height: number }
  | { type: 'height'; id: number; height: Height; inp: HorizonInput }
  | { type: 'value'; id: number; value: number }
  | { type: 'done'; id: number }
  | { type: 'error'; id: number; message: string };
