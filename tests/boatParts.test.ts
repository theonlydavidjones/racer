import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HIT_PX, PARTS, partShape, screenArea, screenDist, type ScreenPart } from '../src/render/boatParts';
import { RIG, SHROUD } from '../src/render/boatMesh';
import { LESSONS } from '../src/sim/lessons';

describe('lesson 1, The boat: her parts (render/boatParts.ts)', () => {
  it('is the first lesson, and names each part once', () => {
    expect(LESSONS.find(l => l.id === 'boat')?.no).toBe(1);
    const keys = PARTS.map(p => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    // ASA 101 item 1's and 2's parts she has (standard, read 14 Nov 2026), and the sides
    for (const k of ['hull', 'bow', 'stern', 'transom', 'deck', 'keel', 'rudder', 'tiller', 'cockpit', 'cabin', 'cleat', 'winch', 'mast', 'boom', 'gooseneck', 'forestay', 'shroud', 'chainplate', 'backstay', 'standing',
      'mainsail', 'jib', 'head', 'tack', 'clew', 'luff', 'leech', 'foot', 'batten', 'telltale', 'halyard', 'mainsheet', 'jibsheet', 'fairlead', 'traveler', 'vang', 'cunningham', 'outhaul', 'running', 'port', 'starboard', 'windward', 'leeward'])
      expect(keys, k).toContain(k);
    // each says what it's for in one short line
    for (const p of PARTS) expect(p.what.length, p.key).toBeLessThan(60);
  });
  it('a shroud runs from its chainplate on the deck up to the mast below the hounds', () => {
    expect(SHROUD.foot.x).toBeGreaterThan(0.8); // (CR: at least 0.90 m out; drawn 0.98)
    expect(SHROUD.tip.y).toBeLessThan(RIG.HOUNDS.y);
    expect(SHROUD.tip.y).toBeGreaterThan(SHROUD.foot.y + 5);
  });
  it('tells a click on a point, a line and an area', () => {
    const pt: ScreenPart = { kind: 'pt', pts: [[[100, 100]]] }, line: ScreenPart = { kind: 'line', pts: [[[0, 0], [100, 0]]] };
    const area: ScreenPart = { kind: 'area', pts: [[[0, 0], [100, 0], [100, 100], [0, 100], [50, 50]]] }; // (an inner point: the outline is the hull's)
    expect(screenDist(pt, 110, 100)).toBeCloseTo(10);
    expect(screenDist(line, 50, 7)).toBeCloseTo(7);
    expect(screenDist(line, 50, 7)).toBeLessThanOrEqual(HIT_PX.line);
    expect(screenDist(area, 30, 70)).toBe(0);
    expect(screenDist(area, 103, 50)).toBeCloseTo(3);
    expect(screenArea(area)).toBeCloseTo(10000);
    expect(screenDist({ kind: 'line', pts: [] }, 0, 0)).toBe(Infinity);
  });
  it('has the wind\'s sides by her tack: on port tack, windward is her port side', () => {
    // (the sides need no mesh but her group: a stand-in with just that)
    const grp = new THREE.Group(); grp.updateMatrixWorld();
    const m = { grp, boomPivot: new THREE.Group() } as unknown as Parameters<typeof partShape>[0];
    const meanX = (k: 'windward' | 'leeward', tack: 'P' | 'S') => { const s = partShape(m, k, tack, 0)!.pts.flat(); return s.reduce((a, p) => a + p.x, 0) / s.length; };
    expect(meanX('windward', 'P')).toBeLessThan(0);
    expect(meanX('leeward', 'P')).toBeGreaterThan(0);
    expect(meanX('windward', 'S')).toBeGreaterThan(0);
  });
});
