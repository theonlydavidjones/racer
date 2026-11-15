/**
 * Crew clip (dev only: npm run dev, then /scripts/check/crewclip/): a real World sailed in the page (a cruise on the
 * tiller pilot, or a race), one boat drawn with her crew, the race stepped at 60 Hz and drawn every frame, for clips of
 * how the crew behave over half a minute (scripts/check/crew-clip.cjs drives it, and makes the video).
 *   clip.setup({ mode: 'cruise'|'race', windKt, twa?, seed? })   clip.run(s)   clip.frames(s)   clip.cam(yaw, pitch, dist)
 */
import '../../../src/render/three-setup';
import * as THREE from 'three';
import { buildBoatMesh, syncBoatMesh, type BoatMesh } from '../../../src/render/boatMesh';
import { COURSES } from '../../../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../../../src/settings';
import { DT, World } from '../../../src/sim/world';
import { engage } from '../../../src/boat/autopilot';
import { LL } from '../../../src/geo/geo';
import { n360 } from '../../../src/core/math';
import type { Boat } from '../../../src/boat/boat';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9cc3dc);
scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x29485a, 0.85 * Math.PI));
const sun = new THREE.DirectionalLight(0xfff3dd, 0.75 * Math.PI); sun.position.set(-30, 50, 20); scene.add(sun);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x2f6f8f, transparent: true, opacity: 0.85 }));
sea.rotation.x = -Math.PI / 2; scene.add(sea);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 2000);
let w: World, b: Boat, m: BoatMesh | null = null, cam = { yaw: 60, pitch: 22, dist: 6.5, at: [0, 0.7, 1.0] as number[] };

/**
 * The clock syncBoatMesh is given: the race's, made positive. Before the gun the race's clock is negative (from −180 s),
 * and syncBoatMesh takes a negative last time for "the first frame" and moves nothing: every figure stood still through
 * the pre-start's tacks. The game gives it the page's clock, always positive.
 */
const clk = () => w.t + 1e4;

function draw(): void {
  syncBoatMesh(m!, b, clk());
  sea.position.set(m!.grp.position.x, 0, m!.grp.position.z);
  m!.grp.updateMatrixWorld(true);
  const yaw = cam.yaw * Math.PI / 180, pitch = cam.pitch * Math.PI / 180, at = new THREE.Vector3(...cam.at as [number, number, number]);
  const off = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(cam.dist);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), m!.grp.rotation.y);
  const target = at.clone().applyQuaternion(q).add(m!.grp.position);
  camera.position.copy(off.applyQuaternion(q).add(target)); camera.lookAt(target);
  renderer.render(scene, camera);
  (document.getElementById('i') as HTMLElement).textContent = `${(w as any).cruising ? 'cruise' : 'race'}  t ${w.t.toFixed(1)} s  true wind ${b.ww.kt.toFixed(1)} kt  twa ${b.twa.toFixed(0)}  heel ${b.heel.toFixed(0)}`;
}

const clip = {
  setup(o: { mode: 'cruise' | 'race'; windKt: number; twa?: number; seed?: number }) {
    const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: o.windKt, tideDate: '2026-07-11', current: 'slack', sea: 'real', traffic: 0,
      ...(o.mode === 'cruise' ? { mode: 'sail', sailFrom: 'cityfront', sailTo: '' } : { mode: 'race', fleet: 2, opponents: ['stock:1', 'stock:2'] }) } as Settings;
    w = new World(COURSES[0], S, o.seed ?? 3, o.mode === 'cruise' ? { freeSail: true } : {});
    if (o.mode === 'cruise') {
      b = w.user; const p = LL(37.835, -122.40); b.x = p.x; b.y = p.y;
      w.step(DT); b.h = n360(b.ww.from + (o.twa ?? 45)); b.v = 2.5; engage(b, w.pilot, 'auto');
    } else b = w.boats.find(x => !x.isUser)!; // (an AI boat racing: her helm and crew sailing her)
    if (m) scene.remove(m.grp);
    m = buildBoatMesh(b); scene.add(m.grp); draw();
  },
  /** Sail on `s` seconds without drawing every frame (the figures jump to where they are). */
  run(s: number) { const end = w.t + s; while (w.t < end) w.step(DT); draw(); },
  /** Sail `s` seconds drawing every frame (60 a second), as the game does. */
  frames(s: number) { for (let i = 0; i < Math.round(s / DT); i++) { w.step(DT); syncBoatMesh(m!, b, clk()); } draw(); },
  cam(yaw: number, pitch: number, dist: number, at?: number[]) { cam = { yaw, pitch, dist, at: at ?? cam.at }; draw(); },
  info: () => (document.getElementById('i') as HTMLElement).textContent
};
Object.assign(window, { clip });
clip.setup({ mode: 'cruise', windKt: 14, twa: 45 });
