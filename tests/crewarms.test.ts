import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { testBoat, sail, startTack } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { buildCrew, fistAt, syncCrew, type Crew, type Figure } from '../src/render/crew';
import { BONE } from '../src/render/crewBody';

// Arms clear of bodies. The owner on the middle hiker holding the traveller's tail: "his right arm seems to extend through
// his torso to grab the traveler line." So: no arm (upper arm, forearm, the hand to the middle of the fist) passes through
// its own torso or thighs, or anyone else's body, in any pose the hikers take at 15 and 18 kt, on either tack, with the
// lines in their hands: sitting out on the rail, through a tack, alone with both lines.
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const world = (o: THREE.Object3D, y = 0) => o.localToWorld(V(0, y, 0));
type Cap = { name: string; a: THREE.Vector3; b: THREE.Vector3; r: number };
/** A body's parts as capsules (from, to, radius: a jacketed limb's or the torso's, m, ESTIMATES from crewBody.ts's sections). */
function body(f: Figure): Cap[] {
  f.root.updateMatrixWorld(true); const k = f.scale, out: Cap[] = [];
  f.leg.forEach((l, i) => { const hip = world(l.root), knee = world(l.mid), ankle = world(l.mid, -BONE.shin); out.push({ name: `thigh${i}`, a: hip, b: knee, r: 0.075 * k }, { name: `shin${i}`, a: knee, b: ankle, r: 0.055 * k }); });
  out.push({ name: 'torso', a: world(f.root), b: world(f.head), r: 0.12 * k }, { name: 'head', a: world(f.head, 0.05), b: world(f.head, 0.16), r: 0.1 * k });
  return out;
}
/** A body's arms: shoulder to elbow, elbow to wrist, wrist to the middle of the fist. */
function arms(f: Figure): Cap[] {
  f.root.updateMatrixWorld(true); const out: Cap[] = [];
  f.arm.forEach((a, i) => { const sh = world(a.root), el = world(a.mid), wr = world(a.mid, -BONE.fore), fi = fistAt(f, i as 0 | 1); out.push({ name: `upper arm${i}`, a: sh, b: el, r: 0 }, { name: `forearm${i}`, a: el, b: wr, r: 0 }, { name: `hand${i}`, a: wr, b: fi, r: 0 }); });
  return out;
}
const segDist = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()))); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
/** Each crew member's arm bones, every 1 cm, inside a body part: the bone's line itself within the part's radius. */
function through(cr: Crew, label: string, bad: string[]): void {
  const figs = [['helm', cr.helm] as const, ...cr.crew.map((f, j) => [`crew${j + 1}`, f] as const)];
  for (const [who, f] of figs) { if (who === 'helm' || !f.root.visible) continue;
    for (const arm of arms(f)) { const n = Math.max(2, Math.ceil(arm.a.distanceTo(arm.b) / 0.01));
      for (let q = 0; q <= n; q++) { const p = arm.a.clone().lerp(arm.b, q / n);
        // (the upper arm's first 6 cm: the shoulder's joint, at the torso's side)
        if (arm.name.startsWith('upper') && q / n * arm.a.distanceTo(arm.b) < 0.06 * f.scale) continue;
        for (const [whom, g] of figs) { if (!g.root.visible) continue;
          for (const c of body(g)) { const d = segDist(p, c.a, c.b); if (d < c.r) bad.push(`${label}: ${who}'s ${arm.name} ${((c.r - d) * 100).toFixed(1)} cm into ${whom === who ? 'their own' : `${whom}'s`} ${c.name}`); } }
      } }
  }
}

describe("Hiking, the arms go round bodies, not through them (render/crew.ts hikeHold)", () => {
  for (const kt of [15, 18]) for (const tack of ['S', 'P'] as const) for (const n of [2, 1]) for (const tk of [false, true]) {
    it(`${kt} kt, ${tack === 'S' ? 'starboard' : 'port'} tack, ${n === 1 ? 'one crew' : 'two crew'}${tk ? ', through a tack' : ''}`, () => {
      const twa = beatAngle(kt), b = testBoat({ heading: tack === 'S' ? 360 - twa : twa, kt: 4, windKt: kt }); b.tack = tack;
      const spec = { helm: DEFAULT_CREW.helm, crew: DEFAULT_CREW.crew.slice(0, n) };
      b.crew = newCrew(spec, tack);
      const cr = buildCrew(spec.helm, spec.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1), bad: string[] = [];
      sail(b, 20);
      const frames = (secs: number, check: boolean) => { for (let i = 0; i < secs * 30; i++) { sail(b, 1 / 30); syncCrew(cr, b.tack === 'S' ? 1 : -1, b.crew, 1 / 30, false, undefined, b.heel, b.tacking); if (check && i % 3 === 0) through(cr, `${(i / 30).toFixed(1)} s`, bad); } };
      frames(4, false); // (settled into the pose first)
      if (tk) { startTack(b); frames(14, true); } else frames(3, true);
      expect([...new Set(bad)].slice(0, 8)).toEqual([]);
    }, 120_000);
  }
});
