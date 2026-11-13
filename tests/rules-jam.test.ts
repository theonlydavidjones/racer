import { expect, it } from 'vitest';
import train from '../src/courses/data/training-windward-return.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';

// A jam of four boats at the windward mark, nearly stopped in the ebb (training course, west 12 kt, seed 6: found by Bay
// East, 13 Nov 2026). Before, the tangle was remembered per fouler (her last victim only), so a boat's alternating
// contacts with three others each counted as new, and once her turns began every contact was new again: one boat owed
// 6,840° and never finished. Rule 44.1, US Appeal 65: contacts between the same two boats while they're still caught up
// together are one incident.
it('a jam at the mark: at most one penalty per pair of boats while they are still tangled, and every boat finishes', () => {
  const w = new World(train as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', fleet: 5, current: 'ebb' } as Settings, 6);
  const calls: { t: number; pair: string }[] = [];
  const ap = w.assignPenalty.bind(w), lfv = (w as unknown as { lastFoulVs: Map<number, { vs: number }> }).lastFoulVs;
  (w as unknown as { assignPenalty(b: unknown): void }).assignPenalty = (b: { id: number }) => {
    const vs = lfv.get(b.id)?.vs ?? -1;
    calls.push({ t: w.t, pair: [b.id, vs].sort((p, q) => p - q).join('-') });
    ap(b as never);
  };
  while (w.t < 1200 && !w.boats.slice(1).every(b => b.finished)) w.step(DT);
  expect(w.boats.slice(1).filter(b => !b.finished).map(b => b.name)).toEqual([]);
  // (two penalties between the same pair within 30 s, TANGLE_MAX, would be the cascade)
  for (const a of calls) for (const b of calls) if (a !== b && a.pair === b.pair && b.t > a.t) expect(b.t - a.t, `pair ${a.pair} at ${a.t.toFixed(1)} and ${b.t.toFixed(1)}`).toBeGreaterThan(30);
}, 600000);
