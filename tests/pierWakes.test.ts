import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { WAKE, WAKE_PIERS, addPierWakes, withPierWakes } from '../src/environment/pierWakes';
import { WindSum, bluffDeficit } from '../src/environment/shadows';
import { onLand } from '../src/geo/shore';
import type { Vec } from '../src/core/math';

const tower = WAKE_PIERS.findIndex(w => w.P.name === 'Golden Gate Bridge, north tower');
const fender = WAKE_PIERS.findIndex(w => /fender/.test(w.P.name));
const T = WAKE_PIERS[tower];
/** A uniform stream `v` (m/s) everywhere: the current at q with the piers' wakes. */
const at = (q: Vec, v: Vec, t = 0) => withPierWakes(q, v, WAKE_PIERS.map(() => v), t);
const speed = (c: Vec) => Math.hypot(c.x, c.y);
/** the tower's width across an east–west stream */
const W = (() => { const ys = T.P.pts.map(p => p.y); return Math.max(...ys) - Math.min(...ys); })();
const back = (s: number) => Math.max(...T.P.pts.map(p => s * (p.x - T.c.x)));

describe('the piers\' current wakes', () => {
  it('has both Golden Gate towers\' water (the south tower\'s through its fender)', () => {
    expect(tower).toBeGreaterThanOrEqual(0); expect(fender).toBeGreaterThanOrEqual(0);
    expect(WAKE_PIERS.some(w => w.P.name === 'Golden Gate Bridge, south tower')).toBe(false);
    for (const w of WAKE_PIERS) expect(w.P.depth, w.P.name).toBeGreaterThan(1);
  });

  it('lies downstream: west of the north tower on the ebb, east of it on the flood', () => {
    const ebb = { x: -1.5, y: 0 }, flood = { x: 1.5, y: 0 };
    const west = { x: T.c.x - back(-1) - 150, y: T.c.y }, east = { x: T.c.x + back(1) + 150, y: T.c.y };
    expect(onLand(west) || onLand(east)).toBe(false);
    expect(speed(at(west, ebb))).toBeLessThan(1.2); expect(speed(at(east, ebb))).toBeCloseTo(1.5, 3);
    expect(speed(at(east, flood))).toBeLessThan(1.2); expect(speed(at(west, flood))).toBeCloseTo(1.5, 3);
    // and nothing upstream or well off to the side
    expect(speed(at({ x: west.x, y: T.c.y + 400 }, ebb))).toBeCloseTo(1.5, 3);
  });

  it('is slack right behind it, then follows the plane-wake law: deficit 1.1·√(C_D·D/x), half-width 0.21·√(C_D·D·x)', () => {
    const v = { x: -1, y: 0 }, x0 = T.c.x - back(-1);
    expect(speed(at({ x: x0 - 5, y: T.c.y }, v, 0))).toBeLessThan(0.1); // (eddies or not)
    for (const x of [400, 800, 1500]) {
      // time-averaged over the eddies
      let s = 0, n = 0; for (let t = 0; t < 3000; t += 7) { s += 1 - speed(at({ x: x0 - x, y: T.c.y }, v, t)); n++; }
      const law = 1.12 * Math.sqrt(WAKE.CD * W / x) * Math.exp(-2 * WAKE.cf * x / T.P.depth) * Math.min(1, (WAKE.reach - x) / 200);
      expect(s / n, `x = ${x}`).toBeCloseTo(law, 1);
      // half the deficit at the half-width
      const yh = 0.21 * Math.sqrt(WAKE.CD * W * x);
      let s2 = 0; for (let t = 0; t < 3000; t += 7) s2 += (1 - speed(at({ x: x0 - x, y: T.c.y + yh }, v, t))) + (1 - speed(at({ x: x0 - x, y: T.c.y - yh }, v, t)));
      expect(s2 / (2 * n) / (s / n), `x = ${x}`).toBeGreaterThan(0.4); expect(s2 / (2 * n) / (s / n)).toBeLessThan(0.6);
    }
    // gone by 2 km
    expect(speed(at({ x: x0 - 2100, y: T.c.y }, v))).toBeCloseTo(1, 6);
  });

  it('sheds eddies: the water pulses faster and slower, opposite on each side, every D/(0.133·U)', () => {
    const v = { x: -1, y: 0 }, x0 = T.c.x - back(-1), x = 300, yh = 0.21 * Math.sqrt(WAKE.CD * W * x) * 0.7;
    const P = W / (WAKE.St * 1), N = { x: x0 - x, y: T.c.y + yh }, S = { x: x0 - x, y: T.c.y - yh };
    const sN: number[] = [], sS: number[] = [];
    for (let t = 0; t < 2 * P; t += P / 40) { sN.push(speed(at(N, v, t))); sS.push(speed(at(S, v, t))); }
    expect(Math.max(...sN) - Math.min(...sN)).toBeGreaterThan(0.05);
    const corr = sN.reduce((a, s, i) => a + (s - sN.reduce((p, q) => p + q, 0) / sN.length) * (sS[i] - sS.reduce((p, q) => p + q, 0) / sS.length), 0);
    expect(corr).toBeLessThan(0); // (opposite sides)
    expect(Math.abs(speed(at(N, v, 0)) - speed(at(N, v, P)))).toBeLessThan(0.01); // (one period)
    expect(P / 60).toBeGreaterThan(2); // minutes, behind a Golden Gate tower in a 1 m/s stream
  });

  it('turns with the real tide in the sim: the current behind the north tower is slower than beside it', () => {
    const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'real', sea: 'flat' };
    const w = new World(COURSES[0], S, 7, { freeSail: true });
    for (let k = 0; k < 6; k++) {
      (w as unknown as { t: number }).t += 3600; // (through the tides; the stream meeting the tower is refreshed)
      (w as unknown as { tide?: { setTime(d: Date): void } }).tide?.setTime(new Date(Date.parse('2026-07-11T17:00:00Z') + k * 3600e3));
      const f = (w as unknown as { pierFlows(): Vec[] }).pierFlows()[tower], U = speed(f);
      if (U < 0.2) continue;
      const e = { x: f.x / U, y: f.y / U }, b = Math.max(...T.P.pts.map(p => (p.x - T.c.x) * e.x + (p.y - T.c.y) * e.y));
      const behind = { x: T.c.x + e.x * (b + 60), y: T.c.y + e.y * (b + 60) };
      if (onLand(behind)) continue;
      expect(speed(w.currentAt(behind)), `hour ${k}`).toBeLessThan(0.5 * speed((w as unknown as { streamAt(p: Vec): Vec }).streamAt(behind)));
    }
  });
});

describe('the piers\' wind shadows', () => {
  const k = (from: number, q: Vec) => { const s = new WindSum(); addPierWakes(s, from, q); return s.result(from).k; };
  it('lies downwind of each tower base, and turns with the wind', () => {
    const west = { x: T.c.x - 60, y: T.c.y }, east = { x: T.c.x + 60, y: T.c.y };
    expect(k(270, east)).toBeLessThan(0.9); expect(k(270, west)).toBe(1);
    expect(k(90, west)).toBeLessThan(0.9); expect(k(90, east)).toBe(1);
  });
  it('is the bluff-body wake the ships cast, with the pier\'s own height', () => {
    // 200 m downwind of the north tower in a westerly
    const q = { x: T.c.x + 200, y: T.c.y }, xs = T.P.pts.map(p => p.x), ys = T.P.pts.map(p => p.y);
    const d = bluffDeficit(200, 0, T.P.top, Math.max(...ys) - Math.min(...ys), Math.max(...xs) - Math.min(...xs));
    expect(1 - k(270, q)).toBeCloseTo(d, 3);
    expect(1 - k(270, { x: T.c.x + 600, y: T.c.y })).toBeLessThan(0.05);
  });
  it('is in the sim\'s wind', () => {
    const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', sea: 'flat' };
    const w = new World(COURSES[0], S, 7, { freeSail: true }), e = { x: -Math.sin(w.wind.from * Math.PI / 180), y: -Math.cos(w.wind.from * Math.PI / 180) };
    const lee = { x: T.c.x + e.x * 50, y: T.c.y + e.y * 50 }, up = { x: T.c.x - e.x * 50, y: T.c.y - e.y * 50 };
    expect(w.shadowAt(lee).k).toBeLessThan(w.shadowAt(up).k - 0.1);
  });
});
