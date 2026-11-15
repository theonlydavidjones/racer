import type { Boat } from './boat';
import { prepTime, reactTime, skillOf, type Pose } from './crewPhys';

/**
 * The helm's call for a turn ("Ready about" … "Tacking!", "Ready to jibe" … "Jibe-ho!") and what it does for her crew
 * (the owner, 15 Nov 2026: "experienced crews will generally (but not always) know a tack coming. novice will need the
 * call to move faster and get out of the way of the boom").
 *
 * The call exists to warn the crew so they're ready when the helm puts her over: between the two calls they free the
 * working jib sheet ready to run, load the lazy one, and take their places; for a jibe the main comes in and heads go
 * down (US Coast Guard Auxiliary, Basic Sailboat Maneuvering ch. 3; Portland State's Introduction to Sailing, class 3;
 * the US Naval Academy's Navy 44 tacking and gybing guides; Courageous Sailing's Gybing notes). A crew member not ready
 * says "Not ready" and the helm waits (the Navy 44 guide).
 *
 * The numbers:
 * - PREPARED: warned, a person moves on the order after a prepared reaction, 0.25 s: simple reaction to a sound is about
 *   0.15 s (a review, is.muni.cz, Factors Affecting Reaction Time), a warning shortens what follows it (the foreperiod
 *   effect, Niemi & Näätänen 1981, Psychological Bulletin 89:133), and the move itself has to start. An estimate.
 * - Getting ready takes each person their reaction (crewPhys.ts reactTime, 0.4 s expert to 1.6 s novice) and the work
 *   itself, the working sheet freed ready to run and the lazy one loaded, and to their place: about half a second for an
 *   expert's hands, four for a novice's (crewPhys.ts prepTime, PREP_WORK). Called, they do it before the helm
 *   puts her over (your boat's helm waits for it: world.ts callTurn); unwarned, they start as they see her coming up to
 *   tack or going on round to jibe, and what isn't done by the time she's through is done after: the jib held aback,
 *   the crossing late, the boom left to the wind. An expert is ready within any turn; a novice caught by a quick one is
 *   not. No sailing text puts a figure on any of it: the split, and its seconds, are estimates.
 * - An AI skipper calls a decided turn by their skill (callsTurn): a skilled one nearly always, a novice often not. An
 *   estimate (the owner, 15 Nov 2026); Skipper Model's ratings will move it to their consistency when they reach a race.
 */
export { PREPARED, prepLeft, prepTime } from './crewPhys';
export const CALL_KEEP = 12;
/** The share of decided turns an AI skipper calls at skill 0, and at 1 (estimates). */
export const CALL_AT = { novice: 0.35, expert: 0.98 };
/** The jobs a crew member can't leave mid-way to answer a call: they say "Not ready" (crewWork.ts's committed jobs). */
const BUSY = new Set(['car', 'pole', 'hoist', 'outboard']);

/** A number in [0, 1) from two integers, the same every time: whether this skipper calls this turn, without a draw from
 * the boat's own dice (which would shift every later one, and change the race). */
const hash01 = (a: number, b: number): number => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };

/** Does she call this turn? Her helm's skill (for now: Skipper Model's consistency rating, when ratings reach a race). */
export function callsTurn(b: Boat, n: number): boolean {
  const s = b.crew ? skillOf(b.crew.spec.helm) : 1;
  return hash01(b.id, n) < CALL_AT.novice + (CALL_AT.expert - CALL_AT.novice) * s;
}

/** An AI skipper has decided a turn at `t`: called or not (`always`: a tack to answer a hail, which a skipper always
 * calls). Once a turn: a decision held a while isn't a new one. */
export function decideTurn(b: Boat, t: number, always = false): void {
  if (b.callT != null && t - b.callT < CALL_KEEP) return;
  const n = b.turnsDecided = (b.turnsDecided ?? 0) + 1;
  if (always || callsTurn(b, n)) b.callT = t;
}

/** Your call, waiting on the crew: ready once each has had their prepTime since the call, and none is busy at a job
 * they can't leave. 'busy' if someone is. */
export function crewAnswer(b: Boat, t: number): 'ready' | 'busy' | 'getting' {
  const c = b.crew, w = b.callWait; if (!c || !w) return 'ready';
  const n = c.spec.crew.length;
  let getting = false;
  for (let i = 1; i <= n; i++) {
    const a = c.people[i], p = c.spec.crew[i - 1]; if (!a || !p) continue;
    if (a.job && BUSY.has(a.job.line)) return 'busy';
    if (t - w.t0 < prepTime(p)) getting = true;
  }
  return getting ? 'getting' : 'ready';
}

/**
 * A crash jibe: the boom (and its sheet) swept across, and anyone in its way who hadn't got their head down struck
 * (boomStep, at the crossing). The Folkboat's boom is high, its underside 1.6 m over the cockpit sole, a metre over the
 * deck at the mast (class rules 6.1.11, 9.25: the boom's top no lower than the mast's band 1000 ± 10 mm over the deck,
 * folkboats.com; ORC's BAS 1.0; the model's deck, render/hull.ts deckY and COCKPIT_FIT: the benches 0.22, the side deck
 * about 0.6, the sole −0.08), so sitting on the benches heads clear it: it's whoever is up, standing at the cabin top's
 * lines, crouched high crossing, or sitting tall on the side deck, between the mast and the boom's end. The heights by
 * pose are of the stature, an estimate: sitting height about 0.52 of it (ANSUR II's means, not checked here), standing
 * all of it, crouched across 0.6, hiking (leaning out) 0.35, kneeling at a car 0.4. Ducked: down to a crouch on the seat or the
 * deck, 0.3 of it, once they've seen it coming (ready for the jibe, or their reaction and DUCK_S since the boom was
 * seen swinging, BOOM_SEEN: in 8 kt it takes some 4 s to come across, in 22 kt under 1.5, boomStep).
 * Struck, they're out of action a while (in their place, working at STRUCK_PACE), the longer the harder: from 20 s to a
 * minute by the boom's speed at its end, up to 10 m/s (estimates: the boom's speed is the model's, boomStep; no figure for
 * injuries is published, UK Sailmakers' review of gybe accidents and the USCG statistics have none; there are deaths).
 */
export const BOOM = { low: 1.6, mastZ: -0.95, endZ: -0.95 + 3.38, length: 3.38, bench: 0.22, deck: 0.6, sole: -0.08, benchX: 0.5 };
export const HEAD = { sit: 0.52, stand: 1, cross: 0.6, hike: 0.35, kneel: 0.4, ducked: 0.3 }, DUCK_S = 0.3, OUT_S = { min: 20, max: 60, atV: 10 };
/** The boom's swing seen (deg/s): faster than this it's plainly coming across (an estimate; it starts from rest as the
 * wind gets behind the leech, boomStep). */
export const BOOM_SEEN = 20;
/** The top of a person's head over the sole datum (m), by where and how they are. */
export function headY(pose: Pose, x: number, h: number, ducked: boolean): number {
  const deck = Math.abs(x) > BOOM.benchX, seat = deck ? BOOM.deck : BOOM.bench;
  if (ducked) return (pose === 'cross' || pose === 'piano' ? BOOM.sole + 0.5 * h : seat + HEAD.ducked * h);
  switch (pose) {
    case 'piano': case 'mast': case 'fore': case 'bow': return BOOM.sole + HEAD.stand * h; // (standing up)
    case 'cross': return BOOM.sole + HEAD.cross * h;
    case 'hike': return BOOM.deck + HEAD.hike * h;
    case 'car': return BOOM.deck + HEAD.kneel * h;
    default: return seat + HEAD.sit * h; // (sitting: on the bench, or up on the side deck; the helm)
  }
}
/** The boom crossing in a crash jibe at `w` deg/s: who's struck. Returns how many (and tells you, on your boat). */
export function boomStrike(b: Boat, t: number, w: number, emit?: (e: { type: 'toast'; msg: string; ms?: number }) => void): number {
  const c = b.crew; if (!c) return 0;
  const v = Math.abs(w) * Math.PI / 180 * BOOM.length, out = OUT_S.min + (OUT_S.max - OUT_S.min) * Math.min(1, v / OUT_S.atV);
  const ppl = [c.spec.helm, ...c.spec.crew]; let hit = 0;
  for (let i = 0; i < c.people.length; i++) {
    const a = c.people[i], p = ppl[i]; if (!a || !p || a.outUntil > (c.clock ?? 0)) continue;
    if (a.z < BOOM.mastZ + 0.4 || a.z > BOOM.endZ) continue; // (forward at the mast, or aft of the boom's end: the helm)
    const ducked = a.ready || t - (b.boomSeenT ?? t) >= reactTime(p) + DUCK_S;
    if (headY(a.pose, a.x, p.h, ducked) < BOOM.low) continue;
    a.outUntil = (c.clock ?? 0) + out; a.job = null; hit++;
  }
  if (hit && emit) emit({ type: 'toast', ms: 6000, msg: hit > 1 ? 'Crash jibe: the boom caught your crew. Call the jibe ("Ready to jibe") so they get their heads down.' : 'Crash jibe: the boom caught one of your crew. Call the jibe ("Ready to jibe") so they get their heads down.' });
  return hit;
}
