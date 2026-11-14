import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { D2R } from '../src/core/math';
import { hullSide, yawInertia } from '../src/boat/turning';

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

/** A steering key tapped once a second (down a third of it): the tiller thrown over and let come back, a sculling stroke. */
const tap = (i: number, dir: number) => (i % 60 < 20 ? dir : 0);
describe('in irons, with her sails up', () => {
  it('stopped 20° off the wind on starboard, she may be sculled round through the wind onto port close-hauled (SCULL 1: either tack)', () => {
    const { w, u } = world(10);
    u.h = (w.windHere(u, u).from - 20 + 360) % 360; // (the wind 20° on her starboard bow)
    // the key that turns her toward the wind and through it (to starboard, + heading), tapped
    for (let i = 0; i < 60 * 30 && u.tack !== 'P'; i++) { u.steer = tap(i, -1); u.v = 0; u.astern = 0; w.step(DT); }
    expect(u.tack).toBe('P');
  });
  it('the helm held over with no way on does nothing, and an even wag of the tiller nets nothing: it is the stroke that sculls her', () => {
    const turn = (helm: (i: number) => { steer?: number; tiller?: number }) => {
      const { w, u } = world(10); u.h = (w.windHere(u, u).from - 20 + 360) % 360; const h0 = u.h;
      for (let i = 0; i < 60 * 10; i++) { const x = helm(i); u.steer = x.steer ?? 0; u.tiller = x.tiller ?? 0; u.v = 0; u.astern = 0; w.step(DT); }
      return ((u.h - h0 + 540) % 360) - 180;
    };
    const alone = turn(() => ({})), held = turn(() => ({ steer: -1 })), wag = turn(i => ({ tiller: Math.sin(2 * Math.PI * i / 60) })), tapped = turn(i => ({ steer: tap(i, -1) }));
    // by hand on the tiller: thrown over one way in a third of a second, eased back in two
    const stroke = turn(i => { const ph = (i % 60) / 60; return { tiller: ph < 1 / 3 ? -1 + 6 * ph : 1 - 3 * (ph - 1 / 3) }; });
    expect(Math.abs(wag - alone)).toBeLessThan(0.5);
    // (held over: the one throw of the tiller is one stroke's push, a degree or two in ten seconds, and no more)
    expect(Math.abs(held - alone)).toBeLessThan(2.5); expect(Math.abs(held - alone)).toBeLessThan(0.5 * Math.abs(tapped - alone));
    expect(Math.abs(tapped - alone)).toBeGreaterThan(4); expect(Math.abs(stroke - alone)).toBeGreaterThan(4);
  });
  it('once sculled one way, not back the other (SCULL 2): she holds the way she started until she\'s close-hauled', () => {
    const { w, u } = world(10);
    u.h = (w.windHere(u, u).from - 15 + 360) % 360;
    for (let i = 0; i < 60 * 10; i++) { u.steer = tap(i, -1); u.v = 0; u.astern = 0; w.step(DT); } // (sculled ten seconds toward the wind)
    const h0 = u.h, way = Math.sign(u.turnRate ?? 0), r0 = Math.abs(u.turnRate ?? 0) * D2R, T = 5;
    expect(r0 / D2R).toBeGreaterThan(0.5);
    for (let i = 0; i < 60 * T; i++) { u.steer = tap(i, 1); u.v = 0; u.astern = 0; w.step(DT); } // (then the stroke the other way)
    const turned = (((u.h - h0 + 540) % 360) - 180) * way;
    // no flow and no sculling back: she isn't turned the other way. She carries on the way she was going, on her own
    // momentum: her yaw inertia against her hull and keel broadside to the water, I·dr/dt = −k·r², which coasts her
    // (I/k)·ln(1 + r0·k·t/I) in t seconds from r0 (turning.ts). Half as much again allowed, for the flogging sails' and
    // the wind's own small moments on her and the strokes' ripple; and no less than half of it (she isn't stopped dead)
    const I = yawInertia(), k = -hullSide(0, 0, 1).m, coast = (I / k) * Math.log(1 + r0 * k * T / I) / D2R;
    expect(turned).toBeGreaterThan(0.5 * coast);
    expect(turned).toBeLessThan(1.5 * coast + 0.2);
  });
  it('going astern, the bow goes the way the tiller\'s pushed, and the tiller is drawn where it\'s held', () => {
    const { w, u } = world(15);
    for (let i = 0; i < 60 * 20; i++) { u.h = w.windHere(u, u).from; w.step(DT); } // (held head to wind: she gathers sternway)
    expect(u.astern ?? 0).toBeGreaterThan(0.3);
    u.scullDir = -1; // (sculling held to port, so the tiller's pump to starboard can't scull her: this is the flow working the rudder backwards)
    const h0 = u.h;
    // (tiller to port, put over across a second and held: thrown over at once, the blade's own swing kicks her stern
    // the other way for a moment, which is sculling's push, not the flow's)
    for (let i = 0; i < 60 * 3; i++) { u.tiller = -0.8 * Math.min(1, i / 60); u.steer = 0; w.step(DT); }
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
