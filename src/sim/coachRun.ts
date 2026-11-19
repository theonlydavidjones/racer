/**
 * The trim coach beside the race (boat/coach.ts CoachMemory): twice a second of the page's time it weighs your lines
 * against the boat's own physics, with the crew's own answers (controls.ts crewSolve), a few milliseconds' work. In the
 * worker that's off the page's frame (the Coordinator, 15 Nov 2026: under about 1 ms a frame on the page), and it reads
 * the race itself rather than the mirror; in the page's own thread (?inproc, or a worker that failed) it runs here.
 */
import { CoachMemory, type CoachContext } from '../boat/coach';
import type { World } from './world';

export type CoachStep = ReturnType<CoachMemory['step']>;
/** How often it looks, s of the page's time. */
export const COACH_EVERY = 0.5;

export class CoachRun {
  private mem = new CoachMemory();
  private t = 0;
  private had = false;
  /** The page's time since the last call and, when it wants the coach, the situation it sees; a new step when due. */
  step(w: World, dt: number, ctx: CoachContext | null | undefined): CoachStep | null {
    if (!ctx || !w.running) { this.t = COACH_EVERY; return null; } // (the first look comes at once when it's wanted again)
    this.t += dt;
    if (this.t < COACH_EVERY && this.had) return null;
    this.t = 0; this.had = true;
    // (advice only: a slip in it never stops the race, which in the worker would send it back to the page)
    try { return this.mem.step(w.user, w.t, w.cruising ? { ...ctx, cruising: true } : ctx); } catch (e) { console.error('The trim coach failed:', e); return null; }
  }
}
