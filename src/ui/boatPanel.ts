import type { Settings } from '../settings';
import { BOTTOM_COLORS, BRIGHT_FINISH, HULL_COLORS, LINE_COLORS, ROPES, ROPE_COLORS, SAIL_COUNTRIES, TEAK_DECKS, fixSpec, lineColor, type BoatSpec, type LineColorKey, type SailAge } from '../boat/spec';
import { saveSettings } from '../settings';
import { ROPE_SHADE, hexToHsv, hsvToHex, isHex, pickerHtml, ropeSvg, ropesHtml } from './colorPicker';
import { CLUBS } from '../render/burgees';
import { conditionItems, referencePerf } from '../boat/condition';
import { benchAngles, benchSpeed } from '../boat/benchmark';
import { TUNE_DEFAULT, heikkilaFor, TUNE_PRESETS, TUNE_RANGE, fixTune, forestaySag, forestayTension, rakeDeg, tuneName, type RigTune } from '../boat/rigTune';
import { dockName, harborOf, MARINAS, slipById, slipsIn } from '../geo/marina';
import { morph } from './morph';

/**
 * Editing one of your boats (from the Fleet): her particulars (name, number, club, skipper, home marina and slip),
 * her looks, and her condition (what changes her speed) at the bottom, with what each choice costs in the conditions
 * you've chosen. Every change rebuilds the boat at once, so you see her change in the showroom view beside the panel.
 */
export class BoatPanel {
  private el: HTMLElement;
  /**
   * `changed(save)`: her setup changed (`save`: keep it: your boats saved; else shown in the showroom only, until you Save).
   * `done(saved)`: back to her page (`saved`: just saved, a quick confirmation there).
   */
  constructor(private S: Settings, private changed: (save: boolean) => void, private done: (saved: boolean) => void) {
    this.el = document.getElementById('boatPanel')!;
    this.el.addEventListener('click', e => this.click(e));
    this.el.addEventListener('keydown', e => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act="grp"]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); t.click(); } });
    this.el.addEventListener('input', e => this.input(e));
    this.el.addEventListener('change', e => this.input(e));
    // the color picker: a preset or one of your colors, None/Auto, saving a color, the hex field, and dragging its field and hue strip
    this.el.addEventListener('click', e => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-cp]'), k = this.pickKey; if (!t || !k) return;
      if (t.dataset.cp === 'preset') this.setColor(k, t.dataset.v!);
      else if (t.dataset.cp === 'clear') this.setColor(k, '');
      else if (t.dataset.cp === 'save') { const c = COLORS[k].get(this.b); if (!isHex(c)) return; const mine = (this.S.myColors ?? []).filter(x => x.toLowerCase() !== c.toLowerCase()); this.S.myColors = [...mine, c.toLowerCase()].slice(-12); saveSettings(this.S); this.render(); }
    });
    this.el.addEventListener('change', e => {
      const t = e.target as HTMLInputElement; if (t.dataset?.cp !== 'hex' || !this.pickKey) return;
      const v = t.value.trim().replace(/^([0-9a-f]{6})$/i, '#$1'); if (isHex(v)) this.setColor(this.pickKey, v.toLowerCase()); else t.value = COLORS[this.pickKey].get(this.b).toUpperCase();
    });
    this.el.addEventListener('pointerdown', e => {
      const area = (e.target as HTMLElement).closest<HTMLElement>('[data-cp="sv"], [data-cp="hue"]'), k = this.pickKey; if (!area || !k) return;
      e.preventDefault(); area.setPointerCapture(e.pointerId);
      const cur = COLORS[k].get(this.b); let [h, sat, v] = isHex(cur) ? hexToHsv(cur) : [0, 0, 1]; let last = 0;
      const at = (ev: PointerEvent, final = false) => {
        const el = this.el.querySelector<HTMLElement>(`[data-cp="${area.dataset.cp}"]`) ?? area, r = el.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
        if (area.dataset.cp === 'hue') h = x * 360; else { sat = x; v = 1 - y; }
        // (her paint follows the drag, a few times a second: each change restyles her in the showroom)
        const now = performance.now(); if (final || now - last > 90) { last = now; this.setColor(k, hsvToHex(h, sat, v)); }
      };
      at(e);
      const move = (ev: PointerEvent) => at(ev), up = (ev: PointerEvent) => { at(ev, true); area.removeEventListener('pointermove', move); area.removeEventListener('pointerup', up); };
      area.addEventListener('pointermove', move); area.addEventListener('pointerup', up);
    });
  }
  /** A color set from the picker ('' : none, or the automatic choice, where the color has one). */
  private setColor(k: ColorKey, v: string): void { this.set(b => COLORS[k].set(b, v)); }

  get open(): boolean { return !this.el.hidden; }
  show(id = this.S.boatId): void {
    this.editId = id; this.leaving = null; this.grpOpen = null; this.pickKey = null; this.ropeKey = null;
    this.snap = structuredClone({ boats: this.S.boats, boatId: this.S.boatId, opponents: this.S.opponents }); // for "Discard changes"
    this.render(); this.el.hidden = false;
  }
  /** Your boats as they were when you opened the panel. */
  private snap: { boats: BoatSpec[]; boatId: string; opponents: string[] } | null = null;
  /** Leaving with changes unsaved (the owner): where to, once you've said Save or Discard. */
  private leaving: (() => void) | null = null;
  get edited(): boolean { return !!this.snap && JSON.stringify(this.snap) !== JSON.stringify({ boats: this.S.boats, boatId: this.S.boatId, opponents: this.S.opponents }); }
  /** The showroom's slow turn: pause it to look at her from one side (set by main; returns whether she's turning now). */
  onSpin: (() => boolean) | null = null;
  private spinning = true;
  /** The group open (one at a time), the color whose picker is open, the line whose ropes are open. */
  private grpOpen: string | null = null;
  private pickKey: ColorKey | null = null;
  private ropeKey: LineColorKey | null = null;
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
    this.changed(false); if (rerender) this.render(); else { this.report(); if (!this.el.querySelector('[data-act="save"]') && this.edited) this.render(); } // (shown, not yet kept: Save keeps it)
  }
  /** Keep her changes: your boats saved, and the panel's starting point moved up to them. */
  private keep(): void { this.changed(true); this.snap = structuredClone({ boats: this.S.boats, boatId: this.S.boatId, opponents: this.S.opponents }); }
  /** Put her back as she was when the panel opened. */
  private revert(): void {
    if (!this.snap) return;
    const s0 = structuredClone(this.snap);
    this.S.boats = s0.boats; this.S.boatId = s0.boatId; this.S.opponents = s0.opponents;
    this.S.boat = this.S.boats.find(x => x.id === s0.boatId) ?? this.S.boats[0];
    if (!this.S.boats.some(x => x.id === this.editId)) this.editId = this.S.boatId;
    this.changed(true);
  }
  /** Done (or Esc): back to her page, asking first if her changes aren't saved. */
  requestDone(): void { this.leave(() => this.done(false)); }
  /** Go on (Done, Esc, the start page), or with changes unsaved, ask first: Save or Discard. */
  leave(next: () => void): void {
    if (!this.edited) { next(); return; }
    this.leaving = next; this.render();
  }
  private uniqueName(base: string): string {
    const names = new Set(this.S.boats.map(b => b.name)); let n = base, k = 2;
    while (names.has(n)) n = `${base} ${k++}`;
    return n;
  }

  private click(e: Event): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]'); if (!t) return;
    const v = t.dataset.v ?? '';
    switch (t.dataset.act) {
      case 'grp': this.grpOpen = this.grpOpen === v ? null : v; this.pickKey = null; this.ropeKey = null; this.render(); return;
      case 'pick': this.pickKey = this.pickKey === v ? null : v as ColorKey; this.render(); return;
      case 'ropePick': this.ropeKey = this.ropeKey === v ? null : v as LineColorKey; this.render(); return;
      case 'rope': { const k = t.dataset.line as LineColorKey, r = ROPES.find(x => x.id === v); if (!r) return;
        this.set(b => { b.lineRopes = { ...b.lineRopes, [k]: r.id }; b.lineColors = { ...b.lineColors, [k]: r.band }; }); return; }
      case 'toClub': this.leave(() => this.done(false)); return; // (her skipper is chosen on her page in the Yacht Club)
      case 'deckKind': this.set(b => { if (v === 'painted') { if (!isHex(b.deck)) b.deck = '#8e9f7c'; } else b.deck = v; }); return;
      case 'done': this.leave(() => this.done(false)); return;
      case 'save': this.keep(); this.done(true); return;
      case 'askSave': { const go = this.leaving; this.leaving = null; this.keep(); go?.(); return; }
      case 'askDiscard': { const go = this.leaving; this.leaving = null; this.revert(); go?.(); return; }
      case 'spin': if (this.onSpin) { this.spinning = this.onSpin(); t.textContent = this.spinning ? 'Pause turning' : 'Turn her'; t.setAttribute('aria-pressed', String(!this.spinning)); } return;
      case 'skipper': this.set(b => { b.skipper = v === 'you' ? 'you' : 'ai'; }); return;
      case 'material': this.set(b => { b.hull.material = v as BoatSpec['hull']['material']; if (v === 'wood' && b.deck === '#8e9f7c') b.deck = 'teak-silver'; }); return;
      case 'upper': this.set(b => { b.hull.upper = v; }); return;
      case 'lower': this.set(b => { b.hull.lower = v; }); return;
      case 'stripe': this.set(b => { b.hull.stripe = v; }); return;
      case 'deck': this.set(b => { b.deck = v; }); return;
      case 'cabinTop': this.set(b => { if (v) b.cabinTop = v; else delete b.cabinTop; }); return;
      case 'poleSide': this.set(b => { b.poleSide = v === 'starboard' ? 'starboard' : 'port'; }); return;
      case 'navLights': this.set(b => { b.navLights = v === 'tricolour' ? 'tricolour' : 'deck'; }); return;
      case 'hatch': this.set(b => { b.hatch = v === 'acrylic' ? 'acrylic' : 'teak'; }); return;
      case 'cockpit': this.set(b => { b.cockpit = v === 'fiberglass' ? 'fiberglass' : 'teak'; }); return;
      case 'companionway': this.set(b => { b.companionway = v === 'closed' ? 'closed' : 'open'; }); return;
      case 'nameColor': this.set(b => { if (/^#[0-9a-f]{6}$/i.test(v)) b.nameColor = v; else delete b.nameColor; }); return;
      case 'sailColor': this.set(b => { b.sails.color = v as 'white' | 'black'; }); return;
      case 'numberColor': case 'insigniaColor': { const k = t.dataset.act as 'numberColor' | 'insigniaColor'; this.set(b => { if (/^#[0-9a-f]{6}$/i.test(v)) b.sails[k] = v; else delete b.sails[k]; }); return; }
      case 'mainAge': this.set(b => { b.perf.mainAge = v as SailAge; }); return;
      case 'jibAge': this.set(b => { b.perf.jibAge = v as SailAge; }); return;
      case 'mast': this.set(b => { b.perf.mast = v as 'wood' | 'aluminium'; }); return;
      case 'boom': this.set(b => { b.perf.boom = v as 'wood' | 'aluminium'; }); return;
      case 'stiff': this.set(b => { b.perf.mastStiffness = v as BoatSpec['perf']['mastStiffness']; }); return;
      case 'outboard': this.set(b => { b.perf.outboard = v as BoatSpec['perf']['outboard']; }); return;
      case 'tune': this.set(b => { // (Auto: none set, she's tuned for the forecast at the dock)
        if (v === 'auto') delete b.perf.tune;
        else if (v === 'heikkila') b.perf.tune = heikkilaFor(this.S.windKt || 12); // (his shrouds and jumpers for the wind you've set up)
        else if (v in TUNE_PRESETS) b.perf.tune = { ...TUNE_PRESETS[v as keyof typeof TUNE_PRESETS] };
      }); return;
      case 'outboardHp': this.set(b => { b.perf.outboardHp = Number(v) as 2.5 | 3.5 | 6; }); return;
      case 'finish': this.set(b => { b.perf.finish = v as BoatSpec['perf']['finish']; }); return;
      case 'lineColor': { const k = t.dataset.line as LineColorKey; this.set(b => { const c = { ...b.lineColors, [k]: v }; if (v === LINE_COLORS[k]) delete c[k]; if (Object.keys(c).length) b.lineColors = c; else delete b.lineColors; }); return; }
      case 'lineColorsReset': this.set(b => { delete b.lineColors; delete b.lineRopes; }); return;
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
      case 'marina': this.set(b => { if (t.value) { if (t.value !== b.marina) delete b.slip; b.marina = t.value; } else { delete b.marina; delete b.slip; } }); return; // (a slip belongs to its marina)
      case 'slip': this.set(b => { if (t.value) { b.slip = t.value; b.marina = slipById(t.value)?.marina ?? b.marina; } else delete b.slip; }); return;
      case 'weeks': { const out = this.el.querySelector('#bpWeeksV'); if (out) out.textContent = weeksLabel(Number(t.value)); if (final) this.set(b => { b.perf.cleanedWeeks = Number(t.value); }, false); return; }
      case 'gear': if (final) this.set(b => { b.perf.gearKg = Number(t.value) * 0.4536; }, false); return;
      case 'jumpersUnderWay': if (final) this.set(b => { if ((t as HTMLInputElement).checked) b.perf.jumpersUnderWay = true; else delete b.perf.jumpersUnderWay; }); return;
      case 'tuneMark': case 'tuneFoot': case 'tuneShroud': case 'tuneJumper': {
        const key = ({ tuneMark: 'forestayMark', tuneFoot: 'footAft', tuneShroud: 'shroudTurns', tuneJumper: 'jumperTurns' } as const)[k];
        const val = key === 'forestayMark' ? Number(t.value) / 100 : Number(t.value);
        const tune = fixTune({ ...(this.b.perf.tune ?? TUNE_DEFAULT), [key]: val });
        const out = this.el.querySelector(`#bp_${k}`); if (out) out.textContent = tuneLabel(key, tune);
        if (final) this.set(b => { b.perf.tune = tune; }); else this.tuneReadout(tune); // (on release: redrawn, so the preset shows 'Your own')
        return;
      }
    }
  }

  /** The forestay's sag and the rake for the tune being set, as you drag (before it's saved). */
  private tuneReadout(t: RigTune): void { const el = this.el.querySelector('#bpTuneRead'); if (el) el.innerHTML = tuneReadout(t); }

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
        + `</table>`;
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
    const b = this.b, S = this.S;
    const seg = (act: string, opts: [string, string][], cur: string) => `<div class="seg">${opts.map(([v, n]) => `<button type="button" data-act="${act}" data-v="${v}" aria-pressed="${cur === v}">${n}</button>`).join('')}</div>`;
    const ages: [SailAge, string][] = [['new', 'New'], ['mid', 'Midlife'], ['old', 'End of life']];
    const ageName = (a: SailAge) => ages.find(x => x[0] === a)![1];
    // one property per row: the label left, its value or control right
    const kv = (label: string, v: string) => `<div class="be-kv"><span>${label}</span>${v}</div>`;
    const val = (t: string, mu = false) => `<span class="be-v${mu ? ' mu' : ''}">${t}</span>`;
    const sq = (c: string) => `<i class="be-sq" style="background:${c}"></i>`;
    const colorVal = (k: ColorKey) => { const c = COLORS[k], v = c.get(b); return isHex(v) ? val(`${sq(v)}${esc(colorName(v, c.presets(b)))}`) : val(esc(c.clear ?? ''), true); };
    // a color's row (open): its button, and the one picker under it while it's the one being set
    const colorRow = (k: ColorKey) => {
      const c = COLORS[k], v = c.get(b), on = this.pickKey === k;
      return kv(c.label, `<button type="button" class="be-cbtn${on ? ' on' : ''}" data-act="pick" data-v="${k}">${isHex(v) ? `<i style="background:${v}"></i>${esc(colorName(v, c.presets(b)))}` : `<i class="none"></i>${esc(c.clear ?? '')}`}</button>`)
        + (on ? pickerHtml(k, v, c.presets(b), S.myColors ?? [], c.clear) : '');
    };
    const rope = (k: LineColorKey) => { const r = ROPES.find(x => x.id === b.lineRopes?.[k]); return r ? { svg: ropeSvg(r), name: r.name } : { svg: ropeSvg({ base: lineColor(b, k), kind: 'solid' }), name: colorName(lineColor(b, k), ROPE_COLORS.map(([n, c]) => [n, c] as [string, string])) || 'Band color' }; };
    const ropeRow = (k: LineColorKey, n: string) => { const r = rope(k), on = this.ropeKey === k;
      return kv(n, `<button type="button" class="be-cbtn${on ? ' on' : ''}" data-act="ropePick" data-v="${k}">${r.svg}${esc(r.name)}</button>`) + (on ? ropesHtml(k, b.lineRopes?.[k]) : ''); };
    const deckKind = b.deck.startsWith('teak') ? b.deck : 'painted';
    const tune = b.perf.tune ? tuneName(fixTune(b.perf.tune)) : 'auto';
    const slip = slipById(b.slip);
    // the groups: folded to a short summary; Change opens one (and folds the others)
    const grp = (id: string, label: string, sum: string[], open: () => string) => {
      const on = this.grpOpen === id;
      return `<section class="be-grp${on ? ' open' : ''}" data-grp="${id}"><header data-act="grp" data-v="${id}" role="button" tabindex="0" aria-expanded="${on}"><b>${label}</b><i>${on ? 'Done ▴' : 'Change ▾'}</i></header><div class="be-in">${on ? open() : sum.join('')}</div></section>`;
    };
    morph(this.el, `
      <div class="bphead"><h2>Edit ${esc(b.name || 'her')}</h2><button type="button" class="ghost sm" data-act="spin" aria-pressed="${!this.spinning}">${this.spinning ? 'Pause turning' : 'Turn her'}</button>${this.leaving ? '' : this.edited ? '<button type="button" class="cta" data-act="save">Save</button>' : '<button type="button" class="cta" data-act="done">Done</button>'}</div>
      <div class="garage">
        ${this.leaving ? '<div class="gconfirm">Save changes? <button type="button" class="cta sm" data-act="askSave">Save</button><button type="button" class="ghost" data-act="askDiscard">Discard</button></div>' : ''}
      </div>
      <div class="bpbody be">${ROPE_SHADE}
      ${grp('her', 'Her', [
        kv('Boat', val(`<span class="be-tile"><i style="border-color:${b.hull.upper}"></i>${esc(b.name || 'Unnamed')}</span>`)),
        kv('Sail number', val(esc(`${b.sails.country} ${b.sails.number}`.trim()))),
        kv('Club', val(esc(CLUBS.find(c => c.id === b.club)?.club ?? 'None'))),
        kv('Skipper', val(`${b.skipper === 'you' ? 'You' : 'AI skipper'} · <button type="button" class="linkbtn" data-act="toClub">Yacht Club ›</button>`))
      ], () => [
        kv('Name', `<input data-k="name" class="pick" maxlength="18" value="${esc(b.name)}">`),
        kv('Sail number', `<span class="be-row2"><select data-k="country" class="pick" aria-label="Home country (national letters)">${SAIL_COUNTRIES.some(c => c[0] === b.sails.country) ? '' : `<option value="${esc(b.sails.country)}" selected>${esc(b.sails.country || 'No letters')}</option>`}${SAIL_COUNTRIES.map(([c, n]) => `<option value="${c}"${c === b.sails.country ? ' selected' : ''}>${c ? `${c} · ${esc(n)}` : esc(n)}</option>`).join('')}</select><input data-k="number" class="pick be-num" inputmode="numeric" maxlength="5" value="${esc(b.sails.number)}" aria-label="Number"></span>`),
        kv('Club', `<select data-k="club" class="pick"><option value="">None</option>${CLUBS.map(c => `<option value="${c.id}"${c.id === b.club ? ' selected' : ''}>${esc(c.club)}</option>`).join('')}</select>`),
        kv('Skipper', val(`${b.skipper === 'you' ? 'You' : 'AI skipper'} · <button type="button" class="linkbtn" data-act="toClub">Yacht Club ›</button>`))
      ].join(''))}
      ${grp('hull', 'Hull', [kv('Topsides', colorVal('upper')), kv('Boot stripe', colorVal('stripe')), kv('Bottom', colorVal('lower')), kv('Last cleaned', val(weeksLabel(b.perf.cleanedWeeks)))], () => [
        kv('Hull', seg('material', [['fiberglass', 'Fiberglass'], ['wood', 'Wood']], b.hull.material)),
        colorRow('upper'), colorRow('stripe'), colorRow('lower'),
        kv('Bottom finish', seg('finish', [['antifouling', 'As rolled on'], ['race', 'Burnished']], b.perf.finish)),
        kv('Last cleaned', `<span class="be-v be-slide"><input type="range" data-k="weeks" min="0" max="26" step="1" value="${b.perf.cleanedWeeks}"><em id="bpWeeksV">${weeksLabel(b.perf.cleanedWeeks)}</em></span>`),
        colorRow('nameColor'),
        kv('Over the minimum', `<span class="be-v"><input data-k="gear" class="pick be-num" inputmode="numeric" value="${Math.round(b.perf.gearKg / 0.4536)}"> lb</span>`)
      ].join(''))}
      ${grp('deck', 'Deck and cabin', [kv('Deck', deckKind === 'painted' ? colorVal('deck') : val(esc(TEAK_DECKS.find(x => x[1] === deckKind)?.[0] ?? 'Teak'))), kv('Forehatch', val(b.hatch === 'teak' ? 'Teak' : 'Acrylic')), kv('Outboard', val(({ none: 'Ashore', stowed: 'Stowed aboard', bracket: 'On the bracket' } as const)[b.perf.outboard]))], () => [
        kv('Deck', seg('deckKind', [['painted', 'Painted'], ...TEAK_DECKS.map(([n, k]) => [k, n.replace(' teak', '')] as [string, string])], deckKind)),
        deckKind === 'painted' ? colorRow('deck') : '', colorRow('cabinTop'),
        kv('Forehatch', seg('hatch', [['teak', 'Teak'], ['acrylic', 'Acrylic']], b.hatch ?? 'acrylic')),
        kv('Cockpit', seg('cockpit', [['teak', 'Teak'], ['fiberglass', 'Fiberglass']], b.cockpit ?? 'teak')),
        kv('Companionway', seg('companionway', [['open', 'Open'], ['closed', 'Closed']], b.companionway ?? 'open')),
        kv('Whisker pole', seg('poleSide', [['port', 'Port deck'], ['starboard', 'Starboard deck']], b.poleSide ?? 'port')),
        kv('Navigation lights', seg('navLights', [['deck', 'Bow and stern'], ['tricolour', 'Masthead']], b.navLights ?? 'deck')),
        kv('Outboard', seg('outboard', [['none', 'Ashore'], ['stowed', 'Stowed'], ['bracket', 'Bracket']], b.perf.outboard)),
        b.perf.outboard !== 'none' ? kv('Outboard size', seg('outboardHp', [['2.5', '2.5 hp'], ['3.5', '3.5 hp'], ['6', '6 hp']], String(b.perf.outboardHp ?? 3.5))) : ''
      ].join(''))}
      ${grp('rig', 'Rig', [kv('Mast and boom', val(b.perf.mast === b.perf.boom ? (b.perf.mast === 'wood' ? 'Wood' : 'Aluminum') : `${b.perf.mast === 'wood' ? 'Wood' : 'Aluminum'} · ${b.perf.boom === 'wood' ? 'wood' : 'aluminum'}`)), kv('Rig tune', val(tune === 'auto' ? 'For the forecast' : tune === 'custom' ? 'Your own' : esc(tune)))], () => [
        kv('Mast', seg('mast', [['aluminium', 'Aluminum'], ['wood', 'Wood']], b.perf.mast)),
        b.perf.mast === 'wood' ? kv('Mast stiffness', seg('stiff', [['soft', 'Soft'], ['average', 'Average'], ['stiff', 'Stiff']], b.perf.mastStiffness)) : '',
        kv('Boom', seg('boom', [['aluminium', 'Aluminum'], ['wood', 'Wood']], b.perf.boom)),
        `<div class="be-tune">${rigTuneFields(b, seg)}</div>`
      ].join(''))}
      ${grp('sails', 'Sails', [kv('Sailcloth', val(b.sails.color === 'black' ? 'Black' : 'White Dacron')), kv('Main · jib', val(b.perf.mainAge === b.perf.jibAge ? ageName(b.perf.mainAge) : `${ageName(b.perf.mainAge)} · ${ageName(b.perf.jibAge).toLowerCase()}`)), kv('Numbers and F', colorVal('numberColor'))], () => [
        kv('Sailcloth', seg('sailColor', [['white', 'White'], ['black', 'Black']], b.sails.color)),
        kv('Mainsail', seg('mainAge', ages, b.perf.mainAge)), kv('Jib', seg('jibAge', ages, b.perf.jibAge)),
        colorRow('numberColor'), colorRow('insigniaColor')
      ].join(''))}
      ${grp('lines', 'Lines', [...(['jibsheet', 'mainsheet', 'downhaul'] as LineColorKey[]).map(k => kv(LINE_ROWS.find(x => x[0] === k)![1], val(`${rope(k).svg}`))), kv(`${LINE_ROWS.length - 3} more`, val('Change to see', true))], () =>
        LINE_ROWS.map(([k, n]) => ropeRow(k, n)).join('') + (b.lineColors || b.lineRopes ? kv('', '<button type="button" class="linkbtn" data-act="lineColorsReset">Back to the band\'s colors</button>') : ''))}
      ${grp('berth', 'Home berth', [kv('Marina', val(esc(b.marina ? MARINAS.find(m => m.id === b.marina)?.name ?? '' : 'None'))), ...(b.marina ? [kv('Slip', val(slip ? esc(`${(n => n[0].toUpperCase() + n.slice(1))(dockName(slip.dock))}, ${slip.label.toLowerCase()}`) : 'None'))] : [])], () => [
        kv('Marina', `<select data-k="marina" class="pick"><option value="">None</option>${MARINAS.map(m => `<option value="${m.id}"${m.id === b.marina ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select>`),
        b.marina ? kv(`Slip in ${esc(harborOf(b.marina)?.short ?? '')}`, `<select data-k="slip" class="pick">${slipOptions(b, this.S.boats)}</select>`) : ''
      ].join(''))}
      ${grp('speed', 'Speed', [kv(`What she gives away`, val('Change to see', true))], () => '<div class="bpreport" id="bpReport"></div>')}
      </div>`);
    this.report();
  }
}

/** The lines in the editor, in the band's order (port to starboard, then the thwart). */
const LINE_ROWS: [LineColorKey, string][] = [['jibsheet', 'Jib sheets'], ['downhaul', 'Main halyard'], ['jibCunningham', 'Jib Cunningham'], ['cunningham', 'Main Cunningham'],
  ['outhaul', 'Outhaul'], ['vang', 'Vang'], ['jibHalyard', 'Jib halyard'], ['mainsheet', 'Mainsheet'], ['backstay', 'Backstay']];
/** A color's name: the preset's it matches, or its hex. */
function colorName(c: string, presets: [string, string][]): string {
  return presets.find(([, x]) => x.toLowerCase() === c.toLowerCase())?.[0] ?? c.toUpperCase();
}
/** Name lettering's usual colors (the sign-writer's). */
const LETTERING: [string, string][] = [['Dark green', '#1e5236'], ['Navy', '#1f2c4f'], ['Black', '#16181b'], ['Gold', '#a8802f'], ['Red', '#8c1d24']];
/** Every color on the boat, each with its picker's presets and, where it has one, its "none" or automatic choice. */
type ColorKey = 'upper' | 'stripe' | 'lower' | 'deck' | 'cabinTop' | 'nameColor' | 'numberColor' | 'insigniaColor';
const inks = () => NUMBER_INKS.map(([c, n]) => [n, c] as [string, string]);
const COLORS: Record<ColorKey, { label: string; get: (b: BoatSpec) => string; set: (b: BoatSpec, v: string) => void; presets: (b: BoatSpec) => [string, string][]; clear?: string }> = {
  upper: { label: 'Topsides', get: b => b.hull.upper, set: (b, v) => { if (v) b.hull.upper = v; }, presets: b => b.hull.material === 'wood' ? [...HULL_COLORS, BRIGHT_FINISH] : HULL_COLORS },
  stripe: { label: 'Boot stripe', get: b => b.hull.stripe, set: (b, v) => { b.hull.stripe = v; }, presets: () => HULL_COLORS, clear: 'None' },
  lower: { label: 'Bottom paint', get: b => b.hull.lower, set: (b, v) => { if (v) b.hull.lower = v; }, presets: () => BOTTOM_COLORS },
  deck: { label: 'Deck paint', get: b => b.deck, set: (b, v) => { if (v) b.deck = v; }, presets: () => HULL_COLORS },
  cabinTop: { label: 'Cabin top', get: b => b.cabinTop ?? '', set: (b, v) => { if (v) b.cabinTop = v; else delete b.cabinTop; }, presets: () => HULL_COLORS, clear: 'Like the deck' },
  nameColor: { label: 'Name lettering', get: b => b.nameColor ?? '', set: (b, v) => { if (v) b.nameColor = v; else delete b.nameColor; }, presets: () => LETTERING, clear: 'Auto' },
  numberColor: { label: 'Sail numbers', get: b => b.sails.numberColor ?? '', set: (b, v) => { if (v) b.sails.numberColor = v; else delete b.sails.numberColor; }, presets: inks, clear: 'Auto' },
  insigniaColor: { label: 'Class letter F', get: b => b.sails.insigniaColor ?? '', set: (b, v) => { if (v) b.sails.insigniaColor = v; else delete b.sails.insigniaColor; }, presets: inks, clear: 'Like the numbers' }
};
/** The slips, by dock; those other boats of yours have are shown as taken. */
function slipOptions(b: BoatSpec, boats: BoatSpec[]): string {
  const id = (x: string | undefined) => slipById(x)?.id; // (older saves name West Harbor's slips without the marina)
  const taken = new Map(boats.filter(x => x.id !== b.id && id(x.slip)).map(x => [id(x.slip)!, x.name])), mine = id(b.slip);
  const slips = slipsIn(b.marina), docks = [...new Set(slips.map(s => s.dock))];
  return '<option value="">No slip</option>' + docks.map(d => `<optgroup label="${(n => n[0].toUpperCase() + n.slice(1))(dockName(d))}">${slips.filter(s => s.dock === d).map(s =>
    `<option value="${s.id}"${s.id === mine ? ' selected' : ''}${taken.has(s.id) ? ' disabled' : ''}>${s.label}${taken.has(s.id) ? ` · ${esc(taken.get(s.id)!)}` : ''}</option>`).join('')}</optgroup>`).join('');
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export const weeksLabel = (w: number) => w === 0 ? 'just cleaned' : w === 1 ? '1 week ago' : `${w} weeks ago`;


/* ---------- the rig tune (boat/rigTune.ts) ---------- */

/** A tune setting in the guides' own units. */
function tuneLabel(k: keyof RigTune, t: RigTune): string {
  switch (k) {
    case 'forestayMark': return `${(t.forestayMark * 100).toFixed(1)} cm`;
    case 'footAft': return `${Math.round(t.footAft)} mm aft`;
    case 'shroudTurns': return t.shroudTurns ? `+${t.shroudTurns} turns` : 'light-air setting';
    case 'jumperTurns': return t.jumperTurns ? `${t.jumperTurns} turns` : 'loose';
  }
}
/** What the tune does, as a sailor would check it: the forestay's sag beating with the backstay off, and the rake. */
function tuneReadout(t: RigTune): string {
  const T = forestayTension(t), sag = (tws: number) => { const m = forestaySag(T, tws * 1.45); return `${m >= 0.2 ? '20+' : Math.round(100 * m)} cm in ${tws} kt`; }; // (apparent ≈ 1.45 × true, beating)
  const dr = rakeDeg(t) - rakeDeg(TUNE_DEFAULT);
  return `Forestay sag beating, backstay off: ${[6, 12, 18].map(sag).join(' · ')}. Rake ${Math.abs(dr) < 0.05 ? 'as North Sails sets it' : `${Math.abs(dr).toFixed(1)}° ${dr > 0 ? 'more aft (more weather helm)' : 'more upright (less weather helm)'} than North Sails'`}.`;
}
type Seg = (act: string, opts: [string, string][], cur: string) => string;
function rigTuneFields(b: BoatSpec, seg: Seg): string {
  const t = b.perf.tune ? fixTune(b.perf.tune) : null, cur = t ? tuneName(t) : 'auto';
  const range = (k: string, key: keyof RigTune, scale: number, step: number) => {
    const [lo, hi] = TUNE_RANGE[key], v = (t ?? TUNE_DEFAULT)[key];
    return `<input type="range" data-k="${k}" min="${lo * scale}" max="${hi * scale}" step="${step}" value="${v * scale}"${t ? '' : ' disabled'}>`;
  };
  const row = (k: string, key: keyof RigTune, label: string, scale: number, step: number) =>
    `<div class="field"><span>${label} · <b id="bp_${k}">${tuneLabel(key, t ?? TUNE_DEFAULT)}</b></span>${range(k, key, scale, step)}</div>`;
  return `<div class="field"><span>Rig tune · set at the dock</span>${seg('tune', [['auto', 'For the forecast'], ['light', 'North Sails light'], ['medium', 'North Sails medium'], ['strong', 'North Sails strong'], ['heikkila', 'Heikkilä'], ...(cur === 'custom' ? [['custom', 'Your own'] as [string, string]] : [])], cur)}</div>
    ${t ? `${row('tuneMark', 'forestayMark', 'Forestay mark (rake)', 100, 0.5)}
    ${row('tuneFoot', 'footAft', 'Mast foot', 1, 1)}
    ${row('tuneShroud', 'shroudTurns', 'Shrouds', 1, 0.25)}
    ${row('tuneJumper', 'jumperTurns', 'Jumpers', 1, 0.5)}
    <div class="field"><small id="bpTuneRead">${tuneReadout(t)}</small></div>` : ''}
    <div class="field"><label class="inline"><input type="checkbox" data-k="jumpersUnderWay"${b.perf.jumpersUnderWay ? ' checked' : ''}> Adjust the jumpers under way</label></div>`;
}

/** Colours for the sail numbers and the F: the usual sailmakers' vinyls. */
const NUMBER_INKS: [string, string][] = [['#16181b', 'Black'], ['#1f2c4f', 'Navy'], ['#2456a8', 'Blue'], ['#b3202a', 'Red'], ['#1e5236', 'Green'], ['#f4f4f0', 'White']];
