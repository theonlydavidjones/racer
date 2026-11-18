// (a slow whole-race test: the owner's race to its first rounding; in the full suite only)
import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { courseFile } from '../src/courses/registry';

/**
 * The first mark, crowded (the owner's race, 16 Nov 2026, v203: "four of the seven AI boats were doing penalty turns at
 * the first mark ... plausible but crazy"). Seaweed Soup course 2 in that day's real wind, 11.9 kt from 203°: the first
 * leg a reach two minutes long, so all seven boats reach mark A inside half a minute, as packed as at a start, and leave
 * it on the run through the ones still coming in. On the simple keep-clear moves alone the fleet took 3 penalties within
 * 50 m of A in this race (19 in nine races with seeds 1–8: about two a rounding); with the start's own look at each
 * heading's room to the boats about her, at a crowded mark too (ai.ts crowdedMark), 1 (6 in the nine). The calls checked
 * against the RRS by Rules (17 Nov 2026). The owner's own boat isn't scripted: held well clear, out of it.
 */
const GHOST = ['ss2', 2251689301, [['bias', 0], ['chop', 1], ['crew', { n: 2, helm: { h: 1.7526, w: 88.452, skill: 0.9, attr: { trim: 1, react: 1, eyes: 1, handling: 1, fitness: 1, composure: 1 } }, people: [{ h: 1.6256, w: 58.968, attr: { trim: 1, react: 1, eyes: 1, handling: 1, fitness: 1, composure: 1 } }, { h: 1.72, w: 72, skill: 0.25, attr: { trim: 1, react: 1, eyes: 1, handling: 1, fitness: 1, composure: 1 } }] }], ['current', 'real'], ['fog', 'real'], ['judging', 'protests'], ['opponents', ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2']], ['penaltyTurns', 2], ['prepFlag', 'P'], ['raceFrom', 'water'], ['raceLength', 'short'], ['rain', 'real'], ['sea', 'real'], ['seq', 3], ['swellDay', 1], ['tideDate', '2026-11-12'], ['tideTime', '14:35'], ['traffic', 1], ['windDay', 0], ['windKind', 'auto'], ['windKt', 0], ['windTurn', 0]]] as const;
it('the owner\'s race: the fleet rounds its crowded first mark with at most one penalty within 50 m of it (main had 3)', () => {
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS, mode: 'race', course: GHOST[0] };
  for (const [k, v] of GHOST[2] as unknown as [string, unknown][]) s[k] = v;
  s.fleet = (s.opponents as string[]).length;
  const w = new World(courseFile(GHOST[0]) as never, s as never, GHOST[1]), A = w.C.marks[0].p, ai = w.boats.filter(b => !b.isUser);
  const at: string[] = [];
  w.onIncident = (P, Q, x) => { const f = x.fouler; if (!f.isUser && !P.isUser && !Q.isUser && Math.hypot(f.x - A.x, f.y - A.y) < 50) at.push(`${w.t.toFixed(0)} s ${x.part ?? x.rule} ${f.name}`); };
  while (w.t < 600 && !ai.every(b => b.leg >= 1 && Math.hypot(b.x - A.x, b.y - A.y) > 150)) {
    Object.assign(w.user, { x: A.x + 3e4, y: A.y + 3e4, v: 0 }); // (the owner's boat, held well clear)
    w.step(DT);
  }
  expect(ai.every(b => b.leg >= 1), 'all round it').toBe(true);
  expect(at.length, at.join('; ')).toBeLessThanOrEqual(1);
}, 600_000);
