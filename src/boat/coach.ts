import { setOntoPier } from '../geo/fortMason';
import { bow, stern, type Boat, type LineKey } from './boat';
import { heelFactor, heelWithCrew, helmNeeded, rudderDrag, sailForces } from './balance';
import { CAR_FORE_PINS, boomAngle, crewSolve, depowerLimits, planWorth, jibClew, jibShape, mainShape, mainsheetFor, shapeEfficiency, targetShape, type Controls, type CrewSettings, type Shape } from './controls';
import { crewBestHeel, crewMass, crewMoment, crewSkill, displacement, specAttr } from './crewPhys';
import { crewHeading } from './crewWork';
import { condition, rigOf } from './condition';
import { airDrag, driveSpeedRatio, hullResistance } from './dynamics';
import { driveCurveFor } from './driveCurve';
import { beatAngle, polar } from './polar';
import { byHand, crewEaseBoom, crewMainAngle, leeDrift, pinchFlog, sailFrame, sailPlan, sailPush, sailWind } from './physics';
import orc from './data/nordic-folkboat-orc.json';
const DRAFT = orc.boat.draft;
import { SAILS, optimalSheet, sailTrim, trimDrive } from './trim';
import { D2R, KT, V, clamp } from '../core/math';
import { inBasin } from '../geo/marina';
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
  /** For Trim Notes and the live note: what the line is doing to her now, in a few words (a line's lessons). */
  now?: string;
  /** For Trim Notes and the live note: the reason, shorter than `why`, one line. */
  short?: string;
  /** What to look at on the boat to see it. */
  look: string;
  /** What to say when it's fixed (e.g. 'the jib\'s luff telltales streaming, windward and leeward'). */
  done?: string;
  gain: number;
  kind: 'fix' | 'ok' | 'info';
}

/** What the race is doing, from outside the boat (the world knows; the boat doesn't). */
export interface CoachContext { preStart?: boolean; justRounded?: boolean; /** the band it last said, held a half-knot about each edge */ band?: Situation['band'] }

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
  // the wind's band by the number the sailor sees (rounded: a 7 is light, a 15 medium, so the label never reads 7 one way
  // and 7 the other), and held a half-knot past each edge once it's said, so it doesn't flip as the wind wavers there
  const bandOf = (k: number): Situation['band'] => (k < 7.5 ? 'light' : k < 15.5 ? 'medium' : 'heavy');
  const raw = bandOf(tws), prev = ctx.band, near = (e: number) => Math.abs(tws - e) < 0.5;
  const band = prev && prev !== raw && ((raw !== 'heavy' && prev !== 'heavy' && near(7.5)) || (raw !== 'light' && prev !== 'light' && near(15.5))) ? prev : raw;
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
export function speedFactor(b: Boat, c: Controls, now = false): number {
  // (twice: her heel with these sails changes the wind the sails see (heeled, the apparent wind across them is the
  // narrower), and the crew sheet to that wind as she comes up or goes down (physics.ts crewMainAngle, on awaSlow), so a
  // flatter sail that lets her stand up has them ease a touch and keep some of the power: weighed at the heel the first
  // look finds, with the sheets the crew hold where they'd put them there. Without it the coach promised a breeze's
  // small fixes twice what they paid: the physics review, 15 Nov)
  const d0 = b.depower ?? 0, first = speedAt(b, c, b.heel ?? 0, 0, 0, d0);
  // (and the crew's depowering step as they'd move it for these sails (physics.ts trimSails, `over`): all the way while
  // she needs more than 6° of helm and they're out as far as they go; toward their fastest step once past their slack.
  // A main hauled in hard on old sails held her at 7° of helm and the last step; eased, the crew came back off it, and
  // the ease they'd meant for it went with it: the final physics review, 15 Nov)
  const up = Math.abs(b.awaSlow) < 70, cs0 = b.crew, maxed = !cs0 || !!cs0.place?.across || !!cs0.allOut;
  const goal = b.depowerBest ?? (up ? clamp((b.ww.kt - 14) / 10, 0, 1) : 0), slack = 0.03 + 0.07 * (1 - crewSkill(b.crew));
  // (her lines as they are: she's settled there already, at the step they hold (near 6° of helm it rests on that limit))
  let d1 = now || !up ? d0 : Math.abs(first.helm) > 6 && maxed ? 1 : d0 > goal + slack && Math.abs(first.helm) < 6 ? goal + slack : d0 < goal - slack && maxed ? goal - slack : d0; // (they stop once within their slack of it)
  // (coming back off the steps, they stop where the helm reaches 6° again, if it does before their fastest step: there
  // the helm holds them, as the step's own rule does)
  if (!now && d1 === goal + slack && d0 > d1) {
    const hg = Math.abs(speedAt(b, c, b.heel ?? 0, 0, 0, d1).helm), h0 = Math.abs(first.helm);
    if (hg > 6 && hg > h0) d1 += (d0 - d1) * (hg - 6) / (hg - h0);
  }
  // (at that step her heel found afresh: the first look had the sails at the old one)
  const at1 = Math.abs(d1 - d0) < 0.01 ? first : speedAt(b, c, b.heel ?? 0, 0, 0, d1);
  if (!b.crew || Math.abs(at1.heel - (b.heelMag ?? 0)) < 0.2) return at1.s;
  const fr = sailFrame(b), sideOf = Math.sign(b.heel || 1), at = (h: number) => sailWind(b.ww.from, b.ww.kt, b.h + fr.rot, fr.along, fr.across, sideOf * h).awa;
  const a0 = at(b.heelMag ?? 0), a1 = at(at1.heel);
  // (a main the crew sheet: to the wider wind, and to the ease they mean at the step they'd move to)
  const dm = byHand(b, 'mainsheet') ? 0 : optimalSheet('main', a1) - optimalSheet('main', a0) + crewEaseBoom({ ...b, depower: d1 } as Boat) - crewEaseBoom(b), dj = byHand(b, 'jibsheet') ? 0 : optimalSheet('jib', a1) - optimalSheet('jib', a0);
  return speedAt(b, c, sideOf * at1.heel, dm, dj, d1).s;
}
function speedAt(b: Boat, c: Controls, heelIn: number, dm: number, dj: number, dep: number): { s: number; heel: number; helm: number } {
  // (in the wind the sails see as she heels, as the boat does: physics.ts sailWind, ORC eqs. 7.2–7.3; and in the frame
  // the boat trims them in, across her course through the water, her leeway in it (physics.ts sailFrame). Without the
  // leeway the coach judged her trim some 5° off the boat's and promised what the boat never paid: Bay East, 14 Nov)
  const fr = sailFrame(b), sw = sailWind(b.ww.from, b.ww.kt, b.h + fr.rot, fr.along, fr.across, heelIn);
  const tws = b.ww.kt, awa = sw.awa, aws = sw.aws / KT, plan = sailPlan(b), cond = b.spec ? (b.cond ?? condition(b.spec)) : null; // (nothing kept on b: the page's copy is read-only)
  const main = clamp(boomAngle(c) + dm, SAILS.main.min, SAILS.main.max), clew = jibClew(c, b.tack);
  if (clew < 0) return { s: 0, heel: b.heelMag ?? 0, helm: 0 }; // backed: not sailing
  const jib = clamp(clew + dj, SAILS.jib.min, SAILS.jib.max);
  const tm = sailTrim('main', awa, main), tj = plan === 'jib' ? sailTrim('jib', awa, jib) : null;
  const ms = mainShape(c, tws, rigOf(b), aws), js = plan === 'jib' ? jibShape(c, tws, b.tack, cond?.jib, aws, rigOf(b)?.tune) : null;
  const em = shapeEfficiency(ms, targetShape('main', tws, awa, dep)), ej = js ? shapeEfficiency(js, targetShape('jib', tws, awa, dep)) : 1;
  const eff = js ? SAILS.main.share * em + SAILS.jib.share * ej : em;
  // (the main's sheet against the crew's intended boom, eased down the traveller on purpose on the last depowering steps,
  // as physics.ts trimSails counts it; the deliberate ease is in the sails' power, below)
  const ease = crewEaseBoom({ ...b, depower: dep } as Boat); // (the crew's deliberate ease at this step: physics.ts crewEaseBoom)
  // (shares of the drive multiply; what they're worth in speed is where the drive meets the hull's resistance, as the
  // boat itself counts it: dynamics.ts speedForDrive)
  let K = Math.max(0, trimDrive(sailTrim('main', awa, clamp(main - ease, SAILS.main.min, SAILS.main.max)), tj) * eff), f = 1;
  // heel and helm, with the crew where they are now
  const sf = sailForces(sw.aws, sw.awa, { trim: tm, shape: ms, out: main }, tj && js ? { trim: tj, shape: js } : null, false);
  // (old cloth: its hooked leech's extra drag and lost lift, the drive it costs against the same shape in sound cloth, as
  // the step counts it (physics.ts wornDrive): hard in, an old main's leech hooks and stalls. Without it the coach had
  // an old main sheeted in a breeze paying, where it cost her: the final physics review, 15 Nov)
  if (ms.cd0 || ms.clMul || js?.cd0 || js?.clMul) {
    const sound = (sh: Shape): Shape => ({ depth: sh.depth, draft: sh.draft, twist: sh.twist, ceAft: sh.ceAft });
    const s0 = sailForces(sw.aws, sw.awa, { trim: tm, shape: sound(ms), out: main }, tj && js ? { trim: tj, shape: sound(js) } : null, false);
    const d0 = s0.main.drive + s0.jib.drive;
    if (d0 > 5) K *= clamp((sf.main.drive + sf.jib.drive) / d0, 0.6, 1.05);
  }
  const cs = b.crew;
  let heelC = b.heelMag ?? 0, helm = 0;
  if (cs) {
    const disp = displacement(cs.spec) + (cond?.extraKg ?? 0), F = sf.main.heel + sf.jib.heel;
    let heel = heelWithCrew(F, sf.ceh, disp, h => crewMoment(cs, h) + (cond ? cond.rightingDelta(h) : 0), crewMass(cs.spec));
    // (the crew answering: they sail her at the heel they want (physics.ts crewAndHeel, crewPhys.ts crewBestHeel), so
    // while she's there, sails that heel her less only let them sit in: the heel, and what it's worth, stay. Without
    // this the coach promised a flatter main's heel back in 12–14 kt that the boat never delivered: Bay East, 14 Nov)
    const bh = crewBestHeel(b.twa, tws, specAttr(cs.spec, 'trim'));
    // (hiking above it, they sit in toward it as the sails ease off her; only short of it in light air do they not)
    if ((b.heelMag ?? 0) > bh - 1.5) heel = Math.max(heel, bh);
    f *= heelFactor(heel); heelC = heel;
    const v = Math.max(0.8, b.v), hn = helmNeeded(sf, heel, main, v, sf.ceh);
    // the drive the sails make less the keel's drag for their side force (balance.ts netDrive): flatter sails push less,
    // but heel her less and ask less of the keel; against the drive as she is, as physics.ts powerFactor weighs it
    // (exactly as the boat weighs it: physics.ts sailPush, against the push with her lines as they are)
    // (at her course's angle, her leeway on her heading, as the boat's own powerFactor weighs it: physics.ts step)
    const twaC = Math.min(180, b.twa + (b.leeway ?? 0));
    const pushNow = sailPush(tws, twaC, plan, b.shape.main, plan === 'jib' ? b.shape.jib : null, b.heelMag ?? 0, b.depower ?? 0);
    if (pushNow > 1) K *= Math.max(0, sailPush(tws, twaC, plan, ms, js, heel, dep)) / pushNow;
    // (against the polar crew's push as the boat holds it (physics.ts powerFactor's b.powerK, and the polar crew's heel,
    // b.powerRefHeel): a ratio alone cancels in a gain, but not against a force (the flogging's windage, the helm's
    // drag) nor against her speed: without it a main half luffing had her a sixth slower than she sails)
    K *= b.powerK ?? 1; f /= b.powerRefHeel ?? 1;
    helm = clamp(hn, -12, 12);
  }
  // her leeway with these sails, as the boat makes it (physics.ts step: the side force against the keel's lift at the
  // polar's speed, slender-wing lift, Newman §5.12), against hers now: at the heading she holds, sails that heel her less
  // slip less, so her course is higher, her polar speed less and her VMG more; at the heading, the speed is what she pays
  const lw0 = b.leeway ?? 0, crs0 = Math.min(180, b.twa + lw0);
  const lwFor = (F: number, h: number) => b.twa < 150 ? clamp(F * Math.cos(h * D2R) / (0.5 * 1025 * Math.PI * DRAFT ** 2 * Math.max(0.8, polar(tws, crs0, plan)) ** 2) / D2R, 0, 12) : 0;
  const lw = lw0 + lwFor(sf.main.heel + sf.jib.heel, heelC) - lwFor(b.forces?.heel ?? sf.main.heel + sf.jib.heel, b.heelMag ?? 0);
  const crs = Math.min(180, b.twa + Math.max(0, lw)), vt0 = Math.max(0.5, polar(tws, crs0, plan));
  const vT = f * driveSpeed(b, K) * Math.max(0.5, polar(tws, crs, plan));
  // the sails flogging, as the boat counts it (physics.ts sailFlog, pinchFlog; dynamics.ts airDrag): a main eased till it
  // luffs, or a course pinched below the beat, costs her windage the drive no longer pays for. A force, so where it
  // leaves her is where the drive at her speed meets the hull's resistance and it, as the surge settles (dynamics.ts
  // surgeAccel), in the wind across her hull, as the step takes it; a main eased down the traveler looked free to the
  // coach without it (Bay East, 15 Nov)
  const luffAmt = (t: { flow: string; amount: number } | null) => t && t.flow === 'luffing' ? t.amount : 0;
  const flog = Math.max(Math.min(1, SAILS.main.share * luffAmt(sailTrim('main', awa, clamp(main - ease, SAILS.main.min, SAILS.main.max))) + (tj ? SAILS.jib.share * luffAmt(tj) : 0)), pinchFlog(crs, beatAngle(tws)));
  // (and the helm the sails demand, its drag a force on her the same way: physics.ts helmDrag, at the speed she settles at)
  // (the step's own wind for it: at the sails' height, at her heading, physics.ts step `ap`; b.aws is the sail frame's
  // wind at 10 m, some 12% stronger in its pressure: the second physics review, 15 Nov)
  const apH = flog > 0 ? sailWind(b.ww.from, b.ww.kt, b.h, b.v - (b.astern ?? 0), b.sway ?? 0, b.heel ?? 0) : null;
  const D = apH ? airDrag(apH.aws, apH.awa, flog) : 0;
  if (vT <= 0.05 || (D <= 0 && helm === 0)) return { s: vT / vt0, heel: heelC, helm };
  const rT = hullResistance(vT), k = driveCurveFor(tws, crs, vT), g = (v: number) => rT * k(v) - hullResistance(v) - D - rudderDrag(helm, v);
  let lo = 0, hi = vT;
  if (g(lo) <= 0) return { s: 0, heel: heelC, helm };
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (g(m) > 0) lo = m; else hi = m; }
  return { s: (lo + hi) / 2 / vt0, heel: heelC, helm };
}

const RANGE: Partial<Record<LineKey, [number, number]>> = { traveller: [-1, 1] };
/**
 * The controls as they'd be with one line moved, and the crew answering it as they do (physics.ts trimSails): the
 * mainsheet and traveller set the boom together: with the traveller yours, the crew re-sheets to keep the boom where they
 * want it; with the mainsheet yours, they leave the car where it is (physics.ts: the boom is yours).
 */
export function withCrew(b: Boat, k: LineKey, v: number): Controls {
  const c = { ...b.ctl, [k]: v } as Controls, want = crewMainAngle(b);
  // (and the crew's lines where they're already taking them, by their own decisions (crewWork.ts crewHeading): a line
  // they're setting, or will once their waits let them, judged at their setting, not where it is now on the way.
  // Settling in, a vang eased over the next minute; promised against the line half-way, the fix was worth what the crew
  // were about to give her anyway, and the boat left alone caught up. A line they're holding (set a minute ago, a puff's
  // swing, a placed crew's wait) stays where it is: judged at their plan, the coach priced a boat they weren't sailing)
  for (const x of FIXABLE) if (x !== k && !byHand(b, x)) { const h = crewHeading(b, x); if (h != null) c[x] = h; }
  // (and the car, the crew's with the sheet yours: they move it at once, to their plan, no waits)
  if (k !== 'traveller' && byHand(b, 'mainsheet') && !byHand(b, 'traveller') && b.crewPlan) c.traveller = b.crewPlan.traveller;
  if (k === 'traveller' && !byHand(b, 'mainsheet')) c.mainsheet = mainsheetFor(want, v);
  // (a shape line moved under a main the crew trim: they set the car and the sheet around it as they do every second,
  // the lines you hold fixed where you have them (physics.ts trimSails, crewSolve): the vang off upwind, they sheet
  // harder and drop the car to hold the leech. Without it the coach saw the leech twist away that the crew never let go,
  // and missed what the vang hard on was costing: the physics review, 15 Nov)
  else if (k !== 'mainsheet' && k !== 'traveller' && k !== 'jibsheet' && k !== 'car' && k !== 'jibsheetW' && !byHand(b, 'mainsheet') && !byHand(b, 'traveller')) {
    const fixed: Partial<CrewSettings> = {};
    for (const x of FIXABLE) if (x === k || byHand(b, x)) fixed[x] = c[x];
    const tws = b.ww.kt, cond = b.spec ? (b.cond ?? condition(b.spec)) : null; // (nothing kept on b: the page's copy is read-only)
    const plan = crewSolve(tws, b.awaSlow, b.tack, want, optimalSheet('jib', b.awaSlow), b.crewPlan ?? undefined, rigOf(b), cond?.jib, b.aws / KT, b.depower, fixed);
    // (and only if it's worth the trip to them, as they judge it: physics.ts trimSails, controls.ts planWorth; a skilled
    // crew moves the car for ~0.1% of drive, a novice for ~0.4%)
    // (every line of theirs, as trimSails applies the plan: the outhaul off, they may take the backstay up as well)
    const worth = planWorth(c, plan, tws, b.awaSlow, b.tack, want, optimalSheet('jib', b.awaSlow), rigOf(b), cond?.jib, b.aws / KT, b.depower), minGain = 0.001 + 0.003 * (1 - crewSkill(b.crew));
    for (const x of ['traveller', ...FIXABLE] as const) if (fixed[x as keyof CrewSettings] == null && (worth[x] ?? 1) >= minGain) c[x] = plan[x];
    c.mainsheet = mainsheetFor(want, c.traveller);
  }
  return c;
}
const FIXABLE = ['vang', 'outhaul', 'cunningham', 'downhaul', 'backstay', 'jibCunningham', 'jibHalyard'] as const;
/** Whether the crew are taking any of her other lines somewhere (withCrew): then the boat as she is isn't settled, and
 * the base is priced as the candidates are, the depowering step free to move as theirs does (speedFactor's `now`). */
const crewMoving = (b: Boat, k: LineKey) => FIXABLE.some(x => x !== k && !byHand(b, x) && crewHeading(b, x) != null);
/** The best setting for one line with the crew answering it, and the speed it's worth. */
function bestFor(b: Boat, k: Exclude<LineKey, 'car' | 'jibsheetW'>): { to: number; gain: number } {
  // (never past the most the crew themselves would set it: the North Sails guide's caps, controls.ts depowerLimits.
  // Without them the coach found "vang on, hard" upwind in 6–8 kt with the main eased, which the guide forbids: "Never
  // use the kickingstrap upwind in less than 18 knots"; the cure there is the sheet. The guide's minimums aren't
  // applied: whether its outhaul-to-the-mark beats the speed search in a breeze is the open depowering question)
  const lim = depowerLimits(b.depower ?? 0, b.awa, b.ww.kt), [lo, hi0] = RANGE[k] ?? [0, 1];
  const hi = Math.max(lo, Math.min(hi0, lim.max[k as keyof CrewSettings] ?? hi0)), base = speedFactor(b, withCrew(b, k, b.ctl[k]), !crewMoving(b, k));
  // (with both sails flogging the drive is nil: a floor, so the line that brings one back still counts)
  let to = b.ctl[k], best = Math.max(base, 0);
  // (coarse, then fine about the best: a tenth of the range, then a fortieth either side of it, at half the looks of a
  // fortieth all through, each with the crew's own solve: controls.ts crewSolve. Of the settings within 0.05% of the
  // best, the one nearest where the line is (a shape line's: a sheet takes its best): the least you need do for it, and on a broad top the model's far end is
  // where it's least sure; climbing from one end it took the far end, which the boat didn't pay: the physics review)
  const seen: [number, number][] = [];
  const look = (v: number) => { const f = speedFactor(b, withCrew(b, k, v)); seen.push([v, f]); if (f > best) best = f; };
  for (let i = 0; i <= 10; i++) look(lo + (hi - lo) * i / 10);
  const mid = seen.reduce((a, x) => x[1] > a[1] ? x : a)[0], d = (hi - lo) / 40;
  for (const j of [-3, -2, -1, 1, 2, 3]) { const v = mid + j * d; if (v >= lo && v <= hi) look(v); }
  const sheet = k === 'mainsheet' || k === 'jibsheet' || k === 'traveller';
  if (best > Math.max(base, 0) * 1.0005) {
    // (a sheet's or the car's best is at the edge of a luff: the nearest that's nearly as good is on the edge itself)
    let near = Infinity, pick = best;
    for (const [v, f] of seen) if ((sheet ? f >= best : f * 1.0005 >= best) && Math.abs(v - b.ctl[k]) < near) { near = Math.abs(v - b.ctl[k]); to = v; pick = f; }
    best = pick;
  } else best = Math.max(base, 0);
  // (a sail flogging hard: the model has her all but stopped while she still sails on at a third of her speed or more, and
  // a gain over its near-nothing is one the boat never pays, so it's counted from where she is. Only then: a promise is
  // two settled states against each other, and the way she carries over them in a lull, after heading up or surfing
  // decays alike whichever way the line's set; the physics review, 15 Nov)
  // (fully below a fifth of her polar speed, where a flogging sail's windage outweighs the little drive the model leaves
  // her; not at all from two fifths, where the model's base is her settled speed as it is for any fix; in between,
  // blended, so the promise never jumps as she slows: the second physics review, 15 Nov)
  const real = Math.min(1, b.v / Math.max(0.5, polar(b.ww.kt, Math.min(180, b.twa + (b.leeway ?? 0)), sailPlan(b))));
  const w = clamp((0.4 - base) / 0.2, 0, 1);
  return { to, gain: Math.min(3, best / Math.max(base, w * real + (1 - w) * base, 0.1) - 1) };
}

/* ---------- the lessons for a line you hold ---------- */

const amount = (d: number) => (d > 0.6 ? 'hard' : d > 0.35 ? 'a good pull' : d > 0.15 ? 'a bit' : 'a touch');
const easeAmount = (d: number) => (d > 0.6 ? 'right off' : d > 0.35 ? 'well off' : d > 0.15 ? 'a bit' : 'a touch');

function lineLesson(b: Boat, s: Situation, k: Exclude<LineKey, 'car' | 'jibsheetW'>, to: number, gain: number): Lesson {
  const l = lineLessonFull(b, s, k, to, gain);
  return { ...l, ...lineWords(b, s, k, to, l) };
}
/**
 * What a line is doing to her now and why it matters, in a few words each (Trim Notes; the owner: "what each line is
 * currently doing to the boat, what it should be doing, and why"), from the same state the lesson reads: the sails'
 * flow, the boom's angle, the line's direction. The telltales by name, as the boat has them (render/boatMesh.ts): the
 * jib's three pairs on its luff, windward and leeward; the main's on its leech, one at each batten; none on its luff.
 */
/** The wind as a sailor names it, by the coach's own bands (situation(): light to 7 kt as shown, medium to 15, heavy above). */
const airOf = (s: Situation) => (s.band === 'light' ? 'light air' : s.band === 'medium' ? 'medium air' : 'heavy air');
/** Where the main's draft sits, in words a sailor pictures (the number goes in parentheses). */
const draftWords = (d: number) => (d < 0.44 ? 'well forward' : d < 0.49 ? 'a little forward of center' : d <= 0.52 ? 'at center' : 'aft of center');
function lineWords(b: Boat, s: Situation, k: Exclude<LineKey, 'car' | 'jibsheetW'>, to: number, l: Lesson): { now: string; short: string } {
  // (the owner, 15 Nov 2026: plain sentences, what the line's doing and whether that's right, then why, as a rule a sailor
  // can remember ("Easing the outhaul gives more power in light air"); the wind as a band, not knots; no sources, no
  // state-and-colon openings)
  const more = to > b.ctl[k], air = airOf(s), In = 'In ' + air, tm = b.trim.main, tj = b.trim.jib, mineSheet = byHand(b, 'mainsheet');
  switch (k) {
    case 'mainsheet':
      if (l.kind === 'info') return { now: 'The boom is against the shroud and the main is stalled', short: 'A boom on the shroud can\'t go further: head up a little, or bear away to a run.' };
      if (l.head.startsWith('Ease the mainsheet')) return { now: 'Sheeted too hard, so the top of the leech is closed', short: `${In}, the top of the main wants to twist open a little.` };
      if (l.head.startsWith('Trim the mainsheet')) return { now: 'The leech is twisting open and the top is spilling wind', short: 'More mainsheet tension holds the leech closed.' };
      if (!more) return s.awa > 110 ? { now: 'Eased so far that she wants to round up', short: 'Trimming the main in a touch lightens the helm.' }
        : tm.flow === 'luffing' ? { now: 'Eased too far, so the main\'s luff is lifting', short: 'A main with its luff lifting isn\'t pulling.' } : { now: 'Eased past the angle where it pulls hardest', short: 'A main eased past its angle isn\'t pulling its weight.' };
      return s.awa > 110 ? { now: 'Trimmed in too far for this angle', short: 'Off the wind, the main pushes best let out to the shroud.' }
        : s.over ? { now: 'Trimmed in hard while she\'s overpowered', short: 'An overpowered boat heels and drags her rudder instead of driving.' }
        // (the leech telltales curl only past a small stall, render/sails.ts leechTellState)
        : tm.flow === 'stalled' && tm.amount > 0.12 ? { now: 'Trimmed too hard, so its leech telltales are curling behind the sail', short: 'A stalled main pushes her sideways.' } : { now: 'Trimmed past its best angle', short: 'A main trimmed past its angle is over-trimmed.' };
    case 'jibsheet':
      if (more) return s.awa > 115 ? { now: 'Trimmed in too far for this angle', short: 'Off the wind, the jib wants to be out, for area.' }
        : tj?.flow === 'stalled' ? { now: 'Trimmed too hard, so its leeward luff telltales are drooping', short: 'A stalled jib pushes her sideways.' }
        : { now: 'Trimmed past its best angle', short: 'A jib pulls hardest with its windward luff telltales just about to lift.' };
      return tj?.flow === 'luffing' ? { now: 'Eased too far, so its windward luff telltales are lifting', short: 'A luffing jib barely pulls.' }
        : s.awa > 115 ? { now: 'Eased past the angle where it pulls hardest', short: 'Trimmed in a little, the jib pulls harder.' } : { now: 'Eased past its best angle', short: 'A jib pulls hardest with its windward luff telltales just about to lift.' };
    case 'traveller': {
      // with the crew on the mainsheet they re-sheet to keep the boom where they want it: then the car moves the leech,
      // not the boom (coach.ts withCrew; physics.ts trimSails)
      const at = b.ctl.traveller > 0.1 ? 'The car is down to leeward' : b.ctl.traveller < -0.1 ? 'The car is up, but not far enough' : 'The car is in the middle';
      if (to < b.ctl[k]) return mineSheet ? { now: at, short: 'Bringing the traveler up puts the boom on the centerline with the leech still open, for height.' } : { now: at, short: 'Bringing the traveler up lets the sheet ease, which opens the leech.' };
      if (!mineSheet) return { now: 'The car is up to windward, with the sheet eased to match and the leech open', short: 'Dropping the traveler lets the sheet pull straighter, which closes the leech.' };
      return s.over ? { now: 'The car is up and she\'s overpowered', short: 'When she\'s overpowered, dropping the traveler cuts heel and helm and keeps the sail\'s shape.' } : { now: 'The boom is too close to the centerline', short: 'A boom too near the centerline over-trims the main.' };
    }
    case 'backstay': return more ? { now: 'Too loose, so both sails are full', short: `${In}, a tight backstay flattens both sails, so she drives rather than heels.` }
      : s.over ? { now: 'Tighter than she needs, so the sails are too flat', short: 'Sails flatter than she needs cost drive.' } : { now: 'Too tight, so both sails are flat', short: `${In}, an eased backstay gives fuller sails and more power.` };
    case 'vang': {
      if (more) return s.awa > 70 ? { now: 'Too loose, so the top of the main twists away', short: 'Off the wind, only the vang holds the boom down.' } : { now: 'Too loose, so the leech opens as the sheet eases', short: 'The vang holds the leech as the sheet eases, so the main keeps its shape.' };
      // (too tight: the leech closed, or (North Sails' Folkboat guide: "the kickingstrap pulls on the mast") the mast bent
      // and the main flat)
      const t = targetShape('main', s.tws, s.awa, b.depower ?? 0).twist;
      return b.shape.main.twist < t - 1 ? { now: 'Too tight, so the leech is closed', short: 'A closed leech wants more twist at the top.' } : { now: 'Too tight, so it bends the mast and flattens the main', short: `${In}, the main wants its depth, and a tight vang flattens it.` };
    }
    case 'outhaul': return more ? { now: 'Too loose, so the foot of the main is deep', short: `${In}, a tight outhaul flattens the foot and takes off power she can't use.` } : { now: 'Too tight, so the foot of the main is flat', short: `${In}, easing the outhaul gives a deeper foot and more power.` };
    case 'cunningham': case 'downhaul': return more ? { now: 'Too loose, so the main\'s draft has blown aft', short: 'Luff tension pulls the draft forward.' } : { now: 'Too tight, so the main\'s draft is too far forward', short: 'Easing luff tension lets the draft move back toward the middle, for power.' };
    case 'jibHalyard': return more ? { now: 'Too soft, so wrinkles run off the hanks and the draft sits aft', short: 'Jib halyard tension pulls the draft forward.' } : { now: 'Too tight, so a crease runs up the luff', short: 'Easing the jib halyard lets the draft move back.' };
    case 'jibCunningham': return more ? { now: 'Too loose, so the jib\'s draft has blown aft', short: 'Luff tension brings the jib\'s draft forward.' } : { now: 'Too tight, so the jib\'s draft is too far forward', short: 'Easing it moves the jib\'s draft back (to about 40%): a finer entry points higher.' };
  }
  return { now: '', short: l.why };
}
/**
 * A line that's right (no fix worth saying), as the rule that makes it right, read from the boat, and whether it earns the
 * ✓ (the owner, 15 Nov 2026: "I know they're good, but why are they good?"; "easy to understand and easy to remember
 * lessons"). The words never claim a state they don't check (the review): a sail's flow, a line's setting, the draft.
 */
function okWords(b: Boat, s: Situation, k: LineKey): { text: string; tick: boolean } {
  const tm = b.trim.main, tj = b.trim.jib, c = b.ctl, upwind = s.awa < 40, air = airOf(s), In = 'In ' + air;
  const d = b.shape.main.draft, draft = `${draftWords(d)} (${Math.round(100 * d)}%)`;
  switch (k) {
    case 'mainsheet':
      if (b.sheets.main >= SAILS.main.max - 0.5 && tm.flow === 'stalled') return { text: 'Off the wind, the boom goes out until it touches the shroud.', tick: true };
      if (tm.flow === 'luffing' && s.over) return { text: 'When she\'s overpowered, a main eased till its luff lifts keeps her on her feet.', tick: true };
      return { text: s.awa > 110 ? 'Off the wind, the main goes out by the shroud.' : 'A main is trimmed right when its leech telltales stream aft.', tick: true };
    case 'jibsheet':
      if (tj?.flow === 'luffing' && s.awa <= 115) return { text: 'A jib is trimmed right when its windward luff telltales just lift.', tick: true };
      if (tj?.flow === 'stalled' && b.sheets.jib >= SAILS.jib.max - 0.5 && s.awa <= 115) return { text: 'On a broad reach, the jib goes out to its stop.', tick: true };
      return { text: s.awa > 115 ? 'Off the wind, the jib goes right out.' : 'A jib is trimmed right when all its luff telltales stream together, both sides.', tick: true };
    case 'traveller': {
      // (sailing practice: upwind in light air the car goes up to windward, the boom to the centerline on an eased sheet;
      // it comes down to leeward as the breeze builds, to ease heel and helm (North Sails' Folkboat guide). The ✓ only
      // where the setting agrees: a car down upwind in light or medium air, not overpowered, gets the lesson and no ✓,
      // whatever small gain the speed model finds either way)
      const down = c.traveller > 0.1, up = c.traveller < -0.1, upw = s.awa <= 60;
      if (down && !upw) return { text: 'Off the wind, the traveler goes down so the boom can swing out.', tick: true };
      if (down && (s.over || s.band === 'heavy')) return { text: `In ${s.over ? 'a breeze' : air}, a traveler down to leeward eases heel and helm.`, tick: true };
      if (down) return { text: s.band === 'light' ? 'Upwind in light air, the traveler goes up to bring the boom to the centerline.' : 'Upwind in medium air, the traveler sits near the middle; down is for when she\'s overpowered.', tick: false };
      if (up && upw && s.band === 'heavy' && !s.over) return { text: 'In heavy air, the traveler comes down as she starts to heel too far.', tick: true };
      return { text: up ? `Upwind in ${air}, the traveler goes up to center the boom, for height.` : `In ${air}, the traveler in the middle balances height and heel.`, tick: true };
    }
    case 'vang':
      // (North Sails' Folkboat guide: "Never use the kickingstrap upwind in less than 18 knots"; on, it's worth too little
      // to say so, but no ✓)
      if (upwind && s.tws < 18) return c.vang <= 0.15 ? { text: 'Upwind, leave the vang slack until heavy air (18 kt).', tick: true } : { text: 'Upwind, ease the vang off until heavy air (18 kt).', tick: false };
      return { text: c.vang <= 0.15 ? `In ${air}, a slack vang lets the top of the main twist open.` : 'Off the wind, the vang holds the boom down so the leech keeps its shape.', tick: true };
    case 'outhaul': return { text: c.outhaul < 0.4 ? `Easing the outhaul gives more power in ${air}.` : `${In}, a tight outhaul flattens the foot and depowers the main.`, tick: true };
    case 'downhaul': return { text: `${In}, the main's draft sits ${draft}.`, tick: true };
    case 'cunningham': return { text: c.cunningham < 0.15 ? `${In}, the Cunningham stays slack; the halyard sets the luff.` : `${In}, the Cunningham holds the main's draft ${draft}.`, tick: true };
    case 'jibHalyard': return { text: c.jibHalyard < 0.2 ? `${In}, a soft jib halyard (small wrinkles at the hanks) keeps the jib full.` : c.jibHalyard <= 0.75 ? `${In}, the jib halyard goes just tight enough to smooth the luff.` : `${In}, a hard jib halyard pulls the jib's draft forward.`, tick: true };
    case 'jibCunningham': return { text: c.jibCunningham < 0.2 ? `${In}, the jib Cunningham stays off; the halyard sets the luff.` : `${In}, the jib Cunningham pulls the jib's draft forward.`, tick: true };
    case 'backstay': return { text: c.backstay < 0.15 ? `${In}, the backstay stays off for full sails and power.` : c.backstay > 0.7 ? `${In}, a hard backstay flattens the sails.` : `${In}, some backstay flattens the sails a little.`, tick: true };
    case 'car': { // (a lesson, not a setting (the owner, 15 Nov 2026), by where the crew's own model has it: forward is fuller,
      // aft flattens the foot and opens the leech, as the heavy-air steps take it: controls.ts crewSolve, depowerLimits.carAft)
      const f = c.car[b.tack].fore, mid = (CAR_FORE_PINS - 1) / 2;
      return { text: f < mid - 0.5 ? `${In}, the jib car goes forward for a fuller jib.` : f > mid + 0.5 ? `${In}, the jib car goes aft to flatten the jib and open its leech.` : `${In}, the jib car sits in the middle, for an even twist.`, tick: false }; } // (not priced: no ✓)
  }
  return { text: 'Right', tick: true };
}

/** One line's note for Trim Notes: right, or what to do; who has it. */
export interface LineNote { line: LineKey; who: 'you' | 'crew'; fix: Lesson | null; ok: string; tick: boolean }
/**
 * Every line's note (Trim Notes: the owner wants each line). Yours as the coach finds them; the crew's as they've set
 * them, with no fix: a one-line search at their steady state finds "fixes" that make her slower (the review: easing the
 * main on purpose in 26 kt, the outhaul on its mark), so their lines say what they're doing.
 */
export function lineNotes(b: Boat, ctx: CoachContext = {}): { s: Situation; notes: LineNote[] } {
  const s = situation(b, ctx), notes: LineNote[] = [];
  const busy = b.docked || (b.rig && (b.rig.main < 1 || b.rig.jib < 1)) || b.hove || b.luff || b.tacking || b.turnTarget != null || (b.penalty ?? 0) > 0;
  for (const k of [...LINE_KEYS, 'car'] as LineKey[]) {
    if (k === 'jibsheet' && sailPlan(b) !== 'jib') continue;
    const who = byHand(b, k) ? 'you' : 'crew';
    let fix: Lesson | null = null;
    // (the main eased on purpose when she's overpowered: not a fix, as the coach's own confirmation has it)
    const keepOff = k === 'mainsheet' && s.over && (b.depower ?? 0) > 0.6 && b.trim.main.flow === 'luffing';
    if (!busy && who === 'you' && k !== 'car' && !keepOff) { const r = bestFor(b, k as Exclude<LineKey, 'car' | 'jibsheetW'>); if (r.gain >= FIX_MIN) fix = lineLesson(b, s, k as Exclude<LineKey, 'car' | 'jibsheetW'>, r.to, r.gain); }
    const ok = okWords(b, s, k);
    notes.push({ line: k, who, fix, ok: ok.text, tick: ok.tick });
  }
  return { s, notes };
}

function lineLessonFull(b: Boat, s: Situation, k: Exclude<LineKey, 'car' | 'jibsheetW'>, to: number, gain: number): Lesson {
  const c = b.ctl, from = c[k], more = to > from, d = Math.abs(to - from), base = { id: `line:${k}`, who: 'you', line: k as LineKey, to, gain, kind: 'fix' as const };
  const jibName = 'jib';
  switch (k) {
    case 'mainsheet': {
      const was = b.sheets.main, will = clamp(boomAngle(withCrew(b, 'mainsheet', to)), SAILS.main.min, SAILS.main.max), n = Math.abs(will - was);
      // the boom on the shroud and the main stalled (a broad reach): no sheet will ease it further. The vang lets the top
      // twist off, or her course changes the angle
      if (more && n < 1.5 && was >= SAILS.main.max - 0.5 && b.trim.main.flow === 'stalled') return { ...base, kind: 'info' as const, head: 'The boom\'s on the shroud: it can\'t go out any further.',
        why: 'On this broad reach the main is still sheeted tighter than the wind angle wants, and the shroud stops the boom: the flow breaks off its back.',
        look: 'come up until the main\'s leech telltales stream; or bear away to a run, where they hang and the main just pushes', done: 'main drawing' };
      // the boom barely moves (it's at its stop, or the crew's traveller keeps it where they want it): the sheet is the leech
      if (n < 1.5 && s.awa < 110) return more
        ? { ...base, head: `Ease the mainsheet ${easeAmount(d)}: open the leech.`, why: `In ${airOf(s)}, the top of the main wants a little twist; the leech is closed tighter than that.`,
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
          : b.trim.main.flow === 'stalled' ? 'The main is over-trimmed: the flow is breaking off its back, so it pushes sideways more than forward.' : 'The boom is closer to the centerline than this wind angle wants.',
        look: s.awa > 110 ? 'the boom: out until it\'s nearly against the shroud' : s.over ? 'the heel and the weight on the tiller: both ease' : b.trim.main.flow === 'stalled' ? 'the main\'s leech telltales: streaming off the back, not curling behind it' : 'the luff of the main: ease until it just lifts, then trim a touch',
        done: s.over ? 'she\'s back on her feet' : 'main drawing' };
    }
    case 'jibsheet': {
      const was = b.sheets.jib, will = clamp(jibClew({ ...c, jibsheet: to }, b.tack), SAILS.jib.min, SAILS.jib.max), n = Math.abs(will - was);
      if (!more) return { ...base, head: `Trim the ${jibName} in, about ${deg(n)}.`,
        why: b.trim.jib?.flow === 'luffing' ? 'The jib is luffing, so it\'s barely pulling.' : 'The jib is eased past its best angle.',
        look: 'the jib\'s windward luff telltales lifting, and the bubble behind the luff', done: 'the jib\'s luff telltales streaming, windward and leeward' };
      return { ...base, head: `Ease the ${jibName}, about ${deg(n)}.`,
        why: 'The jib is over-trimmed: the flow on its back has broken away.',
        look: 'the jib\'s leeward luff telltales drooping or spinning; and a jib leech close to the spreader', done: 'the jib\'s luff telltales streaming, windward and leeward' };
    }
    case 'traveller': return { ...base,
      head: to < from ? `Traveler up to windward, ${amount(d)}.` : `Traveler down to leeward, ${amount(d)}.`,
      why: to < from ? 'It brings the boom toward the centerline without hauling the leech shut: more power and height.'
        : s.over ? `She's overpowered: dropping the boom to leeward without opening the leech takes heel and weather helm off her while the main keeps its shape.` : 'The boom is too close to the centerline for this breeze: the main is over-trimmed.',
      look: to < from ? 'the boom: over the centerline, close-hauled in this breeze' : 'the heel and the tiller: both come off',
      done: to < from ? 'boom where it pays' : 'helm lighter' };
    case 'backstay': return { ...base,
      head: more ? `Backstay on, ${amount(d)}.` : `Ease the backstay, ${easeAmount(d)}.`,
      why: more ? `It bends the mast and tightens the forestay, flattening both sails: in ${airOf(s)} she wants them flatter, to drive instead of heel.`
        : `In ${airOf(s)} she wants power: easing it lets the mast straighten and the forestay sag, for fuller sails.`,
      look: more ? (s.over ? 'the heel and the weight on the tiller: both ease' : 'the main\'s depth at mid-height: flatter') : 'the main\'s depth at mid-height: fuller, and the speedo',
      done: more ? 'sails flat for the breeze' : 'power on' };
    case 'vang': return { ...base,
      head: more ? `Vang on, ${amount(d)}.` : `Ease the vang, ${easeAmount(d)}.`,
      why: more ? (s.awa > 70 ? 'Off the wind the sheet no longer holds the boom down: without the vang the top of the main twists away and spills.' : 'It holds the leech, so the main keeps its shape when the sheet\'s eased.')
        : 'The leech is too tight for this breeze: she needs more twist.',
      look: more ? 'the upper battens: in line with the boom, not falling off to leeward' : 'the top batten: angled a little to leeward of the boom',
      done: more ? 'top of the main working' : 'leech eased' };
    case 'outhaul': return { ...base,
      head: more ? `Outhaul on, ${amount(d)}.` : `Ease the outhaul, ${easeAmount(d)}.`,
      why: more ? `It flattens the bottom of the main: in ${airOf(s)} that's power she can't use.` : 'It deepens the bottom of the main, for power.',
      look: 'the foot of the main: the depth just above the boom', done: more ? 'foot flat' : 'foot full' };
    case 'cunningham': case 'downhaul': {
      const name = k === 'cunningham' ? 'Cunningham' : 'main halyard', Name = name[0].toUpperCase() + name.slice(1); // (Josephine's 'downhaul' is the main halyard on its tackle)
      return { ...base,
        head: more ? `${Name} on, ${amount(d)}.` : `Ease the ${name}, ${easeAmount(d)}.`,
        why: more ? 'The breeze has blown the main\'s draft aft: luff tension pulls it forward again.' : 'The draft is too far forward: the front is round and the leech flat. Easing it lets the draft move back toward the middle, for power.',
        look: 'the draft stripes: the deepest point a little less than halfway back', done: 'draft where it belongs' };
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
      look: 'the jib\'s windward luff telltales lifting: steer down until they stream', done: 'sails drawing again', gain: g, kind: 'fix' });
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
    if (crewHas('traveller') && c.traveller > 0.3) said.push('traveler down');
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
  return `Crew: ${theirs.length === lines.length ? 'every line' : listWords(theirs.map(k => NAME[k]))} set for ${airOf(s)}${s.band === 'light' ? ', sails full and controls eased' : ''}.`;
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
  const guide: Boat = { ...b, tune: undefined, rigMain: undefined }, cond = b.spec ? (b.cond ?? condition(b.spec)) : null; // (nothing kept on b: the page's copy is read-only)
  const tws = b.ww.kt, main = boomAngle(b.ctl), jib = jibClew(b.ctl, b.tack);
  if (jib < 0) return 0;
  const best = (x: Boat): Controls => {
    const v = crewSolve(tws, b.awaSlow, b.tack, main, jib, undefined, rigOf(x), cond?.jib, b.aws / KT, b.depower);
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
    head: soft ? `Her rig is tuned soft for ${airOf(s)}: her sails give up about ${pct}. Backstay on hard.` : `Her rig is tuned tight for ${airOf(s)}: her sails give up about ${pct}. Backstay off, foot a little.`,
    why: soft ? `On ${tuneWords(b.tune)} the forestay sags in this breeze: a full jib with a round entry that won't point, more heel and more helm. The forestay and shrouds are set at the dock (CR 7.40), and the mast foot (CR 6.1.5); the backstay is free.`
      : `On ${tuneWords(b.tune)} the forestay is straight and the jib flat: it points, but has no power. The forestay and shrouds are set at the dock (CR 7.40), and the mast foot (CR 6.1.5).`,
    look: `the forestay's sag against the jib's luff; next time, ${tuneWords(TUNE_PRESETS[want])}` }];
}

/** The one thing to say when nothing needs fixing. */
function confirmation(b: Boat, s: Situation, ctx: CoachContext): Lesson {
  const base = { id: 'ok', who: 'you', gain: 0, kind: 'ok' as const };
  if (b.docked) return { ...base, head: 'In her slip. Push off when you\'re ready.', why: '', look: '' };
  // pushed off with no sail up and stopped in a harbor: no way on, so the rudder can't turn her (8m, the owner at Gashouse
  // Cove). The ways out a sailor has: a sail up for way (the jib goes up at any angle but head to wind), the main hoisted at
  // the dock held head to wind, or a paddle (Crew Controls' 8c, to add here when it lands)
  if (!b.handled && !b.pushing && !b.mooring && inBasin(b) && (b.rig?.main ?? 1) === 0 && (b.rig?.jib ?? 1) === 0 && Math.hypot(b.vx ?? 0, b.vy ?? 0) < 0.3)
    return { ...base, kind: 'info', head: 'No way on, no sail up: she can\'t steer. Get the jib up (J) for way.', why: '', look: 'which way the wind is setting her' };
  // set toward Fort Mason's piers with little way on (the Gashouse Cove entrance, 8n): the stream or the wind carries her
  // onto the piles in seconds (physics.ts piles); way on, and steer off
  { const u = V(b.h), st = V(b.h + 90), hull = [bow(b), stern(b), ...[1, -1].flatMap(sg => [0, 2.4, -2.4].map(a => ({ x: b.x + u.x * a + st.x * sg * 1.1, y: b.y + u.y * a + st.y * sg * 1.1 })))];
    const set = !b.docked && !b.handled && !b.pushing ? setOntoPier(hull, b.vx ?? 0, b.vy ?? 0) : null;
    if (set) return { ...base, kind: 'info', head: `Being set onto ${set.pier.name}: ${Math.max(1, Math.round(set.s))} s to the piles. Get way on and steer off.`, why: '', look: 'the pier\'s piles against the water: is the gap closing?' }; }
  if (b.rig && (b.rig.main < 1 || b.rig.jib < 1)) return { ...base, head: 'Sails going up (or down): the coach waits until they\'re set.', why: '', look: '' };
  if (b.luff) return { ...base, kind: 'info', head: 'Sails eased right out: she\'s slowing.', why: 'Easing both sails until they flog is the brake: she coasts to a stop.', look: 'the speedo; trim back in to go' };
  if (b.tacking || b.turnTarget != null) return { ...base, kind: 'info', head: s.twa < 90 ? 'Through the tack: the crew is changing the jib over.' : 'Through the jibe: the boom is coming across.', why: '', look: s.twa < 90 ? 'the jib\'s luff telltales, windward and leeward, streaming once she\'s settled on the new tack' : 'the boom: duck' };
  if (ctx.preStart) return { ...base, kind: 'info', head: `Pre-start: trim's set. ${s.speedKt.toFixed(1)} kt; ease to slow, trim to go.`, why: '', look: 'the line and the clock' };
  // the crew's sheets a moment behind a change of course, or she's still getting going: not "right" yet
  // (not the main eased on purpose in a breeze: that's the crew depowering)
  const lag = ([['main', b.trim.main, 'mainsheet'], ['jib', b.trim.jib, 'jibsheet']] as const).find(([n, t, k]) => t && t.flow !== 'good' && t.amount > 0.1 && !byHand(b, k) && !(b.sheets[n] >= SAILS[n].max - 0.5) && !(n === 'jib' && b.ctl.jibsheet <= 0.01 && t.flow === 'luffing') && !(n === 'main' && s.over && (b.depower ?? 0) > 0.6 && t.flow === 'luffing'));
  if (lag && s.awa < 110) return { ...base, kind: 'info', head: `The crew is catching up: the ${lag[0]} is ${lag[1]!.flow === 'stalled' ? 'stalled' : 'luffing'} for a moment.`, why: 'They trim at a human pace, a second or two behind a change of course or a shift.', look: lag[0] === 'jib' ? 'the jib\'s luff telltales: watch them settle' : lag[1]!.flow === 'stalled' ? 'the main\'s leech telltales: watch them stream again' : 'the luff of the main: watch it stop lifting' };
  if (s.speedKt < 0.85 * s.targetKt && !s.over) return { ...base, kind: 'info', head: `Building speed: ${s.speedKt.toFixed(1)} kt of her target ${s.targetKt.toFixed(1)}.`, why: 'The sails are set: a two-tonne boat takes a while to get going. Sail her straight and let her build.', look: 'the speedo climbing' };
  // (a jib a degree or two off its best: its telltales show it before it's worth a lesson; say which, and the touch that
  // fixes it, so "right" never contradicts a lifting telltale)
  const tj = b.trim.jib, tells = s.awa <= 115; // (the telltales fly to 115° apparent, render/sails.ts)
  const touch = tells && tj?.flow === 'luffing' ? (b.ctl.jibsheet <= 0.01 ? 'The jib\'s windward luff telltales are just lifting with the sheet hard in: bear away a hair.' : 'The jib\'s windward luff telltales are just lifting: a touch of jib sheet, or bear away a hair.')
    : tells && tj?.flow === 'stalled' ? (b.sheets.jib >= SAILS.jib.max - 0.5 ? 'Sheets right out: on this broad reach the jib\'s leeward luff telltales droop. Come up a little and they stream.' : 'The jib\'s leeward luff telltales are just drooping: ease a touch, or come up a hair.') : '';
  const steer = touch || (s.up ? 'Steer to the jib\'s luff telltales: windward and leeward both streaming.' : s.awa > 110 ? 'Keep the boom out and steer smoothly through the waves.' : 'Ease the sheets until the luffs just lift, then trim back a touch.');
  // (a teaching choice, made deliberately: the traveller held up in a breeze costs almost nothing in the model, since
  // the vang holds the leech while the crew eases the sheet, so it isn't a fix; but it's worth knowing why most boats
  // drop it, so it's said here rather than left unsaid)
  const travUp = byHand(b, 'traveller') && b.ctl.traveller < -0.2;
  if (s.over) return { ...base, head: `Trim's right for ${airOf(s)}: ${s.speedKt.toFixed(1)} kt.`,
    why: travUp ? 'The traveler up costs little here: the vang holds the leech while the crew eases the sheet. Most boats drop it in a breeze instead, so the boom goes down to leeward without the leech opening.'
      : `Her target of ${s.targetKt.toFixed(1)} kt assumes she can carry full power; in this breeze she can't, so the crew flatten the sails.`,
    look: 'the heel: under about 20°, and a light helm' };
  return { ...base, head: `Trim's right: ${s.speedKt.toFixed(1)} kt against her target ${s.targetKt.toFixed(1)}.`, why: '', look: steer };
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
/** How long a note stays up at least (s), so it can be read and acted on (the owner: "info is flying by way too fast"). */
export const HOLD_S = 10; // (the owner, 14 Nov 2026: "12 seconds might be a bit long; lets do 10")
/** How long after a tack, a jibe or a rounding the coach keeps quiet (s): she settles first. */
export const SETTLE_S = 5;

export class CoachMemory {
  /** The wind's band it last said (situation(): held about each edge). */
  band: Situation['band'] | undefined;
  top: { id: string; done?: string; line?: LineKey; from?: number; to?: number; gain: number; speedKt: number; since: number } | null = null;
  /** Until when it keeps quiet: through a tack, a jibe or a rounding, and SETTLE_S after. */
  quietUntil = -1e9;
  private rounding = false;
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
  step(b: Boat, t: number, ctx: CoachContext = {}): { view: CoachView; done: string | null; fresh: string | null; held: number; of: number } {
    let view = teach(b, { ...ctx, band: ctx.band ?? this.band });
    this.band = view.situation.band;
    const s = view.situation, prev = this.top;
    // (a tack or jibe: quiet through it and SETTLE_S after; a rounding, SETTLE_S from when it's called, not its whole window)
    if (b.tacking || b.turnTarget != null) this.quietUntil = t + SETTLE_S;
    if (ctx.justRounded && !this.rounding) this.quietUntil = Math.max(this.quietUntil, t + SETTLE_S);
    this.rounding = !!ctx.justRounded;
    // hold the lesson we're teaching while it's still nearly as big as the biggest; and for HOLD_S at least, unless
    // something worth twice as much (and 1% of her speed) turns up
    if (prev && view.top.id !== prev.id) {
      const still = [view.top, ...view.more].find(l => l.id === prev.id);
      const young = t - prev.since < HOLD_S && !(view.top.gain >= 2 * prev.gain && view.top.gain >= 0.01);
      if (still && (still.gain >= 0.6 * view.top.gain || young)) view = { ...view, top: still, more: [view.top, ...view.more.filter(l => l !== still)] };
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
      this.top = tp.kind === 'fix' || tp.id.startsWith('hove:') ? { id: tp.id, done: tp.done, line: tp.line, from: tp.line ? (b.ctl as unknown as Record<string, number>)[tp.line] : undefined, to: tp.to, gain: tp.gain, speedKt: s.speedKt, since: t } : null;
    } else if (this.top) { this.top.gain = view.top.gain; this.top.to = view.top.to; this.top.done = view.top.done; } // (the same line, perhaps the other way now)
    // a thing to fix goes on screen once she's settled (not the same one again within half a minute): one that became
    // the top while she was settling is said when the quiet's over
    { const tp = view.top; if (!fresh && tp.kind === 'fix' && t >= this.quietUntil && t - (this.shown.get(tp.id) ?? -1e9) > 30) { fresh = tp.head; this.shown.set(tp.id, t); } }
    const done = this.doneText && t < this.doneText.until ? this.doneText.text : null;
    const held = this.top ? Math.min(1, (t - this.top.since) / HOLD_S) : 1, of = (view.top.kind === 'fix' ? 1 : 0) + view.more.length;
    return { view, done, fresh, held, of };
  }
}

/** For the panel's footer, when paused: every lesson in full. */
export const describe = (l: Lesson) => [l.head, l.why, l.look ? `Look at: ${l.look}.` : ''].filter(Boolean).join(' ');
