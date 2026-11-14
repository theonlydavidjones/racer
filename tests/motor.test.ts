import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { KT } from '../src/core/math';
import { OUTBOARDS, pitchSpeed, staticThrust, thrust, type MotorState } from '../src/boat/motor';

/** The outboard (boat/motor.ts): its thrust from momentum theory, and her under power with her sails down. */
const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 4, windTurn: 0, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-11-14', current: 'slack', sea: 'flat' } as Settings;
const run = (m: Partial<MotorState>, secs: number) => {
  const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
  u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; u.v = 0; u.astern = 0;
  u.motor = { hp: 3.5, down: true, running: true, gear: 'F', throttle: 1, ...m };
  for (let i = 0; i < 60 * secs; i++) { u.turnTarget = null; u.steer = 0; u.tiller = 0; w.step(DT); }
  return u;
};
describe('the outboard', () => {
  it('thrust: about 400 N at rest for the 3.5 at full throttle, falling to nothing at its pitch speed (about 15 kt)', () => {
    const o = OUTBOARDS[3.5], T0 = staticThrust(o);
    expect(T0).toBeGreaterThan(330); expect(T0).toBeLessThan(470);
    expect(pitchSpeed(o) / KT).toBeGreaterThan(13); expect(pitchSpeed(o) / KT).toBeLessThan(17);
    const m: MotorState = { hp: 3.5, down: true, running: true, gear: 'F', throttle: 1 };
    expect(thrust(m, 0)).toBeCloseTo(T0, 5); expect(thrust(m, pitchSpeed(o))).toBe(0); expect(thrust(m, pitchSpeed(o) / 2)).toBeCloseTo(T0 / 2, 5);
    expect(thrust({ ...m, gear: 'R' }, 0)).toBeLessThan(0); expect(-thrust({ ...m, gear: 'R' }, 0)).toBeLessThan(T0 * 0.6); // (astern, weaker)
    expect(thrust({ ...m, gear: 'N' }, 0)).toBe(0); expect(thrust({ ...m, down: false }, 0)).toBe(0); expect(thrust({ ...m, running: false }, 0)).toBe(0);
    expect(staticThrust(OUTBOARDS[6])).toBeGreaterThan(T0); expect(staticThrust(OUTBOARDS[2.5])).toBeLessThan(T0);
  });
  it('sails down, the 3.5 at full throttle motors her at about 4–5 kt; the 2.5 a little less, the 6 a little more', () => {
    const v = (hp: 2.5 | 3.5 | 6) => run({ hp }, 90).v / KT;
    // (pinned to the derived figure, 4.6 kt: the thrust from momentum theory against the sim's own hull resistance; a change to
    // either shows here)
    const v35 = v(3.5); expect(v35).toBeGreaterThan(4.4); expect(v35).toBeLessThan(4.85);
    expect(v(2.5)).toBeLessThan(v35); expect(v(6)).toBeGreaterThan(v35);
  }, 180_000);
  it('in reverse she goes astern, slower; in neutral or tilted up she just drifts', () => {
    const r = run({ gear: 'R' }, 40); expect(r.astern ?? 0).toBeGreaterThan(0.5); expect(r.v).toBe(0);
    expect((r.astern ?? 0) / KT).toBeLessThan(run({}, 40).v / KT);
    expect(run({ gear: 'N' }, 40).v).toBeLessThan(0.3); expect(run({ down: false }, 40).v).toBeLessThan(0.3);
  }, 180_000);
});

import { DEFAULT_BOAT } from '../src/boat/spec';
import { hitsHarbor, slipsIn } from '../src/geo/marina';
const withMotor = (mode: 'sail' | 'race', hp: 2.5 | 3.5 | 6 = 3.5, slip?: string) => {
  const boat = { ...DEFAULT_BOAT, perf: { ...DEFAULT_BOAT.perf, outboard: 'bracket' as const, outboardHp: hp }, ...(slip ? { marina: slip.split(':')[0], slip } : {}) };
  const s = { ...S, mode, boats: [boat], boat, boatId: boat.id, sailFrom: slip ? 'slip' : 'cityfront', fleet: mode === 'race' ? 1 : 0, opponents: mode === 'race' ? DEFAULT_SETTINGS.opponents.slice(0, 1) : [] } as Settings;
  return mode === 'race' ? new World(COURSES[0], s, 1) : new World(COURSES[0], s, 1, { freeSail: true });
};
describe('her outboard, aboard', () => {
  it('on the bracket she has it, tilted up and stopped; tilt it down, start it in neutral (a pull or two), into gear', () => {
    const w = withMotor('sail'), u = w.user;
    expect(u.motor).toMatchObject({ hp: 3.5, down: false, running: false, gear: 'N' });
    expect(w.motorStart()).toBe('tilt');
    w.motorTilt(); expect(u.motor!.down).toBe(true);
    w.motorGear('F'); expect(w.motorStart()).toBe('gear'); w.motorGear('N');
    expect(w.motorStart()).toBe('ok');
    for (let i = 0; i < 60 * 5 && !u.motor!.running; i++) w.step(DT);
    expect(u.motor!.running).toBe(true); expect(u.motor!.pulling).toBeUndefined();
    w.motorGear('F'); w.motorThrottle(1);
    for (let i = 0; i < 60 * 30; i++) w.step(DT);
    expect(u.v / KT).toBeGreaterThan(3);
    w.motorTilt(); expect(u.motor!.running).toBe(false); expect(u.motor!.down).toBe(false); // (tilted up: stopped first)
  }, 180_000);
  it('the 2.5 has no reverse gear: swivelled round, it pushes her astern', () => {
    const w = withMotor('sail', 2.5), u = w.user;
    u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; u.v = 0; // (stopped, sails down)
    w.motorTilt(); w.motorStart(); for (let i = 0; i < 60 * 5; i++) w.step(DT);
    w.motorGear('R'); expect(u.motor!.gear).toBe('N');
    w.motorSwivel(); expect(u.motor!.swivel).toBe(true); w.motorGear('F'); w.motorThrottle(0.6);
    for (let i = 0; i < 60 * 20; i++) w.step(DT);
    expect(u.astern ?? 0).toBeGreaterThan(0.5);
  }, 180_000);
  it('before her preparatory signal she may motor out to the line; racing, it isn\'t hers to use (RRS 42.1): starting it asks first; told to, she retires, then it\'s hers', () => {
    const b = withMotor('race'); b.motorTilt();
    expect(b.racing(b.user)).toBe(false); expect(b.motorStart()).toBe('ok'); expect(b.user.retired).toBeFalsy(); // (not racing yet)
    const w = withMotor('race'), u = w.user;
    while (!w.racing(u)) w.step(DT); // (her preparatory signal)
    w.motorTilt();
    expect(w.motorStart()).toBe('racing'); expect(u.motor!.pulling).toBeUndefined(); expect(u.retired).toBeFalsy();
    expect(w.motorStart(true)).toBe('ok'); expect(u.retired).toBe(true); expect(u.motor!.pulling).toBeTruthy();
  }, 180_000);
  it('in her slip with the motor running: lines in, and she backs out under power, clear of the docks', () => {
    const slip = slipsIn('west-harbor').find(s => s.kind === 'bow-in')!;
    const w = withMotor('sail', 3.5, slip.id), u = w.user;
    expect(u.docked).toBeTruthy(); expect(w.castOff()).toBe(false); // (not running yet)
    w.motorTilt(); w.motorStart(); for (let i = 0; i < 60 * 5; i++) w.step(DT);
    expect(w.castOff()).toBe(true); expect(u.docked).toBeUndefined();
    // (the 3.5 has no reverse gear either: asked for R she stays in neutral; swiveled round, ahead pushes her astern)
    w.motorGear('R'); expect(u.motor!.gear).toBe('N');
    w.motorSwivel(); w.motorGear('F'); w.motorThrottle(0.6);
    const p0 = { x: u.x, y: u.y };
    for (let i = 0; i < 60 * 20; i++) { u.turnTarget = null; u.steer = 0; u.tiller = 0; w.step(DT); expect(hitsHarbor(u)).toBe(false); }
    expect(Math.hypot(u.x - p0.x, u.y - p0.y)).toBeGreaterThan(5); // (backed out of the slip)
  }, 180_000);
});

import { engage } from '../src/boat/autopilot';
describe('the tiller pilot under power', () => {
  it('Nav motors her straight at her destination, upwind too, where sailing she\'d tack', () => {
    const w = withMotor('sail'), u = w.user;
    u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false };
    w.motorTilt(); w.motorStart(); for (let i = 0; i < 60 * 5; i++) w.step(DT);
    w.motorGear('F'); w.motorThrottle(1); for (let i = 0; i < 60 * 10; i++) w.step(DT);
    // a destination straight upwind, 1 km off
    const from = w.windHere(u, u).from * Math.PI / 180, to = { x: u.x + Math.sin(from) * 1000, y: u.y + Math.cos(from) * 1000 };
    w.setDest(to, 'upwind');
    engage(u, w.pilot, 'nav');
    for (let i = 0; i < 60 * 60; i++) w.step(DT);
    const b = (Math.atan2(to.x - u.x, to.y - u.y) * 180 / Math.PI + 360) % 360;
    expect(Math.abs(((u.h - b + 540) % 360) - 180)).toBeLessThan(15); // (pointed at it, dead to windward)
    expect(u.v / KT).toBeGreaterThan(2.5);
  }, 180_000);
});

describe('the outboard, as it\'s used', () => {
  it('at tick-over in gear she creeps along at a knot or so (coming into a slip)', () => {
    const v = run({ throttle: 0 }, 90).v / KT; expect(v).toBeGreaterThan(0.6); expect(v).toBeLessThan(2.2);
  }, 180_000);
  it('the first pull doesn\'t always catch: race to race, about one start in four needs a second', () => {
    let second = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const boat = { ...DEFAULT_BOAT, perf: { ...DEFAULT_BOAT.perf, outboard: 'bracket' as const } };
      const w = new World(COURSES[0], { ...S, boats: [boat], boat, boatId: boat.id } as Settings, seed, { freeSail: true });
      w.motorTilt(); w.motorStart(); if (!w.user.motor!.pulling!.catches) second++;
    }
    expect(second).toBeGreaterThan(3); expect(second).toBeLessThan(20);
  });
});

import { MOTOR_SHIP_S, MOTOR_STOW_S } from '../src/boat/motor';
import { applyCommand } from '../src/sim/commands';
describe('Stowing it below and shipping it again (the owner: off the sliding bracket into the lazarette)', () => {
  const stowedSpec = (mode: 'sail' | 'race') => {
    const boat = { ...DEFAULT_BOAT, perf: { ...DEFAULT_BOAT.perf, outboard: 'stowed' as const, outboardHp: 3.5 as const } };
    const s = { ...S, mode, boats: [boat], boat, boatId: boat.id, fleet: mode === 'race' ? 1 : 0, opponents: mode === 'race' ? DEFAULT_SETTINGS.opponents.slice(0, 1) : [] } as Settings;
    return mode === 'race' ? new World(COURSES[0], s, 1) : new World(COURSES[0], s, 1, { freeSail: true });
  };
  it('only stopped and tilted up: running or down, it stays on the bracket, and the crew say why', () => {
    const w = withMotor('sail'), m = w.user.motor!;
    w.motorTilt(); applyCommand(w, { k: 'motor', op: 'stow' });
    expect(m.shifting ?? null).toBeNull(); expect(m.stowed ?? false).toBe(false);
    w.motorStart(); for (let i = 0; i < 60 * 5; i++) w.step(DT); expect(m.running).toBe(true);
    applyCommand(w, { k: 'motor', op: 'stow' }); expect(m.shifting ?? null).toBeNull();
    const msgs = w.drainEvents().filter(e => e.type === 'toast').map(e => (e as { msg: string }).msg);
    expect(msgs.some(t => /Tilt it up first/.test(t))).toBe(true); expect(msgs.some(t => /Stop it first/.test(t))).toBe(true);
  });
  it('stowed: the crew take it off in about 20 s (an estimate); stowed, it can\'t be tilted, started or put in gear; shipped again in about 25 s, tilted up', () => {
    const w = withMotor('sail'), m = w.user.motor!;
    applyCommand(w, { k: 'motor', op: 'stow' });
    expect(m.shifting?.to).toBe('stowed'); expect(m.down).toBe(false); expect(m.running).toBe(false);
    const of = m.shifting!.of; expect(of).toBeGreaterThanOrEqual(MOTOR_STOW_S); expect(of).toBeLessThan(MOTOR_STOW_S / 0.3 + 1);
    for (let i = 0; i < 60 * (of - 1); i++) w.step(DT); expect(m.stowed ?? false).toBe(false);
    for (let i = 0; i < 60 * 2; i++) w.step(DT);
    expect(m.stowed).toBe(true); expect(m.shifting ?? null).toBeNull();
    w.motorTilt(); expect(m.down).toBe(false);
    expect(w.motorStart()).toBe('tilt'); expect(m.pulling ?? null).toBeNull();
    w.motorGear('F'); w.motorThrottle(1); expect(m.gear).toBe('N'); expect(m.throttle).toBe(0);
    applyCommand(w, { k: 'motor', op: 'stow' }); expect(m.shifting?.to).toBe('bracket');
    const of2 = m.shifting!.of; expect(of2).toBeGreaterThanOrEqual(MOTOR_SHIP_S);
    for (let i = 0; i < 60 * (of2 + 1); i++) w.step(DT);
    expect(m.stowed).toBe(false); expect(m.down).toBe(false);
    w.motorTilt(); expect(m.down).toBe(true);
  }, 60_000);
  it('its weight goes with it: stowed, the same weight aboard but further forward and off the height of the bracket; shipped again, as before', () => {
    const w = withMotor('sail'), u = w.user, m = u.motor!, on = u.cond!;
    const shift = () => { applyCommand(w, { k: 'motor', op: 'stow' }); const of = m.shifting!.of; for (let i = 0; i < 60 * (of + 1); i++) w.step(DT); };
    expect(on.rightingDelta(20)).toBeLessThan(0); // (on the bracket it's weight up at deck level)
    shift(); expect(m.stowed).toBe(true); const below = u.cond!;
    expect(below.extraKg).toBe(on.extraKg);
    expect(Math.abs(below.extraMoment)).toBeLessThan(Math.abs(on.extraMoment)); expect(below.extraMoment).toBeLessThan(0); // (still aft of her middle, less far)
    expect(below.rightingDelta(20)).toBeGreaterThan(on.rightingDelta(20)); // (and no longer up on the bracket)
    shift(); expect(m.stowed).toBe(false);
    expect(u.cond!.extraMoment).toBeCloseTo(on.extraMoment, 9); expect(u.cond!.rightingDelta(20)).toBeCloseTo(on.rightingDelta(20), 9);
  }, 60_000);

  it('stowed below in her setup: cruising, it\'s aboard to ship; racing, it stays below with no motor to work', () => {
    const c = stowedSpec('sail'); expect(c.user.motor).toMatchObject({ stowed: true, down: false, running: false });
    expect(stowedSpec('race').user.motor ?? null).toBeNull();
  });
});
