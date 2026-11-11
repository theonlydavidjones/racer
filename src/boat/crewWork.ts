import { clamp } from '../core/math';
import type { Boat } from './boat';
import { CAR_FORE_PINS, CAR_IN_PINS, type Controls } from './controls';
import { CAR_ARM, Z, allAboard, pace, reactTime, skillOf, type Aboard, type CrewState, type Station } from './crewPhys';

/**
 * Who does what, and in what order. Each person works one thing at a time; to work a line they first have to get to
 * it (a reaction time, then the walk or crawl), and while they're there their weight is there too (crewPhys.ts puts
 * them at the job's station, and the boat heels and trims to it). So the order and the pace of every adjustment
 * depend on how many hands there are and how good they are:
 *
 * - Three aboard (the usual Folkboat crew): the helm steers and has the mainsheet and backstay; the middle crew
 *   trims the jib and the traveller; the forward hand works the control lines on the cabin top (vang, outhaul,
 *   Cunninghams, downhaul), the jib cars and the pole.
 * - Two aboard: the helm takes the traveller too; the crew has everything else, one job after another.
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
export const PRIORITY: readonly Ctl[] = ['jibsheet', 'mainsheet', 'traveller', 'backstay', 'vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham'];
const PIANO = new Set<string>(['vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham']);
/** The cabin-top lines led to both sides (controls.ts: vang, outhaul and jib Cunningham are dual-ended): worked from the windward side deck. */
const BOTH_SIDES = new Set<string>(['vang', 'outhaul', 'jibCunningham']);
/**
 * The cabin-top lines are set for the wind there is, not each puff: the forward hand goes to one when it's off from
 * where the crew have wanted it lately (their wish over about the last LINE_TAU s), not from this moment's. The puffs
 * are the mainsheet's and the traveller's; the gust-lull cycle on the water is about a minute (Bethwaite, High
 * Performance Sailing), so the wind of the last 20 s or so is the wind there is. (An estimate.) A line knocked off, or
 * a new wind that has come to stay, is seen to as before.
 */
export const LINE_TAU = 20;

/**
 * The crew's own lines that wait while you've placed them across the boat: the ones they'd have to leave their place
 * for, so they make the trip only for a big change (PLACED_TRIP), not every tweak. With crew, the main Cunningham (led to the port side) and the downhaul (the middle); the dual-ended vang, outhaul
 * and jib Cunningham are led to both side decks, so they work those from where they sit. Alone, the helm would have to
 * leave the tiller for any of the cabin-top lines.
 */
/** How far off (of the line's range) a waiting line has to be before a placed crew makes the trip: a big change of wind. */
export const PLACED_TRIP = 0.3;
export function waitingLines(c: CrewState): readonly string[] {
  if (c.place?.across == null) return [];
  return c.spec.crew.length ? ['cunningham', 'downhaul'] : [...PIANO];
}

/** How far in the jib sheet has to come (of its range) for the trimmer to go to the winch: the haul after a tack, when the
 * new sheet starts right off. A puff's trim is a pull from where they sit. (An estimate.) */
const JIB_HAUL = 0.25;

/** Who works a line (an index into [helm, crew…]): by the number of crew. */
export function ownerOf(line: string, nCrew: number): number {
  if (nCrew === 0) return 0;
  if (line === 'mainsheet' || line === 'backstay') return 0;
  if (line === 'traveller') return nCrew === 1 ? 0 : 1;
  if (line === 'jibsheet' || line === 'jibsheetW') return 1;
  return nCrew; // the forward hand: the cabin-top lines, the cars, the pole, the halyards
}

/** Where working a line puts a person (null: they work it from where they are). */
function stationFor(line: string, who: number, windward: number, big: boolean, breeze = false): Station | null {
  if (line === 'car') return { arm: CAR_ARM, z: Z.car, pose: 'car' };
  if (line === 'pole' || line === 'hoist') return { arm: 0.25, z: Z.mast, pose: 'mast' };
  if (PIANO.has(line)) {
    // the helm, alone, has to leave the tiller's end to reach the cabin top
    if (who === 0) return { arm: 0.3, z: 1.6, pose: 'piano' };
    // dual-ended lines from the windward side deck (in off the rail); the main Cunningham is on the port side, the downhaul in the middle
    if (BOTH_SIDES.has(line)) return { arm: 0.7, z: Z.cockpitFwd, pose: 'piano' };
    if (line === 'cunningham') return { arm: windward < 0 ? 0.7 : -0.4, z: Z.piano, pose: 'piano' };
    return { arm: 0.3, z: Z.piano, pose: 'piano' };
  }
  // hauling the jib sheet in (after a tack): at the leeward winch, or in a breeze from the windward side of the cockpit
  // (keeping their weight up), cranking across; easing and small tweaks from where they sit. The traveller and
  // backstay are reached from the windward side deck, where the crew sits
  if (line === 'jibsheet' && big && who !== 0) return breeze ? { arm: 0.45, z: 1.3, pose: 'winch' } : { arm: -0.75, z: 1.3, pose: 'winch' };
  return null;
}

/** How far off a line has to be (of its full range) before this person goes to fix it: a skilled crew makes finer adjustments. */
export function startThreshold(line: string, skill: number, to?: number): number {
  // (the sheets are in hand and the trimmer watches the leech: small changes move the leech, controls.ts mainShape)
  if (line === 'jibsheet' || line === 'mainsheet') return 0.006;
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
  return pace(p) * (who === 0 && c.spec.crew.length === 0 ? 0.6 : 1);
}

/** Time (s) for a person to get to a station: react, then move there (about 0.9 m/s about the boat for a club crew; slower crawling forward on deck). */
function reachTime(a: Aboard, st: Station | null, windward: number, p: { skill?: number; h: number; w: number }): number {
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
  const sheetOf = (k: string) => k === 'jibsheet' || k === 'mainsheet';
  const waits = waitingLines(c), placed = c.place?.across != null && n > 0;
  // finish or drop jobs on lines that are done, or that you've taken. A control line is set to where the crew wanted it
  // when they started (an adjustment, not a chase); the sheets follow the wind as it changes
  c.people.forEach(a => {
    const j = a.job; if (!j) return;
    // (placed by you: they leave a tweak they'd have to leave their place for, and work the dual-ended lines from there)
    if (waits.includes(j.line) && !j.big) { a.job = null; return; }
    if (placed && BOTH_SIDES.has(j.line)) j.station = null;
    if (j.line in want) { const to = sheetOf(j.line) ? want[j.line as Ctl]! : j.to ?? want[j.line as Ctl]!; if (Math.abs(to - b.ctl[j.line as Ctl]) < DONE) a.job = null; }
    else if (j.line !== 'car' && j.line !== 'pole' && j.line !== 'hoist') a.job = null;
  });
  // each free person takes the most urgent of their lines that's off by more than they'd bother with (looked at 20
  // times a second: quicker than anyone reacts)
  c.jobT = (c.jobT ?? 0) - dt;
  const look = c.jobT <= 0; if (look) c.jobT = 0.05;
  if (look) for (const k of PRIORITY) {
    if (!(k in want)) continue;
    const who = ownerOf(k, n), a = c.people[who]; if (!a) continue;
    const skill = skillOf(ppl[who]), e = err(k);
    if (a.job?.line === k) continue;
    if (PIANO.has(k)) {
      const lw = c.lineWant ??= {}; lw[k] = lw[k] == null ? want[k]! : lw[k] + (want[k]! - lw[k]) * 0.05 / LINE_TAU;
      if (Math.abs(lw[k] - b.ctl[k]) < startThreshold(k, skill, want[k])) continue;
    } else if (e < startThreshold(k, skill, want[k])) continue;
    const sheet = k === 'jibsheet' || k === 'mainsheet';
    // through a tack or a gybe, and in a hard turn, it's the sheets and the crossing: no one starts on a control line
    if (!sheet && (b.tacking || Math.abs(b.yawRate ?? 0) > 6 || c.roll)) continue;
    // you've told them where to sit: they stay there. The dual-ended lines they reach from where they sit (below); the
    // main Cunningham (port side) and the downhaul (the middle) wait, and the crew's plan sets the rest around them
    // main Cunningham (port side) and the downhaul (the middle) get a trip only for a big change (a new wind, not a tweak)
    const big = waits.includes(k) && e >= PLACED_TRIP;
    if (waits.includes(k) && !big) continue;
    // a sheet takes over from a control line (not from a job under way forward: they're up at the car or the mast)
    if (a.job) {
      const committed = a.job.line === 'car' || a.job.line === 'pole' || a.job.line === 'hoist';
      const onSheet = a.job.line === 'jibsheet' || a.job.line === 'mainsheet';
      if (!sheet || committed || onSheet) continue;
    }
    const hauling = (want[k] ?? 0) < b.ctl[k], breeze = (b.heelMag ?? 0) > 12 || c.hike > 0.2;
    const st = placed && BOTH_SIDES.has(k) ? null : stationFor(k, who, windward, k === 'jibsheet' && hauling && e > JIB_HAUL, breeze);
    // the sheets are in hand: no walk unless they're away from them
    const reach = sheet && !a.job && (st == null || a.pose === st.pose) ? 0 : reachTime(a, st, windward, ppl[who]);
    a.job = { line: k, reach, work: 0, station: st, to: want[k], ...(big ? { big } : {}) };
  }
  // work: whoever's at their line works it
  for (const k of Object.keys(want) as Ctl[]) {
    const who = ownerOf(k, n), a = c.people[who];
    if (k === 'jibsheetW') { out[k] = { pace: workPace(b, who), to: want[k]! }; continue; } // letting the lazy sheet fly is a flick of the wrist
    const j = a?.job, to = j?.line === k && !sheetOf(k) ? j.to ?? want[k]! : want[k]!;
    if (j?.line === k) {
      if (j.reach > 0) { j.reach -= dt; out[k] = { pace: 0, to }; } else out[k] = { pace: workPace(b, who), to };
    } else out[k] = { pace: 0, to };
  }
  carJob(b, dt);
  return out;
}

/** The lazy car the crew wants (from its plan) and how long they've wanted it; or your call (`b.carCmd`). */
export const CAR = {
  /** How long a change has to have lasted before a crew bothers (s): an expert sooner, a novice later (estimates). */
  hold: (skill: number) => 30 + 60 * (1 - skill),
  /** Pulling the pin, sliding the car, pinning it (s, a club crew), on top of getting there and back. */
  work: 6
};

/** The jib car: a trip forward for the forward hand (or whoever there is), only for the lazy car, only when worth it. */
function carJob(b: Boat, dt: number): void {
  const c = b.crew!, n = c.spec.crew.length, who = ownerOf('car', n), a = c.people[who], p = allAboard(c.spec)[who];
  const lazy = b.ctl.car[b.tack];
  const yours = b.carCmd ?? null, want = yours ?? b.carPlan ?? null;
  // a job under way: on the car the boat has tacked onto, it's loaded now and can't be moved
  if (a.job?.line === 'car') {
    if (a.job.side !== b.tack) { a.job = null; return; }
    if (a.job.reach > 0) { a.job.reach -= dt; return; }
    a.job.work -= dt * workPace(b, who);
    if (a.job.work <= 0) {
      const t = a.job.target!; lazy.fore = clamp(t.fore, 0, CAR_FORE_PINS - 1); lazy.ins = clamp(t.ins, 0, CAR_IN_PINS - 1);
      a.job = null; if (yours && yours.fore === lazy.fore && yours.ins === lazy.ins) b.carCmd = null; b.carOff = 0;
    }
    return;
  }
  if (!want) return;
  const off = Math.abs(want.fore - lazy.fore) + Math.abs(want.ins - lazy.ins);
  if (off === 0) { b.carOff = 0; if (yours) b.carCmd = null; return; }
  const skill = skillOf(p);
  b.carOff = (b.carOff ?? 0) + dt;
  // your call: as soon as they're free. Their own: a change that has lasted, worth a pin (a novice: two), and not while
  // she needs their weight on the rail (nor while you've put them somewhere: they stay where you put them)
  const worth = yours || (b.carOff > CAR.hold(skill) && off >= (skill > 0.4 ? 1 : 2) && (c.people[who].lean < 0.5) && (b.heelMag ?? 0) < 20 && c.place?.across == null);
  if (!worth || a.job) return;
  a.job = { line: 'car', reach: reachTime(a, { arm: CAR_ARM, z: Z.car, pose: 'car' }, c.wind, p), work: CAR.work, station: { arm: CAR_ARM, z: Z.car, pose: 'car' }, side: b.tack, target: { ...want } };
}


/** A job that isn't a line (the pole, a halyard): put the person at the mast until it's done. */
export function bodyJob(b: Boat, line: 'pole' | 'hoist', on: boolean): number {
  const c = b.crew; if (!c) return 1;
  const n = c.spec.crew.length, who = ownerOf(line, n), a = c.people[who];
  if (on) { if (a.job?.line !== line && !(a.job && a.job.line === 'car')) a.job = { line, reach: 0, work: 1, station: stationFor(line, who, n, false) }; }
  else if (a.job?.line === line) a.job = null;
  return workPace(b, who);
}
