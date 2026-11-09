import type { Tack } from '../boat/boat';

/** One recorded instant: each boat as [x, y, heading, tack, boom angle]. */
export type BoatSnap = [x: number, y: number, h: number, tack: Tack, boom: number];
export interface Frame { t: number; b: BoatSnap[] }

export const RECORD_EVERY_STEPS = 6; // 0.1 s at 60 Hz
export const RECORD_KEEP = 160; // 16 s of history

export const snapshot = (t: number, boats: { x: number; y: number; h: number; tack: Tack; boom: number }[]): Frame =>
  ({ t, b: boats.map(b => [b.x, b.y, b.h, b.tack, b.boom]) });
