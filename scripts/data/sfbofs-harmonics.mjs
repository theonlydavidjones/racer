/**
 * NOAA's SFBOFS model as tidal harmonics, for the sim's current field (docs/plans/sfbofs-field.md, step 1).
 *
 * SFBOFS is NOAA NOS CO-OPS's San Francisco Bay Operational Forecast System (FVCOM: an unstructured triangle mesh,
 * 102,264 elements, 20 sigma layers). Its hourly nowcasts are on NOAA's open-data bucket, noaa-nos-ofs-pds, from
 * 21 Mar 2024 (https://noaa-nos-ofs-pds.s3.amazonaws.com/index.html#sfbofs/netcdf/). The current u, v is at the
 * elements' centers; this keeps the top sigma layer (about the top meter: the water a Folkboat, 1.2 m draft, sails in,
 * and what NOAA's current stations' shallowest bins measure) for the elements in the sim's waters (AREA).
 *
 *   node scripts/data/sfbofs-harmonics.mjs extract <dir> <first day YYYY-MM-DD> <days>
 *     Each hour's nowcast is downloaded, its top layer kept as <dir>/hours/YYYYMMDDHH.bin (float32: u for each of
 *     the area's elements, then v; m/s, east and north), and the file deleted: about 56 MB in, 120 KB kept. Run again,
 *     it carries on where it stopped. The first file also writes <dir>/mesh.json: the area's elements and their nodes.
 *     Hour H UTC is cycle tCCz's nNNN, where CC is the first of 03, 09, 15, 21 at or after H and NNN = 6 − (CC − H):
 *     n001 to n006 are the six hours up to the cycle (cycle 03z's n001 is 22:00 the day before). Each file's own
 *     Times is checked against the hour asked for.
 *
 *   node scripts/data/sfbofs-harmonics.mjs fit <out.json> <dir> [<dir> ...]
 *     A least-squares fit of every element's u and v, over all the hours in the dirs together, to the tidal
 *     constituents (CONSTITUENTS) plus each dir's own mean (each season's mean flow: the rivers' outflow differs). The
 *     constituents' astronomical arguments and nodal corrections are the sim's own (src/environment/harmonics.ts
 *     predict), so the page synthesizes with exactly what was fitted. K1 and P1, and S2 and K2, are two cycles a year
 *     apart: a single 29-day month can't separate them (the Rayleigh criterion wants about half a year), but two
 *     months nine months apart see them half a cycle out of step with each other, and the joint fit can.
 *
 * Dev only: h5wasm is a devDependency, nothing here is in the page.
 */
import h5wasm from 'h5wasm/node';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The sim's waters: Point Bonita to the Bay Bridge, Richmond to Hunters Point (an element is in if its center is). */
const AREA = { lon0: -122.54, lon1: -122.35, lat0: 37.71, lat1: 37.93 };
/** M2 S2 N2 K2 (semidiurnal), K1 O1 P1 Q1 (diurnal), and the shallow-water overtides and compound tides the Gate's
 * narrows make (M4, MS4, MN4, M6). */
export const CONSTITUENTS = ['M2', 'S2', 'N2', 'K2', 'K1', 'O1', 'P1', 'Q1', 'M4', 'MS4', 'MN4', 'M6'];
const BUCKET = 'https://noaa-nos-ofs-pds.s3.amazonaws.com/sfbofs/netcdf';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const [cmd, ...args] = process.argv.slice(2);
const pad = (n, w = 2) => String(n).padStart(w, '0');
const stamp = d => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}`;

/** The nowcast file holding hour `d` (a Date on the hour, UTC). */
export function fileFor(d) {
  const H = d.getUTCHours(), CC = [3, 9, 15, 21].find(c => c >= H) ?? 27, cyc = new Date(d.getTime() + (CC - H) * 3600e3);
  const day = `${cyc.getUTCFullYear()}${pad(cyc.getUTCMonth() + 1)}${pad(cyc.getUTCDate())}`, cc = pad(cyc.getUTCHours());
  const n = 6 - (CC - H);
  return `${BUCKET}/${day.slice(0, 4)}/${day.slice(4, 6)}/${day.slice(6, 8)}/sfbofs.t${cc}z.${day}.fields.n${pad(n, 3)}.nc`;
}

async function extract(dir, first, days) {
  await h5wasm.ready;
  mkdirSync(path.join(dir, 'hours'), { recursive: true });
  const tmp = path.join(dir, 'download'); mkdirSync(tmp, { recursive: true });
  let elems = existsSync(path.join(dir, 'mesh.json')) ? JSON.parse(readFileSync(path.join(dir, 'mesh.json'), 'utf8')).elems : null;
  const t0 = Date.parse(first + 'T00:00:00Z'), n = days * 24, start = Date.now();
  let done = 0, got = 0, missing = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(t0 + i * 3600e3), out = path.join(dir, 'hours', stamp(d) + '.bin');
    if (existsSync(out)) { done++; continue; }
    const url = fileFor(d), nc = path.join(tmp, 'hour.nc');
    try { execFileSync('curl', ['-sS', '--fail', '--retry', '4', '--retry-delay', '5', '-o', nc, url], { stdio: ['ignore', 'ignore', 'pipe'] }); }
    catch (e) { missing.push(stamp(d)); console.error(`${stamp(d)}: not got (${String(e.stderr ?? e.message).trim().slice(0, 120)})`); continue; }
    const f = new h5wasm.File(nc, 'r');
    const T = f.get('Times').value, time = String(T.join ? T.join('') : T).slice(0, 13);
    const want = d.toISOString().slice(0, 13);
    if (time !== want) { f.close(); unlinkSync(nc); throw new Error(`${url}: holds ${time}, not ${want}`); }
    if (!elems) elems = mesh(f, dir);
    const u = f.get('u').slice([[0, 1], [0, 1], []]), v = f.get('v').slice([[0, 1], [0, 1], []]), wet = f.get('wet_cells').value;
    const buf = new Float32Array(2 * elems.length);
    elems.forEach((e, k) => { buf[k] = wet[e] ? u[e] : NaN; buf[elems.length + k] = wet[e] ? v[e] : NaN; }); // (a dry element: no current, not a zero one)
    f.close(); unlinkSync(nc);
    writeFileSync(out, Buffer.from(buf.buffer));
    done++; got++;
    if (got % 24 === 0) console.log(`${stamp(d)}: ${done} of ${n} hours, ${((Date.now() - start) / got / 1000).toFixed(1)} s an hour`);
  }
  console.log(`extract ${first} + ${days} d: ${done} of ${n} hours in ${dir}${missing.length ? `; not got: ${missing.join(' ')}` : ''}`);
}

/**
 * The whole water column at a few elements (NOAA's current stations: their bins are 0.5–9 m down, the field is the
 * top layer, so the model is compared with a station at the station's own depth; docs/plans/sfbofs-step2.md). Each
 * hour's <dir>/layers/YYYYMMDDHH.bin is float32: for each element in turn, the water level ζ (m, the mean of its three
 * nodes), then u in its 20 layers top to bottom, then v in its 20 (m/s). SFBOFS's sigma layers are uniform
 * (siglay −0.025 … −0.975), so layer l lies (0.025 + 0.05 l)(h + ζ) below the surface, h from the mesh.
 */
async function layers(dir, first, days, elems) {
  await h5wasm.ready;
  mkdirSync(path.join(dir, 'layers'), { recursive: true });
  const tmp = path.join(dir, 'download'); mkdirSync(tmp, { recursive: true });
  writeFileSync(path.join(dir, 'layers.json'), JSON.stringify({ elems, layout: 'per element: zeta, u[20] top to bottom, v[20]; float32; m and m/s' }));
  const t0 = Date.parse(first + 'T00:00:00Z'), n = days * 24, start = Date.now(), missing = [];
  let done = 0, got = 0, nv = null;
  for (let i = 0; i < n; i++) {
    const d = new Date(t0 + i * 3600e3), out = path.join(dir, 'layers', stamp(d) + '.bin');
    if (existsSync(out)) { done++; continue; }
    const url = fileFor(d), nc = path.join(tmp, 'hour.nc');
    try { execFileSync('curl', ['-sS', '--fail', '--retry', '4', '--retry-delay', '5', '-o', nc, url], { stdio: ['ignore', 'ignore', 'pipe'] }); }
    catch (e) { missing.push(stamp(d)); console.error(`${stamp(d)}: not got (${String(e.stderr ?? e.message).trim().slice(0, 120)})`); continue; }
    const f = new h5wasm.File(nc, 'r');
    const T = f.get('Times').value, time = String(T.join ? T.join('') : T).slice(0, 13);
    if (time !== d.toISOString().slice(0, 13)) { f.close(); unlinkSync(nc); throw new Error(`${url}: holds ${time}, not ${d.toISOString().slice(0, 13)}`); }
    const u = f.get('u').value, v = f.get('v').value, zeta = f.get('zeta').value, ne = f.get('lonc').shape[0], L = f.get('u').shape[1];
    nv ??= f.get('nv').value;
    const buf = new Float32Array(elems.length * (1 + 2 * L));
    elems.forEach((e, k) => {
      const o = k * (1 + 2 * L);
      buf[o] = (zeta[nv[e] - 1] + zeta[nv[ne + e] - 1] + zeta[nv[2 * ne + e] - 1]) / 3;
      for (let l = 0; l < L; l++) { buf[o + 1 + l] = u[l * ne + e]; buf[o + 1 + L + l] = v[l * ne + e]; }
    });
    f.close(); unlinkSync(nc);
    writeFileSync(out, Buffer.from(buf.buffer));
    done++; got++;
    if (got % 48 === 0) console.log(`${stamp(d)}: ${done} of ${n} hours, ${((Date.now() - start) / got / 1000).toFixed(1)} s an hour`);
  }
  console.log(`layers ${first} + ${days} d: ${done} of ${n} hours in ${dir}${missing.length ? `; not got: ${missing.join(' ')}` : ''}`);
}

/** The area's elements and their nodes, from the first file (the mesh is the same in every file). */
function mesh(f, dir) {
  const lonc = f.get('lonc').value, latc = f.get('latc').value, nv = f.get('nv').value, lon = f.get('lon').value, lat = f.get('lat').value, h = f.get('h').value;
  const ne = lonc.length, L = x => (x > 180 ? x - 360 : x);
  const elems = [], tri = [], nodeOf = new Map(), nodes = [];
  for (let e = 0; e < ne; e++) {
    const lo = L(lonc[e]), la = latc[e];
    if (lo < AREA.lon0 || lo > AREA.lon1 || la < AREA.lat0 || la > AREA.lat1) continue;
    elems.push(e);
    tri.push([0, 1, 2].map(j => { const g = nv[j * ne + e] - 1; if (!nodeOf.has(g)) { nodeOf.set(g, nodes.length); nodes.push(g); } return nodeOf.get(g); })); // (nv is 1-based, [3][nele])
  }
  const r = (x, k) => Math.round(x * 10 ** k) / 10 ** k;
  writeFileSync(path.join(dir, 'mesh.json'), JSON.stringify({
    source: 'NOAA NOS CO-OPS SFBOFS (FVCOM) nowcast fields, noaa-nos-ofs-pds; scripts/data/sfbofs-harmonics.mjs',
    area: AREA, elems, center: elems.map(e => [r(L(lonc[e]), 6), r(latc[e], 6)]), tri,
    nodes: nodes.map(g => [r(L(lon[g]), 6), r(lat[g], 6)]), nodeIds: nodes, depth: nodes.map(g => r(h[g], 2))
  }));
  console.log(`mesh: ${elems.length} elements, ${nodes.length} nodes in the area`);
  return elems;
}

async function fit(out, dirs) {
  const { runnerImport } = await import('vite');
  const { predict } = (await runnerImport(path.join(ROOT, 'src/environment/harmonics.ts'), { root: ROOT, configFile: false, logLevel: 'error' })).module;
  const M = JSON.parse(readFileSync(path.join(dirs[0], 'mesh.json'), 'utf8')), ne = M.elems.length;
  for (const d of dirs.slice(1)) if (JSON.stringify(JSON.parse(readFileSync(path.join(d, 'mesh.json'), 'utf8')).elems) !== JSON.stringify(M.elems)) throw new Error(`${d}: another mesh`);
  // the columns: each dir's mean, then for each constituent f·cos(V + u) and f·sin(V + u), from the sim's own predict
  // (a constituent of amplitude 1 and phase lag 0, then lag 90: f·cos(V + u − 90) = f·sin(V + u)), each dir's hours on
  // their own so the nodal factors are each month's own, as the page's will be the race day's
  const nc = CONSTITUENTS.length, P = dirs.length + 2 * nc, rows = [], data = [];
  dirs.forEach((dir, di) => {
    const files = readdirSync(path.join(dir, 'hours')).filter(x => x.endsWith('.bin')).sort();
    const ms = files.map(x => Date.UTC(+x.slice(0, 4), +x.slice(4, 6) - 1, +x.slice(6, 8), +x.slice(8, 10)));
    const cols = CONSTITUENTS.flatMap(c => [predict(0, [[c, 1, 0]], ms), predict(0, [[c, 1, 90]], ms)]);
    files.forEach((x, i) => {
      const row = new Float64Array(P); row[di] = 1; for (let k = 0; k < 2 * nc; k++) row[dirs.length + k] = cols[k][i];
      rows.push(row); const raw = readFileSync(path.join(dir, 'hours', x)); data.push(new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length))); // (its own bytes: a small file's Buffer is a slice of a shared pool)
    });
    console.log(`${dir}: ${files.length} hours, ${files[0]} to ${files[files.length - 1]}`);
  });
  const N = rows.length;
  // one normal matrix for every element wet in every hour; an element dry in some hours gets its own
  const normal = keep => { const A = new Float64Array(P * P); for (let i = 0; i < N; i++) if (keep(i)) { const r = rows[i]; for (let a = 0; a < P; a++) for (let b = 0; b <= a; b++) A[a * P + b] += r[a] * r[b]; } for (let a = 0; a < P; a++) for (let b = 0; b < a; b++) A[b * P + a] = A[a * P + b]; return A; };
  const full = cholesky(normal(() => true), P);
  const cond = condition(normal(() => true), P);
  const res = { source: M.source + `; fitted over ${N} hours: ${dirs.map(d => path.basename(d)).join(', ')}`, constituents: CONSTITUENTS, seasons: dirs.map(d => path.basename(d)), hours: N, condition: cond, elems: [] };
  let sumSq = 0, cnt = 0, worst = 0;
  for (let k = 0; k < ne; k++) {
    let wetAll = true; for (let i = 0; i < N; i++) if (Number.isNaN(data[i][k])) { wetAll = false; break; }
    const keep = i => !Number.isNaN(data[i][k]), nKeep = wetAll ? N : data.filter((_, i) => keep(i)).length;
    if (nKeep < 0.5 * N) { res.elems.push(null); continue; } // (dry more than half the time: an intertidal flat, not a channel)
    const L = wetAll ? full : cholesky(normal(keep), P);
    const out = { wet: +(nKeep / N).toFixed(3) };
    for (const [comp, off] of [['u', 0], ['v', ne]]) {
      const b = new Float64Array(P);
      for (let i = 0; i < N; i++) { const y = data[i][off + k]; if (Number.isNaN(y)) continue; const r = rows[i]; for (let a = 0; a < P; a++) b[a] += r[a] * y; }
      const x = solve(L, b, P);
      let ss = 0, m = 0;
      for (let i = 0; i < N; i++) { const y = data[i][off + k]; if (Number.isNaN(y)) continue; let p = 0; for (let a = 0; a < P; a++) p += rows[i][a] * x[a]; ss += (y - p) ** 2; m++; }
      const rms = Math.sqrt(ss / m); sumSq += ss; cnt += m; worst = Math.max(worst, rms);
      out[comp] = {
        mean: Array.from(x.slice(0, dirs.length), z => +z.toFixed(4)),
        // amplitude (m/s) and Greenwich phase lag (deg) for predict: x_c cos + x_s sin = A cos(V + u − G)
        hc: CONSTITUENTS.map((c, j) => { const cc = x[dirs.length + 2 * j], ss2 = x[dirs.length + 2 * j + 1]; return [c, +Math.hypot(cc, ss2).toFixed(4), +((Math.atan2(ss2, cc) * 180 / Math.PI + 360) % 360).toFixed(1)]; }),
        rms: +rms.toFixed(4)
      };
    }
    res.elems.push(out);
  }
  res.rms = +Math.sqrt(sumSq / cnt).toFixed(4); res.worstRms = +worst.toFixed(4);
  writeFileSync(out, JSON.stringify(res));
  console.log(`fit: ${ne} elements (${res.elems.filter(e => !e).length} left out, dry over half the time), ${N} hours, ${P} terms; condition ${cond.toExponential(2)}; residual RMS ${res.rms} m/s (${(res.rms / 0.5144).toFixed(3)} kt), worst element ${res.worstRms} m/s`);
}

/**
 * The model against NOAA's current stations at each station's own depth (docs/plans/sfbofs-step2.md §1). `stations`
 * is a JSON list of { id, k (the element's place in mesh.json), elem, depthM (NOAA's bin, m below the surface), flood
 * (deg true) }; `layers` dirs hold the stations' water columns (the `layers` command), in the stations' order. At each
 * hour the current along NOAA's flood axis is taken at the bin's depth (between the two layers' centers either side;
 * the top or bottom layer's beyond them) and in the top layer, and each is fitted as `fit` fits an element. Out: for
 * each station and constituent NOAA's [A kt, G], the model's at the bin's depth and in the top layer, and the
 * correction factor, NOAA over the model at the bin's depth (amplitude ratio, phase NOAA − model).
 */
async function stations(out, stationsJson, currentsJson, dirs) {
  const { runnerImport } = await import('vite');
  const { predict } = (await runnerImport(path.join(ROOT, 'src/environment/harmonics.ts'), { root: ROOT, configFile: false, logLevel: 'error' })).module;
  const S = JSON.parse(readFileSync(stationsJson, 'utf8')), NOAA = JSON.parse(readFileSync(currentsJson, 'utf8')).stations;
  const M = JSON.parse(readFileSync(path.join(dirs[0], 'mesh.json'), 'utf8'));
  const Lyr = 20, per = 1 + 2 * Lyr, KT = 1 / 0.5144, nc = CONSTITUENTS.length, P = dirs.length + 2 * nc;
  const hOf = s => M.tri[s.k].reduce((a, n) => a + M.depth[n], 0) / 3;
  const rows = [], series = S.map(() => ({ bin: [], top: [] }));
  dirs.forEach((dir, di) => {
    const L = JSON.parse(readFileSync(path.join(dir, 'layers.json'), 'utf8'));
    if (JSON.stringify(L.elems) !== JSON.stringify(S.map(s => s.elem))) throw new Error(`${dir}: its layers are for other elements`);
    const files = readdirSync(path.join(dir, 'layers')).filter(x => x.endsWith('.bin')).sort();
    const ms = files.map(x => Date.UTC(+x.slice(0, 4), +x.slice(4, 6) - 1, +x.slice(6, 8), +x.slice(8, 10)));
    const cols = CONSTITUENTS.flatMap(c => [predict(0, [[c, 1, 0]], ms), predict(0, [[c, 1, 90]], ms)]);
    files.forEach((x, i) => {
      const row = new Float64Array(P); row[di] = 1; for (let k = 0; k < 2 * nc; k++) row[dirs.length + k] = cols[k][i]; rows.push(row);
      const raw = readFileSync(path.join(dir, 'layers', x)), a = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
      S.forEach((s, j) => {
        const o = j * per, zeta = a[o], H = hOf(s) + zeta, th = s.flood * Math.PI / 180, ax = Math.sin(th), ay = Math.cos(th);
        const along = l => a[o + 1 + l] * ax + a[o + 1 + Lyr + l] * ay;
        // (the bin's depth as a share of the column, between the layers' centers at 0.025, 0.075 … 0.975)
        const f = Math.min(Lyr - 1, Math.max(0, (s.depthM / H - 0.025) / 0.05)), l0 = Math.floor(f), l1 = Math.min(Lyr - 1, l0 + 1), w = f - l0;
        series[j].bin.push(along(l0) * (1 - w) + along(l1) * w); series[j].top.push(along(0));
      });
    });
    console.log(`${dir}: ${files.length} hours`);
  });
  const N = rows.length, A = new Float64Array(P * P);
  for (const r of rows) for (let a = 0; a < P; a++) for (let b = 0; b < P; b++) A[a * P + b] += r[a] * r[b];
  const Lc = cholesky(A, P);
  const fitOne = y => {
    const b = new Float64Array(P); rows.forEach((r, i) => { for (let a = 0; a < P; a++) b[a] += r[a] * y[i]; });
    const x = solve(Lc, b, P); let ss = 0; rows.forEach((r, i) => { let p = 0; for (let a = 0; a < P; a++) p += r[a] * x[a]; ss += (y[i] - p) ** 2; });
    return { mean: Array.from(x.slice(0, dirs.length), z => +(z * KT).toFixed(3)), rms: +(Math.sqrt(ss / N) * KT).toFixed(3),
      hc: Object.fromEntries(CONSTITUENTS.map((c, j) => { const cc = x[dirs.length + 2 * j], sn = x[dirs.length + 2 * j + 1]; return [c, [+(Math.hypot(cc, sn) * KT).toFixed(3), +((Math.atan2(sn, cc) * 180 / Math.PI + 360) % 360).toFixed(1)]]; })) };
  };
  const res = { source: 'SFBOFS against NOAA CO-OPS current stations (sf-currents.json), at the bins\' depths; scripts/data/sfbofs-harmonics.mjs stations', seasons: dirs.map(d => path.basename(d)), hours: N, stations: [] };
  S.forEach((s, j) => {
    const n = NOAA.find(x => x.id === s.id), bin = fitOne(series[j].bin), top = fitOne(series[j].top);
    const factor = {};
    for (const c of CONSTITUENTS) { const q = n.hc.find(x => x[0] === c); if (q && bin.hc[c][0] > 0) factor[c] = [+(q[1] / bin.hc[c][0]).toFixed(3), +(((q[2] - bin.hc[c][1] + 540) % 360) - 180).toFixed(1)]; }
    res.stations.push({ id: s.id, elem: s.elem, offM: s.offM, depthM: s.depthM, columnM: +hOf(s).toFixed(1), flood: s.flood, noaa: { z0: n.z0, hc: Object.fromEntries(n.hc.filter(x => CONSTITUENTS.includes(x[0])).map(x => [x[0], [x[1], x[2]]])) }, bin, top, factor });
  });
  writeFileSync(out, JSON.stringify(res, null, 1));
  for (const s of res.stations) console.log(`${s.id.padEnd(9)} bin ${String(s.depthM).padStart(4)} m of ${String(s.columnM).padStart(5)} m: ` + ['M2', 'S2', 'N2', 'K1', 'O1'].map(c => s.factor[c] ? `${c} ×${s.factor[c][0].toFixed(2)} ${s.factor[c][1] >= 0 ? '+' : ''}${s.factor[c][1].toFixed(0)}°` : `${c} -`).join('  ') + `   (M2 top/bin ${(s.top.hc.M2[0] / s.bin.hc.M2[0]).toFixed(2)})`);
}

/** Cholesky factor (lower, row-major) of a symmetric positive-definite P×P matrix. */
function cholesky(A, P) {
  const L = new Float64Array(P * P);
  for (let i = 0; i < P; i++) for (let j = 0; j <= i; j++) {
    let s = A[i * P + j]; for (let k = 0; k < j; k++) s -= L[i * P + k] * L[j * P + k];
    if (i === j) { if (!(s > 0)) throw new Error('the normal matrix is not positive definite: terms the hours can\'t tell apart'); L[i * P + i] = Math.sqrt(s); } else L[i * P + j] = s / L[j * P + j];
  }
  return L;
}
function solve(L, b, P) {
  const y = new Float64Array(P), x = new Float64Array(P);
  for (let i = 0; i < P; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * P + k] * y[k]; y[i] = s / L[i * P + i]; }
  for (let i = P - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < P; k++) s -= L[k * P + i] * x[k]; x[i] = s / L[i * P + i]; }
  return x;
}
/** The normal matrix's condition number (its largest over smallest eigenvalue, by power iteration on it and its
 * inverse): how well the hours tell the terms apart. */
function condition(A, P) {
  const L = cholesky(A, P), it = (mul) => { let x = new Float64Array(P).fill(1), l = 0; for (let n = 0; n < 500; n++) { const y = mul(x); l = Math.hypot(...y); x = y.map(z => z / l); } return l; };
  const big = it(x => { const y = new Float64Array(P); for (let i = 0; i < P; i++) for (let j = 0; j < P; j++) y[i] += A[i * P + j] * x[j]; return y; });
  const inv = it(x => solve(L, x, P));
  return big * inv;
}

if (cmd === 'extract') await extract(args[0], args[1], +args[2]);
else if (cmd === 'fit') await fit(args[0], args.slice(1));
else if (cmd === 'layers') await layers(args[0], args[1], +args[2], args[3].split(',').map(Number));
else if (cmd === 'stations') await stations(args[0], args[1], args[2], args.slice(3));
else { console.error('usage: extract <dir> <YYYY-MM-DD> <days> | fit <out.json> <dir> [<dir> ...] | layers <dir> <YYYY-MM-DD> <days> <element,element,...>'); process.exit(1); }
