import { KT, V, brg, clamp, wrap, n360, D2R } from '../core/math';
import { onLand } from '../geo/shore';
import type { Emit } from '../sim/events';
import { bow, type Boat } from './boat';
import { HANDLING, airDrag, flogAmount, luffDriveFactor, maxTurnRate, surgeAccel } from './dynamics';
import { NO_GO, beatAngle, polar, type SailPlan } from './polar';
import { beatFor, seaDrag, waveYaw } from './seaway';
import { FULL_RUDDER, heelFactor, heelWithCrew, heelingMoment, helmNeeded, hullRighting, rudderDrag, sailForces } from './balance';
import { DEFAULT_CREW, crewMoment, displacement, displacementFactor, handsFactor, newCrew, placeCrew, trimFactor } from './crewPhys';
import { SAILS, optimalSheet, sailTrim, trimDrive } from './trim';
import { condition, foulingDrag } from './condition';
import { CAR_FORE_PINS, CAR_IN_PINS, CONTROL_RATE, boomAngle, crewSolve, jibAngle, jibShape, jibsheetFor, mainShape, mainsheetFor, shapeEfficiency, targetShape, winchFactor, type Controls, type Shape } from './controls';

/** Turn rate during penalty turns, deg/s: the crew backs the jib and main to spin her round. */
export const PENALTY_TURN_RATE = 10;
/** Below this speed (m/s, ~2.5 kt) the AI won't try to tack: she'd stall head to wind. */
export const SLOW_TACK = 1.3;

/** The crew's reaction time to a change in apparent wind angle, s. */
export const CREW_LAG = 0.8;

/** Crew timings for the whisker pole, s. */
export const POLE = { set: 8, stow: 5, gybe: 8 };

/** How the jib is working right now, from the pole state. */
export function sailPlan(b: Boat): SailPlan {
  if (b.pole === 'set') return b.poleTack === b.tack ? 'wing' : 'main';
  if (b.pole === 'down') return 'jib';
  return 'main'; // crew busy with the pole: jib not drawing
}

/** Crew work on the pole: set or stow on command, and gybe it end-for-end when the boat gybes. */
function crewPole(b: Boat, dt: number, emit: Emit): void {
  const say = (msg: string) => { if (b.isUser) emit({ type: 'toast', msg }); };
  const hands = b.crew ? handsFactor(b.crew.spec) : 1; // short-handed, the pole takes longer
  if (b.poleWant && (b.pole === 'down' || b.pole === 'stowing')) { b.pole = 'setting'; b.poleT = POLE.set / hands; b.poleTack = b.tack; }
  else if (!b.poleWant && (b.pole === 'set' || b.pole === 'setting')) { b.pole = 'stowing'; b.poleT = POLE.stow / hands; }
  else if (b.pole === 'set' && b.tack !== b.poleTack) {
    b.pole = 'setting'; b.poleT = POLE.gybe; b.poleTack = b.tack;
    say('Gybing the pole end-for-end. The jib is down for a few seconds.');
  }
  if (b.pole === 'setting' || b.pole === 'stowing') {
    if (b.pole === 'setting' && b.poleTack !== b.tack) b.poleTack = b.tack; // gybed while setting: set it on the new windward side
    b.poleT -= dt;
    if (b.poleT <= 0) {
      if (b.pole === 'setting') { b.pole = 'set'; say('Pole set: jib out to windward, wing-on-wing.'); }
      else { b.pole = 'down'; say('Pole stowed: jib back to leeward.'); }
    }
  }
}

export function moveBoat(b: Boat, dt: number, t: number, emit: Emit, groundToast: { t: number }): void {
  const ww = b.ww;
  // turn rate falls off at low speed: a Folkboat needs water flowing over the rudder
  const maxRate = maxTurnRate(b.v);
  // helm balance: with weather helm she turns toward the wind unless the rudder holds her (balance.ts)
  const toWind = wrap(ww.from - b.h) >= 0 ? 1 : -1, balRate = clamp((b.helmNeed ?? 0) / FULL_RUDDER, -0.4, 0.4) * maxRate * toWind;
  let rate: number, rudder: number; // rudder: fraction of full, in the turn-rate sense (+ turns to starboard)
  if (b.isUser) {
    if (b.turnTarget != null && b.steer === 0) {
      const err = wrap(b.turnTarget - b.h);
      rate = b.turnDir * maxRate;
      if (Math.abs(err) < 3 || (Math.sign(err) !== b.turnDir && Math.abs(err) < 20)) { rate = 0; b.h = b.turnTarget; b.turnTarget = null; }
    } else {
      // tiller to starboard turns the bow to port; keys add a push of their own
      const helm = clamp(b.steer - b.tiller, -1, 1);
      rate = helm * maxRate; if (helm !== 0) b.turnTarget = null;
    }
    rudder = rate / Math.max(1e-6, maxRate);
    if (b.turnTarget == null) rate += balRate; // let go of the tiller and she rounds up (or bears away)
  } else if (b.penalty > 0 && !b.ai?.clearing) {
    // penalty turns: the crew backs the sails to spin the boat even when slow
    rate = Math.max(maxRate, PENALTY_TURN_RATE); rudder = 1;
  } else {
    let err = wrap(b.desired - b.h);
    const ai = b.ai;
    // a commitment ends when the turn is nearly done or she wants to go somewhere else
    if (ai && ai.turnCommit !== 0 && (Math.abs(err) < 15 || Math.abs(wrap(b.desired - ai.commitFor)) > 45)) ai.turnCommit = 0;
    if (ai && ai.turnCommit === 0 && Math.abs(err) > 30) {
      // Starting a big turn: choose once which way to go, and finish it (no bailing out halfway through a
      // tack). Too slow to tack? Going through the wind would leave her stuck in irons, so gybe instead.
      const toWind = wrap(b.ww.from - b.h);
      const throughWind = Math.sign(toWind) === Math.sign(err) && Math.abs(toWind) < Math.abs(err);
      ai.turnCommit = throughWind && b.v < SLOW_TACK ? -Math.sign(err) : Math.sign(err);
      ai.commitFor = b.desired;
    }
    if (ai && ai.turnCommit !== 0 && Math.sign(err) !== ai.turnCommit) {
      const long = err + ai.turnCommit * 360;
      if (Math.abs(long) > 330) ai.turnCommit = 0; else err = long; // target moved: drop the commitment
    }
    rate = clamp(err * 1.6, -maxRate, maxRate);
    rudder = (rate - balRate) / Math.max(1e-6, maxRate); // the AI holds whatever helm the boat needs
  }
  b.helm = clamp(rudder, -1, 1); // how hard the helm is over (for drawing the rudder and tiller)
  b.weatherHeld = -toWind * b.helm * FULL_RUDDER; // deg of weather helm actually held on the rudder
  if (b.v > 0.2) rate += waveYaw(b.sea, b.h, b.v, t, b.id + 1); // the sea knocks her bow about
  const dh = rate * dt;
  b.h = n360(b.h + dh);
  if (b.penalty > 0) {
    // Penalty turns count only in one direction, so each full turn includes a tack and a gybe (Rule 44.2).
    // The direction is settled once she has turned 30° one way; nothing counts while she sails clear first.
    if (!b.ai?.clearing) b.penaltyTurned += dh;
    if (!b.penaltyDir && Math.abs(b.penaltyTurned) > 30) b.penaltyDir = Math.sign(b.penaltyTurned);
    if (b.penaltyDir) b.penalty = Math.max(0, b.penaltyTotal - Math.max(0, b.penaltyTurned * b.penaltyDir));
    if (b.penalty <= 0) { b.penalty = 0; if (b.isUser) emit({ type: 'toast', msg: 'Penalty turns done. Back to racing.' }); }
  }
  const rel = wrap(ww.from - b.h), twa = Math.abs(rel);
  b.rel = rel; b.twa = twa;
  let tk: 'S' | 'P' = rel >= 0 ? 'S' : 'P';
  if (twa > 176) tk = b.tack; // dead downwind: keep the tack you had until the boom crosses
  if (tk !== b.tack) { if (twa < 90) b.tacking = true; b.tack = tk; b.lastTackT = t; }
  if (b.tacking && twa >= Math.min(40, beatAngle(ww.kt) - 3)) b.tacking = false; // close-hauled: Rule 13 ends
  crewPole(b, dt, emit);
  const plan = sailPlan(b);
  const ap = apparent(ww.from, ww.kt, b.h, b.v);
  trimSails(b, ap.awa, plan, dt);
  // heel and helm balance from the forces on the sails (balance.ts)
  const jibOn = plan === 'jib' && b.trim.jib && b.shape.jib ? { trim: b.trim.jib, shape: b.shape.jib } : null;
  const sf = sailForces(ap.aws, ap.awa, { trim: b.trim.main, shape: b.shape.main, out: b.sheets.main }, jibOn, b.luff);
  const cond = b.spec ? (b.cond ??= condition(b.spec)) : null; // your boat's condition: bottom, sails' age, spars, weight
  // an old sail's extra profile drag (hooked leech) and lost lift: the drive it costs, against the same shape in sound cloth
  let wornDrive = 1;
  if (cond && (b.shape.main.cd0 || b.shape.main.clMul || b.shape.jib?.cd0 || b.shape.jib?.clMul)) {
    const sound = (sh: Shape): Shape => ({ depth: sh.depth, draft: sh.draft, twist: sh.twist, ceAft: sh.ceAft });
    const s0 = sailForces(ap.aws, ap.awa, { trim: b.trim.main, shape: sound(b.shape.main), out: b.sheets.main }, jibOn ? { trim: jibOn.trim, shape: sound(jibOn.shape) } : null, b.luff);
    const d0 = s0.main.drive + s0.jib.drive, d1 = sf.main.drive + sf.jib.drive;
    if (d0 > 5) wornDrive = clamp(d1 / d0, 0.6, 1.05);
  }
  // the crew: where they'd put their weight to hold her at her best heel (a little heel in light air, no more than
  // about 17° upwind, flat downwind), then where they actually are (they move at a human pace)
  const cs = b.crew ??= newCrew(DEFAULT_CREW, b.tack), disp = displacement(cs.spec) + (cond?.extraKg ?? 0), F = sf.main.heel + sf.jib.heel;
  const rmExtra = (h: number) => cond ? cond.rightingDelta(h) : 0; // weight aloft (a wooden rig) or high aft (the outboard on its bracket)
  const bestHeel = twa > 120 ? 1 : ww.kt < 7 ? 6 : 16;
  const need = heelingMoment(F, sf.twist, bestHeel) - hullRighting(bestHeel, disp) - rmExtra(bestHeel);
  placeCrew(cs, need, twa, ww.kt, b.pole === 'set', b.tack, dt);
  const heelT = heelWithCrew(F, sf.twist, disp, h => crewMoment(cs, h) + rmExtra(h)) * (twa > 120 ? 0.6 : 1); // off the wind she rolls less
  b.heelMag = (b.heelMag ?? 0) + (heelT - (b.heelMag ?? 0)) * Math.min(1, dt * 2.2);
  b.heel = b.heelMag * (rel >= 0 ? 1 : -1);
  b.helmNeed = helmNeeded(sf, b.heelMag, b.sheets.main, b.v, sf.twist);
  b.forces = { heel: sf.main.heel + sf.jib.heel, drive: sf.main.drive + sf.jib.drive };
  // heel past her best; the weight aboard (displacement) and where it sits fore and aft
  let target = polar(ww.kt, twa, plan) * heelFactor(b.heelMag) * displacementFactor(disp, ww.kt) * trimFactor(cs.spec, cs.fore, twa, ww.kt, b.pole === 'set', cond?.extraMoment ?? 0);
  if (b.luff) target *= luffDriveFactor(twa);
  // Drive scales with trim efficiency; speed with roughly the square root of drive.
  else target *= Math.sqrt(trimDrive(b.trim.main, b.trim.jib) * b.shape.eff * wornDrive); // sheet angles, the sails' shape, worn cloth
  if (b.penalty > 0) target *= 0.7;
  const beat = beatAngle(ww.kt);
  // holding a lot of helm to keep her straight is a brake (the steady helm the sails demand; turning has its own cost)
  const helmDrag = Math.abs(rate) < 4 ? rudderDrag(clamp(b.helmNeed ?? 0, -12, 12), b.v) : 0;
  const a = surgeAccel(b.v, target, airDrag(ap.aws, ap.awa, flogAmount(twa, beat, NO_GO, b.luff)) + seaDrag(b.sea, b.h, b.v) + helmDrag + (cond ? foulingDrag(cond, b.v) : 0), disp);
  b.v = Math.max(0, b.v + a * dt);
  b.v = Math.max(0, b.v * (1 - HANDLING.turnDrag * Math.abs(rate) * D2R * dt)); // turning bleeds speed
  const u = V(b.h);
  b.vx = u.x * b.v + b.cur.x; b.vy = u.y * b.v + b.cur.y;
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (onLand(bow(b))) {
    b.x -= u.x * 0.6; b.y -= u.y * 0.6; b.v = 0;
    if (b.isUser && t - groundToast.t > 4) { groundToast.t = t; emit({ type: 'toast', msg: 'Aground! Steer back out to open water.' }); }
  }
  // trim to the apparent wind: wind over the water minus the boat's own motion through it
  const aw = apparent(ww.from, ww.kt, b.h, b.v), awa = aw.awa;
  b.awa = awa; b.arel = aw.arel; b.aws = aw.aws;
  // The main goes to leeward for the tack the boat is on (so sailing a little by the lee it stays put).
  const side = b.tack === 'S' ? -1 : 1;
  // The sails sit at their sheet angles; easing to luff lets them right out.
  const boomT = b.luff ? SAILS.main.max : b.sheets.main;
  // Jib: to leeward normally; poled out square to windward when wing-on-wing; hanging centred while the crew works the pole.
  const jibT = plan === 'wing' ? -side * 82 : plan === 'main' ? side * 10 : side * (b.luff ? SAILS.jib.max : b.sheets.jib);
  const k = Math.min(1, dt * 4);
  void awa;
  b.boom += (side * boomT - b.boom) * k;
  b.jib += (jibT - b.jib) * Math.min(1, dt * (plan === 'wing' ? 1.2 : 3));

}

/**
 * Work the sheets and every other control. The crew trims each sail toward its best sheet angle at a human
 * pace, reacting to the apparent wind with a short lag (so a quick luff or bear-away shows on the telltales
 * before they catch up), and sets the other controls for the conditions; or you do it yourself. The jib sheet
 * comes in on a winch, slower as the breeze builds. Then work out each sail's angle of attack and shape.
 */
type Ctl = Exclude<keyof Controls, 'car'>;
function trimSails(b: Boat, awa: number, plan: SailPlan, dt: number): void {
  b.awaSlow += (awa - b.awaSlow) * Math.min(1, dt / CREW_LAG);
  const c = b.ctl, tws = b.ww.kt, you = b.isUser;
  const hands = b.crew ? handsFactor(b.crew.spec) : 1; // fewer crew, slower line handling
  const move = (k: Ctl, to: number, rate = CONTROL_RATE[k]) => { const d = to - c[k]; c[k] += Math.sign(d) * Math.min(Math.abs(d), rate * hands * dt); };
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
  const wantMain = optimalSheet('main', b.awaSlow), wantJib = optimalSheet('jib', b.awaSlow);
  // the crew works out its settings about once a second, for the conditions as they see them
  const cond = b.spec ? (b.cond ??= condition(b.spec)) : null; // the crew knows their sails and mast
  if (!b.crewPlan || !(b.crewPlanT! > 0)) { b.crewPlan = crewSolve(tws, b.awaSlow, b.tack, wantMain, wantJib, b.crewPlan ?? undefined, cond?.main, cond?.jib, b.aws / KT); b.crewPlanT = 1; }
  b.crewPlanT = (b.crewPlanT ?? 0) - dt;
  const t = b.crewPlan;
  const crewAll = !(you && b.trimAll);
  for (const k of ['vang', 'outhaul', 'cunningham', 'downhaul', 'backstay', 'jibCunningham'] as const) {
    if (crewAll) move(k, t[k]); else hand(k);
  }
  // the lazy (windward) jib car: the crew sets it for the next tack; you set it with the car controls
  if (crewAll) { const lazy = c.car[b.tack]; lazy.fore = t.carFore; lazy.ins = t.carIn; }
  // sheets: you, or the crew (traveller and mainsheet together, for the boom angle and the leech tension)
  if (b.manualTrim && you) {
    hand('mainsheet');
    const tj = b.ctlTarget?.jibsheet, j = b.ctlCmd.jibsheet ?? (tj != null ? tj - c.jibsheet : 0); hand('jibsheet', CONTROL_RATE.jibsheet * winchFactor(tws, j < 0));
    if (crewAll) move('traveller', t.traveller); else hand('traveller');
  } else {
    move('traveller', t.traveller);
    move('mainsheet', mainsheetFor(wantMain, c.traveller), CONTROL_RATE.mainsheet * 1.5);
    const je = jibsheetFor(wantJib, c, b.tack);
    move('jibsheet', je, CONTROL_RATE.jibsheet * winchFactor(tws, je < c.jibsheet));
  }
  b.sheets.main = clamp(boomAngle(c), SAILS.main.min, SAILS.main.max);
  b.sheets.jib = clamp(jibAngle(c, b.tack), SAILS.jib.min, SAILS.jib.max);
  b.trim.main = sailTrim('main', awa, b.sheets.main);
  b.trim.jib = plan === 'jib' ? sailTrim('jib', awa, b.sheets.jib) : null; // poled out or down: the sheet isn't in play
  // shape
  const ms = mainShape(c, tws, cond?.main, b.aws / KT), js = plan === 'jib' ? jibShape(c, tws, b.tack, cond?.jib, b.aws / KT) : null;
  const em = shapeEfficiency(ms, targetShape('main', tws, awa)), ej = js ? shapeEfficiency(js, targetShape('jib', tws, awa)) : 1;
  b.shape = { main: ms, jib: js, eff: js ? SAILS.main.share * em + SAILS.jib.share * ej : em };
}

/** Move the lazy (windward) jib car one pin: fore–aft (+1 aft) or athwartships (+1 outboard). You can't move the loaded one. */
export function moveLazyCar(b: Boat, fore: number, ins: number): void {
  const lazy = b.ctl.car[b.tack];
  lazy.fore = clamp(lazy.fore + fore, 0, CAR_FORE_PINS - 1); lazy.ins = clamp(lazy.ins + ins, 0, CAR_IN_PINS - 1);
}

/** Apparent wind: wind over the water minus the boat's motion through it. aws in m/s, arel signed (+ from starboard). */
export function apparent(from: number, windKt: number, h: number, v: number): { aws: number; arel: number; awa: number } {
  const wv = V(from), u = V(h), ax = -wv.x * windKt * KT - u.x * v, ay = -wv.y * windKt * KT - u.y * v;
  const arel = wrap(brg(-ax, -ay) - h);
  return { aws: Math.hypot(ax, ay), arel, awa: Math.abs(arel) };
}

/** Heading a user tack/gybe aims for: the matching course on the other side of the wind. */
export function tackTarget(b: Boat): { dir: number; target: number } {
  const rel = b.rel, twa = b.twa, from = b.ww.from;
  // upwind: tack to the same angle on the other side, but at least close-hauled; downwind: gybe to the mirror angle
  if (twa < 100) return { dir: rel >= 0 ? 1 : -1, target: n360(from + (rel >= 0 ? 1 : -1) * Math.max(beatFor(b), Math.min(twa, 60))) };
  return { dir: rel >= 0 ? -1 : 1, target: n360(from + rel) };
}
