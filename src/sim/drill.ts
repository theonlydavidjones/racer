import type { Boat } from '../boat/boat';
import { FOLKBOAT } from '../boat/polar';
import { byHand } from '../boat/physics';
import { D2R, V, wrap } from '../core/math';
import { manoeuvreS } from './routing';

/**
 * The tack and gybe drill (a training tool: docs/VISION-ROADMAP.md; the owner's go, 13 Nov 2026): every tack and gybe
 * you make, scored against what the sim's own boat loses in one (routing.ts MANOEUVRE_LOSS, measured against a twin
 * that sails on: tests/manoeuvre.test.ts), with what you did with the helm and the sheets, and one line on what to
 * change.
 *
 * How it measures, as the table was measured: her progress through the water (her velocity less the current's) along
 * the wind's axis, upwind for a tack and downwind for a gybe, against a twin that sails on at her steady speed and angle
 * from before the turn. The loss is taken once she's back to speed (BACK: 90% of her speed before for a tack, 98% for a
 * gybe), 75 s after the turn began, or at your next turn, whichever is first, and set against the sim's own crew's
 * loss measured the same way (SIM_CREW).
 */

export type DrillKind = 'tack' | 'gybe';
export interface ManoeuvreScore {
  kind: DrillKind;
  /** The true wind (kt) and the sea (m) it was in. */
  tws: number; hs: number;
  /** Metres of progress lost against the twin; and what a good crew (the sim's own) loses, measured the same way. */
  lostM: number; goodM: number;
  /** The turn: from the wind's side to the other's (s), its mean and peak rate (°/s). */
  turnS: number; rate: number; peakRate: number;
  /** Seconds with her bow within 20° of the wind (a tack) or her stern within 20° of it (a gybe): the dead spot. */
  deadS: number;
  /** How far past the new close-hauled course she went (a tack), or past her new run angle toward a reach (a gybe) (°). */
  overshoot: number;
  /** When the jib came across (a tack) or the boom (a gybe), in seconds after head to wind (dead downwind): − before. */
  acrossS: number | null;
  /** Her lowest speed as a share of her speed before (0 … 1), and the seconds from the turn to back to speed (null: not in a minute). */
  minSpeed: number; backS: number | null;
  /** One plain line on what to change (or that it was good). */
  coach: string;
}

interface Sample { t: number; h: number; v: number; twa: number; jib: number; boom: number; px: number; py: number }

/** Steady before a turn: her rate of turn under this (°/s) for the last few seconds. */
const STEADY_RATE = 1.5, BEFORE_S = 4, MAX_S = 75;
/** Back to speed: a tack's when she's at 90% of her speed before (as a crew would call it); a gybe barely slows her, so 98%. */
const BACK: Record<DrillKind, number> = { tack: 0.9, gybe: 0.98 };

/** Each tracker's last 30 s of samples: kept off the tracker itself, so the race's copy on the page (sim/sync.ts, which
 * sends what changed each frame) isn't sent them; the page needs only the scores. */
const HIST = new WeakMap<DrillTracker, Sample[]>();

export class DrillTracker {
  /** Every manoeuvre scored, oldest first. */
  readonly list: ManoeuvreScore[] = [];
  private get hist(): Sample[] { let h = HIST.get(this); if (!h) HIST.set(this, h = []); return h; }
  private px = 0; private py = 0;
  private lastTack: Boat['tack'] | null = null;
  private lastSide = 0; // which side of dead downwind she's on (sign of twa), for a gybe
  private cur: null | {
    kind: DrillKind; t0: number; tFlip: number; h0: number; v0: number; twa0: number; vmg0: number; axis: { x: number; y: number }; tws: number; hs: number;
    p0: number; minV: number; peakRate: number; turnEnd: number | null; turned: number; deadS: number; overshoot: number; across: number | null;
    jibSign: number; boomSign: number; backAt: number | null; jibMine: boolean;
  } = null;

  /** Each sim step (world.ts), for your boat, with the sea's height there (m). */
  step(b: Boat, t: number, dt: number, hs = 0): void {
    // her progress through the water: her velocity less the current's (so the tide doesn't score her)
    this.px += (b.vx - b.cur.x) * dt; this.py += (b.vy - b.cur.y) * dt;
    const twa = wrap(b.ww.from - b.h); // (+: the wind on her starboard side)
    const s: Sample = { t, h: b.h, v: b.v, twa, jib: b.jib, boom: b.boom, px: this.px, py: this.py };
    this.hist.push(s); while (this.hist.length && t - this.hist[0].t > 30) this.hist.shift();
    // a tack: the tack flips through head to wind; a gybe: her stern crosses the wind (twa through ±180)
    const side = Math.sign(twa) || this.lastSide;
    const tacked = this.lastTack != null && b.tack !== this.lastTack && Math.abs(twa) < 90;
    const gybed = this.lastSide !== 0 && side !== this.lastSide && Math.abs(twa) > 120;
    this.lastTack = b.tack; this.lastSide = side;
    // (a new turn before the last is scored: the last is scored where it stands)
    if (this.cur && (tacked || gybed)) this.finish(s);
    if (!this.cur && (tacked || gybed)) this.begin(tacked ? 'tack' : 'gybe', b, t, hs);
    if (this.cur) this.follow(b, s, dt);
  }

  private begin(kind: DrillKind, b: Boat, tFlip: number, hs: number): void {
    // the turn began when she last held a steady heading; her speed and angle a moment before that are the twin's
    const H = this.hist, rateAt = (i: number) => i > 0 ? Math.abs(wrap(H[i].h - H[i - 1].h)) / Math.max(1e-3, H[i].t - H[i - 1].t) : 0;
    let i = H.length - 1;
    while (i > 1 && !(rateAt(i) < STEADY_RATE && rateAt(i - 1) < STEADY_RATE)) i--;
    const t0 = H[i].t, pre = H.filter(q => q.t >= t0 - BEFORE_S && q.t <= t0);
    const v0 = pre.reduce((a, q) => a + q.v, 0) / Math.max(1, pre.length), twa0 = pre.reduce((a, q) => a + Math.abs(q.twa), 0) / Math.max(1, pre.length);
    const up = V(b.ww.from), axis = kind === 'tack' ? up : { x: -up.x, y: -up.y };
    const start = H[i], first = pre[0] ?? start, proj = (q: Sample) => q.px * axis.x + q.py * axis.y;
    // the twin's rate of progress along the wind's axis: hers as measured just before the turn (her leeway included,
    // which v·cos(twa) would leave out)
    const vmg0 = start.t > first.t ? (proj(start) - proj(first)) / (start.t - first.t) : v0 * Math.abs(Math.cos(twa0 * D2R));
    this.cur = { kind, t0, tFlip, h0: start.h, v0, twa0, vmg0, axis, tws: b.ww.kt, hs, p0: start.px * axis.x + start.py * axis.y,
      minV: Math.min(...H.slice(i).map(q => q.v)), peakRate: Math.max(0, ...H.slice(i + 1).map((_, k) => rateAt(i + 1 + k))), turnEnd: null,
      turned: H.slice(i + 1).reduce((a, q, k) => a + Math.abs(wrap(q.h - H[i + k].h)), 0),
      deadS: 0, overshoot: 0, across: null, jibSign: Math.sign(start.jib), boomSign: Math.sign(start.boom), backAt: null, jibMine: byHand(b, 'jibsheet') || byHand(b, 'jibsheetW') };
    // the dead spot already passed through before the flip
    for (let k = i + 1; k < H.length; k++) this.cur.deadS += this.dead(kind, H[k].twa) ? H[k].t - H[k - 1].t : 0;
  }
  private dead(kind: DrillKind, twa: number): boolean { return kind === 'tack' && Math.abs(twa) < 20; } // (a gybe has no dead spot: she sails on through it)

  private follow(_b: Boat, s: Sample, dt: number): void {
    const c = this.cur!, prev = this.hist[this.hist.length - 2], rate = prev ? Math.abs(wrap(s.h - prev.h)) / Math.max(1e-3, s.t - prev.t) : 0;
    c.minV = Math.min(c.minV, s.v);
    if (c.turnEnd == null) {
      c.peakRate = Math.max(c.peakRate, rate); if (prev) c.turned += Math.abs(wrap(s.h - prev.h));
      if (s.t > c.tFlip && rate < STEADY_RATE) c.turnEnd = s.t;
    }
    if (this.dead(c.kind, s.twa)) c.deadS += dt;
    // past the new course: lower than close-hauled after a tack (her angle wider than the beat angle), or up toward a
    // reach after a gybe (narrower than her run angle), in the first 15 s after the flip
    if (s.t - c.tFlip < 15 && s.t > c.tFlip) {
      const a = Math.abs(s.twa), over = c.kind === 'tack' ? a - FOLKBOAT.beatAngle(c.tws) : FOLKBOAT.runAngle(c.tws) - a;
      c.overshoot = Math.max(c.overshoot, over);
    }
    // the jib (a tack) or the boom (a gybe) across: its side flips
    if (c.across == null) { const x = c.kind === 'tack' ? s.jib : s.boom, was = c.kind === 'tack' ? c.jibSign : c.boomSign; if (was && Math.sign(x) === -was && Math.abs(x) > 3) c.across = s.t - c.tFlip; }
    // back to speed: 90% of her speed before (as a crew would call it), when the score is given
    if (c.backAt == null && c.turnEnd != null && s.v >= BACK[c.kind] * c.v0) c.backAt = s.t;
    if (c.backAt != null || s.t - c.t0 >= MAX_S) this.finish(s);
  }

  private finish(s: Sample): void {
    const c = this.cur!; this.cur = null;
    const T = s.t - c.t0, made = s.px * c.axis.x + s.py * c.axis.y - c.p0, twin = c.vmg0 * T;
    // (drifting slowly through the eye, she may hold a steady heading either side of it: the turn lasts at least as long as she sat head to wind)
    const turnS = Math.max((c.turnEnd ?? s.t) - c.t0, c.deadS);
    const sc: ManoeuvreScore = {
      kind: c.kind, tws: c.tws, hs: c.hs, lostM: twin - made, goodM: simCrew(c.kind, c.tws).lostM * manoeuvreS(c.kind, c.tws, c.hs) / manoeuvreS(c.kind, c.tws, 0), // (in chop a tack costs more: the planner's factor)
      turnS, rate: c.turned / Math.max(0.1, turnS), peakRate: c.peakRate, deadS: c.deadS, overshoot: Math.max(0, c.overshoot),
      acrossS: c.across, minSpeed: c.minV / Math.max(0.1, c.v0), backS: c.backAt != null ? c.backAt - c.tFlip : null, coach: ''
    };
    sc.coach = coachLine(sc, c.jibMine);
    this.list.push(sc);
  }
}

/**
 * The sim's own crew, steering and trimming a tack or gybe themselves (physics.ts tackTarget), as this tracker measures
 * them, by the true wind (kt): [tws, seconds head to wind (within 20°), mean turn rate (°/s), lowest speed (share of
 * before), seconds back to speed (BACK; 75: not within the drill's 75 s), metres lost against the twin by then]. The
 * last is the drill's 'a good crew': you and the crew are measured the same way, at the same moment. (The passage
 * planner's MANOEUVRE_LOSS is the same loss carried on to full speed: a little more.) tests/drill.test.ts keeps it in step with the physics. The coaching figures are
 * set against these, because no published turn rate or recovery time for a Folkboat (or a like keelboat) was found:
 * only words ("too fast a turn and you throw off speed; too slow and you lose momentum": US Sailing, "Tacking Tips
 * Part I – The Turn").
 */
export const SIM_CREW: Record<DrillKind, [number, number, number, number, number, number][]> = {
  tack: [[3, 7.9, 4.5, 0.65, 75, 8.2], [4, 5.8, 6.0, 0.64, 60, 9.0], [6, 4.1, 8.1, 0.67, 36, 7.5], [8, 3.5, 9.3, 0.67, 24, 5.9], [12, 3.0, 10.6, 0.66, 16, 4.6], [16, 2.8, 11.1, 0.62, 15, 5.4], [20, 2.8, 11.1, 0.58, 14, 5.7], [25, 3.0, 10.4, 0.46, 16, 9.0]],
  gybe: [[3, 0, 3.2, 0.89, 57, 2.0], [4, 0, 4.1, 0.89, 48, 2.3], [6, 0, 5.6, 0.89, 33, 2.5], [8, 0, 6.6, 0.91, 25, 2.4], [12, 0, 7.5, 0.92, 18, 2.2], [16, 0, 6.4, 0.94, 13, 1.5], [20, 0, 7.1, 0.95, 11, 1.4], [25, 0, 7.4, 0.95, 10, 1.4]]
};
/** The sim crew's figures at `tws`, between the winds measured. */
export function simCrew(kind: DrillKind, tws: number): { dead: number; rate: number; minSpeed: number; back: number; lostM: number } {
  const T = SIM_CREW[kind]; let r = T[T.length - 1];
  if (tws <= T[0][0]) r = T[0];
  else for (let i = 1; i < T.length; i++) if (tws <= T[i][0]) { const f = (tws - T[i - 1][0]) / (T[i][0] - T[i - 1][0]); r = T[i - 1].map((v, k) => v + (T[i][k] - v) * f) as typeof r; break; }
  return { dead: r[1], rate: r[2], minSpeed: r[3], back: r[4], lostM: r[5] };
}
/** How far below close-hauled a good tack finishes, to build speed (°): about 5° in light air, 3° in a moderate breeze, on
 * course in a strong one (US Sailing, "Tacking Tips Part I – The Turn"). */
export const finishLow = (tws: number) => (tws < 8 ? 5 : tws <= 15 ? 3 : 0);

/** One plain line: the biggest thing to change, against the sim crew's own (SIM_CREW), or that it was good. */
export function coachLine(s: ManoeuvreScore, jibMine = false): string {
  const g = simCrew(s.kind, s.tws), lost = s.lostM - s.goodM;
  if (s.kind === 'tack') {
    if (s.deadS > 1.6 * g.dead) return `Too slow through the eye: ${s.deadS.toFixed(1)} s head to wind (a good crew ${g.dead.toFixed(1)} s), and she lost her way. Turn more firmly through it.`;
    if (s.rate > 1.5 * g.rate && s.minSpeed < g.minSpeed - 0.08) return `You turned too fast (${Math.round(s.rate)}°/s), and she stalled: roll through slower, about ${Math.round(g.rate)}°/s.`;
    if (s.overshoot > finishLow(s.tws) + 7) return `You went ${Math.round(s.overshoot)}° past close-hauled: stop the turn about ${finishLow(s.tws)}° low of the new close-hauled course, then come up as she builds speed.`;
    if (jibMine && s.acrossS != null && s.acrossS < -1) return 'You let the jib go too early: it blew to leeward and slowed the turn. Release it as it backs halfway across the foredeck.';
    if (jibMine && s.acrossS != null && s.acrossS > 2.5) return 'You held the old jib sheet too long: it backed against the rig like a brake. Release it as it backs halfway across.';
    if (s.backS != null && s.backS > 1.5 * g.back) return `Slow back to speed (${Math.round(s.backS)} s, a good crew ${Math.round(g.back)} s): foot off a little with the jib eased, then point once she's going.`;
  } else {
    if (s.overshoot > 20) return `You came ${Math.round(s.overshoot)}° up past the run after the gybe: meet her with the helm as the boom crosses.`;
    if (s.rate > 1.8 * g.rate) return `A fast gybe (${Math.round(s.rate)}°/s, a good crew ${Math.round(g.rate)}°/s): turn slower, and bring the main in before the boom comes across.`;
  }
  if (lost <= Math.max(1, 0.15 * s.goodM)) return `A good ${s.kind}: you lost ${Math.max(0, Math.round(s.lostM))} m, a good crew ${Math.round(s.goodM)} m.`;
  return `${s.kind === 'tack' ? 'Tack' : 'Gybe'}: ${Math.round(lost)} m more than a good crew. Keep it smooth: a steady turn and the sheets across on time.`;
}

/** A score's wind band, for the running bests: light (under 8 kt), medium (8–14), fresh (over 14). */
export const windBand = (tws: number): 'light' | 'medium' | 'fresh' => (tws < 8 ? 'light' : tws <= 14 ? 'medium' : 'fresh');
