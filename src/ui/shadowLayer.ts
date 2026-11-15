import { V, type Vec } from '../core/math';
import { BOAT_WAKE } from '../environment/shadows';
import { onLand } from '../geo/shore';
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
 * A boat's dirty air is narrow, 3 to 12 m across over its 114 m (environment/shadows.ts addBoatWake): finer than the
 * samples once each is more than a few metres of water, as at the chart's usual zoom, where it vanished (the owner:
 * "toggling wind shadow doesn't do anything that I can see"). There, each boat's wake is drawn as a ribbon of its own
 * down its middle, at least WAKE_PX wide and WAKE_A opaque so it reads (its tail, down to a fiftieth lighter, fading
 * out), its depth along it still the physics': the wind
 * on its middle against the wind just beside it (so the land's lee, already in the field, isn't counted twice).
 */
const FAINT = 0.05, FULL = 0.4, MARGIN = 0.25;
/** The ribbons: drawn once a sample is more than WAKE_M of water; at least WAKE_PX wide and WAKE_A opaque; and not at all
 * when a wake would be under WAKE_MIN_PX long on the screen (the whole Bay in view: specks, clutter). */
const WAKE_M = 4, WAKE_PX = 4, WAKE_A = 0.4, WAKE_MIN_PX = 10, WAKE_STEPS = 12;
/** A ribbon's tail is drawn down to a fiftieth lighter, fading out from WAKE_A at FAINT: a boat's wake is a twentieth
 * lighter for only its first 40 m or so (five lengths), and a fiftieth for about 90 m, where a racer still feels it. */
const WAKE_TAIL = 0.02;
/** The violet the field uses, and its light rim. */
const INK = '74,32,140', RIM = '235,228,250';
type Wake = { pts: Vec[]; d: number[] };
/** The sim's world (the land and its lee are known inside it: scripts/fetch-charts.mjs BOX): beyond it, nothing drawn. */
const WORLD = { s: LL(37.735, -122.61), n: LL(37.985, -122.188) };
type M = [number, number, number, number, number, number];

export class ShadowLayer {
  private img: HTMLCanvasElement | null = null;
  /** the map's transform when sampled (sim metres to screen), and the screen box sampled (with its margin) */
  private m: M | null = null; private box = { x0: 0, y0: 0, x1: 0, y1: 0 }; private t = -Infinity; private cell = 0;
  /** the strongest deficit in view at the last sampling (0 = no shadow anywhere in view) */
  maxDeficit = 0;
  /** ms the last sampling took */
  lastMs = 0;
  /** the boats' wakes at the last sampling, as ribbons (sim metres), when the samples are too coarse for them */
  private wakes: Wake[] = [];
  draw(ctx: CanvasRenderingContext2D, tf: Tf, w: number, h: number, wd: SimView, cellPx: number, every: number): void {
    const { m, inv } = affine(tf);
    if (this.stale(m, w, h, wd, cellPx, every)) { this.sample(m, inv, w, h, wd, cellPx); this.sampleWakes(wd, cellPx / Math.hypot(m[0], m[1])); }
    if (!this.img || !this.m) return;
    if (this.maxDeficit >= FAINT) this.drawField(ctx, m);
    this.drawWakes(ctx, tf, Math.hypot(m[0], m[1]));
  }
  private drawField(ctx: CanvasRenderingContext2D, m: M): void {
    // old screen → sim metres → new screen: an affine map, so the image is drawn through it
    const o = this.m!, img = this.img!, det = o[0] * o[3] - o[1] * o[2];
    const ia = o[3] / det, ib = -o[1] / det, ic = -o[2] / det, id = o[0] / det; // the inverse of the old linear part
    const a = m[0] * ia + m[2] * ib, b = m[1] * ia + m[3] * ib, c = m[0] * ic + m[2] * id, d = m[1] * ic + m[3] * id;
    const e = m[4] - (a * o[4] + c * o[5]), f = m[5] - (b * o[4] + d * o[5]);
    ctx.save(); ctx.transform(a, b, c, d, e, f); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    const { x0, y0 } = this.box, k = this.cell;
    ctx.drawImage(img, 0, 0, img.width, img.height, x0 - k / 2, y0 - k / 2, img.width * k, img.height * k);
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
  private sample(m: M, inv: (sx: number, sy: number) => Vec, w: number, h: number, wd: SimView, cellPx: number): void {
    const t0 = performance.now(), mx = w * MARGIN, my = h * MARGIN, x0 = -mx, y0 = -my, x1 = w + mx, y1 = h + my;
    const nx = Math.ceil((x1 - x0) / cellPx) + 1, ny = Math.ceil((y1 - y0) / cellPx) + 1;
    const c = this.img ?? document.createElement('canvas'); c.width = nx; c.height = ny;
    const g = c.getContext('2d')!, im = g.createImageData(nx, ny), px = im.data;
    let max = 0;
    const def = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const sx = x0 + i * cellPx, sy = y0 + j * cellPx, p = inv(sx, sy);
      if (p.x < WORLD.s.x || p.x > WORLD.n.x || p.y < WORLD.s.y || p.y > WORLD.n.y || onLand(p)) continue;
      const d = 1 - wd.shadowAt(p).k; def[j * nx + i] = d;
      if (d > max && sx >= 0 && sx <= w && sy >= 0 && sy <= h) max = d; // (in view: for the key and the chart's note)
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const d = def[j * nx + i], o = (j * nx + i) * 4;
      if (d < FAINT * 0.5) continue;
      const rim = d < FAINT; // (the fade-in below the faintest shadow: a light rim, so its edge reads on any colour under it)
      const a = rim ? 0.3 : Math.min(0.62, 0.22 + 0.4 * (d - FAINT) / (FULL - FAINT)); // (at most 0.62: the chart stays readable under it)
      if (rim) { px[o] = 235; px[o + 1] = 228; px[o + 2] = 250; } else { px[o] = 74; px[o + 1] = 32; px[o + 2] = 140; }
      px[o + 3] = Math.round(255 * a);
    }
    g.putImageData(im, 0, 0);
    this.img = c; this.m = m; this.box = { x0, y0, x1, y1 }; this.cell = cellPx; this.t = wd.t; this.maxDeficit = max; this.lastMs = performance.now() - t0;
  }

  /** Each boat's wake down its middle, when a sample (`cellM` metres of water) is too coarse to catch it. */
  private sampleWakes(wd: SimView, cellM: number): void {
    this.wakes = [];
    if (cellM <= WAKE_M) return; // (fine enough: the field shows them as they are)
    const L = 12 * BOAT_WAKE.mast;
    for (const b of wd.boats) {
      // (downstream along her apparent wind, as the physics lays her wake; and square to it, to look beside it)
      const e = V(b.h + b.arel + 180), s = { x: -e.y, y: e.x }, pts: Vec[] = [], d: number[] = [];
      let any = false;
      for (let i = 0; i <= WAKE_STEPS; i++) {
        const x = L * i / WAKE_STEPS, p = { x: b.x + e.x * x, y: b.y + e.y * x };
        // beside it: well outside the wake's width there (the physics' sigma, 0.22 d0 + 0.06 x at most), both sides
        const off = 4 * (0.22 * BOAT_WAKE.d0 + 0.06 * x) + 6;
        const k = wd.shadowAt(p).k, kSide = Math.max(wd.shadowAt({ x: p.x + s.x * off, y: p.y + s.y * off }).k, wd.shadowAt({ x: p.x - s.x * off, y: p.y - s.y * off }).k);
        const di = kSide > 0 ? Math.max(0, 1 - k / kSide) : 0;
        pts.push(p); d.push(di); if (di >= WAKE_TAIL) any = true;
      }
      if (any) { this.wakes.push({ pts, d }); this.maxDeficit = Math.max(this.maxDeficit, ...d); } // (for the key and the chart's note)
    }
  }
  private drawWakes(ctx: CanvasRenderingContext2D, tf: Tf, pxPerM: number): void {
    if (!this.wakes.length || 12 * BOAT_WAKE.mast * pxPerM < WAKE_MIN_PX) return;
    ctx.save(); ctx.lineCap = 'round';
    for (const pass of [0, 1]) for (const { pts, d } of this.wakes) for (let i = 1; i < pts.length; i++) {
      const di = (d[i - 1] + d[i]) / 2; if (di < WAKE_TAIL) continue;
      // (as deep as the field draws that deficit, but never fainter than WAKE_A: a ribbon this thin needs it to read;
      // in its tail, under a twentieth, fading from WAKE_A to nothing at WAKE_TAIL)
      const a = di < FAINT ? WAKE_A * (di - WAKE_TAIL) / (FAINT - WAKE_TAIL) : Math.max(WAKE_A, Math.min(0.62, 0.22 + 0.4 * (di - FAINT) / (FULL - FAINT)));
      const [x0, y0] = tf(pts[i - 1].x, pts[i - 1].y), [x1, y1] = tf(pts[i].x, pts[i].y);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      if (pass === 0) { ctx.strokeStyle = `rgba(${RIM},${Math.min(0.55, a * 1.4).toFixed(2)})`; ctx.lineWidth = WAKE_PX + 2; } // (a light rim first, so it reads on any color)
      else { ctx.strokeStyle = `rgba(${INK},${a.toFixed(2)})`; ctx.lineWidth = WAKE_PX; }
      ctx.stroke();
    }
    ctx.restore();
  }
}
