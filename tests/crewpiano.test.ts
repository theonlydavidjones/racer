import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { testBoat, sail } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { stationFor } from '../src/boat/crewWork';
import { buildCrew, fistAt, pianoTail, pianoTailHeld, PIANO_ORDER, syncCrew, type Figure } from '../src/render/crew';

// The owner, 18 Nov 2026: "we just did all that work ... and bro is still holding an invisible line"
// (reference/owner-bugs/2026-11-18-invisible-line.png): a crew at the cabin top's lines had both fists out in the air a
// hand's width from every tail, aimed at the far side's cleats out of their reach. Now both fists close on the tail of the
// line they're working (crewPhys.ts Job.line), as it's drawn (boatMesh.ts, from crew.ts pianoTail), kneeling at the
// cockpit's forward end or leaning in from the side deck, for every line on the piano, on both tacks.
const GRIP = 0.035; // (the fist's middle within 3.5 cm of the line as drawn: a gloved fist closed round it, crewgrip's, ESTIMATE)
const segDist = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()))); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
const polyDist = (p: THREE.Vector3, pts: THREE.Vector3[]) => { let d = Infinity; for (let i = 0; i + 1 < pts.length; i++) d = Math.min(d, segDist(p, pts[i], pts[i + 1])); return d; };
const LINES = ['vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham', 'jibHalyard'] as const;
/** The tail a line's worked from by someone on side `s`: their own side's, if it's on both. */
function tailOf(line: string, s: number): THREE.Vector3[] {
  const own = (s > 0 ? PIANO_ORDER.S : PIANO_ORDER.P) as readonly string[], j = own.indexOf(line);
  if (j >= 0) return pianoTail(s > 0 ? 1 : -1, j);
  return pianoTail(s > 0 ? -1 : 1, ((s > 0 ? PIANO_ORDER.P : PIANO_ORDER.S) as readonly string[]).indexOf(line));
}

describe('At the cabin top\'s lines, both fists on the line being worked (render/crew.ts crewPose \'piano\')', () => {
  // (each line from where the physics puts whoever works it: crewWork.ts stationFor, the forward hand's and the helm's
  // alone; and a dual-ended line from the side deck, where a crew sat out there works it)
  for (const tack of ['S', 'P'] as const) for (const [who, where] of [[2, 'the forward hand at their station'], [2, 'from the side deck'], [0, 'the helm alone']] as const) {
    it(`${tack === 'S' ? 'starboard' : 'port'} tack, ${where}`, () => {
      const bad: string[] = [], w = tack === 'S' ? 1 : -1;
      for (const line of LINES) {
        if (where === 'from the side deck' && !['vang', 'outhaul', 'jibCunningham'].includes(line)) continue;
        const st = stationFor(line, who, w, false)!, arm = where === 'from the side deck' ? 0.7 : st.arm;
        const twa = beatAngle(12), b = testBoat({ heading: tack === 'S' ? 360 - twa : twa, kt: 4, windKt: 12 }); b.tack = tack;
        b.crew = newCrew(DEFAULT_CREW, tack);
        const cr = buildCrew(DEFAULT_CREW.helm, DEFAULT_CREW.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1);
        sail(b, 10);
        for (let i = 0; i < 5 * 30; i++) {
          sail(b, 1 / 30);
          const f = b.crew.people[who]; f.pose = 'piano'; f.x = arm * w; f.z = st.z; f.goal = { x: f.x, z: f.z }; f.lean = 0;
          f.job = { line, reach: 0, work: 1, station: st };
          syncCrew(cr, w, b.crew, 1 / 30, false, undefined, b.heel, b.tacking);
          if (i < 3 * 30) continue; // (settled there first: shuffled over to it on their knees)
          const fig = (who === 0 ? cr.helm : cr.crew[who - 1]) as Figure, s = Math.sign(fig.cur!.hip.x) || w, rest = tailOf(line, s);
          // (the tail as drawn: pulled to the fists of whoever has it in hand, boatMesh.ts by Crew.pianoHold)
          const ph = cr.pianoHold, mine = !!ph && pianoTail(ph.side, ph.i)[0].distanceTo(rest[0]) < 1e-6, tl = mine ? pianoTailHeld(ph!.side, ph!.i, ph!.fists) : rest;
          if (!mine) bad.push(`${line} (arm ${arm}): not in hand`);
          // (every fist on the tail or braced on the edge; and on a line on their own side, at least one on the tail)
          let onLine = 0;
          // (or, a hand with no line in reach, resting on a thigh: within 9 cm of the thigh's line, the fist on its top)
          fig.root.updateWorldMatrix(true, true);
          const thighs = fig.leg.map(l => [l.root.getWorldPosition(new THREE.Vector3()), l.mid.getWorldPosition(new THREE.Vector3())].map(v => fig.root.parent ? fig.root.parent.worldToLocal(v) : v));
          for (const h of [0, 1] as const) { const q = fistAt(fig, h), dl = polyDist(q, tl); if (dl <= GRIP * fig.scale) { onLine++; continue; }
            const dt = Math.min(...thighs.map(t => polyDist(q, t)));
            if (dt > 0.09 * fig.scale) bad.push(`${line} (arm ${arm}): hand${h} ${(dl * 100).toFixed(1)} cm from its tail, ${(dt * 100).toFixed(1)} from a thigh`); }
          if (Math.sign(rest[0].x) === s && onLine === 0) bad.push(`${line} (arm ${arm}): neither hand on its tail, on their own side`);
        }
      }
      expect([...new Set(bad)].slice(0, 8)).toEqual([]);
    }, 180_000);
  }
});
