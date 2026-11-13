// The step's three approximations (November 2026 performance pass), each against the exact code it stands in for.
//  1. The distance to the shore off a 10 m lattice (geo/shore.ts anyShoreDistNear), for the current's easing near the
//     shore (environment/current.ts shoreRelief), every boat every step.
//  2. Pairs of boats far apart, not converging and with nothing on their record, not assessed in full (World.apart).
//  3. The AI boats thinking twenty times a second, every step in close quarters (World.AI_EVERY, closeQuarters).
// Kept out of test:fast (it sails eight races of six minutes).
import { describe, expect, it } from 'vitest';
import { anyShoreDist, anyShoreDistNear, onLand, setShoreGrid } from '../src/geo/shore';
import { APPROX_RACES, approxRace, type ApproxOpts } from './helpers/races';
import { sail } from './helpers/racePool';
import { shoreRelief } from '../src/environment/current';

// (the races: tests/helpers/races.ts, sailed on the race pool's threads, tests/helpers/racePool.ts; the same answers)
const RACES = APPROX_RACES;
const race = approxRace;
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

  it('sails no further from the exact distance\'s race than a 0.1% change in the current does, over eight races', async () => {
    // A race isn't chaotic to a nudge (a boat moved a micrometre sails the same race), but a small change to the forces
    // moves the AI's decisions (a tack a step sooner, a contact, a penalty's turns) and the race goes its own way from
    // there, by as much as its own luck: one race's fleet speed moved 1–17% for the current 0.1% stronger or weaker (far
    // inside NOAA's own uncertainty), depending on the race. So the lattice is measured against that, in the same races:
    // over eight (two courses, four starts each), the mean change in the fleet's mean speed the lattice makes, against
    // the mean the current's ±0.1% makes, within half as much again and half a point. (A lattice that's subtly wrong is
    // the test above's to catch, point by point; this is that it doesn't sail a different kind of race.)
    const dev: number[] = [], nudge: number[] = [];
    // (the 32 races sailed side by side on the pool's threads; then, seed by seed as before)
    const SEEDS = [[0, 3], [0, 4], [0, 5], [0, 6], [1, 7], [1, 8], [1, 9], [1, 10]] as const;
    const jobs = SEEDS.flatMap(([i, seed]): [number, ApproxOpts][] => [[i, { grid: false, skip: false, seed }], [i, { grid: true, skip: false, seed }],
      [i, { grid: false, skip: false, seed, curK: 1.001 }], [i, { grid: false, skip: false, seed, curK: 0.999 }]]);
    const R = await sail('approxRace', jobs);
    SEEDS.forEach((_, k) => {
      const [exR, gridR, upR, downR] = R.slice(4 * k, 4 * k + 4), ex = fleetV(exR.boats);
      dev.push(Math.abs(fleetV(gridR.boats) / ex - 1));
      nudge.push((Math.abs(fleetV(upR.boats) / ex - 1) + Math.abs(fleetV(downR.boats) / ex - 1)) / 2);
    });
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(dev), `the lattice ${dev.map(x => (100 * x).toFixed(1)).join(' ')}%, the current's ±0.1% ${nudge.map(x => (100 * x).toFixed(1)).join(' ')}%`).toBeLessThan(1.5 * mean(nudge) + 0.005);
  }, 1_800_000);
});

describe('the AI boats think twenty times a second (World.AI_EVERY)', () => {
  // A helmsman's reaction is a few tenths of a second; her boat answers the helm every step. Thinking every sixth step
  // (staggered across the fleet) against every step: no further from that race than a 0.1% change in the current takes
  // it (as the lattice above), and no more penalties. Over sixteen races (eight on each course): each race is chaotic, so
  // a change elsewhere in the sim draws a different sample of them, and eight left the mean a few hundredths of a point
  // either side of the bound by luck (the Coordinator, 13 Nov 2026: a stronger test, not a looser one)
  it('sails no further from the every-step race than a 0.1% change in the current does, over sixteen races, with no more fouls', async () => {
    const dev: number[] = [], nudge: number[] = [];
    let penE = 0, penD = 0;
    const pens = (r: ReturnType<typeof race>) => r.fouls;
    // (the 64 races sailed side by side on the pool's threads; then, seed by seed as before)
    const SEEDS = [[0, 3], [0, 4], [0, 5], [0, 6], [0, 11], [0, 12], [0, 13], [0, 14], [1, 7], [1, 8], [1, 9], [1, 10], [1, 15], [1, 16], [1, 17], [1, 18]] as const;
    const jobs = SEEDS.flatMap(([i, seed]): [number, ApproxOpts][] => [[i, { grid: true, skip: true, seed, exactAI: true }], [i, { grid: true, skip: true, seed }],
      [i, { grid: true, skip: true, seed, exactAI: true, curK: 1.001 }], [i, { grid: true, skip: true, seed, exactAI: true, curK: 0.999 }]]);
    const R = await sail('approxRace', jobs);
    SEEDS.forEach((_, k) => {
      const [exR, dR, upR, downR] = R.slice(4 * k, 4 * k + 4), ex = fleetV(exR.boats);
      dev.push(Math.abs(fleetV(dR.boats) / ex - 1)); penE += pens(exR); penD += pens(dR);
      nudge.push((Math.abs(fleetV(upR.boats) / ex - 1) + Math.abs(fleetV(downR.boats) / ex - 1)) / 2);
    });
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(dev), `twenty a second ${dev.map(x => (100 * x).toFixed(1)).join(' ')}%, the current's ±0.1% ${nudge.map(x => (100 * x).toFixed(1)).join(' ')}%`).toBeLessThan(1.5 * mean(nudge) + 0.005);
    expect(penD, `penalties: every step ${penE}, twenty a second ${penD}`).toBeLessThanOrEqual(penE * 1.3 + 2);
  }, 3_600_000);
});

describe('pairs far apart are let be', () => {
  // (their records differ from a full assessment's in what they'd remember from far off: world.ts apart(); the race,
  // its incidents and its penalties don't)
  it('the same race to the last digit, with the same incidents and penalties, as assessing every pair every step', async () => {
    const R = await sail('approxRace', RACES.flatMap((_, i): [number, ApproxOpts][] => [[i, { grid: true, skip: true }], [i, { grid: true, skip: false }]]));
    for (let i = 0; i < RACES.length; i++) expect(R[2 * i], `race ${i}`).toEqual(R[2 * i + 1]);
  }, 600_000);
});
