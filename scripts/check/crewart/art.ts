/**
 * Crew art studio (dev only: npm run dev, then http://localhost:5173/scripts/check/crewart/): the candidate figures of
 * src/render/crewBody.ts in the sim's own daylight (render/scene.ts: the same sky light, ground light and sun, colour
 * as-is, soft shadows), on a deck, laid out as a sheet of views. scripts/check/crew-art.cjs drives it.
 *   art.sheet(kitIndex)   the close-ups and full bodies of one candidate
 *   art.lineup()          all of them side by side
 */
import '../../../src/render/three-setup';
import * as THREE from 'three';
import { buildArtBody, KITS } from '../../../src/render/crewBody';

const W = 1800, H = 1200;
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.setScissorTest(true);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x29485a, 0.85 * Math.PI));
// (the sun 55° up as in the sim (render/scene.ts), ahead of the figure and to its right: the boats turn every way under it)
const sun = new THREE.DirectionalLight(0xfff3dd, 0.75 * Math.PI); sun.position.set(-3, 5, -3.6).multiplyScalar(2); scene.add(sun); scene.add(sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.5, far: 30 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.01;
const deck = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshLambertMaterial({ color: 0x9c9d96 })); deck.rotation.x = -Math.PI / 2; deck.position.y = -0.93 * 1.78 / 1.75 - 0.001; deck.receiveShadow = true; scene.add(deck);
const sky = new THREE.Color(0x9cc3dc);
let figures: THREE.Group[] = [];

function pose(b: ReturnType<typeof buildArtBody>, i: number) {
  // standing at ease: arms a little out from the body, elbows a little bent, the head turned a touch
  b.arm[0].root.rotation.set(0.05, 0, -0.13); b.arm[1].root.rotation.set(0.05, 0, 0.13);
  b.arm[0].mid.rotation.set(0.45, 0, 0); b.arm[1].mid.rotation.set(0.3, 0, 0);
  b.head.rotation.set(0.04, 0.12 * (i % 2 ? -1 : 1), 0);
  b.leg[0].root.rotation.set(0, 0, -0.03); b.leg[1].root.rotation.set(0, 0, 0.03);
}
function place(kits: number[]) {
  for (const f of figures) scene.remove(f);
  figures = kits.map((k, i) => {
    const b = buildArtBody({ h: 1.78, w: 80 }, KITS[k]); pose(b, k);
    b.root.position.set((i - (kits.length - 1) / 2) * 0.9, 0, 0); scene.add(b.root);
    (b.root as any).tris = b.tris; return b.root;
  });
}
interface Panel { x: number; y: number; w: number; h: number; eye: number[]; at: number[]; fov: number; label: string }
function draw(panels: Panel[]) {
  const lab = document.getElementById('labels')!; lab.innerHTML = '';
  for (const p of panels) {
    const cam = new THREE.PerspectiveCamera(p.fov, p.w / p.h, 0.02, 100); cam.position.set(...(p.eye as [number, number, number])); cam.lookAt(...(p.at as [number, number, number]));
    renderer.setViewport(p.x, H - p.y - p.h, p.w, p.h); renderer.setScissor(p.x, H - p.y - p.h, p.w, p.h);
    renderer.setClearColor(sky); renderer.clear(); renderer.render(scene, cam);
    const d = document.createElement('div'); d.textContent = p.label; Object.assign(d.style, { left: p.x + 8 + 'px', top: p.y + 6 + 'px' }); lab.appendChild(d);
  }
}
/** A camera `dist` from a point at height y on the figure, from yaw degrees round (0: in front, + toward its left). */
const orbit = (yaw: number, pitch: number, dist: number, at: number[]) => { const a = yaw * Math.PI / 180, e = pitch * Math.PI / 180; return [at[0] - Math.sin(a) * Math.cos(e) * dist, at[1] + Math.sin(e) * dist, at[2] - Math.cos(a) * Math.cos(e) * dist]; };
const HEAD_Y = 0.67 * 1.78 / 1.75, CHEST_Y = 0.35;
const art = {
  sheet(k: number) {
    place([k]);
    const head = [0, HEAD_Y, 0], chest = [0, CHEST_Y, 0], full = [0, -0.05, 0];
    draw([
      { x: 0, y: 0, w: 600, h: 600, eye: orbit(0, 4, 0.75, head), at: head, fov: 30, label: `${KITS[k].name} · head, front` },
      { x: 600, y: 0, w: 600, h: 600, eye: orbit(-40, 6, 0.75, head), at: head, fov: 30, label: 'head, three-quarter' },
      { x: 1200, y: 0, w: 600, h: 600, eye: orbit(-100, 4, 0.75, head), at: head, fov: 30, label: 'head, side' },
      { x: 0, y: 600, w: 600, h: 600, eye: orbit(-35, 8, 2.3, [0, 0.42, 0]), at: [0, 0.42, 0], fov: 30, label: 'upper body, three-quarter' },
      { x: 600, y: 600, w: 600, h: 600, eye: orbit(-30, 6, 3.85, full), at: full, fov: 30, label: `full body (${(figures[0] as any).tris} triangles)` },
      { x: 1200, y: 600, w: 600, h: 600, eye: orbit(150, 6, 3.85, full), at: full, fov: 30, label: 'full body, behind' }
    ]);
  },
  lineup() {
    place([0, 1, 2]);
    draw([{ x: 0, y: 0, w: W, h: H, eye: orbit(-20, 6, 5.2, [0, 0.0, 0]), at: [0, -0.05, 0], fov: 32, label: 'A · B · C' }]);
  },
  any(k: number, yaw: number, pitch: number, dist: number, y: number) { place([k]); draw([{ x: 0, y: 0, w: W, h: H, eye: orbit(yaw, pitch, dist, [0, y, 0]), at: [0, y, 0], fov: 30, label: '' }]); }
};
Object.assign(window, { art, __scene: scene });
art.sheet(0);
