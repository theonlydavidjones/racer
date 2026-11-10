import './three-setup';
import * as THREE from 'three';
import { D2R, V, ZONE } from '../core/math';
import type { World } from '../sim/world';
import { Puffs, TerrainGrid } from '../environment/wind';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { sunPosition } from '../environment/sun';
import { LL } from '../geo/geo';
import { laylinesFor } from '../sim/laylines';
import { buildBoatMesh, syncBoatMesh, type BoatMesh } from './boatMesh';
import { P3 } from './coords';
import { addLandscape, bridgeLights } from './landscape';
import type { Terrain } from './terrain';

export const VIEWS = ['Cockpit', 'Chase', 'Overhead'] as const;

/**
 * How much of the summer fog bank is piled up at the Golden Gate, 0..1, by month and local hour. An estimate,
 * not data: the marine layer is a summer thing (June–September), thickest from mid-afternoon into the night,
 * often still there in the morning; thinner in spring and autumn; rare in winter.
 */
export function fogBankAmount(tMin: number): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'numeric', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(tMin * 60000));
  const mo = +parts.find(p => p.type === 'month')!.value, h = +parts.find(p => p.type === 'hour')!.value;
  const season = [0.05, 0.05, 0.1, 0.2, 0.4, 0.7, 0.85, 0.85, 0.6, 0.3, 0.1, 0.05][mo - 1];
  const daily = h < 10 ? 0.7 : h < 13 ? 0.35 : h < 15 ? 0.6 : h < 21 ? 1 : 0.9; // burns back by midday, pours in again from mid-afternoon
  return season * daily;
}

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
  // the sky reflected in the water, strongest at a glancing angle (toward the horizon)
  float fres = pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 4.0);
  totalEmissiveRadiance += uSkyCol * fres * 0.55 * uDay * (1.0 - 0.35 * max(gust, 0.0));
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
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 90000);
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
  /* sun and sky, for the race day and the clock */
  private sky = new Sky();
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private water!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshPhongMaterial>;
  private skyUni = { uSkyCol: { value: new THREE.Color('#aecbdb') }, uDay: { value: 1 } };
  private fogBank: THREE.Sprite[] = [];
  private skyAcc = 1;
  /** The land (real terrain), once it has loaded, and the month to colour it for. */
  private land: Terrain | null = null;
  private landMonth = 0;

  constructor(canvas: HTMLCanvasElement) {
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true }); // the view runs from the tiller to Mt Tamalpais, 25 km off
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // r128 output, see three-setup.ts
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = this.scene;
    const SKY = new THREE.Color('#aecbdb');
    scene.background = SKY;
    scene.fog = new THREE.Fog(SKY, 1500, 70000); // a clear day on the bay: Tamalpais hazy but plain at 25 km
    this.camera.rotation.order = 'YXZ';
    // light intensities ×π: r155+ dropped the legacy light units the prototype was tuned for
    scene.add(this.hemi = new THREE.HemisphereLight(0xe8f2ff, 0x29485a, 0.85 * Math.PI));
    const sun = this.sun = new THREE.DirectionalLight(0xfff3dd, 0.75 * Math.PI); sun.position.set(-300, 500, 200); scene.add(sun); scene.add(sun.target);
    // shadows from the sun: a small, sharp shadow map that follows your boat (sails on the deck and the water)
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 10, far: 1200 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    // the sky: a physical sky dome (Preetham), scaled for this renderer's untonemapped output
    const sky = this.sky; sky.scale.setScalar(80000);
    const sm = sky.material as THREE.ShaderMaterial;
    // Twilight: the analytic sky goes black once the sun is down, but the real one doesn't: a glow on the
    // horizon toward the sun and deep blue overhead, fading over the next half hour or so.
    Object.assign(sm.uniforms, { skyExposure: { value: 1.25 }, uTwi: { value: 0 }, uTwiHor: { value: new THREE.Color() }, uTwiZen: { value: new THREE.Color() } });
    sm.fragmentShader = 'uniform float skyExposure; uniform float uTwi; uniform vec3 uTwiHor; uniform vec3 uTwiZen;\n' + sm.fragmentShader
      .replace('gl_FragColor = vec4( texColor, 1.0 );', `vec3 outC = 1.0 - exp( -texColor * skyExposure );
      vec3 dirT = normalize( vWorldPosition - cameraPosition );
      float toward = max( 0.0, dot( normalize( dirT.xz + 1e-5 ), normalize( vSunDirection.xz + 1e-5 ) ) );
      vec3 tw = mix( uTwiHor * ( 0.55 + 0.6 * toward * toward ), uTwiZen, pow( clamp( dirT.y, 0.0, 1.0 ), 0.45 ) );
      gl_FragColor = vec4( max( outC, tw * uTwi ), 1.0 );`);
    Object.assign(sm.uniforms, { turbidity: { value: 2.0 }, rayleigh: { value: 2.6 }, mieCoefficient: { value: 0.004 } });
    sm.uniforms.mieDirectionalG.value = 0.8; sm.uniforms.cloudCoverage.value = 0.18; sm.uniforms.cloudDensity.value = 0.35;
    scene.add(sky); scene.background = null;
    this.buildFogBank();

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
    wtex.wrapS = wtex.wrapT = THREE.RepeatWrapping; wtex.repeat.set(4000, 4000);
    wtex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const WSIZE = 120000; this.tile = WSIZE / 4000; // 30 m tiles
    wtex.center.set(0.5, 0.5);
    this.puffTex.magFilter = this.puffTex.minFilter = THREE.LinearFilter;
    // Phong for the sun's glitter path (the ripples, used as a bump map, break it into sparkles)
    const waterMat = new THREE.MeshPhongMaterial({ color: 0x3b6d84, map: wtex, bumpMap: wtex, bumpScale: 1.6, specular: 0x8a8a80, shininess: 140 });
    waterMat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, this.puffUni, this.skyUni);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPuffXZ;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPuffXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uPuff; uniform vec2 uPuffO; uniform float uPuffS; uniform float uMeanKt; uniform vec3 uSkyCol; uniform float uDay; varying vec2 vPuffXZ;')
        .replace('#include <map_fragment>', WATER_FRAGMENT);
    };
    const water = this.water = new THREE.Mesh(new THREE.PlaneGeometry(WSIZE, WSIZE, 120, 120), waterMat); // 1 km tiles: one huge quad loses depth precision across its diagonal
    water.rotation.x = -Math.PI / 2; water.receiveShadow = true; scene.add(water);

    this.landMonth = new Date().getMonth() + 1;
    void addLandscape(scene, this.landMonth).then(t => { this.land = t; t.setSeason(this.landMonth); this.skyAcc = 1; });

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
    this.laylineAcc = 1; this.puffAcc = 1; this.skyAcc = 1;
    const month = +w.raceDate.slice(5, 7) || new Date().getMonth() + 1; // the grass: gold in summer and autumn, green after the rains
    if (month !== this.landMonth) { this.landMonth = month; this.land?.setSeason(month); }
    const key = `${Math.round(w.C.center.x)},${Math.round(w.C.center.y)}`;
    if (key !== this.terrainKey) { this.terrain = new TerrainGrid(w.C.center.x, w.C.center.y); this.terrainKey = key; }
    this.boatMeshes.forEach(m => this.scene.remove(m.grp));
    this.boatMeshes = w.boats.map(b => {
      const m = buildBoatMesh(b); this.scene.add(m.grp);
      m.grp.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      return m;
    });
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

  /**
   * The summer fog bank: the marine layer pouring in through the Golden Gate on summer afternoons, over the
   * Marin Headlands and the Presidio. How thick it is by month and hour is an estimate (no fog records are
   * reachable from here): common on summer afternoons and evenings, often lingering on summer mornings,
   * rare in winter. It's scenery only.
   */
  private buildFogBank(): void {
    // a lumpy, billowing texture: many soft blobs, brighter on top, greyer underneath
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const c = cv.getContext('2d')!, rnd = (() => { let a = 7; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
    for (let i = 0; i < 70; i++) {
      const x = 30 + rnd() * 196, y = 40 + rnd() * 60, r = 18 + rnd() * 34, g = c.createRadialGradient(x, y, 2, x, y, r);
      const shade = Math.round(222 + 33 * (1 - y / 128));
      g.addColorStop(0, `rgba(${shade},${shade},${shade + 6},0.55)`); g.addColorStop(1, `rgba(${shade},${shade},${shade + 6},0)`);
      c.fillStyle = g; c.fillRect(0, 0, 256, 128);
    }
    const tex = new THREE.CanvasTexture(cv);
    // along the Gate, from Point Bonita and Lands End to the bridge, banked up over the Marin Headlands and the Presidio
    const spots: [number, number, number, number][] = [
      [37.8155, -122.53, 900, 110], [37.822, -122.508, 850, 120], [37.808, -122.51, 800, 100], [37.816, -122.493, 760, 90],
      [37.828, -122.488, 700, 170], [37.834, -122.502, 900, 220], [37.803, -122.488, 700, 140], [37.812, -122.482, 560, 70],
      [37.84, -122.477, 800, 240], [37.797, -122.473, 650, 170], [37.824, -122.52, 1000, 70], [37.846, -122.495, 1000, 280],
      [37.82, -122.484, 600, 150], [37.8, -122.5, 900, 120]
    ];
    for (const [lat, lon, size, h] of spots) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
      const p = LL(lat, lon); sp.position.set(p.x, h, -p.y); sp.scale.set(size * 1.7, size * 0.75, 1); sp.visible = false;
      this.scene.add(sp); this.fogBank.push(sp);
    }
  }

  /** Sun, sky light, haze and fog bank for the moment `tMin` (minutes since epoch, UTC). */
  private updateSky(tMin: number, focus: { x: number; y: number }): void {
    const sp = sunPosition(tMin * 60000), el = sp.el, D = Math.PI / 180;
    const dir = new THREE.Vector3(Math.sin(sp.az * D) * Math.cos(el * D), Math.sin(el * D), -Math.cos(sp.az * D) * Math.cos(el * D)); // x east, y up, −z north
    const sm = this.sky.material as THREE.ShaderMaterial;
    sm.uniforms.sunPosition.value.copy(dir);
    const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const day = ss(-8, 8, el), up = ss(-1, 14, el), warm = 1 - ss(2, 25, el);
    // the sun: warm and weak near the horizon, gone below it
    this.sun.color.setRGB(1, 0.95 - 0.33 * warm, 0.87 - 0.5 * warm);
    this.sun.intensity = 0.75 * Math.PI * up;
    const f = focus;
    this.sun.target.position.set(f.x, 0, -f.y); this.sun.position.copy(this.sun.target.position).addScaledVector(dir.y > 0.05 ? dir : new THREE.Vector3(0, 1, 0), 500);
    this.sun.castShadow = up > 0.05;
    // twilight sky colours: civil twilight (sun 0–6° down) still glows; darker through nautical twilight
    const tw = 1 - ss(-12, -1, el), glow = ss(-10, -2, el);
    sm.uniforms.uTwi.value = 1 - ss(-1, 4, el);
    sm.uniforms.uTwiHor.value.setRGB(0.05 + 0.75 * glow, 0.06 + 0.42 * glow, 0.12 + 0.3 * glow);
    sm.uniforms.uTwiZen.value.setRGB(0.03 + 0.17 * glow, 0.05 + 0.25 * glow, 0.12 + 0.38 * glow);
    void tw;
    // the sky's light: daylight blue, dimming and cooling through dusk (never fully dark: you still need to see)
    this.hemi.intensity = Math.PI * (0.3 + 0.55 * day + 0.12 * glow * (1 - day));
    this.hemi.color.setRGB(0.91 - 0.4 * (1 - day), 0.95 - 0.35 * (1 - day), 1 - 0.25 * (1 - day));
    // haze toward the horizon: blue-grey by day, warm near sunset, deep blue at dusk
    const haze = new THREE.Color('#b4cfdf').lerp(new THREE.Color('#d9b9a0'), warm * up).lerp(new THREE.Color('#2a3350'), 1 - day).lerp(new THREE.Color('#0d1424'), 1 - ss(-12, -6, el));
    (this.scene.fog as THREE.Fog).color.copy(haze);
    this.skyUni.uSkyCol.value.copy(haze); this.skyUni.uDay.value = 0.3 + 0.7 * day;
    (this.water.material.specular as THREE.Color).setRGB(0.55, 0.55 - 0.2 * warm, 0.5 - 0.3 * warm).multiplyScalar(up);
    for (const l of bridgeLights) l.visible = el < 3; // the bridge lights come on around sunset
    if (this.land) this.land.lights.visible = el < 1;
    // the fog bank
    const fogAmt = fogBankAmount(tMin);
    for (const sprite of this.fogBank) {
      sprite.visible = fogAmt > 0.05;
      const m = sprite.material as THREE.SpriteMaterial;
      m.opacity = Math.min(1, fogAmt * 1.25) * (0.35 + 0.65 * day);
      m.color.setRGB(0.55 + 0.45 * day, 0.55 + 0.45 * day - 0.06 * warm * up, 0.6 + 0.4 * day - 0.15 * warm * up);
    }
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
    this.skyAcc += dt;
    if (this.skyAcc > 0.5) { this.skyAcc = 0; this.updateSky(w.clockUtc, w.user); }
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
