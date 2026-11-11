import type { Boat, LineKey } from './boat';
import { heelFactor, heelWithCrew, helmNeeded, rudderDrag, sailForces } from './balance';
import { boomAngle, jibClew, jibShape, mainShape, mainsheetFor, shapeEfficiency, targetShape, type Controls } from './controls';
import { crewMoment, displacement } from './crewPhys';
import { condition } from './condition';
import { hullResistance } from './dynamics';
import { beatAngle, polar } from './polar';
import { byHand, crewMainAngle, leeDrift, sailPlan } from './physics';
import { SAILS, optimalSheet, sailTrim, trimDrive } from './trim';
import { KT, clamp } from '../core/math';

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

/**
 * How fast she'd go with these settings, relative (the same factors physics.ts multiplies the polar by: the sails'
 * angle of attack and shape as drive, heel past her best, and the drag of the helm the sails demand).
 */
function speedFactor(b: Boat, c: Controls): number {
  const tws = b.ww.kt, awa = b.awa, aws = b.aws / KT, plan = sailPlan(b), cond = b.spec ? (b.cond ??= condition(b.spec)) : null;
  const main = clamp(boomAngle(c), SAILS.main.min, SAILS.main.max), clew = jibClew(c, b.tack);
  if (clew < 0) return 0; // backed: not sailing
  const jib = clamp(clew, SAILS.jib.min, SAILS.jib.max);
  const tm = sailTrim('main', awa, main), tj = plan === 'jib' ? sailTrim('jib', awa, jib) : null;
  const ms = mainShape(c, tws, cond?.main, aws), js = plan === 'jib' ? jibShape(c, tws, b.tack, cond?.jib, aws) : null;
  const em = shapeEfficiency(ms, targetShape('main', tws, awa, b.depower)), ej = js ? shapeEfficiency(js, targetShape('jib', tws, awa, b.depower)) : 1;
  const eff = js ? SAILS.main.share * em + SAILS.jib.share * ej : em;
  let f = Math.sqrt(Math.max(0, trimDrive(tm, tj) * eff));
  // heel and helm, with the crew where they are now
  const sf = sailForces(b.aws, awa, { trim: tm, shape: ms, out: main }, tj && js ? { trim: tj, shape: js } : null, false);
  const cs = b.crew;
  if (cs) {
    const disp = displacement(cs.spec) + (cond?.extraKg ?? 0), F = sf.main.heel + sf.jib.heel;
    const heel = heelWithCrew(F, sf.twist, disp, h => crewMoment(cs, h) + (cond ? cond.rightingDelta(h) : 0)) * (b.twa > 120 ? 0.6 : 1);
    f *= heelFactor(heel);
    const v = Math.max(0.8, b.v), hn = helmNeeded(sf, heel, main, v, sf.twist);
    f *= 1 - 0.5 * rudderDrag(clamp(hn, -12, 12), v) / Math.max(1, hullResistance(v));
  }
  return f;
}

const RANGE: Partial<Record<LineKey, [number, number]>> = { traveller: [-1, 1] };
/**
 * The controls as they'd be with one line moved, and the crew answering it as they do (physics.ts trimSails): the
 * mainsheet and traveller set the boom together: with the traveller yours, the crew re-sheets to keep the boom where they
 * want it (with the mainsheet yours, they leave the traveller where it's set for the conditions).
 */
function withCrew(b: Boat, k: LineKey, v: number): Controls {
  const c = { ...b.ctl, [k]: v } as Controls, want = crewMainAngle(b);
  if (k === 'traveller' && !byHand(b, 'mainsheet')) c.mainsheet = mainsheetFor(want, v);
  return c;
}
/** The best setting for one line with the crew answering it, and the speed it's worth. */
function bestFor(b: Boat, k: Exclude<LineKey, 'car' | 'jibsheetW'>): { to: number; gain: number } {
  const [lo, hi] = RANGE[k] ?? [0, 1], base = speedFactor(b, withCrew(b, k, b.ctl[k]));
  if (!(base > 0)) return { to: b.ctl[k], gain: 0 };
  let to = b.ctl[k], best = base;
  for (let i = 0; i <= 40; i++) {
    const v = lo + (hi - lo) * i / 40, f = speedFactor(b, withCrew(b, k, v));
    if (f > best * 1.0005) { best = f; to = v; }
  }
  return { to, gain: best / base - 1 };
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
      if (!more) return { ...base, head: `Trim the main in, about ${deg(n)}.`,
        why: s.awa > 110 ? 'Eased right out, the main pushes from far outboard and she wants to round up: in a touch, the helm lightens.'
          : b.trim.main.flow === 'luffing' ? 'The main is luffing: its front is lifting, so it isn\'t pulling.' : 'The leech is too open: the top of the main is spilling wind you could use.',
        look: s.awa > 110 ? 'the weight on the tiller' : b.trim.main.flow === 'luffing' ? 'the bubble behind the mast, and the windward side of the luff lifting' : 'the top batten: parallel to the boom when it\'s right',
        done: 'main drawing' };
      return { ...base, head: `Ease the main, about ${deg(n)}.`,
        why: s.awa > 110 ? 'Off the wind the main works by presenting area: eased out, square to the wind, it catches the most.'
          : s.over ? 'She\'s overpowered: with the main in this hard she heels and drags her rudder instead of driving.' : 'The main is over-trimmed: the flow is breaking off its back, so it pushes sideways more than forward.',
        look: s.awa > 110 ? 'the boom: out until it\'s nearly against the shroud' : s.over ? 'the heel and the weight on the tiller: both should ease' : 'the leech telltales: streaming off the back, not curling behind it',
        done: s.over ? 'she\'s back on her feet' : 'leech telltales streaming' };
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
      const name = k === 'cunningham' ? 'Cunningham' : 'downhaul', Name = name[0].toUpperCase() + name.slice(1);
      return { ...base,
        head: more ? `${Name} on, ${amount(d)}.` : `Ease the ${name}, ${easeAmount(d)}.`,
        why: more ? 'The breeze has blown the main\'s draft aft: luff tension pulls it forward again.' : 'The draft is too far forward: the front is round and the leech flat. Easing it lets the draft move back toward the middle, for power.',
        look: 'the draft stripes: the deepest point a little less than halfway back', done: 'draft where it should be' };
    }
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
    const g = Math.sqrt(1 / Math.max(0.05, trimDrive(tm, tj))) - 1;
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
      gain: Math.max(1 - heelFactor(heel), 0.5 * rudderDrag(Math.min(12, hn), v) / Math.max(1, hullResistance(v))), kind: 'fix' });
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
  outhaul: 'outhaul', cunningham: 'Cunningham', downhaul: 'downhaul', jibCunningham: 'jib Cunningham', car: 'jib car' };
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

const LINE_KEYS = ['mainsheet', 'jibsheet', 'traveller', 'backstay', 'vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham'] as const;

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
  for (const src of SOURCES) list.push(...src(b, s, ctx));
  list.sort((x, y) => y.gain - x.gain);
  return { s, list };
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
  if (s.over) return { ...base, head: `Trim's right for ${Math.round(s.tws)} kt: ${s.speedKt.toFixed(1)} kt.`, why: `The polar's ${s.targetKt.toFixed(1)} kt assumes she can carry full power; in this breeze she can't, so she's depowered.`, look: 'the heel: under about 20°, and a light helm' };
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
