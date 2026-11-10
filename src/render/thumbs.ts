import './three-setup';
import * as THREE from 'three';
import type { Settings } from '../settings';
import type { BoatSpec } from '../boat/spec';
import { COURSES } from '../courses/registry';
import { World } from '../sim/world';
import { buildBoatMesh, syncBoatMesh } from './boatMesh';

/**
 * A picture of one of your boats as she's set up: her own hull, deck, sails, number, name and flags, drawn by the same
 * 3D model the sim sails, on a gentle reach, from off her starboard bow. One small offscreen renderer draws them all;
 * each picture is kept until her set-up changes.
 */
const W = 400, H = 300;
let gl: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null;
const cache = new Map<string, string>();

function setup() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false); renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // as the main view (three-setup.ts)
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc6e3);
  scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x29485a, 0.85 * Math.PI));
  const sun = new THREE.DirectionalLight(0xfff3dd, 0.75 * Math.PI); sun.position.set(-300, 500, 200); scene.add(sun);
  const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshLambertMaterial({ color: 0x2c6488 })); sea.rotation.x = -Math.PI / 2; scene.add(sea);
  return { renderer, scene, camera: new THREE.PerspectiveCamera(27, W / H, 0.5, 2000) };
}

/** Her picture, as a data URL (cached by her looks). */
export function boatThumb(spec: BoatSpec, S: Settings): string {
  const key = JSON.stringify([spec.hull, spec.deck, spec.cabinTop, spec.poleSide, spec.sails, spec.club, spec.name, spec.perf.mast, spec.perf.boom]);
  const hit = cache.get(key); if (hit) return hit;
  gl ??= setup();
  // her, as the sim builds her: a quiet world with just her in it, sailing a gentle reach with her flags flying
  const w = new World(COURSES[0], { ...S, boat: spec, boatId: spec.id, boats: [spec], opponents: [], fleet: 0, mode: 'sail', sailFrom: 'cityfront', sailTo: '', windKind: 'west', windKt: 10, traffic: 0 }, 1, { freeSail: true, showFlags: true });
  const b = w.user;
  Object.assign(b, { x: 0, y: 0, h: 0, heel: -9, heelMag: 9, boom: -24, jib: -18, rel: -110, twa: 110, awa: 80, arel: -80, aws: 4, tack: 'P', v: 2.5 });
  b.crew = undefined; // just the boat
  const m = buildBoatMesh(b); syncBoatMesh(m, b, 0);
  for (let i = 0; i < 3; i++) syncBoatMesh(m, b, 0.02 * i); // let the sails and flags settle
  m.crew.group.visible = false;
  gl.scene.add(m.grp);
  const cam = gl.camera; cam.position.set(17, 3.8, -16); cam.lookAt(0, 4.3, -0.2); // off her starboard bow, far enough for the whole boat and rig
  gl.renderer.render(gl.scene, cam);
  const url = gl.renderer.domElement.toDataURL('image/jpeg', 0.86);
  gl.scene.remove(m.grp);
  m.grp.traverse(o => { const me = o as THREE.Mesh; if (me.isMesh) { me.geometry?.dispose(); } });
  cache.set(key, url);
  return url;
}
