import type { Tack } from '../boat/boat';
import { wrap } from '../core/math';

/**
 * One recorded instant: each boat as [x, y, heading, tack, boom angle]; and in the race track (trackSnapshot) also:
 * - shift: how far the wind she feels is from her own ~1 min mean (Boat.avgFrom), + headed, − lifted on her tack (as
 *   her compass would call it), so the debrief can say "she tacked on an 8° header";
 * - wind: the true wind she feels (off the water), the direction it's from, so the debrief can measure gains across the
 *   mean wind and tell a tack from a gybe;
 * - pen: 1 while she's doing penalty turns (RRS 44.2), whose tacks and gybes aren't tactical;
 * - cx, cy: the current under her (m/s, the way it flows), for the tactical debrief's "less tide than the fleet";
 * - air: the share of the wind she has after other boats' and ships' wind shadows and the lee of the land
 *   (Boat.shadowK, world.ts shadowAt: 1 = clear air), so the debrief can weigh everyone's dirty air, not just yours.
 */
export type BoatSnap = [x: number, y: number, h: number, tack: Tack, boom: number, shift?: number, wind?: number, pen?: number, cx?: number, cy?: number, air?: number];
export interface Frame { t: number; b: BoatSnap[] }

export const RECORD_EVERY_STEPS = 6; // 0.1 s at 60 Hz
export const RECORD_KEEP = 450; // 45 s of history (incident replays use the last 10 s, start replays the last 45 s)

export const snapshot = (t: number, boats: { x: number; y: number; h: number; tack: Tack; boom: number }[]): Frame =>
  ({ t, b: boats.map(b => [b.x, b.y, b.h, b.tack, b.boom]) });

/** A frame of the race track: as snapshot(), with each boat's wind shift. */
export const trackSnapshot = (t: number, boats: { x: number; y: number; h: number; tack: Tack; boom: number; ww: { from: number }; avgFrom?: number; penalty: number; cur?: { x: number; y: number }; shadowK?: number }[]): Frame =>
  ({ t, b: boats.map(b => { const dev = wrap(b.ww.from - (b.avgFrom ?? b.ww.from)); return [b.x, b.y, b.h, b.tack, b.boom, Math.round((b.tack === 'S' ? -dev : dev) * 10) / 10, Math.round(b.ww.from * 10) / 10, b.penalty > 0 ? 1 : 0, Math.round((b.cur?.x ?? 0) * 100) / 100, Math.round((b.cur?.y ?? 0) * 100) / 100, Math.round((b.shadowK ?? 1) * 100) / 100]; }) });

/** The whole race, for the race replay: every boat once a second, from TRACK_FROM s before the gun to the end. */
export const TRACK_EVERY_STEPS = 60;
export const TRACK_FROM = -30;
