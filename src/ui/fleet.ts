import type { Settings } from '../settings';
import { BOTTOM_COLORS, BRIGHT_FINISH, HULL_COLORS, TEAK_DECKS, countryName, freeNumber, newBoat, sailNo, type BoatSpec } from '../boat/spec';
import { CLUBS } from '../render/burgees';
import { HARBOR, marinaName, slipById } from '../geo/marina';
import { logFor, record, type LogEntry } from '../boat/logbook';

/**
 * The Fleet: your boats, as a grid of cards (her profile, name and number) or a table of her particulars (name,
 * number, club, skipper, home marina and slip). Open one for her page: her particulars, her race record and who's
 * sailed her; edit her, delete her, or sail her (race or cruise, from her slip if she has one).
 */
export interface FleetHooks {
  /** Your boats changed (saved by the caller). */
  changed(): void;
  /** Show her in the showroom (her page is open), or stop (null). */
  showroom(b: BoatSpec | null): void;
  /** Edit her in the boat panel; it calls back `fleet.openBoat(id)` when you're done. */
  edit(id: string): void;
  /** Sail her: race or cruise, from her slip or not. */
  sail(id: string, mode: 'race' | 'cruise', fromSlip: boolean): void;
  /** Leave the Fleet (back where you came from). */
  back(): void;
}

const VIEW_KEY = 'fbsim-fleet-view';

export class Fleet {
  private list = document.getElementById('fleet')!;
  private page = document.getElementById('fleetBoat')!;
  private pick = document.getElementById('sailHer')!;
  private view: 'grid' | 'list' = 'grid';
  private boatId = '';
  private confirmDelete = false;
  constructor(private S: Settings, private hooks: FleetHooks) {
    try { if (localStorage.getItem(VIEW_KEY) === 'list') this.view = 'list'; } catch { /* storage unavailable */ }
    for (const el of [this.list, this.page, this.pick]) el.addEventListener('click', e => this.click(e));
  }

  /** Her page is open (she's in the showroom). */
  get boatOpen(): boolean { return !this.page.hidden; }
  get showing(): BoatSpec | null { return this.boatOpen ? this.cur : null; }
  private get cur(): BoatSpec | null { return this.S.boats.find(b => b.id === this.boatId) ?? null; }
  get open(): boolean { return !this.list.hidden || this.boatOpen || !this.pick.hidden; }

  openList(): void {
    this.page.hidden = true; this.pick.hidden = true; this.hooks.showroom(null);
    this.drawList(); this.list.hidden = false;
  }
  openBoat(id: string): void {
    const b = this.S.boats.find(x => x.id === id); if (!b) { this.openList(); return; }
    this.boatId = id; this.confirmDelete = false;
    this.list.hidden = true; this.pick.hidden = true;
    this.drawBoat(); this.page.hidden = false; this.hooks.showroom(b);
  }
  close(): void { this.list.hidden = true; this.page.hidden = true; this.pick.hidden = true; this.hooks.showroom(null); }

  private click(e: Event): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-f]'); if (!t) return;
    const v = t.dataset.v ?? '';
    switch (t.dataset.f) {
      case 'back': this.close(); this.hooks.back(); return;
      case 'view': this.view = v === 'list' ? 'list' : 'grid'; try { localStorage.setItem(VIEW_KEY, this.view); } catch { /* ignore */ } this.drawList(); return;
      case 'boat': this.openBoat(v); return;
      case 'toList': this.openList(); return;
      case 'new': {
        const names = new Set(this.S.boats.map(b => b.name)); let n = 'NEW BOAT', k = 2; while (names.has(n)) n = `NEW BOAT ${k++}`;
        const nb = newBoat(n); nb.sails.number = freeNumber(this.S.boats, 100); delete nb.slip; delete nb.marina;
        this.S.boats.push(nb); this.hooks.changed(); this.close(); this.hooks.edit(nb.id); return;
      }
      case 'edit': this.close(); this.hooks.edit(this.boatId); return;
      case 'del': this.confirmDelete = true; this.drawBoat(); return;
      case 'delNo': this.confirmDelete = false; this.drawBoat(); return;
      case 'delYes': {
        if (this.S.boats.length <= 1) return;
        const gone = this.boatId;
        this.S.boats = this.S.boats.filter(x => x.id !== gone);
        this.S.opponents = this.S.opponents.filter(o => o !== gone);
        if (this.S.boatId === gone) { this.S.boat = this.S.boats[0]; this.S.boatId = this.S.boat.id; }
        this.hooks.changed(); this.openList(); return;
      }
      case 'sail': this.drawPick(); this.pick.hidden = false; return;
      case 'pickNo': this.pick.hidden = true; return;
      case 'go': {
        const slip = (this.pick.querySelector('#shSlip') as HTMLInputElement | null)?.checked ?? false;
        this.close(); this.hooks.sail(this.boatId, v === 'cruise' ? 'cruise' : 'race', slip); return;
      }
    }
  }

  /* ---------- the list ---------- */
  private drawList(): void {
    const boats = this.S.boats;
    const body = this.view === 'grid'
      ? `<div class="fgrid">${boats.map(b => `<button type="button" class="fcard" data-f="boat" data-v="${b.id}">${profileSvg(b)}<b>${esc(b.name || 'Unnamed')}</b><span>${esc(sailNo(b))}</span></button>`).join('')}</div>`
      : `<div class="ftable"><table><thead><tr><th>Name</th><th>Sail no.</th><th>Yacht club</th><th>Skipper</th><th>Home marina</th><th>Slip</th></tr></thead><tbody>${boats.map(b =>
          `<tr data-f="boat" data-v="${b.id}" tabindex="0"><td><i class="fdot" style="background:${b.hull.upper}"></i>${esc(b.name || 'Unnamed')}</td><td>${esc(sailNo(b))}</td><td>${esc(clubName(b.club) || '—')}</td><td>${skipperName(b)}</td><td>${esc(shortMarina(b.marina) || '—')}</td><td>${b.slip ?? '—'}</td></tr>`).join('')}</tbody></table></div>`;
    this.list.innerHTML = `<div class="panel wide fleetpanel">
      <button type="button" class="linkbtn back" data-f="back">‹ Back</button>
      <div class="fhead"><div><div class="eyebrow">Fleet</div><h1>Your boats</h1></div>
        <div class="seg"><button type="button" data-f="view" data-v="grid" aria-pressed="${this.view === 'grid'}">Grid</button><button type="button" data-f="view" data-v="list" aria-pressed="${this.view === 'list'}">List</button></div>
        <button type="button" class="cta" data-f="new">New boat</button></div>
      ${body}
      <small class="fnote">${boats.length} boat${boats.length === 1 ? '' : 's'}. Open one to see her record, edit her, or sail her.</small></div>`;
  }

  /* ---------- her page ---------- */
  private drawBoat(): void {
    const b = this.cur!, log = logFor(b.id), rec = record(log), races = log.filter(e => e.kind === 'race');
    const slip = slipById(b.slip);
    const row = (k: string, v: string) => `<tr><td>${k}</td><td>${v}</td></tr>`;
    const colour = (list: [string, string][], c: string) => list.find(x => x[1] === c)?.[0] ?? '';
    const p = b.perf, ages = { new: 'new', mid: 'midlife', old: 'end of life' } as const;
    this.page.innerHTML = `
      <div class="bphead"><button type="button" class="linkbtn" data-f="toList">‹ Fleet</button><h2>${esc(b.name || 'Unnamed')}</h2><span class="fno">${esc(sailNo(b))}</span></div>
      <div class="garage">
        <div class="gbtns"><button type="button" class="cta" data-f="sail">Sail her</button><button type="button" class="ghost" data-f="edit">Edit</button>${this.S.boats.length > 1 ? '<button type="button" class="ghost" data-f="del">Delete</button>' : ''}</div>
        ${this.confirmDelete ? `<div class="gconfirm">Delete ${esc(b.name || 'this boat')} and her record? <button type="button" class="ghost danger" data-f="delYes">Delete</button><button type="button" class="ghost" data-f="delNo">Keep her</button></div>` : ''}
      </div>
      <div class="bpbody">
      <section><h3>Particulars</h3><table class="ftab">
        ${row('Sail number', esc(sailNo(b)))}
        ${row('Country', esc(countryName(b.sails.country) || '—'))}
        ${row('Yacht club', esc(clubName(b.club) || 'None'))}
        ${row('Skipper', skipperName(b))}
        ${row('Home marina', esc(marinaName(b.marina) || 'None'))}
        ${row('Slip', slip ? `${slip.id} (dock ${slip.dock}, ${HARBOR.name})` : 'None')}
      </table></section>
      <section><h3>The boat</h3><table class="ftab">
        ${row('Built', b.hull.material === 'wood' ? 'Wood, clinker' : 'Fiberglass')}
        ${row('Topsides', colour([...HULL_COLORS, BRIGHT_FINISH], b.hull.upper))}
        ${row('Bottom', `${colour(BOTTOM_COLORS, b.hull.lower)}, ${p.cleanedWeeks ? `cleaned ${p.cleanedWeeks} wk ago` : 'just cleaned'}`)}
        ${row('Deck', colour([...TEAK_DECKS, ...HULL_COLORS], b.deck))}
        ${row('Sails', `${b.sails.color === 'black' ? 'Black' : 'White'}; main ${ages[p.mainAge]}, jib ${ages[p.jibAge]}`)}
        ${row('Spars', `${p.mast === 'wood' ? `Spruce mast (${p.mastStiffness})` : 'Aluminium mast'}, ${p.boom === 'wood' ? 'spruce' : 'aluminium'} boom`)}
      </table></section>
      <section><h3>Race record</h3>
        ${rec.races ? `<p class="frec"><b>${rec.races}</b> race${rec.races === 1 ? '' : 's'} · <b>${rec.wins}</b> win${rec.wins === 1 ? '' : 's'} · <b>${rec.podiums}</b> in the top three${rec.avg != null ? ` · average place <b>${rec.avg.toFixed(1)}</b>` : ''}</p>
          <table class="flog"><thead><tr><th>Day</th><th>Course</th><th>Place</th><th>Time</th><th>Skipper</th></tr></thead><tbody>${races.map(raceRow).join('')}</tbody></table>`
          : '<small>No races yet. Sail her in a race, or race against her, and her results go here.</small>'}</section>
      <section><h3>Crew history</h3>
        ${log.length ? `<table class="flog"><thead><tr><th>Day</th><th>Sailed</th><th>Skipper</th><th>Crew</th></tr></thead><tbody>${log.map(crewRow).join('')}</tbody></table>`
          : '<small>Nobody has sailed her yet.</small>'}
        <small>Skippers and crews come with the Yacht Club; until then, when she isn't sailed by you she has a generic AI skipper and crew.</small></section>
      </div>`;
  }

  /* ---------- Sail her: race or cruise ---------- */
  private drawPick(): void {
    const b = this.cur!, slip = slipById(b.slip);
    this.pick.innerHTML = `<div class="panel">
      <button type="button" class="linkbtn back" data-f="pickNo">‹ Back</button>
      <div class="eyebrow">Sail her</div><h2>${esc(b.name || 'Unnamed')} · ${esc(sailNo(b))}</h2>
      <label class="fslip${slip ? '' : ' off'}"><input type="checkbox" id="shSlip"${slip ? ' checked' : ' disabled'}> Start in her slip${slip ? ` (${HARBOR.name}, ${slip.id})` : ': she has none yet (give her one under Edit)'}</label>
      <small>${slip ? 'She lies bow in, made fast. Push off (the crew walks her back out of the slip and swings her bow round), then sail her out of the harbor. Racing, you start in good time to sail out to the line before the warning signal.' : 'She starts on the water: by the line for a race, or where you choose for a cruise.'}</small>
      <div class="modes">
        <button type="button" class="modecard" data-f="go" data-v="race"><b>Race</b><span>Choose the day, the course, who you race against and your crew.</span></button>
        <button type="button" class="modecard" data-f="go" data-v="cruise"><b>Cruise</b><span>Sail anywhere on the Bay; choose where you're going, if anywhere.</span></button>
      </div></div>`;
  }
}

/* ---------- helpers ---------- */
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export const clubName = (id: string) => CLUBS.find(c => c.id === id)?.club ?? '';
const skipperName = (b: BoatSpec) => b.skipper === 'you' ? 'You' : 'AI skipper (generic)';
const shortMarina = (id: string | undefined) => marinaName(id).split(',')[0];
const nth = (n: number) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th');
const mmss = (s: number) => `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ':' : ''}${String(Math.floor(s / 60) % 60).padStart(Math.floor(s / 3600) ? 2 : 1, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const dayLabel = (e: LogEntry) => new Date(e.day + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
function raceRow(e: LogEntry): string {
  const place = e.code === 'unfinished' ? 'Not finished' : e.code && e.code !== 'ZFP' ? e.code : e.place != null ? `${nth(e.place)} of ${e.of}${e.code ? ' (ZFP)' : ''}` : '—';
  return `<tr><td>${dayLabel(e)}</td><td>${esc(e.title)}<small>${esc(e.wind)}</small></td><td>${place}</td><td>${e.elapsed != null ? mmss(e.elapsed) : '—'}</td><td>${e.skipper === 'you' ? 'You' : 'AI'}</td></tr>`;
}
function crewRow(e: LogEntry): string {
  const what = e.kind === 'race' ? `Race: ${esc(e.title)}` : `Cruise: ${esc(e.title)}${e.nm != null ? `, ${e.nm.toFixed(1)} nm` : ''}${e.arrived ? ' ✓' : ''}`;
  return `<tr><td>${dayLabel(e)}</td><td>${what}</td><td>${e.skipper === 'you' ? 'You' : 'AI (generic)'}</td><td>${esc(e.crew)}</td></tr>`;
}

/** Her profile, side on, in her colours: topsides, boot stripe, bottom paint, sails with her number. */
export function profileSvg(b: BoatSpec): string {
  const top = b.hull.upper, bottom = b.hull.lower, stripe = b.hull.stripe, sail = b.sails.color === 'black' ? '#2a2b2f' : '#f6f4ec', ink = b.sails.color === 'black' ? '#f2f0e8' : '#1d2a44';
  const id = 'h' + b.id.replace(/\W/g, '');
  const hull = 'M24 92 Q112 100 208 82 L196 104 Q170 116 112 117 Q62 117 40 110 L36 106 Z';
  return `<svg class="fprof" viewBox="0 0 232 150" role="img" aria-label="${esc(b.name)}">
    <defs><clipPath id="${id}"><path d="${hull}"/></clipPath></defs>
    <rect x="0" y="108" width="232" height="42" fill="#1d4a63" opacity=".55"/>
    <path d="M122 12 L122 84 L52 87 Z" fill="${sail}" stroke="#00000033"/>
    <path d="M119 26 L203 83 L150 84 Z" fill="${sail}" stroke="#00000033"/>
    <line x1="121" y1="8" x2="121" y2="92" stroke="#c9ccd2" stroke-width="2"/>
    <line x1="121" y1="85" x2="50" y2="88" stroke="#c9ccd2" stroke-width="1.6"/>
    <text x="100" y="52" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="9" fill="${ink}">${esc(b.sails.country)}</text>
    <text x="100" y="65" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="13" fill="${ink}">${esc(b.sails.number)}</text>
    <path d="M98 116 L150 116 L141 140 L112 140 Z" fill="${bottom}"/>
    <path d="M42 110 L56 111 L52 129 L44 127 Z" fill="${bottom}"/>
    <g clip-path="url(#${id})"><path d="${hull}" fill="${top}"/>${stripe ? `<rect x="0" y="103.5" width="232" height="3" fill="${stripe}"/>` : ''}<rect x="0" y="107" width="232" height="20" fill="${bottom}"/></g>
    <path d="${hull}" fill="none" stroke="#00000055" stroke-width="1"/>
  </svg>`;
}
