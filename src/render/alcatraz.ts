import './three-setup';
import * as THREE from 'three';
import data from './data/alcatraz.json';

/**
 * Alcatraz's ground from the USGS 3DEP 1 m lidar DEM (scripts/make-alcatraz.mjs; public domain): the island's real
 * cliffs, terraces and shoreline, simplified to a triangle mesh with the cliffs kept and the flat ground and the sea
 * floor in a few big triangles. Heights are above the drawn water (the DEM's NAVD88 less 0.969 m, mean sea level).
 */
export interface Alcatraz {
  mesh: THREE.Mesh;
  /** Height (m above the water) of the island's ground at a point in course coordinates; −6 over water, null outside the DEM's 1 km square. */
  heightAt(x: number, y: number): number | null;
}

const P = data.place, GRID = data.grid, CELL = 2; // (a 2 m raster of the mesh, for finding the ground under a building)

async function inflate(b64: string): Promise<Uint8Array> {
  const bin = atob(b64), src = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) src[i] = bin.charCodeAt(i);
  const stream = new Blob([src]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Course coordinates of the DEM's grid point (i, j): i east from E 550,300 and j south from N 4,187,300, in metres. */
const toCourse = (i: number, j: number) => { const e = i + 0.5, n = 1000 - (j + 0.5); return { x: P.ox + e * P.exx + n * P.nxx, y: P.oy + e * P.exy + n * P.nxy }; };

export async function buildAlcatraz(scene: THREE.Scene): Promise<Alcatraz> {
  const raw = await inflate(data.mesh), nV = data.vertices, nI = data.triangles * 3, dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const gx = new Uint16Array(nV), gy = new Uint16Array(nV), gz = new Float32Array(nV), idx = new Uint32Array(nI);
  for (let v = 0; v < nV; v++) { gx[v] = dv.getUint16(v * 2, true); gy[v] = dv.getUint16(nV * 2 + v * 2, true); gz[v] = dv.getInt16(nV * 4 + v * 2, true) / 100; }
  for (let k = 0, o = nV * 6, last = 0; k < nI; k++, o += 2) { const z = dv.getUint16(o, true); last += z & 1 ? -(z + 1) / 2 : z / 2; idx[k] = last; }
  const pos = new Float32Array(nV * 3);
  for (let v = 0; v < nV; v++) { const c = toCourse(gx[v], gy[v]); pos[v * 3] = c.x; pos[v * 3 + 1] = gz[v]; pos[v * 3 + 2] = -c.y; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeVertexNormals();
  // colour: grey rock and concrete, the cliffs darker, the gardens' scrub on the flatter ground in patches
  const nrm = geo.attributes.normal as THREE.BufferAttribute, col = new Float32Array(nV * 3), c = new THREE.Color();
  const stone = new THREE.Color('#8f8d86'), rock = new THREE.Color('#7b715f'), scrub = new THREE.Color('#68754a'), wet = new THREE.Color('#5d574d');
  for (let v = 0; v < nV; v++) {
    const h = gz[v], slope = 1 - nrm.getY(v), s = Math.sin(gx[v] * 0.071) * Math.sin(gy[v] * 0.053) + Math.sin(gx[v] * 0.19 + gy[v] * 0.13) * 0.5; // (a patchy pattern, not noise)
    c.copy(stone).lerp(scrub, h > 4 && slope < 0.3 ? Math.min(1, Math.max(0, 0.5 + s)) * 0.8 : 0);
    if (slope > 0.3) c.lerp(rock, Math.min(1, (slope - 0.3) * 3));
    if (h < 1.2) c.lerp(wet, Math.min(1, (1.2 - h) / 1.2)); // (the splash zone)
    col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })); mesh.matrixAutoUpdate = false;
  scene.add(mesh);

  // a raster of the heights (2 m cells), by filling each triangle, for standing things on the ground
  const R = GRID / CELL | 0, H = new Float32Array(R * R).fill(-6);
  for (let t = 0; t < nI; t += 3) {
    const a = idx[t], b = idx[t + 1], d = idx[t + 2];
    const x0 = Math.max(0, Math.floor(Math.min(gx[a], gx[b], gx[d]) / CELL)), x1 = Math.min(R - 1, Math.ceil(Math.max(gx[a], gx[b], gx[d]) / CELL));
    const y0 = Math.max(0, Math.floor(Math.min(gy[a], gy[b], gy[d]) / CELL)), y1 = Math.min(R - 1, Math.ceil(Math.max(gy[a], gy[b], gy[d]) / CELL));
    const den = (gy[b] - gy[d]) * (gx[a] - gx[d]) + (gx[d] - gx[b]) * (gy[a] - gy[d]);
    if (!den) continue;
    for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
      const px = i * CELL, py = j * CELL, l1 = ((gy[b] - gy[d]) * (px - gx[d]) + (gx[d] - gx[b]) * (py - gy[d])) / den, l2 = ((gy[d] - gy[a]) * (px - gx[d]) + (gx[a] - gx[d]) * (py - gy[d])) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      H[j * R + i] = l1 * gz[a] + l2 * gz[b] + l3 * gz[d];
    }
  }
  // course → grid: invert the affine (e, n) → (x, y)
  const det = P.exx * P.nxy - P.nxx * P.exy;
  const heightAt = (x: number, y: number) => {
    const dx = x - P.ox, dy = y - P.oy, e = (dx * P.nxy - P.nxx * dy) / det, n = (P.exx * dy - P.exy * dx) / det;
    const fi = e / CELL - 0.25, fj = (1000 - n) / CELL - 0.25, i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i >= R - 1 || j >= R - 1) return null;
    const u = fi - i, w = fj - j, at = (p: number, q: number) => H[q * R + p];
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - w) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * w;
  };
  return { mesh, heightAt };
}

/** Is a point in latitude/longitude within the DEM's square (with its margin)? Used to clear the old island's cells. */
export const inAlcatrazSquare = (lat: number, lon: number) => lat > 37.822 && lat < 37.831 && lon > -122.429 && lon < -122.416;
