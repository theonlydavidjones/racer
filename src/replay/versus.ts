import { compassPoint } from '../core/compass';
import { V, brg, cross, sub, unit, type Vec } from '../core/math';
import type { Frame } from './recorder';

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
      apartM: Math.abs(off), apartDir: compassPoint(brg(dir.x, dir.y)), moments: legMoments(F, me, r, rbName, k + 1, L, from, a0, a1, b0, b1, k === I.legs.length - 1) });
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

/** Where a boat was at race time t, from the 1 Hz track (between frames, in a straight line). */
function posAt(F: Frame[], id: number, t: number): Vec | null {
  let lo = 0, hi = F.length - 1;
  if (!F.length || t < F[0].t || t > F[hi].t) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (F[m].t <= t) lo = m; else hi = m; }
  const a = F[lo].b[id], b = F[hi].b[id]; if (!a || !b) return null;
  const f = F[hi].t > F[lo].t ? (t - F[lo].t) / (F[hi].t - F[lo].t) : 0;
  return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f };
}
/**
 * Metres a boat made good along the leg (the line from the last mark to this one) between two race times: how sailors
 * count gains on a beat or a run, by the "ladder rungs" across the course, not the straight-line distance to the mark
 * (which, far from it, counts being off to one side as lost ground). The course is laid to the wind, so on a beat or
 * a run the leg's line is the wind's.
 */
function madeGood(F: Frame[], id: number, t0: number, t1: number, u: Vec): number {
  const p = posAt(F, id, t0), q = posAt(F, id, t1);
  return p && q ? (q.x - p.x) * u.x + (q.y - p.y) * u.y : 0;
}
/** Her mean wind shift (+ headed, − lifted, deg) over a stretch, from the track, up to (not including) its end: a tack's own second is on the new tack. */
function shiftOver(F: Frame[], id: number, t0: number, t1: number): number {
  let s = 0, n = 0;
  for (const f of F) if (f.t >= t0 && f.t < t1) { const v = f.b[id]?.[5]; if (v != null) { s += v; n++; } }
  return n ? s / n : 0;
}
/**
 * A boat's tacks (or gybes) between two times: each change of tack in the track. A penalty's turns (RRS 44.2: a tack
 * and a gybe within seconds) aren't tacks: a change undone within 15 s is dropped with its pair.
 */
function tacksOf(F: Frame[], id: number, t0: number, t1: number): { t: number; to: string }[] {
  const ch: { t: number; to: string }[] = [];
  for (let i = 1; i < F.length; i++) {
    const f = F[i]; if (f.t <= t0 || f.t > t1) continue;
    const a = F[i - 1].b[id], b = f.b[id]; if (a && b && a[3] !== b[3]) ch.push({ t: f.t, to: b[3] });
  }
  const out: { t: number; to: string }[] = [];
  for (let i = 0; i < ch.length; i++) { if (i + 1 < ch.length && ch[i + 1].t - ch[i].t < 15) { i++; continue; } out.push(ch[i]); }
  return out;
}
const clock = (t: number) => { const r = Math.round(t); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
const metres = (m: number) => `${m > 0 ? 'lost' : 'gained'} ${Math.round(Math.abs(m))} m`;
/** "on an 8° header" / "on a 5° lift" / "" (under 3°, about the wind's own wobble). */
const aN = (n: number) => /^(8|11|18|8\d)$/.test(String(n)) ? 'an' : 'a';
const onShift = (d: number) => { const n = Math.round(Math.abs(d)); return d >= 3 ? ` on ${aN(n)} ${n}° header` : d <= -3 ? ` on ${aN(n)} ${n}° lift` : ''; };

/**
 * A leg's moments against her. Only while you were both on this leg at the same time can a tack be matched (then you
 * sailed in the same wind): each of her tacks is matched to your next onto the same tack. What it cost or gained is the
 * difference in distance made good along the leg over that stretch of clock time, to 20 s after the later tack (a
 * Folkboat takes about that to get back up to speed). Moments under 5 m (under a boat length) aren't kept.
 */
function legMoments(F: Frame[], me: number, r: number, name: string, leg: number, L: { name: string; to: Vec; kind: string }, from: Vec, a0: number, a1: number, b0: number, b1: number, finish: boolean): VsMoment[] {
  const out: VsMoment[] = [], lo = Math.max(a0, b0), hi = Math.min(a1, b1), M = L.to, U = unit(sub(M, from));
  const verb = L.kind === 'run' ? 'gybed' : L.kind === 'beat' ? 'tacked' : 'went about';
  const lost = (t0: number, t1: number) => madeGood(F, r, t0, t1, U) - madeGood(F, me, t0, t1, U);
  if (hi > lo + 10) {
    const hers = tacksOf(F, r, lo, hi), mine = tacksOf(F, me, lo, a1), used = new Set<number>();
    for (const h of hers) {
      const k = mine.findIndex((y, i) => !used.has(i) && y.to === h.to && y.t >= h.t - 30);
      const sh = onShift(shiftOver(F, r, h.t - 10, h.t));
      if (k >= 0 && mine[k].t - h.t < 300) {
        used.add(k);
        const y = mine[k], d = y.t - h.t, t0 = Math.min(h.t, y.t) - 5, t1 = Math.min(Math.max(h.t, y.t) + 20, hi), m = lost(t0, t1);
        if (Math.abs(m) < 5) continue;
        const text = d > 5 ? `${name} ${verb}${sh} at ${clock(h.t)}; you held on ${Math.round(d)} s longer${onShift(shiftOver(F, me, h.t, y.t)) ? `,${onShift(shiftOver(F, me, h.t, y.t))}` : ''}, and ${metres(m)}.`
          : d < -5 ? `You ${verb} ${Math.round(-d)} s before ${name} (at ${clock(y.t)}${onShift(shiftOver(F, me, y.t - 10, y.t))}), and ${metres(m)}.`
          : `You both ${verb} at ${clock(h.t)}${sh ? `,${sh.replace(/ on an? /, ' on the ')}` : ''}: through it you ${metres(m)}.`;
        out.push({ leg, kind: 'tack', t0, t1, lostM: m, text });
      } else {
        const t1 = Math.min(h.t + 120, hi), m = lost(h.t - 5, t1);
        if (Math.abs(m) >= 5) out.push({ leg, kind: 'tack', t0: h.t - 5, t1, lostM: m, text: `${name} ${verb}${sh} at ${clock(h.t)}; you didn't, and over the next ${Math.round(t1 - h.t)} s you ${metres(m)}.` });
      }
    }
    mine.forEach((y, i) => {
      if (used.has(i) || y.t > hi) return;
      const t1 = Math.min(y.t + 30, hi), m = lost(y.t - 5, t1);
      if (Math.abs(m) >= 5) out.push({ leg, kind: 'tack', t0: y.t - 5, t1, lostM: m, text: `You ${verb} at ${clock(y.t)}${onShift(shiftOver(F, me, y.t - 10, y.t))}; ${name} held on, and over the next ${Math.round(t1 - y.t)} s you ${metres(m)}.` });
    });
  }
  // the mark at the end of the leg: who got there first, and how far back the other was
  const where = finish ? 'the finish' : L.name;
  if (a1 > b1) {
    const p = posAt(F, me, b1), d = p ? Math.hypot(p.x - M.x, p.y - M.y) : 0;
    out.push({ leg, kind: 'mark', t0: b1 - 10, t1: a1, lostM: d, text: `${name} ${finish ? 'finished' : `rounded ${where}`} at ${clock(b1)} with you ${Math.round(d)} m back; you ${finish ? 'finished' : 'rounded'} ${Math.round(a1 - b1)} s later.` });
  } else {
    const p = posAt(F, r, a1), d = p ? Math.hypot(p.x - M.x, p.y - M.y) : 0;
    out.push({ leg, kind: 'mark', t0: a1 - 10, t1: b1, lostM: -d, text: `You ${finish ? 'finished' : `rounded ${where}`} at ${clock(a1)}, ${Math.round(b1 - a1)} s ahead of ${name} (${Math.round(d)} m back).` });
  }
  return out.sort((a, b) => a.t0 - b.t0);
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
