import type { Boat } from '../boat/boat';

/** What the crew are doing, in a line for the trim panel: where the weight is, who's away on a job, how they're holding up. */
const JOB: Record<string, string> = {
  car: 'forward moving the jib car', pole: 'at the mast with the pole', hoist: 'at the mast on a halyard',
  vang: 'adjusting the vang', outhaul: 'adjusting the outhaul', cunningham: 'adjusting the Cunningham', downhaul: 'tensioning the main halyard', jibHalyard: 'tensioning the jib halyard', jibCunningham: 'adjusting the jib Cunningham',
  backstay: 'adjusting the backstay', traveller: 'playing the traveler', jibsheet: 'trimming the jib', mainsheet: 'trimming the main'
};
/** The windward and leeward sides on this tack (the wind comes over the windward side), in words. */
export function sides(u: Boat): { ww: string; lw: string; wwS: string; lwS: string } {
  const S = u.tack === 'S'; // starboard tack: the wind over the starboard side
  return { ww: S ? 'starboard' : 'port', lw: S ? 'port' : 'starboard', wwS: S ? 'stbd' : 'port', lwS: S ? 'port' : 'stbd' };
}
/**
 * What the crew are doing, in a line for the trim panel. On auto, where they are and why (the wind and her heel); placed
 * by you, where you put them. Then who's away on a job and how they're holding up.
 */
export function crewWords(u: Boat): string {
  const c = u.crew; if (!c) return '';
  const n = c.spec.crew.length, names = n === 2 ? ['Helm', 'Trimmer', 'Bow hand'] : n === 1 ? ['Helm', 'Crew'] : ['You'];
  const { ww, lw } = sides(u), kt = Math.round(u.ww.kt), heel = Math.round(Math.abs(u.heel));
  const pl = c.place;
  let where: string;
  if (pl) {
    const across = pl.across == null ? '' : { lee: `sitting to leeward on the ${lw} side`, mid: 'in the middle', up: `sitting up on the ${ww} side`, hike: `hiking out on the ${ww} rail` }[pl.across];
    const fore = pl.fore == null ? '' : { fwd: 'weight forward', mid: 'weight in the middle', aft: 'weight aft', deck: n >= 2 ? 'up on the foredeck' : 'the crew at the mast' }[pl.fore];
    where = `You: ${[across, fore].filter(Boolean).join(', ')}. They stay there through tacks and puffs; tap Crew for auto`;
  } else {
    // (with the pole out on a run: where best practice has them, and how far they've followed it: crewPhys.ts chooseLayout)
    const pw = c.poleWhy, pole = pw && {
      fwd: `up on the foredeck, one astride the bow: a run with the pole out in ${kt} kt, bow down pays`,
      part: `the bow hand at the mast: a run with the pole out in ${kt} kt (a sharper crew would be right up on the foredeck)`,
      soon: `about to go forward to the foredeck: a run with the pole out in ${kt} kt`,
      soonMast: `the bow hand about to go forward to the mast: a run with the pole out in ${kt} kt`,
      stay: `staying in the cockpit: in ${kt} kt with the pole out a sharper crew would be up on the foredeck`,
      aft: `staying aft in ${kt} kt to keep the bow up`,
      late: `still forward: in ${kt} kt they should come aft to keep the bow up`,
      wrong: `up on the foredeck in ${kt} kt, a misjudgement: it's too windy, the bow digs in (a sharper crew would stay aft)`
    }[pw];
    where = 'Auto: ' + (pole ? pole : c.roll ? (c.roll.phase === 'hold' ? 'roll tack, holding the old high side' : 'roll tack, out hard to flatten her')
      : c.mode === 'leeward' ? `sitting to leeward on the ${lw} side: ${kt} kt, heeling her ${heel}° so the sails hold their shape`
      : c.mode === 'hike' ? `hiking out on the ${ww} rail: ${kt} kt and she's heeling ${heel}°, their weight holds her up`
      : c.mode === 'windward' ? `sitting up on the ${ww} side: ${kt} kt, their weight to windward`
      : c.mode === 'foredeck' ? 'weight forward, the bow hand at the mast: bow down pays downwind in light air'
      : c.mode === 'downwind' ? 'keeping her flat downwind' : `in the middle: ${kt} kt`);
  }
  const trim = Math.abs(c.trim) < 0.015 ? '' : c.trim > 0 ? ` · bow down ${Math.round(c.trim * 100)} cm` : ` · stern down ${Math.round(-c.trim * 100)} cm`;
  const jobs = c.people.map((p, i) => p.job && p.job.line !== 'jibsheet' && p.job.line !== 'mainsheet' && JOB[p.job.line] ? `${names[i] ?? 'Crew'} ${JOB[p.job.line]}${p.job.reach > 0 ? ' (on the way)' : ''}` : '').filter(Boolean);
  const tired = Math.max(...c.people.map(p => p.fatigue)) > 0.4 ? ' · tiring' : '';
  return `${where}${trim}${tired}${jobs.length ? ' · ' + jobs.join(', ') : ''}`;
}

/** Where the crew have put themselves, in the crew buttons' terms (boat/crewPhys.ts modes). */
export function autoAcross(u: Boat): 'lee' | 'mid' | 'up' | 'hike' {
  const m = u.crew?.mode; return m === 'leeward' ? 'lee' : m === 'hike' ? 'hike' : m === 'centre' || m === 'downwind' || m === 'foredeck' ? 'mid' : 'up';
}

let lastRow = '', crewOpen = false;
/** Open or fold the crew section while they're on auto (placed by you, it stays open). */
export function toggleCrewOpen(): void { crewOpen = !crewOpen; lastRow = ''; }
/** Open the crew section, its places showing (from the Crew button: where to sit is what you came for). */
export function openCrewChoices(): void { crewOpen = true; lastRow = ''; }
/** The full sailing reason for each place, on hover. */
const PLACE_TIP: Record<string, string> = {
  lee: 'Sit to leeward: on the low side. In light air your weight heels her about 6°, so the sails fall into their shape instead of slatting.',
  mid: 'Middle: weight on the centerline: downwind, where she sails flat.',
  up: 'Sit up: on the windward side deck, without leaning out. Weight to windward in a moderate breeze.',
  hike: 'Hike out: lean out over the windward rail to hold her up in a breeze. Hiking is always to windward: to put weight to leeward, sit to leeward.',
  fwd: 'Forward: weight forward in the cockpit. The bow goes down and the transom lifts clear: less drag in light air and flat water.',
  deck: 'Foredeck: send the crew right up forward, out of the cockpit: with two crew one astride the bow and one between the mast and the forestay, with one the crew at the mast. On a light-air run with the pole out the transom lifts clear; in a breeze the bow digs in.',
  aft: 'Aft: weight back by the helm. The stern goes down and the bow lifts: once she\'s going fast (about 5½ kt and up, near hull speed) or punching into a chop, so the bow rides over her bow wave and the waves.'
};
/**
 * The trim panel's crew section. One line while the crew place themselves (tap it to open): what they're doing and why.
 * Open, a fixed row of places, each naming its side on this tack, and fore and aft. On auto a dashed outline shows
 * where the crew have put themselves; choose a place and it's lit, the Crew · You switch goes to You, and the section
 * stays open until you tap Crew.
 */
export function showCrewRow(u: Boat): void {
  const c = u.crew, pl = c?.place, mine = !!pl, open = mine || crewOpen;
  const fore = c?.fore01 ?? 0.5, autoFore = fore > 0.7 ? 'fwd' : fore < 0.3 ? 'aft' : null, autoA = c ? autoAcross(u) : null;
  // (this runs every frame: touch the page only when something has changed)
  const key = `${pl?.across}|${pl?.fore}|${autoA}|${autoFore}|${u.tack}|${open}`; if (key === lastRow) return; lastRow = key;
  const { ww, lw, wwS, lwS } = sides(u);
  document.querySelectorAll<HTMLButtonElement>('#tpCrewRow [data-ca]').forEach(bt => {
    const p = bt.dataset.ca!;
    bt.classList.toggle('on', pl?.across === p);
    bt.classList.toggle('at', !pl?.across && autoA === p);
    bt.setAttribute('aria-pressed', String(pl?.across === p));
    bt.title = PLACE_TIP[p];
  });
  const side: Record<string, string> = { lee: `${lwS} side · heels her`, up: `${wwS} side deck`, hike: `${wwS} rail · holds her up` };
  document.querySelectorAll<HTMLElement>('#tpCrewRow [data-side]').forEach(el => { el.textContent = side[el.dataset.side!]; });
  document.querySelectorAll<HTMLButtonElement>('#tpForeRow [data-cf]').forEach(bt => {
    bt.classList.toggle('on', pl?.fore === bt.dataset.cf);
    bt.classList.toggle('at', !pl?.fore && autoFore === bt.dataset.cf);
    bt.setAttribute('aria-pressed', String(pl?.fore === bt.dataset.cf));
    bt.title = PLACE_TIP[bt.dataset.cf!];
  });
  const wind = document.getElementById('tpWind'); if (wind) wind.textContent = `Wind over the ${ww} side: ${ww} is windward, ${lw} is leeward`;
  const box = document.getElementById('tpCrewOpen'), line = document.getElementById('tpCrewLine');
  if (box) box.hidden = !open;
  if (line) { line.setAttribute('aria-expanded', String(open)); line.classList.toggle('open', open); line.title = open ? (mine ? 'Placed by you: tap Crew to put them back on auto' : 'Tap to fold') : 'Tap to see where the crew can sit'; }
  setWho('whoCrew', mine, mine ? 'You\'ve placed the crew: they stay there. Tap Crew to put them back on auto.' : 'On auto: the crew place their own weight. Tap You (or a place) to put them somewhere yourself.');
}

/** A Crew · You switch: green Crew while the crew does it (auto), amber You once it's yours. */
export function setWho(id: string | HTMLElement, yours: boolean, title?: string): void {
  const el = typeof id === 'string' ? document.getElementById(id) : id; if (!el) return;
  el.classList.toggle('yours', yours);
  el.querySelectorAll<HTMLButtonElement>('[data-who]').forEach(b => { const on = (b.dataset.who === 'you') === yours; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  if (title != null) el.title = title;
}
