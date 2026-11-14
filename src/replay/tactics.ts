import { sub, unit, type Vec } from '../core/math';
import { SHIFT_DEG } from '../sim/debrief';
import { manoeuvreS } from '../sim/routing';
import type { Frame } from './recorder';

/**
 * The tactical debrief, leg by leg (the owner's design, 13 Nov 2026: visual first, a takeaway of a few words a leg):
 * every boat's time on each leg against the fleet's middle (the median boat), the leg's best and the ideal (the
 * strategist's planned time: a perfect sail), and where your seconds went against the middle, by cause.
 *
 * The causes, each in seconds against the fleet's middle on that leg (+ lost), from the race's own 1 Hz track. Each is
 * measured for every boat the same way and yours is set against the fleet's median of it (not one "middle boat": the
 * median of each measure), as a rate over your own time on the leg, so a slower boat isn't charged for being out longer:
 * - **start**: its own row: your crossing against the middle boat's, seconds after the gun (a start in traffic, late
 *   or buried, costs here, not on the first beat);
 * - **shifts** (beats): the time sailed on a header past SHIFT_DEG held more than 15 s (as sim/debrief.ts gates it), at
 *   the sim's own rate: on a header of θ° progress is cos(β+θ)/cos(β−θ) of the other tack's;
 * - **tide**: the current along the leg: with the fleet's current instead of yours, at the same speed through the water,
 *   your time would have been D/(VMG + Δc), so the cost is T·Δc/(VMG + Δc);
 * - **clear air**: the wind lost to other boats' and ships' shadows and the lee of the land (the track's `air`), at the
 *   race log's rate, 1 − k^0.7 of a second each second (sim/debrief.ts);
 * - **tacks & gybes**: the extra tacks (gybes on a run) beyond the fleet's median, at a good one's cost for the wind
 *   (sim/routing.ts manoeuvreS, the boat's own physics), plus what each of yours cost past a good one (the race log);
 * - **penalties**: the time spent doing penalty turns, against the fleet's;
 * - **laylines**: past the layline, as the race log measured it for you alone (the fleet's overstanding isn't measured):
 *   against a boat that loses nothing to it;
 * - **speed & other**: the rest of your difference from the middle: boat speed, trim, puffs, cross-current, roundings.
 * Side of the course isn't a cause of its own: it pays or costs through the wind and the current, which are counted
 * above; so it's shown as where you sailed (left, middle, right), not as seconds.
 */

export type Cause = 'start' | 'shifts' | 'tide' | 'laylines' | 'clearAir' | 'manoeuvres' | 'penalty' | 'other';
export const CAUSES: { key: Cause; label: string; color: string }[] = [
  { key: 'start', label: 'Start', color: '#d98cc0' },
  { key: 'shifts', label: 'Shifts', color: '#56b4e9' },
  { key: 'tide', label: 'Tide', color: '#1fbf8f' },
  { key: 'laylines', label: 'Laylines', color: '#c77dff' },
  { key: 'clearAir', label: 'Clear air', color: '#e69f00' },
  { key: 'manoeuvres', label: 'Tacks & jibes', color: '#f0e442' },
  { key: 'penalty', label: 'Penalties', color: '#9a7b5f' }, // (brown: clear of the boats' own reds)
  { key: 'other', label: 'Speed & other', color: '#94abb7' }
];

export interface TacBoat { id: number; name: string; color: string; start: number | null; marks: (number | null)[]; finishT: number | null }
export interface TacIn {
  frames: Frame[];
  you: number;
  boats: TacBoat[];
  /** Each leg: from where to where, its point of sail, and the planned (ideal) time, s (null if not planned). */
  legs: { name: string; from: Vec; to: Vec; kind: 'beat' | 'reach' | 'run'; ideal: number | null }[];
  /** Your close-hauled angle, deg (the header-loss sum). */
  beat: number;
  /** The wind, kt, and the sea, m (a good tack's cost: sim/routing.ts manoeuvreS). */
  tws: number; hs?: number;
  /** What the race log measured for you, by leg (0-based): seconds past the layline, and what each tack or gybe cost. */
  logged: { laylines: number; tacks: number[] }[];
}
export interface TacRow {
  /** 0 = the start; 1… the legs. */
  i: number; name: string; kind: 'start' | 'beat' | 'reach' | 'run';
  /** Each boat's time on the leg (the start: seconds after the gun she crossed), by id; null if she didn't sail it. */
  times: (number | null)[];
  mid: number; best: { id: number; t: number }; ideal: number | null;
  /** Your time minus the middle's (+ lost). */
  vsMid: number;
  /** Your seconds against the middle, by cause (+ lost, − gained); they add up to vsMid. */
  causes: Partial<Record<Cause, number>>;
  /** Where you sailed against the fleet: 'left' / 'right' looking up (or down) the leg, or 'middle'. */
  side: 'left' | 'middle' | 'right' | null;
  /** A few words on the leg, and its number (vsMid). */
  take: string;
  /** When you sailed the leg (race time), for the replay. */
  t0: number; t1: number;
}
export interface Tactics { rows: TacRow[]; top: { cause: Cause; s: number; words: string }[]; idealTotal: number | null }

const median = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return !s.length ? 0 : s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

/** A header held this long before it counts (sim/debrief.ts: the time to see it and tack). */
const HEADER_GRACE = 15;
/**
 * One boat over one leg, from the track: the mean current along the leg under her (m/s, + helping), her mean offset
 * across it (+ left of the line from→to), and seconds lost to headers held (beats), to dirty air, and doing penalty
 * turns; and her tacks (or gybes): flips of tack outside penalty turns.
 */
function underHer(F: Frame[], id: number, t0: number, t1: number, from: Vec, u: Vec, beat: number | null) {
  let c = 0, o = 0, n = 0, hdr = 0, held = 0, air = 0, pen = 0, flips = 0, tack: string | null = null;
  for (const f of F) {
    if (f.t < t0 || f.t > t1) continue;
    const p = f.b[id]; if (!p) continue;
    if (p[8] != null && p[9] != null) c += p[8] * u.x + p[9] * u.y;
    o += u.x * (p[1] - from.y) - u.y * (p[0] - from.x); n++;
    if (p[10] != null && p[10] < 0.97) air += 1 - p[10] ** 0.7; // (the race log's rate and threshold: sim/debrief.ts)
    if (p[7] === 1) { pen++; held = 0; tack = p[3]; continue; } // (the circles' tacks and headers aren't tactical)
    if (tack != null && p[3] !== tack) { flips++; held = 0; }
    tack = p[3];
    const th = p[5];
    if (beat == null || th == null || th <= SHIFT_DEG) { held = 0; continue; }
    if (++held > HEADER_GRACE) hdr += Math.max(0, Math.min(0.5, 1 - Math.cos((beat + th) * Math.PI / 180) / Math.cos((beat - th) * Math.PI / 180)));
  }
  return { cur: n ? c / n : 0, off: n ? o / n : 0, n, hdr, air, pen, flips };
}

const WORDS: Record<Cause, [string, string]> = {
  // [the leg's takeaway when it cost you, the race's]
  start: ['Late off the line', 'Late off the start'],
  shifts: ['Held headers too long', 'Headers held too long'],
  tide: ['Less tide than the fleet', 'Sailed in worse current'],
  penalty: ['Penalty turns', 'Penalty turns'],
  laylines: ['Overstood the layline', 'Overstood the laylines'],
  clearAir: ['Sailed in dirty air', 'Time in dirty air'],
  manoeuvres: ['Too many or slow tacks', 'Tacks and jibes'],
  other: ['Slower through the water', 'Speed and the rest']
};
const SHORT: Record<Cause, string> = { start: 'the start', shifts: 'headers', tide: 'the tide', laylines: 'the layline', clearAir: 'dirty air', manoeuvres: 'tacks', penalty: 'a penalty', other: 'speed' };

/** The leg's takeaway, in a few words: what cost most, or that it went well and what still cost. */
function takeaway(vsMid: number, causes: Partial<Record<Cause, number>>): string {
  const lost = (Object.entries(causes) as [Cause, number][]).filter(([, v]) => v >= 2).sort((a, b) => b[1] - a[1]);
  if (Math.abs(vsMid) <= 2) return lost[0] && lost[0][1] >= 10 ? `Even, but ${SHORT[lost[0][0]]} cost ${Math.round(lost[0][1])} s` : 'Even with the fleet';
  if (vsMid < -1) return lost[0] && lost[0][1] >= 5 ? `Gained, but ${SHORT[lost[0][0]]} cost ${Math.round(lost[0][1])} s` : 'Good leg';
  return lost[0] ? WORDS[lost[0][0]][0] : 'Even with the fleet';
}

export function tactics(I: TacIn): Tactics {
  const F = I.frames, me = I.you, rows: TacRow[] = [];
  const ids = I.boats.map(b => b.id), byId = new Map(I.boats.map(b => [b.id, b]));
  const ends = (b: TacBoat) => [b.start, ...I.legs.slice(0, -1).map((_, k) => b.marks[k] ?? null), b.finishT];
  // the start: when each crossed, after the gun
  const st = ids.map(id => byId.get(id)!.start);
  const stOk = st.filter((x): x is number => x != null);
  const you0 = byId.get(me)!.start;
  if (you0 != null && stOk.length) {
    const mid = median(stOk), bi = ids[st.indexOf(Math.min(...stOk))], vs = you0 - mid;
    rows.push({ i: 0, name: 'The start', kind: 'start', times: st, mid, best: { id: bi, t: Math.min(...stOk) }, ideal: 0, vsMid: vs,
      causes: { start: vs }, side: null, take: vs > 2 ? 'Late off the line' : vs < -2 ? 'Good start' : 'Even with the fleet', t0: Math.min(...stOk) - 30, t1: you0 });
  }
  I.legs.forEach((L, k) => {
    const times = I.boats.map(b => { const e = ends(b), a = e[k], z = e[k + 1]; return a != null && z != null ? z - a : null; });
    const ok = ids.map((id, j) => ({ id, t: times[j] })).filter((x): x is { id: number; t: number } => x.t != null);
    const yi = ids.indexOf(me), you = times[yi];
    // (a middle needs three boats to mean anything: with two, it's halfway between you and her, so wait for a third)
    if (you == null || ok.length < Math.min(3, ids.length)) return;
    const mid = median(ok.map(x => x.t)), best = ok.reduce((a, x) => x.t < a.t ? x : a), vsMid = you - mid;
    const u = unit(sub(L.to, L.from)), e = (id: number) => ends(byId.get(id)!);
    // each boat on this leg: the current under her, her side, her header loss
    const per = ok.map(x => { const E = e(x.id); return { id: x.id, t: x.t, ...underHer(F, x.id, E[k]!, E[k + 1]!, L.from, u, L.kind === 'beat' ? I.beat : null) }; });
    const mine = per.find(p => p.id === me)!, vmg = Math.hypot(L.to.x - L.from.x, L.to.y - L.from.y) / Math.max(1, you);
    // a rate (per second on the leg) against the fleet's median rate, over your time: what it cost you against the middle
    const vsFleet = (q: (p: typeof per[number]) => number) => (q(mine) / you - median(per.map(p => q(p) / Math.max(1, p.t)))) * you;
    const causes: Partial<Record<Cause, number>> = {};
    if (L.kind === 'beat') causes.shifts = vsFleet(p => p.hdr);
    const dc = median(per.map(p => p.cur)) - mine.cur; // how much more current the fleet had along the leg, m/s
    causes.tide = dc * you / Math.max(0.3, vmg + dc);
    causes.clearAir = vsFleet(p => p.air);
    // tacks: the extra ones (by the fleet's rate of tacking) at a good one's cost, and what yours cost past a good one
    const lg = I.logged[k] ?? { laylines: 0, tacks: [] }, good = manoeuvreS(L.kind === 'run' ? 'gybe' : 'tack', I.tws, I.hs ?? 0);
    causes.manoeuvres = vsFleet(p => p.flips) * good + lg.tacks.reduce((a, s) => a + Math.max(0, s - good), 0);
    if (mine.pen || median(per.map(p => p.pen))) causes.penalty = vsFleet(p => p.pen);
    if (lg.laylines) causes.laylines = lg.laylines;
    const named = Object.values(causes).reduce((a, v) => a + (v ?? 0), 0);
    causes.other = vsMid - named;
    for (const c of Object.keys(causes) as Cause[]) causes[c] = Math.round(causes[c]! * 10) / 10;
    // where you sailed: within 40 m (five lengths) or a quarter of the fleet's spread of the fleet's median line is "the middle"
    const midOff = median(per.map(p => p.off)), d = mine.off - midOff, spread = Math.max(40, (Math.max(...per.map(p => p.off)) - Math.min(...per.map(p => p.off))) / 4);
    const sideUp = L.kind === 'run' ? -1 : 1; // (left and right as you look up the course: on a run you look back up it)
    const side = Math.abs(d) < spread ? 'middle' : d * sideUp > 0 ? 'left' : 'right';
    const E = e(me);
    rows.push({ i: k + 1, name: L.name, kind: L.kind, times, mid, best, ideal: L.ideal, vsMid, causes, side, take: takeaway(vsMid, causes), t0: E[k]!, t1: E[k + 1]! });
  });
  // the race: the three causes that cost most, over all the legs (and the start)
  const tot: Partial<Record<Cause, number>> = {};
  for (const r of rows) for (const [c, v] of Object.entries(r.causes) as [Cause, number][]) if (v > 0) tot[c] = (tot[c] ?? 0) + v;
  const top = (Object.entries(tot) as [Cause, number][]).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cause, s]) => ({ cause, s: Math.round(s), words: WORDS[cause][1] }));
  const ideals = I.legs.map(l => l.ideal);
  return { rows, top, idealTotal: ideals.every(x => x != null) ? ideals.reduce((a, x) => a! + x!, 0) : null };
}
