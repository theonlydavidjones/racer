import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import type { Boat } from '../src/boat/boat';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { aiThink } from '../src/ai/ai';
import { V, n360, wrap } from '../src/core/math';
import { cpa } from '../src/rules';

const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, current: 'slack', tideDate: '2026-11-14', traffic: 0, ...o });
/** Put a boat at (x, y) relative to `at`, on heading h at 2 m/s, with her tack and wind angle to match. */
function put(w: World, b: Boat, at: { x: number; y: number }, x: number, y: number, h: number): void {
  const u = V(h), from = w.wind.from, rel = wrap(from - h);
  Object.assign(b, { x: at.x + x, y: at.y + y, h: n360(h), desired: n360(h), v: 2, vx: u.x * 2, vy: u.y * 2, tack: rel >= 0 ? 'S' : 'P', twa: Math.abs(rel), rel, tacking: false, penalty: 0 });
  b.ww = { from, kt: w.wind.kt };
}
/** Closest approach (m) if `b` sailed heading h at her speed and `o` held her course. */
const sep = (b: Boat, o: Boat, h: number) => { const u = V(h); return cpa({ x: b.x, y: b.y, vx: u.x * b.v, vy: u.y * b.v }, o).d; };

describe('AI collision avoidance: two obligations at once', () => {
  it('keeping clear of one boat comes before the room she owes a third boat she has right of way over (Rule 16.1)', () => {
    // B on starboard, on a close reach. X to leeward of her on starboard, converging: B is windward and must keep clear
    // (Rule 11), so she heads up. Y on port, crossing ahead and to windward: B has right of way over Y (Rule 10), and
    // heading up closes on Y, which Rule 16.1 would limit. Keeping clear of X must win.
    const w = new World(ss2 as unknown as CourseFile, settings({ fleet: 3 }), 1);
    w.t = -30;
    const [, B, X, Y] = w.boats, F = w.wind.from, cs = n360(F - 75); // starboard, a close reach
    const at = { x: w.center.x - w.N.x * 300, y: w.center.y - w.N.y * 300 }; // clear water below the line
    const ahead = V(cs), right = V(cs + 90); // right of her heading = her windward side on starboard
    const rel = (f: number, s: number) => ({ x: ahead.x * f + right.x * s, y: ahead.y * f + right.y * s });
    for (const b of w.boats) put(w, b, at, 5000, 5000, 0); // everyone else well away
    put(w, B, at, 0, 0, cs);
    const px = rel(2, -8); put(w, X, at, px.x, px.y, cs + 30); // to leeward, half a length ahead, converging
    const py = rel(16, 3); put(w, Y, at, py.x, py.y, n360(F + 42)); // on port, crossing ahead to windward
    expect(w.rights(B, X).kc).toBe(B);
    expect(w.rights(B, Y).kc).toBe(Y);
    expect(sep(B, Y, n360(B.h + 33))).toBeLessThan(8); // heading up closes on Y: Rule 16.1 alone would stop it
    aiThink(w, B, DT);
    const withY = B.desired;
    // she turns away from X (heads up), opening the room to her
    expect(wrap(withY - B.h)).toBeGreaterThan(5); // up, toward the wind (starboard: wind on her right)
    expect(sep(B, X, withY)).toBeGreaterThan(sep(B, X, B.h) + 1);
    // and the third boat doesn't undo it: the same move as with Y out of the way
    put(w, Y, at, 5000, -5000, 0); B.desired = B.h;
    aiThink(w, B, DT);
    expect(Math.abs(wrap(withY - B.desired))).toBeLessThan(3);
  });
  it('windward and overlapped but already parting with room (Rule 11): she sails on, not easing and heading up on until she stalls', () => {
    // B on starboard on a reach, X to leeward abeam, two beams of water between them and X heading a little lower, so
    // they're parting. B is keeping clear already: she holds her course at full speed. (She used to ease and head up
    // to close-hauled, 1.7 kt beside a faster X, for half a minute: Crew Model's bisect, 12 November.)
    const w = new World(ss2 as unknown as CourseFile, settings({ fleet: 3 }), 1);
    w.t = 300;
    const [, B, X] = w.boats, F = w.wind.from, cs = n360(F - 100); // starboard, a beam reach
    const at = { x: w.center.x - w.N.x * 300, y: w.center.y - w.N.y * 300 };
    const ahead = V(cs), right = V(cs + 90);
    const rel = (f: number, s: number) => ({ x: ahead.x * f + right.x * s, y: ahead.y * f + right.y * s });
    for (const b of w.boats) put(w, b, at, 5000, 5000, 0);
    put(w, B, at, 0, 0, cs); B.started = true;
    const px = rel(1, -6.5); put(w, X, at, px.x, px.y, cs - 4); X.started = true; // to leeward, abeam, parting
    expect(w.rights(B, X).kc).toBe(B);
    expect(cpa(B, X).t).toBe(0); // (parting)
    aiThink(w, B, DT);
    const withX = B.desired, eased = B.luff;
    // her course with X out of the way
    put(w, X, at, 5000, -5000, 0); B.h = cs; B.desired = cs; aiThink(w, B, DT);
    expect(eased).toBe(false);
    // on her course, or held on her heading if her course would close on X: not heading up 20° from it
    const dev = wrap(withX - B.desired), held = wrap(withX - cs);
    expect(Math.abs(dev) < 3 || Math.abs(held) < 3, `with X ${withX.toFixed(0)}, her course ${B.desired.toFixed(0)}, heading ${cs.toFixed(0)}`).toBe(true);
  });
});

