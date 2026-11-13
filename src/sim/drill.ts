import type { Boat } from '../boat/boat';
import { FOLKBOAT } from '../boat/polar';
import { byHand } from '../boat/physics';
import { beatFor } from '../boat/seaway';
import { D2R, KT, V, wrap } from '../core/math';

/**
 * The tack and gybe drill (a training tool: docs/VISION-ROADMAP.md; the owner's go, 13 Nov 2026): every tack and gybe
 * you make, scored against what the sim's own crew loses in one, measured the same way, with what you did with the
 * helm and the sheets, and one line on what to change.
 *
 * How it measures, as the passage planner's MANOEUVRE_LOSS was measured (routing.ts; tests/manoeuvre.test.ts), against
 * a twin that sails on:
 * - her progress through the water (her velocity less the current's, so the tide doesn't score her) along the wind's
 *   axis as it is each moment (upwind for a tack, downwind for a gybe);
 * - the twin's, in the same wind: her own share (η) of the polar's best VMG, measured over the steady seconds before the
 *   turn, times the polar's best VMG in the wind as it is each moment. A puff or a shift reaches both alike, so tacking
 *   on a header isn't scored as a loss, nor a lift as a gain;
 * - taken once she's back to speed (BACK: 90% of her speed before for a tack, 98% for a gybe), 75 s after the turn
 *   began, or at your next turn, whichever is first.
 * Only a real manoeuvre is scored: from a steady course (her heading steady for BEFORE_S), close-hauled or near it for a
 * tack (twa ≤ 70°), on a run for a gybe (≥ 120°), under way (over 1 kt), under sail, her own steering, not hove to
 * (the jib left aback after the tack); a
 * turn that starts otherwise is noted, not scored. A wind shift that flips the tack with no turn isn't counted at all.
 */

export type DrillKind = 'tack' | 'gybe';
export interface ManoeuvreScore {
  kind: DrillKind;
  /** False: noted, not scored (it didn't start from a steady course on that point of sail); `coach` says why. */
  scored: boolean;
  /** The true wind (kt) and the sea (m) it was in. */
  tws: number; hs: number;
  /** Metres of progress lost against the twin; and what a good crew (the sim's own) loses, measured the same way. */
  lostM: number; goodM: number;
  /** The turn: from the wind's side to the other's (s), its mean and peak rate (°/s). */
  turnS: number; rate: number; peakRate: number;
  /** Seconds with her bow within 20° of the wind (a tack): the dead spot. */
  deadS: number;
  /** How far past the new course she went (°): wider than the crew's own close-hauled heading after a tack (physics.ts
   * tackTarget), or up from the mirror of her run angle after a gybe. */
  overshoot: number;
  /** When the jib came across (a tack) or the boom (a gybe), in seconds after head to wind (dead downwind). */
  acrossS: number | null;
  /** Whether the jib backed in the tack (it fills on the old windward side as she passes head to wind: released early, it doesn't). */
  jibBacked: boolean;
  /** Her lowest speed as a share of her speed before (0 … 1), and the seconds from the turn to back to speed (null: not within the drill's time). */
  minSpeed: number; backS: number | null;
  /** One plain line on what to change (or that it was good, or why it wasn't scored). */
  coach: string;
}

interface Sample { t: number; h: number; v: number; twa: number; jib: number; boom: number; wx: number; wy: number; from: number; tws: number; rate: number }

/** Steady before a turn: her rate of turn under STEADY_RATE (°/s) for BEFORE_S seconds. */
const STEADY_RATE = 1.5, BEFORE_S = 4, MAX_S = 75, MIN_V = 1 * KT;
/** Back to speed: a tack's when she's at 90% of her speed before (as a crew would call it); a gybe barely slows her, so 98%. */
const BACK: Record<DrillKind, number> = { tack: 0.9, gybe: 0.98 };
/** The polar's best VMG (m/s) along the wind's axis, upwind or down, in `tws` kt. */
function bestVmg(kind: DrillKind, tws: number): number {
  const a = kind === 'tack' ? FOLKBOAT.beatAngle(tws) : FOLKBOAT.runAngle(tws);
  return FOLKBOAT.speedKt(tws, a) * KT * Math.abs(Math.cos(a * D2R));
}
/** Her velocity through the water along the wind's axis as it is (+ toward where she's making: upwind, or downwind). */
const along = (kind: DrillKind, q: Sample) => { const u = V(q.from), k = kind === 'tack' ? 1 : -1; return k * (q.wx * u.x + q.wy * u.y); };

/** Each tracker's last 30 s of samples: kept off the tracker itself, so the race's copy on the page (sim/sync.ts, which
 * sends what changed each frame) isn't sent them; the page needs only the scores. */
const HIST = new WeakMap<DrillTracker, Sample[]>();

export class DrillTracker {
  /** Every manoeuvre scored (or noted), oldest first. */
  readonly list: ManoeuvreScore[] = [];
  private get hist(): Sample[] { let h = HIST.get(this); if (!h) HIST.set(this, h = []); return h; }
  private lastTack: Boat['tack'] | null = null;
  private lastSide = 0; // which side of dead downwind she's on (sign of twa), for a gybe
  private cur: null | {
    kind: DrillKind; t0: number; tFlip: number; v0: number; twa0: number; eta: number; tws: number; hs: number; ref: number;
    made: number; twin: number; minV: number; peakRate: number; turnEnd: number | null; slowSince: number | null; turned: number; deadS: number;
    overshoot: number; across: number | null; jibSign: number; boomSign: number; backAt: number | null; jibMine: boolean; backed: number; abackS: number;
  } = null;

  /** Each sim step (world.ts), for your boat, with the sea's height there (m). */
  step(b: Boat, t: number, dt: number, hs = 0): void {
    // not hers to score: in her slip or being walked out, under power, on the tiller pilot (hove to: see finish)
    if (b.docked || b.pushing || b.motor?.running || b.pilotSteers) { this.cur = null; this.hist.length = 0; this.lastTack = b.tack; this.lastSide = 0; return; }
    const H = this.hist, prev = H[H.length - 1], twa = wrap(b.ww.from - b.h); // (+: the wind on her starboard side)
    const rate = prev ? Math.abs(wrap(b.h - prev.h)) / Math.max(1e-3, t - prev.t) : 0;
    const s: Sample = { t, h: b.h, v: b.v, twa, jib: b.jib, boom: b.boom, wx: b.vx - b.cur.x, wy: b.vy - b.cur.y, from: b.ww.from, tws: b.ww.kt, rate };
    H.push(s); while (H.length && t - H[0].t > 30) H.shift();
    // a tack: the tack flips through head to wind; a gybe: her stern crosses the wind (twa through ±180)
    const side = Math.sign(twa) || this.lastSide;
    const tacked = this.lastTack != null && b.tack !== this.lastTack && Math.abs(twa) < 90;
    const gybed = this.lastSide !== 0 && side !== this.lastSide && Math.abs(twa) > 120;
    this.lastTack = b.tack; this.lastSide = side;
    // (a new turn before the last is scored: the last is scored where it stands)
    if (this.cur && (tacked || gybed)) this.finish(s);
    if (tacked || gybed) this.begin(tacked ? 'tack' : 'gybe', b, hs);
    else if (this.cur) this.follow(b, s, dt);
  }

  private begin(kind: DrillKind, b: Boat, hs: number): void {
    const H = this.hist, tFlip = H[H.length - 1].t;
    // the turn began at the end of the last BEFORE_S seconds she held a steady heading: search back from the flip
    let j = H.length - 1, steadyFrom = -1;
    for (; j > 0; j--) {
      if (H[j].rate < STEADY_RATE) { if (steadyFrom < 0) steadyFrom = j; if (H[steadyFrom].t - H[j].t >= BEFORE_S) break; }
      else steadyFrom = -1;
    }
    const ok = j > 0 && steadyFrom > 0;
    const start = ok ? steadyFrom : H.length - 1, pre = ok ? H.slice(j, steadyFrom + 1) : [];
    const mean = (f: (q: Sample) => number) => pre.reduce((a, q) => a + f(q), 0) / Math.max(1, pre.length);
    const v0 = mean(q => q.v), twa0 = mean(q => Math.abs(q.twa)), tws0 = mean(q => q.tws);
    const note = (why: string) => this.list.push({ kind, scored: false, tws: b.ww.kt, hs, lostM: 0, goodM: 0, turnS: 0, rate: 0, peakRate: 0, deadS: 0, overshoot: 0, acrossS: null, jibBacked: false, minSpeed: 1, backS: null, coach: why });
    if (!ok) { note(`${kind === 'tack' ? 'Tack' : 'Gybe'} not scored: hold a steady course for a few seconds first, so there's a speed to measure it against.`); return; }
    if (v0 < MIN_V) { note(`${kind === 'tack' ? 'Tack' : 'Gybe'} not scored: get her moving first (she was under 1 kt).`); return; }
    if (kind === 'tack' && twa0 > 70) { note('Tack not scored: start it from close-hauled (it began from a reach). Come up to close-hauled, settle, then tack.'); return; }
    if (kind === 'gybe' && twa0 < 120) { note('Gybe not scored: bear away to a run first and settle there (it began from a reach or the wind), then gybe.'); return; }
    // her share of the polar's best VMG before the turn: the twin sails on at it, in whatever wind comes
    const eta = mean(q => along(kind, q)) / Math.max(0.05, bestVmg(kind, tws0));
    // the new course to measure past: the crew's own close-hauled heading after a tack (physics.ts tackTarget: the
    // chop's beat angle less her leeway, or her old angle if she tacked from a close reach), the mirror of her run after a gybe
    const ref = kind === 'tack' ? Math.max(beatFor(b) - (b.leeway ?? 0), Math.min(twa0, 60)) : twa0;
    const c = this.cur = { kind, t0: H[start].t, tFlip, v0, twa0, eta, tws: b.ww.kt, hs, ref, made: 0, twin: 0, minV: Infinity, peakRate: 0, turnEnd: null as number | null,
      slowSince: null as number | null, turned: 0, deadS: 0, overshoot: 0, across: null as number | null, jibSign: Math.sign(H[start].jib), boomSign: Math.sign(H[start].boom), backAt: null as number | null,
      jibMine: byHand(b, 'jibsheet') || byHand(b, 'jibsheetW'), backed: 0, abackS: 0 };
    // the turn so far, from its start to the flip
    for (let k = start + 1; k < H.length; k++) this.account(c, H[k], H[k].t - H[k - 1].t, b);
  }
  private account(c: NonNullable<DrillTracker['cur']>, s: Sample, dt: number, b: Boat): void {
    c.made += along(c.kind, s) * dt; c.twin += c.eta * bestVmg(c.kind, s.tws) * dt;
    c.minV = Math.min(c.minV, s.v);
    if (c.turnEnd == null) {
      c.peakRate = Math.max(c.peakRate, s.rate); c.turned += s.rate * dt;
      // the turn's over once she's held her heading for a second after the flip (a wave's yaw can still it for a moment)
      if (s.t > c.tFlip && s.rate < STEADY_RATE) { c.slowSince ??= s.t; if (s.t - c.slowSince >= 1) c.turnEnd = c.slowSince; } else c.slowSince = null;
    }
    if (c.kind === 'tack' && Math.abs(s.twa) < 20) c.deadS += dt;
    if (s.t <= c.tFlip + 4) c.backed = Math.max(c.backed, b.jibBacked ?? 0);
    else if ((b.jibBacked ?? 0) > 0.2) c.abackS += dt; // (still aback well after the tack: she's heaving to)
    // past the new course in the first 15 s after the flip: wider than close-hauled after a tack, up from the run after a gybe
    if (s.t > c.tFlip && s.t - c.tFlip < 15) c.overshoot = Math.max(c.overshoot, c.kind === 'tack' ? Math.abs(s.twa) - c.ref : c.ref - Math.abs(s.twa));
    // the jib (a tack) or the boom (a gybe) across: its side flips
    if (c.across == null) { const x = c.kind === 'tack' ? s.jib : s.boom, was = c.kind === 'tack' ? c.jibSign : c.boomSign; if (was && Math.sign(x) === -was && Math.abs(x) > 3) c.across = s.t - c.tFlip; }
    if (c.backAt == null && c.turnEnd != null && s.v >= BACK[c.kind] * c.v0) c.backAt = s.t;
  }

  private follow(b: Boat, s: Sample, dt: number): void {
    const c = this.cur!;
    this.account(c, s, dt, b);
    if (c.backAt != null || s.t - c.t0 >= MAX_S) this.finish(s);
  }

  private finish(s: Sample): void {
    const c = this.cur!; this.cur = null;
    // a wind shift that flipped the tack (or the run) with hardly a turn, or a gybe in which the boom never crossed:
    // not a manoeuvre (a gybe from a dead run is a small turn, about 12° in a breeze: the boom crossing is what counts)
    // (a tack stuck in irons turns little but sits head to wind: that's scored, and told so)
    if (c.kind === 'tack' ? c.turned < 40 && c.deadS < 5 : c.turned < 6 || c.across == null) return;
    // the jib left aback after the tack: hove to, not a tack to score (physics.ts heaveTo)
    if (c.kind === 'tack' && c.abackS >= 5) return;
    // (drifting slowly through the eye, she may hold a steady heading either side of it: the turn lasts at least as long as she sat head to wind)
    const turnS = Math.max((c.turnEnd ?? s.t) - c.t0, c.deadS);
    const sc: ManoeuvreScore = {
      kind: c.kind, scored: true, tws: c.tws, hs: c.hs, lostM: c.twin - c.made, goodM: simCrew(c.kind, c.tws).lostM,
      turnS, rate: c.turned / Math.max(0.1, turnS), peakRate: c.peakRate, deadS: c.deadS, overshoot: Math.max(0, c.overshoot),
      acrossS: c.across, jibBacked: c.backed > 0.05, minSpeed: c.minV / Math.max(0.1, c.v0), backS: c.backAt != null ? c.backAt - c.tFlip : null, coach: ''
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
 * set against these, because no published turn rate or recovery time exists for a Folkboat (or a like keelboat): a
 * search of coaching texts found none,
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

/** One plain line: the biggest thing to change, against the sim crew's own (SIM_CREW), or that it was good. (The sim's
 * rudder doesn't yet brake as a real one does at full helm, so a hard spin costs little more than a good tack: the
 * 'turned too fast' line rarely fires. With Deep Physics. And no 'let the jib go too early': the sim crew itself lets it go
 * at head to wind, before it backs, so there's no honest signal for it yet.) */
export function coachLine(s: ManoeuvreScore, jibMine = false): string {
  const g = simCrew(s.kind, s.tws), lost = s.lostM - s.goodM;
  if (s.kind === 'tack') {
    if (s.deadS > 1.6 * g.dead) return `Too slow through the eye: ${s.deadS.toFixed(1)} s head to wind (a good crew ${g.dead.toFixed(1)} s), and she lost her way. Turn more firmly through it.`;
    if (s.rate > 1.5 * g.rate && s.minSpeed < g.minSpeed - 0.08) return `You turned too fast (${Math.round(s.rate)}°/s), and she stalled: roll through slower, about ${Math.round(g.rate)}°/s.`;
    if (s.overshoot > finishLow(s.tws) + 7) return `You went ${Math.round(s.overshoot)}° past close-hauled: stop the turn about ${finishLow(s.tws)}° low of the new close-hauled course, then come up as she builds speed.`;
    if (jibMine && s.acrossS != null && s.acrossS > 2.5) return 'You held the old jib sheet too long: it backed against the rig like a brake. Release it as it backs halfway across.';
    if (s.backS != null && s.backS > 1.5 * g.back) return `Slow back to speed (${Math.round(s.backS)} s, a good crew ${Math.round(g.back)} s): foot off a little with the jib eased, then point once she's going.`;
  } else {
    if (s.overshoot > 20) return `You came ${Math.round(s.overshoot)}° up past the run after the gybe: meet her with the helm as the boom crosses.`;
    if (s.rate > 1.8 * g.rate) return `A fast gybe (${Math.round(s.rate)}°/s, a good crew ${Math.round(g.rate)}°/s): turn slower, and bring the main in before the boom comes across.`;
  }
  // (good: within what the measure itself wanders, ±2–3 m in the Bay's shifts and puffs with no turn at all: the physics review)
  if (lost <= Math.max(2.5, 0.15 * s.goodM)) return `A good ${s.kind}: you lost ${Math.max(0, Math.round(s.lostM))} m, a good crew ${Math.round(s.goodM)} m.`;
  return `${s.kind === 'tack' ? 'Tack' : 'Gybe'}: ${Math.round(lost)} m more than a good crew. Keep it smooth: a steady turn and the sheets across on time.`;
}

/** A score's wind band, for the running bests: light (under 8 kt), medium (8–14), fresh (over 14). */
export const windBand = (tws: number): 'light' | 'medium' | 'fresh' => (tws < 8 ? 'light' : tws <= 14 ? 'medium' : 'fresh');
