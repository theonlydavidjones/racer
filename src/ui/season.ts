import { standings, type SeasonResult, type Series, type StandingRow } from '../club/season';

/**
 * The Yacht Club's Season tab (docs/SEASON-PROPOSAL.md, the owner's mock-up): the series' race days, each opening its race,
 * and the standings. Sailors in a fleet go by sail numbers (the owner), so every row shows country and number beside
 * the name; each boat's chip is her hull's colour (duplicates and all, as in life: the owner), and her place race by race
 * is a sparkline labelled at its end with her sail number, so two lines of one colour can still be told apart (and a faint light edge keeps a dark hull's
 * colour, black or navy, visible on the dark panel).
 */
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const dayOf = (d: string) => new Date(d + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
/** A boat's chip: a ring in her hull colour, and her name. */
export const boatChip = (name: string, hull: string) => `<span class="bchip"><i style="border-color:${esc(hull)}"></i>${esc(name)}</span>`;

function spark(r: StandingRow, sailed: number[], of: number): string {
  if (sailed.length < 2) return '';
  const W = 92, H = 26, x = (i: number) => 4 + i * (W - 30) / (sailed.length - 1), y = (p: number) => 3 + (Math.min(p, of) - 1) * (H - 6) / Math.max(1, of - 1);
  const pts = sailed.map((n, i) => [x(i), y(r.races[n].points)]);
  const last = pts[pts.length - 1], no = r.sail.replace(/^\D+\s*/, '');
  return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polyline class="halo" points="${pts.map(p => p.join(',')).join(' ')}" fill="none"/><polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${esc(r.hull)}" stroke-width="1.6"/>${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.3" fill="${esc(r.hull)}"/>`).join('')}<text x="${last[0] + 5}" y="${last[1] + 3.5}">${esc(no)}</text></svg>`;
}

export function seasonHtml(series: Series, res: Record<number, SeasonResult>, all: Series[] = [series]): string {
  const { rows, sailed, discards } = standings(series, res), of = Math.max(rows.length, series.fleet.length + 1);
  const days = series.races.map(r => {
    const done = !!res[r.no], sub = r.abandoned ? 'abandoned' : `${r.start}${r.courseNo ? ` · course ${esc(r.courseNo)}` : ' · committee\'s course'}${done ? ' · sailed' : ''}`;
    return r.abandoned ? `<div class="sday abn"><b>R${r.no} · ${dayOf(r.date)}</b><small>${sub}</small></div>`
      : `<button type="button" class="sday${done ? ' done' : ''}" data-f="season" data-v="${esc(series.id)}|${r.no}" title="${done ? 'Sail it again: your saved result is replaced' : 'Sail it: the day\'s real wind and tide, the club\'s fleet'}"><b>R${r.no} · ${dayOf(r.date)}</b><small>${sub}</small></button>`;
  }).join('');
  const raceCols = series.races.map(r => `<th class="n">R${r.no}</th>`).join('');
  const cell = (r: StandingRow, no: number, abn: boolean) => {
    if (abn) return '<td class="n abn">–</td>';
    const s = r.races[no]; if (!s) return '<td class="n abn"></td>';
    const t = `${s.points}${s.code ? `<small>${esc(s.code)}</small>` : ''}`;
    return `<td class="n${s.out ? ' drop' : ''}">${s.out ? `(${t})` : t}</td>`;
  };
  const table = rows.length ? `<table class="standings"><thead><tr><th></th><th>Sail no.</th><th>Boat</th>${raceCols}<th>Place by race</th><th class="n">Total</th><th class="n">Nett</th></tr></thead><tbody>${rows.map(r =>
    `<tr${r.you ? ' class="you"' : ''}><td class="pl">${r.rank}</td><td class="no">${esc(r.sail)}</td><td>${boatChip(r.name, r.hull)}</td>${series.races.map(x => cell(r, x.no, x.abandoned)).join('')}<td class="sp">${spark(r, sailed, of)}</td><td class="n mu">${r.total}</td><td class="n nett">${r.nett}</td></tr>`).join('')}</tbody></table>`
    : '<p class="lede">No races sailed yet. Pick a day to sail its race.</p>';
  const left = series.races.filter(r => !r.abandoned).length - sailed.length, toCome = series.scheduled - series.races.length;
  return `<div class="season"><div class="shead"><b>${esc(series.host)} · ${all.length > 1 ? `<select class="pick" data-f="sseason" aria-label="Season">${all.slice().reverse().map(x => `<option value="${esc(x.id)}"${x.id === series.id ? ' selected' : ''}>${esc(x.title)}</option>`).join('')}</select>` : esc(series.title)}</b><span>${sailed.length} of ${series.races.filter(r => !r.abandoned).length} sailed${toCome > 0 ? ` · ${toCome} more race${toCome === 1 ? '' : 's'} to come, as published` : left ? '' : ' · complete'} · ${discards ? `${discards} throwout` : 'no throwout'}</span></div>
    <div class="sdays">${days}</div>${table}
    <div class="sfoot"><span title="The Seaweed Soup's own sailing instructions couldn't be read; these are the best-supported answers (club/season.ts)">Low point · level ratings (the real fleet's equal PHRF time on time) · one throwout only once all five races are sailed</span><span>The series trophy: the winner's name goes on it</span></div></div>`;
}
