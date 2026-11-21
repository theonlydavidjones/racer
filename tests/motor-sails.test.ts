import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { KT } from '../src/core/math';
import { HULL } from '../src/boat/dynamics';

/**
 * w043, the owner: "motoring speed should account for sails being up." The outboard's thrust (boat/motor.ts, momentum
 * theory) enters the same surge equation as the sails' drive, the windage and the water's drag (physics.ts: motorForce
 * in surgeAccel), so she adds them; these hold that to the sum's physics, not to fixed speeds. The 3.5 hp at full
 * throttle, in 10 kt of westerly on flat water, her heading held (yaw left out: it's the surge being tested), steady over
 * the last 30 s of 2 minutes.
 * The bound for "about hull speed": 1.34 √L (L in feet; a Froude number of about 0.4), with L ORC's sailing length
 * (5.934 m): 5.91 kt. A displacement hull pushed by both goes a little past it and no further.
 */
const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 10, windDir: 270, windTurn: 0, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-11-14', current: 'slack', sea: 'flat' } as Settings;
function speed(twa: number, sails: boolean, motor: boolean): number {
  const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user, h = (w.wind.from + twa + 360) % 360;
  u.rig = sails ? { main: 1, jib: 1, mainUp: true, jibUp: true, mainTaut: 1, jibTaut: 1 } : { main: 0, jib: 0, mainUp: false, jibUp: false };
  u.v = 0; u.astern = 0; u.h = h;
  u.motor = { hp: 3.5, down: true, running: true, gear: motor ? 'F' : 'N', throttle: 1 };
  let sum = 0, n = 0;
  for (let i = 0; i < 60 * 120; i++) { u.turnTarget = null; u.steer = 0; u.tiller = 0; u.h = h; w.step(DT); if (i >= 60 * 90) { sum += u.v - (u.astern ?? 0); n++; } }
  return sum / n / KT;
}
const HULL_SPEED = 1.34 * Math.sqrt(HULL.length / 0.3048);

describe('motoring with the sails up', () => {
  it('on a reach the sails add to the motor: faster than either alone, short of their sum, about hull speed and no more', () => {
    const m = speed(90, false, true), s = speed(90, true, false), both = speed(90, true, true);
    expect(both).toBeGreaterThan(Math.max(m, s) + 0.3);
    expect(both).toBeLessThan(m + s - 2); // (the resistance climbs steeply toward hull speed: no sum of speeds)
    expect(both).toBeGreaterThan(0.95 * HULL_SPEED); expect(both).toBeLessThan(1.1 * HULL_SPEED);
  }, 300_000);
  it('close-hauled the sails add to the motor too', () => {
    const m = speed(45, false, true), s = speed(45, true, false), both = speed(45, true, true);
    expect(both).toBeGreaterThan(Math.max(m, s) + 0.5);
    expect(both).toBeLessThan(1.1 * HULL_SPEED);
  }, 300_000);
  it('head to wind the sails flog: slower than the motor alone with them down, the bare rig\'s windage slowing her less', () => {
    const m = speed(0, false, true), both = speed(0, true, true), reach = speed(90, false, true);
    expect(both).toBeLessThan(m - 0.2); // (the flogging cloth's windage against her)
    expect(both).toBeGreaterThan(0); // (the motor still drives her into it)
    expect(m).toBeLessThan(reach); // (even sails down, the rig's windage head to wind costs her a little)
  }, 300_000);
});
