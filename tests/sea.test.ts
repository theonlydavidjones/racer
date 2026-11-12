import { describe, expect, it } from 'vitest';
import { FLAT_SEA, SeaField, durationFetch, fetchAt, fetchDuration, onCurrent, swellFor, swellReach, windSea, wavelength } from '../src/environment/sea';
import { beatInChop, chopLoss, waveYaw } from '../src/boat/seaway';
import { beatAngle } from '../src/boat/polar';
import { LL } from '../src/geo/geo';
import type { Vec } from '../src/core/math';

const LINE = LL(37.8115, -122.4433), CHANNEL = LL(37.817, -122.455);
/** Wavelength about 1.2 boat-lengths: the chop that hurts a Folkboat most. */
const T_BOATLENGTH = Math.sqrt(2 * Math.PI * 1.2 * 5.934 / 9.81);

describe('wind sea growth (JONSWAP)', () => {
  it('matches the fetch-limited growth laws', () => {
    // 20 kt (10.3 m/s) over 5 km: Hs ≈ 0.37 m, Tp ≈ 2.3 s
    const s = windSea(10.3, 5000);
    expect(s.hs).toBeCloseTo(0.372, 2);
    expect(s.tp).toBeCloseTo(2.32, 1);
    // height grows with the square root of fetch
    expect(windSea(10.3, 20000).hs / s.hs).toBeCloseTo(2, 2);
  });
  it('stops growing once the sea is fully developed', () => {
    const a = windSea(10, 1e7), b = windSea(10, 1e8);
    expect(a.hs).toBeCloseTo(b.hs, 6);
    expect(a.hs).toBeCloseTo(0.243 * 100 / 9.81, 2);
  });
});

describe('fetch on the real coastline', () => {
  it('is short off the Cityfront and long out in the channel for a westerly', () => {
    const atLine = fetchAt(LINE, 255), mid = fetchAt(CHANNEL, 255);
    expect(atLine).toBeGreaterThan(1000);
    expect(atLine).toBeLessThan(4000);
    expect(mid).toBeGreaterThan(atLine * 1.5);
  });
  it('is next to nothing in the lee of the land', () => {
    expect(fetchAt(LL(37.855, -122.475), 255)).toBeLessThan(800); // Sausalito, under the hills
  });
});

describe('waves meeting a current', () => {
  it('get shorter and higher against it, longer and lower with it', () => {
    const against = onCurrent(0.5, 3, -0.6), w = onCurrent(0.5, 3, 0.6);
    expect(against.H).toBeGreaterThan(0.55);
    expect(against.L).toBeLessThan(wavelength(3));
    expect(w.H).toBeLessThan(0.5);
    expect(w.L).toBeGreaterThan(wavelength(3));
  });
  it('are blocked (and break) when the current is stronger than they can go against', () => {
    expect(onCurrent(0.3, 1.5, -2).blocked).toBe(true);
  });
});

describe('the sea at the start line', () => {
  const sea = new SeaField(swellFor('2026-07-11', 1));
  const at = (kt: number, cur: Vec, up: Vec = cur) => sea.at(LINE, { from: 255, kt }, cur, () => up);
  it('builds with the breeze', () => {
    expect(at(8, { x: 0, y: 0 }).hsW).toBeLessThan(at(20, { x: 0, y: 0 }).hsW);
  });
  it('is bigger and steeper with an ebb against the westerly, smaller with a flood', () => {
    // the wind over the water is the wind relative to the current: an ebb adds to it, a flood takes from it
    const slack = at(16, { x: 0, y: 0 }), ebb = at(16 + 2, { x: -1, y: 0 }, { x: -0.7, y: 0 }), flood = at(16 - 1.5, { x: 0.75, y: 0 });
    expect(ebb.hsW).toBeGreaterThan(slack.hsW * 1.4);
    expect(ebb.steep).toBeGreaterThan(slack.steep);
    expect(flood.hsW).toBeLessThan(slack.hsW * 0.8);
  });
  it('is glassy in a near-calm', () => {
    expect(at(2, { x: 0, y: 0 }).hsW).toBeLessThan(0.01);
  });
  it('has whitecaps only in a real breeze', () => {
    expect(at(8, { x: 0, y: 0 }).white).toBeLessThan(0.002);
    expect(at(22, { x: -1, y: 0 }, { x: -0.6, y: 0 }).white).toBeGreaterThan(0.01);
  });
  it('is flat water when asked', () => {
    expect(new SeaField(null).at(LINE, { from: 255, kt: 20 }, { x: 0, y: 0 }, () => ({ x: 0, y: 0 }))).toBe(FLAT_SEA);
  });
});

describe('the ocean swell', () => {
  it('is bigger in winter than late summer (SF Bar buoy)', () => {
    expect(swellFor('2026-01-10', 1).hs).toBeGreaterThan(swellFor('2026-08-10', 1).hs * 1.4);
    expect(swellFor('2026-01-10', 2).hs).toBeGreaterThan(swellFor('2026-01-10', 0).hs);
  });
  it('dies away inside the Gate and is shadowed by the land', () => {
    const outside = swellReach(LL(37.81, -122.52)).k, bridge = swellReach(LL(37.8195, -122.4775)).k;
    const line = swellReach(LINE).k, sausalito = swellReach(LL(37.855, -122.475)).k;
    expect(outside).toBeGreaterThan(bridge);
    expect(bridge).toBeGreaterThan(line);
    expect(line).toBeGreaterThan(0.05);
    expect(sausalito).toBeLessThan(0.03);
  });
});

describe('the boat in waves', () => {
  it('2 ft of boat-length chop costs about a tenth of her upwind speed', () => {
    const loss = chopLoss(12, beatAngle(12), 0.6, T_BOATLENGTH);
    expect(loss).toBeGreaterThan(0.07);
    expect(loss).toBeLessThan(0.16);
  });
  it('hurts more in light air (less drive to punch through) and much less off the wind', () => {
    expect(chopLoss(8, beatAngle(8), 0.6, T_BOATLENGTH)).toBeGreaterThan(chopLoss(14, beatAngle(14), 0.6, T_BOATLENGTH));
    expect(chopLoss(12, 165, 0.6, T_BOATLENGTH)).toBeLessThan(0.03);
  });
  it('makes footing pay: the best upwind angle widens in chop', () => {
    expect(beatInChop(10, 0.6, T_BOATLENGTH)).toBeGreaterThan(beatAngle(10) + 1);
    expect(beatInChop(10, 1.0, 2.5)).toBeGreaterThan(beatInChop(10, 0.6, T_BOATLENGTH));
  });
  it('long swell barely slows her', () => {
    expect(chopLoss(12, beatAngle(12), 0.3, 14)).toBeLessThan(0.005);
  });
  it('knocks her bow about most with the sea on the quarter, and is the same every replay', () => {
    const s = { ...FLAT_SEA, hsW: 0.6, tpW: 2.5, fromW: 0 };
    const peak = (h: number) => { let m = 0; for (let t = 0; t < 30; t += 0.05) m = Math.max(m, Math.abs(waveYaw(s, h, 2.5, t, 1))); return m; };
    expect(peak(135)).toBeGreaterThan(peak(10) * 3);
    expect(waveYaw(s, 135, 2.5, 12.3, 2)).toBe(waveYaw(s, 135, 2.5, 12.3, 2));
  });
  it("the yaw is a slender hull's Froude–Krylov moment: nothing beam-on, as much on the bow as the quarter, next to nothing in a long swell", () => {
    const peakOf = (sea: typeof FLAT_SEA, h: number) => { let m = 0; for (let t = 0; t < 40; t += 0.02) m = Math.max(m, Math.abs(waveYaw(sea, h, 2.5, t, 1))); return m; };
    const chop = { ...FLAT_SEA, hsW: 0.6, tpW: 2.5, fromW: 0 }, swell = { ...FLAT_SEA, hsS: 0.6, tpS: 12, fromS: 0 };
    expect(peakOf(chop, 90)).toBeLessThan(0.2 * peakOf(chop, 135));
    expect(peakOf(chop, 45) / peakOf(chop, 135)).toBeGreaterThan(0.7); expect(peakOf(chop, 45) / peakOf(chop, 135)).toBeLessThan(1.3);
    // (per metre of height, a 12 s swell turns her less than 2% as much as a 2.5 s chop)
    expect(peakOf(swell, 135)).toBeLessThan(0.02 * peakOf(chop, 135));
  });
});

describe('the chop takes time to build (duration-limited growth)', () => {
  it("CEM's duration for a fetch: 3.4 h for 18 km in 18 kt, about 40 min for 1.4 km (EM 1110-2-1100 II-2-35)", () => {
    const U = 18 * 0.5144;
    expect(fetchDuration(U, 18000) / 3600).toBeGreaterThan(3.2); expect(fetchDuration(U, 18000) / 3600).toBeLessThan(3.5);
    expect(fetchDuration(U, 1400) / 60).toBeGreaterThan(35); expect(fetchDuration(U, 1400) / 60).toBeLessThan(50);
    expect(durationFetch(U, fetchDuration(U, 5000))).toBeCloseTo(5000, 3);
  });
  it('an hour after the breeze fills in to 18 kt the chop is the one 3 km of fetch makes; by four hours the full fetch', () => {
    const U = 18 * 0.5144, open = LL(37.865, -122.345), still = { x: 0, y: 0 }, cur = () => still; // (the Berkeley Circle)
    const sea = (f: SeaField) => f.at(open, { from: 250, kt: 18 }, still, cur).hsW, full = new SeaField({ hs: 0, tp: 10, from: 285 });
    expect(full.fetch(open, 250)).toBeGreaterThan(8000); // (18 km of open water straight to the WSW, out the Gate; averaged over ±42° (Saville), Tiburon, Angel Island and the Richmond shore bring it to about 8.7 km)
    const f = new SeaField({ hs: 0, tp: 10, from: 285 }); f.duration = 0; // (flat calm)
    for (let t = 0; t < 3600; t += 1) f.develop(U, 1);
    expect(sea(f)).toBeLessThan(0.6 * sea(full));
    expect(sea(f) / windSea(U, durationFetch(U, 3600)).hs).toBeGreaterThan(0.85); expect(sea(f) / windSea(U, durationFetch(U, 3600)).hs).toBeLessThan(1.15);
    for (let t = 0; t < 4 * 3600; t += 10) f.develop(U, 10);
    expect(sea(f)).toBeCloseTo(sea(full), 3);
  });
  it("a light morning's small sea is a head start, worth the minutes the fresh breeze would take to make it", () => {
    const U = 18 * 0.5144, open = LL(37.865, -122.345), still = { x: 0, y: 0 }, cur = () => still;
    const calm = new SeaField({ hs: 0, tp: 10, from: 285 }), light = new SeaField({ hs: 0, tp: 10, from: 285 });
    calm.duration = 0; light.duration = 0;
    for (let t = 0; t < 4 * 3600; t += 600) light.develop(4 * 0.5144, 600);
    for (let t = 0; t < 3600; t += 10) { calm.develop(U, 10); light.develop(U, 10); }
    const a = calm.at(open, { from: 250, kt: 18 }, still, cur).hsW, b = light.at(open, { from: 250, kt: 18 }, still, cur).hsW;
    expect(b).toBeGreaterThan(a); expect(b).toBeLessThan(1.4 * a);
  });
});

describe('the growing sea, more', () => {
  it("a sea still growing is limited by the time the wind has blown, which a current doesn't change", () => {
    const U = 18 * 0.5144, open = LL(37.865, -122.345), f = new SeaField({ hs: 0, tp: 10, from: 285 }); f.duration = 3600;
    const at = (c: Vec) => f.at(open, { from: 250, kt: 18 }, c, () => c).hsW, along = { x: Math.sin(70 * Math.PI / 180), y: Math.cos(70 * Math.PI / 180) };
    const still = at({ x: 0, y: 0 });
    expect(at({ x: along.x * 1.3, y: along.y * 1.3 }) / still).toBeCloseTo(1, 2);
    expect(at({ x: -along.x * 1.3, y: -along.y * 1.3 }) / still).toBeCloseTo(1, 2);
    void U;
  });
  it("in the race, the sea she's in holds steady through the wind's pulses and quick shifts", async () => {
    const { World } = await import('../src/sim/world');
    const { DEFAULT_SETTINGS } = await import('../src/settings');
    const ss2 = (await import('../src/courses/data/seaweed-soup-2026-course2.json')).default;
    const w = new World(ss2 as never, { ...DEFAULT_SETTINGS, windKind: 'west', tideDate: '2027-07-10', tideTime: '15:00', fleet: 0 }, 3);
    const p = { x: w.boats[0].x, y: w.boats[0].y + 500 }, hs: number[] = [], from: number[] = [];
    for (let i = 0; i < 120 * 60; i++) { w.step(); if (i % 60 === 0) { const s = w.seaHere(p); hs.push(s.hsW); from.push(s.fromW); } }
    expect(Math.max(...hs) / Math.min(...hs)).toBeLessThan(1.05);
    expect(Math.max(...from) - Math.min(...from)).toBeLessThan(2);
  }, 60000);
});

describe('the sea inside the marinas', () => {
  it('a 12 s swell\'s length by linear dispersion: 225 m in deep water, 74 m in 4 m', async () => {
    const { waveLength } = await import('../src/environment/sea');
    expect(waveLength(12, 1000)).toBeCloseTo(224.8, 0);
    expect(waveLength(12, 4)).toBeCloseTo(73.8, 0);
  });
  it('through a gap (the exact thin-breakwater solution): a wide one passes the wave whole on its axis; a narrow one spreads it evenly, falling as 1/√r', async () => {
    const { gapKd } = await import('../src/environment/sea');
    expect(gapKd(3, 1, 0)).toBeGreaterThan(0.9);
    expect(gapKd(0.1, 2, 0) / gapKd(0.1, 2, 89)).toBeLessThan(1.1); // (a narrow gap radiates alike every way)
    expect(gapKd(0.5, 40, 0) / gapKd(0.5, 20, 0)).toBeCloseTo(Math.SQRT1_2, 3);
    expect(gapKd(0.5, 2, 0)).toBeGreaterThan(gapKd(0.2, 2, 0)); // (a wider gap lets more through)
  });
  it('Gashouse Cove: the swell spreads evenly from its 37 m entrance, weaker inside than out, with no full-swell strip', async () => {
    const { harborGaps, harborSwell, swellReach } = await import('../src/environment/sea');
    const { HARBORS, inBasin } = await import('../src/geo/marina');
    const [g] = harborGaps(HARBORS.find(h => h.id === 'gashouse-cove')!);
    expect(g.B).toBeGreaterThan(20); expect(g.B).toBeLessThan(45);
    const outside = swellReach({ x: g.c.x - g.n.x * 30, y: g.c.y - g.n.y * 30 }).k;
    for (const back of [15, 40]) {
      const ks: number[] = [];
      for (let s = -12; s <= 12; s += 2) { const p = { x: g.c.x + g.n.x * back + g.n.y * s, y: g.c.y + g.n.y * back - g.n.x * s }; if (inBasin(p)) ks.push(harborSwell(p, 12).k); }
      expect(ks.length).toBeGreaterThan(5);
      expect(Math.max(...ks) / Math.min(...ks)).toBeLessThan(1.6);
      expect(Math.max(...ks)).toBeLessThan(0.8 * outside);
    }
  });
  it('the chop\'s fetch by an entrance: no aliasing step from one point to the next, and the same just outside as just inside', async () => {
    const { harborGaps, SeaField } = await import('../src/environment/sea');
    const { HARBORS } = await import('../src/geo/marina');
    const f = new SeaField(null);
    const [g] = harborGaps(HARBORS.find(h => h.id === 'gashouse-cove')!);
    // (across Gashouse Cove's entrance, 15 m in, at 315°: it was 0.17 → 0.04 → 0.13 m of chop over 12 m)
    let prev = -1;
    for (let s = -12; s <= 12; s += 1.5) {
      const F = f.fetch({ x: g.c.x + g.n.x * 15 + g.n.y * s, y: g.c.y + g.n.y * 15 - g.n.x * s }, 315);
      if (prev > 0) expect(Math.abs(F - prev) / prev).toBeLessThan(0.15);
      prev = F;
    }
    // (across each entrance line, 0.75 m either side: it was 194 m inside against 108 m outside at South Beach)
    for (const id of ['gashouse-cove', 'south-beach', 'corinthian']) for (const gap of harborGaps(HARBORS.find(h => h.id === id)!)) for (const w of [0, 90, 180, 270, 315]) {
      const a = f.fetch({ x: gap.c.x - gap.n.x * 0.75, y: gap.c.y - gap.n.y * 0.75 }, w), b = f.fetch({ x: gap.c.x + gap.n.x * 0.75, y: gap.c.y + gap.n.y * 0.75 }, w);
      expect(Math.abs(a - b)).toBeLessThan(0.15 * Math.max(a, b) + 25);
    }
  });
});

describe('the sea inside the marinas: entrances and breakwater heads', () => {
  it('behind the end of a breakwater (Sommerfeld\'s exact solution): about 1 in the open, a half along the shadow\'s edge, falling into the shadow', async () => {
    const { breakwaterKd } = await import('../src/environment/sea');
    // a breakwater from (0,0) running west (−x); waves travelling north (+y) past its head: the shadow is north of it, west of x = 0
    const h = { x: 0, y: 0 }, b = { x: -1, y: 0 }, t = { x: 0, y: 1 }, L = 60;
    expect(breakwaterKd(h, b, t, { x: -1, y: 3 * L }, L)).toBeCloseTo(0.5, 1); // (along the shadow's edge)
    expect(breakwaterKd(h, b, t, { x: -2 * L, y: 0.5 * L }, L)).toBeLessThan(0.2); // (deep in the shadow)
    expect(breakwaterKd(h, b, t, { x: -2 * L, y: 3 * L }, L)).toBeLessThan(breakwaterKd(h, b, t, { x: -0.5 * L, y: 3 * L }, L)); // (deeper, less)
    expect(breakwaterKd(h, b, t, { x: 2 * L, y: 3 * L }, L)).toBe(0); // (not shaded by it: none of this head's to give)
    // and waves meeting the wall at 30° (square on, the solution can't tell the way they come from the way they go):
    // travelling at 30° across a wall running east, north-east-wards past its head at the origin; the shadow north of it
    const e = { x: 1, y: 0 }, t30 = { x: -Math.cos(30 * Math.PI / 180), y: Math.sin(30 * Math.PI / 180) }, edge = { x: t30.x * 15 * L, y: t30.y * 15 * L };
    expect(breakwaterKd(h, e, t30, { x: edge.x + 5, y: edge.y }, L)).toBeCloseTo(0.5, 1); // (on the shadow's edge, just inside)
    expect(breakwaterKd(h, e, t30, { x: 5 * L, y: 2 * L }, L)).toBeLessThan(0.2); // (well behind the wall)
  });
  it('every harbor the ocean swell reaches has an entrance to take it in by, and West Harbor\'s is its open east side', async () => {
    const { harborGaps, swellReach } = await import('../src/environment/sea');
    const { HARBORS, inBasin } = await import('../src/geo/marina');
    for (const H of HARBORS) {
      const c = { x: (H.reach.x0 + H.reach.x1) / 2, y: (H.reach.y0 + H.reach.y1) / 2 };
      if (swellReach(c, false).k > 0.01) expect(harborGaps(H).length, H.id).toBeGreaterThan(0);
      // (and each one's way in points into the harbor: the water beyond it, the other way, is out of the basin)
      for (const g of harborGaps(H)) expect(inBasin({ x: g.c.x - g.n.x * (g.B / 2 + 20), y: g.c.y - g.n.y * (g.B / 2 + 20) }), `${H.id} at ${g.c.x.toFixed(0)},${g.c.y.toFixed(0)}`).toBe(false);
    }
    const [w] = harborGaps(HARBORS.find(h => h.id === 'west-harbor')!);
    expect(w.n.x).toBeLessThan(-0.8); // (in is west)
  });
  it('quick by a marina: a sea map\'s worth of fetch near Berkeley in well under a second, a boat\'s in milliseconds', async () => {
    const { SeaField } = await import('../src/environment/sea');
    const { HARBORS } = await import('../src/geo/marina');
    const H = HARBORS.find(h => h.id === 'berkeley')!, cx = (H.reach.x0 + H.reach.x1) / 2, cy = (H.reach.y0 + H.reach.y1) / 2, f = new SeaField(null);
    for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) f.fetch({ x: cx - 1600 + i * 139, y: cy - 1600 + j * 139 }, 270); // (its walls mapped)
    const t0 = performance.now();
    for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) f.fetch({ x: cx - 1600 + i * 139, y: cy - 1600 + j * 139 }, 276);
    expect(performance.now() - t0).toBeLessThan(600);
  }, 60_000);
});
