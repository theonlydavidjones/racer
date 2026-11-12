import type { Boat, LineKey } from './boat';
import { heelFactor, heelWithCrew, helmNeeded, rudderDrag, sailForces } from './balance';
import { boomAngle, crewSolve, depowerLimits, jibClew, jibShape, mainShape, mainsheetFor, shapeEfficiency, targetShape, travellerFor, type Controls } from './controls';
import { crewMass, crewMoment, displacement } from './crewPhys';
import { condition, mainRig } from './condition';
import { driveSpeedRatio, hullResistance } from './dynamics';
import { driveCurveFor } from './driveCurve';
import { beatAngle, polar } from './polar';
import { byHand, crewMainAngle, leeDrift, sailPlan, sailPush, sailWind } from './physics';
import { SAILS, optimalSheet, sailTrim, trimDrive } from './trim';
import { KT, clamp } from '../core/math';
import { TUNE_PRESETS, forestayTension, presetFor, tuneName, tuneWords } from './rigTune';

/**
 * The trim coach, as a teacher: the one thing that matters most right now, why, and what to look at on the boat to
 * see it for yourself; when you've fixed it, it says so and moves on; when trim is right it says that instead.
 *
 * Everything comes from the model the boat sails by. A line's worth is found by trying it: each line you hold is
 * moved, alone, across its range in the same equations the boat uses (trim.ts's angle of attack, controls.ts's sail
 * shape against the best shape for the conditions, balance.ts's heel and helm), and the speed she'd gain at its best
 * setting is the lesson's weight. The crew's lines aren't lessons (they're working them); the coach says in a line
 * what they're doing. Steering, heaving to and the phase of the race are judged from the boat's state.
 *
 * Open for more teachers: anything that can see a way to go faster (the crew's weight, say) adds a LessonSource.
 */

/** A thing to teach. `gain` is the speed it's worth (0.02 = 2%); 0 for confirmations and explanations. */
export interface Lesson {
  /** Stable key, for recognising when it's been fixed (e.g. 'line:backstay', 'steer:pinching', 'hove:balanced'). */
  id: string;
  /** Who acts on it: you on a line, you on the helm, or the crew (for what they're doing). */
  who: 'you' | 'helm' | 'crew' | string;
  /** The line it's about, if any, and the setting the coach is steering it toward. */
  line?: LineKey; to?: number;
  /** The one thing to do, short enough to read mid-manoeuvre. */
  head: string;
  /** One short reason. */
  why: string;
  /** What to look at on the boat to see it. */
  look: string;
  /** What to say when it's fixed (e.g. 'jib telltales streaming both sides'). */
  done?: string;
  gain: number;
  kind: 'fix' | 'ok' | 'info';
}

/** What the race is doing, from outside the boat (the world knows; the boat doesn't). */
export interface CoachContext { preStart?: boolean; justRounded?: boolean }

/** The situation in words, and the numbers the lessons use. */
export interface Situation {
  tws: number; twa: number; awa: number; up: boolean; reach: boolean; run: boolean;
  band: 'light' | 'medium' | 'heavy'; over: boolean; chop: boolean; sea: string;
  speedKt: number; targetKt: number;
  /** The words at the top of the panel: "UPWIND · HEAVY 20 kt · CHOP · OVERPOWERED". */
  label: string;
}

export type LessonSource = (b: Boat, s: Situation, ctx: CoachContext) => Lesson[];
const SOURCES: LessonSource[] = [];
/** Add a teacher (e.g. crew weight: "everyone to leeward"). Its lessons are ranked with the rest by `gain`. */
export function addLessonSource(src: LessonSource): () => void { SOURCES.push(src); return () => { const i = SOURCES.indexOf(src); if (i >= 0) SOURCES.splice(i, 1); }; }

/** What the coach shows. */
export interface CoachView {
  situation: Situation;
  /** The headline lesson (a fix, or a confirmation that trim is right, or what's happening). */
  top: Lesson;
  /** Smaller fixes, biggest first: reachable, not shouted. */
  more: Lesson[];
  /** One line on what the crew is doing with their lines. */
  crew: string;
}

/** Below this a fix isn't worth saying (0.4% of speed: about 0.02 kt at 5 kt). */
export const FIX_MIN = 0.004;
const kt = (ms: number) => ms / KT;
const deg = (x: number) => `${Math.round(x)}°`;

/* ---------- the situation ---------- */

export function situation(b: Boat, ctx: CoachContext = {}): Situation {
  const tws = b.ww.kt, twa = b.twa, awa = b.awa, up = twa < 70, run = twa > 150, reach = !up && !run;
  const band = tws < 7 ? 'light' : tws < 15 ? 'medium' : 'heavy';
  const over = up && ((b.depower ?? 0) > 0.3 || (b.heelMag ?? 0) > 20);
  const hs = b.sea.hsW, chop = hs >= 0.2 || b.sea.hsS >= 0.6;
  const sea = hs >= 1 ? 'BIG SEA' : hs >= 0.2 ? 'CHOP' : b.sea.hsS >= 0.6 ? 'SWELL' : 'FLAT';
  const targetKt = kt(polar(tws, Math.max(twa, beatAngle(tws)), sailPlan(b)));
  const phase = b.docked ? 'IN HER SLIP' : b.hove ? 'JIB ABACK' : ctx.preStart ? 'PRE-START' : b.tacking || b.turnTarget != null ? (twa < 90 ? 'TACKING' : 'GYBING')
    : ctx.justRounded ? 'ROUNDING' : b.luff ? 'SAILS EASED' : '';
  const point = twa < 55 ? 'UPWIND' : twa < 80 ? 'CLOSE REACH' : twa < 110 ? 'BEAM REACH' : twa < 150 ? 'BROAD REACH' : 'RUNNING';
  const bandWord = band === 'light' ? 'LIGHT' : band === 'medium' ? 'MEDIUM' : 'HEAVY';
  const label = [phase || point, `${bandWord} ${Math.round(tws)} kt`, sea, over ? 'OVERPOWERED' : ''].filter(Boolean).join(' · ');
  return { tws, twa, awa, up, reach, run, band, over, chop, sea, speedKt: kt(b.v), targetKt, label };
}

/* ---------- what a setting is worth, in the boat's own equations ---------- */

/** What a share K of the drive is worth in speed for her, sailing as she is (dynamics.ts driveSpeedRatio). */
export function driveSpeed(b: Boat, K: number): number {
  const twa = Math.min(180, b.twa + (b.leeway ?? 0)), vt = Math.max(0.5, polar(b.ww.kt, twa, sailPlan(b)));
  return driveSpeedRatio(vt, K, driveCurveFor(b.ww.kt, twa, vt));
}
/**
 * How fast she'd go with these settings, relative (the same factors physics.ts multiplies the polar by: the sails'
 * angle of attack and shape as drive, heel past her best, and the drag of the helm the sails demand).
 */
function speedFactor(b: Boat, c: Controls): number {
  // (in the wind the sails see as she heels, as the boat does: physics.ts sailWind, ORC eqs. 7.2–7.3)
  const sw = sailWind(b.ww.from, b.ww.kt, b.h, b.v, 0, b.heelMag ?? 0);
  const tws = b.ww.kt, awa = sw.awa, aws = sw.aws / KT, plan = sailPlan(b), cond = b.spec ? (b.cond ??= condition(b.spec)) : null;
  const main = clamp(boomAngle(c), SAILS.main.min, SAILS.main.max), clew = jibClew(c, b.tack);
  if (clew < 0) return 0; // backed: not sailing
  const jib = clamp(clew, SAILS.jib.min, SAILS.jib.max);
  const tm = sailTrim('main', awa, main), tj = plan === 'jib' ? sailTrim('jib', awa, jib) : null;
  const ms = mainShape(c, tws, mainRig(b), aws), js = plan === 'jib' ? jibShape(c, tws, b.tack, cond?.jib, aws, mainRig(b)?.tune) : null;
  const em = shapeEfficiency(ms, targetShape('main', tws, awa, b.depower)), ej = js ? shapeEfficiency(js, targetShape('jib', tws, awa, b.depower)) : 1;
  const eff = js ? SAILS.main.share * em + SAILS.jib.share * ej : em;
  // (the main's sheet against the crew's intended boom, eased down the traveller on purpose on the last depowering steps,
  // as physics.ts trimSails counts it; the deliberate ease is in the sails' power, below)
  const ease = crewMainAngle(b) - optimalSheet('main', b.awaSlow);
  // (shares of the drive multiply; what they're worth in speed is where the drive meets the hull's resistance, as the
  // boat itself counts it: dynamics.ts speedForDrive)
  let K = Math.max(0, trimDrive(sailTrim('main', awa, clamp(main - ease, SAILS.main.min, SAILS.main.max)), tj) * eff), f = 1;
  // heel and helm, with the crew where they are now
  const sf = sailForces(sw.aws, sw.awa, { trim: tm, shape: ms, out: main }, tj && js ? { trim: tj, shape: js } : null, false);
  const cs = b.crew;
  if (cs) {
    const disp = displacement(cs.spec) + (cond?.extraKg ?? 0), F = sf.main.heel + sf.jib.heel;
    const heel = heelWithCrew(F, sf.ceh, disp, h => crewMoment(cs, h) + (cond ? cond.rightingDelta(h) : 0), crewMass(cs.spec));
    f *= heelFactor(heel);
    const v = Math.max(0.8, b.v), hn = helmNeeded(sf, heel, main, v, sf.ceh);
    // the drive the sails make less the keel's drag for their side force (balance.ts netDrive): flatter sails push less,
    // but heel her less and ask less of the keel; against the drive as she is, as physics.ts powerFactor weighs it
    // (exactly as the boat weighs it: physics.ts sailPush, against the push with her lines as they are)
    const pushNow = sailPush(tws, b.twa, plan, b.shape.main, plan === 'jib' ? b.shape.jib : null, b.heelMag ?? 0, b.depower ?? 0);
    if (pushNow > 1) K *= Math.max(0, sailPush(tws, b.twa, plan, ms, js, heel, b.depower ?? 0)) / pushNow;
    K *= Math.max(0, 1 - rudderDrag(clamp(hn, -12, 12), v) / Math.max(1, hullResistance(v)));
  }
  return f * driveSpeed(b, K);
}

const RANGE: Partial<Record<LineKey, [number, number]>> = { traveller: [-1, 1] };
/**
 * The controls as they'd be with one line moved, and the crew answering it as they do (physics.ts trimSails): the
 * mainsheet and traveller set the boom together: with the traveller yours, the crew re-sheets to keep the boom where they
 * want it; with the mainsheet yours, they move the traveller to put it there (no lower than their depowering floor).
 */
function withCrew(b: Boat, k: LineKey, v: number): Controls {
  const c = { ...b.ctl, [k]: v } as Controls, want = crewMainAngle(b);
  if (k === 'traveller' && !byHand(b, 'mainsheet')) c.mainsheet = mainsheetFor(want, v);
  if (k === 'mainsheet' && !byHand(b, 'traveller') && !b.hove && !byHand(b, 'jibsheetW')) c.traveller = travellerFor(want, v, depowerLimits(b.depower ?? 0, b.awaSlow).min.traveller ?? -1);
  return c;
}
/** The best setting for one line with the crew answering it, and the speed it's worth. */
function bestFor(b: Boat, k: Exclude<LineKey, 'car' | 'jibsheetW'>): { to: number; gain: number } {
  const [lo, hi] = RANGE[k] ?? [0, 1], base = speedFactor(b, withCrew(b, k, b.ctl[k]));
  // (with both sails flogging the drive is nil: a floor, so the line that brings one back still counts)
  let to = b.ctl[k], best = Math.max(base, 0);
  for (let i = 0; i <= 40; i++) {
    const v = lo + (hi - lo) * i / 40, f = speedFactor(b, withCrew(b, k, v));
    if (f > best * 1.0005) { best = f; to = v; }
  }
  return { to, gain: Math.min(3, best / Math.max(base, 0.1) - 1) };
}

/* ---------- the lessons for a line you hold ---------- */

const amount = (d: number) => (d > 0.6 ? 'hard' : d > 0.35 ? 'a good pull' : d > 0.15 ? 'a bit' : 'a touch');
const easeAmount = (d: number) => (d > 0.6 ? 'right off' : d > 0.35 ? 'well off' : d > 0.15 ? 'a bit' : 'a touch');

function lineLesson(b: Boat, s: Situation, k: Exclude<LineKey, 'car' | 'jibsheetW'>, to: number, gain: number): Lesson {
  const c = b.ctl, from = c[k], more = to > from, d = Math.abs(to - from), base = { id: `line:${k}`, who: 'you', line: k as LineKey, to, gain, kind: 'fix' as const };
  const tws = Math.round(s.tws), jibName = 'jib';
  switch (k) {
    case 'mainsheet': {
      const was = b.sheets.main, will = clamp(boomAngle(withCrew(b, 'mainsheet', to)), SAILS.main.min, SAILS.main.max), n = Math.abs(will - was);
      // the boom barely moves (it's at its stop, or the crew's traveller keeps it where they want it): the sheet is the leech
      if (n < 1.5 && s.awa < 110) return more
        ? { ...base, head: `Ease the mainsheet ${easeAmount(d)}: open the leech.`, why: `The leech is closed tighter than ${tws} kt wants: the top of the main needs a little twist.`,
            look: 'the top batten: angled a little to leeward of the boom', done: 'leech open' }
        : { ...base, head: `Trim the mainsheet ${amount(d)}: close the leech.`, why: 'The top of the main is twisting open and spilling wind you could use.',
            look: 'the top batten: parallel to the boom', done: 'leech closed' };
      if (!more) return { ...base, head: `Trim the main in, about ${deg(n)}.`,
        why: s.awa > 110 ? 'Eased right out, the main pushes from far outboard and she wants to round up: in a touch, the helm lightens.'
          : b.trim.main.flow === 'luffing' ? 'The main is luffing: its front is lifting, so it isn\'t pulling.' : 'The boom is further out than this wind angle wants: the main isn\'t pulling its weight.',
        look: s.awa > 110 ? 'the weight on the tiller' : b.trim.main.flow === 'luffing' ? 'the bubble behind the mast, and the windward side of the luff lifting' : 'the luff of the main: just short of lifting',
        done: 'main drawing' };
      return { ...base, head: `Ease the main, about ${deg(n)}.`,
        why: s.awa > 110 ? 'Off the wind the main works by presenting area: eased out, square to the wind, it catches the most.'
          : s.over ? 'She\'s overpowered: with the main in this hard she heels and drags her rudder instead of driving.'
          : b.trim.main.flow === 'stalled' ? 'The main is over-trimmed: the flow is breaking off its back, so it pushes sideways more than forward.' : 'The boom is closer to the centreline than this wind angle wants.',
        look: s.awa > 110 ? 'the boom: out until it\'s nearly against the shroud' : s.over ? 'the heel and the weight on the tiller: both should ease' : b.trim.main.flow === 'stalled' ? 'the leech telltales: streaming off the back, not curling behind it' : 'the luff of the main: ease until it just lifts, then trim a touch',
        done: s.over ? 'she\'s back on her feet' : 'main drawing' };
    }
    case 'jibsheet': {
      const was = b.sheets.jib, will = clamp(jibClew({ ...c, jibsheet: to }, b.tack), SAILS.jib.min, SAILS.jib.max), n = Math.abs(will - was);
      if (!more) return { ...base, head: `Trim the ${jibName} in, about ${deg(n)}.`,
        why: b.trim.jib?.flow === 'luffing' ? 'The jib is luffing, so it\'s barely pulling.' : 'The jib is eased past its best angle.',
        look: 'the windward jib telltales lifting, and the bubble behind the luff', done: 'jib telltales streaming both sides' };
      return { ...base, head: `Ease the ${jibName}, about ${deg(n)}.`,
        why: 'The jib is over-trimmed: the flow on its back has broken away.',
        look: 'the leeward jib telltales drooping or spinning; and a jib leech close to the spreader', done: 'jib telltales streaming both sides' };
    }
    case 'traveller': return { ...base,
      head: to < from ? `Traveller up to windward, ${amount(d)}.` : `Traveller down to leeward, ${amount(d)}.`,
      why: to < from ? 'It brings the boom toward the centreline without hauling the leech shut: more power and height.'
        : s.over ? `In ${tws} kt she's overpowered: dropping the boom to leeward without opening the leech takes heel and weather helm off her while the main keeps its shape.` : 'The boom is too close to the centreline for this breeze: the main is over-trimmed.',
      look: to < from ? 'the boom: over the centreline, close-hauled in this breeze' : 'the heel and the tiller: both should come off',
      done: to < from ? 'boom where it pays' : 'helm lighter' };
    case 'backstay': return { ...base,
      head: more ? `Backstay on, ${amount(d)}.` : `Ease the backstay, ${easeAmount(d)}.`,
      why: more ? `It bends the mast and tightens the forestay, flattening both sails: in ${tws} kt she wants them flatter, to drive instead of heel.`
        : `In ${tws} kt she wants power: easing it lets the mast straighten and the forestay sag, for fuller sails.`,
      look: more ? (s.over ? 'the heel and the weight on the tiller: both should ease' : 'the main\'s depth at mid-height: flatter') : 'the main\'s depth at mid-height: fuller, and the speedo',
      done: more ? 'sails flat for the breeze' : 'power on' };
    case 'vang': return { ...base,
      head: more ? `Vang on, ${amount(d)}.` : `Ease the vang, ${easeAmount(d)}.`,
      why: more ? (s.awa > 70 ? 'Off the wind the sheet no longer holds the boom down: without the vang the top of the main twists away and spills.' : 'It holds the leech, so the main keeps its shape when the sheet\'s eased.')
        : 'The leech is too tight for this breeze: she needs more twist.',
      look: more ? 'the upper battens: in line with the boom, not falling off to leeward' : 'the top batten: angled a little to leeward of the boom',
      done: more ? 'top of the main working' : 'leech eased' };
    case 'outhaul': return { ...base,
      head: more ? `Outhaul on, ${amount(d)}.` : `Ease the outhaul, ${easeAmount(d)}.`,
      why: more ? `It flattens the bottom of the main: in ${tws} kt that's power she can't use.` : 'It deepens the bottom of the main, for power.',
      look: 'the foot of the main: the depth just above the boom', done: more ? 'foot flat' : 'foot full' };
    case 'cunningham': case 'downhaul': {
      const name = k === 'cunningham' ? 'Cunningham' : 'main halyard', Name = name[0].toUpperCase() + name.slice(1); // (Josephine's 'downhaul' is the main halyard on its tackle)
      return { ...base,
        head: more ? `${Name} on, ${amount(d)}.` : `Ease the ${name}, ${easeAmount(d)}.`,
        why: more ? 'The breeze has blown the main\'s draft aft: luff tension pulls it forward again.' : 'The draft is too far forward: the front is round and the leech flat. Easing it lets the draft move back toward the middle, for power.',
        look: 'the draft stripes: the deepest point a little less than halfway back', done: 'draft where it should be' };
    }
    case 'jibHalyard': return { ...base,
      head: more ? `Jib halyard on, ${amount(d)}.` : `Ease the jib halyard, ${easeAmount(d)}.`,
      why: more ? 'The jib\'s luff has gone soft and its draft blown aft: halyard tension pulls it forward, as the main halyard does the main\'s.' : 'The jib\'s luff is stretched hard and its draft is too far forward: ease the halyard a little.',
      look: 'the jib\'s luff: horizontal wrinkles off the hanks are too little tension, a crease up the luff too much', done: 'jib luff right' };
    case 'jibCunningham': return { ...base,
      head: more ? `Jib Cunningham on, ${amount(d)}.` : `Ease the jib Cunningham, ${easeAmount(d)}.`,
      why: more ? 'The jib\'s draft has blown aft: luff tension brings it forward.' : 'The jib\'s draft is too far forward.',
      look: 'the jib\'s draft stripes: the deepest point a little forward of halfway', done: 'jib draft right' };
  }
}

/* ---------- the helm, and heaving to ---------- */

function helmLessons(b: Boat, s: Situation, lineFixes: number): Lesson[] {
  const out: Lesson[] = [], tm = b.trim.main, tj = b.trim.jib;
  if (b.hove || b.luff || b.docked) return out;
  // pinching: both sails luffing upwind, with the sheets in
  if (s.up && tm.flow === 'luffing' && tm.amount > 0.15 && (!tj || tj.flow === 'luffing') && b.sheets.main <= optimalSheet('main', s.awa) + 2) {
    const g = 1 / Math.max(0.05, driveSpeed(b, trimDrive(tm, tj))) - 1;
    out.push({ id: 'steer:pinching', who: 'helm', head: `Bear away about ${deg(Math.max(3, beatAngle(s.tws) - s.twa + 2))}.`, why: 'You\'re pinching: both sails are luffing, so they\'ve stopped pulling.',
      look: 'the windward jib telltales lifting: steer down until they stream', done: 'sails drawing again', gain: g, kind: 'fix' });
  }
  // overpowered with everything on: the helm's job
  const hn = b.helmNeed ?? 0, heel = b.heelMag ?? 0;
  // (only once there's nothing left on the lines: the crew's at the end of its depowering, and yours are right)
  if (s.twa < beatAngle(s.tws) + 8 && (b.depower ?? 0) > 0.95 && (hn > 5 || heel > 22) && lineFixes === 0) { // close-hauled: on a reach, feathering leaves the course
    const v = Math.max(0.8, b.v);
    out.push({ id: 'steer:feather', who: 'helm', head: 'Feather in the puffs: head up a touch as each one hits.',
      why: 'Every depowering line is on. What\'s left is to sail a little higher in the gusts, letting the main lift, so she stays on her feet.',
      look: `the heel (${deg(heel)}) and the tiller pulling (${deg(hn)} of weather helm): feather until both ease`, done: 'she\'s on her feet',
      gain: Math.max(1 - heelFactor(heel), 1 - driveSpeed(b, Math.max(0, 1 - rudderDrag(Math.min(12, hn), v) / Math.max(1, hullResistance(v))))), kind: 'fix' });
  }
  return out;
}

function hoveLessons(b: Boat, s: Situation): Lesson[] {
  if (!b.hove) return [];
  const lee = kt(leeDrift(b)), ahead = s.speedKt, twa = s.twa, lashed = b.lashed != null;
  const mid = lashed && Math.abs(b.lashed!) < 0.04, toLee = lashed && !mid && (b.lashed! < 0) === (b.tack === 'S'), mainDrawing = b.trim.main.flow !== 'luffing' || b.trim.main.amount < 0.15;
  if (lashed && toLee && twa >= 35 && twa <= 75 && ahead < 2.2) return [{ id: 'hove:balanced', who: 'you', kind: 'ok', gain: 0,
    head: `Hove to and balanced: bow ${deg(twa)} off the wind, ${ahead.toFixed(1)} kt ahead, slipping ${lee.toFixed(1)} kt to leeward.`,
    why: 'The backed jib pushes her bow off; the eased main and the lashed tiller turn her back up. The main is the trim tab.',
    look: 'the front of the main lifting while its back still draws. Ease it and she lies lower and slower; trim it and she comes up and fore-reaches.' }];
  if (lashed && toLee && twa > 75) return [{ id: 'hove:beamon', who: 'you', kind: 'fix', gain: 0,
    head: `She's lying beam-on (${deg(twa)} off the wind${ahead >= 1.5 ? `, reaching off at ${ahead.toFixed(1)} kt` : ''}): trim the main in a little to bring her up.`,
    why: 'With the main eased right off, nothing turns her back up against the backed jib.', look: 'the bow coming up to about 50° off the wind', done: 'lying hove to' }];
  if (lashed && toLee && twa < 35) return [{ id: 'hove:high', who: 'you', kind: 'fix', gain: 0,
    head: `She's lying nearly head to wind (${deg(twa)}): ease the main a little more.`, why: 'The main is turning her up past where the backed jib can hold her off.', look: 'the bow falling off to about 50° off the wind', done: 'lying hove to' }];
  if (lashed && toLee && ahead >= 2.2) return [{ id: 'hove:forereach', who: 'you', kind: 'fix', gain: 0,
    head: b.ctl.mainsheet > 0.95 ? `She's fore-reaching at ${ahead.toFixed(1)} kt: lash the tiller further to leeward.` : `She's fore-reaching at ${ahead.toFixed(1)} kt: ease the main more, or lash the tiller further to leeward.`,
    why: 'The main is still driving her faster than the rudder and backed jib can hold.', look: 'the speedo: about a knot when she\'s settled', done: 'settled hove to' }];
  if (mid) return [{ id: 'hove:lashmid', who: 'you', kind: 'fix', gain: 0,
    head: 'The tiller is lashed amidships: move the lashing to leeward (◀ ▶).', why: 'The rudder only holds her up against the backed jib when it\'s turned toward the wind.',
    look: 'the tiller: on the side away from the wind', done: 'lashed to leeward' }];
  if (lashed && !toLee) return [{ id: 'hove:lashwrong', who: 'you', kind: 'fix', gain: 0,
    head: 'The tiller is lashed to windward: move the lashing to leeward.', why: 'To windward it turns her away from the wind, the same way the backed jib does, so nothing holds her up.',
    look: 'the tiller: on the side away from the wind', done: 'lashed to leeward' }];
  if (mainDrawing && byHand(b, 'mainsheet')) return [{ id: 'hove:easemain', who: 'you', kind: 'fix', gain: 0,
    head: `Jib's aback, but you're not hove to yet (${deg(twa)} off at ${ahead.toFixed(1)} kt): ease the main until its front lifts.`,
    why: 'Drawing fully, the main drives her on and up; eased, it just balances the backed jib.', look: 'the front of the main starting to lift', done: 'main eased' }];
  if (mainDrawing) return [{ id: 'hove:takemain', who: 'you', kind: 'fix', gain: 0,
    head: `Jib's aback, but you're not hove to yet (${deg(twa)} off at ${ahead.toFixed(1)} kt): ease the main until its front lifts.`,
    why: 'The crew still has the main trimmed for sailing. Ease it yourself (that takes it from them).', look: 'the front of the main starting to lift', done: 'main eased' }];
  return [{ id: 'hove:lash', who: 'you', kind: 'fix', gain: 0,
    head: ahead > 2 ? `Let her slow (${ahead.toFixed(1)} kt), then lash the tiller to leeward.` : 'Now lash the tiller to leeward.',
    why: ahead > 2 ? 'Lashed to leeward with way on, she\'d round up and tack.' : 'The rudder holds her up against the backed jib: with it lashed, she looks after herself.',
    look: 'the speedo: under two knots before you lash', done: 'tiller lashed' }];
}

/* ---------- the crew's line ---------- */

const NAME: Record<LineKey, string> = { mainsheet: 'mainsheet', jibsheet: 'jib sheet', jibsheetW: 'windward jib sheet', traveller: 'traveller', backstay: 'backstay', vang: 'vang',
  outhaul: 'outhaul', cunningham: 'Cunningham', downhaul: 'main halyard', jibCunningham: 'jib Cunningham', jibHalyard: 'jib halyard', car: 'jib car' };
const listWords = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

function crewLine(b: Boat, s: Situation): string {
  if (b.docked) return '';
  const c = b.ctl, mine = (k: LineKey) => byHand(b, k), said: string[] = [];
  const crewHas = (k: LineKey) => !mine(k);
  if (s.up && s.over) {
    const on = (['backstay', 'outhaul', 'cunningham', 'vang'] as const).filter(k => crewHas(k) && c[k] > 0.7).map(k => NAME[k]);
    if (on.length) said.push(`${listWords(on)} on`);
    if (crewHas('traveller') && c.traveller > 0.3) said.push('traveller down');
    if (crewHas('mainsheet') && (b.depower ?? 0) > 0.6 && b.trim.main.flow === 'luffing') said.push('easing the main to keep her on her feet (the front lifting is deliberate)');
    return said.length ? `Crew: depowering: ${said.join(', ')}.${(b.depower ?? 0) > 0.95 ? ' They\'ve done all they can.' : ''}` : '';
  }
  if (s.awa > 110) {
    if (crewHas('mainsheet')) said.push('sheets eased right out');
    if (crewHas('vang') && c.vang > 0.5) said.push('the vang holding the boom down');
    if (crewHas('outhaul') && c.outhaul < 0.3) said.push('outhaul eased for power');
    return said.length ? `Crew: ${said.join(', ')}.${s.chop ? ' Steering is yours: the waves on the quarter push her bow about.' : ''}` : '';
  }
  const lines = ['mainsheet', 'jibsheet', 'traveller', 'backstay', 'vang', 'outhaul'] as const;
  const theirs = lines.filter(crewHas);
  if (!theirs.length) return 'You have the lines: the crew is waiting on you.';
  return `Crew: ${theirs.length === lines.length ? 'every line' : listWords(theirs.map(k => NAME[k]))} set for ${Math.round(s.tws)} kt${s.band === 'light' ? ', sails full and controls eased' : ''}.`;
}

/* ---------- putting it together ---------- */

const LINE_KEYS = ['mainsheet', 'jibsheet', 'traveller', 'backstay', 'vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham', 'jibHalyard'] as const;

/** Every lesson for now, biggest first. */
export function lessons(b: Boat, ctx: CoachContext = {}): { s: Situation; list: Lesson[] } {
  const s = situation(b, ctx), list: Lesson[] = [];
  if (b.docked || (b.rig && (b.rig.main < 1 || b.rig.jib < 1))) return { s, list };
  list.push(...hoveLessons(b, s));
  // through a tack or gybe, easing to slow, or hove to: the lines wait
  const busy = b.hove || b.luff || b.tacking || b.turnTarget != null || (b.penalty ?? 0) > 0;
  if (!busy) {
    for (const k of LINE_KEYS) {
      if (!byHand(b, k) || (k === 'jibsheet' && sailPlan(b) !== 'jib')) continue;
      const r = bestFor(b, k);
      if (r.gain >= FIX_MIN) list.push(lineLesson(b, s, k, r.to, r.gain));
    }
    list.push(...helmLessons(b, s, list.filter(l => l.line).length));
  }
  if (!busy) list.push(...rigLessons(b, s));
  for (const src of SOURCES) list.push(...src(b, s, ctx));
  list.sort((x, y) => y.gain - x.gain);
  return { s, list };
}

/**
 * What her tune costs her sails right now (a share of speed): with it against the guide's tune for this wind (rigTune.ts),
 * each with the crew's best lines, at her sheets, heel and crew as they are. Only the sails' share: in the full physics
 * (benchSpeed) the difference is up to about twice this, as heel, the crew's weight and the depowering steps follow.
 */
export function tuneLoss(b: Boat): number {
  if (!b.tune) return 0;
  // each rig with the crew's best settings for it (crewSolve), at her sheets as they are: a soft rig wants more backstay
  const guide: Boat = { ...b, tune: undefined, rigMain: undefined }, cond = b.spec ? (b.cond ??= condition(b.spec)) : null;
  const tws = b.ww.kt, main = boomAngle(b.ctl), jib = jibClew(b.ctl, b.tack);
  if (jib < 0) return 0;
  const best = (x: Boat): Controls => {
    const v = crewSolve(tws, b.awaSlow, b.tack, main, jib, undefined, mainRig(x), cond?.jib, b.aws / KT, b.depower);
    return { ...b.ctl, traveller: v.traveller, vang: v.vang, outhaul: v.outhaul, cunningham: v.cunningham, downhaul: v.downhaul, backstay: v.backstay, jibCunningham: v.jibCunningham, jibHalyard: v.jibHalyard,
      mainsheet: mainsheetFor(main, v.traveller) };
  };
  const k = speedFactor(b, best(b)) / Math.max(1e-6, speedFactor(guide, best(guide)));
  return k >= 1 ? 0 : 1 - k; // (speedFactor is already a share of speed)
}

/**
 * The rig's tune, upwind, when it's the wrong one for the wind she's in (rigTune.ts): nothing to fix under way (the
 * forestay, shrouds and mast foot are fixed while racing, CR 7.40), so it's said, with what it costs, only when there's
 * nothing else to fix (gain 0), and only when it costs at least half a percent: the cost is her speed with her tune
 * against the guide's tune for this wind, in the same equations (speedFactor).
 */
function rigLessons(b: Boat, s: Situation): Lesson[] {
  if (!b.tune || !s.up) return [];
  const name = tuneName(b.tune), want = presetFor(s.tws);
  if (name === want) return [];
  const loss = tuneLoss(b);
  if (loss < 0.005) return [];
  const soft = forestayTension(b.tune) < forestayTension(TUNE_PRESETS[want]);
  const pct = `${(100 * loss).toFixed(1)}%`;
  return [{ id: soft ? 'rig:soft' : 'rig:tight', who: 'you', gain: 0, kind: 'info',
    head: soft ? `Her rig is tuned soft for ${Math.round(s.tws)} kt: her sails give up about ${pct}. Backstay on hard.` : `Her rig is tuned tight for ${Math.round(s.tws)} kt: her sails give up about ${pct}. Backstay off, foot a little.`,
    why: soft ? `On ${tuneWords(b.tune)} the forestay sags in this breeze: a full jib with a round entry that won't point, more heel and more helm. The forestay and shrouds are set at the dock (CR 7.40), and the mast foot (CR 6.1.5); the backstay is free.`
      : `On ${tuneWords(b.tune)} the forestay is straight and the jib flat: it points, but has no power. The forestay and shrouds are set at the dock (CR 7.40), and the mast foot (CR 6.1.5).`,
    look: `the forestay's sag against the jib's luff; next time, ${tuneWords(TUNE_PRESETS[want])}` }];
}

/** The one thing to say when nothing needs fixing. */
function confirmation(b: Boat, s: Situation, ctx: CoachContext): Lesson {
  const base = { id: 'ok', who: 'you', gain: 0, kind: 'ok' as const };
  if (b.docked) return { ...base, head: 'In her slip. Push off when you\'re ready.', why: '', look: '' };
  if (b.rig && (b.rig.main < 1 || b.rig.jib < 1)) return { ...base, head: 'Sails going up (or down): the coach waits until they\'re set.', why: '', look: '' };
  if (b.luff) return { ...base, kind: 'info', head: 'Sails eased right out: she\'s slowing.', why: 'Easing both sails until they flog is the brake: she coasts to a stop.', look: 'the speedo; trim back in to go' };
  if (b.tacking || b.turnTarget != null) return { ...base, kind: 'info', head: s.twa < 90 ? 'Through the tack: the crew is changing the jib over.' : 'Through the gybe: the boom is coming across.', why: '', look: s.twa < 90 ? 'the new jib telltales once she\'s settled on the new tack' : 'the boom: duck' };
  if (ctx.preStart) return { ...base, kind: 'info', head: `Pre-start: trim's set. ${s.speedKt.toFixed(1)} kt; ease to slow, trim to go.`, why: '', look: 'the line and the clock' };
  // the crew's sheets a moment behind a change of course, or she's still getting going: not "right" yet
  // (not the main eased on purpose in a breeze: that's the crew depowering)
  const lag = ([['main', b.trim.main, 'mainsheet'], ['jib', b.trim.jib, 'jibsheet']] as const).find(([n, t, k]) => t && t.flow !== 'good' && t.amount > 0.1 && !byHand(b, k) && !(n === 'main' && s.over && (b.depower ?? 0) > 0.6 && t.flow === 'luffing'));
  if (lag && s.awa < 110) return { ...base, kind: 'info', head: `The crew is catching up: the ${lag[0]} is ${lag[1]!.flow === 'stalled' ? 'stalled' : 'luffing'} for a moment.`, why: 'They trim at a human pace, a second or two behind a change of course or a shift.', look: `the ${lag[0]}'s telltales: watch them settle` };
  if (s.speedKt < 0.85 * s.targetKt && !s.over) return { ...base, kind: 'info', head: `Building speed: ${s.speedKt.toFixed(1)} kt, the polar's ${s.targetKt.toFixed(1)}.`, why: 'The sails are set: a two-tonne boat takes a while to get going. Sail her straight and let her build.', look: 'the speedo climbing' };
  const steer = s.up ? 'Steer to the jib telltales: both sides streaming.' : s.awa > 110 ? 'Keep the boom out and steer smoothly through the waves.' : 'Ease the sheets until the luffs just lift, then trim back a touch.';
  // (a teaching choice, made deliberately: the traveller held up in a breeze costs almost nothing in the model, since
  // the vang holds the leech while the crew eases the sheet, so it isn't a fix; but it's worth knowing why most boats
  // drop it, so it's said here rather than left unsaid)
  const travUp = byHand(b, 'traveller') && b.ctl.traveller < -0.2;
  if (s.over) return { ...base, head: `Trim's right for ${Math.round(s.tws)} kt: ${s.speedKt.toFixed(1)} kt.`,
    why: travUp ? 'The traveller up costs little here: the vang holds the leech while the crew eases the sheet. Most boats drop it in a breeze instead, so the boom goes down to leeward without the leech opening.'
      : `The polar's ${s.targetKt.toFixed(1)} kt assumes she can carry full power; in this breeze she can't, so she's depowered.`,
    look: 'the heel: under about 20°, and a light helm' };
  return { ...base, head: `Trim's right: ${s.speedKt.toFixed(1)} kt against the polar's ${s.targetKt.toFixed(1)}.`, why: '', look: steer };
}

export function teach(b: Boat, ctx: CoachContext = {}): CoachView {
  const { s, list } = lessons(b, ctx);
  const top = list.find(l => l.kind !== 'fix' || l.gain >= FIX_MIN || l.id.startsWith('hove:'));
  const more = list.filter(l => l !== top && l.kind === 'fix' && l.gain >= FIX_MIN / 2);
  return { situation: s, top: top ?? confirmation(b, s, ctx), more, crew: crewLine(b, s) };
}

/**
 * The coach's memory between looks: it holds a lesson steady (no flicker between two of nearly the same weight),
 * and when the one it's been teaching is fixed, it says so, with the speed it made, for a few seconds.
 */
export class CoachMemory {
  top: { id: string; done?: string; line?: LineKey; from?: number; to?: number; speedKt: number; since: number } | null = null;
  doneText: { text: string; until: number } | null = null;
  /** A fix just made: announced once she's had a few seconds to pick up the speed it's worth. */
  pending: { done: string; speedKt: number; at: number } | null = null;
  /** When a lesson was last put on screen (for the brief headline while sailing). */
  shown = new Map<string, number>();

  /** Was the lesson we were teaching fixed by you (not handed back, not left behind by easing to slow down or a tack)? */
  private fixed(b: Boat, prev: NonNullable<CoachMemory['top']>, nextId: string): boolean {
    if (b.luff || b.tacking || b.turnTarget != null || b.docked) return false;
    if (prev.line && prev.from != null && prev.to != null) {
      if (!byHand(b, prev.line)) return false; // given back: the crew fixed it, not you
      const now = (b.ctl as unknown as Record<string, number>)[prev.line];
      // (moved toward where the coach said, a good part of the way: the lesson goes once what's left is too small to say)
      return (prev.from - now) * (prev.from - prev.to) > 0 && Math.abs(prev.from - now) >= 0.3 * Math.abs(prev.from - prev.to);
    }
    if (prev.id.startsWith('hove:')) return nextId === 'hove:balanced' || ((prev.id === 'hove:takemain' || prev.id === 'hove:easemain') && nextId === 'hove:lash');
    return prev.id.startsWith('steer:');
  }

  /** Look again: the view to show, and `fresh` when it's a new thing to say (the headline goes on screen briefly). */
  step(b: Boat, t: number, ctx: CoachContext = {}): { view: CoachView; done: string | null; fresh: string | null } {
    let view = teach(b, ctx);
    const s = view.situation, prev = this.top;
    // hold the lesson we're teaching while it's still nearly as big as the biggest
    if (prev && view.top.id !== prev.id) {
      const still = [view.top, ...view.more].find(l => l.id === prev.id);
      if (still && still.gain >= 0.6 * view.top.gain) view = { ...view, top: still, more: [view.top, ...view.more.filter(l => l !== still)] };
    }
    let fresh: string | null = null;
    if (prev && view.top.id !== prev.id && prev.done && !view.more.some(l => l.id === prev.id) && this.fixed(b, prev, view.top.id))
      this.pending = { done: prev.done, speedKt: prev.speedKt, at: t + 5 };
    if (this.pending && t >= this.pending.at) {
      const p = this.pending, dv = s.speedKt - p.speedKt; this.pending = null;
      this.doneText = { text: `That's it: ${p.done}${dv >= 0.05 ? `, ${p.speedKt.toFixed(1)} → ${s.speedKt.toFixed(1)} kt` : ''}.`, until: t + 5 };
      fresh = this.doneText.text;
    }
    if (!prev || view.top.id !== prev.id) {
      const tp = view.top;
      this.top = tp.kind === 'fix' || tp.id.startsWith('hove:') ? { id: tp.id, done: tp.done, line: tp.line, from: tp.line ? (b.ctl as unknown as Record<string, number>)[tp.line] : undefined, to: tp.to, speedKt: s.speedKt, since: t } : null;
      // a new thing to fix goes on screen (not the same one again within half a minute)
      if (!fresh && tp.kind === 'fix' && t - (this.shown.get(tp.id) ?? -1e9) > 30) { fresh = tp.head; this.shown.set(tp.id, t); }
    }
    const done = this.doneText && t < this.doneText.until ? this.doneText.text : null;
    return { view, done, fresh };
  }
}

/** For the panel's footer, when paused: every lesson in full. */
export const describe = (l: Lesson) => [l.head, l.why, l.look ? `Look at: ${l.look}.` : ''].filter(Boolean).join(' ');
