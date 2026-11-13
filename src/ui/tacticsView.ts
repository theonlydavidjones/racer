import { CAUSES, type Cause, type Tactics, type TacRow } from '../replay/tactics';

/**
 * The tactical debrief drawn (the owner's visual-first design, 13 Nov 2026): a row a leg, your time against the fleet's
 * middle, with the leg's best boat, the ideal and the boats you've chosen; under each row your seconds lost by cause;
 * beside it, a takeaway of a few words. The chips choose who's shown (click a name). Used in the results' debrief and
 * in "Watch your race" (narrower there: `compact`).
 */

export interface TacShown { best: boolean; ideal: boolean; boats: Set<number> }
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const KIND: Record<TacRow['kind'], string> = { start: 'Start', beat: 'Beat', reach: 'Reach', run: 'Run' };
/** How far either side of the middle the chart reaches, s; a boat beyond it sits at the edge with her number. */
const RANGE = 60;

export function tacticsHtml(T: Tactics, boats: { id: number; name: string; color: string }[], you: number, shown: TacShown, opts: { compact?: boolean; howUrl?: string } = {}): string {
  const W = opts.compact ? 340 : 560, X0 = opts.compact ? 92 : 150, X1 = W - 30, RH = opts.compact ? 40 : 46;
  const sx = (s: number) => X0 + (X1 - X0) / 2 + (-Math.max(-RANGE, Math.min(RANGE, s)) / RANGE) * (X1 - X0) / 2; // faster to the right
  const name = (id: number) => id === you ? 'You' : boats.find(b => b.id === id)?.name ?? '';
  const offLab = (x: number, y: number, d: number, c: string, dy = 4) => Math.abs(d) > RANGE ? `<text x="${(x + (d > 0 ? 10 : -10)).toFixed(1)}" y="${y + dy}" fill="${c}" font-size="10" text-anchor="${d > 0 ? 'start' : 'end'}">${d > 0 ? '−' : '+'}${Math.round(Math.abs(d))} s</text>` : '';
  const rows = T.rows.map((r, i) => {
    const y = 34 + i * RH, d = (v: number) => v - r.mid, me = r.times[boats.findIndex(b => b.id === you)];
    const dot = (v: number, c: string, R: number, lab: string) => { const x = sx(d(v)); return `<circle cx="${x.toFixed(1)}" cy="${y}" r="${R}" fill="${c}" stroke="#0c2534" stroke-width="1.5"><title>${esc(lab)}</title></circle>${offLab(x, y, d(v), c)}`; };
    let out = `<g class="tacRow" data-tleg="${r.i}" style="cursor:pointer"><rect x="0" y="${y - RH / 2 + 4}" width="${W}" height="${RH - 4}" fill="transparent"/>`
      + `<text x="6" y="${y + 4}" fill="#e9f2f5" font-size="12" font-weight="700">${r.i ? `L${r.i}` : 'S'}</text>`
      + `<text x="28" y="${y + 4}" fill="#94abb7" font-size="11">${esc(opts.compact ? KIND[r.kind] : `${KIND[r.kind]}${r.i ? ` · ${r.name}` : ''}`)}</text>`
      + `<line x1="${X0}" y1="${y}" x2="${X1}" y2="${y}" stroke="rgba(150,196,218,.18)"/>`;
    if (shown.ideal && r.ideal != null) { const x = sx(d(r.ideal)); out += `<path d="M${x} ${y - 6} l6 6 l-6 6 l-6 -6z" fill="none" stroke="#e9f2f5" stroke-width="1.5"><title>The ideal: ${Math.round(r.ideal)} s</title></path>${offLab(x, y, d(r.ideal), '#e9f2f5', -9)}`; }
    if (shown.best && r.best.id !== you) out += dot(r.best.t, '#ffb627', 5, `Best on the leg: ${name(r.best.id)}, ${Math.round(r.best.t)} s`);
    boats.forEach((b, j) => { if (b.id !== you && shown.boats.has(b.id) && r.times[j] != null) out += dot(r.times[j]!, b.color, 5, `${b.name}: ${Math.round(r.times[j]!)} s`); });
    if (me != null) out += dot(me, '#ffffff', 7, `You: ${Math.round(me)} s`);
    // your seconds lost by cause, from the middle toward "slower", under your dot
    let x = sx(0); const k = (X1 - X0) / 2 / RANGE;
    for (const c of CAUSES) { const v = r.causes[c.key] ?? 0; if (v < 1) continue; const wd = Math.max(2, Math.min(v * k, x - X0)); if (wd <= 0) break; x -= wd; out += `<rect x="${x.toFixed(1)}" y="${y + 9}" width="${wd.toFixed(1)}" height="7" fill="${c.color}"><title>${esc(c.label)}: −${Math.round(v)} s</title></rect>`; x -= 1; }
    return out + '</g>';
  }).join('');
  const H = 34 + T.rows.length * RH;
  const axis = `<line x1="${sx(0)}" y1="16" x2="${sx(0)}" y2="${H - 12}" stroke="#94abb7" stroke-dasharray="3 3"/><text x="${sx(0)}" y="12" fill="#94abb7" font-size="10" text-anchor="middle">fleet's middle</text>`
    + `<text x="${X1}" y="12" fill="#94abb7" font-size="10" text-anchor="end">faster →</text><text x="${X0}" y="12" fill="#94abb7" font-size="10">← slower</text>`
    + `<text x="${sx(-RANGE / 2)}" y="${H}" fill="#94abb7" font-size="10" text-anchor="middle">+${RANGE / 2} s</text><text x="${sx(RANGE / 2)}" y="${H}" fill="#94abb7" font-size="10" text-anchor="middle">−${RANGE / 2} s</text>`;
  const chip = (key: string, label: string, c: string, on: boolean, shape = 'dot') => `<button type="button" class="tchip${on ? '' : ' off'}" data-tchip="${key}" aria-pressed="${on}"><i class="${shape}" style="${shape === 'dia' ? `border-color:${c}` : `background:${c}`}"></i>${esc(label)}</button>`;
  const chips = chip('you', 'You', '#ffffff', true) + chip('best', 'Best on each leg', '#ffb627', shown.best) + chip('ideal', 'The ideal', '#e9f2f5', shown.ideal, 'dia')
    + boats.filter(b => b.id !== you).map(b => chip(String(b.id), b.name, b.color, shown.boats.has(b.id))).join('');
  const takes = T.rows.map(r => `<div class="ttk" data-tleg="${r.i}"><b>${r.i ? `L${r.i}` : 'S'}</b><span>${esc(r.take)}${r.side && r.side !== 'middle' ? ` <small>(${r.side})</small>` : ''}</span><em class="${r.vsMid > 0.5 ? 'lost' : r.vsMid < -0.5 ? 'won' : ''}">${Math.abs(r.vsMid) < 0.5 ? '±0' : `${r.vsMid > 0 ? '−' : '+'}${Math.round(Math.abs(r.vsMid))}`} s</em></div>`).join('');
  const legend = `<div class="tcauses">${CAUSES.map(c => `<span><i style="background:${c.color}"></i>${c.label}</span>`).join('')}</div>`;
  const how = `<details class="thow"><summary>How it's measured</summary><p>Each leg's time is from your own rounding (or start) to the next; the middle is the median boat on that leg. <b>The ideal</b> is the strategist's planned time for the leg, a perfect sail (8 s a tack): the sim's own fleet sails beats about a tenth slower (tests/sim-fleet.test.ts), so a gap to it is normal. The coloured bar is your seconds lost against the middle: <b>start</b> your crossing against the middle boat's; <b>shifts</b> time on headers past 4° at the header's cost, against the middle boat's; <b>tide</b> the current along the leg under you against hers; <b>laylines</b>, <b>clear air</b> and <b>tacks &amp; gybes</b> as the race log measured them for you; <b>speed &amp; other</b> the rest. Side of the course pays through the wind and the current, so it's shown as where you sailed, not as seconds.</p></details>`;
  return `<div class="tac${opts.compact ? ' compact' : ''}"><div class="tchips">${chips}</div>`
    + `<div class="tgrid"><svg class="tchart" viewBox="0 0 ${W} ${H + 6}" width="${W}" height="${H + 6}" role="img" aria-label="Your time on each leg against the fleet's middle">${axis}${rows}</svg>`
    + (opts.compact ? '' : `<div class="ttakes" style="padding-top:22px">${takes}</div>`) + `</div>${legend}${opts.compact ? `<div class="ttakes">${takes}</div>` : ''}${how}</div>`;
}

/** The race's three costliest causes, as tiles. */
export function tacticsTop(T: Tactics, place: string, youT: string): string {
  const ideal = T.idealTotal != null ? ` · the ideal ${Math.floor(T.idealTotal / 60)}:${String(Math.round(T.idealTotal % 60)).padStart(2, '0')}` : '';
  return `<div class="ttiles"><div class="ttile"><b>${esc(place)}</b><span>${esc(youT)}${ideal}</span></div>${T.top.map(t => `<div class="ttile lost"><b>−${t.s} s</b><span>${esc(t.words)}</span></div>`).join('')}</div>`;
}
export type { Cause };
