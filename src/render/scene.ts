import './three-setup';
import * as THREE from 'three';
import { D2R, V, ZONE } from '../core/math';
import type { World } from '../sim/world';
import { laylinesFor } from '../sim/laylines';
import { buildBoatMesh, syncBoatMesh, type BoatMesh } from './boatMesh';
import { P3 } from './coords';
import { addLandscape } from './landscape';

export const VIEWS = ['Cockpit', 'Chase', 'Overhead'] as const;


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
  private laylines: THREE.Line[] = [];
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
    const water = new THREE.Mesh(new THREE.PlaneGeometry(WSIZE, WSIZE), new THREE.MeshLambertMaterial({ color: 0x3b6d84, map: wtex }));
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
    this.camera.aspect = w / h; this.camera.fov = w < h ? 72 : 60; this.camera.updateProjectionMatrix();
  }

  /** Rebuild boats and course objects for a new race. */
  setWorld(w: World): void {
    this.laylineAcc = 1;
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

  /** Draw a frame. dt is wall-clock seconds since the last frame; now is ms. */
  render(w: World, dt: number, now: number, viewMode: number, look: { yaw: number; pitch: number }): void {
    const t = now / 1000, k = (w.running && !w.paused ? w.speed : 0) * dt / this.tile;
    this.wtex.offset.x -= w.cvec.x * k; this.wtex.offset.y -= w.cvec.y * k;
    w.boats.forEach((b, i) => syncBoatMesh(this.boatMeshes[i], b, t));
    this.updateLaylines(w, dt);
    const u = w.user, camera = this.camera, um = this.boatMeshes[0];
    camera.up.set(0, 1, 0);
    if (viewMode === 0) {
      // sit on the windward side, like a helm hiking
      this.camSide += ((u.rel >= 0 ? 1 : -1) - this.camSide) * Math.min(1, dt * 1.5);
      this.camLocal.set(0.55 * this.camSide, 1.5, 2.6);
      um.grp.updateMatrixWorld();
      camera.position.copy(this.camLocal).applyMatrix4(um.grp.matrixWorld);
      camera.rotation.set(-4 * D2R + look.pitch, -u.h * D2R + look.yaw, u.heel * 0.6 * D2R * Math.cos(look.yaw));
    } else if (viewMode === 1) {
      // chase: orbit the boat with the look direction
      const hv = V(u.h - look.yaw / D2R), height = Math.max(2, 9 + look.pitch * 25);
      camera.position.lerp(P3(u.x - hv.x * 24, u.y - hv.y * 24, height), Math.min(1, dt * 3));
      camera.lookAt(P3(u.x + hv.x * 10, u.y + hv.y * 10, 1.5));
    } else {
      const wv = V(w.C.base);
      camera.position.copy(P3(u.x, u.y, 170)); camera.up.set(wv.x, 0, -wv.y); camera.lookAt(P3(u.x, u.y, 0));
    }
    this.renderer.render(this.scene, camera);
  }
}
