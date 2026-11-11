import { describe, expect, it } from 'vitest';
import { HARBOR, SLIPS, hitsHarbor, inBasin, pushOffPoses, slipById } from '../src/geo/marina';
import { onLand } from '../src/geo/shore';
import { LL } from '../src/geo/geo';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, SHOVE, World, slipLeadTime } from '../src/sim/world';
import { n360 } from '../src/core/math';

describe('West Harbor', () => {
  it('a basin you can sail in, with its docks and breakwaters solid', () => {
    expect(HARBOR.walkways.length).toBeGreaterThan(10); expect(HARBOR.fingers.length).toBeGreaterThan(100);
    const s = SLIPS[0];
    expect(inBasin(s.p)).toBe(true); expect(onLand(s.p)).toBe(false); // the water in a slip
    const w = HARBOR.walkways[0], mid = { x: (w[0].x + w[1].x) / 2, y: (w[0].y + w[1].y) / 2 };
    expect(onLand(mid)).toBe(true); // a dock
    expect(onLand(LL(37.8130, -122.4440))).toBe(false); // the Bay outside
  });
  it('slips for the fleet, each clear of the docks', () => {
    expect(SLIPS.length).toBeGreaterThan(250);
    expect(new Set(SLIPS.map(s => s.id)).size).toBe(SLIPS.length);
    for (const s of SLIPS) expect(onLand(s.p)).toBe(false);
  });
  it('the way out is where it really is: east past the jetty\'s tip (a fine path search from a slip on the west side)', () => {
    const start = slipById('E15')!.p, goal = LL(37.8100, -122.4385), step = 2; // E15, and the open Bay off the entrance beacon
    const key = (p: { x: number; y: number }) => `${Math.round(p.x / step)},${Math.round(p.y / step)}`;
    const seen = new Set([key(start)]); let frontier = [start], found = false;
    for (let it = 0; it < 3000 && frontier.length && !found; it++) {
      const next: typeof frontier = [];
      for (const p of frontier) for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const q = { x: p.x + dx, y: p.y + dy }, k = key(q);
        if (seen.has(k) || onLand(q) || Math.hypot(q.x - start.x, q.y - start.y) > 1600) continue;
        seen.add(k); next.push(q); if (Math.hypot(q.x - goal.x, q.y - goal.y) < step * 2) found = true;
      }
      frontier = next;
    }
    expect(found).toBe(true);
    // the jetty itself is solid (Yacht Road and the clubs), and the entrance between its tip and the Marina Green is water
    expect(onLand(LL(37.8079, -122.4430))).toBe(true);
    expect(onLand(LL(37.8080, -122.4393))).toBe(false);
  });
  it('Cruise from her slip: bow in, made fast, sails down; push off walks her out and turns her down the fairway, then a shove; she steers out; hoist; home bow first', () => {
    const slip = SLIPS[40], boat = { ...DEFAULT_BOAT, slip: slip.id };
    const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' };
    const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
    expect(w.homeSlip?.id).toBe(slip.id); expect(u.v).toBe(0); expect(u.docked).toBeTruthy();
    expect(u.rig).toEqual({ main: 0, jib: 0, mainUp: false, jibUp: false }); // sails down at the dock
    expect(Math.hypot(u.x - slip.p.x, u.y - slip.p.y)).toBeLessThan(0.01); expect(u.h).toBe(slip.heading); // bow in, toward the dock
    for (let i = 0; i < 300; i++) w.step(DT); // made fast: she stays put, wind or no wind
    expect(Math.hypot(u.x - slip.p.x, u.y - slip.p.y)).toBeLessThan(0.01);
    expect(w.pushOff()).toBe(true);
    expect(u.docked).toBeUndefined(); expect(u.handled).toBeTruthy(); // the crew has her by hand
    expect(u.pushing?.jump).toBe(0); expect(Math.abs(u.pushing!.lat - 2)).toBeLessThan(0.6); // a crew member on the finger, walking her out
    const plan = u.handled!.plan, poses = pushOffPoses(slip, plan), last = poses[poses.length - 1];
    expect(plan.kind).toBe('swing'); // (this slip has the room to swing her)
    let t = 0; for (; t < 60 * 120 && u.handled; t++) { w.step(DT); expect(hitsHarbor(u)).toBe(false); }
    expect(u.handled).toBeUndefined(); expect(t / 60).toBeLessThan(120); // walked out and swung round in a minute or two (the swing by hand, 2°/s, faster with the wind's help)
    expect(Math.hypot(u.x - last.c.x, u.y - last.c.y)).toBeLessThan(0.1); expect(u.h).toBeCloseTo(n360(plan.h), 6);
    expect(u.v).toBeCloseTo(SHOVE, 2); // pushed off forward, down the fairway
    for (let i = 0; i < 60; i++) w.step(DT);
    expect(u.pushing).toBeUndefined(); // the crew member who walked her out is aboard (stepped aboard at the finger's end)
    // under her own way, tiller centred, she carries on down the fairway, slowing, touching nothing
    w.drainEvents();
    const x0 = u.x, y0 = u.y;
    for (let i = 0; i < 60 * 15; i++) { w.step(DT); expect(hitsHarbor(u)).toBe(false); }
    expect(w.drainEvents().some(e => e.type === 'toast' && /Bump|Aground/.test(e.msg))).toBe(false);
    expect(Math.hypot(u.x - x0, u.y - y0)).toBeGreaterThan(4);
    // going astern the tiller still steers her (the bow goes the way the tiller's pushed)
    Object.assign(u, { x: slip.p.x, y: slip.p.y, h: slip.heading, docked: undefined, handled: undefined, v: 0, astern: 0.8 });
    const h0 = u.h; u.tiller = -0.8; for (let i = 0; i < 120; i++) w.step(DT); u.tiller = 0;
    expect(((u.h - h0 + 540) % 360) - 180).toBeLessThan(-3); // tiller to port: bow to port
    // the crew hoists: the jib in about 15 s, the main in about 30 s (slower off the wind)
    w.setSail('jib', true); w.setSail('main', true);
    for (let i = 0; i < 60 * 20; i++) w.step(DT);
    expect(u.rig!.jib).toBe(1); expect(u.rig!.main).toBeGreaterThan(0.2);
    // back in, stern first: not home; bow first and stopped: home, and made fast again
    w.t = 300; Object.assign(u, { x: slip.p.x, y: slip.p.y, h: slip.heading + 180, v: 0.2, astern: 0 }); w.step(DT);
    expect(w.arrivedT).toBeNull();
    Object.assign(u, { x: slip.p.x, y: slip.p.y, h: slip.heading + 10, v: 0.2 }); w.step(DT);
    expect(w.arrivedT).not.toBeNull(); expect(u.docked).toBeTruthy();
  });
  it('sails down she barely moves; each sail drives in proportion to what is hoisted', () => {
    const speedWith = (main: number, jib: number) => {
      const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'cityfront', tideDate: '2026-11-14', current: 'slack' };
      const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
      u.rig = { main, jib, mainUp: main > 0, jibUp: jib > 0 }; u.v = 0;
      u.h = (w.wind.from + 90) % 360; // a beam reach
      for (let i = 0; i < 60 * 40; i++) { u.h = (w.wind.from + 90) % 360; u.turnTarget = null; w.step(DT); }
      return u.v;
    };
    const full = speedWith(1, 1), mainOnly = speedWith(1, 0), jibOnly = speedWith(0, 1), bare = speedWith(0, 0);
    expect(bare).toBeLessThan(0.3); expect(jibOnly).toBeLessThan(mainOnly); expect(mainOnly).toBeLessThan(full);
    expect(full).toBeGreaterThan(2);
  });
  it('Race from her slip: in it, with time to sail out to the line before the warning signal', () => {
    const slip = SLIPS[40], boat = { ...DEFAULT_BOAT, slip: slip.id };
    const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', mode: 'race', raceFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14' };
    const w = new World(COURSES[0], S, 1), u = w.user;
    expect(u.docked).toBeTruthy(); expect(w.fromSlip).toBe(true);
    const lead = slipLeadTime(slip, w.C.center);
    expect(w.startAt).toBe(S.seq * 60 + lead); expect(lead).toBeGreaterThanOrEqual(15 * 60);
    expect(w.boats.length).toBe(1 + S.fleet); // the fleet's out by the line already
    for (const b of w.boats.slice(1)) expect(inBasin(b)).toBe(false);
    for (let i = 0; i < 60 * 30; i++) w.step(DT); // half a minute: no flags yet, still made fast
    expect(w.flags.length).toBe(0); expect(u.docked).toBeTruthy();
  });
});

describe('idle (the start page, setup, the showroom): she still sails, in the real physics', () => {
  it('on a close reach her apparent wind, boom and heel agree, and the race clock stands still', () => {
    const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 14, tideDate: '2026-11-14' };
    const w = new World(COURSES[0], S, 2), u = w.user, t0 = w.t;
    for (let i = 0; i < 60 * 20; i++) w.idle(DT, 55); // starboard of the wind: the wind over her port bow, port tack
    expect(w.t).toBe(t0);
    expect(u.tack).toBe('P');
    expect(u.arel).toBeLessThan(0); expect(u.arel).toBeGreaterThan(-60); // the flags and windex: wind forward of the beam, to port
    expect(u.boom).toBeGreaterThan(5); // the boom out to starboard, to leeward
    expect(u.v).toBeGreaterThan(2); expect(Math.abs(u.heel)).toBeGreaterThan(3);
  });
});
