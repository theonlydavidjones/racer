import type { Boat } from '../boat/boat';

/** What the crew are doing, in a line for the trim panel: where the weight is, who's away on a job, how they're holding up. */
const JOB: Record<string, string> = {
  car: 'forward moving the jib car', pole: 'at the mast with the pole', hoist: 'at the mast on a halyard',
  vang: 'adjusting the vang', outhaul: 'adjusting the outhaul', cunningham: 'adjusting the Cunningham', downhaul: 'adjusting the downhaul', jibCunningham: 'adjusting the jib Cunningham',
  backstay: 'adjusting the backstay', traveller: 'playing the traveller', jibsheet: 'trimming the jib', mainsheet: 'trimming the main'
};
export function crewWords(u: Boat): string {
  const c = u.crew; if (!c) return '';
  const n = c.spec.crew.length, names = n === 2 ? ['Helm', 'Trimmer', 'Bow hand'] : n === 1 ? ['Helm', 'Crew'] : ['You'];
  const where = c.roll ? (c.roll.phase === 'hold' ? 'Roll tack: holding the high side' : 'Roll tack: out hard to flatten her')
    : c.mode === 'leeward' ? 'To leeward, heeling her' : c.mode === 'hike' ? `Hiking${c.hike > 0.8 ? ' hard' : ''}` : c.mode === 'windward' ? 'Sitting up to windward'
    : c.mode === 'foredeck' ? 'Weight forward, bow at the mast' : c.mode === 'downwind' ? 'Keeping her flat' : 'In the middle';
  const trim = Math.abs(c.trim) < 0.015 ? '' : c.trim > 0 ? ` · weight forward: bow down ${Math.round(c.trim * 100)} cm` : ` · weight aft: stern down ${Math.round(-c.trim * 100)} cm`;
  const jobs = c.people.map((p, i) => p.job && p.job.line !== 'jibsheet' && p.job.line !== 'mainsheet' && JOB[p.job.line] ? `${names[i] ?? 'Crew'} ${JOB[p.job.line]}${p.job.reach > 0 ? ' (on the way)' : ''}` : '').filter(Boolean);
  const tired = Math.max(...c.people.map(p => p.fatigue)) > 0.4 ? ' · tiring' : '';
  return `${where}${trim}${tired}${jobs.length ? ' · ' + jobs.join(', ') : ''}${c.place ? ' (where you put them: off auto)' : ''}`;
}

/** Where the crew have put themselves, in the crew buttons' terms (boat/crewPhys.ts modes). */
export function autoAcross(u: Boat): 'lee' | 'mid' | 'up' | 'hike' {
  const m = u.crew?.mode; return m === 'leeward' ? 'lee' : m === 'hike' ? 'hike' : m === 'centre' || m === 'downwind' || m === 'foredeck' ? 'mid' : 'up';
}

/**
 * The trim panel's crew row: who's in charge of where they sit. On auto, the Auto pill is lit and a faint outline
 * follows where the crew have put themselves; once you've placed them, your choice is lit, the row says "you", and
 * the Auto pill goes dark (one tap gives it back to them), as a sail line does when you take it.
 */
export function showCrewRow(u: Boat): void {
  const c = u.crew, pl = c?.place, mine = !!pl;
  const fore = c?.fore01 ?? 0.5, autoFore = fore > 0.7 ? 'fwd' : fore < 0.3 ? 'aft' : null, autoA = c ? autoAcross(u) : null;
  document.querySelectorAll<HTMLButtonElement>('#tpCrewRow [data-ca]').forEach(bt => {
    bt.classList.toggle('on', pl?.across === bt.dataset.ca);
    bt.classList.toggle('at', !pl?.across && autoA === bt.dataset.ca);
    bt.setAttribute('aria-pressed', String(pl?.across === bt.dataset.ca));
  });
  document.querySelectorAll<HTMLButtonElement>('#tpForeRow [data-cf]').forEach(bt => {
    bt.classList.toggle('on', pl?.fore === bt.dataset.cf);
    bt.classList.toggle('at', !pl?.fore && autoFore === bt.dataset.cf);
    bt.setAttribute('aria-pressed', String(pl?.fore === bt.dataset.cf));
  });
  const auto = document.getElementById('bCrewAuto'), lab = document.getElementById('tpCrewLab');
  if (auto) {
    auto.classList.toggle('off', mine); auto.setAttribute('aria-pressed', String(!mine));
    auto.title = mine ? 'You\'ve placed the crew and they stay there. Tap to put them back on auto.' : 'On auto: the crew place their own weight (the outline shows where). Tap a place to put them there yourself.';
  }
  if (lab) lab.textContent = mine ? 'Crew · you' : 'Crew';
}
