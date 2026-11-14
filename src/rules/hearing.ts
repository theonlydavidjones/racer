// Protest hearings (RRS Part 5, Section B): validity, then the decision, on the facts the sim knows. The owner chose
// exact fact-finding (13 Nov 2026): the committee finds what happened, the engine's call; testimony through each
// skipper's beliefs is a later option. Pure: the page and the worker reach the same decisions from the same records.

/** The race committee, as a protestor (a boat's id is 0 or more). */
export const COMMITTEE = -1;

/** A protest as the World records it (sim/world.ts Protest). */
export interface ProtestRec {
  by: number; vs: number;
  t: number; rule: string | null; fouler: number | null; kind: 'contact' | 'swerve' | 'hail' | null;
  hailT: number; flagT: number | null;
  owed: boolean | null; turnsT: number | null;
  exonerated?: boolean;
  notRacing?: boolean;
  committee?: { vessel: number; name: string; room: number; closest: number; done: boolean };
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
  | 'retired'
  /** The committee's protest after a ship's danger signal, upheld: she impeded the ship (Inland Rule 9), disqualified
   * and the score not excludable (the sailing instructions; RRS 90.3(b), A10). */
  | 'DNE';

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
  if (p.committee) return shipHearing(p.committee, d);
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
 * The race committee's protest after a ship sounded five blasts at a boat. The Bay's sailing instructions: "Compliance
 * with RRS 60-63 will not be required", and "a presumption shall be created at the protest hearing that the protested
 * yacht(s) has (have) violated Rule 9 and the protested yacht(s) shall have the burden of proving that it (they) did not
 * impede the progress of the ship" (Richmond YC 2025 SIs, clause 16); "A DSQ for a safety violation shall be considered
 * as disqualification not excludable (DNE)" (the 2025 Sunset Series and 2025–26 Midwinters SIs). Still a hearing that
 * finds the facts (YRA Appeal 08-02: a hail ignored "triggers a protest and a hearing, but does NOT cause an automatic
 * DSQ"; the boat was reinstated because no facts showed she impeded). Here the facts are the record's: she rebuts the
 * presumption if, from the signal on, she kept outside the sea room the ship wanted (Rule 8(f): "early action to allow
 * sufficient sea room"). Neither retiring nor turns answer it ("A violation of Rule 9 may not be exonerated by a Turns
 * or Scoring penalty", RYC clause 16).
 */
function shipHearing(c: NonNullable<ProtestRec['committee']>, d: (o: Outcome) => Decision): Decision {
  if (!c.done) return d('pending');
  return d(c.closest >= c.room ? 'dismissed' : 'DNE');
}

/**
 * Every protest decided. Two protests about the same incident against the same boat are one hearing (63.2(b)): the
 * first valid one stands for both. Returns the decisions, and the boats disqualified (with the rule).
 */
export function hearings(ps: ProtestRec[], boat: (id: number) => Protestee): { decisions: Decision[]; dsq: Map<number, string>; dne: Map<number, string> } {
  const seen = new Set<string>(), decisions: Decision[] = [], dsq = new Map<number, string>(), dne = new Map<number, string>();
  for (const p of ps) {
    const key = `${p.vs}@${p.t}`;
    if (seen.has(key)) continue;
    const ds = ps.filter(q => q.vs === p.vs && q.t === p.t).map(q => decide(q, boat(q.vs)));
    const dd = ds.find(x => x.outcome !== 'invalid') ?? ds[0];
    seen.add(key); decisions.push(dd);
    if (dd.outcome === 'DSQ') dsq.set(p.vs, dd.rule ?? '');
    if (dd.outcome === 'DNE') dne.set(p.vs, dd.rule ?? '');
  }
  return { decisions, dsq, dne };
}
