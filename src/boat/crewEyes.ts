import { D2R, clamp, wrap } from '../core/math';
import type { Puff, Puffs } from '../environment/wind';
import type { Boat } from './boat';
import { allAboard, attrOf, reactTime } from './crewPhys';

/**
 * The crew's eyes: every one of them a lookout for puffs and lulls coming down the course, and their calls.
 *
 * The owner, who races a Folkboat: "On most boats, the skipper will insist that it's every crew member's job to call
 * puffs, because you need eyes everywhere and the skipper can't be looking at the water all the time. Plus, the skipper
 * can't see past the sails … also true on Folkboats." A puff is "usually spotted a good 50 yards out, but it's not
 * especially useful if the puff is more than 10 seconds away to call the puff. But it's useful if the puff is far away
 * to announce to the skipper, I see some wind over there, if we're trying to find wind to steer to." So two kinds of
 * call: the imminent one ("puff in 3, 2, 1"), within about 10 s, for the trim and the steering; and the far one, "wind
 * over there", for the strategy.
 *
 * A call says what Sailing World's "Quick Tips: Puff Talk" (2017) lists: lift or header, how much more wind, how long it
 * will last, and when it will hit (a countdown). Here it's worked out from the sim's own puffs (environment/wind.ts
 * Puffs: streaks carried downwind at a bit less than the wind's speed), as the lookout would judge them: the puff's
 * edge and drift against the boat's own course and speed. Nothing is known that isn't on the water to be seen.
 *
 * What each person sees: how far off (their `eyes`: a club crew spots a typical puff about 50 yards out, the owner's
 * figure; an expert more than twice that, a novice under half; weak puffs closer, lulls a little closer than puffs),
 * not past the sails (to leeward of them, from the windward side: the helm's view is blocked from the bow round to
 * abeam, a crew member's forward of the beam where the jib is), and not every one (a novice misses some: a fixed draw
 * per puff and person). The call goes out after the caller's reaction time, and the others hear it. No study measures
 * any of this for sailors (the researchers found none): the ranges and odds are estimates, labelled as such.
 */

/** One call from the crew (b.calls). */
export interface PuffCall {
  kind: 'puff' | 'lull';
  /** Seconds until it reaches her (0: she's in it). */
  in: number;
  /** How long she'll be in it (s). */
  lasts: number;
  /** The wind in it against the wind now (1.2: a fifth more). */
  strength: number;
  /** Its turn of the wind (deg, + veered: clockwise), and what that is to her on the wind: + a lift, − a header. */
  veer: number; lift: number;
  /** Where it is from her (deg true) and how far its edge is (m). */
  bearing: number; dist: number;
  /** Who called it (an index into [helm, crew…]). */
  who: number;
  /** A far call ("wind over there", for the strategy), not one to trim or steer to yet. */
  far: boolean;
  /** Which puff (stable while it lasts). */
  id: number;
}

/** A typical puff seen by a club crew, m: the owner's "a good 50 yards out". */
export const SPOT_RANGE = 46;
/** The imminent call's window (s): the owner's "not especially useful if the puff is more than 10 seconds away". */
export const CALL_WINDOW = 10;
/** How much further off they see the pressure for a far call (an estimate: across the course, a few hundred metres). */
const FAR = 4;
/** The scaled ellipse (Puffs.weight's d² = 0.5) a sailor would call the puff's edge: about where it's half strength. */
const EDGE2 = 0.5;
/** The streak's shape (environment/wind.ts PUFF_LONG, PUFF_WIDE). */
const LONG = 1.5, WIDE = 0.75;

/** How far (m) this person spots a typical puff: SPOT_RANGE for a club crew's eyes, doubling with every 0.3 better. */
export const spotRange = (eyes: number) => SPOT_RANGE * Math.pow(2, (eyes - 0.6) / 0.3);

/**
 * Whether the sails hide a bearing (deg, relative to her bow, + to starboard) from this person: to leeward of them from
 * the windward side. The helm, aft, sees nothing to leeward from just off the bow to abeam; a crew member forward, the
 * jib's sector, forward of the beam. Someone sitting to leeward sees all round. (Estimates from the rig's plan view.)
 * Exported for the skipper model: the helm's own view.
 */
export function sailsHide(b: Boat, who: number, rel: number): boolean {
  const c = b.crew, side = b.tack === 'S' ? 1 : -1; // (the wind over the starboard side: leeward is to port)
  const x = c?.people[who]?.x ?? side * 0.6;
  if (x * side < -0.1) return false; // (to leeward of the centreline: they see past)
  const lee = -side * rel; // (degrees off the bow toward the leeward side)
  return who === 0 ? lee > 5 && lee < 100 : lee > 20 && lee < 80;
}

/** A fixed draw in [0, 1) for a puff and a person (no randomness: the same race gives the same calls). */
function draw(id: number, who: number, k: number): number {
  let h = Math.imul(id ^ (who * 0x9e3779b1) ^ (k * 0x85ebca6b), 0x27d4eb2f); h ^= h >>> 15; h = Math.imul(h, 0x165667b1); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
/** A puff's identity while it lasts (Puffs reuses its cells: a new one has a new size, life and strength). */
const idOf = (c: Puff) => (Math.round(c.r * 1000) * 73856093) ^ (Math.round(c.life * 1000) * 19349663) ^ (Math.round(c.amp * 1e6) * 83492791);

/**
 * Look round (once a second): each person aboard checks the water for puffs and lulls coming to her, and the calls
 * (b.calls) are what the crew have called by now, soonest first. `clock`: the race clock (s).
 */
export function crewLook(b: Boat, puffs: Puffs, clock: number): void {
  const ppl = b.crew ? (b.crew.ppl ??= allAboard(b.crew.spec)) : null;
  const n = ppl ? ppl.length : 1;
  const vb = b.v, hb = b.h * D2R, bx = Math.sin(hb) * vb, by = Math.cos(hb) * vb, side = b.tack === 'S' ? 1 : -1;
  const seen = b.seenPuffs ??= new Map<number, { t0: number; who: number }>();
  const eyes = ppl ? ppl.map(p => attrOf(p, 'eyes')) : [0.6];
  const ranges = eyes.map(spotRange), maxR = Math.max(...ranges) * FAR;
  const calls: PuffCall[] = [], live = new Set<number>();
  for (const c of puffs.cells) {
    const env = Math.sin(Math.PI * c.age / c.life), a = c.amp * puffs.gustiness * env;
    if (Math.abs(a) < 0.03) continue; // (nothing to see yet, or any more)
    const dx = b.x - c.x, dy = b.y - c.y, d = Math.hypot(dx, dy);
    const A = c.r * LONG, B = c.r * WIDE;
    if (d - A > maxR) continue;
    // where she is, and how she moves, against the puff: in its own frame, scaled by its half-length and half-width
    const ux = c.dx ?? puffs.dir.x, uy = c.dy ?? puffs.dir.y, vp = c.v ?? 0;
    const pa = (dx * ux + dy * uy) / A, pb = (dx * uy - dy * ux) / B;
    const rvx = bx - ux * vp, rvy = by - uy * vp, va = (rvx * ux + rvy * uy) / A, vbb = (rvx * uy - rvy * ux) / B;
    const vv = va * va + vbb * vbb, pv = pa * va + pb * vbb, pp = pa * pa + pb * pb;
    let tIn: number, tOut: number;
    if (pp <= EDGE2) { tIn = 0; tOut = vv > 1e-9 ? (-pv + Math.sqrt(Math.max(0, pv * pv - vv * (pp - EDGE2)))) / vv : 60; }
    else {
      const disc = pv * pv - vv * (pp - EDGE2);
      if (vv < 1e-9 || disc <= 0) continue; // (it'll pass her by)
      tIn = (-pv - Math.sqrt(disc)) / vv; tOut = (-pv + Math.sqrt(disc)) / vv;
      if (tIn < 0) continue; // (gone by)
    }
    // how deep she'll go into it: its strength where her track passes nearest its middle
    const tMid = vv > 1e-9 ? clamp(-pv / vv, tIn, tOut) : tIn, ma = pa + va * tMid, mb = pb + vbb * tMid, depth = (1 - Math.min(1, ma * ma + mb * mb)) ** 2;
    const strength = 1 + a * depth;
    const veer = a > 0 ? a * depth * 30 : a * depth * 12; // (as Puffs.at: a full puff veers ~9°, a deep lull backs ~3°)
    const edge = Math.max(0, d - Math.sqrt(EDGE2) * (A + B) / 2);
    const brg = (Math.atan2(c.x - b.x, c.y - b.y) / D2R + 360) % 360, rel = wrap(brg - b.h);
    const id = idOf(c);
    // who sees it: within their range for a puff this strong (weak ones closer; lulls, pale water, a little closer
    // still), not hidden by the sails, and not one they miss
    const vis = clamp(Math.abs(a) / 0.15, 0.3, 1.3) * (a < 0 ? 0.8 : 1);
    let who = -1;
    for (let i = 0; i < n; i++) {
      const far = tIn > CALL_WINDOW, R = ranges[i] * vis * (far ? FAR : 1);
      if (edge > R) continue;
      if (b.crew && sailsHide(b, i, rel)) continue;
      if (draw(id, i, 1) < 0.4 * (1 - eyes[i])) continue;
      who = i; break;
    }
    if (who < 0) continue;
    live.add(id);
    let s = seen.get(id);
    if (!s) { s = { t0: clock, who }; seen.set(id, s); }
    // (called after the caller's reaction time; how good their judgement of the timing is goes with their eyes)
    const caller = ppl ? ppl[s.who] : null;
    if (clock - s.t0 < (caller ? reactTime(caller) : 0.9)) continue;
    const off = 1 + (1 - eyes[s.who]) * 0.3 * (2 * draw(id, s.who, 2) - 1);
    calls.push({ kind: a > 0 ? 'puff' : 'lull', in: tIn * off, lasts: tOut - tIn, strength, veer, lift: side * veer, bearing: brg, dist: edge, who: s.who, far: tIn > CALL_WINDOW, id });
  }
  for (const id of seen.keys()) if (!live.has(id)) seen.delete(id);
  calls.sort((p, q) => p.in - q.in);
  b.calls = calls.slice(0, 6);
}
