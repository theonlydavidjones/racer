// (a slow whole-race test: sixteen starts on the race pool's threads; in the full suite only)
import { expect, it } from 'vitest';
import { sail } from './helpers/racePool';

/**
 * How often the AI fleet fouls round the start: a yardstick for any change to how the boat handles or how the AI sails
 * her. Found 14 Nov 2026: with the force-based turn (the boat turning slower when she's slow, and not at all at rest)
 * under main's AI, which judged its room by the old handling, the fleet took 42 penalties in these sixteen starts where
 * main took 23, and the whole-race tests' own bounds let both through.
 *
 * Sixteen starts and the five minutes after each (tests/helpers/races.ts startFouls: Seaweed Soup course 10, eight
 * boats, the real tide, west 12 and 22 kt, seeds 1–8), the penalties given to the AI boats counted.
 * main (df49865, 14 Nov 2026): 1 2 0 4 4 1 2 1 / 2 0 0 1 2 0 2 1 = 23, 1.44 a start, a start's scatter 1.26, so the
 * sixteen's total scatters by about 5. The bound is main's own count and one such scatter: 28. Not to be raised to
 * pass: a fleet that fouls more than that is sailing worse than main's did (the Coordinator's ruling, 14 Nov 2026).
 */
const KTS = [12, 22], SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
it('the AI fleet fouls no more often round the start than main\'s did: 28 penalties at most in sixteen starts (main: 23)', async () => {
  const jobs = KTS.flatMap(kt => SEEDS.map(seed => [kt, seed] as [number, number])), R = await sail('startFouls', jobs);
  const fouls = R.reduce((s, r) => s + r.fouls, 0), on = R.reduce((s, r) => s + r.onPenalty, 0);
  const why = `penalties start by start ${R.map(r => r.fouls).join(' ')}; ${on.toFixed(0)} boat-seconds on them (main: 2,189)`;
  expect(fouls, why).toBeLessThanOrEqual(28);
  // (and they aren't all in one wind: neither half more than main's worse half and its scatter, 15 + 4)
  for (const k of [0, 1]) expect(R.slice(8 * k, 8 * k + 8).reduce((s, r) => s + r.fouls, 0), `${KTS[k]} kt: ${why}`).toBeLessThanOrEqual(19);
}, 1_800_000);
