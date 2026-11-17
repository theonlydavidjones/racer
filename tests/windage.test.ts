import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { ASTERN, HOVE } from '../src/boat/physics';
import { hullResistance } from '../src/boat/dynamics';
import { HANDLING } from '../src/boat/dynamics';
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
const hold = (w: World, h: number) => { const u = w.user; u.h = h; u.turnTarget = null; u.steer = 0; u.tiller = 0; };

describe('the wind on her with no way on (bare poles)', () => {
  it('head to wind she\'s driven astern, to where the wind on her rig (windageCdA) meets her hull\'s drag stern first (ASTERN)', () => {
    const { w, u } = world(15);
    // (the wind gusts: her sternway answers its mean pressure over the last half minute, so the steady state is worked out
    // from that, and her sternway taken over the same time)
    let a2 = 0, as = 0, n = 0;
    for (let i = 0; i < 60 * 90; i++) { hold(w, w.windHere(u, u).from); w.step(DT); if (i >= 60 * 60) { a2 += u.aws ** 2; as += u.astern ?? 0; n++; } }
    // steady: the wind on her rig, ½·ρ·aws²·CdA (aws as she feels it: the sim's apparent wind, from her way ahead only), over
    // against her hull's resistance stern first, ASTERN × hullResistance(s) (it replaced the unsourced c0 + c1·s)
    // (the drag is on the wind at the rig's height, as the sails' is: the log profile, ORC VPP eq. 7.1, z0 = 0.005 m,
    // the centre of effort 4.29 m up: physics.ts sailWind)
    const V = Math.sqrt(a2 / n) * Math.log(4.29 / 0.005) / Math.log(10 / 0.005), mass = HANDLING.mass * 1.04; // (her mass for surge: HANDLING.mass, with her crew's few percent)
    void mass; const push = 0.5 * 1.225 * V * V * HANDLING.windageCdA;
    let lo = 0, hi = 3; for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (ASTERN * hullResistance(m) < push) lo = m; else hi = m; }
    const s = lo;
    expect(u.v).toBe(0); expect(as / n).toBeGreaterThan(0.7 * s); expect(as / n).toBeLessThan(1.3 * s);
    expect(s).toBeGreaterThan(0.7); expect(s).toBeLessThan(1.5); // (about 1 m/s in 15 kt)
  });
  it('beam-on she\'s set to leeward, to where the wind on her side (windSide) meets her hull and keel broadside (crossCd)', () => {
    const { w, u } = world(15);
    for (let i = 0; i < 60 * 60; i++) { hold(w, w.windHere(u, u).from + 90); u.v = 0; u.astern = 0; w.step(DT); }
    const wind = w.windHere(u, u), V = wind.kt * KT;
    const steady = Math.sqrt(0.5 * 1.225 * V * V * HOVE.windSide / (0.5 * 1025 * HOVE.latArea * HOVE.crossCd)); // (about 0.3 m/s in 15 kt)
    // the wind's from her port side (heading 90 degrees to the right of it): she's set to starboard
    expect(u.sway ?? 0).toBeGreaterThan(0.6 * steady); expect(u.sway ?? 0).toBeLessThan(1.4 * steady);
  });
  it('never ahead and astern at once: driven astern head to wind, then turned off it and blown ahead, it\'s one motion', () => {
    const { w, u } = world(15);
    for (let i = 0; i < 60 * 30; i++) { hold(w, w.windHere(u, u).from); w.step(DT); expect(u.v > 0 && (u.astern ?? 0) > 0).toBe(false); }
    expect(u.astern ?? 0).toBeGreaterThan(0.3);
    // (three minutes, not one: on her hull's own drag she carries more sternway into the turn, and takes longer to lose it)
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
