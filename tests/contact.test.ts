import { describe, expect, it } from 'vitest';
import { FRICTION, RESTITUTION, collide } from '../src/boat/contact';
import { contactNormal } from '../src/rules/geometry';
import { HANDLING, HULL } from '../src/boat/dynamics';
import { HOVE } from '../src/boat/physics';
import { DEFAULT_CREW, displacement } from '../src/boat/crewPhys';
import orc from '../src/boat/data/nordic-folkboat-orc.json';
import type { Boat } from '../src/boat/boat';
import ss10 from '../src/courses/data/seaweed-soup-2026-course10.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { CONTACT_GAP, hullGap } from '../src/rules';

/**
 * Two hulls touching (boat/contact.ts): an impulse where they touch, equal and opposite, each answering by her own
 * inertia with the water she carries. Replaces "both speeds × 0.35", which kept no momentum and took no account of the
 * angle. Heading 0 is north (+y), 90 east (+x); turnRate + is to starboard.
 */
const D = Math.PI / 180, disp = displacement(DEFAULT_CREW);
const M = { mx: HANDLING.mass * disp / HULL.displacement, my: disp * (1 + HOVE.swayAdded), I: disp * (HOVE.gyration * orc.boat.loa) ** 2 * (1 + HOVE.yawAdded) };
const boat = (x: number, y: number, h: number, v: number): Boat => { const s = Math.sin(h * D), c = Math.cos(h * D); return { x, y, h, v, astern: 0, sway: 0, turnRate: 0, yawRate: 0, vx: s * v, vy: c * v } as unknown as Boat; };
/** Her momentum over the ground (with the water she carries), and about the origin. */
const mom = (b: Boat) => {
  const s = Math.sin(b.h * D), c = Math.cos(b.h * D), u = b.v - (b.astern ?? 0), sw = b.sway ?? 0;
  const px = M.mx * u * s + M.my * sw * c, py = M.mx * u * c - M.my * sw * s;
  return { px, py, L: b.x * py - b.y * px - M.I * (b.turnRate ?? 0) * D };
};
const hit = (A: Boat, B: Boat) => { const c = contactNormal(A, B); return { c, blow: collide(A, B, c.a, c.b, c.n) }; };

describe('a blow between two hulls', () => {
  it('a rear-ender, in line: momentum kept, they part at RESTITUTION of their closing, the one astern slowed and the one ahead sped up', () => {
    const A = boat(0, 0, 0, 3), B = boat(0, 7.7, 0, 1);
    const p0 = mom(A).py + mom(B).py, { blow } = hit(A, B);
    expect(blow.closing).toBeCloseTo(2, 6);
    expect(mom(A).py + mom(B).py).toBeCloseTo(p0, 6);
    expect(B.v - A.v).toBeCloseTo(RESTITUTION * 2, 6); // (parting)
    expect(A.v).toBeCloseTo(2 - RESTITUTION, 6); expect(B.v).toBeCloseTo(2 + RESTITUTION, 6); // (alike in weight: they share it)
    expect(A.turnRate).toBeCloseTo(0, 9); expect(A.sway).toBeCloseTo(0, 9);
    // (the energy lost: ½·μ·closing²·(1 − e²), μ half her mass: boat/damage.ts's measure, with her surge's added mass)
    expect(blow.loss).toBeCloseTo(0.5 * (M.mx / 2) * 4 * (1 - RESTITUTION ** 2), 3);
  });
  it('not closing, no blow: lying together or parting, nothing changes', () => {
    const A = boat(0, 0, 0, 1), B = boat(0, 7.7, 0, 3), { blow } = hit(A, B);
    expect(blow.closing).toBe(0); expect(A.v).toBe(1); expect(B.v).toBe(3);
  });
  it('a T-bone amidships: the struck boat is set bodily sideways, with no turn; the striker is stopped short; momentum kept', () => {
    // (B heading north across A's bow; A heading east into her side, amidships)
    const A = boat(-(orc.boat.loa / 2 + 2), 0, 90, 3), B = boat(0, 0, 0, 0);
    const p0 = mom(A).px + mom(B).px, { c, blow } = hit(A, B);
    expect(c.n.x).toBeCloseTo(1, 6); expect(blow.closing).toBeCloseTo(3, 6);
    expect(mom(A).px + mom(B).px).toBeCloseTo(p0, 6);
    expect(B.sway).toBeGreaterThan(0.5); expect(Math.abs(B.turnRate!)).toBeLessThan(1e-6); expect(B.v).toBeCloseTo(0, 6);
    expect(A.v).toBeLessThan(3 - B.sway!); // (she gives up more than the other gains: broadside, a keelboat carries nearly her own mass of water)
    expect(B.sway! - A.v).toBeCloseTo(RESTITUTION * 3, 6);
  });
  it('struck on her quarter she\'s swung as well as shoved: her stern goes with the blow, and her angular momentum with the striker\'s is kept', () => {
    const A = boat(-(orc.boat.loa / 2 + 2), -3, 90, 3), B = boat(0, 0, 0, 0); // (A's bow into B's port quarter, 3 m abaft her middle)
    const before = mom(A), b0 = mom(B), { blow } = hit(A, B), a1 = mom(A), b1 = mom(B);
    expect(blow.closing).toBeCloseTo(3, 6);
    expect(a1.px + b1.px).toBeCloseTo(before.px + b0.px, 6); expect(a1.py + b1.py).toBeCloseTo(before.py + b0.py, 6);
    expect(a1.L + b1.L).toBeCloseTo(before.L + b0.L, 5);
    expect(B.turnRate!).toBeLessThan(-5); // (her stern shoved east: her bow swings to port)
    expect(B.sway!).toBeGreaterThan(0.1);
    const mid = boat(-(orc.boat.loa / 2 + 2), 0, 90, 3), Bm = boat(0, 0, 0, 0); hit(mid, Bm);
    expect(mid.v).toBeLessThan(A.v); // (off her center the blow meets less of her: the striker keeps more way)
  });
  it('a sideswipe: closing slowly, a small blow; friction along the hulls no more than FRICTION of it, slowing the faster', () => {
    // (side by side heading north, A overtaking and converging at 5°)
    const A = boat(0, 0, 5, 3), B = boat(2.15, 2, 0, 2);
    const p0 = { x: mom(A).px + mom(B).px, y: mom(A).py + mom(B).py }, { blow } = hit(A, B);
    expect(blow.closing).toBeGreaterThan(0.1); expect(blow.closing).toBeLessThan(0.4);
    expect(Math.abs(blow.friction)).toBeLessThanOrEqual(FRICTION * blow.normal + 1e-9);
    expect(mom(A).px + mom(B).px).toBeCloseTo(p0.x, 6); expect(mom(A).py + mom(B).py).toBeCloseTo(p0.y, 6);
    expect(A.v).toBeLessThan(3); expect(A.v).toBeGreaterThan(2.8); expect(B.v).toBeGreaterThan(2); // (a rub, not a stop)
  });
  it('never adds energy, at any angle or place along her', () => {
    for (let h = 0; h < 360; h += 15) for (const along of [-3, -1.5, 0, 1.5, 3]) for (const v of [0.5, 2, 4]) {
      const s = Math.sin(h * D), c = Math.cos(h * D), A = boat(-s * 6.2, along - c * 6.2, h, v), B = boat(0, 0, 0, 1.5);
      const { blow } = hit(A, B);
      expect(blow.loss, `heading ${h}, ${along} m along, ${v} m/s`).toBeGreaterThanOrEqual(-1e-6);
      expect(blow.normal).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('in a race', () => {
  it('hulls never lie inside one another: starts of eight in 12 and 22 kt, every step', () => {
    const opponents = ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2'];
    let touches = 0, deepest = CONTACT_GAP;
    for (const [kt, seed] of [[12, 3], [22, 3], [22, 5]] as const) {
      const w = new World(ss10 as unknown as CourseFile, { ...DEFAULT_SETTINGS, tideDate: '2026-11-14', windKind: 'west', windKt: kt, current: 'real', opponents, fleet: 7 }, seed);
      while (w.t < 120) {
        w.step(DT);
        const bs = w.boats.filter(b => !b.isUser);
        for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
          if ((bs[i].x - bs[j].x) ** 2 + (bs[i].y - bs[j].y) ** 2 > 100) continue;
          const g = hullGap(bs[i], bs[j]); if (g < CONTACT_GAP + 0.01) touches++; deepest = Math.min(deepest, g);
        }
      }
    }
    expect(touches).toBeGreaterThan(0); // (they do touch in these)
    expect(deepest).toBeGreaterThan(CONTACT_GAP - 0.05); // (set apart to where they just touch, every step)
  }, 300_000);
});
