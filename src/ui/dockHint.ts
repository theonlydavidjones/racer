import type { SimView } from '../sim/host';

/** Slow enough to be coming in to a berth, m/s (2 kt; an ESTIMATE: faster, she's still under way). */
export const DOCK_HINT_SPEED = 1.0;
/**
 * Coming in, slow, by a free berth (her own slip from its fairway: world.ts freeBerthsNear), her lines not yet ready: the
 * hint by her, the key and what it does (the owner, 18 Nov 2026: the tie-up option was only in the Crew panel, and
 * "never appeared" coming home). Null when it's no use.
 */
export function dockHint(w: SimView, key: string): string | null {
  const u = w.user;
  if (!w.running || !w.cruising || u.docked || u.handled || u.mooring || key === 'none' || Math.hypot(u.vx, u.vy) > DOCK_HINT_SPEED || !w.freeBerthsNear(u).length) return null;
  return `${key} · lines ready`;
}
