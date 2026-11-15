// The navigator takes her home to her slip (the owner, 15 Nov 2026: "navigator just cannot take her home to her slip"):
// from off the harbor's mouth, on Nav, the pilot steers her in along the fairways (geo/marina.ts harborRoute), clear of
// the docks and the boats in the slips, to the fairway off her slip, and goes to standby there for her to be brought in.
import { describe, expect, it } from 'vitest';
import { harborAt, harborRoute, slipById } from '../src/geo/marina';
import { landAlong, onLand } from '../src/geo/shore';
import { landDist } from '../src/sim/routing';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { engage } from '../src/boat/autopilot';

describe('the navigator takes her home', () => {
  it('Josephine, from off Gashouse Cove\'s mouth to the fairway off slip 572, on Nav under power: along the fairways, touching nothing', () => {
    const s = slipById('gashouse-cove:572')!, r = harborRoute(s)!, boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
    expect(r).toBeTruthy();
    const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 6, windDir: 270, mode: 'sail', sailFrom: 'cityfront', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
    const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user; for (let i = 0; i < 30; i++) w.step(DT);
    // (off the mouth: 60 m out in open water with a clear line to it, pointed at it, sails down, the motor at half throttle)
    const a = r.entry, clearTo = (q: { x: number; y: number }) => !onLand(q) && landAlong(q, a) === Infinity && landDist(q) > 15;
    let o = a; for (let k = 0; k < 72 && o === a; k++) { const t = k * 5 * Math.PI / 180, q = { x: a.x + Math.sin(t) * 60, y: a.y + Math.cos(t) * 60 }; if (clearTo(q) && !harborAt(q)) o = q; }
    expect(o, 'open water off the mouth').not.toBe(a);
    Object.assign(u, { docked: undefined, x: o.x, y: o.y, h: (Math.atan2(a.x - o.x, a.y - o.y) * 180 / Math.PI + 360) % 360, v: 1, astern: 0, sway: 0, turnRate: 0 });
    u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false };
    u.motor = { hp: 6, down: true, running: true, gear: 'F', throttle: 0.5 };
    engage(u, w.pilot, 'nav'); expect(w.sendHome()).toBe(true);
    const bumps: string[] = []; let off = false, t = 0;
    for (; t < 600 && !off; t += DT) {
      w.step(DT);
      for (const e of w.drainEvents()) if (e.type === 'toast') { if (/Bump|Collision|Aground|hit /.test(e.msg)) bumps.push(e.msg); if (/the pilot's on standby/.test(e.msg)) off = true; }
    }
    expect(bumps.slice(0, 3), `at ${t.toFixed(0)} s, ${Math.hypot(u.x - r.entry.x, u.y - r.entry.y).toFixed(0)} m from the mouth, turn ${(w as any).homeTurn}`).toEqual([]);
    expect(off, `the pilot never reached the fairway off her slip in ${t.toFixed(0)} s; she's ${Math.hypot(u.x - r.approach.x, u.y - r.approach.y).toFixed(0)} m from it`).toBe(true);
    expect(Math.hypot(u.x - r.approach.x, u.y - r.approach.y)).toBeLessThan(12);
  }, 120_000);
});
