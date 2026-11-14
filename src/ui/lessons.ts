import { LESSONS, type LessonId } from '../sim/lessons';

/**
 * Learn to sail's lessons as tiles (design/learn-to-sail-mockup.png): a picture, the name, ✓ once passed, and the ASA 101
 * items each practices on hover (design/ASA-101-CHECK.md). A built lesson's tile starts it; the rest are still to come.
 * No other copy: the owner's rule for the screen.
 */
/** All twelve, in the order they're learned: the built ones from sim/lessons.ts, the rest still to come. */
const ALL: { no: number; title: string; icon: string; id?: LessonId }[] = [
  { no: 1, title: 'The boat', icon: '⛵' }, { no: 2, title: 'Before you go', icon: '🦺' },
  ...LESSONS.map(l => ({ no: l.no, title: l.title, icon: l.icon, id: l.id })),
  { no: 9, title: 'Rules of the road', icon: '🚢' }, { no: 10, title: 'Crew overboard', icon: '🆘' },
  { no: 11, title: 'A breeze', icon: '💨' }, { no: 12, title: 'Home to the slip', icon: '🏁' }
].sort((a, b) => a.no - b.no);

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function lessonGridHtml(passed: readonly LessonId[]): string {
  const n = ALL.filter(l => l.id && passed.includes(l.id)).length;
  return `<div class="lsGrid">${ALL.map(l => {
    const L = l.id ? LESSONS.find(x => x.id === l.id) : null, done = !!l.id && passed.includes(l.id);
    const tip = L ? (L.asa === '—' ? 'Beyond ASA 101' : `ASA 101: ${L.asa}`) : 'Coming';
    return `<button type="button" class="lsTile${done ? ' done' : ''}${l.id ? '' : ' soon'}"${l.id ? ` data-lesson="${l.id}"` : ' disabled'} title="${esc(tip)}">`
      + `<span class="lsNo">${l.no}</span><span class="lsIc">${l.icon}</span><b>${esc(l.title)}</b>${done ? '<span class="lsOk">✓</span>' : ''}</button>`;
  }).join('')}</div><div class="lsSum">${n} of 12</div>`;
}

/**
 * Before you go (lesson 2; ASA 101 K16, K18, S21): the federally required gear for this boat (25 ft, an outboard, a closed
 * cabin, on coastal waters), each a picture and a word, tapped to check it's aboard; then a three-field float plan, left
 * with the club. Verified against the live eCFR (33 CFR 175, 83; up to date 12 Nov 2026,
 * https://www.ecfr.gov/current/title-33/part-175) and the USCG's "A Boater's Guide to the Federal Requirements for
 * Recreational Boats" (Nov 2023, uscgboating.org), 14 Nov 2026. The navigation lights (Rule 25, 33 CFR 83.25: sidelights
 * and a sternlight, or a masthead tricolor under 20 m, sunset to sunrise) are the lesson's next step, switched on.
 */
export const GEAR: { key: string; icon: string; name: string; tip: string }[] = [
  { key: 'pfd', icon: '🦺', name: 'Life jackets', tip: 'One wearable for each person aboard (33 CFR 175.15(a))' },
  { key: 'throw', icon: '🛟', name: 'Throwable', tip: 'One to throw, as well, at 16 ft and over (33 CFR 175.15(b))' },
  { key: 'sound', icon: '📯', name: 'Horn', tip: 'Some means of an efficient sound signal, under 12 m (33 CFR 83.33(b))' },
  { key: 'flares', icon: '🧨', name: 'Flares', tip: 'Visual distress signals for day and night, at 16 ft and over on coastal waters (33 CFR 175.110)' },
  { key: 'fire', icon: '🧯', name: 'Extinguisher', tip: 'One 5-B: an outboard boat under 26 ft with a closed cabin (33 CFR 175.320)' }
];
export function dockCardHtml(checked: ReadonlySet<string>, crew: number): string {
  const all = GEAR.every(g => checked.has(g.key));
  return `<div class="lsGear">${GEAR.map(g => `<button type="button" class="lsTile lsG${checked.has(g.key) ? ' done' : ''}" data-gear="${g.key}" title="${esc(g.tip)}"><span class="lsIc">${g.icon}</span><b>${esc(g.name)}</b>${checked.has(g.key) ? '<span class="lsOk">✓</span>' : ''}</button>`).join('')}</div>
    <div class="lsPlan${all ? '' : ' off'}"><div class="eyebrow">Float plan</div>
      <label>Where<input data-fp="where" class="pick" placeholder="Angel Island and back"></label>
      <label>Back by<input data-fp="back" class="pick" type="time" value="17:00"></label>
      <label>Aboard<input data-fp="aboard" class="pick" type="number" min="1" max="6" value="${crew}"></label></div>
    <div class="btnrow"><button type="button" class="cta" data-dock="go" ${all ? '' : 'disabled'}>Cast off</button></div>`;
}
