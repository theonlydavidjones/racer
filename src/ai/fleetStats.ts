/**
 * How a fleet spreads out over a race, measured the same way for the sim's races and the real ones, so the skipper
 * model can be calibrated against real fleets (docs/SKIPPER-MODEL-PROPOSAL.md).
 *
 * The measures are those of scripts/analyse-folkboat-results.mjs, which works them out for the real SF Bay Folkboat
 * results (src/boat/data/sf-folkboat-results.json):
 *  - each finisher's elapsed time as % behind the winner's (the last finisher's, the median boat's, and by quarter of
 *    the fleet after the winner);
 *  - how alike two races' finishing orders are (Kendall's tau over the boats that finished both: 1 the same order, 0
 *    no relation);
 *  - the last finisher's gap against the race's wind (a straight-line fit).
 * The analysis script is JavaScript run by node, so the same small sums are written again here in TypeScript;
 * tests/fleetStats.test.ts checks this file gives the script's published figures from the same real races.
 */

/** One boat's finish: who (any key that's the same boat race to race) and her elapsed time from the start, s. */
export interface Finish { key: string; elapsedS: number }
/** A race as the calibration sees it: its finishers, and the race's mean wind (kt) where known. */
export interface RaceResult { finishers: Finish[]; windKt?: number; label?: string }

export const mean = (a: number[]): number => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
export const median = (a: number[]): number => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};
export const quantile = (a: number[], q: number): number => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Each finisher's elapsed time as % behind the winner's, in finishing order (the winner's 0), to 0.1% as published. */
export function gapPct(f: Finish[]): number[] {
  const t = f.map(b => b.elapsedS).sort((a, b) => a - b);
  return t.map(x => r1((x / t[0] - 1) * 100));
}

/** Kendall's tau-a between two finishing orders over the boats in both (null under 3 such boats). */
export function kendall(a: Finish[], b: Finish[]): number | null {
  const pa = new Map(a.map(x => [x.key, x.elapsedS])), common = b.filter(x => pa.has(x.key));
  if (common.length < 3) return null;
  let c = 0, d = 0;
  for (let i = 0; i < common.length; i++) for (let j = i + 1; j < common.length; j++) {
    const s = Math.sign(pa.get(common[i].key)! - pa.get(common[j].key)!) * Math.sign(common[i].elapsedS - common[j].elapsedS);
    if (s > 0) c++; else if (s < 0) d++;
  }
  return c + d ? (c - d) / (c + d) : null;
}

/** Least squares y = a + b·x, with Pearson's r. */
export function fit(xs: number[], ys: number[]): { slope: number; intercept: number; r: number } | null {
  if (xs.length < 3) return null;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
  if (!sxx || !syy) return null;
  return { slope: sxy / sxx, intercept: my - (sxy / sxx) * mx, r: sxy / Math.sqrt(sxx * syy) };
}

/** What a set of races says about the fleet's spread and consistency. */
export interface FleetSummary {
  races: number;
  lastPct: { median: number; p25: number; p75: number; min: number; max: number };
  medianBoatPct: number;
  /** Median gap, %, of the boats in each quarter of the fleet after the winner (first quarter … last). */
  quarters: number[];
  /** Mean Kendall's tau over every pair of races. */
  tau: number | null;
  /** The last finisher's gap (%) against the race's wind (kt), where the wind is known. */
  windSlope: { slope: number; intercept: number; r: number } | null;
}

export function summarise(races: RaceResult[]): FleetSummary {
  const timed = races.filter(r => r.finishers.length >= 2);
  const gaps = timed.map(r => gapPct(r.finishers));
  const last = gaps.map(g => g[g.length - 1]);
  const byRel: number[][] = [[], [], [], []];
  // (by relative place, as the analysis script does: 0 = winner, 1 = last finisher, the rest into quarters)
  for (const g of gaps) g.forEach((x, i) => { if (i) byRel[Math.min(3, Math.floor((i / (g.length - 1)) * 4 - 1e-9))].push(x); });
  const taus: number[] = [];
  for (let i = 0; i < timed.length; i++) for (let j = i + 1; j < timed.length; j++) {
    const k = kendall(timed[i].finishers, timed[j].finishers);
    if (k != null) taus.push(k);
  }
  const withWind = timed.map((r, i) => ({ kt: r.windKt, last: last[i] })).filter(p => p.kt != null);
  return {
    races: timed.length,
    lastPct: { median: r1(median(last)), p25: r1(quantile(last, 0.25)), p75: r1(quantile(last, 0.75)), min: Math.min(...last), max: Math.max(...last) },
    medianBoatPct: r1(median(gaps.map(g => median(g.slice(1))))),
    quarters: byRel.map(q => r1(median(q))),
    tau: taus.length ? Math.round(mean(taus) * 100) / 100 : null,
    windSlope: fit(withWind.map(p => p.kt!), withWind.map(p => p.last))
  };
}
