import { clamp, wrap } from '../core/math';
import { SETTLE, type Boat, type Tack } from './boat';
import { CAR_FORE_PINS, CAR_IN_PINS, type Controls } from './controls';
import { CAR_ARM, TWO_FWD, Z, allAboard, attrOf, crewSkill, pace, reactTime, skillOf, type Aboard, type CrewSpec, type Person, type CrewState, type Station } from './crewPhys';

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
/** PIANO in its own order, as a list to loop over (the hot path: no spread each step). */
const PIANO_LIST: readonly Ctl[] = ['vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham', 'jibHalyard'];
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
 * angle), or their wish for it over a gust-lull cycle (LINE_GAP) this many of their start thresholds from where they set it. A
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
/** At the cabin top already for another line, the share of a trip's start threshold they'll trim a line in reach for
 * (an estimate: a fraction of what's worth the walk, as the walk's done). */
export const BATCH = 0.5;
/** How far along the boat (m) a line is still within the same visit: a step, not a walk (an estimate). */
const STEP_ALONG = 1;
/**
 * Holding a course, for the crew's place fore and aft (crewPhys.ts CrewCall.held): her heading within CIRCLING of its own over LINE_TAU, which a turn kept
 * up at more than about a degree and a quarter a second isn't, a slow penalty circle included, and a seaway's wander or a
 * sawing helm is; and not on a new course the guide hasn't been read for yet, her true wind angle (unsigned, a tack's no
 * new course) NEW_COURSE (deg) from where it was last read, unless that's been LINE_GAP since she last swung. The guide's
 * read once she's steady on it (physics.ts crewSettle, NEW_HELD). Estimates.
 */
export const NEW_COURSE = 15, CIRCLING = 25;
const wrapW = wrap; // (its import read once at load: docs/CAPACITY.md)
export function courseHeld(b: Boat): boolean {
  const s = b.settle; if (!s) return true;
  return Math.abs(wrapW(b.h - s[SETTLE.hHeld])) < CIRCLING && !guideUnread(b);
}
/** On a new course the guide hasn't been read for yet (courseHeld): for the small-gain trips to the cabin top, with
 * being settled. Not the circling test: after a bear-away onto a run her heading is that far from its own mean for half
 * a minute, and easing for the run is part of bearing away. */
export function guideUnread(b: Boat): boolean {
  const s = b.settle; if (!s) return false;
  return Math.abs(Math.abs(b.twa ?? 0) - s[SETTLE.twaGuide]) > NEW_COURSE && Math.abs(wrapW(b.h - s[SETTLE.hGuide])) > 10 && s[SETTLE.since] < LINE_GAP; // (10: physics.ts NEW_HEADING)
}
const NO_WAITS: readonly string[] = [], CREW_WAITS: readonly string[] = ['cunningham', 'downhaul', 'jibHalyard'], ALONE_WAITS: readonly string[] = [...PIANO];
export function waitingLines(c: CrewState): readonly string[] {
  if (c.place?.across == null) return NO_WAITS;
  return c.spec.crew.length ? CREW_WAITS : ALONE_WAITS;
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
function foreOf(c: CrewState): number {
  const f = c.place?.fore;
  if (!f) return c.fore01 ?? 0.5;
  return f === 'fwd' || f === 'deck' ? 1 : f === 'mid' ? 0.5 : 0;
}
/** Who works a line (an index into [helm, crew…]): by the number of crew, who has the main (mainHand), and who's forward. */
export function ownerOf(line: string, nCrew: number, spec?: CrewSpec, layout: Forward = 'cockpit', fwdOfWinch = false): number {
  if (nCrew === 0) return 0;
  // (two crew both forward of the jib winch, light air upwind: the helm takes the main, its sheet led to the thwart
  // behind them; the jib stays the forward crew's, its winch beside them. The owner's call, 14 Nov 2026)
  return ownerWith(line, nCrew, mainHand(nCrew, spec, layout !== 'cockpit' || fwdOfWinch), layout, fwdOfWinch);
}
/** ownerOf with who has the main already worked out (crewJobs: once a step, not for every line). */
function ownerWith(line: string, nCrew: number, main: number, layout: Forward, fwdOfWinch: boolean): number {
  if (nCrew === 0) return 0;
  const forward = layout !== 'cockpit';
  if (line === 'mainsheet' || line === 'traveller') return main;
  if (line === 'backstay') return 0;
  // the jib: the forward crew (with one crew, whichever of the two hasn't the main). With crew gone forward, whoever's
  // still in the cockpit: a Folkboat's jib sheets lead aft to the cockpit winches, out of reach from the mast (the middle
  // crew with the bow hand at the mast; the helm, with both sheets, when everyone else is forward)
  // (both forward of the winch, the helm on the main: the jib to the one beside its winch, the middle crew at Z.deckFwd,
  // where its sheet leads and they can tail and grind; the forward crew on the cabin's edge keeps the cabin-top lines and
  // the mast. The jib goes to whoever is at its winch, not by who sits forward: the Coordinator, 14 Nov 2026)
  if (line === 'jibsheet' || line === 'jibsheetW') return forward ? (layout === 'mast' && nCrew >= 2 ? 1 : 0) : nCrew === 2 && fwdOfWinch ? 1 : nCrew === 1 ? 1 - main : nCrew;
  return nCrew; // the forward hand: the cabin-top lines, the cars, the pole, the halyards
}

/** Where working a line puts a person (null: they work it from where they are). */
function stationFor(line: string, who: number, windward: number, big: boolean, breeze = false, front = false): Station | null {
  if (line === 'car') return { arm: CAR_ARM, z: Z.car, pose: 'car' };
  if (line === 'pole' || line === 'hoist') return { arm: 0.25, z: Z.mast, pose: 'mast' };
  // the outboard (stowed or shipped, sim/world.ts motorStow): kneeling on the after deck at the bracket, aft of the helm
  if (line === 'outboard') return { arm: 0.3, z: 3.3, pose: 'piano' };
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
  // (the jib hand of two, whose seat is forward of the winch (crewPhys.ts slotOf), works it from there, the crank swept
  // round from its forward side: not a walk aft past the winch to where the main trimmer sits after every tack. Both
  // forward of the winch, the jib is the middle crew's, sitting there: from their seat too)
  const zw = front ? Z.deckFwd : Z.winchAft;
  if (line === 'jibsheet' && big && who !== 0) return breeze ? { arm: 0.45, z: zw, pose: 'winch' } : { arm: -0.75, z: zw, pose: 'winch' };
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
  const n = c.spec.crew.length;
  return paceOf(who === 0 ? c.spec.helm : c.spec.crew[who - 1], who, n, helmSheetsOf(c, n)) * outPace(c, who);
}
/** (the helm with a sheet while the crew are forward: a hand on the tiller, one on the sheet) */
const helmSheetsOf = (c: CrewState, n: number) => (c.layout ?? 'cockpit') !== 'cockpit' || (n === 2 && foreOf(c) >= TWO_FWD);
const paceOf = (p: Person, who: number, n: number, helmSheets: boolean) => pace(p) * (who === 0 && (n === 0 || helmSheets) ? 0.6 : 1);
/** Struck in a jibe and out of action (boat/calls.ts boomStrike), a person works at a fraction of their pace (an estimate). */
export const STRUCK_PACE = 0.2;
const outPace = (c: CrewState, who: number) => (c.people[who]?.outUntil ?? 0) > (c.clock ?? 0) ? STRUCK_PACE : 1;
const sheetOf = (k: string) => k === 'jibsheet' || k === 'mainsheet' || k === 'traveller';
/** Who works a line now (crewJobs): its owner, or with the forward hand away at the cabin top or a car, the middle crew on the jib sheet meanwhile. */
/** The jib winch along the boat (m: render/hull.ts JIB_WINCH_Z), and how far from it fore and aft a crew member can tail and grind. */
const WINCH_Z = 1.64, WINCH_REACH = 0.5;
const nearWinch = (a: Aboard | undefined) => !!a && Math.abs(a.z - WINCH_Z) <= WINCH_REACH;
function workerOf(c: CrewState, n: number, fwdL: Forward, ahead: boolean, main: number, k: string): number {
  const o = ownerWith(k, n, main, fwdL, ahead);
  // (the jib to whoever is at its winch: its owner away from it, at the cabin top or on the way back, and the other of
  // two beside it and free, they trim it meanwhile. The Coordinator: the sheet goes where it leads, to whoever's there)
  if ((k === 'jibsheet' || k === 'jibsheetW') && n === 2 && o >= 1) {
    const m = 3 - o, am = c.people[m];
    if (!nearWinch(c.people[o]) && nearWinch(am) && !am!.job?.station) return m;
  }
  if ((k === 'jibsheet' || k === 'jibsheetW') && n >= 2) {
    const j = c.people[o]?.job;
    if (j?.station && (PIANO.has(j.line) || j.line === 'car' || j.line === 'paddle')) { const m = ahead ? 3 - o : ownerWith('mainsheet', n, main, fwdL, ahead); if (m !== o && (!c.people[m]?.job?.station || c.people[m]!.job!.line === 'jibsheet')) return m; }
  }
  return o;
}
/** Everyone aboard, [helm, crew…]: the crew's own list (crewPhys.ts placeCrew keeps it, c.ppl) while it's still these
 * people, else made afresh (allAboard), as it was every step. */
function pplOf(c: CrewState): Person[] {
  const p = c.ppl, s = c.spec;
  if (p && p.length === s.crew.length + 1 && p[0] === s.helm) { let same = true; for (let i = 0; i < s.crew.length; i++) if (p[i + 1] !== s.crew[i]) { same = false; break; } if (same) return p; }
  return allAboard(s);
}
/** Whether line `l`'s station is where they kneel now, at `z` (crewJobs: the ones here first). */
const hereAt = (l: string, who: number, windward: number, z: number) => Math.abs((stationFor(l, who, windward, false)?.z ?? z) - z) < 0.3;
/** A new point of sail since line `k` was set (crewJobs). */
const newAngleOf = (c: CrewState, twa: number, k: string) => c.lineTwa?.[k] != null && Math.abs(twa - c.lineTwa[k]) > 20;
/** A real change for line `k` since it was set (crewJobs): see LINE_MOVED. */
function realChangeOf(c: CrewState, twa: number, ls: Record<string, number>, k: string, skill: number): boolean {
  const ref = c.lineRef?.[k];
  return ref == null || newAngleOf(c, twa, k) || Math.abs((ls[k] ?? ref) - ref) >= LINE_MOVED * startThreshold(k, skill, ls[k]);
}
/**
 * Where the crew are taking line `k`, by crewJobs' own decisions (the trim coach judges a fix against it, coach.ts
 * withCrew): a job under way on it, the setting they're making; a cabin-top line they'll set once their waits let them
 * (their 20 s wish off it by their start threshold, and a real change since they set it, not a line a placed crew
 * leaves for a big change), and this moment's wish the same way, that wish (this moment's, for a big change), which is what they set a cabin-top line to; otherwise undefined: it stays where it
 * is. (Their thresholds at the crew's skill, where crewJobs takes the hand's own trim: near enough for the coach.) Not this moment's plan: that swings with each puff, which the crew don't chase.
 */
export function crewHeading(b: Boat, k: Ctl): number | undefined {
  const c = b.crew; if (!c) return undefined;
  for (const a of c.people) if (a.job?.line === k && a.job.to != null) return a.job.to;
  if (!PIANO.has(k) || waitingLines(c).includes(k)) return undefined;
  const lw = c.lineWant?.[k]; if (lw == null) return undefined;
  // (this moment's wish too, as crewJobs takes it: the plan's setting where the crew would pick it (physics.ts trimSails,
  // b.crewWorth over their trip threshold), else where it is; off by its threshold, and the same way as the 20 s wish)
  const skill = crewSkill(c), now = b.ctl[k], plan = b.crewPlan as Record<string, number> | null | undefined, worth = b.crewWorth as Record<string, number> | null | undefined;
  const want = plan && worth && (worth[k] ?? 0) >= 0.001 + 0.003 * (1 - skill) ? plan[k] : now;
  const dl = lw - now, dn = want - now, th = startThreshold(k, skill, lw);
  if (Math.abs(dl) < th || Math.abs(dn) < startThreshold(k, skill, want) || dl * dn <= 0 || !realChangeOf(c, b.twa ?? 0, c.lineSlow ?? {}, k, skill)) return undefined;
  // (a big change, both wishes well off, they set right through to this moment's wish, as crewJobs' `far` does)
  return Math.abs(dl) > 2 * th && Math.abs(dn) > 2 * th ? want : lw;
}
/** The per-line results crewJobs hands back, kept per boat and filled in afresh each step (read within the step only:
 * physics.ts trimSails), so a step makes none: a line absent from `want` is undefined, as it was missing before. */
type Work = { pace: number; to: number };
type Works = { out: Partial<Record<Ctl, Work>>; cell: Partial<Record<Ctl, Work>> };
const WORK = new WeakMap<Boat, Works>();
const put = (wk: Works, k: Ctl, pace: number, to: number) => { const e = wk.cell[k] ??= { pace, to }; e.pace = pace; e.to = to; wk.out[k] = e; };

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
  const c = b.crew;
  // (the results, per boat, reused: WORK)
  let wk = WORK.get(b); if (!wk) { wk = { out: {}, cell: {} }; WORK.set(b, wk); }
  const out = wk.out;
  for (const k in out) out[k as Ctl] = undefined;
  if (!c) { for (const k in want) put(wk, k as Ctl, 1, want[k as Ctl]!); return out; }
  const n = c.spec.crew.length, ppl = pplOf(c), windward = c.wind;
  // (anyone struck in a jibe and out of action, worked out once: nearly always nobody, and their pace then as it is)
  let anyOut = false; for (let i = 0; i < c.people.length; i++) if (c.people[i]!.outUntil > (c.clock ?? 0)) { anyOut = true; break; }
  const waits = waitingLines(c), placed = c.place?.across != null && n > 0;
  // who works a line now: its owner, but with the forward hand away at the cabin top or a car, the middle crew takes the
  // jib sheet from them meanwhile (as crews do: the jib stays trimmed, and the forward hand finishes what they went for):
  // workerOf
  const fwdL: Forward = c.layout ?? 'cockpit', ahead = n === 2 && foreOf(c) >= TWO_FWD, twa = b.twa ?? 0;
  const main = mainHand(n, c.spec, fwdL !== 'cockpit' || ahead);
  // finish or drop jobs on lines that are done, or that you've taken. A control line is set to where the crew wanted it
  // when they started (an adjustment, not a chase); the sheets follow the wind as it changes
  for (let i = 0; i < c.people.length; i++) {
    const a = c.people[i], j = a.job; if (!j) continue;
    // (a sheet that's no longer theirs, as the crew go forward and the helm takes the main: let go. A sheet follows the
    // wind, so it's never done; held, the bow hand at the mast kept the main, the helm the jib, and neither was trimmed)
    // (the jib held for the forward hand while they're at the cabin top is the middle crew's until they're back: worker)
    if (sheetOf(j.line) && workerOf(c, n, fwdL, ahead, main, j.line) !== i && ownerWith(j.line, n, main, fwdL, ahead) !== i) { a.job = null; continue; }
    // (placed by you: they leave a tweak they'd have to leave their place for, and work the dual-ended lines from there)
    if (waits.includes(j.line) && !j.big) { a.job = null; continue; }
    if (placed && BOTH_SIDES.has(j.line)) j.station = null;
    if (j.line in want) {
      const to = sheetOf(j.line) ? want[j.line as Ctl]! : j.to ?? want[j.line as Ctl]!;
      if (Math.abs(to - b.ctl[j.line as Ctl]) < DONE) {
        // (a cabin-top line counts as set when it's done, not when someone set off for it: one taken over half way, by a
        // sheet or the pole, is still to do, and isn't left wrong for LINE_GAP)
        // (and what it was set for: the angle and the wish when they chose where to set it, at the start; stamped at the
        // end, a line set through a bear-away was judged against the run's angle and left at the reach's setting)
        if (PIANO.has(j.line) && !placed) { (c.lineSet ??= {})[j.line] = c.clock ?? 0; c.pianoT = c.clock ?? 0; c.pianoWho = i; (c.lineTwa ??= {})[j.line] = j.refTwa ?? b.twa ?? 0; (c.lineRef ??= {})[j.line] = j.to ?? b.ctl[j.line as Ctl]; }
        a.job = null;
      }
    }
    else if (j.line !== 'car' && j.line !== 'pole' && j.line !== 'hoist' && j.line !== 'paddle' && j.line !== 'outboard') a.job = null; // (the paddle's job ends when she stops paddling: world.ts paddleWork)
  }
  // each free person takes the most urgent of their lines that's off by more than they'd bother with (looked at 20
  // times a second: quicker than anyone reacts)
  c.jobT = (c.jobT ?? 0) - dt; c.lineT = (c.lineT ?? 0) + dt;
  const look = c.jobT <= 0; if (look) c.jobT = 0.05;
  // (where they've wanted each cabin-top line lately: the wish smoothed over LINE_TAU, kept up whoever is busy)
  const lw = c.lineWant ??= {};
  // (and over a whole gust-lull cycle, LINE_GAP: what counts as a change that has come to stay, urgent, a new point of
  // sail; not a long puff, which the 20 s wish follows most of the way)
  const ls = c.lineSlow ??= {};
  // (and her angle over the same 20 s: whether she has turned since the lasting wish began to lag)
  if (look) c.twa20 = c.twa20 == null ? b.twa ?? 0 : c.twa20 + ((b.twa ?? 0) - c.twa20) * Math.min(1, c.lineT / LINE_TAU);
  if (look) {
    const fT = Math.min(1, c.lineT / LINE_TAU), fG = Math.min(1, c.lineT / LINE_GAP);
    for (const k of PIANO_LIST) {
      if (!(k in want)) { delete lw[k]; delete ls[k]; continue; }
      const w = want[k]!, l0 = lw[k], s0 = ls[k];
      lw[k] = l0 == null ? w : l0 + (w - l0) * fT; ls[k] = s0 == null ? w : s0 + (w - s0) * fG;
    }
    c.lineT = 0;
  }
  // (a new point of sail since the line was set; or their wish for it over the cycle well away from where they set
  // it: a real change. Against where it was set, not the wish then: a line set right through for a puff, the wish went
  // back to where it was and the line was left at the puff's setting for good (the physics review). A line not yet
  // set is not a new point of sail: as she starts, its first trip waits like any other): newAngleOf, realChangeOf
  if (look) for (const k of PRIORITY) {
    if (!(k in want)) continue;
    const who = workerOf(c, n, fwdL, ahead, main, k), a = c.people[who]; if (!a) continue;
    const skill = attrOf(ppl[who], 'trim'), e = Math.abs((want[k] ?? b.ctl[k]) - b.ctl[k]);
    if (a.job?.line === k) continue;
    let urgentTo = false;
    if (PIANO.has(k)) {
      // (a lasting change: what they've wanted lately and what they want now both off the same way, by enough to bother)
      // (each against its own threshold: the fine one for a line wanted right to its stop is for setting it there, not for
      // a trip to move it 2% because this moment's wish is at the stop and the lasting one isn't)
      // (up there already, at another of the cabin-top lines: they see to this one too before going back, one trip)
      const there = a.job?.station?.pose === 'piano' || a.pose === 'piano';
      // (and at it, free, with this line in reach: what's coming due there they see to now, at BATCH of the threshold a
      // trip takes and none of the walk's waits, rather than come back for it a minute later, as crews do: the Cunningham
      // and the outhaul a trip each, 94 s apart, crewcruise's 6 kt beam reach, the Coordinator, 16 Nov 2026)
      // (free there, or just done with a line there and not yet gone back: the job's end and their step aft are the same
      // moment; and this line a step along the cabin top from them, the Cunningham's place to the piano's, 0.75 m)
      const since = (c.clock ?? 0) - (c.lineSet?.[k] ?? -1e9), trip = (c.clock ?? 0) - (c.pianoT ?? -1e9);
      // (theirs: the hand who was there, not a mate sat within a step of it; and the wish over the cycle off the same way
      // too, by as much: not a 20 s puff's setting, to be undone with a walk of its own, the physics review)
      const atIt0 = !a.job && (there || (trip < 1 && c.pianoWho === who)) && Math.abs((stationFor(k, who, windward, false)?.z ?? a.z) - a.z) < STEP_ALONG;
      const th0 = startThreshold(k, skill, want[k]), dl = lw[k] - b.ctl[k], dn = want[k]! - b.ctl[k], dc = ls[k] - b.ctl[k];
      const atIt = atIt0 && dc * dn > 0 && Math.abs(dc) >= BATCH * th0, f = atIt ? BATCH : 1, th = f * th0;
      if (Math.abs(dl) < f * startThreshold(k, skill, lw[k]) || Math.abs(dn) < th || dl * dn <= 0) continue;
      // (and not again within LINE_TAU of the last time they set it, unless it's half its range off: knocked off)
      // (and the ones where they kneel first: the dual-ended lines from the cockpit's forward end, the one-sided from the
      // piano, 0.75 m on. Not to the other, back for one here, and over again, in the order the lines are listed; and only
      // for a line here they'd see to now: off, and for a real change)
      if (there && !a.job && !hereAt(k, who, windward, a.z)) {
        let other = false;
        for (const l of PIANO_LIST) {
          if (l !== k && hereAt(l, who, windward, a.z) && l in want && workerOf(c, n, fwdL, ahead, main, l) === who && Math.abs((lw[l] ?? want[l]!) - b.ctl[l]) >= startThreshold(l, skill, want[l]) && realChangeOf(c, twa, ls, l, skill)) { other = true; break; }
        }
        if (other) continue;
      }
      // (the waits are for the walk: a line they reach from where they sit, placed by you, they work when it's off)
      // (and none of it for a line knocked off, or wanted well away from where it is, now and lately both: a new point of
      // sail as she bears away, which has come to stay, not a puff's swing of the outhaul)
      // (placed by you, they have their own rule for a trip, PLACED_TRIP's big change: these waits are for the crew on auto)
      // (a new point of sail since this line was last set, more than 20° of the wind's angle: rounding a mark, bearing
      // away, coming up: the trim wanted is new, so it's seen to now, not after the waits)
      const newCourse = newAngleOf(c, twa, k);
      // (a walk for a real change: a new point of sail, their wish over the cycle well away from the setting (LINE_MOVED), or a line
      // they've not set yet. Urgent too: the wish over the cycle well off counts only once it has moved since the set)
      // (and a line outside what the depowering steps or the guide allow for the breeze and angle she's in is a real change
      // by definition, planWorth's 1: judged only by its wish's drift, a vang over the guide's ceiling was left there for
      // minutes, the physics review)
      const real = (b.crewWorth?.[k as keyof NonNullable<Boat['crewWorth']>] ?? 0) >= 1 || realChangeOf(c, twa, ls, k, skill);
      const walk = !placed, urgent = Math.abs(dl) >= 0.5 || (Math.abs(dn) >= LINE_URGENT && (newCourse || (real && Math.abs(ls[k] - b.ctl[k]) >= LINE_URGENT)));
      if (walk && !urgent && !atIt && (since < LINE_GAP || (trip < LINE_TRIP && !there) || !real)) continue;
      // (and an urgent one too, as said above: not again within LINE_TAU of the last setting unless it's knocked off.
      // Set right through to a puff's wish, they were back seven seconds later as it passed, the vang 0.17, 0.89, 0.58)
      if (walk && since < LINE_TAU && Math.abs(dl) < 0.5) continue;
      urgentTo = urgent && walk;
      if (!walk && since < LINE_TAU && Math.abs(dl) < 0.5) continue;
    }
    else if (e < startThreshold(k, skill, want[k])) continue;
    const sheet = sheetOf(k);
    // through a tack or a gybe, and in a hard turn, it's the sheets and the crossing: no one starts on a control line
    if (!sheet && (b.tacking || Math.abs(b.yawRate ?? 0) > 6 || c.roll)) continue;
    // and swinging, or just settled from it, or not yet holding the course she's come to (courseHeld), a cabin-top line
    // that only gains a little waits: what the depowering steps or the guide need goes at once (planWorth's 1). After a
    // bear-away onto a reach the vang went on short, capped by the guide still read for the beat, and again once it was
    // read for the reach: two trips for one change, crewcruise's 6 kt beam reach
    if (PIANO.has(k) && ((b.settle?.[SETTLE.left] ?? 0) > 0 || guideUnread(b)) && (b.crewWorth?.[k as keyof NonNullable<Boat['crewWorth']>] ?? 1) < 1) continue;
    // you've told them where to sit: they stay there. The dual-ended lines they reach from where they sit (below); the
    // piano's one-sided lines (the main Cunningham to port, the main halyard in the middle, the jib halyard to starboard)
    // wait: they get a trip only for a big change (a new wind, not a tweak), and the crew's plan sets the rest around them
    const big = waits.includes(k) && e >= PLACED_TRIP;
    if (waits.includes(k) && !big) continue;
    // a sheet takes over from a control line (not from a job under way forward: they're up at the car or the mast)
    if (a.job) {
      const committed = a.job.line === 'car' || a.job.line === 'pole' || a.job.line === 'hoist' || a.job.line === 'paddle' || a.job.line === 'outboard'; // (paddling: on the side deck with the crutch; the outboard: aft at the bracket, both hands on it)
      const onSheet = a.job.line === 'jibsheet' || a.job.line === 'mainsheet';
      if (!sheet || committed || onSheet) continue;
      // (and not from a cabin-top line they're at, or on their way to, for a jib sheet's trim: a job of a few seconds,
      // they finish it first unless the sheet wants a haul (JIB_HAUL). Called back for every trim, they went to the seat and
      // out again, in a breeze every few seconds, the line never set: the owner's "fussing". The mainsheet, two aboard
      // with the same person on it, goes on: the puff's ease is the main's)
      if (k === 'jibsheet' && a.job.station && PIANO.has(a.job.line) && e < JIB_HAUL && !placed) continue;
    }
    const hauling = (want[k] ?? 0) < b.ctl[k], breeze = (b.heelMag ?? 0) > 12 || c.hike > 0.2;
    // (a crew member away from the jib winch goes to it to trim: not from the cabin top, 0.8 m off)
    const toWinch = k === 'jibsheet' && who !== 0 && !nearWinch(a) && !placed;
    const st = placed && BOTH_SIDES.has(k) ? null : stationFor(k, who, windward, k === 'jibsheet' && ((hauling && e > JIB_HAUL) || toWinch), breeze, n === 2 && who === (ahead ? 1 : 2));
    // the sheets are in hand: no walk unless they're away from them
    const reach = sheet && !a.job && (st == null || a.pose === st.pose) ? 0 : reachTime(a, st, windward, ppl[who]);
    // (a cabin-top line is set to where they've wanted it lately, the wind there is, not this puff's: it's a threshold
    // off the line, so the trip is never for nothing; a big change that has come to stay, they set right through)
    // (just turned, the lasting wish still the old course's (her angle 20° off her angle over its 20 s, c.twa20): set to
    // the new course's wish, as a placed crew's outhaul was left at the beat's after a bear-away)
    const turned = PIANO.has(k) && Math.abs((b.twa ?? 0) - (c.twa20 ?? b.twa ?? 0)) > 20;
    const thr = startThreshold(k, skill, want[k]), far = PIANO.has(k) && Math.abs(lw[k] - b.ctl[k]) > 2 * thr && Math.abs(want[k]! - b.ctl[k]) > 2 * thr;
    // (an urgent one is set right through to where they want it now: set to the lagging wish it was still well off after,
    // and they were back for it seconds later. A trip to the foredeck (big: the line's PLACED_TRIP off) sets the line where
    // it's wanted, not partway along the lagging wish: one trip, not two)
    a.job = { line: k, reach, work: 0, station: st, to: PIANO.has(k) && !far && !urgentTo && !big && !turned ? lw[k] : want[k], ...(big ? { big } : {}), ...(urgentTo ? { urgent: true } : {}), ...(PIANO.has(k) ? { refTwa: b.twa ?? 0 } : {}) };
    if (PIANO.has(k) && placed) (c.lineSet ??= {})[k] = c.clock ?? 0; // (placed by you: as before, from setting off)
  }
  // work: whoever's at their line works it
  const helmSheets = helmSheetsOf(c, n);
  for (const kk in want) {
    const k = kk as Ctl, who = workerOf(c, n, fwdL, ahead, main, k), a = c.people[who];
    if (k === 'jibsheetW') { const pc = paceOf(ppl[who], who, n, helmSheets); put(wk, k, anyOut ? pc * outPace(c, who) : pc, want[k]!); continue; } // letting the lazy sheet fly is a flick of the wrist
    const j = a?.job, to = j?.line === k && !sheetOf(k) ? j.to ?? want[k]! : want[k]!;
    if (j?.line === k) {
      if (j.reach > 0) { j.reach -= dt; put(wk, k, 0, to); } else { const pc = paceOf(ppl[who], who, n, helmSheets); put(wk, k, anyOut ? pc * outPace(c, who) : pc, to); }
    } else put(wk, k, 0, to);
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
  const real = !was || Math.abs(tws - was.tws) >= Math.max(1, CAR_WIND * was.tws) || Math.abs((b.twa ?? 0) - was.twa) > 20;
  const turning = b.tacking || Math.abs(b.yawRate ?? 0) > 6 || !!c.roll || (b.twa ?? 0) < 25;
  const worth = yours || (real && !turning && b.carOff > CAR.hold(skill) && off >= (skill > 0.4 ? 1 : 2) && (c.people[who].lean < 0.5) && (b.heelMag ?? 0) < 20 && c.place?.across == null);
  if (!worth || a.job) return;
  // (their own wish waits while they're up on the foredeck on a run, forward of the mast: a lazy car's pin isn't worth the
  // trip back aft and forward again; they set it on their way back, the car being aft of the mast. From the mast it's a
  // step aft. Your call, they come for)
  if (!yours && a.z < Z.mast - 0.5) return;
  // (and at the cabin top, the lines there they still want come first: one stop for all of them, then the car on the
  // way forward, not to the car and back again. The cabin-top jobs are handed out 20 times a second, this every step)
  if (!yours && a.pose === 'piano') {
    const lw = c.lineWant;
    if (lw) for (const k of PIANO_LIST) if (lw[k] != null && ownerOf(k, n, c.spec, c.layout ?? 'cockpit', n === 2 && foreOf(c) >= TWO_FWD) === who && Math.abs(lw[k] - b.ctl[k]) >= startThreshold(k, skill, lw[k])) return;
  }
  a.job = { line: 'car', reach: reachTime(a, { arm: CAR_ARM, z: Z.car, pose: 'car' }, c.wind, p), work: CAR.work, station: { arm: CAR_ARM, z: Z.car, pose: 'car' }, side, target: { ...want } };
}


/** A job that isn't a line (the pole, a halyard): put the person at the mast until it's done. */
export function bodyJob(b: Boat, line: 'pole' | 'hoist' | 'outboard', on: boolean): number {
  const c = b.crew; if (!c) return 1;
  const n = c.spec.crew.length, who = ownerOf(line, n, c.spec, c.layout ?? 'cockpit'), a = c.people[who];
  if (on) { if (a.job?.line !== line && !(a.job && a.job.line === 'car')) a.job = { line, reach: 0, work: 1, station: stationFor(line, who, n, false) }; }
  else if (a.job?.line === line) a.job = null;
  return workPace(b, who);
}
