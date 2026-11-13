import type { Hud } from './hud';
import { navRoute } from './hud';
import { $ } from './dom';
import { PLACES, place, spotId } from '../sim/places';
import { onLand } from '../geo/shore';
import { inBasin, slipPlace } from '../geo/marina';
import { chartPoint } from './chart';
import { brg, dist, wrap, type Vec } from '../core/math';
import type { SetupPicks } from './setupChart';
import type { SimView } from '../sim/host';
import { passageNow, whyNot } from '../sim/navigator';
import { clockOf } from '../sim/outlook';
import { mins } from '../sim/brief';

type Pin = 'from' | 'to';
/** Where a tap or a drop at a spot puts a pin: a place by its name, her slip, a spot on the water; or why it can't go there. */
export type Drop = { id: string; p: Vec; name: string } | { err: string; p: Vec };

/**
 * Where a pin dropped at q goes, as the setup's small chart puts one (ui/setupChart.ts): her slip if it's at her slip, a
 * place by its name if one's within a finger's width on the screen (`px`: how far p is from the drop, in px), or that
 * spot on open water; not on land, nor inside a harbor (her slip is the way into one).
 */
export function dropAt(w: SimView, q: Vec, px: (p: Vec) => number): Drop {
  const slip = w.homeSlip;
  if (slip && (px(slip.p) < 16 || dist(slip.p, q) < 60)) return { id: 'slip', p: slip.p, name: `her slip (${slipPlace(slip)})` };
  let best: (typeof PLACES)[number] | null = null, bd = 16;
  for (const pl of PLACES) { const d = px(pl.p); if (d < bd) { bd = d; best = pl; } }
  if (best) return { id: best.id, p: best.p, name: best.name };
  if (onLand(q)) return { err: 'That\'s land: pick a spot on the water.', p: q };
  if (inBasin(q)) return { err: slip ? 'Inside a harbor: use her slip, or pick open water outside.' : 'Inside a harbor: pick open water outside (or give her a slip in the Fleet).', p: q };
  return { id: spotId(q), p: q, name: 'open water' };
}

/**
 * The cruise planner (the owner: "a larger chart view to pick the start and the end in one map, without bouncing
 * between two pickers"): the full chart (hud.drawChart, NOAA's ENC, with the wind or current layer if it's on), big,
 * over the setup, with both pins on it. Drag either pin to move it; tap the water to put the selected one there (the
 * start first, then the destination). Each pin goes where the setup's small chart would put it: on a place by its
 * name, on her slip, or on open water; never on land or inside a harbor. Done keeps them; Cancel puts back what was set.
 */
export class PlanChart {
  private c = $<HTMLCanvasElement>('planC');
  private fx = $<HTMLCanvasElement>('planFx');
  private cx = 0; private cy = 0; private scale = 0.1;
  private which: Pin = 'to';
  private orig = { from: '', to: '' };
  private drag: { pin: Pin | null; x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
  private ghost: { pin: Pin; sx: number; sy: number; drop: Drop } | null = null;
  private cursor: [number, number] | null = null;
  private raf = 0;
  private msg = '';

  constructor(private hud: Hud, private picks: SetupPicks, private onClose: (kept: boolean) => void) {
    for (const b of $('planPinSeg').querySelectorAll<HTMLButtonElement>('[data-pin]')) b.onclick = () => { this.which = b.dataset.pin as Pin; this.msg = ''; this.sync(); };
    $('bPlanSlip').onclick = () => { if (this.picks.world().homeSlip) this.put(this.which, 'slip'); };
    $('bPlanNone').onclick = () => this.put('to', '');
    $('bPlanDone').onclick = () => this.close(true);
    $('bPlanCancel').onclick = () => this.close(false);
    addEventListener('keydown', e => { if (this.isOpen && e.key === 'Escape') { e.stopPropagation(); this.close(false); } }, true);
    const c = this.c;
    c.addEventListener('pointerdown', e => {
      const r = c.getBoundingClientRect(), pin = this.pinAt(e.clientX - r.left, e.clientY - r.top);
      this.drag = { pin, x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy, moved: false }; c.setPointerCapture?.(e.pointerId);
      if (pin) c.className = 'grabbing';
    });
    c.addEventListener('pointermove', e => {
      const r = c.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, d = this.drag;
      this.cursor = e.pointerType === 'mouse' ? [sx, sy] : null;
      if (!d) { c.className = this.pinAt(sx, sy) ? 'grab' : ''; return; }
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true;
      if (!d.moved) return;
      if (d.pin) this.ghost = { pin: d.pin, sx, sy, drop: this.resolve(sx, sy) }; // (the pin follows; it lands on release)
      else { this.cx = d.cx - (e.clientX - d.x) / this.scale; this.cy = d.cy + (e.clientY - d.y) / this.scale; this.draw(); }
    });
    c.addEventListener('pointerup', e => {
      const d = this.drag, r = c.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top; this.drag = null; this.ghost = null; c.className = '';
      if (!d) return;
      if (d.pin && d.moved) this.drop(d.pin, this.resolve(sx, sy));
      else if (d.pin) { this.which = d.pin; this.msg = ''; this.sync(); } // (a tap on a pin selects it)
      else if (!d.moved) this.drop(this.which, this.resolve(sx, sy));
    });
    c.addEventListener('pointercancel', () => { this.drag = null; this.ghost = null; c.className = ''; });
    c.addEventListener('pointerleave', () => { this.cursor = null; });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const r = c.getBoundingClientRect(), before = this.at(e.clientX - r.left, e.clientY - r.top);
      this.scale = Math.min(2, Math.max(Math.min(innerWidth, innerHeight) / 36000, this.scale * Math.exp(-e.deltaY * 0.0015)));
      const after = this.at(e.clientX - r.left, e.clientY - r.top); // (zoom about the cursor)
      this.cx += before.x - after.x; this.cy += before.y - after.y; this.draw();
    }, { passive: false });
    addEventListener('resize', () => { if (this.isOpen) this.draw(); });
  }

  get isOpen(): boolean { return !$('plan').hidden; }

  open(): void {
    this.orig = { from: this.picks.get('from'), to: this.picks.get('to') };
    this.which = 'to'; this.msg = ''; // (the start's usually where she is: the destination's the one to place)
    $('plan').hidden = false;
    this.fit(); this.sync();
    let last = performance.now();
    const tick = (t: number) => {
      if (!this.isOpen) { this.raf = 0; return; }
      const r = this.c.getBoundingClientRect();
      Object.assign(this.fx.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      // the wind's or the current's streaks and the readout (Hud.chartFx: the chart's own overlay), then the pins over them
      this.hud.chartFx(this.fx, this.picks.world(), (t - last) / 1000, this.drag ? null : this.cursor); last = t;
      this.pins();
      this.raf = requestAnimationFrame(tick);
    };
    if (!this.raf) this.raf = requestAnimationFrame(tick);
  }

  /** Done keeps the pins; Cancel (or Esc) puts back the start and the destination it opened with. */
  close(keep: boolean): void {
    if (!this.isOpen) return;
    $('plan').hidden = true; this.drag = null; this.ghost = null;
    if (!keep) {
      if (this.picks.get('from') !== this.orig.from) this.picks.set('from', this.orig.from);
      if (this.picks.get('to') !== this.orig.to) this.picks.set('to', this.orig.to);
    }
    this.onClose(keep);
  }

  private at(sx: number, sy: number): Vec { const r = this.c.getBoundingClientRect(); return chartPoint(sx, sy, r.width, r.height, this.cx, this.cy, this.scale); }
  private px(p: Vec): [number, number] { const r = this.c.getBoundingClientRect(); return [r.width / 2 + (p.x - this.cx) * this.scale, r.height / 2 - (p.y - this.cy) * this.scale]; }
  private pinP(pin: Pin): Vec | null { const w = this.picks.world(); return pin === 'from' ? { x: w.user.x, y: w.user.y } : w.dest?.p ?? null; }
  /** The pin under a spot on the canvas (within a finger's width), the destination first (it's drawn on top). */
  private pinAt(sx: number, sy: number): Pin | null {
    for (const pin of ['to', 'from'] as Pin[]) { const p = this.pinP(pin); if (!p) continue; const [x, y] = this.px(p); if (Math.hypot(x - sx, y - sy) < 20) return pin; }
    return null;
  }

  /** Both pins in view with room round them, and at least about 5 nm across: enough of the Bay to choose in. */
  private fit(): void {
    const r = this.c.getBoundingClientRect(), a = this.pinP('from')!, b = this.pinP('to') ?? a;
    this.cx = (a.x + b.x) / 2; this.cy = (a.y + b.y) / 2;
    const span = Math.max(9000, Math.abs(a.x - b.x) * 1.6, Math.abs(a.y - b.y) * 1.6 * (r.width || 1) / (r.height || 1));
    this.scale = Math.min(2, (r.width || innerWidth) / span);
  }

  /** What a pin dropped at (sx, sy) becomes (dropAt, with the screen's distances). */
  resolve(sx: number, sy: number): Drop {
    return dropAt(this.picks.world(), this.at(sx, sy), p => { const [x, y] = this.px(p); return Math.hypot(x - sx, y - sy); });
  }

  private drop(pin: Pin, d: Drop): void {
    if ('err' in d) { this.msg = d.err; this.sync(); return; }
    this.put(pin, d.id);
  }

  private put(pin: Pin, id: string): void {
    if (pin === 'from' && !id) return;
    this.msg = '';
    this.picks.set(pin, id); // (the world's rebuilt: she starts there, and the navigator plans from there)
    if (pin === 'from' && !this.picks.get('to')) this.which = 'to'; // (the start set: next, where she's going)
    this.sync();
  }

  /** The buttons, the read-back, and the chart. */
  private sync(): void {
    const w = this.picks.world(), slip = w.homeSlip;
    for (const b of $('planPinSeg').querySelectorAll<HTMLButtonElement>('[data-pin]')) b.setAttribute('aria-pressed', String(b.dataset.pin === this.which));
    const s = $('bPlanSlip') as HTMLButtonElement;
    s.disabled = !slip; s.title = slip ? `Her slip, ${slipPlace(slip)}` : 'Give her a slip in the Fleet first';
    s.textContent = this.which === 'from' ? 'Start from her slip' : 'Back to her slip';
    $('bPlanNone').hidden = this.which !== 'to' || !this.picks.get('to');
    const name = (id: string) => id === 'slip' ? (slip ? `her slip (${slipPlace(slip)})` : 'her slip') : id ? place(id)?.name ?? '?' : 'nowhere in particular';
    const from = this.picks.get('from'), to = this.picks.get('to');
    let way = '';
    if (w.dest) {
      const a = { x: w.user.x, y: w.user.y }, r = navRoute(a, w.dest), L = r.slice(1).reduce((s2, p, i) => s2 + dist(r[i], p), 0), b = brg(w.dest.p.x - a.x, w.dest.p.y - a.y);
      const twa = Math.abs(wrap(w.wind.from - b)), kind = twa < 45 ? 'a beat' : twa < 70 ? 'a close reach' : twa < 110 ? 'a beam reach' : twa < 155 ? 'a broad reach' : 'a run';
      way = `<p>${(L / 1852).toFixed(1)} nm by the navigator's route${r.length > 2 && L > dist(a, w.dest.p) * 1.02 ? ` round the land (${(dist(a, w.dest.p) / 1852).toFixed(1)} nm straight)` : ''}; bearing ${String(Math.round(b) % 360).padStart(3, '0')}°, ${kind} in the wind as it is now.</p>`;
      // the course she'd sail leaving now (sim/navigator.ts passageNow): over the ground, tacks and gybes, and when she'd get there
      const pn = passageNow(w);
      if (pn) {
        const turns = [pn.tacks.length ? `${pn.tacks.length} tack${pn.tacks.length > 1 ? 's' : ''}` : '', pn.gybes.length ? `${pn.gybes.length} gybe${pn.gybes.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ');
        way += pn.ok
          ? `<p><b>Sailing it:</b> about ${(pn.sailedM / 1852).toFixed(1)} nm over the ground${turns ? `, ${turns}` : ''}; ${mins(pn.minutes)}, leaving ${clockOf(pn.leave)} and arriving about <b>${clockOf(pn.eta!)}</b> (the Folkboat's polar speeds in the forecast wind and NOAA's current).</p>`
          : `<p class="warn">Leaving at ${clockOf(pn.leave)} she can't get there: ${whyNot(pn.why)}.</p>`;
      }
    }
    $('planInfo').innerHTML = `<p><b>Start:</b> ${name(from)}</p><p><b>Destination:</b> ${name(to)}</p>${way}${this.msg ? `<p class="warn">${this.msg}</p>` : ''}`;
    this.draw();
  }

  draw(): void {
    if (!this.isOpen) return;
    this.hud.drawChart(this.c, this.picks.world(), this.cx, this.cy, this.scale, null);
  }

  /** The pins, over the chart: a ring and a name on each (the selected one brighter), and the one being dragged. */
  private pins(): void {
    const ctx = this.fx.getContext('2d')!; // (Hud.chartFx has just cleared it and set its scale)
    const tag = (x: number, y: number, text: string, col: string, sel: boolean) => {
      ctx.save(); ctx.font = '700 12px "Saira Semi Condensed", sans-serif';
      const tw = ctx.measureText(text).width + 14, bx = x - tw / 2, by = y - 40;
      ctx.fillStyle = sel ? col : 'rgba(9,22,33,.9)'; ctx.beginPath(); ctx.roundRect(bx, by, tw, 20, 10); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = sel ? '#0c2534' : col; ctx.textAlign = 'center'; ctx.fillText(text, x, by + 14);
      ctx.strokeStyle = col; ctx.lineWidth = sel ? 3 : 2; ctx.beginPath(); ctx.arc(x, y, 14, 0, 6.29); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x, by + 20); ctx.stroke();
      ctx.restore();
    };
    const COL: Record<Pin, string> = { from: '#3fd197', to: '#ffb627' }, LAB: Record<Pin, string> = { from: 'START', to: 'DESTINATION' };
    for (const pin of ['from', 'to'] as Pin[]) {
      if (this.ghost?.pin === pin) continue;
      const p = this.pinP(pin); if (!p) continue;
      const [x, y] = this.px(p); tag(x, y, LAB[pin], COL[pin], this.which === pin);
    }
    if (this.ghost) {
      const d = this.ghost.drop, pin = this.ghost.pin;
      if ('err' in d) tag(this.ghost.sx, this.ghost.sy, 'NOT HERE', '#ff5d4c', true);
      else { const [x, y] = this.px(d.p); tag(x, y, `${LAB[pin]} · ${d.name.replace(/^Off /, 'off ')}`, COL[pin], true); }
    }
  }
}
