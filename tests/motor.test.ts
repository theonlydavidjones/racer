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
  }, 60000);
  it('in reverse she goes astern, slower; in neutral or tilted up she just drifts', () => {
    const r = run({ gear: 'R' }, 40); expect(r.astern ?? 0).toBeGreaterThan(0.5); expect(r.v).toBe(0);
    expect((r.astern ?? 0) / KT).toBeLessThan(run({}, 40).v / KT);
    expect(run({ gear: 'N' }, 40).v).toBeLessThan(0.3); expect(run({ down: false }, 40).v).toBeLessThan(0.3);
  }, 60000);
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
  }, 60000);
  it('the 2.5 has no reverse gear: swivelled round, it pushes her astern', () => {
    const w = withMotor('sail', 2.5), u = w.user;
    u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; u.v = 0; // (stopped, sails down)
    w.motorTilt(); w.motorStart(); for (let i = 0; i < 60 * 5; i++) w.step(DT);
    w.motorGear('R'); expect(u.motor!.gear).toBe('N');
    w.motorSwivel(); expect(u.motor!.swivel).toBe(true); w.motorGear('F'); w.motorThrottle(0.6);
    for (let i = 0; i < 60 * 20; i++) w.step(DT);
    expect(u.astern ?? 0).toBeGreaterThan(0.5);
  }, 60000);
  it('before her preparatory signal she may motor out to the line; racing, it isn\'t hers to use (RRS 42.1): starting it asks first; told to, she retires, then it\'s hers', () => {
    const b = withMotor('race'); b.motorTilt();
    expect(b.racing(b.user)).toBe(false); expect(b.motorStart()).toBe('ok'); expect(b.user.retired).toBeFalsy(); // (not racing yet)
    const w = withMotor('race'), u = w.user;
    while (!w.racing(u)) w.step(DT); // (her preparatory signal)
    w.motorTilt();
    expect(w.motorStart()).toBe('racing'); expect(u.motor!.pulling).toBeUndefined(); expect(u.retired).toBeFalsy();
    expect(w.motorStart(true)).toBe('ok'); expect(u.retired).toBe(true); expect(u.motor!.pulling).toBeTruthy();
  }, 60000);
  it('in her slip with the motor running: lines in, and she backs out under power, clear of the docks', () => {
    const slip = slipsIn('west-harbor').find(s => s.kind === 'bow-in')!;
    const w = withMotor('sail', 3.5, slip.id), u = w.user;
    expect(u.docked).toBeTruthy(); expect(w.castOff()).toBe(false); // (not running yet)
    w.motorTilt(); w.motorStart(); for (let i = 0; i < 60 * 5; i++) w.step(DT);
    expect(w.castOff()).toBe(true); expect(u.docked).toBeUndefined();
    w.motorGear('R'); w.motorThrottle(0.6);
    const p0 = { x: u.x, y: u.y };
    for (let i = 0; i < 60 * 20; i++) { u.turnTarget = null; u.steer = 0; u.tiller = 0; w.step(DT); expect(hitsHarbor(u)).toBe(false); }
    expect(Math.hypot(u.x - p0.x, u.y - p0.y)).toBeGreaterThan(5); // (backed out of the slip)
  }, 60000);
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
  }, 60000);
});

describe('the outboard, as it\'s used', () => {
  it('at tick-over in gear she creeps along at a knot or so (coming into a slip)', () => {
    const v = run({ throttle: 0 }, 90).v / KT; expect(v).toBeGreaterThan(0.6); expect(v).toBeLessThan(2.2);
  }, 60000);
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
