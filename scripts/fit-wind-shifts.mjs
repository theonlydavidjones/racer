#!/usr/bin/env node
/**
 * How the wind shifts on the Cityfront, from NOAA's Fort Point station (9414290 = NDBC FTPC1, anemometer about 10 m
 * above the water), from its 6-minute record over the racing hours (11:00–16:59 local) since 2021: the record the
 * sim's past days use (src/environment/data/sf-real-days.json, scripts/fetch-real-days.mjs).
 *
 *   node scripts/fit-wind-shifts.mjs
 *
 * For each day: its kind (as scripts/fetch-wind-climate.mjs classes them) and its mean speed over those hours; the
 * direction (deg from the day's vector mean) and the speed (as a share of the day's mean), each with the day's own
 * straight-line drift taken out (the hourly records carry the afternoon's veer and build). Then, by kind and by mean
 * speed, the structure function D(τ) = <(x(t + τ) − x(t))²> at lags of 6 to 90 minutes, and a fit
 *
 *   D(τ) = 2σn² + 2σ1²(1 − e^(−τ/T1)) + 2σ2²(1 − e^(−τ/T2)),   T1 = 8 min, T2 = 120 min
 *
 * (exact non-negative least squares): white noise at the 6-minute sampling (shifts quicker than a few minutes, and
 * the station's own turbulence in its 2-minute means: environment/wind.ts Puffs is that part), and two
 * Ornstein–Uhlenbeck processes, the oscillating shifts of several minutes and the persistent ones that last the race.
 * The sim's shift field (environment/shifts.ts) is σ1 and σ2. A speed band with fewer than 20 days is folded into
 * the band below it.
 *
 * Output: src/environment/data/sf-wind-shifts.json
 */
import { readFile, writeFile } from 'node:fs/promises';

const R = JSON.parse(await readFile(new URL('../src/environment/data/sf-real-days.json', import.meta.url), 'utf8'));
const OUT = new URL('../src/environment/data/sf-wind-shifts.json', import.meta.url);
const T1 = 8, T2 = 120, LAGS = 15, BANDS = [0, 6, 10, 15, 20, 99];
const wrap = d => ((d % 360) + 540) % 360 - 180;

const acc = {};
for (const [date, s] of Object.entries(R.wind)) {
  const bin = Buffer.from(s, 'base64').toString('latin1'), pts = [];
  for (let k = 0; k < R.slots; k++) {
    const m = R.slot0 + k * R.slotMin; if (m < 660 || m >= 1020) continue;
    const sp = bin.charCodeAt(k * 3), d = bin.charCodeAt(k * 3 + 1);
    pts.push(sp === 255 || d === 255 ? null : [sp / 4, d * 2]);
  }
  const ok = pts.filter(Boolean); if (ok.length < 50) continue;
  let vx = 0, vy = 0, sum = 0;
  for (const [kt, d] of ok) { vx += Math.sin(d * Math.PI / 180) * kt; vy += Math.cos(d * Math.PI / 180) * kt; sum += kt; }
  const mean = sum / ok.length, vec = Math.hypot(vx, vy) / ok.length, dir = (Math.atan2(vx, vy) * 180 / Math.PI + 360) % 360;
  const kind = mean < 4 || vec < 0.5 * mean ? 'light' : dir >= 200 && dir < 330 ? 'west' : dir >= 100 && dir < 200 ? 'south' : 'north';
  const band = kind === 'light' ? 0 : BANDS.findIndex((b, i) => mean >= b && mean < BANDS[i + 1]);
  // (a direction only where there's wind enough to have one: 2 kt)
  const th = pts.map(p => p && p[0] >= 2 ? wrap(p[1] - dir) : null), u = pts.map(p => p && p[0] >= 2 ? p[0] / mean : null);
  const detrend = a => {
    let sx = 0, sy = 0, sxx = 0, sxy = 0, c = 0;
    a.forEach((v, i) => { if (v == null) return; sx += i; sy += v; sxx += i * i; sxy += i * v; c++; });
    const b = (c * sxy - sx * sy) / (c * sxx - sx * sx), a0 = (sy - b * sx) / c;
    return a.map((v, i) => v == null ? null : v - a0 - b * i);
  };
  const T = detrend(th), U = detrend(u), o = ((acc[kind] ??= {})[band] ??= { days: 0, kt: 0, d: Array(LAGS + 1).fill(0), u: Array(LAGS + 1).fill(0), c: Array(LAGS + 1).fill(0) });
  o.days++; o.kt += mean;
  for (let L = 1; L <= LAGS; L++) for (let i = 0; i + L < T.length; i++) if (T[i] != null && T[i + L] != null) { o.d[L] += (T[i + L] - T[i]) ** 2; o.u[L] += (U[i + L] - U[i]) ** 2; o.c[L]++; }
}

/** Exact non-negative least squares in three unknowns: every subset of free terms, the best that stays ≥ 0. */
function nnls(X, y) {
  let best = null;
  for (let mask = 1; mask < 8; mask++) {
    const idx = [0, 1, 2].filter(i => mask >> i & 1), n = idx.length;
    const M = idx.map(a => [...idx.map(c => X.reduce((s, r) => s + r[a] * r[c], 0)), X.reduce((s, r, i) => s + r[a] * y[i], 0)]);
    for (let i = 0; i < n; i++) {
      let p = i; for (let j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[p][i])) p = j;
      [M[i], M[p]] = [M[p], M[i]];
      for (let j = 0; j < n; j++) if (j !== i) { const f = M[j][i] / M[i][i]; for (let k = i; k <= n; k++) M[j][k] -= f * M[i][k]; }
    }
    const w = [0, 0, 0]; idx.forEach((a, i) => { w[a] = M[i][n] / M[i][i]; });
    if (w.some(v => v < -1e-12 || !Number.isFinite(v))) continue;
    const err = X.reduce((s, r, i) => s + (r[0] * w[0] + r[1] * w[1] + r[2] * w[2] - y[i]) ** 2, 0);
    if (!best || err < best.err) best = { err, w };
  }
  return best;
}
const lags = [...Array(LAGS)].map((_, i) => (i + 1) * R.slotMin);
const fit = D => {
  const X = lags.map(t => [1, 1 - Math.exp(-t / T1), 1 - Math.exp(-t / T2)]), y = lags.map((_, i) => D[i + 1]), r = nnls(X, y);
  return { sigma: r.w.map(v => +Math.sqrt(Math.max(0, v) / 2).toFixed(4)), err: +(Math.sqrt(r.err / lags.length) / y[y.length - 1]).toFixed(4) };
};

const classes = {};
for (const [kind, bands] of Object.entries(acc)) {
  // fold thin bands into the one below (or above, for the lowest)
  const keys = Object.keys(bands).map(Number).sort((a, b) => a - b), merged = [];
  for (const k of keys) {
    const o = bands[k], last = merged[merged.length - 1];
    if (o.days < 20 && last) { last.days += o.days; last.kt += o.kt; for (let L = 0; L <= LAGS; L++) { last.d[L] += o.d[L]; last.u[L] += o.u[L]; last.c[L] += o.c[L]; } }
    else merged.push({ ...o, d: [...o.d], u: [...o.u], c: [...o.c] });
  }
  if (merged.length > 1 && merged[0].days < 20) { const a = merged.shift(), b = merged[0]; b.days += a.days; b.kt += a.kt; for (let L = 0; L <= LAGS; L++) { b.d[L] += a.d[L]; b.u[L] += a.u[L]; b.c[L] += a.c[L]; } }
  classes[kind] = merged.map(o => {
    const D = o.d.map((v, i) => i ? v / o.c[i] : 0), Du = o.u.map((v, i) => i ? v / o.c[i] : 0), dir = fit(D), spd = fit(Du);
    return { kt: +(o.kt / o.days).toFixed(2), days: o.days, dir: dir.sigma, spd: spd.sigma, fitErr: [dir.err, spd.err],
      rms: { dir: [1, 5, 10].map(L => +Math.sqrt(D[L]).toFixed(2)), spd: [1, 5, 10].map(L => +Math.sqrt(Du[L]).toFixed(4)) } };
  });
}
const out = {
  source: 'NOAA CO-OPS 9414290 (NDBC FTPC1) 6-minute wind, racing hours 11:00–16:59, via src/environment/data/sf-real-days.json',
  updated: R.updated, T: [T1, T2], lagsMin: lags,
  note: 'kt: the class mean at the station (open water is wind.ts OPEN_WATER times this). dir (deg) and spd (share of the mean): [σn, σ1, σ2] of D(τ) = 2σn² + 2σ1²(1 − e^(−τ/T1)) + 2σ2²(1 − e^(−τ/T2)). rms: the measured rms change at 6, 30 and 60 min.',
  classes
};
await writeFile(OUT, JSON.stringify(out, null, 1));
for (const [k, cs] of Object.entries(classes)) for (const c of cs) console.log(k.padEnd(6), String(c.kt).padStart(6), String(c.days).padStart(5), 'dir', c.dir.join(' '), 'spd', c.spd.join(' '), 'err', c.fitErr.join(' '));
