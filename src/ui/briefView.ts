import { SOURCE_LABEL, type Brief } from '../sim/brief';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A briefing (the strategist's or the navigator's) as HTML: sections, a table where there is one, and each point
 * tagged with where it comes from. */
export function briefHtml(b: Brief): string {
  const key = `<p class="bf-key">Each point says where it comes from: ${(['data', 'model', 'practice', 'rule'] as const).map(s => `<span class="bf-src ${s}">${SOURCE_LABEL[s]}</span>`).join(' ')}</p>`;
  return key + b.sections.map(s => {
    const table = s.table ? `<div class="bf-tw"><table class="bf-table"><thead><tr>${s.table.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${s.table.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
    const items = s.items.map(i => `<li><span class="bf-src ${i.src}">${SOURCE_LABEL[i.src]}</span>${i.head ? `<b>${esc(i.head)}</b> ` : ''}${esc(i.text)}</li>`).join('');
    return `<section class="bf-sec" data-sec="${s.id}"><h3>${esc(s.title)}</h3>${s.lede ? `<p class="lede">${esc(s.lede)}</p>` : ''}${table}<ul class="bf-items">${items}</ul></section>`;
  }).join('');
}
