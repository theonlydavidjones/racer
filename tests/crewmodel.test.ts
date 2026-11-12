import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { ATTRS, DEFAULT_CREW, DEFAULT_SKILL, attrOf, crewAttr, hikingMoment, newCrew, pace, reactTime, specAttr, type Attr, type CrewSpec } from '../src/boat/crewPhys';

// The crew model (ROADMAP, the skipper and crew model): each person's skill split into attributes (crewPhys.ts Attr),
// each falling back to their skill, so a crew given only a skill sails exactly as before the split.

const crewOf = (skill: number, attr?: Partial<Record<Attr, number>>, n = 2): CrewSpec => ({
  helm: { ...DEFAULT_CREW.helm, skill, ...(attr ? { attr: { ...attr } } : {}) },
  crew: DEFAULT_CREW.crew.slice(0, n).map(p => ({ ...p, skill, ...(attr ? { attr: { ...attr } } : {}) }))
});
const all = (v: number) => Object.fromEntries(ATTRS.map(a => [a, v])) as Record<Attr, number>;

/** A beat in `W` kt for `secs`, with this crew: where she and her crew end up. */
function beat(spec: CrewSpec, W: number, secs: number) {
  const twa = beatAngle(W), b = testBoat({ heading: 360 - twa, kt: 4, windKt: W });
  b.crew = newCrew(spec, 'S');
  sail(b, secs, () => { b.h = 360 - twa; });
  return b;
}

describe('the crew model: attributes', () => {
  it('each attribute falls back to the person\'s skill, then the club default', () => {
    expect(attrOf({ h: 1.7, w: 70 }, 'trim')).toBe(DEFAULT_SKILL);
    expect(attrOf({ h: 1.7, w: 70, skill: 0.3 }, 'react')).toBe(0.3);
    expect(attrOf({ h: 1.7, w: 70, skill: 0.3, attr: { react: 0.9 } }, 'react')).toBe(0.9);
    expect(attrOf({ h: 1.7, w: 70, skill: 0.3, attr: { react: 0.9 } }, 'fitness')).toBe(0.3);
    expect(attrOf({ h: 1.7, w: 70, attr: { eyes: 2 } }, 'eyes')).toBe(1); // (clamped)
  });

  it('the crew\'s attribute is the crew\'s average (alone: the helm\'s)', () => {
    const s: CrewSpec = { helm: { h: 1.8, w: 80, skill: 0.9 }, crew: [{ h: 1.7, w: 70, skill: 0.4 }, { h: 1.7, w: 70, attr: { trim: 0.8 } }] };
    expect(specAttr(s, 'trim')).toBeCloseTo((0.4 + 0.8) / 2, 12);
    expect(specAttr(s, 'fitness')).toBeCloseTo((0.4 + DEFAULT_SKILL) / 2, 12);
    expect(specAttr({ helm: { h: 1.8, w: 80, skill: 0.9 }, crew: [] }, 'trim')).toBe(0.9);
    expect(crewAttr(undefined, 'react')).toBe(DEFAULT_SKILL);
  });

  it('a crew given every attribute equal to its skill sails exactly as one given only the skill', () => {
    for (const [skill, W] of [[0.3, 6], [0.45, 14], [0.85, 22]] as const) {
      const a = beat(crewOf(skill), W, 40), b = beat(crewOf(skill, all(skill)), W, 40);
      expect([b.x, b.y, b.heel, b.ctl.mainsheet, b.ctl.jibsheet]).toEqual([a.x, a.y, a.heel, a.ctl.mainsheet, a.ctl.jibsheet]);
      expect(b.crew!.people.map(p => [p.x, p.z, p.fatigue, p.pose])).toEqual(a.crew!.people.map(p => [p.x, p.z, p.fatigue, p.pose]));
    }
  });

  it('react sets the reaction time and handling the pace, each on its own', () => {
    const p = { h: 1.75, w: 75, skill: 0.6 };
    expect(reactTime({ ...p, attr: { react: 1 } })).toBeCloseTo(0.4, 9);
    expect(reactTime({ ...p, attr: { react: 0 } })).toBeCloseTo(1.6, 9);
    expect(reactTime({ ...p, attr: { handling: 1 } })).toBeCloseTo(reactTime(p), 12);
    expect(pace({ ...p, attr: { handling: 1 } })).toBeCloseTo(1.3, 9);
    expect(pace({ ...p, attr: { react: 1 } })).toBeCloseTo(pace(p), 12);
  });

  it('fitness alone decides how far out they hike (and how long they last: Vogiatzis 1995)', () => {
    // (the same crew in every other way: the unfit reach out less; tired, both lose the same share of their reach)
    const U = crewOf(0.8, { fitness: 0.1 }), F = crewOf(0.8, { fitness: 0.95 });
    expect(hikingMoment(U, [0, 0, 0])).toBeLessThan(hikingMoment(F, [0, 0, 0]) * 0.97);
    expect(hikingMoment(U, [0.5, 0.5, 0.5]) / hikingMoment(U, [0, 0, 0])).toBeCloseTo(hikingMoment(F, [0.5, 0.5, 0.5]) / hikingMoment(F, [0, 0, 0]), 1);
    // and on the rail, a few minutes into a 22 kt beat, the unfit are leaning out less
    const unfit = beat(U, 22, 150), fit = beat(F, 22, 150), lean = (b: ReturnType<typeof beat>) => b.crew!.people[1].lean;
    expect(lean(unfit)).toBeLessThan(lean(fit));
  }, 30_000);
});
