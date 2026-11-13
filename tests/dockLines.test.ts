import { describe, expect, it } from 'vitest';
import { HELD_MAX, LINE_BREAK, cleatOf, dockStep, type DockLine } from '../src/boat/dockLines';
import type { Boat } from '../src/boat/boat';

/** Dock lines as damped springs, with the capstan equation's hold round a cleat (boat/dockLines.ts). */
const boat = (v = 0, h = 0): Boat => ({ x: 0, y: 0, h, v, astern: 0, sway: 0, turnRate: 0, vx: 0, vy: 0 } as unknown as Boat);
const still = { x: 0, y: 0 }, calm = { from: 0, kt: 0 }, open = (_p: { x: number; y: number }) => false;
const run = (b: Boat, lines: DockLine[], wind = calm, secs = 20, solid = open) => { let lost: DockLine | undefined, bump = 0; for (let i = 0; i < secs * 60; i++) { const o = dockStep(b, lines, wind, still, 1 / 60, solid); lost ??= o.lost; bump = Math.max(bump, o.bump ?? 0); } return { lost, bump }; };

describe('dock lines', () => {
  it('a made bow line stops her at a walk within a short way, with a tension the line takes (well under its breaking load)', () => {
    // the bow line led aft to a dock cleat abeam her shrouds: going ahead at a walk, she strains it and stops
    const b = boat(0.5), L: DockLine = { role: 'bow', at: 3.6, side: 1, to: { x: 1.4, y: 2.4 }, len: 0, state: 'made' };
    const p0 = cleatOf(b, L); L.len = Math.hypot(L.to.x - p0.x, L.to.y - p0.y);
    let maxT = 0, maxY = 0; for (let i = 0; i < 900; i++) { dockStep(b, [L], calm, still, 1 / 60, open); maxT = Math.max(maxT, L.T ?? 0); maxY = Math.max(maxY, b.y); }
    expect(maxY).toBeLessThan(1.2); // (she goes on no more than a metre or so while the line takes her way off)
    // (on one line she swings about it like a pendulum, the keel's broadside drag damping it slowly, as a boat on a single
    // line does: the reason the stern line and springs follow; after 15 s most of her way is gone)
    expect(Math.hypot(b.vx, b.vy)).toBeLessThan(0.5 * Math.sqrt(0.1));
    expect(maxT).toBeGreaterThan(200); expect(maxT).toBeLessThan(LINE_BREAK / 2);
    expect(Number.isFinite(b.x) && Number.isFinite(b.h)).toBe(true);
  });
  it('a line held round a cleat renders out through the hand when she\'s going too fast for it, and holds her at a walk', () => {
    const fast = boat(1.5), slow = boat(0.3);
    const mk = (): DockLine => ({ role: 'bow', at: 3.6, side: 1, to: { x: 1.2, y: 3.0 }, len: 1.0, state: 'held' });
    const a = mk(), z = mk(); run(fast, [a], calm, 8); run(slow, [z], calm, 8);
    expect(a.len).toBeGreaterThan(2); // (ran out a good way)
    expect(z.len).toBeLessThan(1.3); // (held, barely rendering)
    expect(Math.max(...[a.T ?? 0, 0])).toBeLessThanOrEqual(HELD_MAX + 1);
  });
  it('wind abeam: held off the dock by her bow and stern lines at about her windage, or, with none, blown off at a slow drift', () => {
    // wind from the west (270) on a boat heading north: it pushes her east (to starboard); the dock's to port, lines to it
    const b = boat(0, 0), lines: DockLine[] = [{ role: 'bow', at: 3.6, side: -1, to: { x: -1.6, y: 3.6 }, len: 0.6, state: 'made' }, { role: 'stern', at: -3.6, side: -1, to: { x: -1.6, y: -3.6 }, len: 0.6, state: 'made' }];
    run(b, lines, { from: 270, kt: 15 }, 30);
    const q = 0.5 * 1.225 * (15 * 0.5144) ** 2 * 5.5; // (her side-on windage, HOVE.windSide)
    const sumT = lines.reduce((a, l) => a + (l.T ?? 0), 0);
    expect(sumT).toBeGreaterThan(0.6 * q); expect(sumT).toBeLessThan(1.6 * q);
    expect(Math.abs(b.sway ?? 0)).toBeLessThan(0.02);
    const free = boat(0, 0); run(free, [], { from: 270, kt: 15 }, 30);
    expect(free.sway).toBeGreaterThan(0.15); expect(free.sway).toBeLessThan(0.6); // (blown off sideways, slowly: the keel's broadside drag)
  });
  it('touching the dock: her speed into it taken out, and the bump reported', () => {
    const b = boat(0, 0); b.sway = -0.6; // (sliding to port at 0.6 m/s onto a dock along x < -1.4)
    const { bump } = run(b, [], calm, 4, p => p.x < -1.4);
    expect(bump).toBeGreaterThan(0.4); expect(b.x).toBeGreaterThan(-0.6);
  });
});
