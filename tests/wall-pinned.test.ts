import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { harborAt, hitsWall, inBasin } from '../src/geo/marina';
import { onLand } from '../src/geo/shore';
import { basinCalm } from '../src/environment/current';
import { LL } from '../src/geo/geo';

/**
 * A boat lying against a harbor's wall, pinned there by the wind (or docking), is asked about at the same point every
 * step; the still water's answer by a wall traces lines of sight (environment/current.ts calmIn). Capacity's profile
 * (14 Nov 2026): it doubled the step. Kept for the last few points asked, exactly.
 */
// a point in Gashouse Cove's basin hard against a wall, where the still water's answer looks farthest for water in
// sight (found by counting calmIn's samples over the basin, every 0.7 m: 403 of them here, on main 0f0e90a)
function byWall(): { x: number; y: number } {
  const p = { x: 915.79, y: -414.42 };
  expect(inBasin(p) && !hitsWall(p) && !onLand(p) && harborAt(p)?.id === 'gashouse-cove').toBe(true);
  return p;
}

/** The middle of the cove, clear of every wall. */
const OPEN = LL(37.8070, -122.4330);

describe('a boat pinned against a harbor wall', () => {
  it('the still water there: the same answer asked again and again, and asked once', () => {
    const p = byWall(), a = basinCalm(p);
    for (let k = 0; k < 40; k++) basinCalm({ x: p.x + k * 0.37, y: p.y - 5 }); // (other points in between, past the memo's 16)
    expect(basinCalm({ ...p })).toBe(a);
  });
  it('keeps the step under 1.3 × an open-water one', () => {
    const p = byWall(), boat = { ...DEFAULT_BOAT, marina: 'gashouse-cove' };
    const S = { ...DEFAULT_SETTINGS, mode: 'sail', windKind: 'west', windKt: 14, windDir: 270, windTurn: 0, sailFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', traffic: 0 } as Settings;
    const time = (q: { x: number; y: number }) => {
      const w = new World(COURSES[0], S, 1, { freeSail: true }), u = w.user;
      u.docked = false; u.handled = false; u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false };
      const put = () => { u.x = q.x; u.y = q.y; u.h = 0; u.v = 0; u.sway = 0; u.astern = 0; };
      put(); for (let k = 0; k < 120; k++) { put(); w.step(DT); } // (warm)
      const chunks: number[] = [];
      for (let c = 0; c < 9; c++) { const t0 = performance.now(); for (let k = 0; k < 60; k++) { put(); w.step(DT); } chunks.push(performance.now() - t0); }
      return chunks.sort((x, y) => x - y)[4];
    };
    const open = time(OPEN), wall = time(p);
    expect(wall / open, `against the wall ${wall.toFixed(1)} ms a second, open ${open.toFixed(1)}`).toBeLessThan(1.3);
  }, 120_000);
});
