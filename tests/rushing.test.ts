import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { waveTime } from '../src/environment/waveField';
import { foamDrift } from '../src/environment/sea';
import { KT } from '../src/core/math';

/**
 * "Rushing water" (the owner, v146, v158 and again v176): the water's pattern running past a still boat faster than the
 * water itself moves. Each layer of the water, held to that:
 * - the waves: at any fixed point, near the boat or kilometres off, each component's phase runs at its own frequency
 *   (−ω): the pattern moves at the wave's own speed and no faster, while the field eases round with the wind and the
 *   swell, as she sails, on a sea-breeze afternoon whose wind turns, and after she's moved somewhere else;
 * - the foam: with the surface water, the current plus the wind's drift of the top layer (3% of the wind);
 * - (the puffs' dark patches, cat's paws, cross the water at the wind's own speed, as real ones do: a gust's footprint
 *   is the wind's, not the water's. Not held to this.)
 */
describe('nothing moves past a still boat faster than its own waves (the owner\'s "rushing water")', () => {
  const run = (label: string, s: Partial<Settings>, opts: object, jumpAt?: number) => {
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, tideDate: '2026-11-14', ...s } as Settings, 1, opts as never);
    const f = w.waves, N = f.k.length;
    const pts = [0, 200, 1000, 3000].map(r => ({ x: w.user.x + r, y: w.user.y }));
    let prev: number[][] | null = null, pt = 0, worst = 0;
    for (let i = 0; i < 60 * 360; i++) {
      if (jumpAt != null && i === jumpAt) w.moveHere({ x: w.user.x + 1500, y: w.user.y + 800 }, 'here');
      w.step(DT);
      const tw = waveTime(w.t);
      const th = pts.map(p => Array.from({ length: N }, (_, j) => f.k[j] * (f.sd[j] * p.x + f.cd[j] * p.y) - f.w[j] * tw + f.phase[j]));
      if (prev) for (let q = 0; q < pts.length; q++) for (let j = 0; j < N; j++) {
        if (f.amp[j] <= 1e-3) continue;
        let d = th[q][j] - prev[q][j]; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
        worst = Math.max(worst, Math.abs(d / (tw - pt) + f.w[j]) / f.w[j]);
      }
      prev = th; pt = tw;
    }
    return { label, worst };
  };
  it('in a race: at the boat and 200 m, 1 km and 3 km off, every wave at its own speed', () => {
    expect(run('race', {}, {}).worst).toBeLessThan(0.05);
  }, 300_000);
  it('sailing free from the Gate (the swell turned by the bar as she sails; this rushed in v176)', () => {
    expect(run('cruise', { mode: 'sail', sailFrom: 'gate', sailTo: '' } as Partial<Settings>, { freeSail: true }).worst).toBeLessThan(0.05);
  }, 300_000);
  it('on a sea-breeze afternoon (the course wind turning with the day) and after "Move her here"', () => {
    expect(run('breeze', { windKt: 0, mode: 'sail', sailFrom: 'gate', sailTo: '' } as Partial<Settings>, { freeSail: true }, 60 * 120).worst).toBeLessThan(0.05);
  }, 300_000);
  it('the foam drifts with the surface water: the current and 3% of the wind, no more', () => {
    for (const kt of [5, 15, 25]) for (const cur of [{ x: 0, y: 0 }, { x: 1.5, y: -0.5 }]) {
      const d = foamDrift(270, kt, cur), extra = Math.hypot(d.x - cur.x, d.y - cur.y);
      expect(extra).toBeLessThanOrEqual(0.03 * kt * KT + 1e-9);
    }
  });
});
