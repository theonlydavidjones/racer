import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { testBoat, sail, startTack, courseHeading } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { buildCrew, syncCrew, type Crew } from '../src/render/crew';
import { BONE } from '../src/render/crewBody';

// The sprint's soak (Crew Habits, v208; scripts/check/crewsoak): the main hand's elbow out ahead of the arm, 8 to 17 cm
// forward of the line from shoulder to wrist, sitting and hiking upwind and through the tack, where an elbow bends back
// and down (crewfig's elbows(): an elbow hangs back and down, never out ahead). Upwind at 8, 14 and 20 kt, through a tack
// from each side, every frame: crewfig's 6 cm.
const elbowsOf = (cr: Crew) => {
  const out: { who: string; i: number; ahead: number }[] = [];
  for (const [who, f] of [['helm', cr.helm], ...cr.crew.map((f, j) => [`crew${j + 1}`, f] as const)] as const) {
    if (!f.root.visible) continue; f.root.updateMatrixWorld(true);
    const w = (o: THREE.Object3D, x = 0, y = 0, z = 0) => o.localToWorld(new THREE.Vector3(x, y, z));
    const fw = w(f.root, 0, 0, -1).sub(w(f.root)).setY(0);
    f.arm.forEach((a, i) => {
      const sh = w(a.root), el = w(a.mid), wr = w(a.mid, 0, -BONE.fore), line = wr.clone().sub(sh), t = el.clone().sub(sh).dot(line) / line.lengthSq();
      const off = el.clone().sub(sh.clone().addScaledVector(line, t)), ahead = off.dot(fw) / fw.length();
      if (ahead > 0.06 && -off.y < ahead) out.push({ who, i, ahead });
    });
  }
  return out;
};
describe('Elbows bend back and down, upwind and through the tack (render/crew.ts)', () => {
  for (const kt of [8, 14, 20]) for (const start of ['S', 'P'] as const) it(`${kt} kt, from ${start === 'S' ? 'starboard' : 'port'} tack`, () => {
    const twa = beatAngle(kt), hd = start === 'S' ? 360 - twa : twa, b = testBoat({ heading: hd, kt: 4, windKt: kt }); b.tack = start;
    b.crew = newCrew(DEFAULT_CREW, start);
    const cr = buildCrew(DEFAULT_CREW.helm, DEFAULT_CREW.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1), bad: string[] = [];
    let hold = true;
    sail(b, 20, () => { b.h = courseHeading(b, hd); });
    const frames = (secs: number, tag: string) => { for (let i = 0; i < secs * 30; i++) { sail(b, 1 / 30, () => { if (hold && b.turnTarget == null) b.h = courseHeading(b, hd); }); syncCrew(cr, b.rel >= 0 ? 1 : -1, b.crew, 1 / 30, false, undefined, b.heel, b.tacking);
      if (i > 15) for (const e of elbowsOf(cr)) bad.push(`${tag}: ${e.who} arm${e.i} ${(e.ahead * 100).toFixed(0)} cm forward`); } };
    frames(8, 'sailing'); hold = false; startTack(b); frames(16, 'the tack');
    expect([...new Set(bad)].slice(0, 8)).toEqual([]);
  }, 180_000);
});
