import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { testBoat, sail } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { buildCrew, fistAt, jibWinch, sheetTail, syncCrew, travCam, travTail, type Crew, type Figure } from '../src/render/crew';
import { COAMING_H, COAMING_T, COCKPIT_FIT, cockpitHalf, deckY, sheerLine, thwartTop, uAtZ } from '../src/render/hull';
import { HIKE_RAIL } from '../src/render/boatMesh';

// Every hand holds something. The owner: "They can hold on to the rail, they can hold on with both hands to the line
// they're holding ... in simplest case, they can just hold on to the rail." So every hand of every one aboard, sitting
// and hiking with the lines in hand (crewarms' cases), has its fist on a grip: a line as it's drawn (the traveller's
// tail, the jib sheet's, the mainsheet's), the extension, the toerail, the hiking rail's edges, the coaming's top edges.
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const GRIP = 0.035; // (the fist's middle within 3.5 cm of what it holds: a gloved fist closed round a line or a rail's edge, ESTIMATE)
const segDist = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()))); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
const polyDist = (p: THREE.Vector3, pts: THREE.Vector3[]) => { let d = Infinity; for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, segDist(p, pts[i], pts[i + 1])); return d; };
/** The rails a hand can take, each side: the toerail's top, the hiking rail's two edges, the coaming's two top edges. */
function rails(): THREE.Vector3[][] {
  const out: THREE.Vector3[][] = [];
  for (const s of [-1, 1]) {
    out.push(sheerLine(s, 0.03, 120).map(p => p.setY(p.y + 0.035)));
    // (the hiking rail's plank, its edges a half-width either side of its middle, alongside the cockpit only: boatMesh.ts)
    for (const off of [HIKE_RAIL.inset - HIKE_RAIL.w / 2, HIKE_RAIL.inset + HIKE_RAIL.w / 2]) out.push(sheerLine(s, off, 240).filter(p => p.z >= HIKE_RAIL.z0 && p.z <= HIKE_RAIL.z1).map(p => p.setY(p.y + HIKE_RAIL.gap + HIKE_RAIL.t)));
    for (const e of [0, COAMING_T]) { const pts: THREE.Vector3[] = []; for (let z = 0.6; z <= 3.0; z += 0.05) { const u = uAtZ(z), ci = cockpitHalf(u); pts.push(V(s * (ci + e), deckY(u, ci + COAMING_T) + COAMING_H(z), z)); } out.push(pts); }
  }
  return out;
}
const RAILS = rails();
/** The lines as drawn, from the boat to the hand. */
function lines(cr: Crew, w: number): THREE.Vector3[][] {
  const out: THREE.Vector3[][] = [];
  const cam = travCam(w); out.push([cam, ...travTail(cam, cr.travHand, w)]);
  const wv = jibWinch(-w); out.push([wv, ...sheetTail(wv, -w, cr.sheetHand, cr.sheetHand2)]);
  const mh = (cr as { mainHand?: THREE.Vector3 }).mainHand; if (mh) out.push([V(0, thwartTop() + 0.1, COCKPIT_FIT.thwart.z + 0.06), mh]);
  return out;
}
/** The extension as drawn: its stick, from its mesh. */
function extension(cr: Crew): THREE.Vector3[] {
  const ex = cr.extension; ex.updateMatrix(); const g = ex.geometry; g.computeBoundingBox(); const bb = g.boundingBox!;
  return [V(0, bb.min.y, 0).applyMatrix4(ex.matrix), V(0, bb.max.y, 0).applyMatrix4(ex.matrix)];
}

describe('Every hand holds something: a line, the extension or a rail (render/crew.ts)', () => {
  for (const kt of [15, 18]) for (const tack of ['S', 'P'] as const) for (const n of [2, 1]) {
    it(`${kt} kt, ${tack === 'S' ? 'starboard' : 'port'} tack, ${n === 1 ? 'one crew' : 'two crew'}`, () => {
      const twa = beatAngle(kt), b = testBoat({ heading: tack === 'S' ? 360 - twa : twa, kt: 4, windKt: kt }); b.tack = tack;
      const spec = { helm: DEFAULT_CREW.helm, crew: DEFAULT_CREW.crew.slice(0, n) };
      b.crew = newCrew(spec, tack);
      const cr = buildCrew(spec.helm, spec.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1), bad: string[] = [], w = tack === 'S' ? 1 : -1;
      sail(b, 20);
      for (let i = 0; i < 21 * 30; i++) { sail(b, 1 / 30); syncCrew(cr, w, b.crew, 1 / 30, false, undefined, b.heel, b.tacking);
        if (i < 15 * 30 || i % 15) continue; // (settled first, as crewarms; then twice a second)
        const grips = [...lines(cr, w), extension(cr), ...RAILS];
        for (const [who, f] of [['helm', cr.helm] as const, ...cr.crew.map((g, j) => [`crew${j + 1}`, g] as const)]) {
          for (const h of [0, 1] as const) { const p = fistAt(f as Figure, h), d = Math.min(...grips.map(g => polyDist(p, g)));
            if (d > GRIP * f.scale) bad.push(`${who}'s hand${h} ${(d * 100).toFixed(0)} cm from anything to hold, at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`); }
        }
      }
      expect([...new Set(bad)].slice(0, 8)).toEqual([]);
    }, 120_000);
  }
});
