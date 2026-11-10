import { describe, expect, it } from 'vitest';
import { HARBOR, SLIPS, hitsHarbor, hullClear, inBasin, pushOffPlan, slipById } from '../src/geo/marina';
import { onLand } from '../src/geo/shore';
import { LL } from '../src/geo/geo';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World, slipLeadTime } from '../src/sim/world';

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
  it('the entrance is open: from the Bay you can reach a slip without crossing land (a coarse path search)', () => {
    const start = LL(37.8095, -122.4385), goal = slipById(SLIPS[Math.floor(SLIPS.length / 2)].id)!.p, step = 8;
    const key = (p: { x: number; y: number }) => `${Math.round(p.x / step)},${Math.round(p.y / step)}`;
    const seen = new Set([key(start)]); let frontier = [start], found = false;
    for (let it = 0; it < 400 && frontier.length && !found; it++) {
      const next: typeof frontier = [];
      for (const p of frontier) for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const q = { x: p.x + dx, y: p.y + dy }, k = key(q);
        if (seen.has(k) || onLand(q) || Math.hypot(q.x - start.x, q.y - start.y) > 1500) continue;
        seen.add(k); next.push(q); if (Math.hypot(q.x - goal.x, q.y - goal.y) < step * 1.5) found = true;
      }
      frontier = next;
    }
    expect(found).toBe(true);
  });
  it('Cruise from her slip: in it bow in, made fast; push off walks her out and swings her round; home again bow first', () => {
    const slip = SLIPS[40], boat = { ...DEFAULT_BOAT, slip: slip.id };
    const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14' };
    const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
    expect(w.homeSlip?.id).toBe(slip.id); expect(u.v).toBe(0); expect(u.docked?.phase).toBe('fast');
    expect(Math.hypot(u.x - slip.p.x, u.y - slip.p.y)).toBeLessThan(0.01); expect(u.h).toBe(slip.heading); // bow in, toward the dock
    for (let i = 0; i < 300; i++) w.step(DT); // made fast: she stays put, wind or no wind
    expect(Math.hypot(u.x - slip.p.x, u.y - slip.p.y)).toBeLessThan(0.01);
    expect(w.pushOff()).toBe(true);
    const plan = pushOffPlan(slip);
    for (let i = 0; i < 60 * 40 && u.docked; i++) { w.step(DT); expect(hitsHarbor(u)).toBe(false); }
    expect(u.docked).toBeUndefined(); expect(u.v).toBeGreaterThan(0.3);
    expect(Math.abs(((u.h - plan.h + 540) % 360) - 180)).toBeLessThan(1);
    expect(Math.hypot(u.x - slip.p.x, u.y - slip.p.y)).toBeGreaterThan(slip.finger * 0.45 + 4);
    // back in, stern first: not home; bow first and stopped: home, and made fast again
    w.t = 300; Object.assign(u, { x: slip.p.x, y: slip.p.y, h: slip.heading + 180, v: 0.2 }); w.step(DT);
    expect(w.arrivedT).toBeNull();
    Object.assign(u, { x: slip.p.x, y: slip.p.y, h: slip.heading + 10, v: 0.2 }); w.step(DT);
    expect(w.arrivedT).not.toBeNull(); expect(u.docked?.phase).toBe('fast');
  });
  it('room to push off and swing her round from nearly every slip', () => {
    let ok = 0;
    for (const s of SLIPS) {
      const p = pushOffPlan(s), c = { x: s.p.x - Math.sin(s.heading * Math.PI / 180) * p.back, y: s.p.y - Math.cos(s.heading * Math.PI / 180) * p.back };
      // and facing open fairway, not a dead end: clear water at least 10 m ahead
      const v = { x: Math.sin(p.h * Math.PI / 180), y: Math.cos(p.h * Math.PI / 180) };
      if (hullClear(c, p.h) && [2, 4, 6, 8, 10].every(d => hullClear({ x: c.x + v.x * d, y: c.y + v.y * d }, p.h))) ok++;
      expect(Math.abs(p.turn)).toBe(90);
    }
    expect(ok / SLIPS.length).toBeGreaterThan(0.97);
  }, 40000);
  it('Race from her slip: in it, with time to sail out to the line before the warning signal', () => {
    const slip = SLIPS[40], boat = { ...DEFAULT_BOAT, slip: slip.id };
    const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', mode: 'race', raceFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14' };
    const w = new World(COURSES[0], S, 1), u = w.user;
    expect(u.docked?.phase).toBe('fast'); expect(w.fromSlip).toBe(true);
    const lead = slipLeadTime(slip, w.C.center);
    expect(w.startAt).toBe(S.seq * 60 + lead); expect(lead).toBeGreaterThanOrEqual(15 * 60);
    expect(w.boats.length).toBe(1 + S.fleet); // the fleet's out by the line already
    for (const b of w.boats.slice(1)) expect(inBasin(b)).toBe(false);
    for (let i = 0; i < 60 * 30; i++) w.step(DT); // half a minute: no flags yet, still made fast
    expect(w.flags.length).toBe(0); expect(u.docked?.phase).toBe('fast');
  });
});
