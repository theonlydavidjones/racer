// The step's two approximations (November 2026 performance pass), each against the exact code it stands in for.
//  1. The distance to the shore off a 10 m lattice (geo/shore.ts anyShoreDistNear), for the current's easing near the
//     shore (environment/current.ts shoreRelief), every boat every step.
//  2. Pairs of boats far apart, not converging and with nothing on their record, not assessed in full (World.apart).
// Kept out of test:fast (it sails eight races of six minutes).
import { describe, expect, it } from 'vitest';
import ss10 from '../src/courses/data/seaweed-soup-2026-course10.json';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { anyShoreDist, anyShoreDistNear, onLand, setShoreGrid } from '../src/geo/shore';
import { shoreRelief } from '../src/environment/current';

const RACES = [
  [ss10, { tideDate: '2026-11-14', windKind: 'west', windKt: 22, current: 'real', opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2'], fleet: 7 }, 3],
  [ss2, { tideDate: '2026-11-14', windKind: 'west', windKt: 12, current: 'real', fleet: 5 }, 7]
] as const;
/** Six minutes of a race: each AI boat's mean speed after the gun, and where she is (the user's boat, unsailed, left out). */
function race(i: number, o: { grid: boolean; skip: boolean; curK?: number }) {
  const [c, s, seed] = RACES[i];
  setShoreGrid(o.grid);
  try {
    const w = new World(c as unknown as CourseFile, { ...DEFAULT_SETTINGS, ...s } as never, seed);
    w.exactPairs = !o.skip;
    if (o.curK) { const f = w.currentAt.bind(w); w.currentAt = p => { const v = f(p); return { x: v.x * o.curK!, y: v.y * o.curK! }; }; }
    const sum = w.boats.map(() => 0), incidents: string[] = []; let n = 0;
    while (w.t < 6 * 60) {
      w.step(DT); if (w.t > 0) { w.boats.forEach((b, k) => { sum[k] += b.v; }); n++; }
      for (const e of w.drainEvents()) if (e.type === 'incident') incidents.push(`${w.t.toFixed(3)} ${e.incident.rule} ${e.incident.fouler.id}`);
    }
    const boats = w.boats.filter(b => !b.isUser).map(b => ({ v: sum[w.boats.indexOf(b)] / n, x: b.x, y: b.y, h: b.h, leg: b.leg, penalties: b.penaltyTotal }));
    return { boats, incidents };
  } finally { setShoreGrid(true); }
}
const fleetV = (r: ReturnType<typeof race>['boats']) => r.reduce((a, b) => a + b.v, 0) / r.length;

describe('the shore distance off a 10 m lattice', () => {
  it('is within a few metres of the exact distance (0.2 m RMS over the water round the courses), and the current\'s easing within 1%', () => {
    let seed = 1, s2 = 0, n = 0, worst = 0, worstK = 0;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 4000; i++) {
      const p = { x: -4000 + 9000 * r(), y: -2500 + 6500 * r() };
      if (onLand(p)) continue;
      const e = Math.abs(anyShoreDistNear(p) - anyShoreDist(p)); s2 += e * e; n++; worst = Math.max(worst, e);
      setShoreGrid(false); const k0 = shoreRelief(p); setShoreGrid(true);
      worstK = Math.max(worstK, Math.abs(shoreRelief(p) - k0));
    }
    // (where two shores are equally near, the distance has a ridge the lattice cuts across: the worst of it; 4.1 m over
    // 12 000 points of the Bay when measured, November 2026)
    expect(Math.sqrt(s2 / n)).toBeLessThan(0.5);
    expect(worst).toBeLessThan(6);
    expect(worstK).toBeLessThan(0.013); // (0.75 / 350 per metre: 6 m is 1.3% of the current)
  }, 120_000);

  it('sails the same race as the exact distance, as near as any small change sails it', () => {
    // A race isn't chaotic to a nudge (a boat moved a micrometre sails the same race), but a small change to the forces
    // moves the AI's decisions (a tack a step sooner) and the race goes its own way from there: the current 0.1% stronger
    // everywhere (far inside NOAA's own uncertainty) moved the fleet's mean speed 1.1–2.6% and boats up to 230 m after
    // eight minutes, as much as the lattice does (1.3–1.7%, 120 m). So: the lattice's race against the exact one, within
    // what such a change makes of it (six minutes here; the fleet's speed within 4%, past the 2.6% that change made).
    // (These bounds can't catch a lattice that's subtly wrong: the test above, point by point, is what does.)
    for (let i = 0; i < RACES.length; i++) {
      const ex = race(i, { grid: false, skip: false }).boats, ap = race(i, { grid: true, skip: false }).boats;
      expect(Math.abs(fleetV(ap) / fleetV(ex) - 1), `race ${i}: the fleet's mean speed`).toBeLessThan(0.04);
      // (boat by boat, the median: one boat whose tack went the other way is the race's own sensitivity, not the lattice;
      // a 0.1% stronger current moved single boats' mean speed up to 8%, a 1% one up to 25%)
      const med = (xs: number[]) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
      expect(med(ex.map((b, k) => Math.abs(ap[k].v / b.v - 1))), `race ${i}: a boat's mean speed, the median`).toBeLessThan(0.08);
      expect(med(ex.map((b, k) => Math.hypot(ap[k].x - b.x, ap[k].y - b.y))), `race ${i}: where a boat is, the median`).toBeLessThan(250);
      ex.forEach((b, k) => expect(Math.abs(ap[k].leg - b.leg), `race ${i}, boat ${k}: her leg`).toBeLessThanOrEqual(1));
    }
  }, 600_000);
});

describe('pairs far apart are let be', () => {
  // (their records differ from a full assessment's in what they'd remember from far off: world.ts apart(); the race,
  // its incidents and its penalties don't)
  it('the same race to the last digit, with the same incidents and penalties, as assessing every pair every step', () => {
    for (let i = 0; i < RACES.length; i++) expect(race(i, { grid: true, skip: true }), `race ${i}`).toEqual(race(i, { grid: true, skip: false }));
  }, 600_000);
});
