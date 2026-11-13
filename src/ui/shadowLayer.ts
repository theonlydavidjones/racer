import type { Vec } from '../core/math';
import { onLand } from '../geo/shore';
import type { SimView } from '../sim/host';
import { affine } from './flow';
import { LL } from '../geo/geo';
import type { Tf } from './draw2d';

/**
 * The wind shadows on the map: where the wind is lighter for what stands upwind and isn't in the wind records, read
 * from the race's own wind (World.shadowAt, what the sails feel, environment/shadows.ts): the lee of the land and the
 * islands, each boat's dirty air (their wakes combined as the physics combines them), ships and ferries, the committee
 * boat, and the bridge piers. Drawn as a deep violet (a colour NOAA's chart doesn't use) as strong as the wind's
 * deficit, from a twentieth lighter (faint) to two-fifths or more (full, and still see-through), with a light rim where it starts so it reads over
 * the chart and the wind's colours alike.
 *
 * Sampled one point every `cellPx` of the screen over the water in view into a small image drawn scaled up, smooth.
 * Worked out again when the view moves or zooms, or the race's clock moves on `every` seconds.
 */
const FAINT = 0.05, FULL = 0.4;
/** The sim's world (the land and its lee are known inside it: scripts/fetch-charts.mjs BOX): beyond it, nothing drawn. */
const WORLD = { s: LL(37.735, -122.61), n: LL(37.985, -122.188) };

export class ShadowLayer {
  private img: HTMLCanvasElement | null = null;
  private key = ''; private t = -Infinity;
  /** the strongest deficit in view at the last sampling (0 = no shadow anywhere in view) */
  maxDeficit = 0;
  /** ms the last sampling took */
  lastMs = 0;
  draw(ctx: CanvasRenderingContext2D, tf: Tf, w: number, h: number, wd: SimView, cellPx: number, every: number): void {
    const { m, inv } = affine(tf), key = `${w},${h},${m.map(v => v.toFixed(4)).join(',')}`;
    if (key !== this.key || Math.abs(wd.t - this.t) >= every || !this.img) this.sample(inv, w, h, wd, cellPx, key);
    if (!this.img || this.maxDeficit < FAINT) return;
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.img, 0, 0, this.img.width, this.img.height, -cellPx / 2, -cellPx / 2, this.img.width * cellPx, this.img.height * cellPx);
    ctx.restore();
  }
  private sample(inv: (sx: number, sy: number) => Vec, w: number, h: number, wd: SimView, cellPx: number, key: string): void {
    const t0 = performance.now(), nx = Math.ceil(w / cellPx) + 1, ny = Math.ceil(h / cellPx) + 1;
    const c = this.img ?? document.createElement('canvas'); c.width = nx; c.height = ny;
    const g = c.getContext('2d')!, im = g.createImageData(nx, ny), px = im.data;
    let max = 0;
    const def = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const p = inv(i * cellPx, j * cellPx);
      if (p.x < WORLD.s.x || p.x > WORLD.n.x || p.y < WORLD.s.y || p.y > WORLD.n.y || onLand(p)) continue;
      const d = 1 - wd.shadowAt(p).k; def[j * nx + i] = d; if (d > max) max = d;
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const d = def[j * nx + i], o = (j * nx + i) * 4;
      if (d < FAINT * 0.5) continue;
      // (a light rim where the shadow starts: a sample at the edge of it, lighter neighbours round it)
      const rim = d < FAINT; // (the fade-in below the faintest shadow: a light rim, so its edge reads on any colour under it)
      const a = rim ? 0.3 : Math.min(0.62, 0.22 + 0.4 * (d - FAINT) / (FULL - FAINT)); // (at most 0.62: the chart stays readable under it)
      if (rim) { px[o] = 235; px[o + 1] = 228; px[o + 2] = 250; } else { px[o] = 74; px[o + 1] = 32; px[o + 2] = 140; }
      px[o + 3] = Math.round(255 * a);
    }
    g.putImageData(im, 0, 0);
    this.img = c; this.key = key; this.t = wd.t; this.maxDeficit = max; this.lastMs = performance.now() - t0;
  }
}
