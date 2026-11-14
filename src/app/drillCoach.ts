/**
 * The drills' coach by the boat (ROADMAP Training tools 3; the owner approved the mock-up, design/drill-redo: "drill looks
 * good"): for the tack and gybe drill, the mark-rounding drill and the start practice, what to draw on the water and the
 * word or two to show above her masthead, from her state as the page sees it. Pure: render/drillGuides.ts draws it.
 *
 * - Tacks and gybes: a set course, rep by rep. A lane along her track over the ground with a bar 80 m ahead (100 m on a
 *   run) where to turn. "Build speed" while she's under her polar speed (through the water), "Hold", then "Tack now" /
 *   "Jibe now" two seconds short of the bar, but only from where the drill scores one (close-hauled to 70° true for a
 *   tack, a run from 120° for a gybe: sim/drill.ts); else "Head up" / "Bear away" to get there first. Through the turn, a
 *   good crew's turn (the sim crew's own rate, drill.ts simCrew) from where she began it against her wake, the new course in
 *   chevrons, "Ease" while she builds speed again; then the rep's short score from the drill's own tracker. Eight reps a set,
 *   then the set's best.
 * - Mark roundings, both left to port. The windward mark: the lane in on the layline itself (a close-hauled boat can't go
 *   wide without overstanding), "Hold", then "Bear away" at the mark. The leeward mark: wide in, close out, "Wide in", "Head
 *   up". Then "Close out" once she's round (the drill's own tracker says so) and the score; the mark's guides stay up through
 *   the exit. Each rounding's lane is fixed when it begins (not swinging with each puff's shift).
 * - The start practice: a lane to the line, "Hold" while she'd be early, "Build speed" while she'd be late (her time to the
 *   line from her speed now, the stream and the time to get up to speed), "Go" as it meets the gun; "Dip back" while she's
 *   over the line before the gun (RRS 29.1, 30).
 */
import { FOLKBOAT } from '../boat/polar';
import { LOA, ZONE } from '../core/math';
import { simCrew } from '../sim/drill';
import type { Cue, GuideSpec, Pt } from '../render/drillGuides';

/** What the coach reads of the race (the page's mirror of it). */
export interface CoachView {
  t: number;
  user: { x: number; y: number; h: number; v: number; vx: number; vy: number; twa: number; tack: 'P' | 'S'; ww: { from: number; kt: number }; cur?: Pt; astern?: number };
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
const KTS = 0.5144;
/** Under this share of her polar speed she's building speed, not sailing at it. */
const SLOW = 0.9;
/** Reps in a set. */
export const SET = 8;
/** How long a rep's score stays up (s). */
const SCORE_S = 6;
/** Where the drill scores a turn from (sim/drill.ts): a tack from close-hauled to 70° true, a gybe from 120°. */
const TACK_FROM = 70, GYBE_FROM = 120;

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
/** Her polar speed (m/s) at her angle, never below close-hauled's (stopped head to wind, she's still meant to be going). */
const polarAt = (tws: number, twa: number) => FOLKBOAT.speedKt(tws, Math.min(180, Math.max(FOLKBOAT.beatAngle(tws), Math.abs(twa)))) * KTS;

interface Rep { n: number; kind: 'tack' | 'gybe'; S: Pt; T: Pt; h: number; tack0: 'P' | 'S'; list0: number; turned: boolean; turnT?: number; ideal?: Pt[]; E?: Pt; h1?: number; wake: Pt[]; wakeT: number; doneT?: number; cue?: Cue }
interface Round { leg: number; M: Pt; windward: boolean; hA: number; hE: number; list0: number; wake: Pt[]; wakeT: number; phase: number; doneT?: number; cue?: Cue }

export class DrillCoach {
  private rep: Rep | null = null;
  private set: number[] = [];
  private setDoneT = -Infinity;
  private round: Round | null = null;
  private lastT = -Infinity;

  /** A new session (or a restart): nothing carried over. */
  reset(): void { this.rep = null; this.round = null; this.set = []; this.setDoneT = -Infinity; this.lastT = -Infinity; }

  /** Each frame: what to draw and say. `mode`: the drill being sailed (null: none). */
  tick(w: CoachView, mode: 'manoeuvres' | 'roundings' | 'start' | null): CoachOut {
    if (w.t < this.lastT - 1) this.reset(); // (the clock went back: a new race)
    this.lastT = w.t;
    if (mode === 'manoeuvres' && w.drill) return this.manoeuvres(w);
    if (mode === 'roundings' && w.rounding) return this.roundings(w);
    if (mode === 'start' && w.start) return this.start(w);
    this.rep = null; this.round = null;
    return { spec: null, key: '', wake: null, cue: null };
  }

  /* ---------------- tacks and gybes ---------------- */
  private manoeuvres(w: CoachView): CoachOut {
    const u = w.user, list = w.drill!.list, tws = u.ww.kt, twa = Math.abs(u.twa);
    if (list.length < (this.rep?.list0 ?? 0)) this.reset(); // (a restart: a new, empty list)
    // the set's best, shown after the eighth rep's own score; then a new set
    if (this.set.length >= SET && w.t >= this.setDoneT) {
      if (w.t < this.setDoneT + SCORE_S) return { spec: null, key: 'set', wake: null, cue: { word: 'Set done', sub: `best ${Math.round(Math.min(...this.set))} m of ${SET} reps`, tone: 'done' } };
      this.set = []; this.rep = null;
    }
    let r = this.rep;
    if (r && r.doneT != null && w.t > r.doneT + SCORE_S) r = this.rep = null; // (the score's been up: the next rep)
    if (r && !r.turned && list.length > r.list0) r = this.rep = null; // (a turn the drill noted before the bar: start again from here)
    // turned, but no score coming: back on her old tack (an attempt given up), or long past when the drill would have it
    if (r && r.turned && r.doneT == null && (u.tack === r.tack0 || w.t > r.turnT! + simCrew(r.kind, tws).back + 30)) r = this.rep = null;
    if (!r) r = this.rep = this.newRep(w, (this.set.length % SET) + 1);
    const kind = r.kind, pos = { x: u.x, y: u.y }, spd = Math.max(0, u.v - (u.astern ?? 0)); // (through the water: the polar's frame)
    if (w.t > r.wakeT + 0.5 && r.wake.length < 400) { r.wake.push(pos); r.wakeT = w.t; }
    const along = (pos.x - r.S.x) * dir(r.h).x + (pos.y - r.S.y) * dir(r.h).y, toBar = dist(r.S, r.T) - along;
    // turned: the tack (or gybe) flipped her tack; a good crew's turn from where she began it (the bar, or short of it)
    if (!r.turned && u.tack !== r.tack0) {
      r.turned = true; r.turnT = w.t;
      const ang = kind === 'tack' ? FOLKBOAT.beatAngle(tws) : FOLKBOAT.runAngle(tws), from = u.ww.from;
      r.h1 = n360(u.tack === 'S' ? from - ang : from + ang); // (her new course: close-hauled, or her run angle, on the new tack)
      const at = toBar > 10 ? r.wake[Math.max(0, r.wake.length - 4)] ?? pos : r.T;
      r.ideal = idealTurn(at, r.h, r.h1, Math.max(1, spd), kind, tws); r.E = r.ideal[r.ideal.length - 1];
    }
    if (!r.turned && toBar < -25) { this.rep = null; return this.manoeuvres(w); } // (past the bar without turning: a new rep from here)
    // scored: the short score; the full advice is in the Pause list
    if (r.doneT == null && list.length > r.list0) {
      const s = list[list.length - 1]; r.doneT = w.t;
      if (s.scored) { this.set.push(Math.max(0, s.lostM)); if (this.set.length >= SET) this.setDoneT = w.t + SCORE_S; }
      r.cue = s.scored ? { word: `${Math.max(0, Math.round(s.lostM))} m lost`, sub: `Rep ${r.n} · a good crew ${Math.round(s.goodM)} m`, tone: 'done' } : { word: 'Not scored', sub: `Rep ${r.n}: see Pause for why`, tone: 'done' };
    }
    // the guides: the lane in with its bar; once turned, the good crew's turn and the lane out
    const lanes = [{ pts: [r.S, r.T], half: 7 }];
    const spec: GuideSpec = { lane: lanes, gate: { p: r.T, h: r.h, half: 9 } };
    if (r.turned && r.E && r.h1 != null) { lanes.push({ pts: [r.E, add(r.E, dir(r.h1), 140)], half: 7 }); spec.ideal = r.ideal; spec.target = { p: add(r.E, dir(r.h1), 12), h: r.h1 }; }
    const key = `m${r.n}:${this.set.length}:${r.turned ? 1 : 0}:${Math.round(r.T.x)},${Math.round(r.T.y)}`;
    // the cue
    const target = polarAt(tws, twa), sub = `Rep ${r.n} of ${SET}`;
    const ready = kind === 'tack' ? twa <= TACK_FROM : twa >= GYBE_FROM;
    let cue: Cue;
    if (r.cue) cue = r.cue;
    else if (r.turned) cue = spd < SLOW * target ? { word: 'Ease', sub: 'build speed on the new course' } : { word: 'Hold', sub };
    else if (!ready) cue = kind === 'tack' ? { word: 'Head up', sub: 'to close-hauled first' } : { word: 'Bear away', sub: 'to a run first' };
    else if (toBar / Math.max(0.5, spd) < 2) cue = { word: kind === 'tack' ? 'Tack now' : 'Jibe now', tone: 'go' };
    else if (spd < SLOW * target) cue = { word: 'Build speed', sub };
    else cue = { word: 'Hold', sub: `${sub} · ${kind === 'tack' ? 'tack' : 'jibe'} at the bar` };
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
    const u = w.user, R = w.rounding!, leg = R.leg ?? 0, pos = { x: u.x, y: u.y }, n = R.marks.length;
    let r = this.round;
    if (r && R.list.length < r.list0) r = this.round = null; // (a restart)
    // a rounding lasts until its score has been up (the tracker moves on to the next mark the moment she's round: the
    // mark she's rounding keeps its guides through the exit)
    if (r && r.doneT != null && w.t > r.doneT + SCORE_S) r = this.round = null;
    if (r && r.doneT == null && r.leg !== leg && dist(pos, r.M) > 140) r = this.round = null; // (round, and well clear, with no score)
    if (!r) {
      const M = R.marks[leg].p, next = R.marks[(leg + 1) % n].p, prev = R.marks[(leg + n - 1) % n].p, windward = leg === 0, from = u.ww.from, beat = FOLKBOAT.beatAngle(u.ww.kt);
      const brg = (a: Pt, b: Pt) => n360(Math.atan2(b.x - a.x, b.y - a.y) / D2R);
      // her course in (the starboard layline to the windward mark; down the leg to the leeward one) and out (to the next
      // mark; close-hauled on port from the leeward mark), fixed now
      r = this.round = { leg, M, windward, hA: windward ? n360(from - beat) : brg(prev, M), hE: windward ? brg(M, next) : n360(from + beat), list0: R.list.length, wake: [], wakeT: -Infinity, phase: 0 };
    }
    const { M, windward, hA, hE } = r, a = dir(hA), ra = dir(hA + 90), e = dir(hE), re = dir(hE + 90);
    // the path round: left to port. Windward: in on the layline itself, a length off the mark; leeward: wide in (2½
    // lengths out), close out (a length)
    const wide = windward ? LOA : 2.5 * LOA, P0 = add(add(M, ra, wide), a, -3 * LOA), P3 = add(add(M, re, LOA), e, 18), P1 = add(P0, a, 16), P2 = add(P3, e, -16);
    const path: Pt[] = []; for (let i = 0; i <= 30; i++) { const t = i / 30, m = 1 - t; path.push({ x: m * m * m * P0.x + 3 * m * m * t * P1.x + 3 * m * t * t * P2.x + t * t * t * P3.x, y: m * m * m * P0.y + 3 * m * m * t * P1.y + 3 * m * t * t * P2.y + t * t * t * P3.y }); }
    const spec: GuideSpec = { lane: [{ pts: [add(P0, a, -200), P0], half: 7 }], zone: M, ideal: path, exit: { p: P3, h: hE, len: 90 } };
    const key = `r${r.leg}:${Math.round(M.x)},${Math.round(M.y)}:${Math.round(hA)}:${Math.round(hE)}`;
    const d = dist(pos, M);
    if (d < 120 && w.t > r.wakeT + 0.5 && r.doneT == null && r.wake.length < 400) { r.wake.push(pos); r.wakeT = w.t; }
    if (r.doneT == null && R.list.length > r.list0) {
      const s = R.list[R.list.length - 1]; r.doneT = w.t;
      r.cue = s.scored ? { word: `${Math.max(0, Math.round(s.lostM))} m lost`, sub: `a good crew ${Math.round(s.goodM)} m${s.provisional ? ' · provisional' : ''}`, tone: 'done' } : { word: 'Not scored', sub: 'see Pause for why', tone: 'done' };
    }
    // the phase only goes forward (no flicker at a boundary): 0 coming in, 1 at the zone, 2 at the mark, 3 round
    const round = leg !== r.leg; // (the tracker has her round it)
    r.phase = Math.max(r.phase, round ? 3 : d < (windward ? 1.5 * LOA : ZONE * 0.6) ? 2 : d < ZONE + 15 ? 1 : 0);
    // on the layline (the windward mark): her bearing from the mark within 5° of the layline's, on starboard
    const offLay = Math.abs(wrap(n360(Math.atan2(M.x - pos.x, M.y - pos.y) / D2R) - hA));
    let cue: Cue;
    if (r.cue) cue = r.cue;
    else if (r.phase === 3) cue = { word: 'Close out', sub: 'mark right by you' };
    else if (r.phase === 2) cue = windward ? { word: 'Bear away', sub: 'ease the main', tone: 'go' } : { word: 'Head up', sub: 'trim in', tone: 'go' };
    else if (r.phase === 1) cue = windward ? { word: 'Hold', sub: 'lay the mark' } : { word: 'Wide in', sub: 'the zone: three lengths' };
    else cue = { word: 'Hold', sub: windward ? (u.tack === 'S' && offLay < 5 ? 'on the layline' : 'sail to the layline') : 'set up wide' };
    return { spec, key, wake: r.wake.length > 1 ? r.wake : null, cue };
  }

  /* ---------------- the start ---------------- */
  private start(w: CoachView): CoachOut {
    const u = w.user, L = w.start!, pos = { x: u.x, y: u.y }, tws = u.ww.kt;
    if (w.t > 5) return { spec: null, key: '', wake: null, cue: null }; // (after the gun: the start's own debrief)
    // the line, pin to committee boat, and which side of it she's on: the course side is to windward
    const lx = L.committee.x - L.pin.x, ly = L.committee.y - L.pin.y, ll = Math.hypot(lx, ly) || 1;
    const k = Math.max(0, Math.min(1, ((pos.x - L.pin.x) * lx + (pos.y - L.pin.y) * ly) / (ll * ll))), Q = { x: L.pin.x + lx * k, y: L.pin.y + ly * k };
    const up = dir(u.ww.from), side = (pos.x - Q.x) * up.x + (pos.y - Q.y) * up.y; // (+: to windward of the line)
    const d = dist(pos, Q), toQ = n360(Math.atan2(Q.x - pos.x, Q.y - pos.y) / D2R);
    const spec: GuideSpec = { lane: [{ pts: [pos, Q], half: 6 }], gate: { p: Q, h: toQ, half: 9 } };
    const key = `s${Math.round(Q.x / 10)},${Math.round(Q.y / 10)}:${Math.round(pos.x / 6)},${Math.round(pos.y / 6)}`; // (the lane redrawn as she moves: about once a second)
    const left = -w.t;
    if (side > 1 && left > 0) return { spec, key, wake: null, cue: { word: 'Dip back', sub: `over the line · ${Math.round(left)} s` } };
    // her time to the line: at her speed for that course, the stream along it, and the time to get up to speed (a
    // Folkboat takes some 10 s from a luff to full speed: sim/roundings.ts TWIN_LAG's note)
    const target = polarAt(tws, wrap(u.ww.from - toQ)), along = u.cur ? u.cur.x * dir(toQ).x + u.cur.y * dir(toQ).y : 0;
    const v = Math.max(0.5, target + along), spdUp = 10 * Math.max(0, 1 - Math.max(0, u.v) / Math.max(0.5, target)) / 2;
    const need = d / v + spdUp;
    let cue: Cue;
    if (left <= 0) cue = { word: 'Go', tone: 'go' };
    else if (need < left - 6) cue = { word: 'Hold', sub: `${Math.round(left)} s · early by ${Math.round(left - need)} s` };
    else if (need > left + 2) cue = { word: 'Build speed', sub: `${Math.round(left)} s · late by ${Math.round(need - left)} s` };
    else cue = { word: 'Go', sub: `${Math.round(left)} s`, tone: 'go' };
    return { spec, key, wake: null, cue };
  }
}
