import { describe, expect, it } from 'vitest';
import { CurrentField, stationsFor, sfLocalToUtcMin } from '../src/environment/tide';

describe('the current field across the race area', () => {
  it('at every NOAA station it is that station\'s own prediction (within 0.05 kt, through a whole tidal day)', () => {
    const t0 = sfLocalToUtcMin('2026-11-14', '06:00'), st = stationsFor(t0, t0 + 24 * 60), f = new CurrentField(st), own = new CurrentField(st);
    expect(st.length).toBeGreaterThan(30);
    let worst = 0;
    for (let h = 0; h < 24; h += 0.5) {
      f.setTime(t0 + h * 60); own.setTime(t0 + h * 60);
      st.forEach((s, i) => { const c = f.atShore(s.p), v = (own as unknown as { vecs: { x: number; y: number }[] }).vecs[i]; worst = Math.max(worst, Math.hypot(c.x - v.x, c.y - v.y) / 0.5144); });
    }
    expect(worst).toBeLessThan(0.05);
  });
});
