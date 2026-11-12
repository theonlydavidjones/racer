/**
 * A race's scores under the Low Point System (RRS 2025–2028, Appendix A), for the results and the replay's "against
 * the winner". Quoted from World Sailing's "Racing Rules of Sailing 2025–2028, including changes and corrections as of
 * January 1, 2025" (media.sailing.org, uploaded July 2025):
 *
 * - A4: a boat that finishes scores 1 for first, 2 for second, and so on.
 * - A5.2: "A boat that did not sail the course, retired or was disqualified shall be scored points for the finishing
 *   place one more than the number of boats entered in the series. A boat that is penalized under rule 30.2 … shall be
 *   scored points as provided in rule 44.3(c)." (Here the series is this one race: the boats entered are the fleet.)
 * - 30.2 (Z flag): "she shall receive, without a hearing, a 20% Scoring Penalty calculated as stated in rule 44.3(c)."
 * - 44.3(c): "The race score for a boat that takes a Scoring Penalty shall be the score she would have received without
 *   that penalty, made worse by the number of points stated in the notice of race or sailing instructions. When the
 *   number of points is not stated, the penalty shall be 20% of the score for Did Not Finish, rounded to the nearest
 *   tenth of a point (0.05 rounded upward). The scores of other boats shall not be changed; therefore, two boats may
 *   receive the same score. However, the penalty shall not cause the boat's score to be worse than the score for Did
 *   Not Finish." (In 2021–24 it rounded to the nearest whole point; the 2025 edition changed that.)
 * - A6.1: "If a boat is disqualified from a race, or retires after finishing, or is scored Did not sail the course,
 *   each boat with a worse finishing place shall be moved up one place": so the places a Z-flag boat's penalty is added
 *   to are counted among the boats not disqualified.
 * - A7: boats tied at the finishing line share the points for the places they tied for and the place(s) below.
 *
 * So a Z-flag boat first across the line in a fleet of 10 scores 1 + 2.2 = 3.2, and the boat second across, on 2,
 * wins; nobody is moved up or down by her penalty.
 */

export type ScoreCode = 'ZFP' | 'UFD' | 'BFD' | 'RET' | null;
/**
 * `ahead`: for a boat still racing, where she is in the race now (lower = further on), to project how the boats still
 * out there will finish: a Z-flag boat's final place waits on them (every boat that finishes later on fewer points
 * than hers beats her).
 */
export interface ScoreIn { id: number; finishT: number | null; code: ScoreCode; ahead?: number }
export interface ScoreOut {
  id: number;
  /** Points (lower is better); null while she's still racing. */
  points: number | null;
  /** Her place across the line among the boats scored by finishing (A4), before any penalty; null if none. */
  across: number | null;
  /**
   * Her rank by points, 1 = won; boats on equal points share a rank. Null while still racing. When it could still
   * change (a Z-flag boat whose points the boats still racing can beat), it's the rank projected with them finishing
   * in the order they're in now, and `final` is false.
   */
  rank: number | null;
  final: boolean;
  /** The points added for a scoring penalty (44.3(c)), if any. */
  penalty: number;
  code: ScoreCode;
}

/** 44.3(c)'s rounding: to the nearest tenth of a point, 0.05 rounded upward. */
export const tenth = (x: number): number => Math.floor(x * 10 + 0.5 + 1e-9) / 10;

/** Every boat's score; `entries` the number of boats entered (the DNF score is one more). */
export function raceScores(boats: ScoreIn[], entries = boats.length): ScoreOut[] {
  const dnf = entries + 1, pen = tenth(0.2 * dnf);
  // A4 places across the line, for the boats scored by finishing (the disqualified are scored DNF+… instead: A5.2)
  const fin = boats.filter(b => b.finishT != null && b.code !== 'UFD' && b.code !== 'BFD').sort((a, b) => a.finishT! - b.finishT!);
  const across = new Map<number, number>();
  for (let i = 0; i < fin.length;) {
    // A7: boats tied at the line share the points for those places
    let j = i; while (j + 1 < fin.length && fin[j + 1].finishT === fin[i].finishT) j++;
    const pts = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) across.set(fin[k].id, pts);
    i = j + 1;
  }
  const out: ScoreOut[] = boats.map(b => {
    if (b.code === 'UFD' || b.code === 'BFD' || b.code === 'RET') return { id: b.id, points: dnf, across: null, rank: null, final: true, penalty: 0, code: b.code };
    const a = across.get(b.id) ?? null;
    if (a == null) return { id: b.id, points: null, across: null, rank: null, final: false, penalty: 0, code: b.code };
    const p = b.code === 'ZFP' ? Math.min(dnf - a, pen) : 0;
    return { id: b.id, points: tenth(a + p), across: a, rank: null, final: true, penalty: tenth(p), code: b.code };
  });
  // the boats still racing will take the places after the f boats in so far: a score of f + 1 or better can't be beaten
  const f = fin.length, racing = boats.filter(b => b.finishT == null && b.code !== 'UFD' && b.code !== 'BFD' && b.code !== 'RET').sort((a, b) => (a.ahead ?? 0) - (b.ahead ?? 0));
  for (const o of out) if (o.points != null && o.across != null) o.final = !racing.length || o.points <= f + 1;
  // ranks by points; equal points share a rank (44.3(c): "two boats may receive the same score"). With the boats
  // still racing projected into the places after f, in the order they're in now
  const proj = new Map(racing.map((b, k) => [b.id, f + 1 + k]));
  const all = out.map(o => ({ o, pts: o.points ?? proj.get(o.id) ?? null })).filter(x => x.pts != null).sort((a, b) => a.pts! - b.pts!);
  const rk = new Map<ScoreOut, number>();
  all.forEach((x, i) => rk.set(x.o, i > 0 && all[i - 1].pts === x.pts ? rk.get(all[i - 1].o)! : i + 1));
  for (const o of out) if (o.points != null) o.rank = rk.get(o)!;
  return out;
}

/** The order to list them in: by points, then (on equal points, or still racing) by time across the line. */
export function scoreOrder(s: ScoreOut[], finishT: (id: number) => number | null): ScoreOut[] {
  return s.slice().sort((a, b) => (a.points ?? Infinity) - (b.points ?? Infinity) || (finishT(a.id) ?? Infinity) - (finishT(b.id) ?? Infinity));
}

/** Points as the results print them: whole numbers bare, tenths with one decimal. */
export const ptsText = (p: number): string => Number.isInteger(p) ? String(p) : p.toFixed(1);
