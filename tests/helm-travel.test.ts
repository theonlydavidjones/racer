import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { D2R, KT, V, wrap } from '../src/core/math';
import { HELM_MAX, HELM_STALL, rudderBrake, rudderTurn } from '../src/boat/balance';
import { yawLag } from '../src/boat/physics';

/**
 * The helm's travel and response (the owner, 15 Nov 2026, of his own boat: "I need to be able to push the tiller about
 * 50% wider ... no delay in the turn of the boat and the push of the tiller", short-tacking in the marina). The tiller
 * swings to 75 degrees each side; the turn grows with it to the rudder's stall at 40 and falls off past it, where the
 * blade brakes; and her turn answers the helm sooner (her yaw inertia worked from her ballast keel). ESTIMATES all, with
 * the owner's boat as the reference: these hold them where they were set.
 */
const mk = (kt: number) => { const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, mode: 'sail', tideDate: '2026-11-14', current: 'slack', sailFrom: 'gate', sailTo: '' } as Settings; const w = new World(COURSES[0], S, 1, { freeSail: true } as never); for (let i = 0; i < 60; i++) w.step(DT); return w; };
/** Held on a heading `off` degrees from the wind until she's at her speed. */
const settle = (w: World, off: number, secs = 60) => { const u = w.user; for (let i = 0; i < 60 * secs; i++) { const ww = w.windHere(u, u, false); u.h = (ww.from + off + 360) % 360; u.tiller = 0; u.steer = 0; u.turnTarget = null; u.turnRate = 0; w.step(DT); } };
/** From a beam reach, the tiller put to `til` and held: her heading's change after half a second, and her turn and speed after 3 s. */
const circle = (kt: number, til: number) => {
  const w = mk(kt), u = w.user; settle(w, 90); const h0 = u.h, v0 = u.v; let half = 0;
  for (let i = 0; i < 180; i++) { u.tiller = til; w.step(DT); if (i === 29) half = Math.abs(wrap(u.h - h0)); }
  const rate = Math.abs(u.turnRate ?? 0);
  return { v0, half, rate, v: u.v, radius: u.v / Math.max(1e-6, rate * D2R) };
};
/** A tack from close-hauled, the tiller held at `til` until she's 42 degrees off the wind on the new tack: its time, and how far she carried on along her old course. */
const tack = (kt: number, til: number) => {
  const w = mk(kt), u = w.user; settle(w, 45); const d = V(u.h), x0 = u.x, y0 = u.y; let t = 0, adv = 0;
  for (; t < 40; t += DT) { const rel = wrap(w.windHere(u, u, false).from - u.h); if (rel >= 42) break; u.steer = 0; u.tiller = til; w.step(DT); adv = Math.max(adv, (u.x - x0) * d.x + (u.y - y0) * d.y); }
  return { t, adv, v: u.v };
};

describe('the helm\'s travel: the tiller to 75 degrees, the rudder stalling past 40', () => {
  it('the turn grows with the helm to the stall, then falls off; past the stall it brakes', () => {
    expect(rudderTurn(0.5)).toBeCloseTo(0.5, 9); expect(rudderTurn(1)).toBeCloseTo(1, 9); expect(rudderTurn(HELM_STALL)).toBeCloseTo(HELM_STALL, 9);
    let prev = rudderTurn(HELM_STALL);
    for (let h = HELM_STALL + 0.05; h <= HELM_MAX + 1e-9; h += 0.05) { const r = rudderTurn(h); expect(r).toBeLessThan(prev); prev = r; }
    expect(rudderTurn(HELM_MAX)).toBeLessThan(0.65); expect(rudderTurn(HELM_MAX)).toBeGreaterThan(0.45); // (hard over: about 0.58 of today's full helm)
    expect(rudderBrake(HELM_STALL, 2.4)).toBe(0); expect(rudderBrake(1, 2.4)).toBe(0);
    expect(rudderBrake(HELM_MAX, 2.4)).toBeGreaterThan(600); expect(rudderBrake(HELM_MAX, 2.4)).toBeLessThan(1000); // (N at 4.7 kt)
  });
  it('her turning circle from a beam reach in 10 kt: 9 m at 30 degrees of helm as before, under 7 m at the stall, and wide, slowing, hard over', () => {
    const full = circle(10, 1), stall = circle(10, HELM_STALL), hard = circle(10, HELM_MAX);
    expect(full.radius).toBeGreaterThan(8); expect(full.radius).toBeLessThan(9.5);
    expect(stall.radius).toBeGreaterThan(5.9); expect(stall.radius).toBeLessThan(7);
    expect(hard.radius).toBeGreaterThan(12); expect(hard.rate).toBeLessThan(0.5 * stall.rate);
    expect((stall.v - hard.v) / KT).toBeGreaterThan(0.3); // (hard over she's lost more way in 3 s, turning half as fast)
  }, 60_000);
  it('the turn starts with the tiller: 6 degrees in the first half second at 5.8 kn, 3 at 4 kn; her lag under 0.4 s at 4.7 kt and 0.9 s at 2 kt', () => {
    expect(circle(10, HELM_STALL).half).toBeGreaterThan(6);
    expect(circle(5, HELM_STALL).half).toBeGreaterThan(3);
    expect(yawLag(4.7 * KT)).toBeLessThan(0.4); expect(yawLag(2 * KT)).toBeLessThan(0.9);
    expect(yawLag(1 * KT)).toBeGreaterThan(2 * yawLag(2 * KT) - 1e-9); // (and still by her speed: at a crawl she answers slowly)
  }, 60_000);
  it('a tack with the helm at the stall: inside 7 s and a boat length of carry in 6, 8 and 14 kt, quicker and shorter than at 30 degrees; hard over, far slower', () => {
    for (const kt of [6, 8, 14]) {
      const full = tack(kt, 1), stall = tack(kt, HELM_STALL);
      expect(stall.t, `${kt} kt`).toBeLessThan(7); expect(stall.adv, `${kt} kt`).toBeLessThan(7.7);
      expect(full.t - stall.t, `${kt} kt`).toBeGreaterThan(1.5); expect(full.adv - stall.adv, `${kt} kt`).toBeGreaterThan(1.5);
    }
    const hard = tack(8, HELM_MAX), stall = tack(8, HELM_STALL);
    expect(hard.t).toBeGreaterThan(2 * stall.t); expect(hard.v).toBeLessThan(0.6 * stall.v);
  }, 120_000);
  it('short tacks up a fairway 30 m wide in 8 kt, the helm put to the stall 9 m from each side: she stays inside it, and makes 60 m to windward in 3 minutes', () => {
    const w = mk(8), u = w.user; settle(w, 45);
    const from = w.windHere(u, u, false).from, up = V(from), across = { x: up.y, y: -up.x }, x0 = u.x, y0 = u.y;
    const pos = () => ({ c: (u.x - x0) * across.x + (u.y - y0) * across.y, up: (u.x - x0) * up.x + (u.y - y0) * up.y });
    let tacks = 0, worst = 0, turning = 0, least = 9;
    for (let i = 0; i < 60 * 180; i++) {
      const p = pos(), rel = wrap(w.windHere(u, u, false).from - u.h), out = Math.sign(p.c) * (V(u.h).x * across.x + V(u.h).y * across.y) > 0;
      if (!turning && Math.abs(p.c) > 15 - 9 && out) { turning = Math.sign(rel) || 1; tacks++; }
      if (turning && Math.sign(rel) === -turning && Math.abs(rel) >= 42) turning = 0;
      u.steer = 0; u.tiller = turning ? -turning * HELM_STALL : 0; if (!turning) u.h = (from + (rel >= 0 ? -45 : 45) + 360) % 360; // (held close-hauled between tacks)
      w.step(DT); worst = Math.max(worst, Math.abs(pos().c)); least = Math.min(least, u.v);
    }
    expect(tacks).toBeGreaterThanOrEqual(6); expect(worst).toBeLessThan(15); expect(pos().up).toBeGreaterThan(60); expect(least / KT).toBeGreaterThan(1.5);
  }, 120_000);
});
