import { describe, expect, it } from 'vitest';
import { HARBORS, SLIPS, harborAt, harborOf, hitsHarbor, hullClear, inBasin, pushOffPlan, slipById, slipsIn } from '../src/geo/marina';
import { onLand } from '../src/geo/shore';
import { SeaField } from '../src/environment/sea';
import type { Wind } from '../src/environment/wind';
import { LL } from '../src/geo/geo';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT, fixSpec } from '../src/boat/spec';
import { DT, World, midFairway, slipLeadTime } from '../src/sim/world';

/** Open water off each harbor's entrance. */
const OFFSHORE: Record<string, [number, number]> = {
  'gashouse-cove': [37.8105, -122.4335], // north of the entrance, off Fort Mason's Pier 1
  'south-beach': [37.7830, -122.3810], // off the breakwater, toward the Bay Bridge
  corinthian: [37.8705, -122.4540] // Raccoon Strait, off the club's breakwater
};
const NEW = Object.keys(OFFSHORE);

describe('the other marinas: Gashouse Cove, South Beach, the Corinthian', () => {
  it('each a basin you can sail in, with its docks solid, and slips a Folkboat fits', () => {
    for (const id of NEW) {
      const H = harborOf(id)!, slips = slipsIn(id);
      expect(H.walkways.length).toBeGreaterThan(2);
      expect(slips.length).toBeGreaterThan(id === 'corinthian' ? 40 : 200);
      for (const s of slips) { expect(onLand(s.p)).toBe(false); expect(harborAt(s.p)?.id).toBe(id); }
      const w = H.walkways.find(w => w.length === 2) ?? H.walkways[0], mid = { x: (w[0].x + w[1].x) / 2, y: (w[0].y + w[1].y) / 2 };
      expect(onLand(mid)).toBe(true); // a dock
      expect(onLand(LL(...OFFSHORE[id]))).toBe(false); // the Bay outside
    }
    expect(new Set(SLIPS.map(s => s.id)).size).toBe(SLIPS.length); // unique across the marinas
  });
  it('real dock letters where they are published: South Beach A to G; the Corinthian\'s A dock along the breakwater, A14 at its end', () => {
    expect([...new Set(slipsIn('south-beach').map(s => s.dock))].sort().join('')).toBe('ABCDEFG');
    const sb = (d: string) => slipsIn('south-beach').filter(s => s.dock === d).reduce((a, s) => a + s.p.y, 0) / slipsIn('south-beach').filter(s => s.dock === d).length;
    expect(sb('A')).toBeGreaterThan(sb('G')); // A is the northernmost, by Pier 40
    const cyc = slipsIn('corinthian'), A = cyc.filter(s => s.dock === 'A');
    expect(A.length).toBe(14);
    expect(Math.max(...A.map(s => s.p.y))).toBeLessThan(Math.min(...cyc.filter(s => s.dock !== 'A').map(s => s.p.y))); // the southernmost line
    const a14 = slipById('corinthian:A14')!; expect(a14.p.x).toBe(Math.max(...A.map(s => s.p.x))); // at the end, by the entrance
  });
  it('the breakwaters and docks are solid where they stand outside a basin too', () => {
    // South Beach's breakwater, east of the basin
    const bw = harborOf('south-beach')!.breakwaters.find(b => !b.area)!, p = bw.pts[1];
    expect(inBasin(p)).toBe(false); expect(hitsHarbor(p)).toBe(true); expect(onLand(p)).toBe(true);
  });
  it('their walls are where they really are: South Beach\'s fishing pier, the Corinthian\'s shore, Fort Mason\'s Pier 1', () => {
    for (const t of [0.3, 0.7]) expect(onLand(LL(37.7784719 + (37.7783532 - 37.7784719) * t, -122.3853896 + (-122.3873783 + 122.3853896) * t))).toBe(true); // the fishing pier (OSM), the harbor's south side
    expect(onLand(LL(37.77815, -122.3849))).toBe(false); // and the way in at the south end, between it and the breakwater
    // the Corinthian: no sailing out of the basin onto the waterfront: from inside, the only way onto water outside the basin is its entrance
    const H = harborOf('corinthian')!, start = LL(37.8718, -122.4560), key = (p: { x: number; y: number }) => `${Math.round(p.x)},${Math.round(p.y)}`;
    const seen = new Set([key(start)]); let fr = [start]; const leaks: { x: number; y: number }[] = [];
    while (fr.length) {
      const nx: typeof fr = [];
      for (const p of fr) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const q = { x: p.x + dx, y: p.y + dy }, k = key(q);
        if (seen.has(k) || onLand(q)) continue;
        seen.add(k);
        if (harborAt(q) === H) nx.push(q); else leaks.push(q);
      }
      fr = nx;
    }
    expect(leaks.length).toBeGreaterThan(0);
    for (const q of leaks) expect(Math.hypot(q.x - H.exits[0].x, q.y - H.exits[0].y)).toBeLessThan(60);
      // Pier 1 ends where OpenStreetMap has it, with open water north of its end
    expect(onLand(LL(37.8084, -122.4325))).toBe(true); expect(onLand(LL(37.8092, -122.4324))).toBe(false);
    // and Piers 2 and 3 too (OpenStreetMap's coast), with water between them and north of their ends
    for (const [la, lo] of [[37.8088, -122.4315], [37.8090, -122.4304]]) expect(onLand(LL(la, lo))).toBe(true);
    for (const [la, lo] of [[37.8095, -122.4316], [37.8095, -122.4304], [37.8088, -122.43185]]) expect(onLand(LL(la, lo))).toBe(false);
  });
  it('Gashouse Cove\'s seawall (NOAA ENC US5CA13M: breakwater along the north side, hooking out to the entrance light) is solid rock; the entrance between it and Pier 1 is open', () => {
    const H = harborOf('gashouse-cove')!;
    expect(H.breakwaters.filter(b => b.area).length).toBe(2);
    expect(onLand(LL(37.80790, -122.4345))).toBe(true); // the main wall, 3 m out from its harbor face
    expect(onLand(LL(37.80806, -122.43320))).toBe(true); // the hook
    expect(onLand(LL(37.80790, -122.43272))).toBe(false); // the entrance
    expect(H.beacons.some(b => b.colour === 'red' && Math.hypot(b.p.x - LL(37.807983, -122.432906).x, b.p.y - LL(37.807983, -122.432906).y) < 1)).toBe(true); // East Yacht Harbor Light 2
    // and the cove is sheltered: a north-westerly's chop and the swell barely get in, while outside they run
    const sea = new SeaField({ hs: 1.5, tp: 12, from: 270 } as never), nw = { from: 315, kt: 18 } as Wind, still = () => ({ x: 0, y: 0 });
    const inside = sea.at(LL(37.8075, -122.4345), nw, still(), still), outside = sea.at(LL(37.8095, -122.4340), nw, still(), still);
    expect(inside.hsW).toBeLessThan(0.25 * outside.hsW); expect(inside.hsS).toBeLessThan(0.25 * outside.hsS);
  });
  it('the way out from every slip to the open Bay (a fine path search from offshore)', () => {
    for (const id of NEW) {
      const goal = LL(...OFFSHORE[id]), step = 1.5, key = (p: { x: number; y: number }) => `${Math.round(p.x / step)},${Math.round(p.y / step)}`;
      const seen = new Set([key(goal)]); let fr = [goal];
      for (let i = 0; i < 4000 && fr.length; i++) {
        const nx: typeof fr = [];
        for (const p of fr) for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
          const q = { x: p.x + dx, y: p.y + dy }, k = key(q);
          if (seen.has(k) || onLand(q) || Math.hypot(q.x - goal.x, q.y - goal.y) > 1500) continue;
          seen.add(k); nx.push(q);
        }
        fr = nx;
      }
      const slips = slipsIn(id);
      expect(slips.filter(s => seen.has(key(s.p))).length).toBe(slips.length);
    }
  }, 60000);
  it('room to push off and swing her round from nearly every slip', () => {
    for (const id of NEW) {
      let ok = 0; const slips = slipsIn(id);
      for (const s of slips) {
        const p = pushOffPlan(s), c = { x: s.p.x - Math.sin(s.heading * Math.PI / 180) * p.back, y: s.p.y - Math.cos(s.heading * Math.PI / 180) * p.back };
        const v = { x: Math.sin(p.h * Math.PI / 180), y: Math.cos(p.h * Math.PI / 180) };
        if (hullClear(c, p.h) && [2, 4, 6, 8, 10].every(d => hullClear({ x: c.x + v.x * d, y: c.y + v.y * d }, p.h))) ok++;
      }
      expect(ok / slips.length).toBeGreaterThan(0.97);
    }
  }, 60000);
  it('Cruise from her slip in each: made fast; push off clear astern to the fairway; home bow first', () => {
    for (const id of NEW) {
      const slips = slipsIn(id), slip = slips[Math.floor(slips.length / 3)], boat = { ...DEFAULT_BOAT, marina: id, slip: slip.id };
      const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' };
      const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
      expect(w.homeSlip?.id).toBe(slip.id); expect(u.docked).toBeTruthy(); expect(Math.hypot(u.x - slip.p.x, u.y - slip.p.y)).toBeLessThan(0.01);
      for (let i = 0; i < 120; i++) w.step(DT);
      expect(Math.hypot(u.x - slip.p.x, u.y - slip.p.y)).toBeLessThan(0.01); // made fast
      expect(w.pushOff()).toBe(true);
      expect(u.pushing).toBeTruthy(); expect(Math.abs(u.pushing!.lat - 2)).toBeLessThan(0.6); // her own finger, in her own harbor
      for (let i = 0; i < 60 * 40 && (u.astern ?? 0) > 0; i++) { w.step(DT); expect(hitsHarbor(u)).toBe(false); }
      const back = -((u.x - slip.p.x) * Math.sin(slip.heading * Math.PI / 180) + (u.y - slip.p.y) * Math.cos(slip.heading * Math.PI / 180));
      expect(Math.abs(back - midFairway(slip))).toBeLessThan(1.5);
      w.t = 300; Object.assign(u, { x: slip.p.x, y: slip.p.y, h: slip.heading + 10, v: 0.2, astern: 0 }); w.step(DT);
      expect(w.arrivedT).not.toBeNull(); expect(u.docked).toBeTruthy();
    }
  });
  it('Race from her slip at South Beach or Tiburon: time enough to sail the 5–7 km to the line', () => {
    for (const id of ['south-beach', 'corinthian']) {
      const slip = slipsIn(id)[5], boat = { ...DEFAULT_BOAT, marina: id, slip: slip.id };
      const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', mode: 'race', raceFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14' };
      const w = new World(COURSES[0], S, 1), u = w.user, lead = slipLeadTime(slip, w.C.center);
      const km = Math.hypot(w.C.center.x - slip.p.x, w.C.center.y - slip.p.y) / 1000;
      expect(km).toBeGreaterThan(4.5);
      expect(lead / 60).toBeGreaterThan(km * 1000 * 1.2 / (3.5 * 0.514) / 60); // at 3.5 kt, a little more than the straight line
      expect(lead).toBeLessThanOrEqual(120 * 60);
      expect(u.docked).toBeTruthy(); expect(w.startAt).toBe(S.seq * 60 + lead);
      for (let i = 0; i < 60 * 10; i++) w.step(DT);
      expect(Number.isFinite(w.wind.from) && Number.isFinite(u.x)).toBe(true);
    }
  });
  it('older saves: a bare slip is one of West Harbor\'s, and her marina follows her slip', () => {
    const wh = slipsIn('west-harbor')[0];
    expect(slipById(wh.label)?.id).toBe(wh.id);
    expect(fixSpec({ ...DEFAULT_BOAT, slip: wh.label, marina: undefined })).toMatchObject({ marina: 'west-harbor', slip: wh.id });
    expect(fixSpec({ ...DEFAULT_BOAT, slip: 'south-beach:C12' })).toMatchObject({ marina: 'south-beach', slip: 'south-beach:C12' });
    expect(HARBORS.map(h => h.id)).toEqual(['west-harbor', 'gashouse-cove', 'south-beach', 'corinthian']);
  });
});
