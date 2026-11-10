import './three-setup';
import * as THREE from 'three';
import { COCKPIT, L, cockpitHalf, deckY, halfBeam, uAtZ } from './hull';

/**
 * The crew: a helm and two crew, as a Folkboat sails. The helm sits on the windward cockpit seat with the tiller;
 * the crew sit on the windward deck with their legs in the cockpit, and lean out as she heels (as hard as the
 * heel model has them hiking). On a tack or gybe they duck across under the boom to the new windward side.
 */

export interface Crew { group: THREE.Group; figs: { root: THREE.Group; torso: THREE.Group; z: number; deck: boolean }[]; side: number }

const SKIN = new THREE.MeshLambertMaterial({ color: 0xc9a07e });
const PANTS = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };

/** One seated sailor: hips at the origin, facing −z (legs forward), torso pivoting at the hips. */
function sailor(jacket: number): { root: THREE.Group; torso: THREE.Group } {
  const root = new THREE.Group(), torso = new THREE.Group(), J = new THREE.MeshLambertMaterial({ color: jacket });
  torso.add(box(0.36, 0.5, 0.22, J, 0, 0.27, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), SKIN); head.position.y = 0.64; torso.add(head);
  torso.add(box(0.2, 0.06, 0.2, new THREE.MeshLambertMaterial({ color: 0x1d2330 }), 0, 0.73, -0.02)); // cap
  for (const s of [-1, 1]) torso.add(box(0.09, 0.42, 0.1, J, s * 0.22, 0.3, -0.08)); // arms
  root.add(torso);
  for (const s of [-1, 1]) { root.add(box(0.13, 0.13, 0.44, PANTS, s * 0.1, 0.02, -0.22)); root.add(box(0.12, 0.42, 0.12, PANTS, s * 0.1, -0.18, -0.44)); } // thighs, shins
  root.traverse(o => { o.castShadow = true; });
  return { root, torso };
}

export function buildCrew(jackets: number[]): Crew {
  const group = new THREE.Group();
  const spots = [{ z: 2.75, deck: false }, { z: 1.55, deck: true }, { z: 0.95, deck: true }]; // helm, crew aft, crew forward
  const figs = spots.map((s, i) => { const f = sailor(jackets[i % jackets.length]); group.add(f.root); return { ...f, z: s.z, deck: s.deck }; });
  return { group, figs, side: 1 };
}

/**
 * Place the crew: `windward` is +1 to starboard, −1 to port; `hike` 0..1 how hard they're hiking; `dt` for the
 * crossing on a tack. `hideHelm` when you're looking through the helm's eyes.
 */
export function syncCrew(c: Crew, windward: number, hike: number, dt: number, hideHelm: boolean): void {
  c.side += (windward - c.side) * Math.min(1, dt * 1.6);
  const s = c.side, sd = Math.sign(s) || 1, crossing = 1 - Math.min(1, Math.abs(s) / 0.7); // mid-tack: crouching low in the middle
  c.figs.forEach((f, i) => {
    const u = uAtZ(f.z);
    if (f.deck) {
      // on the windward deck edge, legs into the cockpit, facing inboard
      const x = s * (halfBeam(u) - 0.18), y = deckY(u, Math.abs(x)) + 0.05;
      f.root.position.set(x, y - 0.25 * crossing, f.z);
      f.root.rotation.y = sd * Math.PI / 2;
      f.torso.rotation.x = (0.15 + 0.75 * hike) * (1 - crossing) - 0.4 * crossing; // lean out to hike; duck forward crossing
    } else {
      // the helm: on the windward seat, facing forward and a little inboard, the tiller in the aft hand
      const x = s * (cockpitHalf(u) - 0.12), y = deckY(u, cockpitHalf(u)) - (COCKPIT.sole * 0.5) + 0.02;
      f.root.position.set(x, y - 0.15 * crossing, f.z);
      f.root.rotation.y = sd * 0.5;
      f.torso.rotation.x = 0.1 + 0.35 * hike * (1 - crossing);
      f.root.visible = !hideHelm;
    }
    void i; void L;
  });
}
