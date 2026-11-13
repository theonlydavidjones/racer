import { describe, expect, it, beforeEach } from 'vitest';
import { ghostAt, ghostGap, ghostsFor, keepGhost, loadGhost, pack, setupKey, thin, trackOf, unpack, type GhostPoint } from '../src/replay/ghost';

/** Ghost races (replay/ghost.ts): her track kept small, the same race recognised, and the ghost placed between seconds. */
const mem = new Map<string, string>();
beforeEach(() => { mem.clear(); (globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } }; });
const track = (n: number, x0 = 0): GhostPoint[] => Array.from({ length: n }, (_, i) => ({ t: i - 30, x: x0 + i * 2.5, y: Math.sin(i / 20) * 100, h: (350 + i) % 360, boom: i % 2 ? 20 : -20, tack: i < n / 2 ? 'P' : 'S' }));

describe('ghost races', () => {
  it('her track packs small and unpacks to within a decimetre and a degree', () => {
    const t = track(3600), s = pack(t), u = unpack(s);
    expect(pack(thin(t)).length).toBeLessThan(35000); // (an hour's race, as kept) expect(u.length).toBe(t.length);
    for (let i = 0; i < t.length; i += 97) {
      expect(Math.abs(u[i].x - t[i].x)).toBeLessThan(0.11); expect(Math.abs(u[i].y - t[i].y)).toBeLessThan(0.11);
      expect(Math.abs(((u[i].h - t[i].h + 540) % 360) - 180)).toBeLessThan(1); expect(u[i].tack).toBe(t[i].tack); expect(u[i].t).toBeCloseTo(t[i].t, 5);
    }
  });
  it('the same race is the same setup: course, seed and every setting; anything different isn\'t', () => {
    const a = { seed: 7, course: 'ss2', s: { windKt: 12, tideTime: '12:00' } }, b = { seed: 7, course: 'ss2', s: { tideTime: '12:00', windKt: 12 } };
    expect(setupKey(a)).toBe(setupKey(b));
    expect(setupKey(a)).not.toBe(setupKey({ ...a, seed: 8 })); expect(setupKey(a)).not.toBe(setupKey({ ...a, s: { ...a.s, windKt: 14 } }));
  });
  it('kept, found for its race (the fastest finish first), and loaded back', () => {
    const key = setupKey({ seed: 1, course: 'ss2', s: {} });
    keepGhost({ at: '2026-11-13T01:00:00Z', key, elapsed: 2700, place: 2, of: 4, pts: track(200) });
    keepGhost({ at: '2026-11-13T02:00:00Z', key, elapsed: 2600, place: 1, of: 4, pts: track(200, 5) });
    keepGhost({ at: '2026-11-13T03:00:00Z', key: 'other', elapsed: 2000, pts: track(200) });
    const g = ghostsFor(key); expect(g.map(x => x.elapsed)).toEqual([2600, 2700]);
    expect(loadGhost(g[0].at)!.pts[0].x).toBeCloseTo(5, 1);
  });
  it('placed between its seconds: position, heading the short way round, and nothing outside its track', () => {
    const pts: GhostPoint[] = [{ t: 0, x: 0, y: 0, h: 350, boom: 0, tack: 'P' }, { t: 1, x: 2, y: 0, h: 10, boom: 10, tack: 'S' }];
    const m = ghostAt(pts, 0.5)!; expect(m.x).toBeCloseTo(1); expect(m.h).toBeCloseTo(0); expect(m.boom).toBeCloseTo(5);
    expect(ghostAt(pts, -1)).toBeNull(); expect(ghostAt(pts, 2)).toBeNull();
  });
  it('thinned to every other second, but every second round a tack', () => {
    const t = track(100), k = thin(t);
    expect(k.length).toBeLessThan(60); expect(k.some(p => p.t === t[50].t) && k.some(p => p.t === t[49].t)).toBe(true); // (the tack at 50 kept)
  });
  it('from the race\'s own track: her column', () => {
    const frames = [{ t: -1, b: [[1, 2, 3, 'P', 4], [9, 9, 9, 'S', 9]] }, { t: 0, b: [[2, 3, 4, 'S', 5], [9, 9, 9, 'S', 9]] }] as any;
    expect(trackOf(frames, 0)).toEqual([{ t: -1, x: 1, y: 2, h: 3, boom: 4, tack: 'P' }, { t: 0, x: 2, y: 3, h: 4, boom: 5, tack: 'S' }]);
  });
  it('the gap: when the ghost passed the spot you\'re at, against the clock now; nothing if you\'re off its line', () => {
    const pts: GhostPoint[] = Array.from({ length: 200 }, (_, i) => ({ t: i, x: i * 2, y: 0, h: 90, boom: 0, tack: 'P' as const }));
    expect(ghostGap(pts, { x: 100, y: 5 }, 60)).toBeCloseTo(10); // (it was at x = 100 at 50 s: 10 s ahead of you)
    expect(ghostGap(pts, { x: 100, y: 5 }, 40)).toBeCloseTo(-10); // (it gets there at 50 s: 10 s behind)
    expect(ghostGap(pts, { x: 100, y: 300 }, 60)).toBeNull();
  });
});
