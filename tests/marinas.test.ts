import { describe, expect, it } from 'vitest';
import { segPt } from '../src/core/math';
import { HARBORS, SLIPS, berthClear, WIND_SWINGS, harborAt, harborOf, hitsHarbor, inBasin, pushOffPlan, pushOffPoses, slipById, slipsIn } from '../src/geo/marina';
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
  it('the wind: held by the bow, her stern swings downwind, so she comes round toward the wind; head to wind she\'s held there for the main; an end tie\'s bow is pushed off the wind', () => {
    const rel = (from: number, h: number) => ((from - h + 540) % 360) - 180;
    let n = 0, held = 0;
    for (const s of SLIPS.filter((_, i) => i % 3 === 0)) for (const from of [270, 225, 0]) {
      const p = pushOffPlan(s, from, 15); if (p.kind !== 'swing') continue;
      if (15 * Math.abs(Math.sin(rel(from, s.heading) * Math.PI / 180)) < WIND_SWINGS) continue;
      n++;
      expect(Math.sign(p.turn)).toBe(Math.sign(rel(from, s.heading))); // (the bow comes round toward the wind: the stern goes downwind)
      if (p.hold) { held++; expect(Math.abs(rel(from, s.heading + p.turn))).toBeLessThan(6); expect(Math.abs(p.hold.off)).toBeGreaterThanOrEqual(30); expect(Math.abs(p.hold.off)).toBeLessThanOrEqual(60); } // (held head to wind, then her bow pushed off)
    }
    expect(n).toBeGreaterThan(40); expect(held).toBeGreaterThan(10); // (in a fresh breeze across a narrow fairway she can't be let swing: shoved off astern instead)
    // in her slip with a breeze across it: pushed off, she's swung round head to wind and held; main up, push off again, and away
    const slip = SLIPS.find(s => { const p = s.kind === 'bow-in' && s.marina === 'west-harbor' ? pushOffPlan(s, 270, 14) : null; return p?.kind === 'swing' && !!p.hold; })!;
    expect(slip).toBeTruthy();
    const boat = { ...DEFAULT_BOAT, marina: slip.marina, slip: slip.id };
    const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 14, windDir: 270, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' };
    const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
    w.pushOff(); const plan = u.handled!.plan;
    if (plan.kind !== 'swing' || !plan.hold) throw new Error(`expected to be held head to wind (wind ${w.windHere(u, u).from.toFixed(0)})`);
    for (let i = 0; i < 60 * 150 && !u.handled?.held; i++) { w.step(DT); expect(hitsHarbor(u)).toBe(false); }
    expect(u.handled?.held).toBe(true); expect(Math.abs(rel(w.windHere(u, u).from, u.h))).toBeLessThan(15); // lying head to wind
    for (let i = 0; i < 60 * 10; i++) w.step(DT);
    expect(u.handled?.held).toBe(true); // (still held: waiting for the word)
    w.setSail('main', true); for (let i = 0; i < 60 * 40; i++) w.step(DT);
    expect(w.pushOff()).toBe(true); for (let i = 0; i < 60 * 60 && u.handled; i++) { w.step(DT); expect(hitsHarbor(u)).toBe(false); }
    expect(u.handled).toBeUndefined(); expect(Math.abs(rel(w.windHere(u, u).from, u.h))).toBeGreaterThan(30); // her bow pushed off the wind
    for (let i = 0; i < 60 * 20; i++) { w.step(DT); expect(hitsHarbor(u)).toBe(false); }
    expect(u.v).toBeGreaterThan(0.2); // and with the main up, she sails off
    // an end tie pointing into the westerly: her bow pushed off it about her stern quarter, clear of the dock all the way
    for (const e of SLIPS.filter(s => s.kind === 'alongside')) for (const from of [e.heading, e.heading + 20, e.heading - 20]) {
      const p = pushOffPlan(e, from, 15); expect(pushOffPoses(e, p).every(q => berthClear(q.c, q.h, e))).toBe(true);
      if (!p.headToWind) expect(Math.abs(rel(from, p.h))).toBeGreaterThanOrEqual(30);
    }
  }, 120000);
  it('the wind straight out of her slip: she\'s already head to wind, so she\'s walked out and held for the main, not turned across it', () => {
    let n = 0;
    for (const s of SLIPS.filter(x => x.kind === 'bow-in').filter((_, i) => i % 7 === 0)) {
      const p = pushOffPlan(s, s.heading, 15); if (p.kind !== 'swing') continue;
      n++; expect(p.hold).toBeTruthy(); expect(Math.abs(p.turn)).toBeLessThan(15);
    }
    expect(n).toBeGreaterThan(20);
  }, 60000);
  it('her flags and windex show the wind while she\'s made fast and while the crew has her', () => {
    const slip = slipsIn('west-harbor')[30], boat = { ...DEFAULT_BOAT, marina: slip.marina, slip: slip.id };
    const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' };
    const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user, rel = (a: number) => ((a + 540) % 360) - 180;
    for (let i = 0; i < 30; i++) w.step(DT);
    expect(u.aws).toBeGreaterThan(3); expect(Math.abs(rel(u.arel - rel(w.windHere(u, u).from - u.h)))).toBeLessThan(10);
    w.pushOff(); for (let i = 0; i < 60 * 20; i++) w.step(DT);
    expect(u.handled).toBeTruthy(); expect(u.aws).toBeGreaterThan(3); expect(Math.abs(rel(u.arel - rel(w.windHere(u, u).from - u.h)))).toBeLessThan(10);
  });
  it('the tiller answers through the push-off, sails down: walked out it yaws her (the bow the way it\'s pushed), and let go it turns her; a steering key held does the same', () => {
    const slip = slipsIn('west-harbor')[40], boat = { ...DEFAULT_BOAT, marina: slip.marina, slip: slip.id };
    const run = (tiller: number, key = 0) => {
      const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 2, windDir: 270, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' };
      const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user, h0 = u.h, rel = (a: number) => ((a + 540) % 360) - 180;
      expect(u.rig!.main + u.rig!.jib).toBe(0); // (sails down)
      w.pushOff(); u.steer = key; const plan = u.handled!.plan; if (plan.kind !== 'swing') throw new Error('a swing');
      let walkYaw = 0, signed = 0, t = 0;
      for (; t < 60 * 200 && u.handled; t++) {
        u.tiller = tiller; w.step(DT); expect(hitsHarbor(u)).toBe(false);
        if (u.handled && u.handled.s < plan.back - 1.5 && Math.abs(rel(u.h - h0)) > walkYaw) { walkYaw = Math.abs(rel(u.h - h0)); signed = rel(u.h - h0); }
      }
      const h1 = u.h; u.tiller = tiller; for (let i = 0; i < 60 * 3; i++) w.step(DT);
      return { walkYaw, signed, secs: t / 60, turned: rel(u.h - h1) };
    };
    const a = run(0.8), b = run(-0.8), z = run(0), k = run(0, -0.8);
    // walked astern, the tiller to starboard (+) takes her bow to starboard (heading up); to port, down; centred, straight
    expect(a.signed).toBeGreaterThan(2); expect(b.signed).toBeLessThan(-2); expect(z.walkYaw).toBeLessThan(0.01);
    expect(Math.abs(a.secs - b.secs)).toBeLessThan(0.5); // (the swing about the bow line: the rudder crosses the water broadside, no help)
    expect(k.signed).toBeGreaterThan(2); expect(Math.sign(k.turned)).toBe(Math.sign(a.turned)); // (a key held, the same as the tiller)
    expect(Math.sign(a.turned)).toBe(-Math.sign(b.turned)); expect(Math.abs(a.turned)).toBeGreaterThan(3); // (let go, with way on, she turns as the tiller says)
  }, 120000);
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
      for (let i = 0; i < 60 * 150 && u.handled && !u.handled.held; i++) { w.step(DT); expect(hitsHarbor(u)).toBe(false); }
      if (u.handled?.held) { w.setSail('main', true); for (let i = 0; i < 60 * 40; i++) w.step(DT); w.pushOff(); for (let i = 0; i < 60 * 60 && u.handled; i++) { w.step(DT); expect(hitsHarbor(u)).toBe(false); } } // (held head to wind: main up, and let go)
      expect(u.handled).toBeUndefined(); expect(Math.max(u.v, u.astern ?? 0)).toBeGreaterThan(0.2); // under her own way, ahead or astern: steerable
      for (let i = 0; i < 60 * 5; i++) { w.step(DT); expect(hitsHarbor(u)).toBe(false); }
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
    expect(HARBORS.map(h => h.id)).toEqual(['west-harbor', 'gashouse-cove', 'south-beach', 'corinthian', 'horseshoe-bay', 'berkeley', 'richmond-yc', 'encinal']);
  });
});
