import type { Vec } from '../core/math';
import { onLand } from '../geo/shore';
import { passagePlan, type PassagePlan } from '../sim/navigator';
import { ROUTES } from '../sim/traffic';
import type { SimView } from '../sim/host';
import { briefHtml } from './briefView';
import { $ } from './dom';
import { drawCurrentArrows, drawLand, fitCanvas, makeTf } from './draw2d';

type P = [number, number];

/**
 * The navigator's passage plan, cruising: the route on a north-up chart (her track over the ground leaving now, the
 * current gates, where the wind is strongest, the ship and ferry routes she crosses), and the plan in words below.
 */
export class NavView {
  private world: SimView | null = null;
  private plan: PassagePlan | null = null;
  private canvas = $<HTMLCanvasElement>('navcanvas');

  get isOpen(): boolean { return !$('navView').hidden; }

  open(w: SimView): void {
    this.world = w;
    $('navView').hidden = false;
    if (!w.dest) {
      this.plan = null;
      $('navTitle').textContent = 'No destination';
      $('navSub').textContent = '';
      $('navBrief').innerHTML = '<p class="lede">Choose where you\'re going (Sail to, in the Cruise setup, or tap the chart and Sail here), and the navigator will plan the passage: when to go, the current gates on the way, the slot, the ship and ferry routes, and the hazards.</p>';
      this.draw();
      return;
    }
    $('navTitle').textContent = 'Working out the passage…';
    $('navBrief').innerHTML = '';
    setTimeout(() => { // let the panel paint first: the plan takes a moment
      if (this.world !== w || !this.isOpen) return;
      this.plan = passagePlan(w);
      if (!this.plan) return;
      $('navTitle').textContent = this.plan.title;
      $('navSub').textContent = this.plan.sub;
      $('navBrief').innerHTML = briefHtml(this.plan);
      this.draw();
    }, 30);
  }
  close(): void { $('navView').hidden = true; this.world = null; }
  toggle(w: SimView): void { if (this.isOpen) this.close(); else this.open(w); }

  private draw(): void {
    const w = this.world, [ctx, cw, ch] = fitCanvas(this.canvas);
    ctx.fillStyle = '#0c2534'; ctx.fillRect(0, 0, cw, ch);
    if (!w) return;
    const pl = this.plan, pts: Vec[] = pl ? [...pl.route, ...pl.track.map(q => q.p)] : [{ x: w.user.x - 2500, y: w.user.y - 2000 }, { x: w.user.x + 2500, y: w.user.y + 2000 }];
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const scale = Math.min((cw - 80) / Math.max(600, Math.max(...xs) - Math.min(...xs)), (ch - 80) / Math.max(600, Math.max(...ys) - Math.min(...ys)));
    const tf = makeTf(cx, cy, 0, scale, cw, ch), S = (p: Vec): P => tf(p.x, p.y);
    drawLand(ctx, tf);
    { const half = Math.max(cw, ch) / scale * 0.6; drawCurrentArrows(ctx, tf, p => w.currentAt(p), cx, cy, half, Math.max(150, half / 6), 14, onLand); }
    // the ship and ferry routes, faint
    ctx.setLineDash([3, 6]); ctx.lineWidth = 1.5;
    for (const [id, r] of Object.entries(ROUTES)) {
      if (id === 'coastguard') continue;
      ctx.strokeStyle = id === 'channel' ? 'rgba(255,93,76,.55)' : 'rgba(201,205,212,.35)';
      ctx.beginPath(); r.forEach((p, i) => { const s = S(p); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.stroke();
    }
    ctx.setLineDash([]);
    if (!pl) { // no passage yet: at least show where she is
      const a = S({ x: w.user.x, y: w.user.y });
      ctx.fillStyle = '#ffb627'; ctx.beginPath(); ctx.arc(a[0], a[1], 6, 0, 2 * Math.PI); ctx.fill(); label(ctx, a, 'You', '#ffb627');
    }
    if (pl) {
      // her track leaving now, coloured by time (light early, amber late)
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,182,39,.95)';
      ctx.beginPath(); pl.track.forEach((q, i) => { const s = S(q.p); if (i) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.stroke();
      for (const m of pl.marks) {
        const s = S(m.p), col = m.kind === 'gate' ? '#6fd0ff' : m.kind === 'lane' ? '#ff5d4c' : '#e9f2f5';
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(s[0], s[1], 5, 0, 2 * Math.PI); ctx.fill();
        label(ctx, s, m.label, col);
      }
      const a = S(pl.route[0]), b = S(pl.route[pl.route.length - 1]);
      ctx.fillStyle = '#ffb627'; ctx.beginPath(); ctx.arc(a[0], a[1], 6, 0, 2 * Math.PI); ctx.fill();
      ctx.fillStyle = '#3fd197'; ctx.beginPath(); ctx.arc(b[0], b[1], 7, 0, 2 * Math.PI); ctx.fill();
      label(ctx, a, 'You', '#ffb627'); label(ctx, b, w.dest?.name.replace(/^Off /, '') ?? '', '#3fd197');
    }
    // north arrow and scale
    ctx.strokeStyle = ctx.fillStyle = '#94abb7'; ctx.lineWidth = 1.5; ctx.font = '600 12px "Saira Semi Condensed", sans-serif';
    ctx.beginPath(); ctx.moveTo(cw - 30, 40); ctx.lineTo(cw - 30, 18); ctx.stroke(); ctx.fillText('N', cw - 34, 14);
    const nm = 1852 * scale, k = nm > 160 ? 0.5 : 1;
    ctx.beginPath(); ctx.moveTo(12, ch - 16); ctx.lineTo(12 + nm * k, ch - 16); ctx.stroke(); ctx.fillText(`${k} nm`, 12, ch - 22);
  }
}

function label(ctx: CanvasRenderingContext2D, p: P, text: string, color: string): void {
  ctx.save(); ctx.font = '600 12px "Saira Semi Condensed", sans-serif';
  const w = ctx.measureText(text).width + 8, cw = ctx.canvas.clientWidth || 600, x = p[0] + 9 + w > cw - 4 ? p[0] - 9 - w + 4 : p[0] + 9, y = p[1] - 8;
  ctx.fillStyle = 'rgba(9,22,33,.85)'; ctx.beginPath(); ctx.roundRect(x - 4, y - 12, w, 16, 4); ctx.fill();
  ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.restore();
}
