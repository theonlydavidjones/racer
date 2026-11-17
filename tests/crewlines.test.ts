import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { testBoat, sail } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { buildCrew, fistAt, ground, syncCrew, travCam, travTail, type Crew, type Figure } from '../src/render/crew';
import { BONE } from '../src/render/crewBody';
import { thwartTop, COCKPIT_FIT } from '../src/render/hull';

// The hiker's traveller line, as drawn (boatMesh.ts: from the car's end to the block at the track's end, down to its cam
// on the thwart's face, then travTail to the hand). The owner on a picture that passed "the lines end in the hands": "middle
// crew is not gripping the line, which instead appears to penetrate his thigh, turn unnaturally at a nearly right angle,
// then travel parallel to his forearm to terminate in mid air." So: in the fist, clear of the body, and no corners but
// the ones a real line makes.
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DEG = 180 / Math.PI;

/** The line from the block at the track's end, through its cam, to its tail's end (boatMesh.ts). */
function travLine(cr: Crew, side: number): THREE.Vector3[] {
  const block = V(side * 0.54, thwartTop() + 0.02, COCKPIT_FIT.thwart.z), cam = travCam(side);
  return [block, cam, ...travTail(cam, cr.travHand, side)];
}
const world = (o: THREE.Object3D, y = 0) => o.localToWorld(V(0, y, 0));
/** Which hand holds it: the figure and arm whose wrist or fist is at Crew.travHand. */
function holder(cr: Crew): { f: Figure; i: 0 | 1 } {
  for (const f of cr.crew) for (const i of [0, 1] as const) if (f.cur!.hands[i].distanceTo(cr.travHand!) < 1e-6 || fistAt(f, i).distanceTo(cr.travHand!) < 1e-6) return { f, i };
  throw new Error('nobody holds it');
}
/**
 * The fist: the glove (crewBody.ts) runs on from the wrist, the forearm's end, 6.5 cm to the middle of the palm, the
 * fingers curled round to it, 13 cm to the fingertips. A line held in it runs across the palm, through that middle,
 * square to the forearm (the knuckles' line).
 */
function fist(f: Figure, i: number) {
  f.root.updateMatrixWorld(true);
  const el = world(f.arm[i].mid), wr = world(f.arm[i].mid, -BONE.fore), axis = wr.clone().sub(el).normalize();
  return { at: wr.clone().addScaledVector(axis, 0.065 * f.scale), axis, wr };
}
/** Each body part as a capsule: from, to, its radius (a jacketed limb's, m, ESTIMATES from crewBody.ts's sections). */
function parts(f: Figure): { name: string; a: THREE.Vector3; b: THREE.Vector3; r: number }[] {
  f.root.updateMatrixWorld(true); const k = f.scale, out: { name: string; a: THREE.Vector3; b: THREE.Vector3; r: number }[] = [];
  f.leg.forEach((l, i) => { const hip = world(l.root), knee = world(l.mid), ankle = world(l.mid, -BONE.shin); out.push({ name: `thigh${i}`, a: hip, b: knee, r: 0.075 * k }, { name: `knee/shin${i}`, a: knee, b: ankle, r: 0.055 * k }); });
  f.arm.forEach((a, i) => { const sh = world(a.root), el = world(a.mid), wr = world(a.mid, -BONE.fore); out.push({ name: `upper arm${i}`, a: sh, b: el, r: 0.05 * k }, { name: `forearm${i}`, a: el, b: wr, r: 0.042 * k }); });
  out.push({ name: 'torso', a: world(f.root), b: world(f.head), r: 0.12 * k });
  return out;
}
const segDist = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()))); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
/** How far a point is above the boat's surface, and whether it's in the boat: under the surface there and all round it
 * (1 cm each way), not just lying against a face or on an edge (ground's a height field: a face is a step in it). */
const ROUND = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
const above = (p: THREE.Vector3, d: number) => Math.min(...ROUND.map(([i, j]) => Math.abs(p.y - ground(p.x + i * d, p.z + j * d, p.y))));
const inBoat = (p: THREE.Vector3) => ROUND.every(([i, j]) => p.y < ground(p.x + i * 0.01, p.z + j * 0.01, p.y) - 0.005);
const turn = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => b.clone().sub(a).angleTo(c.clone().sub(b)) * DEG;

describe("The hiker's traveller line, as drawn: held in the fist, clear of the body, no false corners (crew.ts travTail)", () => {
  for (const kt of [15, 18]) for (const tack of ['S', 'P'] as const) {
    const setup = () => {
      const twa = beatAngle(kt), b = testBoat({ heading: tack === 'S' ? 360 - twa : twa, kt: 4, windKt: kt }); b.tack = tack;
      const spec = { helm: DEFAULT_CREW.helm, crew: DEFAULT_CREW.crew.slice(0, 2) };
      b.crew = newCrew(spec, tack);
      const cr = buildCrew(spec.helm, spec.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1), w = tack === 'S' ? 1 : -1;
      sail(b, 20); for (let i = 0; i < 120; i++) { sail(b, 1 / 30); syncCrew(cr, w, b.crew, 1 / 30, false, undefined, b.heel, b.tacking); }
      expect(b.crew.people.slice(1).every(p => p.pose === 'hike'), 'both hiking').toBe(true);
      expect(cr.travHand, 'the traveller held').toBeTruthy();
      return { cr, w, line: travLine(cr, w), ...holder(cr) };
    };
    const name = `${kt} kt, ${tack === 'S' ? 'starboard' : 'port'} tack`;
    it(`${name}: its end inside the closed fist, across the palm`, () => {
      const { line, f, i } = setup(), end = line[line.length - 1], into = end.clone().sub(line[line.length - 2]).normalize(), h = fist(f, i);
      // (the glove is drawn closed, the one shape it has: the fingers curled round to the palm, crewBody.ts. The line's
      // end in the hollow they close round, within 2 cm of the palm's middle, not at the cuff or beyond the fingers)
      expect(end.distanceTo(h.at), 'from the middle of the fist, m').toBeLessThan(0.02 * f.scale);
      // (and into it from the load, across the palm or out past the little finger as a pulled line goes, never in at the
      // cuff up along the forearm: its way in at least 60° off the way the forearm points, elbow to wrist)
      expect(into.angleTo(h.axis) * DEG, 'its way in, against the forearm, deg').toBeGreaterThan(60);
    });
    it(`${name}: no part of it through anyone, or the boat`, () => {
      const { cr, line, f, i } = setup(), bad: string[] = [], h = fist(f, i);
      const figs: [string, Figure][] = [['helm', cr.helm], ...cr.crew.map((g, j) => [`crew${j + 1}`, g] as [string, Figure])];
      // (from the cam on: the run along the thwart's top and face is the boat's, under nobody)
      for (let s = 1; s < line.length - 1; s++) {
        const a = line[s], b = line[s + 1], n = Math.max(2, Math.ceil(a.distanceTo(b) / 0.01));
        for (let q = 0; q <= n; q++) { const p = a.clone().lerp(b, q / n);
          if (p.distanceTo(h.at) < 0.05 * f.scale) continue; // (in the fist: the hand's own grip)
          for (const [who, g] of figs) for (const c of parts(g)) { const d = segDist(p, c.a, c.b); if (d < c.r) bad.push(`${who} ${c.name}: ${((c.r - d) * 100).toFixed(1)} cm into it at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`); }
        }
      }
      // (nor through the boat: from 3 cm past the cam, in its jaws on the thwart's face, never inside it)
      for (let s = 1; s < line.length - 1; s++) for (let q = 0; q <= 20; q++) { const p = line[s].clone().lerp(line[s + 1], q / 20);
        if (p.distanceTo(line[1]) < 0.03) continue; if (inBoat(p)) bad.push(`the boat: ${((ground(p.x, p.z, p.y) - p.y) * 100).toFixed(1)} cm under its surface at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`); }
      expect([...new Set(bad)].slice(0, 8)).toEqual([]);
      void i;
    });
    it(`${name}: no corner but the block, the cam and the hand`, () => {
      const { line } = setup(), bad: string[] = [];
      // (line[0] the block, line[1] the cam, the last the hand: every point between them a gentle curve, a line's own
      // sag, never more than 20° at one point; or where it lies over an edge of the boat, the coaming's, and turns on it:
      // a point within 1.5 cm of the surface there, a fairlead of a sort. Never a corner in the air)
      for (let j = 2; j < line.length - 1; j++) { const a = turn(line[j - 1], line[j], line[j + 1]), p = line[j], onEdge = above(p, 0.015) < 0.015;
        if (a > 20 && !onEdge) bad.push(`point ${j}: turns ${a.toFixed(0)}° in the air, ${((p.y - ground(p.x, p.z, p.y)) * 100).toFixed(1)} cm above the surface`); }
      expect(bad).toEqual([]);
    });
  }
});
