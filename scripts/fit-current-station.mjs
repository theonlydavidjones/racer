#!/usr/bin/env node
/**
 * Harmonic constants for a NOAA current station that has an observed record but no published constants or predictions:
 * Richardson Bay (SFB1219), a 55-day ADCP deployment in NOAA's 2012–13 San Francisco Bay Current Survey, the only
 * measurement of the current inside one of the Bay's shallow embayments.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fit-current-station.mjs [--check]
 *
 * The record (NOAA CO-OPS, product=currents, the near-surface bin, every 6 minutes) is projected on the station's flood
 * axis and fitted by least squares with the sim's own predictor (src/environment/harmonics.ts), so the constants are in
 * the form and the conventions it predicts with: for each constituent the record can resolve (by the Rayleigh criterion:
 * 55 days separates M2 from S2 and N2, K1 from O1, but not P1 from K1 or K2 from S2), an amplitude and a phase lag; P1 and
 * K2 inferred from K1 and S2 by their equilibrium ratios (0.331 and 0.272, with the same phase lags), as NOAA does for
 * short series. --check fits Raccoon Strait's record (SFB1212, the same survey) the same way and compares the prediction
 * with NOAA's own, from its published constants.
 *
 * Output: src/environment/data/fitted-currents.json (stations in sf-currents.json's form; tide.ts adds them to the field).
 */
import { readFile, writeFile } from 'node:fs/promises';

const API = 'https://api.tidesandcurrents.noaa.gov', APP = 'folkboat-sim';
const FIT = [{ id: 'SFB1219', bin: 6, from: '20120715', to: '20120909', note: 'Richardson Bay, mid-bay: the sim\'s fit to NOAA\'s 55-day record (no published constants)' }];
const CHECK = { id: 'SFB1212', bin: 9, from: '20120522', to: '20120710' };

// the sim's predictor, from its TypeScript (Node strips the types: Node 22.18 or later)
const { predict } = await import('../src/environment/harmonics.ts');

async function get(path) {
  for (let a = 0; a < 4; a++) {
    try { const r = await fetch(API + path + (path.includes('?') ? '&' : '?') + 'application=' + APP); if (r.ok) return await r.json(); } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 2000 * 2 ** a));
  }
  throw new Error('Failed ' + path);
}
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
/** The record, in pieces of under a month (the API's limit). */
async function record(id, bin, from, to) {
  const out = []; let a = new Date(`${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6)}T00:00:00Z`); const end = new Date(`${to.slice(0, 4)}-${to.slice(4, 6)}-${to.slice(6)}T23:59:00Z`);
  while (a <= end) {
    const b = new Date(Math.min(end.getTime(), a.getTime() + 29 * 86400e3));
    const j = await get(`/api/prod/datagetter?product=currents&station=${id}&bin=${bin}&begin_date=${ymd(a)}&end_date=${ymd(b)}&time_zone=gmt&units=english&format=json`);
    for (const p of j.data ?? []) out.push({ ms: Date.parse(p.t.replace(' ', 'T') + ':00Z'), s: +p.s, d: +p.d });
    a = new Date(b.getTime() + 86400e3);
  }
  return out.filter(p => Number.isFinite(p.s) && Number.isFinite(p.d));
}
/** Least squares: the constituents' cosine and sine parts and a mean, by the normal equations. */
function fit(times, v, names) {
  const cols = [() => times.map(() => 1)];
  for (const n of names) { cols.push(() => predict(0, [[n, 1, 0]], times)); cols.push(() => predict(0, [[n, 1, 90]], times)); }
  const X = cols.map(c => c()), k = X.length, A = Array.from({ length: k }, () => new Float64Array(k)), b = new Float64Array(k);
  for (let i = 0; i < k; i++) { for (let j = 0; j < k; j++) { let s = 0; for (let t = 0; t < v.length; t++) s += X[i][t] * X[j][t]; A[i][j] = s; } let s = 0; for (let t = 0; t < v.length; t++) s += X[i][t] * v[t]; b[i] = s; }
  // Gaussian elimination with partial pivoting
  for (let c = 0; c < k; c++) {
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = c + 1; r < k; r++) { const f = A[r][c] / A[c][c]; for (let j = c; j < k; j++) A[r][j] -= f * A[c][j]; b[r] -= f * b[c]; }
  }
  const x = new Float64Array(k); for (let r = k - 1; r >= 0; r--) { let s = b[r]; for (let j = r + 1; j < k; j++) s -= A[r][j] * x[j]; x[r] = s / A[r][r]; }
  // a·cos(θ) + c·sin(θ) = A·cos(θ − G): A = hypot(a, c), G = atan2(c, a)
  const hc = names.map((n, i) => { const a = x[1 + 2 * i], c = x[2 + 2 * i]; return [n, Math.hypot(a, c), ((Math.atan2(c, a) * 180 / Math.PI) + 360) % 360]; });
  return { z0: x[0], hc };
}
const NAMES = ['M2', 'S2', 'N2', 'K1', 'O1', 'M4', 'MS4', 'M6', 'MK3', '2MK3', 'MN4'];
/** Fit a station's record on its flood axis; P1 and K2 inferred. */
async function fitStation(S) {
  const m = (await get(`/mdapi/prod/webapi/stations/${S.id}.json`)).stations[0];
  const flood = Math.round(m.deployments?.flood_direction ?? NaN);
  const rec = await record(S.id, S.bin, S.from, S.to);
  // the flood axis: NOAA's for the station, else the principal axis of the record
  let axis = Number.isFinite(S.flood) ? S.flood : NaN;
  if (!Number.isFinite(axis)) {
    let sxx = 0, syy = 0, sxy = 0; for (const p of rec) { const e = p.s * Math.sin(p.d * Math.PI / 180), n = p.s * Math.cos(p.d * Math.PI / 180); sxx += e * e; syy += n * n; sxy += e * n; }
    const th = 0.5 * Math.atan2(2 * sxy, syy - sxx); axis = ((th * 180 / Math.PI) + 360) % 360; // (a bearing; flood is the way the bigger peaks go: set below)
  }
  let v = rec.map(p => p.s * Math.cos((p.d - axis) * Math.PI / 180));
  const times = rec.map(p => p.ms), f = fit(times, v, NAMES);
  const K1 = f.hc.find(h => h[0] === 'K1'), S2 = f.hc.find(h => h[0] === 'S2');
  const hc = [...f.hc, ['P1', K1[1] * 0.331, K1[2]], ['K2', S2[1] * 0.272, S2[2]]];
  const pred = predict(f.z0, hc, times), res = v.map((x, i) => x - pred[i]), rms = Math.sqrt(res.reduce((a, x) => a + x * x, 0) / res.length), sd = Math.sqrt(v.reduce((a, x) => a + x * x, 0) / v.length);
  console.log(`${S.id} ${m.name}: ${rec.length} samples, axis ${Math.round(axis)}°, mean ${f.z0.toFixed(3)} kt; fit explains ${(100 * (1 - (rms / sd) ** 2)).toFixed(0)}% of the variance (residual ${rms.toFixed(2)} kt RMS of ${sd.toFixed(2)})`);
  return { m, axis, z0: f.z0, hc, flood };
}

if (process.argv.includes('--check')) {
  // fit Raccoon Strait's record, then compare a year's prediction from the fit with one from NOAA's own constants
  const noaa = JSON.parse(await readFile(new URL('../src/environment/data/sf-currents.json', import.meta.url), 'utf8')).stations.find(s => s.id === CHECK.id);
  const r = await fitStation({ ...CHECK, bin: noaa.bin, flood: noaa.flood });
  const t = Array.from({ length: 24 * 30 * 12 }, (_, i) => Date.UTC(2026, 0, 1) + i * 3600e3);
  const a = predict(r.z0, r.hc, t), b = predict(noaa.z0, noaa.hc, t), d = a.map((x, i) => x - b[i]);
  const rms = Math.sqrt(d.reduce((s, x) => s + x * x, 0) / d.length), peak = Math.max(...b.map(Math.abs));
  console.log(`check: 2026, hourly: fitted vs NOAA's constants differ by ${rms.toFixed(2)} kt RMS (NOAA's peak ${peak.toFixed(2)} kt)`);
  process.exit(0);
}

const stations = [];
for (const S of FIT) {
  const r = await fitStation({ ...S, flood: 74 }); // (NOAA's flood direction for SFB1219: 74° true, its deployment record)
  stations.push({
    id: S.id, kind: 'harmonic', name: r.m.name, note: S.note, lat: +(+r.m.lat).toFixed(5), lon: +(+r.m.lng).toFixed(5), bin: S.bin,
    flood: 74, ebb: 254, z0: +r.z0.toFixed(3), hc: r.hc.map(([n, A, G]) => [n, +A.toFixed(4), +G.toFixed(2)]), fitted: `${S.from}–${S.to}`
  });
}
await writeFile(new URL('../src/environment/data/fitted-currents.json', import.meta.url), JSON.stringify({
  source: 'NOAA CO-OPS observed currents (api.tidesandcurrents.noaa.gov, product=currents, near-surface bin, 6-minute), fitted by scripts/fit-current-station.mjs with the sim\'s predictor; knots, degrees true, phases GMT',
  fetched: new Date().toISOString().slice(0, 10), stations
}, null, 1) + '\n');
console.log('Wrote src/environment/data/fitted-currents.json');
