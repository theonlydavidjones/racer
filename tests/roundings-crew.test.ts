import { describe, expect, it } from 'vitest';
import { World, DT } from '../src/sim/world';
import { courseFile } from '../src/courses/registry';
import { DEFAULT_SETTINGS } from '../src/settings';
import { aiThink } from '../src/ai/ai';
import { legacyKnobs } from '../src/ai/skipper';
import { simCrew, type RoundingScore } from '../src/sim/roundings';

const practice = courseFile('train');

/** Drive the sim's own crew round the practice course (the user boat sailed by the AI: it steers by b.desired, which
 * needs a boat that isn't the human, and `started` so it sails the marks rather than the line) and read the tracker. */
function crewLaps(windKt: number, laps = 6, seed = 12345, current = 'slack'): RoundingScore[] {
  const S = { ...DEFAULT_SETTINGS, mode: 'roundings' as const, windKt, windKind: 'west' as const, current, sea: 'flat' as const, traffic: 0 as const, fleet: 0, opponents: [] };
  const w = new World(practice, S, seed, { freeSail: true });
  const u = w.user as unknown as { isUser: boolean; started: boolean; leg: number; ai: unknown };
  Object.defineProperty(u, 'isUser', { value: false, configurable: true });
  u.started = true; u.leg = 0;
  u.ai = { mode: 'race', wp: 1, f: 0.5, depth: 70, aggr: 2, width: 160, aware: true, kn: legacyKnobs(true), clearing: false, plan: { leave: NaN, tReach: Infinity, coast: 0, back: false }, turnCommit: 0, commitFor: 0, duckUntil: -Infinity, lastHail: -Infinity, running: false, avgFrom: null, thought: null };
  let t = 0;
  while (w.rounding!.rounded < laps && t < 60 * 120) { aiThink(w, w.user, DT); w.step(DT); t += DT; }
  return w.rounding!.list.filter(s => s.scored).slice(1);
}
const med = (xs: number[]) => { const a = [...xs].sort((p, q) => p - q); return a.length ? a[a.length >> 1] : NaN; };
function crewLoss(windKt: number, kind: 'windward' | 'leeward', current = 'slack'): number {
  const xs = [12345, 777].flatMap(seed => crewLaps(windKt, 6, seed, current)).filter(s => s.kind === kind);
  return med(xs.map(s => s.lostM));
}

describe('The mark-rounding drill, against the sim crew (full World; excluded from test:fast)', () => {
  it("scores the sim crew's own roundings at about the table's loss, and keeps SIM_CREW in step", () => {
    for (const tws of [12, 16]) for (const kind of ['windward', 'leeward'] as const) {
      const lost = crewLoss(tws, kind), good = simCrew(kind, tws).lostM;
      expect(Number.isFinite(lost), `${tws} kt ${kind}: some roundings`).toBe(true);
      expect(Math.abs(lost - good), `${tws} kt ${kind}: lost ${lost.toFixed(0)}, table ${good}`).toBeLessThan(Math.max(22, 0.6 * good));
    }
  }, 120000);

  it('a lap gives a windward rounding then a leeward one, alternating, both to port', () => {
    const kinds = crewLaps(12, 6).map(s => s.kind);
    expect(kinds).toContain('windward'); expect(kinds).toContain('leeward');
    for (let i = 1; i < kinds.length; i++) expect(kinds[i], `rounding ${i} after ${kinds[i - 1]}`).not.toBe(kinds[i - 1]);
  }, 90000);

  it('the tide does not score her: a flood current barely changes the loss', () => {
    const slack = crewLoss(12, 'windward', 'slack'), flood = crewLoss(12, 'windward', 'flood');
    expect(Math.abs(flood - slack), `windward slack ${slack.toFixed(0)} vs flood ${flood.toFixed(0)}`).toBeLessThan(22);
  }, 120000);
});
