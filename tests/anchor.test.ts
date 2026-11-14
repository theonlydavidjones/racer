import { describe, expect, it } from 'vitest';
import { dist } from '../src/core/math';
import { ANCHOR, holding, scopeShare, stemHead } from '../src/boat/anchor';
import { World, DT } from '../src/sim/world';
import { courseFile } from '../src/courses/registry';
import { DEFAULT_SETTINGS } from '../src/settings';
import { applyCommand } from '../src/sim/commands';
import { chartDepth } from '../src/environment/sea';
import { onLand } from '../src/geo/shore';
import type { Vec } from '../src/core/math';

describe('The anchor\'s holding (boat/anchor.ts)', () => {
  it('grows with scope: nothing under 1.5:1, about half at 3:1, most of it at 7:1', () => {
    expect(scopeShare(1.2)).toBe(0);
    expect(scopeShare(3)).toBeCloseTo(0.53, 2);
    expect(scopeShare(7)).toBeCloseTo(0.91, 2);
    expect(scopeShare(12)).toBe(1);
  });
  it('the class\'s 12 kg anchor holds a few kilonewtons in mud at a good scope', () => {
    const h = holding(7 * (4 + ANCHOR.bowH), 4);
    expect(h).toBeGreaterThan(2500); expect(h).toBeLessThan(4000);
  });
});

/** A World with no fleet on the practice course, the user moved to water about `want` m deep, nothing within 60 m. */
function world(windKt: number, current: string, mode: 'sail' | 'race' = 'sail', want: [number, number] = [3, 6]): World {
  const S = { ...DEFAULT_SETTINGS, mode, windKt, windKind: 'west' as const, current, sea: 'flat' as const, traffic: 0 as const, fleet: 0, opponents: [] };
  const w = new World(courseFile('train'), S, 4242, mode === 'race' ? {} : { freeSail: true });
  if (mode === 'race') while (!w.racing(w.user)) w.step(DT);
  const u = w.user, o = { x: u.x, y: u.y };
  let best: Vec | null = null;
  for (let r = 0; r < 6000 && !best; r += 100) for (let k = 0; k < 24 && !best; k++) {
    const p = { x: o.x + r * Math.sin(k * Math.PI / 12), y: o.y + r * Math.cos(k * Math.PI / 12) }, d = chartDepth(p) ?? -1;
    if (d >= want[0] && d <= want[1] && !onLand(p) && [0, 1, 2, 3, 4, 5, 6, 7].every(j => !onLand({ x: p.x + 60 * Math.sin(j * Math.PI / 4), y: p.y + 60 * Math.cos(j * Math.PI / 4) }))) best = p;
  }
  if (!best) throw new Error('no water that depth near the start');
  u.x = best.x; u.y = best.y; u.v = 0.3;
  return w;
}
const toasts = (w: World) => w.drainEvents().filter(e => e.type === 'toast').map(e => (e as { msg: string }).msg);
const run = (w: World, s: number) => { for (let i = 0; i < 60 * s; i++) w.step(DT); };

describe('Anchoring in the World: down, lying to it, and weighing it', () => {
  it('the forward hand lowers it, pays out the rode and she lies to it, held against the stream', () => {
    const w = world(1, 'flood'), u = w.user;
    applyCommand(w, { k: 'anchor' });
    expect(u.anchor?.phase).toBe('fetch');
    run(w, 90);
    const a = u.anchor!;
    expect(a.phase).toBe('down'); expect(u.atAnchor).toBe(true);
    expect(a.out).toBeCloseTo(Math.min(ANCHOR.rodeM, 7 * ((a.depth ?? 0) + ANCHOR.bowH)), 1); // (7:1 where the 25 m allows)
    expect(a.out / ((a.depth ?? 0) + ANCHOR.bowH)).toBeGreaterThan(3);
    run(w, 120); // (she drops back onto the rode and settles)
    const p0 = { x: u.x, y: u.y }; run(w, 30);
    expect(dist(p0, u), 'held: she lies where she is').toBeLessThan(3);
    expect(a.dragging).toBe(false);
    // and she lies with the stream (a knot of flood against 1 kt of air): downstream of the anchor, on her rode
    expect(dist(stemHead(u), a.at!)).toBeLessThan(a.out + 0.5);
  });
  it('on a scope too short to hold, in a breeze, the anchor drags (at a good scope, a Folkboat\'s pull is a small share of what it holds)', () => {
    const w = world(30, 'flood'), u = w.user;
    applyCommand(w, { k: 'anchor' }); run(w, 90);
    const a = u.anchor!; expect(a.phase).toBe('down');
    expect(a.dragging).toBe(false);
    a.out = 1.45 * ((a.depth ?? 0) + ANCHOR.bowH); // (all but straight up and down: it barely holds)
    let dragged = false, at0 = { ...a.at! };
    // (dragging, it still resists with what it holds: the rode taut at its holding, not slack)
    let T = 0, n = 0, taut = 0;
    for (let i = 0; i < 60 * 60; i++) { w.step(DT); if ((a.line?.T ?? 0) > 1) taut++; if (a.dragging) { dragged = true; T += (a.line?.T ?? 0) / (a.line?.holds ?? 1); n++; } }
    expect(taut / 3600, 'the rode taut, not leaping slack as the anchor jumps').toBeGreaterThan(0.8);
    expect(dragged).toBe(true);
    expect(dist(at0, a.at!)).toBeGreaterThan(0.5);
    expect(T / n, 'its pull, a share of its holding').toBeGreaterThan(0.95);
  });
  it('weighed: hauled in, broken out and stowed, and she\'s free; racing, no penalty (rule 45)', { timeout: 60000 }, () => {
    const w = world(1, 'flood', 'race'), u = w.user;
    applyCommand(w, { k: 'anchor' }); run(w, 90);
    expect(u.anchor?.phase).toBe('down');
    applyCommand(w, { k: 'anchor' });
    expect(u.anchor?.phase).toBe('hauling');
    run(w, 150);
    expect(u.anchor ?? null).toBeNull(); expect(u.atAnchor).toBe(false);
    expect(u.scoring ?? null).toBeNull(); expect(u.penaltyTotal ?? 0).toBe(0);
  });
  it('too deep for the class\'s 25 m of rode: the crew say so and it stays below', () => {
    const w = world(1, 'slack', 'sail', [20, 60]); toasts(w);
    applyCommand(w, { k: 'anchor' });
    expect(w.user.anchor ?? null).toBeNull();
    expect(toasts(w).some(m => /Too deep/.test(m))).toBe(true);
  });
  it('with way on, the forward hand waits for the way to come off her before letting it go', () => {
    const w = world(1, 'slack'), u = w.user; toasts(w);
    applyCommand(w, { k: 'anchor' });
    for (let i = 0; i < 60 * 20; i++) { u.v = 1.5; w.step(DT); }
    expect(u.anchor?.phase).toBe('fetch');
    expect(toasts(w).some(m => /way off/.test(m))).toBe(true);
  });
  it('fetching up on her rode with way on, she\'s held by no more than the anchor holds, and the anchor drags: the rode doesn\'t part', { timeout: 60000 }, () => {
    const w = world(1, 'slack'), u = w.user;
    applyCommand(w, { k: 'anchor' }); run(w, 90);
    const a = u.anchor!; expect(a.phase).toBe('down');
    u.v = 2.5; u.astern = 0; // (as if she'd sailed on over it at 5 kt)
    let over = 0, n = 0;
    for (let i = 0; i < 60 * 20; i++) { w.step(DT); if (a.line?.T != null) { n++; if (a.line.T > (a.line.holds ?? 0) + 1) over++; } }
    expect(n).toBeGreaterThan(60 * 15); expect(over).toBe(0);
    expect(dist(stemHead(u), a.at!)).toBeLessThan(a.out + 1);
  });
  it('one forward hand: no paddling while the anchor\'s out, and a jump stows it', () => {
    const w = world(1, 'slack'), u = w.user;
    applyCommand(w, { k: 'anchor' }); run(w, 30);
    applyCommand(w, { k: 'paddle', side: 'P' });
    expect(u.paddle ?? null).toBeNull();
    w.moveHere({ x: u.x + 200, y: u.y }, 'here');
    expect(u.anchor ?? null).toBeNull(); expect(u.atAnchor).toBeFalsy();
  });
});
