// The step's three approximations (November 2026 performance pass), each against the exact code it stands in for.
//  1. The distance to the shore off a 10 m lattice (geo/shore.ts anyShoreDistNear), for the current's easing near the
//     shore (environment/current.ts shoreRelief), every boat every step.
//  2. Pairs of boats far apart, not converging and with nothing on their record, not assessed in full (World.apart).
//  3. The AI boats thinking twenty times a second, every step in close quarters (World.AI_EVERY, closeQuarters).
// Kept out of test:fast (it sails races of six minutes: 128 for the AI's).
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
  }, 180_000);

  it('sails no further from the exact distance\'s race than a 0.1% change in the current does, over 24 races', async () => {
    // A race isn't chaotic to a nudge (a boat moved a micrometre sails the same race), but a small change to the forces
    // moves the AI's decisions (a tack a step sooner, a contact, a penalty's turns) and the race goes its own way from
    // there, by as much as its own luck: one race's fleet speed moved 1–17% for the current 0.1% stronger or weaker (far
    // inside NOAA's own uncertainty), depending on the race. So the lattice is measured against that, in the same races:
    // over eight (two courses, four starts each), the mean change in the fleet's mean speed the lattice makes, against
    // the mean the current's ±0.1% makes, within half as much again and half a point. (A lattice that's subtly wrong is
    // the test above's to catch, point by point; this is that it doesn't sail a different kind of race.)
    const dev: number[] = [], nudge: number[] = [];
    // (the 96 races sailed side by side on the pool's threads; then, seed by seed as before)
    const SEEDS = [[0, 3], [0, 4], [0, 5], [0, 6], [1, 7], [1, 8], [1, 9], [1, 10], [0, 11], [0, 12], [0, 13], [0, 14], [1, 15], [1, 16],
      [1, 17], [1, 18], [0, 19], [0, 20], [0, 21], [0, 22], [1, 23], [1, 24], [1, 25], [1, 26]] as const;
    // (24 races, not 8: a race's change is heavy-tailed, about 2% sd, and over 8 the bound sat ~1.4 sd above an honest
    // lattice, a chance fail about 1 run in 12 whenever the fleet's paths reshuffled; over 24 it's ~2.4 sd, about 1%.
    // The bound's formula is unchanged. Capacity, 19 Nov 2026)
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
  // either side of the bound by luck (the Coordinator, 13 Nov 2026: a stronger test, not a looser one).
  //
  // The fouls, over 48 races (the sixteen and 32 more, alternating courses), as a paired test. Each seed sails the same
  // race both ways, so the difference per seed, twenty a second minus every step, carries the effect without most of the
  // race-to-race scatter. Measured (Deep Physics, 13 Nov 2026, 64 seeds outside the test's on main and on a branch):
  // about 2 fouls a race every step, the per-seed difference's standard deviation 1.4–1.6, its mean +0.13 and −0.34; the
  // old bound on two sixteen-race totals (20 Hz ≤ 1.3 × every step + 2) had a margin of about 10 against a spread of
  // about ±7, and failed about one run in ten with no real effect. Now: fail when the mean difference is above its
  // one-sided 99% bound under no effect, t(0.99, 47 df) = 2.408 standard errors (the sample's own; since 20 Nov 2026
  // over 96 seeds, t(0.99, 95 df) = 2.366). Resampling those 64
  // measured pairs: with no effect it fails about one run in a hundred (the old test, one in twenty); a real rise of half
  // again in the fouls (+1 a race) it catches 99 times in 100 (the old, 73); of a third (+0.6 a race), 65 (the old, 38).
  it('sails no further from the every-step race than a 0.1% change in the current does, over 48 races, with no more fouls over 96', async () => {
    const dev: number[] = [], nudge: number[] = [];
    let penE = 0, penD = 0;
    const pens = (r: ReturnType<typeof race>) => r.fouls;
    // (the 192 races sailed side by side on the pool's threads; then, seed by seed as before)
    const SEEDS = [[0, 3], [0, 4], [0, 5], [0, 6], [0, 11], [0, 12], [0, 13], [0, 14], [1, 7], [1, 8], [1, 9], [1, 10], [1, 15], [1, 16], [1, 17], [1, 18]] as const;
    const jobs = SEEDS.flatMap(([i, seed]): [number, ApproxOpts][] => [[i, { grid: true, skip: true, seed, exactAI: true }], [i, { grid: true, skip: true, seed }],
      [i, { grid: true, skip: true, seed, exactAI: true, curK: 1.001 }], [i, { grid: true, skip: true, seed, exactAI: true, curK: 0.999 }]]);
    // (the fouls only: 32 more seeds, each sailed both ways; seeds 19–50, the courses in turn)
    const MORE = Array.from({ length: 32 }, (_, k) => [k % 2, 19 + k] as const);
    // (and, since 15 Nov 2026, the current's yardstick for those 32 as well, so the deviation is taken over all 48 seeds,
    // fixed from now on (3–18 and 19–50, as written here): a failure is read against this same set, never one chosen
    // again. Why: over the sixteen alone its mean has a standard error of about half a point, and with every boat
    // answering her helm sooner (physics.ts HOVE.gyration) the sixteen drew two wild races near 9.7%: 3.75% against a bound
    // of 3.58%, where the 32 others gave 1.92% against 3.46%, and all 48 2.53% against 3.49%. Deep Physics' measurement,
    // Capacity's ruling: more seeds and the same formula, not a looser bound.)
    jobs.push(...MORE.flatMap(([i, seed]): [number, ApproxOpts][] => [[i, { grid: true, skip: true, seed, exactAI: true }], [i, { grid: true, skip: true, seed }],
      [i, { grid: true, skip: true, seed, exactAI: true, curK: 1.001 }], [i, { grid: true, skip: true, seed, exactAI: true, curK: 0.999 }]]));
    // (the fouls only, and only both ways: 48 more seeds, 51–98, the courses in turn, so the paired test runs over 96.
    // Why: on 20 Nov 2026 the light-air tack with the crew's outhaul failed it on the 48 alone, 72 against 101, mean +0.60
    // against a bound of 0.53 (t 2.77); on 96 seeds outside the test (51–146) the same pair gave 171 against 177, +0.06
    // against 0.29, the same as main's +0.06: a tail draw on the fixed 48, not a rise in fouls. Coordinator's ruling: more
    // seeds at the same 99% rate, not a looser bound.)
    const MORE_FOULS = Array.from({ length: 48 }, (_, k) => [k % 2, 51 + k] as const);
    jobs.push(...MORE_FOULS.flatMap(([i, seed]): [number, ApproxOpts][] => [[i, { grid: true, skip: true, seed, exactAI: true }], [i, { grid: true, skip: true, seed }]]));
    const R = await sail('approxRace', jobs);
    const diff: number[] = []; // (per seed: twenty a second's fouls minus every step's)
    SEEDS.forEach((_, k) => {
      const [exR, dR, upR, downR] = R.slice(4 * k, 4 * k + 4), ex = fleetV(exR.boats);
      dev.push(Math.abs(fleetV(dR.boats) / ex - 1)); penE += pens(exR); penD += pens(dR); diff.push(pens(dR) - pens(exR));
      nudge.push((Math.abs(fleetV(upR.boats) / ex - 1) + Math.abs(fleetV(downR.boats) / ex - 1)) / 2);
    });
    MORE.forEach((_, k) => {
      const [exR, dR, upR, downR] = R.slice(4 * SEEDS.length + 4 * k, 4 * SEEDS.length + 4 * k + 4), ex = fleetV(exR.boats);
      dev.push(Math.abs(fleetV(dR.boats) / ex - 1)); penE += pens(exR); penD += pens(dR); diff.push(pens(dR) - pens(exR));
      nudge.push((Math.abs(fleetV(upR.boats) / ex - 1) + Math.abs(fleetV(downR.boats) / ex - 1)) / 2);
    });
    MORE_FOULS.forEach((_, k) => {
      const [exR, dR] = R.slice(4 * (SEEDS.length + MORE.length) + 2 * k, 4 * (SEEDS.length + MORE.length) + 2 * k + 2);
      penE += pens(exR); penD += pens(dR); diff.push(pens(dR) - pens(exR));
    });
    expect(dev.length).toBe(48);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(dev), `twenty a second ${dev.map(x => (100 * x).toFixed(1)).join(' ')}%, the current's ±0.1% ${nudge.map(x => (100 * x).toFixed(1)).join(' ')}%`).toBeLessThan(1.5 * mean(nudge) + 0.005);
    const n = diff.length, dm = mean(diff), sd = Math.sqrt(diff.reduce((a, x) => a + (x - dm) ** 2, 0) / (n - 1)), T99 = 2.366; // (t, 95 df: the same one-sided 99%)
    expect(n).toBe(96);
    expect(dm, `penalties over ${n} races: every step ${penE}, twenty a second ${penD}; the mean difference ${dm.toFixed(2)} a race, its 99% bound ${(T99 * sd / Math.sqrt(n)).toFixed(2)}`).toBeLessThanOrEqual(T99 * sd / Math.sqrt(n));
  }, 5_400_000);
});

describe('pairs far apart are let be', () => {
  // (their records differ from a full assessment's in what they'd remember from far off: world.ts apart(); the race,
  // its incidents and its penalties don't)
  it('the same race to the last digit, with the same incidents and penalties, as assessing every pair every step', async () => {
    const R = await sail('approxRace', RACES.flatMap((_, i): [number, ApproxOpts][] => [[i, { grid: true, skip: true }], [i, { grid: true, skip: false }]]));
    for (let i = 0; i < RACES.length; i++) expect(R[2 * i], `race ${i}`).toEqual(R[2 * i + 1]);
  }, 600_000);
});
