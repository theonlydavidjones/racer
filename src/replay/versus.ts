import { compassPoint } from '../core/compass';
import { V, brg, cross, sub, unit, type Vec } from '../core/math';
import type { Frame } from './recorder';
import { SHIFT_DEG } from '../sim/debrief';

/**
 * Your race against the boat that won (or, if you won, the boat that came second), leg by leg, from the replay's
 * once-a-second track and each boat's mark times. For each leg: how long each of you took, how much you lost or
 * gained, and where it went:
 * - **Distance:** you sailed further over the ground (more tacks, overstanding, a wider line). The extra metres cost the
 *   time they take at your own average speed on that leg.
 * - **Speed:** the rest of the difference is speed over the ground: boat speed, the current where each of you sailed,
 *   dirty air, the puffs.
 * - **Where:** how far apart your two lines were, on average, across the leg (by the compass), so you can see who
 *   went which way.
 * The start is its own row (who crossed first), so the rows add up to the gap at the finish.
 */

export interface LegVs {
  /** 0 = the start; then the legs, 1 … n (the last to the finish). */
  i: number;
  name: string;
  kind: 'beat' | 'reach' | 'run' | 'start';
  /** Your and their times on the leg, s (the start: seconds after the gun each crossed). */
  you: number; them: number;
  /** You minus them: + you lost, − you gained. */
  lost: number;
  /** Seconds of `lost` from sailing further, and from slower speed over the ground (they add up to `lost`). */
  fromDist: number; fromSpeed: number;
  /** Metres you sailed over the ground, and they did. */
  youM: number; themM: number;
  /** When you sailed the leg (race time), for the replay to jump to. */
  t0: number; t1: number;
  /** On average, how far their line lay from yours across the leg, m, and in which compass direction. */
  apartM: number; apartDir: string;
  /** The leg's big moments against her: each tack or gybe, the shifts, the mark at its end. */
  moments: VsMoment[];
}

/**
 * A moment on a leg where you lost or gained on her, in a line: `lostM` metres you lost (− gained) in distance made good
 * along the leg, over the same stretch of clock time (so you both sailed in the same wind); `t0`–`t1` that stretch.
 */
export interface VsMoment { leg: number; kind: 'tack' | 'mark'; t0: number; t1: number; lostM: number; text: string }

/** `won`: she won; `youWon`: you did; `youDone`: you've finished and both of you sailed every leg (the gap is the finish gap). */
export interface Versus { rival: number; rivalName: string; tie?: boolean; won: boolean; youWon: boolean; youDone: boolean; legs: LegVs[]; total: number; moments: VsMoment[] }

/**
 * Metres a boat sailed between two race times, from the track: each second's step over the ground counted only as far
 * as it went the way her bow pointed. Drift doesn't count as sailing further: set sideways or astern by the current,
 * or adrift in irons or becalmed, she covers ground without sailing it, and that time belongs to "slower" instead.
 * (The track has no current in it, so a current along her heading still counts: it's the best the track allows.)
 */
function sailed(F: Frame[], id: number, t0: number, t1: number): number {
  let m = 0, prev: [number, number, number] | null = null;
  for (const f of F) {
    if (f.t < t0 || f.t > t1) continue;
    const p = f.b[id]; if (!p) continue;
    if (prev) { const h = V((prev[2] + p[2]) / 2 + (Math.abs(p[2] - prev[2]) > 180 ? 180 : 0)); m += Math.max(0, (p[0] - prev[0]) * h.x + (p[1] - prev[1]) * h.y); }
    prev = [p[0], p[1], p[2]];
  }
  return m;
}

/** Mean signed distance of a boat's track from the leg's straight line (+ to the left, going from a to b). */
function meanOff(F: Frame[], id: number, t0: number, t1: number, a: Vec, u: Vec): number {
  let s = 0, n = 0;
  for (const f of F) {
    if (f.t < t0 || f.t > t1) continue;
    const p = f.b[id]; if (!p) continue;
    s += cross(u, sub({ x: p[0], y: p[1] }, a)); n++;
  }
  return n ? s / n : 0;
}

export interface VsInput {
  frames: Frame[];
  you: number;
  /** `points`: her race score (rules/scoring.ts; the Z flag's penalty added), null while still racing. */
  boats: { id: number; name: string; finishT: number | null; dsq: boolean; points?: number | null }[];
  /** Each boat's start crossing (race time, s), by id. */
  startTimes: (number | null)[];
  /** Each boat's mark times, by id (race time, s). */
  marks: number[][];
  /** The legs' ends: the line, then each mark, then the finish; and each leg's point of sail. */
  legs: { name: string; to: Vec; kind: 'beat' | 'reach' | 'run' }[];
  from: Vec;
  /** The finish line's ends, for how far back a boat was when the other finished. */
  finishLine?: [Vec, Vec];
}

/** Finishers in order of their score (lower first; a Z-flag boat's penalty counts, RRS 44.3(c)), then time across the line. */
const byScore = (a: VsInput['boats'][number], b: VsInput['boats'][number]) => (a.points != null && b.points != null ? a.points - b.points : 0) || a.finishT! - b.finishT!;

/**
 * Who to measure against: the winner; if that's you, the boat second; with nobody else finished (you won and the
 * fleet's still racing, or nobody's in yet), the one furthest on. (By points, as the results list them: a Z-flag boat first across may not have won.)
 */
export function rivalOf(I: VsInput): number | null {
  const ok = I.boats.filter(b => !b.dsq);
  const fin = ok.filter(b => b.finishT != null && b.id !== I.you).sort(byScore);
  if (fin.length) return fin[0].id;
  // still racing: most marks reached, then soonest at the last of them
  const on = ok.filter(b => b.id !== I.you).map(b => { const m = (I.marks[b.id] ?? []).filter(x => x != null); return { id: b.id, n: m.length, t: m.length ? m[m.length - 1] : Infinity }; });
  on.sort((a, b) => b.n - a.n || a.t - b.t);
  return on[0] && on[0].n > 0 ? on[0].id : null;
}

export function versus(I: VsInput): Versus | null {
  const r = rivalOf(I); if (r == null) return null;
  const F = I.frames, me = I.you;
  const times = (id: number) => {
    const b = I.boats.find(x => x.id === id)!;
    return [I.startTimes[id] ?? null, ...I.legs.slice(0, -1).map((_, k) => I.marks[id]?.[k] ?? null), b.finishT];
  };
  const A = times(me), B = times(r), legs: LegVs[] = [];
  if (A[0] == null || B[0] == null) return null;
  legs.push({ i: 0, name: 'The start', kind: 'start', you: A[0], them: B[0], lost: A[0] - B[0], fromDist: 0, fromSpeed: A[0] - B[0], youM: 0, themM: 0, t0: Math.min(A[0], B[0]) - 30, t1: Math.max(A[0], B[0]), apartM: 0, apartDir: '', moments: [] });
  let from = I.from;
  for (let k = 0; k < I.legs.length; k++) {
    const L = I.legs[k], a0 = A[k], a1 = A[k + 1], b0 = B[k], b1 = B[k + 1];
    if (a0 == null || a1 == null || b0 == null || b1 == null) break;
    const you = a1 - a0, them = b1 - b0, youM = sailed(F, me, a0, a1), themM = sailed(F, r, b0, b1);
    const v = youM / Math.max(1, you), fromDist = v > 0.2 ? (youM - themM) / v : 0;
    const u = unit(sub(L.to, from)), off = meanOff(F, r, b0, b1, from, u) - meanOff(F, me, a0, a1, from, u);
    // + off: their line lay to the left of yours (going from the last mark to this one): which compass way that is
    const left = { x: -u.y, y: u.x }, dir = off >= 0 ? left : { x: u.y, y: -u.x };
    const rbName = I.boats.find(b => b.id === r)!.name;
    legs.push({ i: k + 1, name: L.name, kind: L.kind, you, them, lost: you - them, fromDist, fromSpeed: you - them - fromDist, youM, themM, t0: a0, t1: a1,
      apartM: Math.abs(off), apartDir: compassPoint(brg(dir.x, dir.y)), moments: legMoments(F, me, r, rbName, k + 1, L, from, a0, a1, b0, b1, k === I.legs.length - 1 ? I.finishLine ?? [L.to, L.to] : null) });
    from = L.to;
  }
  const total = legs.reduce((s, l) => s + l.lost, 0);
  const rb = I.boats.find(b => b.id === r)!;
  const mine = I.boats.find(b => b.id === me)!, first = I.boats.filter(b => !b.dsq && b.finishT != null).sort(byScore)[0];
  // (equal points share the place: 44.3(c), A7; then neither of you won outright)
  const tie = mine.finishT != null && rb.finishT != null && mine.points != null && mine.points === rb.points;
  return { moments: legs.flatMap(l => l.moments), rival: r, rivalName: rb.name, tie, won: !tie && first?.id === r, youWon: !tie && first?.id === me, youDone: mine.finishT != null && legs.length === I.legs.length + 1, legs, total };
}

/* ---------- the big moments: tacks, gybes, shifts and marks ---------- */

/** Where a boat was at race time t, from the 1 Hz track (between frames, in a straight line); null if not recorded. */
function posAt(F: Frame[], id: number, t: number): Vec | null {
  let lo = 0, hi = F.length - 1;
  if (!F.length || t < F[0].t || t > F[hi].t) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (F[m].t <= t) lo = m; else hi = m; }
  const a = F[lo].b[id], b = F[hi].b[id]; if (!a || !b) return null;
  const f = F[hi].t > F[lo].t ? (t - F[lo].t) / (F[hi].t - F[lo].t) : 0;
  return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f };
}
/**
 * The mean wind's direction (from) around time t: the circular mean of the true wind both boats felt over ±5 min. On a
 * beat or a run, gains are counted across this ("ladder rungs"), the way sailors count them: across the mean wind,
 * not the wind of the moment (against the wind of the moment, a boat tacking on a header would seem to gain nothing,
 * since both boats in a shift make the same progress into it), and not along the leg's line (which, when the leg isn't
 * square to the wind, credits whichever tack points nearer the mark).
 */
function meanWind(F: Frame[], ids: number[], t: number, half = 300): number | null {
  let sx = 0, sy = 0;
  for (const f of F) if (Math.abs(f.t - t) <= half) for (const id of ids) { const w = f.b[id]?.[6]; if (w != null) { const r = w * Math.PI / 180; sx += Math.sin(r); sy += Math.cos(r); } }
  return sx || sy ? brg(sx, sy) : null;
}
/** Metres a boat made good along `u` between two race times; null if the track misses her. */
function madeGood(F: Frame[], id: number, t0: number, t1: number, u: Vec): number | null {
  const p = posAt(F, id, t0), q = posAt(F, id, t1);
  return p && q ? (q.x - p.x) * u.x + (q.y - p.y) * u.y : null;
}
/** Her mean wind shift (+ headed, − lifted, deg) over a stretch, from the track, up to (not including) its end: a tack's own second is on the new tack. */
function shiftOver(F: Frame[], id: number, t0: number, t1: number): number {
  let s = 0, n = 0;
  for (const f of F) if (f.t >= t0 && f.t < t1) { const v = f.b[id]?.[5]; if (v != null) { s += v; n++; } }
  return n ? s / n : 0;
}
type Turn = { t: number; to: string; gybe: boolean };
/**
 * A boat's tacks and gybes between two times: each change of tack in the track. Not counted: the turns of a penalty
 * (RRS 44.2: each turn a tack and a gybe; the track flags them), anything within 10 s of her own start or rounding
 * (that's the mark, not a choice on the leg), and a change undone within 15 s. A tack turns her bow through the wind
 * (her heading within 90° of where the wind's from at the change); a gybe, her stern.
 */
function turnsOf(F: Frame[], id: number, t0: number, t1: number, quiet: number[]): Turn[] {
  const ch: Turn[] = [];
  for (let i = 1; i < F.length; i++) {
    const f = F[i]; if (f.t <= t0 || f.t > t1) continue;
    const a = F[i - 1].b[id], b = f.b[id]; if (!a || !b || a[3] === b[3]) continue;
    if (a[7] || b[7] || quiet.some(q => Math.abs(f.t - q) < 10)) continue;
    const wd = b[6] ?? a[6], off = wd == null ? 0 : Math.abs(((b[2] - wd + 540) % 360) - 180);
    ch.push({ t: f.t, to: b[3], gybe: wd != null && off > 90 });
  }
  const out: Turn[] = [];
  for (let i = 0; i < ch.length; i++) { if (i + 1 < ch.length && ch[i + 1].t - ch[i].t < 15) { i++; continue; } out.push(ch[i]); }
  return out;
}
/** Which tack a boat was on at time t. */
function tackAt(F: Frame[], id: number, t: number): string | null {
  let lo = 0, hi = F.length - 1;
  if (!F.length || t < F[0].t) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (F[m].t <= t) lo = m; else hi = m; }
  return (F[hi].t <= t ? F[hi] : F[lo]).b[id]?.[3] ?? null;
}
const clock = (t: number) => { const r = Math.round(t); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
const metres = (m: number) => `${m > 0 ? 'lost' : 'gained'} ${Math.round(Math.abs(m))} m`;
const aN = (n: number) => /^(8|11|18|8\d)$/.test(String(n)) ? 'an' : 'a';
/** "on an 8° header" / "on a 5° lift" / "" (within SHIFT_DEG, the wind's own wobble: sim/debrief.ts). */
const onShift = (d: number) => { const n = Math.round(Math.abs(d)); return d > SHIFT_DEG ? ` on ${aN(n)} ${n}° header` : d < -SHIFT_DEG ? ` on ${aN(n)} ${n}° lift` : ''; };
/**
 * Seconds a Folkboat takes, from the change of tack, to be back near full speed: the sim's own boat measured 21–39 s
 * from the start of the turn (18 kt down to 8 kt of wind), and the track's change of tack comes partway through it;
 * 30 s is an estimate across that range.
 */
const RECOVER = 30;
/** Moments under this (m) aren't kept: under a boat length (LOA 7.6 m) is in the noise of the 1 s track. */
const MIN_M = 6;

/**
 * A leg's moments against her. Only while you were both on the leg at the same time are your turns compared (then you
 * sailed through the same minutes of wind, if not always the same patch of it). Each of her tacks or gybes is paired:
 * - you were already on the tack she turned onto: with your last turn onto it ("you tacked 40 s before her");
 * - else your next turn onto it, if it came before her next turn ("you held on 40 s longer");
 * - else "you didn't follow", until her next turn.
 * Your turns away from the tack she was on, unpaired, are "she held on". What each cost or gained is the difference in
 * metres made good (across the mean wind on a beat or a run, along the leg on a reach) over that stretch of clock time,
 * to RECOVER s after the later turn, less what the plain speed difference between you over the minute before would have
 * made over the same time: so it's the turn and the shift, not a faster boat.
 */
function legMoments(F: Frame[], me: number, r: number, name: string, leg: number, L: { name: string; to: Vec; kind: string }, from: Vec, a0: number, a1: number, b0: number, b1: number, finishLine: [Vec, Vec] | null): VsMoment[] {
  const out: VsMoment[] = [], lo = Math.max(a0, b0), hi = Math.min(a1, b1), M = L.to, legU = unit(sub(M, from));
  // the yardstick at time t: across the mean wind on a beat (toward it) or a run (away), along the leg on a reach
  const axis = (t: number): Vec => {
    if (L.kind === 'reach') return legU;
    const wd = meanWind(F, [me, r], t); if (wd == null) return legU;
    const up = { x: Math.sin(wd * Math.PI / 180), y: Math.cos(wd * Math.PI / 180) }, sg = L.kind === 'run' ? -1 : 1;
    return { x: up.x * sg, y: up.y * sg };
  };
  const lost = (t0: number, t1: number): number | null => {
    const u = axis((t0 + t1) / 2), h = madeGood(F, r, t0, t1, u), y = madeGood(F, me, t0, t1, u);
    if (h == null || y == null) return null;
    // the plain speed difference over the minute before (both on the leg), taken out
    const p0 = Math.max(lo, t0 - 60), hb = madeGood(F, r, p0, t0, u), yb = madeGood(F, me, p0, t0, u);
    const base = t0 - p0 >= 20 && hb != null && yb != null ? (hb - yb) / (t0 - p0) : 0;
    return h - y - base * (t1 - t0);
  };
  const verb = (g: boolean) => g ? 'gybed' : 'tacked';
  const side = (t: string) => t === 'S' ? 'starboard' : 'port', other = (t: string) => side(t === 'S' ? 'P' : 'S');
  // where your winds differed enough to say so (the shifts move across the water: you may not have had hers)
  // (by the wind each felt, its direction: the header/lift sign flips with the tack, so two boats on opposite tacks in
  // the same wind would seem far apart by it)
  const apart = (t0: number, t1: number) => {
    const hw = meanWind(F, [r], (t0 + t1) / 2, (t1 - t0) / 2), yw = meanWind(F, [me], (t0 + t1) / 2, (t1 - t0) / 2), p = posAt(F, r, t0), q = posAt(F, me, t0);
    if (hw == null || yw == null) return '';
    const dw = ((hw - yw + 540) % 360) - 180, d = p && q ? Math.hypot(p.x - q.x, p.y - q.y) : 0;
    return Math.abs(dw) > SHIFT_DEG ? ` (where ${name} was, ${Math.round(d)} m from you, the wind was ${Math.round(Math.abs(dw))}° ${dw > 0 ? 'to the right' : 'to the left'} of yours, looking upwind)` : '';
  };
  if (hi > lo + 10) {
    const hers = turnsOf(F, r, lo, hi, [b0, b1]), mine = turnsOf(F, me, a0, a1, [a0, a1]), used = new Set<number>();
    hers.forEach((h, n) => {
      const next = hers[n + 1]?.t ?? hi, sh = onShift(shiftOver(F, r, h.t - 10, h.t)), v = verb(h.gybe);
      let k = -1;
      if (tackAt(F, me, h.t - 1) === h.to) {
        // you were already there: your last turn onto it (if on this leg, within 5 min, not already paired)
        for (let i = mine.length - 1; i >= 0; i--) if (mine[i].t < h.t && mine[i].to === h.to) { if (!used.has(i) && h.t - mine[i].t < 300) k = i; break; }
        if (k < 0) return; // on it all along: nothing to compare
      } else k = mine.findIndex((y, i) => !used.has(i) && y.to === h.to && y.t >= h.t && y.t < next);
      if (k >= 0) {
        used.add(k);
        const y = mine[k], d = y.t - h.t, t0 = Math.min(h.t, y.t) - 5, t1 = Math.min(Math.max(h.t, y.t) + RECOVER, hi), m = lost(t0, t1);
        if (m == null || Math.abs(m) < MIN_M) return;
        const myShift = onShift(shiftOver(F, me, h.t, y.t));
        const text = d > 5 ? `${name} ${v} onto ${side(h.to)}${sh} at ${clock(h.t)}; you stayed on ${other(h.to)} ${Math.round(d)} s longer${myShift ? `,${myShift}` : ''}, and ${metres(m)}${apart(h.t, y.t)}.`
          : d < -5 ? `You ${verb(y.gybe)} onto ${side(y.to)} ${Math.round(-d)} s before ${name} (at ${clock(y.t)}${onShift(shiftOver(F, me, y.t - 10, y.t))}), and ${metres(m)}.`
          : `You both ${v} onto ${side(h.to)} at ${clock(h.t)}${sh ? `,${sh.replace(/ on an? /, ' on the ')}` : ''}: through it you ${metres(m)}.`;
        out.push({ leg, kind: 'tack', t0, t1, lostM: m, text });
      } else {
        const t1 = Math.min(h.t + 120, next, hi), m = lost(h.t - 5, t1);
        if (m != null && Math.abs(m) >= MIN_M && t1 - h.t >= 15) out.push({ leg, kind: 'tack', t0: h.t - 5, t1, lostM: m, text: `${name} ${v} onto ${side(h.to)}${sh} at ${clock(h.t)}; you stayed on ${other(h.to)}, and over the next ${Math.round(t1 - h.t)} s you ${metres(m)}${apart(h.t, t1)}.` });
      }
    });
    mine.forEach((y, i) => {
      if (used.has(i) || y.t <= lo || y.t > hi || tackAt(F, r, y.t) === y.to) return; // (onto the tack she was on: catching up, not a choice against her)
      const t1 = Math.min(y.t + RECOVER, hi), m = lost(y.t - 5, t1);
      if (m != null && Math.abs(m) >= MIN_M) out.push({ leg, kind: 'tack', t0: y.t - 5, t1, lostM: m, text: `You ${verb(y.gybe)} onto ${side(y.to)} at ${clock(y.t)}${onShift(shiftOver(F, me, y.t - 10, y.t))}; ${name} stayed on ${other(y.to)}, and over the next ${Math.round(t1 - y.t)} s you ${metres(m)}.` });
    });
  }
  // the mark (or the finish line) at the end of the leg: who got there first, and how far back the other was
  const finish = !!finishLine, where = finish ? 'the finish' : L.name;
  const back = (p: Vec | null) => !p ? null : finishLine ? segDist(p, finishLine[0], finishLine[1]) : Math.hypot(p.x - M.x, p.y - M.y);
  if (Math.abs(a1 - b1) < 0.5) out.push({ leg, kind: 'mark', t0: b1 - 10, t1: b1, lostM: 0, text: `You and ${name} ${finish ? 'finished' : `rounded ${where}`} together, at ${clock(b1)}.` });
  else if (a1 > b1) {
    const d = back(posAt(F, me, b1));
    out.push({ leg, kind: 'mark', t0: b1 - 10, t1: a1, lostM: d ?? 0, text: `${name} ${finish ? 'finished' : `rounded ${where}`} at ${clock(b1)}${d != null ? ` with you ${Math.round(d)} m back` : ''}; you ${finish ? 'finished' : 'rounded'} ${Math.round(a1 - b1)} s later.` });
  } else {
    const d = back(posAt(F, r, a1));
    out.push({ leg, kind: 'mark', t0: a1 - 10, t1: b1, lostM: -(d ?? 0), text: `You ${finish ? 'finished' : `rounded ${where}`} at ${clock(a1)}, ${Math.round(b1 - a1)} s ahead of ${name}${d != null ? ` (${Math.round(d)} m back)` : ''}.` });
  }
  return out.sort((a, b) => a.t0 - b.t0);
}
/** Distance from p to the segment a–b (the finish line). */
function segDist(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a), l2 = ab.x * ab.x + ab.y * ab.y, k = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / l2)) : 0;
  return Math.hypot(p.x - a.x - ab.x * k, p.y - a.y - ab.y * k);
}

/** A leg's comparison in a line or two, for the list and the caption. */
export function legWords(L: LegVs, rival: string): string {
  const s = (x: number) => `${Math.round(Math.abs(x))} s`;
  const mm = (x: number) => { const r = Math.round(x); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
  if (L.kind === 'start') {
    return Math.abs(L.lost) < 1 ? `You both crossed the line about together, ${L.you.toFixed(1)} s after the gun.`
      : `You crossed ${L.you.toFixed(1)} s after the gun, ${rival} ${L.them.toFixed(1)} s: you started ${s(L.lost)} ${L.lost > 0 ? 'behind' : 'ahead of'} her.`;
  }
  const parts: string[] = [`You ${mm(L.you)}, ${rival} ${mm(L.them)}.`];
  const dm = L.youM - L.themM;
  if (Math.abs(L.fromDist) >= 2) parts.push(`You sailed ${Math.round(Math.abs(dm))} m ${dm > 0 ? 'further' : 'less'} (about ${s(L.fromDist)}${L.fromDist > 0 ? ' lost' : ' gained'})`);
  if (Math.abs(L.fromSpeed) >= 2) parts.push(`${Math.abs(L.fromDist) >= 2 ? 'and were' : 'You were'} ${L.fromSpeed > 0 ? 'slower' : 'faster'} over the ground (about ${s(L.fromSpeed)})`);
  let txt = parts[0] + (parts.length > 1 ? ' ' + parts.slice(1).join(' ') + '.' : '');
  if (L.apartM >= 40) txt += ` ${rival}'s line lay on average ${Math.round(L.apartM)} m to the ${L.apartDir} of yours.`;
  return txt;
}

/** How to name her: "who won", "who came second", … ("Against Blue, who won"). `rivalFinished`: she's crossed the line. */
export function rivalWho(V: Versus, rivalFinished: boolean): string {
  return V.tie ? 'who tied with you on points' : V.won ? 'who won' : V.youWon ? (rivalFinished ? 'who came second' : 'the next boat')
    : V.total > 0 ? 'who is ahead of you' : 'the boat behind you';
}
/** The gap in a sentence: "You finished 1 min 12 s behind Blue." */
export function gapWords(V: Versus): string {
  const g = Math.round(Math.abs(V.total)), t = g < 60 ? `${g} s` : `${Math.floor(g / 60)} min ${g % 60} s`, side = V.total < 0 ? 'ahead of' : 'behind';
  return V.youDone ? `You finished ${t} ${side} ${V.rivalName}.` : `Over the legs you've both sailed, you're ${t} ${side} ${V.rivalName}.`;
}
/** The moments that cost or gained most (tacks, gybes and shifts; the marks go with their legs), biggest first. */
export function bigMoments(V: Versus, n = 5): VsMoment[] {
  return V.moments.filter(m => m.kind === 'tack').sort((a, b) => Math.abs(b.lostM) - Math.abs(a.lostM)).slice(0, n);
}
