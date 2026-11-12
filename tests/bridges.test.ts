import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { engage } from '../src/boat/autopilot';
import { bow } from '../src/boat/boat';
import { PIERS, landAlong, onLand, pierAt, wharfNearest } from '../src/geo/shore';
import { obstructionAhead } from '../src/sim/obstruction';
import { routeAround } from '../src/sim/routing';
import { PLACES } from '../src/sim/places';
import { ROUTES } from '../src/sim/traffic';
import { LL } from '../src/geo/geo';
import { V, brg, dist, inPoly, wrap, type Vec } from '../src/core/math';
import data from '../src/geo/data/bridge-piers.json';

const S = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', sea: 'flat', ...o });
const centre = (pts: Vec[]): Vec => ({ x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length });
/** A point inside the outline (its centre, or else nudged in from a vertex toward the centre). */
function inside(pts: Vec[]): Vec {
  const c = centre(pts); if (inPoly(c, pts)) return c;
  for (const v of pts) for (const k of [0.1, 0.3, 0.5]) { const q = { x: v.x + (c.x - v.x) * k, y: v.y + (c.y - v.y) * k }; if (inPoly(q, pts)) return q; }
  throw new Error('no interior point');
}
/** A way through the pier with open water 300 m either side and nothing else in the way (the line a boat might sail). */
function across(P: { pts: Vec[] }): Vec {
  const c = centre(P.pts);
  for (let a = 0; a < 180; a += 15) {
    const u = V(a), A = { x: c.x - u.x * 300, y: c.y - u.y * 300 }, B = { x: c.x + u.x * 300, y: c.y + u.y * 300 };
    if (onLand(A) || onLand(B)) continue;
    const r = Math.max(...P.pts.map(p => dist(p, c)));
    if (landAlong(A, { x: c.x - u.x * (r + 2), y: c.y - u.y * (r + 2) }) === Infinity && landAlong(B, { x: c.x + u.x * (r + 2), y: c.y + u.y * (r + 2) }) === Infinity) return u;
  }
  return { x: NaN, y: NaN };
}
// the piers out in open water, with a clear way through them (a few of the Bay Bridge's stand against Yerba Buena Island's shore)
const OPEN = PIERS.filter(P => Number.isFinite(across(P).x) && !/south tower$/.test(P.name ?? '')); // (the south tower is inside its fender)
// the Golden Gate's north tower stands at the edge of Lime Point (OpenStreetMap's coastline runs round its base): a boat
// meets it from the Gate, to the south of it
const NORTH = PIERS.find(p => p.name === 'Golden Gate Bridge, north tower')!;
const approach = (P: { name?: string; pts: Vec[] }): Vec => P === NORTH ? V(0) : across(P);

describe('the bridges\' towers and piers: solid', () => {
  it('has both Golden Gate towers, the south tower\'s fender and the Bay Bridge\'s piers, from NOAA\'s chart and OpenStreetMap', () => {
    const names = PIERS.map(p => p.name);
    for (const n of ['Golden Gate Bridge, north tower', 'Golden Gate Bridge, south tower', 'Golden Gate Bridge, south tower\'s fender', 'Bay Bridge, Pier A', 'Bay Bridge, Pier C', 'Bay Bridge, East Span tower G'])
      expect(names, n).toContain(n);
    // the chart's piers and OSM's agree on where they are
    for (const p of (data as { piers: { name: string; osm?: { offset_m: number } }[] }).piers) if (p.osm) expect(p.osm.offset_m, p.name).toBeLessThan(20);
  });

  it('is land to a boat: inside each one, and a line through it stops at its edge', () => {
    for (const P of PIERS) {
      const q = inside(P.pts);
      // (the south tower stands inside its fender: either is what she'd hit)
      expect(onLand(q), P.name).toBe(true); expect(pierAt(q), P.name).not.toBeNull();
    }
    for (const P of OPEN) {
      const c = centre(P.pts), ax = across(P), from = { x: c.x - ax.x * 300, y: c.y - ax.y * 300 }, d = landAlong(from, { x: c.x + ax.x * 300, y: c.y + ax.y * 300 });
      const half = Math.max(...P.pts.map(p => -((p.x - c.x) * ax.x + (p.y - c.y) * ax.y)));
      expect(d, P.name).toBeGreaterThan(300 - half - 2); expect(d, P.name).toBeLessThan(300 + 1);
    }
  });

  it('stops a boat sailing straight at each one, with a message saying what she hit', () => {
    expect(OPEN).not.toContain(NORTH);
    for (const P of [...OPEN, NORTH]) {
      const w = new World(COURSES[0], S(), 7, { freeSail: true }), u = w.user, c = centre(P.pts);
      // on a beam reach, straight at it from 70 m off its edge
      // (from whichever side she can sail at it: not head to wind)
      let ax = approach(P); if (P !== NORTH && Math.abs(wrap(w.wind.from - brg(ax.x, ax.y))) < 60) ax = { x: -ax.x, y: -ax.y };
      const h = brg(ax.x, ax.y), r = Math.max(...P.pts.map(p => dist(p, c)));
      u.x = c.x - ax.x * (r + 70); u.y = c.y - ax.y * (r + 70); u.h = h; u.v = 2.5;
      for (const b of w.boats) if (!b.isUser) { b.x += 5000; } // (the others well away)
      let hit = '', deepest = 0;
      for (let i = 0; i < 60 * 90; i++) {
        u.h = h; u.tiller = 0; // (held on course: no helm, no pilot)
        w.step(DT);
        for (const e of w.drainEvents()) if (e.type === 'toast' && /Collision/.test(e.msg)) hit = e.msg;
        if (inPoly(bow(u), P.pts)) deepest = Math.max(deepest, 1);
      }
      expect(hit, P.name).toMatch(new RegExp((P.name ?? '').split(', ')[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      expect(deepest, `${P.name}: her bow inside it`).toBe(0);
    }
  }, 120_000);

  it('is an obstruction under Rule 20 (ahead and needing a substantial course change) and under Rule 19 (nearest, with the way out)', () => {
    for (const P of OPEN) {
      const c = centre(P.pts), ax = across(P), half = Math.max(...P.pts.map(p => -((p.x - c.x) * ax.x + (p.y - c.y) * ax.y)));
      const from = { x: c.x - ax.x * (half + 20), y: c.y - ax.y * (half + 20) };
      const ob = obstructionAhead(from, brg(ax.x, ax.y), 'S', 60);
      expect(ob, P.name).not.toBeNull();
      const w = new World(COURSES[0], S(), 7, { freeSail: true }), o = w.rulesCtx().obstacle!(from, false);
      expect(o, P.name).not.toBeNull(); expect(o!.d, P.name).toBeLessThan(30);
      expect(o!.n.x * -ax.x + o!.n.y * -ax.y, `${P.name}: the way out, back the way she came`).toBeGreaterThan(0.5);
    }
  });

  it('sends the navigator\'s routes round them', () => {
    // straight through each tower base, from 300 m one side to 300 m the other
    for (const P of OPEN) {
      const c = centre(P.pts), ax = across(P), a = { x: c.x - ax.x * 300, y: c.y - ax.y * 300 }, b = { x: c.x + ax.x * 300, y: c.y + ax.y * 300 };
      const r = routeAround(a, b);
      for (let i = 1; i < r.length; i++) expect(landAlong(r[i - 1], r[i]), P.name).toBe(Infinity);
    }
  });

  it('the owner\'s case: cruising on the tiller pilot in through the Gate past the north tower, she goes round it', () => {
    const c = centre(NORTH.pts), ys = NORTH.pts.map(p => p.y);
    // in through the Gate before the westerly along the Marin side, from 450 m west of the tower to 250 m east of it: the
    // straight line runs through its base, south of Lime Point's spit and the light
    const w = new World(COURSES[0], S({ windKind: 'west' }), 3, { freeSail: true }), u = w.user;
    const half = (Math.max(...ys) - Math.min(...ys)) / 2;
    u.x = c.x - 450; u.y = c.y + 1.2 * half; u.v = 2.5;
    const to = { x: c.x + 250, y: c.y - 2 * half }; w.setDest(to, 'in past the north tower');
    expect(onLand(u)).toBe(false); expect(onLand(to)).toBe(false);
    let through = false; for (let t = 0; t <= 1; t += 0.001) if (pierAt({ x: u.x + (to.x - u.x) * t, y: u.y + (to.y - u.y) * t }) === NORTH) through = true;
    expect(through).toBe(true); // (the straight line runs into it)
    u.h = brg(to.x - u.x, to.y - u.y);
    engage(u, w.pilot, 'nav');
    let hits = 0;
    for (let i = 0; i < 60 * 900 && w.arrivedT == null; i++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'toast' && /Collision|Aground/.test(e.msg)) hits++; }
    expect(hits).toBe(0); expect(w.arrivedT, "she got there").not.toBeNull();
  }, 120_000);

  it('stands the north tower at the edge of Lime Point, with the light on its spit (OpenStreetMap\'s coastline)', () => {
    // the Lime Point light, at its Light List position (37°49.5′ N, 122°28.7′ W; OSM's node 1243877573 within 10 m)
    expect(onLand(LL(37.825447, -122.478321))).toBe(true);
    // the tower's base: land behind it to the north, open water off it to the south, east and west
    const c = centre(NORTH.pts);
    expect(onLand({ x: c.x, y: c.y + 40 })).toBe(true);
    for (const [dx, dy] of [[0, -40], [0, -150], [-60, 0], [-200, 0]]) expect(onLand({ x: c.x + dx, y: c.y + dy }), `${dx},${dy}`).toBe(false);
  });

  it('leaves the places, the marks and the ships\' routes clear of them', () => {
    for (const pl of PLACES) expect(pierAt(pl.p), pl.id).toBeNull();
    for (const [k, r] of Object.entries(ROUTES)) for (let i = 1; i < r.length; i++) for (const P of PIERS) {
      const b = P.box; if (Math.max(r[i - 1].x, r[i].x) < b.x0 || Math.min(r[i - 1].x, r[i].x) > b.x1 || Math.max(r[i - 1].y, r[i].y) < b.y0 || Math.min(r[i - 1].y, r[i].y) > b.y1) continue;
      // (the ships' tracks pass between the piers, as the real ones do)
      for (let t = 0; t <= 1; t += 0.002) expect(inPoly({ x: r[i - 1].x + (r[i].x - r[i - 1].x) * t, y: r[i - 1].y + (r[i].y - r[i - 1].y) * t }, P.pts), `${k} through ${P.name}`).toBe(false);
    }
    void LL; void wharfNearest;
  }, 60_000);
});
