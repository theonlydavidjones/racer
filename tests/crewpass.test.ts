import { describe, expect, it } from 'vitest';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';

// (in each other's way: closer along than two seats side by side, Z.gap's 0.5 m, and within a body's width across; the
// physics keeps a stride and a body's width, crewPhys.ts CREW_SEP and CREW_PASS)
const SEP = 0.45, PASS = 0.35, STALL = 2;
import { testBoat, sail } from './helpers/testBoat';

// Two crew going forward together (crewPhys.ts CREW_SEP, CREW_PASS): on a run in light air, the pole called for, both go
// up to the foredeck, the bow hand on to the stem. Never level with each other, a body's width apart or less: the one
// behind keeps back, one passing steps aside first.
describe('two crew on the move keep clear of each other (crewPhys.ts CREW_SEP, CREW_PASS)', () => {
  for (const side of [1, -1]) it(`going forward for the pole, on ${side > 0 ? 'starboard' : 'port'}`, () => {
    const twa = 172, b = testBoat({ heading: (360 + side * -twa) % 360, kt: 3, windKt: 7 });
    b.crew = newCrew(DEFAULT_CREW, side > 0 ? 'S' : 'P');
    sail(b, 60, () => { b.h = (360 + side * -twa) % 360; });
    (b as unknown as { poleWant: boolean }).poleWant = true;
    // (from the cockpit, as Crew Figures' clip has it: the one going furthest, the bow hand, behind the other and on the
    // same side, so they set off in file and the bow hand has to get by)
    const [, p1, p2] = b.crew.people; p1.x = 0.15 * side; p1.z = 1.37; p2.x = 0.18 * side; p2.z = 1.87; p1.goal = p2.goal = null;
    const z0 = b.crew.people.map(p => p.z);
    let worst = Infinity, foreBy = Infinity, at = 0, moved = 0, stuck = 0, stuckAt = 0;
    // (and nobody stands still short of where they're going, waiting on the other: more than 2 s, STALL, with their goal
    // still off and neither x nor z changing)
    const last = b.crew.people.map(p => ({ x: p.x, z: p.z, still: 0 }));
    const watch = (t: number) => {
      const [, p, q] = b.crew!.people, dz = Math.abs(p.z - q.z), dx = Math.abs(p.x - q.x);
      if (dz < SEP && dx < PASS) { const d = Math.max(dz / SEP, dx / PASS); if (d < worst) { worst = d; at = t; } }
      foreBy = Math.min(foreBy, p.z, q.z);
      b.crew!.people.forEach((a, k) => {
        if (k === 0) return;
        const l = last[k], off = a.goal != null && Math.abs(a.goal.z - a.z) > 0.05, same = Math.abs(a.x - l.x) < 1e-4 && Math.abs(a.z - l.z) < 1e-4;
        l.still = off && same ? l.still + 1 / 60 : 0; if (l.still > stuck) { stuck = l.still; stuckAt = t; }
        l.x = a.x; l.z = a.z;
      });
    };
    sail(b, 40, t => { b.h = (360 + side * -twa) % 360; watch(t); });
    moved = Math.max(...b.crew.people.slice(1).map((p, i) => z0[i + 1] - p.z));
    // (then the pole's in again: the bow hand comes aft past the foredeck hand, on the narrow foredeck)
    (b as unknown as { poleWant: boolean }).poleWant = false;
    sail(b, 40, t => { b.h = (360 + side * -twa) % 360; watch(40 + t); });
    expect(moved, 'went forward').toBeGreaterThan(2);
    expect(foreBy, 'one up on the foredeck').toBeLessThan(-1.5);
    expect(worst, `level with each other, within a body (at ${at.toFixed(1)} s)`).toBe(Infinity);
    expect(stuck, `stood still short of their place (at ${stuckAt.toFixed(1)} s)`).toBeLessThan(STALL);
  }, 120_000);
  // (and over an afternoon of it, as it comes: the pole called and cleared, the crew placed and let go, the boat put
  // about and onto other points of sail, at random times, seeded; nobody stands still short of their place over STALL,
  // waiting on the other: the bow hand called aft past the foredeck hand, the front hand past the middle hand)
  it('over an afternoon of calls and courses: nobody stands waiting', () => {
    let seed = 12345; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    let worst = 0, where = '';
    for (let run = 0; run < 16; run++) {
      const skill = [0.3, 0.6, 0.9][run % 3], sk2 = [0.9, 0.3, 0.6][run % 3];
      const spec = { helm: { ...DEFAULT_CREW.helm, skill }, crew: [{ ...DEFAULT_CREW.crew[0], skill }, { ...DEFAULT_CREW.crew[1], skill: sk2 }] };
      const kt = [5, 7, 9, 14][run % 4]; let twa = [172, 45, 150, 172, 90][run % 5], side = run % 2 ? 1 : -1;
      const b = testBoat({ heading: (360 + side * -twa) % 360, kt: 3, windKt: kt });
      b.crew = newCrew(spec, side > 0 ? 'S' : 'P');
      const still = [0, 0, 0], was = b.crew.people.map(p => ({ x: p.x, z: p.z }));
      let next = 5;
      sail(b, 240, t => {
        if (b.turnTarget == null) b.h = (360 + side * -twa) % 360;
        if (t >= next) { next = t + 4 + rnd() * 20; const r = rnd();
          if (r < 0.3) (b as unknown as { poleWant: boolean }).poleWant = !(b as unknown as { poleWant: boolean }).poleWant;
          else if (r < 0.6) { const f = ([null, 'fwd', 'mid', 'aft', 'deck'] as const)[Math.floor(rnd() * 5)]; b.crew!.place = f ? { across: null, fore: f } as never : undefined; }
          else if (r < 0.75) side = -side;
          else twa = [172, 45, 150, 90, 120][Math.floor(rnd() * 5)];
        }
        b.crew!.people.forEach((a, i) => {
          if (i === 0) return;
          // (along the boat not getting on, whatever they do across: a sideways dither at each other is standing there too)
          const off = a.goal != null && Math.abs(a.goal.z - a.z) > 0.05, same = Math.abs(a.z - was[i].z) < 1e-9;
          still[i] = off && same && t > 1 ? still[i] + 1 / 60 : 0;
          if (still[i] > worst) { worst = still[i]; where = `run ${run}, ${t.toFixed(1)} s, crew ${i}`; }
          was[i].x = a.x; was[i].z = a.z;
        });
      });
    }
    expect(worst, `stood still short of their place (${where})`).toBeLessThan(STALL);
  }, 600_000);
});

