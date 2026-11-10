import { KT, V, brg, clamp, wrap, n360, D2R } from '../core/math';
import { onLand } from '../geo/shore';
import type { Emit } from '../sim/events';
import { bow, type Boat } from './boat';
import { HANDLING, airDrag, flogAmount, luffDriveFactor, maxTurnRate, surgeAccel } from './dynamics';
import { NO_GO, beatAngle, polar, type SailPlan } from './polar';
import { SAILS, optimalSheet, sailTrim, trimDrive } from './trim';
import { CAR_FORE_PINS, CAR_IN_PINS, CONTROL_RATE, boomAngle, crewSolve, jibAngle, jibShape, jibsheetFor, mainShape, mainsheetFor, shapeEfficiency, targetShape, winchFactor, type Controls } from './controls';

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
  if (b.poleWant && (b.pole === 'down' || b.pole === 'stowing')) { b.pole = 'setting'; b.poleT = POLE.set; b.poleTack = b.tack; }
  else if (!b.poleWant && (b.pole === 'set' || b.pole === 'setting')) { b.pole = 'stowing'; b.poleT = POLE.stow; }
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
  let rate: number;
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
  } else if (b.penalty > 0 && !b.ai?.clearing) {
    // penalty turns: the crew backs the sails to spin the boat even when slow
    rate = Math.max(maxRate, PENALTY_TURN_RATE);
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
  }
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
  let target = polar(ww.kt, twa, plan);
  if (b.luff) target *= luffDriveFactor(twa);
  // Drive scales with trim efficiency; speed with roughly the square root of drive.
  else target *= Math.sqrt(trimDrive(b.trim.main, b.trim.jib) * b.shape.eff); // sheet angles, then the sails' shape
  if (b.penalty > 0) target *= 0.7;
  const beat = beatAngle(ww.kt);
  const a = surgeAccel(b.v, target, airDrag(ap.aws, ap.awa, flogAmount(twa, beat, NO_GO, b.luff)));
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
  // heel: less when the sails are luffing, a little more when they're over-trimmed and stalled
  const trimHeel = b.luff ? 0.25 : 0.4 + 0.6 * trimDrive(b.trim.main, b.trim.jib) + (b.trim.main.flow === 'stalled' ? 0.15 * b.trim.main.amount : 0);
  const heelT = trimHeel * Math.min(24, ww.kt * 1.25) * (twa < 35 ? 0.2 : twa < 100 ? 1 : 0.45) * (rel >= 0 ? 1 : -1);
  b.heel += (heelT - b.heel) * Math.min(1, dt * 1.5);
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
  const move = (k: Ctl, to: number, rate = CONTROL_RATE[k]) => { const d = to - c[k]; c[k] += Math.sign(d) * Math.min(Math.abs(d), rate * dt); };
  const hand = (k: Ctl, rate = CONTROL_RATE[k]) => { const cmd = b.ctlCmd[k] ?? 0; c[k] = clamp(c[k] + cmd * rate * dt, k === 'traveller' ? -1 : 0, 1); };
  const wantMain = optimalSheet('main', b.awaSlow), wantJib = optimalSheet('jib', b.awaSlow);
  // the crew works out its settings about once a second, for the conditions as they see them
  if (!b.crewPlan || !(b.crewPlanT! > 0)) { b.crewPlan = crewSolve(tws, b.awaSlow, b.tack, wantMain, wantJib, b.crewPlan ?? undefined); b.crewPlanT = 1; }
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
    const j = b.ctlCmd.jibsheet ?? 0; hand('jibsheet', CONTROL_RATE.jibsheet * winchFactor(tws, j < 0));
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
  const ms = mainShape(c, tws), js = plan === 'jib' ? jibShape(c, tws, b.tack) : null;
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
  if (twa < 100) return { dir: rel >= 0 ? 1 : -1, target: n360(from + (rel >= 0 ? 1 : -1) * Math.max(beatAngle(b.ww.kt), Math.min(twa, 60))) };
  return { dir: rel >= 0 ? -1 : 1, target: n360(from + rel) };
}
