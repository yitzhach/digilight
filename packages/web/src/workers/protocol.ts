// protocol.ts — messages between the app and the render workers.
import type { Doc, Region } from 'core';

export type Request =
  | { type: 'photo'; data: Uint8ClampedArray; width: number; height: number }
  | { type: 'render'; id: number; doc: Doc; width: number; region: Region; kappa: number }
  | { type: 'thumbs'; id: number; doc: Doc; width: number; flip: boolean };

export type Reply =
  | { type: 'pixels'; id: number; data: Uint8ClampedArray }
  | { type: 'thumb'; id: number; look: string; data: Uint8ClampedArray; width: number; height: number }
  | { type: 'done'; id: number }
  | { type: 'error'; id: number; message: string };
