// The race pool (tests/helpers/racePool.ts) sails the same races as the test's own process, to the last digit: every
// race the slow tests hand it is a function of its seed and options, and the pool's threads load the same code through
// Vite's module runner. If a thread ever gave a different answer, this fails. It always sails on two threads, whatever
// the cores (the slow tests sail in their own process on two cores or fewer), so it checks the threads in CI too.
import { describe, expect, it } from 'vitest';
import { approxRace } from './helpers/races';
import { poolSize, sail } from './helpers/racePool';

describe('the race pool gives the races\' own answers', () => {
  it('two short races on each course, with every option the slow tests use: the same in the pool as here, to the last digit', async () => {
    const jobs: Parameters<typeof approxRace>[] = [
      [0, { grid: false, skip: false, seed: 3, until: 30 }], [0, { grid: true, skip: true, seed: 4, exactAI: true, until: 30 }],
      [1, { grid: true, skip: false, seed: 7, curK: 1.001, until: 30 }], [1, { grid: true, skip: true, seed: 8, curK: 0.999, until: 30 }]
    ];
    const pooled = await sail('approxRace', jobs, 2);
    const here = jobs.map(a => approxRace(...a));
    expect(JSON.stringify(pooled)).toBe(JSON.stringify(here));
    expect(pooled.map(r => r.boats.length)).toEqual([7, 7, 5, 5]); // (they sailed: the fleets are there)
    console.log(`race pool: the slow tests use ${(await poolSize()) || 'no'} threads here`);
  }, 300_000);

  it('a race that fails on a thread fails the test (no quiet falling back)', async () => {
    await expect(sail('approxRace', [[9, { grid: true, skip: true }], [9, { grid: true, skip: true }]] as never, 2)).rejects.toThrow();
  }, 180_000);
});
