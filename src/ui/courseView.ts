import { D2R, ZONE, type Vec } from '../core/math';
import type { CourseMark } from '../courses/course';
import { laylinesFor } from '../sim/laylines';
import type { World } from '../sim/world';
import { $ } from './dom';
import { drawLand, drawLaylines, fitCanvas, makeTf, type Tf } from './draw2d';

type P = [number, number];
const sideName = (s: 's' | 'p') => (s === 's' ? 'starboard' : 'port');
const short = (name: string) => name.split(' ')[0];
const COL = { s: '#3fd197', p: '#ff5d4c', path: 'rgba(233,242,245,.9)', dim: 'rgba(233,242,245,.14)', mark: '#ffc21a', pass: '#d9c05a', line: 'rgba(255,216,74,.9)' };

/** Plain-language description of each leg, for the list beside the map. */
export function legDescriptions(w: World): string[] {
  const C = w.C, out: string[] = [];
  C.marks.forEach((m, i) => {
    const from = i === 0 ? 'Start' : short(C.marks[i - 1].name);
    const kind = m.leg === 'beat' ? 'beat (upwind)' : m.leg === 'run' ? 'run (downwind)' : 'reach';
    out.push(m.type === 'pass'
      ? `${from} → ${m.name}: ${kind}. Pass ${m.name} leaving it to ${sideName(m.side)}. Don't round it.`
      : `${from} → ${m.name}: ${kind}. Round ${m.name} leaving it to ${sideName(m.side)} (${m.side === 's' ? 'clockwise' : 'counter-clockwise'}).`);
  });
  const last = C.marks[C.marks.length - 1];
  out.push(`${short(last.name)} → Finish: cross the line between ${C.committeeLabel} and ${C.pinLabel}.`);
  return out;
}

/** Where each leg starts and ends (start/finish legs use the middle of the line). */
function legEnds(w: World, i: number): [Vec, Vec] {
  const C = w.C, n = C.marks.length;
  const a = i === 0 ? C.center : C.marks[i - 1].p, b = i < n ? C.marks[i].p : C.center;
  return [a, b];
}

/**
 * Course map you can work with: drag to move, scroll or pinch to zoom, step through the legs one at a
 * time (the rest fade back), or see the whole course. Shows which way round each mark goes, pass sides,
 * the start/finish line, zones, laylines, wind, current and the boats. Wind is always up.
 */
export class CourseView {
  private timer = 0;
  private world: World | null = null;
  private view = { cx: 0, cy: 0, scale: 1 }; // world point at the canvas centre, pixels per metre
  private focus: number | null = 0; // leg index, or null for the whole course
  private pointers = new Map<number, P>();
  private pinch: { d: number; scale: number } | null = null;
  private size: P = [600, 400];
  private canvas = $<HTMLCanvasElement>('cvcanvas');

  constructor() {
    const cv = this.canvas;
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture?.(e.pointerId); this.pointers.set(e.pointerId, [e.offsetX, e.offsetY]); this.pinch = null; });
    cv.addEventListener('pointermove', e => {
      const prev = this.pointers.get(e.pointerId); if (!prev) return;
      const cur: P = [e.offsetX, e.offsetY];
      if (this.pointers.size === 1) this.panBy(cur[0] - prev[0], cur[1] - prev[1]);
      this.pointers.set(e.pointerId, cur);
      if (this.pointers.size === 2) {
        const [p1, p2] = [...this.pointers.values()], d = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
        if (!this.pinch) this.pinch = { d, scale: this.view.scale };
        else this.zoomAt((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, this.pinch.scale * d / this.pinch.d / this.view.scale);
      }
      this.draw();
    });
    const up = (e: PointerEvent) => { this.pointers.delete(e.pointerId); this.pinch = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); this.draw(); }, { passive: false });
    cv.addEventListener('dblclick', () => this.setFocus(this.focus));
    $('bCvIn').onclick = () => { this.zoomAt(this.size[0] / 2, this.size[1] / 2, 1.5); this.draw(); };
    $('bCvOut').onclick = () => { this.zoomAt(this.size[0] / 2, this.size[1] / 2, 1 / 1.5); this.draw(); };
    $('bCvPrev').onclick = () => this.step(-1);
    $('bCvNext').onclick = () => this.step(1);
    $('bCvAll').onclick = () => this.setFocus(null);
    $('cvLegs').addEventListener('click', e => {
      const li = (e.target as HTMLElement).closest('li'); if (!li) return;
      this.setFocus(Number(li.dataset.i));
    });
  }

  get isOpen(): boolean { return !$('courseView').hidden; }

  open(w: World): void {
    this.world = w;
    $('courseView').hidden = false;
    $('cvTitle').textContent = w.C.title;
    $('cvEyebrow').textContent = w.t < 0 && !w.running ? 'Course preview' : 'Course';
    $('cvNotes').textContent = w.C.notes;
    const u = w.user;
    this.setFocus(u.started ? Math.min(u.leg, w.C.marks.length) : 0);
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.draw(), 250); // live while racing
  }
  close(): void { $('courseView').hidden = true; clearInterval(this.timer); this.world = null; }
  toggle(w: World): void { if (this.isOpen) this.close(); else this.open(w); }

  private legCount(): number { return (this.world?.C.marks.length ?? 0) + 1; }
  private step(d: number): void {
    const n = this.legCount();
    this.setFocus(this.focus == null ? (d > 0 ? 0 : n - 1) : (this.focus + d + n) % n);
  }

  /** Focus one leg (or the whole course) and fit the view to it. */
  setFocus(i: number | null): void {
    const w = this.world; if (!w) return;
    this.focus = i;
    const pts: Vec[] = i == null ? [w.C.pin, w.C.committee, ...w.C.marks.map(m => m.p)] : legEnds(w, i);
    this.measure();
    this.fit(pts, i == null ? 60 : 90);
    const legs = legDescriptions(w);
    $('cvLeg').innerHTML = i == null ? '<b>ALL LEGS</b>The whole course' : `<b>LEG ${i + 1} OF ${legs.length}</b>${legs[i]}`;
    this.draw();
  }

  private measure(): void { this.size = [this.canvas.clientWidth || 600, this.canvas.clientHeight || 400]; }

  private fit(pts: Vec[], pad: number): void {
    const w = this.world!, W = w.C.base * D2R, [cw, ch] = this.size;
    // rotate into the wind-up frame to find the extent
    const r = pts.map(p => ({ x: p.x * Math.cos(W) - p.y * Math.sin(W), y: p.x * Math.sin(W) + p.y * Math.cos(W) }));
    const xs = r.map(p => p.x), ys = r.map(p => p.y);
    const spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys);
    this.view.scale = Math.min((cw - 2 * pad) / Math.max(spanX, 60), (ch - 2 * pad) / Math.max(spanY, 60));
    this.view.cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    this.view.cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    // centre on the extent rather than the mean
    const mx = (Math.max(...xs) + Math.min(...xs)) / 2, my = (Math.max(...ys) + Math.min(...ys)) / 2;
    this.view.cx = mx * Math.cos(W) + my * Math.sin(W); this.view.cy = -mx * Math.sin(W) + my * Math.cos(W);
  }

  /** Screen displacement (pixels) → world displacement (metres), wind-up map. */
  private toWorld(dx: number, dy: number): Vec {
    const W = (this.world?.C.base ?? 0) * D2R, s = this.view.scale;
    const b = Math.atan2(dx, -dy) + W, r = Math.hypot(dx, dy) / s;
    return { x: Math.sin(b) * r, y: Math.cos(b) * r };
  }
  private panBy(dx: number, dy: number): void { const d = this.toWorld(dx, dy); this.view.cx -= d.x; this.view.cy -= d.y; }
  private zoomAt(sx: number, sy: number, k: number): void {
    const [cw, ch] = this.size, before = this.toWorld(sx - cw / 2, sy - ch / 2);
    this.view.scale = Math.min(40, Math.max(0.02, this.view.scale * k));
    const after = this.toWorld(sx - cw / 2, sy - ch / 2);
    this.view.cx += before.x - after.x; this.view.cy += before.y - after.y;
  }

  private draw(): void {
    const w = this.world; if (!w) return;
    const C = w.C, u = w.user, W = C.base;
    const [ctx, cw, ch] = fitCanvas(this.canvas); this.size = [cw, ch];
    const tf: Tf = makeTf(this.view.cx, this.view.cy, W, this.view.scale, cw, ch);
    const S = (p: Vec): P => tf(p.x, p.y);
    const n = C.marks.length, focus = this.focus;
    const shown = (i: number) => focus == null || i === focus;

    ctx.fillStyle = '#0c2534'; ctx.fillRect(0, 0, cw, ch);
    drawLand(ctx, tf);

    // start/finish line
    const pin = S(C.pin), com = S(C.committee), lc = S(C.center);
    const lineLeg = focus == null || focus === 0 || focus === n;
    ctx.setLineDash([6, 5]); ctx.strokeStyle = lineLeg ? COL.line : 'rgba(255,216,74,.3)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pin[0], pin[1]); ctx.lineTo(com[0], com[1]); ctx.stroke(); ctx.setLineDash([]);
    pill(ctx, com, C.committeeLabel, '#ffd84a', lineLeg ? 1 : 0.4);
    if (C.pinKind !== 'mark') pill(ctx, pin, C.pinLabel, '#ffd84a', lineLeg ? 1 : 0.4);

    // zones (three boat lengths), to scale
    if (w.settings.aids) for (const m of C.marks) if (m.type === 'round') {
      const c = S(m.p), r = ZONE * this.view.scale;
      if (r > 4) { ctx.strokeStyle = 'rgba(255,216,74,.28)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 2 * Math.PI); ctx.stroke(); }
    }

    // legs: path from the last mark (or the line) round or past each mark
    const visits: Record<string, number> = {};
    const legs: { a: P; b: P }[] = [];
    let prevExit: P = lc;
    const arcs: (() => void)[] = [];
    C.marks.forEach((m, i) => {
      const k = visits[m.key] = (visits[m.key] ?? -1) + 1;
      const r = 16 + k * 8; // later visits to the same mark go a little wider
      const M = S(m.p), Pn = i === 0 ? lc : S(C.marks[i - 1].p), Nx = i === n - 1 ? lc : S(C.marks[i + 1].p);
      const din = unit2(sub2(M, Pn)), dout = unit2(sub2(Nx, M));
      // In canvas coordinates (y down), "left of travel" is (d.y, −d.x). Leaving a mark to starboard puts
      // the boat on the left of it, turning clockwise.
      const nIn: P = m.side === 's' ? [din[1], -din[0]] : [-din[1], din[0]];
      const nOut: P = m.side === 's' ? [dout[1], -dout[0]] : [-dout[1], dout[0]];
      const entry: P = [M[0] + nIn[0] * r, M[1] + nIn[1] * r];
      const exit: P = m.type === 'pass' ? entry : [M[0] + nOut[0] * r, M[1] + nOut[1] * r];
      legs.push({ a: prevExit, b: entry });
      const on = shown(i) || shown(i + 1);
      arcs.push(() => {
        const col = m.side === 's' ? COL.s : COL.p;
        ctx.globalAlpha = on ? 1 : 0.2; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = on ? 3 : 2;
        if (m.type === 'round') {
          const a0 = Math.atan2(nIn[1], nIn[0]), a1 = Math.atan2(nOut[1], nOut[0]);
          let span = m.side === 's' ? a1 - a0 : a0 - a1;
          while (span <= 0.15) span += 2 * Math.PI;
          const end = m.side === 's' ? a0 + span : a0 - span;
          ctx.beginPath(); ctx.arc(M[0], M[1], r, a0, end, m.side === 'p'); ctx.stroke();
          const tang: P = m.side === 's' ? [-Math.sin(end), Math.cos(end)] : [Math.sin(end), -Math.cos(end)];
          arrowHead(ctx, [M[0] + Math.cos(end) * r, M[1] + Math.sin(end) * r], tang, 10);
        } else {
          const a: P = [entry[0] - din[0] * 16, entry[1] - din[1] * 16], b: P = [entry[0] + din[0] * 16, entry[1] + din[1] * 16];
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); arrowHead(ctx, b, din, 9);
        }
        ctx.globalAlpha = 1;
      });
      prevExit = exit;
    });
    legs.push({ a: prevExit, b: lc });
    const cur = u.started ? u.leg : 0;
    legs.forEach((L, i) => {
      const on = shown(i), d = unit2(sub2(L.b, L.a));
      ctx.strokeStyle = !on ? COL.dim : i === cur && !u.finished ? 'rgba(255,182,39,.95)' : COL.path;
      ctx.lineWidth = on ? 2.5 : 1.5; ctx.setLineDash(on ? [] : [6, 6]);
      ctx.beginPath(); ctx.moveTo(L.a[0], L.a[1]); ctx.lineTo(L.b[0], L.b[1]); ctx.stroke(); ctx.setLineDash([]);
      if (!on) return;
      // arrows along the leg, and its number
      ctx.fillStyle = ctx.strokeStyle;
      for (const f of [0.35, 0.7]) arrowHead(ctx, [L.a[0] + (L.b[0] - L.a[0]) * f, L.a[1] + (L.b[1] - L.a[1]) * f], d, 9);
      const mid: P = [(L.a[0] + L.b[0]) / 2, (L.a[1] + L.b[1]) / 2], nrm: P = [-d[1], d[0]];
      badge(ctx, [mid[0] + nrm[0] * 18, mid[1] + nrm[1] * 18], String(i + 1), i === cur);
    });
    arcs.forEach(f => f());

    // marks, with readable labels
    const seen = new Set<string>();
    C.marks.forEach((m, i) => {
      if (seen.has(m.key)) return; seen.add(m.key);
      const on = C.marks.some((mm, j) => mm.key === m.key && (shown(j) || shown(j + 1)));
      const c = S(m.p);
      ctx.globalAlpha = on ? 1 : 0.45;
      ctx.fillStyle = m.type === 'pass' ? COL.pass : COL.mark; ctx.strokeStyle = '#0c2534'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c[0], c[1], 7, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
      pill(ctx, [c[0] + 12, c[1] + 14], m.type === 'pass' ? `${m.name} (pass)` : m.name, '#e9f2f5', on ? 1 : 0.45, true);
      void i;
    });

    // laylines to the user's next mark
    if (w.settings.aids) drawLaylines(ctx, tf, laylinesFor(w, u), 3000, 1.5);

    // boats
    for (const b of w.boats) {
      const p = S(b), s = b.isUser ? 7 : 5;
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate((b.h - W) * D2R);
      ctx.fillStyle = b.color; ctx.beginPath(); ctx.moveTo(0, -s * 1.6); ctx.lineTo(s * 0.8, s); ctx.lineTo(-s * 0.8, s); ctx.closePath(); ctx.fill();
      if (b.isUser) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.restore();
    }
    pill(ctx, S(u), 'You', '#ffb627', 1, true, [10, -12]);

    // wind, current, north, scale
    ctx.fillStyle = '#e9f2f5'; ctx.strokeStyle = '#e9f2f5'; ctx.font = '600 12px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`WIND ${String(Math.round(w.wind.from)).padStart(3, '0')}° ${w.wind.kt.toFixed(0)} KT`, 12, 20);
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(28, 28); ctx.lineTo(28, 52); ctx.stroke(); arrowHead(ctx, [28, 55], [0, 1], 8);
    if (w.cur.kt > 0) {
      const cb = (w.cur.set - W) * D2R, ox = cw - 34, oy = 66;
      ctx.strokeStyle = ctx.fillStyle = '#6fd0ff';
      const tip: P = [ox + Math.sin(cb) * 14, oy - Math.cos(cb) * 14];
      ctx.beginPath(); ctx.moveTo(ox - Math.sin(cb) * 14, oy + Math.cos(cb) * 14); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      arrowHead(ctx, tip, [Math.sin(cb), -Math.cos(cb)], 7);
      ctx.textAlign = 'right'; ctx.fillText(w.cur.label.toUpperCase(), cw - 12, oy + 32); ctx.textAlign = 'left';
    }
    const nb = -W * D2R, nx = cw - 34, ny = 22;
    ctx.strokeStyle = ctx.fillStyle = '#94abb7'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(nx - Math.sin(nb) * 10, ny + Math.cos(nb) * 10); ctx.lineTo(nx + Math.sin(nb) * 10, ny - Math.cos(nb) * 10); ctx.stroke();
    arrowHead(ctx, [nx + Math.sin(nb) * 10, ny - Math.cos(nb) * 10], [Math.sin(nb), -Math.cos(nb)], 6);
    ctx.fillText('N', nx + 14, ny + 4);
    // scale bar in boat lengths / metres
    const steps = [10, 25, 50, 100, 250, 500, 1000], target = 90 / this.view.scale, m = steps.find(s => s >= target) ?? 1000, px = m * this.view.scale;
    ctx.strokeStyle = ctx.fillStyle = '#94abb7'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(12, ch - 30); ctx.lineTo(12 + px, ch - 30); ctx.stroke();
    ctx.fillText(m >= 1000 ? `${m / 1000} km` : `${m} m`, 12, ch - 36);

    // leg list
    const legsTxt = legDescriptions(w);
    $('cvLegs').innerHTML = legsTxt.map((t, i) =>
      `<li data-i="${i}" class="${focus === i ? 'focus ' : ''}${u.started && i < cur ? 'done' : i === cur && !u.finished ? 'now' : ''}">${t}</li>`).join('');
  }
}

const sub2 = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const unit2 = (a: P): P => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

function arrowHead(ctx: CanvasRenderingContext2D, tip: P, dir: P, size: number): void {
  const [dx, dy] = unit2(dir), bx = tip[0] - dx * size, by = tip[1] - dy * size;
  ctx.beginPath(); ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(bx - dy * size * 0.55, by + dx * size * 0.55); ctx.lineTo(bx + dy * size * 0.55, by - dx * size * 0.55);
  ctx.closePath(); ctx.fill();
}
/** A label on a dark pill so it stays readable over lines and land. */
function pill(ctx: CanvasRenderingContext2D, p: P, text: string, color: string, alpha = 1, bold = false, off: P = [10, -10]): void {
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.font = `${bold ? 700 : 600} 13px "Saira Semi Condensed", sans-serif`;
  const w = ctx.measureText(text).width + 10, x = p[0] + off[0], y = p[1] + off[1];
  ctx.fillStyle = 'rgba(9,22,33,.85)'; ctx.beginPath(); ctx.roundRect(x - 5, y - 13, w, 18, 4); ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.fillText(text, x, y);
  ctx.restore();
}
function badge(ctx: CanvasRenderingContext2D, p: P, text: string, hi: boolean): void {
  ctx.fillStyle = hi ? '#ffb627' : 'rgba(9,22,33,.95)'; ctx.strokeStyle = hi ? '#ffb627' : 'rgba(233,242,245,.7)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  ctx.fillStyle = hi ? '#1a1205' : '#e9f2f5'; ctx.font = '700 12px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(text, p[0], p[1] + 4); ctx.textAlign = 'left';
}
export type { CourseMark };
