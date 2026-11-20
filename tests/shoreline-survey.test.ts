// The shoreline survey (docs/plans/shoreline-survey.md): the sim's land (geo/shore.ts onLand) against NOAA's ENC land
// areas (LNDARE), shoreline constructions (SLCONS and the like) and piers drawn as lines (src/geo/data/enc-chart.json),
// both rasterized at RES m over the chart's box; each patch where they disagree that a boat could reach from the Central
// Bay, and how far it reaches from the charted edge. Not part of the suite (about 3 minutes): run it with
//   SURVEY=1 OUT=<file.json> npx vitest run tests/shoreline-survey.test.ts --silent=false
import { it } from 'vitest';
import enc from '../src/geo/data/enc-chart.json';
import { LL } from '../src/geo/geo';
import { onLand } from '../src/geo/shore';

const RES = 10;
type Ring = number[];
const decode = (r: Ring): [number, number][] => { const out: [number, number][] = []; let x = r[0], y = r[1]; out.push([x, y]); for (let i = 2; i + 1 < r.length; i += 2) { x += r[i]; y += r[i + 1]; out.push([x, y]); } return out; };
const toXY = ([lon, lat]: [number, number]) => LL(lat / 1e5, lon / 1e5);

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
it.skipIf(!env.SURVEY)('the shoreline survey: the sim\'s land against the ENC', () => {
  const E = enc as any, box = E.box;
  const a = LL(box.south, box.west), b = LL(box.north, box.east);
  const x0 = a.x, y0 = a.y, nx = Math.ceil((b.x - a.x) / RES), ny = Math.ceil((b.y - a.y) / RES);
  const chart = new Uint8Array(nx * ny);
  // even-odd scanline fill of each polygon (its rings: outer and holes)
  const fill = (rings: Ring[]) => {
    const R = rings.map(r => decode(r).map(toXY));
    let ylo = Infinity, yhi = -Infinity; for (const r of R) for (const p of r) { ylo = Math.min(ylo, p.y); yhi = Math.max(yhi, p.y); }
    const j0 = Math.max(0, Math.floor((ylo - y0) / RES)), j1 = Math.min(ny - 1, Math.ceil((yhi - y0) / RES));
    for (let j = j0; j <= j1; j++) {
      const yc = y0 + (j + 0.5) * RES, xs: number[] = [];
      for (const r of R) for (let k = 0; k < r.length; k++) { const p = r[k], q = r[(k + 1) % r.length]; if ((p.y > yc) !== (q.y > yc)) xs.push(p.x + (yc - p.y) / (q.y - p.y) * (q.x - p.x)); }
      xs.sort((u, v) => u - v);
      for (let k = 0; k + 1 < xs.length; k += 2) { const i0 = Math.max(0, Math.ceil((xs[k] - x0) / RES - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[k + 1] - x0) / RES - 0.5)); for (let i = i0; i <= i1; i++) chart[j * nx + i] = 1; }
    }
  };
  for (const p of E.land) fill(p);
  for (const p of E.structures) fill(p);
  // the chart's piers drawn as lines (SLCONS and the like): solid PIER_HALF m either side
  const PIER_HALF = 6;
  for (const l of E.piers) { const P = decode(l).map(toXY); for (let k = 1; k < P.length; k++) { const p = P[k - 1], q = P[k], L = Math.hypot(q.x - p.x, q.y - p.y), n = Math.max(1, Math.ceil(L / (RES / 2)));
    for (let t = 0; t <= n; t++) { const cx = p.x + (q.x - p.x) * t / n, cy = p.y + (q.y - p.y) * t / n; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const x = cx + di * PIER_HALF, y = cy + dj * PIER_HALF, i = Math.floor((x - x0) / RES), j = Math.floor((y - y0) / RES); if (i >= 0 && j >= 0 && i < nx && j < ny) chart[j * nx + i] = 1; } } } }
  const sim = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) sim[j * nx + i] = onLand({ x: x0 + (i + 0.5) * RES, y: y0 + (j + 0.5) * RES }) ? 1 : 0;
  // distance (m) from each cell to the charted edge: multi-source BFS from the cells beside a change, chamfer 1/√2
  const dist = new Float32Array(nx * ny).fill(Infinity), q: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; const c = chart[k]; if ((i > 0 && chart[k - 1] !== c) || (i < nx - 1 && chart[k + 1] !== c) || (j > 0 && chart[k - nx] !== c) || (j < ny - 1 && chart[k + nx] !== c)) { dist[k] = RES / 2; q.push(k); } }
  // (a Dijkstra-ish relaxation in passes: good to a few percent)
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; let d = dist[k]; if (i > 0) d = Math.min(d, dist[k - 1] + RES); if (j > 0) d = Math.min(d, dist[k - nx] + RES); if (i > 0 && j > 0) d = Math.min(d, dist[k - nx - 1] + RES * 1.4142); if (i < nx - 1 && j > 0) d = Math.min(d, dist[k - nx + 1] + RES * 1.4142); dist[k] = d; }
    for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; let d = dist[k]; if (i < nx - 1) d = Math.min(d, dist[k + 1] + RES); if (j < ny - 1) d = Math.min(d, dist[k + nx] + RES); if (i < nx - 1 && j < ny - 1) d = Math.min(d, dist[k + nx + 1] + RES * 1.4142); if (i > 0 && j < ny - 1) d = Math.min(d, dist[k + nx - 1] + RES * 1.4142); dist[k] = d; }
  }
  // the water a boat can reach: the sim's water flooded (4-connected) from the Central Bay, off Alcatraz
  const sea = new Uint8Array(nx * ny); { const s0 = LL(37.835, -122.43), st = [Math.floor((s0.y - y0) / RES) * nx + Math.floor((s0.x - x0) / RES)]; sea[st[0]] = 1;
    while (st.length) { const k = st.pop()!, i = k % nx, j = (k - i) / nx; for (const kk of [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, j > 0 ? k - nx : -1, j < ny - 1 ? k + nx : -1]) if (kk >= 0 && !sea[kk] && !sim[kk]) { sea[kk] = 1; st.push(kk); } } }
  // disagreeing patches (8-connected), each with the farthest it reaches from the charted edge
  const seen = new Uint8Array(nx * ny), out: any[] = [];
  const O = LL(0, 0), M_LAT = LL(1, 0).y - O.y, M_LON = LL(0, 1).x - O.x;
  const ll = (x: number, y: number) => ({ lat: (y - O.y) / M_LAT, lon: (x - O.x) / M_LON });
  for (let k0 = 0; k0 < nx * ny; k0++) {
    if (seen[k0] || sim[k0] === chart[k0]) continue;
    const kind = sim[k0] ? 'sim land in charted water' : 'sim water on charted land';
    const st = [k0]; seen[k0] = 1; let n = 0, maxd = 0, at = k0, sx = 0, sy = 0;
    while (st.length) { const k = st.pop()!; n++; const i = k % nx, j = (k - i) / nx; sx += i; sy += j; if (dist[k] > maxd) { maxd = dist[k]; at = k; }
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const kk = jj * nx + ii; if (!seen[kk] && sim[kk] !== chart[kk] && sim[kk] === sim[k0]) { seen[kk] = 1; st.push(kk); } } }
    if (maxd < 15) continue;
    // (only where a boat could be: a patch of the sim's water that's reachable, or of its land touching reachable water)
    let reach = false;
    // (re-walk cheaply: any cell of the patch in or beside reachable water)
    const st2 = [k0], seen2 = new Set([k0]); while (st2.length && !reach) { const k = st2.pop()!, i = k % nx, j = (k - i) / nx; for (let dj = -1; dj <= 1 && !reach; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const kk = jj * nx + ii; if (sea[kk]) { reach = true; break; } if (!seen2.has(kk) && sim[kk] !== chart[kk] && sim[kk] === sim[k0]) { seen2.add(kk); st2.push(kk); } } }
    if (!reach) continue;
    const ai = at % nx, aj = (at - ai) / nx, p = ll(x0 + (ai + 0.5) * RES, y0 + (aj + 0.5) * RES), c = ll(x0 + (sx / n + 0.5) * RES, y0 + (sy / n + 0.5) * RES);
    out.push({ kind, area: n * RES * RES, maxd: Math.round(maxd), at: `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`, center: `${c.lat.toFixed(5)},${c.lon.toFixed(5)}`, xy: `${Math.round(x0 + (ai + 0.5) * RES)},${Math.round(y0 + (aj + 0.5) * RES)}` });
  }
  out.sort((u, v) => v.maxd - u.maxd);
  if (env.OUT) (globalThis as any).process.getBuiltinModule('fs').writeFileSync(env.OUT, JSON.stringify({ RES, nx, ny, patches: out }, null, 1));
  console.log(`patches ≥15 m: ${out.length}`); for (const o of out.slice(0, 40)) console.log(JSON.stringify(o));
}, 1800000);
