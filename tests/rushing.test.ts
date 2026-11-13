import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { waveTime } from '../src/environment/waveField';
import { foamDrift } from '../src/environment/sea';
import { KT } from '../src/core/math';
import { packWaves } from '../src/render/waves';
import { LL } from '../src/geo/geo';
import { HARBORS, harborAt } from '../src/geo/marina';

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
  const run = (label: string, s: Partial<Settings>, opts: object, jumpAt?: number, jumpBy = { x: 1500, y: 800 }, steps = 60 * 360) => {
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, tideDate: '2026-11-14', ...s } as Settings, 1, opts as never);
    const f = w.waves, N = f.k.length;
    const pts = [0, 200, 1000, 3000].map(r => ({ x: w.user.x + r, y: w.user.y }));
    let prev: number[][] | null = null, pt = 0, worst = 0;
    for (let i = 0; i < steps; i++) {
      if (jumpAt != null && i === jumpAt) w.moveHere({ x: w.user.x + jumpBy.x, y: w.user.y + jumpBy.y }, 'here');
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
  it('cruising from South Beach Harbor, 10+ minutes, out on the water off the harbor (the owner saw it rush there, v176)', () => {
    const boat = { ...DEFAULT_SETTINGS.boat, slip: 'south-beach:C12' };
    const r = run('south beach', { mode: 'sail', sailFrom: 'slip', sailTo: '', boat, boats: [boat], boatId: boat.id } as Partial<Settings>, { freeSail: true }, 60 * 30, { x: 600, y: 300 }, 60 * 660);
    expect(r.worst).toBeLessThan(0.05);
  }, 400_000);
  it('the drawn water keeps its phase out at South Beach after hours (float32 in the shader, from a local origin)', () => {
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, tideDate: '2026-11-14' } as Settings, 1);
    w.waves.update(w.waveRef(), 270, 1, { x: 5000, y: -3400 });
    const f = w.waves, A = new Float32Array(60), B = new Float32Array(60), F = Math.fround;
    let worst = 0;
    for (const tw of [1200, 3600, 4 * 3600]) for (const p of [{ x: 4940, y: -3398 }, { x: 5700, y: -3100 }, { x: 7940, y: -3398 }]) {
      const o = { x: Math.round(p.x / 500) * 500, y: Math.round(p.y / 500) * 500 }; // (as scene.ts sets it, round the camera)
      packWaves(f, A, B, tw, o);
      for (let i = 0; i < 15; i++) {
        const exact = f.k[i] * (f.sd[i] * p.x + f.cd[i] * p.y) - f.w[i] * tw + f.phase[i];
        const dx = F(F(p.x) - F(o.x)), dy = F(F(p.y) - F(o.y)); // the shader: A.z * dot(A.xy, p - uWaveO) + B.y, in float32
        const th = F(F(A[i * 4 + 2] * F(F(A[i * 4] * dx) + F(A[i * 4 + 1] * dy))) + B[i * 4 + 1]);
        let d = th - exact; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
        worst = Math.max(worst, Math.abs(d));
        expect(Math.abs(th)).toBeLessThan(2000); // (small arguments for the GPU's sin)
      }
    }
    expect(worst).toBeLessThan(1e-3);
  });
  it('inside the South Beach breakwater by its corner (the owner\'s second report): every wave at its own speed, the water near slack', () => {
    const corner = LL(37.7815, -122.3855); // (3–5 ft of water, just inside the breakwater's corner, heading NE along the shore)
    const boat = { ...DEFAULT_SETTINGS.boat, slip: 'south-beach:C12' };
    const w0 = new World(COURSES[0], { ...DEFAULT_SETTINGS, tideDate: '2026-11-14', tideTime: '16:00' } as Settings, 1);
    expect(harborAt(corner)?.id).toBe('south-beach');
    const c = w0.currentAt(corner);
    expect(Math.hypot(c.x, c.y) / KT).toBeLessThan(0.08); // (0.26 kt before: the open stream ran into the basin)
    const r = run('basin corner', { mode: 'sail', sailFrom: 'slip', sailTo: '', boat, boats: [boat], boatId: boat.id } as Partial<Settings>, { freeSail: true }, 60 * 600);
    expect(r.worst).toBeLessThan(0.05);
  }, 400_000);
  it('in every harbor\'s basin the water is near slack away from the mouth, and the stream fades in through it', () => {
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, tideDate: '2026-11-14', tideTime: '16:00', current: 'bigebb' } as Settings, 1);
    const kt = (p: { x: number; y: number }) => Math.hypot(w.currentAt(p).x, w.currentAt(p).y) / KT;
    for (const h of HARBORS) for (const p of h.basin) {
      const d = Math.min(...h.exits.map(e => Math.hypot(p.x - e.x, p.y - e.y)));
      const q = { x: p.x + (h.exits[0].x - p.x) * 0.02, y: p.y + (h.exits[0].y - p.y) * 0.02 }; // (a hair inside the edge)
      if (d > 150 && harborAt(q) === h) expect(kt(q), `${h.id}`).toBeLessThan(0.3); // (2.5 kt outside at most)
    }
  });
  it('the foam drifts with the surface water: the current and 3% of the wind, no more', () => {
    for (const kt of [5, 15, 25]) for (const cur of [{ x: 0, y: 0 }, { x: 1.5, y: -0.5 }]) {
      const d = foamDrift(270, kt, cur), extra = Math.hypot(d.x - cur.x, d.y - cur.y);
      expect(extra).toBeLessThanOrEqual(0.03 * kt * KT + 1e-9);
    }
  });
});
