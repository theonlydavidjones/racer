import type { Boat } from '../boat/boat';
import { KT, wrap, type Vec } from '../core/math';

/**
 * Learn to sail (the owner's go, 13 Nov 2026; design/learn-to-sail-mockup.png and design/LEARN-TO-SAIL-PLAN.md): lessons
 * on the water for a first-timer, built on US Sailing's Basic Keelboat standard (its skill groups, and its wind range of
 * 5 to 15 knots: https://www.ussailing.org/education/adult/certification-courses-endorsements/basic-keelboat/). Each
 * lesson is a few steps; each step has one cue (the only text on the water: it goes in the coach box) and a check the
 * sim makes from the boat itself. The lesson is passed when its last step's check holds.
 *
 * The pass marks are proposals, to be tuned with the owner on the water (LESSON_MARKS): nothing in the standard gives
 * numbers for them, which an instructor judges by eye.
 */

export type LessonId = 'tiller' | 'points';
export const LESSONS: { id: LessonId; no: number; title: string; icon: string; bk: string }[] = [
  { id: 'tiller', no: 3, title: 'The tiller', icon: '🧭', bk: 'boat control' },
  { id: 'points', no: 4, title: 'Points of sail', icon: '🎏', bk: 'open water, trim' }
];

/** The pass marks (proposals for the owner to tune: see above). */
export const LESSON_MARKS = {
  /** The tiller: reach the buoy within this (m); then hold the given course within HOLD_DEG for HOLD_S. */
  buoyM: 15, holdDeg: 10, holdS: 60,
  /** Points of sail: each point held this long (s) with both sails drawing (telltales streaming, or a run's full sails). */
  pointS: 15
};

/** Each point of sail by its true wind angle (deg, either tack): the band a sailor would call by that name. */
const POINTS: { key: 'close' | 'beam' | 'run'; lo: number; hi: number; cue: string }[] = [
  { key: 'close', lo: 35, hi: 55, cue: 'Close-hauled: trim till both telltales stream' },
  { key: 'beam', lo: 75, hi: 105, cue: 'Bear away to a beam reach, and ease to match' },
  { key: 'run', lo: 150, hi: 180, cue: 'Bear away to a run: sheets out, wind from astern' }
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
  private held = 0;

  constructor(id: LessonId, buoy: Vec | null) {
    this.id = id; this.buoy = id === 'tiller' ? buoy : null;
    this.cue = id === 'tiller' ? 'Steer for the buoy' : POINTS[0].cue;
  }

  update(b: Boat, t: number, dt: number): void {
    if (this.passed) return;
    if (this.id === 'tiller') this.tiller(b, dt);
    else this.points(b, dt);
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
    const P = POINTS[this.step], twa = Math.abs(b.twa);
    // drawing: on the point, under way, and each sail's flow good (on a run the trim model calls a full sail good: the
    // telltales just hang there, boat/trim.ts)
    const drawing = twa >= P.lo && twa <= P.hi && b.v > 0.8 * KT && b.trim.main.flow === 'good' && (!b.trim.jib || b.trim.jib.flow === 'good');
    this.held = drawing ? this.held + dt : 0;
    this.progress = Math.min(1, this.held / LESSON_MARKS.pointS);
    if (this.held < LESSON_MARKS.pointS) return;
    this.held = 0;
    if (this.step === POINTS.length - 1) { this.passed = true; return; }
    this.step++; this.cue = POINTS[this.step].cue; this.progress = 0;
  }
}
