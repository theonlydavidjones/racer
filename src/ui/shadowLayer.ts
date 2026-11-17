import type { Vec } from '../core/math';
import { onLand } from '../geo/shore';
import { landLee } from '../environment/wind';
import { LL } from '../geo/geo';
import type { SimView } from '../sim/host';
import { affine } from './flow';
import type { Tf } from './draw2d';

/**
 * The wind shadows on the map: where the wind is lighter for what stands upwind and isn't in the wind records, read
 * from the race's own wind (World.shadowAt, what the sails feel, environment/shadows.ts): the lee of the land and the
 * islands, each boat's dirty air (their wakes combined as the physics combines them), ships and ferries, the committee
 * boat, and the bridge piers. Drawn as a deep violet (a colour NOAA's chart doesn't use) as strong as the wind's
 * deficit, from a twentieth lighter (faint) to two-fifths or more (full, and still see-through), with a light rim
 * where it starts so it reads over the chart and the wind's colours alike.
 *
 * Sampled one point every `cellPx` of the screen over the water in view and a margin round it, into a small image.
 * Drawn through the change of view since (the inset turns and moves with her ten times a second: the same image,
 * moved), and sampled again only when the view's gone past the margin, the zoom's changed, or the race's clock has
 * moved on `every` seconds.
 *
 * The land's lee (environment/wind.ts landLee: rays over the hills, nearly all of a sampling's cost, 35 ms for the inset
 * at the test's half-size page, every 2 s) is read from its own lattices, bilinearly: one for every LEE_DEG of the wind's
 * direction (the nearest), as far apart as the samples are (LEE_M, or twice, four times... where the map's zoomed out:
 * a lattice finer than the samples asked four of its points for each). The hills don't move, so a sampling again
 * mostly reads what's known. (One lattice for the degree, cleared as the wind crossed a degree, was filled again and
 * again as a racing wind swings, and 25 m apart in a wide view: night_bridge_whole's inset 0.90 → 3.22 ms.) What does move (the
 * boats' and ships' wakes) is read afresh. And a sampling again is spread over the draws, SLICE_MS of each, the old image
 * drawn meanwhile: all at once, it was a 35 ms frame every 2 s (perf-ab inset_layers, v203; at full size four times that).
 */
const LEE_M = 50, SLICE_MS = 2, LEE_DEG = 3, LEE_DIRS = 24; // (50 m: the lee varies over hundreds of meters, its rays averaged d/8 across, shadows.ts; finer only cost the filling)
const FAINT = 0.05, FULL = 0.4, MARGIN = 0.25;
/** The sim's world (the land and its lee are known inside it: scripts/fetch-charts.mjs BOX): beyond it, nothing drawn. */
const WORLD = { s: LL(37.735, -122.61), n: LL(37.985, -122.188) };
type M = [number, number, number, number, number, number];

export class ShadowLayer {
  private img: HTMLCanvasElement | null = null;
  /** the map's transform when sampled (sim metres to screen), and the screen box sampled (with its margin) */
  private m: M | null = null; private box = { x0: 0, y0: 0, x1: 0, y1: 0 }; private t = -Infinity; private cell = 0;
  /** the strongest deficit in view at the last sampling (0 = no shadow anywhere in view) */
  maxDeficit = 0;
  /** ms the last sampling took (all its slices) */
  lastMs = 0;
  /** The land's lee on its lattices: for each LEE_DEG of wind direction and spacing, by the lattice point; the LEE_DIRS
   * most lately read kept. */
  private lee = new Map<number, Map<number, number>>();
  /** A sampling being done a slice at a time: its view, its box, and how far it's got. */
  private job: { m: M; inv: (sx: number, sy: number) => Vec; nx: number; ny: number; x0: number; y0: number; x1: number; y1: number; cell: number; def: Float32Array; max: number; j: number; ms: number; w: number; h: number } | null = null;
  draw(ctx: CanvasRenderingContext2D, tf: Tf, w: number, h: number, wd: SimView, cellPx: number, every: number): void {
    const { m, inv } = affine(tf);
    if (this.job && this.job.cell !== cellPx) this.job = null; // (zoomed while sampling: start again at the new zoom)
    if (!this.job && this.stale(m, w, h, wd, cellPx, every)) this.start(m, inv, w, h, cellPx);
    if (this.job) this.work(wd, this.img ? SLICE_MS : Infinity); // (the first image at once: nothing to draw meanwhile)
    if (!this.img || !this.m || this.maxDeficit < FAINT) return;
    // old screen → sim metres → new screen: an affine map, so the image is drawn through it
    const o = this.m, det = o[0] * o[3] - o[1] * o[2];
    const ia = o[3] / det, ib = -o[1] / det, ic = -o[2] / det, id = o[0] / det; // the inverse of the old linear part
    const a = m[0] * ia + m[2] * ib, b = m[1] * ia + m[3] * ib, c = m[0] * ic + m[2] * id, d = m[1] * ic + m[3] * id;
    const e = m[4] - (a * o[4] + c * o[5]), f = m[5] - (b * o[4] + d * o[5]);
    ctx.save(); ctx.transform(a, b, c, d, e, f); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const { x0, y0 } = this.box, k = this.cell;
    ctx.drawImage(this.img, 0, 0, this.img.width, this.img.height, x0 - k / 2, y0 - k / 2, this.img.width * k, this.img.height * k);
    ctx.restore();
  }
  /** Sample again: no image yet, a new zoom or turn, the view past the sampled margin, or the clock moved on. */
  private stale(m: M, w: number, h: number, wd: SimView, cellPx: number, every: number): boolean {
    const o = this.m; if (!o || !this.img || cellPx !== this.cell || Math.abs(wd.t - this.t) >= every) return true;
    if (Math.abs(Math.hypot(m[0], m[1]) / Math.hypot(o[0], o[1]) - 1) > 0.05) return true; // (zoomed)
    // the new view's corners, in the old screen: all inside the sampled box?
    const det = o[0] * o[3] - o[1] * o[2], mi = det ? (sx: number, sy: number): [number, number] => {
      // new screen → sim (inverse of m) → old screen (o)
      const dm = m[0] * m[3] - m[1] * m[2], X = sx - m[4], Y = sy - m[5], x = (m[3] * X - m[2] * Y) / dm, y = (-m[1] * X + m[0] * Y) / dm;
      return [o[0] * x + o[2] * y + o[4], o[1] * x + o[3] * y + o[5]];
    } : null;
    if (!mi) return true;
    const { x0, y0, x1, y1 } = this.box;
    return [[0, 0], [w, 0], [0, h], [w, h]].some(([sx, sy]) => { const [x, y] = mi(sx, sy); return x < x0 || x > x1 || y < y0 || y > y1; });
  }
  /** The land's lee at p for the wind from `from`: bilinear between its lattice points, each worked out once. */
  private leeAt(p: Vec, from: number, step: number): number {
    const n = 360 / LEE_DEG, dir = ((Math.round(from / LEE_DEG) % n) + n) % n, id = dir * 64 + Math.round(Math.log2(step / LEE_M));
    let L = this.lee.get(id);
    if (L) { this.lee.delete(id); this.lee.set(id, L); } // (the most lately read last)
    else { L = new Map(); this.lee.set(id, L); if (this.lee.size > LEE_DIRS) this.lee.delete(this.lee.keys().next().value!); }
    if (L.size > 100000) L.clear(); // (bounded: the map's been everywhere)
    const fx = p.x / step, fy = p.y / step, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, M = L;
    const k = (a: number, b: number) => { const key = (a + 32768) * 65536 + (b + 32768); let x = M.get(key); if (x === undefined) { x = landLee({ x: a * step, y: b * step }, dir * LEE_DEG); M.set(key, x); } return x; };
    return (k(i, j) * (1 - u) + k(i + 1, j) * u) * (1 - v) + (k(i, j + 1) * (1 - u) + k(i + 1, j + 1) * u) * v;
  }
  private start(m: M, inv: (sx: number, sy: number) => Vec, w: number, h: number, cellPx: number): void {
    const mx = w * MARGIN, my = h * MARGIN, x0 = -mx, y0 = -my, x1 = w + mx, y1 = h + my;
    const nx = Math.ceil((x1 - x0) / cellPx) + 1, ny = Math.ceil((y1 - y0) / cellPx) + 1;
    this.job = { m, inv, nx, ny, x0, y0, x1, y1, cell: cellPx, def: new Float32Array(nx * ny), max: 0, j: 0, ms: 0, w, h };
  }
  /** Sample on, row by row, for up to `budget` ms; the image made once the last row's done. */
  private work(wd: SimView, budget: number): void {
    const J = this.job!, t0 = performance.now(), { nx, ny, x0, y0, def, inv, cell: cellPx, w, h } = J, from = wd.wind.from;
    // (the lattice as far apart as the samples, in metres: LEE_M, doubled until it's no finer than a cell)
    const a = inv(0, 0), b = inv(cellPx, 0), cellM = Math.hypot(b.x - a.x, b.y - a.y); let step = LEE_M; while (step < cellM && step < 1600) step *= 2;
    while (J.j < ny) {
      const j = J.j++;
      for (let i = 0; i < nx; i++) {
        const sx = x0 + i * cellPx, sy = y0 + j * cellPx, p = inv(sx, sy);
        // (written as "not inside" so a point that isn't a number, from a chart not yet laid out, is skipped too)
        if (!(p.x >= WORLD.s.x && p.x <= WORLD.n.x && p.y >= WORLD.s.y && p.y <= WORLD.n.y) || onLand(p)) continue;
        const d = 1 - wd.shadowAt(p, undefined, this.leeAt(p, from, step)).k; def[j * nx + i] = d;
        if (d > J.max && sx >= 0 && sx <= w && sy >= 0 && sy <= h) J.max = d; // (in view: for the key and the chart's note)
      }
      if (performance.now() - t0 > budget) break;
    }
    J.ms += performance.now() - t0;
    if (J.j < ny) return;
    this.job = null;
    const c = this.img ?? document.createElement('canvas'); c.width = nx; c.height = ny;
    const g = c.getContext('2d')!, im = g.createImageData(nx, ny), px = im.data, max = J.max;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const d = def[j * nx + i], o = (j * nx + i) * 4;
      if (d < FAINT * 0.5) continue;
      const rim = d < FAINT; // (the fade-in below the faintest shadow: a light rim, so its edge reads on any colour under it)
      const a = rim ? 0.3 : Math.min(0.62, 0.22 + 0.4 * (d - FAINT) / (FULL - FAINT)); // (at most 0.62: the chart stays readable under it)
      if (rim) { px[o] = 235; px[o + 1] = 228; px[o + 2] = 250; } else { px[o] = 74; px[o + 1] = 32; px[o + 2] = 140; }
      px[o + 3] = Math.round(255 * a);
    }
    g.putImageData(im, 0, 0);
    this.img = c; this.m = J.m; this.box = { x0, y0, x1: J.x1, y1: J.y1 }; this.cell = cellPx; this.t = wd.t; this.maxDeficit = max; this.lastMs = J.ms;
  }
}
