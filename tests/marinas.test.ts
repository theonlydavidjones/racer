import { describe, expect, it } from 'vitest';
import { segPt } from '../src/core/math';
import { HARBORS, SLIPS, berthClear, harborAt, harborOf, hitsHarbor, inBasin, pushOffPlan, pushOffPoses, slipById, slipsIn } from '../src/geo/marina';
import { onLand } from '../src/geo/shore';
import { SeaField, fetchAt } from '../src/environment/sea';
import type { Wind } from '../src/environment/wind';
import { LL } from '../src/geo/geo';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT, fixSpec } from '../src/boat/spec';
import { DT, World, slipLeadTime } from '../src/sim/world';

/** Open water off each harbor's entrance. */
const OFFSHORE: Record<string, [number, number]> = {
  'gashouse-cove': [37.8105, -122.4335], // north of the entrance, off Fort Mason's Pier 1
  'south-beach': [37.7830, -122.3810], // off the breakwater, toward the Bay Bridge
  corinthian: [37.8705, -122.4540], // Raccoon Strait, off the club's breakwater
  'horseshoe-bay': [37.8310, -122.4775] // off the bay's mouth, toward the Golden Gate Bridge
};
const NEW = Object.keys(OFFSHORE);

describe('the other marinas: Gashouse Cove, South Beach, the Corinthian, Horseshoe Bay', () => {
  it('each a basin you can sail in, with its docks solid, and slips a Folkboat fits', () => {
    for (const id of NEW) {
      const H = harborOf(id)!, slips = slipsIn(id);
      expect(H.walkways.length).toBeGreaterThan(2);
      expect(slips.length).toBeGreaterThan({ corinthian: 40, 'horseshoe-bay': 60 }[id] ?? 200);
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
  it('Gashouse Cove\'s seawall (NOAA ENC US5CA13M: breakwater along the north side, hooking out to the entrance light) is a solid concrete wall; the entrance between it and Pier 1 is open', () => {
    const H = harborOf('gashouse-cove')!;
    expect(H.breakwaters.filter(b => b.area).length).toBe(2);
    expect(onLand(LL(37.80789, -122.4345))).toBe(true); // the main wall, 2 m out from its harbor face
    expect(onLand(LL(37.807885, -122.4345))).toBe(true); expect(onLand(LL(37.80792, -122.4345))).toBe(false); // 3 m wide
    expect(onLand(LL(37.808042, -122.433258))).toBe(true); // the hook
    expect(H.breakwaters.filter(b => b.seawall).length).toBe(2);
    expect(onLand(LL(37.80790, -122.43272))).toBe(false); // the entrance
    expect(H.beacons.some(b => b.colour === 'red' && Math.hypot(b.p.x - LL(37.807983, -122.432906).x, b.p.y - LL(37.807983, -122.432906).y) < 8)).toBe(true); // East Yacht Harbor Light 2 (on the arm's end, within the chart's precision)
    // and the cove is sheltered: a north-westerly's chop and the swell barely get in, while outside they run
    const sea = new SeaField({ hs: 1.5, tp: 12, from: 270 } as never), nw = { from: 315, kt: 18 } as Wind, still = () => ({ x: 0, y: 0 });
    const inside = sea.at(LL(37.8075, -122.4345), nw, still(), still), outside = sea.at(LL(37.8095, -122.4340), nw, still(), still);
    expect(inside.hsW).toBeLessThan(0.25 * outside.hsW); expect(inside.hsS).toBeLessThan(0.25 * outside.hsS);
  });
  it('Horseshoe Bay: no sailing off the basin onto the shore (only out west, into the rest of the bay); sheltered from a south-westerly by its breakwater', () => {
    const H = harborOf('horseshoe-bay')!, start = LL(37.8327, -122.4748), key = (p: { x: number; y: number }) => `${Math.round(p.x)},${Math.round(p.y)}`;
    expect(harborAt(start)?.id).toBe('horseshoe-bay');
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
    // the only way off it: across its open west side (its longest edge, the outline's line across the water), nowhere else
    const edges = H.basin.map((p, i) => [p, H.basin[(i + 1) % H.basin.length]] as const), [wa, wb] = edges.reduce((m, e) => Math.hypot(e[1].x - e[0].x, e[1].y - e[0].y) > Math.hypot(m[1].x - m[0].x, m[1].y - m[0].y) ? e : m);
    expect(Math.hypot(wb.x - wa.x, wb.y - wa.y)).toBeGreaterThan(150);
    expect(leaks.length).toBeGreaterThan(0);
    for (const q of leaks) expect(segPt(q, wa, wb)).toBeLessThan(2);
    const sea = new SeaField({ hs: 1.5, tp: 12, from: 270 } as never), sw = { from: 215, kt: 18 } as Wind, still = () => ({ x: 0, y: 0 });
    const inside = sea.at(LL(37.8322, -122.4745), sw, still(), still), outside = sea.at(LL(37.8305, -122.4745), sw, still(), still);
    expect(inside.hsW).toBeLessThan(0.3 * outside.hsW);
    expect(inside.hsS).toBeLessThan(0.3 * outside.hsS);
    // and no shadow of the 50 m terrain grid lying across it: the swell (from the south-south-west, so the breakwater shades
    // both) about the same in line with the entrance as tucked behind the breakwater (it was 8 times less)
    const open = sea.at({ x: -2804, y: 2479 }, sw, still(), still), tucked = sea.at({ x: -2742, y: 2412 }, sw, still(), still); // (in line with the entrance; behind the breakwater)
    expect(open.hsS).toBeGreaterThan(0.5 * tucked.hsS);
  });
  it('the sea by a harbor is open water\'s, and the same whichever point asks first (the same seed, the same race)', () => {
    // just north of West Harbor's breakwater, by the GGYC line: its 150 m cell's node lies in the basin
    const p = { x: 224, y: -230 }; expect(inBasin(p)).toBe(false); expect(inBasin({ x: 150, y: -300 })).toBe(true);
    expect(new SeaField({ hs: 1, tp: 12, from: 270 } as never).fetch(p, 315)).toBeGreaterThan(2000);
    for (const [a, b] of [[{ x: 224, y: -230 }, { x: 260, y: -250 }], [{ x: 3000, y: 1000 }, { x: 3060, y: 1040 }], [LL(37.8075, -122.4345), LL(37.80752, -122.43448)]]) {
      const s1 = new SeaField({ hs: 1, tp: 12, from: 270 } as never), s2 = new SeaField({ hs: 1, tp: 12, from: 270 } as never);
      const one = [s1.fetch(a, 300), s1.fetch(b, 300)], two = [s2.fetch(b, 300), s2.fetch(a, 300)];
      expect(one).toEqual([two[1], two[0]]);
    }
    expect(new SeaField({ hs: 1, tp: 12, from: 270 } as never).fetch(p, 315)).toBe(fetchAt(p, 316, false)); // (worked out where she is, not at the node in the basin)
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
  it('push off, from every berth in every marina: in the fairway, clear of the docks and the boats, pointed at a way out, free to steer out', () => {
    for (const H of HARBORS) {
      // where a Folkboat can steer to the way out from: a flood from the harbor's exits over water with room for her beam
      const step = 1.5, key = (p: { x: number; y: number }) => `${Math.round(p.x / step)},${Math.round(p.y / step)}`;
      const roomy = (q: { x: number; y: number }) => [[0, 0], [1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1]].every(([dx, dy]) => !onLand({ x: q.x + dx, y: q.y + dy }));
      // (from the basin's roomy water nearest each way out, over the basin's water)
      const seen = new Map<string, number>(); let fr: { x: number; y: number }[] = [], n = 0;
      for (const e of H.exits) {
        let best: { x: number; y: number } | null = null;
        for (let x = Math.round(H.box.x0 / step) * step; x <= H.box.x1; x += step) for (let y = Math.round(H.box.y0 / step) * step; y <= H.box.y1; y += step)
          if (harborAt({ x, y }) === H && roomy({ x, y }) && (!best || Math.hypot(x - e.x, y - e.y) < Math.hypot(best.x - e.x, best.y - e.y))) best = { x, y };
        if (best) { seen.set(key(best), 0); fr.push(best); }
      }
      while (fr.length) { n++;
        const nx: typeof fr = [];
        for (const p of fr) for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
          const q = { x: p.x + dx, y: p.y + dy }, k = key(q);
          if (seen.has(k) || harborAt(q) !== H || !roomy(q)) continue;
          seen.set(k, n); nx.push(q);
        }
        fr = nx;
      }
      // how far she'd have to go from here to the way out, along the water (steps of 1.5 m); Infinity if she can't
      const togo = (q: { x: number; y: number }) => { const g = { x: Math.round(q.x / step) * step, y: Math.round(q.y / step) * step }; return Math.min(...[[0, 0], [step, 0], [-step, 0], [0, step], [0, -step]].map(([dx, dy]) => seen.get(key({ x: g.x + dx, y: g.y + dy })) ?? Infinity)); };
      let good = 0, exitward = 0, swung = 0; const slips = slipsIn(H.id), bad: string[] = [];
      for (const s of slips) {
        const p = pushOffPlan(s), poses = pushOffPoses(s, p), { c, h } = poses[poses.length - 1];
        // every pose on the way clear of every dock and of the boats in the other slips (as drawn)
        let ok = poses.every(q => berthClear(q.c, q.h, s));
        if (p.kind !== 'off') ok &&= Math.hypot(c.x - s.p.x, c.y - s.p.y) - 0.45 * s.finger >= 3.8 || p.kind === 'spring'; // her whole hull out of the slip
        const v = { x: Math.sin(h * Math.PI / 180), y: Math.cos(h * Math.PI / 180) };
        if (p.kind === 'astern') ok &&= Number.isFinite(togo(c)); // shoved off astern: into water she can steer out of, stern first
        else {
          ok &&= [2, 4, 6].every(d => berthClear({ x: c.x + v.x * d, y: c.y + v.y * d }, h, s)); // at least a boat's length of clear water ahead
          ok &&= Number.isFinite(togo(c)); // and somewhere she can steer out from
          if (p.kind === 'spring') swung++;
          if (p.kind === 'off' || togo({ x: c.x + v.x * 12, y: c.y + v.y * 12 }) <= togo(c)) exitward++; // (no further from the way out, along the water: where either way round is as far, either will do)
        }
        if (ok) good++; else bad.push(s.label);
      }
      expect(good / slips.length, `${H.id}: ${bad.slice(0, 12).join(' ')}`).toBeGreaterThan(0.97);
      // sprung off and pointed toward the way out (along the water) from most; the rest down open fairway, or shoved off astern
      expect(exitward / slips.length, `${H.id}: toward the way out`).toBeGreaterThan(0.8);
      expect(swung / slips.filter(s => s.kind === 'bow-in').length, `${H.id}: sprung off`).toBeGreaterThan(0.8); // (the rest shoved off astern: their fairway's too narrow to swing her)
    }
  }, 120000);
  it('the wind: she isn\'t left head to wind where there\'s another way to turn her; at an end tie her bow is pushed off, and the crew says to hoist the main', () => {
    const head = (h: number, from: number) => Math.abs(((from - h + 540) % 360) - 180) < 45;
    let choice = 0, avoided = 0;
    for (const s of SLIPS.filter((_, i) => i % 3 === 0)) for (const from of [270, 225, 0]) { // (a third of the berths, each in three winds)
      const p = pushOffPlan(s, from); if (p.kind !== 'spring') continue;
      const still = pushOffPlan(s); // (with no wind: which way she'd be turned)
      if (still.kind === 'spring' && head(still.h, from)) { choice++; if (!head(p.h, from)) avoided++; }
      if (!p.headToWind) expect(head(p.h, from)).toBe(false);
    }
    expect(choice).toBeGreaterThan(30); expect(avoided / choice).toBeGreaterThan(0.8);
    // West Harbor's M end tie points west, into the westerly: pushed off, her bow goes off the wind, and she's told to get the main up if she's still close to it
    const end = SLIPS.find(s => s.kind === 'alongside' && head(s.heading, 270));
    if (end) { const p = pushOffPlan(end, 270); expect(p.h === end.heading ? p.headToWind : true).toBe(true); expect(Math.abs(((p.h - end.heading + 540) % 360) - 180)).toBeGreaterThan(p.headToWind ? -1 : 10); }
  }, 60000);
  it('end ties: berths alongside the free ends of the docks, bow out, which push off forward', () => {
    const ends = SLIPS.filter(s => s.kind === 'alongside');
    expect(ends.length).toBeGreaterThan(10);
    for (const s of ends) {
      const p = pushOffPlan(s); expect(p.kind).toBe('off'); expect(p.h).toBe(s.heading);
      expect(pushOffPoses(s, p).every(q => berthClear(q.c, q.h, s))).toBe(true); // pushed off clear of everything, all the way out
    }
    // in her end tie and pushed off: she goes off forward, touching nothing
    const s = ends[0], boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
    const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' };
    const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
    expect(u.docked).toBeTruthy(); expect(u.h).toBe(s.heading);
    w.pushOff(); for (let i = 0; i < 60 * 20; i++) { w.step(DT); expect(hitsHarbor(u)).toBe(false); }
    const f = { x: Math.sin(s.heading * Math.PI / 180), y: Math.cos(s.heading * Math.PI / 180) };
    expect((u.x - s.p.x) * f.x + (u.y - s.p.y) * f.y).toBeGreaterThan(4); // forward, out past the dock's end
    // and home again: alongside, bow out (heading in, she's told to come alongside heading out)
    w.t = 300; Object.assign(u, { x: s.p.x + f.x * 30, y: s.p.y + f.y * 30 }); w.step(DT); // (she's been away)
    Object.assign(u, { x: s.p.x, y: s.p.y, h: s.heading + 180, v: 0.2, astern: 0 }); w.step(DT);
    expect(w.arrivedT).toBeNull();
    Object.assign(u, { x: s.p.x, y: s.p.y, h: s.heading + 8, v: 0.2 }); w.step(DT);
    expect(w.arrivedT).not.toBeNull(); expect(u.docked).toBeTruthy();
  });
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
      for (let i = 0; i < 60 * 120 && u.handled; i++) { w.step(DT); expect(hitsHarbor(u)).toBe(false); }
      for (let i = 0; i < 60 * 10; i++) { w.step(DT); expect(hitsHarbor(u)).toBe(false); }
      expect(u.handled).toBeUndefined(); expect(u.v).toBeGreaterThan(0.2); // under her own way, steerable
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
    expect(HARBORS.map(h => h.id)).toEqual(['west-harbor', 'gashouse-cove', 'south-beach', 'corinthian', 'horseshoe-bay']);
  });
});
