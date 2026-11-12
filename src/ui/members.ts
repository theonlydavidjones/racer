import { ATTRS, attrOf, type Attr } from '../boat/crewPhys';
import type { BoatSpec } from '../boat/spec';
import { YOU, type Member } from '../club/members';
import { SKIPPER_ATTRS, type SkipperAttr } from '../ai/skipper';

/**
 * The Yacht Club's Members tab (docs/YACHT-CLUB.md, phase 2): the roster as cards, and a member's page. Everyone's
 * ratings are shown (the owner: "skippers have reputations that precede them. Make them known"), in plain words: "Your
 * member" or "Club member", then "Skipper", "Crew" or "Skipper & crew". The crew half is here; the skipper half (her
 * seven ratings and her record) is Skipper Model's, through SKIPPER_UI below.
 */
export type MemberFilter = 'all' | 'skipper' | 'crew' | 'yours';

/** The crew attributes in plain words (boat/crewPhys.ts Attr), and what each does, for the tooltips. */
export const CREW_UI: [Attr, string, string][] = [
  ['trim', 'Trim', 'How close to the best they keep the sails and the boat: heel, weight, the lines'],
  ['react', 'Reactions', 'How quickly they start on a change: a puff, a call, a tack'],
  ['eyes', 'Eyes', 'How far off they see puffs and lulls coming, and how few they miss'],
  ['handling', 'Boat handling', 'The pace of their work: tacks, gybes, the pole, the hatch'],
  ['fitness', 'Fitness', 'How far out they hike and how long they last'],
  ['composure', 'Composure', 'How well they hold up under pressure: the start, the marks, close crosses'],
];
/** Skill levels to choose from (as the race setup's). */
export const SKILLS: [number, string][] = [[0.25, 'Novice'], [0.6, 'Club racer'], [0.9, 'Expert']];

/** The skipper half (Skipper Model): her ratings as bars on the card, and her section on the member's page. */
export const SKIPPER_UI: {
  bars(m: Member): string;
  section(m: Member): string;
} = { bars: () => '', section: () => '' };

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const LB = 0.4536, IN = 0.0254;
export const fmtHeight = (m: number) => { const t = Math.round(m / IN); return `${Math.floor(t / 12)}'${t % 12}"`; };

/** "Your member · Skipper & crew", in plain words. */
export function whoLine(m: Member): string {
  const role = m.roles.includes('skipper') && m.roles.includes('crew') ? 'Skipper & crew' : m.roles.includes('skipper') ? 'Skipper' : 'Crew';
  return `${m.origin === 'yours' ? 'Your member' : 'Club member'} · ${role}`;
}
/** Where they sail: "Crew on Josephine · middle: main", "Skipper of Josephine", or "Free". */
export function berth(m: Member, boats: BoatSpec[]): string {
  if (m.id === YOU) { const b = boats.find(x => x.skipper === 'you'); return b ? `Skipper of ${esc(b.name || 'your boat')}` : 'Skipper'; }
  for (const b of boats) {
    const i = (b.crewIds ?? []).indexOf(m.id);
    if (i >= 0) return `Crew on ${esc(b.name || 'Unnamed')} · ${(b.crewIds!.length === 1 ? 'crew' : i === 0 ? 'middle: main' : 'forward: jib, pole')}`;
  }
  return 'Free · not on a boat';
}

const bar = (label: string, v: number) =>
  `<span>${label}</span><div class="mbar"><i style="width:${Math.round(v * 100)}%"></i></div><span>${Math.round(v * 100)}</span>`;

/** The roster, as cards, filtered. */
export function membersGrid(ms: Member[], boats: BoatSpec[], filter: MemberFilter): string {
  const shown = ms.filter(m => filter === 'all' || (filter === 'yours' ? m.origin === 'yours' : m.roles.includes(filter)));
  const card = (m: Member) => {
    const crew = m.roles.includes('crew') && m.id !== YOU
      ? `<div class="mbars">${CREW_UI.map(([a, l]) => bar(l, attrOf(m, a))).join('')}</div>` : '';
    return `<button type="button" class="mcard" data-f="member" data-v="${esc(m.id)}"><b>${esc(m.name)}</b><span class="msub">${berth(m, boats)} · ${fmtHeight(m.h)} · ${Math.round(m.w / LB)} lb</span>
      <span class="mwho">${whoLine(m)}</span>${crew}${m.roles.includes('skipper') ? SKIPPER_UI.bars(m) : ''}</button>`;
  };
  const tabs = ([['all', 'Everyone'], ['skipper', 'Skippers'], ['crew', 'Crew'], ['yours', 'Yours']] as [MemberFilter, string][])
    .map(([v, l]) => `<button type="button" data-f="mfilter" data-v="${v}" aria-pressed="${filter === v}">${l}</button>`).join('');
  return `<div class="mtools"><div class="seg">${tabs}</div><button type="button" class="cta" data-f="mnew">New member</button></div>
    <div class="mgrid">${shown.map(card).join('') || '<small class="fnote">No one here yet.</small>'}</div>
    <small class="fnote">Your members are yours to set; the club's own come with its sliders (later). Everyone's ratings are shown: reputations precede them.</small>`;
}

/** A member's page: their name and build, their skill and crew ratings, a skipper too, and leaving the club. */
export function memberPage(m: Member, boats: BoatSpec[], confirmDelete: boolean): string {
  const yours = m.origin === 'yours', you = m.id === YOU;
  const skillSel = `<select data-m="skill"${yours ? '' : ' disabled'}>${SKILLS.map(([v, l]) => `<option value="${v}"${Math.abs((m.skill ?? 0.6) - v) < 0.05 ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  const sliders = CREW_UI.map(([a, l, t]) => {
    const v = attrOf(m, a), own = m.attr?.[a] != null;
    return `<label class="mslider" title="${t}"><span>${l}</span><input type="range" min="0" max="1" step="0.05" value="${v}" data-m="attr" data-a="${a}"${yours ? '' : ' disabled'}><output>${own ? Math.round(v * 100) : 'as skill'}</output></label>`;
  }).join('');
  const skipperToo = !you && yours ? `<label class="mcheck"><input type="checkbox" data-m="skipper"${m.roles.includes('skipper') ? ' checked' : ''}> Also sails as a skipper</label>` : '';
  const del = you || !yours ? '' : confirmDelete
    ? `<div class="gconfirm">Remove ${esc(m.name)} from the club? <button type="button" class="ghost danger" data-f="mdelYes">Remove</button><button type="button" class="ghost" data-f="mdelNo">Keep</button></div>`
    : `<button type="button" class="ghost" data-f="mdel">Remove from the club</button>`;
  return `<div class="mhead"><button type="button" class="linkbtn" data-f="mback">‹ Members</button><h2>${esc(m.name)}</h2><span class="mwho">${whoLine(m)}</span></div>
    <div class="mpage">
      <section><h3>${you ? 'You' : 'Who they are'}</h3>
        <label class="mfield"><span>Name</span><input data-m="name" value="${esc(m.name)}"${you || !yours ? ' disabled' : ''}></label>
        <label class="mfield"><span>Height</span><input data-m="h" value="${fmtHeight(m.h).replace(/"/g, '&quot;')}"${yours ? '' : ' disabled'}></label>
        <label class="mfield"><span>Weight</span><span><input data-m="w" value="${Math.round(m.w / LB)}" inputmode="numeric"${yours ? '' : ' disabled'}> lb</span></label>
        <label class="mfield"><span>Skill</span>${skillSel}</label>
        <p class="fnote">${berth(m, boats)}</p>${skipperToo}${del}
      </section>
      <section><h3>${you ? 'As crew, when you crew' : 'As crew'}</h3>${sliders}
        ${yours ? '<button type="button" class="ghost" data-f="mreset">All as skill</button>' : ''}</section>
      ${m.roles.includes('skipper') && !you ? `<section><h3>As skipper</h3>${SKIPPER_UI.section(m)}</section>` : ''}
    </div>`;
}

/** A change on a member's page (an input's data-m, and its value): applied to the member. Returns whether it changed. */
export function applyMemberInput(m: Member, field: string, value: string, attr?: string, checked?: boolean): boolean {
  if (m.origin !== 'yours') return false;
  switch (field) {
    case 'name': { const n = value.trim().slice(0, 40); if (!n || m.id === YOU) return false; m.name = n; return true; }
    case 'h': { const h = parseHeight(value); if (h && h > 1.2 && h < 2.3) { m.h = h; return true; } return false; }
    case 'w': { const lb = Number(value); if (lb > 70 && lb < 400) { m.w = lb * LB; return true; } return false; }
    case 'skill': m.skill = Number(value); return true;
    case 'attr': if (attr && (ATTRS as readonly string[]).includes(attr)) { (m.attr ??= {})[attr as Attr] = Number(value); return true; } return false;
    case 'sk': if (attr && (SKIPPER_ATTRS as readonly string[]).includes(attr)) { (m.skipper ??= {})[attr as SkipperAttr] = Number(value); return true; } return false;
    case 'skipper': {
      const has = m.roles.includes('skipper');
      if (checked && !has) m.roles = [...m.roles, 'skipper'];
      if (!checked && has) m.roles = m.roles.filter(r => r !== 'skipper');
      if (!m.roles.length) m.roles = ['crew'];
      return true;
    }
  }
  return false;
}
/** Heights as typed: 5'10", 178 cm, or 70 in. */
export function parseHeight(s: string): number | null {
  const ft = s.match(/^\s*(\d)\s*['’ ]\s*(\d{1,2})?\s*("|”)?\s*$/), cm = s.match(/^\s*(\d{3})\s*cm\s*$/i), inches = s.match(/^\s*(\d{2})\s*(in|")?\s*$/);
  if (ft) return (Number(ft[1]) * 12 + Number(ft[2] ?? 0)) * IN; if (cm) return Number(cm[1]) / 100; if (inches) return Number(inches[1]) * IN; return null;
}
