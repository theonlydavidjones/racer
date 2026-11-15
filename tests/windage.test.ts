import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { ASTERN, HOVE, asternCoast, asternDrag } from '../src/boat/physics';
import { HANDLING, hullResistance, windFore, windSide } from '../src/boat/dynamics';
import { KT } from '../src/core/math';

/**
 * The wind on a boat with no way on and her sails down (physics.ts): it drives her astern head to wind, and sets her bodily
 * to leeward beam-on. What a crew leaving a berth under no engine has to reckon with. Each checked against the steady state
 * worked out from the sim's own constants.
 */
const world = (kt: number) => {
  const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, windDir: 270, mode: 'sail', sailFrom: 'cityfront', tideDate: '2026-11-14', current: 'slack', sea: 'flat' } as Settings;
  const w = new World(COURSES[0], S, 3, { freeSail: true }), u = w.user;
  u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; u.v = 0; u.astern = 0; u.sway = 0;
  return { w, u };
};
const hold = (w: World, h: number) => { const u = w.user; u.h = h; u.turnTarget = null; u.steer = 0; u.tiller = 0; u.turnRate = 0; }; // (held on a heading: her turn held too, now that it's a motion of its own)

describe('the wind on her with no way on (bare poles)', () => {
  it('head to wind she\'s driven astern, to where the wind on her rig (windFore, bow-on) meets the water\'s drag astern (twice her hull\'s resistance ahead: ASTERN)', () => {
    const { w, u } = world(15);
    // (the wind gusts: her sternway answers its mean pressure over the last half minute, so the steady state is worked out
    // from that, and her sternway taken over the same time)
    // (and its windage at the angle she's actually at: a few degrees off the bow in the shifts, where ORC's side area
    // already counts, dynamics.ts windFore)
    let a2 = 0, as = 0, n = 0;
    for (let i = 0; i < 60 * 90; i++) { hold(w, w.windHere(u, u).from); w.step(DT); if (i >= 60 * 60) { a2 += u.aws ** 2 * windFore(u.awa); as += u.astern ?? 0; n++; } }
    // steady: the wind on her rig, ½·ρ·aws²·CdA (aws as she feels it: the sim's apparent wind, from her way ahead only), over
    // against the water's drag astern, ASTERN × her hull's resistance at that speed
    // (the drag is on the wind at the rig's height, as the sails' is: the log profile, ORC VPP eq. 7.1, z0 = 0.005 m,
    // the centre of effort 4.29 m up: physics.ts sailWind)
    const V = Math.sqrt(a2 / n) * Math.log(4.29 / 0.005) / Math.log(10 / 0.005), push = 0.5 * 1.225 * V * V;
    let lo = 0, hi = 3; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (ASTERN * hullResistance(m) < push) lo = m; else hi = m; }
    const s = lo;
    expect(u.v).toBe(0); expect(as / n).toBeGreaterThan(0.8 * s); expect(as / n).toBeLessThan(1.2 * s);
    expect(s).toBeGreaterThan(0.8); expect(s).toBeLessThan(1.3); // (about a meter a second, two knots, in 15 kt: it was 0.6 on the old unsourced drag)
  });
  it('beam-on she\'s set to leeward, to where the wind on her side (windSide, beam-on) meets her hull and keel broadside (crossCd)', () => {
    const { w, u } = world(15);
    for (let i = 0; i < 60 * 60; i++) { hold(w, w.windHere(u, u).from + 90); u.v = 0; u.astern = 0; w.step(DT); }
    const wind = w.windHere(u, u), V = wind.kt * KT;
    const steady = Math.sqrt(0.5 * 1.225 * V * V * windSide(90) / (0.5 * 1025 * HOVE.latArea * HOVE.crossCd)); // (about 0.3 m/s in 15 kt)
    // the wind's from her port side (heading 90 degrees to the right of it): she's set to starboard
    expect(u.sway ?? 0).toBeGreaterThan(0.6 * steady); expect(u.sway ?? 0).toBeLessThan(1.4 * steady);
  });
  it('left alone with the wind on either beam and no current, she goes to leeward over the ground, never to windward (the owner, leaving a slip, 13 Nov 2026)', () => {
    for (const side of [90, -90]) {
      const { w, u } = world(12);
      u.h = (w.windHere(u, u).from + side + 360) % 360;
      const x0 = u.x, y0 = u.y; let worst = 0, down = 0;
      for (let i = 0; i < 60 * 60; i++) {
        u.turnTarget = null; u.steer = 0; u.tiller = 0; w.step(DT);
        const from = w.windHere(u, u).from * Math.PI / 180; // (the wind blows toward −(sin, cos) of where it's from)
        down = -((u.x - x0) * Math.sin(from) + (u.y - y0) * Math.cos(from)); worst = Math.min(worst, down);
      }
      expect(worst, `wind ${side > 0 ? 'to port' : 'to starboard'}: never to windward`).toBeGreaterThan(-0.05);
      expect(down, 'a minute on: well to leeward').toBeGreaterThan(5); // (about 0.4 kt of leeway in 12 kt: some 12 m)
    }
  });
  it('never ahead and astern at once: driven astern head to wind, then turned off it and blown ahead, it\'s one motion', () => {
    const { w, u } = world(15);
    for (let i = 0; i < 60 * 30; i++) { hold(w, w.windHere(u, u).from); w.step(DT); expect(u.v > 0 && (u.astern ?? 0) > 0).toBe(false); }
    expect(u.astern ?? 0).toBeGreaterThan(0.3);
    // (three minutes, not one: she now carries a meter a second of sternway into it, and the water takes it off slowly)
    for (let i = 0; i < 60 * 180; i++) { hold(w, w.windHere(u, u).from + 150); w.step(DT); expect(u.v > 0 && (u.astern ?? 0) > 0).toBe(false); }
    expect(u.v).toBeGreaterThan(0.2); expect(u.astern ?? 0).toBe(0); // (blown off downwind on her bare rig, ahead now)
  });
  it('in irons with her sails up she gathers sternway, faster than on her bare rig (the flogging cloth\'s windage too)', () => {
    const bare = world(15), up = world(15);
    up.u.rig = { main: 1, jib: 1, mainUp: true, jibUp: true };
    for (let i = 0; i < 60 * 30; i++) for (const { w, u } of [bare, up]) { hold(w, w.windHere(u, u).from); w.step(DT); }
    expect(up.u.v).toBe(0);
    expect(up.u.astern ?? 0).toBeGreaterThan(bare.u.astern ?? 0);
    expect(up.u.astern ?? 0).toBeLessThan(1.5); // (a slow drift back, not a sail astern)
  });
  it('on bare poles the rig\'s windage acts at any angle forward of the beam: stopped 40 degrees off the wind, she\'s pushed astern', () => {
    const { w, u } = world(15);
    for (let i = 0; i < 60 * 30; i++) { hold(w, w.windHere(u, u).from + 40); w.step(DT); }
    expect(u.astern ?? 0).toBeGreaterThan(0.1);
  });
  it('sailing, nothing changes: no sternway, and the keel holds her (the polar carries her leeway)', () => {
    const { w, u } = world(12);
    u.rig = { main: 1, jib: 1, mainUp: true, jibUp: true }; u.v = 3;
    for (let i = 0; i < 60 * 30; i++) { hold(w, w.windHere(u, u).from + 90); w.step(DT); }
    expect(u.v).toBeGreaterThan(2); expect(u.astern ?? 0).toBe(0);
    // (her slip is her leeway: a degree or two on a beam reach, as the keel's lift makes it, no more)
    const slip = Math.atan2(Math.abs(u.sway ?? 0), u.v) * 180 / Math.PI;
    expect(slip).toBeLessThan(3); expect(Math.abs(slip - (u.leeway ?? 0))).toBeLessThan(0.75);
  });
});

describe('the water\'s drag on her going astern (physics.ts ASTERN: twice her hull\'s own resistance ahead, an estimate)', () => {
  it('is her hull\'s resistance at that speed, twice over, on her mass: 16 N at 0.4 m/s, not the 48 N of the old law', () => {
    for (const v of [0.1, 0.4, 1]) expect(asternDrag(v) * HANDLING.mass).toBeCloseTo(2 * hullResistance(v), 9);
    expect(asternDrag(0.4) * HANDLING.mass).toBeGreaterThan(12); expect(asternDrag(0.4) * HANDLING.mass).toBeLessThan(20);
    // (about as the square of her speed: friction, with no constant part and none going as the speed)
    expect(asternDrag(0.8) / asternDrag(0.4)).toBeGreaterThan(2.8); expect(asternDrag(0.8) / asternDrag(0.4)).toBeLessThan(4.2); // (the 1.5 power to the square: doubling her speed triples it)
    expect(asternDrag(0)).toBe(0);
  });
  it('shoved off astern in a calm she carries her way: from 0.5 m/s, five lengths and four minutes before she has lost it', () => {
    const { w, u } = world(0.01);
    Object.assign(u, { v: 0, astern: 0.5, sway: 0, turnRate: 0 }); u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false };
    const x0 = u.x, y0 = u.y; let t = 0, at30 = 0;
    while ((u.astern ?? 0) > 0.05 && t < 900) { hold(w, u.h); w.step(DT); t += DT; if (Math.abs(t - 30) < DT / 2) at30 = u.astern ?? 0; }
    const run = Math.hypot(u.x - x0, u.y - y0);
    expect(run).toBeGreaterThan(30); expect(run).toBeLessThan(50); // (40 m: 8 m on the old law)
    expect(t).toBeGreaterThan(180); expect(t).toBeLessThan(320); // (four minutes: 34 s on the old law)
    expect(at30).toBeGreaterThan(0.3); // (half a minute on she still has most of it)
    // (and the push-off's sum agrees: the coast's length from that speed)
    expect(asternCoast(0.5)).toBeGreaterThan(0.85 * run); expect(asternCoast(0.5)).toBeLessThan(1.15 * run);
    // (a longer coast for a harder shove, and none for none)
    expect(asternCoast(1)).toBeGreaterThan(asternCoast(0.5) + 15); expect(asternCoast(0.04)).toBe(0);
  });
  it('a steady push astern of 26 N, a paddle\'s, holds her at about a knot (0.15 m/s on the old law)', () => {
    let lo = 0, hi = 3; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (asternDrag(m) * HANDLING.mass < 26) lo = m; else hi = m; }
    expect(lo).toBeGreaterThan(0.45); expect(lo).toBeLessThan(0.65);
  });
  it('driven ahead with sternway on, her sails take the sternway off first: one motion, not two', () => {
    const { w, u } = world(12);
    Object.assign(u, { v: 0, astern: 0.4, sway: 0, turnRate: 0 }); u.rig = { main: 1, jib: 1, mainUp: true, jibUp: true };
    let both = 0; for (let i = 0; i < 60 * 40; i++) { hold(w, w.windHere(u, u).from + 60); w.step(DT); if (u.v > 0 && (u.astern ?? 0) > 0) both++; }
    expect(both).toBe(0); expect(u.astern ?? 0).toBe(0); expect(u.v).toBeGreaterThan(1.5); // (off on a close reach inside the minute)
  });
});
