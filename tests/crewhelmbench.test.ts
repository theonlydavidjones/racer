import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { testBoat, sail } from './helpers/testBoat';
import { trueDepth } from './helpers/trueDepth';
import { beatAngle } from '../src/boat/polar';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { buildCrew, syncCrew, underDeck, type Figure } from '../src/render/crew';
import { BONE } from '../src/render/crewBody';
import { halfBeam, uAtZ, L } from '../src/render/hull';
import HELM_TACK from './fixtures/crew-helm-tack-14kt.json';

// The sprint's soak (19 Nov 2026): the helm's thigh 5 to 7 cm into the after deck's forward edge, z 2.86 to 3.01, beating
// in a breeze, as the helm went out from sitting toward hiking (the physics' weight from 0.6 m out to 1.1). Here the helm
// at their place (z 2.95) goes out from sitting to hiking flat out and back in, at the race's pace (0.4 m/s), on both tacks
// at 8, 14 and 20 kt: no bone more than crewfig's 2.5 cm into the boat (true depth), any frame.
function bones(f: Figure, step = 0.05): { name: string; p: THREE.Vector3 }[] {
  f.root.updateMatrixWorld(true);
  const w = (o: THREE.Object3D, y = 0) => o.localToWorld(new THREE.Vector3(0, y, 0)), out: { name: string; p: THREE.Vector3 }[] = [];
  const seg = (name: string, a: THREE.Vector3, b: THREE.Vector3) => { for (let t = 0; t <= 1.0001; t += step) out.push({ name, p: a.clone().lerp(b, t) }); };
  f.leg.forEach((l, i) => { seg(`thigh${i}`, w(l.root), w(l.mid)); seg(`shin${i}`, w(l.mid), w(l.mid, -BONE.shin)); });
  f.arm.forEach((a, i) => { seg(`upper${i}`, w(a.root), w(a.mid)); seg(`fore${i}`, w(a.mid), w(a.mid, -BONE.fore)); });
  return out;
}
describe('The helm going out to hike and back, clear of the after deck (render/crew.ts)', () => {
  for (const tack of ['S', 'P'] as const) for (const kt of [8, 14, 20]) it(`${tack === 'S' ? 'starboard' : 'port'} tack, ${kt} kt`, () => {
    const w = tack === 'S' ? 1 : -1, dt = 1 / 30, twa = beatAngle(kt), b = testBoat({ heading: tack === 'S' ? 360 - twa : twa, kt: 4, windKt: kt }); b.tack = tack;
    b.crew = newCrew(DEFAULT_CREW, tack);
    const cr = buildCrew(DEFAULT_CREW.helm, DEFAULT_CREW.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1);
    sail(b, 10); const heel0 = b.heel;
    // (from the other side, across the after deck in the tack as the soak's helm did (1.2 m in 1.2 s, crossing, then
    // steering on the new side), then out to hike, a while, and back in)
    const xa = -0.59, x0 = 0.59, x1 = 1.13, cross = 1.2, go = (x1 - x0) / 0.4, T = 2 + cross + go + 3 + go + 2;
    let worst = '', wd = 0;
    // (the boat held as she is, her heel the breeze's; only the crew's clock goes on)
    for (let i = 0, t = 0; t < T; i++, t = i * dt) {
      b.crew.clock = (b.crew.clock ?? 0) + dt;
      const tc = t - 2 - cross, c = t < 2 ? 0 : Math.min(1, (t - 2) / cross);
      const q = tc < 0 ? 0 : tc < go ? tc / go : tc < 3 + go ? 1 : tc < 3 + 2 * go ? 1 - (tc - 3 - go) / go : 0;
      const hp = b.crew.people[0]!; hp.x = w * (c < 1 ? xa + (x0 - xa) * c : x0 + (x1 - x0) * q); hp.z = 2.95; hp.lean = q; hp.pose = c < 0.5 ? 'cross' : 'helm'; hp.goal = { x: w * (c < 1 ? x0 : q > 0.5 ? x1 : x0), z: 2.95 };
      // (and in the tack her heel goes over from the old side to the new, past it, and back, as the soak's did: −19° to 34°
      // to 21°; the windward side the new one from halfway across)
      const h0 = Math.abs(heel0), heel = w * (t < 2 ? -h0 : tc < 0 ? -h0 + (2.3 * h0) * c : tc < 1.5 ? h0 * (1.3 - 0.3 * tc / 1.5) : h0);
      syncCrew(cr, c < 0.5 ? -w : w, b.crew, dt, false, undefined, heel, t > 2 && tc < 1.5);
      if (i < 3) continue;
      for (const { name, p } of bones(cr.helm)) {
        if (Math.abs(p.z) > L / 2 - 0.05 || Math.abs(p.x) > halfBeam(uAtZ(p.z)) - 0.02 || underDeck(p.x, p.y, p.z)) continue;
        const d = trueDepth(p.x, p.y, p.z, 0.025);
        if (d > wd) { wd = d; worst = `${name} ${(d * 100).toFixed(0)} cm into it at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}), ${t.toFixed(1)} s, across ${c.toFixed(2)}, out ${q.toFixed(2)}`; }
      }
    }
    expect(wd > 0.025 ? worst : '').toBe('');
  }, 120_000);
});

// (and the soak's own tack, replayed: the race at 14 kt, Red, seed 3, 172.5 to 175.5 s, the crew's places, poses, jobs, her
// heel and the windward side each frame as the physics had them (tests/fixtures/crew-helm-tack-14kt.json, recorded from the
// soak's harness). The helm crossed the after deck and sat down on the new side with a foot still up on the deck by the
// hip; the knee swung round under it, through the deck, up to 17 cm, at 174.65 to 174.82 s)
describe('The soak\'s tack at 14 kt, replayed: the helm clear of the after deck (render/crew.ts)', () => {
  it('every figure, every frame', () => {
    const { spec, frames } = HELM_TACK as unknown as { spec: typeof DEFAULT_CREW; frames: { t: number; w: number; heel: number; tacking?: boolean; clock: number; roll?: unknown; people: Record<string, unknown>[] }[] };
    const c = newCrew(spec, 'S'), cr = buildCrew(spec.helm, spec.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1);
    let prev = frames[0]!.t, worst = '', wd = 0;
    for (const [n, r] of frames.entries()) {
      c.clock = r.clock; (c as { roll?: unknown }).roll = r.roll;
      r.people.forEach((p, i) => Object.assign(c.people[i]!, { goal: undefined, job: null, ready: false, outUntil: 0, lean: 0 }, p));
      syncCrew(cr, r.w, c, Math.max(1e-3, r.t - prev), false, undefined, r.heel, !!r.tacking); prev = r.t;
      if (r.t < 173) continue; // (half a second to settle from where the figures are built)
      for (const [who, f] of [['helm', cr.helm], ...cr.crew.map((f, j) => [`crew${j + 1}`, f] as const)] as const) for (const { name, p } of bones(f as Figure)) {
        if (Math.abs(p.z) > L / 2 - 0.05 || Math.abs(p.x) > halfBeam(uAtZ(p.z)) - 0.02 || underDeck(p.x, p.y, p.z)) continue;
        const d = trueDepth(p.x, p.y, p.z, 0.025);
        if (d > wd) { wd = d; worst = `${who} ${name} ${(d * 100).toFixed(0)} cm into it at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}), ${r.t.toFixed(2)} s (frame ${n})`; }
      }
    }
    expect(wd > 0.025 ? worst : '').toBe('');
  }, 120_000);
});
