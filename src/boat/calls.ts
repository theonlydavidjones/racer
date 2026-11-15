import type { Boat } from './boat';
import { prepTime, skillOf } from './crewPhys';

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
