import { describe, expect, it } from 'vitest';
import { onLand, onGround, hitsWharf, shoreDist, SHORE, wharfCrossed, wharfNearest } from '../src/geo/shore';
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
      [37.8105, -122.4092, 37.8128, -122.4440]  // out of the Pier 39 marina, past its docks and breakwater
    ];
    for (const [la, lo, lb, ob] of trips) {
      const r = routeAround(at(la, lo), at(lb, ob));
      for (let i = 1; i < r.length; i++) expect(wharfCrossed(r[i - 1], r[i]), `${la},${lo} leg ${i}`).toBe(false);
    }
  });
  it('makes the piers and breakwaters obstructions for Rule 19: a breakwater\'s side continues, a pier head doesn\'t', () => {
    const side = wharfNearest(at(37.809948, -122.423378 + 0.0002), 30)!; // just off the Wharf breakwater
    expect(side.d).toBeLessThan(30); expect(side.side).toBe(true);
  });
  it('slackens the current in the water the piers shelter: Aquatic Park and the Pier 39 marina', () => {
    expect(shoreRelief(at(37.8092, -122.4245))).toBeLessThan(0.6);
    expect(shoreRelief(at(37.8105, -122.4092))).toBeLessThan(0.3);
    expect(shoreRelief(at(37.8250, -122.4300))).toBe(1); // open water off the Wharf: full strength
  });
});
