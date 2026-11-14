/**
 * The drills' coach by the boat (ROADMAP Training tools 3; the owner approved the mock-up, design/drill-redo: "drill looks
 * good"): for the tack and gybe drill, the mark-rounding drill and the start practice, what to draw on the water and the
 * word or two to show above her masthead, from her state as the page sees it. Pure: render/drillGuides.ts draws it.
 *
 * - Tacks and gybes: a set course, rep by rep. A lane along her track over the ground with a bar 80 m ahead (100 m on a
 *   run) where to turn; "Build speed" while she's under her polar speed, "Hold", then "Tack now" / "Jibe now" two seconds
 *   short of the bar. Through the turn, a good crew's turn from the bar (the sim crew's own rate, drill.ts simCrew, and her
 *   beat or run angle) against her wake, the new course in chevrons, "Ease" while she builds speed again; then the rep's
 *   short score from the drill's own tracker. Eight reps a set, then the set's best.
 * - Mark roundings: the lane in on the layline, the zone, the path round (wide in, close out), the exit course; "Hold",
 *   "Wide in", "Bear away" (or "Head up" at the leeward mark), "Close out", then the score.
 * - The start practice: a lane to the line, "Hold" while she'd be early, "Build speed" while she'd be late, "Go" as her
 *   time to the line meets the time to the gun.
 */
import { FOLKBOAT } from '../boat/polar';
import { LOA, ZONE } from '../core/math';
import { simCrew } from '../sim/drill';
import type { Cue, GuideSpec, Pt } from '../render/drillGuides';

/** What the coach reads of the race (the page's mirror of it). */
export interface CoachView {
  t: number;
  user: { x: number; y: number; h: number; v: number; vx: number; vy: number; twa: number; tack: 'P' | 'S'; ww: { from: number; kt: number } };
  drill?: { list: { scored: boolean; lostM: number; goodM: number; kind: 'tack' | 'gybe' }[] } | null;
  rounding?: { marks: { p: Pt }[]; leg?: number; list: { scored: boolean; lostM: number; goodM: number; kind: 'windward' | 'leeward'; provisional?: boolean }[] } | null;
  start?: { pin: Pt; committee: Pt } | null;
}
export interface CoachOut { spec: GuideSpec | null; key: string; wake: Pt[] | null; cue: Cue | null }

const D2R = Math.PI / 180;
const dir = (h: number): Pt => ({ x: Math.sin(h * D2R), y: Math.cos(h * D2R) });
const n360 = (a: number) => ((a % 360) + 360) % 360;
const wrap = (a: number) => ((a + 540) % 360) - 180;
const add = (p: Pt, d: Pt, k: number): Pt => ({ x: p.x + d.x * k, y: p.y + d.y * k });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
/** Under this share of her polar speed she's building speed, not sailing at it. */
const SLOW = 0.9;
/** Reps in a set. */
export const SET = 8;
/** How long a rep's score stays up (s). */
const SCORE_S = 6;

/** A good crew's turn from `p` on heading `h0` to `h1` (turning the short way), at the sim crew's rate, its speed dipping to
 * the sim crew's minimum mid-turn and back. */
export function idealTurn(p: Pt, h0: number, h1: number, v0: number, kind: 'tack' | 'gybe', tws: number): Pt[] {
  const c = simCrew(kind, tws), turn = wrap(h1 - h0), n = Math.abs(turn) / Math.max(1, c.rate), out = [p];
  let q = { ...p };
  for (let t = 0; t <= n + 1e-6; t += 0.25) {
    const f = n > 0 ? t / n : 1, v = v0 * (1 - (1 - c.minSpeed) * Math.sin(Math.PI * f)), d = dir(h0 + Math.sign(turn) * c.rate * t);
    q = add(q, d, v * 0.25); out.push(q);
  }
  return out;
}

interface Rep { n: number; kind: 'tack' | 'gybe'; S: Pt; T: Pt; h: number; tack0: 'P' | 'S'; list0: number; turned: boolean; ideal?: Pt[]; E?: Pt; h1?: number; wake: Pt[]; wakeT: number; doneT?: number; cue?: Cue }

export class DrillCoach {
  private rep: Rep | null = null;
  private set: number[] = [];
  private setDoneT = -Infinity;
  private round: { leg: number; list0: number; wake: Pt[]; wakeT: number; doneT?: number; cue?: Cue; atMark?: boolean } | null = null;

  /** Each frame: what to draw and say. `mode`: the drill being sailed (null: none). */
  tick(w: CoachView, mode: 'manoeuvres' | 'roundings' | 'start' | null): CoachOut {
    if (mode === 'manoeuvres' && w.drill) return this.manoeuvres(w);
    if (mode === 'roundings' && w.rounding) return this.roundings(w);
    if (mode === 'start' && w.start) return this.start(w);
    this.rep = null; this.round = null;
    return { spec: null, key: '', wake: null, cue: null };
  }

  /* ---------------- tacks and gybes ---------------- */
  private manoeuvres(w: CoachView): CoachOut {
    const u = w.user, list = w.drill!.list, tws = u.ww.kt;
    // the set's best, shown after the eighth rep's own score; then a new set
    if (this.set.length >= SET && w.t >= this.setDoneT) {
      if (w.t < this.setDoneT + SCORE_S) return { spec: null, key: 'set', wake: null, cue: { word: 'Set done', sub: `best ${Math.round(Math.min(...this.set))} m of ${SET} reps`, tone: 'done' } };
      this.set = []; this.rep = null;
    }
    let r = this.rep;
    if (r && r.doneT != null && w.t > r.doneT + SCORE_S) r = this.rep = null; // (the score's been up: the next rep)
    if (r && !r.turned && list.length > r.list0) r = this.rep = null; // (a turn the drill noted before the bar: start again from here)
    if (!r) r = this.rep = this.newRep(w, (this.set.length % SET) + 1);
    const kind = r.kind, pos = { x: u.x, y: u.y }, spd = Math.hypot(u.vx, u.vy);
    // her track through the turn, every half second
    if (w.t > r.wakeT + 0.5) { r.wake.push(pos); r.wakeT = w.t; }
    // turned: the tack (or gybe) flipped her tack
    if (!r.turned && u.tack !== r.tack0) {
      r.turned = true;
      const ang = kind === 'tack' ? FOLKBOAT.beatAngle(tws) : FOLKBOAT.runAngle(tws), from = u.ww.from;
      r.h1 = n360(u.tack === 'S' ? from - ang : from + ang); // (her new course: close-hauled, or her run angle, on the new tack)
      r.ideal = idealTurn(r.T, r.h, r.h1, Math.max(1, spd), kind, tws); r.E = r.ideal[r.ideal.length - 1];
    }
    // past the bar without turning: a new rep from here
    const along = (pos.x - r.S.x) * dir(r.h).x + (pos.y - r.S.y) * dir(r.h).y, toBar = dist(r.S, r.T) - along;
    if (!r.turned && toBar < -25) { this.rep = null; return this.manoeuvres(w); }
    // scored: the short score, the full advice is in the Pause list
    if (r.doneT == null && list.length > r.list0) {
      const s = list[list.length - 1]; r.doneT = w.t;
      if (s.scored) { this.set.push(Math.max(0, s.lostM)); if (this.set.length >= SET) this.setDoneT = w.t + SCORE_S; }
      r.cue = s.scored ? { word: `${Math.max(0, Math.round(s.lostM))} m lost`, sub: `Rep ${r.n} · a good crew ${Math.round(s.goodM)} m`, tone: 'done' } : { word: 'Not scored', sub: `Rep ${r.n}: see Pause for why`, tone: 'done' };
    }
    // the guides: the lane in with its bar; once turned, the good crew's turn and the lane out
    const lanes = [{ pts: [r.S, r.T], half: 7 }];
    const spec: GuideSpec = { lane: lanes, gate: { p: r.T, h: r.h, half: 9 } };
    if (r.turned && r.E && r.h1 != null) {
      lanes.push({ pts: [r.E, add(r.E, dir(r.h1), 140)], half: 7 });
      spec.ideal = r.ideal; spec.target = { p: add(r.E, dir(r.h1), 12), h: r.h1 };
    }
    const key = `m${r.n}:${this.set.length}:${r.turned ? 1 : 0}:${Math.round(r.T.x)},${Math.round(r.T.y)}`;
    // the cue
    const target = FOLKBOAT.speedKt(tws, Math.min(180, Math.max(25, Math.abs(u.twa)))) * 0.5144;
    let cue: Cue;
    if (r.cue) cue = r.cue;
    else if (r.turned) cue = spd < SLOW * target ? { word: 'Ease', sub: 'build speed on the new course' } : { word: 'Hold', sub: `Rep ${r.n} of ${SET}` };
    else if (toBar / Math.max(0.5, spd) < 2) cue = { word: kind === 'tack' ? 'Tack now' : 'Jibe now', tone: 'go' };
    else if (spd < SLOW * target) cue = { word: 'Build speed', sub: `Rep ${r.n} of ${SET}` };
    else cue = { word: 'Hold', sub: `Rep ${r.n} of ${SET} · ${kind === 'tack' ? 'tack' : 'jibe'} at the bar` };
    return { spec, key, wake: r.turned || r.doneT != null ? r.wake : null, cue };
  }
  private newRep(w: CoachView, n: number): Rep {
    const u = w.user, spd = Math.hypot(u.vx, u.vy), kind = Math.abs(u.twa) < 90 ? 'tack' : 'gybe';
    // along her track over the ground (leeway and the stream in it: the lane she can actually sail), or her heading if slow
    const h = spd > 0.5 ? n360(Math.atan2(u.vx, u.vy) / D2R) : u.h, S = { x: u.x, y: u.y };
    return { n, kind, S, T: add(S, dir(h), kind === 'tack' ? 80 : 100), h, tack0: u.tack, list0: w.drill!.list.length, turned: false, wake: [], wakeT: -Infinity };
  }

  /* ---------------- mark roundings ---------------- */
  private roundings(w: CoachView): CoachOut {
    const u = w.user, R = w.rounding!, leg = R.leg ?? 0, M = R.marks[leg].p, next = R.marks[(leg + 1) % R.marks.length].p, prev = R.marks[(leg + R.marks.length - 1) % R.marks.length].p;
    const windward = leg === 0, tws = u.ww.kt, from = u.ww.from, pos = { x: u.x, y: u.y };
    let r = this.round;
    if (r && r.leg !== leg && r.doneT == null) r = null; // (a new leg: a new rounding)
    if (r && r.doneT != null && w.t > r.doneT + SCORE_S) r = null;
    if (!r) r = this.round = { leg, list0: R.list.length, wake: [], wakeT: -Infinity };
    // her course in (on the starboard layline to the windward mark; down the run from the windward mark to the leeward
    // one) and out (to the next mark), both rounded to port: wide in, close out
    const brg = (a: Pt, b: Pt) => n360(Math.atan2(b.x - a.x, b.y - a.y) / D2R);
    const hA = windward ? n360(from - FOLKBOAT.beatAngle(tws)) : brg(prev, M), hE = windward ? brg(M, next) : n360(from + FOLKBOAT.beatAngle(tws));
    const a = dir(hA), ra = dir(hA + 90), e = dir(hE), re = dir(hE + 90);
    const P0 = add(add(M, ra, 2.5 * LOA), a, -3 * LOA), P3 = add(add(M, re, LOA), e, 18), P1 = add(P0, a, 16), P2 = add(P3, e, -16);
    const path: Pt[] = []; for (let i = 0; i <= 30; i++) { const t = i / 30, m = 1 - t; path.push({ x: m * m * m * P0.x + 3 * m * m * t * P1.x + 3 * m * t * t * P2.x + t * t * t * P3.x, y: m * m * m * P0.y + 3 * m * m * t * P1.y + 3 * m * t * t * P2.y + t * t * t * P3.y }); }
    const spec: GuideSpec = { lane: [{ pts: [add(P0, a, -200), P0], half: 7 }], zone: M, ideal: path, exit: { p: P3, h: hE, len: 90 } };
    const key = `r${leg}:${Math.round(M.x)},${Math.round(M.y)}:${Math.round(hA / 5)}:${Math.round(hE / 5)}`;
    // (at the mark once she's been by it, inside about two lengths, or past its level along the exit: then she's rounding)
    const d = dist(pos, M);
    if (d < ZONE * 0.6 || (d < ZONE && (pos.x - M.x) * e.x + (pos.y - M.y) * e.y > 0)) r.atMark = true;
    const past = !!r.atMark && d >= ZONE * 0.6;
    if (d < 120 && w.t > r.wakeT + 0.5 && r.doneT == null) { r.wake.push(pos); r.wakeT = w.t; }
    if (r.doneT == null && R.list.length > r.list0) {
      const s = R.list[R.list.length - 1]; r.doneT = w.t;
      r.cue = s.scored ? { word: `${Math.max(0, Math.round(s.lostM))} m lost`, sub: `a good crew ${Math.round(s.goodM)} m${s.provisional ? ' · provisional' : ''}`, tone: 'done' } : { word: 'Not scored', sub: 'see Pause for why', tone: 'done' };
    }
    let cue: Cue;
    if (r.cue) cue = r.cue;
    else if (past && d < 60) cue = { word: 'Close out', sub: 'mark right by you' };
    else if (d < ZONE * 0.6) cue = windward ? { word: 'Bear away', sub: 'ease the main', tone: 'go' } : { word: 'Head up', sub: 'trim in', tone: 'go' };
    else if (d < ZONE + 15) cue = { word: 'Wide in', sub: 'the zone: three lengths' };
    else cue = { word: 'Hold', sub: windward ? 'on the layline' : 'set up wide' };
    return { spec, key, wake: r.wake.length > 1 ? r.wake : null, cue };
  }

  /* ---------------- the start ---------------- */
  private start(w: CoachView): CoachOut {
    const u = w.user, L = w.start!, pos = { x: u.x, y: u.y }, tws = u.ww.kt;
    if (w.t > 5) return { spec: null, key: '', wake: null, cue: null }; // (after the gun: the start's own debrief)
    // the nearest point on the line, and the lane to it
    const lx = L.committee.x - L.pin.x, ly = L.committee.y - L.pin.y, ll = Math.hypot(lx, ly) || 1;
    const k = Math.max(0, Math.min(1, ((pos.x - L.pin.x) * lx + (pos.y - L.pin.y) * ly) / (ll * ll))), Q = { x: L.pin.x + lx * k, y: L.pin.y + ly * k };
    const d = dist(pos, Q), toQ = n360(Math.atan2(Q.x - pos.x, Q.y - pos.y) / D2R);
    const spec: GuideSpec = { lane: [{ pts: [pos, Q], half: 6 }], gate: { p: Q, h: toQ, half: 9 } };
    const key = `s${Math.round(Q.x / 10)},${Math.round(Q.y / 10)}:${Math.round(pos.x / 25)},${Math.round(pos.y / 25)}`;
    const left = -w.t, target = FOLKBOAT.speedKt(tws, Math.min(180, Math.max(30, Math.abs(wrap(u.ww.from - toQ))))) * 0.5144;
    const need = d / Math.max(0.5, target); // (seconds to the line at full speed)
    let cue: Cue;
    if (left <= 0) cue = { word: 'Go', tone: 'go' };
    else if (need < left - 6) cue = { word: 'Hold', sub: `${Math.round(left)} s · early by ${Math.round(left - need)} s` };
    else if (need > left + 2) cue = { word: 'Build speed', sub: `${Math.round(left)} s · late by ${Math.round(need - left)} s` };
    else cue = { word: 'Go', sub: `${Math.round(left)} s`, tone: 'go' };
    return { spec, key, wake: null, cue };
  }
}
