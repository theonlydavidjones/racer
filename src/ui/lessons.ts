import { LESSONS, type LessonId } from '../sim/lessons';

/**
 * Learn to sail's lessons as tiles (design/learn-to-sail-mockup.png): a picture, the name, ✓ once passed, and the ASA 101
 * items each practices on hover (design/ASA-101-CHECK.md). A built lesson's tile starts it; the rest are still to come.
 * No other copy: the owner's rule for the screen.
 */
/** All twelve, in the order they're learned: the built ones from sim/lessons.ts, the rest still to come. */
const ALL: { no: number; title: string; icon: string; id?: LessonId }[] = [
  // (the ones still to come; the built ones from sim/lessons.ts)
  ...[{ no: 1, title: 'The boat', icon: '⛵' }, { no: 9, title: 'Rules of the road', icon: '🚢' }, { no: 10, title: 'Crew overboard', icon: '🆘' }]
    .filter(c => !LESSONS.some(l => l.no === c.no)),
  ...LESSONS.map(l => ({ no: l.no, title: l.title, icon: l.icon, id: l.id }))
].sort((a, b) => a.no - b.no);
/** The lessons sailed from her own slip: without one (the boat editor gives her one) they can't start. */
const FROM_SLIP: ReadonlySet<LessonId> = new Set(['before', 'home']);

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function lessonGridHtml(passed: readonly LessonId[], hasSlip = true): string {
  const n = ALL.filter(l => l.id && passed.includes(l.id)).length;
  return `<div class="lsGrid">${ALL.map(l => {
    const L = l.id ? LESSONS.find(x => x.id === l.id) : null, done = !!l.id && passed.includes(l.id);
    const noSlip = !!l.id && FROM_SLIP.has(l.id) && !hasSlip, live = !!l.id && !noSlip;
    const tip = noSlip ? 'She needs a slip: give her one in the boat editor' : L ? (L.asa === '—' ? 'Beyond ASA 101' : `ASA 101: ${L.asa}`) : 'Coming';
    return `<button type="button" class="lsTile${done ? ' done' : ''}${live ? '' : ' soon'}"${live ? ` data-lesson="${l.id}"` : ' disabled'} title="${esc(tip)}">`
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
export const GEAR: { key: string; icon: string; name: string; tip: string; motor?: boolean }[] = [
  { key: 'pfd', icon: '🦺', name: 'Life jackets', tip: 'One wearable for each person aboard (33 CFR 175.15(a))' },
  { key: 'throw', icon: '🛟', name: 'Throwable', tip: 'One to throw, as well, at 16 ft and over (33 CFR 175.15(b))' },
  { key: 'sound', icon: '📯', name: 'Horn', tip: 'Some means of an efficient sound signal, under 12 m (33 CFR 83.33(b))' },
  // (coastal waters, 175.105(b), take in a bay only where its entrance is over 2 nm wide; the Gate is about 1, and no
  // ruling for the Bay was found: required outside the Gate, the territorial sea, and sound practice inside)
  { key: 'flares', icon: '🧨', name: 'Flares', tip: 'Day and night distress signals: required outside the Gate (33 CFR 175.110), carried inside too' },
  // (the fire rules apply only to a boat with propulsion machinery, 175.301(a): with her outboard, a closed cabin means one
  // 5-B, 175.320 tables 1–2)
  { key: 'fire', icon: '🧯', name: 'Extinguisher', tip: 'One 5-B: with an outboard and a closed cabin (33 CFR 175.301, 175.320)', motor: true }
];
/** The gear for her: the extinguisher only with an outboard aboard. */
export const gearFor = (outboard: boolean) => GEAR.filter(g => outboard || !g.motor);
export function dockCardHtml(checked: ReadonlySet<string>, crew: number, outboard: boolean): string {
  const G = gearFor(outboard), all = G.every(g => checked.has(g.key));
  return `<div class="lsGear" style="grid-template-columns:repeat(${G.length},1fr)">${G.map(g => `<button type="button" class="lsTile lsG${checked.has(g.key) ? ' done' : ''}" data-gear="${g.key}" title="${esc(g.tip)}"><span class="lsIc">${g.icon}</span><b>${esc(g.name)}</b>${checked.has(g.key) ? '<span class="lsOk">✓</span>' : ''}</button>`).join('')}</div>
    <div class="lsPlan${all ? '' : ' off'}"><div class="eyebrow">Float plan</div>
      <label>Where<input data-fp="where" class="pick" placeholder="Angel Island and back"></label>
      <label>Back by<input data-fp="back" class="pick" type="time" value="17:00"></label>
      <label>Aboard<input data-fp="aboard" class="pick" type="number" min="1" max="6" value="${crew}"></label></div>
    <div class="btnrow"><button type="button" class="cta" data-dock="go" ${all ? '' : 'disabled'}>Cast off</button></div>`;
}
