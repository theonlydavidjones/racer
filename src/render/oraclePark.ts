import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import data from './data/oracle-park.json';

/**
 * Oracle Park's static structure (r296): the stands, roofs, facades and the arcade on McCovey Cove, and the field, as the
 * USGS 3DEP lidar's surface (scripts/make-oracle-park.mjs; public domain) kept to the stadium's OpenStreetMap footprint
 * (relation 7330762, © OpenStreetMap contributors) and simplified with a right-triangulated network (a 5 × 5 median first,
 * so the seats' rows and the crowds don't show). The light towers, which the median takes out, stand as slim poles at the
 * lidar's local highs within 12 m of the footprint. Colors: the walls brick, the tops concrete, the field's grass inside
 * the pitch's OSM outline (way 500283910). Nothing here is tied to a game, a season or a schedule.
 */
async function inflate(b64: string): Promise<Uint8Array> {
  const bin = atob(b64), src = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) src[i] = bin.charCodeAt(i);
  return new Uint8Array(await new Response(new Blob([src]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
}
const inside = (poly: number[][], x: number, y: number) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > y) !== (poly[j][1] > y) && x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; };

export async function buildOraclePark(scene: THREE.Object3D): Promise<void> {
  const raw = await inflate(data.mesh), nV = data.vertices, nI = data.triangles * 3, dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const gx = new Uint16Array(nV), gy = new Uint16Array(nV), gz = new Float32Array(nV), idx = new Uint32Array(nI), T = 512;
  for (let v = 0; v < nV; v++) { gx[v] = dv.getUint16(v * 2, true); gy[v] = dv.getUint16(nV * 2 + v * 2, true); gz[v] = dv.getInt16(nV * 4 + v * 2, true) / 100; }
  for (let k = 0, o = nV * 6, last = 0; k < nI; k++, o += 2) { const z = dv.getUint16(o, true); last += z & 1 ? -(z + 1) / 2 : z / 2; idx[k] = last; }
  const pos = new Float32Array(nV * 3);
  for (let v = 0; v < nV; v++) { pos[v * 3] = data.ox + gx[v]; pos[v * 3 + 1] = gz[v]; pos[v * 3 + 2] = -(data.oy + T - gy[v]); } // (grid x east, y south → scene x, z = south, up)
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeVertexNormals();
  const nrm = geo.attributes.normal as THREE.BufferAttribute, col = new Float32Array(nV * 3), c = new THREE.Color();
  const BRICK = new THREE.Color(0x8a4b3a), CONCRETE = new THREE.Color(0xb7b2a6), GRASS = new THREE.Color(0x4f7a43), STEEL = new THREE.Color(0x8c9298);
  for (let v = 0; v < nV; v++) {
    const wall = 1 - nrm.getY(v), x = data.ox + gx[v], y = data.oy + T - gy[v];
    c.copy(CONCRETE).lerp(BRICK, Math.min(1, Math.max(0, (wall - 0.25) * 2.2)));
    if (gz[v] < 8 && wall < 0.2 && inside(data.pitch, x, y)) c.copy(GRASS); // (the field)
    if (gz[v] > 28 && wall < 0.5) c.lerp(STEEL, 0.5); // (the roof structures and the scoreboard)
    col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeBoundingSphere();
  const group = new THREE.Group(); group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  // the light towers: one merged set of slim poles from the ground to the lidar's high
  const poles: THREE.BufferGeometry[] = [];
  for (const [x, y, top] of data.towers as number[][]) { if (top < 45) continue; const g = new THREE.CylinderGeometry(0.7, 1.1, top - 6, 6); g.translate(x, 6 + (top - 6) / 2, -y); g.deleteAttribute('uv'); poles.push(g); }
  if (poles.length) { group.add(new THREE.Mesh(mergeGeometries(poles), new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }))); poles.forEach(g => g.dispose()); }
  scene.add(group);
}
