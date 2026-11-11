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
/** A visibility as a sailor says it; at the source's cap, "or more" (NWS: 10 statute miles; Pier 17: 10 km). */
export const nm = (m: number, cap = Infinity) => m >= cap - 10 ? `${(cap / 1852).toFixed(1)}+ nm` : m < 185 ? `${Math.round(m / 10) * 10} m` : `${(m / 1852).toFixed(m < 1852 * 2 ? 1 : 0)} nm`;
/** How thick to draw fog the forecast names but doesn't measure, by NWS's own words (a veil, not a measurement). */
export function wordsStrength(w: string): number {
  if (!w) return 0;
  if (/slight chance|patchy|isolated|few|brief/.test(w)) return 1;
  if (/chance|areas|scattered|occasional|intermittent|periods/.test(w)) return 2;
  if (/likely|widespread|numerous|frequent/.test(w)) return 3;
  return 4; // fog, with no qualifier: definite
}

/**
 * Fog. The forecast's visibility: a grey veil cell by cell, only over its own grid. Beyond its ~day: a veil where the
 * forecast names fog, by its words. A past day's one sensor: the veil round that spot only, with its reading.
 */
export function drawFog(ctx: CanvasRenderingContext2D, tf: Tf, v: Visibility, ctr: Vec, half: number, I: Ink, labels: boolean): void {
  ctx.save();
  const cells = (alpha: (q: Vec) => number) => {
    const sp = Math.max(150, half / 9), x0 = Math.floor((ctr.x - half) / sp) * sp, y0 = Math.floor((ctr.y - half) / sp) * sp;
    for (let x = x0; x <= ctr.x + half; x += sp) for (let y = y0; y <= ctr.y + half; y += sp) {
      const a = alpha({ x: x + sp / 2, y: y + sp / 2 }); if (!(a > 0.02)) continue;
      const p = [tf(x, y), tf(x + sp, y), tf(x + sp, y + sp), tf(x, y + sp)];
      ctx.fillStyle = I.fog(a); ctx.beginPath(); p.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.fill();
    }
  };
  ctx.font = '600 10px "Saira Semi Condensed", sans-serif'; ctx.fillStyle = I.fogText;
  if (v.source === 'outlook') {
    cells(q => { const w = v.words!(q); return w ? 0.09 * wordsStrength(w) : 0; });
    if (labels) { ctx.textAlign = 'center'; for (const c of v.points) { const s = tf(c.p.x, c.p.y); ctx.fillText(c.words!, s[0], s[1]); } }
  } else if (v.source === 'forecast') {
    cells(q => { const m = v.at(q); return Number.isFinite(m) ? murk(m) : 0; });
    if (labels) { ctx.textAlign = 'center'; for (const c of v.points) { const s = tf(c.p.x, c.p.y); if (c.m < v.cap - 10) ctx.fillText(`vis ${nm(c.m, v.cap)}`, s[0], s[1]); } }
  } else {
    // one sensor: its reading round its own spot (a kilometre or so), not over the whole Bay
    const c = v.points[0], s = tf(c.p.x, c.p.y), e = tf(c.p.x + 1200, c.p.y), r = Math.hypot(e[0] - s[0], e[1] - s[1]), a = murk(c.m);
    if (a > 0.02) { const gr = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], r); gr.addColorStop(0, I.fog(a)); gr.addColorStop(1, I.fog(0)); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, 6.29); ctx.fill(); }
    ctx.strokeStyle = I.fogText; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(s[0], s[1], 5, 0, 6.29); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = I.fogText; ctx.fillText(labels ? `Pier 17: visibility ${nm(c.m, v.cap)}` : nm(c.m, v.cap), s[0] + 8, s[1] + 4);
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
