import './three-setup';
import * as THREE from 'three';
import { D2R, KT, type Vec } from '../core/math';
import { LL } from '../geo/geo';
import type { Wind } from '../environment/wind';

/**
 * Boats at anchor and on moorings: Richardson Bay off Sausalito (the anchorage), Belvedere Cove and Clipper Cove at
 * Treasure Island. Each lies to the balance of two pulls: the current on her keel and hull below the water, and the
 * wind on her topsides and rig above it. Water is about 840 times denser than air, so a knot of current outweighs a
 * strong breeze: they point into the current unless it's slack, which is how sailors read the current from moored
 * boats. Positions within the anchorages are made up; the anchorages are real.
 */

const RHO_W = 1025, RHO_A = 1.225;
interface Moored { p: Vec; g: THREE.Group; h: number; under: number; above: number }

const FIELDS: { lat: number; lon: number; r: number; n: number; seed: number }[] = [
  { lat: 37.8655, lon: -122.4815, r: 420, n: 34, seed: 1 }, // Richardson Bay anchorage, off Sausalito
  { lat: 37.8705, lon: -122.4655, r: 160, n: 12, seed: 2 }, // Belvedere Cove
  { lat: 37.8195, lon: -122.3705, r: 150, n: 14, seed: 3 } // Clipper Cove, between Yerba Buena and Treasure Island
];

function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

/** A small cruising boat at rest: hull, cabin and mast, sails furled. Bow toward −z. */
export function boat(len: number, r: () => number): THREE.Group {
  const g = new THREE.Group(), hullCol = [0xf3f1ea, 0xeae7df, 0x1f3550, 0x8a2a24, 0xdedcd3][Math.floor(r() * 5)];
  const shape = new THREE.Shape(); const B = len * 0.17;
  shape.moveTo(0, -len / 2); shape.quadraticCurveTo(B, -len * 0.2, B * 0.85, len / 2); shape.lineTo(-B * 0.85, len / 2); shape.quadraticCurveTo(-B, -len * 0.2, 0, -len / 2);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: len * 0.11, bevelEnabled: false }), new THREE.MeshLambertMaterial({ color: hullCol }));
  hull.rotation.x = Math.PI / 2; hull.position.y = len * 0.11 - 0.05; g.add(hull);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(B * 1.1, len * 0.06, len * 0.32), new THREE.MeshLambertMaterial({ color: 0xece8de })); cab.position.set(0, len * 0.14, len * 0.02); g.add(cab);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, len * 1.35, 5), new THREE.MeshLambertMaterial({ color: 0xc9ced3 })); mast.position.set(0, len * 0.11 + len * 0.67, -len * 0.12); g.add(mast);
  const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, len * 0.36, 6), new THREE.MeshLambertMaterial({ color: 0x1f4f7a })); cover.rotation.x = Math.PI / 2; cover.position.set(0, len * 0.11 + 0.9, len * 0.08); g.add(cover); // the main, furled under its cover
  return g;
}

export class Moorings {
  private boats: Moored[] = [];
  private acc = 99;
  constructor(scene: THREE.Scene, isWater: (p: Vec) => boolean) {
    for (const f of FIELDS) {
      const r = rng(f.seed), c = LL(f.lat, f.lon);
      for (let i = 0, tries = 0; i < f.n && tries < f.n * 10; tries++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * f.r, p = { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d };
        if (!isWater(p) || this.boats.some(b => Math.hypot(b.p.x - p.x, b.p.y - p.y) < 22)) continue;
        const len = 7 + r() * 7, g = boat(len, r);
        g.position.set(p.x, 0, -p.y); scene.add(g);
        // lateral areas: below the water (hull and keel) and above it (topsides, cabin, mast and furled sail)
        this.boats.push({ p, g, h: r() * 360, under: len * 0.9, above: len * 1.1 });
        i++;
      }
    }
  }

  /**
   * Swing each boat to lie where the current's drag below and the wind's drag above balance (she points into the
   * resultant, the way the two forces stream her back from her anchor). `cur`, `wind` at a point; `dt` in s.
   */
  update(dt: number, cur: (p: Vec) => Vec, wind: (p: Vec) => Wind, sea: (p: Vec) => number): void {
    this.acc += dt;
    const refresh = this.acc > 2; if (refresh) this.acc = 0;
    for (const b of this.boats) {
      if (refresh) {
        const c = cur(b.p), w = wind(b.p), ws = w.kt * KT, wu = { x: -Math.sin(w.from * D2R), y: -Math.cos(w.from * D2R) }; // the wind blows toward wu
        const cs = Math.hypot(c.x, c.y);
        // drag ∝ density × area × speed²: the boat streams downstream of the anchor; her bow points back up the resultant
        const fx = RHO_W * b.under * cs * c.x + RHO_A * b.above * ws * ws * wu.x, fy = RHO_W * b.under * cs * c.y + RHO_A * b.above * ws * ws * wu.y;
        if (Math.hypot(fx, fy) > 1e-3) (b as Moored & { want?: number }).want = (Math.atan2(-fx, -fy) / D2R + 360) % 360;
      }
      const want = (b as Moored & { want?: number }).want ?? b.h, d = ((want - b.h + 540) % 360) - 180;
      b.h += d * Math.min(1, dt * 0.15); // boats swing slowly on their rodes
      b.g.rotation.y = -b.h * D2R;
      b.g.position.y = sea(b.p) * 0.8;
    }
  }
}
