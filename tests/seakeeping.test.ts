import { describe, expect, it } from 'vitest';
import { N_WAVES, WaveField } from '../src/environment/waveField';
import { NATURAL, waveForces, waveMotion } from '../src/boat/seaway';
import { hullGeometry } from '../src/render/hull';
import { HULL } from '../src/boat/dynamics';
import type { Boat } from '../src/boat/boat';
import type { SeaHere } from '../src/environment/sea';

const G = 9.81, D2R = Math.PI / 180;
const SEA: SeaHere = { hsW: 1, tpW: 3, fromW: 0, hsS: 1, tpS: 12, fromS: 0, steep: 0, white: 0, fetch: 0 };

/** A field of one regular wave: period T (s), amplitude a (m), travelling toward `dir` (deg). */
function regular(T: number, a: number, dir: number): WaveField {
  const f = new WaveField(12);
  f.amp.fill(0); f.refW = 1; f.refS = 1;
  const k = (2 * Math.PI / T) ** 2 / G;
  f.k[0] = k; f.w[0] = 2 * Math.PI / T; f.amp[0] = a; f.phase[0] = 0; f.swell[0] = 0;
  f.dir[0] = dir; f.sd[0] = Math.sin(dir * D2R); f.cd[0] = Math.cos(dir * D2R);
  return f;
}
/** Sail her at v m/s on heading h through field f for `secs` s; the heave and pitch amplitudes over the last half. */
function sail(f: WaveField, h: number, v: number, secs = 120) {
  const b = { x: 0, y: 0, h, v, sea: SEA } as unknown as Boat, dt = 1 / 60;
  let zMax = 0, thMax = 0;
  for (let i = 0, n = secs * 60; i < n; i++) {
    b.x += v * Math.sin(h * D2R) * dt; b.y += v * Math.cos(h * D2R) * dt;
    waveMotion(b, f, i * dt, dt);
    if (i > n / 2) { zMax = Math.max(zMax, Math.abs(b.heave!)); thMax = Math.max(thMax, Math.abs(b.pitch!)); }
  }
  return { z: zMax, th: thMax };
}

describe('her hydrostatics, from the drawn hull', () => {
  it('the waterplane seaway.ts uses is the drawn hull\'s, sliced at its waterline', () => {
    // (sliced at its drawn waterline)
    const g = hullGeometry(), p = g.attributes.position.array as ArrayLike<number>, idx = g.index!.array, y0 = -1e-6, dz = 0.02, Z0 = -3.9;
    const row = new Array(Math.round(7.8 / dz) + 1).fill(-1);
    for (let t = 0; t < idx.length; t += 3) for (let a = 0; a < 3; a++) {
      const A = idx[t + a] * 3, B = idx[t + (a + 1) % 3] * 3;
      if ((p[A + 1] - y0) * (p[B + 1] - y0) > 0 || p[A + 1] === p[B + 1]) continue;
      const s = (y0 - p[A + 1]) / (p[B + 1] - p[A + 1]), x = Math.abs(p[A] + s * (p[B] - p[A])), z = p[A + 2] + s * (p[B + 2] - p[A + 2]), i = Math.round((z - Z0) / dz);
      row[i] = Math.max(row[i], x);
    }
    const got = row.map((v, i) => v >= 0 ? i : -1).filter(i => i >= 0);
    for (let k = 0; k < got.length - 1; k++) for (let i = got[k] + 1; i < got[k + 1]; i++) row[i] = row[got[k]] + (row[got[k + 1]] - row[got[k]]) * (i - got[k]) / (got[k + 1] - got[k]);
    let A = 0, M = 0; row.forEach((hb, i) => { if (hb > 0) { A += 2 * hb * dz; M += 2 * hb * dz * (Z0 + i * dz); } });
    const zc = M / A; let IL = 0; row.forEach((hb, i) => { if (hb > 0) IL += 2 * hb * dz * (Z0 + i * dz - zc) ** 2; });
    expect(A).toBeCloseTo(8.9, 1); expect(IL).toBeGreaterThan(16.7); expect(IL).toBeLessThan(17.7); expect(zc).toBeCloseTo(0.22, 1);
  });

  it('the added mass is strip theory\'s from her own sections, each by its Lewis form (Journée & Massie ch. 6)', () => {
    const g = hullGeometry(), p = g.attributes.position.array as ArrayLike<number>, idx = g.index!.array;
    const dz = 0.02, dy = 0.02, NY = 62, Z0 = -3.9, NZ = Math.round(7.8 / dz), RHO = 1025;
    const grid: number[][] = Array.from({ length: NY + 1 }, () => new Array(NZ + 1).fill(-1));
    for (let t = 0; t < idx.length; t += 3) for (let j = 0; j <= NY; j++) {
      const y0 = -j * dy - 1e-6;
      for (let a = 0; a < 3; a++) { const A = idx[t + a] * 3, B = idx[t + (a + 1) % 3] * 3;
        if ((p[A + 1] - y0) * (p[B + 1] - y0) > 0 || p[A + 1] === p[B + 1]) continue;
        const s = (y0 - p[A + 1]) / (p[B + 1] - p[A + 1]), x = Math.abs(p[A] + s * (p[B] - p[A])), z = p[A + 2] + s * (p[B + 2] - p[A + 2]), i = Math.round((z - Z0) / dz);
        grid[j][i] = Math.max(grid[j][i], x); }
    }
    for (const row of grid) { const got = row.map((v, i) => v >= 0 ? i : -1).filter(i => i >= 0);
      for (let k = 0; k < got.length - 1; k++) for (let i = got[k] + 1; i < got[k + 1]; i++) row[i] = row[got[k]] + (row[got[k + 1]] - row[got[k]]) * (i - got[k]) / (got[k + 1] - got[k]);
      for (let i = 0; i < row.length; i++) if (row[i] < 0) row[i] = 0; }
    // each section: its waterline beam B, the canoe body's draft T (down to where it narrows to the keel) and area
    // coefficient σ; Lewis's mapping coefficients from B/2T and σ, and the 2-D heave added mass ρ·π/8·B²·C
    const rows: { z: number; m: number }[] = []; let Awp = 0, Mz = 0;
    for (let i = 0; i <= NZ; i++) {
      const b0 = grid[0][i], z = Z0 + i * dz; if (b0 < 0.01) continue;
      let T = 0, Ac = 0; for (let j = 1; j <= NY; j++) { const h = grid[j][i]; if (h >= 0.12) { T = j * dy; Ac += 2 * h * dy; } }
      const B = 2 * b0, H0 = B / (2 * Math.max(0.02, T)), sig = Math.min(0.95, Math.max(0.3, Ac / (B * Math.max(0.02, T))));
      const C1 = (3 + 4 * sig / Math.PI) + (1 - 4 * sig / Math.PI) * ((H0 - 1) / (H0 + 1)) ** 2;
      const a3 = (-C1 + 3 + Math.sqrt(9 - 2 * C1)) / C1, a1 = (1 + a3) * (H0 - 1) / (H0 + 1);
      const C = ((1 + a1) ** 2 + 3 * a3 * a3) / (1 + a1 + a3) ** 2;
      rows.push({ z, m: RHO * Math.PI / 8 * B * B * C }); Awp += B * dz; Mz += B * dz * z;
    }
    const zc = Mz / Awp; let a33 = 0, a55 = 0; for (const r of rows) { a33 += r.m * dz; a55 += r.m * (r.z - zc) ** 2 * dz; }
    expect(a33).toBeGreaterThan(5240 * 0.95); expect(a33).toBeLessThan(5240 * 1.05);
    expect(a55).toBeGreaterThan(8120 * 0.95); expect(a55).toBeLessThan(8120 * 1.05);
  });

  it('natural periods: heave about 1.8 s, pitch about 2.0 s (roll is balance.ts\'s, about 3.5 s)', () => {
    expect(NATURAL.heave).toBeGreaterThan(1.6); expect(NATURAL.heave).toBeLessThan(2.0);
    expect(NATURAL.pitch).toBeGreaterThan(1.8); expect(NATURAL.pitch).toBeLessThan(2.2);
    // (and she is the boat the rest of the physics sails: HULL.displacement)
    expect(HULL.displacement).toBeGreaterThan(2000);
  });
});

describe('the waves move her', () => {
  it('in a long swell she rides the surface: heaves with it and pitches to its slope', () => {
    const T = 12, a = 0.5, f = regular(T, a, 0), k = (2 * Math.PI / T) ** 2 / G;
    const r = sail(f, 0, 0); // stopped, bow into it (heading north, the swell travelling north: from astern; no matter, a long wave)
    expect(r.z).toBeGreaterThan(a * 0.93); expect(r.z).toBeLessThan(a * 1.07);
    expect(r.th).toBeGreaterThan(k * a * 0.9); expect(r.th).toBeLessThan(k * a * 1.15);
  });

  it('a ripple much shorter than she is cancels along her: she barely stirs', () => {
    const f = regular(1.0, 0.1, 180), r = sail(f, 0, 2.5); // 1.6 m waves, head on
    expect(r.z).toBeLessThan(0.1 * 0.05); expect(r.th).toBeLessThan(0.01 * D2R * 100 * 0.1);
  });

  it('beam on, a wave about her beam long lifts her but hardly pitches her', () => {
    const f = regular(1.4, 0.15, 90), r = sail(f, 0, 0);
    expect(r.th).toBeLessThan(0.002);
  });

  it('hobby-horsing: close-hauled at 5 kt in the chop, her pitch peaks where the waves meet her at her pitch period', () => {
    // the chop from 40° on her bow (she's close-hauled, the waves running down the wind); sweep its period, the same
    // steepness each time (H/L = 1/14), and measure her pitch against the waves' own slope
    const v = 5 * 0.5144, rel = 140; // waves travelling toward 140° off her heading: meeting her 40° off the bow
    const rows = [1.8, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0, 3.4, 3.8, 4.4].map(T => {
      const L = G * T * T / (2 * Math.PI), k = 2 * Math.PI / L, a = L / 28;
      const r = sail(regular(T, a, rel), 0, v, 90);
      const we = 2 * Math.PI / T + k * v * Math.cos(40 * D2R);
      return { T, Te: 2 * Math.PI / we, gain: r.th / (k * a) };
    });
    const best = rows.reduce((p, q) => q.gain > p.gain ? q : p);
    // the peak where she meets them at about her natural pitch period (2.0 s; at 2.1 s here, the damping and the waves
    // cancelling along her pulling it a little long): a 2.8–3.4 s chop, the Bay's afternoon sea at its bigger end
    expect(best.Te).toBeGreaterThan(NATURAL.pitch * 0.9); expect(best.Te).toBeLessThan(NATURAL.pitch * 1.25);
    expect(best.T).toBeGreaterThanOrEqual(2.8); expect(best.T).toBeLessThanOrEqual(3.4);
    // and it's a real peak, if a broad one (the water's own push back, the diffraction, cancels much of the waves' at
    // her natural period, and 0.25 damping takes the rest): about 1.2 × what a long sea gives (where she just follows
    // the slope), and far more than in short chop
    expect(best.gain).toBeGreaterThan(1.12 * rows[rows.length - 1].gain);
    expect(best.gain).toBeGreaterThan(5 * rows[0].gain);
  });

  it('the response is the oscillator\'s closed form: steady amplitude M/√((C − Iω²)² + (Bω)²)', () => {
    const T = 2.6, a = 0.15, f = regular(T, a, 180), b = { x: 0, y: 0, h: 0, sea: SEA } as unknown as Boat;
    // the moment's amplitude on her where she is (stopped, head seas)
    let Mmax = 0; for (let t = 0; t < T; t += 0.01) Mmax = Math.max(Mmax, Math.abs(waveForces(f, b, 0, t, 1, 1).M));
    const w = 2 * Math.PI / T, wn = 2 * Math.PI / NATURAL.pitch, zeta = 0.25;
    // (amplitude for unit inertia I: M/I over √((wn² − w²)² + (2ζ wn w)²); I from the natural period and the restoring ρ g I_L)
    const C55 = 1025 * G * 17.2, I = C55 / (wn * wn);
    const want = Mmax / I / Math.sqrt((wn * wn - w * w) ** 2 + (2 * zeta * wn * w) ** 2);
    const r = sail(f, 0, 0);
    expect(r.th / want).toBeGreaterThan(0.95); expect(r.th / want).toBeLessThan(1.05);
  });
});

describe('phase 2: the waves surge her and heel her', () => {
  const B = { x: 0, y: 0, h: 0, sea: SEA } as unknown as Boat;
  it('a long swell abeam tilts her with its slope (the heel she settles to follows the water across her)', () => {
    const T = 12, a = 0.5, k = (2 * Math.PI / T) ** 2 / G, f = regular(T, a, 90); // travelling east, she heads north: beam on
    let m = 0; for (let t = 0; t < T; t += 0.05) m = Math.max(m, Math.abs(waveForces(f, B, 0, t, 1, 1).S));
    expect(m).toBeGreaterThan(k * a * 0.95); expect(m).toBeLessThan(k * a * 1.01);
    // and head on, no slope across her
    let h = 0; const g = regular(T, a, 0); for (let t = 0; t < T; t += 0.05) h = Math.max(h, Math.abs(waveForces(g, B, 0, t, 1, 1).S));
    expect(h).toBeLessThan(1e-6);
  });
  it('a long swell from astern carries her to and fro with its orbit (a·ω), and nowhere on average', () => {
    const T = 12, a = 0.5, f = regular(T, a, 0); // travelling north, she heads north
    let mx = 0, sum = 0, n = 0, mv = 0; for (let t = 0; t < T; t += 0.01) { const r = waveForces(f, B, 0, t, 1, 1); mx = Math.max(mx, Math.abs(r.U)); mv = Math.max(mv, Math.abs(r.V)); sum += r.U; n++; }
    const want = a * 2 * Math.PI / T;
    expect(mx / want).toBeGreaterThan(0.95); expect(mx / want).toBeLessThan(1.01);
    expect(Math.abs(sum / n)).toBeLessThan(want * 0.01); expect(mv).toBeLessThan(1e-9);
  });
  it('sailing through the orbit: at the wave\'s own speed the convective term equals the water\'s acceleration (together, the whole push of a face: surf-riding)', () => {
    const T = 3, a = 0.3, f = regular(T, a, 0), w = 2 * Math.PI / T, c = G / w; // following, travelling the way she heads
    for (const t of [0.1, 0.6, 1.3, 2.2]) {
      const r0 = waveForces(f, B, 0, t, 1, 1), r1 = waveForces(f, B, 0, t + 1e-4, 1, 1);
      const dUdt = (r1.U - r0.U) / 1e-4;
      expect(-c * r0.DU).toBeCloseTo(dUdt, 3);
    }
  });
  it('a stopped boat in steep chop, sails down: the orbit carries her to and fro but not along (no creeping ahead)', async () => {
    const { DEFAULT_SETTINGS } = await import('../src/settings');
    const { World, DT } = await import('../src/sim/world');
    const { COURSES } = await import('../src/courses/registry');
    const drift = (orbit: boolean) => {
      const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'gate', sailTo: '', tideDate: '2026-11-14', windKt: 22, chop: 2, current: 'none', traffic: 0 } as never, 1, { freeSail: true });
      const u = w.user; u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false } as never;
      let orbitMax = 0; for (let i = 0; i < 60 * 20; i++) { w.step(DT); if (!orbit) { u.waveU = 0; u.waveV = 0; } }
      const x0 = u.x, y0 = u.y;
      for (let i = 0; i < 60 * 120; i++) { w.step(DT); orbitMax = Math.max(orbitMax, Math.hypot(u.waveU ?? 0, u.waveV ?? 0)); if (!orbit) { u.waveU = 0; u.waveV = 0; } }
      return { dx: u.x - x0, dy: u.y - y0, orbitMax };
    };
    const a = drift(true), b = drift(false);
    expect(a.orbitMax).toBeGreaterThan(0.3); // (a lively orbit: 0.3 m/s and more)
    // the same drift over two minutes, to within a few metres (a creep of 0.3 kt would be 18 m)
    expect(Math.hypot(a.dx - b.dx, a.dy - b.dy)).toBeLessThan(4);
  });
  it('a ripple much shorter than she is cancels along her and across her: no orbit felt, no heel', () => {
    const f = regular(1.0, 0.1, 45); let mx = 0, ms = 0;
    for (let t = 0; t < 2; t += 0.01) { const r = waveForces(f, B, 0, t, 1, 1); mx = Math.max(mx, Math.abs(r.U)); ms = Math.max(ms, Math.abs(r.S)); }
    const k = (2 * Math.PI) ** 2 / G;
    expect(mx).toBeLessThan(0.1 * 0.1 * 2 * Math.PI); expect(ms).toBeLessThan(0.1 * k * 0.1);
  });
});

describe('the field is the World\'s', () => {
  it('fifteen components, all deterministic from the sea (no randomness, no clock but the one it is given)', () => {
    const s: SeaHere = { ...SEA, hsW: 0.6, tpW: 2.8, hsS: 0.3 };
    const a = new WaveField(13), b = new WaveField(13);
    for (let i = 0; i < 100; i++) { a.update(s, 250, 1 / 60, { x: 100, y: 200 }); b.update(s, 250, 1 / 60, { x: 100, y: 200 }); }
    for (let i = 0; i < N_WAVES; i++) { expect(a.amp[i]).toBe(b.amp[i]); expect(a.phase[i]).toBe(b.phase[i]); }
  });
});
