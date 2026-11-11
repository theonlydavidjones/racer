import { describe, expect, it } from 'vitest';
import { onLand, onGround, hitsWharf, shoreDist, SHORE, WHARF, wharfCrossed, wharfNearest, wharfShelter, inCityfront, LAND } from '../src/geo/shore';
import { inPoly } from '../src/core/math';
import { LOA, type Vec } from '../src/core/math';
import { routeAround } from '../src/sim/routing';
import { shoreRelief } from '../src/environment/current';
import { LL } from '../src/geo/geo';
import { segPt } from '../src/core/math';
import { ROUTES } from '../src/sim/traffic';
import { PLACES } from '../src/sim/places';

const at = (lat: number, lon: number) => LL(lat, lon);

describe('the waterfront from Fort Mason to Pier 27 (OpenStreetMap)', () => {
  it('has Pier 39, Pier 45 and the Wharf as land', () => {
    expect(onLand(at(37.8100, -122.4102))).toBe(true); // Pier 39, halfway out
    expect(onLand(at(37.8105, -122.4180))).toBe(true); // Pier 45
    expect(onLand(at(37.8085, -122.4150))).toBe(true); // the Wharf, by Jefferson Street
    expect(onLand(at(37.8085, -122.4064))).toBe(true); // Pier 35
  });
  it('has the open piers and breakwaters as solid, but not as ground for the terrain', () => {
    // Municipal Pier (the curve round Aquatic Park) and the Fisherman's Wharf breakwater: off the coastline
    for (const p of [at(37.810477, -122.425820), at(37.809948, -122.423378)]) { expect(onLand(p)).toBe(true); expect(hitsWharf(p)).toBe(true); expect(onGround(p)).toBe(false); }
    expect(onLand(at(37.809405, -122.421735))).toBe(true); // Hyde Street Pier
  });
  it('leaves the water between the piers open', () => {
    expect(onLand(at(37.8095, -122.4240))).toBe(false); // Aquatic Park, inside Municipal Pier
    expect(onLand(at(37.8100, -122.4140))).toBe(false); // between Pier 45 and Pier 41
    expect(onLand(at(37.8105, -122.4070))).toBe(false); // between Pier 39 and Pier 35
    expect(onLand(at(37.8125, -122.4100))).toBe(false); // off Pier 39
  });
  it('measures the distance to the shore exactly, against every segment', () => {
    for (let i = 0; i < 3000; i++) {
      const p = { x: -12000 + (i * 7919 % 24000), y: -8000 + (i * 104729 % 16000) };
      let m = Infinity; for (let k = 1; k < SHORE.length; k++) m = Math.min(m, segPt(p, SHORE[k - 1], SHORE[k]));
      expect(shoreDist(p)).toBe(m);
    }
  });
  it('keeps the ferries and tour boats off the new piers', () => {
    // the waterfront between Fort Mason and Pier 27: no route crosses land there
    const W = at(37.80, -122.4300), E = at(37.8135, -122.4000);
    for (const [k, r] of Object.entries(ROUTES)) for (let i = 1; i < r.length; i++) for (let t = 0; t <= 1; t += 0.002) {
      const p = { x: r[i - 1].x + (r[i].x - r[i - 1].x) * t, y: r[i - 1].y + (r[i].y - r[i - 1].y) * t };
      if (p.x > W.x && p.x < E.x && p.y > W.y && p.y < E.y) expect(onLand(p), `${k} at ${i}`).toBe(false);
    }
  });
  it('keeps every place on open water', () => { for (const pl of PLACES) expect(onLand(pl.p), pl.id).toBe(false); });
  it('gives up on a position that isn\'t a number, rather than hanging', () => {
    expect(shoreDist({ x: NaN, y: 0 })).toBeNaN(); expect(shoreDist({ x: Infinity, y: 0 })).toBeNaN();
  });
  it('plans a passage round the piers, breakwaters and docks, not through them', () => {
    const trips: [number, number, number, number][] = [
      [37.8092, -122.4245, 37.8128, -122.4440], // out of Aquatic Park to the Cityfront: round Municipal Pier
      [37.8092, -122.4245, 37.8125, -122.4100], // Aquatic Park to off Pier 39: round the Wharf's breakwater
      [37.8105, -122.4092, 37.8128, -122.4440], // out of the Pier 39 marina, past its docks and breakwater
      // and from there right across the Bay, round Yerba Buena, to Clipper Cove (Treasure Island)
      [37.8125, -122.4100, 37.8150, -122.3700], [37.8105, -122.4092, 37.8150, -122.3700], [37.8092, -122.4245, 37.8150, -122.3700],
      [37.8105, -122.4092, 37.8640, -122.4470]  // the marina to Raccoon Strait
    ];
    for (const [la, lo, lb, ob] of trips) {
      const t0 = performance.now(), r = routeAround(at(la, lo), at(lb, ob));
      expect(performance.now() - t0, 'time').toBeLessThan(1500);
      for (let i = 1; i < r.length; i++) {
        expect(wharfCrossed(r[i - 1], r[i]), `${la},${lo} leg ${i}`).toBe(false);
        // never a straight line across the land
        for (let k = 1; k < 300; k++) expect(onLand({ x: r[i - 1].x + (r[i].x - r[i - 1].x) * k / 300, y: r[i - 1].y + (r[i].y - r[i - 1].y) * k / 300 }), `${la},${lo} → ${lb},${ob} leg ${i}`).toBe(false);
      }
    }
  });
  it('makes the piers and breakwaters obstructions for Rule 19, continuing where she\'d pass alongside for three hull lengths', () => {
    // RRS 2025–2028, Definitions, Obstruction: continuing if she will pass alongside it for at least three hull lengths
    const L3 = 3 * LOA;
    // 12 m off the middle of the Fisherman's Wharf breakwater: continuing; off its very end: not
    const bw = WHARF.lines.filter(l => l.kind === 'breakwater').sort((a, b) => b.pts.length - a.pts.length)[0], k = Math.floor(bw.pts.length / 2);
    const off = (v: Vec, w: Vec, d: number) => { const dx = w.x - v.x, dy = w.y - v.y, L = Math.hypot(dx, dy); return { x: v.x - dy / L * d, y: v.y + dx / L * d }; };
    const brk = wharfNearest(off(bw.pts[k], bw.pts[k + 1], 12), 30)!;
    expect(brk.d).toBeLessThan(30); expect(brk.along).toBeGreaterThan(L3);
    const e0 = bw.pts[0], e1 = bw.pts[1], el = Math.hypot(e1.x - e0.x, e1.y - e0.y), bend = { x: e0.x - (e1.x - e0.x) / el * 10, y: e0.y - (e1.y - e0.y) / el * 10 };
    expect(wharfNearest(bend, 30)!.along).toBeLessThan(L3);
    // 12 m off Municipal Pier, all round it: continuing along both sides of its curve, not at its round head (about 40 m across)
    const P = WHARF.areas.find(a => a.name === 'Municipal Pier')!.pts, N = P.length;
    let area = 0; for (let i = 0; i < N; i++) area += P[i].x * P[(i + 1) % N].y - P[(i + 1) % N].x * P[i].y;
    const tip = at(37.8105, -122.4245); // the round head at the pier's end, where it hooks back toward the shore
    let n = 0, cont = 0, head = 0, headCont = 0;
    for (let i = 0; i < N; i++) {
      const a = P[i], b = P[(i + 1) % N], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); if (L < 0.5) continue;
      const sg = area > 0 ? 1 : -1, p = { x: (a.x + b.x) / 2 + dy / L * sg * 12, y: (a.y + b.y) / 2 - dx / L * sg * 12 };
      const w = wharfNearest(p, 30); if (!w || w.d < 8) continue; // (where the outline folds back on itself)
      if (shoreDist(p) < 30) continue; // (its root, where the shore is the obstruction)
      if (Math.hypot(a.x - tip.x, a.y - tip.y) < 30) { head++; if (w.along >= L3) headCont++; }
      else if (Math.hypot(a.x - tip.x, a.y - tip.y) > 70) { n++; if (w.along >= L3) cont++; }
    }
    expect(n).toBeGreaterThan(40); expect(cont / n).toBeGreaterThan(0.95);
    expect(head).toBeGreaterThan(5); expect(headCont / head).toBeLessThan(0.5); // (where the sides run into it, she still passes 30–45 m of side)
    // a floating dock's finger (1 m wide, ~10 m long) is an obstruction, but not a continuing one
    const f = WHARF.lines.find(l => l.kind === 'finger' && Math.hypot(l.pts[1].x - l.pts[0].x, l.pts[1].y - l.pts[0].y) > 6 && Math.hypot(l.pts[1].x - l.pts[0].x, l.pts[1].y - l.pts[0].y) < 14)!;
    const m = { x: (f.pts[0].x + f.pts[1].x) / 2, y: (f.pts[0].y + f.pts[1].y) / 2 }, dx = f.pts[1].x - f.pts[0].x, dy = f.pts[1].y - f.pts[0].y, L = Math.hypot(dx, dy);
    const nf = wharfNearest({ x: m.x - dy / L * 3, y: m.y + dx / L * 3 }, 30)!;
    expect(nf.d).toBeLessThan(5); expect(nf.along).toBeLessThan(L3);
  });
  it('slackens the current in the water the piers shelter: Aquatic Park and the Pier 39 marina', () => {
    expect(shoreRelief(at(37.8092, -122.4245))).toBeLessThan(0.6);
    expect(shoreRelief(at(37.8105, -122.4092))).toBeLessThan(0.3);
    expect(shoreRelief(at(37.8250, -122.4300))).toBe(1); // open water off the Wharf: full strength
    expect(wharfShelter(at(37.8110, -122.4245))).toBe(0); // 50 m off Municipal Pier's head the stream runs past: no shelter from the pier
  });
  it('tests the Cityfront\'s land exactly as the polygon does, only faster', () => {
    const xs = LAND.map(q => q.x), ys = LAND.map(q => q.y), x0 = Math.min(...xs) - 50, x1 = Math.max(...xs) + 50, y0 = Math.min(...ys) - 50, y1 = Math.max(...ys) + 50;
    for (let i = 0; i < 100000; i++) { const p = { x: x0 + ((i * 7919) % 99991) / 99991 * (x1 - x0), y: y0 + ((i * 104729) % 99989) / 99989 * (y1 - y0) }; if (inCityfront(p) !== inPoly(p, LAND)) expect.fail(`${p.x},${p.y}`); }
    for (const v of LAND) for (const [dx, dy] of [[0.7, 0.3], [-0.4, 0.9], [0.2, -0.6], [-1.1, -0.2]]) { const p = { x: v.x + dx, y: v.y + dy }; expect(inCityfront(p)).toBe(inPoly(p, LAND)); }
  });
});
