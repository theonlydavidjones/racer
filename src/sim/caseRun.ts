import { V, type Vec } from '../core/math';
import { CASES, poseAt, type CaseFrame, type RulesCase } from '../rules/cases';
import { RULES } from '../rules/explain';
import type { RuleId } from '../rules/types';

/**
 * "Sail it yourself" (the Rules trainer, design/rules-trainer-mockup.png): a World Sailing Case laid out on the water and
 * sailed, you helming one of its boats and the others sailing the Case's own track (src/rules/cases.ts). The Case Book
 * draws its diagrams with the wind from the top of the page (000°); here the diagram is turned to the day's wind and set
 * down at `origin`, so every boat's angle to the wind is the Case's.
 */

/** The boat you helm: the one the Case is about (the one that broke a rule, or must keep clear); with Neither, the first
 * of its pair. */
export const caseHelm = (c: RulesCase): string => c.boats.some(b => b.letter === c.answer.who) ? c.answer.who : c.pair[0];

/** Seconds sailed before the moment, as the trainer shows it: time to feel her and settle (much longer, and her own speed
 * against the diagram's carries her off its geometry). */
export const CASE_LEAD = 12;
/** Seconds after the Case's last frame before it's called: the boats sail on as they were. */
export const CASE_AFTER = 10;

/** The Case's wind (kt, the course-wide mean, held as a lesson's is): where a Folkboat sails at the Cases' own speed, 2.5
 * m/s. The sim's own speeds, flat water, at the Cityfront: close-hauled 2.43 m/s in 11 kt true and 2.57 in 13; on a broad
 * reach (150°) 2.21 in 11 and 2.46 in 13; beam reaching 2.9–3.1. */
export const CASE_WIND: [number, number] = [10, 14];

export class CaseRun {
  readonly c: RulesCase;
  /** The letter you helm. */
  readonly helm: string;
  /** The Case's own time at the World's t = 0, and where it's called (Case time). */
  readonly t0: number; readonly endT: number;
  /** The World's boat id for each letter. */
  readonly ids = new Map<string, number>();
  /** Your fouls in it: the rule each broke (the World's incidents: its rule, and the part where it has one). */
  fouls: { rule: RuleId; part?: string }[] = [];
  /** The Case's boats sailing free (letters): touched, they're boats, not a track, and sail on as their helm holds them. */
  free: string[] = [];
  /** How it came out, once called. */
  result: 'clear' | 'foul' | null = null;

  /** @param turn the day's wind direction: the diagram's 000° turned to it. @param origin where its (0, 0) is set. */
  constructor(c: RulesCase, readonly turn: number, readonly origin: Vec) {
    this.c = c; this.helm = caseHelm(c);
    const first = Math.min(...c.boats.map(b => b.frames.find(f => f.look !== false)?.t ?? b.frames[0].t));
    this.t0 = Math.min(first, c.momentT - CASE_LEAD); // (before her first frame she sails in from where her first heading and speed had her)
    this.endT = Math.max(...c.boats.map(b => b.frames[b.frames.length - 1].t)) + CASE_AFTER;
  }

  /** A point of the diagram, on the water. */
  at(p: { x: number; y: number }): Vec {
    const e = V(this.turn + 90), n = V(this.turn); // (the diagram's east and north, turned with the wind)
    return { x: this.origin.x + e.x * p.x + n.x * p.y, y: this.origin.y + e.y * p.x + n.y * p.y };
  }

  /** A boat of the Case at the World's time t: where she is, her heading and speed (m/s), and the frame she's sailing to
   * (for what it says of her: sailing above her proper course). After her last frame she sails on as she was. */
  pose(letter: string, t: number): { p: Vec; h: number; v: number; f: CaseFrame } {
    const F = this.c.boats.find(b => b.letter === letter)!.frames, ct = this.t0 + t, last = F[F.length - 1], f0 = F[0];
    const q = ct < f0.t ? { x: f0.x - V(f0.h).x * speedAt(F, f0.t) * (f0.t - ct), y: f0.y - V(f0.h).y * speedAt(F, f0.t) * (f0.t - ct), h: f0.h } : ct > last.t ? { x: last.x + V(last.h).x * (last.v ?? speedAt(F, last.t)) * (ct - last.t), y: last.y + V(last.h).y * (last.v ?? speedAt(F, last.t)) * (ct - last.t), h: last.h } : poseAt(F, ct);
    const f = F.find(k => k.t >= ct) ?? last;
    return { p: this.at(q), h: (q.h + this.turn + 360) % 360, v: speedAt(F, ct), f };
  }

  /** Called: the Case's sailing is over. */
  done(t: number): boolean { return this.t0 + t >= this.endT; }
}

/** Her speed between frames, from how far she went (the Cases' tracks are sailed: tests/rules-cases-data.test.ts). */
function speedAt(F: CaseFrame[], t: number): number {
  for (let i = 1; i < F.length; i++) if (t <= F[i].t || i === F.length - 1) {
    const a = F[i - 1], b = F[i], dt = b.t - a.t;
    return dt > 0 ? Math.hypot(b.x - a.x, b.y - a.y) / dt : b.v ?? 2.5;
  }
  return F[0].v ?? 2.5;
}

export const caseById = (n: number | undefined): RulesCase | undefined => CASES.find(c => c.case === n);
/** Cases not yet sailable, and why (the hover on the trainer's button): sailed as drawn, they don't come out as the Case
 * does, over seeds and tides (tests/caseRun.test.ts). A real Folkboat isn't the diagram's: in 13 she reaches at 2.9 m/s
 * where W is drawn at 2.0, and L's luff finds her elsewhere; in 11 her leeway against the pinned tracks shifts the
 * three-boat touch it turns on; in 105 she's dead downwind and her tack, taken from her heading (boat/physics.ts), flips
 * with each shift where the rules take it from her mainsail's side (Definitions, Leeward and Windward). */
export const NOT_YET: Record<number, string> = {
  11: 'Not yet: the three boats\' timing is too fine for a real boat',
  13: 'Not yet: a real boat reaches faster than the Case\'s W',
  105: 'Not yet: dead downwind, her tack needs her mainsail\'s side'
};
/** The Cases you can sail: taught ones without marks or a bank (the World's own marks and shore aren't the Case's yet),
 * that come out as the Case does when sailed as drawn. */
export const sailable = (c: RulesCase): boolean => c.teach && !c.marks?.length && !c.bank && !(c.case in NOT_YET);
/** Why a Case can't be sailed yet: one short line for the button's hover. */
export const notSailableWhy = (c: RulesCase): string => NOT_YET[c.case] ?? 'Not yet: this Case needs its marks or shore on the water';

/** A foul as a race's incident card titles it (rules/explain.ts): 'Rule 11 · Same tack, overlapped'. */
export const foulTitle = (f: { rule: RuleId; part?: string }): string => RULES[f.rule]?.[0] ?? `Rule ${f.part ?? f.rule}`;
