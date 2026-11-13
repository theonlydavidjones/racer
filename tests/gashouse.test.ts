import { describe, expect, it } from 'vitest';
import { slipsIn } from '../src/geo/marina';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';

/**
 * Leaving a slip at Gashouse Cove with the wind on the beam (ROADMAP 8m: the owner couldn't get out). Pushed off with no
 * sail up, she's walked out by her crew (round to point downwind down the fairway where there's room, else shoved off
 * astern), let go, and the jib goes up: she has to get way on to steer, clear of the docks and the boats.
 */
const slips = slipsIn('gashouse-cove');
const sample = slips.filter((_, i) => i % Math.ceil(slips.length / 8) === 0);
function leave(s: (typeof slips)[0], side: number) {
  const boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
  const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 10, windDir: (s.heading + side + 360) % 360, mode: 'sail', sailFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings, 1, { freeSail: true });
  for (let i = 0; i < 30; i++) w.step(DT);
  const u = w.user, bumps: string[] = [];
  w.pushOff(); const P = (u.handled as any)?.plan, plan = P ? `${P.kind}${P.hold ? ' off ' + P.hold.off : ''}${P.turn ? ' turn ' + P.turn : ''}` : 'none';
  for (let t = 0; t < 60 * 150 && (u.handled || u.pushing); t++) { w.step(DT); if (u.handled?.held) w.pushOff(); for (const e of w.drainEvents()) if (e.type === 'toast' && /Bump|Collision/.test(e.msg)) bumps.push(e.msg); }
  const hLet = Math.round(u.h);
  w.setSail('jib', true);
  let way = 9; for (let t = 0; t < 60 * 40; t++) { w.step(DT); if (t > 60 * 5) way = Math.min(way, Math.hypot(u.vx, u.vy)); for (const e of w.drainEvents()) if (e.type === 'toast' && /Bump|Collision/.test(e.msg)) bumps.push(e.msg); }
  return { plan, hLet, way, out: Math.hypot(u.x - s.p.x, u.y - s.p.y), bumps };
}
describe('leaving a slip at Gashouse Cove, the wind on the beam (8m)', () => {
  it('both ways: walked out, let go, the jib up: she keeps steering way (0.3 m/s or more) and gets clear of her slip without touching anything', () => {
    const notes: string[] = []; let good = 0, all = 0;
    for (const s of sample) for (const side of [-90, 90]) {
      const r = leave(s, side); all++;
      const ok = r.way > 0.3 && r.out > 12 && !r.bumps.length; if (ok) good++;
      notes.push(`${s.label} (h ${s.heading}) ${side > 0 ? 'stbd' : 'port'}: ${r.plan}, let go h ${r.hLet}, least way ${r.way.toFixed(2)} m/s, ${r.out.toFixed(0)} m out${r.bumps.length ? `, ${r.bumps[0]}` : ''}`);
    }
    // (12 of the 16 today, from none before 8m: every one was shoved off astern, left pointing back at her slip with no way
    // on. Still out of reach: Slip 4 with the wind on her port beam (no room to turn her either way), Slip 452 port (let go
    // downwind toward the fairway's dead end), and Slip 598 both ways (a sheltered corner: too little breeze to swing her,
    // and the crew's turn leaves her close to the dock). Raise this as they're solved.)
    expect(good, notes.join('; ')).toBeGreaterThanOrEqual(12);
  }, 600000);
});
