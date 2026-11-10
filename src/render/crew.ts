import './three-setup';
import * as THREE from 'three';
import type { CrewState, Person } from '../boat/crewPhys';
import { CABIN, COCKPIT, L, cabinTopY, cockpitHalf, deckY, halfBeam, uAtZ } from './hull';

/**
 * The people aboard, drawn as people: a jointed figure for each (pelvis, torso, head, arms with elbows and hands,
 * legs with knees and feet), sized to their height and build, in spray tops and life jackets. Where they sit and
 * how they're posed comes from the crew physics (crewPhys.ts): to leeward and forward in light air, up on the
 * windward deck in a breeze, hiking as hard as the boat needs, the pole hand kneeling at the mast downwind, ducking
 * across under the boom on a tack. The helm sits at the tiller, to windward (to leeward in light air, to watch the jib).
 */

interface Limb { root: THREE.Group; mid: THREE.Group }
export interface Figure {
  root: THREE.Group; torso: THREE.Group; head: THREE.Group;
  arm: [Limb, Limb]; leg: [Limb, Limb]; scale: number;
}
export interface Crew { group: THREE.Group; helm: Figure; crew: Figure[]; helmSide: number; side: number }

const SKINS = [0xe0b99a, 0xc99b78, 0x9c6b4c, 0x6e4a33, 0xf0cfb4];
const mat = (c: number, shine = 0) => shine ? new THREE.MeshPhongMaterial({ color: c, shininess: shine, specular: 0x333333 }) : new THREE.MeshLambertMaterial({ color: c });
const cap = (r: number, len: number, m: THREE.Material, y: number) => { const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m); o.position.y = y; o.castShadow = true; return o; };

/** A jointed sailor. Origin at the hips; facing −z; limbs hang straight down until posed. */
function figure(p: Person, jacket: number, seed: number): Figure {
  const s = p.h / 1.75, girth = Math.max(0.85, Math.min(1.35, Math.sqrt(p.w / (p.h * p.h) / 24))); // build from BMI
  const skin = mat(SKINS[seed % SKINS.length]), J = mat(jacket, 30), PFD = mat(seed % 2 ? 0x1c2733 : 0xd8432e, 20), pants = mat(0x2a2e36), boots = mat(0x1b1d20, 40);
  const root = new THREE.Group(); root.scale.setScalar(s);
  // pelvis and torso, a little tapered, with the life jacket over the spray top
  const pelvis = cap(0.13 * girth, 0.14, pants, 0.02); pelvis.rotation.z = Math.PI / 2; root.add(pelvis);
  const torso = new THREE.Group(); root.add(torso);
  const chest = cap(0.15 * girth, 0.3, J, 0.27); chest.scale.set(1.05, 1, 0.75); torso.add(chest);
  const vest = cap(0.16 * girth, 0.2, PFD, 0.31); vest.scale.set(1.08, 1, 0.82); torso.add(vest);
  // head: neck, skull, a cap with a peak
  const head = new THREE.Group(); head.position.y = 0.56; torso.add(head);
  head.add(cap(0.05, 0.05, skin, 0.0));
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 10), skin); skull.scale.set(0.92, 1.08, 1); skull.position.y = 0.12; head.add(skull);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(seed % 3 ? 0x1d2330 : 0xe8e4d8)); hat.position.y = 0.16; head.add(hat);
  const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.012, 12, 1, false, -Math.PI / 2, Math.PI), hat.material); peak.position.set(0, 0.165, -0.06); peak.scale.set(1, 1, 1.1); head.add(peak);
  // arms: shoulder → upper arm → elbow → forearm → hand
  const arm = ([-1, 1] as const).map(sx => {
    const root2 = new THREE.Group(); root2.position.set(sx * 0.2 * girth, 0.46, 0); torso.add(root2);
    root2.add(cap(0.052 * girth, 0.2, J, -0.14));
    const mid = new THREE.Group(); mid.position.y = -0.29; root2.add(mid);
    mid.add(cap(0.045, 0.19, J, -0.13));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), skin); hand.position.y = -0.28; hand.scale.set(0.8, 1.1, 0.6); mid.add(hand);
    return { root: root2, mid };
  }) as [Limb, Limb];
  // legs: hip → thigh → knee → shin → foot
  const leg = ([-1, 1] as const).map(sx => {
    const root2 = new THREE.Group(); root2.position.set(sx * 0.1, 0, 0); root.add(root2);
    root2.add(cap(0.075 * girth, 0.3, pants, -0.21));
    const mid = new THREE.Group(); mid.position.y = -0.44; root2.add(mid);
    mid.add(cap(0.06, 0.32, pants, -0.21));
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.26), boots); foot.position.set(0, -0.44, -0.07); mid.add(foot);
    return { root: root2, mid };
  }) as [Limb, Limb];
  root.traverse(o => { o.castShadow = true; });
  return { root, torso, head, arm, leg, scale: s };
}

export function buildCrew(helm: Person, people: Person[], jackets: number[], seed: number): Crew {
  const group = new THREE.Group();
  const h = figure(helm, jackets[0], seed); group.add(h.root);
  const crew = people.map((p, i) => { const f = figure(p, jackets[(i + 1) % jackets.length], seed + i + 1); group.add(f.root); return f; });
  return { group, helm: h, crew, helmSide: 1, side: 1 };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
/**
 * Pose. The figure faces −z, so +x rotation tips things backward: `lean` (+ back) tips the torso, `thigh` raises the
 * thighs forward (π/2: level, as when seated), `knee` folds the shins back under, `arms` raise the arms forward
 * (− reaches back), `elbows` bend the forearms up.
 */
function seat(f: Figure, o: { lean: number; side?: number; thigh?: number; knee?: number; spread?: number; arms?: [number, number]; elbows?: number; kneel?: boolean }): void {
  f.torso.rotation.set(o.lean, 0, o.side ?? 0);
  f.head.rotation.x = -o.lean * 0.6; // keep looking at the sails
  for (const [i, l] of f.leg.entries()) {
    if (o.kneel) { l.root.rotation.set(0.25, 0, (i ? -1 : 1) * 0.12); l.mid.rotation.set(-1.75, 0, 0); continue; }
    l.root.rotation.set(o.thigh ?? 1.45, 0, (i ? 1 : -1) * (o.spread ?? 0.12));
    l.mid.rotation.set(-(o.knee ?? 1.5), 0, 0);
  }
  const arms = o.arms ?? [0.5, 0.5];
  f.arm.forEach((a, i) => { a.root.rotation.set(arms[i], 0, (i ? 1 : -1) * 0.15); a.mid.rotation.set(o.elbows ?? 0.9, 0, 0); });
}

/**
 * Place and pose the crew from the crew physics. `windward` +1 when the wind is over the starboard side; `c` the
 * crew state (null: a default); `hideHelm` when you're looking through the helm's eyes; `dt` for smoothing.
 */
export function syncCrew(cr: Crew, windward: number, c: CrewState | undefined, dt: number, hideHelm: boolean): void {
  const mode = c?.mode ?? 'windward', hike = c?.hike ?? 0, fore = c?.fore ?? 0.4;
  // where the weight is across the boat, from the physics: −1 to leeward … +1 on the windward rail (beyond 1: hiking)
  const sit = 0.95, armN = c ? c.arm / sit : 1;
  const x = windward * Math.max(-1, Math.min(1, armN)), crossing = Math.abs(armN) < 0.35 && mode !== 'downwind' && mode !== 'foredeck';
  // the crew
  cr.crew.forEach((f, i) => {
    let z = lerp(1.75, 0.15, fore) - i * 0.62, u = uAtZ(z), px: number, py: number, face: number;
    if (mode === 'foredeck' && i === 0) {
      // the pole hand: kneeling on the cabin top by the mast
      z = -0.95; u = uAtZ(z); px = windward * 0.22; py = cabinTopY(u) + 0.02; face = 0;
      f.root.position.set(px, py, z); f.root.rotation.set(0, face, 0);
      seat(f, { lean: -0.25, kneel: true, arms: [1.9, 0.6], elbows: 0.4 });
      f.root.visible = true; return;
    }
    if (mode === 'foredeck' || mode === 'downwind') z = lerp(1.2, 0.5, fore) - i * 0.5;
    // in the cockpit: between its forward end and the helm; up on the rail: anywhere along the side deck abreast the cabin
    const inCockpit = Math.abs(x) < 0.7, zFwd = -L / 2 + COCKPIT.u0 * L + 0.32, zAft = 2.7 - 0.55 - 0.5 * i;
    z = inCockpit ? Math.min(zAft, Math.max(zFwd, z)) : Math.min(zAft, Math.max(-L / 2 + CABIN.u0 * L, z)); u = uAtZ(z);
    const edge = halfBeam(u) - (mode === 'hike' ? 0.06 + 0.08 * (1 - hike) : 0.16);
    px = x * edge * (inCockpit ? 0.85 : 1);
    py = inCockpit ? deckY(u, cockpitHalf(u)) - COCKPIT.sole * 0.45 : deckY(u, Math.abs(px)) + 0.04;
    face = (px >= 0 ? 1 : -1) * Math.PI / 2; // facing inboard
    f.root.position.set(px, py - (crossing ? 0.15 : 0), z); f.root.rotation.set(0, face, 0);
    if (crossing) seat(f, { lean: -0.7, thigh: 1.9, knee: 2.0, arms: [0.9, 0.9] }); // ducking across under the boom
    else if (mode === 'hike') seat(f, { lean: 0.15 + 0.8 * hike, thigh: 1.5 - 0.2 * hike, knee: 1.35 - 0.45 * hike, spread: 0.18, arms: [0.5, 0.35], elbows: 1.3 }); // feet under the toe straps, leaning out
    else if (mode === 'leeward') seat(f, { lean: -0.3, thigh: 1.45, knee: 1.55, arms: [0.9, 0.9], elbows: 1.5 }); // elbows on knees, watching the jib
    else seat(f, { lean: 0.05, arms: [0.5, 0.4], elbows: 1.1 });
    f.root.visible = true;
  });
  // the helm: aft in the cockpit, at the tiller; to leeward in light air, otherwise to windward (crossing on a tack)
  const want = mode === 'leeward' ? -windward : windward * (crossing ? Math.sign(armN) || 1 : 1);
  cr.helmSide += (want - cr.helmSide) * Math.min(1, dt * 1.4);
  const hz = 2.7, hu = uAtZ(hz), hx = cr.helmSide * (cockpitHalf(hu) - 0.14);
  const h = cr.helm, hy = deckY(hu, cockpitHalf(hu)) - COCKPIT.sole * 0.45 + 0.02;
  h.root.position.set(hx, hy, hz); h.root.rotation.set(0, (hx >= 0 ? 1 : -1) * 0.55, 0);
  seat(h, { lean: mode === 'hike' ? 0.15 + 0.3 * hike : 0.05, thigh: 1.35, knee: 1.4, arms: [-0.6, 0.6], elbows: 0.4 }); // aft arm back to the tiller
  h.root.visible = !hideHelm;
}
