import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { KT } from '../src/core/math';
import { DEFAULT_CREW, newCrew, type CrewSpec } from '../src/boat/crewPhys';
import { PADDLE, cpOf, paddlePower, paddleStep, paddler } from '../src/boat/paddle';
import { World, DT } from '../src/sim/world';
import { courseFile } from '../src/courses/registry';
import { DEFAULT_SETTINGS } from '../src/settings';
import { applyCommand } from '../src/sim/commands';

// Paddling tires them (ROADMAP 8c, the owner: "paddling is exhausting… strength of paddling and duration without rest
// should be tied to crew fitness"): the critical-power model, paddle.ts. A calm, the crutch out, one boat.
const crew = (fitness: number, skill: number, n = 2): CrewSpec => ({
  helm: { ...DEFAULT_CREW.helm, skill, attr: { fitness } },
  crew: DEFAULT_CREW.crew.slice(0, n).map(p => ({ ...p, skill, attr: { fitness } }))
});
/** Paddled for `secs` in a near calm: the power each step, when they first rest, and how long that rest lasts. */
function spell(spec: CrewSpec, secs: number) {
  const b = testBoat({ heading: 90, kt: 0, windKt: 0.5 });
  b.crew = newCrew(spec, 'S');
  b.paddle = { side: 'P', t0: 0, auto: false, who: undefined, rest: false, handT: undefined, rate: 0 };
  let restAt = Infinity, resumeAt = Infinity, swapAt = Infinity, work = 0, rateOn = 0, rateRest = -1, first = paddler(b);
  sail(b, secs, t => {
    const e = paddleStep(b, t, DT);
    if (e === 'rest' && restAt === Infinity) restAt = t;
    if (e === 'resume' && resumeAt === Infinity) resumeAt = t;
    if (e === 'swap' && swapAt === Infinity) swapAt = t;
    work += paddlePower(b, t) * DT;
    if (t > PADDLE.fetchS + 2 && t < PADDLE.fetchS + 4) rateOn = b.paddle!.rate ?? 0;
    if (b.paddle!.rest) rateRest = b.paddle!.rate ?? 0;
  });
  return { b, restAt, resumeAt, swapAt, mean: work / secs, rateOn, rateRest, first, who: paddler(b) };
}

describe('Paddling tires them: the critical-power model (paddle.ts)', () => {
  it('a club crewmate: the full stroke at first, easing as they tire, then a rest, then paddling again', () => {
    const r = spell(crew(0.6, 0.3), 900);
    expect(r.restAt, 'spent after a couple of minutes').toBeGreaterThan(60); expect(r.restAt).toBeLessThan(240);
    expect(r.resumeAt - r.restAt, 'a rest of some minutes (Skiba\'s recovery)').toBeGreaterThan(120);
    expect(r.resumeAt - r.restAt).toBeLessThan(600);
    expect(r.rateOn, 'strokes a minute while they paddle').toBeGreaterThan(20);
    expect(r.rateRest, 'none resting').toBe(0);
  }, 60_000);
  it('fitter, they paddle harder and for longer before resting; the fittest keep on at their critical power', () => {
    const low = spell(crew(0.3, 0.3), 600), club = spell(crew(0.6, 0.3), 600), fit = spell(crew(0.8, 0.3), 600), top = spell(crew(1, 0.3), 600);
    expect(low.restAt).toBeLessThan(club.restAt); expect(club.restAt).toBeLessThan(fit.restAt);
    expect(low.mean).toBeLessThan(club.mean); expect(club.mean).toBeLessThan(top.mean);
    expect(top.restAt, 'over their eased stroke: no rest').toBe(Infinity);
    expect(cpOf({ h: 1.8, w: 80, attr: { fitness: 1 } }).cp).toBeCloseTo(PADDLE.side * PADDLE.cpFit, 5);
  }, 120_000);
  it('a crew that knows the job hands the crutch on rather than rest; a green crew rests', () => {
    const smart = spell(crew(0.6, 0.8), 400), green = spell(crew(0.6, 0.2), 400);
    expect(smart.swapAt, 'swapped when spent').toBeLessThan(240);
    expect(smart.who).not.toBe(smart.first);
    expect(smart.restAt, 'the fresh one goes on, no stop').toBeGreaterThan(smart.swapAt + 60);
    expect(smart.mean, 'more work done').toBeGreaterThan(green.mean * 1.2);
    expect(green.swapAt).toBe(Infinity); expect(green.restAt).toBeLessThan(240);
  }, 60_000);
  it('one crewmate: nobody to swap with (the helm steers), so they rest; alone, you rest yourself', () => {
    expect(spell(crew(0.6, 0.9, 1), 300).swapAt).toBe(Infinity);
    const solo = spell(crew(0.6, 0.9, 0), 300);
    expect(solo.first).toBe(0); expect(solo.restAt).toBeLessThan(240);
  }, 60_000);
  it('the speed she makes: about a knot and a half fresh, nothing resting', () => {
    const b = testBoat({ heading: 90, kt: 0, windKt: 0.5 }); b.crew = newCrew(crew(0.6, 0.2), 'S');
    b.paddle = { side: 'P', t0: 0, auto: false, who: undefined, rest: false, handT: undefined, rate: 0 };
    let vMax = 0; const t0 = sail(b, 400, t => { paddleStep(b, t, DT); vMax = Math.max(vMax, b.v); return b.paddle!.rest && t > 0; });
    expect(vMax / KT).toBeGreaterThan(1.2); expect(vMax / KT).toBeLessThan(2.2);
    // (resting, no push: she carries her way a long while, two tonnes against little more than skin friction)
    const v0 = b.v; sail(b, 120, t => { paddleStep(b, t0 + DT + t, DT); expect(paddlePower(b, t0 + DT + t)).toBe(0); });
    expect(b.v, 'losing her way while they rest').toBeLessThan(v0 * 0.75);
  }, 60_000);
});

describe('Paddling in the World: tired, a word, and the crutch handed on', () => {
  it('your crew swap paddlers when spent: the job moves to the fresh one, and you hear of it', () => {
    const S = { ...DEFAULT_SETTINGS, mode: 'sail' as const, windKt: 0.5, windKind: 'west' as const, current: 'slack', sea: 'flat' as const, traffic: 0 as const, fleet: 0, opponents: [] };
    const w = new World(courseFile('train'), S, 4242, { freeSail: true }), u = w.user;
    u.crew = newCrew(crew(0.6, 0.8), 'S');
    applyCommand(w, { k: 'paddle', side: 'S' });
    const first = paddler(u); let swapped = false;
    for (let i = 0; i < 60 * 300 && !swapped; i++) { w.step(DT); swapped = w.drainEvents().some(e => e.type === 'toast' && /swap paddlers/.test((e as { msg: string }).msg)); }
    expect(swapped).toBe(true);
    const who = paddler(u);
    expect(who).not.toBe(first);
    expect(u.crew!.people[who]!.job?.line).toBe('paddle');
    expect(u.crew!.people[first]!.job?.line).not.toBe('paddle');
  }, 120_000);
});
