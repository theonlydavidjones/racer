// The ferry give-way's longer checks (the quick ones: tests/ferry-giveway.test.ts), left out of test:fast for their
// time (about a minute): 64 crossings over seeds and sides, every give-way vessel in a cluster of boats, and every
// service stepped for an hour at the World's own step, on her line and off it.
import { describe, expect, it } from 'vitest';
import { SERVICES, VESSEL, CLEAR, TURN_DEG_S, Traffic, newWays } from '../src/sim/traffic';
import { trafficWater } from '../src/sim/world';
import { meeting, when, across, T0 } from './helpers/ferryMeet';

describe('the ferries give way, the longer checks', () => {
  it("in a cluster of boats she doesn't swing from side to side, turn faster than she can, or misreport her speed", () => {
    for (const kind of ['ferry', 'alcatraz', 'tour', 'coastguard'] as const) {
      const id = SERVICES.findIndex(s => s.kind === kind);
      const T = when(id, 7, T0, 150, (a, b, c) => a.moving && b.moving && c.moving);
      const m0 = new Traffic(true, 7).vessels(T + 120)[id], u = { x: Math.sin(m0.h * Math.PI / 180), y: Math.cos(m0.h * Math.PI / 180) };
      // (three boats crossing where she'll be in two minutes, a fourth lying still just off her line there)
      const boats = [across(id, 7, T, 120, 1), across(id, 7, T, 140, -1), across(id, 7, T, 160, 1), { x: m0.x + u.y * 80, y: m0.y - u.x * 80, vx: 0, vy: 0 }];
      const m = meeting(id, 7, T, boats, 400, trafficWater);
      console.log(`${kind}: side flips ${m.flips}, fastest turn ${m.turn.toFixed(1)}°/s, speed off by up to ${(m.speedErr * 100).toFixed(1)}%, heading off her track by up to ${m.skew.toFixed(1)}°, nearest ${m.nearest.map(x => x.toFixed(0)).join(', ')} m`);
      expect(m.flips, kind).toBeLessThanOrEqual(2);
      // (an alteration turns her at up to TURN_DEG_S, and rounding a corner of her route at up to TURN_DEG_S again: at
      // most both at once, with her line's own easing in to her berth)
      expect(m.turn, kind).toBeLessThan(2 * TURN_DEG_S + 4);
      expect(m.speedErr, kind).toBeLessThan(0.15);
      expect(m.skew, `${kind}: her heading against her track (°)`).toBeLessThan(8);
      expect(m.kink, `${kind}: her heading's largest turn in one step (°)`).toBeLessThan(2);
      expect(m.frozen, `${kind}: seconds reported under way, not moving`).toBeLessThan(0.5);
      for (const d of m.nearest) expect(d, kind).toBeGreaterThan(VESSEL[kind].len / 2 + 10);
    }
  }, 180_000);
  it('one boat crossing each give-way vessel, many runs: always well clear (the third review\'s 31 m case among them)', () => {
    let worst = Infinity, at = '';
    for (const kind of ['ferry', 'alcatraz', 'tour', 'coastguard'] as const) for (let seed = 1; seed <= 8; seed++) for (const side of [1, -1]) {
      const id = SERVICES.findIndex(s => s.kind === kind), T = when(id, seed, T0 + seed * 977, 160, (a, b, c) => a.moving && b.moving && c.moving);
      const m = meeting(id, seed, T, [across(id, seed, T, 160, side)], 320, trafficWater);
      const margin = m.nearest[0] - (CLEAR * 0.8 + VESSEL[kind].len / 2);
      if (margin < worst) { worst = margin; at = `${kind} seed ${seed} side ${side}: ${m.nearest[0].toFixed(0)} m`; }
    }
    console.log(`the closest of 64 crossings, against 0.8 × CLEAR past her half-length: ${at}`);
    expect(worst, at).toBeGreaterThan(0);
  }, 300_000);
  it('no vessel jumps: every service for an hour, on her line and 300 m off it, a step (1/60 s) at a time; and on her line alongside', () => {
    for (let id = 0; id < SERVICES.length; id++) {
      const v = VESSEL[SERVICES[id].kind].kt * 0.5144, tr = new Traffic(true, 3), ways = newWays(), dt = 1 / 60;
      let last = tr.vessels(T0, ways)[id], worst = 0, stuck = 0;
      for (let n = 1; n < 3600 * 60; n++) {
        const t = T0 + n * dt;
        tr.advance(t, dt, ways);
        if (n % 18000 === 0 && SERVICES[id].kind !== 'container' && SERVICES[id].kind !== 'tanker') ways[id].tgt = (n / 18000) % 2 < 1 ? 300 : -300;
        const now = tr.vessels(t, ways)[id];
        worst = Math.max(worst, Math.hypot(now.x - last.x, now.y - last.y) / (v * dt));
        if (!now.moving && !last.moving) expect(ways[id].off).toBe(0); // (alongside a whole step: on her line)
        if (now.moving && now.v > 1 && last.moving) { const m = Math.hypot(now.x - last.x, now.y - last.y); stuck = m < 0.1 * now.v * dt ? stuck + dt : 0; expect(stuck, `${SERVICES[id].kind}: reported under way, not moving (s)`).toBeLessThan(0.5); }
        last = now;
      }
      // (her speed, and what easing off her line where the room for it grows adds: never a jump)
      console.log(`${SERVICES[id].kind}: the fastest step, ${worst.toFixed(3)} × her speed`);
      expect(worst, SERVICES[id].kind).toBeLessThan(1.6);
    }
  }, 120_000);
});
