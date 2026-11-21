import './three-setup';
import * as THREE from 'three';
import data from './data/palace.json';

/**
 * The Palace of Fine Arts (1915, rebuilt 1964–65), at its real scale from OpenStreetMap and the lidar
 * (scripts/make-palace.mjs: OSM ways 288371295, 288371306, 288371310, 288371313 and 288371314, © OpenStreetMap contributors;
 * USGS 3DEP lidar CA_SanFrancisco_1_B23, public domain):
 *   - the rotunda: the dome and drum are a lathe of the lidar's highest return at each metre of radius round the
 *     complex's centre (the dome's top 50.7 m above the sea; OSM gives the temple 48 m), the low ring of pergolas and
 *     stairs round it the OSM outline of the whole complex, 15 m high (the lidar's 12 to 17 m beyond 27 m radius);
 *   - the two curved colonnades and their end pavilions: their OSM outlines to the lidar's 23.4 m (OSM's heights, 19 to
 *     21 m, are low by the cornice), with a dark bay on every outline edge of 2.2 m or more that faces the rotunda (the
 *     arcade side; the bay spacing is the outline's own, the bays' height an ESTIMATE);
 *   - the lagoon: the lidar's water-class cells, as rows of 4 m cells with gaps of 12 m or less closed, at the surface the lidar gives (0.8 m), lifted just over the
 *     old terrain wherever the terrain's 50 m grid stands higher.
 * The dome's salmon color and the stone's are from photographs (NHL nomination, 1977). One merged mesh.
 */
const STONE = new THREE.Color(0xcaa682), DOME = new THREE.Color(0xb9775a), DARK = new THREE.Color(0x3b3029), WATER = new THREE.Color(0x3f6c78), LOW = new THREE.Color(0xb59a78);
type V2 = [number, number];

export function addPalace(scene: THREE.Object3D, groundAt: (x: number, y: number) => number): void {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [];
  const tri = (a: number[], b: number[], c: number[], color: THREE.Color) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) { pos.push(p[0], p[2], -p[1]); nrm.push(nx, nz, -ny); col.push(color.r, color.g, color.b); }
  };
  const quad = (a: number[], b: number[], c: number[], d: number[], color: THREE.Color) => { tri(a, b, c, color); tri(a, c, d, color); };
  const area = (p: V2[]) => { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return s / 2; };
  const ccw = (p: V2[]) => (area(p) < 0 ? p : p.slice().reverse()); // (counter-clockwise here is a negative sum)
  const ground = data.ground;
  const cx = data.centre[0], cy = data.centre[1];

  /** A prism over an outline from y0 to y1; the top triangulated; walls facing out. Returns the walls' edges for trimming. */
  const prism = (ring: V2[], y0: number, y1: number, color: THREE.Color, bays: boolean) => {
    const p = ccw(ring.slice());
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L < 0.05) continue;
      quad([a[0], a[1], y0], [b[0], b[1], y0], [b[0], b[1], y1], [a[0], a[1], y1], color);
      if (!bays || L < 2.2) continue;
      // the arcade side: the edges whose outward normal (to the right of the traversal) points toward the rotunda
      const nx = dy / L, ny = -dx / L, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if ((cx - mx) * nx + (cy - my) * ny <= 0) continue;
      const e = 0.06, u0 = L * 0.18, u1 = L * 0.82, z0 = y0 + (y1 - y0) * 0.12, z1 = y0 + (y1 - y0) * 0.78, ux = dx / L, uy = dy / L;
      quad([a[0] + ux * u0 + nx * e, a[1] + uy * u0 + ny * e, z0], [a[0] + ux * u1 + nx * e, a[1] + uy * u1 + ny * e, z0], [a[0] + ux * u1 + nx * e, a[1] + uy * u1 + ny * e, z1], [a[0] + ux * u0 + nx * e, a[1] + uy * u0 + ny * e, z1], DARK);
    }
    const faces = THREE.ShapeUtils.triangulateShape(p.map(q => new THREE.Vector2(q[0], q[1])), []);
    for (const [i0, i1, i2] of faces) {
      const t = [p[i0], p[i1], p[i2]];
      if ((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]) < 0) t.reverse();
      tri([t[0][0], t[0][1], y1], [t[1][0], t[1][1], y1], [t[2][0], t[2][1], y1], color);
    }
  };

  for (const part of data.parts) {
    const ring = part.ring as V2[];
    if (part.name === 'rotunda') prism(ring, ground - 2, ground + 15, LOW, false); // the low ring of pergolas and stairs round the rotunda
    else prism(ring, ground - 2, part.lidarTop ?? 23.4, STONE, part.name.startsWith('colonnade'));
  }

  // the rotunda's dome and drum: a lathe of the lidar's profile out to 27 m (the segments are the octagon of columns' 8 times 3)
  const prof = (data.profile as [number, number][]).filter(([r]) => r <= 27);
  const SEG = 24, rows: [number, number][] = [[27, ground - 2], ...prof.slice().reverse().map(([r, h]) => [r, h] as [number, number])]; // (outside in, bottom to the crown)
  for (let k = 0; k < SEG; k++) {
    const a0 = k / SEG * Math.PI * 2, a1 = (k + 1) / SEG * Math.PI * 2;
    for (let i = 0; i < rows.length - 1; i++) {
      const [r0, h0] = rows[i], [r1, h1] = rows[i + 1];
      const p = (r: number, h: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a), h];
      const color = r1 < 17 ? DOME : STONE;
      tri(p(r0, h0, a0), p(r0, h0, a1), p(r1, h1, a1), color); tri(p(r0, h0, a0), p(r1, h1, a1), p(r1, h1, a0), color);
    }
  }

  // the lagoon: runs of 4 m cells at the lidar's water level, lifted just over the old terrain's grid where that stands higher
  for (const [y, xa, xb] of data.lagoon.runs as [number, number, number][]) {
    const lv = Math.max(data.lagoon.level, groundAt((xa + xb) / 2, y) + 0.1);
    quad([xa, y - 4, lv], [xb, y - 4, lv], [xb, y + 4, lv], [xa, y + 4, lv], WATER); // (8 m deep: a row and its neighbors, the water returns being sparse)
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
}
