/** Helpers for writing rules tests like rulebook diagrams.
 *
 * Wind blows from the top of the page (north, 000°). x is metres east, y is metres north.
 * Headings are compass degrees, so with this wind:
 *   315 = starboard close-hauled (heading up-left),   045 = port close-hauled (up-right)
 *   270 = starboard beam reach (sailing left),        090 = port beam reach (sailing right)
 *   190 = starboard broad reach / run (down, slightly left)
 * A Folkboat is 7.64 m long; the zone is 3 lengths (22.9 m). */
import { V, wrap } from '../src/core/math';
import { assessPair, newPairRecord, rightOfWay, type PairRecord, type RulesBoat, type RulesContext, type RulesMark } from '../src/rules';

export const WIND = 0;

export interface DiagramBoat extends RulesBoat { name: string }

let nextId = 1;
export function boat(name: string, o: {
  at: [number, number]; heading: number; speed?: number;
  tacking?: boolean; lastTackT?: number; penalty?: number; ocs?: boolean; started?: boolean; leg?: number;
  /** heading a few seconds ago (Rule 16.1); defaults to the current heading */
  headingAgo?: number;
  /** sailing above her proper course (Rules 17, 23) */
  aboveProper?: boolean;
  /** moving astern by backing a sail (Rule 21.3) */
  backing?: boolean;
  /** has finished: no longer racing (Rule 23.1) */
  finished?: boolean;
  /** has retired (RET): no longer racing either */
  retired?: boolean;
}): DiagramBoat {
  const rel = wrap(WIND - o.heading), u = V(o.heading), s = o.speed ?? 2.5;
  return {
    id: nextId++, name, x: o.at[0], y: o.at[1], h: o.heading, vx: u.x * s, vy: u.y * s,
    tack: rel >= 0 ? 'S' : 'P', tacking: o.tacking ?? false, lastTackT: o.lastTackT ?? -999,
    penalty: o.penalty ?? 0, ocs: o.ocs ?? false, started: o.started ?? true, leg: o.leg ?? 0,
    headingAgo: o.headingAgo ?? o.heading, aboveProper: o.aboveProper ?? false, backing: o.backing, finished: o.finished, retired: o.retired
  };
}

/** Move a boat for the next frame. Unless told otherwise, she had her old heading a few seconds ago. */
export function moveTo(b: DiagramBoat, at: [number, number], heading = b.h, headingAgo = b.h): DiagramBoat {
  b.headingAgo = headingAgo;
  const rel = wrap(WIND - heading), u = V(heading), s = Math.hypot(b.vx, b.vy) || 2.5;
  b.x = at[0]; b.y = at[1]; b.h = heading; b.vx = u.x * s; b.vy = u.y * s;
  if (!b.tacking) b.tack = rel >= 0 ? 'S' : 'P';
  return b;
}

export const ctx = (t: number, marks: RulesMark[] = [], extra: Partial<RulesContext> = {}): RulesContext => ({ t, windFrom: WIND, marks, ...extra });

/** Who keeps clear, and under which rule. */
export function verdict(A: DiagramBoat, B: DiagramBoat, t = 10, marks: RulesMark[] = [], rec?: PairRecord) {
  const r = rightOfWay(A, B, ctx(t, marks), rec);
  return { keepsClear: r.kc.name, rule: r.rule };
}

/** A pair of boats tracked over time, as the simulator does every step. */
export function pair(A: DiagramBoat, B: DiagramBoat, marks: RulesMark[] = [], extra: Partial<RulesContext> = {}) {
  const rec = newPairRecord();
  return {
    rec,
    /** Assess the pair at race time t. Returns the verdict and any incident (contact or forced swerve). */
    at(t: number, obs: { swerve?: boolean } = {}) {
      const a = assessPair(rec, A, B, ctx(t, marks, extra), { swerve: obs.swerve ?? false });
      return {
        keepsClear: a.verdict.kc.name, rule: a.verdict.rule,
        foul: a.incident ? { by: a.incident.fouler.name, rule: a.incident.rule, kind: a.incident.kind, why: a.incident.byWhy, ...(a.incident.part ? { part: a.incident.part } : {}) } : null
      };
    }
  };
}
