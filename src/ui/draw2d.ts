import { D2R, HALF, ZONE } from '../core/math';
import { LAND } from '../geo/shore';
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

export function drawLand(ctx: CanvasRenderingContext2D, tf: Tf): void {
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
