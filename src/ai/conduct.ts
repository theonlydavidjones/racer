// An AI skipper's own conduct after an incident, under "On-the-water judging: Protests" (RRS Part 5): whether she takes
// her penalty (rule 44.1), and whether, and how soon, she hails "Protest!" (rule 60.2(a)(1)). Agreed with Skipper Model
// (13 Nov 2026): these are the skipper's decisions, read from what she believes; Rules owns what a foul is, and the
// hearing judges on the true facts. Until the skipper's perception of incidents exists (Skipper Model's conduct work),
// these are the fallbacks below: the engine's true call, with fixed odds.

/** What she knows of the incident: the engine's call (the fallback reads it as her belief), and the time since. */
export interface ConductCtx {
  /** Did the engine find her the fouler? */
  fouled: boolean;
  /** Seconds since the incident. */
  since: number;
  /** Asked again after the race, with a protest against her (44.1: she may still take the penalty by retiring). */
  protested?: boolean;
}

/**
 * Does she take her penalty? The fallback: nine times in ten when she fouled. Real fleets mostly end a foul in turns
 * or nothing: disqualifications run at 0.15–0.32% of starts (Skipper Model's census, docs/SKIPPER-MODEL-PROPOSAL.md),
 * far fewer than incidents; and most refusals are honest disagreement, not cheating (rule 2), which the skipper's
 * perception will model. `rnd` is her draw, 0–1.
 */
export function takesPenalty(ctx: ConductCtx, rnd: number): boolean {
  if (!ctx.fouled) return false;
  return rnd < (ctx.protested ? 0.25 : 0.9);
}

/** The fallback hail: this long after the incident, s (a sailor hails at once, before she knows if the other will turn;
 * 1–3 s by temperament, Skipper Model). */
export const PROTEST_REACT = 2;

/**
 * When does she hail "Protest!" at the other boat, s after the incident, or null (she doesn't believe she was fouled, or
 * won't protest)? The fallback: whenever the engine found the other boat the fouler.
 */
export function protestAfter(ctx: ConductCtx): number | null {
  return ctx.fouled ? null : PROTEST_REACT;
}
