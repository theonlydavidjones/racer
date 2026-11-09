import { D2R, ZONE, type Vec } from '../core/math';
import { laylinesFor } from '../sim/laylines';
import type { World } from '../sim/world';
import { $ } from './dom';
import { drawLand, drawLaylines, fitCanvas, makeTf, type Tf } from './draw2d';

type P = [number, number];
const sideName = (s: 's' | 'p') => (s === 's' ? 'starboard' : 'port');
const COL = { s: '#3fd197', p: '#ff5d4c', path: 'rgba(233,242,245,.85)', mark: '#ffc21a', line: 'rgba(255,216,74,.85)' };

/** Plain-language description of each leg, for the list beside the map. */
export function legDescriptions(w: World): string[] {
  const C = w.C, out: string[] = [];
  C.marks.forEach((m, i) => {
    const from = i === 0 ? 'Start' : C.marks[i - 1].name.split(' ')[0];
    const kind = m.leg === 'beat' ? 'beat (upwind)' : m.leg === 'run' ? 'run (downwind)' : 'reach';
    out.push(m.type === 'pass'
      ? `${from} → ${m.name}: ${kind}. Pass ${m.name} leaving it to ${sideName(m.side)}. Don't round it.`
      : `${from} → ${m.name}: ${kind}. Round ${m.name} leaving it to ${sideName(m.side)} (${m.side === 's' ? 'clockwise' : 'counter-clockwise'}).`);
  });
  const last = C.marks[C.marks.length - 1];
  out.push(`${last.name.split(' ')[0]} → Finish: cross the line between ${C.committeeLabel} and ${C.pinLabel}.`);
  return out;
}

/** Full-screen course map: every leg, which way round each mark, the start/finish line, laylines, wind and current. */
export class CourseView {
  private timer = 0;
  private world: World | null = null;
  get isOpen(): boolean { return !$('courseView').hidden; }

  open(w: World): void {
    this.world = w;
    $('courseView').hidden = false;
    $('cvTitle').textContent = w.C.title;
    $('cvEyebrow').textContent = w.t < 0 && !w.running ? 'Course preview' : 'Course';
    $('cvNotes').textContent = w.C.notes;
    this.draw();
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.draw(), 250); // live while racing
  }
  close(): void { $('courseView').hidden = true; clearInterval(this.timer); this.world = null; }
  toggle(w: World): void { if (this.isOpen) this.close(); else this.open(w); }

  private draw(): void {
    const w = this.world; if (!w) return;
    const C = w.C, u = w.user;
    const [ctx, cw, ch] = fitCanvas($<HTMLCanvasElement>('cvcanvas'));
    // wind up, fitted to the marks and the line
    const W = C.base, pts = [C.pin, C.committee, ...C.marks.map(m => m.p)];
    const rot = (p: Vec) => { const r = Math.hypot(p.x, p.y), be = Math.atan2(p.x, p.y) - W * D2R; return { x: Math.sin(be) * r, y: Math.cos(be) * r }; };
    const rp = pts.map(rot), xs = rp.map(p => p.x), ys = rp.map(p => p.y);
    const pad = 70, scale = Math.min((cw - 2 * pad) / (Math.max(...xs) - Math.min(...xs) || 1), (ch - 2 * pad) / (Math.max(...ys) - Math.min(...ys) || 1));
    const mcx = (Math.max(...xs) + Math.min(...xs)) / 2, mcy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const back = { x: Math.sin(Math.atan2(mcx, mcy) + W * D2R) * Math.hypot(mcx, mcy), y: Math.cos(Math.atan2(mcx, mcy) + W * D2R) * Math.hypot(mcx, mcy) };
    const tf: Tf = makeTf(back.x, back.y, W, scale, cw, ch);
    const S = (p: Vec): P => tf(p.x, p.y);

    ctx.fillStyle = '#0c2534'; ctx.fillRect(0, 0, cw, ch);
    drawLand(ctx, tf);

    // start/finish line
    const pin = S(C.pin), com = S(C.committee), lc = S(C.center);
    ctx.setLineDash([6, 5]); ctx.strokeStyle = COL.line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pin[0], pin[1]); ctx.lineTo(com[0], com[1]); ctx.stroke(); ctx.setLineDash([]);
    label(ctx, com, C.committeeLabel, '#ffd84a', 10, -10);
    if (C.pinKind !== 'mark') label(ctx, pin, C.pinLabel, '#ffd84a', 10, -10);
    label(ctx, lc, 'Start / Finish', '#ffd84a', -40, 22);

    // zones (3 lengths) around rounding marks, to scale
    if (w.settings.aids) for (const m of C.marks) if (m.type === 'round') {
      const c = S(m.p); ctx.strokeStyle = 'rgba(255,216,74,.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(3, ZONE * scale), 0, 2 * Math.PI); ctx.stroke();
    }

    // the course path: start → around/past each mark → finish, with leg numbers
    const visits: Record<string, number> = {};
    const legPts: { a: P; b: P }[] = [];
    let prevExit: P = lc;
    C.marks.forEach((m, i) => {
      const k = visits[m.key] = (visits[m.key] ?? -1) + 1;
      const r = 13 + k * 7; // each later visit to the same mark is drawn a little wider
      const M = S(m.p), Pn = i === 0 ? lc : S(C.marks[i - 1].p), Nx = i === C.marks.length - 1 ? lc : S(C.marks[i + 1].p);
      const din = unit2(sub2(M, Pn)), dout = unit2(sub2(Nx, M));
      // In canvas coordinates (y down), "left of travel" is (d.y, −d.x). Leaving a mark to starboard
      // puts the boat on its left of the mark, and she turns clockwise around it.
      const nIn = m.side === 's' ? [din[1], -din[0]] as P : [-din[1], din[0]] as P;
      const nOut = m.side === 's' ? [dout[1], -dout[0]] as P : [-dout[1], dout[0]] as P;
      const entry: P = [M[0] + nIn[0] * r, M[1] + nIn[1] * r];
      const exit: P = m.type === 'pass' ? [M[0] + nIn[0] * r, M[1] + nIn[1] * r] : [M[0] + nOut[0] * r, M[1] + nOut[1] * r];
      legPts.push({ a: prevExit, b: entry });
      const col = m.side === 's' ? COL.s : COL.p;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.5;
      if (m.type === 'round') {
        const a0 = Math.atan2(nIn[1], nIn[0]), a1 = Math.atan2(nOut[1], nOut[0]);
        let span = m.side === 's' ? a1 - a0 : a0 - a1;
        while (span <= 0.15) span += 2 * Math.PI; // always go the long way round if in and out nearly overlap
        const end = m.side === 's' ? a0 + span : a0 - span;
        ctx.beginPath(); ctx.arc(M[0], M[1], r, a0, end, m.side === 'p'); ctx.stroke();
        // arrowhead at the end of the arc, pointing along the direction of travel
        const tang: P = m.side === 's' ? [-Math.sin(end), Math.cos(end)] : [Math.sin(end), -Math.cos(end)];
        arrowHead(ctx, [M[0] + Math.cos(end) * r, M[1] + Math.sin(end) * r], tang, 8);
      } else {
        // pass mark: short arrow through the gap on the correct side
        const a: P = [entry[0] - din[0] * 12, entry[1] - din[1] * 12], b: P = [entry[0] + din[0] * 12, entry[1] + din[1] * 12];
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); arrowHead(ctx, b, din, 7);
      }
      prevExit = exit;
    });
    legPts.push({ a: prevExit, b: lc });
    const cur = u.started ? u.leg : 0;
    legPts.forEach((L, i) => {
      const done = u.started && i < cur, now = i === cur && !u.finished;
      ctx.strokeStyle = now ? 'rgba(255,182,39,.95)' : done ? 'rgba(233,242,245,.25)' : COL.path;
      ctx.lineWidth = now ? 2.5 : 1.5; ctx.setLineDash(now ? [] : [7, 5]);
      ctx.beginPath(); ctx.moveTo(L.a[0], L.a[1]); ctx.lineTo(L.b[0], L.b[1]); ctx.stroke(); ctx.setLineDash([]);
      // legs that retrace the same water get their arrow and number at different points along the leg
      const f = 0.22 + 0.56 * ((i * 0.618034) % 1);
      const mid: P = [L.a[0] + (L.b[0] - L.a[0]) * f, L.a[1] + (L.b[1] - L.a[1]) * f], d = unit2(sub2(L.b, L.a));
      ctx.fillStyle = ctx.strokeStyle; arrowHead(ctx, [mid[0] + d[0] * 6, mid[1] + d[1] * 6], d, 7);
      const n: P = [-d[1], d[0]];
      badge(ctx, [mid[0] + n[0] * 14, mid[1] + n[1] * 14], String(i + 1), now);
    });

    // marks on top
    const seen = new Set<string>();
    C.marks.forEach(m => {
      if (seen.has(m.key)) return; seen.add(m.key);
      const c = S(m.p);
      ctx.fillStyle = m.type === 'pass' ? '#c9b25a' : COL.mark;
      ctx.beginPath(); ctx.arc(c[0], c[1], 5, 0, 2 * Math.PI); ctx.fill();
      label(ctx, c, m.name, '#e9f2f5', 10, 18);
    });

    // laylines to the user's next mark
    if (w.settings.aids) drawLaylines(ctx, tf, laylinesFor(w, u), 2000, 1.5);

    // boats
    for (const b of w.boats) {
      const p = S(b), s = b.isUser ? 6 : 4.5;
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate((b.h - W) * D2R);
      ctx.fillStyle = b.color; ctx.beginPath(); ctx.moveTo(0, -s * 1.6); ctx.lineTo(s * 0.8, s); ctx.lineTo(-s * 0.8, s); ctx.closePath(); ctx.fill();
      if (b.isUser) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke(); }
      ctx.restore();
    }
    const up = S(u); label(ctx, up, 'You', '#ffb627', 9, -8);

    // wind, current, north
    ctx.fillStyle = '#e9f2f5'; ctx.strokeStyle = '#e9f2f5'; ctx.font = '600 12px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`WIND ${String(Math.round(w.wind.from)).padStart(3, '0')}° ${w.wind.kt.toFixed(0)} KT`, 14, 20);
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(30, 28); ctx.lineTo(30, 54); ctx.stroke(); arrowHead(ctx, [30, 56], [0, 1], 7);
    if (w.cur.kt > 0) {
      const cb = (w.cur.set - W) * D2R, ox = 30, oy = ch - 40;
      ctx.strokeStyle = ctx.fillStyle = '#6fd0ff';
      ctx.fillText(w.cur.label.toUpperCase(), 14, ch - 12);
      const tip: P = [ox + Math.sin(cb) * 14, oy - Math.cos(cb) * 14];
      ctx.beginPath(); ctx.moveTo(ox - Math.sin(cb) * 14, oy + Math.cos(cb) * 14); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      arrowHead(ctx, tip, [Math.sin(cb), -Math.cos(cb)], 7);
    }
    const nb = -W * D2R, nx = cw - 26, ny = 34;
    ctx.strokeStyle = ctx.fillStyle = '#94abb7'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(nx - Math.sin(nb) * 12, ny + Math.cos(nb) * 12); ctx.lineTo(nx + Math.sin(nb) * 12, ny - Math.cos(nb) * 12); ctx.stroke();
    arrowHead(ctx, [nx + Math.sin(nb) * 12, ny - Math.cos(nb) * 12], [Math.sin(nb), -Math.cos(nb)], 6);
    ctx.textAlign = 'center'; ctx.fillText('N', nx + Math.sin(nb) * 22, ny - Math.cos(nb) * 22 + 4); ctx.textAlign = 'left';

    // leg list
    const legs = legDescriptions(w);
    $('cvLegs').innerHTML = legs.map((t, i) => `<li class="${u.started && i < cur ? 'done' : i === cur && !u.finished ? 'now' : ''}">${t}</li>`).join('');
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
function label(ctx: CanvasRenderingContext2D, p: P, text: string, color: string, dx: number, dy: number): void {
  ctx.font = '600 12px "Saira Semi Condensed", sans-serif'; ctx.fillStyle = color; ctx.textAlign = 'left';
  ctx.fillText(text, p[0] + dx, p[1] + dy);
}
function badge(ctx: CanvasRenderingContext2D, p: P, text: string, hi: boolean): void {
  ctx.fillStyle = hi ? '#ffb627' : 'rgba(9,22,33,.9)'; ctx.strokeStyle = hi ? '#ffb627' : 'rgba(150,196,218,.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  ctx.fillStyle = hi ? '#1a1205' : '#e9f2f5'; ctx.font = '700 10px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(text, p[0], p[1] + 3.5); ctx.textAlign = 'left';
}
