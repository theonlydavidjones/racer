import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { D2R, KT, V, wrap } from '../src/core/math';
import { HANDLING, flowTurnRate } from '../src/boat/dynamics';
import { turnBleed } from '../src/boat/physics';
import { HELM_MAX, HELM_STALL, inducedDrag, rudderSepDrag, rudderTurn } from '../src/boat/balance';
import { yawLag } from '../src/boat/physics';
import { sail, testBoat } from './helpers/testBoat';

/**
 * The helm's travel and response (the owner, 15 Nov 2026, of his own boat: "I need to be able to push the tiller about
 * 50% wider ... no delay in the turn of the boat and the push of the tiller", short-tacking in the marina). The tiller
 * swings to the deck's stop, 46.5 degrees each side (75 until 18 Nov 2026); the turn grows with it, rounding off, to the rudder's stall at 40 and falls off past it,
 * where the blade brakes; and her turn answers the helm sooner (her yaw inertia worked from her ballast keel). ESTIMATES all, with
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
const tack = (kt: number, til: number, called = true) => {
  const w = mk(kt), u = w.user; settle(w, 45); const d = V(u.h), x0 = u.x, y0 = u.y; let t = 0, adv = 0;
  // ("Ready about" is called, as a helmsman tacks her: uncalled, the crew hold the jib until they've seen the turn, and
  // the quicker she turns the less warning they have (crewPhys.ts prepLeft), which hides part of what the helm gains)
  for (; t < 40; t += DT) { const rel = wrap(w.windHere(u, u, false).from - u.h); if (rel >= 42) break; u.steer = 0; u.tiller = til; if (called) u.callT = w.t; w.step(DT); adv = Math.max(adv, (u.x - x0) * d.x + (u.y - y0) * d.y); }
  return { t, adv, v: u.v };
};

describe('the helm\'s travel: the tiller to the deck at 46.5 degrees, the rudder stalling past 40', () => {
  it('the turn grows with the helm to the stall, then falls off; past the stall it brakes', () => {
    expect(rudderTurn(0.5)).toBeCloseTo(0.5, 9); expect(rudderTurn(1)).toBeCloseTo(1, 9); expect(rudderTurn(HELM_STALL)).toBeCloseTo(1 + (HELM_STALL - 1) / 2, 9); // (rounding off to a sixth more at the stall)
    for (let h = 1.02; h <= HELM_STALL; h += 0.02) { expect(rudderTurn(h)).toBeGreaterThan(rudderTurn(h - 0.02)); expect(rudderTurn(h)).toBeLessThan(h); }
    let prev = rudderTurn(HELM_STALL);
    for (let h = HELM_STALL + 0.05; h <= HELM_MAX + 1e-9; h += 0.05) { const r = rudderTurn(h); expect(r).toBeLessThan(prev); prev = r; }
    // (hard over is the deck's stop, 46.5 degrees, since 18 Nov 2026, the owner's ruling: 1.134 of full helm's turn there,
    // just under the stall's 1.167. At 75, as it was, 0.507 in a band of 0.45 to 0.55: the same tenth either side)
    expect(rudderTurn(HELM_MAX)).toBeLessThan(1.23); expect(rudderTurn(HELM_MAX)).toBeGreaterThan(1.01);
    // (the blade's own drag, since 18 Nov 2026 the turn's bleed's second part: rudderSepDrag, by the angle the water meets
    // it at, in place of rudderBrake past the stall alone (133 N hard over at 4.7 kt, in 100 to 166). None to 15 degrees,
    // where a plain flap's flow starts to leave it (NACA Report 938); all of a plate's from the stall: 535 N at 40 degrees
    // at 4.7 kt, in 400 to 668, the same quarter either side; and never less for more angle)
    expect(rudderSepDrag(10, 2.4)).toBe(0); expect(rudderSepDrag(15, 2.4)).toBe(0);
    expect(rudderSepDrag(40, 2.4)).toBeGreaterThan(400); expect(rudderSepDrag(40, 2.4)).toBeLessThan(668);
    for (let a = 15; a < 90; a += 1) expect(rudderSepDrag(a + 1, 2.4), `${a} degrees`).toBeGreaterThan(rudderSepDrag(a, 2.4));
    // (and the hull and keel's induced drag for the side force of a turn at full helm at 4.7 kt, her own 15.3 degrees a
    // second there: 254 N by ORC's eq. 6.37, in 190 to 318. With the blade's 56 N at the 21.7 degrees it meets the water
    // at, 309 N, where the uncited 0.15·v·ω it replaces gave 241 N)
    const full = flowTurnRate(2.4), M = HANDLING.mass, fh = M * 2.4 * full * Math.PI / 180;
    expect(inducedDrag(fh, 2.4)).toBeGreaterThan(190); expect(inducedDrag(fh, 2.4)).toBeLessThan(318);
    expect(rudderSepDrag(21.7, 2.4)).toBeGreaterThan(42); expect(rudderSepDrag(21.7, 2.4)).toBeLessThan(70);
    // (turnBleed itself, the two together over her mass and speed: 309 N at full helm in that steady turn, in 232 to 386;
    // and what the physics review found, 18 Nov 2026: the blade put over against her swing meets the water at more, not
    // less, 48 degrees for 40 of helm, and brakes hard, where with the helm amidships there's only the keel's share)
    const N = (helm?: number, rate = full) => turnBleed(rate, 2.4, 0, 90, 0, helm) * 2.4 * M;
    expect(N(1)).toBeGreaterThan(232); expect(N(1)).toBeLessThan(386);
    expect(N(-HELM_STALL)).toBeGreaterThan(N(HELM_STALL, full) + 300); expect(N(0)).toBeCloseTo(inducedDrag(fh, 2.4), 6);
    expect(N(1, -full)).toBeCloseTo(N(-1, full), 6); // (either way round: the helm against the turn)
    // (the helm left out, as arcs.ts asks it: the helm that rate takes, the same in a steady turn; and a slow turn's cost
    // by the square of its rate, a quarter of the keel's share for half the rate)
    expect(N(undefined)).toBeCloseTo(N(1), 6); expect(N(0.5, full / 2)).toBeCloseTo(inducedDrag(fh, 2.4) / 4, 6);
    expect(turnBleed(full, 0, 0, 90, 0, 1)).toBe(0); // (stopped: nothing to bleed)
  });
  it('her turning circle from a beam reach in 10 kt: 9 m at 30 degrees of helm as before, under 8 m at the stall, and a little wider and slower hard over', () => {
    const full = circle(10, 1), stall = circle(10, HELM_STALL), hard = circle(10, HELM_MAX);
    expect(full.radius).toBeGreaterThan(8); expect(full.radius).toBeLessThan(9.5);
    expect(stall.radius).toBeGreaterThan(6.8); expect(stall.radius).toBeLessThan(7.8);
    // (hard over at the deck's stop, 18 Nov 2026: 7.47 m against the stall's 7.33, 17.3 degrees a second against 18.4, and
    // 0.19 kt more way lost in 3 s. At 75: 15.8 m asked over 12, 0.40 of the stall's rate asked under 0.5, 0.58 kt asked
    // over 0.3. The stop is 6.5 degrees past the stall now, so she no longer turns half as fast there)
    expect(hard.radius).toBeGreaterThan(stall.radius); expect(hard.radius).toBeLessThan(7.8); expect(hard.rate).toBeLessThan(stall.rate);
    expect((stall.v - hard.v) / KT).toBeGreaterThan(0.1);
  }, 60_000);
  it('the turn starts with the tiller: 5.5 degrees in the first half second at 5.8 kn, 3 at 4 kn; her lag under 0.4 s at 4.7 kt and 0.9 s at 2 kt', () => {
    expect(circle(10, HELM_STALL).half).toBeGreaterThan(5.5);
    expect(circle(5, HELM_STALL).half).toBeGreaterThan(3);
    expect(yawLag(4.7 * KT)).toBeLessThan(0.4); expect(yawLag(2 * KT)).toBeLessThan(0.9);
    expect(yawLag(1 * KT)).toBeGreaterThan(2 * yawLag(2 * KT) - 1e-9); // (and still by her speed: at a crawl she answers slowly)
  }, 60_000);
  it('a tack with the helm at the stall: inside 8.9 s and 8.6 m of carry in 6, 8 and 14 kt, half a second quicker and a meter shorter than at 30 degrees, and a quarter of a knot slower out of it; hard over, half a second slower', () => {
    for (const kt of [6, 8, 14]) {
      const full = tack(kt, 1), stall = tack(kt, HELM_STALL);
      // (the turn's bleed from its sources, 18 Nov 2026 (physics.ts turnBleed): the stall's tack takes 8.45, 7.72 and 6.70 s
      // (7.60, 6.87 and 5.97 before, asked under 8: the same twentieth over the slowest), and is 0.62, 0.58 and 0.68 s
      // quicker than full helm's (1.32, 1.28 and 1.33 before, asked over 1: the same fifth under the least). Her carry
      // hasn't moved. And it's paid for now: she comes out 0.30, 0.31 and 0.49 kt slower than from full helm's, where
      // before she lost nothing by it)
      expect(stall.t, `${kt} kt`).toBeLessThan(8.9); expect(stall.adv, `${kt} kt`).toBeLessThan(8.6);
      expect(full.t - stall.t, `${kt} kt`).toBeGreaterThan(0.45); expect(full.adv - stall.adv, `${kt} kt`).toBeGreaterThan(1);
      expect((full.v - stall.v) / KT, `${kt} kt`).toBeGreaterThan(0.2);
    }
    // (uncalled, the tack at the stall in 14 kt is a fifth of a second slower: the crew late on the jib)
    expect(tack(14, HELM_STALL, false).t).toBeGreaterThan(tack(14, HELM_STALL).t + 0.1);
    const hard = tack(8, HELM_MAX), stall = tack(8, HELM_STALL);
    // (hard over at the deck's stop, 18 Nov 2026: 7.50 s against 6.87 and 2.54 kt out of it against 2.80. At 75: 19.98 s,
    // asked over twice the stall's, and 0.98 kt, asked under 0.6 of it: the old properties belonged to a tiller 35 degrees past
    // the stall, and the stop is 6.5 past it now)
    // (on the sourced bleed, the same day: 8.67 s against 7.72 and 2.01 kt against 2.31; the 8 s it was asked under becomes
    // 9.3, the same fifteenth over)
    expect(hard.t).toBeGreaterThan(stall.t + 0.3); expect(hard.t).toBeLessThan(9.3); expect(hard.v).toBeLessThan(0.95 * stall.v);
  }, 120_000);
  it('the physics review\'s cases: a turn by the flow past full helm isn\'t sculling; a key with the tiller over the same way stops at the stall; going astern the blade is drawn where it\'s held', () => {
    // (a key's turn with way on, the helm at the stall, turns her faster than full helm's flow: no sculling latched, so
    // stopped head to wind afterwards she may still be sculled either way, SCULL 1)
    { const w = mk(10), u = w.user; settle(w, 60); for (let i = 0; i < 120; i++) { u.steer = 1; w.step(DT); } expect(u.v).toBeGreaterThan(1); expect(u.scullDir).toBeUndefined(); }
    { const w = mk(10), u = w.user; settle(w, 90);
      for (let i = 0; i < 30; i++) { u.steer = 1; u.tiller = -HELM_STALL; w.step(DT); } expect(Math.abs(u.helm ?? 0)).toBeCloseTo(HELM_STALL, 6); // (the key adds nothing past the stall)
      for (let i = 0; i < 30; i++) { u.steer = 1; u.tiller = -HELM_MAX; w.step(DT); } expect(Math.abs(u.helm ?? 0)).toBeCloseTo(HELM_MAX, 6); // (the hand alone holds it past the stall)
      for (let i = 0; i < 30; i++) { u.steer = 1; u.tiller = 0.5; w.step(DT); } expect(Math.abs(u.helm ?? 0)).toBeCloseTo(HELM_STALL - 0.5, 6); } // (against the hand, they sum)
    // (sternway, the tiller held past full helm: the blade drawn on the same side as at full helm)
    const drawn = (til: number) => { const b = testBoat({ heading: 5, kt: 0, windKt: 10, windFrom: 0 }) as ReturnType<typeof testBoat> & { handsOff?: boolean }; b.isUser = true; b.v = 0; b.astern = 0.5; b.scullDir = -Math.sign(til); sail(b, 0.4, () => { b.tiller = til; b.steer = 0; b.handsOff = true; }); return b.helm ?? 0; };
    const one = drawn(1), wide = drawn(HELM_STALL);
    expect(Math.abs(one)).toBeCloseTo(1, 6); expect(Math.sign(wide)).toBe(Math.sign(one)); expect(Math.abs(wide)).toBeCloseTo(HELM_STALL, 6);
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
    expect(tacks).toBeGreaterThanOrEqual(6); expect(worst).toBeLessThan(15); expect(pos().up).toBeGreaterThan(60); expect(least / KT).toBeGreaterThan(1); // (never without steerage way)
  }, 120_000);
});
