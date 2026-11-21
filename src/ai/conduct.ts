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
  /** Asked again after the race, with a protest against her: she may still retire (sportsmanship, the Basic Principle;
   * scored RET, A5.2, the boats behind moving up, A6.1). */
  protested?: boolean;
}

/**
 * Does she take her penalty? Disqualifications run at 0.15–0.32% of starts in real fleets (Skipper Model's census,
 * docs/SKIPPER-MODEL-PROPOSAL.md). Here every AI boat fouled protests, and the hearing finds the facts exactly, so a
 * declined penalty is a DSQ: the decline rate is that census divided by the sim's fouls per start. The physics-reviewer's
 * probe (SS2, 8 boats, 13 Nov 2026) found about one a boat in the first 11 minutes of racing; a whole race has more,
 * unmeasured. One a start gives 0.25%, so she takes it 997 times in 1000: an upper bound on declines, the true one lower.
 * (So a protest against an AI boat will seldom change a result until the skipper's perception, Skipper Model, lands.) (Most real
 * refusals are honest disagreement, not cheating, rule 2: the skipper's perception will model that.) The fallback
 * stands by her choice after the race. `rnd` is her draw, 0–1.
 */
export const TAKES_PENALTY = 0.997;
export function takesPenalty(ctx: ConductCtx, rnd: number): boolean {
  if (!ctx.fouled || ctx.protested) return false;
  return rnd < TAKES_PENALTY;
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
