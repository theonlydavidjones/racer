import type { Boat } from '../boat/boat';
import { KT, V, wrap, type Vec } from '../core/math';
import { beatFor } from '../boat/seaway';
import { DrillTracker } from './drill';
import { byHand } from '../boat/physics';
import { TRAVELLER_SWING } from '../boat/controls';
import { inBasin } from '../geo/marina';

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

export type LessonId = 'mob' | 'tiller' | 'points' | 'irons' | 'tacking' | 'jibing' | 'heaveto' | 'breeze' | 'home' | 'before';
/** The lessons, each with the ASA 101 standard's items it practices (design/ASA-101-CHECK.md; "—": beyond 101, from US
 * Sailing's Basic Keelboat). */
export const LESSONS: { id: LessonId; no: number; title: string; icon: string; asa: string }[] = [
  { id: 'before', no: 2, title: 'Before you go', icon: '🦺', asa: '16, 17, 18, 21' },
  { id: 'tiller', no: 3, title: 'The tiller', icon: '🧭', asa: '24, 26, 27' },
  { id: 'points', no: 4, title: 'Points of sail', icon: '🎏', asa: '22, 28–32' },
  { id: 'irons', no: 5, title: 'Stop, go, irons', icon: '🛑', asa: '25' },
  { id: 'tacking', no: 6, title: 'Tacking', icon: '↩️', asa: '5, 33' },
  { id: 'jibing', no: 7, title: 'Jibing', icon: '↪️', asa: '5, 34' },
  { id: 'heaveto', no: 8, title: 'Heave to', icon: '⚓', asa: '—' },
  { id: 'mob', no: 10, title: 'Crew overboard', icon: '🆘', asa: '36' },
  { id: 'breeze', no: 11, title: 'A breeze', icon: '💨', asa: '—' },
  { id: 'home', no: 12, title: 'Home to the slip', icon: '🏁', asa: '23, 38' }
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
   * efficiency at least RUN_EFF (a sheet pinned in gives 0.8–0.9). On a broad reach the jib, at its sheet's full ease,
   * still reads stalled until the apparent wind is about 112° (boat/trim.ts), so there it counts when it draws at
   * BROAD_JIB_EFF or better and the main's flow is good. */
  pointS: 15, runEff: 0.95, broadJibEff: 0.85,
  /** Stop, go, irons: stopped (under STOP_KT through the water, ahead or astern) within STOP_M of the buoy for STOP_S;
   * going again (over GO_KT); in irons (bow within IRONS_TWA of the wind, stopped) for STOP_S; and out of irons, sailing
   * (TWA over OUT_TWA, over OUT_KT) within OUT_S. From a standing start a Folkboat takes 15–30 s to make way in 5–12 kt
   * and the bow comes round slowly as she gathers sternway (the physics review's measure, 14 Nov 2026), so OUT_S is
   * generous, and while she's coming round and gathering way the clock doesn't send her back. */
  stopM: 25, stopKt: 0.5, stopS: 3, goKt: 2, ironsTwa: 25, outTwa: 50, outKt: 1.2, outS: 120,
  /** Tacking and jibing: this many good ones (scored by the tack and jibe drill's own measure, sim/drill.ts: from a steady
   * course, back to speed within its time); a jibe ending still off the wind (TWA at least JIBE_TWA when it's scored),
   * not rounded up to a reach. */
  turns: 3, jibeTwa: 120,
  /** Heave to: hove to (the physics' own state: the jib aback, boat/physics.ts heaveTo) and forereaching no faster than
   * HOVE_KT, for HOVE_S. A hove-to Folkboat forereaches about 1–1.5 kt (physics.ts: 0.7 kn in 8 kt, 1.5 in 20; peaks
   * near 2), so the mark is 2 kt. */
  hoveKt: 2, hoveS: 60,
  /** A breeze (the Coordinator's call for the owner, 14 Nov 2026: check the easing itself): in the top of the lesson range
   * (15 kt where she sails), close-hauled with the mainsheet in your own hand, PUFFS puffs answered: a puff is her wind
   * PUFF_KT over its 20 s mean (in a 15 kt lesson they come every 15–30 s, the sim's own gusts), answered when within
   * EASE_S of it your own lines (sheet, and the traveler if it's yours) have eased the boom EASE_DEG or more from where it
   * was settled (within SETTLED_DEG over the 3–10 s before), she's kept sailing (over BREEZE_MIN_KT, close-hauled) and
   * not laid over past BREEZE_HEEL (coach.ts calls 20° overpowered; 25° is laid over). The next puff counts only once her
   * wind's back within LULL_KT of its mean and you've trimmed back to within TRIM_BACK_DEG: ease in the puff, trim in the
   * lull. */
  puffs: 3, puffKt: 1.5, easeS: 4, easeDeg: 3, settledDeg: 1.5, breezeMinKt: 2.5, breezeHeel: 25, lullKt: 0.5, trimBackDeg: 2,
  /** Crew overboard (ASA 101 skill 36: "the correct actions … from the time a person falls overboard until safely
   * recovered"): a reach held REACH_S, then the person goes over; recovered once she's stopped alongside them, to windward
   * of them (they're on her leeward side), within ALONGSIDE_M of her side and slower than MOB_KT through the water, for
   * MOB_HOLD_S. US Sailing's 2005 Crew Overboard Rescue Symposium, sailed on San Francisco Bay (J. Rousmaniere, final
   * report, 26 June 2006, https://www.ussailing.org/wp-content/uploads/2018/03/2005_Crew_Overboard_Symposium.pdf):
   * maneuvers "should usually end the same way – (1) on a close reach (2) with the boat to windward of the victim and (3)
   * with the boat at low speed" ("because boats drift downwind faster than people, a victim to windward may be quickly
   * separated from rescuers"); victims set 2 kt as the upper limit, and "the rule at Annapolis is 1 knot": 1 kt held 4 s
   * is stopped alongside, where at 2 kt she'd slide past them (the report counts boats that "sailed by" as failures).
   * Faster than MOB_STRIKE_KT her hull hitting them runs them down; her stem coming onto them at any speed is a strike. */
  reachS: 15, alongsideM: 1.5, mobKt: 1, mobHoldS: 4, mobStrikeKt: 2
};
/** Each lesson's first cue. */
const FIRST: Record<LessonId, string> = {
  tiller: 'Steer for the buoy', points: '', irons: 'Come up to a close reach by the buoy, and ease both sheets to stop',
  tacking: '"Ready about" … "Hard alee": tack (0 of 3)', jibing: 'Bear away to a run. "Ready to jibe" … "Jibe-ho" (0 of 3)', heaveto: 'Heave to: haul the jib to windward, tiller to leeward',
  mob: 'Sail a beam reach', breeze: 'Take the mainsheet: it\'s blowing 15', home: 'Push off and sail out of the harbor', before: 'Check her over and leave a float plan'
};

/** The five points of sail ASA 101 asks a sailor to sail (its skills 28–32: close hauled, close reach, beam reach,
 * broad reach, run; https://americansailing.com/wp-content/uploads/2025/01/Certification-ASA-101-Standards.pdf), each
 * by its true wind angle (deg, either tack): the band a sailor would call by that name. Close-hauled is the boat's own
 * beat angle in this wind and sea (boat/seaway.ts beatFor: about 41° in 12 kt), from a little above it (pinching) to a
 * few degrees below; a close reach is between that and a beam reach; a broad reach the wind on the quarter; a run the
 * wind from astern, 160° to 180°. */
const POINTS: { key: 'close' | 'closeReach' | 'beam' | 'broad' | 'run'; band: (b: Boat) => [number, number]; cue: string }[] = [
  // (the bands meet, so no angle between two points drains the hold unseen)
  { key: 'close', band: b => { const a = beatFor(b); return [a - 3, a + 8]; }, cue: 'Close-hauled: trim till both telltales stream' },
  { key: 'closeReach', band: b => [beatFor(b) + 8, 75], cue: 'Bear away a little to a close reach, and ease to match' },
  { key: 'beam', band: () => [75, 105], cue: 'Bear away to a beam reach: the wind on the side' },
  { key: 'broad', band: () => [105, 160], cue: 'Bear away to a broad reach: the wind on the quarter' },
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
  /** Home to the slip: where her slip is. */
  slip: Vec | null = null;
  course: number | null = null;
  /** Tacking and jibing: the good ones so far, scored by the tack and gybe drill's own tracker. */
  good = 0;
  readonly turns: DrillTracker | null;
  private held = 0; private seen = 0; private ironsT = 0; private lastTwa = 0;
  /** A breeze: her wind's 20 s mean, and the puff being answered (since when, the sheet and traveler as it came). */
  private puffMean: number | null = null;
  private hist: number[] = [];
  private sampleT = 0;
  private rearm: { ref: number } | null = null;
  private puff: { t: number; ref: number; eased: boolean; over: boolean } | null = null;
  /** Crew overboard: the person in the water (where, since when, and the side their crosswind leeway takes them: +1 to the
   * right of downwind), and how long they were in when she came alongside (s). */
  mob: { x: number; y: number; t: number; side: number } | null = null;
  mobTime: number | null = null;
  /** Crew overboard: the person was against her hull last step (so a stem coming onto them is told from lying alongside). */
  private mobIn = false;

  constructor(id: LessonId, buoy: Vec | null) {
    this.id = id; this.buoy = BUOY_LESSONS.has(id) ? buoy : null;
    this.cue = FIRST[id] || POINTS[0].cue;
    this.turns = id === 'tacking' || id === 'jibing' ? new DrillTracker() : null;
  }

  update(b: Boat, t: number, dt: number, hs = 0, env?: MobEnv): void {
    if (this.passed) return;
    if (this.id === 'tiller') this.tiller(b, dt);
    else if (this.id === 'points') this.points(b, dt);
    else if (this.id === 'irons') this.irons(b, t, dt);
    else if (this.id === 'heaveto') this.heaveTo(b, dt);
    else if (this.id === 'breeze') this.breeze(b, dt);
    else if (this.id === 'home') this.home(b);
    else if (this.id === 'before') this.before(b);
    else if (this.id === 'mob') this.overboard(b, t, dt, env);
    else this.turning(b, t, dt, hs);
    if (this.passed) { const s = Math.round(this.mobTime ?? 0); this.passedT = t; this.cue = this.mobTime != null ? `Alongside in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} ✓` : 'Lesson passed ✓'; this.progress = 1; }
  }

  /**
   * Crew overboard. The person (in a life jacket) goes over the side at her stern, and from then on drifts with the
   * surface current and their own leeway in the wind (MOB_LEEWAY): you turn back and stop alongside them. As a school
   * drills it, the one in the water is the drill's dummy in a life jacket (her crew stay aboard, so she sails as she was).
   * They go in at rest: a person leaves at her speed, but an upright body in the water sheds it within a few seconds and a
   * meter or two (drag ½ρ·CdA·v², CdA about 0.4 m², about 90 kg with the water it carries: 2.5 m/s to 0.1 in about 1.4 m).
   */
  private overboard(b: Boat, t: number, dt: number, env?: MobEnv): void {
    const M = LESSON_MARKS, kt = Math.abs(b.v - (b.astern ?? 0)) / KT;
    if (this.step === 0) {
      if (!this.hold(b.twa >= 70 && b.twa <= 110 && kt > 2, dt, M.reachS)) return;
      // over the side at the stern quarter, on the side the crew sit (to windward: the wind's side of her), just clear of the transom
      const up = b.tack === 'P' ? -1 : 1, aft = V(b.h + 180), side = V(b.h + 90 * up);
      this.mob = { x: b.x + aft.x * 4.2 + side.x * 0.9, y: b.y + aft.y * 4.2 + side.y * 0.9, t, side: Math.floor(t * 7) % 2 ? 1 : -1 }; // (which side their leeway keeps to: chance, here the moment's)
      this.step = 1; this.progress = 0; this.cue = 'Crew overboard! Turn back and stop alongside them';
      return;
    }
    const p = this.mob!;
    if (env) { const d = mobDrift(env.current(p), env.wind(p), p.side); p.x += d.x * dt; p.y += d.y * dt; }
    // where they are from her: along her (+ ahead) and across (+ to starboard); her hull 7.64 m long and 2.20 m wide,
    // fine at the ends (her half-beam falling off toward the stem and the transom)
    const dx = p.x - b.x, dy = p.y - b.y, f = V(b.h), s = V(b.h + 90), along = dx * f.x + dy * f.y, across = dx * s.x + dy * s.y;
    const half = 1.1 * Math.sqrt(Math.max(0, 1 - (along / 3.82) ** 2)), inHull = Math.abs(along) < 3.82 && Math.abs(across) < half;
    if (inHull) {
      // her hull pushes them aside (they don't pass through her); onto them stem first, or at speed, she's hit them
      const struck = (!this.mobIn && along > 2.5) || kt > M.mobStrikeKt;
      const out = (across >= 0 ? 1 : -1) * (half + 0.05) - across; p.x += s.x * out; p.y += s.y * out;
      this.mobIn = true;
      if (struck) { this.cue = kt > M.mobStrikeKt ? 'Too fast: you ran them down. Come round and stop alongside' : 'You hit them with the bow: stop beside them, not on them'; this.held = 0; this.progress = 0; return; }
    } else this.mobIn = false;
    // alongside, and on her leeward side: she's to windward of them (on port tack the wind comes over her port side)
    const lee = b.tack === 'P' ? 1 : -1, alongside = Math.abs(along) < 3.82 && Math.abs(across) < 1.1 + M.alongsideM, onLee = across * lee > 0;
    if (alongside && kt < M.mobKt && !onLee) { this.cue = 'Stop to windward of them: they\'re on your windward side'; this.held = 0; this.progress = 0; return; }
    if (this.hold(alongside && onLee && kt < M.mobKt, dt, M.mobHoldS)) { this.mobTime = t - p.t; this.passed = true; }
    else if (this.cue !== 'Crew overboard! Turn back and stop alongside them' && !alongside) this.cue = 'Crew overboard! Turn back and stop alongside them';
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
    const good = (t: { flow: string; eff: number } | null, jib: boolean) => !t || (P.key === 'run' ? t.eff >= LESSON_MARKS.runEff
      : t.flow === 'good' || (jib && P.key === 'broad' && t.eff >= LESSON_MARKS.broadJibEff));
    const drawing = twa >= lo && twa <= hi && b.v > 0.8 * KT && good(b.trim.main, false) && good(b.trim.jib, true);
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
    // (her speed through the water either way: going astern counts as moving, not stopped)
    const M = LESSON_MARKS, kt = Math.abs(b.v - (b.astern ?? 0)) / KT, twa = b.twa;
    if (this.step === 0) {
      const d = this.buoy ? Math.hypot(b.x - this.buoy.x, b.y - this.buoy.y) : 0;
      if (this.hold(d <= M.stopM && kt < M.stopKt, dt, M.stopS)) { this.step = 1; this.cue = 'Get going again: trim in'; }
    } else if (this.step === 1) {
      if (this.hold(kt > M.goKt, dt, M.stopS)) { this.step = 2; this.cue = 'Turn head to wind and stop: you\'re in irons'; }
    } else if (this.step === 2) {
      if (this.hold(twa < M.ironsTwa && kt < M.stopKt, dt, M.stopS)) { this.step = 3; this.ironsT = t; this.cue = 'Back the jib, tiller the way you want the bow'; this.lastTwa = twa; }
    } else {
      // out: sailing on either tack (going ahead, not astern), in time; too long, and it's back into irons to try again,
      // but never while she's coming round (the bow opening from the wind)
      const ahead = (b.astern ?? 0) < 0.1 && b.v / KT > M.outKt;
      if (this.hold(twa > M.outTwa && ahead, dt, M.stopS)) { this.passed = true; return; }
      const opening = twa > this.lastTwa + 0.02 * dt * 60 || twa > M.outTwa; this.lastTwa = twa;
      if (t - this.ironsT > M.outS && !opening) { this.step = 2; this.held = 0; this.cue = 'Again: head to wind and stop'; }
    }
  }

  private turning(b: Boat, t: number, dt: number, hs: number): void {
    const D = this.turns!, kind = this.id === 'tacking' ? 'tack' : 'gybe';
    D.step(b, t, dt, hs);
    for (; this.seen < D.list.length; this.seen++) {
      const s = D.list[this.seen];
      if (s.kind === kind && s.scored && s.backS != null && (kind === 'tack' || b.twa >= LESSON_MARKS.jibeTwa)) this.good++;
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

  private breeze(b: Boat, dt: number): void {
    const M = LESSON_MARKS, kt = b.ww.kt;
    this.puffMean = this.puffMean == null ? kt : this.puffMean + (kt - this.puffMean) * dt / 20;
    const mine = byHand(b, 'mainsheet');
    if (this.step === 0) { if (mine) { this.step = 1; this.cue = `Close-hauled: ease the main in each puff (0 of ${M.puffs})`; } return; }
    // the boom as your own lines set it (the crew's traveler doesn't count as your ease): the sheet's part, and the car's
    // when you have the traveler too (controls.ts boomAngle)
    const own = 80 * Math.pow(b.ctl.mainsheet, 1.5) + (byHand(b, 'traveller') ? TRAVELLER_SWING * b.ctl.traveller : 0);
    // a sample every quarter second, the last 10 s
    this.sampleT += dt;
    if (this.sampleT >= 0.25) { this.sampleT = 0; this.hist.push(own); if (this.hist.length > 40) this.hist.shift(); }
    const [lo, hi] = POINTS[0].band(b), sailing = mine && b.twa >= lo - 5 && b.twa <= hi + 5 && b.v / KT > M.breezeMinKt;
    if (this.rearm) {
      // the next puff counts once this one's passed (her wind back near its mean) and you've trimmed back in for the lull
      if (kt < this.puffMean + M.lullKt && own <= this.rearm.ref + M.trimBackDeg) this.rearm = null;
      return;
    }
    const P = this.puff;
    if (!P) {
      // a puff arriving: the sheet must have been settled before it (3–10 s ago, within SETTLED_DEG), so pumping it in and
      // out blindly doesn't answer anything; an ease begun in the last 3 s, as the puff darkens the water ahead, counts
      if (!sailing || kt <= this.puffMean + M.puffKt || this.hist.length < 40) return;
      const before = this.hist.slice(0, 28), ref = Math.min(...before);
      if (Math.max(...before) - ref > M.settledDeg) return;
      this.puff = { t: 0, ref, eased: false, over: false };
      return;
    }
    P.t += dt;
    if (!sailing) { this.puff = null; return; } // sheet let go, off the wind or stopped: that puff doesn't count
    if (P.t <= M.easeS && own - P.ref >= M.easeDeg) P.eased = true;
    if ((b.heelMag ?? 0) >= M.breezeHeel) P.over = true;
    if (P.t < M.easeS + 2) return;
    if (P.eased && !P.over) this.good++;
    this.puff = null; this.rearm = { ref: P.ref };
    this.progress = this.good / M.puffs;
    if (this.good >= M.puffs) { this.passed = true; return; }
    this.cue = `Close-hauled: ease the main in each puff, trim in the lulls (${this.good} of ${M.puffs})`;
  }

  /** Before you go: the dock card done (the page's command: the gear checked and the float plan left). After dark the
   * lights go on before leaving (Rule 20: sunset to sunrise); by day that step is skipped. */
  ready(night = false): void {
    if (this.id !== 'before' || this.step !== 0) return;
    if (night) { this.step = 1; this.cue = 'It\'s dark: navigation lights on'; } else { this.step = 2; this.cue = 'Hoist both sails and push off'; }
  }

  /** Before you go: at the dock, the gear and the float plan (the page's card), after dark the lights on (ASA 101 K17;
   * she starts with them off), then both sails hoisted and off the dock. */
  private before(b: Boat): void {
    if (this.step === 1) { if (!b.lightsOff) { this.step = 2; this.cue = 'Hoist both sails and push off'; } return; }
    if (this.step !== 2) return;
    const up = !b.rig || (b.rig.mainUp && b.rig.jibUp && b.rig.main > 0.95 && b.rig.jib > 0.95);
    if (up && !b.docked && this.slip && Math.hypot(b.x - this.slip.x, b.y - this.slip.y) > 30) this.passed = true;
  }

  /** Home to the slip: from her slip out of the harbor, and back in, made fast (world.ts intoSlip: stopped, bow in). */
  private home(b: Boat): void {
    if (this.step === 0) {
      // (out of the harbor: out of its basin, whatever the slip's depth in it or the marina)
      if (this.slip && !b.docked && !inBasin(b)) { this.step = 1; this.cue = 'Now home: sail in and stop in your slip, bow in'; }
      return;
    }
    if (b.docked) this.passed = true;
  }
}

/** What crew overboard needs of the World: the surface current (m/s, as a vector) and the wind (10 m) where the person is. */
export interface MobEnv { current(p: Vec): Vec; wind(p: Vec): { from: number; kt: number } }
/**
 * A person in the water's leeway: their drift through the water in the wind, as the US Coast Guard's leeway coefficients
 * give it for a person in water, vertical, in a foam type III life jacket, as schools issue (A. Allen 2005, "Leeway
 * Divergence", CG-D-05-05, after Allen & Plourde 1999, CG-D-08-99; read as OpenDrift's copy of the table, OBJECTPROP.DAT,
 * PIW-2, https://github.com/OpenDrift/opendrift/blob/master/opendrift/models/OBJECTPROP.DAT): downwind 0.48% of the 10 m
 * wind, crosswind 0.15% to one side (which side an object keeps is chance). About 0.05 kt in 10 kt of wind. The table's
 * scatter about these means (8.3 cm/s downwind, 6.7 across) is larger than the means themselves in a lesson's wind; the
 * mean is used. With them in a life jacket it's the current that carries them, and her.
 */
export const MOB_LEEWAY = { down: 0.0048, cross: 0.0015 };
/** The person's drift over the ground (m/s): the current plus their leeway ("the motion of the object induced by wind …
 * relative to the ambient current", Breivik et al. 2013, arXiv 1211.0805). */
export function mobDrift(cur: Vec, wind: { from: number; kt: number }, side: number): Vec {
  const u = wind.kt * KT, dn = V(wind.from + 180), cr = V(wind.from + 180 + 90 * side);
  return { x: cur.x + u * (MOB_LEEWAY.down * dn.x + MOB_LEEWAY.cross * cr.x), y: cur.y + u * (MOB_LEEWAY.down * dn.y + MOB_LEEWAY.cross * cr.y) };
}
