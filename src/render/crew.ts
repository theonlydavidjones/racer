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
 * Place and pose the crew from the crew physics: each person where their weight is (crewPhys.ts: across, fore and aft,
 * how hard they're leaning out) and doing what their job is (crewWork.ts: at a winch, the cabin-top lines, the jib car,
 * the mast). `windward` +1 when the wind is over the starboard side; `c` the crew state (null: a default);
 * `hideHelm` when you're looking through the helm's eyes; `dt` for smoothing.
 */
export function syncCrew(cr: Crew, windward: number, c: CrewState | undefined, dt: number, hideHelm: boolean): void {
  void dt;
  const ppl = c?.people;
  cr.crew.forEach((f, i) => {
    const a = ppl?.[i + 1];
    const x = a ? a.x : windward * 0.8, z = a ? a.z : 1.2 + 0.6 * i, lean = a?.lean ?? 0, pose = a?.pose ?? 'sit';
    const side = Math.abs(x) > 0.05 ? Math.sign(x) : windward, u = uAtZ(z);
    if (pose === 'mast') {
      // kneeling on the cabin top by the mast (the pole, a halyard)
      const zz = Math.max(z, -1.0), uu = uAtZ(zz);
      f.root.position.set(side * 0.22, cabinTopY(uu) + 0.02, zz); f.root.rotation.set(0, 0, 0);
      seat(f, { lean: -0.25, kneel: true, arms: [1.9, 0.6], elbows: 0.4 });
      f.root.visible = true; return;
    }
    if (pose === 'car') {
      // kneeling on the side deck beside the cabin, reaching in to the car on its track
      const px = side * Math.min(halfBeam(u) - 0.18, Math.max(CABIN.w + 0.12, Math.abs(x)));
      f.root.position.set(px, deckY(u, Math.abs(px)) + 0.02, z); f.root.rotation.set(0, side * Math.PI / 2, 0);
      seat(f, { lean: -0.45, kneel: true, arms: [1.3, 1.1], elbows: 0.5 });
      f.root.visible = true; return;
    }
    // in the cockpit (crossing, to leeward, at a winch, at the lines on the cabin's after end) or up on the side deck
    const zc = Math.max(z, -L / 2 + COCKPIT.u0 * L + 0.12), uc = uAtZ(zc), ch = cockpitHalf(uc);
    const onDeck = Math.abs(x) > ch + 0.05 && pose !== 'cross' && pose !== 'piano';
    let px: number, py: number;
    if (onDeck) {
      // on the windward deck: sitting on it, or hiking with the hips over the edge (CR 13.20: legs stay inboard)
      px = side * Math.min(halfBeam(uc) - 0.08, Math.max(ch + 0.12, halfBeam(uc) - 0.2 + 0.14 * lean));
      py = deckY(uc, Math.abs(px)) + 0.04;
    } else {
      px = side * Math.min(ch - 0.1, Math.abs(x));
      py = deckY(uc, ch) - COCKPIT.sole * 0.45 - (pose === 'cross' ? 0.15 : 0);
    }
    const face = pose === 'piano' ? 0 : pose === 'winch' ? -side * Math.PI / 2 : side * Math.PI / 2; // facing inboard (the winch: facing it, outboard; the cabin-top lines: forward)
    f.root.position.set(px, py, zc); f.root.rotation.set(0, face, 0);
    if (pose === 'cross') seat(f, { lean: -0.7, thigh: 1.9, knee: 2.0, arms: [0.9, 0.9] }); // ducking across under the boom
    else if (pose === 'hike' || (onDeck && lean > 0.05)) seat(f, { lean: 0.15 + 0.8 * lean, thigh: 1.5 - 0.2 * lean, knee: 1.35 - 0.45 * lean, spread: 0.18, arms: [0.5, 0.35], elbows: 1.3 }); // feet braced on the seat, leaning out
    else if (pose === 'winch') seat(f, { lean: -0.35, thigh: 1.45, knee: 1.6, arms: [1.4, 1.2], elbows: 0.6 }); // cranking
    else if (pose === 'piano') seat(f, { lean: -0.3, kneel: true, arms: [1.5, 1.3], elbows: 0.5 }); // kneeling, hands on the lines
    else if (pose === 'lee') seat(f, { lean: -0.3, thigh: 1.45, knee: 1.55, arms: [0.9, 0.9], elbows: 1.5 }); // elbows on knees, watching the jib
    else seat(f, { lean: 0.05, arms: [0.5, 0.4], elbows: 1.1 });
    f.root.visible = true;
  });
  // the helm: aft in the cockpit, at the tiller, on the side the physics has them (to leeward in light air)
  const hp = ppl?.[0], hz = 2.7, hu = uAtZ(hz), hch = cockpitHalf(hu);
  const hxw = hp ? hp.x : windward * 0.55, hside = Math.abs(hxw) > 0.05 ? Math.sign(hxw) : windward;
  cr.helmSide = hside;
  const helmAway = hp && hp.pose === 'piano'; // single-handed, gone forward to the cabin-top lines
  const hzz = helmAway ? Math.max(hp!.z, -L / 2 + COCKPIT.u0 * L + 0.12) : hz, huu = uAtZ(hzz);
  const hx = hside * Math.min(cockpitHalf(huu) - 0.1, helmAway ? Math.abs(hxw) : hch - 0.14 + 0.12 * (hp?.lean ?? 0));
  const h = cr.helm, hy = deckY(huu, cockpitHalf(huu)) - COCKPIT.sole * 0.45 + 0.02;
  h.root.position.set(hx, hy, hzz); h.root.rotation.set(0, helmAway ? 0 : hside * 0.55, 0);
  if (helmAway) seat(h, { lean: -0.3, kneel: true, arms: [1.5, 1.3], elbows: 0.5 });
  else seat(h, { lean: 0.05 + 0.4 * (hp?.lean ?? 0), thigh: 1.35, knee: 1.4, arms: [-0.6, 0.6], elbows: 0.4 }); // aft arm back to the tiller
  h.root.visible = !hideHelm;
}

/**
 * Pushing off: the bow crew member standing on the finger beside her (the shrouds), leaning in with both hands on her
 * and walking her back; then, as her bow comes level with the end of the finger, a jump across onto her side deck.
 * `p.side` +1 starboard / −1 port, `p.lat` m out to the finger's middle, `p.jump` 0 … 1; `dockY` the finger's top
 * above her waterline, `deckY` her side deck's, `t` s for the walking.
 */
export function dockhand(cr: Crew, p: { side: number; lat: number; jump: number }, dockY: number, deckY: number, t: number): void {
  const f = cr.crew[cr.crew.length - 1]; if (!f) return;
  const stand = 0.93 * f.scale, z = -0.55, xDock = p.side * Math.max(1.4, p.lat - 0.35), xDeck = p.side * 0.78;
  const face = p.side * Math.PI / 2; // facing the boat
  if (p.jump <= 0) {
    const step = Math.sin(t * 5.5) * 0.35; // walking her back, hands on the shroud and the rail
    f.root.position.set(xDock, dockY + stand, z); f.root.rotation.set(0, face, 0);
    seat(f, { lean: 0.35, thigh: 0.05, knee: 0.1, spread: 0.06, arms: [1.25, 1.05], elbows: 0.25 });
    f.leg[0].root.rotation.x = step; f.leg[1].root.rotation.x = -step; f.leg[0].mid.rotation.x = -Math.max(0, -step) * 0.6; f.leg[1].mid.rotation.x = -Math.max(0, step) * 0.6;
  } else {
    // across: up off the dock, over the gap and down onto the side deck, knees tucked, then crouching to land
    const k = Math.min(1, p.jump), e = k * k * (3 - 2 * k), arc = Math.sin(Math.PI * k) * 0.55;
    f.root.position.set(xDock + (xDeck - xDock) * e, dockY + stand + (deckY + 0.55 - dockY - stand) * e + arc, z);
    f.root.rotation.set(0, face, 0);
    seat(f, { lean: 0.3 + 0.3 * Math.sin(Math.PI * k), thigh: 0.6 + 0.9 * Math.sin(Math.PI * k), knee: 0.8 + 0.7 * Math.sin(Math.PI * k), arms: [1.6, 1.6], elbows: 0.4 });
  }
  f.root.visible = true;
}
