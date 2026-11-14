import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, SPOT_MAX, World, madeGood, spotLeadTime } from '../src/sim/world';
import { place, spotId } from '../src/sim/places';
import { onLand } from '../src/geo/shore';
import { LL } from '../src/geo/geo';
import { beatAngle, polar } from '../src/boat/polar';
import { brg, clamp, dist, wrap } from '../src/core/math';

// Racing from a spot picked on the chart (the owner, 14 Nov 2026: "start in slip or somewhere else")
const race = (o: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', mode: 'race', boats: [DEFAULT_BOAT], boat: DEFAULT_BOAT, boatId: DEFAULT_BOAT.id, tideDate: '2026-11-14', opponents: [], fleet: 0, traffic: 0, ...o });

describe('Start: somewhere else', () => {
  it('speed made good toward the line: to windward the VMG over the angle off the wind, continuous at the beat angle', () => {
    const b = beatAngle(10);
    expect(madeGood(10, 0)).toBeCloseTo(polar(10, b) * Math.cos(b * Math.PI / 180), 6);
    expect(madeGood(10, b - 1e-6)).toBeCloseTo(madeGood(10, b + 1e-6), 2);
    expect(madeGood(10, 90)).toBeCloseTo(polar(10, 90), 6); // a reach: straight there
    expect(madeGood(10, 0)).toBeLessThan(madeGood(10, 90)); expect(madeGood(10, 180)).toBeLessThan(madeGood(10, 120));
  });

  it('the first guess: farther takes longer; a beat and a run longer than a reach; rounded to 5 min, 5 at least', () => {
    const line = { x: 0, y: 0 }; // +y is north: with the wind from the north (0°), a spot to the south beats up to the line
    const beat = spotLeadTime({ x: 0, y: -3000 }, line, 0, 10), run = spotLeadTime({ x: 0, y: 3000 }, line, 0, 10), reach = spotLeadTime({ x: 3000, y: 0 }, line, 0, 10);
    expect(beat).toBeGreaterThan(reach); expect(run).toBeGreaterThan(reach);
    expect(spotLeadTime({ x: 6000, y: 0 }, line, 0, 10)).toBeGreaterThan(reach);
    expect(spotLeadTime({ x: 50, y: 0 }, line, 0, 10)).toBe(5 * 60);
    for (const t of [beat, run, reach]) expect(t % 300).toBe(0);
  });

  it('she starts at the spot, sailing on a sailable angle in the wind there, with time to reach the line', () => {
    const at = LL(37.8150, -122.4500); // off Crissy Field
    expect(onLand(at)).toBe(false);
    for (const o of [{ windKt: 0 }, { windKt: 12, current: 'bigebb' }, { windKt: 0, windKind: 'auto' as const }, { windKt: 5, current: 'bigebb' }] as Partial<Settings>[]) {
      const S = race({ raceFrom: 'spot', raceSpot: spotId(at), ...o }), w = new World(COURSES[0], S, 1), u = w.user;
      expect(w.fromSpot).not.toBeNull();
      expect(dist(u, at)).toBeLessThan(2); expect(u.docked).toBeFalsy(); expect(u.v).toBeGreaterThan(0.3);
      const lead = w.startAt - S.seq * 60;
      expect(lead).toBeGreaterThanOrEqual(5 * 60); expect(lead).toBeLessThanOrEqual(SPOT_MAX); expect(lead % 300).toBe(0);
      w.step(DT);
      // not pinched: free of close-hauled in the wind she has (the reviewer: a southerly day put her head to wind)
      expect(u.twa).toBeGreaterThan(beatAngle(Math.max(1, u.ww.kt)) - 2);
    }
  });

  it('sailed to the line on a reach in a set wind and an ebb, she gets there before the warning signal', () => {
    // north of the line, out on the Bay: the line is south of her, the westerly abeam
    const S0 = race({ windKt: 12, current: 'bigebb' }), w0 = new World(COURSES[0], S0, 1), c = w0.C.center, at = { x: c.x, y: c.y + 2500 };
    expect(onLand(at)).toBe(false);
    const S = race({ windKt: 12, current: 'bigebb', raceSpot: spotId(at), raceFrom: 'spot' }), w = new World(COURSES[0], S, 1), u = w.user;
    expect(w.fromSpot).not.toBeNull();
    const off = Math.abs(wrap(brg(c.x - at.x, c.y - at.y) - w.wind.from));
    expect(off).toBeGreaterThan(beatAngle(w.wind.kt) + 5); expect(off).toBeLessThan(140); // (a reach: no tacks to script)
    // the helm: steered for the line's middle, the tiller to port to turn to starboard
    let arrived: number | null = null;
    while (w.t < -S.seq * 60 && arrived == null) {
      const want = brg(c.x - u.x, c.y - u.y), err = wrap(want - u.h);
      u.tiller = clamp(-err / 20, -1, 1);
      w.step(DT);
      if (dist(u, c) < 150) arrived = w.t;
    }
    expect(arrived, `still ${dist(u, c).toFixed(0)} m off at the warning signal`).not.toBeNull();
  }, 300000);

  it('too far to sail to the line in two hours: by the line, and the World says so', () => {
    const far = LL(37.9200, -122.3900); // off Point San Pablo, about 13 km up the Bay, in a light breeze
    expect(onLand(far)).toBe(false);
    const S = race({ windKt: 4, raceFrom: 'spot', raceSpot: spotId(far) }), w = new World(COURSES[0], S, 1);
    expect(w.fromSpot).toBeNull(); expect(w.spotTooFar).toBe(true); expect(w.startAt).toBe(S.seq * 60);
  });

  it('a spot on land, off the chart, or none starts by the line as usual', () => {
    const land = LL(37.8020, -122.4400); // the Marina District
    expect(onLand(land)).toBe(true);
    for (const raceSpot of [spotId(land), 'at:0.00000,0.00000', undefined, 'nowhere']) {
      const S = race({ raceFrom: 'spot', raceSpot }), w = new World(COURSES[0], S, 1);
      expect(w.fromSpot).toBeNull(); expect(w.startAt).toBe(S.seq * 60);
    }
  });

  it('a named place on the water works as a spot (the default, the Cityfront)', () => {
    const S = race({ raceFrom: 'spot', raceSpot: 'cityfront' }), w = new World(COURSES[0], S, 1);
    expect(w.fromSpot).not.toBeNull();
    expect(dist(w.user, place('cityfront')!.p)).toBeLessThan(2);
  });
});
