import { describe, expect, it } from 'vitest';
import { sunPosition, sunTimes } from '../src/environment/sun';
import { sfClock, sfLocalToUtcMin } from '../src/environment/tide';

const at = (d: string, t: string) => sfLocalToUtcMin(d, t) * 60000;

describe('the sun over the Cityfront', () => {
  it('midsummer: about 75–76° up at solar noon (around 13:10 PDT), due south', () => {
    let best = { el: -90, az: 0, t: 0 };
    for (let m = 0; m < 240; m++) { const t = at('2027-06-21', '11:30') + m * 60000, p = sunPosition(t); if (p.el > best.el) best = { ...p, t }; }
    expect(best.el).toBeGreaterThan(75); expect(best.el).toBeLessThan(76.3);
    expect(Math.abs(best.az - 180)).toBeLessThan(2);
    expect(sfClock(best.t / 60000)).toMatch(/^13:(0|1)\d$/);
  });
  it('midwinter: only about 29° up at noon', () => {
    const p = sunPosition(at('2026-12-21', '12:10'));
    expect(p.el).toBeGreaterThan(27.5); expect(p.el).toBeLessThan(29.5);
  });
  it('sets just before 5 pm in mid-November, around 8:30 pm in late June', () => {
    expect(sfClock(sunTimes(at('2026-11-14', '12:00')).set / 60000)).toMatch(/^(16:5[5-9]|17:0[0-2])$/);
    expect(sfClock(sunTimes(at('2027-06-21', '12:00')).set / 60000)).toMatch(/^20:3\d$/);
  });
  it('afternoon sun is in the southwest to west', () => {
    const p = sunPosition(at('2027-07-10', '16:00'));
    expect(p.az).toBeGreaterThan(240); expect(p.az).toBeLessThan(285);
  });
});
