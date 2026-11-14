import { describe, expect, it } from 'vitest';
import { HELD_MAX, LINE_BREAK, cleatOf, dockStep, type DockLine } from '../src/boat/dockLines';
import type { Boat } from '../src/boat/boat';

/** Dock lines as damped springs, with the capstan equation's hold round a cleat (boat/dockLines.ts). */
const boat = (v = 0, h = 0): Boat => ({ x: 0, y: 0, h, v, astern: 0, sway: 0, turnRate: 0, vx: 0, vy: 0 } as unknown as Boat);
const still = { x: 0, y: 0 }, calm = { from: 0, kt: 0 }, open = (_p: { x: number; y: number }) => false;
const run = (b: Boat, lines: DockLine[], wind = calm, secs = 20, solid = open) => { let lost: DockLine | undefined, bump = 0; for (let i = 0; i < secs * 60; i++) { const o = dockStep(b, lines, wind, still, 1 / 60, solid); lost ??= o.parted; bump = Math.max(bump, o.bump ?? 0); } return { lost, bump }; };

describe('dock lines', () => {
  it('a made bow line stops her at a walk within a short way, with a tension the line takes (well under its breaking load)', () => {
    // the bow line led aft to a dock cleat abeam her shrouds: going ahead at a walk, she strains it and stops
    const b = boat(0.5), L: DockLine = { role: 'bow', at: 3.6, side: 1, to: { x: 1.4, y: 2.4 }, len: 0, state: 'made' };
    const p0 = cleatOf(b, L); L.len = Math.hypot(L.to.x - p0.x, L.to.y - p0.y);
    // (her energy, as a share of what she came in with, every step for a minute)
    let maxT = 0, maxY = 0, at3 = 1, swing1 = 0, swing2 = 0;
    for (let i = 0; i < 3600; i++) {
      dockStep(b, [L], calm, still, 1 / 60, open); maxT = Math.max(maxT, L.T ?? 0); maxY = Math.max(maxY, b.y);
      const e = (b.vx ** 2 + b.vy ** 2) / 0.25; if (i === 180) at3 = e; if (i > 180 && i < 1800) swing1 = Math.max(swing1, e); if (i >= 1800) swing2 = Math.max(swing2, e);
    }
    expect(maxY).toBeLessThan(1.2); // (she goes on no more than a metre or so while the line takes her way off)
    // the line takes her way: nine tenths of her energy within 3 s (the snub itself)
    expect(at3).toBeLessThan(0.1);
    // then on one line she swings about it like a pendulum, slowly (about 45 s a swing, out to some 55 degrees), the keel's
    // broadside drag and the line's own damping taking it down, as a boat on a single line does: the reason the stern line
    // and springs follow. Each swing smaller: the second's peak no more than half the first's. (Measured on her real
    // sternway drag, physics.ts ASTERN: 10.9% then 3.1%. The old law's sternway drag, 3–20 times her hull's own at a walk,
    // had taken the swing out too, so it once read "most of her way gone after 15 s")
    expect(swing1).toBeLessThan(0.15); expect(swing2).toBeLessThan(0.5 * swing1);
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
    for (const l of lines) { const p = cleatOf(b, l); l.len = Math.hypot(l.to.x - p.x, l.to.y - p.y) + 0.05; } // (made with a little slack)
    run(b, lines, { from: 270, kt: 15 }, 30);
    const q = 0.5 * 1.225 * (15 * 0.5144) ** 2 * 5.5; // (her side-on windage, HOVE.windSide)
    const sumT = lines.reduce((a, l) => a + (l.T ?? 0), 0);
    expect(sumT).toBeGreaterThan(0.6 * q); expect(sumT).toBeLessThan(1.6 * q);
    expect(Math.abs(b.sway ?? 0)).toBeLessThan(0.02);
    const free = boat(0, 0); run(free, [], { from: 270, kt: 15 }, 30);
    expect(free.sway).toBeGreaterThan(0.15); expect(free.sway).toBeLessThan(0.6); // (blown off sideways, slowly: the keel's broadside drag)
  });
  it('a 20 kt gust abeam on her made lines: held, with no growing oscillation (the stiff lines integrate stably at a 60th of a second)', () => {
    const b = boat(0, 0), lines: DockLine[] = [{ role: 'bow', at: 3.6, side: -1, to: { x: -1.6, y: 3.6 }, len: 0.6, state: 'made' }, { role: 'stern', at: -3.6, side: -1, to: { x: -1.6, y: -3.6 }, len: 0.6, state: 'made' }, { role: 'spring', at: 0, side: -1, to: { x: -1.6, y: -2.0 }, len: 2.3, state: 'made' }];
    for (const l of lines) { const p = cleatOf(b, l); l.len = Math.hypot(l.to.x - p.x, l.to.y - p.y) + 0.05; } // (made with a little slack: as long as they reach)
    run(b, lines, { from: 270, kt: 8 }, 10);
    const swing = (secs: number) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < secs * 60; i++) { dockStep(b, lines, { from: 270, kt: 20 }, still, 1 / 60, open); lo = Math.min(lo, b.x); hi = Math.max(hi, b.x); } return hi - lo; };
    const first = swing(5), later = swing(5), last = swing(5);
    expect(Number.isFinite(b.x)).toBe(true); expect(last).toBeLessThanOrEqual(Math.max(first, 0.02) + 1e-6); expect(later).toBeLessThan(0.5);
    expect(Math.max(...lines.map(l => l.T ?? 0))).toBeLessThan(LINE_BREAK / 4);
  });
  it('the same inputs, the same result, to the last bit', () => {
    const go = () => { const b = boat(0.4, 10), L: DockLine[] = [{ role: 'bow', at: 3.6, side: 1, to: { x: 2, y: 4 }, len: 1.2, state: 'held' }]; run(b, L, { from: 200, kt: 12 }, 20); return [b.x, b.y, b.h, b.v, b.sway, L[0].len, L[0].T]; };
    expect(go()).toEqual(go());
  });
  it('touching the dock: her speed into it taken out, and the bump reported', () => {
    const b = boat(0, 0); b.sway = -0.6; // (sliding to port at 0.6 m/s onto a dock along x < -1.4)
    const { bump } = run(b, [], calm, 4, p => p.x < -1.4);
    expect(bump).toBeGreaterThan(0.4); expect(b.x).toBeGreaterThan(-0.6);
  });
});
