import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { sfTide, tideHeightAt } from '../src/environment/tide';
import { HAZARDS, hazardAt } from '../src/environment/hazards';
import { GROUND } from '../src/boat/ground';

/**
 * A charted hazard under the keel (environment/hazards.ts, boat/ground.ts rockStep): the obstruction off Crissy Field
 * by Anita Rock, 0.9 m below the chart's datum (NOAA's ENC, VALSOU). At the low water of 14 Nov 2026 there's less over
 * it than she draws: run at it, she strikes it and doesn't pass through it, the blow graded as rock (boat/damage.ts);
 * at high water she sails over.
 */
const day = Date.UTC(2026, 10, 14, 8);
const extreme = (sign: number) => { let best = -Infinity, at = 0; for (let m = 6 * 60; m < 20 * 60; m += 2) { const h = sign * sfTide(day + m * 60e3); if (h > best) { best = h; at = m; } } return at; };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const OB = HAZARDS.find(H => H.kind === 'obstn' && H.p && H.top === 0.9 && Math.abs(H.p.y - (-25)) < 400)!;

function runAt(minute: number) {
  const S = { ...DEFAULT_SETTINGS, mode: 'sail', windKind: 'west', windKt: 12, windDir: 270, windTurn: 0, tideDate: '2026-11-14', tideTime: hhmm(minute), current: 'slack', traffic: 0 } as Settings;
  const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
  u.x = OB.p!.x - 60; u.y = OB.p!.y; u.h = 90; u.v = 2.5;
  let struck = false, past = false;
  for (let k = 0; k < 60 * 60 && !u.wrecked; k++) { u.steer = 0; u.tiller = 0; u.h = 90; w.step(DT); if (u.onRock) struck = true; if (u.x > OB.p!.x + 10) past = true; }
  return { u, struck, past };
}

describe('a charted hazard under the keel', () => {
  it('the obstruction off Crissy Field is on the chart at 0.9 m', () => {
    expect(OB).toBeDefined();
    expect(hazardAt(OB.p!)?.id).toBe(OB.id);
  });
  it('at low water she strikes it, doesn\'t pass through it, and the blow is graded as rock: at 5 kn, a wreck', () => {
    const lo = extreme(-1);
    expect(OB.top + tideHeightAt(OB.p!, day + lo * 60e3)).toBeLessThan(GROUND.draft);
    const { u, struck, past } = runAt(lo);
    expect(struck).toBe(true);
    expect(past).toBe(false);
    expect(u.damage?.level).toBe('wreck'); // (2.5 m/s square onto it: above damage.ts's 1.5 m/s on rock)
    expect(u.wrecked).toBeTruthy();
  }, 120_000);
  it('at high water she sails over it', () => {
    const hi = extreme(1);
    expect(OB.top + tideHeightAt(OB.p!, day + hi * 60e3)).toBeGreaterThan(GROUND.draft + 1);
    const { u, struck, past } = runAt(hi);
    expect(struck).toBe(false); expect(past).toBe(true); expect(u.damage).toBeUndefined();
  }, 120_000);
});

describe('the submerged ruins and the rocky bottoms', () => {
  it('the ruined piers always under water (SLCONS, WATLEV 3) are hazards along their line, at their area\'s shoal edge', async () => {
    const { HAZARDS: H, hazardAt: at } = await import('../src/environment/hazards');
    const ruins = H.filter(h => h.line);
    expect(ruins.length).toBeGreaterThan(100);
    const R = ruins.find(h => h.line!.length >= 2 && Math.hypot(h.line![1].x - h.line![0].x, h.line![1].y - h.line![0].y) > 20)!;
    const a = R.line![0], b = R.line![1], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, L = Math.hypot(b.x - a.x, b.y - a.y), n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
    expect(at({ x: mid.x + n.x * 2, y: mid.y + n.y * 2 })?.top).toBeLessThanOrEqual(R.top); // (2 m off its line: on it)
    for (const r of ruins) expect(Number.isFinite(r.top) && r.top < 3).toBe(true);
  });
  it('the chart\'s rocky bottom samples read as rock; Richardson Bay\'s flats, mud', async () => {
    const { rockyBottom } = await import('../src/environment/hazards');
    const { LL } = await import('../src/geo/geo');
    const enc = (await import('../src/geo/data/enc-chart.json')).default as unknown as { bottom: { n: number[]; p?: number[] }[] };
    const rock = enc.bottom.find(b => b.n.includes(9) && b.p)!;
    expect(rockyBottom(LL(rock.p![1] / 1e5, rock.p![0] / 1e5))).toBe(true);
    expect(rockyBottom(LL(37.880, -122.505))).toBe(false);
  });
});
