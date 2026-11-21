import './three-setup';
import * as THREE from 'three';
import data from './data/fortpoint.json';

/**
 * Fort Point (1853–61), on its measured outline and heights (r296 phase 1b; scripts/make-fortpoint-dsm.mjs and
 * make-fortpoint.mjs: OSM way 370509217 for the footprint, © OpenStreetMap contributors; USGS 3DEP lidar, public domain,
 * for the rock, the courtyard floor, the barbette's roof, the parapet and the light's top). Brick walls rise from the rock
 * to the roof in three tiers of casemates (NPS Historic Structure Report 2006: three casemate tiers and the barbette
 * above, walls 7 ft thick, brick with granite quoins); the courtyard is the open middle the lidar shows. The dark
 * openings are one a bay on each tier: the bay spacing (3.9 m) and the openings' size are ESTIMATES from the photographs
 * (the HABS drawings, CA-1239, would give them), the heights of the tiers an even third of the wall. The light is the
 * 1864 lighthouse on the roof's inner edge (OSM building:part 1358282761), to the lidar's top. Merged into one draw.
 */
type V2 = [number, number];
const BRICK = new THREE.Color(0x9a5a44), ROOF = new THREE.Color(0x6c655d), COURT = new THREE.Color(0xa3977f), DARK = new THREE.Color(0x2b231f);
const WHITE = new THREE.Color(0xe9e4d6), CAP = new THREE.Color(0x33302d);

export function addFortPoint(grp: THREE.Group): void {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [];
  /** A triangle in the sim's frame (x east, y north, z up) as the scene's (x, z, -y). */
  const tri = (a: number[], b: number[], c: number[], color: THREE.Color) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) { pos.push(p[0], p[2], -p[1]); nrm.push(nx, nz, -ny); col.push(color.r, color.g, color.b); }
  };
  const quad = (a: number[], b: number[], c: number[], d: number[], color: THREE.Color) => { tri(a, b, c, color); tri(a, c, d, color); };
  const area = (p: V2[]) => { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return s / 2; }; // (counter-clockwise: negative here)
  const ccw = (p: V2[]) => (area(p) < 0 ? p : p.slice().reverse()); // the outline in counter-clockwise order, closed ring without the repeat
  const open = (p: V2[]) => (p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1] ? p.slice(0, -1) : p);

  const outer = ccw(open(data.ring as V2[])), hole = ccw(data.courtyard as V2[]).slice().reverse(), light = data.light as V2;
  // (the hole runs clockwise: its walls then face into the courtyard)
  const rock = data.rock - 1, roof = data.roof, court = data.court, tier = (roof - data.rock) / 3;

  /** The walls along a ring, facing the side the traversal leaves on its right, with one dark opening a bay on each tier. */
  const walls = (ring: V2[], y0: number, y1: number, opening: { w: number; h: number; pitch: number } | null, tiers: boolean) => {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      if (L < 0.5) continue;
      quad([a[0], a[1], y0], [b[0], b[1], y0], [b[0], b[1], y1], [a[0], a[1], y1], BRICK);
      if (!opening || L < 6) continue;
      const ux = dx / L, uy = dy / L, nx = uy, ny = -ux; // outward from the traversal
      const n = Math.floor((L - 3) / opening.pitch);
      for (let k = 0; k < n; k++) {
        const s = L / 2 + (k - (n - 1) / 2) * opening.pitch;
        for (let t = 0; t < 3; t++) {
          const z0 = data.rock + t * tier + (tier - opening.h) / 2 + (tiers ? 0 : 0), z1 = z0 + opening.h, e = 0.05;
          const p0 = [a[0] + ux * (s - opening.w / 2) + nx * e, a[1] + uy * (s - opening.w / 2) + ny * e], p1 = [a[0] + ux * (s + opening.w / 2) + nx * e, a[1] + uy * (s + opening.w / 2) + ny * e];
          quad([p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z1], [p0[0], p0[1], z1], DARK);
        }
      }
    }
  };
  walls(outer, rock, roof, { w: 1.3, h: 2.4, pitch: 3.9 }, true);
  walls(hole, court, roof, { w: 2.2, h: 3, pitch: 3.9 }, true);

  // the roof (the barbette's level) round the courtyard, and the courtyard's floor
  const flat = (pts: V2[], y: number, color: THREE.Color, faces: number[][]) => {
    for (const [i0, i1, i2] of faces) {
      const t = [pts[i0], pts[i1], pts[i2]];
      const c = (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0]);
      if (c < 0) t.reverse();
      tri([t[0][0], t[0][1], y], [t[1][0], t[1][1], y], [t[2][0], t[2][1], y], color);
    }
  };
  const holeCcw = hole.slice().reverse(), all = [...outer, ...holeCcw];
  flat(all, roof, ROOF, THREE.ShapeUtils.triangulateShape(outer.map(p => new THREE.Vector2(p[0], p[1])), [holeCcw.map(p => new THREE.Vector2(p[0], p[1]))]).map(f => f));
  flat(holeCcw, court + 0.02, COURT, THREE.ShapeUtils.triangulateShape(holeCcw.map(p => new THREE.Vector2(p[0], p[1])), []));

  // the parapet: a 1 m brick wall, 0.9 m thick, along the roof's outer edge (the lidar's band 1 m over the roof)
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i], b = outer[(i + 1) % outer.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 3) continue;
    const nx = -dy / L * 0.9, ny = dx / L * 0.9, y1 = roof + data.parapet; // (inward)
    const a2 = [a[0] + nx, a[1] + ny], b2 = [b[0] + nx, b[1] + ny];
    quad([a[0], a[1], roof], [b[0], b[1], roof], [b[0], b[1], y1], [a[0], a[1], y1], BRICK);
    quad([b2[0], b2[1], roof], [a2[0], a2[1], roof], [a2[0], a2[1], y1], [b2[0], b2[1], y1], BRICK);
    quad([a[0], a[1], y1], [b[0], b[1], y1], [b2[0], b2[1], y1], [a2[0], a2[1], y1], ROOF);
  }

  // the light: a white tower from the roof to the lidar's top, with a dark lantern and cap
  const ring = (r: number, y0: number, y1: number, color: THREE.Color) => {
    const N = 12;
    for (let i = 0; i < N; i++) {
      const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
      const p = (a: number, y: number) => [light[0] + r * Math.cos(a), light[1] + r * Math.sin(a), y];
      quad(p(a0, y0), p(a1, y0), p(a1, y1), p(a0, y1), color);
      tri([light[0], light[1], y1], p(a0, y1), p(a1, y1), color); // (the top)
    }
  };
  ring(1.7, roof, data.lightTop - 2.2, WHITE);
  ring(1.2, data.lightTop - 2.2, data.lightTop, CAP);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  grp.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
}
