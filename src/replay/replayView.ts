import { D2R, LOA } from '../core/math';
import type { World } from '../sim/world';
import { drawCourse, drawHull, drawLand, hexA, makeTf } from '../ui/draw2d';
import type { Frame } from './recorder';

export interface ReplayClip { frames: Frame[]; ia: number; ib: number; wind: number }

/** Overhead, wind-up replay of an incident between boats ia and ib, played at 1.5× (15 frames/s of 0.1 s frames). */
export class ReplayView {
  private anim = 0;
  constructor(private cv: HTMLCanvasElement) {}

  stop(): void { cancelAnimationFrame(this.anim); }

  play(w: World, D: ReplayClip): void {
    this.stop();
    const cv = this.cv, dpr = Math.min(2, devicePixelRatio || 1);
    const wpx = cv.clientWidth || 500, hpx = cv.clientHeight || 300;
    cv.width = wpx * dpr; cv.height = hpx * dpr;
    const ctx = cv.getContext('2d')!;
    const F = D.frames, last = F[F.length - 1], a = last.b[D.ia], b = last.b[D.ib];
    const scale = Math.min(wpx, hpx) / 70, W = D.wind;
    const tfn = makeTf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, W, scale, wpx, hpx);
    const tf = (p: readonly unknown[]) => tfn(p[0] as number, p[1] as number);
    const t0 = performance.now();
    const draw = () => {
      const k = Math.min(F.length - 1, Math.floor((performance.now() - t0) / 1000 * 15));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0c2534'; ctx.fillRect(0, 0, wpx, hpx);
      // boat-length grid
      ctx.strokeStyle = 'rgba(150,196,218,.08)'; ctx.lineWidth = 1;
      for (let gx = (wpx / 2) % (LOA * scale); gx < wpx; gx += LOA * scale) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, hpx); ctx.stroke(); }
      for (let gy = (hpx / 2) % (LOA * scale); gy < hpx; gy += LOA * scale) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(wpx, gy); ctx.stroke(); }
      drawLand(ctx, tfn);
      drawCourse(ctx, w.C, !!w.settings.aids, tfn, scale, -1);
      w.boats.forEach((bt, i) => {
        const focus = i === D.ia || i === D.ib;
        ctx.strokeStyle = focus ? hexA(bt.color, .55) : 'rgba(200,210,220,.12)'; ctx.lineWidth = focus ? 2 : 1;
        ctx.beginPath();
        for (let f = 0; f <= k; f++) { const p = tf(F[f].b[i]); f ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
        ctx.stroke();
        if (focus) for (let f = 0; f <= k; f += 10) { const p = F[f].b[i]; drawHull(ctx, tf(p), p[2] - W, p[4], scale, hexA(bt.color, .22), null); }
        const p = F[k].b[i];
        drawHull(ctx, tf(p), p[2] - W, p[4], scale, focus ? bt.color : 'rgba(200,210,220,.35)', focus ? (bt.isUser ? 'You' : bt.name) + ' · ' + p[3] : null);
      });
      ctx.fillStyle = '#e9f2f5'; ctx.font = '600 12px "Saira Semi Condensed", sans-serif';
      ctx.fillText('WIND', 12, 18);
      ctx.strokeStyle = '#e9f2f5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(26, 26); ctx.lineTo(26, 52); ctx.moveTo(20, 45); ctx.lineTo(26, 53); ctx.lineTo(32, 45); ctx.stroke();
      if (w.cur.kt > 0) {
        const cb = (w.cur.set - W) * D2R; ctx.strokeStyle = '#6fd0ff'; ctx.fillStyle = '#6fd0ff';
        ctx.fillText(w.cur.label.toUpperCase(), 12, hpx - 12);
        const ox = 130, oy = hpx - 16; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + Math.sin(cb) * 18, oy - Math.cos(cb) * 18); ctx.stroke();
      }
      ctx.fillStyle = '#94abb7'; ctx.textAlign = 'right';
      ctx.fillText((F[k].t - last.t).toFixed(1) + ' s', wpx - 12, 18); ctx.textAlign = 'left';
      if (k >= F.length - 1) {
        const ca = tf(a), cb2 = tf(b);
        ctx.strokeStyle = '#ff5d4c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc((ca[0] + cb2[0]) / 2, (ca[1] + cb2[1]) / 2, 22, 0, 6.29); ctx.stroke();
        return;
      }
      this.anim = requestAnimationFrame(draw);
    };
    draw();
  }
}
