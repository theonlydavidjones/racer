import { SOURCE_LABEL, type Brief } from '../sim/brief';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A briefing (the strategist's or the navigator's) as HTML: sections, a table where there is one, and each point
 * tagged with where it comes from. */
export function briefHtml(b: Brief): string {
  // (the owner, 13 Nov 2026: no paragraphs on the screen) each point is its head and its first sentence, the rest on
  // hover; each section's method paragraph is behind "How it's measured"; the source tag says what it means on hover
  const first = (t: string) => { const m = t.match(/^.*?[.!?](?=\s+[A-Z(]|$)/); return m ? m[0] : t; };
  return b.sections.map(s => {
    const table = s.table ? `<div class="bf-tw"><table class="bf-table"><thead><tr>${s.table.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${s.table.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
    const items = s.items.map(i => { const one = first(i.text), more = one.length < i.text.length;
      return `<li${more ? ` title="${esc(i.text).replace(/"/g, '&quot;')}"` : ''}><span class="bf-src ${i.src}" title="Where it comes from: ${SOURCE_LABEL[i.src]}">${SOURCE_LABEL[i.src]}</span>${i.head ? `<b>${esc(i.head)}</b> ` : ''}${esc(one)}${more ? ' <span class="bf-more">…</span>' : ''}</li>`; }).join('');
    return `<section class="bf-sec" data-sec="${s.id}"><h3>${esc(s.title)}</h3>${table}<ul class="bf-items">${items}</ul>${s.lede ? `<details class="thow"><summary>How it's measured</summary><p>${esc(s.lede)}</p></details>` : ''}</section>`;
  }).join('');
}
