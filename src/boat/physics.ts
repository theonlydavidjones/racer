import { hitsHarbor } from '../geo/marina';
import { KT, V, clamp, wrap, n360, D2R } from '../core/math';
import { onLand, pierNear } from '../geo/shore';
import type { Emit } from '../sim/events';
import { bow, stern, type Boat, type LineKey } from './boat';
import { HANDLING, HULL, airDrag, driveExponent, flogAmount, flowTurnRate, hullResistance, luffDriveFactor, maxTurnRate, speedForDrive, surgeAccel } from './dynamics';
import { driveCurveFor } from './driveCurve';
import { motorForce } from './motor';
import { NO_GO, beatAngle, jibEfficiency, polar, type SailPlan } from './polar';
import orc from './data/nordic-folkboat-orc.json';
const SAIL_AREA = { main: orc.boat.mainArea, jib: orc.boat.jibArea };
import { beatFor, seaDrag, waveYaw } from './seaway';
import { CE_ABOVE_WL, CE_HEIGHT, FULL_RUDDER, LEVER, RUDDER, clothFill, heelFactor, heelWithCrew, heelingMoment, helmNeeded, hullRighting, netDrive, rollStep, rudderDrag, sailForces, sailYaw } from './balance';
import { DEFAULT_CREW, STANDARD_DISP, crewBestHeel, crewEdgeAt, crewMass, crewMoment, crewSkill, hikingMoment, sittingMoment, standardCrewMoment, displacement, displacementFactor, newCrew, placeCrew, specAttr, type CrewState } from './crewPhys';
import { bodyJob, crewJobs } from './crewWork';
import { clrShift, heelWettedResistance, trimResistance } from './hullTrim';
import { SAILS, optimalSheet, sailTrim, trimDrive } from './trim';
import { condition, foulingDrag, mainRig } from './condition';
import { CAR_FORE_PINS, CAR_IN_PINS, CONTROL_RATE, boomAngle, crewShapes, crewSolve, jibAngle, planWorth, jibClew, jibShape, jibsheetFor, mainShape, mainsheetFor, shapeEfficiency, targetShape, travellerRate, winchFactor, type Controls, type CrewSettings, type Shape } from './controls';

/** Turn rate during penalty turns, deg/s: the crew backs the jib and main to spin her round. The least: she turns at
 * her own hard-over rate when that's faster (dynamics.ts maxTurnRate). An uncited estimate. In the sim's own fleet races
 * (Seaweed Soup course 2, 12 kt, 13 Nov 2026) a two-turns penalty took 96-163 s from the call to done: about 60-80 s
 * turning (turnDrag bleeds her speed through the turns, toward this floor) and 30-40 s sailing clear first. Bay East's
 * audit puts a 720 in a small keelboat at more like 30-45 s in a breeze, also unconfirmed. The owner is to time one. */
export const PENALTY_TURN_RATE = 10;
/** Below this speed (m/s, ~2.5 kt) the AI won't try to tack: she'd stall head to wind. */
export const SLOW_TACK = 1.3;

/** The crew's reaction time to a change in apparent wind angle, s. */
export const CREW_LAG = 0.8;

/** Slowing while she goes astern: dv/dt = −(c0 + c1·v), m/s². */
export const ASTERN_DRAG = { c0: 0.005, c1: 0.035 };
/** How far she coasts astern from `v0` m/s (to a stop) with that drag, m. */
export const asternCoast = (v0: number) => (v0 - (ASTERN_DRAG.c0 / ASTERN_DRAG.c1) * Math.log(1 + ASTERN_DRAG.c1 * v0 / ASTERN_DRAG.c0)) / ASTERN_DRAG.c1;

/** Crew timings for the whisker pole, s. */
export const POLE = { set: 8, stow: 5, gybe: 8 };

/** How the jib is working right now, from the pole state. */
export function sailPlan(b: Boat): SailPlan {
  if (b.pole === 'set') return b.poleTack === b.tack ? 'wing' : 'main';
  if (b.pole === 'down') return 'jib';
  return 'main'; // crew busy with the pole: jib not drawing
}

/**
 * Hoisting and striking (dropping) the sails, at a crew's pace: the main takes about half a minute to hoist and the
 * jib about 15 s; short-handed, longer. The main goes up easily head to wind; off the wind it fills, presses on the
 * spreaders and shrouds and the slides bind, so it goes up far more slowly.
 */
export const HOIST = { main: 30, jib: 15, strikeMain: 15, strikeJib: 10 };
export function crewRig(b: Boat, dt: number, emit: Emit): void {
  const r = b.rig; if (!r) return;
  const say = (msg: string) => { if (b.isUser) emit({ type: 'toast', msg, ms: 3500 }); };
  // (the forward hand on the halyards at the mast, or whoever there is: at their pace)
  const busy = !!r && ((r.mainUp && r.main < 1) || (!r.mainUp && r.main > 0) || (r.jibUp && r.jib < 1) || (!r.jibUp && r.jib > 0));
  const hands = bodyJob(b, 'hoist', busy);
  const twa = Math.abs(wrap(b.ww.from - b.h)), offWind = twa <= 45 ? 1 : twa >= 120 ? 0.3 : 1 - 0.7 * (twa - 45) / 75;
  const step = (k: 'main' | 'jib') => {
    const up = k === 'main' ? r.mainUp : r.jibUp, was = r[k];
    if (up && was < 1) {
      r[k] = Math.min(1, was + dt * hands * (k === 'main' ? offWind : 1) / HOIST[k]);
      if (k === 'main' && was === 0 && offWind < 0.7) say('Hoisting the main off the wind: it fills and catches on the spreaders. It goes up much more easily head to wind.');
      if (r[k] === 1) say(k === 'main' ? 'Main up.' : 'Jib up.');
    } else if (!up && was > 0) {
      r[k] = Math.max(0, was - dt * hands / (k === 'main' ? HOIST.strikeMain : HOIST.strikeJib));
      if (r[k] === 0) say(k === 'main' ? 'Main down and flaked on the boom.' : 'Jib down and bagged on the foredeck.');
    }
  };
  step('main'); step('jib');
  if (r.jib < 1 && b.poleWant) { b.poleWant = false; say('The pole goes out on the jib: hoist the jib first.'); }
}

/** Crew work on the pole: set or stow on command, and gybe it end-for-end when the boat gybes. */
function crewPole(b: Boat, dt: number, emit: Emit): void {
  const say = (msg: string) => { if (b.isUser) emit({ type: 'toast', msg }); };
  // the forward hand (or whoever there is) goes to the mast to set, stow or gybe it, at their own pace
  const hands = bodyJob(b, 'pole', b.pole === 'setting' || b.pole === 'stowing' || (b.poleWant && b.pole === 'down') || (!b.poleWant && b.pole === 'set'));
  if (b.poleWant && (b.pole === 'down' || b.pole === 'stowing')) { b.pole = 'setting'; b.poleT = POLE.set / hands; b.poleTack = b.tack; }
  else if (!b.poleWant && (b.pole === 'set' || b.pole === 'setting')) { b.pole = 'stowing'; b.poleT = POLE.stow / hands; }
  else if (b.pole === 'set' && b.tack !== b.poleTack) {
    b.pole = 'setting'; b.poleT = POLE.gybe / hands; b.poleTack = b.tack;
    say('Gybing the pole end-for-end. The jib is down for a few seconds.');
  }
  if (b.pole === 'setting' || b.pole === 'stowing') {
    if (b.pole === 'setting' && b.poleTack !== b.tack) b.poleTack = b.tack; // gybed while setting: set it on the new windward side
    b.poleT -= dt;
    if (b.poleT <= 0) {
      if (b.pole === 'setting') { b.pole = 'set'; say('Pole set: jib out to windward, wing-on-wing.'); }
      else { b.pole = 'down'; say('Pole stowed: jib back to leeward.'); }
      bodyJob(b, 'pole', false);
    }
  }
}

/** Penalty turns count only in one direction, so each full turn includes a tack and a gybe (Rule 44.2). The direction
 * is settled once she has turned 30° one way; nothing counts while she sails clear first. */
function countPenalty(b: Boat, dh: number, emit: Emit): void {
  if (!(b.penalty > 0)) return;
  if (!b.ai?.clearing) b.penaltyTurned += dh;
  if (!b.penaltyDir && Math.abs(b.penaltyTurned) > 30) b.penaltyDir = Math.sign(b.penaltyTurned);
  if (b.penaltyDir) b.penalty = Math.max(0, b.penaltyTotal - Math.max(0, b.penaltyTurned * b.penaltyDir));
  if (b.penalty <= 0) { b.penalty = 0; if (b.isUser) emit({ type: 'toast', msg: 'Penalty turns done. Back to racing.' }); }
}

/** Her sideways slip to leeward, m/s (hove to). */
export const leeDrift = (b: Boat) => -(b.sway ?? 0) * (wrap(b.ww.from - b.h) >= 0 ? 1 : -1);

export function moveBoat(b: Boat, dt: number, t: number, emit: Emit, groundToast: { t: number }): void {
  if (b.lashed != null && (b.docked || b.pushing)) b.lashed = null; // made fast in her slip: the lashing comes off
  if (b.isUser && b.lashed != null) { b.tiller = b.lashed; b.steer = 0; b.turnTarget = null; } // lashed: hands off
  // sailing alone, with the helm gone forward to the jib car or the mast, nobody's steering: an unlashed tiller swings free
  // and the rudder trails in the flow (unless the tiller pilot has it), so she goes where her balance takes her, rounding
  // up with weather helm
  const solo = b.crew && b.crew.spec.crew.length === 0, away = !!solo && b.crew!.people[0].z < 0.5;
  if (b.isUser && away && !b.pilotSteers && b.lashed == null) { b.tiller = 0; b.steer = 0; b.turnTarget = null; }
  // jib aback: the polar no longer says how she sails, so the forces on her do (heaving to)
  // (it takes the clew a degree to windward to start, and none at all to stop, so she doesn't flicker between the two)
  const canHeave = b.isUser && !b.docked && !b.pushing && sailPlan(b) === 'jib' && (b.rig?.jib ?? 1) > 0.5; // (in irons, drifting astern, backing the jib is the way out)
  // (not with her motor driving her: the jib backed against its thrust doesn't balance, so she can't lie hove to)
  b.hove = canHeave && !(b.motor?.running && b.motor.down && b.motor.gear !== 'N') && ((b.jibBacked ?? 0) > 0.2 || (!!b.hove && (b.jibBacked ?? 0) > 0));
  if (b.hove) { heaveTo(b, dt, t, emit, groundToast); return; }
  const ww = b.ww;
  // turn rate falls off at low speed: a Folkboat needs water flowing over the rudder, ahead or astern (going astern it
  // works backwards, and less well: 0.7 of it). Nearly stopped, she turns only by sculling, which RRS 2025–2028 rule
  // 42.3(d) allows in one case: "When a boat is above a close-hauled course and either stationary or moving slowly, she
  // may scull to turn to a close-hauled course". World Sailing's rule 42 interpretations: "on either tack" (SCULL 1), so
  // from above close-hauled she may be sculled round onto either tack's close-hauled course, through the wind too; but
  // not back again against her own sculling (SCULL 2: she holds the way she started until she's close-hauled), not to
  // offset a backed sail's steering (SCULL 3: none with the jib aback), and never below close-hauled
  // (42.2(d): sculling "that ... prevents her from moving astern" is banned; she drifts astern while she turns)
  const toWind = wrap(ww.from - b.h) >= 0 ? 1 : -1, astern = b.astern ?? 0, aheadK = b.v + astern > 0 ? b.v / (b.v + astern) : 1;
  const flow = flowTurnRate(b.v) * aheadK + flowTurnRate(astern) * 0.7 * (1 - aheadK); // (with way on both ways at once, by which way the water mostly flows past the rudder)
  const aboveCH = Math.abs(wrap(ww.from - b.h)) < beatAngle(ww.kt) - 2;
  if (!aboveCH) b.scullDir = undefined; // (close-hauled or below: the sculling's done)
  const scullOK = (dir: number) => aboveCH && !((b.jibBacked ?? 0) > 0) && (b.scullDir == null || b.scullDir === dir);
  /** The most she can turn this way (+ to starboard), deg/s. */
  const rateFor = (dir: number) => dir && scullOK(dir) ? Math.max(flow, HANDLING.minTurnRate) : flow;
  const maxRate = Math.max(1e-3, flow);
  // helm balance: with weather helm she turns toward the wind unless the rudder holds her (balance.ts)
  const balRate = clamp((b.helmNeed ?? 0) / FULL_RUDDER, -0.4, 0.4) * maxRate * toWind;
  let rate: number, rudder: number; // rudder: fraction of full, in the turn-rate sense (+ turns to starboard)
  // she answers the helm over a moment, not at once: her yaw inertia against the water's damping (yawLag); a helmsman
  // (and the AI) eases the helm before the heading he wants, by what she'll still turn once it's amidships
  const tau = yawLag(b.v + astern), r0 = b.turnRate ?? 0;
  let bladeFlip = astern > b.v && !b.isUser; // (going stern first and steering by the flow: the blade's the other way to the turn)
  if (b.isUser) {
    if (b.turnTarget != null && b.steer === 0) {
      const err = wrap(b.turnTarget - b.h);
      rate = Math.sign(err) === b.turnDir && Math.abs(err) <= Math.max(0, r0 * b.turnDir) * tau ? 0 : b.turnDir * rateFor(b.turnDir);
      if (Math.abs(err) < 3 || (Math.sign(err) !== b.turnDir && Math.abs(err) < 20)) { rate = 0; b.turnTarget = null; }
    } else {
      // tiller to starboard turns the bow to port; keys add a push of their own
      const helm = clamp(b.steer - b.tiller, -1, 1);
      if (helm !== 0) b.turnTarget = null;
      // going astern the rudder works backwards: the bow goes the way you push the tiller. Sculled (where that turns her
      // faster than the flow does), she turns the way the tiller's pumped, as with way on, whichever way she's drifting
      const sternFirst = astern > b.v, dirFlow = Math.sign(helm) * (sternFirst ? -1 : 1), d = Math.sign(helm);
      const byFlow = dirFlow * Math.abs(helm) * flow, sculled = d && scullOK(d) ? d * Math.abs(helm) * HANDLING.minTurnRate : 0;
      rate = Math.abs(sculled) > Math.abs(byFlow) ? sculled : byFlow;
      if (sternFirst && rate === byFlow) bladeFlip = true;
    }
    rudder = clamp(rate / Math.max(1e-6, maxRate), -1, 1);
    if (b.turnTarget == null) rate += balRate; // let go of the tiller and she rounds up (or bears away)
  } else if (b.penalty > 0 && !b.ai?.clearing) {
    // penalty turns: the crew backs the sails to spin the boat even when slow
    rate = Math.max(maxRate, PENALTY_TURN_RATE); rudder = 1;
  } else {
    let err = wrap(b.desired - b.h);
    const ai = b.ai;
    // in the middle of a tack (within 20° of head to wind, committed to going through it) she finishes it to the course
    // she set out for, whatever else comes up meanwhile: with her turn's inertia, a reversal there would leave her
    // stopped head to wind; once she's through, she answers it (the keep-clear moves among them). But not against a
    // boat she's about to hit (Rule 14, ai.ts urgent): that comes first. (The commitment is left alone meanwhile: ended
    // and re-made on a new heading behind her, it would take her the long way round, through the fleet.)
    const midTack = !!ai && ai.turnCommit !== 0 && !ai.urgent && Math.abs(wrap(b.ww.from - b.h)) < 20 && Math.sign(wrap(ai.commitFor - b.h)) === ai.turnCommit;
    if (midTack) err = wrap(ai!.commitFor - b.h);
    // a commitment ends when the turn is nearly done or she wants to go somewhere else
    if (ai && !midTack && ai.turnCommit !== 0 && (Math.abs(err) < 15 || (!(ai.tackNow && ai.commitHail) && Math.abs(wrap(b.desired - ai.commitFor)) > 45))) ai.turnCommit = 0;
    if (ai && !midTack && ai.turnCommit === 0 && Math.abs(err) > 30) {
      // Starting a big turn: choose once which way to go, and finish it (no bailing out halfway through a
      // tack). Too slow to tack? Going through the wind would leave her stuck in irons, so gybe instead.
      const toWind = wrap(b.ww.from - b.h);
      const throughWind = Math.sign(toWind) === Math.sign(err) && Math.abs(toWind) < Math.abs(err);
      ai.turnCommit = throughWind && b.v < SLOW_TACK && !ai.tackNow ? -Math.sign(err) : Math.sign(err);
      ai.commitFor = b.desired; ai.commitHail = !!ai.tackNow; // (a tack for a hail is held to, whatever the plan does meanwhile)
    }
    if (ai && !midTack && ai.turnCommit !== 0 && Math.sign(err) !== ai.turnCommit) {
      const long = err + ai.turnCommit * 360;
      if (Math.abs(long) > 330) ai.turnCommit = 0; else err = long; // target moved: drop the commitment
    }
    // (where her heading's going with the helm amidships; checking a swing is the rudder's work, not sculling's: rule
    // 42.3(d) allows sculling only to turn toward close-hauled)
    const lead = err - r0 * tau, lim = Math.sign(lead) === Math.sign(err) ? rateFor(Math.sign(lead)) : flow;
    rate = clamp(lead * 1.6, -lim, lim);
    rudder = clamp((rate - balRate) / Math.max(1e-6, maxRate), -1, 1); // the AI holds whatever helm the boat needs
  }
  // (sculling in use: she's turning faster than the flow alone would turn her; latched to that way until close-hauled)
  if (Math.abs(rate - (b.turnTarget == null && b.isUser ? balRate : 0)) > flow + 1e-6 && b.penalty <= 0) b.scullDir = Math.sign(rate);
  if (bladeFlip && Math.abs(rate) > flow + 1e-6) bladeFlip = false; // (sculled: the tiller's pumped the way she turns)
  b.helm = clamp(bladeFlip ? -rudder : rudder, -1, 1); // how hard the helm is over (for drawing the rudder and tiller: the blade where it is)
  b.weatherHeld = -toWind * b.helm * FULL_RUDDER; // deg of weather helm actually held on the rudder
  // (penalty spins too: the crew's backed sails turn her against the same inertia and damping as the rudder does)
  b.turnRate = r0 + (rate - r0) * (1 - Math.exp(-dt / tau)); rate = b.turnRate;
  if (b.v > 0.2) rate += waveYaw(b.sea, b.h, b.v, t, b.id + 1); // the sea knocks her bow about
  const dh = rate * dt;
  b.h = n360(b.h + dh); b.yawRate = rate;
  countPenalty(b, dh, emit);
  const rel = wrap(ww.from - b.h), twa = Math.abs(rel);
  b.rel = rel; b.twa = twa;
  let tk: 'S' | 'P' = rel >= 0 ? 'S' : 'P';
  if (twa > 176) tk = b.tack; // dead downwind: keep the tack you had until the boom crosses
  if (tk !== b.tack) { if (twa < 90) { b.tacking = true; b.headToWindT = t; } b.tack = tk; b.lastTackT = t; if (b.isUser) jibSheetsAtTack(b, emit); } // (head to wind: a tack; a gybe passes the wind astern)
  if (b.tacking && twa + leeSlip(b) >= Math.min(40, beatAngle(ww.kt) - 3)) b.tacking = false; // close-hauled (her course): Rule 13 ends
  crewRig(b, dt, emit);
  crewPole(b, dt, emit);
  const plan = sailPlan(b);
  // the rig rolling: the sails move through the air sideways at the roll rate times their height (rolling to windward,
  // as a crew flattens her, gives them more wind; heeling to leeward takes some away, which damps the roll)
  // the wind the sails see: at their height, in the plane of the heeled mast (sailWind), as the crew trims to it
  // (going astern head to wind she moves downwind, so she sees less of it; slipping to leeward, the wind comes a little more abeam: leeway)
  const ap = sailWind(ww.from, ww.kt, b.h, b.v - (b.astern ?? 0) + rigSurge(b), (b.sway ?? 0) + rigSway(b), b.heel ?? 0);
  // (the sails, their trim and their forces, in the wind across her course through the water (sailFrame): the frame the
  // sail model was calibrated in before she had leeway, when heading and course were one. A calibration choice, not
  // something ORC's documentation is shown to say: the wind's angle to the hull itself is her leeway less (ap, for the
  // windage on her hull), and a real windex would read that. Recalibrating the trim constants (trim.ts) in the hull's
  // frame is on the ROADMAP)
  stepFrame(b, dt);
  const fr = sailFrame(b), slip = fr.rot;
  const apF = slip ? sailWind(ww.from, ww.kt, b.h + slip, fr.along - (b.astern ?? 0) + rigSurge(b), fr.across + rigSway(b), b.heel ?? 0) : ap;
  trimSails(b, apF.awa, plan, dt);
  // heel and helm balance from the forces on the sails (balance.ts)
  const jibOn = plan === 'jib' && b.trim.jib && b.shape.jib ? { trim: b.trim.jib, shape: b.shape.jib } : null;
  const sf = sailForces(apF.aws, apF.awa, { trim: b.trim.main, shape: b.shape.main, out: b.sheets.main }, jibOn, b.luff);
  const cond = b.spec ? (b.cond ??= condition(b.spec)) : null; // your boat's condition: bottom, sails' age, spars, weight
  // an old sail's extra profile drag (hooked leech) and lost lift: the drive it costs, against the same shape in sound cloth
  let wornDrive = 1;
  if (cond && (b.shape.main.cd0 || b.shape.main.clMul || b.shape.jib?.cd0 || b.shape.jib?.clMul)) {
    const sound = (sh: Shape): Shape => ({ depth: sh.depth, draft: sh.draft, twist: sh.twist, ceAft: sh.ceAft });
    const s0 = sailForces(apF.aws, apF.awa, { trim: b.trim.main, shape: sound(b.shape.main), out: b.sheets.main }, jibOn ? { trim: jibOn.trim, shape: sound(jibOn.shape) } : null, b.luff);
    const d0 = s0.main.drive + s0.jib.drive, d1 = sf.main.drive + sf.jib.drive;
    if (d0 > 5) wornDrive = clamp(d1 / d0, 0.6, 1.05);
  }
  // how much of each sail is up: its force goes with its hoisted area (after the wear is worked out, sail for sail, so
  // a part-hoisted sail isn't counted as worn: the hoist has its own speed term below)
  const hm = b.rig?.main ?? 1, hj = b.rig?.jib ?? 1;
  if (hm < 1 || hj < 1) { sf.main.heel *= hm; sf.main.drive *= hm; sf.jib.heel *= hj; sf.jib.drive *= hj; }
  // the crew: where they'd put their weight to hold her at the heel they want (a little heel in light air, about 16°
  // upwind, flat downwind), then where they actually are (they move at a human pace, and go where their jobs are)
  const cs = b.crew ??= newCrew(DEFAULT_CREW, b.tack), disp = displacement(cs.spec) + (cond?.extraKg ?? 0), F = sf.main.heel + sf.jib.heel;
  const rmExtra = (h: number) => cond ? cond.rightingDelta(h) : 0; // weight aloft (a wooden rig) or high aft (the outboard on its bracket)
  // (off the wind the heel is the same balance of moments as upwind: the eased sails' smaller side force is what heels her
  // less, so a broad reach in a puff still heels her, and rounds her up, as it does a real boat)
  const heelT = crewAndHeel(b, cs, F, sf.ceh, disp, rmExtra, Math.min(180, twa + (b.leeway ?? 0)), ww.kt, rel, cond?.extraMoment ?? 0, dt);
  rollTo(b, heelT, rel, disp, dt);
  b.helmNeed = helmNeeded(sf, b.heelMag!, b.sheets.main, b.v, sf.ceh, clrShift(cs.trim));
  b.forces = { heel: sf.main.heel + sf.jib.heel, drive: sf.main.drive + sf.jib.drive };
  // heel past her best; the weight aboard (displacement) and where it sits fore and aft (the trim's resistance); in a
  // drifter, the sails' own weight (heeled to leeward, gravity helps hold them in shape)
  // leeway: the polar's angles are the angles of her course through the water (ORC's VPP solves for the leeway), so her
  // speed is the polar's at her heading's angle plus the leeway she makes there: the side force across the water against
  // the keel's lift at the polar's speed, F = ½ρ·πT²·v²·λ (slender-wing lift, Newman §5.12, as HOVE and rollStep take it):
  // 3–6° close-hauled (6 to 20 kt), nothing downwind. Steering to the beat angle means steering that much higher.
  const Fside = F * Math.cos((b.heelMag ?? 0) * D2R), lwAt = (v: number) => twa < 150 ? clamp(Fside / (0.5 * 1025 * Math.PI * orc.boat.draft ** 2 * Math.max(0.8, v) ** 2) / D2R, 0, 12) : 0;
  // (her steady leeway, over a few seconds: what a helmsman allows for, and the polar's frame; the instant slip is b.sway.
  // The polar's speed at her course's angle, by the leeway she had: settled over the seconds, it needs no iterating)
  const vAt = polar(ww.kt, Math.min(180, twa + (b.leeway ?? 0)), plan), lwNow = lwAt(vAt);
  b.leeway = b.leeway == null ? lwNow : b.leeway + (lwNow - b.leeway) * Math.min(1, dt / 3);
  const vPolar = vAt;
  // the hull's side of her speed: heel and weight, as speed factors (calibrated so)
  let target = vPolar * heelFactor(b.heelMag!) * displacementFactor(disp, ww.kt);
  // and the sails' side, as a share of the drive: the cloth filling, the sheets, the sails' shape, worn cloth, how hard
  // they're driven against the polar's crew (powerFactor), how much of the sail plan is up. What a share of the drive is
  // worth in speed is where that drive meets the hull's resistance (dynamics.ts speedForDrive), with the sails' drive
  // changing with her speed as the apparent wind does (driveCurve.ts)
  // (the fore-and-aft trim's and the heeled hull's wetted area's extra resistance r are, against the same drive, a
  // share 1/r of it: exact through the resistance and the drive curve together)
  let K = clothFill(ap.aws, b.heelMag!) / (trimResistance(vPolar, cs.trim, b.seaShare ?? 0) * heelWettedResistance(vPolar, b.heelMag!, crewBestHeel(Math.min(180, twa + b.leeway), ww.kt)));
  if (!b.luff) {
    K *= (b.trimDriveK ?? trimDrive(b.trim.main, b.trim.jib)) * b.shape.eff * wornDrive * powerFactor(b, jibOn, Math.min(180, twa + b.leeway), ww, disp, dt, plan); // (at her course's angle, as the polar: the search's wind triangle is the course's)
    target /= b.powerRefHeel ?? 1; // (the polar has the polar crew's heel in it: her speed is the polar's × heelFactor(hers) / heelFactor(theirs))
  }
  const partUp = hm < 1 || hj < 1;
  if (partUp) {
    // part of the sail plan up: the drive goes with the area hoisted
    const je = jibEfficiency(plan, twa), full = SAIL_AREA.main + SAIL_AREA.jib * je, up = SAIL_AREA.main * hm + SAIL_AREA.jib * je * hj;
    K *= full > 0 ? up / full : 0;
  }
  const crs = Math.min(180, twa + (b.leeway ?? 0)), vB = target;
  target = speedForDrive(vB, K, driveCurveFor(ww.kt, crs, vB));
  if (b.luff) target *= luffDriveFactor(twa); // (luffing: HANDLING's calibrated slowing, on the speed)
  // under bare poles she still drifts off downwind on the windage of her hull and rig (about a tenth of the wind)
  if (partUp) target = Math.max(target, 0.1 * ww.kt * KT * Math.max(0, Math.min(1, (twa - 90) / 60)));
  if (b.penalty > 0) target *= 0.7;
  const beat = beatAngle(ww.kt);
  // holding a lot of helm to keep her straight is a brake (the steady helm the sails demand; turning has its own cost)
  const helmDrag = Math.abs(rate) < 4 ? rudderDrag(clamp(b.helmNeed ?? 0, -12, 12), b.v) : 0;
  // the rig sweeping through the air as she rolls (a roll tack's flatten, a crew throwing their weight out): the extra
  // wind across the sails is extra push while it lasts, from the same sail forces (quasi-steady; the unsteady flow
  // measured on dinghies (Schutt & Williamson, Cornell) only adds to it), scaled to the hull as the force model scales
  // the sails' push (driveCalibration). Kogure et al. (Japan J. Coaching Studies 27(1), 2013) measured a Laser
  // Radial's roll tacks 5.3% faster than flat ones through the tack in 2–4 m/s, 2.8% in 4–6 m/s.
  // (and as she pitches: the rig swinging fore and aft through the air, seaway.ts waveMotion, rigSurge)
  let sweep = 0;
  const sway = rigSway(b), surge = rigSurge(b);
  if ((Math.abs(sway) > 0.02 || Math.abs(surge) > 0.02) && !b.luff) {
    const ap0 = sailWind(ww.from, ww.kt, b.h + slip, fr.along - (b.astern ?? 0), fr.across, b.heel ?? 0); // (as sf's, without the roll and the pitch: her sternway in both)
    const sf0 = sailForces(ap0.aws, ap0.awa, { trim: b.trim.main, shape: b.shape.main, out: b.sheets.main }, jibOn, b.luff);
    // (each sail as much as is hoisted, as sf is; both already carry the worn cloth through the shape, so no wornDrive here)
    sweep = (sf.main.drive + sf.jib.drive - hm * sf0.main.drive - hj * sf0.jib.drive) * driveCalibration(ww.kt, twa);
  }
  // pinching: the sails flog (their windage, and the hull's and rig's no longer paid for by the polar's drive) as far as
  // they're luffing (trim.ts), and, below the beat angle, as the square of how far below it she is (pinchFlog): nothing
  // to speak of a degree or two low, so the polar's VMG peak stays at ORC's beat angle, rising to all of it in the no-go
  // zone, where she stops (the flogging cloth only as much as is hoisted; struck, the bare rig's windage at any angle
  // forward of the beam)
  const flog = b.luff ? flogAmount(twa, beat, NO_GO, true) : Math.max(sailFlog(b, plan, apF.awa), pinchFlog(Math.min(180, twa + b.leeway), beat)); // (her course's angle, as the polar's beat is)
  const a = surgeAccel(b.v, target, airDrag(ap.aws, ap.awa, flog, (SAIL_AREA.main * hm + SAIL_AREA.jib * hj) / (SAIL_AREA.main + SAIL_AREA.jib)) + seaDrag(b.sea, b.h, b.v) + helmDrag + (cond ? foulingDrag(cond, b.v) : 0) - sweep - motorForce(b), disp, b.luff || hm < 1 || hj < 1 ? undefined : driveCurveFor(ww.kt, Math.min(180, twa + (b.leeway ?? 0)), target)); // (the sails' push at her speed, from the sail model: driveCurve.ts; eased or struck, none)
  // stopped, the wind still on her bare rig drives her astern: what the surge
  // equation would take below zero becomes sternway, which the water's drag then slows (ASTERN_DRAG, in travel). Head to
  // wind in 15 kt on bare poles that comes to about 0.6 m/s (rig windage 2.0 m² against ASTERN_DRAG on her mass)
  // (with her sails up and flogging, in irons, the same: their windage on top of the rig's, so she gathers sternway
  // faster, and the rudder then works backwards; the way out is to bear away, the tiller pushed the way she's to go)
  const v1 = b.v + a * dt;
  if (v1 >= 0) b.v = v1; else { b.v = 0; b.astern = (b.astern ?? 0) - v1; }
  // (headway and sternway are one motion through the water: netted, so the drag on each doesn't push the other)
  if (b.v > 0 && (b.astern ?? 0) > 0) { const n = b.v - b.astern!; if (n >= 0) { b.v = n; b.astern = 0; } else { b.v = 0; b.astern = -n; } }
  // turning bleeds speed through the rudder's drag: for the rudder angle the turn needs, less what the sails' own turning
  // moment does for it (her helm: heeled to leeward she carries weather helm and comes up toward the wind by herself,
  // which is how a roll tack starts her turning with less rudder), so the same turn costs less or more by her balance
  b.v = Math.max(0, b.v * (1 - turnBleed(rate, b.v, b.h, ww.from, b.helmNeed) * dt));
  // leeway, as a motion: her sails' side force across the water and the wind on her topsides and rig (HOVE.windSide) set
  // her bodily to leeward; her keel's lift with way on (slender wing: ½ρ·A·(πAR/2)·u·v = ½ρ·πT²·u·v) and her hull and keel
  // broadside to the water (cross-flow drag, HOVE.crossCd: Hoerner) hold her. At speed the lift does it: a few degrees
  // (b.leeway, above); slow, little holds her and she sags off to leeward (0.5–0.7 kt at 1.5 kt in 12 kt); stopped, only
  // the broadside drag does. With her sails struck, the wind on her rig alone (leaving a berth).
  {
    const awaR = ap.awa * D2R, q = 0.5 * 1.225 * ap.aws * ap.aws, side = ap.arel >= 0 ? -1 : 1; // (wind over the starboard side sets her to port)
    const Fy = side * (q * HOVE.windSide * Math.sin(awaR) ** 2 + (b.luff ? 0 : Fside));
    const sw = b.sway ?? 0, aL = Math.PI * HOVE.aspect / 2, Fw = -0.5 * 1025 * HOVE.latArea * (aL * Math.max(0, b.v) * sw + HOVE.crossCd * sw * Math.abs(sw));
    b.sway = sw + (Fy + Fw) / (disp * (1 + HOVE.swayAdded)) * dt;
    if (Math.abs(b.sway) < 1e-4) b.sway = 0;
  }
  travel(b, dt, t, emit, groundToast);
  sailVisuals(b, plan, dt);
}

/**
 * Heaving to, and any time the jib is aback. A boat with her jib backed isn't sailing her polar: she's balanced (or
 * not) by the forces on her, so here they're worked out one by one and she moves as they say, forward, sideways and
 * in yaw. Hove to, the backed jib pushes her bow away from the wind and shoves her to leeward; the eased main, and the
 * tiller lashed to leeward, turn her back up as soon as she gathers way. She settles about 50–60° off the wind, creeping
 * forward at around a knot (more as the breeze builds: 0.7 kn in 8 kt, 1.5 in 20) and slipping to leeward at about as much: the keel, stalled at that crawl, holds her only by
 * its broadside drag. (Forum and seamanship-guide figures, none measured: about 1–1.5 kn fore-reaching for Folkboats
 * and IF-boats, bow 40–60° off the wind; tests/heaveto.test.ts.)
 *
 * The forces:
 * - Main: as in balance.ts (lift and drag from its trim and shape); eased, it luffs and pushes little.
 * - Backed jib: a sail with the wind on the wrong side is a stalled plate: its force is square to its chord, Cn ≈ 1.2
 *   sin(angle of attack) (Hoerner, Fluid-Dynamic Drag, flat and cambered plates past the stall), to leeward and a
 *   little aft, acting ahead of the keel.
 * - Hull and keel: forward, their resistance (dynamics.ts). Sideways, slender-wing lift with way on (Cl = π·AR/2 per
 *   radian of leeway; Newman, Marine Hydrodynamics §5.12) and, as she slows, cross-flow drag on the side-on profile
 *   (Cd ≈ 1, Hoerner), taken strip by strip along the keel so that turning is damped as well.
 * - Rudder: lift on the blade at its own angle of attack: where the tiller puts it, less the water coming at it from
 *   leeward as she slides sideways (half straightened by the keel just ahead of it).
 * - Windage of the hull and rig, and the crew's weight for heel, as when sailing.
 */
export const HOVE = {
  /** Side-on area below the waterline, hull and long keel, m²: about half the rectangle LWL × draft (an estimate from the profile drawings). */
  latArea: 0.5 * orc.boat.imsL * orc.boat.draft,
  /** Effective aspect ratio of that profile as a wing: 2·draft²/area (the water's surface mirrors it). */
  get aspect() { return 2 * orc.boat.draft ** 2 / this.latArea; },
  /** Broadside drag coefficient of the hull and keel (Hoerner: flat-sided bodies across the flow, about 1). */
  crossCd: 1.0,
  /**
   * How far aft of the centre of lateral resistance the broadside drag acts, m. With way on, the long keel's lift acts
   * near its quarter chord (the CLR, the origin of balance.ts LEVER); sliding sideways, the cross-flow drag acts nearer
   * the centre of the side-on area, which on a cutaway forefoot and a deep heel lies aft. TUNED, not measured: the drawn
   * profile's centroid (render/hull.ts) is 0.81 m aft of the CLR, but there she wanders 30° hove to in 8 kt and
   * forereaches near 2 kn in 25 kt; 0.3 m keeps her inside the hove-to observations (tests/heaveto.test.ts), which are
   * anecdotal. (With none, the backed jib can't hold her bow off in 8 kt with the sails' levers 1.88 m apart.)
   * A towing-tank or GPS record of a long-keeler drifting would set it.
   */
  dragAft: 0.3,
  /** Sway and yaw: added mass of water as a fraction of the boat's (a deep keel side-on drags a lot with it: ~0.9; in yaw ~0.4, estimates). */
  swayAdded: 0.9, yawAdded: 0.4,
  /** Radius of gyration in yaw, as a fraction of LOA (0.25, the usual figure for a yacht). */
  gyration: 0.25,
  /** Side-on windage of hull, cabin and rig (CdA, m²; freeboard about 0.65 m over 7.6 m, the cabin and mast) and how far ahead of the keel's centre it acts (the mast is forward), m. */
  windSide: 5.5, windLever: 0.3,
  /** How much of the sideways flow reaches the rudder: the long keel ahead of it straightens half of it (estimate). */
  rudderFlow: 0.5,
  /** Backed sail: normal-force coefficient at 90° (Hoerner: 1.17 for a flat plate, more for a cupped sail). */
  cnBacked: 1.2
};

/**
 * The fraction of her speed a turn bleeds away per second (physics.ts's own step, and src/boat/arcs.ts's prediction):
 * dv/dt = −turnBleed·v. Turning bleeds speed through the rudder's drag: for the rudder angle the turn needs, less what
 * the sails' own turning moment does for it (her helm: heeled to leeward she carries weather helm and comes up toward
 * the wind by herself, which is how a roll tack starts her turning with less rudder), so the same turn costs less or
 * more by her balance. `rate` deg/s (+ to starboard), `h` her heading, `windFrom` the wind she has, `helmNeed` deg.
 */
export function turnBleed(rate: number, v: number, h: number, windFrom: number, helmNeed = 0): number {
  let bleed = 1;
  if (Math.abs(rate) > 0.5) {
    const toWind = rate * Math.sign(wrap(windFrom - h) || 1), turn = FULL_RUDDER * toWind / Math.max(1, maxTurnRate(v));
    bleed = clamp(Math.abs(turn - clamp(helmNeed, -12, 12)) / Math.max(2, Math.abs(turn)), 0.3, 2);
  }
  return HANDLING.turnDrag * bleed * Math.abs(rate) * D2R;
}

/**
 * How long (s) her turn takes to answer the helm at speed u (m/s) through the water: the time constant of a first-order
 * (Nomoto) yaw response, her yaw inertia over the water's yaw damping, from her own hove-to model (HOVE, heaveTo): the
 * moment of inertia, with the water's added mass, I = m·(0.25·LOA)²·1.4, against the damping the hull's strips and the
 * rudder give as she turns, both growing with her speed (the keel's lift ½ρ·A·(πAR/2)·u·L²/12 and the rudder's
 * ½ρ·u·A_R·slope·flow·arm²). 0.6 s at 4.7 kt, 1.4 s at 2 kt, 2.8 s at 1 kt. (No measured value for a yacht was found.
 * The broadside cross-flow drag damps her turn too, which this linear figure leaves out: about 20% quicker at 4.7 kt
 * turning hard. At a standstill it's all there is: sculled at 4°/s it gives 7–8 s, near the 5.8 s the speed's floor,
 * 0.25 m/s, gives.)
 */
let yawK = 0;
export function yawLag(u: number): number {
  if (!yawK) {
    const L = orc.boat.imsL, aL = Math.PI * HOVE.aspect / 2, N = 8, I = HULL.displacement * (HOVE.gyration * orc.boat.loa) ** 2 * (1 + HOVE.yawAdded);
    const perU = 0.5 * 1025 * (HOVE.latArea * aL * (L * L / 12) * (1 - 1 / (N * N)) + RUDDER.area * RUDDER.slope * HOVE.rudderFlow * RUDDER.arm ** 2);
    yawK = I / perU;
  }
  return yawK / Math.max(0.25, u);
}

/**
 * The sails' drive in the force model, against the polar. balance.ts's sail coefficients were set for heel and helm,
 * and hullResistance is the calm-water upright hull, so the force model's resistance is complete only at a crawl
 * (where it adds the keel's lift-induced drag and broadside drag itself). Toward the polar speed what it leaves out
 * grows: heeled and yawed hull resistance, waves, and the power a VPP flattens away. So the drive is the raw force at a
 * crawl, easing as she nears the polar speed to the calibration that would hold her exactly there with both sails
 * drawing at their best trim: k = (resistance + windage at polar speed) / drive. She can't beat the polar. (k by whole
 * knot and 5° of wind angle, cached.)
 */
const driveCal = new Map<number, number>();
export function driveCalibration(tws: number, twa: number): number {
  // (between whole knots, a straight line, so the drive doesn't step as the wind changes)
  const t = clamp(tws, 2, 40), w0 = Math.floor(t), f = t - w0;
  return f < 1e-6 ? calAt(w0, twa) : calAt(w0, twa) * (1 - f) + calAt(Math.min(40, w0 + 1), twa) * f;
}
function calAt(w: number, twa: number): number {
  const a = Math.round(clamp(Math.max(twa, beatAngle(w)), 30, 175) / 5) * 5, key = w * 1000 + a;
  const hit = driveCal.get(key); if (hit != null) return hit;
  const vt = polar(w, a, 'jib'), ap = sailWind(0, w, n360(-a), vt), awaR = ap.awa * D2R;
  const sm = optimalSheet('main', ap.awa), sj = optimalSheet('jib', ap.awa);
  const sf = sailForces(ap.aws, ap.awa, { trim: sailTrim('main', ap.awa, sm), shape: targetShape('main', w, ap.awa), out: sm }, { trim: sailTrim('jib', ap.awa, sj), shape: targetShape('jib', w, ap.awa) }, false);
  const windX = -0.5 * 1.225 * ap.aws ** 2 * HANDLING.windageCdA * Math.cos(awaR), drive = sf.main.drive + sf.jib.drive;
  const k = drive > 1 ? clamp((hullResistance(vt) - windX) / drive, 0.02, 1) : 1;
  driveCal.set(key, k);
  return k;
}
/** The share of the raw drive that moves her at speed `u` (m/s): all of it at a crawl, the calibration at the polar speed. */
export function driveShare(tws: number, twa: number, u: number): number {
  const vt = Math.max(0.5, polar(tws, Math.max(twa, beatAngle(tws)), 'jib')), x = clamp((u / vt - 0.2) / 0.8, 0, 1);
  return 1 + (driveCalibration(tws, twa) - 1) * x * x * (3 - 2 * x);
}

function heaveTo(b: Boat, dt: number, t: number, emit: Emit, groundToast: { t: number }): void {
  const ww = b.ww, toWind = wrap(ww.from - b.h) >= 0 ? 1 : -1, D = D2R;
  const RHO = 1025, RHO_A = 1.225;
  // the helm: lashed, or wherever you hold it, or hard over through a tack or gybe you've called for (+ turns her to starboard)
  let helm = clamp(b.steer - b.tiller, -1, 1);
  if (b.turnTarget != null && b.steer === 0) {
    const err = wrap(b.turnTarget - b.h);
    if (Math.abs(err) < 3 || (Math.sign(err) !== b.turnDir && Math.abs(err) < 20)) b.turnTarget = null; else helm = b.turnDir;
  }
  b.helm = helm;
  const deltaTw = helm * toWind * FULL_RUDDER * D; // rudder angle, rad, + turning her toward the wind
  // tack and sails, as when sailing
  const rel = wrap(ww.from - b.h), twa = Math.abs(rel); b.rel = rel; b.twa = twa;
  let tk: 'S' | 'P' = rel >= 0 ? 'S' : 'P'; if (twa > 176) tk = b.tack;
  if (tk !== b.tack) { if (twa < 90) { b.tacking = true; b.headToWindT = t; } b.tack = tk; b.lastTackT = t; jibSheetsAtTack(b, emit); }
  if (b.tacking && twa + leeSlip(b) >= Math.min(40, beatAngle(ww.kt) - 3)) b.tacking = false;
  crewRig(b, dt, emit); crewPole(b, dt, emit);
  // sway and yaw are kept in the boat's frame (+ starboard); here they're worked toward the wind and to leeward
  // (her surge signed: + ahead, − astern. In irons, backing the jib is the way out: she's often going astern as she does)
  const u0 = b.v - (b.astern ?? 0), uf = Math.abs(u0), d0 = -toWind * (b.sway ?? 0), r0 = toWind * (b.yawRate ?? 0) * D;
  const ap = sailWind(ww.from, ww.kt, b.h, u0 + rigSurge(b), (b.sway ?? 0) + rigSway(b), b.heel ?? 0);
  trimSails(b, ap.awa, 'jib', dt);
  const q = 0.5 * RHO_A * ap.aws * ap.aws, awaR = ap.awa * D;
  const hm = b.rig?.main ?? 1, hj = b.rig?.jib ?? 1;
  // the main, as in balance.ts
  const smAll = sailForces(ap.aws, ap.awa, { trim: b.trim.main, shape: b.shape.main, out: b.sheets.main }, null, b.luff), sm = smAll.main;
  // (a flogging main's mean force lies along the apparent wind, so its push across the boat dies away as the wind comes
  // ahead: nothing holds her head to wind)
  const across = Math.min(1, Math.sin(awaR) / Math.sin(25 * D));
  const main = { heel: sm.heel * hm * across, drive: sm.drive * hm * driveShare(ww.kt, twa, Math.max(0, u0)), ceAft: sm.ceAft };
  // the backed jib: a stalled plate, its force square to the chord (clew `sheets.jib` deg to windward)
  const clew = b.sheets.jib * D, alpha = awaR - clew; // angle of the wind to the backed sail's chord
  const fn = q * SAIL_AREA.jib * hj * HOVE.cnBacked * Math.max(0, Math.sin(Math.min(Math.PI, Math.max(0, alpha))));
  // (clew to windward, negative: it pushes aft too) A stalled plate's centre of pressure moves from near the quarter
  // chord toward mid chord as the angle grows (Hoerner, Fluid-Dynamic Lift, ch. 3), so it pushes about a quarter-chord
  // further aft than a drawing jib's does: `ceAft` shortens its lever ahead of the keel by that (balance.ts sailYaw).
  const jib = { heel: fn * Math.cos(clew), drive: fn * Math.sin(clew), ceAft: 0.25 * Math.sin(clamp(alpha, 0, Math.PI / 2)) };
  // windage: along the apparent wind's flow (aft and to leeward)
  const windX = -q * HANDLING.windageCdA * Math.cos(awaR), windY = q * HOVE.windSide * Math.sin(awaR) * Math.abs(Math.sin(awaR));
  // hull and keel: strips along the waterline, each with lift (with way on, either way: a foil's lift opposes the
  // sideways flow whichever end leads; trailing edge first, about half of it: an estimate) and broadside drag
  const L = orc.boat.imsL, A = HOVE.latArea, AR = HOVE.aspect, aL = Math.PI * AR / 2, N = 8;
  // (the broadside drag's share of the area by strip: more aft, so its centre is HOVE.dragAft behind the CLR)
  const x2 = (L * L / 12) * (1 - 1 / (N * N)), kD = -HOVE.dragAft / x2;
  let hullY = 0, hullM = 0;
  const uEff = u0 >= 0 ? u0 : 0.5 * uf;
  for (let i = 0; i < N; i++) {
    const x = -L / 2 + (i + 0.5) * L / N, vy = d0 - r0 * x; // (x + forward) sideways water speed at the strip (+: she's moving to leeward there)
    const f = -0.5 * RHO * (A / N) * (aL * uEff * vy + HOVE.crossCd * (1 + kD * x) * vy * Math.abs(vy));
    hullY += f; hullM -= f * x; // a push to windward ahead of the centre turns her toward the wind
  }
  const lift = -0.5 * RHO * A * aL * uEff * d0; // the keel's lift alone, for its induced drag
  const leeway = Math.atan2(Math.abs(d0), Math.max(0.05, uf));
  const inducedX = -0.5 * Math.abs(lift) * leeway * (u0 >= 0 ? 1 : -1); // (against her motion)
  // the rudder, behind the keel: going astern the water meets it from aft, so the same blade angle pushes the other way
  // (the bow goes the way the tiller's pushed), and less well (0.7, as when sailing)
  const back = u0 < 0, vyR = HOVE.rudderFlow * (d0 + r0 * RUDDER.arm), vR2 = u0 * u0 + vyR * vyR;
  // (its push from the blade's angle reverses; its lift against the sideways flow past it opposes that flow either way)
  const aoaR = (back ? -deltaTw : deltaTw) - Math.atan2(vyR, Math.max(0.01, uf));
  const clR = clamp(RUDDER.slope * aoaR, -1.05, 1.05) * (back ? 0.7 : 1);
  const rudY = 0.5 * RHO * vR2 * RUDDER.area * clR, rudX = -0.5 * RHO * vR2 * RUDDER.area * (0.02 + clR * clR / (Math.PI * RUDDER.aspect)) * (back ? -1 : 1);
  // heel, from the side forces, against the hull and the crew (as when sailing)
  const cs = b.crew ??= newCrew(DEFAULT_CREW, b.tack), cond = b.spec ? (b.cond ??= condition(b.spec)) : null;
  const disp = displacement(cs.spec) + (cond?.extraKg ?? 0), F = main.heel + jib.heel;
  const rmExtra = (h: number) => cond ? cond.rightingDelta(h) : 0;
  const heelT = crewAndHeel(b, cs, F, smAll.ceh, disp, rmExtra, twa, ww.kt, rel, cond?.extraMoment ?? 0, dt, 6);
  rollTo(b, heelT, rel, disp, dt);
  b.forces = { heel: F, drive: main.drive + jib.drive };
  // the equations of motion: surge, sway, yaw
  const sails = { main, jib };
  // (the seaway's added resistance as when sailing; the turning drag the polar model adds is here in the strips' damping)
  // (going astern, the water's drag on her is travel's, ASTERN_DRAG, as when she's driven astern sailing)
  const X = main.drive + jib.drive + windX - hullResistance(Math.max(0, u0)) + inducedX + rudX - (u0 > 0 ? seaDrag(b.sea, b.h, u0) + (cond ? foulingDrag(cond, u0) : 0) : 0);
  const Y = main.heel + jib.heel + windY + hullY + rudY;
  const M = sailYaw(sails, b.heelMag!, b.sheets.main, smAll.ceh) - windY * HOVE.windLever + hullM + rudY * RUDDER.arm + F * clrShift(cs.trim);
  const mx = HANDLING.mass * disp / HULL.displacement, my = disp * (1 + HOVE.swayAdded), I = disp * (HOVE.gyration * orc.boat.loa) ** 2 * (1 + HOVE.yawAdded);
  const u1 = u0 + X / mx * dt; b.v = Math.max(0, u1); b.astern = Math.max(0, -u1);
  b.sway = -toWind * (d0 + Y / my * dt);
  b.yawRate = toWind * (r0 + M / I * dt) / D; b.turnRate = b.yawRate; // (her turn carries on as she lets draw)
  b.helmNeed = undefined; b.weatherHeld = undefined;
  let dh = b.yawRate * dt;
  if (b.v > 0.2) dh += waveYaw(b.sea, b.h, b.v, t, b.id + 1) * dt; // the sea knocks her bow about
  b.h = n360(b.h + dh);
  countPenalty(b, dh, emit);
  void CE_HEIGHT; void LEVER;
  travel(b, dt, t, emit, groundToast);
  sailVisuals(b, 'jib', dt);
}

/** The rig's sideways speed through the air at the sails' centre of effort (m/s, + to starboard) from her rolling: the
 * roll rate times the centre of effort's height above the roll axis, taken at the waterline (balance.ts CE_ABOVE_WL). */
const rigSway = (b: Boat) => -(b.heelRate ?? 0) * D2R * CE_ABOVE_WL * Math.cos((b.heel ?? 0) * D2R);
/** ... and its speed forward through the air from her pitching (m/s, + forward): bow up, the rig swings aft, the pitch rate
 * times the same height (pitching about her centre of flotation, at the waterline: seaway.ts waveMotion). */
const rigSurge = (b: Boat) => -(b.pitchRate ?? 0) * CE_ABOVE_WL * Math.cos((b.heel ?? 0) * D2R);
/** The waves' added resistance at speed v as a share of the calm-water resistance (for the trim: hullTrim.ts). */
const seaShare = (b: Boat, v: number) => { const r = hullResistance(Math.max(0.5, v)); return r > 0 ? seaDrag(b.sea, b.h, Math.max(0.5, v)) / r : 0; };
/** (Worked out twice a second, as the sea is refreshed.) */
const seaNow = (b: Boat, dt: number) => { b.seaShareT = (b.seaShareT ?? 0) - dt; if (b.seaShareT <= 0 || b.seaShare == null) { b.seaShareT = 0.5; b.seaShare = seaShare(b, b.v); } return b.seaShare; };

/**
 * The crew decide where to be (crewPhys.ts placeCrew) for the heel they want, and the heel she'd settle at with them
 * there (deg, + to leeward). `bestHeel`: a fixed heel to aim for (hove to), else the crew's own by the conditions.
 */
function crewAndHeel(b: Boat, cs: CrewState, F: number, ceh: number, disp: number, rmExtra: (h: number) => number, twa: number, tws: number, rel: number, extraMoment: number, dt: number, bestHeel?: number): number {
  void rel;
  const skill = specAttr(cs.spec, 'trim'); // (the heel they sail at: their trim)
  const bh = bestHeel ?? crewBestHeel(twa, tws, skill);
  const need = heelingMoment(F, ceh, bh) - hullRighting(bh, disp, crewMass(cs.spec)) - rmExtra(bh);
  // (the windward side by her tack, which holds through a moment by the lee until the boom crosses)
  // (a tack coming: turning up toward the wind with a good way still to go, close-hauled; yours or the AI's)
  const aim = b.turnTarget ?? (b.isUser ? null : b.desired), dAim = aim == null ? 0 : wrap(aim - b.h);
  const tackComing = aim != null && twa < 60 && Math.abs(dAim) > 40 && Math.sign(dAim) === Math.sign(wrap(b.ww.from - b.h));
  placeCrew(cs, { need, twa, tws, v: b.v, pole: b.pole === 'set' || b.pole === 'setting', tack: b.tack, windward: b.tack === 'S' ? 1 : -1, beat: beatAngle(tws), extraMoment, sea: seaNow(b, dt), heel: b.heelMag, tackComing, rmPerDeg: hullRighting(bh + 1, disp, crewMass(cs.spec)) - hullRighting(bh, disp, crewMass(cs.spec)) }, dt);
  const m0 = crewMoment(cs, 0); // (their moment upright; it goes with the cosine of the heel)
  return b.heelEqLast = heelWithCrew(F, ceh, disp, h => m0 * Math.cos(h * D2R) + rmExtra(h), crewMass(cs.spec), b.heelEqLast);
}
/**
 * How hard to drive her, and what it's worth against the polar. In ORC's VPP the crew holds her up by hiking and by
 * flattening and twisting the sails (VPP Documentation 2025, §5.1.3, eq. 5.48), and the VPP picks the crew position and
 * the depowering that make her fastest (§4.4.3: "searching for the position that maximises the boat velocity ... the
 * solvers looks for each boat at the ideal heel angle"). Here the same search, over the crew's depowering steps
 * (controls.ts targetShape): for each step, her heel where the moments balance with the crew hiking (the wind triangle
 * heeled with her, eqs. 7.2–7.3), and the speed that gives. What pushes her along is the sails' drive less:
 * - the keel's induced drag, growing with the square of the side force square to her centre plane (ORC eq. 6.37:
 *   DI = FH² / (π·½ρV²·Te²); balance.ts netDrive), with Te ORC's effective draft along the keel's own span (MHSD, 0.92 ×
 *   the draft standing in for the deepest reduced draft, which ORC works from the hull's offsets);
 * - the rudder held over against her weather helm (balance.ts rudderDrag): North Sails' Nordic Folkboat guide eases the
 *   traveller in a breeze "to decrease heel and thus rudder pressure", and pulls the backstay "until the rudder feels
 *   light again";
 * and heeling past her best costs the hull (heelFactor).
 * Done twice a second: for the polar's standard crew (the reference: a boat sailed as the polar sails it), and for her
 * own crew as they are (how many, how heavy, how tired), whose fastest step the crew then works toward (trimSails).
 * (Once a second.)
 * Returned as a share of the drive: her push, with her sails as they are, against the polar crew's (the step turns it into speed).
 */
function powerFactor(b: Boat, jibOn: { trim: NonNullable<Boat['trim']['jib']>; shape: Shape } | null, twa: number, ww: { from: number; kt: number }, disp: number, dt: number, plan: SailPlan): number {
  // (the crew set their depowering for the breeze, not for each gust, which they ride out by easing and hiking: the wind
  // speed they judge it by is hers over the last 20 s or so; her heading they know at once. Her sails against the
  // polar's crew are weighed in the wind as it is, as the polar and her heel are)
  b.twsSlow = b.twsSlow == null ? ww.kt : b.twsSlow + (ww.kt - b.twsSlow) * Math.min(1, dt / 20);
  const tws = ww.kt;
  b.powerT = (b.powerT ?? 0) - dt;
  if (b.powerK != null && b.powerT > 0) return b.powerK;
  b.powerT = 1; // (once a second: her sails' power changes slowly)
  // (the search, and her sails against it, in the wind rounded to a knot and 2°: cached, and like for like)
  const twsR = Math.round(tws), twaR = 2 * Math.round(Math.abs(twa) / 2);
  const ref = fastestStep(twsR, twaR, plan, STANDARD_DISP, crewMass(DEFAULT_CREW), standardCrewMoment(), crewBestHeel(twaR, twsR), sittingMoment(DEFAULT_CREW));
  b.depowerBest = herFastestStep(b, twa, b.twsSlow, plan, disp).d;
  // hers: her sails as they are (no fuller than the full-power shape: fuller gains nothing the polar doesn't have, the
  // shape's own cost is shapeEfficiency's), at the crew's intended sheeting (a sheet set wrong, by you or the crew, is
  // counted once, in the step's trimDrive) and her own heel; her heel's cost to the hull is in the target already
  // (heelFactor), and her rudder's drag acts on her as a force in the step
  // (the polar has the polar crew's heel in it already: her speed is the polar's times heelFactor(hers) / heelFactor(theirs))
  // (her push against theirs, a share of the drive; their heel's own cost to the hull, a speed factor, the step takes off
  // on the speed side: b.powerRefHeel)
  const dNow = sailPush(tws, twa, plan, b.shape.main, jibOn ? jibOn.shape : null, b.heelMag ?? 0, b.depower ?? 0), dRef = ref.p;
  b.powerRefHeel = heelFactor(ref.h);
  // (bounds as a guard only, against a search answer from another wind: sailing, her push is never a quarter of the polar
  // crew's, nor more than a tenth over theirs, the polar being the boat sailed well; none bind in 4–26 kt with a solo,
  // standard or heavy crew: 0.88–1.06)
  b.powerK = dRef > 1 ? clamp(Math.max(0, dNow) / dRef, 0.25, 1.1) : 1;
  return b.powerK;
}
/** The fastest depowering step for her own crew as they are (how many, how heavy, how tired), in this wind. */
function herFastestStep(b: Boat, twa: number, tws: number, plan: SailPlan, disp: number): StepPick {
  const cs = b.crew, spec = cs?.spec ?? DEFAULT_CREW, twsR = Math.round(tws), twaR = 2 * Math.round(Math.abs(twa) / 2);
  // (each where they are: the deck's narrower aft, physics review)
  const edges = cs?.people.map(p => crewEdgeAt(p.z)) ?? [];
  return fastestStep(twsR, twaR, plan, disp, crewMass(spec), hikingMoment(spec, cs?.people.map(p => p.fatigue), edges), crewBestHeel(twaR, twsR, crewSkill(cs)), sittingMoment(spec, edges));
}
/**
 * What her sails push (N, drive less the keel's drag: netDrive) with these shapes at heel `heel` and depowering step
 * `depower`, judged as the speed search judges the polar crew's: in the wind triangle at the polar speed (rounded as the
 * search is) and her heel, the sheets where the crew intends them, no fuller than full power counting for more. So it
 * weighs her sails' shape and her heel, not how fast she's going. (powerFactor; the coach, for a line you might move.)
 */
export function sailPush(tws: number, twa: number, plan: SailPlan, main: Shape, jib: Shape | null, heel: number, depower: number): number {
  const twsR = Math.round(tws), twaR = 2 * Math.round(Math.abs(twa) / 2), vP = Math.max(0.3, polar(twsR, twaR, plan));
  const w = sailWind(0, twsR, -twaR, vP, 0, heel), full = crewShapes(twsR, w.awa, 0, stepBoom(w.awa, 0), optimalSheet('jib', w.awa));
  const cap = (s: Shape, f: Shape): Shape => ({ ...s, depth: Math.min(s.depth, f.depth) });
  return netDrive(intendedForces(cap(main, full.main), jib ? cap(jib, full.jib) : null, w.aws, w.awa, stepBoom(w.awa, depower)), heel, vP);
}
/** The boom where the crew wants it at depowering step d: eased down the traveller on the last steps (crewEaseBoom). */
const stepBoom = (awa: number, d: number) => clamp(optimalSheet('main', awa) + (awa < 70 ? 7 * clamp((d - 0.6) / 0.4, 0, 1) : 0), SAILS.main.min, SAILS.main.max);
/** The sails' forces at the crew's intended sheeting: the boom at `mainOut`, the jib (when it's drawing) at its best. */
const intendedForces = (m: Shape, j: Shape | null, aws: number, awa: number, mainOut: number) =>
  sailForces(aws, awa, { trim: sailTrim('main', awa, mainOut), shape: m, out: mainOut }, j ? { trim: sailTrim('jib', awa, optimalSheet('jib', awa)), shape: j } : null, false);

/**
 * The fastest depowering step for a crew (powerFactor): in true wind `tws` kt at `twa`°, with this sail plan, at
 * displacement `dsp` kg with `crewKg` aboard hiking with moment `crewM` (N·m, upright) to hold her at `bestHeel` (deg)
 * where they can, sailing at the polar speed.
 * Returns the step, her heel there, the push and the speed it's worth. (It depends on nothing else about the boat, so
 * it's cached: by a knot, 2°, 20 kg, 10 kg of crew and 100 N·m of hiking.)
 */
interface StepPick { d: number; h: number; p: number; speed: number }
const stepCache = new Map<string, StepPick>();
function fastestStep(tws: number, twa: number, plan: SailPlan, dsp: number, crewKg: number, crewM: number, bestHeel: number, sitM: number): StepPick {
  // (worked out from the rounded values themselves, so the answer doesn't depend on which boat asked first)
  dsp = Math.round(dsp / 20) * 20; crewKg = Math.round(crewKg / 10) * 10; crewM = Math.round(crewM / 100) * 100; sitM = Math.round(sitM / 100) * 100;
  bestHeel = Math.round(bestHeel);
  const key = `${tws}|${twa}|${plan}|${dsp}|${crewKg}|${crewM}|${bestHeel}|${sitM}`;
  const hit = stepCache.get(key); if (hit) return hit;
  if (stepCache.size > 20000) stepCache.clear();
  const vP = Math.max(0.3, polar(tws, twa, plan)), jibOn = plan === 'jib';
  // (speed from push where the push meets the hull's resistance: near K = 1 a share K of the drive is worth K^(1/n) in speed)
  const n = driveExponent(vP, driveCurveFor(tws, twa, vP));
  const wind = (heel: number) => sailWind(0, tws, -twa, vP, 0, heel), awa = wind(0).awa;
  // the sails as the crew sets them at each step (controls.ts crewShapes)
  const jibAng = optimalSheet('jib', awa);
  /** Sailed at depowering step d: her heel, push and speed. */
  const sailAt = (d: number): StepPick => {
    const sh = crewShapes(tws, awa, d, stepBoom(awa, d), jibAng);
    // (the heel where the moments balance with the crew hiking, with the sails' force at that heel: heeling takes wind out
    // of them, so a straight iteration rings; bisect on the heel instead. The sheets trimmed for the wind at each heel.)
    const at = (x: number) => { const w = wind(x); return intendedForces(sh.main, jibOn ? sh.jib : null, w.aws, w.awa, stepBoom(w.awa, d)); };
    // (one bisection on the balance of moments at heel m, the sails' force there included)
    const balance = (m0: number) => {
      let lo = 0, hi = 60;
      for (let i = 0; i < 10; i++) { // (to 0.06°)
        const m = (lo + hi) / 2, r = at(m);
        if (heelingMoment(r.main.heel + r.jib.heel, r.ceh, m) - m0 * Math.cos(m * D2R) > hullRighting(m, dsp, crewKg)) lo = m; else hi = m;
      }
      return (lo + hi) / 2;
    };
    // (the crew hike only as far as it takes to hold her at the heel they sail her at, as they do on the water
    // (crewPhys.ts): no further over than she goes with them sitting out on the windward deck, except in light air, where
    // they sit to leeward)
    const hike = balance(crewM), h = hike >= bestHeel ? hike : tws < 7 ? bestHeel : Math.min(bestHeel, balance(sitM));
    const r = at(h), out = stepBoom(wind(h).awa, d);
    // (and the rudder held over against her weather helm: North Sails' Folkboat guide eases the traveller in a breeze "to
    // decrease heel and thus rudder pressure", and pulls the backstay "until the rudder feels light again")
    const helm = clamp(helmNeeded(r, h, out, vP, r.ceh), -12, 12), p = netDrive(r, h, vP);
    return { d, h, p, speed: Math.max(0, p - rudderDrag(helm, vP)) ** (1 / n) * heelFactor(h) };
  };
  const seen: StepPick[] = [], pick = (d: number) => { const t = sailAt(d); seen.push(t); return t; };
  let top = pick(0);
  if (twa < 120) {
    for (let i = 1; i <= 4; i++) { const t = pick(i / 4); if (t.speed > top.speed) top = t; }
    // then the eighths either side, the sixteenths either side of the best of those, and a parabola through the best
    // three for where between them it peaks (so two boats a little different don't land a whole step apart)
    for (const t of [top.d > 0 ? pick(top.d - 1 / 8) : null, top.d < 1 ? pick(top.d + 1 / 8) : null]) if (t && t.speed > top.speed) top = t;
    const h = 1 / 16;
    for (const t of [top.d > 0 ? pick(top.d - h) : null, top.d < 1 ? pick(top.d + h) : null]) if (t && t.speed > top.speed) top = t;
    const a = top.d > 0 ? pick(Math.max(0, top.d - h)) : null, c = top.d < 1 ? pick(Math.min(1, top.d + h)) : null;
    if (a && c) {
      const den = a.speed - 2 * top.speed + c.speed;
      if (den < 0) { const off = clamp(0.5 * (a.speed - c.speed) / den, -0.5, 0.5) * h; if (Math.abs(off) > 1e-4) top = { ...top, d: clamp(top.d + off, 0, 1) }; }
    }
    // (where the speed hardly changes with the step, as on a reach in a gale, the least depowering within 0.05% of the
    // best: so the crew doesn't chase a flat curve as the wind wobbles)
    const floor = top.speed * 0.9995;
    for (const t of seen) if (t.d < top.d - 1e-6 && t.speed >= floor) top = { ...t };
  }
  stepCache.set(key, top);
  return top;
}

/** How much the sails are flogging (0..1), from their trim: each sail's luffing, by its share of the area (a jib that's
 * poled out or down isn't flogging; a sail half hoisted flogs as much of it as is up). */
function sailFlog(b: Boat, plan: SailPlan, awa: number): number {
  const luff = (t: { flow: string; amount: number } | null | undefined) => t && t.flow === 'luffing' ? t.amount : 0;
  // (the main against the boom the crew intends: the last depowering steps ease it down the traveller on purpose, and the
  // speed search prices that ease through the sails' own forces, as trimSails counts the sheet, so it isn't flogging
  // here; the same for a mainsheet you hold, so taking the sheet where the crew had it changes nothing. Pricing the
  // flogging in the search too, and judging the main where it is, is for later: ROADMAP, the audit)
  const main = sailTrim('main', awa, clamp(b.sheets.main - crewEaseBoom(b), SAILS.main.min, SAILS.main.max));
  return SAILS.main.share * luff(main) * (b.rig?.main ?? 1) + (plan === 'jib' ? SAILS.jib.share * luff(b.trim.jib) * (b.rig?.jib ?? 1) : 0);
}

/**
 * Pinching below the polar's beat angle (0..1, as flogAmount): the square of how far below it she is, across to the no-go
 * angle. The polar has her speed falling as she pinches (polar.ts, a curve set so that VMG peaks at ORC's beat angle,
 * not measured), and the sails sheeted hard in still draw (trim.ts luffs them only once the apparent wind is inside the
 * sheets' reach), so on its own that leaves a boat ten degrees too high losing little; a real one has her jib's luff
 * lifting and the hull's and rig's windage no longer paid for. Any cost here must be flat at the beat angle, or it moves
 * ORC's optimum (a straight line from the beat cost 10–16 times ORC's curve a degree or two low): a square is the
 * simplest that is. An estimate until the speed below the beat comes from the sails' own forces (ROADMAP, the audit).
 */
export const pinchFlog = (twa: number, beat: number) => twa >= beat ? 0 : twa <= NO_GO ? 1 : ((beat - twa) / (beat - NO_GO)) ** 2;

/** Roll her toward the heel `heelLee` (deg, + to leeward) as a damped oscillator (balance.ts rollStep). */
function rollTo(b: Boat, heelLee: number, rel: number, disp: number, dt: number): void {
  void rel;
  const side = b.tack === 'S' ? 1 : -1; // b.heel is + to port: to leeward with the wind over the starboard side (by her tack, as the boom)
  const r = rollStep(b.heel ?? 0, b.heelRate ?? 0, heelLee * side, disp, dt, b.v, b.crew ? crewMass(b.crew.spec) : 240);
  b.heel = r.heel; b.heelRate = r.rate; b.heelMag = b.heel * side;
}

/** Move her over the ground (through the water plus the current), and stop her on a dock or the shore. */
function travel(b: Boat, dt: number, t: number, emit: Emit, groundToast: { t: number }): void {
  const u = V(b.h), ww = b.ww;
  // sternway (pushed off astern): she coasts back, slowing on the water's drag, which is slight at a walking pace (a
  // two-tonne boat glides a long way: from a shove, three or four lengths in most of a minute)
  const ast = b.astern ?? 0;
  // (the coast's law at a walk; faster, her hull's resistance going through the water, the same as ahead, which rises with
  // the square of the speed and more; the drag's constant part stops her in a finite time, and the wind's push astern
  // builds a little a step)
  if (ast > 0) b.astern = Math.max(0, ast - Math.max(ASTERN_DRAG.c0 + ASTERN_DRAG.c1 * ast, hullResistance(ast) / HANDLING.mass) * dt);
  // sideways too, while she's slipping (hove to)
  const sw = b.sway ?? 0, stb = V(b.h + 90);
  b.vx = u.x * (b.v - ast) + stb.x * sw + b.cur.x; b.vy = u.y * (b.v - ast) + stb.y * sw + b.cur.y;
  b.x += b.vx * dt; b.y += b.vy * dt;
  const bump = (msg: string) => { if (b.isUser && t - groundToast.t > 4) { groundToast.t = t; emit({ type: 'toast', msg }); } };
  if (b.pushing) { /* being walked out of her own slip by hand: nothing to hit */ }
  else if (onLand(bow(b))) { // (the message by what she hit, a dock, a bridge's pier or the shore, not by where she is)
    const hit = bow(b), pier = pierNear(hit, 6), dock = hitsHarbor(hit); // (where her bow struck, before she's pushed back off it)
    b.x -= u.x * 0.6; b.y -= u.y * 0.6; b.v = 0; b.sway = 0;
    bump(pier ? `Collision: you hit the ${pier.name.replace(/^(.*?), (.*)$/, '$1\'s $2')}. Bear away and give it room.` : dock ? 'Bump: your bow hit the dock. Steer off and back into the fairway.' : 'Aground! Steer back out to open water.');
  } else if (ast > 0 && onLand(stern(b))) {
    const hit = stern(b), pier = pierNear(hit, 6);
    b.x += u.x * 0.4; b.y += u.y * 0.4; b.astern = 0;
    bump(pier ? `Collision: your stern hit the ${pier.name.replace(/^(.*?), (.*)$/, '$1\'s $2')} going astern.` : hitsHarbor(hit) ? 'Bump: your stern hit the dock going astern.' : 'Your stern touched bottom going astern.');
  }
  // set sideways onto something (the wind on her bare rig across her, at a dock, or her leeway): her side at the beam, amidships
  // and at the quarters, half her beam (1.1 m) out on the side she's going; she stops against it, as against a fender
  // (only while she's going more sideways than ahead: under way, what she meets she meets bow first, above)
  // (her sideways motion over the ground: her slip through the water and the current's set across her)
  const side = b.vx * stb.x + b.vy * stb.y, ahead = b.vx * u.x + b.vy * u.y;
  if (!b.pushing && Math.abs(side) > 0.005 && Math.abs(side) > 0.5 * Math.abs(ahead)) {
    const sgn = Math.sign(side), hit = [0, 2.4, -2.4].map(a => ({ x: b.x + u.x * a + stb.x * sgn * 1.1, y: b.y + u.y * a + stb.y * sgn * 1.1 })).find(q => onLand(q));
    if (hit) {
      const pier = pierNear(hit, 6);
      b.x -= stb.x * sgn * 0.15; b.y -= stb.y * sgn * 0.15; if (Math.sign(b.sway ?? 0) === sgn) b.sway = 0;
      bump(pier ? `Collision: she's been set sideways onto the ${pier.name.replace(/^(.*?), (.*)$/, '$1\'s $2')}.` : hitsHarbor(hit) ? 'Bump: she\'s been set sideways onto the dock.' : 'She\'s been set sideways onto the shore.');
    }
  }
  // trim to the apparent wind: wind over the water minus the boat's own motion through it (and the rig's as she rolls,
  // so the flags, the windex and the crew see what the sails see)
  // (in the frame the sails are trimmed in, the wind across her course through the water: step(), apF)
  const fr = sailFrame(b);
  const aw = apparent(ww.from, ww.kt, b.h + fr.rot, fr.along - (b.astern ?? 0) + rigSurge(b), fr.across + rigSway(b), b.heel ?? 0);
  b.awa = aw.awa; b.arel = aw.arel; b.aws = aw.aws;
}

/** Where the boom and jib are drawn: easing toward their sheet angles. */
function sailVisuals(b: Boat, plan: SailPlan, dt: number): void {
  // The main goes to leeward for the tack the boat is on (so sailing a little by the lee it stays put).
  const side = b.tack === 'S' ? -1 : 1;
  // The sails sit at their sheet angles; easing to luff lets them right out.
  const boomT = b.luff ? SAILS.main.max : b.sheets.main;
  // Jib: to leeward normally (to windward when backed); poled out square to windward when wing-on-wing; hanging
  // centred while the crew works the pole.
  const jibT = plan === 'wing' ? -side * 82 : plan === 'main' ? side * 10 : side * (b.luff && !b.jibBacked ? SAILS.jib.max : b.sheets.jib);
  b.boom += (side * boomT - b.boom) * Math.min(1, dt * 4);
  b.jib += (jibT - b.jib) * Math.min(1, dt * (plan === 'wing' ? 1.2 : 3));
}

/** How far the crew eases the boom past its best angle to keep her on her feet (the last depowering step: up to about 7°). */
export const crewEaseBoom = (b: Boat) => (Math.abs(b.awaSlow) < 70 ? 7 * clamp(((b.depower ?? 0) - 0.6) / 0.4, 0, 1) : 0);
/** The boom angle the crew is aiming for. */
export const crewMainAngle = (b: Boat) => optimalSheet('main', b.awaSlow) + crewEaseBoom(b);

/** Taking in a slack sheet by hand, full range per second (an arm's length of line a second, no load on it). */
const SLACK_RATE = 0.6;

/* ---------- who has each line ---------- */

/** Every line you can work, in the order they're shown. */
export const LINES: readonly LineKey[] = ['mainsheet', 'traveller', 'backstay', 'vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham', 'jibHalyard', 'jibsheet', 'jibsheetW', 'car'];
/** Whether you have this line (otherwise the crew works it). */
export function byHand(b: Boat, k: LineKey): boolean {
  if (!b.isUser) return false;
  const h = b.hand?.[k]; if (h != null) return h;
  if (k === 'jibsheetW') return false; // the lazy sheet is the crew's until you haul on it
  return k === 'mainsheet' || k === 'jibsheet' ? b.manualTrim : b.trimAll;
}
/** The lines you have. */
export const linesByHand = (b: Boat): LineKey[] => LINES.filter(k => byHand(b, k));
/** Take a line (you're working it), or give it back to the crew (`mine` false): they carry on from where it is. */
export function takeLine(b: Boat, k: LineKey, mine = true): void {
  (b.hand ??= {})[k] = mine;
  if (!mine && k !== 'car') { delete b.ctlCmd[k]; if (b.ctlTarget) delete b.ctlTarget[k]; }
}
/** Every line back to the crew. */
export function allToCrew(b: Boat): void { b.manualTrim = b.trimAll = false; b.hand = {}; b.ctlCmd = {}; b.ctlTarget = {}; b.poleMine = false; }

/**
 * At a tack (or gybe) the jib sheets stay on their own sides. The crew lets the old sheet fly and tails the new one, so
 * the leeward sheet carries on where it was. But a sheet you hold is yours: hold the windward sheet through the turn and
 * the sheets change roles as they really do, the one you had trimmed becoming the windward sheet with the jib aback
 * (the classic way to heave to: tack and leave the jib sheet made fast).
 */
function jibSheetsAtTack(b: Boat, emit: Emit): void {
  if (!byHand(b, 'jibsheetW')) return;
  const c = b.ctl, h = b.hand ??= {}, leeMine = byHand(b, 'jibsheet');
  [c.jibsheet, c.jibsheetW] = [c.jibsheetW, c.jibsheet];
  h.jibsheet = true; h.jibsheetW = leeMine;
  if (b.ctlTarget) { const tl = b.ctlTarget.jibsheet, tw = b.ctlTarget.jibsheetW; delete b.ctlTarget.jibsheet; delete b.ctlTarget.jibsheetW; if (tw != null) b.ctlTarget.jibsheet = tw; if (tl != null && leeMine) b.ctlTarget.jibsheetW = tl; }
  if (leeMine && c.jibsheetW < 0.6) emit({ type: 'toast', msg: 'You held the jib sheet through the tack: the jib is aback. Ease the windward sheet (or tap its Auto) to let it across.', ms: 5000 });
  else if (!leeMine) emit({ type: 'toast', msg: 'The jib sheets changed sides: the one you held is now the leeward sheet, and yours to trim (tap its Auto to give it to the crew).', ms: 5000 });
}

/**
 * Work the sheets and every other control. The crew trims each sail toward its best sheet angle at a human
 * pace, reacting to the apparent wind with a short lag (so a quick luff or bear-away shows on the telltales
 * before they catch up), and sets the other controls for the conditions; or you do it yourself. The jib sheet
 * comes in on a winch, slower as the breeze builds. Then work out each sail's angle of attack and shape.
 */
type Ctl = Exclude<keyof Controls, 'car'>;
// (the lines the crew works, as constants: trimSails runs every step for every boat)
const CREW_LINES = ['vang', 'outhaul', 'cunningham', 'downhaul', 'backstay', 'jibCunningham', 'jibHalyard'] as const, CREW_LINES_T = ['vang', 'outhaul', 'cunningham', 'downhaul', 'backstay', 'jibCunningham', 'jibHalyard', 'traveller'] as const, FIXABLE_LINES = ['traveller', 'vang', 'outhaul', 'cunningham', 'downhaul', 'backstay', 'jibCunningham', 'jibHalyard'] as const;
function trimSails(b: Boat, awa: number, plan: SailPlan, dt: number): void {
  if (!b.crewReady) b.awaSlow = awa; // (set up before she sails: for the wind she has)
  b.awaSlow += (awa - b.awaSlow) * Math.min(1, dt / CREW_LAG);
  const c = b.ctl, tws = b.ww.kt;
  // working a line takes that line, and only that line, off the crew
  if (b.isUser) for (const k of [...Object.keys(b.ctlCmd), ...Object.keys(b.ctlTarget ?? {})] as Ctl[]) if (b.ctlCmd[k] || b.ctlTarget?.[k] != null) takeLine(b, k);
  // the crew work the lines they have one job at a time, each person at their own pace (crewWork.ts): `on` is filled in
  // below, once the crew's targets are known
  let on: Partial<Record<Ctl, { pace: number; to: number }>> = {};
  const move = (k: Ctl, to: number, rate = CONTROL_RATE[k]) => { const j = on[k], d = (j ? j.to : to) - c[k]; c[k] += Math.sign(d) * Math.min(Math.abs(d), rate * (j?.pace ?? 1) * dt); };
  const hand = (k: Ctl, rate = CONTROL_RATE[k]) => {
    const cmd = b.ctlCmd[k] ?? 0, tg = b.ctlTarget?.[k];
    if (cmd === 0 && tg != null) { // dragged to a setting: work the line there at the usual pace
      const d = tg - c[k];
      if (Math.abs(d) < 0.003) { delete b.ctlTarget![k]; return; }
      c[k] += Math.sign(d) * Math.min(Math.abs(d), rate * dt); return;
    }
    if (cmd !== 0 && b.ctlTarget) delete b.ctlTarget[k];
    c[k] = clamp(c[k] + cmd * rate * dt, k === 'traveller' ? -1 : 0, 1);
  };
  // overpowered upwind: the crew works down the depowering steps (controls.ts depowerLimits) toward the fastest (a
  // half-minute or so end to end); starting out, from the wind
  const up = Math.abs(b.awaSlow) < 70, helmLoad = b.helmNeed ?? 0;
  b.depower ??= up ? clamp((tws - 14) / 10, 0, 1) : 0;
  if (!b.crewReady) { // (set up before she sails: at the fastest step for her crew in this wind)
    const cond = b.spec ? (b.cond ??= condition(b.spec)) : null, spec = b.crew?.spec ?? DEFAULT_CREW;
    b.depower = up ? herFastestStep(b, b.twa, tws, plan, displacement(spec) + (cond?.extraKg ?? 0)).d : 0;
  }
  // (hike first, then depower: the crew adds depowering only once they're out as far as they go, and takes it off
  // first whenever they've room to hike; you placing the crew, they work with where you've put them)
  const cs0 = b.crew, maxed = !cs0 || !!cs0.place?.across || !!cs0.allOut; // (out as far as they can go now, tired or not)
  // the step they work toward: the fastest for this crew in this wind (powerFactor), which a skilled crew follows closely
  // and a novice only once it's well off (the search weighs the rudder's drag already: North Sails' "until the rudder
  // feels light again"); past about 6° of helm they can't steer her, whatever it costs
  // (they add depowering only once they're hiking as far as they can: hike first; while they're getting out they hold
  // what they have)
  const goal = b.depowerBest ?? (up ? clamp((tws - 14) / 10, 0, 1) : 0), slack = 0.03 + 0.07 * (1 - crewSkill(b.crew));
  const over = !up ? -1 : (b.depower < goal - slack || helmLoad > 6) && maxed ? 1 : b.depower > goal + slack && helmLoad < 6 ? -1 : 0;
  b.depower = clamp(b.depower + over * dt / 30, 0, 1);
  // last of the steps, the traveller comes down to leeward: the boom eases out with it (up to about 7°)
  const easeBoom = crewEaseBoom(b);
  const wantMain = optimalSheet('main', b.awaSlow) + easeBoom, wantJib = optimalSheet('jib', b.awaSlow);
  // the crew works out its settings about once a second, for the conditions as they see them
  const cond = b.spec ? (b.cond ??= condition(b.spec)) : null; // the crew knows their sails and mast
  // (when a line changes hands the crew thinks again at once, starting from what it has set: its other lines stay put
  // unless the change calls for moving them)
  const mineNow = b.isUser ? linesByHand(b).join() : '';
  if (mineNow !== (b.crewFixed ?? '')) { b.crewFixed = mineNow; b.crewPlanT = 0; }
  if (!b.crewPlan || !(b.crewPlanT! > 0)) {
    // the lines you hold stay where you have them, and the crew sets the rest around them (your sheets at their angles)
    const fixed: Partial<CrewSettings> & { mainsheet?: number } = {};
    if (b.isUser) {
      for (const k of FIXABLE_LINES) if (byHand(b, k)) fixed[k] = c[k];
      if (byHand(b, 'car')) { const lazy = c.car[b.tack]; fixed.carFore = lazy.fore; fixed.carIn = lazy.ins; }
    }
    if (b.isUser && byHand(b, 'mainsheet')) fixed.mainsheet = c.mainsheet;
    // heaving to (the windward jib sheet yours, or the jib aback): your eased main is deliberate, the car stays put
    if ((b.hove || byHand(b, 'jibsheetW')) && !byHand(b, 'traveller')) fixed.traveller = c.traveller;
    const mAng = wantMain, jAng = b.isUser && byHand(b, 'jibsheet') ? clamp(jibAngle(c, b.tack), SAILS.jib.min, SAILS.jib.max) : wantJib;
    b.crewPlan = crewSolve(tws, b.awaSlow, b.tack, mAng, jAng, b.crewPlan ?? undefined, mainRig(b), cond?.jib, b.aws / KT, b.depower, fixed); b.crewPlanT = 1;
    b.crewWorth = planWorth(c, b.crewPlan, tws, b.awaSlow, b.tack, mAng, jAng, mainRig(b), cond?.jib, b.aws / KT, b.depower, fixed.mainsheet);
    // (the band's marks: where the crew would set your lines too; a second solve only while you hold any; nothing reads it)
    if (b.isUser) {
      const free = mineNow ? crewSolve(tws, b.awaSlow, b.tack, wantMain, wantJib, b.crewIdeal ?? undefined, mainRig(b), cond?.jib, b.aws / KT, b.depower, {}) : b.crewPlan;
      b.crewIdeal = { ...free, mainsheet: mainsheetFor(wantMain, free.traveller), jibsheet: jibsheetFor(wantJib, c, b.tack) };
    }
  }
  b.crewPlanT = (b.crewPlanT ?? 0) - dt;
  const t = b.crewPlan;
  // what the crew would do with each line they have; then who gets to it, and when (crewWork.ts)
  const backing0 = byHand(b, 'jibsheetW') && jibClew({ ...c, jibsheet: 1 }, b.tack) < jibAngle(c, b.tack);
  const want: Partial<Record<Ctl, number>> = {};
  // (a line is moved only if it's worth the trip: a skilled crew sees smaller gains, ~0.1% of drive; a novice ~0.4%)
  const minGain = 0.001 + 0.003 * (1 - crewSkill(b.crew));
  for (const k of CREW_LINES_T) if (!byHand(b, k)) want[k] = (b.crewWorth?.[k] ?? 1) >= minGain || !b.crewReady ? t[k] : c[k];
  if (!byHand(b, 'mainsheet')) want.mainsheet = mainsheetFor(wantMain, c.traveller);
  if (!byHand(b, 'jibsheetW')) want.jibsheetW = 1;
  if (!byHand(b, 'jibsheet')) want.jibsheet = backing0 ? 1 : jibsheetFor(wantJib, c, b.tack);
  // the lazy (windward) jib car: the crew's plan for it (they move it only when it's worth it), or yours
  if (byHand(b, 'car')) b.carPlan = null; else if (!b.carPlan || b.carPlan.fore !== t.carFore || b.carPlan.ins !== t.carIn) b.carPlan = { fore: t.carFore, ins: t.carIn };
  // (the first time: she was set up before she sailed, so the crew's lines start where they want them)
  if (!b.crewReady) {
    b.crewReady = true;
    for (const k of Object.keys(want) as Ctl[]) if (k !== 'mainsheet' && k !== 'jibsheet' && k !== 'jibsheetW') c[k] = want[k]!; // (the sheets are trimmed to the wind as she goes)
    if (b.carPlan) { c.car.S = { ...b.carPlan }; c.car.P = { ...b.carPlan }; }
  }
  on = crewJobs(b, want, dt);
  for (const k of CREW_LINES) {
    if (byHand(b, k)) hand(k); else move(k, want[k]!);
  }
  // the main: traveller and mainsheet together, for the boom angle and the leech tension (whichever the crew has)
  // (the traveller: let go to leeward it runs; hauled to windward it's slower, and slower in a breeze: travellerRate)
  { const dir = byHand(b, 'traveller') ? (b.ctlCmd.traveller ?? (b.ctlTarget?.traveller != null ? b.ctlTarget.traveller - c.traveller : 0)) : (on.traveller ? on.traveller.to : want.traveller!) - c.traveller;
    const rate = travellerRate(dir > 0, tws);
    if (byHand(b, 'traveller')) hand('traveller', rate); else move('traveller', want.traveller!, rate); }
  if (byHand(b, 'mainsheet')) hand('mainsheet'); else move('mainsheet', mainsheetFor(wantMain, c.traveller), CONTROL_RATE.mainsheet * 1.5);
  // the jib sheets, one on each winch: hauling in on a winch is slow in a breeze, easing is quick
  const going = (k: 'jibsheet' | 'jibsheetW') => b.ctlCmd[k] ?? (b.ctlTarget?.[k] != null ? b.ctlTarget[k]! - c[k] : 0);
  // a windward sheet you've hauled and then eased right off again is the crew's lazy sheet once more
  if (b.hand?.jibsheetW) {
    if (c.jibsheetW < 0.9) b.wHauled = true;
    else if (b.wHauled && c.jibsheetW > 0.95 && !b.ctlCmd.jibsheetW && b.ctlTarget?.jibsheetW == null) { b.hand.jibsheetW = false; b.wHauled = false; }
  } else b.wHauled = false;
  const wMine = byHand(b, 'jibsheetW');
  // (until it comes tight a lazy sheet is just slack, taken in hand over hand in a second or two; only the last of it
  // needs the winch)
  const wSlack = jibClew({ ...c, jibsheet: 1 }, b.tack) > jibAngle(c, b.tack) + 3;
  if (wMine) hand('jibsheetW', wSlack ? SLACK_RATE : CONTROL_RATE.jibsheetW * winchFactor(tws, going('jibsheetW') < 0));
  else move('jibsheetW', 1, CONTROL_RATE.jibsheetW * winchFactor(tws, false)); // the crew leaves the lazy sheet slack
  // you're holding the clew to windward with the windward sheet (backing the jib): the crew lets the leeward one fly
  const backing = wMine && jibClew({ ...c, jibsheet: 1 }, b.tack) < jibAngle(c, b.tack);
  if (byHand(b, 'jibsheet')) hand('jibsheet', CONTROL_RATE.jibsheet * winchFactor(tws, going('jibsheet') < 0));
  else if (backing) move('jibsheet', 1, CONTROL_RATE.jibsheet * winchFactor(tws, false));
  else { const je = jibsheetFor(wantJib, c, b.tack); move('jibsheet', je, CONTROL_RATE.jibsheet * winchFactor(tws, je < c.jibsheet)); }
  b.sheets.main = clamp(boomAngle(c), SAILS.main.min, SAILS.main.max);
  // the clew: to leeward on its sheet, or held to windward by the other one (backed)
  const clew = jibClew(c, b.tack);
  b.jibBacked = clamp(-clew / 5, 0, 1);
  b.sheets.jib = clew < 0 ? clew : clamp(clew, SAILS.jib.min, SAILS.jib.max);
  b.trim.main = sailTrim('main', awa, b.sheets.main);
  b.trim.jib = plan === 'jib' ? sailTrim('jib', awa, b.sheets.jib) : null; // poled out or down: the sheet isn't in play
  // the sheets against where they should be: the main against the crew's intended boom (eased down the traveller on the
  // last depowering steps on purpose: that's counted with the sails' power, powerFactor), the jib against its best
  b.trimDriveK = trimDrive(sailTrim('main', awa, clamp(b.sheets.main - easeBoom, SAILS.main.min, SAILS.main.max)), b.trim.jib);
  // shape
  const ms = mainShape(c, tws, mainRig(b), b.aws / KT), js = plan === 'jib' ? jibShape(c, tws, b.tack, cond?.jib, b.aws / KT, mainRig(b)?.tune) : null;
  const em = shapeEfficiency(ms, targetShape('main', tws, awa, b.depower)), ej = js ? shapeEfficiency(js, targetShape('jib', tws, awa, b.depower)) : 1;
  b.shape = { main: ms, jib: js, eff: js ? SAILS.main.share * em + SAILS.jib.share * ej : em };
}

/**
 * Ask for the lazy (windward) jib car one pin further: fore–aft (+1 aft) or athwartships (+1 outboard). The crew goes
 * forward and moves it (crewWork.ts): it takes a while, and their weight goes with them. Nobody can move the loaded one.
 */
export function moveLazyCar(b: Boat, fore: number, ins: number): void {
  const lazy = b.ctl.car[b.tack], from = b.carCmd ?? { fore: lazy.fore, ins: lazy.ins };
  b.carCmd = { fore: clamp(from.fore + fore, 0, CAR_FORE_PINS - 1), ins: clamp(from.ins + ins, 0, CAR_IN_PINS - 1) };
}

/** Apparent wind: wind over the water minus the boat's motion through it. aws in m/s, arel signed (+ from starboard). */
export function apparent(from: number, windKt: number, h: number, v: number, sway = 0, heelDeg = 0): { aws: number; arel: number; awa: number } {
  // (sway: her sideways speed, m/s, + to starboard, when she's slipping hove to, and the rig's as she rolls. Heeled, the
  // masthead's windex and flags lean with the mast and see the wind across the boat shortened by cos(heel), as the sails
  // do: ORC eqs. 7.2–7.3)
  const vt = windKt * KT, rel = wrap(from - h) * D2R;
  const along = vt * Math.cos(rel) + v, across = vt * Math.sin(rel) * Math.cos(heelDeg * D2R) + sway;
  const arel = Math.atan2(across, along) / D2R;
  return { aws: Math.hypot(along, across), arel, awa: Math.abs(arel) };
}

/**
 * The apparent wind the sails see (ORC VPP Documentation 2025, §7.1). The true wind is the 10 m wind (as the polar's
 * and the wind fields'); at the sails' centre of effort it's less, by the log profile over the water VT(z) =
 * VT(10 m)·ln(z/z0)/ln(10/z0) with z0 = 0.005 m (eq. 7.1): 4.3 m up, 89% of it. And heeled, the mast plane leans
 * away from the wind across the boat: only that component is reduced, by cos φ (eqs. 7.2–7.3). `heelDeg` signed, either way.
 */
/** The true wind at `z` m over the water as a share of the 10 m wind: the log profile, z0 = 0.005 m (eq. 7.1). */
export const gradientAt = (z: number) => Math.log(Math.max(z, 0.05) / 0.005) / Math.log(10 / 0.005);
const GRADIENT = gradientAt(CE_ABOVE_WL);
export function sailWind(from: number, windKt: number, h: number, v: number, sway = 0, heelDeg = 0): { aws: number; arel: number; awa: number } {
  return windAtZ(from, windKt, h, v, GRADIENT, sway, heelDeg);
}
/** The apparent wind where the true wind is `g` of the 10 m wind (sailWind's working, at any height). */
function windAtZ(from: number, windKt: number, h: number, v: number, g: number, sway = 0, heelDeg = 0): { aws: number; arel: number; awa: number } {
  const vt = windKt * KT * g, rel = wrap(from - h) * D2R, c = Math.cos(heelDeg * D2R);
  const along = vt * Math.cos(rel) + v, across = vt * Math.sin(rel) * c + sway; // (+: air coming from ahead / from starboard)
  const arel = Math.atan2(across, along) / D2R;
  return { aws: Math.hypot(along, across), arel, awa: Math.abs(arel) };
}
/**
 * The wind she feels at `z` m above the water (the midair wind indicator, render/windLadder.ts):
 * - tw: the true wind there (the wind over the water, as instruments call true: kt, from the log profile);
 * - air: the apparent wind there as the air actually moves past her, level: true wind less her own motion (her speed
 *   and slip, and the rig's sway at that height: the roll moves the mast faster higher up). True minus her velocity is
 *   this, so the indicator's arrows close the wind triangle;
 * - aw: the apparent wind's speed and angle as the sim measures it for the sails (sailWind in her course's frame, the
 *   heeled mast's plane), so the label's angle is the one on the HUD and the windex.
 * `from`: the bearing each comes from (deg).
 */
export function windAtHeight(b: Boat, z: number): { tw: { kt: number; from: number }; air: { kt: number; from: number }; aw: { kt: number; awa: number } } {
  const ww = b.ww, g = gradientAt(z), fr = sailFrame(b), h = b.h + fr.rot, along = fr.along - (b.astern ?? 0) + rigSurge(b) * z / CE_ABOVE_WL, across = fr.across + rigSway(b) * z / CE_ABOVE_WL;
  const level = windAtZ(ww.from, ww.kt, h, along, g, across, 0), plane = windAtZ(ww.from, ww.kt, h, along, g, across, b.heel ?? 0);
  return { tw: { kt: ww.kt * g, from: ww.from }, air: { kt: level.aws / KT, from: n360(h + level.arel) }, aw: { kt: plane.aws / KT, awa: plane.awa } };
}

/** Her slip to leeward on the tack she's on (deg; her course is that much further off the wind than her heading). Just
 * round from a tack, still sliding toward the old leeward side, none. */
const leeSlip = (b: Boat) => b.v > 0.3 ? Math.max(0, Math.atan2(b.tack === 'S' ? -(b.sway ?? 0) : (b.sway ?? 0), b.v) / D2R) : 0;

/**
 * The frame the sails are trimmed and their forces read in: the wind across her course through the water, the frame the
 * sail model and its trim constants were calibrated in before she had leeway (a calibration choice: physics.ts step()).
 * It turns from her heading by the steady leeway she makes at speed (b.leeway); her slip beyond it (stalled, pinching,
 * slow, or the moment a puff heels her) is the wind drawing forward across her sails, and they luff; short of it (just
 * tacked, not yet sliding), the wind a little more abeam. Through a tack, as the slip changes sides, the frame turns over
 * at up to 10° a second (stepFrame) rather than at once. Her velocity through the water in that frame: along it
 * and across it (+ starboard).
 */
/** The frame's turn, worked toward her steady leeway on the side she's slipping, at up to 10° a second (sailFrame). */
function stepFrame(b: Boat, dt: number): void {
  const slip = b.v > 0.3 ? Math.atan2(b.sway ?? 0, b.v) / D2R : 0, want = Math.abs(slip) > 0.5 ? Math.sign(slip) * (b.leeway ?? 0) : 0;
  const r0 = b.sailRot ?? want; b.sailRot = r0 + clamp(want - r0, -10 * dt, 10 * dt);
}

export function sailFrame(b: Boat): { rot: number; along: number; across: number } {
  const sw = b.sway ?? 0, slip = b.v > 0.3 ? Math.atan2(sw, b.v) / D2R : 0, lw = b.leeway ?? 0;
  const rot = b.sailRot ?? (Math.abs(slip) > 0.5 ? Math.sign(slip) * lw : 0), r = rot * D2R;
  return { rot, along: b.v * Math.cos(r) + sw * Math.sin(r), across: -b.v * Math.sin(r) + sw * Math.cos(r) };
}

/** Heading a user tack/gybe aims for: the matching course on the other side of the wind. */
export function tackTarget(b: Boat): { dir: number; target: number } {
  const rel = b.rel, twa = b.twa, from = b.ww.from;
  // upwind: tack to the same angle on the other side, but at least close-hauled; downwind: gybe to the mirror angle
  // (the beat angle is her course's: her heading is above it by her leeway)
  if (twa < 100) return { dir: rel >= 0 ? 1 : -1, target: n360(from + (rel >= 0 ? 1 : -1) * Math.max(beatFor(b) - (b.leeway ?? 0), Math.min(twa, 60))) };
  return { dir: rel >= 0 ? -1 : 1, target: n360(from + rel) };
}

/**
 * A boat as she's placed on the water, before the first step: on the tack the wind gives her heading, with her crew's
 * sheets already trimmed for the wind there, as a crew sailing about before a start would have them (not sheeted hard
 * in on a broad reach, easing out as the sequence begins). `from`/`windKt`: the wind on the water where she is (the
 * World passes her own, current and puffs included, as the first step will). The sheets are trimmed to the wind the
 * sails see (sailWind: the gradient at their height), the windex shows the masthead's (apparent); the jib sits where
 * its sheet and car put the clew (jibClew), as trimSails has it. The traveller, the crew's depowering ease and the
 * other lines come on the first step, from the crew's plan: a few degrees at most, eased in by the boom's own lag.
 * (Tests that put a boat somewhere new call it too: she arrives trimmed and upright for her new heading.)
 */
export function settleTrim(b: Boat, from: number, windKt: number): void {
  const rel = wrap(from - b.h), ap = apparent(from, windKt, b.h, b.v), sw = sailWind(from, windKt, b.h, b.v), c = b.ctl;
  b.rel = rel; b.twa = Math.abs(rel); b.tack = rel >= 0 ? 'S' : 'P';
  b.arel = ap.arel; b.awa = ap.awa; b.aws = ap.aws; b.awaSlow = sw.awa;
  const side = b.tack === 'S' ? -1 : 1;
  c.mainsheet = mainsheetFor(optimalSheet('main', sw.awa), c.traveller); c.jibsheet = jibsheetFor(optimalSheet('jib', sw.awa), c, b.tack);
  b.sheets.main = clamp(boomAngle(c), SAILS.main.min, SAILS.main.max);
  const clew = jibClew(c, b.tack); b.sheets.jib = clew < 0 ? clew : clamp(clew, SAILS.jib.min, SAILS.jib.max);
  b.boom = side * b.sheets.main; b.jib = side * b.sheets.jib;
  // upright and steady as she's put there: no heel, roll or helm carried over from where she was before (a boat moved
  // onto the other tack must not keep heeling the old way, with the helm that went with it)
  b.heel = 0; b.heelRate = 0; b.heelMag = 0; b.heelEqLast = 0; b.helmNeed = 0; b.sway = 0;
  // and her crew sitting to windward for this tack (World makes them on starboard: a port-tack boat's crew would
  // otherwise cross the boat in the first seconds; a place you've given them stays)
  if (b.crew && b.crew.side !== b.tack) { const place = b.crew.place; b.crew = newCrew(b.crew.spec, b.tack); if (place) b.crew.place = place; }
}
