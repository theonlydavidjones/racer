import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { KT, dist } from '../src/core/math';
import { PADDLE, paddleForce, paddleYawRate } from '../src/boat/paddle';
import { World, DT } from '../src/sim/world';
import { courseFile } from '../src/courses/registry';
import { DEFAULT_SETTINGS } from '../src/settings';
import { applyCommand } from '../src/sim/commands';
import type { Boat } from '../src/boat/boat';

/** A test boat in a near-calm, paddled from t = 0 on `side` (back: back-paddling), for `secs`. */
function paddled(side: 'P' | 'S', secs: number, back = false): Boat {
  const b = testBoat({ heading: 90, kt: 0, windKt: 0.5 });
  b.paddle = { side, t0: 0, auto: false, back };
  sail(b, secs);
  return b;
}

describe('Paddling her with the boom crutch (boat/paddle.ts): one person against her own hull', () => {
  it('nothing till the crutch is out, then a push no stroke can exceed', () => {
    const b = testBoat({ heading: 0, kt: 0, windKt: 0.5 });
    b.paddle = { side: 'P', t0: 0, auto: false };
    expect(paddleForce(b, 1)).toBe(0); // (fetching it from the cabin)
    expect(paddleForce(b, PADDLE.fetchS + 1)).toBeCloseTo(PADDLE.fMax, 0); // (at rest: the blade's limit)
    expect(PADDLE.fMax).toBeGreaterThan(50); expect(PADDLE.fMax).toBeLessThan(70);
  });
  it('makes about a knot and a half in a calm, and holds it (the first push tails off to what they keep up)', () => {
    const b = paddled('P', 100);
    expect(b.v / KT).toBeGreaterThan(1.0); expect(b.v / KT).toBeLessThan(2.0);
  });
  it('paddling on port swings her bow to starboard, on starboard to port; back-paddling the other way', () => {
    expect(paddled('P', 15).turnRate!).toBeGreaterThan(0);
    expect(paddled('S', 15).turnRate!).toBeLessThan(0);
    expect(paddled('P', 15, true).turnRate!).toBeLessThan(0);
  });
  it('stopped she pivots, with way on her keel holds her nearly straight', () => {
    const b = testBoat({ heading: 0, kt: 0, windKt: 0.5 }); b.paddle = { side: 'P', t0: 0, auto: false };
    const atRest = paddleYawRate(b, PADDLE.fetchS + 1);
    const moving = paddled('P', 100), going = paddleYawRate(moving, 100);
    expect(atRest).toBeGreaterThan(2); expect(atRest).toBeLessThan(6);
    expect(going).toBeLessThan(1);
  });
  it('with way on, a moderate helm holds her straight against the paddle\'s turn', () => {
    // (Deep Physics: the rudder's authority at a knot should beat it; read live from physics.ts, so their rudder work follows)
    const b = paddled('P', 100); // (making about 1.5 kt, the bow drifting to starboard)
    (b as Boat & { handsOff?: boolean }).handsOff = true; b.tiller = 0.4; // (tiller to starboard: the bow to port, against it; held, as the tack drill's tests hold it)
    sail(b, 20);
    expect(b.turnRate!).toBeLessThanOrEqual(0.05);
  });
  it('back-paddling makes sternway', () => {
    const b = paddled('S', 60, true);
    expect((b.astern ?? 0) / KT).toBeGreaterThan(0.4);
  });
});

/** A World with no fleet: the practice course, in the given wind (kt) and current. */
function world(mode: 'sail' | 'roundings' | 'race', windKt: number, current = 'slack'): World {
  const S = { ...DEFAULT_SETTINGS, mode, windKt, windKind: 'west' as const, current, sea: 'flat' as const, traffic: 0 as const, fleet: 0, opponents: [] };
  return new World(courseFile('train'), S, 4242, mode === 'race' ? {} : { freeSail: true });
}
const toasts = (w: World) => w.drainEvents().filter(e => e.type === 'toast').map(e => (e as { msg: string }).msg);

describe('Paddling in the World: your call, the crew\'s call in a jam, and rule 42', () => {
  it('you call it on a side (the band, or the key), and stop it', () => {
    const w = world('sail', 1);
    applyCommand(w, { k: 'paddle', side: 'S' });
    expect(w.user.paddle?.side).toBe('S'); expect(w.user.paddle?.auto).toBe(false);
    expect(toasts(w).some(m => /boom crutch/.test(m))).toBe(true);
    for (let i = 0; i < 60 * 30; i++) w.step(DT);
    expect(w.user.v).toBeGreaterThan(0.3);
    applyCommand(w, { k: 'paddle', side: null });
    expect(w.user.paddle).toBeNull();
  });
  it('the crew paddle unasked when the stream is setting her onto a mark with no wind to sail by, and get her clear', () => {
    // (the flood sets east at a knot; the windward mark 30 m down-stream of her, in a 1 kt air)
    const w = world('roundings', 1, 'flood'), u = w.user, W = w.rounding!.marks[0].p;
    u.x = W.x - 30; u.y = W.y; u.v = 0; u.h = 0;
    let started = false, closest = Infinity;
    for (let i = 0; i < 60 * 90; i++) { w.step(DT); if (u.paddle?.auto) started = true; closest = Math.min(closest, dist(u, W)); }
    expect(started, 'the crew picked up the crutch').toBe(true);
    expect(closest, 'and kept her off the mark').toBeGreaterThan(2);
  });
  it('racing, paddling is a breach of rule 42 unless getting clear after hitting something (42.3(h))', () => {
    const w = world('race', 1);
    for (let i = 0; i < 60 * 2; i++) w.step(DT);
    // (a race's clock starts before the warning signal: on to the preparatory signal, so she's racing)
    while (!w.racing(w.user)) w.step(DT);
    toasts(w);
    applyCommand(w, { k: 'paddle', side: 'P' });
    for (let i = 0; i < 60 * 15; i++) w.step(DT);
    expect(toasts(w).some(m => /rule 42/.test(m))).toBe(true);
    // just after a contact, it's allowed
    applyCommand(w, { k: 'paddle', side: null });
    w.user.lastHitT = w.t;
    applyCommand(w, { k: 'paddle', side: 'P' });
    expect(w.paddleAllowed(w.user)).toBe(true);
  });
  // (a boat racing, paddling one spell for 15 s)
  const paddleSpell = (w: World) => { applyCommand(w, { k: 'paddle', side: 'P' }); for (let i = 0; i < 60 * 15; i++) w.step(DT); applyCommand(w, { k: 'paddle', side: null }); w.step(DT); };
  const racingWorld = (appendixP?: boolean) => {
    const S = { ...DEFAULT_SETTINGS, mode: 'race' as const, windKt: 1, windKind: 'west' as const, current: 'slack', sea: 'flat' as const, traffic: 0 as const, fleet: 0, opponents: [], ...(appendixP ? { appendixP } : {}) };
    const w = new World(courseFile('train'), S, 4242, {});
    while (!w.racing(w.user)) w.step(DT);
    toasts(w);
    return w;
  };
  it('the penalty for paddling while racing: disqualification (rule 44.1\'s turns cover only Part 2 and rule 31); one penalty a spell, however many strokes', () => {
    const w = racingWorld();
    paddleSpell(w);
    expect(w.user.scoring).toBe('DSQ');
    expect(w.user.penaltyTotal ?? 0).toBe(0);
    expect(toasts(w).filter(m => /DSQ/.test(m)).length).toBe(1);
  });
  it('with Appendix P, paddling on past the penalty (5 s to stop) is a fresh breach: one penalty doesn\'t buy a calm leg (P2.2)', () => {
    const w = racingWorld(true);
    applyCommand(w, { k: 'paddle', side: 'P' }); for (let i = 0; i < 60 * 20; i++) w.step(DT);
    expect(w.user.retired).toBe(true);
  });
  it('no rule 42 penalty before her preparatory signal (not racing), nor within 30 s of a contact (42.3(h)), judged from now', () => {
    const w = world('race', 1);
    for (let i = 0; i < 60 * 2; i++) w.step(DT);
    expect(w.racing(w.user)).toBe(false);
    paddleSpell(w);
    expect(w.user.scoring ?? null).toBeNull();
    const r = racingWorld();
    r.user.lastHitT = r.t;
    applyCommand(r, { k: 'paddle', side: 'P' }); for (let i = 0; i < 60 * 20; i++) r.step(DT);
    expect(r.user.scoring ?? null).toBeNull(); // (getting clear)
    for (let i = 0; i < 60 * 15; i++) r.step(DT);
    expect(r.user.scoring).toBe('DSQ'); // (35 s on, still paddling: not getting clear any more)
  });
  it('with Appendix P: a first rule 42 penalty is a Two-Turns Penalty (P2.1), a second spell means retiring (P2.2)', () => {
    const w = racingWorld(true);
    paddleSpell(w);
    expect(w.user.penaltyTotal).toBe(720);
    expect(w.user.scoring ?? null).toBeNull();
    paddleSpell(w);
    expect(w.user.retired).toBe(true);
  });
  it('racing, the crew never paddle of themselves (they keep rule 42) unless she has just hit something', () => {
    const w = world('race', 1, 'flood');
    while (!w.racing(w.user)) w.step(DT);
    const u = w.user; u.x = w.C.marks[0].p.x - 30; u.y = w.C.marks[0].p.y; u.v = 0;
    for (let i = 0; i < 60 * 30; i++) { w.step(DT); expect(u.paddle?.auto ?? false).toBe(false); }
  });
});
