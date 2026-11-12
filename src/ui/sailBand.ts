import type { Boat, LineKey } from '../boat/boat';
import { CAR_FORE_PINS, CAR_IN_PINS, boomAngle } from '../boat/controls';
import { byHand, moveLazyCar, takeLine } from '../boat/physics';
import { mainsheetFor } from '../boat/controls';
import { D2R } from '../core/math';
import { LINE_LABEL, LINE_NAME, lineHelp, type CtlKey } from './lines';

/**
 * The sail controls band (the owner's design, 12 Nov 2026; the UI session's mock-up, design/sail-controls-band.html):
 * every line laid out across the bottom of the screen as you face forward from the helm, port on the left.
 *   top row: the port jib car and sheet | the piano's port side | (the companionway) | its starboard side | the
 *            starboard jib sheet and car; the dual-ended lines (vang, outhaul, jib Cunningham) at both sides;
 *   bottom row (the thwart): the backstay's port end · the mainsheet (where the boom is) over the traveller (its car)
 *            · the backstay's starboard end.
 * One click is a small step (5% of the line's travel); hold and it keeps going at the line's rate; a double-click runs
 * it all the way off or on at its own rate (a jib sheet on its winch still takes its time), stopping when you touch
 * anything else; drag a rope, the car or the boom marker. Working a line takes it from the crew: its name goes amber,
 * a white mark shows where the crew would set it, and a tap on the name hands it back. "All" hands back everything.
 * The sim moves every line (physics.ts: ctlTarget for steps and runs, ctlCmd while held); this only says where to.
 */

/** The bits of the app the band needs. */
export interface BandHost {
  world(): { user: Boat; running: boolean; paused: boolean };
  /** Hold a line moving (+1 / −1 in the line's own value) or let it go (null): the app's held-button commands. */
  hold(k: CtlKey, d: number | null): void;
  /** Something changed hands: the trim panel's line. */
  changed(): void;
  toast(msg: string, ms?: number): void;
  /** Every line back to the crew (and their settings). */
  allBack(): void;
}

type Side = 'P' | 'S';
const STEP = 0.05, HOLD_MS = 300, DBL_MS = 300;
const SHEETS = new Set<CtlKey>(['mainsheet', 'jibsheet', 'jibsheetW']);
const lo = (k: CtlKey) => (k === 'traveller' ? -1 : 0);
const range = (k: CtlKey) => (k === 'traveller' ? 2 : 1);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** How much of a line is on (0 … 1): a sheet is "on" as it comes in. */
const onOf = (k: CtlKey, v: number) => (SHEETS.has(k) ? 1 - v : v);
const valOfOn = (k: CtlKey, on: number) => (SHEETS.has(k) ? 1 - on : on);
/** The jib sheet on a side: the leeward one is the working sheet (jibsheet), the windward one the lazy sheet. */
const sheetOn = (u: Boat, side: Side): 'jibsheet' | 'jibsheetW' => ((u.tack === 'S') === (side === 'P') ? 'jibsheet' : 'jibsheetW');
/** The side the wind comes over (+1 starboard). */
const windSide = (u: Boat): Side => (u.tack === 'S' ? 'S' : 'P');
const leeSign = (u: Boat) => (u.tack === 'S' ? -1 : 1); // the leeward side, as a screen direction (+1 = starboard, right)

const chev = (dir: 'u' | 'd' | 'l' | 'r') => {
  const p = { u: '1,9 6,3 11,9', d: '1,3 6,9 11,3', l: '9,1 3,6 9,11', r: '3,1 9,6 3,11' }[dir];
  return `<svg viewBox="0 0 12 12" aria-hidden="true"><polygon points="${p}"/></svg>`;
};
/** Short two-line names over the vertical lines. */
const SHORT: Partial<Record<CtlKey, string>> = { downhaul: 'Main<br>hal.', jibCunningham: 'Jib<br>Cunn', cunningham: 'Main<br>Cunn', outhaul: 'Out-<br>haul', vang: 'Vang', jibsheet: 'Jib<br>sheet', jibsheetW: 'Jib<br>sheet' };
/** Each rope's colour, with a laid fleck (the owner: for usability, not Josephine's colours; none port red or starboard green). */
const ROPE: Partial<Record<CtlKey | 'jib', string>> = { jib: '#ff8a3d', jibCunningham: '#f2c230', mainsheet: '#3d8bff', outhaul: '#2ec4d6', vang: '#9b6bff', cunningham: '#ec6aae', downhaul: '#8fa3b8', backstay: '#e8edf0' };
const CLEAT: Partial<Record<CtlKey, string>> = { cunningham: 'clam', downhaul: 'block', jibsheet: 'winch', jibsheetW: 'winch' };

/** A vertical line: its name, ▲ eases, the cleat, the well with the rope showing how much is on, ▼ pulls on. */
const vert = (key: CtlKey | 'jib', side: Side) => {
  const k = key === 'jib' ? 'jibsheet' : key, col = ROPE[key] ?? '#ccc';
  return `<div class="sb-v" data-line="${key}" data-side="${side}" style="--rope:${col}">
  <button type="button" class="sb-nm" data-act="name">${SHORT[k]}</button>
  <button type="button" class="sb-a" data-act="ease" aria-label="${key === 'jib' ? 'Jib sheet' : LINE_LABEL[k]}: ease">${chev('u')}</button>
  <span class="sb-cleat ${CLEAT[k] ?? 'cam'}"></span>
  <span class="sb-well" data-act="drag"><span class="sb-rope"></span><span class="sb-mark"></span></span>
  <button type="button" class="sb-a" data-act="pull" aria-label="${key === 'jib' ? 'Jib sheet' : LINE_LABEL[k]}: pull on">${chev('d')}</button></div>`;
};
/** The backstay's end on one side, pulled outboard. */
const bstay = (side: Side) => `<div class="sb-h sb-${side}" data-line="backstay" data-side="${side}" style="--rope:${ROPE.backstay}">
  <button type="button" class="sb-nm" data-act="name">Backstay</button>
  <span class="sb-hrow">${side === 'P'
    ? `<button type="button" class="sb-a" data-act="pull" aria-label="Backstay: pull on">${chev('l')}</button><span class="sb-well" data-act="drag"><span class="sb-rope"></span><span class="sb-mark"></span></span><button type="button" class="sb-a" data-act="ease" aria-label="Backstay: ease">${chev('r')}</button>`
    : `<button type="button" class="sb-a" data-act="ease" aria-label="Backstay: ease">${chev('l')}</button><span class="sb-well" data-act="drag"><span class="sb-rope"></span><span class="sb-mark"></span></span><button type="button" class="sb-a" data-act="pull" aria-label="Backstay: pull on">${chev('r')}</button>`}</span></div>`;
/** A track across the boat (port end left): the mainsheet's boom marker or the traveller's car. */
const track = (k: 'mainsheet' | 'traveller', label: string) => `<div class="sb-trk" data-line="${k}" style="--rope:${ROPE.mainsheet}">
  <button type="button" class="sb-nm" data-act="name">${label}</button><span class="sb-end p">P</span>
  <button type="button" class="sb-a" data-act="left" aria-label="${k === 'mainsheet' ? 'Boom toward port' : 'Car to port'}">${chev('l')}</button>
  <span class="sb-rail" data-act="drag"><span class="sb-mid"></span><span class="sb-mark"></span><span class="sb-${k === 'mainsheet' ? 'boom' : 'car'}"></span></span>
  <button type="button" class="sb-a" data-act="right" aria-label="${k === 'mainsheet' ? 'Boom toward starboard' : 'Car to starboard'}">${chev('r')}</button><span class="sb-end s">S</span></div>`;
/** A jib car on its H-shaped track: two fore-and-aft legs, a crossbar between them (7 rows), the car on it (5 pins). */
const jcar = (side: Side) => {
  let holes = '';
  for (let r = 0; r < CAR_FORE_PINS; r++) for (let c = 0; c < CAR_IN_PINS; c++) holes += `<button type="button" class="sb-hole" data-r="${r}" data-c="${c}" style="grid-row:${r + 1};grid-column:${c + 1}" tabindex="-1" aria-label="${side === 'P' ? 'Port' : 'Starboard'} jib car: pin row ${r + 1}, hole ${c + 1}"></button>`;
  return `<div class="sb-jc" data-line="car" data-side="${side}"><button type="button" class="sb-nm" data-act="name">Jib car</button>
  <span class="sb-h-grid">${holes}<span class="sb-xbar"></span><span class="sb-jcar"></span><span class="sb-jwant"></span><span class="sb-jideal"></span></span><span class="sb-tag"></span></div>`;
};

export class SailBand {
  readonly el: HTMLElement;
  private runKey: CtlKey | null = null;
  private last: { key: string; t: number } | null = null;
  private holdT = 0;
  private holding: CtlKey | null = null;
  private sel: CtlKey | null = null;
  private lastTack: 'S' | 'P' | null = null;

  constructor(private host: BandHost, parent: HTMLElement) {
    const el = this.el = document.createElement('div');
    el.id = 'sailBand'; el.className = 'sailband'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Sail controls, as you face forward from the helm: port on the left');
    el.innerHTML = `<button type="button" class="sb-all" data-act="all" title="Hand every line (and both jib cars) back to the crew">All ↺</button>
<div class="sb-top">
  ${jcar('P')}${vert('jib', 'P')}<span class="sb-div"></span>
  ${vert('downhaul', 'P')}${vert('jibCunningham', 'P')}${vert('cunningham', 'P')}${vert('outhaul', 'P')}${vert('vang', 'P')}
  <span class="sb-gap" title="The companionway"></span>
  ${vert('vang', 'S')}${vert('outhaul', 'S')}${vert('jibCunningham', 'S')}<span class="sb-slot" title="The jib halyard: coming"></span>
  <span class="sb-div"></span>${vert('jib', 'S')}${jcar('S')}
</div>
<div class="sb-bot">${bstay('P')}<div class="sb-thwart">${track('mainsheet', 'Mainsheet')}${track('traveller', 'Traveller')}</div>${bstay('S')}</div>`;
    parent.appendChild(el);
    el.addEventListener('pointerdown', e => this.down(e));
    el.addEventListener('pointermove', e => this.move(e));
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) el.addEventListener(ev, e => this.up(e as PointerEvent));
    // (a hold ends however the press ends: let go off the band, or the window loses focus)
    addEventListener('blur', () => this.up(null));
    el.addEventListener('click', e => this.click(e));
    el.addEventListener('dblclick', e => e.preventDefault());
    // hover titles: both ends of each line and what they do (no explanatory text in the band itself)
    el.querySelectorAll<HTMLElement>('[data-line]').forEach(d => {
      const k = d.dataset.line!;
      d.title = k === 'jib' ? 'Jib sheet: ' + lineHelp('jibsheet') : k === 'car' ? 'Jib car: click a hole to move it. Forward is up, inboard toward the middle. ' + lineHelp('carFore') + ' ' + lineHelp('carIn').replace(/^The lazy car[^:]*: /, '')
        : k === 'mainsheet' ? 'Mainsheet: the blue marker is where the boom is. Toward the middle trims, out to leeward eases. ' + lineHelp('mainsheet')
        : `${LINE_LABEL[k as CtlKey]}: ${lineHelp(k as CtlKey)}`;
    });
  }

  get open(): boolean { return !this.el.hidden; }
  show(on: boolean): void { this.el.hidden = !on; }
  /** The line the keys ([ ] ; ') are on: lit in the band. */
  select(k: CtlKey | null): void { this.sel = k; }

  /** The line a band element works, for this tack (a side's jib sheet is the working or the lazy one by the tack). */
  private keyOf(d: HTMLElement): CtlKey | 'car' | null {
    const line = d.dataset.line; if (!line) return null;
    const u = this.host.world().user;
    if (line === 'jib') return sheetOn(u, d.dataset.side as Side);
    return line as CtlKey | 'car';
  }
  private ok(): boolean { const w = this.host.world(); return w.running && !w.paused; }
  /** Touching any control stops a line that's running to its end (the double-click), other than the one touched. */
  private stopRun(except: CtlKey | null): void {
    if (this.runKey && this.runKey !== except) { const u = this.host.world().user; if (u.ctlTarget) delete u.ctlTarget[this.runKey]; this.runKey = null; }
  }
  /** Move a line toward a value at its own rate (the sim does the moving): it's yours from now. */
  private target(k: CtlKey, v: number): void {
    const u = this.host.world().user; (u.ctlTarget ??= {})[k] = clamp(v, lo(k), lo(k) + range(k)); takeLine(u, k); this.host.changed();
  }
  /** One small step: from where it's going (or where it is), a twentieth of its travel. */
  private step(k: CtlKey, dv: number): void {
    const u = this.host.world().user, from = u.ctlTarget?.[k] ?? u.ctl[k];
    this.target(k, from + dv * STEP * range(k));
  }
  /** Which way an arrow moves the line's value (+1 more, −1 less), and where its end is. */
  private dirOf(k: CtlKey, act: string): number {
    const u = this.host.world().user;
    if (act === 'pull') return SHEETS.has(k) ? -1 : 1;
    if (act === 'ease') return SHEETS.has(k) ? 1 : -1;
    const sx = act === 'left' ? -1 : 1; // toward port or starboard
    if (k === 'traveller') return sx * leeSign(u); // toward leeward is +1
    return sx === leeSign(u) ? 1 : -1; // the boom: toward leeward eases, toward the middle trims
  }

  private down(e: PointerEvent): void {
    const t = e.target as HTMLElement, act = t.closest<HTMLElement>('[data-act]')?.dataset.act, d = t.closest<HTMLElement>('[data-line]');
    if (!this.ok()) return;
    if (t.closest('.sb-hole') && d) { e.preventDefault(); this.stopRun(null); this.car(d.dataset.side as Side, Number((t as HTMLElement).dataset.r), Number((t as HTMLElement).dataset.c)); return; }
    if (!act || !d) { if (act !== 'all' && act !== 'name') this.stopRun(null); return; }
    const k = this.keyOf(d); if (!k || k === 'car') return;
    this.stopRun(k);
    if (act === 'drag') { e.preventDefault(); t.closest<HTMLElement>('[data-act]')!.setPointerCapture(e.pointerId); this.dragTo(k, d, e); return; }
    if (act === 'name') return;
    e.preventDefault();
    t.closest<HTMLElement>('[data-act]')!.setPointerCapture(e.pointerId); // (the release comes back here, wherever it is)
    // a press on a line that's running to its end stops it where it is first: the step is from there, not from the end
    if (this.runKey === k) { const u = this.host.world().user; if (u.ctlTarget) delete u.ctlTarget[k]; this.runKey = null; }
    const dv = this.dirOf(k, act), id = `${d.dataset.line}|${d.dataset.side ?? ''}|${act}`, now = performance.now();
    // a second press soon after the first: the double-click, all the way (the first press has already stepped)
    if (this.last && this.last.key === id && now - this.last.t < DBL_MS) {
      this.last = null; this.runKey = k; this.target(k, dv > 0 ? lo(k) + range(k) : lo(k)); return;
    }
    this.last = { key: id, t: now };
    this.step(k, dv);
    // held: after a moment it keeps going at the line's rate, until you let go
    clearTimeout(this.holdT);
    this.holdT = window.setTimeout(() => { this.holding = k; const u = this.host.world().user; if (u.ctlTarget) delete u.ctlTarget[k]; this.host.hold(k, dv); }, HOLD_MS);
  }
  private move(e: PointerEvent): void {
    const t = e.target as HTMLElement, a = t.closest<HTMLElement>('[data-act="drag"]');
    if (!a || !a.hasPointerCapture(e.pointerId)) return;
    const d = a.closest<HTMLElement>('[data-line]')!, k = this.keyOf(d); if (k && k !== 'car') this.dragTo(k, d, e);
  }
  private up(_e: PointerEvent | null): void {
    clearTimeout(this.holdT);
    if (this.holding) { this.host.hold(this.holding, null); this.holding = null; }
  }
  private click(e: MouseEvent): void {
    const t = e.target as HTMLElement, act = t.closest<HTMLElement>('[data-act]')?.dataset.act, d = t.closest<HTMLElement>('[data-line]');
    if (!this.ok()) return;
    if (act === 'all') { this.stopRun(null); this.host.allBack(); return; }
    if (act !== 'name' || !d) return;
    const u = this.host.world().user, k = this.keyOf(d) as LineKey | null; if (!k) return;
    // the name: amber (yours) hands it back; grey (the crew's) takes it where it is
    if (byHand(u, k)) { takeLine(u, k, false); this.host.toast(`The ${LINE_NAME[k]} is the crew's again.`, 2000); }
    else { takeLine(u, k); this.host.toast(`The ${LINE_NAME[k]} is yours: it stays where it is until you work it, or tap its name.`, 3000); }
    this.host.changed();
  }
  /** Drag a rope (down or outboard is on), the boom marker, or the traveller's car. */
  private dragTo(k: CtlKey, d: HTMLElement, e: PointerEvent): void {
    const u = this.host.world().user, well = d.querySelector<HTMLElement>('[data-act="drag"]')!, r = well.getBoundingClientRect();
    if (k === 'mainsheet' || k === 'traveller') {
      const x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1); // −1 port … +1 starboard
      if (k === 'traveller') { this.target(k, x * leeSign(u)); return; }
      // the boom to where you put it: an angle off the centreline on the leeward side, the sheet that gives it
      const ang = Math.asin(clamp(x * leeSign(u), 0, 1)) / D2R;
      this.target(k, mainsheetFor(ang, u.ctl.traveller)); return;
    }
    let on: number;
    if (d.classList.contains('sb-h')) { const f = clamp((e.clientX - r.left) / r.width, 0, 1); on = d.dataset.side === 'P' ? 1 - f : f; } // outboard is on
    else on = clamp((e.clientY - r.top) / r.height, 0, 1); // the rope below the cleat: down is on
    this.target(k, valOfOn(k, on));
  }
  /** Click a hole: the crossbar to that row, the car to that hole. The lazy car only: the crew moves the loaded one at the tack. */
  private car(side: Side, row: number, col: number): void {
    const u = this.host.world().user, ins = side === 'P' ? CAR_IN_PINS - 1 - col : col; // (inboard toward the band's middle)
    if (side !== windSide(u)) { this.host.toast('That\'s the loaded car, on the working sheet: the crew moves it at the next tack. Set the lazy one, on the windward side, for after the tack.', 4500); return; }
    // (moving a car takes the crew forward to it: a call already made counts as where it's going)
    const from = u.carCmd ?? u.ctl.car[side]; takeLine(u, 'car'); moveLazyCar(u, row - from.fore, ins - from.ins); this.host.changed();
  }

  /** Every frame while it's open: the ropes, the boom and the car, who has what, and where the crew would set it. */
  update(): void {
    if (this.el.hidden) return;
    const w = this.host.world(), u = w.user, c = u.ctl, ideal = u.crewIdeal, ws = windSide(u);
    // a tack ends a jib sheet's run: the sheets change roles (physics.ts carries your targets across), and a sheet still
    // winching after it would back the jib with nothing in the band to stop it
    if (this.lastTack && u.tack !== this.lastTack && (this.runKey === 'jibsheet' || this.runKey === 'jibsheetW') && u.ctlTarget) { delete u.ctlTarget.jibsheet; delete u.ctlTarget.jibsheetW; this.runKey = null; }
    this.lastTack = u.tack;
    if (this.runKey && u.ctlTarget?.[this.runKey] == null) this.runKey = null; // (arrived)
    this.el.classList.toggle('off', !w.running);
    this.el.querySelectorAll<HTMLElement>('.sb-v, .sb-h').forEach(d => {
      const k = this.keyOf(d) as CtlKey, on = onOf(k, c[k]), mine = byHand(u, k);
      const rope = d.querySelector<HTMLElement>('.sb-rope')!, mark = d.querySelector<HTMLElement>('.sb-mark')!;
      const horiz = d.classList.contains('sb-h'), pct = `${Math.round(on * 100)}%`;
      if (horiz) { rope.style.width = pct; rope.style[d.dataset.side === 'P' ? 'left' : 'right'] = '0'; } else rope.style.height = pct;
      d.classList.toggle('mine', mine); d.classList.toggle('sel', this.sel === k);
      // the dual-ended lines: the windward end's cleat is ringed
      d.classList.toggle('ww', (k === 'vang' || k === 'outhaul' || k === 'jibCunningham' || k === 'backstay') && d.dataset.side === ws);
      const iv = ideal?.[k as keyof typeof ideal] as number | undefined;
      mark.hidden = !mine || iv == null;
      if (iv != null) { const io = Math.round(onOf(k, iv) * 100) + '%'; if (horiz) { mark.style.left = d.dataset.side === 'P' ? `calc(100% - ${io})` : io; } else mark.style.top = io; }
    });
    // the mainsheet: the boom's end across the boat (sin of its angle, toward leeward); the crew's boom, dashed
    {
      const d = this.el.querySelector<HTMLElement>('.sb-trk[data-line="mainsheet"]')!, mine = byHand(u, 'mainsheet');
      const x = clamp(Math.sin(u.boom * D2R), -1, 1), boom = d.querySelector<HTMLElement>('.sb-boom')!, mark = d.querySelector<HTMLElement>('.sb-mark')!;
      boom.style.left = `${50 + x * 50}%`; d.classList.toggle('mine', mine); d.classList.toggle('sel', this.sel === 'mainsheet');
      mark.hidden = !mine || !ideal;
      if (ideal) mark.style.left = `${50 + leeSign(u) * Math.sin(boomAngle({ ...c, mainsheet: ideal.mainsheet, traveller: ideal.traveller }) * D2R) * 50}%`;
    }
    {
      const d = this.el.querySelector<HTMLElement>('.sb-trk[data-line="traveller"]')!, mine = byHand(u, 'traveller');
      d.querySelector<HTMLElement>('.sb-car')!.style.left = `${50 + c.traveller * leeSign(u) * 50}%`;
      d.classList.toggle('mine', mine); d.classList.toggle('sel', this.sel === 'traveller');
      const mark = d.querySelector<HTMLElement>('.sb-mark')!; mark.hidden = !mine || !ideal;
      if (ideal) mark.style.left = `${50 + ideal.traveller * leeSign(u) * 50}%`;
    }
    // the jib cars: the crossbar on its row, the car on its pin; the leeward one is loaded
    const carMine = byHand(u, 'car');
    this.el.querySelectorAll<HTMLElement>('.sb-jc').forEach(d => {
      const side = d.dataset.side as Side, car = c.car[side], col = side === 'P' ? CAR_IN_PINS - 1 - car.ins : car.ins, loaded = side !== ws;
      const xb = d.querySelector<HTMLElement>('.sb-xbar')!, jc = d.querySelector<HTMLElement>('.sb-jcar')!;
      xb.style.gridRow = String(car.fore + 1); jc.style.gridRow = String(car.fore + 1); jc.style.gridColumn = String(col + 1);
      d.querySelectorAll<HTMLElement>('.sb-hole').forEach(h => h.classList.toggle('row', Number(h.dataset.r) === car.fore));
      // where you've asked for it (the crew on the way), and, while it's yours, where the crew would put it
      const pin = (el: HTMLElement, p: { fore: number; ins: number } | null | undefined) => {
        el.hidden = !p; if (p) { el.style.gridRow = String(p.fore + 1); el.style.gridColumn = String((side === 'P' ? CAR_IN_PINS - 1 - p.ins : p.ins) + 1); }
      };
      pin(d.querySelector<HTMLElement>('.sb-jwant')!, !loaded && u.carCmd && (u.carCmd.fore !== car.fore || u.carCmd.ins !== car.ins) ? u.carCmd : null);
      pin(d.querySelector<HTMLElement>('.sb-jideal')!, !loaded && carMine && ideal ? { fore: ideal.carFore, ins: ideal.carIn } : null);
      d.classList.toggle('loaded', loaded); d.classList.toggle('mine', carMine && !loaded);
      d.querySelector<HTMLElement>('.sb-tag')!.textContent = loaded ? 'loaded' : '';
    });
  }
}
