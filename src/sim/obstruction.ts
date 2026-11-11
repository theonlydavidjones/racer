import { LOA, V, type Vec } from '../core/math';
import { landAlong } from '../geo/shore';
import { HAIL_RESPONSE } from '../rules';

/**
 * Rule 20.1(a)'s "substantial course change". Neither the rules nor World Sailing's cases give a figure. Dave Perry,
 * Understanding the Racing Rules of Sailing through 2028 (US Sailing), on 20.1(a): "as my general guideline, a course
 * change of less than 10 degrees is not very 'substantial'", with any doubt going to the hailing boat. So: if bearing
 * away 10° clears the obstruction she sails round it; if it takes more, she may hail.
 */
export const SUBSTANTIAL_TURN = 10;
/** Her width either side of the centreline that has to clear the obstruction, m (half her 2.2 m beam, and a little). */
const HULL_SIDE = 1.8;
/**
 * Rule 20.1(a): how far ahead an obstruction is "soon", m. WS Case 54: she may hail when, to avoid it safely, she needs
 * to begin the whole process: the hailed boat's time to respond, her own to respond to that, and then to tack in a
 * seamanlike way and clear it. Two response times at her speed, and two and a half lengths to tack and get clear.
 */
export const hailRange = (v: number): number => 2.5 * LOA + Math.max(0, v) * 2 * HAIL_RESPONSE;
/**
 * Rule 20.1(a): is she "approaching an obstruction and will soon need to make a substantial course change to avoid it
 * safely"? An obstruction is anything solid she couldn't pass without changing course substantially (Definitions,
 * Obstruction): the Cityfront shore, the Wharf's piers and breakwaters, the marinas' docks, Alcatraz, Angel Island, the
 * Marin shore, Treasure Island. So: land within `soon` m on her heading, across her whole width (exactly, so a pier a
 * few metres wide counts), and still in her way if she bore away SUBSTANTIAL_TURN° (close-hauled she can't luff past
 * it; bearing away is the only way round it short of tacking). Returns how far ahead it is and where, or null.
 */
export function obstructionAhead(p: Vec, h: number, tack: 'S' | 'P', soon: number): { d: number; at: Vec } | null {
  const ray = (hd: number, len: number) => {
    const u = V(hd), n = { x: u.y, y: -u.x };
    let m = Infinity;
    for (const k of [0, -HULL_SIDE, HULL_SIDE]) { const a = { x: p.x + n.x * k, y: p.y + n.y * k }; m = Math.min(m, landAlong(a, { x: a.x + u.x * len, y: a.y + u.y * len })); }
    return m;
  };
  const d = ray(h, soon);
  if (d > soon) return null;
  // bearing away turns her from the wind: to port on starboard tack, to starboard on port
  if (ray(h + (tack === 'S' ? -SUBSTANTIAL_TURN : SUBSTANTIAL_TURN), 4 * soon) === Infinity) return null;
  const u = V(h);
  return { d, at: { x: p.x + u.x * d, y: p.y + u.y * d } };
}
