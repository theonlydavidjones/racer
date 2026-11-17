// Every traffic route keeps off the land: at least CLEAR_M from it (an estimate, the Coordinator's figure for routes drawn
// without a track to go by), along its whole length but for the last 400 m in to either berth, and on either side of its
// line by a crossing's spread (sim/traffic.ts XTRACK), as far as she can be off it there. The bay-cruise loop was drawn
// over Lime Point and across Alcatraz, and the ships' route to Oakland over Treasure Island and Yerba Buena.
import { describe, expect, it } from 'vitest';
import { ROUTES, XTRACK } from '../src/sim/traffic';
import { landDist, shoreDist } from '../src/geo/shore';
import { toLL } from '../src/geo/geo';

const CLEAR_M = 100;

describe('the traffic routes keep off the land', () => {
  for (const [name, r] of Object.entries(ROUTES)) it(name, () => {
    const L = [0]; for (let i = 1; i < r.length; i++) L.push(L[i - 1] + Math.hypot(r[i].x - r[i - 1].x, r[i].y - r[i - 1].y));
    const total = L[L.length - 1];
    let worst = Infinity, at = '';
    for (let i = 1; i < r.length; i++) {
      const a = r[i - 1], b = r[i], l = L[i] - L[i - 1], u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
      for (let d = 0; d <= l; d += 10) {
        const s = L[i - 1] + d; if (Math.min(s, total - s) < 400) continue;
        for (const off of [-XTRACK, 0, XTRACK]) {
          const q = { x: a.x + u.x * d + u.y * off, y: a.y + u.y * d - u.x * off }, m = Math.min(landDist(q), shoreDist(q));
          if (m < worst) { worst = m; const ll = toLL(q); at = `leg ${i}, ${ll.lat.toFixed(4)}, ${ll.lon.toFixed(4)}`; }
        }
      }
    }
    expect(worst, `${name}: nearest the land at ${at}`).toBeGreaterThanOrEqual(CLEAR_M);
  });
});
