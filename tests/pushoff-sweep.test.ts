import { describe, expect, it } from 'vitest';
import { SLIPS } from '../src/geo/marina';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';

/**
 * Let go, and touching nothing (8m3, 15 Nov 2026): every 25th bow-in berth, in 12 and 15 kt from 270, 225 and 000, pushed
 * off in a full World with the moored boats solid, then let go hands off with the jib going up for her first 15 m. Swung on
 * her bow line, held head to wind for the main, or walked out to the fairway, she touches no boat and no dock. (Before
 * 8m3, a sweep of all 1,604 bow-line swings in these winds touched the boat in the next slip in 1,124: she was let go
 * beside it, its stern just off her bow, with no clear water to gather way in. geo/marina.ts clearRun.)
 * Shoved off astern is the older plan and not held to this yet (ROADMAP 8m3: over all 1,604 it's the plan in 42, and touches
 * in 27); it's counted here, not judged. The slow one: npm test, not test:fast.
 */
const WINDS = [[270, 12], [270, 15], [225, 12], [225, 15], [0, 12], [0, 15]] as const;
const BERTHS = SLIPS.filter(s => s.kind !== 'alongside').filter((_, i) => i % 25 === 0);
function letGo(s: (typeof SLIPS)[0], from: number, kt: number) {
  const boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
  const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, windDir: from, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
  const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
  for (let k = 0; k < 30; k++) w.step(DT); w.drainEvents();
  const went = w.pushOff(), P = (u.handled as { plan?: { kind: string; pivot?: number; hold?: unknown } } | undefined)?.plan;
  const kind = !P ? 'none' : P.kind === 'swing' ? (P.pivot === 0 ? 'walked out' : P.hold ? 'held for the main' : 'bow line') : P.kind;
  const touches: string[] = [], seen = () => { for (const e of w.drainEvents()) if (e.type === 'toast' && /Bump|Collision|Damage/.test((e as { msg: string }).msg)) touches.push((e as { msg: string }).msg); };
  if (went) {
    for (let k = 0; k < 60 * 150 && (u.handled || u.pushing); k++) { w.step(DT); if (u.handled?.held) w.pushOff(); seen(); }
    w.setSail('jib', true); const x0 = u.x, y0 = u.y;
    for (let k = 0; k < 60 * 60 && Math.hypot(u.x - x0, u.y - y0) < 15; k++) { w.step(DT); seen(); }
  }
  return { went, kind, touches };
}
describe('let go and touching nothing, a sample of the bow-in berths in six winds (8m3; the slow one: npm test, not test:fast)', () => {
  it('swung on her bow line, held for the main, or walked out: no boat or dock touched in the first 15 m hands off', () => {
    const bad: string[] = [], count: Record<string, number> = {};
    for (const s of BERTHS) for (const [from, kt] of WINDS) {
      const r = letGo(s, from, kt); count[r.kind] = (count[r.kind] ?? 0) + 1;
      if (r.kind !== 'astern' && r.touches.length) bad.push(`${s.id} from ${from} at ${kt} kt, ${r.kind}: ${r.touches[0]}`);
    }
    expect(bad).toEqual([]);
    expect(BERTHS.length).toBeGreaterThan(50);
    expect((count['bow line'] ?? 0) + (count['walked out'] ?? 0) + (count['held for the main'] ?? 0), JSON.stringify(count)).toBeGreaterThan(120); // (most of them: the astern shove is the fallback)
  }, 1_800_000);
});
