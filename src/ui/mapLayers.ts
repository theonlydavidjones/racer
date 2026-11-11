import { clamp, type Vec } from '../core/math';
import type { Tf } from './draw2d';
import type { Ink } from './encChart';
import type { Visibility } from '../environment/weather';
import type { SeaHere } from '../environment/sea';

/*
 * The map's condition layers that aren't drawn elsewhere: the sea state (the sim's own waves) and the fog (real
 * visibility only: the NWS forecast grid, or NOAA's Pier 17 sensor on a past day).
 */

/** How murky to draw a visibility: nothing at 10 km and over, thickening as it closes in (a veil, not a measurement). */
const murk = (m: number) => clamp(Math.log(10000 / Math.max(50, m)) / Math.log(40), 0, 1) * 0.5;
/** The NWS's words for how widely fog is forecast. */
export const COVER = ['', 'patchy fog', 'areas of fog', 'widespread fog', 'fog'];
export const nm = (m: number) => m >= 9950 ? '5.4+ nm' : m < 185 ? `${Math.round(m)} m` : `${(m / 1852).toFixed(m < 1852 * 2 ? 1 : 0)} nm`;

/** Fog: a grey veil by the visibility, cell by cell; where it's one sensor's reading, the same veil everywhere and its spot marked. */
export function drawFog(ctx: CanvasRenderingContext2D, tf: Tf, v: Visibility, ctr: Vec, half: number, I: Ink, labels: boolean): void {
  ctx.save();
  if (v.source === 'outlook') { // fog forecast, no figure: a veil by how widely it's expected, in the forecast's own 2.5 km cells
    const sp = Math.max(150, half / 9), x0 = Math.floor((ctr.x - half) / sp) * sp, y0 = Math.floor((ctr.y - half) / sp) * sp;
    for (let x = x0; x <= ctr.x + half; x += sp) for (let y = y0; y <= ctr.y + half; y += sp) {
      const c = v.cover!({ x: x + sp / 2, y: y + sp / 2 }); if (!c) continue;
      const p = [tf(x, y), tf(x + sp, y), tf(x + sp, y + sp), tf(x, y + sp)];
      ctx.fillStyle = I.fog(0.1 * c); ctx.beginPath(); p.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.fill();
    }
    if (labels) { ctx.font = '600 10px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = I.fogText;
      for (const c of v.points) if (c.fog) { const s = tf(c.p.x, c.p.y); ctx.fillText(COVER[c.fog], s[0], s[1]); } }
  } else if (v.source === 'forecast') {
    const sp = Math.max(150, half / 9), x0 = Math.floor((ctr.x - half) / sp) * sp, y0 = Math.floor((ctr.y - half) / sp) * sp;
    for (let x = x0; x <= ctr.x + half; x += sp) for (let y = y0; y <= ctr.y + half; y += sp) {
      const a = murk(v.at({ x: x + sp / 2, y: y + sp / 2 })); if (a < 0.02) continue;
      const p = [tf(x, y), tf(x + sp, y), tf(x + sp, y + sp), tf(x, y + sp)];
      ctx.fillStyle = I.fog(a); ctx.beginPath(); p.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.fill();
    }
    if (labels) { // the forecast's own numbers, at its cells
      ctx.font = '600 10px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = I.fogText;
      for (const c of v.points) { const s = tf(c.p.x, c.p.y); if (c.m < 9950) ctx.fillText(`vis ${nm(c.m)}`, s[0], s[1]); }
    }
  } else {
    const m = v.points[0].m, a = murk(m);
    if (a > 0.02) { ctx.fillStyle = I.fog(a); ctx.fillRect(-1e4, -1e4, 3e4, 3e4); }
    const s = tf(v.points[0].p.x, v.points[0].p.y);
    ctx.strokeStyle = I.fogText; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(s[0], s[1], 5, 0, 6.29); ctx.stroke();
    if (labels) { ctx.font = '600 10px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = I.fogText; ctx.fillText(`Pier 17 visibility ${nm(m)}`, s[0] + 8, s[1] + 4); }
  }
  ctx.restore();
}

/** Sea state: the significant height of the chop and swell together, tinted cell by cell, with the height in metres. */
export function drawSea(ctx: CanvasRenderingContext2D, tf: Tf, at: (p: Vec) => SeaHere | null, ctr: Vec, half: number, I: Ink, labels: boolean): void {
  ctx.save();
  const sp = Math.max(200, half / 6), x0 = Math.floor((ctr.x - half) / sp) * sp, y0 = Math.floor((ctr.y - half) / sp) * sp;
  ctx.font = '600 9px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let x = x0; x <= ctr.x + half; x += sp) for (let y = y0; y <= ctr.y + half; y += sp) {
    const c = { x: x + sp / 2, y: y + sp / 2 }, s = at(c); if (!s) continue;
    const hs = Math.hypot(s.hsW, s.hsS); // (the two together: heights add as energy)
    const p = [tf(x, y), tf(x + sp, y), tf(x + sp, y + sp), tf(x, y + sp)];
    ctx.fillStyle = I.sea(clamp(hs / 2, 0, 1) * 0.35 + (hs > 0.05 ? 0.04 : 0));
    ctx.beginPath(); p.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.fill();
    const cs = tf(c.x, c.y), px = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]);
    if (labels && px > 34 && hs > 0.05) { ctx.fillStyle = I.seaText; ctx.fillText(`${hs.toFixed(1)} m${s.white > 0.01 ? ' ˜' : ''}`, cs[0], cs[1]); }
  }
  ctx.restore();
}
