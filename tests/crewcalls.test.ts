import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { DEFAULT_CREW, newCrew, type Attr, type CrewSpec } from '../src/boat/crewPhys';
import { CALL_WINDOW, crewLook, sailsHide, spotRange } from '../src/boat/crewEyes';
import { Puffs } from '../src/environment/wind';
import { makeRng } from '../src/core/rng';
import { KT } from '../src/core/math';

// The crew's eyes and calls (boat/crewEyes.ts): every crew member a lookout (the owner), a call that says lift or
// header, how much, how long and when (Sailing World, "Puff Talk"), from the sim's own puffs.

const crewOf = (attr: Partial<Record<Attr, number>>): CrewSpec => ({ helm: { ...DEFAULT_CREW.helm, skill: 0.6, attr }, crew: DEFAULT_CREW.crew.map(p => ({ ...p, skill: 0.6, attr })) });

/** A boat beating on starboard in 12 kt from the north, and one puff (or lull: amp < 0) `ahead` m upwind of her and
 * `across` m to the west, in her path as she beats north-west. */
function scene(spec: CrewSpec, amp = 0.25, ahead = 260, across = -70) {
  const b = testBoat({ heading: 315, kt: 5, windFrom: 0, windKt: 12 }); b.crew = newCrew(spec, 'S');
  const puffs = new Puffs(makeRng(1), { x: b.x, y: b.y }, 3000, 0);
  puffs.cells.push({ x: b.x + across, y: b.y + ahead, r: 90, amp, age: 100, life: 400 });
  const wind = { from: 0, kt: 12 };
  let t = 0;
  const log: { t: number; calls: NonNullable<typeof b.calls>; k: number }[] = [];
  const run = (secs: number) => { for (let s = 0; s < secs; s++) { puffs.step(1, wind); sail(b, 1, () => { b.h = 315; }); t++; crewLook(b, puffs, t); log.push({ t, calls: [...(b.calls ?? [])], k: puffs.at(b).k }); } };
  return { b, puffs, run, log };
}

describe('the crew\'s eyes and their calls', () => {
  it('a club crew spots a typical puff about 50 yards out (the owner); an expert further, a novice nearer', () => {
    expect(spotRange(0.6)).toBeCloseTo(46, 0);
    expect(spotRange(1)).toBeGreaterThan(2 * spotRange(0.6));
    expect(spotRange(0.25)).toBeLessThan(0.5 * spotRange(0.6));
  });
  it('the call counts down to the puff, and it arrives when they said', () => {
    const s = scene(crewOf({ eyes: 0.6 }));
    s.run(70);
    const near = s.log.filter(e => e.calls.some(c => !c.far && c.kind === 'puff'));
    expect(near.length).toBeGreaterThan(3);
    const first = near[0].calls.find(c => !c.far)!;
    expect(first.in).toBeLessThanOrEqual(CALL_WINDOW);
    expect(first.strength).toBeGreaterThan(1.1); expect(first.lasts).toBeGreaterThan(5);
    // (on starboard a veered puff is a lift: Puffs veer up to ~9° in a full puff)
    expect(first.lift).toBeGreaterThan(1);
    // when the count reaches zero she's in it (within a couple of seconds)
    const zero = near.find(e => e.calls.some(c => !c.far && c.in < 0.5))!;
    expect(zero).toBeTruthy();
    const inIt = s.log.find(e => e.k > 1.05)!;
    expect(Math.abs(inIt.t - (near[0].t + first.in))).toBeLessThan(3);
  });
  it('far off, a "wind over there" call first, for the strategy; then the countdown', () => {
    const s = scene(crewOf({ eyes: 0.9 }), 0.28, 420, -110);
    s.run(80);
    const firstAny = s.log.find(e => e.calls.length > 0)!, firstNear = s.log.find(e => e.calls.some(c => !c.far))!;
    expect(firstAny.calls[0].far).toBe(true);
    expect(firstNear.t).toBeGreaterThan(firstAny.t);
  });
  it('a sharp-eyed crew calls it sooner than a novice one, who sometimes only sees it on the boat', () => {
    const sharp = scene(crewOf({ eyes: 1 })), dull = scene(crewOf({ eyes: 0.15 }));
    sharp.run(70); dull.run(70);
    const when = (s: ReturnType<typeof scene>) => s.log.find(e => e.calls.some(c => c.kind === 'puff'))?.t ?? Infinity;
    expect(when(sharp)).toBeLessThan(when(dull));
  });
  it('a lull is called as a lull', () => {
    const s = scene(crewOf({ eyes: 0.9 }), -0.25);
    s.run(70);
    const c = s.log.flatMap(e => e.calls).find(x => !x.far);
    expect(c?.kind).toBe('lull'); expect(c!.strength).toBeLessThan(0.95);
  });
  it('the helm can\'t see past the sails to leeward; a crew member to leeward can', () => {
    const b = testBoat({ heading: 315, kt: 5, windFrom: 0, windKt: 12 }); b.crew = newCrew(crewOf({}), 'S');
    // (on starboard the leeward side is to port: −45° off the bow is under the jib)
    expect(sailsHide(b, 0, -45)).toBe(true); expect(sailsHide(b, 0, 45)).toBe(false);
    b.crew.people[2].x = -0.5; expect(sailsHide(b, 2, -45)).toBe(false);
    void KT;
  });
});
