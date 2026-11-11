import { D2R, HALF, V, ZONE } from '../core/math';
import { BOAT_WAKE } from '../environment/shadows';
import { LAND, landGrid } from '../geo/shore';
import { LL } from '../geo/geo';
import type { Course } from '../courses/course';
import type { Laylines } from '../sim/laylines';

export type Tf = (x: number, y: number) => [number, number];

/** World → canvas transform centred on (cx, cy), rotated so wind direction W points up. */
export function makeTf(cx: number, cy: number, W: number, scale: number, w: number, h: number): Tf {
  return (x, y) => {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), be = Math.atan2(dx, dy) - W * D2R;
    return [w / 2 + Math.sin(be) * r * scale, h / 2 - Math.cos(be) * r * scale];
  };
}

let landImg: HTMLCanvasElement | null = null;
/** The bay's land beyond the Cityfront as an image: the 50 m grid smoothed to clean coastlines. */
function bayLand(): HTMLCanvasElement {
  if (landImg) return landImg;
  const L = landGrid(), cf = L.cityfront, small = document.createElement('canvas'); small.width = L.nx; small.height = L.ny;
  const sg = small.getContext('2d')!, id = sg.createImageData(L.nx, L.ny);
  for (let j = 0; j < L.ny; j++) for (let i = 0; i < L.nx; i++) {
    const lat = L.north - (j + 0.5) / L.ny * (L.north - L.south), lon = L.west + (i + 0.5) / L.nx * (L.east - L.west);
    const inCf = lat > cf.south && lat < cf.north && lon > cf.west && lon < cf.east; // drawn from the Cityfront shore instead
    if (L.grid[j * L.nx + i] && !inCf) id.data[(j * L.nx + i) * 4 + 3] = 255;
  }
  sg.putImageData(id, 0, 0);
  const k = 4, big = document.createElement('canvas'); big.width = L.nx * k; big.height = L.ny * k;
  const bg = big.getContext('2d', { willReadFrequently: true })!; bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = 'high'; bg.filter = `blur(${k * 0.9}px)`; bg.drawImage(small, 0, 0, big.width, big.height); bg.filter = 'none';
  const d = bg.getImageData(0, 0, big.width, big.height), px = d.data;
  for (let q = 0; q < px.length; q += 4) { const on = px[q + 3] >= 128; px[q] = 0x4d; px[q + 1] = 0x5f; px[q + 2] = 0x4b; px[q + 3] = on ? 255 : 0; }
  bg.putImageData(d, 0, 0);
  return landImg = big;
}

export function drawLand(ctx: CanvasRenderingContext2D, tf: Tf): void {
  { // the rest of the bay: an image placed with the map's own transform
    const L = landGrid(), img = bayLand(), at = (lat: number, lon: number) => { const p = LL(lat, lon); return tf(p.x, p.y); };
    const p0 = at(L.north, L.west), p1 = at(L.north, L.east), p2 = at(L.south, L.west);
    ctx.save(); ctx.transform((p1[0] - p0[0]) / img.width, (p1[1] - p0[1]) / img.width, (p2[0] - p0[0]) / img.height, (p2[1] - p0[1]) / img.height, p0[0], p0[1]);
    ctx.drawImage(img, 0, 0); ctx.restore();
  }
  ctx.fillStyle = '#4d5f4b'; ctx.beginPath();
  LAND.forEach((p, i) => { const s = tf(p.x, p.y); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); });
  ctx.closePath(); ctx.fill();
}

/** Overlay colours for a light chart (ui/encChart.ts INK.day); left out, the colours for a dark map. */
export interface OverlayInk { mark?: string; markPass?: string; line?: string; current?: string; lull?: (a: number) => string; lullHatch?: boolean; windTick?: string }

export function drawCourse(ctx: CanvasRenderingContext2D, C: Course, aids: boolean, tf: Tf, scale: number, highlight: number, ink: OverlayInk = {}): void {
  const p1 = tf(C.pin.x, C.pin.y), p2 = tf(C.committee.x, C.committee.y);
  ctx.setLineDash([5, 5]); ctx.strokeStyle = ink.line ?? 'rgba(255,216,74,.75)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); ctx.setLineDash([]);
  const seen = new Set<string>();
  C.marks.forEach((m, i) => {
    const s = tf(m.p.x, m.p.y), key = m.name;
    const hi = highlight === i;
    if (m.type === 'round' && aids) { ctx.strokeStyle = hi ? 'rgba(255,216,74,.6)' : 'rgba(255,216,74,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(s[0], s[1], Math.max(2, ZONE * scale), 0, 6.29); ctx.stroke(); }
    if (seen.has(key) && !hi) return; seen.add(key);
    ctx.fillStyle = hi ? '#ffb627' : (m.type === 'pass' ? ink.markPass ?? '#c9b25a' : ink.mark ?? '#ffc21a');
    ctx.beginPath(); ctx.arc(s[0], s[1], hi ? 4 : 3, 0, 6.29); ctx.fill();
    if (ink.mark) { ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1; ctx.stroke(); }
  });
}

export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

export function drawHull(ctx: CanvasRenderingContext2D, p: [number, number], hdg: number, boomDeg: number, scale: number, color: string, label: string | null): void {
  ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(hdg * D2R);
  const s = scale;
  ctx.beginPath(); ctx.moveTo(0, -HALF * s);
  ctx.quadraticCurveTo(1.15 * s, -2.2 * s, 1.1 * s, 0); ctx.quadraticCurveTo(1.05 * s, 2.6 * s, 0.62 * s, HALF * s);
  ctx.lineTo(-0.62 * s, HALF * s); ctx.quadraticCurveTo(-1.05 * s, 2.6 * s, -1.1 * s, 0); ctx.quadraticCurveTo(-1.15 * s, -2.2 * s, 0, -HALF * s);
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -0.6 * s); const ba = boomDeg * D2R; ctx.lineTo(Math.sin(ba) * 3.3 * s, -0.6 * s + Math.cos(ba) * 3.3 * s); ctx.stroke();
  ctx.restore();
  if (label) { ctx.fillStyle = '#e9f2f5'; ctx.font = '600 12px "Saira Semi Condensed", sans-serif'; ctx.fillText(label, p[0] + 12, p[1] - 10); }
}

/** Size a canvas to its CSS box at device pixel ratio and return a context in CSS pixels. */
export function fitCanvas(c: HTMLCanvasElement): [CanvasRenderingContext2D, number, number] {
  const dpr = Math.min(2, devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return [ctx, w, h];
}

/** Starboard-tack (green) and port-tack (red) laylines from the mark, `len` metres long. */
export function drawLaylines(ctx: CanvasRenderingContext2D, tf: Tf, L: Laylines | null, len: number, width = 1): void {
  if (!L) return;
  const m = L.mark.p, mk = tf(m.x, m.y);
  ctx.save(); ctx.setLineDash([4, 4]); ctx.lineWidth = width;
  L.tracks.forEach((g, i) => {
    const e = tf(m.x - g.x * len, m.y - g.y * len);
    ctx.strokeStyle = i === 0 ? 'rgba(63,209,151,.75)' : 'rgba(255,106,92,.75)';
    ctx.beginPath(); ctx.moveTo(mk[0], mk[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
  });
  ctx.restore();
}

/**
 * Small arrows showing the current across the water, on a grid `spacing` metres apart around (cx, cy).
 * Length grows with speed; land and the shore relief come from `at`, the sim's own current field.
 */
export function drawCurrentArrows(ctx: CanvasRenderingContext2D, tf: Tf, at: (p: { x: number; y: number }) => { x: number; y: number },
  cx: number, cy: number, half: number, spacing: number, pxPerKt: number, onLand: (p: { x: number; y: number }) => boolean, ink: OverlayInk = {}): void {
  ctx.save();
  ctx.strokeStyle = ink.current ?? 'rgba(111,208,255,.55)'; ctx.fillStyle = ink.current ?? 'rgba(111,208,255,.55)'; ctx.lineWidth = 1.2;
  const x0 = Math.floor((cx - half) / spacing) * spacing, y0 = Math.floor((cy - half) / spacing) * spacing;
  for (let x = x0; x <= cx + half; x += spacing) for (let y = y0; y <= cy + half; y += spacing) {
    const p = { x, y };
    if (onLand(p)) continue;
    const c = at(p), kt = Math.hypot(c.x, c.y) / 0.5144;
    if (kt < 0.08) continue;
    const a = tf(x, y), b = tf(x + c.x / (kt * 0.5144) * 10, y + c.y / (kt * 0.5144) * 10); // direction only
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, len = Math.min(spacing * 0.8, kt * pxPerKt);
    const ux = dx / l, uy = dy / l, tx = a[0] + ux * len / 2, ty = a[1] + uy * len / 2;
    ctx.beginPath(); ctx.moveTo(a[0] - ux * len / 2, a[1] - uy * len / 2); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - ux * 4 - uy * 2.5, ty - uy * 4 + ux * 2.5); ctx.lineTo(tx - ux * 4 + uy * 2.5, ty - uy * 4 - ux * 2.5); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/**
 * The wind across the course (a training aid): darker where it blows harder than the course-wide wind, paler where it's
 * lighter, as cells a few hundred metres across, with a tick showing which way it's blowing there.
 */
export function drawWindField(ctx: CanvasRenderingContext2D, tf: Tf, at: (p: { x: number; y: number }) => { k: number; from: number },
  cx: number, cy: number, half: number, spacing: number, onLand: (p: { x: number; y: number }) => boolean, ink: OverlayInk = {}): void {
  ctx.save();
  const x0 = Math.floor((cx - half) / spacing) * spacing, y0 = Math.floor((cy - half) / spacing) * spacing;
  for (let x = x0; x <= cx + half; x += spacing) for (let y = y0; y <= cy + half; y += spacing) {
    const p = { x: x + spacing / 2, y: y + spacing / 2 };
    if (onLand(p)) continue;
    const f = at(p), d = f.k - 1;
    if (Math.abs(d) > 0.04) {
      const a = tf(x, y), b = tf(x + spacing, y + spacing), c = tf(x + spacing, y), e = tf(x, y + spacing);
      ctx.fillStyle = d > 0 ? `rgba(10,30,60,${Math.min(0.32, d * 0.9)})` : (ink.lull ?? (a => `rgba(200,230,245,${a})`))(Math.min(0.25, -d * 0.8));
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(e[0], e[1]); ctx.closePath();
      if (d < 0 && ink.lullHatch) { // on a white chart nothing is paler than the water: lighter wind is hatched instead, so it can't read as land
        ctx.save(); ctx.clip(); ctx.strokeStyle = ink.lull?.(Math.min(0.7, -d * 2.4)) ?? ctx.fillStyle; ctx.lineWidth = 1; ctx.beginPath();
        const xs = [a[0], b[0], c[0], e[0]], ys = [a[1], b[1], c[1], e[1]], x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        for (let t = x0 - (y1 - y0); t < x1; t += 7) { ctx.moveTo(t, y1); ctx.lineTo(t + (y1 - y0), y0); }
        ctx.stroke(); ctx.restore();
      } else ctx.fill();
    }
    // which way it blows here (downwind tick)
    const q = tf(p.x, p.y), r = tf(p.x - Math.sin(f.from * Math.PI / 180) * spacing * 0.35, p.y - Math.cos(f.from * Math.PI / 180) * spacing * 0.35);
    ctx.strokeStyle = ink.windTick ?? 'rgba(232,238,246,.28)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(r[0], r[1]); ctx.stroke();
  }
  ctx.restore();
}

/** Puffs (dark) and lulls (pale) as soft streaks along the wind, as you'd see them on the water from aloft. */
export function drawPuffs(ctx: CanvasRenderingContext2D, tf: Tf, cells: { x: number; y: number; r: number; amp: number; age: number; life: number }[],
  dir: { x: number; y: number }, gustiness: number, ink: OverlayInk = {}): void {
  ctx.save();
  for (const c of cells) {
    const env = Math.sin(Math.PI * c.age / c.life), a = c.amp * gustiness * env;
    if (Math.abs(a) < 0.03) continue;
    const p = tf(c.x, c.y), e = tf(c.x + dir.x * c.r * 1.5, c.y + dir.y * c.r * 1.5), s = tf(c.x + dir.y * c.r * 0.75, c.y - dir.x * c.r * 0.75);
    const rx = Math.hypot(e[0] - p[0], e[1] - p[1]), ry = Math.hypot(s[0] - p[0], s[1] - p[1]);
    if (rx < 1.5) continue;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    const col = a > 0 ? `rgba(8,22,40,${Math.min(0.5, a * 1.6)})` : (ink.lull ?? (v => `rgba(190,225,240,${v})`))(Math.min(0.35, -a * 1.4));
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(Math.atan2(e[1] - p[1], e[0] - p[0])); ctx.scale(rx, ry);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}

/**
 * A boat's wind shadow on the map (a training aid): the wake of her sails streaming off along the apparent wind she
 * sails in, out to where it has mostly mixed out (environment/shadows.ts).
 */
export function drawWindShadow(ctx: CanvasRenderingContext2D, tf: Tf, b: { x: number; y: number; h: number; arel: number; awa: number }): void {
  // out to about six mast heights upwind (eight in light air), much the same downwind, where the deficit is mostly gone
  const H = BOAT_WAKE.mast, len = H * 7, d = V(b.h + b.arel + 180), n = { x: d.y, y: -d.x };
  const pts: [number, number][] = [];
  for (let i = 0; i <= 8; i++) { const a = len * i / 8, half = 2 * (0.05 * a + 0.22 * BOAT_WAKE.d0); pts.push(tf(b.x + d.x * a + n.x * half, b.y + d.y * a + n.y * half)); }
  for (let i = 8; i >= 0; i--) { const a = len * i / 8, half = 2 * (0.05 * a + 0.22 * BOAT_WAKE.d0); pts.push(tf(b.x + d.x * a - n.x * half, b.y + d.y * a - n.y * half)); }
  const s0 = tf(b.x, b.y), s1 = tf(b.x + d.x * len, b.y + d.y * len), gr = ctx.createLinearGradient(s0[0], s0[1], s1[0], s1[1]);
  const a0 = b.awa > 120 ? 0.42 : 0.3;
  gr.addColorStop(0, `rgba(10,20,30,${a0})`); gr.addColorStop(1, 'rgba(10,20,30,0)');
  ctx.fillStyle = gr; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
}
