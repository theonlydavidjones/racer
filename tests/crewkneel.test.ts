import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { testBoat, sail } from './helpers/testBoat';
import { trueDepth } from './helpers/trueDepth';
import { beatAngle } from '../src/boat/polar';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { stationFor } from '../src/boat/crewWork';
import { buildCrew, syncCrew, underDeck, type Figure } from '../src/render/crew';
import { BONE } from '../src/render/crewBody';
import { halfBeam, uAtZ, L } from '../src/render/hull';

// The sprint's soak (18 Nov 2026): kneeling at the cabin top's lines and at the mast, the forward hand's shin or thigh
// 5 to 7 cm into the cockpit sole near its forward end. Each job from its station (crewWork.ts stationFor), on both tacks,
// in light air and a breeze (she heels): no bone of the one at the job more than crewfig's 2.5 cm into the boat (its true
// depth, tests/helpers/trueDepth), every frame once they're there.
const LINES = ['vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham', 'jibHalyard', 'hoist', 'pole'] as const;
function bones(f: Figure, step = 0.05): { name: string; p: THREE.Vector3 }[] {
  f.root.updateMatrixWorld(true);
  const w = (o: THREE.Object3D, y = 0) => o.localToWorld(new THREE.Vector3(0, y, 0)), out: { name: string; p: THREE.Vector3 }[] = [];
  const seg = (name: string, a: THREE.Vector3, b: THREE.Vector3) => { for (let t = 0; t <= 1.0001; t += step) out.push({ name, p: a.clone().lerp(b, t) }); };
  f.leg.forEach((l, i) => { seg(`thigh${i}`, w(l.root), w(l.mid)); seg(`shin${i}`, w(l.mid), w(l.mid, -BONE.shin)); });
  f.arm.forEach((a, i) => { seg(`upper${i}`, w(a.root), w(a.mid)); seg(`fore${i}`, w(a.mid), w(a.mid, -BONE.fore)); });
  return out;
}
describe('Kneeling at a job, clear of the sole and the cabin (render/crew.ts)', () => {
  for (const tack of ['S', 'P'] as const) for (const kt of [8, 20]) it(`${tack === 'S' ? 'starboard' : 'port'} tack, ${kt} kt`, () => {
    const bad: string[] = [], w = tack === 'S' ? 1 : -1;
    for (const line of LINES) {
      const st = stationFor(line, 2, w, false)!, twa = beatAngle(kt), b = testBoat({ heading: tack === 'S' ? 360 - twa : twa, kt: 4, windKt: kt }); b.tack = tack;
      b.crew = newCrew(DEFAULT_CREW, tack);
      const cr = buildCrew(DEFAULT_CREW.helm, DEFAULT_CREW.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1);
      sail(b, 10);
      for (let i = 0; i < 6 * 30; i++) {
        sail(b, 1 / 30);
        const f = b.crew.people[2]; f.pose = st.pose; f.x = st.arm * w; f.z = st.z; f.goal = { x: f.x, z: f.z }; f.lean = 0;
        f.job = { line, reach: 0, work: 1, station: st };
        syncCrew(cr, w, b.crew, 1 / 30, false, undefined, b.heel, b.tacking);
        if (i < 4 * 30) continue; // (there, settled)
        for (const { name, p } of bones(cr.crew[1] as Figure)) {
          if (Math.abs(p.z) > L / 2 - 0.05 || Math.abs(p.x) > halfBeam(uAtZ(p.z)) - 0.02 || underDeck(p.x, p.y, p.z)) continue;
          const d = trueDepth(p.x, p.y, p.z, 0.025);
          if (d > 0.025) bad.push(`${line}: ${name} ${(d * 100).toFixed(0)} cm into it at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
        }
      }
    }
    expect([...new Set(bad)].slice(0, 10)).toEqual([]);
  }, 240_000);
});

// (and called to the mast from where they sit, as the race calls the pole (crewfig's pole case is starboard tack only):
// before they've reacted, still sat in the cockpit, the mast pose knelt them there with both hands reaching two meters
// forward to the mast through the cabin's after end, 12 cm into it (the sprint's soak). The first 3 s after the call.
// (On the way along the side deck after it, a leg grazes the cabin's after corner 3 to 5 cm: the next fix, not held here.)
describe('Called to the mast, they wait where they sit (render/crew.ts)', () => {
  for (const tack of ['S', 'P'] as const) for (const kt of [8, 14, 20]) it(`the pole, ${tack === 'S' ? 'starboard' : 'port'} tack, ${kt} kt`, () => {
    const bad: string[] = [], twa = 165, b = testBoat({ heading: tack === 'S' ? 360 - twa : twa, kt: 4, windKt: kt }); b.tack = tack;
    b.crew = newCrew(DEFAULT_CREW, tack);
    const cr = buildCrew(DEFAULT_CREW.helm, DEFAULT_CREW.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1);
    sail(b, 10); b.poleWant = true;
    for (let i = 0; i < 3 * 30; i++) {
      sail(b, 1 / 30); syncCrew(cr, b.rel >= 0 ? 1 : -1, b.crew, 1 / 30, false, undefined, b.heel, b.tacking);
      if (i < 3) continue; // (the figures' first frames, drawn where they're built before any pose has eased in: see below)
      for (const [who, fig] of cr.crew.map((f, j) => [`crew${j + 1}`, f as Figure] as const)) for (const { name, p } of bones(fig)) {
        if (Math.abs(p.z) > L / 2 - 0.05 || Math.abs(p.x) > halfBeam(uAtZ(p.z)) - 0.02 || underDeck(p.x, p.y, p.z)) continue;
        const d = trueDepth(p.x, p.y, p.z, 0.025);
        if (d > 0.025) bad.push(`${who} ${name} ${(d * 100).toFixed(0)} cm into it at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}), ${(i / 30).toFixed(1)} s`);
      }
    }
    expect([...new Set(bad)].slice(0, 10)).toEqual([]);
  }, 240_000);
});
