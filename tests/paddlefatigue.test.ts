import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { KT } from '../src/core/math';
import { DEFAULT_CREW, newCrew, type CrewSpec } from '../src/boat/crewPhys';
import { PADDLE, cpOf, paddlePower, paddleStart, paddleStep, paddler } from '../src/boat/paddle';
import { workPace } from '../src/boat/crewWork';
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
  let restAt = Infinity, resumeAt = Infinity, swapAt = Infinity, swaps = 0, work = 0, rateOn = 0, rateRest = -1, early = 0, at300 = 0;
  const first = paddler(b), pace = Math.min(1, workPace(b, first));
  sail(b, secs, t => {
    const e = paddleStep(b, t, DT);
    if (e === 'rest' && restAt === Infinity) restAt = t;
    if (e === 'resume' && resumeAt === Infinity) resumeAt = t;
    if (e === 'swap') { swaps++; if (swapAt === Infinity) swapAt = t; }
    const P = paddlePower(b, t); work += P * DT;
    if (Math.abs(t - PADDLE.fetchS - 3) < DT / 2) early = P / pace;
    if (Math.abs(t - 300) < DT / 2) at300 = P;
    if (t > PADDLE.fetchS + 2 && t < PADDLE.fetchS + 4) rateOn = b.paddle!.rate ?? 0;
    if (b.paddle!.rest) rateRest = b.paddle!.rate ?? 0;
  });
  return { b, restAt, resumeAt, swapAt, swaps, mean: work / secs, rateOn, rateRest, first, early, at300, pace, who: paddler(b) };
}

describe('Paddling tires them: the critical-power model (paddle.ts)', () => {
  it('a club crewmate: the full stroke at first, easing to what they keep up, then, used up, a rest, then paddling again', () => {
    const r = spell(crew(0.6, 0.3), 1500), cp = cpOf({ h: 1.75, w: 78, attr: { fitness: 0.6 } }).cp;
    expect(r.early, 'the first push: the job\'s stroke').toBeGreaterThan(130);
    expect(r.at300 / r.pace, 'eased to their CP after a few minutes, not stopped').toBeGreaterThan(cp * 0.97);
    expect(r.at300 / r.pace).toBeLessThan(cp * 1.1);
    expect(r.restAt, 'used up after a quarter of an hour or so').toBeGreaterThan(600); expect(r.restAt).toBeLessThan(1200);
    expect(r.resumeAt - r.restAt, 'a rest of a few minutes').toBeGreaterThan(120); expect(r.resumeAt - r.restAt).toBeLessThan(400);
    expect(r.rateOn, 'strokes a minute while they paddle').toBeGreaterThan(20);
    expect(r.rateRest, 'none resting').toBe(0);
  }, 120_000);
  it('fitter, they paddle harder and for longer before resting', () => {
    const runs = [0, 0.3, 0.6, 1].map(f => spell(crew(f, 0.3), 2000));
    for (let k = 1; k < runs.length; k++) {
      expect(runs[k]!.restAt, `rests later at fitness step ${k}`).toBeGreaterThan(runs[k - 1]!.restAt + 60);
      expect(runs[k]!.at300).toBeGreaterThan(runs[k - 1]!.at300);
    }
    expect(cpOf({ h: 1.8, w: 80, attr: { fitness: 1 } }).cp).toBeCloseTo(PADDLE.side * PADDLE.cpFit, 5);
  }, 240_000);
  it('a crew that knows the job hands the crutch on rather than rest, and back again; a green crew rests', () => {
    const smart = spell(crew(0.6, 0.8), 2400), green = spell(crew(0.6, 0.2), 2400);
    expect(smart.swapAt, 'swapped when used up').toBeLessThan(1200);
    expect(smart.restAt, 'never stopped: one paddles while the other rests').toBe(Infinity);
    expect(smart.swaps, 'and back').toBeGreaterThanOrEqual(2);
    expect(smart.mean, 'more work done').toBeGreaterThan(green.mean * 1.05);
    expect(green.swapAt).toBe(Infinity); expect(green.restAt).toBeLessThan(1200);
  }, 120_000);
  it('one crewmate: nobody to swap with (the helm steers), so they rest; alone, you rest yourself', () => {
    expect(spell(crew(0.6, 0.9, 1), 1300).swapAt).toBe(Infinity);
    const solo = spell(crew(0.6, 0.9, 0), 1300);
    expect(solo.first).toBe(0); expect(solo.restAt).toBeLessThan(1200);
  }, 120_000);
  it('the speed she makes: about a knot and a half fresh, losing her way while they rest', () => {
    const b = testBoat({ heading: 90, kt: 0, windKt: 0.5 }); b.crew = newCrew(crew(0.6, 0.2), 'S');
    b.paddle = { side: 'P', t0: 0, auto: false, who: undefined, rest: false, handT: undefined, rate: 0 };
    let vMax = 0; const t0 = sail(b, 1500, t => { paddleStep(b, t, DT); vMax = Math.max(vMax, b.v); return b.paddle!.rest && t > 0; });
    expect(vMax / KT).toBeGreaterThan(1.2); expect(vMax / KT).toBeLessThan(2.2);
    // (resting, no push: she carries her way a long while, two tonnes against little more than skin friction)
    const v0 = b.v; sail(b, 120, t => { paddleStep(b, t0 + DT + t, DT); expect(paddlePower(b, t0 + DT + t)).toBe(0); });
    expect(b.v, 'losing her way').toBeLessThan(v0 * 0.75);
  }, 120_000);
  it('a new spell: a tired forward hand leaves it to a rested crewmate, or with a green crew rests first', () => {
    const tired = (skill: number) => {
      const b = testBoat({ heading: 90, kt: 0, windKt: 0.5 }); b.crew = newCrew(crew(0.6, skill), 'S');
      const f = paddler(b), a = b.crew.people[f]!; a.wUsed = 0.9; a.wBal = 0.2; a.wT = 100;
      return { f, s: paddleStart(b, 110) };
    };
    const smart = tired(0.8), green = tired(0.2);
    expect(smart.s.who).not.toBe(smart.f); expect(smart.s.who).toBeGreaterThan(0); expect(smart.s.rest).toBe(false);
    expect(green.s.who).toBeUndefined(); expect(green.s.rest).toBe(true);
  });
});

describe('Paddling in the World: tired, a word, and the crutch handed on', () => {
  it('your crew swap paddlers when spent: the job moves to the fresh one, and you hear of it', () => {
    const S = { ...DEFAULT_SETTINGS, mode: 'sail' as const, windKt: 0.5, windKind: 'west' as const, current: 'slack', sea: 'flat' as const, traffic: 0 as const, fleet: 0, opponents: [] };
    const w = new World(courseFile('train'), S, 4242, { freeSail: true }), u = w.user;
    u.crew = newCrew(crew(0.6, 0.8), 'S');
    applyCommand(w, { k: 'paddle', side: 'S' });
    const first = paddler(u); let swapped = false;
    for (let i = 0; i < 60 * 1300 && !swapped; i++) { w.step(DT); swapped = w.drainEvents().some(e => e.type === 'toast' && /swap paddlers/.test((e as { msg: string }).msg)); }
    expect(swapped).toBe(true);
    const who = paddler(u);
    expect(who).not.toBe(first);
    expect(u.crew!.people[who]!.job?.line).toBe('paddle');
    expect(u.crew!.people[first]!.job?.line).not.toBe('paddle');
  }, 300_000);
});
