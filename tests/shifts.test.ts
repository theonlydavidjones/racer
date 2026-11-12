import { describe, expect, it } from 'vitest';
import { ShiftField, shiftStats } from '../src/environment/shifts';
import { makeRng } from '../src/core/rng';
import { KT, V } from '../src/core/math';
import fit from '../src/environment/data/sf-wind-shifts.json';
import { World } from '../src/sim/world';
import { DEFAULT_SETTINGS } from '../src/settings';
import type { CourseFile } from '../src/courses/course';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';

/**
 * The shift field against Fort Point's 6-minute record (scripts/fit-wind-shifts.mjs): sampled as the station samples
 * (a 2-minute mean every 6 minutes, each day's straight-line drift taken out, as the fit does), its structure function
 * plus the record's own quick part (σn: shifts under a few minutes and the station's turbulence, which the puffs carry)
 * should be the record's measured one.
 */
type Cls = { kt: number; days: number; dir: number[]; spd: number[]; rms: { dir: number[]; spd: number[] } };
import real from '../src/environment/data/sf-real-days.json';
import { n360, wrap } from '../src/core/math';
const classes = (fit as unknown as { classes: Record<string, Cls[]> }).classes;

function structure(kind: 'west' | 'north', c: Cls) {
  const openKt = c.kt * 1.25, ms = openKt * KT, st = shiftStats(kind, openKt), lags = [1, 5, 10];
  const D = lags.map(() => 0), Du = lags.map(() => 0); let n = 0;
  for (let day = 0; day < 60; day++) {
    const f = new ShiftField(makeRng(1000 + day), 250, ms, { x: 0, y: 0 }, st), th: number[] = [], u: number[] = [];
    // (6 hours: a 2-minute mean (every 10 s) every 6 minutes, at a fixed point)
    for (let s = 0; s < 60; s++) {
      let a = 0, b = 0;
      for (let i = 0; i < 12; i++) { const w = f.at({ x: 0, y: 0 }); a += w.turn; b += w.k; f.step(10, ms, 250); }
      th.push(a / 12); u.push(b / 12);
      for (let i = 0; i < 24; i++) f.step(10, ms, 250);
    }
    const detrend = (x: number[]) => { const m = x.length, mx = (m - 1) / 2, my = x.reduce((p, q) => p + q, 0) / m; let sxy = 0, sxx = 0; x.forEach((v, i) => { sxy += (i - mx) * (v - my); sxx += (i - mx) ** 2; }); return x.map((v, i) => v - my - sxy / sxx * (i - mx)); };
    const T = detrend(th), U = detrend(u);
    lags.forEach((L, j) => { for (let i = 0; i + L < T.length; i++) { D[j] += (T[i + L] - T[i]) ** 2; Du[j] += (U[i + L] - U[i]) ** 2; } });
    n++;
  }
  return lags.map((L, j) => {
    const cnt = n * (60 - L);
    return { dir: Math.sqrt(D[j] / cnt + 2 * c.dir[0] ** 2), spd: Math.sqrt(Du[j] / cnt + 2 * c.spd[0] ** 2), recDir: c.rms.dir[j], recSpd: c.rms.spd[j] };
  });
}

/** The lag (in samples) at which `b`'s changes best match `a`'s (first differences: the quick shifts, not the slow drift). */
function bestLag(a: number[], b: number[], max: number): number {
  const da = a.slice(1).map((v, i) => v - a[i]), db = b.slice(1).map((v, i) => v - b[i]);
  let best = 0, bestC = -Infinity;
  for (let lag = 0; lag <= max; lag++) { let c = 0; for (let i = 0; i + lag < da.length; i++) c += da[i] * db[i + lag]; if (c > bestC) { bestC = c; best = lag; } }
  return best;
}

describe("the wind's shifts, against Fort Point's record", () => {
  it("the record's own numbers, worked out here independently: on 10–15 kt westerlies the direction changes by 12–14° rms over half an hour", () => {
    // (each racing-hours day of Fort Point's record classed as the fit classes it, the change over 30 minutes taken the
    // short way round the compass, every pair of samples; no detrending: the fit's own takes out a little)
    const R = real as unknown as { wind: Record<string, string>; slot0: number; slotMin: number; slots: number };
    let sum = 0, n = 0;
    for (const s of Object.values(R.wind)) {
      const bin = atob(s), pts: ([number, number] | null)[] = [];
      for (let k = 0; k < R.slots; k++) { const m = R.slot0 + k * R.slotMin; if (m < 660 || m >= 1020) continue; const sp = bin.charCodeAt(k * 3), d = bin.charCodeAt(k * 3 + 1); pts.push(sp === 255 || d === 255 || sp < 8 ? null : [sp / 4, d * 2]); }
      const ok = pts.filter(Boolean) as [number, number][]; if (ok.length < 50) continue;
      let vx = 0, vy = 0, kt = 0; for (const [a, d] of ok) { vx += Math.sin(d * Math.PI / 180) * a; vy += Math.cos(d * Math.PI / 180) * a; kt += a; }
      const mean = kt / ok.length, dir = n360(Math.atan2(vx, vy) * 180 / Math.PI);
      if (mean < 10 || mean >= 15 || dir < 200 || dir >= 330 || Math.hypot(vx, vy) / ok.length < 0.5 * mean) continue;
      for (let i = 0; i + 5 < pts.length; i++) { const a = pts[i], b = pts[i + 5]; if (a && b) { sum += wrap(b[1] - a[1]) ** 2; n++; } }
    }
    const rms = Math.sqrt(sum / n), fitted = classes.west[2];
    expect(rms).toBeGreaterThan(12); expect(rms).toBeLessThan(14);
    expect(Math.abs(fitted.rms.dir[1] - rms) / rms).toBeLessThan(0.08); // (the fit script's figure, detrended, agrees)
  });
  for (const [kind, i] of [['west', 1], ['west', 2], ['north', 1]] as const) {
    const c = classes[kind][i];
    it(`${kind} days of ${c.kt} kt at the station (${c.days} days): the rms change over 6, 30 and 60 minutes within 15% of the record's`, () => {
      for (const r of structure(kind, c)) {
        expect(r.dir / r.recDir).toBeGreaterThan(0.85); expect(r.dir / r.recDir).toBeLessThan(1.15);
        expect(r.spd / r.recSpd).toBeGreaterThan(0.85); expect(r.spd / r.recSpd).toBeLessThan(1.15);
      }
    });
  }
  it('the shifts come down the course with the wind: 600 m downwind sees the same shift about 600/U s later', () => {
    const ms = 6, f = new ShiftField(makeRng(7), 270, ms, { x: 0, y: 0 }, shiftStats('west', 12)), down = V(90); // (from the west: downwind is east)
    const up: number[] = [], lo: number[] = [];
    for (let s = 0; s < 4000; s++) { up.push(f.at({ x: 0, y: 0 }).turn); lo.push(f.at({ x: down.x * 600, y: down.y * 600 }).turn); f.step(1, ms, 270); }
    const best = bestLag(up, lo, 300); // (s)
    expect(best).toBeGreaterThan(80); expect(best).toBeLessThan(120);
  });
  // (frozen in the air, a shift's pattern is about as wide as it is long, U·T: some 3 km for the several-minute
  // oscillations in 12 kt, so across a course of a kilometre or two the sides differ, but don't disagree)
  it('and they differ across the course: 3 km apart across the wind, the quick shifts are only loosely related', () => {
    const ms = 6, f = new ShiftField(makeRng(11), 270, ms, { x: 0, y: 0 }, { dir: [{ s: 8, T: 8 }], spd: [] }), across = V(0);
    const A: number[] = [], B: number[] = [];
    for (let s = 0; s < 6000; s++) { A.push(f.at({ x: 0, y: 0 }).turn); B.push(f.at({ x: across.x * 3000, y: across.y * 3000 }).turn); f.step(2, ms, 270); }
    // (the correlation about each point's own mean)
    const ma = A.reduce((p, q) => p + q, 0) / A.length, mb = B.reduce((p, q) => p + q, 0) / B.length;
    let sab = 0, saa = 0, sbb = 0;
    A.forEach((a, i) => { sab += (a - ma) * (B[i] - mb); saa += (a - ma) ** 2; sbb += (B[i] - mb) ** 2; });
    expect(sab / Math.sqrt(saa * sbb)).toBeLessThan(0.7);
  });
  it('in a race: a boat 600 m upwind of another gets a shift first, and the same seed gives the same shifts', () => {
    const mk = () => new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', tideDate: '2027-07-10', tideTime: '13:00', fleet: 0 }, 5);
    const a = mk(), b = mk();
    expect(a.shifts).not.toBeNull();
    // (the course is laid to the wind there is: the shifts count from then)
    expect(Math.abs(wrap(a.wind.from - a.windModel.base))).toBeLessThan(1e-9);
    const c = a.C.center, up = V(a.windModel.base), p = { x: c.x + up.x * 300, y: c.y + up.y * 300 }, q = { x: c.x - up.x * 300, y: c.y - up.y * 300 };
    const sp: number[] = [], sq: number[] = [];
    for (let i = 0; i < 60 * 1200; i++) { a.step(); b.step(); if (i % 60 === 0) { sp.push(a.shifts!.at(p).turn); sq.push(a.shifts!.at(q).turn); } }
    expect(a.wind).toEqual(b.wind);
    const best = bestLag(sp, sq, 240), U = a.windModel.kt * KT; // (s)
    expect(best).toBeGreaterThan(0.7 * 600 / U); expect(best).toBeLessThan(1.3 * 600 / U);
  }, 120000);
});
