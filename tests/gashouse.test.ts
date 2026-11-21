import { describe, expect, it } from 'vitest';
import { slipsIn } from '../src/geo/marina';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';

/**
 * Leaving a slip at Gashouse Cove with the wind on the beam (ROADMAP 8m: the owner couldn't get out). Pushed off with no
 * sail up, she's walked out by her crew (swung by the wind and held head to wind where there's room, else shoved off
 * astern), let go, and the jib goes up: she has to get way on to steer, clear of the docks and the boats.
 */
const slips = slipsIn('gashouse-cove');
const sample = slips.filter((_, i) => i % Math.ceil(slips.length / 8) === 0);
function leave(s: (typeof slips)[0], side: number, current = 'slack', windKt = 10, windDir?: number) {
  const boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
  const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt, windDir: windDir ?? (s.heading + side + 360) % 360, mode: 'sail', sailFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current } as Settings, 1, { freeSail: true });
  for (let i = 0; i < 30; i++) w.step(DT);
  const u = w.user, bumps: string[] = [];
  w.pushOff(); const P = (u.handled as any)?.plan, plan = P ? `${P.kind}${P.hold ? ' off ' + P.hold.off : ''}${P.turn ? ' turn ' + P.turn : ''}` : 'none';
  for (let t = 0; t < 60 * 150 && (u.handled || u.pushing); t++) { w.step(DT); if (u.handled?.held) w.pushOff(); for (const e of w.drainEvents()) if (e.type === 'toast' && /Bump|Collision/.test(e.msg)) bumps.push(e.msg); }
  const hLet = Math.round(u.h);
  w.setSail('jib', true);
  let way = 9; for (let t = 0; t < 60 * 40; t++) { w.step(DT); if (t > 60 * 5) way = Math.min(way, Math.hypot(u.vx, u.vy)); for (const e of w.drainEvents()) if (e.type === 'toast' && /Bump|Collision/.test(e.msg)) bumps.push(e.msg); }
  return { plan, hLet, way, out: Math.hypot(u.x - s.p.x, u.y - s.p.y), bumps };
}
/** The owner's mark (8m): hard but possible, as in real life. Most of the 16 out clean (12 is the bar this test was written to). */
const GOOD = 12;
describe('leaving a slip at Gashouse Cove, the wind on the beam (8m)', () => {
  // (an expected failure today, 14 Nov 2026: none of the 16 is out clean with the push-off physically honest; see below)
  it.fails('both ways: walked out, let go, the jib up: she keeps steering way (0.3 m/s or more) and gets clear of her slip without touching anything', () => {
    const notes: string[] = []; let good = 0, all = 0;
    for (const s of sample) for (const side of [-90, 90]) {
      const r = leave(s, side); all++;
      const ok = r.way > 0.3 && r.out > 12 && !r.bumps.length; if (ok) good++;
      notes.push(`${s.label} (h ${s.heading}) ${side > 0 ? 'stbd' : 'port'}: ${r.plan}, let go h ${r.hLet}, least way ${r.way.toFixed(2)} m/s, ${r.out.toFixed(0)} m out${r.bumps.length ? `, ${r.bumps[0]}` : ''}`);
    }
    // (none of the 16 today, 14 Nov 2026, with the push-off physically honest (8m, from the physics review: no turning her
    // stern against the wind by hand, a bow line no more than 2.5 m past the finger, no winding her round on a stern line until
    // it's modeled with real lines). They're shoved off astern and
    // left with no way on; they wait on Deep Physics' turning at rest (left alone she lies with the wind about 86 degrees off
    // her bow, so the jib can draw) and the jib-on-a-run drive, and on the paddle (8c). Turn this back to a plain test when it passes.)
    expect(good, notes.join('; ')).toBeGreaterThanOrEqual(GOOD);
  }, 600000);
  // Josephine's slip, 572 (the owner's chart): at the west end of a fairway by the basin's west seawall, bow 351, so the
  // common westerly comes over her port beam. Leaving in it on a flood and on an ebb (the current presets: flood 1.0 kt
  // setting 095, ebb 1.5 kt setting 280; inside the basin the walls take most of it)
  // (both expected failures for now, 14 Nov 2026: in a westerly over her port beam there's no room to swing her or wind
  // her round, so she's shoved off astern and left with no way on (on the ebb before 8m was made honest she was wound
  // round but kept only 0.26 m/s under the jib on a dead run). They wait on Deep Physics' turning at rest and the
  // jib-on-a-run drive fix, and on the paddle (8c); turn them back to plain tests as those land)
  for (const [tide, kt] of [['flood', 14], ['ebb', 14]] as const) it.fails(`Josephine's slip, 572, in a ${kt} kt westerly on the ${tide}: walked out, let go, the jib up, and clear without touching`, () => {
    const s = slips.find(x => x.id === 'gashouse-cove:572')!;
    const r = leave(s, 0, tide, kt, 270);
    expect(r.bumps, `${r.plan}, let go h ${r.hLet}`).toEqual([]); expect(r.way).toBeGreaterThan(0.3); expect(r.out).toBeGreaterThan(12);
  }, 300000);
});
