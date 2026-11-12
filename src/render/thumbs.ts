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
 * 3D model the sim sails, on a gentle reach, from off her starboard bow. One small offscreen renderer draws them all;
 * each picture is kept until her set-up changes.
 *
 * Looks (the owner chooses: ROADMAP, "the boat cards' pictures"):
 * - 'flat': a flat blue sky over a flat blue sea (as it was);
 * - 'bay': on the Bay at golden hour, the sun low off her bow, a physical sky (Preetham, as the main view) and the
 *   water rippled and reflecting it;
 * - 'studio': alone in soft studio light on a dark gradient, her whole hull to the keel showing.
 */
export type ThumbLook = 'flat' | 'bay' | 'studio';
const W = 400, H = 300;
/** The camera looks this way: from off her starboard bow, a little above her deck. */
const VIEW = new THREE.Vector3(-17, -0.6, 16).normalize();
interface GL { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; tick?: (t: number) => void }
const gls = new Map<ThumbLook, GL>();
let renderer: THREE.WebGLRenderer | null = null;
const cache = new Map<string, string>();

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); return t;
}

/** A tileable ripple normal map: many short wave trains running every way, longer ones stronger (as a wind sea's
 * spectrum falls off with frequency), with fixed random phases so every picture has the same water. */
function rippleNormals(): THREE.Texture {
  const N = 256, img = new ImageData(N, N);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const waves: [number, number, number, number][] = [];
  for (let i = 0; i < 40; i++) {
    const k = 2 + rnd() * 14, th = rnd() * Math.PI * 2 * 0.35 - 0.6; // (mostly running one way, downwind, with a spread)
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

function setup(look: ThumbLook): GL {
  renderer ??= (() => {
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setSize(W, H, false); r.setPixelRatio(1);
    r.outputColorSpace = THREE.LinearSRGBColorSpace; // as the main view (three-setup.ts)
    return r;
  })();
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(27, W / H, 0.5, 20000);
  if (look === 'flat') {
    scene.background = new THREE.Color(0x9fc6e3);
    scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x29485a, 0.85 * Math.PI));
    const sun = new THREE.DirectionalLight(0xfff3dd, 0.75 * Math.PI); sun.position.set(-300, 500, 200); scene.add(sun);
    const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshLambertMaterial({ color: 0x2c6488 })); sea.rotation.x = -Math.PI / 2; scene.add(sea);
  } else if (look === 'bay') {
    // the sun 7° up, ahead of her and off to port of the camera: warm light on her starboard side and a glitter path
    // on the water beyond her (golden hour on the Bay: the sun low in the west, behind the Gate)
    // (the camera looks along VIEW; the sun 65° to the left of that, so it lights her starboard side from ahead and the
    // glow of the low sun sits on the horizon at the left of the picture)
    const el = 7 * Math.PI / 180, v = VIEW.clone().setY(0).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), 65 * Math.PI / 180);
    const sunDir = new THREE.Vector3(v.x * Math.cos(el), Math.sin(el), v.z * Math.cos(el)).normalize();
    const sky = new Sky(); sky.scale.setScalar(10000);
    const sm = sky.material as THREE.ShaderMaterial;
    Object.assign(sm.uniforms, { turbidity: { value: 3.2 }, rayleigh: { value: 2.2 }, mieCoefficient: { value: 0.006 } });
    sm.uniforms.mieDirectionalG.value = 0.85; sm.uniforms.cloudCoverage.value = 0.25; sm.uniforms.cloudDensity.value = 0.3;
    sm.uniforms.sunPosition.value.copy(sunDir);
    // (the analytic sky is HDR: the main view's exposure curve, render/scene.ts)
    sm.uniforms.skyExposure = { value: 1.6 };
    sm.fragmentShader = 'uniform float skyExposure;\n' + sm.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( 1.0 - exp( -texColor * skyExposure ), 1.0 );');
    scene.add(sky);
    // the sea reflects the sky: an environment map made from it
    const pm = new THREE.PMREMGenerator(renderer!), skyScene = new THREE.Scene(); skyScene.add(sky.clone());
    const env = pm.fromScene(skyScene, 0, 1, 20000).texture;
    const sun = new THREE.DirectionalLight(0xffcf96, 1.05 * Math.PI); sun.position.copy(sunDir).multiplyScalar(500); scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xc9d6ea, 0x3a4a52, 0.55 * Math.PI));
    const nm = rippleNormals(); nm.repeat.set(500, 500); // (a tile 32 m across: wavelets 2–16 m long, as a 10 kt breeze raises)
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshStandardMaterial({ color: 0x0f2c3c, roughness: 0.16, metalness: 0, envMap: env, envMapIntensity: 1.0, normalMap: nm, normalScale: new THREE.Vector2(0.35, 0.35) }));
    sea.rotation.x = -Math.PI / 2; scene.add(sea); sea.name = 'sea';
    // haze over the far water, the colour of the sky at the horizon (read off the sky itself), so sea meets sky softly
    scene.fog = new THREE.Fog(0xffffff, 300, 3500); (sky.material as THREE.ShaderMaterial).fog = false;
  } else {
    // studio: a dark blue-grey gradient behind, a soft key light high off her bow, a cool rim light from astern
    scene.background = canvasTex(512, 384, g => {
      const r = g.createRadialGradient(256, 170, 20, 256, 200, 380); r.addColorStop(0, '#3b4656'); r.addColorStop(0.55, '#1c232d'); r.addColorStop(1, '#090b0f');
      g.fillStyle = r; g.fillRect(0, 0, 512, 384);
    });
    const key = new THREE.DirectionalLight(0xfff4e6, 1.0 * Math.PI); key.position.set(14, 18, -12); scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd4ff, 0.9 * Math.PI); rim.position.set(-12, 8, 18); scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xdfe7f2, 0x1a1e24, 0.45 * Math.PI));
  }
  return { renderer: renderer!, scene, camera };
}

/** The fog's colour: the sky just above the horizon, as this camera sees it (the sea hidden for a moment). */
function horizonHaze(gl: GL, cam: THREE.PerspectiveCamera): void {
  const sea = gl.scene.getObjectByName('sea')!, fog = gl.scene.fog as THREE.Fog;
  const far = cam.position.clone().addScaledVector(VIEW.clone().setY(0).normalize(), 9000).setY(60).project(cam); // (a little above the horizon)
  const px = Math.round((far.x * 0.5 + 0.5) * W), py = Math.round((far.y * 0.5 + 0.5) * H);
  sea.visible = false; gl.renderer.render(gl.scene, cam); sea.visible = true;
  const gc = gl.renderer.getContext(), buf = new Uint8Array(4);
  gc.readPixels(Math.min(W - 1, Math.max(0, px)), Math.min(H - 1, Math.max(0, py)), 1, 1, gc.RGBA, gc.UNSIGNED_BYTE, buf);
  fog.color.setRGB(buf[0] / 255, buf[1] / 255, buf[2] / 255);
}

/** Her picture, as a data URL (cached by her looks). */
export function boatThumb(spec: BoatSpec, S: Settings, look: ThumbLook = 'flat', turn = 0): string {
  const key = JSON.stringify([look, turn, spec.hull, spec.deck, spec.cabinTop, spec.poleSide, spec.hatch, spec.sails, spec.club, spec.name, spec.nameColor, spec.companionway, spec.navLights, spec.lineColors, spec.perf.mast, spec.perf.boom, spec.perf.outboard]);
  const hit = cache.get(key); if (hit) return hit;
  let gl = gls.get(look); if (!gl) { gl = setup(look); gls.set(look, gl); }
  // her, as the sim builds her: a quiet world with just her in it, sailing a gentle reach with her flags flying
  const w = new World(COURSES[0], { ...S, boat: spec, boatId: spec.id, boats: [spec], opponents: [], fleet: 0, mode: 'sail', sailFrom: 'cityfront', sailTo: '', windKind: 'west', windKt: 10, traffic: 0 }, 1, { freeSail: true, showFlags: true });
  const b = w.user;
  // she sails: twenty seconds on a close reach, port tack, in the real physics (the crew trimming), so her sails, heel and
  // flags all answer the same apparent wind; then the picture, from off her starboard bow (her leeward side)
  for (let i = 0; i < 60 * 20; i++) w.idle(DT, -55);
  const m = buildBoatMesh(b);
  for (let i = 0; i < 90; i++) syncBoatMesh(m, b, i / 30); // (the windex and flags swing round to the wind as they would)
  m.crew.group.visible = false; // just the boat
  m.grp.position.set(0, look === 'studio' ? 0.4 : m.grp.position.y, 0); m.grp.rotation.y = turn; // turned to face the camera's way, at the origin
  gl.scene.add(m.grp);
  // framed to fit her: from the keel (studio) or the water up to the masthead, with a margin, and her whole length
  const box = new THREE.Box3().setFromObject(m.grp), lo = look === 'studio' ? box.min.y : Math.max(box.min.y, 0) - 0.6; // (a little water under her)
  const cam = gl.camera, tall = box.max.y - lo, mid = new THREE.Vector3((box.min.x + box.max.x) / 2, (lo + box.max.y) / 2, (box.min.z + box.max.z) / 2);
  const dist = (tall * 0.6) / Math.tan(cam.fov * Math.PI / 360);
  cam.position.copy(mid).addScaledVector(VIEW, -dist); cam.lookAt(mid);
  if (look === 'bay') horizonHaze(gl, cam);
  gl.renderer.render(gl.scene, cam);
  const url = gl.renderer.domElement.toDataURL('image/jpeg', 0.86);
  gl.scene.remove(m.grp);
  m.grp.traverse(o => { const me = o as THREE.Mesh; if (me.isMesh) { me.geometry?.dispose(); } });
  cache.set(key, url);
  return url;
}
