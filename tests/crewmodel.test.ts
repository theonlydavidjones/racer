import { describe, expect, it } from 'vitest';
import { testBoat, sail, startTack } from './helpers/testBoat';
import { poleTrip, startThreshold, travellerHand } from '../src/boat/crewWork';
import { POLE, poleEta, sailPlan } from '../src/boat/physics';
import { beatAngle } from '../src/boat/polar';
import { ATTRS, Z, DEFAULT_CREW, DEFAULT_SKILL, ENDURE, attrOf, crewAttr, hikingMoment, newCrew, pace, reactTime, specAttr, type Attr, type CrewSpec } from '../src/boat/crewPhys';

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

  it('each of the crew\'s own functions moves with its one attribute and no other', () => {
    // (the refactor's mapping: reactTime ← react, pace ← handling, hiking reach and endurance ← fitness)
    const base = { h: 1.75, w: 75, skill: 0.6 }, F: Record<string, (p: typeof base & { attr?: Partial<Record<Attr, number>> }) => number> = {
      react: reactTime, handling: pace, fitness: p => ENDURE(p) + hikingMoment({ helm: p, crew: [] }, [0])
    };
    for (const [owner, f] of Object.entries(F)) for (const a of ATTRS) {
      const moved = f({ ...base, attr: { [a]: 0.95 } }) !== f(base);
      expect(moved, `${owner} function against ${a}`).toBe(a === owner);
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

  it('fitness decides how far out they hike and how long they last (Vogiatzis 1995: 5 min untrained, 8.5 trained)', () => {
    // (the same crew in every other way: the unfit reach out less; tired, both lose the same share of their reach)
    const U = crewOf(0.8, { fitness: 0.1 }), F = crewOf(0.8, { fitness: 0.95 });
    expect(hikingMoment(U, [0, 0, 0])).toBeLessThan(hikingMoment(F, [0, 0, 0]) * 0.97);
    expect(ENDURE(U.crew[0])).toBeCloseTo(300 + 210 * 0.1, 9); expect(ENDURE(F.crew[0])).toBeCloseTo(300 + 210 * 0.95, 9);
    // and on the rail, a few minutes into a 22 kt beat, the unfit are leaning out less
    const unfit = beat(U, 22, 150), fit = beat(F, 22, 150), lean = (b: ReturnType<typeof beat>) => b.crew!.people[1].lean;
    expect(lean(unfit)).toBeLessThan(lean(fit));
  }, 30_000);
});

describe('the crew model, phase B: each trimmer\'s own eye and hand', () => {
  /** Sailing at `twa` in 12 kt, steady; then the wind veers `d` degrees (a lift: the apparent wind goes aft): her main's
   * angle of attack off its best (deg) `after` seconds later. */
  function lift(spec: CrewSpec, twa: number, d: number, after: number) {
    const b = testBoat({ heading: 360 - twa, kt: 5, windKt: 12 });
    b.crew = newCrew(spec, 'S');
    sail(b, 40, () => { b.h = 360 - twa; });
    b.ww.from += d;
    sail(b, after, () => { b.h = 360 - twa; });
    return Math.abs(b.trim.main.err);
  }
  it('a quick trimmer has the main eased for a lift sooner than a slow one (reaction: an estimate, Hick–Hyman)', () => {
    const quick = lift(crewOf(0.6, { react: 1 }), 70, 15, 1.2), slow = lift(crewOf(0.6, { react: 0.1 }), 70, 15, 1.2);
    expect(slow).toBeGreaterThan(quick + 1);
    // and both have caught up after a few seconds
    expect(lift(crewOf(0.6, { react: 0.1 }), 70, 15, 8)).toBeLessThan(2.5);
  }, 30_000);

  it('a trimmer\'s tolerance band: an expert\'s finer than a club crew\'s (the calibration) and a novice\'s coarser', () => {
    expect(startThreshold('mainsheet', 0.6)).toBe(0.006);
    expect(startThreshold('mainsheet', 1)).toBeLessThan(0.0035);
    expect(startThreshold('jibsheet', 0.25)).toBeGreaterThan(0.01);
  });
});

describe('the crew model, phase B: the pole, by the owner\'s timings', () => {
  const run = (spec: CrewSpec) => { const b = testBoat({ heading: 195, kt: 4, windKt: 10 }); b.crew = newCrew(spec, 'S'); return b; };
  it('from the cockpit: an expert about 20 s, "the absolute fastest"; a club crew longer; a novice much longer', () => {
    const ex = poleEta(run(crewOf(1))).set, club = poleEta(run(crewOf(0.6))).set, nov = poleEta(run(crewOf(0.25))).set;
    expect(ex).toBeGreaterThan(19); expect(ex).toBeLessThan(22);
    expect(club).toBeGreaterThan(ex + 4); expect(nov).toBeGreaterThan(club + 8);
    // (the pace of the work is handling's: a fit, quick-eyed novice sets it no faster)
    expect(poleEta(run(crewOf(0.25, { react: 1, fitness: 1, trim: 1 }))).set).toBeGreaterThan(club + 7);
  });
  it('pre-positioned at the mast: 10 s, "the bare minimum"', () => {
    const b = run(crewOf(1)); b.crew!.people[2].z = Z.mast;
    expect(poleTrip(b, POLE.forward)).toBe(0);
    expect(poleEta(b).set).toBeCloseTo(10, 1);
  });
  it('the jib draws to leeward while the forward hand goes up; it\'s out of action only while the pole goes on', () => {
    const b = run(crewOf(0.6)); b.poleWant = true;
    sail(b, 5, () => { b.h = 195; });
    expect(b.pole).toBe('down'); expect(sailPlan(b)).toBe('jib');
    sail(b, poleEta(run(crewOf(0.6))).set + 2, () => { b.h = 195; });
    expect(b.pole).toBe('set');
  }, 30_000);
  it('stowing pays the trip forward too, when the forward hand is back aft', () => {
    const b = run(crewOf(0.6)); b.poleWant = true;
    sail(b, 40, () => { b.h = 195; });
    expect(b.pole).toBe('set');
    // (sent back into the cockpit after the set: far aft of the mast)
    const fwd = b.crew!.people[2]; const aft = fwd.z > 0;
    b.poleWant = false; sail(b, 3, () => { b.h = 195; });
    if (aft) expect(b.pole).toBe('set'); // still walking forward, the jib still poled out
    sail(b, 40, () => { b.h = 195; });
    expect(b.pole).toBe('down');
  }, 30_000);
  it('ready at the mast before the bear-away lapses by itself when nothing renews it (no forward hand stuck up there)', () => {
    const b = run(crewOf(0.9)); b.h = 195;
    sail(b, 2, () => { b.h = 195; });
    b.polePrepUntil = (b.crew!.clock ?? 0) + 10;
    sail(b, 6, () => { b.h = 195; });
    expect(b.crew!.people[2].job?.line).toBe('pole'); expect(b.crew!.people[2].z).toBeLessThan(Z.mast + 0.6);
    sail(b, 30, () => { b.h = 195; });
    expect(b.crew!.people[2].job?.line).not.toBe('pole'); expect(b.pole).toBe('down');
  }, 30_000);
});

describe('the crew model, B2: standing in the companionway (the owner, 12 Nov 2026)', () => {
  /** A beat in `W` kt for `secs` with this crew, cruising or racing, the companionway shut or open to start. */
  function go(spec: CrewSpec, W: number, secs: number, o: { cruising?: boolean; shut?: boolean } = {}) {
    const twa = beatAngle(W), b = testBoat({ heading: 360 - twa, kt: 4, windKt: W });
    b.crew = newCrew(spec, 'S'); b.cruising = !!o.cruising;
    if (o.shut) b.companionway = { doors: 'in', hatch: 'closed', doorsT: 0, hatchT: 0 };
    const seen: string[] = [];
    sail(b, secs, () => { b.h = 360 - twa; const cw = b.companionway; if (!cw) return; const st = `${cw.doors}/${cw.hatch}`; if (seen[seen.length - 1] !== st) seen.push(st); });
    const at = b.crew!.people.findIndex(p => p.pose === 'companionway' && p.z < Z.companionway + 0.15);
    return { b, at, seen };
  }
  it('cruising in light air, a crew member slides the hatch forward, then lifts out the washboards, then stands there (the owner)', () => {
    const r = go(crewOf(0.6), 6, 60, { cruising: true, shut: true });
    expect(r.seen).toEqual(['in/closed', 'in/open', 'out/open']); // (the hatch, then the boards, and it stays open)
    expect(r.at).toBeGreaterThan(0);
    const p = r.b.crew!.people[r.at];
    expect(Math.abs(p.x)).toBeLessThan(0.1); // (on the centreline: no moment across)
  }, 30_000);
  it('racing in light air: novices are inclined to stand there; a club or expert crew put their weight to work', () => {
    expect(go(crewOf(0.6, { trim: 0.15 }), 6, 60).at).toBeGreaterThan(0);
    expect(go(crewOf(0.6), 6, 60).at).toBe(-1);
    expect(go(crewOf(0.9), 6, 60).at).toBe(-1);
  }, 30_000);
  it('in a breeze even novices are on the rail: their weight is wanted', () => {
    expect(go(crewOf(0.6, { trim: 0.15 }), 18, 60).at).toBe(-1);
    expect(go(crewOf(0.6), 18, 60, { cruising: true }).at).toBe(-1);
  }, 30_000);
  it('racing with one crew, a novice comes out of the hatch as soon as she needs more weight than the helm sitting gives', () => {
    const one = { helm: { ...DEFAULT_CREW.helm, skill: 0.6 }, crew: [{ ...DEFAULT_CREW.crew[0], skill: 0.6, attr: { trim: 0.15 } }] };
    for (const W of [10, 12]) {
      const r = go(one, W, 120);
      expect(r.at, `${W} kt`).toBe(-1);
      expect(r.b.crew!.people[0].pose).not.toBe('hike'); // (the helm isn't hiking alone for them)
    }
    expect(go(one, 4, 60).at).toBe(1); // (and in a drifter, there they are)
  }, 60_000);
  it('cruising, comfort first: someone stands in the hatch until she heels past about 15° (the owner: 12–15°)', () => {
    for (const W of [8, 12, 16, 20]) {
      const twa = beatAngle(W), b = testBoat({ heading: 360 - twa, kt: 4, windKt: W });
      b.crew = newCrew(crewOf(0.6), 'S'); b.cruising = true;
      let worst = 0;
      sail(b, 120, t => { b.h = 360 - twa; if (t > 30 && b.crew!.people.some(p => p.pose === 'companionway' && p.z < Z.companionway + 0.15)) worst = Math.max(worst, Math.abs(b.heel)); });
      expect(worst, `${W} kt`).toBeLessThan(16.5); // (out by 15°, give or take her settling as they go to the rail)
    }
    expect(go(crewOf(0.6), 8, 60, { cruising: true }).at).toBeGreaterThan(0); // (in moderate air, there)
  }, 60_000);
  it('a tack takes the forward hand off the doors: the jib sheet comes first', () => {
    let ref = 0;
    const tack = (shut: boolean) => {
      const twa = beatAngle(6), b = testBoat({ heading: 360 - twa, kt: 3, windKt: 6 });
      b.crew = newCrew(crewOf(0.6, { handling: 0.3 }), 'S'); b.cruising = true;
      if (shut) b.companionway = { doors: 'in', hatch: 'closed', doorsT: 0, hatchT: 0 };
      // (tack once the doors are under way: a fifth of the way out; the other boat at the same moment of her sailing)
      let at = 30; sail(b, 30, t => { b.h = 360 - twa; if (at === 30 && (shut ? (b.companionway?.doorsT ?? 0) > 0.2 : t >= ref)) at = t; return t >= at; });
      const cw = b.companionway, busy = b.crew!.people.some(p => p.job?.line === 'doors') || (!!cw && cw.doorsT > 0 && cw.doorsT < 1), js: number[] = [];
      startTack(b); sail(b, 12, () => { js.push(b.ctl.jibsheet); });
      return { b, busy, js, at };
    };
    const shut = tack(true); ref = shut.at; const open = tack(false);
    expect(shut.busy).toBe(true); // (the doors under way when the helm put the tiller over)
    // (the jib sheet worked through the tack as it is with the hatch already open)
    // (the jib sheet worked through the tack as it is with the hatch already open: from a second in, once the tack has
    // called them off the doors; before it, in a drifter, the sheet waited for them)
    // (the tack's big haul they leave the doors for at once; after it they go back to the doors, and leave them again for
    // the jib as she gathers way and it wants easing well out: about half a second behind, caught up within a second or
    // so. Frozen at the doors, before, it stayed where it was)
    shut.js.forEach((v, i) => { if (i > 60) expect(Math.abs(v - open.js[i])).toBeLessThan(0.15); });
    expect(Math.abs(shut.js[shut.js.length - 1] - open.js[open.js.length - 1])).toBeLessThan(0.03);
    sail(shut.b, 40); expect(shut.b.companionway).toEqual({ doors: 'out', hatch: 'open', doorsT: 1, hatchT: 1 }); // (and they open it afterwards)
  }, 30_000);
  it('after "Made!" the cabin crew trims the jib to the pole before it draws (the owner\'s sequence)', () => {
    const b = testBoat({ heading: 195, kt: 4, windKt: 10 }); b.crew = newCrew(crewOf(0.6), 'S'); b.poleWant = true;
    let setAt = -1, drawsAt = -1;
    sail(b, 60, t => { b.h = 195; if (setAt < 0 && b.pole === 'set') setAt = t; if (drawsAt < 0 && sailPlan(b) === 'wing') drawsAt = t; });
    expect(setAt).toBeGreaterThan(0);
    expect(drawsAt - setAt).toBeGreaterThan(POLE.trim * 0.8); expect(drawsAt - setAt).toBeLessThan(POLE.trim * 2);
  }, 30_000);
  it('the traveller: the middle crew\'s by their skill, else the helm\'s (the owner); a novice hardly ever, an expert always', () => {
    const share = (skill: number) => { let n = 0; for (let i = 0; i < 60; i++) { const sp = { helm: { ...DEFAULT_CREW.helm, h: 1.6 + i * 0.005 }, crew: DEFAULT_CREW.crew.map(p => ({ ...p, skill })) }; if (travellerHand(2, sp) === 1) n++; } return n / 60; };
    expect(share(0.95)).toBe(1); expect(share(0.2)).toBe(0);
    expect(share(0.6)).toBeGreaterThan(0.45); expect(share(0.6)).toBeLessThan(0.9);
    expect(travellerHand(0, DEFAULT_CREW)).toBe(0); // (alone: the helm)
  });
  it('at a tack the traveller car stays where it is on its track, then is hauled back up', () => {
    const twa = beatAngle(5), b = testBoat({ heading: 360 - twa, kt: 3, windKt: 5 }); b.crew = newCrew(crewOf(0.9), "S");
    sail(b, 20, () => { b.h = 360 - twa; });
    const before = b.ctl.traveller; expect(before).toBeLessThan(-0.1); // (to windward in light air: North Sails' guide)
    // (the step before she changes tack against the step after)
    startTack(b); let last = before, was = NaN, after = NaN;
    sail(b, 10, () => { if (b.tack === "P") { after = b.ctl.traveller; was = last; return true; } last = b.ctl.traveller; });
    expect(after).toBeCloseTo(-was, 2); // (now as far to leeward as it was to windward)
    sail(b, 20); expect(b.ctl.traveller).toBeLessThan(-0.1); // (hauled back up to windward on the new tack)
  }, 30_000);
  it('the traveller habit only grows with the middle crew\'s skill (the review: it flipped back and forth)', () => {
    for (let i = 0; i < 20; i++) {
      let had = 0;
      for (let k = 0; k <= 40; k++) {
        const sk = 0.2 + k * 0.02, sp = { helm: { ...DEFAULT_CREW.helm, h: 1.6 + i * 0.015 }, crew: DEFAULT_CREW.crew.map((p, j) => ({ ...p, skill: j === 0 ? sk : 0.6 })) };
        const has = travellerHand(2, sp); expect(has).toBeGreaterThanOrEqual(had); had = has;
      }
    }
  });
  it('overpowered, whoever has the traveller drops it before easing the sheet', () => {
    const twa = beatAngle(18), b = testBoat({ heading: 360 - twa, kt: 4.5, windKt: 18 }); b.crew = newCrew(crewOf(0.9), 'S');
    sail(b, 0.5); b.ctl.traveller = -1; b.ctl.mainsheet = 0; // (all in, the car hard up: she's heeling over)
    let moved = -1; sail(b, 15, t => { b.h = 360 - twa; if (moved < 0 && b.ctl.traveller > -0.95) moved = t; });
    expect(moved).toBeGreaterThan(0); expect(moved).toBeLessThan(3);
  }, 30_000);
  it('your pole eta: to "Made!" (the owner\'s figures), and the jib drawing after the trim', () => {
    const b = testBoat({ heading: 195, kt: 4, windKt: 10 }); b.crew = newCrew(crewOf(0.6), 'S'); b.crew.people[2].z = Z.mast;
    expect(poleEta(b).set).toBeCloseTo(POLE.set, 1); expect(poleEta(b).draws).toBeCloseTo(POLE.set + POLE.trim, 1);
  });
});
