import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { World, spotLeadTime } from '../src/sim/world';
import { place, spotId } from '../src/sim/places';
import { onLand } from '../src/geo/shore';
import { LL } from '../src/geo/geo';
import { beatAngle, polar } from '../src/boat/polar';
import { brg, wrap } from '../src/core/math';

// Racing from a spot picked on the chart (the owner, 14 Nov 2026: "start in slip or somewhere else")
const race = (o: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', mode: 'race', boats: [DEFAULT_BOAT], boat: DEFAULT_BOAT, boatId: DEFAULT_BOAT.id, tideDate: '2026-11-14', ...o });

describe('Start: somewhere else', () => {
  it('the lead time: farther takes longer; to windward longer than on a reach; rounded to 5 min, 5 at least', () => {
    const line = { x: 0, y: 0 };
    // wind from the north (0°): a spot 2 km south is a run to the line; 2 km north, a beat; 2 km east, a reach
    const beat = spotLeadTime({ x: 0, y: 2000 }, line, 0, 10), reach = spotLeadTime({ x: 2000, y: 0 }, line, 0, 10);
    expect(beat).toBeGreaterThan(reach);
    expect(spotLeadTime({ x: 4000, y: 0 }, line, 0, 10)).toBeGreaterThan(reach);
    expect(spotLeadTime({ x: 50, y: 0 }, line, 0, 10)).toBe(5 * 60);
    for (const t of [beat, reach]) expect(t % 300).toBe(0);
    // a 2 km beat in 10 kt: the polar's VMG, a tenth more for the tacks, 2 min to settle
    const vmg = polar(10, beatAngle(10)) * Math.cos(beatAngle(10) * Math.PI / 180), min = 2000 * 1.1 / vmg / 60 + 2;
    expect(beat).toBe(Math.ceil(min / 5) * 5 * 60);
    expect(spotLeadTime({ x: 0, y: 40000 }, line, 0, 1)).toBe(120 * 60); // (two hours at most, as from a slip)
  });

  it('she starts at the spot, sailing, with time to sail to the line before the warning signal', () => {
    const at = LL(37.8150, -122.4500); // off Crissy Field, on the water
    expect(onLand(at)).toBe(false);
    const S = race({ raceFrom: 'spot', raceSpot: spotId(at) }), w = new World(COURSES[0], S, 1), u = w.user;
    expect(w.fromSpot).not.toBeNull();
    expect(Math.hypot(u.x - at.x, u.y - at.y)).toBeLessThan(2);
    expect(u.docked).toBeFalsy(); expect(u.v).toBeGreaterThan(0.5);
    // her heading: a sailable angle, no closer to the wind than the polar's beat
    expect(Math.abs(wrap(u.h - w.wind.from))).toBeGreaterThanOrEqual(beatAngle(w.wind.kt) - 0.5);
    const lead = w.startAt - S.seq * 60;
    expect(lead).toBeGreaterThanOrEqual(5 * 60);
    // headed for the line where she can lay it
    const to = brg(w.C.center.x - at.x, w.C.center.y - at.y), off = Math.abs(wrap(to - w.wind.from));
    if (off > beatAngle(w.wind.kt) + 2 && off < 150) expect(Math.abs(wrap(u.h - to))).toBeLessThan(2);
  });

  it('a spot on land, or none, starts by the line as usual', () => {
    const land = LL(37.8020, -122.4400); // the Marina District
    expect(onLand(land)).toBe(true);
    for (const raceSpot of [spotId(land), undefined, 'nowhere']) {
      const S = race({ raceFrom: 'spot', raceSpot }), w = new World(COURSES[0], S, 1);
      expect(w.fromSpot).toBeNull(); expect(w.startAt).toBe(S.seq * 60);
    }
  });

  it('a named place on the water works as a spot (the default, the Cityfront)', () => {
    const S = race({ raceFrom: 'spot', raceSpot: 'cityfront' }), w = new World(COURSES[0], S, 1);
    expect(w.fromSpot).not.toBeNull();
    expect(Math.hypot(w.user.x - place('cityfront')!.p.x, w.user.y - place('cityfront')!.p.y)).toBeLessThan(2);
  });
});
