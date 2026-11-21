import './three-setup';
import * as THREE from 'three';
import data from './data/fortpoint.json';

/**
 * Fort Point (1853–61), on its measured outline and heights (r296 phase 1b; scripts/make-fortpoint-dsm.mjs and
 * make-fortpoint.mjs: OSM way 370509217 for the footprint, © OpenStreetMap contributors; USGS 3DEP lidar, public domain,
 * for the rock, the courtyard floor, the barbette's roof, the parapet and the light's top). Brick walls rise from the
 * rock to the roof in three tiers of casemates and the barbette tier above. Its openings and trim are the National Park
 * Service's Historic Structure Report (2006, "Physical Description", pp. 74–77: nps.gov/goga, 2006-fopo-hsr.pdf):
 *   - the gorge (the long landward face): the sallyport, a pair of doors 4'-10" wide by 9'-4" high under a segmental arch,
 *     a little right of centre; at the first tier rifle slits 6 in × 34 in; at the second and third tiers two rows of 23
 *     windows, 2 ft wide by 8 ft high and 2 ft by 7 ft, each with a shallow brick arch and a granite sill; granite coping
 *     and, on the roof, 30 clay chimney pots in 10 sets of three;
 *   - every other face of 8 ft or more: cannon embrasures in three tiers, each opening 32 × 39 in in a 4'-3" × 4'-10" iron
 *     frame; the 13-ft flanks have none;
 *   - the walls: Flemish-bond brick, Folsom granite quoins 36 × 24 × 16 in at the corners, a line of granite dripstones at
 *     30 ft, a Chinese granite foundation. The gorge's walls are 40 ft (12.2 m) high: the lidar's 12.6 m.
 * What the report doesn't give, and is ESTIMATED: where along the long face the gorge ends and the bastion faces begin
 * (the OSM outline doesn't separate them: the 23 windows are centred, 2 embrasures a tier at each end), and the courtyard
 * arcades' openings (2.2 × 3 m every 3.9 m). The light is the 1864 lighthouse on the roof's inner edge (OSM building:part
 * 1358282761), to the lidar's top. Merged into one draw.
 */
type V2 = [number, number];
const BRICK = new THREE.Color(0x9a5a44), ROOF = new THREE.Color(0x6c655d), COURT = new THREE.Color(0xa3977f), DARK = new THREE.Color(0x2b231f);
const WHITE = new THREE.Color(0xe9e4d6), CAP = new THREE.Color(0x33302d), GRANITE = new THREE.Color(0xb9b3a6), FOUND = new THREE.Color(0x6e665c);
const FRAME = new THREE.Color(0x57504a), POT = new THREE.Color(0xa8553a), DOOR = new THREE.Color(0x3a2c22);
const FT = 0.3048, IN = 0.0254;

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
  const rock = data.rock - 1, roof = data.roof, court = data.court, tier = (roof - data.rock) / 3, zt = (t: number) => data.rock + t * tier;

  /** A wall's frame: the point s along edge a→b, at height z, off m out of the wall (outward is to the traversal's right). */
  const frame = (a: V2, b: V2) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = uy, ny = -ux;
    return { L, at: (s: number, z: number, off: number) => [a[0] + ux * s + nx * off, a[1] + uy * s + ny * off, z] };
  };
  /** A rectangle on a wall, s0 to s1 along it and z0 to z1 up, off out. */
  const panel = (f: ReturnType<typeof frame>, s0: number, s1: number, z0: number, z1: number, off: number, color: THREE.Color) =>
    quad(f.at(s0, z0, off), f.at(s1, z0, off), f.at(s1, z1, off), f.at(s0, z1, off), color);
  /** An opening centred at s whose height is up to zTop under a shallow arch (rise m), a fan of the arc. */
  const arched = (f: ReturnType<typeof frame>, s: number, w: number, z0: number, z1: number, rise: number, off: number, color: THREE.Color) => {
    const top = z1 - rise, arc: number[][] = [];
    for (let i = 0; i <= 4; i++) { const u = -1 + i / 2; arc.push(f.at(s + u * w / 2, top + rise * (1 - u * u), off)); } // (left to right)
    const bl = f.at(s - w / 2, z0, off), br = f.at(s + w / 2, z0, off);
    quad(bl, br, arc[4], arc[0], color);
    for (let i = 0; i < 4; i++) tri(arc[i], arc[4], arc[i + 1], color); // (the arc's cap: a fan to the right corner)
  };

  const gorge = outer.reduce((best, a, i) => { const b = outer[(i + 1) % outer.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); return L > best.L ? { i, L } : best; }, { i: -1, L: 40 }).i;
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i], b = outer[(i + 1) % outer.length], f = frame(a, b), L = f.L;
    quad(f.at(0, rock, 0), f.at(L, rock, 0), f.at(L, roof, 0), f.at(0, roof, 0), BRICK);
    if (L < 3) continue;
    panel(f, 0, L, rock, data.rock + 1.4, 0.05, FOUND); // the granite foundation's course
    panel(f, 0, L, data.rock + 30 * FT - 0.1, data.rock + 30 * FT + 0.1, 0.05, GRANITE); // the dripstones at 30 ft
    if (L < 5) continue;
    if (i === gorge) {
      const g0 = Math.max(1.5, (L - 110 * FT) / 2), sally = L * 0.55;
      // the sallyport: a pair of doors 4'-10" wide each, 9'-4" high, under a segmental arch, framed in granite
      arched(f, sally, 2 * 4.83 * FT + 0.7, data.rock - 0.3, data.rock + 9.33 * FT + 0.5, 0.4, 0.04, GRANITE);
      arched(f, sally, 2 * 4.83 * FT, data.rock - 0.3, data.rock + 9.33 * FT, 0.35, 0.08, DOOR);
      // tier 1: rifle slits 6 in × 34 in; tiers 2 and 3: 23 windows each, 2 ft wide, 8 ft and 7 ft high, each on a granite sill
      for (let s = 2.5; s < L - 2; s += 3.2) if (Math.abs(s - sally) > 3) panel(f, s - 3 * IN, s + 3 * IN, zt(0) + 1.6, zt(0) + 1.6 + 34 * IN, 0.07, DARK);
      for (const [t, h] of [[1, 8 * FT], [2, 7 * FT]] as const) for (let k = 0; k < 23; k++) {
        const s = g0 + (k + 0.5) * (110 * FT / 23), z0 = zt(t) + (tier - h) / 2;
        panel(f, s - 0.45, s + 0.45, z0 - 0.12, z0, 0.06, GRANITE); // the sill
        arched(f, s, 2 * FT, z0, z0 + h, 0.1, 0.07, DARK);
      }
      // the bastions' faces at each end: two embrasures a tier
      for (const end of [g0 / 2, L - g0 / 2]) for (let t = 0; t < 3; t++) for (const d of [-0.22, 0.22]) {
        const s = end + d * Math.min(g0, 8), z = zt(t) + tier / 2 + 0.1;
        panel(f, s - 0.65, s + 0.65, z - 0.73, z + 0.73, 0.05, FRAME); panel(f, s - 0.405, s + 0.405, z - 0.5, z + 0.5, 0.07, DARK);
      }
      // the roof's chimney pots: 10 sets of three, just inside the parapet
      for (let g = 0; g < 10; g++) for (let k = -1; k <= 1; k++) {
        const s = L / 2 + (g - 4.5) * 3.3 + k * 0.45, p = f.at(s, roof, -0.45), q = 0.17;
        quad([p[0] - q, p[1] - q, roof], [p[0] + q, p[1] - q, roof], [p[0] + q, p[1] - q, roof + 1.7], [p[0] - q, p[1] - q, roof + 1.7], POT);
        quad([p[0] + q, p[1] - q, roof], [p[0] + q, p[1] + q, roof], [p[0] + q, p[1] + q, roof + 1.7], [p[0] + q, p[1] - q, roof + 1.7], POT);
        quad([p[0] + q, p[1] + q, roof], [p[0] - q, p[1] + q, roof], [p[0] - q, p[1] + q, roof + 1.7], [p[0] + q, p[1] + q, roof + 1.7], POT);
        quad([p[0] - q, p[1] + q, roof], [p[0] - q, p[1] - q, roof], [p[0] - q, p[1] - q, roof + 1.7], [p[0] - q, p[1] + q, roof + 1.7], POT);
        quad([p[0] - q, p[1] - q, roof + 1.7], [p[0] + q, p[1] - q, roof + 1.7], [p[0] + q, p[1] + q, roof + 1.7], [p[0] - q, p[1] + q, roof + 1.7], POT);
      }
    } else if (L >= 8) {
      // the other faces: cannon embrasures in three tiers, 32 × 39 in in a 4'-3" × 4'-10" iron frame, about every 5.5 m
      const n = Math.max(1, Math.round((L - 2) / 5.5));
      for (let k = 0; k < n; k++) for (let t = 0; t < 3; t++) {
        const s = L * (k + 0.5) / n, z = zt(t) + tier / 2 + 0.1;
        panel(f, s - 25.5 * IN, s + 25.5 * IN, z - 29 * IN, z + 29 * IN, 0.05, FRAME);
        panel(f, s - 16 * IN, s + 16 * IN, z - 19.5 * IN, z + 19.5 * IN, 0.07, DARK);
      }
    }
  }
  // the quoins: Folsom granite blocks 36 × 24 × 16 in, stacked in an alternating pattern at each corner between faces of 3 m or more
  for (let i = 0; i < outer.length; i++) {
    const p = outer[(i + outer.length - 1) % outer.length], v = outer[i], n = outer[(i + 1) % outer.length];
    const f1 = frame(p, v), f2 = frame(v, n); if (f1.L < 3 || f2.L < 3) continue;
    for (let c = 0, z = data.rock + 1.4; z < roof - 0.5; c++, z += 32 * IN) { // (every other course drawn: 16 in blocks)
      const l1 = c % 2 ? 36 * IN : 24 * IN, l2 = c % 2 ? 24 * IN : 36 * IN, h = 16 * IN;
      panel(f1, f1.L - l1, f1.L, z, z + h, 0.06, GRANITE); panel(f2, 0, l2, z, z + h, 0.06, GRANITE);
    }
  }
  // the courtyard side: arcades of arched openings, one a bay on each tier (ESTIMATED: 2.2 × 3 m every 3.9 m)
  for (let i = 0; i < hole.length; i++) {
    const a = hole[i], b = hole[(i + 1) % hole.length], f = frame(a, b), L = f.L;
    quad(f.at(0, court, 0), f.at(L, court, 0), f.at(L, roof, 0), f.at(0, roof, 0), BRICK);
    if (L < 6) continue;
    const n = Math.floor((L - 3) / 3.9);
    for (let k = 0; k < n; k++) for (let t = 0; t < 3; t++) {
      const s = L / 2 + (k - (n - 1) / 2) * 3.9, z0 = zt(t) + (tier - 3) / 2 + (t === 0 ? court - data.rock : 0);
      arched(f, s, 2.2, z0, z0 + 3, 0.5, 0.05, DARK);
    }
  }

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

  // the parapet: a 1 m brick wall, 0.9 m thick, along the roof's outer edge (the lidar's band 1 m over the roof), with the
  // gorge's granite coping on top
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i], b = outer[(i + 1) % outer.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 3) continue;
    const nx = -dy / L * 0.9, ny = dx / L * 0.9, y1 = roof + data.parapet; // (inward)
    const a2 = [a[0] + nx, a[1] + ny], b2 = [b[0] + nx, b[1] + ny];
    quad([a[0], a[1], roof], [b[0], b[1], roof], [b[0], b[1], y1], [a[0], a[1], y1], BRICK);
    quad([b2[0], b2[1], roof], [a2[0], a2[1], roof], [a2[0], a2[1], y1], [b2[0], b2[1], y1], BRICK);
    quad([a[0], a[1], y1], [b[0], b[1], y1], [b2[0], b2[1], y1], [a2[0], a2[1], y1], i === gorge ? GRANITE : ROOF);
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
