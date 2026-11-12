import type { Boat, LineKey } from '../boat/boat';
import { CAR_FORE_PINS, CAR_IN_PINS, boomAngle } from '../boat/controls';
import { byHand, moveLazyCar, takeLine } from '../boat/physics';
import { mainsheetFor } from '../boat/controls';
import { D2R } from '../core/math';
import { LINE_LABEL, LINE_NAME, lineHelp, type CtlKey } from './lines';
import { LINE_COLORS, lineColor, type BoatSpec, type LineColorKey } from '../boat/spec';
import { JUMPER_HALF_TURN_S, wantJumpers } from '../boat/condition';
import { TUNE_PRESETS, TUNE_RANGE, guideTune } from '../boat/rigTune';

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
  /** Every line, both cars and the pole back to the crew (and their settings). */
  allBack(): void;
  /** Set or stow the whisker pole (it becomes yours). */
  pole(): void;
  /** The hail you could make now (world.ts hailOption), and making it. */
  hailWords(): string | null;
  hail(): void;
  /** The key bound to Hail, for its tab. */
  hailKey(): string;
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
const SHORT: Partial<Record<CtlKey, string>> = { downhaul: 'Main<br>hal.', jibHalyard: 'Jib<br>hal.', jibCunningham: 'Jib<br>Cunn', cunningham: 'Main<br>Cunn', outhaul: 'Out-<br>haul', vang: 'Vang', jibsheet: 'Jib<br>sheet', jibsheetW: 'Jib<br>sheet' };
/** Each rope's colour, with a laid fleck: the boat's own (chosen in the boat editor, boat/spec.ts lineColors), or the
 * usual ones (the owner: for usability; none port red or starboard green). */
const ROPE: Partial<Record<CtlKey | 'jib', string>> = { ...LINE_COLORS, jib: LINE_COLORS.jibsheet };
/** The colour key of a band element's line ('jib' is both jib sheets; the traveller's car rides with the mainsheet). */
const colorKey = (k: string): LineColorKey | null => (k === 'jib' ? 'jibsheet' : k === 'traveller' ? 'mainsheet' : k in LINE_COLORS ? (k as LineColorKey) : null);
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
/**
 * The windex, as you'd see it looking up at the masthead (in the band's middle, where the helm looks up past the
 * companionway): the boat from above, bow up; the vane points into the apparent wind; the white tabs at 28° either side
 * of the bow mark close-hauled, and the red wedge between them is too close to the wind to sail. The number is the
 * apparent wind angle. (The same geometry as the old top-centre windex: the UI session's mock-up, design/chase-view.)
 */
const windexSvg = () => {
  const P = (deg: number, r: number) => [70 + Math.sin(deg * D2R) * r, 70 - Math.cos(deg * D2R) * r].map(n => n.toFixed(1));
  let ticks = '';
  for (let d = 0; d < 360; d += 10) {
    const big = d % 30 === 0, [x1, y1] = P(d, 64), [x2, y2] = P(d, big ? 58 : 61);
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${big ? '#8fa9b8' : '#3b5566'}" stroke-width="${big ? 1.6 : 1}"/>`;
  }
  const [wx1, wy1] = P(-28, 56), [wx2, wy2] = P(28, 56);
  const tab = (s: number) => { const [a, b] = P(s * 28, 40), [c, d] = P(s * 28, 57); return `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="#eef3f5" stroke-width="3" stroke-linecap="round"/>`; };
  return `<svg viewBox="0 0 140 140" aria-hidden="true">
  <defs><radialGradient id="sbWxBg" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="#17344a"/><stop offset="1" stop-color="#08141e"/></radialGradient>
  <linearGradient id="sbWxHull" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a4657"/><stop offset=".5" stop-color="#4b6b7d"/><stop offset="1" stop-color="#2a4657"/></linearGradient></defs>
  <circle cx="70" cy="70" r="69" fill="#0b1a26"/><circle cx="70" cy="70" r="67" fill="url(#sbWxBg)" stroke="rgba(150,196,218,.35)" stroke-width="1.5"/>${ticks}
  <path d="M70 70 L${wx1} ${wy1} A56 56 0 0 1 ${wx2} ${wy2} Z" fill="#c8463a" opacity=".8"/>
  <path d="M70 26 C 82 44, 84 70, 80 106 L 60 106 C 56 70, 58 44, 70 26 Z" fill="url(#sbWxHull)" opacity=".85"/>${tab(-1)}${tab(1)}
  <g class="sb-vane"><line x1="70" y1="106" x2="70" y2="26" stroke="#ff6a3d" stroke-width="3" stroke-linecap="round"/><path d="M70 10 L79 30 L70 25 L61 30 Z" fill="#ffb627" stroke="#1a1205" stroke-width="1"/><path d="M70 98 L77 108 L77 114 L70 106 L63 114 L63 108 Z" fill="#ff6a3d" stroke="#1a1205" stroke-width="1"/></g>
  <circle cx="70" cy="70" r="5" fill="#e9f2f5" stroke="#08141e" stroke-width="1.5"/>
  <text class="sb-awa" x="70" y="131" text-anchor="middle">0°</text></svg>`;
};

/** A jib car on its H-shaped track: two fore-and-aft legs, a crossbar between them (7 rows), the car on it (5 pins). */
const jcar = (side: Side) => {
  let holes = '';
  for (let r = 0; r < CAR_FORE_PINS; r++) for (let c = 0; c < CAR_IN_PINS; c++) holes += `<button type="button" class="sb-hole" data-r="${r}" data-c="${c}" style="grid-row:${r + 1};grid-column:${c + 1}" tabindex="-1" aria-label="${side === 'P' ? 'Port' : 'Starboard'} jib car: pin row ${r + 1}, hole ${c + 1}"></button>`;
  return `<div class="sb-jc" data-line="car" data-side="${side}"><button type="button" class="sb-nm" data-act="name">Jib car</button>
  <span class="sb-h-grid">${holes}<span class="sb-xbar"></span><span class="sb-jcar"></span><span class="sb-jwant"></span><span class="sb-jideal"></span></span><span class="sb-tag"></span></div>`;
};

/** The jumpers (CR 7.40: adjustable above deck while racing), when her Rig tune says so: a turnbuckle, so a stepper in
 * half turns, not a rope. The scale's ticks are the half turns from 0 to 5, the tall one North Sails' medium; the
 * marker is where they are, the dashed one where the crew is turning them to. Steel grey, as the standing rigging. */
const JMAX = TUNE_RANGE.jumperTurns[1];
const jumpersRow = () => {
  let ticks = '';
  for (let i = 0; i <= JMAX * 2; i++) ticks += `<button type="button" class="sb-jt${i / 2 === TUNE_PRESETS.medium.jumperTurns ? ' med' : ''}" data-act="jset" data-v="${i / 2}" style="left:${(i / (JMAX * 2)) * 100}%" tabindex="-1" aria-label="Jumpers to ${i / 2} turns"></button>`;
  return `<div class="sb-trk sb-jump" data-jump hidden>
  <span class="sb-nm">Jumpers<br><span class="sb-jv"></span></span><span></span>
  <button type="button" class="sb-a" data-act="jless" aria-label="Jumpers: a half turn off">${chev('l')}</button>
  <span class="sb-rail sb-jrail">${ticks}<span class="sb-jtgt"></span><span class="sb-jcur"></span></span>
  <button type="button" class="sb-a" data-act="jmore" aria-label="Jumpers: a half turn on">${chev('r')}</button><span></span></div>`;
};

export class SailBand {
  readonly el: HTMLElement;
  private runKey: CtlKey | null = null;
  private last: { key: string; t: number } | null = null;
  private holdT = 0;
  private holding: CtlKey | null = null;
  private sel: CtlKey | null = null;
  private lastTack: 'S' | 'P' | null = null;
  /** The boat whose rope colours the band shows (re-coloured when you change boats, or her colours). */
  private colorsOf: string | null = null;
  /** Whether the pole tab is showing (a deep run, or the pole out): kept between frames for its hysteresis. */
  private poleShown = false;
  /** When to look for a hail to make next (performance.now(), ms). */
  private hailT = 0;

  constructor(private host: BandHost, parent: HTMLElement) {
    const el = this.el = document.createElement('div');
    el.id = 'sailBand'; el.className = 'sailband'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Sail controls, as you face forward from the helm: port on the left');
    el.innerHTML = `<div class="sb-edge"><span class="sb-ltabs"><button type="button" class="sb-tab sb-hail" data-act="hail" hidden></button><span class="sb-tab sb-pen" hidden></span></span>
<span class="sb-tillerslot"></span>
<span class="sb-tabs"><button type="button" class="sb-tab sb-pole" data-act="pole" hidden title="Whisker pole: it goes out to windward, opposite the boom, and holds the jib's clew out there (wing-on-wing). It pays sailing deep, past about 150° true; on a reach the poled-out jib is aback. Tap to set or stow it (the crew takes a few seconds); then it's yours until Auto-trim."></button><button type="button" class="sb-tab sb-all" data-act="all" title="Auto-trim: every line, both jib cars and the whisker pole back to the crew">Auto-trim</button></span></div>
<div class="sb-top">
  ${jcar('P')}${vert('jib', 'P')}<span class="sb-div"></span>
  ${vert('downhaul', 'P')}${vert('jibCunningham', 'P')}${vert('cunningham', 'P')}${vert('outhaul', 'P')}${vert('vang', 'P')}
  <span class="sb-wx" role="img">${windexSvg()}</span>
  ${vert('vang', 'S')}${vert('outhaul', 'S')}${vert('jibCunningham', 'S')}${vert('jibHalyard', 'S')}
  <span class="sb-div"></span>${vert('jib', 'S')}${jcar('S')}
</div>
<div class="sb-bot">${bstay('P')}<div class="sb-thwart">${track('mainsheet', 'Mainsheet')}${track('traveller', 'Traveller')}${jumpersRow()}</div>${bstay('S')}</div>`;
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
    el.querySelector<HTMLElement>('.sb-jump')!.title = `Jumpers: turns on their turnbuckle, 0 to ${JMAX}. On (more turns) stiffens the top of the mast, so the main's head twists off less; off lets it bend and twist (about ±1.5° up top). North Sails' medium is ${TUNE_PRESETS.medium.jumperTurns} turns (the tall tick); Heikkilä Sailmaker's guide: loose in light air, tighter in medium, tighter again in a breeze if the mast bends past the main's luff round. The crew turns them a half turn at a time, about ${JUMPER_HALF_TURN_S} s each. Auto-trim leaves them alone.`;
  }

  /** The middle of the band's top edge, for the tiller strip (the app puts it there). */
  get tillerSlot(): HTMLElement { return this.el.querySelector<HTMLElement>('.sb-tillerslot')!; }
  /** Put away, the band leaves only its windex (and a hail, when there is one): the helm still looks up at the masthead. */
  get open(): boolean { return !this.el.classList.contains('shut'); }
  show(on: boolean): void { this.el.classList.toggle('shut', !on); if (!on) this.up(null); }
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
    if (act === 'pole') { this.host.pole(); return; }
    if (act === 'hail') { this.host.hail(); this.hailT = 0; return; } // (look again at once: the hail's been made)
    if (act === 'jless' || act === 'jmore' || act === 'jset') {
      const u = this.host.world().user, from = u.jumperTarget ?? this.jumpersNow(u);
      wantJumpers(u, act === 'jset' ? Number(t.closest<HTMLElement>('[data-v]')!.dataset.v) : from + (act === 'jmore' ? 0.5 : -0.5));
      this.host.changed(); return;
    }
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

  /** Where the jumpers are now: her tune, or North's for the wind when she has none (cruising: rigTune.ts guideTune). */
  private jumpersNow(u: Boat): number { return (u.tune ?? guideTune(u.ww.kt)).jumperTurns; }
  /** The jumpers' row: shown only if her Rig tune has them adjusted under way. */
  private jumpers(u: Boat): void {
    const d = this.el.querySelector<HTMLElement>('.sb-jump')!, on = !!u.spec?.perf.jumpersUnderWay;
    d.hidden = !on; if (!on) return;
    const now = this.jumpersNow(u), want = u.jumperTarget, busy = want != null && Math.abs(want - now) > 1e-6, pct = (v: number) => `${(v / JMAX) * 100}%`;
    const fmt = (v: number) => (v === 1 ? '1 turn' : `${v} turns`);
    d.querySelector<HTMLElement>('.sb-jcur')!.style.left = pct(now);
    const wm = d.querySelector<HTMLElement>('.sb-jtgt')!; wm.hidden = !busy; if (busy) wm.style.left = pct(want!);
    d.querySelector<HTMLElement>('.sb-jv')!.textContent = busy ? `${now} → ${fmt(want!)}` : fmt(now);
    d.classList.toggle('busy', busy);
  }

  /** Each rope in her own colours (the boat editor's Lines), set again only when they change. */
  private colours(spec: BoatSpec | undefined): void {
    const key = JSON.stringify(spec?.lineColors ?? null); if (key === this.colorsOf) return; this.colorsOf = key;
    this.el.querySelectorAll<HTMLElement>('[data-line]').forEach(d => { const k = colorKey(d.dataset.line!); if (k) d.style.setProperty('--rope', lineColor(spec, k)); });
  }

  /** The windex and the tabs on the band's top edge: Hail (when a hail applies), a penalty's turns, the pole, Auto-trim. */
  private tabs(w: ReturnType<BandHost['world']>, u: Boat): void {
    // the windex: the vane into the apparent wind (arel, + from starboard: clockwise looking down)
    const wx = this.el.querySelector<HTMLElement>('.sb-wx')!;
    wx.querySelector('.sb-vane')!.setAttribute('transform', `rotate(${u.arel.toFixed(1)} 70 70)`);
    const awa = Math.round(Math.abs(u.awa));
    wx.querySelector('.sb-awa')!.textContent = `${awa}°`;
    wx.setAttribute('aria-label', `Windex: apparent wind ${awa}° ${u.arel >= 0 ? 'to starboard' : 'to port'}`);
    wx.title = `Windex, as you'd see it looking up at the masthead: the yellow arrowhead points into the apparent wind (${awa}° over the ${u.tack === 'S' ? 'starboard' : 'port'} side, ${Math.round(Math.abs(u.twa))}° off the true wind). The white tabs mark close-hauled; the red wedge between them is too close to the wind.`;
    // a penalty's turns still to do
    const pen = this.el.querySelector<HTMLElement>('.sb-pen')!, turns = u.penalty > 0 ? Math.ceil(u.penalty / 360) : 0;
    pen.hidden = !turns; if (turns) pen.textContent = `Penalty · ${turns} turn${turns > 1 ? 's' : ''}`;
    // Hail: only when there's a hail to make (checked a few times a second: it looks round the fleet)
    const hail = this.el.querySelector<HTMLElement>('.sb-hail')!;
    if (!w.running || w.paused) hail.hidden = true;
    else if (performance.now() >= this.hailT) {
      this.hailT = performance.now() + 250; // (by the clock, not frames: the same at any frame rate)
      const words = this.host.hailWords();
      hail.hidden = !words;
      if (words) { hail.innerHTML = `Hail · ${words}<span class="k">${this.host.hailKey()}</span>`; hail.title = `Hail "${words}" (${this.host.hailKey()})`; }
    }
    // the pole: only on a deep run, where a poled-out jib fills (from about 145° true: polar.ts jibEfficiency): it shows
    // at 140° as you bear away and goes below 135°, and stays while the pole is out or the crew is at it
    const tab = this.el.querySelector<HTMLElement>('.sb-pole')!, deep = Math.abs(u.twa), busy = u.pole !== 'down' || u.poleWant;
    this.poleShown = busy || deep >= (this.poleShown ? 135 : 140);
    tab.hidden = !this.poleShown;
    if (this.poleShown) {
      // "Pole out" sets it, "Pole in" stows it; while the crew is at it, the next word dimmed
      const moving = u.pole === 'setting' || u.pole === 'stowing' || (u.poleWant ? u.pole === 'down' : u.pole === 'set');
      tab.textContent = u.poleWant ? 'Pole in' : 'Pole out';
      tab.classList.toggle('dim', moving); tab.classList.toggle('mine', !!u.poleMine);
    }
  }

  /** Every frame while it's open: the ropes, the boom and the car, who has what, and where the crew would set it. */
  update(): void {
    const w = this.host.world(), u = w.user, c = u.ctl, ideal = u.crewIdeal, ws = windSide(u);
    this.tabs(w, u);
    this.colours(u.spec);
    if (!this.open) return;
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
    this.jumpers(u);
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
