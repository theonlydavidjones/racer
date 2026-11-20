import type { Boat } from '../boat/boat';

/**
 * The band's tab for hoisting or striking a sail at the mast (sailBand.ts .sb-hoist), its words, or null for no tab.
 * The rule (the owner, r247, 18 Nov 2026: "I should always see those if sails are down"): a sail that's down, or on its
 * way up or down, always has its tab while she's sailing, wherever she is (a slip, open water, after the chart's "Move
 * her here"); a sail that's up and hoisted has one only in a harbor, to strike it there.
 */
export function hoistTabWord(u: Pick<Boat, 'rig'>, k: 'main' | 'jib', running: boolean, inBasin: boolean): string | null {
  const r = u.rig, h = r ? r[k] : 1, up = r ? (k === 'main' ? r.mainUp : r.jibUp) : true;
  if (!running || (up && h >= 1 && !inBasin)) return null;
  return up ? (h < 1 ? `Hoisting ${k}…` : `Strike ${k}`) : h > 0 ? `Striking ${k}…` : `Hoist ${k}`;
}
