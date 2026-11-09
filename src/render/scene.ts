import './three-setup';
import * as THREE from 'three';
import { D2R, V, ZONE } from '../core/math';
import type { World } from '../sim/world';
import { Puffs, TerrainGrid } from '../environment/wind';
import { laylinesFor } from '../sim/laylines';
import { buildBoatMesh, syncBoatMesh, type BoatMesh } from './boatMesh';
import { P3 } from './coords';
import { addLandscape } from './landscape';

export const VIEWS = ['Cockpit', 'Chase', 'Overhead'] as const;

/** Wind map on the water: PUFF_N × PUFF_N texels over PUFF_SPAN metres around the camera. */
const PUFF_N = 160, PUFF_SPAN = 3200;

/**
 * Water colour from the wind on it. Stronger wind roughens the surface: denser, higher-contrast ripples and a
 * darker look (rough water reflects less of the bright sky), whitecaps from about 12 kt. Lighter wind
 * leaves it smoother and paler. Outside the wind map the water looks as it does in the mean wind.
 */
const WATER_FRAGMENT = `
  vec4 texelColor = texture2D( map, vMapUv );
  vec2 puv = (vec2(vPuffXZ.x, -vPuffXZ.y) - uPuffO) / uPuffS;
  float edge = smoothstep(0.0, 0.1, min(min(puv.x, 1.0 - puv.x), min(puv.y, 1.0 - puv.y)));
  float kw = mix(1.0, 0.4 + 1.4 * texture2D(uPuff, clamp(puv, 0.0, 1.0)).r, edge);
  float gust = clamp((kw - 1.0) / 0.22, -1.0, 1.0);
  vec4 fine = texture2D( map, vMapUv * 2.7 + vec2(0.31, 0.17) );
  float rough = clamp(0.85 + 0.55 * gust, 0.25, 1.4);
  diffuseColor.rgb *= mix(vec3(1.0), texelColor.rgb * mix(vec3(1.0), fine.rgb * 1.12, clamp(rough - 0.6, 0.0, 1.0)), rough);
  diffuseColor.rgb *= 1.0 - 0.38 * max(gust, 0.0) + 0.28 * max(-gust, 0.0);
  float caps = smoothstep(12.0, 21.0, uMeanKt * kw);
  float speck = smoothstep(0.9 - 0.1 * caps, 0.98, fine.r * texelColor.r);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95), speck * caps * 0.75);
`;

/** Overhead view state: which way is up, how high the camera is (m), and how far it's panned from the boat (m). */
export type Orient = 'north' | 'bow' | 'wind';
export interface Overhead { orient: Orient; height: number; off: { x: number; y: number } }
export const ORIENT_LABEL: Record<Orient, string> = { north: 'North up', bow: 'Bow up', wind: 'Wind up' };
/** Which compass direction is at the top of the overhead view. */
export function overheadUp(o: Overhead, w: World): number {
  return o.orient === 'north' ? 0 : o.orient === 'bow' ? w.user.h : w.C.base;
}


export class SceneView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 16000);
  private wtex: THREE.CanvasTexture;
  private tile: number;
  private boatMeshes: BoatMesh[] = [];
  private courseObjs: THREE.Object3D[] = [];
  private camLocal = new THREE.Vector3();
  private camSide = 1;
  private baseFov = 60;
  private laylines: THREE.Line[] = [];
  /* Wind on the water: a map of the wind strength around the camera, refreshed several times a second, that
   * the water shader turns into darker, rougher patches in the puffs and paler, smoother ones in the lulls. */
  private puffData = new Uint8Array(PUFF_N * PUFF_N * 4);
  private puffTex = new THREE.DataTexture(this.puffData, PUFF_N, PUFF_N, THREE.RGBAFormat);
  private puffUni = { uPuff: { value: this.puffTex as THREE.Texture }, uPuffO: { value: new THREE.Vector2() }, uPuffS: { value: PUFF_SPAN }, uMeanKt: { value: 12 } };
  private puffAcc = 1;
  private terrain: TerrainGrid | null = null;
  private terrainKey = '';
  private ripAngle = 0;
  private laylineAcc = 1;

  constructor(canvas: HTMLCanvasElement) {
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // r128 output, see three-setup.ts
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = this.scene;
    const SKY = new THREE.Color('#aecbdb');
    scene.background = SKY;
    scene.fog = new THREE.Fog(SKY, 600, 9000);
    this.camera.rotation.order = 'YXZ';
    // light intensities ×π: r155+ dropped the legacy light units the prototype was tuned for
    scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x29485a, 0.85 * Math.PI));
    const sun = new THREE.DirectionalLight(0xfff3dd, 0.75 * Math.PI); sun.position.set(-300, 500, 200); scene.add(sun);

    // water: a streaky texture that drifts with the current
    const wtc = document.createElement('canvas'); wtc.width = wtc.height = 256;
    const c = wtc.getContext('2d')!;
    c.fillStyle = '#c8d8de'; c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, l = 6 + Math.random() * 22;
      c.strokeStyle = Math.random() < 0.55 ? 'rgba(255,255,255,.55)' : 'rgba(40,70,90,.35)';
      c.lineWidth = 1 + Math.random() * 1.5;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + l / 2, y - 2, x + l, y); c.stroke();
    }
    const wtex = this.wtex = new THREE.CanvasTexture(wtc);
    wtex.wrapS = wtex.wrapT = THREE.RepeatWrapping; wtex.repeat.set(600, 600);
    wtex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const WSIZE = 18000; this.tile = WSIZE / 600;
    wtex.center.set(0.5, 0.5);
    this.puffTex.magFilter = this.puffTex.minFilter = THREE.LinearFilter;
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x3b6d84, map: wtex });
    waterMat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, this.puffUni);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPuffXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPuffXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uPuff; uniform vec2 uPuffO; uniform float uPuffS; uniform float uMeanKt; varying vec2 vPuffXZ;')
        .replace('#include <map_fragment>', WATER_FRAGMENT);
    };
    const water = new THREE.Mesh(new THREE.PlaneGeometry(WSIZE, WSIZE), waterMat);
    water.rotation.x = -Math.PI / 2; scene.add(water);

    addLandscape(scene);

    // laylines on the water: starboard-tack (green) and port-tack (red), redrawn as the wind shifts
    for (const color of [0x3fd197, 0xff6a5c]) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: 6, gapSize: 4, transparent: true, opacity: 0.85 }));
      line.frustumCulled = false; line.visible = false; scene.add(line); this.laylines.push(line);
    }
  }

  /** Laylines for the user's target mark, 900 m long, refreshed twice a second. */
  private updateLaylines(w: World, dt: number): void {
    this.laylineAcc += dt; if (this.laylineAcc < 0.5) return; this.laylineAcc = 0;
    const L = w.settings.aids ? laylinesFor(w, w.user) : null;
    this.laylines.forEach((line, i) => {
      line.visible = !!L;
      if (!L) return;
      const m = L.mark.p, g = L.tracks[i], a = P3(m.x, m.y, 0.15), b = P3(m.x - g.x * 900, m.y - g.y * 900, 0.15);
      const arr = (line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      arr.set([a.x, a.y, a.z, b.x, b.y, b.z]);
      line.geometry.attributes.position.needsUpdate = true;
      line.computeLineDistances();
    });
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.baseFov = this.camera.fov = w < h ? 72 : 60; this.camera.updateProjectionMatrix();
  }

  /** Rebuild boats and course objects for a new race. */
  setWorld(w: World): void {
    this.laylineAcc = 1; this.puffAcc = 1;
    const key = `${Math.round(w.C.center.x)},${Math.round(w.C.center.y)}`;
    if (key !== this.terrainKey) { this.terrain = new TerrainGrid(w.C.center.x, w.C.center.y); this.terrainKey = key; }
    this.boatMeshes.forEach(m => this.scene.remove(m.grp));
    this.boatMeshes = w.boats.map(b => { const m = buildBoatMesh(b); this.scene.add(m.grp); return m; });
    this.buildCourse(w);
  }

  private buildCourse(w: World): void {
    this.courseObjs.forEach(o => this.scene.remove(o)); this.courseObjs = [];
    const add = (o: THREE.Object3D) => { this.scene.add(o); this.courseObjs.push(o); return o; };
    const C = w.C, aids = !!w.settings.aids;
    if (C.committeeKind === 'boat') {
      const rc = new THREE.Group();
      const rh = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 12), new THREE.MeshLambertMaterial({ color: 0xf0f0ea })); rh.position.y = 0.5; rc.add(rh);
      const rcab = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 5), new THREE.MeshLambertMaterial({ color: 0xdedcd2 })); rcab.position.set(0, 2.2, 0.5); rc.add(rcab);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshBasicMaterial({ color: 0xff8a1f, side: THREE.DoubleSide })); flag.position.set(0, 8, 0.7); flag.rotation.y = Math.PI / 2; rc.add(flag);
      rc.position.copy(P3(C.committee.x, C.committee.y)); rc.rotation.y = -C.base * D2R; add(rc);
    }
    if (C.pinKind === 'buoy') {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 1.8, 10), new THREE.MeshLambertMaterial({ color: 0xff7a1a })); pin.position.copy(P3(C.pin.x, C.pin.y, 0.6)); add(pin);
    }
    const drawn = new Set<string>();
    C.marks.forEach(m => {
      if (drawn.has(m.name)) return; drawn.add(m.name);
      const mesh = m.shape === 'sphere'
        ? new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), new THREE.MeshLambertMaterial({ color: 0xffd21a }))
        : new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 2.4, 12), new THREE.MeshLambertMaterial({ color: 0xffc21a }));
      mesh.position.copy(P3(m.p.x, m.p.y, 0.8)); add(mesh);
      if (aids && m.type === 'round') {
        const ring = new THREE.Mesh(new THREE.RingGeometry(ZONE - 0.25, ZONE + 0.25, 64), new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.copy(P3(m.p.x, m.p.y, 0.06)); add(ring);
      }
    });
    if (aids) {
      const lg = new THREE.BufferGeometry().setFromPoints([P3(C.pin.x, C.pin.y, 0.08), P3(C.committee.x, C.committee.y, 0.08)]);
      const line = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xffd84a, dashSize: 2.5, gapSize: 2.5, transparent: true, opacity: 0.8 }));
      line.computeLineDistances(); add(line);
    }
  }

  /** Rasterize the wind strength (terrain × puffs) around a point into the water shader's wind map. */
  private drawWindOnWater(w: World, at: { x: number; y: number }, span: number): void {
    const PUFF_SPAN = span, cell = span / PUFF_N, x0 = Math.round((at.x - PUFF_SPAN / 2) / cell) * cell, y0 = Math.round((at.y - PUFF_SPAN / 2) / cell) * cell;
    const sum = new Float32Array(PUFF_N * PUFF_N), g = w.puffs.gustiness;
    for (const p of w.puffs.cells) {
      const R = p.r * 1.5;
      const i0 = Math.max(0, Math.floor((p.x - R - x0) / cell)), i1 = Math.min(PUFF_N - 1, Math.ceil((p.x + R - x0) / cell));
      const j0 = Math.max(0, Math.floor((p.y - R - y0) / cell)), j1 = Math.min(PUFF_N - 1, Math.ceil((p.y + R - y0) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const wt = Puffs.weight(p, x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell, w.puffs.dir);
        if (wt) sum[j * PUFF_N + i] += p.amp * g * wt;
      }
    }
    const tg = this.terrain, d = this.puffData;
    for (let j = 0; j < PUFF_N; j++) for (let i = 0; i < PUFF_N; i++) {
      const kk = Math.min(1.8, Math.max(0.4, (1 + sum[j * PUFF_N + i]) * (tg ? tg.at(x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell) : 1)));
      d[(j * PUFF_N + i) * 4] = Math.round((kk - 0.4) / 1.4 * 255);
    }
    this.puffTex.needsUpdate = true;
    this.puffUni.uPuffO.value.set(x0, y0); this.puffUni.uPuffS.value = span;
    this.puffUni.uMeanKt.value = w.wind.kt;
  }

  /** Draw a frame. dt is wall-clock seconds since the last frame; now is ms. */
  render(w: World, dt: number, now: number, viewMode: number, look: { yaw: number; pitch: number; aft?: number; chase?: number }, over: Overhead): void {
    const t = now / 1000, k = (w.running && !w.paused ? w.speed : 0) * dt / this.tile;
    // ripples lie across the wind (the course's mean direction, so they don't swing with every shift)
    this.ripAngle += (-w.windModel.base * D2R - this.ripAngle) * Math.min(1, dt * 0.2);
    const c = Math.cos(this.ripAngle), s = Math.sin(this.ripAngle);
    this.wtex.rotation = this.ripAngle;
    // the texture drifts with the current: offset in texture space is the rotated displacement
    this.wtex.offset.x -= (c * w.cvec.x + s * w.cvec.y) * k; this.wtex.offset.y -= (-s * w.cvec.x + c * w.cvec.y) * k;
    this.puffAcc += dt;
    if (this.puffAcc > 0.15) { this.puffAcc = 0; this.drawWindOnWater(w, viewMode === 2 ? { x: w.user.x + over.off.x, y: w.user.y + over.off.y } : w.user, viewMode === 2 ? Math.max(PUFF_SPAN, over.height * 2.6) : PUFF_SPAN); }
    w.boats.forEach((b, i) => syncBoatMesh(this.boatMeshes[i], b, t));
    this.updateLaylines(w, dt);
    const u = w.user, camera = this.camera, um = this.boatMeshes[0];
    camera.up.set(0, 1, 0);
    const fov = viewMode === 0 ? 72 : this.baseFov;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (viewMode === 0) {
      // sit on the windward side, like a helm hiking
      this.camSide += ((u.rel >= 0 ? 1 : -1) - this.camSide) * Math.min(1, dt * 1.5);
      // over the helm's shoulder, on the windward side; `aft` (m aft of amidships) is yours to set
      const aft = look.aft ?? 6.5;
      this.camLocal.set(Math.max(0.35, 0.8 - (aft - 3.3) * 0.06) * this.camSide, 1.6 + Math.max(0, aft - 3.3) * 0.25, aft);
      um.grp.updateMatrixWorld();
      camera.position.copy(this.camLocal).applyMatrix4(um.grp.matrixWorld);
      camera.rotation.set(-4 * D2R + look.pitch, -u.h * D2R + look.yaw, u.heel * 0.6 * D2R * Math.cos(look.yaw));
    } else if (viewMode === 1) {
      // chase: orbit the boat with the look direction
      const dist = look.chase ?? 24, hv = V(u.h - look.yaw / D2R), height = Math.max(1.2, (9 + look.pitch * 25) * dist / 24);
      camera.position.lerp(P3(u.x - hv.x * dist, u.y - hv.y * dist, height), Math.min(1, dt * 3));
      camera.lookAt(P3(u.x + hv.x * 10, u.y + hv.y * 10, 1.5));
    } else {
      // overhead: straight down, north / bow / wind at the top, zoomed and panned as you like
      const up = V(overheadUp(over, w)), cx = u.x + over.off.x, cy = u.y + over.off.y;
      camera.position.copy(P3(cx, cy, over.height)); camera.up.set(up.x, 0, -up.y); camera.lookAt(P3(cx, cy, 0));
    }
    this.renderer.render(this.scene, camera);
  }
}
