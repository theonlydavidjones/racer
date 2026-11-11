/**
 * Crew lab (dev only: npm run dev, then http://localhost:5173/scripts/check/crewlab/): one boat sailing with the real
 * physics in steady wind on flat water, and a camera you put anywhere around her crew. For checking the crew's seats,
 * paths and poses from both sides on both tacks (scripts/check/crew.cjs drives it).
 *   lab.setup({ windKt, twa, tack: 'S'|'P', place?: {across, fore}, n? })  then lab.sail(seconds)
 *   lab.tack()  (starts a tack; then lab.sail(s) in small steps to see the crossing)
 *   lab.cam(yawDeg, pitchDeg, dist, [x, y, z] boat-frame target)  (yaw 0: from dead astern; 90: from starboard)
 */
import '../../../src/render/three-setup';
import * as THREE from 'three';
import { buildBoatMesh, syncBoatMesh, type BoatMesh } from '../../../src/render/boatMesh';
import { newCrew, DEFAULT_CREW, type CrewPlace } from '../../../src/boat/crewPhys';
import { testBoat, sail, startTack } from '../../../tests/helpers/testBoat';
import { beatAngle } from '../../../src/boat/polar';
import type { Boat } from '../../../src/boat/boat';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9cc3dc);
scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x29485a, 0.85 * Math.PI));
const sun = new THREE.DirectionalLight(0xfff3dd, 0.75 * Math.PI); sun.position.set(-30, 50, 20); scene.add(sun);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x2f6f8f, transparent: true, opacity: 0.85 }));
sea.rotation.x = -Math.PI / 2; scene.add(sea);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 2000);
let b: Boat, m: BoatMesh | null = null, t = 0, cam = { yaw: 90, pitch: 15, dist: 5, at: [0, 0.8, 1.6] as number[] };

function render(): void {
  syncBoatMesh(m!, b, t);
  sea.position.set(m!.grp.position.x, 0, m!.grp.position.z);
  m!.grp.updateMatrixWorld(true);
  // the camera in the boat's own (unheeled) frame: yaw about her
  const yaw = cam.yaw * Math.PI / 180, pitch = cam.pitch * Math.PI / 180;
  const at = new THREE.Vector3(...cam.at as [number, number, number]);
  const off = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(cam.dist);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), m!.grp.rotation.y);
  const target = at.clone().applyQuaternion(q).add(m!.grp.position);
  camera.position.copy(off.applyQuaternion(q).add(target)); camera.lookAt(target);
  renderer.render(scene, camera);
  const c = b.crew!;
  (document.getElementById('i') as HTMLElement).textContent = `tws ${b.ww.kt} twa ${b.twa?.toFixed(0)} heel ${b.heel.toFixed(1)} mode ${c.mode}\n` +
    c.people.map((p, i) => `${i} x ${p.x.toFixed(2)} z ${p.z.toFixed(2)} ${p.pose} lean ${p.lean.toFixed(2)}`).join('\n');
}

const lab = {
  setup(o: { windKt: number; twa?: number; tack?: 'S' | 'P'; place?: CrewPlace; n?: number }) {
    const twa = o.twa ?? beatAngle(o.windKt), tack = o.tack ?? 'S', h = tack === 'S' ? 360 - twa : twa;
    b = testBoat({ heading: h, kt: 3, windKt: o.windKt }); b.tack = tack;
    b.crew = newCrew({ helm: DEFAULT_CREW.helm, crew: DEFAULT_CREW.crew.slice(0, o.n ?? 2) }, tack);
    if (o.place) b.crew.place = o.place;
    if (m) scene.remove(m.grp);
    m = buildBoatMesh(b); scene.add(m.grp); t = 0;
    (lab as any).hold = h; render();
  },
  /** Sail on for `s` seconds (holding her heading unless a tack is under way), then draw. */
  sail(s: number) {
    sail(b, s, () => { if (b.turnTarget == null && !b.tacking && (lab as any).hold != null) b.h = (lab as any).hold; t += 1 / 60; });
    // the mesh smooths with dt: give it the frame steps
    render();
  },
  tack() { (lab as any).hold = null; startTack(b); },
  holdNow() { (lab as any).hold = b.h; },
  cam(yaw: number, pitch: number, dist: number, at?: number[]) { cam = { yaw, pitch, dist, at: at ?? cam.at }; render(); },
  boat: () => b,
  info: () => (document.getElementById('i') as HTMLElement).textContent,
  calls: () => renderer.info.render.calls
};
Object.assign(window, { lab });
lab.setup({ windKt: 10 }); lab.sail(20);
