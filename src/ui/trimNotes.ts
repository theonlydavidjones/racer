/**
 * Trim Notes (the owner, 14 Nov 2026: "a way to pause and get notes on my trim … what each line is currently doing to the
 * boat, what it should be doing (if not optimized already), and why"; Option 2 of design/trim-coach, with the owner's
 * change: "it would make more sense to have mainsheet and traveler on top of each other like they are on the real
 * controls"). Opened paused, from the coach's note or its key. Every line, grouped as the band and the boat group them:
 * the jib's sheet over its car; the main's shape (halyard, Cunningham, outhaul, vang); the jib's luff; the backstay; the
 * mainsheet over the traveler. A line to fix is numbered by what it's worth, with NOW / IDEAL / WHY (the owner, 15 Nov: "instead of 'should' … say 'ideal'") and its track
 * (where it is, white; where it wants to be, the teal ◆); a line that's right, a ✓ and a few words.
 */
import type { Boat, LineKey } from '../boat/boat';
import type { LineNote, Situation } from '../boat/coach';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const NAME: Partial<Record<LineKey, string>> = { jibsheet: 'Jib sheet', car: 'Jib car', downhaul: 'Main halyard', cunningham: 'Main Cunningham', outhaul: 'Outhaul', vang: 'Vang', jibCunningham: 'Jib Cunningham', jibHalyard: 'Jib halyard', backstay: 'Backstay', mainsheet: 'Mainsheet', traveller: 'Traveler' };
/** The groups, as on the band and the boat. */
const GROUPS: { name: string; lines: LineKey[]; wide?: boolean }[][] = [
  [{ name: 'Jib', lines: ['jibsheet', 'car'] }, { name: "The main's shape", lines: ['downhaul', 'cunningham', 'outhaul', 'vang'] }, { name: "The jib's luff", lines: ['jibCunningham', 'jibHalyard'] }],
  [{ name: 'Backstay', lines: ['backstay'] }, { name: 'Main', lines: ['mainsheet', 'traveller'], wide: true }]
];
/** A line's setting as how much is on (0 … 1): a sheet's value is how far it's eased; the traveler runs −1 … +1. */
const onOf = (k: LineKey, v: number) => (k === 'mainsheet' || k === 'jibsheet' ? 1 - v : k === 'traveller' ? (v + 1) / 2 : v);
const SHORT_IDEAL = (head: string) => { const t = head.replace(/\.$/, '').replace(/^Trim the (jib|main) in, /, 'In, ').replace(/^Ease the (jib|main), /, 'Out, '); return t[0].toUpperCase() + t.slice(1); };

export function trimNotesHtml(u: Boat, s: Situation, notes: LineNote[]): string {
  const by = new Map(notes.map(n => [n.line, n])), fixes = notes.filter(n => n.fix).sort((a, b) => b.fix!.gain - a.fix!.gain);
  const rank = new Map(fixes.map((n, i) => [n.line, i + 1]));
  const ctl = u.ctl as unknown as Record<string, number>;
  const track = (k: LineKey, n: LineNote) => {
    if (k === 'car') return '<span class="tn-tr off"></span>';
    const now = onOf(k, ctl[k] ?? 0);
    let t = `<span class="now" style="left:${(now * 100).toFixed(1)}%"></span>`;
    if (n.fix?.to != null) { const to = onOf(k, n.fix.to), lo = Math.min(now, to), hi = Math.max(now, to);
      t += `<span class="way" style="left:${(lo * 100).toFixed(1)}%;width:${((hi - lo) * 100).toFixed(1)}%"></span><span class="cue-target" style="left:${(to * 100).toFixed(1)}%"></span>`; }
    return `<span class="tn-tr">${t}</span>`;
  };
  const line = (k: LineKey) => {
    const n = by.get(k); if (!n) return '';
    const r = rank.get(k), who = n.who === 'crew' ? '<span class="who">Crew</span>' : '';
    const head = `<div class="tn-h"><b>${NAME[k] ?? k}</b>${who}${r ? `<span class="tn-n">${r}</span>` : n.tick ? '<span class="cue-ok">✓</span>' : ''}</div>${track(k, n)}`;
    return n.fix
      ? `<div class="tn-line fix" data-line="${k}">${head}<dl><dt>Now</dt><dd>${esc(n.fix.now ?? '')}</dd><dt>Ideal</dt><dd class="sh">${esc(SHORT_IDEAL(n.fix.head))}</dd><dt>Why</dt><dd>${esc(n.fix.short ?? n.fix.why)}</dd></dl></div>`
      : `<div class="tn-line ok" data-line="${k}">${head}<p>${esc(n.ok)}</p></div>`;
  };
  const rows = GROUPS.map(row => `<div class="tn-row${row.length === 2 ? ' two' : ''}">${row.map(g => {
    const ls = g.lines.filter(k => by.has(k)); if (!ls.length) return '';
    return `<section class="tn-grp${g.wide ? ' wide' : ''}"><h3>${g.name}</h3>${ls.map(line).join('')}</section>`;
  }).join('')}</div>`).join('');
  return `<header class="tn-hd"><h2>Trim notes</h2><span class="sit">${esc(s.label)}</span>
    <span class="spd"><b>${s.speedKt.toFixed(1)}</b> <i>of</i> <b>${s.targetKt.toFixed(1)}</b> <i>kt</i></span>
    <button type="button" class="ghost" id="bTrimNotesX">Back</button></header>${rows}
    ${fixes.length ? '' : '<p class="tn-all">Every line right for this wind and angle.</p>'}`;
}
