import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { testBoat, sail, startTack } from './helpers/testBoat';
import { beatAngle } from '../src/boat/polar';
import { DEFAULT_CREW, newCrew, type CrewPlace } from '../src/boat/crewPhys';
import { buildCrew, ground, syncCrew, type Crew, type Figure } from '../src/render/crew';
import { BONE } from '../src/render/crewBody';
import { halfBeam, uAtZ, L } from '../src/render/hull';

/** Points along every bone of a figure (the boat's frame): the hips to the knees and feet, the shoulders to the hands, the spine, the head. */
function bones(f: Figure): { name: string; p: THREE.Vector3 }[] {
  f.root.updateMatrixWorld(true);
  const w = (o: THREE.Object3D, y = 0) => o.localToWorld(new THREE.Vector3(0, y, 0));
  const out: { name: string; p: THREE.Vector3 }[] = [];
  const seg = (name: string, a: THREE.Vector3, b: THREE.Vector3) => { for (let t = 0; t <= 1.0001; t += 0.25) out.push({ name, p: a.clone().lerp(b, t) }); };
  f.leg.forEach((l, i) => { const hip = w(l.root), knee = w(l.mid), ankle = w(l.mid, -BONE.shin); seg(`thigh${i}`, hip, knee); seg(`shin${i}`, knee, ankle); });
  f.arm.forEach((a, i) => { const sh = w(a.root), el = w(a.mid), wr = w(a.mid, -BONE.fore); seg(`upper${i}`, sh, el); seg(`fore${i}`, el, wr); });
  seg('spine', w(f.root), w(f.head)); out.push({ name: 'head', p: w(f.head, 0.12) });
  return out;
}
/** Anything of a person below the surface under it (a little allowance for the bone's own thickness), inside the hull. */
function through(cr: Crew, label: string, bad: string[]): void {
  for (const [who, f] of [['helm', cr.helm], ...cr.crew.map((f, i) => [`crew${i + 1}`, f] as const)] as const) {
    if (!f.root.visible) continue;
    for (const { name, p } of bones(f)) {
      if (Math.abs(p.z) > L / 2 - 0.05 || Math.abs(p.x) > halfBeam(uAtZ(p.z)) - 0.02) continue; // (outboard: hiking out over the side)
      const g = ground(p.x, p.z);
      if (p.y < g - 0.025) bad.push(`${label}: ${who} ${name} ${(g - p.y).toFixed(2)} m into it at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
    }
  }
}

function run(o: { kt: number; twa?: number; place?: CrewPlace; tack?: boolean; secs?: number; n?: number }, label: string): string[] {
  const twa = o.twa ?? beatAngle(o.kt), b = testBoat({ heading: 360 - twa, kt: 4, windKt: o.kt });
  const spec = { helm: DEFAULT_CREW.helm, crew: DEFAULT_CREW.crew.slice(0, o.n ?? 2) };
  b.crew = newCrew(spec, 'S'); if (o.place) b.crew.place = o.place;
  const cr = buildCrew(spec.helm, spec.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1), bad: string[] = [];
  let hold = true;
  sail(b, 20, () => { b.h = 360 - twa; });
  const frames = (secs: number) => { for (let i = 0; i < secs * 30; i++) { sail(b, 1 / 30, () => { if (hold && b.turnTarget == null) b.h = 360 - twa; }); syncCrew(cr, b.tack === 'S' ? 1 : -1, b.crew, 1 / 30, false, undefined, b.heel); through(cr, `${label} ${i}`, bad); } };
  frames(3);
  if (o.tack) { hold = false; startTack(b); frames(o.secs ?? 14); }
  return bad;
}

describe('The crew never pass through the boat (render/crew.ts)', () => {
  const cases: [string, Parameters<typeof run>[0]][] = [
    ['light air, to leeward', { kt: 4 }], ['Mid: on the cockpit sole', { kt: 8, place: { across: 'mid', fore: null } }],
    ['Lee, placed', { kt: 8, place: { across: 'lee', fore: null } }], ['Up, a breeze', { kt: 12 }], ['hiking', { kt: 20 }],
    ['forward, light air', { kt: 6, place: { across: null, fore: 'fwd' } }], ['aft', { kt: 12, place: { across: null, fore: 'aft' } }],
    ['a tack in light air', { kt: 5, tack: true }], ['a tack in a breeze', { kt: 14, tack: true }], ['a tack hiking', { kt: 20, tack: true }],
    ['downwind, light', { kt: 6, twa: 160 }], ['downwind, breeze', { kt: 16, twa: 165 }], ['a gybe', { kt: 12, twa: 160, tack: true }],
    ['two aboard, a tack', { kt: 12, tack: true, n: 1 }], ['alone, a tack', { kt: 10, tack: true, n: 0 }], ['alone, light air', { kt: 4, n: 0 }],
  ];
  for (const [name, o] of cases) it(name, () => { const bad = run(o, name); expect(bad.slice(0, 8)).toEqual([]); });
});
