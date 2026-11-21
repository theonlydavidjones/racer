import * as THREE from 'three';
import { trueDepth } from './trueDepth';
import { DEFAULT_CREW, newCrew } from '../../src/boat/crewPhys';
import { buildCrew, ground, syncCrew, underDeck, type Figure } from '../../src/render/crew';
import { BONE } from '../../src/render/crewBody';
import { COCKPIT, cockpitHalf, halfBeam, uAtZ, L } from '../../src/render/hull';
const COCK0 = -L / 2 + COCKPIT.u0 * L, COCK1 = -L / 2 + COCKPIT.u1 * L, chz = (z: number) => cockpitHalf(uAtZ(z));

/** A stretch of a soak recorded frame by frame (tests/fixtures/crew-*.json): the crew's spec, and each frame the race's
 * clock, the windward side, her heel, whether she's tacking, the crew's clock and roll, and each person's place, pose,
 * lean, goal and job as the physics had them. */
export interface CrewRecording { spec: typeof DEFAULT_CREW; frames: { t: number; w: number; heel: number; tacking?: boolean; clock: number; roll?: unknown; people: Record<string, unknown>[] }[] }

/** The recording seen in a mirror across the centerline: the same moment on the other tack (the boat's the same either
 * side). Each place's and goal's x, the windward side and the heel change sign. */
export function mirrored(rec: CrewRecording): CrewRecording {
  const flip = (p: Record<string, unknown>) => { const goal = p.goal as { x: number; z: number } | undefined; return { ...p, x: -(p.x as number), ...(goal ? { goal: { x: -goal.x, z: goal.z } } : {}) }; };
  return { spec: rec.spec, frames: rec.frames.map(r => ({ ...r, w: -r.w, heel: -r.heel, people: r.people.map(flip) })) };
}

/** Draws the recording's crew frame by frame as the game does (syncCrew), and returns the deepest any bone of any figure
 * goes into the boat (its true depth, crewfig's measure) from `from` (s) on, and where; '' if none deeper than `allow`. */
export function replayDeepest(rec: CrewRecording, from: number, allow = 0.025): string {
  const c = newCrew(rec.spec, 'S'), cr = buildCrew(rec.spec.helm, rec.spec.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1);
  let prev = rec.frames[0]!.t, worst = '', wd = allow;
  const w = (o: THREE.Object3D, y = 0) => o.localToWorld(new THREE.Vector3(0, y, 0));
  for (const [n, r] of rec.frames.entries()) {
    c.clock = r.clock; (c as { roll?: unknown }).roll = r.roll;
    r.people.forEach((p, i) => Object.assign(c.people[i]!, { goal: undefined, job: null, ready: false, outUntil: 0, lean: 0 }, p));
    syncCrew(cr, r.w, c, Math.max(1e-3, r.t - prev), false, undefined, r.heel, !!r.tacking); prev = r.t;
    if (r.t < from) continue;
    for (const [who, f] of [['helm', cr.helm], ...cr.crew.map((f, j) => [`crew${j + 1}`, f] as const)] as const) {
      const fig = f as Figure; fig.root.updateMatrixWorld(true);
      const segs: [string, THREE.Vector3, THREE.Vector3][] = [];
      fig.leg.forEach((l, i) => { segs.push([`thigh${i}`, w(l.root), w(l.mid)], [`shin${i}`, w(l.mid), w(l.mid, -BONE.shin)]); });
      fig.arm.forEach((a, i) => { segs.push([`upper${i}`, w(a.root), w(a.mid)], [`fore${i}`, w(a.mid), w(a.mid, -BONE.fore)]); });
      for (const [name, a, b] of segs) for (let t = 0; t <= 1.0001; t += 0.05) {
        const p = a.clone().lerp(b, t);
        if (Math.abs(p.z) > L / 2 - 0.05 || Math.abs(p.x) > halfBeam(uAtZ(p.z)) - 0.02 || underDeck(p.x, p.y, p.z)) continue;
        const d = trueDepth(p.x, p.y, p.z, 0.025);
        if (d > wd) { wd = d; worst = `${who} ${name} ${(d * 100).toFixed(0)} cm into it at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}), ${r.t.toFixed(2)} s (frame ${n})`; }
      }
    }
  }
  return worst;
}

/** The highest the helm's knees go (m, boat frame) from `from` (s) on, the recording drawn as replayDeepest draws it. */
export function replayHelmKnee(rec: CrewRecording, from: number): number {
  const c = newCrew(rec.spec, rec.frames[0]!.w > 0 ? 'S' : 'P'), cr = buildCrew(rec.spec.helm, rec.spec.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1);
  let prev = rec.frames[0]!.t, top = 0;
  for (const r of rec.frames) {
    c.clock = r.clock; (c as { roll?: unknown }).roll = r.roll;
    r.people.forEach((p, i) => Object.assign(c.people[i]!, { goal: undefined, job: null, ready: false, outUntil: 0, lean: 0 }, p));
    syncCrew(cr, r.w, c, Math.max(1e-3, r.t - prev), false, undefined, r.heel, !!r.tacking); prev = r.t;
    if (r.t < from) continue;
    const f = cr.helm as Figure; f.root.updateMatrixWorld(true);
    for (const l of f.leg) top = Math.max(top, l.mid.getWorldPosition(new THREE.Vector3()).y);
  }
  return top;
}

/** Drawn as replayDeepest draws it, from `from` (s) on: the highest any crew figure's hips are over what's under them
 * while over the cockpit or the companionway's opening (inside the coamings, aft of the cabin's front), not walking (a
 * figure floated across at deck height reads as sat on nothing), and who and when. */
export function replayFloating(rec: CrewRecording, from: number): { up: number; at: string } {
  const c = newCrew(rec.spec, rec.frames[0]!.w > 0 ? 'S' : 'P'), cr = buildCrew(rec.spec.helm, rec.spec.crew, [0xc8372d, 0x2b4f8a, 0xe8b21c], 1);
  let prev = rec.frames[0]!.t, up = 0, at = '';
  for (const r of rec.frames) {
    c.clock = r.clock; (c as { roll?: unknown }).roll = r.roll;
    r.people.forEach((p, i) => Object.assign(c.people[i]!, { goal: undefined, job: null, ready: false, outUntil: 0, lean: 0 }, p));
    syncCrew(cr, r.w, c, Math.max(1e-3, r.t - prev), false, undefined, r.heel, !!r.tacking); prev = r.t;
    if (r.t < from) continue;
    cr.crew.forEach((f, i) => {
      const fig = f as Figure, h = fig.cur!.hip; if (fig.walking || fig.route) return;
      if (!(h.z > COCK0 - 0.35 && h.z < COCK1 && Math.abs(h.x) < chz(Math.max(COCK0 + 0.01, h.z)) - 0.1)) return;
      const d = h.y - ground(h.x, h.z) - 0.55; // (above sitting or kneeling height over what's under them)
      if (d > up) { up = d; at = `crew${i + 1} hips ${d.toFixed(2)} m too high at (${h.x.toFixed(2)}, ${h.y.toFixed(2)}, ${h.z.toFixed(2)}), ${r.t.toFixed(2)} s`; }
    });
  }
  return { up, at };
}
