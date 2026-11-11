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
  return `${where}${trim}${tired}${jobs.length ? ' · ' + jobs.join(', ') : ''}${c.place ? ' (where you put them)' : ''}`;
}
