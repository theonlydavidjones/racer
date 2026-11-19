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

// The sprint's soak (19 Nov 2026), after the true-depth check: the forward hand's legs 5 to 9 cm through the cabin's
// after end (z 0.94 to 1.01) on the way to and back from the cabin-top lines, and a kneeling shin 5 to 7 cm into the
// cockpit sole by them. Here the physics' person walks (0.9 m/s, as crewPhys does) from a seat to each line's station,
// works it 4 s, and walks back to the seat, sat down again: no bone more than crewfig's 2.5 cm into the boat (its true
// depth, tests/helpers/trueDepth), any frame of the trip, from the windward deck and the leeward bench, both tacks.
const LINES = ['vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham', 'jibHalyard'] as const;
function bones(f: Figure, step = 0.05): { name: string; p: THREE.Vector3 }[] {
  f.root.updateMatrixWorld(true);
  const w = (o: THREE.Object3D, y = 0) => o.localToWorld(new THREE.Vector3(0, y, 0)), out: { name: string; p: THREE.Vector3 }[] = [];
  const seg = (name: string, a: THREE.Vector3, b: THREE.Vector3) => { for (let t = 0; t <= 1.0001; t += step) out.push({ name, p: a.clone().lerp(b, t) }); };
  f.leg.forEach((l, i) => { seg(`thigh${i}`, w(l.root), w(l.mid)); seg(`shin${i}`, w(l.mid), w(l.mid, -BONE.shin)); });
  f.arm.forEach((a, i) => { seg(`upper${i}`, w(a.root), w(a.mid)); seg(`fore${i}`, w(a.mid), w(a.mid, -BONE.fore)); });
  return out;
}
describe('To the cabin-top lines and back, clear of the cabin and the sole (render/crew.ts)', () => {
  for (const tack of ['S', 'P'] as const) for (const kt of [8, 20]) it(`${tack === 'S' ? 'starboard' : 'port'} tack, ${kt} kt`, () => {
    const bad: string[] = [], w = tack === 'S' ? 1 : -1, dt = 1 / 30;
    // (the windward side deck at the cockpit's forward end, where the soak's forward hand sat; the leeward bench)
    for (const [seatName, seat] of [['windward deck', { x: 0.78 * w, z: 1.4 }], ['leeward bench', { x: -0.45 * w, z: 1.7 }]] as const) for (const line of LINES) {
      const st = stationFor(line, 2, w, false)!, twa = beatAngle(kt), b = testBoat({ heading: tack === 'S' ? 360 - twa : twa, kt: 4, windKt: kt }); b.tack = tack;
      b.crew = newCrew(DEFAULT_CREW, tack);
      const cr = buildCrew(DEFAULT_CREW.helm, DEFAULT_CREW.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1);
      const to = { x: st.arm * w, z: st.z }, d = Math.hypot(to.x - seat.x, to.z - seat.z), walk = d / 0.9;
      // (sat, 3 s; walking there; at it, 4 s; walking back; sat again, 4 s)
      const T = [3, 3 + walk, 7 + walk, 7 + 2 * walk, 11 + 2 * walk];
      sail(b, 10);
      for (let i = 0, t = 0; t < T[4]!; i++, t = i * dt) {
        sail(b, dt);
        const f = b.crew.people[2]!, there = t >= T[0]! && t < T[2]!;
        const q = t < T[0]! ? 0 : t < T[1]! ? (t - T[0]!) / walk : t < T[2]! ? 1 : t < T[3]! ? 1 - (t - T[2]!) / walk : 0;
        f.x = seat.x + (to.x - seat.x) * q; f.z = seat.z + (to.z - seat.z) * q; f.lean = 0;
        f.pose = there ? st.pose : 'sit'; f.goal = there ? { ...to } : { ...seat };
        f.job = there ? { line, reach: 0, work: 1, station: st } : null;
        syncCrew(cr, w, b.crew, dt, false, undefined, b.heel, b.tacking);
        if (i < 3) continue; // (the figures' first frames, drawn where they're built)
        for (const { name, p } of bones(cr.crew[1] as Figure)) {
          if (Math.abs(p.z) > L / 2 - 0.05 || Math.abs(p.x) > halfBeam(uAtZ(p.z)) - 0.02 || underDeck(p.x, p.y, p.z)) continue;
          const dd = trueDepth(p.x, p.y, p.z, 0.025);
          if (dd > 0.025) bad.push(`${line} from the ${seatName}, ${t < T[1]! ? 'going' : t < T[2]! ? 'at it' : t < T[3]! ? 'back' : 'sat again'}: ${name} ${(dd * 100).toFixed(0)} cm into it at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`);
        }
      }
    }
    // (the deepest of each line's trip and leg of it)
    const firsts = new Map<string, string>(), cm = (s: string) => +(/ (\d+) cm/.exec(s)?.[1] ?? 0);
    for (const s of bad) { const key = s.replace(/: \w+ \d+ cm.*/, ''), o = firsts.get(key); if (!o || cm(s) > cm(o)) firsts.set(key, s); }
    expect([...firsts.values()].slice(0, 20)).toEqual([]);
  }, 300_000);
});

// (and from one cabin-top line straight to the next, as the race calls them: kneeling at the main Cunningham, then the
// jib's, the knee went down 14 cm through the sole as they got up off it, the soak's race at 14 kt)
describe('From one cabin-top line to the next, clear of the sole (render/crew.ts)', () => {
  for (const tack of ['S', 'P'] as const) for (const kt of [8, 20]) it(`${tack === 'S' ? 'starboard' : 'port'} tack, ${kt} kt`, () => {
    const bad = new Map<string, string>(), w = tack === 'S' ? 1 : -1, dt = 1 / 30, cm = (s: string) => +(/ (\d+) cm/.exec(s)?.[1] ?? 0);
    for (const a of LINES) for (const c of LINES) {
      if (a === c) continue;
      const sa = stationFor(a, 2, w, false)!, sc = stationFor(c, 2, w, false)!, twa = beatAngle(kt), b = testBoat({ heading: tack === 'S' ? 360 - twa : twa, kt: 4, windKt: kt }); b.tack = tack;
      b.crew = newCrew(DEFAULT_CREW, tack);
      const cr = buildCrew(DEFAULT_CREW.helm, DEFAULT_CREW.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1);
      const p0 = { x: sa.arm * w, z: sa.z }, p1 = { x: sc.arm * w, z: sc.z }, walk = Math.hypot(p1.x - p0.x, p1.z - p0.z) / 0.9;
      sail(b, 10);
      // (at the first, 4 s; walking to the next; at it, 3 s)
      // (the boat's held as she is: the jobs forced here every frame would work her lines through the physics; only the
      // crew's clock goes on, for their walking)
      for (let i = 0, t = 0; t < 7 + walk; i++, t = i * dt) {
        b.crew.clock = (b.crew.clock ?? 0) + dt;
        const f = b.crew.people[2]!, q = t < 4 ? 0 : Math.min(1, (t - 4) / walk), st = t < 4 ? sa : sc, line = t < 4 ? a : c;
        f.x = p0.x + (p1.x - p0.x) * q; f.z = p0.z + (p1.z - p0.z) * q; f.lean = 0; f.pose = 'piano'; f.goal = t < 4 ? { ...p0 } : { ...p1 };
        f.job = { line, reach: 0, work: 1, station: st };
        syncCrew(cr, w, b.crew, dt, false, undefined, b.heel, b.tacking);
        if (t < 3) continue; // (settled at the first)
        for (const { name, p } of bones(cr.crew[1] as Figure)) {
          if (Math.abs(p.z) > L / 2 - 0.05 || Math.abs(p.x) > halfBeam(uAtZ(p.z)) - 0.02 || underDeck(p.x, p.y, p.z)) continue;
          const dd = trueDepth(p.x, p.y, p.z, 0.025);
          if (dd > 0.025) { const key = `${a} to ${c}`, s = `${key}: ${name} ${(dd * 100).toFixed(0)} cm into it at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}), ${(t - 4).toFixed(1)} s`, o = bad.get(key); if (!o || cm(s) > cm(o)) bad.set(key, s); }
        }
      }
    }
    expect([...bad.values()].slice(0, 20)).toEqual([]);
  }, 300_000);
});
