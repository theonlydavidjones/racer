import { keepOnChart } from './encChart';
import type { SimView } from '../sim/host';
import type { Command, CommandResult } from '../sim/commands';
import type { Hud } from './hud';
import { $ } from './dom';
import { PLACES, latLon } from '../sim/places';
import { onLand } from '../geo/shore';
import { KT, brg, wrap, type Vec } from '../core/math';
import { beatFor } from '../boat/seaway';

/**
 * The chart: tap the inset map and it opens full screen, with the sail paused. North up; drag to move it, scroll to
 * zoom. Cruising, tap the water (or a place) to pick a new destination and "Sail here"; racing, it's for looking.
 */
/** The point on the water under (sx, sy) on the chart (north up, centred on cx, cy at `scale` px/m): makeTf's inverse
 * for an unturned map, where a tap picks a destination. */
export const chartPoint = (sx: number, sy: number, w: number, h: number, cx: number, cy: number, scale: number): Vec =>
  ({ x: cx + (sx - w / 2) / scale, y: cy - (sy - h / 2) / scale });

export class Chart {
  private w: SimView | null = null;
  private cx = 0; private cy = 0; private scale = 0.25; // px per metre
  private pick: { p: Vec; name: string } | null = null;
  private wasPaused = false;
  private c = $<HTMLCanvasElement>('chartC');
  /** the overlay for the wind's or the current's moving streaks and the readout under the cursor (Hud.chartFx) */
  private fx = $<HTMLCanvasElement>('chartFx');
  private cursor: [number, number] | null = null;
  private raf = 0;

  /** race: how the chart changes the race (sim/host.ts): pausing it while open, a destination, a new start. */
  constructor(private hud: Hud, private onClose: () => void, private setPal: (p: 'day' | 'dusk') => void, private race: { send(c: Command): void; ask(c: Command): Promise<CommandResult> }) {
    let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
    this.c.addEventListener('pointerdown', e => { this.c.setPointerCapture?.(e.pointerId); drag = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy, moved: false }; });
    // (the fog caption is one short line: its source and caveats are the hover)
    this.c.addEventListener('pointermove', e => {
      const r0 = this.c.getBoundingClientRect(), fc = this.hud.fogCaption, x = e.clientX - r0.left, y = e.clientY - r0.top;
      const tip = fc && x >= fc.rect[0] && x <= fc.rect[2] && y >= fc.rect[1] && y <= fc.rect[3] ? fc.tip : '';
      if (this.c.title !== tip) this.c.title = tip;
    });
    this.c.addEventListener('pointermove', e => {
      const r = this.c.getBoundingClientRect(); this.cursor = e.pointerType === 'mouse' ? [e.clientX - r.left, e.clientY - r.top] : null;
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (drag.moved) { this.cx = drag.cx - dx / this.scale; this.cy = drag.cy + dy / this.scale; this.draw(); }
    });
    this.c.addEventListener('pointerup', e => { if (drag && !drag.moved) this.tap(e.clientX, e.clientY); drag = null; });
    this.c.addEventListener('pointercancel', () => { drag = null; });
    this.c.addEventListener('pointerleave', () => { this.cursor = null; });
    this.c.addEventListener('wheel', e => {
      e.preventDefault();
      const r = this.c.getBoundingClientRect(), before = this.at(e.clientX - r.left, e.clientY - r.top);
      this.scale = Math.min(3, Math.max(Math.min(innerWidth, innerHeight) / 36000, this.scale * Math.exp(-e.deltaY * 0.0015))); // out to the whole chart (the sim's world, about 35 by 28 km, the Gate to Oakland and Richmond)
      const after = this.at(e.clientX - r.left, e.clientY - r.top); // zoom about the cursor
      this.cx += before.x - after.x; this.cy += before.y - after.y; this.draw();
    }, { passive: false });
    $('bChartClose').onclick = () => this.close();
    // Day | Dusk, a two-state toggle at the top right beside the field picker (the owner, 20 Nov 2026)
    document.querySelectorAll<HTMLButtonElement>('#chartPal button').forEach(b => b.addEventListener('click', () => {
      if (!this.w) return;
      // (the palette is the page's own (Hud.shown): the chart redraws with it at once; the race learns it by command)
      this.setPal(b.dataset.pal === 'dusk' ? 'dusk' : 'day'); this.palLabel(); this.draw();
    }));
    $('bChartBoat').onclick = () => { if (this.w) { this.cx = this.w.user.x; this.cy = this.w.user.y; this.draw(); } };
    $('bChartGo').onclick = () => {
      if (!this.w || !this.pick) return;
      this.race.send({ k: 'dest', p: this.pick.p, name: this.pick.name });
      this.close();
    };
    // cruising: a new start, without ending the cruise (she's put there, stopped; the clock and the log carry on)
    $('bChartMove').onclick = () => {
      if (!this.w || !this.pick) return;
      void this.race.ask({ k: 'moveHere', p: this.pick.p, name: this.pick.name }).then(ok => { if (ok) this.close(); else this.info('She can\'t be put there: pick a spot on open water.'); });
    };
    addEventListener('resize', () => { if (this.isOpen) this.draw(); });
  }

  get isOpen(): boolean { return !$('chart').hidden; }

  open(w: SimView): void {
    this.w = w; this.pick = null;
    this.wasPaused = w.paused; this.race.send({ k: 'pause', on: true });
    this.cx = w.user.x; this.cy = w.user.y;
    this.scale = Math.min(innerWidth, innerHeight) / 6000; // about 3 nm across to begin with
    $('chart').hidden = false;
    $('chartTitle').textContent = w.cruising ? 'Chart · pick a destination' : 'Chart';
    this.info(); this.palLabel();
    this.draw();
    // the streaks move every frame while the chart's open (the sail is paused: they're the only thing that moves)
    let last = performance.now();
    const tick = (t: number) => {
      if (!this.isOpen || !this.w) { this.raf = 0; return; }
      const r = this.c.getBoundingClientRect();
      Object.assign(this.fx.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      this.hud.chartFx(this.fx, this.w, (t - last) / 1000, this.cursor); last = t;
      if (this.hud.navRev !== this.navRev) this.draw(); // (the navigator's passage or plan came in: its layer drawn)
      this.raf = requestAnimationFrame(tick);
    };
    if (!this.raf) this.raf = requestAnimationFrame(tick);
  }

  private palLabel(): void { const pal = (this.w ? this.hud.shown(this.w).chartPal : null) ?? 'day'; document.querySelectorAll<HTMLButtonElement>('#chartPal button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.pal === pal))); }

  close(): void {
    if (!this.isOpen) return;
    $('chart').hidden = true;
    if (this.w && !this.wasPaused) this.race.send({ k: 'pause', on: false });
    this.onClose();
  }

  /** The point on the water under a spot on the canvas. */
  private at(sx: number, sy: number): Vec {
    const r = this.c.getBoundingClientRect();
    return chartPoint(sx, sy, r.width, r.height, this.cx, this.cy, this.scale);
  }

  private tap(clientX: number, clientY: number): void {
    const w = this.w; if (!w || !w.cruising) return;
    const r = this.c.getBoundingClientRect(), sx = clientX - r.left, sy = clientY - r.top, q = this.at(sx, sy);
    // a place near the tap: take it, by name
    let best: { p: Vec; name: string } | null = null, bd = 16;
    for (const pl of PLACES) {
      if (!pl.buoy) continue; // (the spots, 'Off Crissy Field' and the rest, are no longer on the chart: owner, 20 Nov 2026)
      const px = r.width / 2 + (pl.p.x - this.cx) * this.scale, py = r.height / 2 - (pl.p.y - this.cy) * this.scale, d = Math.hypot(px - sx, py - sy);
      if (d < bd) { bd = d; best = { p: pl.p, name: pl.name }; }
    }
    if (!best && onLand(q)) { this.pick = null; this.info('That\'s land. Pick a spot on the water.'); this.draw(); return; }
    this.pick = best ?? { p: q, name: latLon(q) };
    this.info(); this.draw();
  }

  /** What the picked spot is from here: how far, which way, and what sort of sail it'll be. */
  private info(note?: string): void {
    const el = $('chartInfo'), go = $('bChartGo') as HTMLButtonElement, w = this.w;
    go.hidden = !(w?.cruising && this.pick);
    $('bChartMove').hidden = !(w?.freeSail && this.pick); // (not in a race, even retired: that would be a restart)
    if (!w || !this.pick) {
      el.innerHTML = note ? `<p>${note}</p>` : w?.cruising ? `<p>${w.dest && w.arrivedT == null ? `Heading for <b>${w.dest.name}</b>.` : 'No destination set.'} Click the water or a place to choose one.</p>` : '';
      return;
    }
    const u = w.user, p = this.pick.p, d = Math.hypot(p.x - u.x, p.y - u.y), b = brg(p.x - u.x, p.y - u.y);
    const twa = Math.abs(wrap(w.wind.from - b)), beat = beatFor(u);
    const kind = twa < beat ? 'upwind of you: a beat, tacking' : twa < 70 ? 'a close reach' : twa < 110 ? 'a beam reach' : twa < 155 ? 'a broad reach' : 'downwind: a run';
    const cur = w.currentDrawn(p), ckt = Math.hypot(cur.x, cur.y) / KT;
    const nm = d / 1852;
    el.innerHTML = `<p><b>${this.pick.name}</b></p><p>${nm < 0.2 ? Math.round(d) + ' m' : nm.toFixed(2) + ' nm'}, bearing ${String(Math.round(b) % 360).padStart(3, '0')}° (true), ${kind}.</p>`
      + `<p>Current there now: ${ckt < 0.1 ? 'slack' : `${ckt.toFixed(1)} kt setting ${String(Math.round(brg(cur.x, cur.y)) % 360).padStart(3, '0')}°`}.</p>`;
  }

  private navRev = -1;
  draw(): void {
    if (!this.w || !this.isOpen) return;
    this.navRev = this.hud.navRev;
    { const r = this.c.getBoundingClientRect(), v = { cx: this.cx, cy: this.cy, scale: this.scale }; keepOnChart(v, r.width, r.height); this.cx = v.cx; this.cy = v.cy; this.scale = v.scale; } // (on NOAA's chart, never past it: chart audit #6)
    this.hud.drawChart(this.c, this.w, this.cx, this.cy, this.scale, this.pick?.p ?? null);
    // (the passage in one line at the chart's top, the plan in words behind its link: the navigator's layer, the owner's)
    const line = this.hud.navLine(this.w), el = $('chartPlan');
    if (el.hidden !== !line) el.hidden = !line;
    if (line && $('chartPlanText').textContent !== line) $('chartPlanText').textContent = line;
  }
}
