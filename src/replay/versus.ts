import { compassPoint } from '../core/compass';
import { brg, cross, sub, unit, type Vec } from '../core/math';
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
}

export interface Versus { rival: number; rivalName: string; won: boolean; legs: LegVs[]; total: number }

/** Over-the-ground metres a boat sailed between two race times, from the track. */
function sailed(F: Frame[], id: number, t0: number, t1: number): number {
  let m = 0, prev: [number, number] | null = null;
  for (const f of F) {
    if (f.t < t0 || f.t > t1) continue;
    const p = f.b[id]; if (!p) continue;
    if (prev) m += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = [p[0], p[1]];
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
  boats: { id: number; name: string; finishT: number | null; dsq: boolean }[];
  /** Each boat's start crossing (race time, s), by id. */
  startTimes: (number | null)[];
  /** Each boat's mark times, by id (race time, s). */
  marks: number[][];
  /** The legs' ends: the line, then each mark, then the finish; and each leg's point of sail. */
  legs: { name: string; to: Vec; kind: 'beat' | 'reach' | 'run' }[];
  from: Vec;
}

/** Who to measure against: the winner; if that's you, the boat second; with nobody finished, the one furthest on. */
export function rivalOf(I: VsInput): number | null {
  const ok = I.boats.filter(b => !b.dsq);
  const fin = ok.filter(b => b.finishT != null).sort((a, b) => a.finishT! - b.finishT!);
  if (fin.length) { const r = fin[0].id === I.you ? fin[1] : fin[0]; return r ? r.id : null; }
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
  legs.push({ i: 0, name: 'The start', kind: 'start', you: A[0], them: B[0], lost: A[0] - B[0], fromDist: 0, fromSpeed: A[0] - B[0], youM: 0, themM: 0, t0: Math.min(A[0], B[0]) - 30, t1: Math.max(A[0], B[0]), apartM: 0, apartDir: '' });
  let from = I.from;
  for (let k = 0; k < I.legs.length; k++) {
    const L = I.legs[k], a0 = A[k], a1 = A[k + 1], b0 = B[k], b1 = B[k + 1];
    if (a0 == null || a1 == null || b0 == null || b1 == null) break;
    const you = a1 - a0, them = b1 - b0, youM = sailed(F, me, a0, a1), themM = sailed(F, r, b0, b1);
    const v = youM / Math.max(1, you), fromDist = v > 0.2 ? (youM - themM) / v : 0;
    const u = unit(sub(L.to, from)), off = meanOff(F, r, b0, b1, from, u) - meanOff(F, me, a0, a1, from, u);
    // + off: their line lay to the left of yours (going from the last mark to this one): which compass way that is
    const left = { x: -u.y, y: u.x }, dir = off >= 0 ? left : { x: u.y, y: -u.x };
    legs.push({ i: k + 1, name: L.name, kind: L.kind, you, them, lost: you - them, fromDist, fromSpeed: you - them - fromDist, youM, themM, t0: a0, t1: a1,
      apartM: Math.abs(off), apartDir: compassPoint(brg(dir.x, dir.y)) });
    from = L.to;
  }
  const total = legs.reduce((s, l) => s + l.lost, 0);
  const rb = I.boats.find(b => b.id === r)!;
  return { rival: r, rivalName: rb.name, won: rb.finishT != null && (I.boats.find(b => b.id === me)!.finishT ?? Infinity) > rb.finishT, legs, total };
}

/** A leg's comparison in a line or two, for the list and the caption. */
export function legWords(L: LegVs, rival: string): string {
  const s = (x: number) => `${Math.round(Math.abs(x))} s`;
  const mm = (x: number) => `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}`;
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
