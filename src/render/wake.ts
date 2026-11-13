import './three-setup';
import * as THREE from 'three';
import type { Boat } from '../boat/boat';
import { D2R } from '../core/math';
import { NIGHT } from './night';
import { L as HULL_L, hullHalfAt } from './hull';

/**
 * Wakes, bow waves and spray, sized by boat speed. Each boat leaves a trail: a turbulent strip of foam behind the
 * stern that widens and fades over 15 s or so, and the two arms of the Kelvin wave pattern spreading at about 19.5°
 * either side of her track (the angle is the same for every boat at any speed: it's a property of deep-water
 * waves). A bow wave curls off the stem, bigger as she approaches hull speed, and in a chop she throws spray when
 * her bow comes down into a wave.
 *
 * All of it is water, lit by the scene like the sea itself: the foam white by day and dim at night, the bow wave a
 * raised ridge of sea-coloured water with broken white only at its crest, the spray droplets catching the light (and
 * after dark only her own: the bicolour's green and red on the bow).
 */
const G = 9.81, MAXDROPS = 60;
/** The sea's colour (scene.ts, the water's material), for the bow wave's unbroken water. */
const SEA = new THREE.Color(0x3b6d84), FOAM = new THREE.Color(0xf2f5f6), TMP_C = new THREE.Color();
/** The bicolour's colours as they fall on spray (navLights.ts). */
const GREEN = new THREE.Color(0.1, 1.0, 0.6), RED = new THREE.Color(1.0, 0.12, 0.1);
/** The bow wave's ridge: samples along each arm, and across it. */
const NS = 10, NT = 5;

const KELVIN = Math.tan(19.47 * D2R);

interface Trail { pts: { x: number; y: number; v: number; t: number }[]; acc: number; mesh: THREE.Mesh; bow: THREE.Mesh; spray: THREE.InstancedMesh; drops: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; r: number }[]; lastPitch: number }

let foamTex: THREE.CanvasTexture | null = null;
function foam(): THREE.CanvasTexture {
  if (foamTex) return foamTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0)'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 900; i++) { const x = Math.random() * 64, y = Math.random() * 256, r = 0.6 + Math.random() * 2.2; g.fillStyle = `rgba(255,255,255,${(0.35 + Math.random() * 0.6).toFixed(2)})`; g.beginPath(); g.ellipse(x, y, r, r * (1 + Math.random() * 2), 0, 0, Math.PI * 2); g.fill(); }
  foamTex = new THREE.CanvasTexture(c); foamTex.wrapS = foamTex.wrapT = THREE.RepeatWrapping;
  return foamTex;
}

/** Anything that leaves a wake: a boat, or a ship. */
export interface Mover { x: number; y: number; h: number; v: number; rel: number; sea?: { hsW: number } }

export class Wakes {
  private trails: Trail[] = [];
  private SAMPLE: number; private N: number; private scale: number; private HALF: number;
  /** `sample` s between trail points, `n` points; `scale` widens the wash and bow wave (ships); `len` the hull length. */
  constructor(private scene: THREE.Scene, opt: { sample?: number; n?: number; scale?: number; len?: number } = {}) {
    this.SAMPLE = opt.sample ?? 0.15; this.N = opt.n ?? 110; this.scale = opt.scale ?? 1; this.HALF = (opt.len ?? 7.64) / 2;
  }

  reset(boats: readonly Mover[] | readonly Boat[]): void {
    const N = this.N;
    for (const t of this.trails) { this.scene.remove(t.mesh, t.bow, t.spray); t.mesh.geometry.dispose(); }
    this.trails = boats.map(() => {
      // three strips (centre wash and the two Kelvin arms), N samples × 2 edges each
      const geo = new THREE.BufferGeometry(), nv = 3 * N * 2;
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nv * 4), 4));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
      const idx: number[] = [];
      for (let s = 0; s < 3; s++) for (let i = 0; i < N - 1; i++) { const a = (s * N + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geo.setIndex(idx);
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); // lying on the water
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: foam(), vertexColors: true, transparent: true, depthWrite: false }));
      mesh.frustumCulled = false; mesh.renderOrder = 2; this.scene.add(mesh);
      // the bow wave: a ridge of water along each side from the stem (rebuilt each frame on the sea; see update)
      const bg = new THREE.BufferGeometry(), nb = 2 * (NS + 1) * NT, bi: number[] = [];
      bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nb * 3), 3));
      bg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nb * 3), 3));
      bg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nb * 4), 4));
      for (let side = 0; side < 2; side++) for (let i = 0; i < NS; i++) for (let j = 0; j < NT - 1; j++) {
        const a = (side * (NS + 1) + i) * NT + j, b = a + 1, c = a + NT, d = c + 1; bi.push(a, c, b, b, c, d);
      }
      bg.setIndex(bi);
      const bow = new THREE.Mesh(bg, new THREE.MeshPhongMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, specular: 0x8a8a80, shininess: 140 }));
      bow.frustumCulled = false; bow.renderOrder = 2; this.scene.add(bow);
      // spray: droplets, lit by the scene; after dark each also takes the colour of her own light that falls on it
      const spray = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), sprayMaterial(), MAXDROPS);
      spray.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      spray.geometry.setAttribute('aGlow', new THREE.InstancedBufferAttribute(new Float32Array(MAXDROPS * 3), 3).setUsage(THREE.DynamicDrawUsage));
      spray.count = 0; spray.frustumCulled = false; this.scene.add(spray);
      return { pts: [], acc: 0, mesh, bow, spray, drops: [], lastPitch: 0 };
    });
  }

  /** Show or hide the wakes (a ship that isn't out now). */
  show(on: boolean): void { for (const t of this.trails) t.mesh.visible = t.bow.visible = t.spray.visible = on; }

  /** `t` race time (s), `dt` frame time; `sea(x, y)` the water height there; `pitch` each boat's pitch now (rad, bow up). */
  update(boats: readonly (Mover | Boat)[], t: number, dt: number, sea: (x: number, y: number) => number, pitch: number[]): void {
    const N = this.N, SAMPLE = this.SAMPLE, HALF = this.HALF, sc = this.scale;
    (boats as Mover[]).forEach((b, k) => {
      const tr = this.trails[k]; if (!tr) return;
      const u = { x: Math.sin(b.h * D2R), y: Math.cos(b.h * D2R) }, stern = { x: b.x - u.x * HALF, y: b.y - u.y * HALF };
      tr.acc += dt;
      if (tr.acc >= SAMPLE || !tr.pts.length) { tr.acc = 0; tr.pts.unshift({ x: stern.x, y: stern.y, v: b.v, t }); if (tr.pts.length > N) tr.pts.pop(); }
      else { tr.pts[0].x = stern.x; tr.pts[0].y = stern.y; tr.pts[0].v = b.v; } // the newest point rides with the stern
      const geo = tr.mesh.geometry, P = geo.attributes.position.array as Float32Array, C = geo.attributes.color.array as Float32Array, UV = geo.attributes.uv.array as Float32Array;
      const n = tr.pts.length;
      for (let s = 0; s < 3; s++) for (let i = 0; i < N; i++) {
        const p = tr.pts[Math.min(i, n - 1)], q = tr.pts[Math.min(i + 1, n - 1)] ?? p, age = Math.max(0, t - p.t);
        let dx = p.x - q.x, dy = p.y - q.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; // along the track (forward)
        const nx = dy, ny = -dx; // to starboard of the track
        const spd = Math.min(1, p.v / 3);
        let off = 0, half: number, alpha: number;
        if (s === 0) { half = (0.6 + age * 0.18) * sc; alpha = spd * 0.8 * Math.exp(-age / (7 * Math.sqrt(sc))); } // the turbulent wash behind the stern
        else { off = (s === 1 ? 1 : -1) * Math.min(14 * sc * sc, p.v * age * KELVIN); half = (0.18 + age * 0.03) * sc; alpha = spd * spd * 0.55 * Math.exp(-age / (5 * sc)) * Math.min(1, age * 2); } // the Kelvin arms
        if (i >= n) alpha = 0;
        const cx = p.x + nx * off, cy = p.y + ny * off;
        for (let e = 0; e < 2; e++) {
          const side = e ? 1 : -1, x = cx + nx * half * side, y = cy + ny * half * side, o = ((s * N + i) * 2 + e);
          P[o * 3] = x; P[o * 3 + 1] = sea(x, y) + 0.05; P[o * 3 + 2] = -y;
          C[o * 4] = C[o * 4 + 1] = C[o * 4 + 2] = 1; C[o * 4 + 3] = alpha;
          UV[o * 2] = e; UV[o * 2 + 1] = (p.t * 0.6 + s * 0.33) % 1000;
        }
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.attributes.uv.needsUpdate = true;
      // the bow wave: the water banks up against the stem, by Bernoulli as much as V²/2g where it's stopped dead, and
      // peels off either side as a ridge along her entrance, falling away aft. Taken as 0.6 of the stagnation head at
      // the stem (the stem's sharp entry turns the flow aside rather than stopping it), its crest breaking white from
      // about Fn 0.3 (speed-length ratio 1.0) and more as she nears hull speed (Fn 0.4), and in a chop.
      const lwl = 2 * HALF * 0.785, fn = b.v / Math.sqrt(G * lwl), hs = b.sea?.hsW ?? 0;
      const h0 = Math.min(0.4, 0.6 * b.v * b.v / (2 * G)) * sc, armLen = (0.6 + 2.4 * Math.min(1, fn / 0.4)) * sc;
      const brk = Math.min(1, Math.max(0, (fn - 0.3) / 0.12) + 0.6 * Math.min(1, hs / 0.8));
      // (along her own waterline from the stem, standing a little off it, and peeling away from it aft; a ship's
      // entrance taken as a 24° wedge)
      const stemFwd = HALF - 1.02 * sc, spread = Math.tan(24 * D2R);
      const crestOff = (along: number, f: number) => (sc === 1 ? wlHalf(along) : 0.04 * sc + spread * along) + (0.05 + 0.35 * f * f) * sc;
      const BP = tr.bow.geometry.attributes.position.array as Float32Array, BC = tr.bow.geometry.attributes.color.array as Float32Array;
      tr.bow.visible = b.v > 0.4;
      if (tr.bow.visible) {
        const px = u.y, py = -u.x; // to starboard
        for (let side = 0; side < 2; side++) for (let i = 0; i <= NS; i++) {
          const f = i / NS, along = armLen * f, lat = (side ? 1 : -1) * crestOff(along, f), wid = (0.12 + 0.3 * f) * sc;
          const hgt = h0 * Math.pow(1 - f, 1.3) * Math.min(1, f * 8 + 0.35);
          // the sea's height once at the crest: the waves don't change across the ridge's half metre
          const cx0 = b.x + u.x * (stemFwd - along) + px * lat, cy0 = b.y + u.y * (stemFwd - along) + py * lat, s0 = sea(cx0, cy0);
          for (let j = 0; j < NT; j++) {
            const t = j / (NT - 1) * 2 - 1, lt = lat + (side ? 1 : -1) * t * wid; // across the ridge, from its inner foot out
            const x = b.x + u.x * (stemFwd - along) + px * lt, y = b.y + u.y * (stemFwd - along) + py * lt, o = (side * (NS + 1) + i) * NT + j;
            const prof = Math.cos(t * Math.PI / 2) ** 2;
            BP[o * 3] = x; BP[o * 3 + 1] = s0 + 0.02 + hgt * prof; BP[o * 3 + 2] = -y;
            // sea-coloured water, white where the crest breaks; it fades into the sea at its feet and its far end
            const wh = brk * Math.pow(1 - f, 0.6) * Math.max(0, 1 - Math.abs(t) * 2.2), c = TMP_C.copy(SEA).lerp(FOAM, Math.min(1, wh));
            BC[o * 4] = c.r; BC[o * 4 + 1] = c.g; BC[o * 4 + 2] = c.b; BC[o * 4 + 3] = Math.min(1, h0 / 0.05) * prof * Math.min(1, (1 - f) * 4) * (0.55 + 0.45 * wh);
          }
        }
        tr.bow.geometry.attributes.position.needsUpdate = true; tr.bow.geometry.attributes.color.needsUpdate = true; tr.bow.geometry.computeVertexNormals();
        const BN = tr.bow.geometry.attributes.normal.array as Float32Array; // (both arms' faces looking up, out of the sea)
        for (let i = 0; i < BN.length; i += 3) if (BN[i + 1] < 0) { BN[i] = -BN[i]; BN[i + 1] = -BN[i + 1]; BN[i + 2] = -BN[i + 2]; }
      }
      // spray: when the bow drops into a wave at speed, in a chop; more, higher and further the faster she goes and
      // the steeper the sea
      const bx = b.x + u.x * stemFwd, by = b.y + u.y * stemFwd;
      const dp = (pitch[k] ?? 0) - tr.lastPitch; tr.lastPitch = pitch[k] ?? 0;
      if (sc === 1 && b.v > 2 && dp < -0.004 && hs > 0.25 && tr.drops.length < MAXDROPS) {
        const n2 = Math.min(MAXDROPS - tr.drops.length, Math.round(-dp * 1500 * hs)), up = Math.min(1.6, 0.4 + 0.25 * b.v + 0.6 * hs);
        const lee = (b.rel >= 0 ? -1 : 1), sx = { x: u.y * lee, y: -u.x * lee };
        for (let i = 0; i < n2; i++) {
          const sd = Math.random() < 0.75 ? lee : -lee; // most of it to leeward, where the bow lands
          tr.drops.push({ x: bx, y: by, z: 0.3, vx: sx.x * sd * lee * (1 + Math.random() * 2) + u.x * b.v * 0.6, vy: sx.y * sd * lee * (1 + Math.random() * 2) + u.y * b.v * 0.6, vz: up * (1.2 + Math.random() * 2), life: 0.6 + Math.random() * 0.6, r: 0.004 + 0.012 * Math.random() ** 2 }); // clumps of drops up to about 3 cm
        }
      }
      tr.drops = tr.drops.filter(d => (d.life -= dt) > 0);
      // the bicolour on the stemhead: lit after dark (navLights.ts), unless she carries the tricolour at the masthead
      const lamp = (b as Boat).paint?.navLights !== 'tricolour' ? NIGHT.uOn.value * NIGHT.uNight.value : 0;
      const GL = tr.spray.geometry.attributes.aGlow.array as Float32Array, lx = b.x + u.x * HALF, ly = b.y + u.y * HALF, lz = 0.95;
      tr.spray.count = tr.drops.length;
      tr.drops.forEach((d, i) => {
        d.vz -= G * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        const sp = Math.hypot(d.vx, d.vy, d.vz) || 1;
        // a drop drawn out a little along its flight (the eye's blur of a fast drop)
        Q.setFromUnitVectors(UP, V3.set(d.vx / sp, d.vz / sp, -d.vy / sp));
        M.compose(V3.set(d.x, Math.max(sea(d.x, d.y), d.z), -d.y), Q, SC.set(d.r, d.r * (1 + 0.15 * sp), d.r));
        tr.spray.setMatrixAt(i, M);
        const side = (d.x - b.x) * u.y - (d.y - b.y) * u.x, dist = Math.hypot(d.x - lx, d.y - ly, d.z - lz), e = lamp * 0.9 / (1 + (dist / 0.6) ** 2), c = side >= 0 ? GREEN : RED;
        GL[i * 3] = c.r * e; GL[i * 3 + 1] = c.g * e; GL[i * 3 + 2] = c.b * e;
      });
      tr.spray.instanceMatrix.needsUpdate = true; tr.spray.geometry.attributes.aGlow.needsUpdate = true;
    });
  }
}

/** A Folkboat's waterline half-breadth (m) `along` m aft of where her stem meets the water (hull.ts). */
const WL_STEP = 0.1, WL = Array.from({ length: 41 }, (_, i) => hullHalfAt(1.02 / HULL_L + i * WL_STEP / HULL_L, 0));
const wlHalf = (along: number) => { const q = Math.min(WL.length - 1.001, Math.max(0, along / WL_STEP)), i = Math.floor(q); return WL[i] + (WL[i + 1] - WL[i]) * (q - i); };
const Q = new THREE.Quaternion(), M = new THREE.Matrix4(), V3 = new THREE.Vector3(), SC = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

/**
 * Spray's material: clear water droplets, lit by the scene (a bright glint of the sun by day, dim at night), each
 * also glowing with the colour of her own light that falls on it (aGlow, per drop).
 */
let sprayMat: THREE.MeshPhongMaterial | null = null;
function sprayMaterial(): THREE.MeshPhongMaterial {
  if (sprayMat) return sprayMat;
  const m = new THREE.MeshPhongMaterial({ color: 0xd6e2e8, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.55, depthWrite: false });
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute vec3 aGlow;\nvarying vec3 vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = 'varying vec3 vGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow;');
  };
  m.customProgramCacheKey = () => 'spray';
  return (sprayMat = m);
}
