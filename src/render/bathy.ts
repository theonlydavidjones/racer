import './three-setup';
import * as THREE from 'three';
import data from './data/bathy.json';

/**
 * The sea floor, as a picture: where the owner's bathymetry covers (scripts/make-bathy.mjs: the USGS 1 m Central San
 * Francisco Bay bathymetry DEM, cropped and resampled to 3 m, public domain; metres above NAVD88, shown as scene metres
 * = NAVD88 less 0.969 m, the sea being drawn flat at mid-tide), the shallows show their floor through the water, in the
 * sand and silt colors of their depth. Visual only: nothing here reaches the waves, the current or the boat.
 *   - A depth picture of the area (one byte a 12.5 m cell, 0 unknown, else 1 + 15 × the depth in meters up to 16.9 m)
 *     the water's shader reads: the shallows tint toward the floor and clear.
 *   - A floor mesh under the water over the cells shallower than 17 m, in the same colors.
 * Tiled by area: 1 km tiles, decoded and built when the camera comes within 2.5 km of them (update), so a bigger model
 * of the Bay can come in as more tiles in the same file. Where a tile has no data (-32768) the old sea stays as it was.
 */
const N = data.n, CELL = data.cell, TILE = data.tile, ATLAS = 1024, REACH = 2500, SHALLOW = 17;
const [OX, OY] = data.origin as [number, number];

async function inflate(b64: string): Promise<Uint8Array> {
  const bin = atob(b64), src = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) src[i] = bin.charCodeAt(i);
  return new Uint8Array(await new Response(new Blob([src]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
}

const SAND = new THREE.Color(0xc2b38a), SILT = new THREE.Color(0x72806c), MUD = new THREE.Color(0x3c4d52);
const floorColor = (d: number, c: THREE.Color) => { if (d < 6) c.copy(SAND).lerp(SILT, d / 6); else c.copy(SILT).lerp(MUD, Math.min(1, (d - 6) / 11)); };

export class Bathy {
  readonly group = new THREE.Group();
  /** For the water's material: the depth picture's texture, its origin and its span in meters. */
  readonly uniforms = { uBathy: { value: null as unknown as THREE.DataTexture }, uBathyO: { value: new THREE.Vector2(OX, OY) }, uBathyS: { value: ATLAS * CELL } };
  private img = new Uint8Array(ATLAS * ATLAS * 2); // (red: the depth; green: 255 where the floor mesh stands over the cell)
  private done = new Set<string>();
  private last = '';
  private floorMat = new THREE.MeshLambertMaterial({ vertexColors: true });

  constructor(scene: THREE.Object3D) {
    const t = new THREE.DataTexture(this.img, ATLAS, ATLAS, THREE.RGFormat, THREE.UnsignedByteType);
    t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; this.uniforms.uBathy.value = t;
    scene.add(this.group);
  }

  /** The camera's place in course meters: load the tiles within reach of it, once, when it moves to a new tile. */
  update(x: number, y: number): void {
    const k = `${Math.floor(x / TILE)},${Math.floor(y / TILE)}`; if (k === this.last) return; this.last = k;
    for (const t of data.tiles) {
      const id = `${t.ix},${t.iy}`;
      if (this.done.has(id)) continue;
      if (Math.hypot((t.ix + 0.5) * TILE - x, (t.iy + 0.5) * TILE - y) > REACH + TILE * 0.71) continue;
      this.done.add(id); void this.load(t);
    }
  }

  private async load(t: { ix: number; iy: number; b64: string }): Promise<void> {
    const raw = await inflate(t.b64), h = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2); // (scene cm; -32768 unknown)
    const ai = Math.round((t.ix * TILE - OX) / CELL), aj = Math.round((t.iy * TILE - OY) / CELL);
    if (ai < 0 || aj < 0 || ai + N > ATLAS || aj + N > ATLAS) return; // (beyond this atlas: more tiles want a bigger one)
    // the floor: a vertex at each cell corner, at the mean of the known cells round it; a quad where all four are known,
    // the floor is under 17 m somewhere on it and wholly under water (the land is the terrain's)
    const V = N + 1, cz = new Float32Array(V * V).fill(NaN);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      let s = 0, n = 0;
      for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const ci = i + di, cj = j + dj; if (ci < 0 || cj < 0 || ci >= N || cj >= N) continue; const v = h[cj * N + ci]; if (v !== -32768) { s += v / 100; n++; } }
      if (n) cz[j * V + i] = s / n;
    }
    const pos: number[] = [], col: number[] = [], c = new THREE.Color();
    const vert = (i: number, j: number) => {
      const z = cz[j * V + i]; pos.push(t.ix * TILE + i * CELL, z, -(t.iy * TILE + j * CELL)); // (sim x east, y north → scene x, -z)
      floorColor(Math.max(0, -z), c); col.push(c.r, c.g, c.b);
    };
    const has = new Uint8Array(N * N), idx: number[] = []; let nv = 0; const at = new Map<number, number>();
    const get = (i: number, j: number) => { const k = j * V + i; let v = at.get(k); if (v === undefined) { v = nv++; at.set(k, v); vert(i, j); } return v; };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const zs = [cz[j * V + i], cz[j * V + i + 1], cz[(j + 1) * V + i], cz[(j + 1) * V + i + 1]];
      if (zs.some(Number.isNaN) || Math.max(...zs) > -0.1 || Math.min(...zs) < -SHALLOW) continue;
      has[j * N + i] = 1;
      const a = get(i, j), b = get(i + 1, j), d = get(i, j + 1), e = get(i + 1, j + 1);
      idx.push(a, b, e, a, e, d); // (counter-clockwise from above: x east, scene z = -y north, so +j runs to -z)
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = h[j * N + i], o = ((aj + j) * ATLAS + ai + i) * 2;
      this.img[o] = v === -32768 ? 0 : Math.min(255, 1 + Math.round(Math.max(0, -v / 100) * 15)); this.img[o + 1] = has[j * N + i] ? 255 : 0;
    }
    this.uniforms.uBathy.value.needsUpdate = true;
    if (!idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.floorMat); m.frustumCulled = true; this.group.add(m);
  }
}

export const BATHY_DECL = 'uniform sampler2D uBathy; uniform vec2 uBathyO; uniform float uBathyS;\n';
/** The water's fragment: where the depth is known and shallow, tint toward the floor's colors and clear (alpha), so the floor shows through. */
export const BATHY_FRAGMENT = `
  vec2 buv = (vWaveP - uBathyO) / uBathyS;
  if (buv.x > 0.0 && buv.y > 0.0 && buv.x < 1.0 && buv.y < 1.0) {
    vec2 bt = texture2D(uBathy, buv).rg;
    float bv = bt.r * 255.0;
    float bd = max(bv - 1.0, 0.0) / 15.0;
    float known = smoothstep(0.9, 1.0, bt.g); // (no floor mesh over the cell, or beside a hole: no clearing, or the sky would show through)
    float sh = smoothstep(0.5, 1.0, bv) * (1.0 - smoothstep(1.0, 9.0, bd));
    // (the Bay's water is turbid: the floor shows through only in the first few meters, and not in the last 70 cm, where the floor mesh stops short of the shore)
    float clear = known * smoothstep(0.7, 1.4, bd) * (1.0 - smoothstep(1.8, 5.0, bd));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.47, 0.40), sh * 0.5);
    diffuseColor.a *= 1.0 - 0.75 * clear;
  }
`;
