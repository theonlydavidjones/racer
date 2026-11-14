import type { SimView } from '../sim/host';
import type { Hud } from './hud';
import { $ } from './dom';
import { PLACES, place, spotId } from '../sim/places';
import { onLand } from '../geo/shore';
import { inBasin, slipPlace } from '../geo/marina';
import { chartPoint } from './chart';
import type { Vec } from '../core/math';

/**
 * Cruise setup: where she starts and where she's going, picked on the chart (the owner: "pick my start and end locations
 * on the map rather than in dropdowns"). The chart is the full one's (NOAA's ENC, hud.drawChart), small: her boat where
 * she'll start, the destination ringed. A switch says which you're placing; tap the water, or a place by its name, or her
 * slip, to put it there. Drag to move, scroll to zoom.
 */
export interface SetupPicks {
  world(): SimView;
  /** her start or her destination: a place id (sim/places.ts), 'slip', a spot ('at:lat,lon'), or '' (nowhere in particular) */
  set(which: 'from' | 'to', id: string): void;
  get(which: 'from' | 'to'): string;
  /** a race's start picked on the chart (Start: Somewhere else): only her start, on open water */
  race?(): boolean;
}

export class SetupChart {
  private c = $('setupChartC') as HTMLCanvasElement;
  private which: 'from' | 'to' = 'from';
  private cx = 0; private cy = 0; private scale = 0.25;
  private fitted = false;
  private drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;

  constructor(private hud: Hud, private picks: SetupPicks) {
    for (const b of $('setupPinSeg').querySelectorAll<HTMLButtonElement>('[data-pin]')) b.onclick = () => { this.which = b.dataset.pin as 'from' | 'to'; this.sync(); };
    $('bPinSlip').onclick = () => { if (this.picks.world().homeSlip) this.put('slip'); };
    $('bPinNone').onclick = () => this.put('');
    this.c.addEventListener('pointerdown', e => { this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy, moved: false }; this.c.setPointerCapture(e.pointerId); });
    this.c.addEventListener('pointermove', e => {
      const d = this.drag; if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.hypot(dx, dy) > 4) d.moved = true;
      if (d.moved) { this.cx = d.cx - dx / this.scale; this.cy = d.cy + dy / this.scale; this.draw(); }
    });
    this.c.addEventListener('pointerup', e => { const d = this.drag; this.drag = null; if (d && !d.moved) this.tap(e.clientX, e.clientY); });
    this.c.addEventListener('wheel', e => {
      e.preventDefault();
      const r = this.c.getBoundingClientRect(), before = this.at(e.clientX - r.left, e.clientY - r.top);
      this.scale = Math.min(2, Math.max(0.02, this.scale * Math.exp(-e.deltaY * 0.0015)));
      const after = this.at(e.clientX - r.left, e.clientY - r.top); // (zoom about the cursor)
      this.cx += before.x - after.x; this.cy += before.y - after.y; this.draw();
    }, { passive: false });
    // (drawn whenever its size changes: opened before the setup's panel is laid out, the canvas has no size and draws
    // nothing, and no pick redraws it till one's made blind; the owner, 14 Nov 2026: "map is no longer showing in cruise
    // config". Also the window's resize.)
    new ResizeObserver(() => this.draw()).observe(this.c);
  }

  /** The chart's point under a spot on the canvas. */
  private at(sx: number, sy: number): Vec { const r = this.c.getBoundingClientRect(); return chartPoint(sx, sy, r.width, r.height, this.cx, this.cy, this.scale); }

  /** Shown again (the setup opened, or the world rebuilt): the switch, the read-back, and the chart framed on both pins. */
  sync(refit = false): void {
    const w = this.picks.world(), slip = w.homeSlip, race = !!this.picks.race?.();
    if (race) this.which = 'from';
    $('setupPinSeg').hidden = race; $('bPlanOpen').hidden = race; $('setupPins').hidden = race;
    for (const b of $('setupPinSeg').querySelectorAll<HTMLButtonElement>('[data-pin]')) b.setAttribute('aria-pressed', String(b.dataset.pin === this.which));
    const name = (id: string) => id === 'slip' ? (slip ? `her slip (${slipPlace(slip)})` : 'her slip') : id ? place(id)?.name ?? '?' : 'nowhere in particular';
    $('setupPins').innerHTML = `<b>Start:</b> ${name(this.picks.get('from'))} · <b>To:</b> ${name(this.picks.get('to'))}`;
    const s = $('bPinSlip') as HTMLButtonElement;
    s.hidden = race; s.disabled = !slip; s.title = slip ? `Her slip, ${slipPlace(slip)}` : 'Give her a slip in the Yacht Club first';
    s.textContent = this.which === 'from' ? 'Start from her slip' : 'Back to her slip';
    $('bPinNone').hidden = race || this.which !== 'to';
    $('setupChartHint').textContent = race ? '' : this.which === 'from' ? 'Tap the water, a place or her slip to start there.' : 'Tap the water, a place or her slip to sail there.';
    if (refit || !this.fitted) this.fit();
    this.draw();
  }

  /** Frame her start and her destination, with a margin (or about 3 km round her start, with nowhere in particular). */
  private fit(): void {
    const w = this.picks.world(), a = { x: w.user.x, y: w.user.y }, b = w.dest?.p ?? a, r = this.c.getBoundingClientRect();
    if (!r.width) return; // (not laid out yet: framed when it's shown)
    this.cx = (a.x + b.x) / 2; this.cy = (a.y + b.y) / 2;
    const span = Math.max(3000, Math.abs(a.x - b.x) * 1.4, Math.abs(a.y - b.y) * 1.4 * r.width / r.height);
    this.scale = Math.min(2, r.width / span); this.fitted = true;
  }

  private tap(clientX: number, clientY: number): void {
    const w = this.picks.world(), r = this.c.getBoundingClientRect(), sx = clientX - r.left, sy = clientY - r.top, q = this.at(sx, sy);
    const px = (p: Vec) => [r.width / 2 + (p.x - this.cx) * this.scale, r.height / 2 - (p.y - this.cy) * this.scale];
    // her slip, or a place, near the tap: by name
    const race = !!this.picks.race?.(), slip = race ? null : w.homeSlip; // (a race from her slip is the Start row's own choice)
    if (slip) { const [x, y] = px(slip.p); if (Math.hypot(x - sx, y - sy) < 16 || Math.hypot(slip.p.x - q.x, slip.p.y - q.y) < 60) { this.put('slip'); return; } }
    let best: string | null = null, bd = 16;
    for (const pl of PLACES) { const [x, y] = px(pl.p), d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = pl.id; } }
    if (best && !(race && (onLand(place(best)!.p) || inBasin(place(best)!.p)))) { this.put(best); return; }
    if (onLand(q)) { this.note('That\'s land. Pick a spot on the water.'); return; }
    if (inBasin(q)) { this.note(slip ? 'Inside a harbor: tap her slip, or pick open water outside.' : 'Inside a harbor: pick open water outside (or give her a slip in the Fleet).'); return; }
    this.put(spotId(q));
  }

  private put(id: string): void {
    if (this.which === 'from' && !id) return;
    this.picks.set(this.which, id);
    // (reframed if a pin's now off the chart: picking her slip from offshore, say)
    const w = this.picks.world(), r = this.c.getBoundingClientRect(), off = (p: Vec) => Math.abs(p.x - this.cx) * this.scale > r.width / 2 - 20 || Math.abs(p.y - this.cy) * this.scale > r.height / 2 - 20;
    this.sync(off(w.user) || (!!w.dest && off(w.dest.p)));
  }

  private note(msg: string): void { $('setupChartHint').textContent = msg; }

  draw(): void {
    if ($('setup').hidden || $('whereField').hidden) return;
    const w = this.picks.world();
    if (!this.fitted) this.fit();
    this.hud.drawChart(this.c, w, this.cx, this.cy, this.scale, w.dest?.p ?? null);
  }
}
