import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import type { Boat } from '../src/boat/boat';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { aiThink } from '../src/ai/ai';
import { beatFor } from '../src/boat/seaway';
import { V, n360, wrap } from '../src/core/math';

// The AI in irons (ai.ts, "Way on, first"): stopped head to wind or going astern, she sheets in and bears away onto a
// close reach until she has way to steer (US Sailing, "Getting in and out of irons"); but not before the gun while
// she's burning time on her approach, coasting slow with her sails let go on purpose, which her timing counts on.
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, current: 'slack', tideDate: '2026-11-14', traffic: 0, ...o });
function alone(t: number) {
  const w = new World(ss2 as unknown as CourseFile, settings({ fleet: 2 }), 1);
  w.t = t;
  const [, B] = w.boats, F = w.wind.from;
  const at = { x: w.center.x - w.N.x * 400, y: w.center.y - w.N.y * 400 };
  for (const b of w.boats) Object.assign(b, { x: b.x + 5000, y: b.y + 5000 });
  const put = (h: number, v: number, astern: number) => {
    const u = V(h), rel = wrap(F - h);
    Object.assign(B, { x: at.x, y: at.y, h: n360(h), desired: n360(h), v, astern, vx: u.x * (v - astern), vy: u.y * (v - astern), tack: rel >= 0 ? 'S' : 'P', twa: Math.abs(rel), rel, tacking: false, penalty: 0, started: t > 0 });
    B.ww = { from: F, kt: w.wind.kt };
  };
  return { w, B, F, put };
}
const off = (F: number, b: Boat) => Math.abs(wrap(F - b.desired));
describe('the AI in irons gathers way (ai.ts gather)', () => {
  it('stopped head to wind and going astern, racing: sheets in, and bears away onto a close reach', () => {
    const { w, B, F, put } = alone(300);
    put(n360(F - 5), 0.05, 0.4); // (5° off the wind on starboard, going astern)
    aiThink(w, B, DT);
    expect(B.ai!.gather, 'gathering way').toBe(true);
    expect(B.luff, 'sails drawing').toBe(false);
    const beat = beatFor(B);
    expect(off(F, B), 'a close reach').toBeGreaterThan(beat + 10);
    expect(off(F, B)).toBeLessThan(beat + 35);
  });
  it('before the gun, burning time on her approach (coasting slow, sails let go): left to it', () => {
    const { w, B, F, put } = alone(-40);
    B.ai!.mode = 'approach';
    put(n360(F - 45), 0.2, 0); // (close-hauled, slow, no sternway)
    aiThink(w, B, DT);
    expect(B.ai!.gather ?? false).toBe(false);
  });
  it('but going astern on her approach, she does gather way', () => {
    const { w, B, F, put } = alone(-40);
    B.ai!.mode = 'approach';
    put(n360(F - 20), 0.05, 0.3);
    aiThink(w, B, DT);
    expect(B.ai!.gather).toBe(true);
  });
});
