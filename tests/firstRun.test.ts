import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { slipsIn } from '../src/geo/marina';
import { homeScene } from '../src/app/firstRun';

/** The scene behind the start page (docs/FTUE-PLAN.md step 0): her alone, cruising, whatever the last setup was. */
describe('the start page: a quiet cruise behind it', () => {
  const raceSave: Settings = { ...DEFAULT_SETTINGS, mode: 'race', opponents: ['stock:1', 'stock:2', 'stock:3', 'gen:1'], fleet: 4 };
  const build = (S: Settings) => { const a = homeScene(S); return new World(COURSES[0], a.settings, 1, a.opts); };

  it('after setting up a race with a fleet: no fleet, no start, no clock running, just her sailing', () => {
    const w = build(raceSave);
    expect(w.freeSail).toBe(true);
    expect(w.boats.length).toBe(1); expect(w.user.isUser).toBe(true);
    expect(w.running).toBe(false);
  });

  it('she is under way, not tied up in her slip, even when her cruises start from it', () => {
    const slip = slipsIn('west-harbor').find(s => s.kind === 'bow-in')!;
    const S: Settings = { ...raceSave, sailFrom: 'slip', boat: { ...DEFAULT_SETTINGS.boat, marina: slip.marina, slip: slip.id } };
    expect(build(S).user.docked).toBeUndefined();
  });

  it("leaves the player's own settings alone (the setup they come back to is theirs)", () => {
    const S = structuredClone(raceSave), before = JSON.stringify(S);
    homeScene(S); expect(JSON.stringify(S)).toBe(before);
  });
});
