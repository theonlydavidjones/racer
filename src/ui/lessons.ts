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
