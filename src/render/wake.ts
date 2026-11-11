import './three-setup';
import * as THREE from 'three';
import type { Boat } from '../boat/boat';
import { D2R } from '../core/math';

/**
 * Wakes, bow waves and spray, sized by boat speed. Each boat leaves a trail: a turbulent strip of foam behind the
 * stern that widens and fades over 15 s or so, and the two arms of the Kelvin wave pattern spreading at about 19.5°
 * either side of her track (the angle is the same for every boat at any speed: it's a property of deep-water
 * waves). A bow wave curls off the stem, bigger as she approaches hull speed, and in a chop she throws spray when
 * her bow comes down into a wave.
 */

const KELVIN = Math.tan(19.47 * D2R);

interface Trail { pts: { x: number; y: number; v: number; t: number }[]; acc: number; mesh: THREE.Mesh; bow: THREE.Mesh; spray: THREE.Points; drops: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }[]; lastPitch: number }

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

  reset(boats: Mover[] | Boat[]): void {
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
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: foam(), vertexColors: true, transparent: true, depthWrite: false }));
      mesh.frustumCulled = false; mesh.renderOrder = 2; this.scene.add(mesh);
      // bow wave: a curl of foam either side of the stem
      const bg = new THREE.PlaneGeometry(2.6, 1.6); bg.rotateX(-Math.PI / 2);
      const bow = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: bowTex(), transparent: true, depthWrite: false })); bow.renderOrder = 2; this.scene.add(bow);
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
      const spray = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.8, depthWrite: false }));
      spray.frustumCulled = false; this.scene.add(spray);
      return { pts: [], acc: 0, mesh, bow, spray, drops: [], lastPitch: 0 };
    });
  }

  /** Show or hide the wakes (a ship that isn't out now). */
  show(on: boolean): void { for (const t of this.trails) t.mesh.visible = t.bow.visible = t.spray.visible = on; }

  /** `t` race time (s), `dt` frame time; `sea(x, y)` the water height there; `pitch` each boat's pitch now (rad, bow up). */
  update(boats: (Mover | Boat)[], t: number, dt: number, sea: (x: number, y: number) => number, pitch: number[]): void {
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
      // bow wave
      const bx = b.x + u.x * (HALF - 0.6 * sc), by = b.y + u.y * (HALF - 0.6 * sc), sz = Math.min(1.3, b.v / 2.6);
      tr.bow.visible = b.v > 0.6;
      tr.bow.position.set(bx, sea(bx, by) + 0.06, -by); tr.bow.rotation.y = -b.h * D2R; tr.bow.scale.set((0.5 + 0.6 * sz) * sc, 1, (0.5 + 0.7 * sz) * sc);
      (tr.bow.material as THREE.MeshBasicMaterial).opacity = Math.min(0.85, sz * 0.9);
      // spray: when the bow drops into a wave at speed, in a chop
      const dp = (pitch[k] ?? 0) - tr.lastPitch; tr.lastPitch = pitch[k] ?? 0;
      if (sc === 1 && b.v > 2 && dp < -0.004 && (b.sea?.hsW ?? 0) > 0.25 && tr.drops.length < 60) {
        const n2 = Math.min(60 - tr.drops.length, Math.round(-dp * 1500 * (b.sea?.hsW ?? 0)));
        const lee = (b.rel >= 0 ? -1 : 1), sx = { x: u.y * lee, y: -u.x * lee };
        for (let i = 0; i < n2; i++) tr.drops.push({ x: bx, y: by, z: 0.6, vx: sx.x * (1 + Math.random() * 2) + u.x * b.v * 0.6, vy: sx.y * (1 + Math.random() * 2) + u.y * b.v * 0.6, vz: 1.5 + Math.random() * 2.5, life: 0.7 + Math.random() * 0.6 });
      }
      const SP = tr.spray.geometry.attributes.position.array as Float32Array;
      tr.drops = tr.drops.filter(d => (d.life -= dt) > 0);
      for (let i = 0; i < 60; i++) {
        const d = tr.drops[i];
        if (d) { d.vz -= 9.8 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; SP[i * 3] = d.x; SP[i * 3 + 1] = Math.max(sea(d.x, d.y), d.z); SP[i * 3 + 2] = -d.y; }
        else { SP[i * 3] = 0; SP[i * 3 + 1] = -100; SP[i * 3 + 2] = 0; }
      }
      tr.spray.geometry.attributes.position.needsUpdate = true;
    });
  }
}

let bowT: THREE.CanvasTexture | null = null;
function bowTex(): THREE.CanvasTexture {
  if (bowT) return bowT;
  const c = document.createElement('canvas'); c.width = 128; c.height = 80; const g = c.getContext('2d')!;
  // two curls of foam peeling back from the stem (at the top of the picture)
  for (let i = 0; i < 500; i++) {
    const t = Math.random(), side = Math.random() < 0.5 ? -1 : 1, x = 64 + side * (6 + t * 52), y = 6 + t * 66 + (Math.random() - 0.5) * 8 * t;
    g.fillStyle = `rgba(255,255,255,${((1 - t) * 0.8).toFixed(2)})`; g.beginPath(); g.arc(x, y, 1 + Math.random() * 2.2, 0, Math.PI * 2); g.fill();
  }
  bowT = new THREE.CanvasTexture(c);
  return bowT;
}
