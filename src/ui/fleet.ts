import type { Settings } from '../settings';
import { BOTTOM_COLORS, BRIGHT_FINISH, HULL_COLORS, TEAK_DECKS, countryName, ensignFor, freeNumber, newBoat, sailNo, type BoatSpec } from '../boat/spec';
import { CLUBS, burgeeCanvas } from '../render/burgees';
import { ENSIGNS, flagArtCanvas } from '../render/flagArt';
import { boatThumb } from '../render/thumbs';
import { dockName, harborOf, marinaName, MARINAS, slipById } from '../geo/marina';
import { logFor, record, type LogEntry } from '../boat/logbook';
import { YOU, newMember, type Member } from '../club/members';
import { applyMemberInput, memberPage, membersGrid, type MemberFilter } from './members';
import { morph } from './morph';

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
  /** Leave the Fleet, or her page (back where you came from: ui/nav.ts). */
  back(): void;
  /** Open her page, from the list (on the back stack: ui/nav.ts). */
  toBoat(id: string): void;
  /** The back link for where you are ("‹ Race", "‹ Yacht Club"): ui/nav.ts. */
  backLabel(): string;
  /** The Yacht Club's members (club/members.ts), and that they changed (saved by the caller). */
  members(): Member[];
  membersChanged(): void;
  /** The Season tab's contents (ui/season.ts), and sailing one of its races. */
  seasonHtml(id: string | null): string;
  sailSeason(seasonId: string, raceNo: number): void;
}

const VIEW_KEY = 'fbsim-fleet-view';

export class Fleet {
  private list = document.getElementById('fleet')!;
  private page = document.getElementById('fleetBoat')!;
  private view: 'grid' | 'list' = 'grid';
  private boatId = '';
  private confirmDelete = false;
  /** The Yacht Club's tab (docs/YACHT-CLUB.md): your boats, or the members; the member open, and the roster's filter. */
  private tab: 'boats' | 'members' | 'season' = 'boats';
  /** The season shown (null: the one under way). */
  private seasonId: string | null = null;
  private memberId: string | null = null;
  private filter: MemberFilter = 'all';
  private confirmMemberDel = false;
  constructor(private S: Settings, private hooks: FleetHooks) {
    try { if (localStorage.getItem(VIEW_KEY) === 'list') this.view = 'list'; } catch { /* storage unavailable */ }
    for (const el of [this.list, this.page]) el.addEventListener('click', e => this.click(e));
    // (her crew's seats, on her page: picked from the members; none leaves the seat empty, the forward hand moving up)
    this.page.addEventListener('change', e => {
      const t = e.target as HTMLSelectElement, b = this.cur; if (!b || t.dataset.f !== 'seat') return;
      const ids = [...(b.crewIds ?? [])], i = Number(t.dataset.v);
      if (t.value) ids[i] = t.value; else ids.splice(i, 1);
      b.crewIds = ids.filter(Boolean).slice(0, 2); this.hooks.changed(); this.hooks.membersChanged(); this.drawBoat();
    });
    // (a member's page: their name, build, skill and ratings)
    this.list.addEventListener('change', e => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.f === 'sseason') { this.seasonId = t.value; this.drawList(); return; } // (the Season tab's season)
      const m = this.member(); if (!m || !t.dataset.m) return;
      if (applyMemberInput(m, t.dataset.m, t.value, t.dataset.a, t.checked)) { this.hooks.membersChanged(); this.drawList(); }
    });
    this.list.addEventListener('input', e => {
      const t = e.target as HTMLInputElement; if (t.dataset.m !== 'attr') return;
      const out = t.nextElementSibling as HTMLOutputElement | null; if (out) out.value = String(Math.round(Number(t.value) * 100));
    });
  }
  private member(): Member | null { return this.hooks.members().find(m => m.id === this.memberId) ?? null; }

  /** Her page is open (she's in the showroom). */
  get boatOpen(): boolean { return !this.page.hidden; }
  get showing(): BoatSpec | null { return this.boatOpen ? this.cur : null; }
  private get cur(): BoatSpec | null { return this.S.boats.find(b => b.id === this.boatId) ?? null; }
  get open(): boolean { return !this.list.hidden || this.boatOpen; }

  openList(): void {
    this.page.hidden = true; this.hooks.showroom(null);
    this.drawList(); this.list.hidden = false;
  }
  openBoat(id: string): void {
    const b = this.S.boats.find(x => x.id === id); if (!b) { this.openList(); return; }
    this.boatId = id; this.confirmDelete = false;
    this.list.hidden = true;
    this.drawBoat(); this.page.hidden = false; this.hooks.showroom(b);
  }
  /** Esc on the Yacht Club: a member's page back to the members (true), else nothing here (false: the back stack's). */
  escape(): boolean {
    if (this.list.hidden || !this.memberId) return false;
    this.memberId = null; this.confirmMemberDel = false; this.drawList(); return true;
  }
  /** Straight to the members (from the race setup's crew line). */
  openMembers(): void { this.tab = 'members'; this.memberId = null; this.openList(); }
  close(): void { this.list.hidden = true; this.page.hidden = true; this.hooks.showroom(null); }

  private click(e: Event): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-f]'); if (!t) return;
    const v = t.dataset.v ?? '';
    switch (t.dataset.f) {
      case 'back': this.close(); this.hooks.back(); return;
      case 'view': this.view = v === 'list' ? 'list' : 'grid'; try { localStorage.setItem(VIEW_KEY, this.view); } catch { /* ignore */ } this.drawList(); return;
      case 'boat': this.hooks.toBoat(v); return;
      case 'toList': this.hooks.back(); return;
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
        this.hooks.changed(); this.hooks.back(); return;
      }
      case 'tab': this.tab = v === 'members' ? 'members' : v === 'season' ? 'season' : 'boats'; this.memberId = null; this.drawList(); return;
      case 'season': { const [id, no] = v.split('|'); this.close(); this.hooks.sailSeason(id, Number(no)); return; }
      case 'mfilter': this.filter = (['all', 'skipper', 'crew', 'yours'] as const).find(x => x === v) ?? 'all'; this.drawList(); return;
      case 'member': this.memberId = v; this.confirmMemberDel = false; this.drawList(); return;
      case 'mback': this.memberId = null; this.drawList(); return;
      case 'mnew': { const m = newMember(this.hooks.members(), { h: 1.75, w: 75 }, 'New member'); this.hooks.membersChanged(); this.memberId = m.id; this.drawList(); return; }
      case 'mreset': { const m = this.member(); if (m && m.origin === 'yours') { delete m.attr; this.hooks.membersChanged(); this.drawList(); } return; }
      case 'mdel': this.confirmMemberDel = true; this.drawList(); return;
      case 'mdelNo': this.confirmMemberDel = false; this.drawList(); return;
      case 'mdelYes': {
        const ms = this.hooks.members(), m = this.member(); if (!m || m.id === YOU || m.origin !== 'yours') return;
        ms.splice(ms.indexOf(m), 1);
        for (const b of this.S.boats) if (b.crewIds?.includes(m.id)) b.crewIds = b.crewIds.filter(id => id !== m.id); // (off any boat they sailed on)
        this.hooks.membersChanged(); this.hooks.changed(); this.memberId = null; this.drawList(); return;
      }
      case 'go': { // straight to the setup with her chosen; from her slip if she has one (the setup can change it)
        const slip = !!slipById(this.cur?.slip);
        this.close(); this.hooks.sail(this.boatId, v === 'cruise' ? 'cruise' : 'race', slip); return;
      }
    }
  }

  /* ---------- the list ---------- */
  private drawList(): void {
    const boats = this.S.boats;
    const body = this.view === 'grid'
      ? `<div class="fgrid">${boats.map(b => `<button type="button" class="fcard" data-f="boat" data-v="${b.id}"><img class="fthumb" data-thumb="${b.id}" alt=""><b>${esc(b.name || 'Unnamed')}</b><span>${ensignImg(b)}${esc(sailNo(b))}</span></button>`).join('')}</div>`
      : `<div class="ftable"><table><thead><tr><th>Sail no.</th><th>Name</th><th>Skipper</th><th>Club</th><th>Marina</th><th>Slip</th></tr></thead><tbody>${boats.map(b =>
          `<tr data-f="boat" data-v="${b.id}" tabindex="0"><td>${ensignImg(b)}${esc(sailNo(b))}</td><td>${esc(b.name || 'Unnamed')}</td><td>${skipperName(b)}</td><td>${burgeeImg(b)}${esc(clubName(b.club) || '—')}</td><td>${esc(shortMarina(b.marina) || '—')}</td><td>${slipById(b.slip)?.label ?? '—'}</td></tr>`).join('')}</tbody></table></div>`;
    // the Yacht Club's tabs (docs/YACHT-CLUB.md): your boats, the members, the season (ui/season.ts); the club's sliders to come
    const tabs = `<div class="yctabs"><button type="button" data-f="tab" data-v="boats" aria-pressed="${this.tab === 'boats'}">Boats</button><button type="button" data-f="tab" data-v="members" aria-pressed="${this.tab === 'members'}">Members</button><button type="button" data-f="tab" data-v="season" aria-pressed="${this.tab === 'season'}">Season</button></div>`;
    if (this.tab === 'season') {
      morph(this.list, `<div class="panel wide fleetpanel">
        <button type="button" class="linkbtn back" data-f="back">${esc(this.hooks.backLabel())}</button>
        <div class="fhead"><div><div class="eyebrow">San Francisco · Folkboat fleet</div><h1>The Yacht Club</h1></div></div>${tabs}
        ${this.hooks.seasonHtml(this.seasonId)}</div>`);
      return;
    }
    if (this.tab === 'members') {
      const ms = this.hooks.members(), m = this.member();
      morph(this.list, `<div class="panel wide fleetpanel">
        ${m ? '' : `<button type="button" class="linkbtn back" data-f="back">${esc(this.hooks.backLabel())}</button>`}
        <div class="fhead"><div><div class="eyebrow">San Francisco · Folkboat fleet</div><h1>The Yacht Club</h1></div></div>${tabs}
        ${m ? memberPage(m, boats, this.confirmMemberDel) : membersGrid(ms, boats, this.filter)}</div>`);
      return;
    }
    morph(this.list, `<div class="panel wide fleetpanel">
      <button type="button" class="linkbtn back" data-f="back">${esc(this.hooks.backLabel())}</button>
      <div class="fhead"><div><div class="eyebrow">San Francisco · Folkboat fleet</div><h1>The Yacht Club</h1></div>
        <div class="seg"><button type="button" data-f="view" data-v="grid" aria-pressed="${this.view === 'grid'}">Grid</button><button type="button" data-f="view" data-v="list" aria-pressed="${this.view === 'list'}">List</button></div>
        <button type="button" class="cta" data-f="new">New boat</button></div>${tabs}
      ${body}
      <small class="fnote">${boats.length} boat${boats.length === 1 ? '' : 's'}. Open one to see her record, edit her, or race or cruise her.</small></div>`);
    // her pictures: drawn one at a time once the list is up (each is a 3D render of her as she's set up)
    const imgs = [...this.list.querySelectorAll<HTMLImageElement>('img[data-thumb]')], job = ++this.thumbJob;
    const next = () => {
      if (job !== this.thumbJob) return;
      const im = imgs.shift(); if (!im) return;
      const b = this.S.boats.find(x => x.id === im.dataset.thumb);
      if (b) try { im.src = boatThumb(b, this.S); } catch { /* no WebGL: no picture */ }
      setTimeout(next, 0);
    };
    setTimeout(next, 0);
  }
  private thumbJob = 0;

  /**
   * Her crew, by seat (the Yacht Club, phase 3): the middle crew (the main) and the forward hand (the jib, the cabin top,
   * the pole), each picked from the club's members who crew, or none: both left at None is single-handed (the owner: a
   * practice option, and it sails that way in a race too). A boat always has her skipper.
   */
  private crewRows(b: BoatSpec): string {
    const ms = this.hooks.members().filter(m => m.id !== YOU && m.roles.includes('crew')), ids = b.crewIds ?? [];
    const pick = (i: number) => `<select data-f="seat" data-v="${i}"><option value="">None</option>${ms.map(m => `<option value="${esc(m.id)}"${ids[i] === m.id ? ' selected' : ''}${ids.includes(m.id) && ids[i] !== m.id ? ' disabled' : ''}>${esc(m.name)}</option>`).join('')}</select>`;
    return `<tr><td>Middle crew</td><td>${pick(0)}</td></tr><tr><td>Forward hand</td><td>${pick(1)}</td></tr>`;
  }

  /* ---------- her page ---------- */
  private drawBoat(): void {
    const b = this.cur!, log = logFor(b.id), rec = record(log), races = log.filter(e => e.kind === 'race');
    const slip = slipById(b.slip);
    const row = (k: string, v: string) => `<tr><td>${k}</td><td>${v}</td></tr>`;
    const colour = (list: [string, string][], c: string) => list.find(x => x[1] === c)?.[0] ?? '';
    const p = b.perf, ages = { new: 'new', mid: 'midlife', old: 'end of life' } as const;
    morph(this.page, `
      <div class="bphead"><button type="button" class="linkbtn" data-f="toList">${esc(this.hooks.backLabel())}</button><h2>${esc(b.name || 'Unnamed')}</h2><span class="fno">${esc(sailNo(b))}</span></div>
      <div class="garage">
        <div class="gbtns"><button type="button" class="cta" data-f="go" data-v="race">Race her</button><button type="button" class="ghost" data-f="go" data-v="cruise">Cruise her</button><button type="button" class="ghost" data-f="edit">Edit</button>${this.S.boats.length > 1 ? '<button type="button" class="ghost" data-f="del">Delete</button>' : ''}</div>
        ${this.confirmDelete ? `<div class="gconfirm">Delete ${esc(b.name || 'this boat')} and her record? <button type="button" class="ghost danger" data-f="delYes">Delete</button><button type="button" class="ghost" data-f="delNo">Keep her</button></div>` : ''}
      </div>
      <div class="bpbody">
      <section><h3>Particulars</h3><table class="ftab">
        ${row('Sail number', esc(sailNo(b)))}
        ${row('Country', esc(countryName(b.sails.country) || '—'))}
        ${row('Yacht club', esc(clubName(b.club) || 'None'))}
        ${row('Skipper', skipperName(b))}
        ${this.crewRows(b)}
        ${row('Home marina', esc(marinaName(b.marina) || 'None'))}
        ${row('Slip', slip ? `${slip.label.replace(/^Slip /, '')} (${dockName(slip.dock)}, ${harborOf(slip.marina)?.short ?? ''})` : 'None')}
      </table></section>
      <section><h3>The boat</h3><table class="ftab">
        ${row('Hull', b.hull.material === 'wood' ? 'Wood' : 'Fiberglass')}
        ${row('Topsides', colour([...HULL_COLORS, BRIGHT_FINISH], b.hull.upper))}
        ${row('Bottom', `${colour(BOTTOM_COLORS, b.hull.lower)}, ${p.cleanedWeeks ? `cleaned ${p.cleanedWeeks} wk ago` : 'just cleaned'}`)}
        ${row('Deck', colour([...TEAK_DECKS, ...HULL_COLORS], b.deck))}
        ${row('Forehatch', b.hatch === 'acrylic' ? 'Smoked acrylic, aluminium frame' : 'Teak')}
        ${row('Cabin top', b.cabinTop ? colour([...TEAK_DECKS, ...HULL_COLORS], b.cabinTop) : b.deck.startsWith('teak') ? 'Painted canvas' : 'Like the deck')}
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
      </div>`);
  }

}

/* ---------- helpers ---------- */
/** A small picture of a flag (her ensign, her club's burgee), for the lists. */
const flagUrls = new Map<string, string>();
function flagImg(key: string, make: () => HTMLCanvasElement | null, title: string): string {
  let url = flagUrls.get(key);
  if (url === undefined) { const c = make(); url = c ? c.toDataURL() : ''; flagUrls.set(key, url); }
  return url ? `<img class="fflag" src="${url}" alt="" title="${esc(title)}">` : '';
}
/** (in a slot of its own width, so the text beside it lines up down the column whatever the flag's shape, or none) */
const slot = (img: string) => `<span class="fslot">${img}</span>`;
const ensignImg = (b: BoatSpec) => { const id = ensignFor(b.sails.country); return slot(id ? flagImg('e:' + id, () => flagArtCanvas(id), ENSIGNS.find(e => e.id === id)?.name ?? '') : ''); };
const burgeeImg = (b: BoatSpec) => slot(b.club ? flagImg('b:' + b.club, () => burgeeCanvas(b.club), clubName(b.club)) : '');
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export const clubName = (id: string) => CLUBS.find(c => c.id === id)?.club ?? '';
const skipperName = (b: BoatSpec) => b.skipper === 'you' ? 'You' : 'AI skipper (generic)';
const shortMarina = (id: string | undefined) => MARINAS.find(m => m.id === id)?.short ?? '';
const nth = (n: number) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th');
const mmss = (s: number) => `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ':' : ''}${String(Math.floor(s / 60) % 60).padStart(Math.floor(s / 3600) ? 2 : 1, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const dayLabel = (e: LogEntry) => new Date(e.day + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
function raceRow(e: LogEntry): string {
  const place = e.code === 'unfinished' ? 'Not finished' : e.code && e.code !== 'ZFP' ? e.code : e.place != null ? `${e.tied ? '=' : ''}${nth(e.place)} of ${e.of}${e.code ? ' (ZFP)' : ''}` : '—';
  return `<tr><td>${dayLabel(e)}</td><td>${esc(e.title)}<small>${esc(e.wind)}</small></td><td>${place}</td><td>${e.elapsed != null ? mmss(e.elapsed) : '—'}</td><td>${e.skipper === 'you' ? 'You' : 'AI'}</td></tr>`;
}
function crewRow(e: LogEntry): string {
  const what = e.kind === 'race' ? `Race: ${esc(e.title)}` : `Cruise: ${esc(e.title)}${e.nm != null ? `, ${e.nm.toFixed(1)} nm` : ''}${e.arrived ? ' ✓' : ''}`;
  return `<tr><td>${dayLabel(e)}</td><td>${what}</td><td>${e.skipper === 'you' ? 'You' : 'AI (generic)'}</td><td>${esc(e.crew)}</td></tr>`;
}
