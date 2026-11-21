// r239, from v214's physics review: the berth her lines are readied for. (a) Her own slip can be had from 50 m off
// (HOME_REACH), so G in her own fairway beside a nearer empty slip took that neighbor; her own comes first in reach.
// (b) Lines readied by one berth and brought alongside another kept the first, so she lay to her lines by a dock that
// wasn't her berth's and never read "In her berth"; the berth is the one she's at as the hand steps off.
import { describe, expect, it } from 'vitest';
import { slipById, slipTaken, slipsIn, type Slip } from '../src/geo/marina';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';

const home = slipById('gashouse-cove:572')!, dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
function cruise(): World {
  const boat = { ...DEFAULT_BOAT, marina: home.marina, slip: home.id };
  const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 4, windDir: 270, mode: 'sail', sailFrom: 'cityfront', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
  const w = new World(COURSES[0], S, 1, { freeSail: true }); for (let i = 0; i < 30; i++) w.step(DT);
  (w as unknown as { running: boolean }).running = true; return w;
}
const lie = (w: World, s: Slip, v = 0) => { Object.assign(w.user, { docked: undefined, handled: undefined, x: s.p.x, y: s.p.y, h: s.heading, v, vx: 0, vy: 0, turnRate: 0 }); w.drainEvents(); };
const free = slipsIn(home.marina).filter(s => s.id !== home.id && !slipTaken(s));

describe('the berth her lines are readied for (r239)', () => {
  it('(a) in her own fairway, by a nearer empty slip: her own slip', () => {
    const n = free.filter(s => dist(s.p, home.p) > 6 && dist(s.p, home.p) < 40).sort((a, b) => dist(a.p, home.p) - dist(b.p, home.p))[0];
    expect(n, 'an empty slip near hers').toBeTruthy();
    const w = cruise(); lie(w, n);
    expect(w.linesReady()).toBe(true);
    expect(w.user.mooring!.berth).toBe(home.id);
  });
  it('(b) readied by one berth, brought alongside another: the one she\'s at as the hand steps off', () => {
    const far = free.filter(s => dist(s.p, home.p) > HOME_FAR).sort((a, b) => dist(a.p, home.p) - dist(b.p, home.p));
    const a = far[0], b = far.find(s => dist(s.p, a.p) > 40)!;
    expect(a && b, 'two empty slips well apart, away from hers').toBeTruthy();
    const w = cruise(); lie(w, a);
    expect(w.linesReady()).toBe(true); expect(w.user.mooring!.berth).toBe(a.id);
    lie(w, b); // (brought in to another)
    for (let i = 0; i < 60 * 20 && w.user.mooring?.phase === 'ready'; i++) w.step(DT);
    expect(w.user.mooring?.phase, 'the hand stepped off').not.toBe('ready');
    expect(w.user.mooring!.berth).toBe(b.id);
  });
});
const HOME_FAR = 80; // (well beyond HOME_REACH, 50 m: her own slip out of reach)
