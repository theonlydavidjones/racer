import { ATTRS, attrOf, type Attr } from '../boat/crewPhys';
import { sailNo, type BoatSpec } from '../boat/spec';
import { YOU, type Member } from '../club/members';
import { SKIPPER_ATTRS, type SkipperAttr } from '../ai/skipper';

/**
 * The Yacht Club's Members tab (docs/YACHT-CLUB.md, phase 2): the roster as cards, and a member's page. Everyone's
 * ratings are shown (the owner: "skippers have reputations that precede them. Make them known"). The roster is two
 * plain lists, you and your crew first, then the club, with no filter to work and no badges (docs/UI-AUDIT.md §4.8, the
 * owner's yes, 13 Nov 2026): each card says in one line who they are and where they sail, and shows the three ratings
 * that matter in their seat; all of them are on their page. The crew half is here; the skipper half (her seven ratings
 * and her record) is Skipper Model's, through SKIPPER_UI below.
 */

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
  /** Her ratings as bars: all seven, or only those named. */
  bars(m: Member, only?: readonly SkipperAttr[]): string;
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
/**
 * Their seat, for the card: the skipper's, the middle crew's (the main), the forward hand's (the jib and the pole), or
 * none. A boat goes by her country and sail number beside her name (the owner: sailors in a fleet go by sail numbers).
 */
function seat(m: Member, boats: BoatSpec[]): { line: string; kind: 'skipper' | 'middle' | 'forward' | 'free' } {
  const named = (b: BoatSpec) => `${esc(b.name || 'Unnamed')} ${esc(sailNo(b))}`;
  if (m.id === YOU) { const b = boats.find(x => x.skipper === 'you'); return { line: b ? `Skipper of ${named(b)}` : 'Skipper', kind: 'skipper' }; }
  for (const b of boats) {
    const ids = b.crewIds ?? [], i = ids.indexOf(m.id); if (i < 0) continue;
    const name = named(b);
    if (ids.length === 1) return { line: `Crew on ${name} (main and jib)`, kind: 'middle' };
    return i === 0 ? { line: `Middle crew on ${name} (the main)`, kind: 'middle' } : { line: `Forward hand on ${name} (the jib and the pole)`, kind: 'forward' };
  }
  return m.roles.includes('skipper') && !m.roles.includes('crew') ? { line: 'Skipper, not on a boat of yours', kind: 'skipper' } : { line: 'Free: not on a boat', kind: 'free' };
}
/**
 * The three ratings that matter most in a seat, for the card. The middle crew trims the main to the puffs and the
 * helm's calls (trim, eyes, reactions); the forward hand does the work at the mast and on the foredeck, the jib sheets,
 * the pole and the tacks (boat handling, fitness, reactions); a skipper, the start, the speed and the calls.
 */
const SEAT_CREW: Record<'middle' | 'forward' | 'free', Attr[]> = { middle: ['trim', 'eyes', 'react'], forward: ['handling', 'fitness', 'react'], free: ['trim', 'handling', 'react'] };
const SEAT_SKIPPER: readonly SkipperAttr[] = ['start', 'speed', 'tactics'];

const bar = (label: string, v: number) =>
  `<span>${label}</span><div class="mbar"><i style="width:${Math.round(v * 100)}%"></i></div><span>${Math.round(v * 100)}</span>`;

/** The roster: you and your crew, then the club's members, as cards. */
export function membersGrid(ms: Member[], boats: BoatSpec[]): string {
  const card = (m: Member) => {
    const st = seat(m, boats);
    const bars = st.kind === 'skipper' ? SKIPPER_UI.bars(m, SEAT_SKIPPER)
      : `<div class="mbars">${CREW_UI.filter(([a]) => SEAT_CREW[st.kind as 'middle'].includes(a)).map(([a, l]) => bar(l, attrOf(m, a))).join('')}</div>`;
    return `<button type="button" class="mcard" data-f="member" data-v="${esc(m.id)}"><b>${esc(m.name)}</b><span class="msub">${st.line} · ${fmtHeight(m.h)}, ${Math.round(m.w / LB)} lb</span>${bars}</button>`;
  };
  // (you first, then your boats' crews by seat, then the rest of yours; the club's own after)
  const order = (m: Member) => m.id === YOU ? 0 : boats.some(b => b.crewIds?.includes(m.id)) ? 1 : 2;
  const yours = ms.filter(m => m.origin === 'yours').sort((a, b) => order(a) - order(b)), club = ms.filter(m => m.origin !== 'yours');
  const group = (title: string, list: Member[], empty: string) => `<h3 class="mgroup">${title}</h3><div class="mgrid">${list.map(card).join('') || `<small class="fnote">${empty}</small>`}</div>`;
  return `<div class="mtools"><button type="button" class="cta" data-f="mnew">New member</button></div>
    ${group('You and your crew', yours, 'Just you so far: New member adds someone to sail with you.')}
    ${club.length ? group('The club', club, '') : ''}
    <small class="fnote">Yours are yours to set; the club's own members are shown as the club knows them. Open anyone for all their ratings.</small>`;
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
