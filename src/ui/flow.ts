import { KT, V, dist, dot, type Vec } from '../core/math';
import { onLand } from '../geo/shore';
import type { SimView } from '../sim/host';
import type { Tf } from './draw2d';

/*
 * The wind and the current on the maps, as Windy draws them (the owner: "more prominent information from the condition
 * layers, similar to how the Windy app handles it"): the speed as colour over the water, and moving streaks the way it
 * flows. One of the two at a time. The colour is the wind with its puffs and lulls (not the gusts of the seconds), and
 * the current as the tide sets it; the readout under the cursor is what's there.
 */

export type FlowKind = 'wind' | 'current';
type Ramp = [number, [number, number, number]][];

/** Windy's wind colours (kt): blue-grey in a calm, green at 10–15, yellow at 20, orange at 25, red at 30, purple beyond. */
export const WIND_RAMP: Ramp = [[0, [98, 113, 183]], [4, [57, 97, 159]], [8, [74, 148, 169]], [12, [77, 141, 123]], [16, [83, 165, 83]], [20, [209, 192, 58]], [24, [228, 140, 55]], [28, [212, 72, 63]], [34, [151, 53, 98]], [40, [96, 36, 120]]];
/** The current's (kt): dark at slack, teal at a knot, yellow at two, orange at three, red at four (the Gate's strongest
 * ebbs run over five: NOAA's Bay Entrance and Golden Gate Bridge stations, SFB1201 and SFB1202). */
export const CURRENT_RAMP: Ramp = [[0, [40, 60, 90]], [0.5, [52, 120, 170]], [1, [58, 170, 190]], [1.5, [90, 200, 150]], [2, [220, 210, 80]], [3, [235, 130, 50]], [4, [210, 55, 70]], [5, [150, 40, 130]]];
export const RAMP: Record<FlowKind, Ramp> = { wind: WIND_RAMP, current: CURRENT_RAMP };
/** The legend's numbers. */
export const TICKS: Record<FlowKind, number[]> = { wind: [0, 5, 10, 15, 20, 25, 30, 35], current: [0, 0.5, 1, 2, 3, 4, 5] };

export function rampColor(r: Ramp, v: number): [number, number, number] {
  if (v <= r[0][0]) return r[0][1];
  for (let i = 1; i < r.length; i++) if (v <= r[i][0]) {
    const t = (v - r[i - 1][0]) / (r[i][0] - r[i - 1][0]), a = r[i - 1][1], b = r[i][1];
    return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
  }
  return r[r.length - 1][1];
}

/** The flow at p for the map: its speed (kt) and the way it goes (a unit vector, x east, y north). */
export function flowAt(w: SimView, kind: FlowKind, p: Vec): { kt: number; ux: number; uy: number } {
  if (kind === 'wind') {
    // the wind here: the day's wind with the shore's lee and the slot (World.fieldAt), and the puffs and lulls drifting
    // over it (the owner: puffs in the field's own colours, not grey), without the gusts of the seconds
    const f = w.fieldAt(p), q = w.puffs.at(p), kt = w.wind.kt * f.k * q.k, a = (w.wind.from + f.turn + q.veer) * Math.PI / 180;
    return { kt, ux: -Math.sin(a), uy: -Math.cos(a) };
  }
  const c = w.currentAt(p), s = Math.hypot(c.x, c.y);
  return { kt: s / KT, ux: s ? c.x / s : 0, uy: s ? c.y / s : 0 };
}

const deg = (a: number) => String(Math.round(((a % 360) + 360) % 360)).padStart(3, '0') + '°';
/** Flood or ebb at p, by the nearest NOAA station's flood direction (as the tide box says it), or the Gate's with a
 * practice current (the flood sets in about 095°: environment/current.ts). */
export function tideWord(w: SimView, p: Vec, c: Vec): string {
  const kt = Math.hypot(c.x, c.y) / KT; if (kt < 0.15) return 'slack';
  const st = w.tide?.stations.length ? w.tide.stations.reduce((a, s) => (dist(s.p, p) < dist(a.p, p) ? s : a)) : null;
  return dot(c, V(st ? st.flood : 95)) >= 0 ? 'flood' : 'ebb';
}
/** The two lines of the readout at p: the layer's own first. `wind` and `cur` default to what's on the water there. */
export function readout(w: SimView, kind: FlowKind, p: Vec, wind?: { kt: number; from: number }, cur?: Vec): [string, string] {
  const wv = wind ?? w.windHere(p, undefined, false), c = cur ?? w.currentAt(p), ck = Math.hypot(c.x, c.y) / KT, tw = tideWord(w, p, c);
  const wl = `${Math.round(wv.kt)} kt from ${deg(wv.from)}`;
  const cl = tw === 'slack' ? 'slack water' : `${tw} ${ck.toFixed(1)} kt toward ${deg(Math.atan2(c.x, c.y) * 180 / Math.PI)}`;
  return kind === 'wind' ? [wl, cl] : [cl, `wind ${wl}`];
}

/** The affine map tf is (a turn, a scale and a shift): its matrix, and its inverse (screen to sim metres). */
function affine(tf: Tf): { m: [number, number, number, number, number, number]; inv: (sx: number, sy: number) => Vec } {
  const o = tf(0, 0), ex = tf(1, 0), ey = tf(0, 1);
  const a = ex[0] - o[0], b = ex[1] - o[1], c = ey[0] - o[0], d = ey[1] - o[1], det = a * d - b * c;
  return { m: [a, b, c, d, o[0], o[1]], inv: (sx, sy) => { const X = sx - o[0], Y = sy - o[1]; return { x: (d * X - c * Y) / det, y: (-b * X + a * Y) / det }; } };
}

/**
 * The colour field, sampled on a grid in the sim's metres (one sample per `cellPx` on screen) over the view and half
 * as much again round it, into a small image drawn scaled up. It's worked out again only when the view goes beyond
 * it, the zoom changes, or the sim's minute (or the world) changes: never every frame.
 */
export class FlowField {
  private img: HTMLCanvasElement | null = null;
  private key = ''; private x0 = 0; private y1 = 0; private d = 1; private nx = 0; private ny = 0;
  /** the flow at each sample (kt, and the way it goes; NaN ashore), for the streaks to follow */
  private kt = new Float32Array(0); private ux = new Float32Array(0); private uy = new Float32Array(0);
  /** samples worked out last time, and how long that took (ms): for the frame-cost check */
  lastSamples = 0; lastMs = 0;
  draw(ctx: CanvasRenderingContext2D, tf: Tf, w: number, h: number, scale: number, wd: SimView, kind: FlowKind, alpha: number, cellPx = 12, everyS = 60): void {
    if (!(w > 0 && h > 0 && scale > 0 && cellPx > 0)) return; // (a map not laid out yet, or hidden)
    const { m, inv } = affine(tf);
    const cs = [inv(0, 0), inv(w, 0), inv(0, h), inv(w, h)], xs = cs.map(p => p.x), ys = cs.map(p => p.y);
    const vx0 = Math.min(...xs), vx1 = Math.max(...xs), vy0 = Math.min(...ys), vy1 = Math.max(...ys);
    // (worked out again every `everyS` seconds of the sim's clock: the puffs drift, the tide turns)
    const d = cellPx / scale, bucket = Math.floor(wd.clockUtc * 60 / everyS);
    const key = `${kind}|${bucket}|${wd.seed}|${wd.wind.from.toFixed(0)}`;
    const inside = this.img && vx0 >= this.x0 && vx1 <= this.x0 + (this.nx - 1) * this.d && vy1 <= this.y1 && vy0 >= this.y1 - (this.ny - 1) * this.d;
    if (![vx0, vx1, vy0, vy1, d].every(Number.isFinite)) return;
    if (!inside || key !== this.key || Math.abs(Math.log(d / this.d)) > 0.25) this.build(wd, kind, vx0, vx1, vy0, vy1, d, key);
    else this.lastSamples = 0;
    if (!this.img) return;
    // the image's pixel (i, j) is the sim's (x0 + i·d, y1 − j·d): that onto the screen through tf
    ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = true;
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]); ctx.transform(this.d, 0, 0, -this.d, this.x0, this.y1);
    ctx.drawImage(this.img!, -0.5, -0.5);
    ctx.restore();
  }
  private build(wd: SimView, kind: FlowKind, vx0: number, vx1: number, vy0: number, vy1: number, d: number, key: string): void {
    const T0 = performance.now();
    const mx = (vx1 - vx0) * 0.25, my = (vy1 - vy0) * 0.25;
    this.x0 = Math.floor((vx0 - mx) / d) * d; this.y1 = Math.ceil((vy1 + my) / d) * d; this.d = d; this.key = key;
    this.nx = Math.min(1024, Math.ceil((vx1 + mx - this.x0) / d) + 2); this.ny = Math.min(1024, Math.ceil((this.y1 - (vy0 - my)) / d) + 2);
    const img = this.img ?? document.createElement('canvas'); img.width = this.nx; img.height = this.ny; this.img = img;
    const g = img.getContext('2d')!, id = g.createImageData(this.nx, this.ny), R = RAMP[kind], N = this.nx * this.ny;
    if (this.kt.length !== N) { this.kt = new Float32Array(N); this.ux = new Float32Array(N); this.uy = new Float32Array(N); }
    for (let j = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++) {
      const p = { x: this.x0 + i * d, y: this.y1 - j * d }, n = j * this.nx + i, k = n * 4;
      if (onLand(p)) { this.kt[n] = NaN; continue; } // (the land keeps the chart's own colours: nobody sails there)
      const f = flowAt(wd, kind, p); this.kt[n] = f.kt; this.ux[n] = f.ux; this.uy[n] = f.uy;
      const c = rampColor(R, f.kt);
      id.data[k] = c[0]; id.data[k + 1] = c[1]; id.data[k + 2] = c[2]; id.data[k + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    this.lastSamples = this.nx * this.ny;
    this.lastMs = performance.now() - T0;
  }
  /** The flow at p from the samples (blended between the four round it), or null ashore or off the grid. */
  at(p: Vec): { kt: number; ux: number; uy: number } | null {
    if (!this.img) return null;
    const fx = (p.x - this.x0) / this.d, fy = (this.y1 - p.y) / this.d, i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= this.nx - 1 || j >= this.ny - 1) return null;
    const tx = fx - i, ty = fy - j, n = j * this.nx + i, ns = [n, n + 1, n + this.nx, n + this.nx + 1], ws = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
    let kt = 0, ux = 0, uy = 0;
    for (let q = 0; q < 4; q++) { const v = this.kt[ns[q]]; if (Number.isNaN(v)) return null; kt += v * ws[q]; ux += this.ux[ns[q]] * ws[q]; uy += this.uy[ns[q]] * ws[q]; }
    const l = Math.hypot(ux, uy) || 1;
    return { kt, ux: ux / l, uy: uy / l };
  }
}

/**
 * Screen speed of the streaks (px/s per kt): a calm drift you can read, as Windy's map shows at its default (the owner,
 * 13 Nov 2026: "way, way too fast" at 6): 15 kt of wind drifts about 24 px a second, 2 kt of current about 24. The
 * slot's run still shows against the lee's crawl; the current's are scaled up, being slower.
 */
const PX_PER_KT: Record<FlowKind, number> = { wind: 1.6, current: 12 };
const HIST = 20, EVERY = 0.12; // a trail of 20 points, one every 0.12 s: 2.4 s behind each, so a slow streak is still long enough to read (about 60 px in 15 kt)

/**
 * The streaks: a pool of particles carried along the flow in the sim's metres, each with a short fading trail, put
 * back somewhere new on the water when it's had its few seconds, runs ashore or leaves the view.
 */
export class Streaks {
  private xs: Float64Array; private ys: Float64Array; private age: Float64Array; private life: Float64Array;
  private hx: Float64Array; private hy: Float64Array; private hn: Uint8Array; private acc = 0;
  private seed = 12345; private view = { x: 0, y: 0, scale: 0 };
  constructor(private n: number) {
    this.xs = new Float64Array(n); this.ys = new Float64Array(n); this.age = new Float64Array(n).fill(Infinity); this.life = new Float64Array(n);
    this.hx = new Float64Array(n * HIST); this.hy = new Float64Array(n * HIST); this.hn = new Uint8Array(n);
  }
  private rnd(): number { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  /** Move them on by dt (real seconds), then draw them through tf. */
  draw(ctx: CanvasRenderingContext2D, tf: Tf, w: number, h: number, scale: number, field: FlowField, kind: FlowKind, dt: number, lineW = 1.3, color = '255,255,255'): void {
    if (!(w > 0 && h > 0 && scale > 0)) return;
    const { inv } = affine(tf), step = Math.min(Math.max(dt, 0), 0.1), px = PX_PER_KT[kind];
    // a new view (zoomed, or moved a quarter of the way across): scatter them all over it afresh
    { const c = inv(w / 2, h / 2), v = this.view;
      if (Math.abs(Math.log(scale / (v.scale || 1e-9))) > 0.1 || Math.hypot(c.x - v.x, c.y - v.y) * scale > Math.min(w, h) / 4) { this.age.fill(Infinity); this.view = { x: c.x, y: c.y, scale }; } }
    this.acc += step; const record = this.acc >= EVERY; if (record) this.acc = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] > this.life[i]) { // a new one, somewhere on the water in view
        let p = inv(this.rnd() * w, this.rnd() * h);
        for (let t = 0; t < 4 && !field.at(p); t++) p = inv(this.rnd() * w, this.rnd() * h);
        this.xs[i] = p.x; this.ys[i] = p.y; this.age[i] = 0; this.life[i] = 8 + this.rnd() * 6; // (long enough to grow its trail at the slow drift)
        this.hx[i * HIST] = p.x; this.hy[i * HIST] = p.y; this.hn[i] = 1;
      }
      const p = { x: this.xs[i], y: this.ys[i] }, f = field.at(p);
      if (!f || f.kt < (kind === 'wind' ? 0.5 : 0.05)) { this.age[i] = Infinity; continue; }
      const m = f.kt * px * step / scale; // (metres this frame: px on the screen, at the map's scale)
      const q = { x: p.x + f.ux * m, y: p.y + f.uy * m };
      const s = tf(q.x, q.y);
      if (!field.at(q) || s[0] < -20 || s[1] < -20 || s[0] > w + 20 || s[1] > h + 20) { this.age[i] = Infinity; continue; }
      this.xs[i] = q.x; this.ys[i] = q.y; this.age[i] += step;
      if (record) { // shift the trail on one point
        const o = i * HIST, k = this.hn[i];
        if (k < HIST) this.hn[i] = k + 1; else for (let j = 1; j < HIST; j++) { this.hx[o + j - 1] = this.hx[o + j]; this.hy[o + j - 1] = this.hy[o + j]; }
        this.hx[o + this.hn[i] - 1] = q.x; this.hy[o + this.hn[i] - 1] = q.y;
      }
    }
    // the trails: the newest segment brightest; each segment's age drawn in one path for all of them
    ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = lineW;
    const pt = (i: number, j: number, k: number): [number, number] => j === k ? tf(this.xs[i], this.ys[i]) : tf(this.hx[i * HIST + j], this.hy[i * HIST + j]);
    for (let a = 0; a < HIST; a++) {
      ctx.strokeStyle = `rgba(${color},${(0.85 * (1 - a / HIST)).toFixed(2)})`; ctx.beginPath();
      for (let i = 0; i < this.n; i++) {
        const k = this.hn[i]; if (!Number.isFinite(this.age[i]) || k < 1) continue;
        const j = k - 1 - a; if (j < 0) continue; // (points 0…k−1 recorded, then where it is now, as point k)
        const s0 = pt(i, j, k), s1 = pt(i, j + 1, k); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** The legend: the ramp, in kt, centred at (cx, y). */
export function drawLegend(ctx: CanvasRenderingContext2D, kind: FlowKind, cx: number, y: number, W = 360): void {
  const R = RAMP[kind], ticks = TICKS[kind], max = ticks[ticks.length - 1], x0 = cx - W / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(9,22,33,.88)'; ctx.beginPath(); ctx.roundRect(x0 - 12, y - 30, W + 24, 58, 8); ctx.fill();
  ctx.font = '700 12px "Saira Semi Condensed", sans-serif'; ctx.fillStyle = '#e9f2f5'; ctx.textAlign = 'left';
  ctx.fillText(kind === 'wind' ? 'WIND SPEED · KT (with the puffs and lulls)' : 'CURRENT · KT (NOAA tide predictions)', x0, y - 14);
  for (let x = 0; x < W; x++) { const c = rampColor(R, x / W * max); ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.fillRect(x0 + x, y - 6, 1, 12); }
  ctx.font = '600 11px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#e9f2f5';
  for (const t of ticks) ctx.fillText(String(t), x0 + t / max * W, y + 20);
  ctx.restore();
}

/** The readout box: two lines beside (sx, sy), kept on the canvas. */
export function drawReadout(ctx: CanvasRenderingContext2D, lines: [string, string], sx: number, sy: number, w: number): void {
  ctx.save();
  ctx.font = '700 17px "Saira Semi Condensed", sans-serif'; const w1 = ctx.measureText(lines[0]).width;
  ctx.font = '600 13px "Saira Semi Condensed", sans-serif'; const w2 = ctx.measureText(lines[1]).width;
  const bw = Math.max(w1, w2) + 22, bx = sx + 16 + bw > w - 6 ? sx - 16 - bw : sx + 16, by = Math.max(6, sy - 56);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, 7, 0, 6.29); ctx.stroke();
  ctx.fillStyle = 'rgba(9,22,33,.92)'; ctx.beginPath(); ctx.roundRect(bx, by, bw, 50, 8); ctx.fill();
  ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff'; ctx.font = '700 17px "Saira Semi Condensed", sans-serif'; ctx.fillText(lines[0], bx + 11, by + 22);
  ctx.fillStyle = '#9fc0cf'; ctx.font = '600 13px "Saira Semi Condensed", sans-serif'; ctx.fillText(lines[1], bx + 11, by + 41);
  ctx.restore();
}
