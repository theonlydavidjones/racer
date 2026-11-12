import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { ASTERN_DRAG, HOVE } from '../src/boat/physics';
import { HANDLING } from '../src/boat/dynamics';
import { KT } from '../src/core/math';

/**
 * The wind on a boat with no way on and her sails down (physics.ts): it drives her astern head to wind, and sets her bodily
 * to leeward beam-on. What a crew leaving a berth under no engine has to reckon with. Each checked against the steady state
 * worked out from the sim's own constants.
 */
// In irons (ROADMAP 10): sternway with her sails up, the rudder working backwards, and sculling only as RRS 2025–2028
// rule 42.3(d) allows: "When a boat is above a close-hauled course and either stationary or moving slowly, she may
// scull to turn to a close-hauled course" (World Sailing's rule 42 interpretations: on either tack, SCULL 1; not back
// against her own sculling, SCULL 2; not to offset a backed sail, SCULL 3).
const world = (kt: number) => {
  const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, windDir: 270, mode: 'sail', sailFrom: 'cityfront', tideDate: '2026-11-14', current: 'slack', sea: 'flat' } as Settings;
  const w = new World(COURSES[0], S, 3, { freeSail: true }), u = w.user;
  u.rig = { main: 1, jib: 1, mainUp: true, jibUp: true }; u.v = 0; u.astern = 0; u.sway = 0; u.turnTarget = null; u.steer = 0; u.tiller = 0;
  return { w, u };
};
const rel = (w: World) => ((w.windHere(w.user, w.user).from - w.user.h + 540) % 360) - 180; // (+: the wind's on her starboard side)

describe('in irons, with her sails up', () => {
  it('stopped 20° off the wind on starboard, she may be sculled round through the wind onto port close-hauled (SCULL 1: either tack)', () => {
    const { w, u } = world(10);
    u.h = (w.windHere(u, u).from - 20 + 360) % 360; // (the wind 20° on her starboard bow)
    // the key that turns her toward the wind and through it (to starboard, + heading)
    for (let i = 0; i < 60 * 25 && u.tack !== 'P'; i++) { u.steer = -1; u.v = 0; u.astern = 0; w.step(DT); }
    expect(u.tack).toBe('P');
  });
  it('once sculled one way, not back the other (SCULL 2): she holds the way she started until she\'s close-hauled', () => {
    const { w, u } = world(10);
    u.h = (w.windHere(u, u).from - 15 + 360) % 360;
    for (let i = 0; i < 60; i++) { u.steer = -1; u.v = 0; u.astern = 0; w.step(DT); } // (sculled a second toward the wind)
    const h0 = u.h;
    for (let i = 0; i < 60 * 3; i++) { u.steer = 1; u.v = 0; u.astern = 0; w.step(DT); } // (then the other way)
    expect(Math.abs(((u.h - h0 + 540) % 360) - 180)).toBeLessThan(2); // (no flow, no sculling back: she barely turns)
  });
  it('going astern, the bow goes the way the tiller\'s pushed, and the tiller is drawn where it\'s held', () => {
    const { w, u } = world(15);
    for (let i = 0; i < 60 * 20; i++) { u.h = w.windHere(u, u).from; w.step(DT); } // (held head to wind: she gathers sternway)
    expect(u.astern ?? 0).toBeGreaterThan(0.3);
    u.scullDir = -1; // (sculling held to port, so the tiller's pump to starboard can't scull her: this is the flow working the rudder backwards)
    const h0 = u.h;
    for (let i = 0; i < 60 * 2; i++) { u.tiller = -0.8; u.steer = 0; w.step(DT); } // (tiller to port)
    expect(((u.h - h0 + 540) % 360) - 180).toBeLessThan(-1); // (the bow to port, the way the tiller's pushed)
    // (drawn where it's held: the same helm as the tiller to port gives with way on ahead, +, though she turns to port)
    expect(Math.sign(u.helm ?? 0)).toBe(1);
  });
  it('backing the jib in irons keeps her sternway and her reversed rudder (the hove-to model, going astern)', () => {
    const { w, u } = world(15);
    for (let i = 0; i < 60 * 20; i++) { u.h = w.windHere(u, u).from; w.step(DT); }
    const a0 = u.astern ?? 0; expect(a0).toBeGreaterThan(0.3);
    u.sheets.jib = -20; u.jibBacked = 1; u.hove = true; u.manualTrim = true;
    for (let i = 0; i < 60; i++) { u.hove = true; w.step(DT); }
    expect((u.astern ?? 0) + u.v).toBeGreaterThan(0); expect(u.astern ?? 0).toBeGreaterThan(0.5 * a0); // (still going astern, not stopped dead)
    void rel;
  });
});
