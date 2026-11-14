import type { LiveBoat, SeasonResult, Series } from '../club/season';
import { standingsTable } from './season';
import { morph } from './morph';

/**
 * The season's own screen (the owner approved design/season-flow, 13 Nov 2026: "I'm confused about the UX for seasons …
 * BAM, I'm in my slip"): Race → Season opens this overview first, not the water. The series' race days as tiles (done,
 * with your place; the one chosen, lit; those not yet published, dashed), the chosen race (its course, day and her crew:
 * the setup's own rows, docked here by app/setup.ts), and the standings. Sail Race N opens that race's setup.
 */
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const ord = (n: number) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
export const dateTile = (iso: string) => { const d = new Date(iso + 'T12:00'); return `<span class="t-date"><b>${d.getDate()}</b><small>${d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</small></span>`; };

/** Your place in each race you've sailed and kept, by race number. */
export function yourPlaces(res: Record<number, SeasonResult>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [no, r] of Object.entries(res)) { const me = r.scores.find(s => s.you); if (me) out[+no] = me.points; }
  return out;
}
/** The race to sail next: the first one published that you haven't sailed (none: the season's done, as far as it's published). */
export function nextRace(series: Series, res: Record<number, SeasonResult>): number | null {
  return series.races.find(r => !r.abandoned && !res[r.no])?.no ?? null;
}

export interface SeasonViewData {
  series: Series; res: Record<number, SeasonResult>; all: Series[]; live?: LiveBoat;
  /** the race shown (and sailed by the button) */
  chosen: number | null;
  burgee: string;
}
export function paintSeasonView(d: SeasonViewData): void {
  const { series, res, chosen } = d, $ = (id: string) => document.getElementById(id)!, places = yourPlaces(res), next = nextRace(series, res);
  morph($('svHead'), `${d.burgee ? `<img class="t-burgee" src="${d.burgee}" alt="">` : ''}<h1>${d.all.length > 1
    ? `<select class="pick svpick" id="svSeason" aria-label="Season">${d.all.slice().reverse().map(x => `<option value="${esc(x.id)}"${x.id === series.id ? ' selected' : ''}>${esc(x.title)}</option>`).join('')}</select>`
    : esc(series.title)}</h1><span class="t-s">${esc(series.host)}</span>`);
  // the calendar: every race of the series, published or still to come
  const tiles = series.races.map(r => {
    const cls = r.abandoned ? 'abn' : r.no === chosen ? 'on' : places[r.no] != null ? 'done' : '';
    const sub = r.abandoned ? 'Abandoned' : places[r.no] != null ? ord(places[r.no]) : r.no === next ? 'Next' : '';
    return `<button type="button" class="sv-day ${cls}" data-sv-race="${r.no}"${r.abandoned ? ' disabled' : ''} title="${r.abandoned ? 'Abandoned: every boat scored ABN' : places[r.no] != null ? 'Sail it again: your saved result is replaced' : 'Sail it: the day\'s real wind and tide'}">${dateTile(r.date)}<span class="t-text"><span class="sv-r">RACE ${r.no}</span><span class="sv-res">${sub || '&nbsp;'}</span></span></button>`;
  });
  // (the race days still to come: announced, dashed, sailed once the club publishes the race; club/season.ts calendar)
  for (let no = series.races.length + 1; no <= series.scheduled; no++) {
    const c = series.calendar.find(x => x.no === no);
    tiles.push(`<div class="sv-day tbc" title="To come: sailed here once its results are published">${c ? dateTile(c.date) : '<span class="t-date"><b>–</b></span>'}<span class="t-text"><span class="sv-r">RACE ${no}</span><span class="sv-res">&nbsp;</span></span></div>`);
  }
  morph($('svCal'), tiles.join(''));
  $('svCal').style.gridTemplateColumns = `repeat(${Math.max(5, tiles.length)}, minmax(0, 1fr))`;
  const r = series.races.find(x => x.no === chosen);
  $('svNextH').textContent = r ? `Race ${r.no} · ${new Date(r.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : 'Every race sailed';
  const go = $('bSailSeason') as HTMLButtonElement; go.hidden = !r; go.textContent = r ? `Sail Race ${r.no}` : '';
  $('svDock').hidden = !r;
  // the standings: the Yacht Club's own table (ui/season.ts)
  const sailedN = Object.keys(places).length;
  $('svStandH').textContent = `Standings · after ${sailedN} of ${series.scheduled}`;
  $('svTable').innerHTML = `<div class="season">${standingsTable(series, res, d.live)}</div>`;
}
/** The Race page's Season card: the club's burgee, the next race's day, and where you stand. */
export function seasonCardHtml(d: { series: Series; res: Record<number, SeasonResult>; burgee: string; place: number | null }): string {
  const next = nextRace(d.series, d.res), r = d.series.races.find(x => x.no === next);
  return `<span class="mc-sea">${d.burgee ? `<img class="t-burgee" src="${d.burgee}" alt="">` : ''}${r ? dateTile(r.date) : ''}<span class="t-text"><span class="t-h">${esc(d.series.title)}</span><span class="t-s">${r ? `Race ${r.no} next` : 'All sailed'}${d.place ? ` · you're ${ord(d.place)}` : ''}</span></span></span>`;
}
