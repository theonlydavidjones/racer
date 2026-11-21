import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import data from './data/alcatraz-extras.json';

/**
 * Alcatraz's walls and ferry dock (r296; scripts/make-alcatraz-extras.mjs): the retaining walls and walls on the island's
 * terraces and shore, from OpenStreetMap's barrier=wall and barrier=retaining_wall ways (© OpenStreetMap contributors), each segment a
 * slab 0.6 m thick from the lidar's lowest return along it to its 90th-percentile height (USGS 3DEP lidar, public domain); and the
 * dock, the Alcatraz Ferry Terminal's outline (way 27999864) and the pier way 27609572 (a 3 m wide strip, the width an ESTIMATE), up to the
 * lidar's deck height (about 2.6 to 2.9 m above the drawn sea; the returns include the boats and people on it). Two merged meshes.
 */
export function addAlcatrazExtras(grp: THREE.Group): void {
  const wall = new THREE.MeshLambertMaterial({ color: 0xaaa392 }), deck = new THREE.MeshLambertMaterial({ color: 0x9a9588 });
  const slabs: THREE.BufferGeometry[] = [];
  for (const w of data.walls) for (const s of w.segs) {
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L = Math.hypot(dx, dy), h = s.top - s.foot + 0.5; if (L < 0.3 || h < 0.3) continue;
    const g = new THREE.BoxGeometry(L, h, 0.6); g.rotateY(Math.atan2(dy, dx)); g.translate((s.a[0] + s.b[0]) / 2, s.foot - 0.5 + h / 2, -(s.a[1] + s.b[1]) / 2);
    g.deleteAttribute('uv'); slabs.push(g);
  }
  if (slabs.length) grp.add(new THREE.Mesh(mergeGeometries(slabs), wall)); slabs.forEach(g => g.dispose());
  const decks: THREE.BufferGeometry[] = [];
  for (const d of data.docks) {
    if (d.top === null || d.name === 'Cistern') continue;
    let g: THREE.BufferGeometry;
    if (d.closed) {
      const sh = new THREE.Shape(); d.ring.forEach((p, i) => i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1]));
      g = new THREE.ExtrudeGeometry(sh, { depth: d.top + 1.5, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, -1.5, 0); // (sim y north → scene -z)
    } else {
      const a = d.ring[0], b = d.ring[1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      g = new THREE.BoxGeometry(L, d.top + 1.5, 3); g.rotateY(Math.atan2(dy, dx)); g.translate((a[0] + b[0]) / 2, (d.top - 1.5) / 2, -(a[1] + b[1]) / 2);
    }
    g.deleteAttribute('uv'); if (g.index) g = g.toNonIndexed(); decks.push(g);
  }
  if (decks.length) grp.add(new THREE.Mesh(mergeGeometries(decks), deck));
}
