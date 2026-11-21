import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import data from './data/gg-south.json';

/**
 * The Golden Gate Bridge's San Francisco end: pylons S1 and S2 (two columns each, either side of the roadway, about 4.5 m
 * by 10 m and some 70 m tall, stepping in near the top) and the South Anchorage housing (about 40 by 102 m, up to where the
 * roadway passes over it). Footprints from OpenStreetMap ways 1560010162 to 1560010167 (© OpenStreetMap contributors);
 * heights and the steps from the USGS 3DEP lidar (public domain): each part is a stack of slabs, each the smallest rectangle
 * round the cells that stand that high (scripts/make-gg-south.mjs). The deck, cables and the Fort Point arch are the bridge's
 * own (render/landscape.ts). One merged mesh.
 */
export function addGgSouth(scene: THREE.Object3D, color: number): void {
  const geos: THREE.BufferGeometry[] = [];
  for (const part of data.parts) for (const [i, s] of part.slabs.entries()) {
    const z0 = i ? s.z0 : s.z0 - 2; // (the first slab sunk into the ground)
    const g = new THREE.BoxGeometry(s.w, s.z1 - z0, s.d);
    g.rotateY(s.a); g.translate(s.x, (z0 + s.z1) / 2, -s.y); // (sim x east, y north → scene x, −z; the slab's heading from east is a)
    geos.push(g);
  }
  const merged = mergeGeometries(geos.map(g => { g.deleteAttribute('uv'); return g; })); geos.forEach(g => g.dispose());
  scene.add(new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color })));
}
