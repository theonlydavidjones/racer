import type { Boat } from '../boat/boat';
import type { TellState } from '../render/sails';
import { camberLine, flowField, flowState, flowWords, gridField, streamline, type FlowCut, type FlowSection, type FlowState } from './sailFlow';

/*
 * The flow view (the owner's training tool #2): a panel beside the 3D view with her sails cut across at three heights,
 * low, at the centre of effort and high, side by side, the air flowing round them, and in words what that flow and the
 * telltales are saying. Off by default; a key and a button turn it on, racing too. The numbers are the sim's (sailFlow.ts);
 * the streamlines and the separated air are labelled as illustrations.
 */

const W = 200, H = 180; // each cut's drawing (CSS px)
const COL = { running: '#9aa7b3', attached: '#f4f1e8', luffing: '#ffd34d', stalled: '#ff6a5c', hull: 'rgba(36,56,75,0.55)', hullEdge: 'rgba(63,90,114,0.6)', wind: '#ffb627', port: '#e0281e', stbd: '#18a14a' };

/** The flow's colour for its speed (share of the apparent wind): slow blue to fast mint. */
function speedCol(s: number): string {
  const t = Math.max(0, Math.min(1, (s - 0.6) / 0.9)), a = [70, 120, 185], b = [125, 245, 215];
  return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * t)).join(',')})`;
}
const flowCol = (s: FlowSection) => COL[s.trim.flow === 'good' ? 'attached' : s.trim.flow];
const deg = (x: number) => `${Math.round(x)}°`;

/** Point in polygon (even–odd). */
function inside(poly: [number, number][], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** The air that's left a stalled sail (illustrative, from the sim's stall amount): from where the flow parts from its lee
 * side to the leech, carried downstream as a widening wake. Off the wind, where a sail works stalled, all of it: the
 * wake from its luff. In the plan's metres. */
function separated(s: FlowSection, U: [number, number], running: boolean): [number, number][] | null {
  if (!running && (s.trim.flow !== 'stalled' || s.trim.amount < 0.05)) return null;
  const amt = running ? 1 : s.trim.amount, p = camberLine(s, 20), i0 = running ? 0 : Math.max(4, Math.round(20 * (1 - 0.65 * amt))), L = s.chord * (running ? 0.7 : 0.5 + 0.6 * amt);
  const lee = p.slice(i0).map(([x, y]) => [x + 0.02, y] as [number, number]), [lx, ly] = p[20], [sx, sy] = p[i0];
  // (the wake: off the leech downstream, and back from a point downstream and to leeward of where it parted)
  return [...lee, [lx + U[0] * L, ly + U[1] * L], [sx + U[0] * L * 0.7 + 0.25 * L, sy + U[1] * L * 0.7]]; // (x is to leeward in the plan)
}

export class FlowPanel {
  readonly el: HTMLElement;
  private cuts: { cv: HTMLCanvasElement; cap: HTMLElement }[] = [];
  private story: HTMLElement;
  private last = -1e9;
  open = false;

  constructor(parent: HTMLElement, private onClose: () => void) {
    const el = this.el = document.createElement('div'); el.id = 'flowPanel'; el.hidden = true;
    el.innerHTML = `<header><b>Flow over the sails</b><span class="fp-tags"><span class="fp-tag sim">wind, trim, telltales: the sim's</span><span class="fp-tag">sections and streamlines: drawn from them</span></span><button class="fp-x" aria-label="Close the flow view">×</button></header>
      <div class="fp-cuts"></div><div class="fp-key"></div><div class="fp-story"></div>`;
    const row = el.querySelector('.fp-cuts')!;
    for (let i = 0; i < 3; i++) {
      const fig = document.createElement('figure'), cv = document.createElement('canvas'), cap = document.createElement('figcaption');
      cv.style.width = `${W}px`; cv.style.height = `${H}px`; fig.append(cv, cap); row.append(fig); this.cuts.push({ cv, cap });
    }
    el.querySelector('.fp-key')!.innerHTML = `<span><i style="background:${COL.attached}"></i>attached</span><span><i style="background:${COL.luffing}"></i>luffing</span><span><i style="background:${COL.stalled}"></i>stalled</span><span><i style="background:${COL.running}"></i>working stalled (off the wind)</span>`
      + `<span><i style="background:${COL.stbd}"></i>starboard telltale</span><span><i style="background:${COL.port}"></i>port</span><span class="fp-speed">air: <i style="background:linear-gradient(90deg,${speedCol(0.6)},${speedCol(1.5)})"></i> slower · faster</span>`;
    this.story = el.querySelector('.fp-story')!;
    el.querySelector<HTMLButtonElement>('.fp-x')!.onclick = () => this.onClose();
    parent.append(el);
  }

  show(open: boolean): void { this.open = open; this.el.hidden = !open; this.last = -1e9; }

  /** Redraw twice a second while it's open (the flow is worked out afresh each time: sailFlow's cost test). */
  update(b: Boat, now: number, ctx: { preStart?: boolean } = {}): void {
    if (!this.open || now - this.last < 500) return;
    this.last = now;
    const st = flowState(b), cuts = st.cuts, lee = b.tack === 'S' ? -1 : 1; // (leeward on the screen: port, left, on starboard tack)
    // one scale for all three, so they compare: fitted to every section's extent with room for the flow round it
    let x0 = -0.6, x1 = 0.6, y0 = 0, y1 = 0;
    for (const c of cuts) for (const s of c.sections) for (const [x, y] of camberLine(s, 6)) { x0 = Math.min(x0, x - 0.5); x1 = Math.max(x1, x + 0.5); y0 = Math.min(y0, y - 0.35); y1 = Math.max(y1, y + 0.35); }
    const sc = Math.min(W / (x1 - x0), H / (y1 - y0)), cx = W / 2 - lee * (x0 + x1) / 2 * sc, cy = H / 2 - (y0 + y1) / 2 * sc;
    // (the flow's box: what the drawing shows, in metres, and a little beyond)
    const xa = -cx / (lee * sc), xb = (W - cx) / (lee * sc);
    const fit = { lee, sc, cx, cy, box: [Math.min(xa, xb) - 0.3, -cy / sc - 0.3, Math.max(xa, xb) + 0.3, (H - cy) / sc + 0.3] as [number, number, number, number] };
    cuts.forEach((c, i) => this.draw(this.cuts[i], c, fit, b, st.running));
    this.story.replaceChildren(...this.tell(st, b, ctx));
  }

  private draw(slot: { cv: HTMLCanvasElement; cap: HTMLElement }, c: FlowCut, f: { lee: number; sc: number; cx: number; cy: number; box: [number, number, number, number] }, b: Boat, running: boolean): void {
    const { cv, cap } = slot, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const g = cv.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const X = (x: number) => f.cx + f.lee * x * f.sc, Y = (y: number) => f.cy + y * f.sc;
    // her deck in plan, for scale (the mast's after side at the origin: the bow 2.93 m ahead, the transom 4.71 m aft)
    g.beginPath();
    for (let k = 0; k <= 40; k++) { const t = k / 40, y = -2.93 + 7.64 * t, hw = 1.1 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + 0.94 * t)), 0.55); k ? g.lineTo(X(hw), Y(y)) : g.moveTo(X(hw), Y(y)); }
    for (let k = 40; k >= 0; k--) { const t = k / 40, y = -2.93 + 7.64 * t, hw = 1.1 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + 0.94 * t)), 0.55); g.lineTo(X(-hw), Y(y)); }
    g.closePath(); g.fillStyle = COL.hull; g.fill(); g.strokeStyle = COL.hullEdge; g.lineWidth = 1; g.stroke();
    const a = c.awa * Math.PI / 180, U: [number, number] = [Math.sin(a), Math.cos(a)];
    // the flow (illustrative): streamlines seeded across the stream well upwind, coloured by speed; none through dead air
    const dead = c.sections.map(s => separated(s, U, running)).filter((p): p is [number, number][] => !!p);
    if (c.sections.length) {
      // (off the wind the air doesn't follow the sails round: a potential flow would draw it attached, so plain stream and wake)
      // (a sail flogging, luffing hard or with the wind outside it, makes no lift and doesn't turn the air)
      const working = c.sections.filter(s => !(s.trim.flow === 'luffing' && s.trim.amount > 0.6));
      const vel = running || !working.length ? (): [number, number] => U : gridField(flowField(working, c.awa), f.box, 40), span = Math.hypot(f.box[2] - f.box[0], f.box[3] - f.box[1]);
      const mx = (f.box[0] + f.box[2]) / 2, my = (f.box[1] + f.box[3]) / 2, n = 26;
      g.lineWidth = 1.2;
      for (let k = 0; k < n; k++) {
        const o = (k - (n - 1) / 2) * span / n, sx = mx - U[0] * span / 2 + U[1] * o, sy = my - U[1] * span / 2 - U[0] * o;
        const pts = streamline(vel, sx, sy, span / 160, 420, f.box);
        for (let j = 1; j < pts.length; j++) {
          const [px, py, s] = pts[j], [qx, qy] = pts[j - 1];
          if (dead.some(d => inside(d, px, py))) continue;
          g.strokeStyle = speedCol(s); g.beginPath(); g.moveTo(X(qx), Y(qy)); g.lineTo(X(px), Y(py)); g.stroke();
        }
      }
    }
    // the separated air behind a stalled sail (from the sim's stall amount)
    for (const d of dead) { g.beginPath(); d.forEach(([x, y], k) => k ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); g.closePath(); g.fillStyle = 'rgba(255,106,92,0.18)'; g.fill(); g.setLineDash([3, 3]); g.strokeStyle = COL.stalled; g.lineWidth = 1; g.stroke(); g.setLineDash([]); }
    // the sails: coloured by the sim's flow state; a luffing sail's front lifting (waved over as much as it luffs)
    for (const s of c.sections) {
      const p = camberLine(s, 24), lift = s.trim.flow === 'luffing' ? 0.15 + 0.5 * s.trim.amount : 0;
      g.strokeStyle = running ? COL.running : flowCol(s); g.lineWidth = 3.5; g.lineCap = 'round'; g.beginPath();
      p.forEach(([x, y], k) => {
        const t = k / 24, w = t < lift ? Math.sin(t * 60) * 0.06 * (1 - t / lift) : 0; // (the luff backing: a wave across it)
        const px = x + w * Math.cos(s.angle * Math.PI / 180), py = y - w * Math.sin(s.angle * Math.PI / 180);
        k ? g.lineTo(X(px), Y(py)) : g.moveTo(X(px), Y(py));
      });
      g.stroke();
      // the telltales: on the luff (an eighth of the chord back) windward and leeward; the main's on its leech
      const [tx, ty] = p[3], [ux, uy] = [p[4][0] - p[3][0], p[4][1] - p[3][1]], ul = Math.hypot(ux, uy) || 1;
      if (s.tells.windward) this.tell1(g, X, Y, tx, ty, ux / ul, uy / ul, -1, s.tells.windward, b.tack === 'S' ? COL.stbd : COL.port);
      if (s.tells.leeward) this.tell1(g, X, Y, tx, ty, ux / ul, uy / ul, 1, s.tells.leeward, b.tack === 'S' ? COL.port : COL.stbd);
      if (s.tells.leech) { const [ex, ey] = p[24], [dx, dy] = [p[24][0] - p[23][0], p[24][1] - p[23][1]], dl = Math.hypot(dx, dy) || 1; this.tell1(g, X, Y, ex, ey, dx / dl, dy / dl, 0, s.tells.leech, '#d0d6dc'); }
    }
    // the apparent wind there
    g.strokeStyle = COL.wind; g.fillStyle = COL.wind; g.lineWidth = 2;
    const ax = W - 34, ay = 30, L = 22, ex = ax + f.lee * U[0] * L, ey = ay + U[1] * L;
    g.beginPath(); g.moveTo(ax - f.lee * U[0] * L, ay - U[1] * L); g.lineTo(ex, ey); g.stroke();
    { const dx = f.lee * U[0], dy = U[1]; g.beginPath(); g.moveTo(ex + dx * 5, ey + dy * 5); g.lineTo(ex - dx * 3 - dy * 5, ey - dy * 3 + dx * 5); g.lineTo(ex - dx * 3 + dy * 5, ey - dy * 3 - dx * 5); g.closePath(); g.fill(); }
    g.font = '600 9px sans-serif'; g.fillText('wind', ax - 34, 14);
    cap.innerHTML = `<b>${c.name}</b> ${c.z.toFixed(1)} m<br><span>wind ${c.aws.toFixed(1)} kt at ${deg(c.awa)}</span>`;
  }

  /** A telltale at (x, y) on a sail whose direction aft is (ux, uy): on its windward face (side −1), leeward (1), or off
   * the leech (0); streaming aft along the sail, lifting (flicking up off the windward face, toward the wind), drooping or
   * hanging (barely moving), or curling round behind the leech to leeward. */
  private tell1(g: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, x: number, y: number, ux: number, uy: number, side: number, st: TellState, col: string): void {
    const nx = uy, ny = -ux, ox = x + nx * side * 0.05, oy = y + ny * side * 0.05, L = 0.35;
    let pts: [number, number][];
    switch (st) {
      case 'stream': pts = [[ox, oy], [ox + ux * L, oy + uy * L]]; break;
      case 'lift': pts = [[ox, oy], [ox + (ux * 0.3 + nx * side * 0.9) * L, oy + (uy * 0.3 + ny * side * 0.9) * L], [ox + (-ux * 0.2 + nx * side * 0.7) * L, oy + (-uy * 0.2 + ny * side * 0.7) * L]]; break;
      case 'curl': pts = [[ox, oy], [ox + ux * L * 0.5 + nx * 0.15, oy + uy * L * 0.5 + ny * 0.15], [ox + nx * 0.25, oy + ny * 0.25]]; break;
      default: pts = [[ox, oy], [ox + ux * L * 0.25 + nx * side * 0.06, oy + uy * L * 0.25 + ny * side * 0.06]]; // droop, hang
    }
    g.strokeStyle = col; g.lineWidth = 2.5; g.lineCap = 'round'; g.beginPath();
    pts.forEach(([px, py], k) => k ? g.lineTo(X(px), Y(py)) : g.moveTo(X(px), Y(py))); g.stroke();
  }

  private tell(st: FlowState, b: Boat, ctx: { preStart?: boolean }): HTMLElement[] {
    return flowWords(st, b, ctx).map(([cls, html]) => { const e = document.createElement('p'); e.className = cls; e.innerHTML = html; return e; });
  }
}
