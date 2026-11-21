import './three-setup';
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { Settings } from '../settings';
import type { BoatSpec } from '../boat/spec';
import { COURSES } from '../courses/registry';
import { DT, World } from '../sim/world';
import { buildBoatMesh, syncBoatMesh } from './boatMesh';

/**
 * A picture of one of your boats as she's set up: her own hull, deck, sails, number, name and flags, drawn by the same
 * 3D model the sim sails, on a gentle reach, from off her starboard bow. One small offscreen renderer draws them all.
 * She's on the Bay at golden hour (the owner's choice, 12 Nov 2026: ROADMAP, "the boat cards' pictures"): the sun low
 * off her starboard bow, a physical sky (Preetham, as the main view) and the water rippled and reflecting it.
 * Each picture is kept, in memory and between visits, until her looks change.
 */
const W = 400, H = 300;
/** The camera looks this way: from off her starboard bow, a little above her deck. */
const VIEW = new THREE.Vector3(-17, -0.6, 16).normalize();
/** Bump when the picture's drawing changes, so pictures kept from before are drawn again. */
const LOOK_VERSION = 2; // (2: pictures saved before 8t's fix framed an empty sea; the new key drops them)
const STORE = 'folkboat.thumbs', KEEP = 24;
interface GL { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; sea: THREE.Mesh; fog: THREE.Fog }
let gl: GL | null = null;
const cache = new Map<string, string>();

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  return new THREE.CanvasTexture(c);
}

/** A tileable ripple normal map: many short wave trains, mostly running one way with a spread, longer ones stronger (as
 * a wind sea's spectrum falls off with frequency), with fixed random phases so every picture has the same water. */
function rippleNormals(): THREE.Texture {
  const N = 256, img = new ImageData(N, N);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const waves: [number, number, number, number][] = [];
  for (let i = 0; i < 40; i++) {
    const k = 2 + rnd() * 14, th = rnd() * Math.PI * 2 * 0.35 - 0.6;
    const a = Math.round(k * Math.cos(th)), b = Math.round(k * Math.sin(th)); if (!a && !b) continue; // (whole cycles per tile: it tiles)
    waves.push([a, b, Math.pow(Math.hypot(a, b), -1.6), rnd() * Math.PI * 2]);
  }
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let s = 0; for (const [a, b, amp, ph] of waves) s += amp * Math.sin(2 * Math.PI * (a * x + b * y) / N + ph); h[y * N + x] = s; }
  const at = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = at(x + 1, y) - at(x - 1, y), dy = at(x, y + 1) - at(x, y - 1), k = 6;
    const nx = -dx * k, ny = -dy * k, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * N + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  const t = canvasTex(N, N, g => g.putImageData(img, 0, 0)); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function setup(): GL {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false); renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // as the main view (three-setup.ts)
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(27, W / H, 0.5, 20000);
  // the sun 7° up and 65° to the left of where the camera looks: it lights her starboard side from ahead, and the warm
  // glow of a low sun is on the horizon off the left of the picture
  const el = 7 * Math.PI / 180, v = VIEW.clone().setY(0).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), 65 * Math.PI / 180);
  const sunDir = new THREE.Vector3(v.x * Math.cos(el), Math.sin(el), v.z * Math.cos(el)).normalize();
  const sky = new Sky(); sky.scale.setScalar(10000);
  const sm = sky.material as THREE.ShaderMaterial;
  Object.assign(sm.uniforms, { turbidity: { value: 3.2 }, rayleigh: { value: 2.2 }, mieCoefficient: { value: 0.006 } });
  sm.uniforms.mieDirectionalG.value = 0.85; sm.uniforms.cloudCoverage.value = 0.25; sm.uniforms.cloudDensity.value = 0.3;
  sm.uniforms.sunPosition.value.copy(sunDir);
  // (the analytic sky is HDR: an exposure curve, as the main view's, render/scene.ts)
  sm.uniforms.skyExposure = { value: 1.6 };
  sm.fragmentShader = 'uniform float skyExposure;\n' + sm.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( 1.0 - exp( -texColor * skyExposure ), 1.0 );');
  sm.fog = false;
  scene.add(sky);
  // the sea reflects the sky: an environment map made from it
  const pm = new THREE.PMREMGenerator(renderer), skyScene = new THREE.Scene(); skyScene.add(sky.clone());
  const env = pm.fromScene(skyScene, 0, 1, 20000).texture; pm.dispose();
  const sun = new THREE.DirectionalLight(0xffcf96, 1.05 * Math.PI); sun.position.copy(sunDir).multiplyScalar(500); scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xc9d6ea, 0x3a4a52, 0.55 * Math.PI));
  const nm = rippleNormals(); nm.repeat.set(500, 500); // (a tile 32 m across: wavelets 2–16 m long, as a 10 kt breeze raises)
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshStandardMaterial({ color: 0x0f2c3c, roughness: 0.2, metalness: 0, envMap: env, normalMap: nm, normalScale: new THREE.Vector2(0.3, 0.3) }));
  sea.rotation.x = -Math.PI / 2; scene.add(sea);
  // haze over the far water, the colour of the sky at the horizon (horizonHaze), so sea meets sky softly
  const fog = new THREE.Fog(0xffffff, 300, 3500); scene.fog = fog;
  return { renderer, scene, camera, sea, fog };
}

/** The haze's colour: the sky just above the horizon, as this camera sees it (the sea hidden for a moment). */
function horizonHaze(g: GL): void {
  const cam = g.camera, far = cam.position.clone().addScaledVector(VIEW.clone().setY(0).normalize(), 9000).setY(60).project(cam);
  const px = Math.round((far.x * 0.5 + 0.5) * W), py = Math.round((far.y * 0.5 + 0.5) * H);
  g.sea.visible = false; g.renderer.render(g.scene, cam); g.sea.visible = true;
  const gc = g.renderer.getContext(), buf = new Uint8Array(4);
  gc.readPixels(Math.min(W - 1, Math.max(0, px)), Math.min(H - 1, Math.max(0, py)), 1, 1, gc.RGBA, gc.UNSIGNED_BYTE, buf);
  g.fog.color.setRGB(buf[0] / 255, buf[1] / 255, buf[2] / 255);
}

/** Pictures kept between visits (this browser only; any failure just means drawing her again). */
type Kept = [string, string][]; // [key, data URL], newest last
/** (only this LOOK_VERSION's: an older picture is dropped the next time the store is written, ROADMAP 8t) */
const current = (e: unknown): e is [string, string] => Array.isArray(e) && typeof e[0] === 'string' && e[0].startsWith(`[${LOOK_VERSION},`);
function kept(): Kept { try { const v = JSON.parse(localStorage.getItem(STORE) ?? '[]'); return Array.isArray(v) ? v.filter(current) : []; } catch { return []; } }
/** Drop older versions' pictures now (once a visit), so a stale empty picture can't come back. */
export function purgeOldThumbs(): void { try { const raw = localStorage.getItem(STORE); if (!raw) return; const v = JSON.parse(raw); if (Array.isArray(v) && v.some(e => !current(e))) localStorage.setItem(STORE, JSON.stringify(v.filter(current))); } catch { /* blocked: nothing kept anyway */ } }
function keep(key: string, url: string): void {
  try { const k = kept().filter(e => e[0] !== key); k.push([key, url]); localStorage.setItem(STORE, JSON.stringify(k.slice(-KEEP))); } catch { /* full or blocked: memory only */ }
}

let purged = false;
/** Her picture, as a data URL (kept by her looks). */
export function boatThumb(spec: BoatSpec, S: Settings): string {
  const key = JSON.stringify([LOOK_VERSION, spec.hull, spec.deck, spec.cabinTop, spec.poleSide, spec.hatch, spec.sails, spec.club, spec.name, spec.nameColor, spec.companionway, spec.navLights, spec.lineColors, spec.perf.mast, spec.perf.boom, spec.perf.outboard]);
  if (!purged) { purged = true; purgeOldThumbs(); }
  const hit = cache.get(key) ?? kept().find(e => e[0] === key)?.[1]; if (hit) { cache.set(key, hit); return hit; }
  gl ??= setup();
  // her, as the sim builds her: a quiet world with just her in it, sailing a gentle reach with her flags flying
  const w = new World(COURSES[0], { ...S, boat: spec, boatId: spec.id, boats: [spec], opponents: [], fleet: 0, mode: 'sail', sailFrom: 'cityfront', sailTo: '', windKind: 'west', windKt: 10, traffic: 0 }, 1, { freeSail: true, showFlags: true });
  const b = w.user;
  // she sails: twenty seconds on a close reach, port tack, in the real physics (the crew trimming), so her sails, heel and
  // flags all answer the same apparent wind; then the picture, from off her starboard bow (her leeward side)
  for (let i = 0; i < 60 * 20; i++) w.idle(DT, -55);
  const m = buildBoatMesh(b);
  for (let i = 0; i < 90; i++) syncBoatMesh(m, b, i / 30); // (the windex and flags swing round to the wind as they would)
  m.crew.group.visible = false; // just the boat
  m.grp.position.set(0, m.grp.position.y, 0); m.grp.rotation.y = 0; // turned to face the camera's way, at the origin
  gl.scene.add(m.grp);
  // framed to fit her: from a little water under her up to the masthead, with a margin
  // (only what's drawn: the crew, hidden here, are skinned figures whose bounds sit where their bones were last posed,
  // which can be far from her: counted, they framed an empty sea, ROADMAP 8t)
  m.grp.updateMatrixWorld(true);
  const box = new THREE.Box3();
  m.grp.traverseVisible(o => { const g = (o as THREE.Mesh).geometry; if (!g || !((o as THREE.Mesh).isMesh || (o as THREE.Line).isLine)) return; g.computeBoundingBox(); if (g.boundingBox) box.union(g.boundingBox.clone().applyMatrix4(o.matrixWorld)); });
  const lo = Math.max(box.min.y, 0) - 0.6;
  const cam = gl.camera, tall = box.max.y - lo, mid = new THREE.Vector3((box.min.x + box.max.x) / 2, (lo + box.max.y) / 2, (box.min.z + box.max.z) / 2);
  cam.position.copy(mid).addScaledVector(VIEW, -(tall * 0.6) / Math.tan(cam.fov * Math.PI / 360)); cam.lookAt(mid);
  horizonHaze(gl);
  gl.renderer.render(gl.scene, cam);
  const url = gl.renderer.domElement.toDataURL('image/jpeg', 0.86);
  gl.scene.remove(m.grp);
  m.grp.traverse(o => { const me = o as THREE.Mesh; if (me.isMesh) { me.geometry?.dispose(); } });
  cache.set(key, url); keep(key, url);
  return url;
}
