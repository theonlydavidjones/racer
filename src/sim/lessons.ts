import type { Boat } from '../boat/boat';
import { KT, wrap, type Vec } from '../core/math';
import { beatFor } from '../boat/seaway';
import { DrillTracker } from './drill';

/**
 * Learn to sail (the owner's go, 13 Nov 2026; design/learn-to-sail-mockup.png and design/LEARN-TO-SAIL-PLAN.md): lessons
 * on the water for a first-timer, the skills of ASA 101 Keelboat Sailing 1 (the owner's ladder: its standard,
 * https://americansailing.com/wp-content/uploads/2025/01/Certification-ASA-101-Standards.pdf, checked item by item in
 * design/ASA-101-CHECK.md), first drawn from US Sailing's Basic Keelboat (5 to 15 knots:
 * https://www.ussailing.org/education/adult/certification-courses-endorsements/basic-keelboat/; ASA 101: "winds up to
 * 15 knots"). Each
 * lesson is a few steps; each step has one cue (the only text on the water: it goes in the coach box) and a check the
 * sim makes from the boat itself. The lesson is passed when its last step's check holds.
 *
 * The pass marks are proposals, to be tuned with the owner on the water (LESSON_MARKS): nothing in the standard gives
 * numbers for them, which an instructor judges by eye.
 */

export type LessonId = 'tiller' | 'points' | 'irons' | 'tacking' | 'jibing' | 'heaveto';
/** The lessons, each with the ASA 101 standard's items it practices (design/ASA-101-CHECK.md; "—": beyond 101, from US
 * Sailing's Basic Keelboat). */
export const LESSONS: { id: LessonId; no: number; title: string; icon: string; asa: string }[] = [
  { id: 'tiller', no: 3, title: 'The tiller', icon: '🧭', asa: '24, 26, 27' },
  { id: 'points', no: 4, title: 'Points of sail', icon: '🎏', asa: '22, 28–32' },
  { id: 'irons', no: 5, title: 'Stop, go, irons', icon: '🛑', asa: '25' },
  { id: 'tacking', no: 6, title: 'Tacking', icon: '↩️', asa: '5, 33' },
  { id: 'jibing', no: 7, title: 'Jibing', icon: '↪️', asa: '5, 34' },
  { id: 'heaveto', no: 8, title: 'Heave to', icon: '⚓', asa: '—' }
];
/** The lessons that start by a buoy (the tiller's, steered for; stop, go and irons', stopped by). */
export const BUOY_LESSONS: ReadonlySet<LessonId> = new Set(['tiller', 'irons']);

/** A lesson's wind (kt): the course-wide mean held to the Basic Keelboat standard's range, "a wind range of 5 to 15
 * knots" (US Sailing, the page above; the owner, 13 Nov 2026: clamp it, keeping the real direction and gusts). The puffs
 * and gusts ride on the mean as they do on any day, so a gust can reach a little past 15. */
export const LESSON_WIND: [number, number] = [5, 15];

/** The pass marks (proposals for the owner to tune: see above). */
export const LESSON_MARKS = {
  /** The tiller: reach the buoy within this (m); then hold the given course within HOLD_DEG for HOLD_S. */
  buoyM: 15, holdDeg: 10, holdS: 60,
  /** Points of sail: each point held this long (s) with both sails drawing (telltales streaming, or a run's full sails);
   * a moment off (a puff or a shift flicks the flow) takes back twice its length, not the whole hold. On a run the
   * telltales just hang (boat/trim.ts calls any run's flow good), so there the sails must be eased to draw: each sail's
   * efficiency at least RUN_EFF (a sheet pinned in gives 0.8–0.9). */
  pointS: 15, runEff: 0.95,
  /** Stop, go, irons: stopped (under STOP_KT) within STOP_M of the buoy for STOP_S; going again (over GO_KT); in irons
   * (bow within IRONS_TWA of the wind, under STOP_KT) for STOP_S; and out of irons, sailing (TWA over OUT_TWA, over GO_KT)
   * within OUT_S of getting in. */
  stopM: 25, stopKt: 0.5, stopS: 3, goKt: 2, ironsTwa: 25, outTwa: 50, outS: 30,
  /** Tacking and jibing: this many good ones (scored by the tack and gybe drill's own measure, sim/drill.ts: from a steady
   * course, back to speed within its time); a jibe also without rounding up past GYBE_OVER (deg) after it. */
  turns: 3, gybeOver: 25,
  /** Heave to: hove to (the physics' own state: the jib aback, boat/physics.ts heaveTo) and under HOVE_KT for HOVE_S. */
  hoveKt: 1, hoveS: 60
};
/** Each lesson's first cue. */
const FIRST: Record<LessonId, string> = {
  tiller: 'Steer for the buoy', points: '', irons: 'Sail to the buoy and stop by it: ease both sheets',
  tacking: '"Ready about" … "Hard alee": tack (0 of 3)', jibing: 'Bear away to a run. "Ready to jibe" … "Jibe-ho" (0 of 3)', heaveto: 'Heave to: tack, leave the jib aback, tiller to leeward'
};

/** The five points of sail ASA 101 asks a sailor to sail (its skills 28–32: close hauled, close reach, beam reach,
 * broad reach, run; https://americansailing.com/wp-content/uploads/2025/01/Certification-ASA-101-Standards.pdf), each
 * by its true wind angle (deg, either tack): the band a sailor would call by that name. Close-hauled is the boat's own
 * beat angle in this wind and sea (boat/seaway.ts beatFor: about 41° in 12 kt), from a little above it (pinching) to a
 * few degrees below; a close reach is between that and a beam reach; a broad reach the wind on the quarter; a run the
 * wind from astern, 160° to 180°. */
const POINTS: { key: 'close' | 'closeReach' | 'beam' | 'broad' | 'run'; band: (b: Boat) => [number, number]; cue: string }[] = [
  { key: 'close', band: b => { const a = beatFor(b); return [a - 3, a + 7]; }, cue: 'Close-hauled: trim till both telltales stream' },
  { key: 'closeReach', band: b => [beatFor(b) + 12, 70], cue: 'Bear away a little to a close reach, and ease to match' },
  { key: 'beam', band: () => [80, 100], cue: 'Bear away to a beam reach: the wind on the side' },
  { key: 'broad', band: () => [115, 150], cue: 'Bear away to a broad reach: the wind on the quarter' },
  { key: 'run', band: () => [160, 180], cue: 'Bear away to a run: sheets out, wind from astern' }
];

export class LessonTracker {
  readonly id: LessonId;
  /** The step reached (0 …), the one cue line for it, and the share of its check done (0 … 1). */
  step = 0; cue = ''; progress = 0;
  /** True once the lesson's last check held; when (race time). */
  passed = false; passedT: number | null = null;
  /** The tiller: the buoy to steer for, and then the course to hold (deg, by the compass). */
  readonly buoy: Vec | null;
  course: number | null = null;
  /** Tacking and jibing: the good ones so far, scored by the tack and gybe drill's own tracker. */
  good = 0;
  readonly turns: DrillTracker | null;
  private held = 0; private seen = 0; private ironsT = 0;

  constructor(id: LessonId, buoy: Vec | null) {
    this.id = id; this.buoy = BUOY_LESSONS.has(id) ? buoy : null;
    this.cue = FIRST[id] || POINTS[0].cue;
    this.turns = id === 'tacking' || id === 'jibing' ? new DrillTracker() : null;
  }

  update(b: Boat, t: number, dt: number, hs = 0): void {
    if (this.passed) return;
    if (this.id === 'tiller') this.tiller(b, dt);
    else if (this.id === 'points') this.points(b, dt);
    else if (this.id === 'irons') this.irons(b, t, dt);
    else if (this.id === 'heaveto') this.heaveTo(b, dt);
    else this.turning(b, t, dt, hs);
    if (this.passed) { this.passedT = t; this.cue = 'Lesson passed ✓'; this.progress = 1; }
  }

  private tiller(b: Boat, dt: number): void {
    if (this.step === 0) {
      const d = this.buoy ? Math.hypot(b.x - this.buoy.x, b.y - this.buoy.y) : 0;
      this.progress = 0;
      if (d <= LESSON_MARKS.buoyM) {
        // at the buoy: the course to hold is the one she's on, to the nearest 5° (a compass course a helm can read)
        this.step = 1; this.course = ((Math.round(b.h / 5) * 5) % 360 + 360) % 360; this.held = 0;
        this.cue = `Hold ${String(this.course).padStart(3, '0')}° on the compass`;
      }
      return;
    }
    const off = Math.abs(wrap(b.h - this.course!));
    this.held = off <= LESSON_MARKS.holdDeg && b.v > 0.5 * KT ? this.held + dt : 0; // (off course, or stopped: start again)
    this.progress = Math.min(1, this.held / LESSON_MARKS.holdS);
    if (this.held >= LESSON_MARKS.holdS) this.passed = true;
  }

  private points(b: Boat, dt: number): void {
    const P = POINTS[this.step], twa = b.twa, [lo, hi] = P.band(b);
    // drawing: on the point, under way, and each sail's flow good; on a run, each sail eased to draw (see LESSON_MARKS)
    const good = (t: { flow: string; eff: number } | null) => !t || (P.key === 'run' ? t.eff >= LESSON_MARKS.runEff : t.flow === 'good');
    const drawing = twa >= lo && twa <= hi && b.v > 0.8 * KT && good(b.trim.main) && good(b.trim.jib);
    this.held = drawing ? this.held + dt : Math.max(0, this.held - 2 * dt);
    this.progress = Math.min(1, this.held / LESSON_MARKS.pointS);
    if (this.held < LESSON_MARKS.pointS) return;
    this.held = 0;
    if (this.step === POINTS.length - 1) { this.passed = true; return; }
    this.step++; this.cue = POINTS[this.step].cue; this.progress = 0;
  }

  /** A check held for `need` seconds, a moment off taking back twice its length (as on the points of sail). */
  private hold(ok: boolean, dt: number, need: number): boolean {
    this.held = ok ? this.held + dt : Math.max(0, this.held - 2 * dt);
    this.progress = Math.min(1, this.held / need);
    if (this.held < need) return false;
    this.held = 0; return true;
  }

  private irons(b: Boat, t: number, dt: number): void {
    const M = LESSON_MARKS, kt = b.v / KT, twa = b.twa;
    if (this.step === 0) {
      const d = this.buoy ? Math.hypot(b.x - this.buoy.x, b.y - this.buoy.y) : 0;
      if (this.hold(d <= M.stopM && kt < M.stopKt, dt, M.stopS)) { this.step = 1; this.cue = 'Get going again: trim in'; }
    } else if (this.step === 1) {
      if (this.hold(kt > M.goKt, dt, M.stopS)) { this.step = 2; this.cue = 'Turn head to wind and stop: you\'re in irons'; }
    } else if (this.step === 2) {
      if (this.hold(twa < M.ironsTwa && kt < M.stopKt, dt, M.stopS)) { this.step = 3; this.ironsT = t; this.cue = 'Back the jib to get out of irons'; }
    } else {
      // out: sailing on either tack, and in time; too long, and it's back into irons to try again
      if (this.hold(twa > M.outTwa && kt > M.goKt, dt, M.stopS)) { this.passed = true; return; }
      this.progress = Math.max(0, 1 - (t - this.ironsT) / M.outS);
      if (t - this.ironsT > M.outS + M.stopS) { this.step = 2; this.held = 0; this.cue = 'Again: head to wind and stop'; }
    }
  }

  private turning(b: Boat, t: number, dt: number, hs: number): void {
    const D = this.turns!, kind = this.id === 'tacking' ? 'tack' : 'gybe';
    D.step(b, t, dt, hs);
    for (; this.seen < D.list.length; this.seen++) {
      const s = D.list[this.seen];
      if (s.kind === kind && s.scored && s.backS != null && (kind === 'tack' || s.overshoot < LESSON_MARKS.gybeOver)) this.good++;
    }
    this.progress = this.good / LESSON_MARKS.turns;
    if (this.good >= LESSON_MARKS.turns) { this.passed = true; return; }
    // (the helm's commands, as ASA 101 teaches them, its knowledge 5)
    this.cue = kind === 'tack' ? `"Ready about" … "Hard alee": tack (${this.good} of ${LESSON_MARKS.turns})` : `Bear away to a run. "Ready to jibe" … "Jibe-ho" (${this.good} of ${LESSON_MARKS.turns})`;
  }

  private heaveTo(b: Boat, dt: number): void {
    const on = !!b.hove && b.v / KT < LESSON_MARKS.hoveKt;
    if (on && this.step === 0) { this.step = 1; this.cue = 'Hove to: sit there a minute'; }
    if (this.hold(on, dt, LESSON_MARKS.hoveS)) this.passed = true;
  }
}
