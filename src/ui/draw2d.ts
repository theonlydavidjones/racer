import { D2R, HALF, ZONE } from '../core/math';
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

export function drawCourse(ctx: CanvasRenderingContext2D, C: Course, aids: boolean, tf: Tf, scale: number, highlight: number): void {
  const p1 = tf(C.pin.x, C.pin.y), p2 = tf(C.committee.x, C.committee.y);
  ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,216,74,.75)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke(); ctx.setLineDash([]);
  const seen = new Set<string>();
  C.marks.forEach((m, i) => {
    const s = tf(m.p.x, m.p.y), key = m.name;
    const hi = highlight === i;
    if (m.type === 'round' && aids) { ctx.strokeStyle = hi ? 'rgba(255,216,74,.6)' : 'rgba(255,216,74,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(s[0], s[1], Math.max(2, ZONE * scale), 0, 6.29); ctx.stroke(); }
    if (seen.has(key) && !hi) return; seen.add(key);
    ctx.fillStyle = hi ? '#ffb627' : (m.type === 'pass' ? '#c9b25a' : '#ffc21a');
    ctx.beginPath(); ctx.arc(s[0], s[1], hi ? 4 : 3, 0, 6.29); ctx.fill();
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
  cx: number, cy: number, half: number, spacing: number, pxPerKt: number, onLand: (p: { x: number; y: number }) => boolean): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(111,208,255,.55)'; ctx.fillStyle = 'rgba(111,208,255,.55)'; ctx.lineWidth = 1.2;
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

/** Puffs (dark) and lulls (pale) as soft streaks along the wind, as you'd see them on the water from aloft. */
export function drawPuffs(ctx: CanvasRenderingContext2D, tf: Tf, cells: { x: number; y: number; r: number; amp: number; age: number; life: number }[],
  dir: { x: number; y: number }, gustiness: number): void {
  ctx.save();
  for (const c of cells) {
    const env = Math.sin(Math.PI * c.age / c.life), a = c.amp * gustiness * env;
    if (Math.abs(a) < 0.03) continue;
    const p = tf(c.x, c.y), e = tf(c.x + dir.x * c.r * 1.5, c.y + dir.y * c.r * 1.5), s = tf(c.x + dir.y * c.r * 0.75, c.y - dir.x * c.r * 0.75);
    const rx = Math.hypot(e[0] - p[0], e[1] - p[1]), ry = Math.hypot(s[0] - p[0], s[1] - p[1]);
    if (rx < 1.5) continue;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    const col = a > 0 ? `rgba(8,22,40,${Math.min(0.5, a * 1.6)})` : `rgba(190,225,240,${Math.min(0.35, -a * 1.4)})`;
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(Math.atan2(e[1] - p[1], e[0] - p[0])); ctx.scale(rx, ry);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}
