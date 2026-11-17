import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { wrap } from '../src/core/math';
import type { Boat } from '../src/boat/boat';
import { asternGlide } from '../src/boat/physics';

/**
 * Steering her going astern, shoved off with no sail set (the owner, 14 Nov 2026: "check the boat steers when pushed
 * back with no sail"). She does, the right way round (her stern goes where the blade points, so her bow swings the
 * other way from going ahead), but a rudder's force goes as the square of the water's speed past it, so her turn goes
 * with her sternway: a crew's full shove gives her steerage; a gentle one gives none. Bare poles, next to no wind.
 */
type Helm = Boat & { handsOff?: boolean };
function shoved(astern: number, helm: (b: Helm) => void, secs = 10) {
  const b = testBoat({ heading: 0, kt: 0, windKt: 0.5, windFrom: 90 }) as Helm; b.isUser = true;
  b.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; b.v = 0; b.astern = astern;
  sail(b, secs, () => helm(b));
  return { turned: wrap(b.h), astern: b.astern ?? 0, ahead: b.v };
}
const key = (b: Helm) => { b.steer = 1; }, tiller = (b: Helm) => { b.tiller = 1; b.steer = 0; b.handsOff = true; };

describe('steering astern, shoved off under bare poles', () => {
  it('at a gentle shove (0.5 m/s) she answers her helm: over 10° in ten seconds, by a held key or the tiller in your hand, and still has most of her way', () => {
    for (const helm of [key, tiller]) {
      const r = shoved(0.5, helm);
      expect(Math.abs(r.turned)).toBeGreaterThan(10); expect(Math.abs(r.turned)).toBeLessThan(30);
      expect(r.astern).toBeGreaterThan(0.35); expect(r.ahead).toBe(0); // (0.35, tightened 17 Nov 2026 on the sourced sternway drag: it was 0.25, with 0.31 left, on the unsourced one)
    }
  });
  it('the helm works the other way round from going ahead: the same key swings her bow the opposite way', () => {
    const back = shoved(0.5, key).turned;
    const b = testBoat({ heading: 0, kt: 0, windKt: 0.5, windFrom: 90 }) as Helm; b.isUser = true; b.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; b.v = 1;
    sail(b, 5, () => key(b));
    expect(Math.sign(wrap(b.h))).toBe(-Math.sign(back)); expect(Math.abs(wrap(b.h))).toBeGreaterThan(5);
  });
  it('a tiller held over near head to wind keeps turning her the same way as her sternway dies: no swing back the other way while she has any way on', () => {
    // (it used to steer her by the flow above 0.2 m/s and scull her the other way, four times as fast, below it)
    for (const off of [15, -15, 0]) {
      const b = testBoat({ heading: (270 + off + 360) % 360, kt: 0, windKt: 4, windFrom: 270 }) as Helm; b.isUser = true;
      b.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; b.v = 0; b.astern = 0.3;
      let dir = 0, flips = 0, lowest = 1;
      sail(b, 150, () => { tiller(b); const a = b.astern ?? 0, r = b.turnRate ?? 0; if (a < 0.06 || b.v > 0) return; lowest = Math.min(lowest, a);
        if (Math.abs(r) > 0.05) { if (dir && Math.sign(r) !== dir) flips++; dir = Math.sign(r); } });
      expect(lowest, `${off}° off the wind: her sternway did fall through 0.2 m/s`).toBeLessThan(0.15);
      expect(flips, `${off}° off the wind`).toBe(0);
    }
  });
  it('her turn goes with her sternway: a few degrees at 0.2 m/s, under 3° at 0.08', () => {
    const fast = Math.abs(shoved(0.5, key).turned), slow = Math.abs(shoved(0.2, key).turned), creep = Math.abs(shoved(0.08, key).turned);
    expect(slow).toBeGreaterThan(1.5); expect(slow).toBeLessThan(fast / 2);
    expect(creep).toBeLessThan(3); expect(creep).toBeLessThan(slow);
  });
  // (the planner's glide in the wind there is, physics.ts asternGlide, against her sailed: the same working, so they
  // agree closely; 15% is the bar the planner is held to)
  for (const [from, kt] of [[0, 20], [90, 20], [180, 20], [180, 12], [45, 12], [135, 20]] as const) it(`the planned glide agrees with her sailed, bare poles, wind ${kt} kt from ${from}° off her bow: within 15%`, () => {
    for (const v0 of [0.55, 0.64]) {
      const b = testBoat({ heading: 0, kt: 0, windKt: kt, windFrom: from }) as Helm; b.isUser = true;
      b.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; b.v = 0; b.astern = v0;
      let dist = 0, steerable = 0; for (let i = 0; i < 300; i++) { sail(b, 0.1); const a = b.astern ?? 0; dist += a * 0.1; if (a > 0.3) steerable += 0.1; }
      const g = asternGlide(v0, 0, from, kt, 30);
      expect(g.dist / dist, `distance from ${v0} m/s`).toBeGreaterThan(0.85); expect(g.dist / dist).toBeLessThan(1.15);
      expect(Math.abs(g.steerable - steerable), `steerage from ${v0} m/s`).toBeLessThan(Math.max(1, 0.15 * steerable));
    }
  });
  it('her steerage is counted from the start: let go too slow to steer, the way a bow wind gives her later doesn\'t count', () => {
    expect(asternGlide(0.1, 0, 0, 20, 60).steerable).toBe(0); // (though in 20 kt on her bow she's over 0.3 m/s within a quarter of a minute)
    expect(asternGlide(0.1, 0, 0, 20, 60).going).toBe(true);
    expect(asternGlide(0.5, 0, 0, 20, 60).steerable).toBeGreaterThan(59); // (from a walk, she never loses it)
    // (let go at 0.55 m/s in a calm she keeps steerage way, over 0.3 m/s, for 37.7 s. Sim-measured on the sourced sternway
    // drag, twice her hull's resistance (physics.ts ASTERN), 17 Nov 2026; on the earlier unsourced drag it was 13 s)
    const calm = asternGlide(0.55, 0, 90, 0, 60).steerable; expect(calm).toBeGreaterThan(35); expect(calm).toBeLessThan(40);
  });
  it('in irons with sternway, a steering key held still sculls her round (rule 42.3(d)): the tiller in your hand is literal, a key asks for the turn', () => {
    // (the batch's rule 21.2 test, 15 Nov 2026: helmed back and forth across the wind by the keys she no longer got across)
    const turn = (helm: (b: Helm) => void) => {
      const b = testBoat({ heading: 5, kt: 0, windKt: 10, windFrom: 0 }) as Helm; b.isUser = true; b.v = 0; b.astern = 0.3;
      sail(b, 8, () => helm(b)); return wrap(b.h - 5);
    };
    const key = turn(b => { b.steer = 1; }), hand = Math.abs(turn(b => { b.tiller = -1; b.steer = 0; b.handsOff = true; }));
    expect(key).toBeGreaterThan(10); // (sculled to starboard, toward 4 deg/s as her turn gathers: the way the key asks)
    // (the held tiller: by the flow past her rudder, little at 0.3 m/s. Sim-measured on the sourced sternway drag,
    // 17 Nov 2026: 6.79 degrees in the 8 s; it was 5.87, under a bound of 6, on the earlier unsourced drag, which took her
    // sternway off sooner: here she still has 0.42 m/s of it at the end, so the flow steers her the whole time. And what
    // the case is about, the contrast: well under half the key's turn, 17.3)
    // (7: the old bound's headroom, 6 over 5.87, on the new measurement. The Coordinator's ruling, 17 Nov 2026)
    expect(hand).toBeLessThan(7); expect(hand).toBeLessThan(0.4 * key);
  });
  it('a wind on her stern shortens the glide, a wind on her bow carries her on', () => {
    const calm = asternGlide(0.64, 0, 90, 0), stern = asternGlide(0.64, 0, 180, 20), bow = asternGlide(0.64, 0, 0, 20);
    expect(stern.dist).toBeLessThan(0.7 * calm.dist); expect(stern.going).toBe(false);
    expect(bow.dist).toBeGreaterThan(2 * calm.dist); expect(bow.going).toBe(true);
  });
});
