import type { Boat } from '../boat/boat';

/** What the crew are doing, in a line for the trim panel: where the weight is, who's away on a job, how they're holding up. */
const JOB: Record<string, string> = {
  car: 'forward moving the jib car', pole: 'at the mast with the pole', hoist: 'at the mast on a halyard',
  vang: 'on the vang', outhaul: 'on the outhaul', cunningham: 'on the Cunningham', downhaul: 'on the downhaul', jibCunningham: 'on the jib Cunningham',
  backstay: 'on the backstay', traveller: 'on the traveller', jibsheet: 'on the jib sheet', mainsheet: 'on the mainsheet'
};
export function crewWords(u: Boat): string {
  const c = u.crew; if (!c) return '';
  const n = c.spec.crew.length, names = n === 2 ? ['Helm', 'Trimmer', 'Bow'] : ['Helm', 'Crew'];
  const where = c.roll ? (c.roll.phase === 'hold' ? 'Roll tack: holding the high side' : 'Roll tack: out hard to flatten her')
    : c.mode === 'leeward' ? 'To leeward, heeling her' : c.mode === 'hike' ? `Hiking${c.hike > 0.8 ? ' hard' : ''}` : c.mode === 'windward' ? 'Sitting up to windward'
    : c.mode === 'foredeck' ? 'Weight forward, bow at the mast' : c.mode === 'downwind' ? 'Keeping her flat' : 'In the middle';
  const trim = Math.abs(c.trim) < 0.015 ? '' : c.trim > 0 ? ` · ${Math.round(c.trim * 100)} cm by the bow` : ` · ${Math.round(-c.trim * 100)} cm by the stern`;
  const jobs = c.people.map((p, i) => p.job && p.job.line !== 'jibsheet' && p.job.line !== 'mainsheet' && JOB[p.job.line] ? `${names[i] ?? 'Crew'} ${JOB[p.job.line]}${p.job.reach > 0 ? ' (on the way)' : ''}` : '').filter(Boolean);
  const tired = Math.max(...c.people.map(p => p.fatigue)) > 0.4 ? ' · tiring' : '';
  return `${where}${trim}${tired}${jobs.length ? ' · ' + jobs.join(', ') : ''}${c.place ? ' (where you put them)' : ''}`;
}
