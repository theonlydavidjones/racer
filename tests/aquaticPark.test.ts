import { describe, expect, it } from 'vitest';
import { CASES, QUICK, RECOVERY, caseTitle, recoverCase, sailCase } from './aquaticPark.shared';

// The navigator round Aquatic Park, a quick slice for test:fast (about 30 s): out of the basin, where the owner saw her
// hit the wall, and past the pier both ways, a reach and a beat. Every case and every check is in
// tests/aquaticPark.shared.ts; the rest of the cases sail in tests/aquaticPark-routes.test.ts (the full suite).
describe('the navigator round Aquatic Park (a quick slice)', () => {
  for (const c of CASES.filter(c => QUICK.includes(caseTitle(c)))) it(caseTitle(c), () => sailCase(c), 600000);
  it('the slice is all there', () => expect(CASES.filter(c => QUICK.includes(caseTitle(c))).length).toBe(QUICK.length));
});

// Leaving the basin she hit the wall and "just kinda sat there" (the owner): touching the pier, the pilot gets her off and
// out (this one here; the rest in tests/aquaticPark-routes.test.ts).
describe('the navigator off Municipal Pier, after touching it', () => {
  const [name, at, h, from] = RECOVERY[0];
  it(name, () => recoverCase(at, h, from), 300000);
});
