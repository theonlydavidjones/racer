import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { passageNow } from '../src/sim/navigator';
import { outlookFor, type Outlook } from '../src/sim/outlook';
import { beatAngle } from '../src/boat/polar';
import { speedInChop } from '../src/boat/seaway';
import { KT, V, brg, cross, dot, sub, unit, wrap, type Vec } from '../src/core/math';
import { LL } from '../src/geo/geo';

/**
 * The plan she's given is the time she'd sail (Deep Physics' review of the router, V1). The router reads the wind and
 * current off the Outlook's grids; here its own track is timed again with the wind and current worked out exactly at
 * every point (outlookFor(w, true)). With the land's lee read off 200 m blocks, the owner's plan said 64 min and sailed
 * 78: the router had found a strip under the bluffs that the blocks gave the open water's breeze. Within 5%.
 */
const windOn = (o: Outlook, p: Vec, t: number) => {
  const w = o.wind(p, t), c = o.current(p, t), a = V(w.from);
  const wx = -a.x * w.kt - c.x / KT, wy = -a.y * w.kt - c.y / KT;
  return { kt: Math.hypot(wx, wy), from: brg(-wx, -wy) };
};
/** Her speed over the ground along u at p (m/s), steering to make good the line across the current, as the router does. */
function along(o: Outlook, p: Vec, t: number, u: Vec): number {
  const w = windOn(o, p, t), c = o.current(p, t), ch = o.chop(p, t), beat = beatAngle(w.kt);
  if (w.kt < 0.5) return dot(c, u); // (becalmed: the tide alone)
  let h = brg(u.x, u.y), v = 0;
  for (let k = 0; k < 4; k++) {
    let twa = Math.abs(wrap(w.from - h));
    if (twa < beat) { h = w.from - (wrap(w.from - h) >= 0 ? 1 : -1) * beat; twa = beat; }
    v = speedInChop(w.kt, twa, ch.hs, ch.tp);
    if (k < 3) h = brg(u.x, u.y) + Math.asin(Math.max(-0.95, Math.min(0.95, cross(u, c) / Math.max(0.2, v)))) * 180 / Math.PI;
  }
  const d = V(h);
  return dot({ x: d.x * v + c.x, y: d.y * v + c.y }, u);
}

describe('the plan against the time she would sail it', () => {
  it("the owner's Horseshoe Bay case, 25 Nov 15:00: the plan's minutes within 5% of its track timed by the exact wind and current", () => {
    const A = LL(37.8312, -122.4757), B = LL(37.848, -122.450);
    const S = { ...DEFAULT_SETTINGS, mode: 'sail', windKind: 'west', windTurn: -20, windKt: 10, tideDate: '2026-11-25', tideTime: '15:00' } as Settings;
    const w = new World(COURSES[0], S, 7, { freeSail: true }); w.user.x = A.x; w.user.y = A.y; (w as unknown as { dest: unknown }).dest = { p: B };
    const r = passageNow(w as never)!;
    expect(r.ok).toBe(true);
    const oC = outlookFor(w as never), oX = outlookFor(w as never, true), tr = r.track;
    // each 30 s of the track: the plan's own time, scaled by the grids' speed over the ground there against the exact
    // one (the turns' cost stays as the plan has it)
    let plan = 0, exact = 0;
    for (let k = 1; k < tr.length; k++) {
      const p = tr[k - 1].p, q = tr[k].p, dt = tr[k].t - tr[k - 1].t, L = Math.hypot(q.x - p.x, q.y - p.y);
      plan += dt;
      if (L < 1 || dt <= 0) { exact += dt; continue; }
      const u = unit(sub(q, p)), m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, t = (tr[k].t + tr[k - 1].t) / 2;
      const gc = along(oC, m, t, u), gx = along(oX, m, t, u);
      exact += gc > 0.05 && gx > 0.05 ? dt * gc / gx : dt;
    }
    expect(Math.abs(exact / plan - 1)).toBeLessThan(0.05); // (measured: 64.7 against 65.3, +1.0%)
  }, 120_000);
});
