// Protest hearings (RRS Part 5, Section B): validity, then the decision, on the facts the sim knows. The owner chose
// exact fact-finding (13 Nov 2026): the committee finds what happened, the engine's call; testimony through each
// skipper's beliefs is a later option. Pure: the page and the worker reach the same decisions from the same records.

/** A protest as the World records it (sim/world.ts Protest). */
export interface ProtestRec {
  by: number; vs: number;
  t: number; rule: string | null; fouler: number | null; kind: 'contact' | 'swerve' | 'hail' | null;
  hailT: number; flagT: number | null;
  owed: boolean | null; turnsT: number | null;
  exonerated?: boolean;
  notRacing?: boolean;
}

/** What the committee needs to know of the protested boat now. */
export interface Protestee { id: number; racing: boolean; retired: boolean }

export type Outcome =
  /** 60.4(a)(1): the hail or the flag wasn't at the first reasonable opportunity. */
  | 'invalid'
  /** The facts found don't show she broke a rule (the engine found no foul by her). */
  | 'dismissed'
  /** She broke a rule but is exonerated (43.1). */
  | 'exonerated'
  /** She broke a rule of Part 2 while not racing: no penalty (the Part 2 preamble; rule 23.1 excepted). */
  | 'notRacing'
  /** She broke it and took the penalty: no further penalty (60.5(c)(2)). */
  | 'penaltyTaken'
  /** She broke it, didn't take the penalty: disqualified (60.5(c)). */
  | 'DSQ'
  /** Still racing with her turns still to do: not decided yet. */
  | 'pending'
  /** She retired (44.1, or after the race): nothing to decide. */
  | 'retired';

export interface Decision { protest: ProtestRec; outcome: Outcome; rule: string | null; valid: { hail: boolean; flag: boolean } }

/**
 * RRS 60.2(a)(1): "at the first reasonable opportunity" for the hail and the flag. The sim offers the user's hail for
 * PROTEST_HAIL seconds after the incident (world.ts), and the AI hails within a few seconds; a hail later than this
 * is too late. (Not a number from the rules.)
 */
export const FIRST_OPPORTUNITY = 10;

/** Decide one protest. */
export function decide(p: ProtestRec, vs: Protestee): Decision {
  const valid = { hail: p.hailT - p.t <= FIRST_OPPORTUNITY, flag: p.flagT != null && p.flagT - p.t <= FIRST_OPPORTUNITY };
  const d = (outcome: Outcome): Decision => ({ protest: p, outcome, rule: p.rule, valid });
  if (vs.retired) return d('retired');
  if (!valid.hail || !valid.flag) return d('invalid');
  if (p.rule == null || p.fouler !== p.vs) return d('dismissed');
  if (p.exonerated) return d('exonerated');
  if (p.notRacing) return d('notRacing');
  if (p.owed && p.turnsT != null) return d('penaltyTaken');
  if (p.owed && vs.racing) return d('pending');
  return d('DSQ');
}

/**
 * Every protest decided. Two protests about the same incident against the same boat are one hearing (63.2(b)): the
 * first valid one stands for both. Returns the decisions, and the boats disqualified (with the rule).
 */
export function hearings(ps: ProtestRec[], boat: (id: number) => Protestee): { decisions: Decision[]; dsq: Map<number, string> } {
  const seen = new Set<string>(), decisions: Decision[] = [], dsq = new Map<number, string>();
  for (const p of ps) {
    const key = `${p.vs}@${p.t}`;
    if (seen.has(key)) continue;
    const ds = ps.filter(q => q.vs === p.vs && q.t === p.t).map(q => decide(q, boat(q.vs)));
    const dd = ds.find(x => x.outcome !== 'invalid') ?? ds[0];
    seen.add(key); decisions.push(dd);
    if (dd.outcome === 'DSQ') dsq.set(p.vs, dd.rule ?? '');
  }
  return { decisions, dsq };
}
