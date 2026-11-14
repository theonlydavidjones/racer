import { clamp } from '../core/math';
import type { Boat, Tack } from './boat';
import { CAR_FORE_PINS, CAR_IN_PINS, type Controls } from './controls';
import { CAR_ARM, TWO_FWD, Z, allAboard, attrOf, pace, reactTime, skillOf, type Aboard, type CrewSpec, type Person, type CrewState, type Station } from './crewPhys';

/**
 * Who does what, and in what order. Each person works one thing at a time; to work a line they first have to get to
 * it (a reaction time, then the walk or crawl), and while they're there their weight is there too (crewPhys.ts puts
 * them at the job's station, and the boat heels and trims to it). So the order and the pace of every adjustment
 * depend on how many hands there are and how good they are:
 *
 * - Three aboard (the usual Folkboat crew): the helm steers and has the backstay; the middle crew trims the main and
 *   the traveller (the helm keeps them if the middle crew is less experienced: mainHand); the forward hand has the jib
 *   sheets and the control lines on the cabin top (vang, outhaul, Cunninghams, downhaul), the jib cars and the pole.
 * - Two aboard: the more experienced of the two has the main and the traveller, the other the jib; the crew has the
 *   rest, one job after another.
 * - Alone: the helm does it all, with one hand, and has to leave the tiller's end to reach the cabin top.
 *
 * Sheets come first: a trimmer drops a control line to trim the jib after a tack (not a job already under way
 * forward). A skilled crew starts sooner (reaction time), works faster, makes finer adjustments, and doesn't chase
 * every small change; a novice lets things drift further before acting.
 *
 * The jib cars are the clearest case. A Folkboat's leads are cars on cabin-top tracks with pin stops (North Sails'
 * Folkboat tuning guide puts the lead 2.65 m from the forestay, 58 cm off the centreline): moving one means crawling
 * forward out of the cockpit, pulling the pin, sliding the car and pinning it again. The working (leeward) car can't be
 * moved while the sheet loads it, so a crew moves only the lazy car, before the next tack, and only when it's worth
 * it: a change of conditions that has lasted (they don't chase puffs), and not while she needs that person's weight on
 * the rail. So cars are rarely moved. (Times are estimates: no published timings for Folkboat crew work were reachable.)
 */

type Ctl = Exclude<keyof Controls, 'car'>;
/** The lines in the order they're seen to: sheets first, then the main's power, then shape. */
export const PRIORITY: readonly Ctl[] = ['jibsheet', 'mainsheet', 'traveller', 'backstay', 'vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham', 'jibHalyard'];
const PIANO = new Set<string>(['vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham', 'jibHalyard']);
/** The cabin-top lines led to both sides (controls.ts: vang, outhaul and jib Cunningham are dual-ended): worked from the windward side deck. */
const BOTH_SIDES = new Set<string>(['vang', 'outhaul', 'jibCunningham']);
/**
 * The cabin-top lines are set for the wind there is, not each puff: the forward hand goes to one only when it's off
 * both from where the crew have wanted it lately (their wish over about the last LINE_TAU s) and from where they want
 * it now, the same way: a change that has come to stay. The puffs
 * are the mainsheet's and the traveller's; the gust-lull cycle on the water is about a minute (Bethwaite, High
 * Performance Sailing), so the wind of the last 20 s or so is the wind there is. (An estimate.) A line knocked off, or
 * a new wind that has come to stay, is seen to as before.
 */
export const LINE_TAU = 20;
/**
 * And once a cabin-top line is set, it's left for at least a gust-lull cycle (about a minute, Bethwaite), unless it's
 * knocked off; and after any trip to the cabin top, the forward hand settles back for LINE_TRIP s (a cycle and a half)
 * before the next, seeing to whatever else wants it while up there.
 * Without these, the middle of the boat saw a trip every 20 s in steady sailing for changes of a few per cent (the
 * owner, v146: "just generally fussing about"). (Estimates: no published timings for Folkboat crew work.)
 */
export const LINE_GAP = 60, LINE_TRIP = 90;
/** A change of a cabin-top line this big (of its range), wanted now and lately, is seen to at once, waits or no: a new point of sail (bearing away, the vang on). A puff swings the outhaul's or the vang's wish about as much, so it's judged against their wish over a whole gust-lull cycle (LINE_GAP), which a puff doesn't carry. An estimate, unsourced. */
export const LINE_URGENT = 0.25;
/**
 * And a trip to a cabin-top line is for a real change since it was last set: a new point of sail (20° of the wind's
 * angle), or their wish for it over a gust-lull cycle (LINE_GAP) moved this many of their start thresholds since. A
 * crew sets the cunningham for the leg and the breeze, and leaves it; a hand with no sheet to tend sits still rather
 * than find work (the owner on the crew's fore and aft trips: "a key source of the jitteriness of the crew"). On the
 * line's own wish, not the wind: the outhaul's goes from eased to tight between 8 and 12 kt, the vang's hardly moves
 * upwind, and a fixed step of the wind was half one line's range and nothing to another (the physics review). A puff
 * of 20 s moves the minute's wish about a third of the way. An estimate, unsourced.
 */
export const LINE_MOVED = 2;
/**
 * The lazy jib car, which has no wish of its own over time, is reset for a new breeze: the minute's wind up or down by
 * this share of it (at least 1 kt). The highest minute's mean within ten minutes runs about 5 to 11% over the ten
 * minutes' (Harper, Kepert and Ginger, WMO guidelines on converting between wind-averaging periods, 2010), so this is
 * beyond the gusts' own swing. An estimate.
 */
export const CAR_WIND = 0.2;
/** The wind there's been over the last minute (kt): the crew's (crewPhys.ts twsAvg), else this moment's. */
const windNow = (b: Boat) => b.crew?.twsAvg ?? b.ww?.kt ?? 0;

/**
 * The crew's own lines that wait while you've placed them across the boat: the ones they'd have to leave their place
 * for, so they make the trip only for a big change (PLACED_TRIP), not every tweak. With crew, the main Cunningham (led to the port side), the downhaul (the middle) and the jib halyard (starboard); the dual-ended vang, outhaul
 * and jib Cunningham are led to both side decks, so they work those from where they sit. Alone, the helm would have to
 * leave the tiller for any of the cabin-top lines.
 */
/** How far off (of the line's range) a waiting line has to be before a placed crew makes the trip: a big change of wind. */
export const PLACED_TRIP = 0.3;
export function waitingLines(c: CrewState): readonly string[] {
  if (c.place?.across == null) return [];
  return c.spec.crew.length ? ['cunningham', 'downhaul', 'jibHalyard'] : [...PIANO];
}

/** How far in the jib sheet has to come (of its range) for the trimmer to go to the winch: the haul after a tack, when the
 * new sheet starts right off. A puff's trim is a pull from where they sit. (An estimate.) */
const JIB_HAUL = 0.25;

/**
 * Who trims the main (an index into [helm, crew…]). The owner, who races them: "normally middle crew trims the main.
 * sometimes it's the skipper if crew is less experienced. if only one crew member, then usually the crew and skipper
 * share the duty on the main, depending on crew experience." So with two crew, the middle crew unless they're less
 * experienced than the helm or a novice; with one, the more experienced of the two (the other has the jib).
 */
export const NOVICE = 0.3;
export function mainHand(nCrew: number, spec?: CrewSpec, forward = false): number {
  // (crew gone forward on a light-air run, to the mast or the foredeck: the helm has the main, as on any boat)
  if (forward) return 0;
  if (nCrew === 0 || !spec) return nCrew >= 2 ? 1 : 0;
  const helm = skillOf(spec.helm), mid = skillOf(spec.crew[0]);
  return mid >= helm && mid >= NOVICE ? 1 : 0;
}
/** Where the crew are along the deck (crewPhys.ts chooseLayout): in the cockpit, the bow hand at the mast, or both up on the foredeck. */
export type Forward = 'cockpit' | 'mast' | 'foredeck';
/** How far forward the crew sit (0 aft … 1 forward of the winch): where you've put them, else their own call (crewPhys.ts chooseFore). */
const foreOf = (c: CrewState): number => c.place?.fore ? { fwd: 1, mid: 0.5, aft: 0, deck: 1 }[c.place.fore] : c.fore01 ?? 0.5;
/** Who works a line (an index into [helm, crew…]): by the number of crew, who has the main (mainHand), and who's forward. */
export function ownerOf(line: string, nCrew: number, spec?: CrewSpec, layout: Forward = 'cockpit', fwdOfWinch = false): number {
  if (nCrew === 0) return 0;
  // (two crew both forward of the jib winch, light air upwind: the helm takes the main, its sheet led to the thwart
  // behind them; the jib stays the forward crew's, its winch beside them. The owner's call, 14 Nov 2026)
  const forward = layout !== 'cockpit', main = mainHand(nCrew, spec, forward || fwdOfWinch);
  if (line === 'mainsheet' || line === 'traveller') return main;
  if (line === 'backstay') return 0;
  // the jib: the forward crew (with one crew, whichever of the two hasn't the main). With crew gone forward, whoever's
  // still in the cockpit: a Folkboat's jib sheets lead aft to the cockpit winches, out of reach from the mast (the middle
  // crew with the bow hand at the mast; the helm, with both sheets, when everyone else is forward)
  if (line === 'jibsheet' || line === 'jibsheetW') return forward ? (layout === 'mast' && nCrew >= 2 ? 1 : 0) : nCrew === 1 ? 1 - main : nCrew;
  return nCrew; // the forward hand: the cabin-top lines, the cars, the pole, the halyards
}

/** Where working a line puts a person (null: they work it from where they are). */
function stationFor(line: string, who: number, windward: number, big: boolean, breeze = false): Station | null {
  if (line === 'car') return { arm: CAR_ARM, z: Z.car, pose: 'car' };
  if (line === 'pole' || line === 'hoist') return { arm: 0.25, z: Z.mast, pose: 'mast' };
  if (PIANO.has(line)) {
    // the helm, alone, has to leave the tiller's end to reach the cabin top
    if (who === 0) return { arm: 0.3, z: 1.6, pose: 'piano' };
    // dual-ended lines on the windward side of the cabin top's after end: kneeling at the cockpit's forward end on that
    // side, inboard of the jib winch and of a crewmate sitting out on the deck there (render/crew.ts draws them kneeling
    // at COCK0 + 0.55, about 1.6); the main Cunningham is on the port side, the downhaul in the middle
    if (BOTH_SIDES.has(line)) return { arm: 0.45, z: 1.6, pose: 'piano' };
    // The one-sided lines on the piano: from the windward side, as it's on that side; on the other tack the crew stay to
    // windward and lean in across the piano to reach it, rather than move their weight to leeward in a breeze: kneeling
    // on the cockpit sole's windward side (it's 0.70 m wide, the construction plan: hull.ts COCKPIT_FIT), hips about
    // 0.2 m to windward, where render/crew.ts draws them, and the cleat 0.4–0.5 m to leeward an easy reach. An estimate
    // from usual practice and the boat's own lines; no source describes it (12 Nov 2026: ask the owner how Josephine's crew does it)
    if (line === 'cunningham') return { arm: windward < 0 ? 0.7 : 0.2, z: Z.piano, pose: 'piano' };
    // (the jib halyard's tail is on the starboard side of the piano, the owner's Josephine: the mirror of the main Cunningham)
    if (line === 'jibHalyard') return { arm: windward > 0 ? 0.7 : 0.2, z: Z.piano, pose: 'piano' };
    return { arm: 0.3, z: Z.piano, pose: 'piano' };
  }
  // hauling the jib sheet in (after a tack): at the leeward winch, or in a breeze from the windward side of the cockpit
  // (keeping their weight up), cranking across; easing and small tweaks from where they sit. The traveller and
  // backstay are reached from the windward side deck, where the crew sits. The winch is turned from below the side deck,
  // in the cockpit, its crank lying aft at rest (render/boatMesh.ts, the owner's photo of Josephine): they work it abreast
  // the crank's grip (Z.winchAft). To leeward, the arm is still out at the coaming (-0.75) as before: whether they'd sit
  // inside on the bench there (about -0.45) is the owner's to say (the physics review)
  if (line === 'jibsheet' && big && who !== 0) return breeze ? { arm: 0.45, z: Z.winchAft, pose: 'winch' } : { arm: -0.75, z: Z.winchAft, pose: 'winch' };
  return null;
}

/** How far off a line has to be (of its full range) before this person goes to fix it: a skilled crew makes finer adjustments. */
export function startThreshold(line: string, skill: number, to?: number): number {
  // (the sheets are in hand and the trimmer watches the leech: small changes move the leech, controls.ts mainShape)
  if (line === 'jibsheet' || line === 'mainsheet') return 0.006;
  // (the traveller is in the main trimmer's other hand on the thwart, played with the sheet: as fine, over its range of 2)
  if (line === 'traveller') return 0.012;
  const range = line === 'traveller' ? 2 : 1;
  // a line wanted right on (or off) to its stop is pulled all the way: "backstay bar tight" is one clear action
  if (to != null && (to >= 0.98 || to <= (line === 'traveller' ? -0.98 : 0.02))) return 0.02;
  return range * (0.04 + 0.08 * (1 - skill));
}
/** A job's done when the line is there (it moves exactly to its target). */
const DONE = 1e-4;

/** How fast a person works (multiplier on the controls' rates): their pace, and one-handed if they're steering too. */
export function workPace(b: Boat, who: number): number {
  const c = b.crew; if (!c) return 1;
  const p = allAboard(c.spec)[who];
  // (and the helm with a sheet while the crew are forward: a hand on the tiller, one on the sheet)
  const n = c.spec.crew.length, helmSheets = (c.layout ?? 'cockpit') !== 'cockpit' || (n === 2 && foreOf(c) >= TWO_FWD);
  return pace(p) * (who === 0 && (n === 0 || helmSheets) ? 0.6 : 1);
}

/** Time (s) for a person to get to a station: react, then move there (about 0.9 m/s about the boat for a club crew; slower crawling forward on deck). */
function reachTime(a: Aboard, st: Station | null, windward: number, p: Person): number {
  if (!st) return reactTime(p) * 0.5;
  const dx = Math.abs(st.arm * windward - a.x), dz = Math.abs(st.z - a.z), forward = st.z < Z.cockpitFwd - 0.2;
  return reactTime(p) + (dx + dz) / ((forward ? 0.5 : 0.9) * pace(p));
}

/**
 * Hand out the jobs for this step: `want` holds where the crew would put each line it has. Returns, per line, the
 * pace it's being worked at (0: nobody on it yet).
 */
export function crewJobs(b: Boat, want: Partial<Record<Ctl, number>>, dt: number): Partial<Record<Ctl, { pace: number; to: number }>> {
  const c = b.crew, out: Partial<Record<Ctl, { pace: number; to: number }>> = {};
  if (!c) { for (const k of Object.keys(want) as Ctl[]) out[k] = { pace: 1, to: want[k]! }; return out; }
  const n = c.spec.crew.length, ppl = allAboard(c.spec), windward = c.wind;
  const err = (k: Ctl) => Math.abs((want[k] ?? b.ctl[k]) - b.ctl[k]);
  const sheetOf = (k: string) => k === 'jibsheet' || k === 'mainsheet' || k === 'traveller';
  const waits = waitingLines(c), placed = c.place?.across != null && n > 0;
  // who works a line now: its owner, but with the forward hand away at the cabin top or a car, the middle crew takes the
  // jib sheet from them meanwhile (as crews do: the jib stays trimmed, and the forward hand finishes what they went for)
  const fwdL: Forward = c.layout ?? 'cockpit', ahead = n === 2 && foreOf(c) >= TWO_FWD;
  const worker = (k: string) => {
    const o = ownerOf(k, n, c.spec, fwdL, ahead);
    if ((k === 'jibsheet' || k === 'jibsheetW') && n >= 2) {
      const j = c.people[o]?.job;
      if (j?.station && (PIANO.has(j.line) || j.line === 'car')) { const m = ownerOf('mainsheet', n, c.spec, fwdL, ahead); if (m !== o && (!c.people[m]?.job?.station || c.people[m]!.job!.line === 'jibsheet')) return m; }
    }
    return o;
  };
  // finish or drop jobs on lines that are done, or that you've taken. A control line is set to where the crew wanted it
  // when they started (an adjustment, not a chase); the sheets follow the wind as it changes
  c.people.forEach((a, i) => {
    const j = a.job; if (!j) return;
    // (a sheet that's no longer theirs, as the crew go forward and the helm takes the main: let go. A sheet follows the
    // wind, so it's never done; held, the bow hand at the mast kept the main, the helm the jib, and neither was trimmed)
    // (the jib held for the forward hand while they're at the cabin top is the middle crew's until they're back: worker)
    if (sheetOf(j.line) && worker(j.line) !== i && ownerOf(j.line, n, c.spec, fwdL, ahead) !== i) { a.job = null; return; }
    // (placed by you: they leave a tweak they'd have to leave their place for, and work the dual-ended lines from there)
    if (waits.includes(j.line) && !j.big) { a.job = null; return; }
    if (placed && BOTH_SIDES.has(j.line)) j.station = null;
    if (j.line in want) {
      const to = sheetOf(j.line) ? want[j.line as Ctl]! : j.to ?? want[j.line as Ctl]!;
      if (Math.abs(to - b.ctl[j.line as Ctl]) < DONE) {
        // (a cabin-top line counts as set when it's done, not when someone set off for it: one taken over half way, by a
        // sheet or the pole, is still to do, and isn't left wrong for LINE_GAP)
        // (and what it was set for: the angle and the wish when they chose where to set it, at the start; stamped at the
        // end, a line set through a bear-away was judged against the run's angle and left at the reach's setting)
        if (PIANO.has(j.line) && !placed) { (c.lineSet ??= {})[j.line] = c.clock ?? 0; c.pianoT = c.clock ?? 0; (c.lineTwa ??= {})[j.line] = j.refTwa ?? b.twa ?? 0; (c.lineRef ??= {})[j.line] = j.refWish ?? j.to ?? b.ctl[j.line as Ctl]; }
        a.job = null;
      }
    }
    else if (j.line !== 'car' && j.line !== 'pole' && j.line !== 'hoist') a.job = null;
  });
  // each free person takes the most urgent of their lines that's off by more than they'd bother with (looked at 20
  // times a second: quicker than anyone reacts)
  c.jobT = (c.jobT ?? 0) - dt; c.lineT = (c.lineT ?? 0) + dt;
  const look = c.jobT <= 0; if (look) c.jobT = 0.05;
  // (where they've wanted each cabin-top line lately: the wish smoothed over LINE_TAU, kept up whoever is busy)
  const lw = c.lineWant ??= {};
  // (and over a whole gust-lull cycle, LINE_GAP: what counts as a change that has come to stay, urgent, a new point of
  // sail; not a long puff, which the 20 s wish follows most of the way)
  const ls = c.lineSlow ??= {};
  if (look) { for (const k of PIANO) { if (!(k in want)) { delete lw[k]; delete ls[k]; continue; } const w = want[k as Ctl]!; lw[k] = lw[k] == null ? w : lw[k] + (w - lw[k]) * Math.min(1, c.lineT / LINE_TAU); ls[k] = ls[k] == null ? w : ls[k] + (w - ls[k]) * Math.min(1, c.lineT / LINE_GAP); } c.lineT = 0; }
  // (a new point of sail since the line was set; or their wish for it over the cycle moved since: a real change)
  const newAngle = (k: string) => Math.abs((b.twa ?? 0) - (c.lineTwa?.[k] ?? -999)) > 20;
  const realChange = (k: string, skill: number) => {
    const ref = c.lineRef?.[k];
    return ref == null || newAngle(k) || Math.abs((ls[k] ?? ref) - ref) >= LINE_MOVED * startThreshold(k, skill, ls[k]);
  };
  if (look) for (const k of PRIORITY) {
    if (!(k in want)) continue;
    const who = worker(k), a = c.people[who]; if (!a) continue;
    const skill = attrOf(ppl[who], 'trim'), e = err(k);
    if (a.job?.line === k) continue;
    let urgentTo = false;
    if (PIANO.has(k)) {
      // (a lasting change: what they've wanted lately and what they want now both off the same way, by enough to bother)
      // (each against its own threshold: the fine one for a line wanted right to its stop is for setting it there, not for
      // a trip to move it 2% because this moment's wish is at the stop and the lasting one isn't)
      const th = startThreshold(k, skill, want[k]), dl = lw[k] - b.ctl[k], dn = want[k]! - b.ctl[k];
      if (Math.abs(dl) < startThreshold(k, skill, lw[k]) || Math.abs(dn) < th || dl * dn <= 0) continue;
      // (and not again within LINE_TAU of the last time they set it, unless it's half its range off: knocked off)
      const since = (c.clock ?? 0) - (c.lineSet?.[k] ?? -1e9), trip = (c.clock ?? 0) - (c.pianoT ?? -1e9);
      // (up there already, at another of the cabin-top lines: they see to this one too before going back, one trip)
      const there = a.job?.station?.pose === 'piano' || a.pose === 'piano';
      // (and the ones where they kneel first: the dual-ended lines from the cockpit's forward end, the one-sided from the
      // piano, 0.75 m on. Not to the other, back for one here, and over again, in the order the lines are listed; and only
      // for a line here they'd see to now: off, and for a real change)
      if (there && !a.job) {
        const zOf = (l: string) => stationFor(l, who, windward, false)?.z ?? a.z, here = (l: string) => Math.abs(zOf(l) - a.z) < 0.3;
        if (!here(k) && [...PIANO].some(l => l !== k && here(l) && l in want && worker(l) === who && Math.abs((lw[l] ?? want[l as Ctl]!) - b.ctl[l as Ctl]) >= startThreshold(l, skill, want[l as Ctl]) && realChange(l, skill))) continue;
      }
      // (the waits are for the walk: a line they reach from where they sit, placed by you, they work when it's off)
      // (and none of it for a line knocked off, or wanted well away from where it is, now and lately both: a new point of
      // sail as she bears away, which has come to stay, not a puff's swing of the outhaul)
      // (placed by you, they have their own rule for a trip, PLACED_TRIP's big change: these waits are for the crew on auto)
      // (a new point of sail since this line was last set, more than 20° of the wind's angle: rounding a mark, bearing
      // away, coming up: the trim wanted is new, so it's seen to now, not after the waits)
      const newCourse = newAngle(k);
      // (a walk for a real change: a new point of sail, their wish over the cycle moved since (LINE_MOVED), or a line
      // they've not set yet. Urgent too: the wish over the cycle well off counts only once it has moved since the set)
      const real = realChange(k, skill);
      const walk = !placed, urgent = Math.abs(dl) >= 0.5 || (Math.abs(dn) >= LINE_URGENT && (newCourse || (real && Math.abs(ls[k] - b.ctl[k]) >= LINE_URGENT)));
      if (walk && !urgent && (since < LINE_GAP || (trip < LINE_TRIP && !there) || !real)) continue;
      urgentTo = urgent && walk;
      if (!walk && since < LINE_TAU && Math.abs(dl) < 0.5) continue;
    }
    else if (e < startThreshold(k, skill, want[k])) continue;
    const sheet = sheetOf(k);
    // through a tack or a gybe, and in a hard turn, it's the sheets and the crossing: no one starts on a control line
    if (!sheet && (b.tacking || Math.abs(b.yawRate ?? 0) > 6 || c.roll)) continue;
    // you've told them where to sit: they stay there. The dual-ended lines they reach from where they sit (below); the
    // piano's one-sided lines (the main Cunningham to port, the main halyard in the middle, the jib halyard to starboard)
    // wait: they get a trip only for a big change (a new wind, not a tweak), and the crew's plan sets the rest around them
    const big = waits.includes(k) && e >= PLACED_TRIP;
    if (waits.includes(k) && !big) continue;
    // a sheet takes over from a control line (not from a job under way forward: they're up at the car or the mast)
    if (a.job) {
      const committed = a.job.line === 'car' || a.job.line === 'pole' || a.job.line === 'hoist';
      const onSheet = a.job.line === 'jibsheet' || a.job.line === 'mainsheet';
      if (!sheet || committed || onSheet) continue;
      // (and not from a cabin-top line they're at, or on their way to, for a jib sheet's trim: a job of a few seconds,
      // they finish it first unless the sheet wants a haul (JIB_HAUL). Called back for every trim, they went to the seat and
      // out again, in a breeze every few seconds, the line never set: the owner's "fussing". The mainsheet, two aboard
      // with the same person on it, goes on: the puff's ease is the main's)
      if (k === 'jibsheet' && a.job.station && PIANO.has(a.job.line) && e < JIB_HAUL && !placed) continue;
    }
    const hauling = (want[k] ?? 0) < b.ctl[k], breeze = (b.heelMag ?? 0) > 12 || c.hike > 0.2;
    const st = placed && BOTH_SIDES.has(k) ? null : stationFor(k, who, windward, k === 'jibsheet' && hauling && e > JIB_HAUL, breeze);
    // the sheets are in hand: no walk unless they're away from them
    const reach = sheet && !a.job && (st == null || a.pose === st.pose) ? 0 : reachTime(a, st, windward, ppl[who]);
    // (a cabin-top line is set to where they've wanted it lately, the wind there is, not this puff's: it's a threshold
    // off the line, so the trip is never for nothing; a big change that has come to stay, they set right through)
    const thr = startThreshold(k, skill, want[k]), far = PIANO.has(k) && Math.abs(lw[k] - b.ctl[k]) > 2 * thr && Math.abs(want[k]! - b.ctl[k]) > 2 * thr;
    // (an urgent one is set right through to where they want it now: set to the lagging wish it was still well off after,
    // and they were back for it seconds later. A trip to the foredeck (big: the line's PLACED_TRIP off) sets the line where
    // it's wanted, not partway along the lagging wish: one trip, not two)
    a.job = { line: k, reach, work: 0, station: st, to: PIANO.has(k) && !far && !urgentTo && !big ? lw[k] : want[k], ...(big ? { big } : {}), ...(urgentTo ? { urgent: true } : {}), ...(PIANO.has(k) ? { refTwa: b.twa ?? 0, refWish: ls[k] } : {}) };
    if (PIANO.has(k) && placed) (c.lineSet ??= {})[k] = c.clock ?? 0; // (placed by you: as before, from setting off)
  }
  // work: whoever's at their line works it
  for (const k of Object.keys(want) as Ctl[]) {
    const who = worker(k), a = c.people[who];
    if (k === 'jibsheetW') { out[k] = { pace: workPace(b, who), to: want[k]! }; continue; } // letting the lazy sheet fly is a flick of the wrist
    const j = a?.job, to = j?.line === k && !sheetOf(k) ? j.to ?? want[k]! : want[k]!;
    if (j?.line === k) {
      if (j.reach > 0) { j.reach -= dt; out[k] = { pace: 0, to }; } else out[k] = { pace: workPace(b, who), to };
    } else out[k] = { pace: 0, to };
  }
  carJob(b, dt);
  return out;
}

/** Whether a jib car is free to move: the windward (lazy) one, or either with the jib down and no sheet load on them
 * (ROADMAP 8p; the owner: "with sails down, neither jib car should show as loaded"). */
export const carFree = (b: Boat, side: Tack): boolean => side === b.tack || (b.rig?.jib ?? 1) <= 0.05;

/** The lazy car the crew wants (from its plan) and how long they've wanted it; or your call (`b.carCmd`). */
export const CAR = {
  /** How long a change has to have lasted before a crew bothers (s): an expert sooner, a novice later (estimates). */
  hold: (skill: number) => 30 + 60 * (1 - skill),
  /** Pulling the pin, sliding the car, pinning it (s, a club crew), on top of getting there and back. */
  work: 6
};

/** The jib car: a trip forward for the forward hand (or whoever there is), only for the lazy car, only when worth it. */
function carJob(b: Boat, dt: number): void {
  const c = b.crew!, n = c.spec.crew.length, who = ownerOf('car', n, c.spec, c.layout ?? 'cockpit'), a = c.people[who], p = allAboard(c.spec)[who];
  const yours = b.carCmd ?? null, want = yours ?? b.carPlan ?? null;
  // (your call for a car that's loaded now, the jib hoisted or a tack: it can't be carried out; dropped, never moved to the other car)
  if (yours?.side && !carFree(b, yours.side)) { b.carCmd = null; if (a.job?.line === 'car') a.job = null; return; }
  const side: Tack = yours?.side ?? b.tack, lazy = b.ctl.car[side];
  // a job under way: on a car that's loaded now (the boat tacked onto it, or the jib went up), it can't be moved
  if (a.job?.line === 'car') {
    if (!carFree(b, a.job.side as Tack)) { a.job = null; return; }
    const lazy = b.ctl.car[a.job.side as Tack];
    if (a.job.reach > 0) { a.job.reach -= dt; return; }
    a.job.work -= dt * workPace(b, who);
    if (a.job.work <= 0) {
      // (their own: to the plan as it is when they've got there, not as it was when they set off)
      const t = yours ? a.job.target! : b.carPlan ?? a.job.target!; lazy.fore = clamp(t.fore, 0, CAR_FORE_PINS - 1); lazy.ins = clamp(t.ins, 0, CAR_IN_PINS - 1);
      (c.carSet ??= {})[a.job.side as Tack] = { tws: windNow(b), twa: b.twa ?? 0 };
      a.job = null; if (yours && yours.fore === lazy.fore && yours.ins === lazy.ins) b.carCmd = null; b.carOff = 0;
    }
    return;
  }
  if (!want) return;
  const off = Math.abs(want.fore - lazy.fore) + Math.abs(want.ins - lazy.ins);
  if (off === 0) { b.carOff = 0; if (yours) b.carCmd = null; return; }
  const skill = attrOf(p, 'trim');
  b.carOff = (b.carOff ?? 0) + dt;
  // your call: as soon as they're free. Their own: a change that has lasted, worth a pin (a novice: two), and not while
  // she needs their weight on the rail (nor while you've put them somewhere: they stay where you put them)
  // (and their own only for a real change since they last set this car: a new breeze (CAR_WIND), a new point of sail;
  // and not in a tack or a hard turn, or near head to wind, where the plan is for no course she's on)
  const was = c.carSet?.[side], tws = windNow(b);
  const real = !was || Math.abs(tws - was.tws) >= Math.max(1, CAR_WIND * tws) || Math.abs((b.twa ?? 0) - was.twa) > 20;
  const turning = b.tacking || Math.abs(b.yawRate ?? 0) > 6 || !!c.roll || (b.twa ?? 0) < 25;
  const worth = yours || (real && !turning && b.carOff > CAR.hold(skill) && off >= (skill > 0.4 ? 1 : 2) && (c.people[who].lean < 0.5) && (b.heelMag ?? 0) < 20 && c.place?.across == null);
  if (!worth || a.job) return;
  // (their own wish waits while they're up on the foredeck on a run, forward of the mast: a lazy car's pin isn't worth the
  // trip back aft and forward again; they set it on their way back, the car being aft of the mast. From the mast it's a
  // step aft. Your call, they come for)
  if (!yours && a.z < Z.mast - 0.5) return;
  // (and at the cabin top, the lines there they still want come first: one stop for all of them, then the car on the
  // way forward, not to the car and back again. The cabin-top jobs are handed out 20 times a second, this every step)
  const ctl = b.ctl as unknown as Record<string, number>, lw = c.lineWant ?? {};
  if (!yours && a.pose === 'piano' && [...PIANO].some(k => lw[k] != null && ownerOf(k, n, c.spec, c.layout ?? 'cockpit') === who && Math.abs(lw[k] - ctl[k]) >= startThreshold(k, skill, lw[k]))) return;
  a.job = { line: 'car', reach: reachTime(a, { arm: CAR_ARM, z: Z.car, pose: 'car' }, c.wind, p), work: CAR.work, station: { arm: CAR_ARM, z: Z.car, pose: 'car' }, side, target: { ...want } };
}


/** A job that isn't a line (the pole, a halyard): put the person at the mast until it's done. */
export function bodyJob(b: Boat, line: 'pole' | 'hoist', on: boolean): number {
  const c = b.crew; if (!c) return 1;
  const n = c.spec.crew.length, who = ownerOf(line, n, c.spec, c.layout ?? 'cockpit'), a = c.people[who];
  if (on) { if (a.job?.line !== line && !(a.job && a.job.line === 'car')) a.job = { line, reach: 0, work: 1, station: stationFor(line, who, n, false) }; }
  else if (a.job?.line === line) a.job = null;
  return workPace(b, who);
}
