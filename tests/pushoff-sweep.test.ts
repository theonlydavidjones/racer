import { describe, expect, it } from 'vitest';
import { SLIPS, pushOffPlan, pushOffPoses, slipLineSet, type PushOff } from '../src/geo/marina';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import BOWLINE_1604 from './fixtures/pushoff-bowline-1604.json';

/**
 * Every berth has a plan that passes (8m3, 15 Nov 2026): every 25th bow-in berth, in 12 and 15 kt from 270, 225 and 000 and
 * 20 kt from 270, pushed off in a full World with the moored boats solid, then let go hands off with the jib going up for
 * her first 15 m. Swung on her bow line, held head to wind for the main, walked out to the fairway, or shoved off astern,
 * she touches no boat and no dock; where none of those has the clear water, she's kept fast and told (the coordinator's
 * ruling, 16 Nov 2026), or walked out on her lines first wherever that fits (the stern-line walk-out, the same day: kept
 * fast went from 90 to 31, turned by a hand on the dock with a stern line, or on a slip line round the cleat with all
 * hands aboard). And how many get each plan, exactly as today: a planner change that moves a berth from one to
 * another fails here, and has to say why in its PR. (Before 8m3, a sweep of all 1,604 bow-line swings in the six winds
 * touched the boat in the next slip in 1,124: let go beside it, its stern just off her bow, with no clear water to gather
 * way in. geo/marina.ts clearRun.)
 * Its limits: the clear water's sag is gauged at the wind her slip has, so the lee's edge a few meters out, where the
 * breeze is fresher, isn't in it; and it was gauged in these winds only. In 12 kt from 090 and from 180 the sample has one
 * touch each, both shoved off astern (Richmond YC B5 from 090, her bow on the dock; West Harbor 757 from 180, onto the
 * breakwater): not held here yet (ROADMAP 8m3).
 * The slow one: npm test, not test:fast. The whole sweep, the 1,604 cases once swung on her bow line (tests/fixtures/
 * pushoff-bowline-1604.json), for the next planner change: PUSHOFF_SWEEP=all npx vitest run tests/pushoff-sweep.test.ts
 * (with PUSHOFF_SHARD=i PUSHOFF_SHARDS=n to split it over n processes: about 20 CPU minutes in all).
 */
const WINDS = [[270, 12], [270, 15], [225, 12], [225, 15], [0, 12], [0, 15], [270, 20]] as const;
const BERTHS = SLIPS.filter(s => s.kind !== 'alongside').filter((_, i) => i % 25 === 0);
function letGo(s: (typeof SLIPS)[0], from: number, kt: number) {
  const boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
  const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, windDir: from, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
  const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
  for (let k = 0; k < 30; k++) w.step(DT); w.drainEvents();
  const went = w.pushOff(), P = (u.handled as { plan?: PushOff & { pivot?: number; hold?: unknown } } | undefined)?.plan;
  const kind = !went ? 'kept fast' : !P ? 'none' : P.kind === 'swing' ? (P.walk ? ((P as { slip?: unknown }).slip ? 'walked out, slip line' : 'walked out, stern line') : P.hold ? 'held for the main' : 'bow line') : P.kind;
  const touches: string[] = [], seen = () => { for (const e of w.drainEvents()) if (e.type === 'toast' && /Bump|Collision|Damage/.test((e as { msg: string }).msg)) touches.push((e as { msg: string }).msg); };
  if (went) {
    for (let k = 0; k < 60 * 150 && (u.handled || u.pushing); k++) { w.step(DT); if (u.handled?.held) w.pushOff(); seen(); }
    // (shoved off astern: her helmsman steers her stern round as the plan says, tiller over until she's on the heading her
    // coast ends on, then amidships, to where the plan's coast ends (or her sternway's gone); then the jib, hands off, as
    // from any let-go. With a breeze on her bow she'd run on astern past it, and the jib's what stops that)
    if (P?.kind === 'astern') {
      const p = P as PushOff & { kind: 'astern' }, hEnd = pushOffPoses(s, p).at(-1)!.h, off = (a: number) => ((a + 540) % 360) - 180;
      let gone = 0;
      for (let k = 0; k < 60 * 60 && (u.astern ?? 0) > 0.05 && gone < p.coast; k++) { const x = u.x, y = u.y; u.tiller = p.helm && Math.abs(off(u.h - hEnd)) > 5 ? p.helm : 0; w.step(DT); gone += Math.hypot(u.x - x, u.y - y); seen(); }
      u.tiller = 0;
    }
    w.setSail('jib', true); const x0 = u.x, y0 = u.y;
    for (let k = 0; k < 60 * 60 && Math.hypot(u.x - x0, u.y - y0) < 15; k++) { w.step(DT); seen(); }
  }
  return { went, kind, touches };
}
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}; // (the test runner's environment)
const ALL = env.PUSHOFF_SWEEP === 'all';
describe('every berth has a plan that passes: a sample of the bow-in berths in seven winds (8m3; the slow one: npm test, not test:fast)', () => {
  it.skipIf(ALL)('no boat or dock touched in the first 15 m hands off, whatever the plan; and the count of each plan exactly as today', () => {
    const bad: string[] = [], count: Record<string, number> = {};
    for (const s of BERTHS) for (const [from, kt] of WINDS) {
      const r = letGo(s, from, kt); count[r.kind] = (count[r.kind] ?? 0) + 1;
      if (r.touches.length) bad.push(`${s.id} from ${from} at ${kt} kt, ${r.kind}: ${r.touches[0]}`);
    }
    expect(bad).toEqual([]);
    expect(BERTHS.length).toBe(62);
    // (16 Nov 2026: the walk-out turned by a hand on the dock with a stern line where it fits, else on a slip line, the
    // physics review's rulings. Kept fast went up with them, honestly: 19 to 31 in this sample, and 31 to 106 of the 1,604,
    // since a walk-out in mid-fairway with nobody on the dock to turn her, and with no set to leeward as she came round,
    // was let go where a real crew couldn't turn her; held to the force a crew has, the hand's 186 N and the slip line's
    // 271 N against the wind, and to the set it lets her take, some can't be. From here it should only go down: ROADMAP 8m3)
    expect(count).toEqual({ 'walked out, stern line': 8, 'walked out, slip line': 383, 'kept fast': 31, 'bow line': 9, 'held for the main': 3 });
  }, 1_800_000);
  it.skipIf(ALL)('the slip line, held and not: set no more than 2 m while the crew\'s haul holds her (about 16 kt), rising to her bare-rig drift as the wind overpowers it', () => {
    expect(slipLineSet(90, 12)).toBe(2); expect(slipLineSet(30, 6)).toBeCloseTo(0.017 * 6 * 15, 6); // (held: a short turn in light air sets her less)
    expect(slipLineSet(90, 20)).toBeCloseTo(0.017 * 20 * 45, 6); // (the wind's push beating the haul outright: the whole drift, 45 s of it)
    expect(slipLineSet(90, 16)).toBe(2); const s17 = slipLineSet(90, 17), s18 = slipLineSet(90, 18); // (between: the line eased as it's overpowered)
    expect(s17).toBeGreaterThan(2); expect(s18).toBeGreaterThan(s17); expect(s18).toBeLessThan(0.017 * 18 * 45);
  });
  it.skipIf(ALL)('three found on the way, 16 Nov 2026: let go nearer the wind, she sags further; and never let go pointing back into her own slip', () => {
    // (West Harbor 757 in 15 kt from 225: let go 61 degrees off the wind on a slip line, she sagged 2.4 m over her first 14 m,
    // more than the clear water allowed for her, and hit the boat in the next slip: geo/marina.ts clearRun, the sag larger
    // the nearer the wind she's let go)
    expect(letGo(SLIPS.find(q => q.id === 'west-harbor:757')!, 225, 15).touches).toEqual([]);
    // (South Beach B87 in 15 kt from the north: shoved off astern only 3.5 m and let go pointing 16 degrees off her slip's
    // line, she sailed straight back in among the boats either side: planPushOff, an astern let-go pointing back in is kept fast)
    expect(letGo(SLIPS.find(q => q.id === 'south-beach:B87')!, 0, 15).touches).toEqual([]);
    const back: string[] = [];
    for (const s of SLIPS.filter(x => x.kind !== 'alongside').filter((_, i) => i % 7 === 0)) for (const [from, kt] of [[0, 12], [0, 16], [270, 12], [225, 14]] as const) {
      const p = pushOffPlan(s, from, kt); if (p.kind !== 'astern' || p.noRoom) continue;
      const h = pushOffPoses(s, p).at(-1)!.h; if (Math.abs(((h - s.heading + 540) % 360) - 180) < 90) back.push(`${s.id} from ${from} at ${kt} kt: let go heading ${Math.round(h)}, her slip ${s.heading}`);
    }
    expect(back).toEqual([]);
  }, 600_000);
  it.runIf(ALL)('the whole sweep: the 1,604 cases once swung on her bow line, no boat or dock touched', () => {
    const cases = BOWLINE_1604 as [string, number, number][];
    const k = Number(env.PUSHOFF_SHARD ?? 0), n = Number(env.PUSHOFF_SHARDS ?? 1), bad: string[] = [], count: Record<string, number> = {};
    for (let i = k; i < cases.length; i += n) {
      const [id, from, kt] = cases[i], r = letGo(SLIPS.find(q => q.id === id)!, from, kt); count[r.kind] = (count[r.kind] ?? 0) + 1;
      if (r.touches.length) bad.push(`${id} from ${from} at ${kt} kt, ${r.kind}: ${r.touches[0]}`);
    }
    console.log(`pushoff sweep, shard ${k} of ${n}:`, JSON.stringify(count)); // (16 Nov 2026, all of it: 1,254 walked out on a slip line, 148 held for the main, 96 on the bow line, 106 kept fast)
    expect(bad).toEqual([]);
  }, 1e8);
});
