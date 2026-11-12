import { describe, expect, it } from 'vitest';
import { slipsIn } from '../src/geo/marina';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { engage } from '../src/boat/autopilot';

/** Home: her home slip becomes where she's going (the navigator's plan, the tiller pilot); racing, she retires first. */
const slip = slipsIn('west-harbor').find(s => s.kind === 'bow-in')!;
const boat = { ...DEFAULT_BOAT, marina: slip.marina, slip: slip.id };
const cruise = (withSlip = true) => {
  const b = withSlip ? boat : { ...DEFAULT_BOAT, slip: undefined, marina: undefined };
  const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'cityfront', sailTo: 'alcatraz', boats: [b], boat: b, boatId: b.id, tideDate: '2026-11-14', current: 'slack' };
  return new World(COURSES[0], S, 1, { freeSail: true });
};
const race = () => {
  // (one opponent: the start sequence and half a minute's racing is a few minutes of every boat's physics, slow on a busy machine)
  const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'race', raceFrom: 'water', boats: [boat], boat, boatId: boat.id, fleet: 1, opponents: DEFAULT_SETTINGS.opponents.slice(0, 1), tideDate: '2026-11-14', current: 'slack' };
  return new World(COURSES[0], S, 1);
};

describe('Home: send her back to her home slip', () => {
  it('cruising: her slip becomes the destination, and the pilot (if it\'s on) steers for it', () => {
    const w = cruise(), u = w.user;
    for (let i = 0; i < 60 * 10; i++) w.step(DT);
    u.v = 2.5; engage(u, w.pilot, 'auto');
    expect(w.dest?.name).not.toMatch(/slip/i);
    expect(w.sendHome()).toBe(true);
    expect(w.dest?.key).toBe('slip'); expect(w.dest!.p).toEqual(slip.p); expect(w.arrivedT).toBeNull();
    expect(w.pilot.mode).toBe('nav'); expect(w.nextMark(u)).toBe(w.dest);
    // the pilot turns her toward home
    for (let i = 0; i < 60 * 30; i++) w.step(DT);
    const b = (Math.atan2(slip.p.x - u.x, slip.p.y - u.y) * 180 / Math.PI + 360) % 360;
    expect(u.pilotSteers).toBe(true); expect(Math.abs(((w.pilot.navH - b + 540) % 360) - 180)).toBeLessThan(60); // (on a beat it tacks on the laylines)
  });
  it('no home slip: nothing changes (the button says to give her one in the Fleet)', () => {
    const w = cruise(false), d = w.dest;
    expect(w.homeSlip).toBeNull(); expect(w.sendHome()).toBe(false); expect(w.dest).toBe(d);
  });
  it('racing, before she finishes: retired (RET), no longer racing, and heading home; the pilot is hers again', () => {
    const w = race(), u = w.user;
    while (w.t < 30) w.step(DT); // (the race on: 30 s after the start)
    expect(w.cruising).toBe(false); expect(w.nextMark(u)).toBe(w.C.marks[u.leg]);
    expect(w.sendHome()).toBe(true);
    expect(u.retired).toBe(true); expect(w.cruising).toBe(true);
    expect(w.dest?.key).toBe('slip'); expect(w.nextMark(u)).toBe(w.dest);
    expect(w.touchableMarks(u)).toEqual([]); // (no longer racing: rule 31 is for boats racing)
    engage(u, w.pilot, 'nav'); u.v = 2.5;
    for (let i = 0; i < 60 * 5; i++) w.step(DT);
    expect(u.pilotSteers).toBe(true); expect(u.finished).toBe(false); expect(w.userFinishT).toBeNull();
    // the rest of the fleet races on
    expect(w.boats.slice(1).every(b => !b.retired)).toBe(true);
    // a second press doesn't retire her twice, just points her home again
    expect(w.sendHome()).toBe(true); expect(u.retired).toBe(true);
  }, 30000);
  it('retired, she\'s out of the race\'s bookkeeping: sailing past her slip on the last leg is no rounding, and crossing the line no finish', () => {
    const w = race(), u = w.user, n = w.C.marks.length;
    while (w.t < 30) w.step(DT);
    u.leg = n; u.started = true; // (on the leg to the finish)
    w.sendHome();
    // sail her round her slip (her destination, a mark to the sim) and across the finishing line: nothing happens
    const ring = (c: { x: number; y: number }, r: number) => { for (const dir of [1, -1]) for (let k = 0; k <= 72; k++) { const a = dir * k * 5 * Math.PI / 180; u.x = c.x + r * Math.sin(a); u.y = c.y + r * Math.cos(a); w.step(DT); } }; // (round it both ways)
    expect(() => ring(w.dest!.p, 30)).not.toThrow();
    const mid = { x: (w.C.pin.x + w.C.committee.x) / 2, y: (w.C.pin.y + w.C.committee.y) / 2 };
    expect(() => ring(mid, 15)).not.toThrow();
    expect(u.leg).toBe(n); expect(u.finished).toBe(false); expect(u.penalty).toBe(0); expect(w.userFinishT).toBeNull();
  }, 30000);
  it('retired before the start: no start, no recall, no flag penalty for her', () => {
    const w = race(), u = w.user;
    while (w.t < -20) w.step(DT);
    w.sendHome(); expect(u.retired).toBe(true);
    const mid = { x: (w.C.pin.x + w.C.committee.x) / 2, y: (w.C.pin.y + w.C.committee.y) / 2 }, ax = w.C.committee.x - w.C.pin.x, ay = w.C.committee.y - w.C.pin.y;
    while (w.t < 5) { // (held just over the line at the gun)
      for (const s of [1, -1]) { u.x = mid.x - ay / Math.hypot(ax, ay) * 5 * s; u.y = mid.y + ax / Math.hypot(ax, ay) * 5 * s; if (w.lineD({ x: u.x, y: u.y }) > 0) break; }
      w.step(DT);
    }
    expect(u.ocs).toBe(false); expect(u.started).toBe(false); expect(u.scoring).toBeFalsy(); expect(w.startReport).toBeFalsy();
  }, 30000);
  it('racing, after she\'s finished: just home (she\'s already finished, not retired)', () => {
    const w = race(), u = w.user;
    u.finished = true; u.finishT = 100;
    expect(w.sendHome()).toBe(true); expect(u.retired).toBeFalsy(); expect(w.dest?.key).toBe('slip');
  });
});
