import type { Settings } from '../settings';
import { BOTTOM_COLORS, BRIGHT_FINISH, HULL_COLORS, SAIL_COUNTRIES, TEAK_DECKS, ensignFor, fixSpec, type BoatSpec, type SailAge } from '../boat/spec';
import { BURGEES, CLUBS } from '../render/burgees';
import { ENSIGNS } from '../render/flagArt';
import { PERF_INFO, conditionItems, referencePerf } from '../boat/condition';
import { benchAngles, benchSpeed } from '../boat/benchmark';
import { HARBOR, MARINAS, SLIPS } from '../geo/marina';

/**
 * Editing one of your boats (from the Fleet): her particulars (name, number, club, skipper, home marina and slip),
 * her looks, and her condition (what changes her speed) at the bottom, with what each choice costs in the conditions
 * you've chosen. Every change rebuilds the boat at once, so you see her change in the showroom view beside the panel.
 */
export class BoatPanel {
  private el: HTMLElement;
  constructor(private S: Settings, private changed: () => void, private done: () => void) {
    this.el = document.getElementById('boatPanel')!;
    this.el.addEventListener('click', e => this.click(e));
    this.el.addEventListener('input', e => this.input(e));
    this.el.addEventListener('change', e => this.input(e));
  }

  get open(): boolean { return !this.el.hidden; }
  show(id = this.S.boatId): void {
    this.editId = id; this.confirmDiscard = false;
    this.snap = structuredClone({ boats: this.S.boats, boatId: this.S.boatId, opponents: this.S.opponents }); // for "Discard changes"
    this.render(); this.el.hidden = false;
  }
  /** Your boats as they were when you opened the panel. */
  private snap: { boats: BoatSpec[]; boatId: string; opponents: string[] } | null = null;
  private confirmDiscard = false;
  private get edited(): boolean { return !!this.snap && JSON.stringify(this.snap) !== JSON.stringify({ boats: this.S.boats, boatId: this.S.boatId, opponents: this.S.opponents }); }
  /** The showroom's slow turn: pause it to look at her from one side (set by main; returns whether she's turning now). */
  onSpin: (() => boolean) | null = null;
  private spinning = true;
  hide(): void { this.el.hidden = true; }

  /** The boat being set up (shown in the showroom): the one you sail, or one of your others (a rival, perhaps). */
  get editing(): BoatSpec { return this.S.boats.find(x => x.id === this.editId) ?? this.S.boat; }
  private editId = '';
  private get b(): BoatSpec { return this.editing; }
  private set(f: (b: BoatSpec) => void, rerender = true): void {
    const b = structuredClone(this.b); f(b); this.use(fixSpec(b), rerender);
  }
  /** Store `b` in your list (replacing her entry, or adding her), make her the one being set up, save, and redraw. */
  private use(b: BoatSpec, rerender = true): void {
    const i = this.S.boats.findIndex(x => x.id === b.id);
    if (i >= 0) this.S.boats[i] = b; else this.S.boats.push(b);
    if (b.id === this.S.boatId) this.S.boat = b;
    this.editId = b.id;
    this.changed(); if (rerender) this.render(); else { this.report(); if (!this.el.querySelector('[data-act="discard"]') && this.edited) this.render(); }
    this.flashSaved();
  }
  private flashSaved(): void {
    const el = this.el.querySelector('#bpSaved'); if (!el) return;
    el.classList.add('on'); clearTimeout(this.savedT); this.savedT = window.setTimeout(() => el.classList.remove('on'), 1400);
  }
  private savedT = 0;
  private uniqueName(base: string): string {
    const names = new Set(this.S.boats.map(b => b.name)); let n = base, k = 2;
    while (names.has(n)) n = `${base} ${k++}`;
    return n;
  }

  private click(e: Event): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (!t) return;
    const v = t.dataset.v ?? '';
    switch (t.dataset.act) {
      case 'done': this.done(); return;
      case 'spin': if (this.onSpin) { this.spinning = this.onSpin(); t.textContent = this.spinning ? 'Pause turning' : 'Turn her'; t.setAttribute('aria-pressed', String(!this.spinning)); } return;
      case 'discard': this.confirmDiscard = true; this.render(); return;
      case 'discardNo': this.confirmDiscard = false; this.render(); return;
      case 'discardYes': {
        if (!this.snap) return;
        const s0 = structuredClone(this.snap);
        this.S.boats = s0.boats; this.S.boatId = s0.boatId; this.S.opponents = s0.opponents;
        this.S.boat = this.S.boats.find(x => x.id === s0.boatId) ?? this.S.boats[0];
        if (!this.S.boats.some(x => x.id === this.editId)) this.editId = this.S.boatId;
        this.confirmDiscard = false;
        this.changed(); this.render(); return;
      }
      case 'skipper': this.set(b => { b.skipper = v === 'you' ? 'you' : 'ai'; }); return;
      case 'material': this.set(b => { b.hull.material = v as BoatSpec['hull']['material']; if (v === 'wood' && b.deck === '#8e9f7c') b.deck = 'teak-silver'; }); return;
      case 'upper': this.set(b => { b.hull.upper = v; }); return;
      case 'lower': this.set(b => { b.hull.lower = v; }); return;
      case 'stripe': this.set(b => { b.hull.stripe = v; }); return;
      case 'deck': this.set(b => { b.deck = v; }); return;
      case 'cabinTop': this.set(b => { if (v) b.cabinTop = v; else delete b.cabinTop; }); return;
      case 'poleSide': this.set(b => { b.poleSide = v === 'starboard' ? 'starboard' : 'port'; }); return;
      case 'hatch': this.set(b => { b.hatch = v === 'acrylic' ? 'acrylic' : 'teak'; }); return;
      case 'sailColor': this.set(b => { b.sails.color = v as 'white' | 'black'; }); return;
      case 'mainAge': this.set(b => { b.perf.mainAge = v as SailAge; }); return;
      case 'jibAge': this.set(b => { b.perf.jibAge = v as SailAge; }); return;
      case 'mast': this.set(b => { b.perf.mast = v as 'wood' | 'aluminium'; }); return;
      case 'boom': this.set(b => { b.perf.boom = v as 'wood' | 'aluminium'; }); return;
      case 'stiff': this.set(b => { b.perf.mastStiffness = v as BoatSpec['perf']['mastStiffness']; }); return;
      case 'outboard': this.set(b => { b.perf.outboard = v as BoatSpec['perf']['outboard']; }); return;
      case 'finish': this.set(b => { b.perf.finish = v as BoatSpec['perf']['finish']; }); return;
    }
  }
  private input(e: Event): void {
    const t = e.target as HTMLInputElement | HTMLSelectElement, k = t.dataset.k; if (!k) return;
    const final = e.type === 'change';
    switch (k) {
      case 'name': if (final) this.set(b => { b.name = t.value.trim().toUpperCase() || this.uniqueName('UNNAMED'); }); return;
      case 'number': if (final) this.set(b => { b.sails.number = t.value; }); return;
      case 'country': this.set(b => { b.sails.country = t.value; }); return;
      case 'club': this.set(b => { b.club = t.value; }); return;
      case 'marina': this.set(b => { if (t.value) b.marina = t.value; else { delete b.marina; delete b.slip; } }); return;
      case 'slip': this.set(b => { if (t.value) { b.slip = t.value; b.marina ||= 'west-harbor'; } else delete b.slip; }); return;
      case 'weeks': { const out = this.el.querySelector('#bpWeeksV'); if (out) out.textContent = weeksLabel(Number(t.value)); if (final) this.set(b => { b.perf.cleanedWeeks = Number(t.value); }, false); return; }
      case 'gear': if (final) this.set(b => { b.perf.gearKg = Number(t.value) * 0.4536; }, false); return;
    }
  }

  private job = 0;
  private cache = new Map<string, number>();
  /**
   * What the boat's condition costs, in the wind you've set up: each item measured on its own against the reference
   * boat (and all together), by sailing her for a while in the sim's own physics. Worked out a slice at a time so
   * the panel stays responsive.
   */
  private report(): void {
    const el = this.el.querySelector('#bpReport'); if (!el) return;
    const kt = this.S.windKt || 12, b = this.b, month = +(this.S.tideDate || new Date().toISOString()).slice(5, 7) || 9;
    const items = conditionItems(b, month), angles = benchAngles(kt), job = ++this.job;
    const rows = items.length > 1 ? [...items, { label: 'All together', spec: b }] : items;
    if (!rows.length) { el.innerHTML = `<small>As fast as a Folkboat can be: clean bottom, new sails. (In ${kt} kt.)</small>`; return; }
    const speed = (spec: BoatSpec, twa: number) => {
      const key = JSON.stringify([spec.perf, kt, twa, month]);
      let v = this.cache.get(key); if (v == null) { v = benchSpeed(kt, twa, spec, month).kt; this.cache.set(key, v); }
      return v;
    };
    const ref = referencePerf(b), pct = (a: number, r: number) => { const p = (a / r - 1) * 100; return `${p > 0.05 ? '+' : ''}${p.toFixed(1)}%`; };
    const cells: string[][] = rows.map(() => ['…', '…', '…']);
    const paint = () => {
      el.innerHTML = `<table><tr><td><small>In ${kt} kt, against a clean, new-sailed boat</small></td><td><small>Upwind</small></td><td><small>Reach</small></td><td><small>Run</small></td></tr>`
        + rows.map((r, i) => `<tr${i === rows.length - 1 && rows.length > 1 && r.spec === b ? ' class="tot"' : ''}><td>${r.label}</td>${cells[i].map(c => `<td>${c}</td>`).join('')}</tr>`).join('')
        + `</table><small>Speed through the water, measured by sailing her in the sim. 1% at 5 kt is about 7 seconds a mile.</small>`;
    };
    paint();
    const tasks: (() => void)[] = [];
    rows.forEach((r, i) => (['up', 'reach', 'down'] as const).forEach((k, j) => tasks.push(() => { cells[i][j] = pct(speed(r.spec, angles[k]), speed(ref, angles[k])); })));
    const step = () => { if (job !== this.job) return; const t = tasks.shift(); if (!t) return; t(); paint(); setTimeout(step, 0); };
    setTimeout(step, 30);
  }

  private render(): void {
    const scroller = this.el.querySelector<HTMLElement>('.bpbody'), keep = scroller?.scrollTop ?? 0; // redrawing mustn't jump you back to the top
    this.draw();
    const sc2 = this.el.querySelector<HTMLElement>('.bpbody'); if (sc2) sc2.scrollTop = keep;
  }
  private draw(): void {
    const b = this.b, wood = b.hull.material === 'wood';
    const sw = (act: string, list: [string, string][], cur: string, none?: string) =>
      `<div class="swatches">${none ? `<button type="button" class="sw none" data-act="${act}" data-v="" aria-pressed="${cur === ''}" title="${none}">${none}</button>` : ''}`
      + list.map(([n, c]) => `<button type="button" class="sw${c.startsWith('teak') ? ' ' + c : ''}" style="${c.startsWith('#') ? `background:${c}` : ''}" data-act="${act}" data-v="${c}" aria-pressed="${cur === c}" title="${n}" aria-label="${n}"></button>`).join('') + '</div>';
    const seg = (act: string, opts: [string, string][], cur: string) => `<div class="seg">${opts.map(([v, n]) => `<button type="button" data-act="${act}" data-v="${v}" aria-pressed="${cur === v}">${n}</button>`).join('')}</div>`;
    const name = (list: [string, string][], c: string) => list.find(x => x[1] === c)?.[0] ?? '';
    const upperList = wood ? [...HULL_COLORS, BRIGHT_FINISH] : HULL_COLORS;
    const deckList = [...TEAK_DECKS, ...HULL_COLORS]; // laid teak on glassfibre decks too (a common refit)
    const ages: [SailAge, string][] = [['new', 'New'], ['mid', 'Midlife'], ['old', 'End of life']];
    this.el.innerHTML = `
      <div class="bphead"><h2>Edit ${esc(b.name || 'her')}</h2><button type="button" class="ghost sm" data-act="spin" aria-pressed="${!this.spinning}">${this.spinning ? 'Pause turning' : 'Turn her'}</button><button type="button" class="cta" data-act="done">Done</button></div>
      <div class="garage">
        ${this.confirmDiscard
          ? `<div class="gconfirm">Undo every change since you started editing? <button type="button" class="ghost danger" data-act="discardYes">Discard changes</button><button type="button" class="ghost" data-act="discardNo">Keep them</button></div>`
          : `<small>Every change is saved as you make it.<span class="gsaved" id="bpSaved">Saved ✓</span>${this.edited ? ' <button type="button" class="linkbtn" data-act="discard">Discard changes</button>' : ''}</small>`}
      </div>
      <div class="bpbody">
      <section><h3>Particulars</h3>
        <div class="field"><span>Name</span><input data-k="name" class="pick" maxlength="18" value="${esc(b.name)}"></div>
        <div class="field"><span>Sail number · home country</span><div class="row2">
          <select data-k="country" class="pick" aria-label="Home country (national letters)">${SAIL_COUNTRIES.some(c => c[0] === b.sails.country) ? '' : `<option value="${esc(b.sails.country)}" selected>${esc(b.sails.country || 'No letters')}</option>`}${SAIL_COUNTRIES.map(([c, n]) => `<option value="${c}"${c === b.sails.country ? ' selected' : ''}>${c} · ${n}</option>`).join('')}</select>
          <input data-k="number" class="pick" inputmode="numeric" maxlength="5" value="${esc(b.sails.number)}" aria-label="Number"></div>
          <small>Her national letters are her home country: the countries where Folkboats are sailed (the class association's national fleets).</small></div>
        <div class="field"><span>Yacht club</span><select data-k="club" class="pick"><option value="">None</option>${CLUBS.map(c => `<option value="${c.id}"${c.id === b.club ? ' selected' : ''}>${esc(c.club)}</option>`).join('')}</select></div>
        <div class="field"><span>Skipper</span>${seg('skipper', [['you', 'You'], ['ai', 'AI skipper (generic)']], b.skipper)}
          <small>Skippers come with the Yacht Club; for now she's yours to skipper, or a generic AI's.</small></div>
        <div class="field"><span>Home marina</span><select data-k="marina" class="pick"><option value="">None</option>${MARINAS.map(m => `<option value="${m.id}"${m.id === b.marina ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
        ${b.marina ? `<div class="field"><span>Her slip in ${HARBOR.name}</span><select data-k="slip" class="pick">${slipOptions(b, this.S.boats)}</select>
          <small>She lies bow in (boats nose into a slip here, never back in): to leave, push off. The docks are mapped from OpenStreetMap; the dock letters and slip numbers are this sim's.</small></div>` : ''}
        <div class="field"><span>Her flags</span><small id="bpFlagNote">${flagNote(b)}</small></div>
      </section>
      <section><h3>Hull</h3>
        <div class="field"><span>Built in</span>${seg('material', [['fiberglass', 'Fiberglass'], ['wood', 'Wood (clinker)']], b.hull.material)}
          <small>The class weighs wooden and fiberglass Folkboats to the same minimum, so they race as equals.</small></div>
        <div class="field"><span>Topsides · ${name(upperList, b.hull.upper)}</span>${sw('upper', upperList, b.hull.upper)}</div>
        <div class="field"><span>Boot stripe · ${b.hull.stripe ? name(HULL_COLORS, b.hull.stripe) : 'none'}</span>${sw('stripe', HULL_COLORS, b.hull.stripe, 'None')}</div>
        <div class="field"><span>Bottom paint · ${name(BOTTOM_COLORS, b.hull.lower)}</span>${sw('lower', BOTTOM_COLORS, b.hull.lower)}</div>
      </section>
      <section><h3>Deck</h3>
        <div class="field"><span>${name(deckList, b.deck)}</span>${sw('deck', deckList, b.deck)}${wood ? '' : '<small>Teak laid over the glassfibre deck, as many owners have done.</small>'}</div>
        <div class="field"><span>Cabin top · ${b.cabinTop ? name(deckList, b.cabinTop) : b.deck.startsWith('teak') ? 'painted canvas' : 'like the deck'}</span>${sw('cabinTop', deckList, b.cabinTop ?? '', 'Like the deck')}</div>
        <div class="field"><span>Forehatch</span>${seg('hatch', [['teak', 'Teak'], ['acrylic', 'Acrylic (smoked, aluminium frame)']], b.hatch ?? 'teak')}</div>
        <div class="field"><span>Whisker pole stowed</span>${seg('poleSide', [['port', 'Port side deck'], ['starboard', 'Starboard side deck']], b.poleSide ?? 'port')}<small>Flat alongside the toe rail, by the cabin.</small></div>
      </section>
      <section><h3>Sails</h3>
        <div class="field"><span>Sailcloth</span>${seg('sailColor', [['white', 'White'], ['black', 'Black']], b.sails.color)}</div>
      </section>
      <section><h3>Condition <em>· changes her speed</em></h3>
        <div class="field"><span>Bottom last cleaned · <b id="bpWeeksV">${weeksLabel(b.perf.cleanedWeeks)}</b></span>
          <input type="range" data-k="weeks" min="0" max="26" step="1" value="${b.perf.cleanedWeeks}"><small>${PERF_INFO.weeks}</small></div>
        <div class="field"><span>Bottom paint finish</span>${seg('finish', [['antifouling', 'As rolled on'], ['race', 'Wet-sanded, burnished']], b.perf.finish)}<small>${PERF_INFO.finish}</small></div>
        <div class="field"><span>Mainsail</span>${seg('mainAge', ages, b.perf.mainAge)}</div>
        <div class="field"><span>Jib</span>${seg('jibAge', ages, b.perf.jibAge)}<small>${PERF_INFO.sails}</small></div>
        <div class="field"><span>Mast</span>${seg('mast', [['aluminium', 'Aluminium'], ['wood', 'Wood (spruce)']], b.perf.mast)}
          ${b.perf.mast === 'wood' ? seg('stiff', [['soft', 'Soft'], ['average', 'Average'], ['stiff', 'Stiff']], b.perf.mastStiffness) : ''}</div>
        <div class="field"><span>Boom</span>${seg('boom', [['aluminium', 'Aluminium'], ['wood', 'Wood (spruce)']], b.perf.boom)}<small>${PERF_INFO.spars}</small></div>
        <div class="field"><span>Outboard</span>${seg('outboard', [['none', 'Ashore'], ['stowed', 'Stowed aboard'], ['bracket', 'On the bracket']], b.perf.outboard)}<small>${PERF_INFO.outboard}</small></div>
        <div class="field"><span>Weight over the class minimum</span><label class="inline"><input data-k="gear" class="pick" inputmode="numeric" value="${Math.round(b.perf.gearKg / 0.4536)}"> lb</label><small>${PERF_INFO.gear}</small></div>
        <div class="bpreport" id="bpReport"></div>
      </section>
      </div>`;
    this.report();
  }
}

/** The slips, by dock; those other boats of yours have are shown as taken. */
function slipOptions(b: BoatSpec, boats: BoatSpec[]): string {
  const taken = new Map(boats.filter(x => x.id !== b.id && x.slip).map(x => [x.slip!, x.name]));
  const docks = [...new Set(SLIPS.map(s => s.dock))];
  return '<option value="">No slip</option>' + docks.map(d => `<optgroup label="Dock ${d}">${SLIPS.filter(s => s.dock === d).map(s =>
    `<option value="${s.id}"${s.id === b.slip ? ' selected' : ''}${taken.has(s.id) ? ' disabled' : ''}>${s.id}${taken.has(s.id) ? ` · ${esc(taken.get(s.id)!)}` : ''}</option>`).join('')}</optgroup>`).join('');
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export const weeksLabel = (w: number) => w === 0 ? 'just cleaned' : w === 1 ? '1 week ago' : `${w} weeks ago`;
function flagNote(b: BoatSpec): string {
  const club = BURGEES.find(x => x.id === b.club), ens = ENSIGNS.find(x => x.id === ensignFor(b.sails.country));
  const notes = [`${club ? `Her club's burgee` : CLUBS.some(c => c.id === b.club) ? 'No burgee yet (this club\'s isn\'t drawn)' : 'No burgee (no club)'}, and her country's ensign${ens ? `: ${ens.name}` : ''}, on its staff at the stern.`];
  if (ens && ens.id !== 'us' && ens.id !== 'us-yacht') notes.push('As a visitor on the Bay she flies the US flag as a courtesy flag at the starboard spreader, and her burgee moves to port.');
  notes.push('Flags fly when she\'s cruising; racing boats strike them for a race. Officers\' flags will go with skippers, in the Yacht Club.');
  return notes.join(' ');
}

