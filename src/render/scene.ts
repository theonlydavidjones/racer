import './three-setup';
import * as THREE from 'three';
import { setVisibility } from '../environment/weather';
import { D2R, V, ZONE } from '../core/math';
import type { World } from '../sim/world';
import type { MarkShape } from '../courses/course';
import { PLACES } from '../sim/places';
import { Puffs, TerrainGrid } from '../environment/wind';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { sunPosition } from '../environment/sun';
import { LL } from '../geo/geo';
import { laylinesFor } from '../sim/laylines';
import { disposeUnused } from './dispose';
import { FittingCull } from './fittings';
import { buildBoatMesh, syncBoatMesh, type BoatMesh } from './boatMesh';
import { P3 } from './coords';
import { addLandscape, bridgeLights } from './landscape';
import { updateNight } from './night';
import { REFLECTIVE } from './boatMesh';
import type { Terrain } from './terrain';
import { SignalMast } from './flags';
import { Wakes } from './wake';
import { setRestrictedVisibility } from './navLights';
import { Moorings } from './moored';
import { Wildlife } from './wildlife';
import { Harbor } from './marina';
import { addWharf } from './wharf';
import { VesselView } from './vessels';
import { landAt } from '../environment/sea';
import { N_WAVES, WAVE_GLSL, WaveSet, boatOnWaves, waterGrid } from './waves';
import type { SeaHere } from '../environment/sea';

export const VIEWS = ['Cockpit', 'Chase', 'Overhead'] as const;

/**
 * How much of the summer fog bank is piled up at the Golden Gate, 0..1, by month and local hour. An estimate,
 * not data: the marine layer is a summer thing (June–September), thickest from mid-afternoon into the night,
 * often still there in the morning; thinner in spring and autumn; rare in winter.
 */
const FOG_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'numeric', hour: 'numeric', hourCycle: 'h23' }); // (made once: it's slow to build)
export function fogBankAmount(tMin: number): number {
  const parts = FOG_FMT.formatToParts(new Date(tMin * 60000));
  const mo = +parts.find(p => p.type === 'month')!.value, h = +parts.find(p => p.type === 'hour')!.value;
  const season = [0.05, 0.05, 0.1, 0.2, 0.4, 0.7, 0.85, 0.85, 0.6, 0.3, 0.1, 0.05][mo - 1];
  const daily = h < 10 ? 0.7 : h < 13 ? 0.35 : h < 15 ? 0.6 : h < 21 ? 1 : 0.9; // burns back by midday, pours in again from mid-afternoon
  return season * daily;
}

/** Wind map on the water: PUFF_N × PUFF_N texels over PUFF_SPAN metres around the camera. */
const PUFF_N = 160, PUFF_SPAN = 3200;
/** Sea map resolution (samples per side). */
const SEA_N = 24;
/** Current map resolution (samples per side), for the flowing texture and tidelines. */
const CUR_N = 56;

/**
 * Water colour from the wind on it. Stronger wind roughens the surface: denser, higher-contrast ripples and a
 * darker look (rough water reflects less of the bright sky), whitecaps from about 12 kt. Lighter wind
 * leaves it smoother and paler. Outside the wind map the water looks as it does in the mean wind.
 */
/** Value noise (for foam and debris patterns that don't repeat). */
const VNOISE = `
float vhash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(vhash(i), vhash(i + vec2(1.0, 0.0)), f.x), mix(vhash(i + vec2(0.0, 1.0)), vhash(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
const WATER_FRAGMENT = `
  // the current where you are: the ripples drift with it (two-phase flow mapping), relative to the mean drift
  vec2 cuv = ((vWaveP - uCurO) / uCurCell + 0.5) / ${CUR_N}.0;
  float cIn = smoothstep(0.0, 0.08, min(min(cuv.x, 1.0 - cuv.x), min(cuv.y, 1.0 - cuv.y)));
  vec4 cs = texture2D(uCur, clamp(cuv, 0.0, 1.0));
  vec2 dflow = (mix(uCurMean, (cs.rg - 0.5) * 4.0, cIn) - uCurMean) * 6.0;
  vec2 fuv = (uFlowM * vec3(dflow, 0.0)).xy;
  float ph0 = fract(uTime / 6.0), ph1 = fract(uTime / 6.0 + 0.5);
  vec4 texelColor = mix(texture2D( map, vMapUv - fuv * ph0 ), texture2D( map, vMapUv - fuv * ph1 + vec2(0.37, 0.21) ), abs(2.0 * ph0 - 1.0));
  vec2 puv = (vec2(vPuffXZ.x, -vPuffXZ.y) - uPuffO) / uPuffS;
  float edge = 1.0 - smoothstep(0.3, 0.5, length(puv - 0.5)); // faded out in a circle over the map's outer part, so its edge never shows
  float kw = mix(1.0, 0.4 + 1.4 * texture2D(uPuff, clamp(puv, 0.0, 1.0)).r, edge);
  // the gusts inside a puff: the map is 20 m cells, but the wind in a puff comes in smaller bursts (turbulence a few
  // tens of metres across), which roughen the water in ragged patches and cat's paws. Carried along with the
  // puffs (uPuffOff: how far they've carried, added up step by step at their speed, so a shift of the wind turns the
  // drift from then on and doesn't swing the whole pattern), so the dark patch and its ragged edge move down the wind together.
  vec2 adv = vWaveP - uPuffOff;
  float turb = (vnoise(adv / 46.0) - 0.5) * 0.65 + (vnoise(adv / 13.0 + 5.3) - 0.5) * 0.35;
  float ex = kw - 1.0 + turb * (0.05 + 0.25 * abs(kw - 1.0)) * edge;
  // in light air the wind is patchy: cat's paws of ripples on otherwise glassy water
  float paws = 1.0 - smoothstep(4.0, 8.0, uMeanKt);
  ex += paws * edge * 0.18 * (smoothstep(0.45, 0.75, vnoise(adv / 28.0 + 1.7)) - 0.45);
  float gust = clamp(ex / 0.15, -1.0, 1.0); // a 15% puff is plainly darker; a 5% one barely shows
  vec4 fine = texture2D( map, vMapUv * 2.7 + vec2(0.31, 0.17) );
  // how rough the water is: the ripples (capillary and short gravity waves, 2–30 cm) grow with the wind, in seconds
  float rough = clamp(0.85 + 0.55 * gust - 0.35 * paws * edge, 0.2, 1.4);
  diffuseColor.rgb *= mix(vec3(1.0), texelColor.rgb * mix(vec3(1.0), fine.rgb * 1.12, clamp(rough - 0.6, 0.0, 1.0)), rough);
  // a puff is darker and bluer (rough water shows the deep water's colour), a lull paler and greyer (smooth water
  // shows the sky)
  diffuseColor.rgb *= 1.0 - 0.34 * max(gust, 0.0) + 0.26 * max(-gust, 0.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.86, 0.95, 1.08), max(gust, 0.0) * 0.6);
  // tidelines: where the current converges, a smooth slick band collects foam and debris (thinned to its ridge)
  float tlI = cs.b * cIn, tdx = 1.0 / ${CUR_N}.0;
  float tlG = length(vec2(texture2D(uCur, cuv + vec2(tdx, 0.0)).b - texture2D(uCur, cuv - vec2(tdx, 0.0)).b, texture2D(uCur, cuv + vec2(0.0, tdx)).b - texture2D(uCur, cuv - vec2(0.0, tdx)).b));
  // the front: a thin line where the convergence crosses ~4.5e-4 /s (distance to that level, in texels, from the
  // local slope), a few metres of foam and debris; inside it the water is a little smoother (a slick)
  float tlD = (tlI - 0.28) / max(0.5 * tlG, 1e-3), far = 1.0 - smoothstep(800.0, 2500.0, length(vPuffXZ - cameraPosition.xz));
  float tl = (1.0 - smoothstep(0.015, 0.055, abs(tlD))) * step(0.004, tlG) * far;
  float slick = smoothstep(0.24, 0.34, tlI) * far;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.05 + vec3(0.012), slick * 0.5);
  // broken up along its length into patches of foam, weed and debris
  float patchy = smoothstep(0.42, 0.68, vnoise(vWaveP / 22.0)) * smoothstep(0.25, 0.6, vnoise(vWaveP / 6.0 + 7.3));
  float specks = smoothstep(0.62, 0.8, vnoise(vWaveP / 0.9 + 3.1));
  float debris = tl * patchy * (0.35 + 0.65 * specks);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.83, 0.76), clamp(debris * 0.8, 0.0, 0.8));
  // the waves: their slope tilts the surface (light and reflections), whitecaps break on the crests
  float camDF = length(vPuffXZ - cameraPosition.xz);
  float foot = max(length(dFdx(vWaveP)), length(dFdy(vWaveP))); // metres of water under this pixel
  vec3 ws = waveSlope(vWaveP, vKW, vKS, foot);
  vec3 waveN = normalize((viewMatrix * vec4(normalize(vec3(-ws.x, 1.0, ws.y)), 0.0)).xyz);
  float hsLocal = max(0.04, length(vec2(vKW * uHs.x, vKS * uHs.y)));
  float crest = ws.z / (0.5 * hsLocal) * (1.0 - smoothstep(300.0, 1500.0, camDF));
  // whitecaps: patches a few metres across covering the fraction of the water the coverage law gives (vWhite: sea.ts),
  // drifting with the wind and breaking and fading in seconds, leaning to the crests. The threshold is the noise field's
  // own quantile for that fraction (fitted from its distribution: T = 0.5665 − 0.1835·x − 0.0227·x², x = log10 W),
  // so the area that shows white is the area the law says is white
  float Wc = clamp(vWhite, 0.0, 0.2), lx = log(max(Wc, 1e-4)) / log(10.0), thr = 0.5665 - 0.1835 * lx - 0.0227 * lx * lx;
  // (each patch drawn out downwind, as the foam trails behind a breaking crest: 3.5 m along the wind, 1.5 m across;
  // finer noise makes its ragged edge)
  vec2 wdc = normalize(uPuffV + vec2(1e-5, 0.0)), cp = vec2(dot(adv, wdc) / 3.5, dot(adv, vec2(-wdc.y, wdc.x)) / 1.5) + vec2(uTime * 0.3, 0.0);
  float cf = 0.65 * vnoise(cp) + 0.35 * vnoise(cp * 2.3 + vec2(7.1, 3.3)) + 0.07 * (vnoise(cp * 7.0 + 2.0) - 0.5);
  // (brightest on the crests, where they break; the crests don't change the area, which the law sets)
  float caps = Wc > 1e-4 ? smoothstep(thr - 0.01, thr + 0.05, cf) * (0.65 + 0.35 * smoothstep(0.3, 0.7, vnoise(cp * 4.3 + 11.0))) * (0.7 + 0.3 * smoothstep(0.0, 1.0, crest)) : 0.0; // (ragged, broken up inside: churned water, not paint)
  // ... and from Beaufort 7 (28–33 kt), white foam from the breaking waves blown in streaks along the wind (WMO's
  // Beaufort scale), more as it blows harder
  vec2 wd = normalize(uPuffV + vec2(1e-5, 0.0)), wq = vec2(dot(vWaveP, wd) / 7.0, dot(vWaveP, vec2(-wd.y, wd.x)) / 0.3);
  float streak = smoothstep(13.0, 17.0, uMeanKt * 0.5144) * smoothstep(0.78, 0.92, vnoise(wq + vec2(uTime * 0.05, 0.0))) * smoothstep(0.3, 0.6, vnoise(wq * vec2(0.4, 1.0) + 4.0)) * 0.3;
  float foam = max(caps * (0.75 + 0.25 * fine.g), streak) * (1.0 - smoothstep(1200.0, 4000.0, camDF));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95), clamp(foam, 0.0, 0.85));
  // the sky reflected in the water, strongest at a glancing angle (toward the horizon)
  // (Schlick's Fresnel for water: 2% straight down, nearly all at a glancing angle; the wave slopes facing away
  // from you catch the bright sky, the ones facing you look into the dark water)
  float fres = 0.02 + 0.98 * pow(1.0 - clamp(abs(dot(waveN, normalize(vViewPosition))), 0.0, 1.0), 5.0);
  // Rough water reflects less of the sky at a glancing angle: the ripples' facets tilt toward you and show the dark
  // water (Cox & Munk 1954: the slope variance grows with the wind). This is what makes a puff a dark band on the
  // water when you look upwind from the deck, and a lull a bright, glassy one.
  float mirror = clamp(1.4 - 0.5 * rough, 0.68, 1.28);
  diffuseColor.rgb *= 1.0 - 0.55 * fres * (1.0 - foam);
  totalEmissiveRadiance += uSkyCol * fres * 0.95 * uDay * mirror * (1.0 - foam);
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
  private fittings = new FittingCull();
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
  private puffSum = new Float32Array(PUFF_N * PUFF_N);
  private puffTex = new THREE.DataTexture(this.puffData, PUFF_N, PUFF_N, THREE.RGBAFormat);
  private puffUni = { uPuff: { value: this.puffTex as THREE.Texture }, uPuffO: { value: new THREE.Vector2() }, uPuffS: { value: PUFF_SPAN }, uMeanKt: { value: 12 }, uPuffV: { value: new THREE.Vector2() }, uPuffOff: { value: new THREE.Vector2() } };
  private puffT: number | null = null;
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
  /** The sun's elevation (°), for the city's night lights. */
  private sunEl = 45;
  /** The sky as a cube map, for reflections on gelcoat, varnish and alloy (refreshed every half minute). */
  private envTarget = new THREE.WebGLCubeRenderTarget(128);
  private envCam = new THREE.CubeCamera(1, 100000, this.envTarget);
  private envAcc = 99;
  /** The waves: one set, drawn by the water shader and ridden by the boats. */
  private waves = new WaveSet();
  private waveA = new Float32Array(N_WAVES * 4);
  private waveB = new Float32Array(N_WAVES * 4);
  private waveUni = { uWaveA: { value: this.waveA }, uWaveB: { value: this.waveB }, uTime: { value: 0 }, uHs: { value: new THREE.Vector2() }, uWhiteRef: { value: 0 } };
  private seaRef: SeaHere | null = null;
  /** Wakes, bow waves and spray. */
  private wakes!: Wakes;
  /** Boats at anchor and on moorings, lying to the current and wind. */
  private moorings!: Moorings;
  /** Porpoises, seals and sea lions, and the birds. */
  private wildlife!: Wildlife;
  /** Ships, ferries and tour boats. */
  private vesselView!: VesselView;
  private pitches: number[] = [];
  /** Current map: the current (m/s) and where it converges (tidelines), around the focus. */
  private curData = new Uint8Array(CUR_N * CUR_N * 4);
  private curTex = new THREE.DataTexture(this.curData, CUR_N, CUR_N, THREE.RGBAFormat);
  private curUni = { uCur: { value: this.curTex as THREE.Texture }, uCurO: { value: new THREE.Vector2() }, uCurCell: { value: 50 }, uCurMean: { value: new THREE.Vector2() }, uFlowM: { value: new THREE.Matrix3() } };
  /** The race committee's signal flags, and the heading of whatever they're mounted on. */
  private signal: { mast: SignalMast; heading: number } | null = null;
  /** Marks, to lean and trail a wake in the current. */
  private markObjs: { p: { x: number; y: number }; float: THREE.Object3D; wake: THREE.Mesh; fixed?: boolean }[] = [];
  private wakeTex: THREE.CanvasTexture | null = null;
  private seaAcc = 0;
  /** Sea map: wind-sea and swell scale and whitecaps on a coarse grid (refreshed every 2 s), sampled into the wind map. */
  private seaGrid: { x0: number; y0: number; cell: number; v: Float32Array } | null = null;
  /** The land (real terrain), once it has loaded, and the month to colour it for. */
  private land: Terrain | null = null;
  private landMonth = 0;

  constructor(canvas: HTMLCanvasElement) {
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, stencil: true }); // the view runs from the tiller to Mt Tamalpais, 25 km off; the boats mark the stencil (navLights.ts)
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // r128 output, see three-setup.ts
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = this.scene;
    const SKY = new THREE.Color('#aecbdb');
    scene.background = SKY;
    scene.fog = new THREE.Fog(SKY, 1500, 57000); // a clear day on the bay: Tamalpais hazy but plain at 25 km
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
    Object.assign(sm.uniforms, { skyExposure: { value: 1.25 }, uTwi: { value: 0 }, uTwiHor: { value: new THREE.Color() }, uTwiZen: { value: new THREE.Color() }, uMurk: { value: 0 }, uMurkCol: { value: new THREE.Color() } });
    sm.fragmentShader = 'uniform float skyExposure; uniform float uTwi; uniform vec3 uTwiHor; uniform vec3 uTwiZen; uniform float uMurk; uniform vec3 uMurkCol;\n' + sm.fragmentShader
      .replace('gl_FragColor = vec4( texColor, 1.0 );', `vec3 outC = 1.0 - exp( -texColor * skyExposure );
      vec3 dirT = normalize( vWorldPosition - cameraPosition );
      float toward = max( 0.0, dot( normalize( dirT.xz + 1e-5 ), normalize( vSunDirection.xz + 1e-5 ) ) );
      vec3 tw = mix( uTwiHor * ( 0.55 + 0.6 * toward * toward ), uTwiZen, pow( clamp( dirT.y, 0.0, 1.0 ), 0.45 ) );
      gl_FragColor = vec4( mix( max( outC, tw * uTwi ), uMurkCol, uMurk ), 1.0 );`); // (under rain or fog, an overcast grey sky)
    Object.assign(sm.uniforms, { turbidity: { value: 2.0 }, rayleigh: { value: 2.6 }, mieCoefficient: { value: 0.004 } });
    sm.uniforms.mieDirectionalG.value = 0.8; sm.uniforms.cloudCoverage.value = 0.18; sm.uniforms.cloudDensity.value = 0.35;
    scene.add(sky); scene.background = null;
    sky.layers.enable(1); this.envCam.children.forEach(c => c.layers.set(1)); // the cube camera sees only the sky
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
    this.curTex.magFilter = this.curTex.minFilter = THREE.LinearFilter;
    // Phong for the sun's glitter path (the ripples, used as a bump map, break it into sparkles)
    const waterMat = new THREE.MeshPhongMaterial({ color: 0x3b6d84, map: wtex, bumpMap: wtex, bumpScale: 1.6, specular: 0x8a8a80, shininess: 140 });
    waterMat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, this.puffUni, this.skyUni, this.waveUni, this.curUni);
      const decl = 'uniform sampler2D uPuff; uniform vec2 uPuffO; uniform float uPuffS; uniform float uMeanKt; uniform vec2 uPuffV; uniform vec2 uPuffOff; uniform vec2 uHs; uniform float uWhiteRef;\nuniform sampler2D uCur; uniform vec2 uCurO; uniform float uCurCell; uniform vec2 uCurMean; uniform mat3 uFlowM;\nvarying vec2 vPuffXZ; varying vec2 vWaveP; varying float vKW; varying float vKS; varying float vWhite;\n' + WAVE_GLSL;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + decl)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 wp0 = modelMatrix * vec4(transformed, 1.0);
          vPuffXZ = wp0.xz;
          vec2 simP = vec2(wp0.x, -wp0.z);
          vec2 puvV = (simP - uPuffO) / uPuffS;
          float edgeV = 1.0 - smoothstep(0.3, 0.5, length(puvV - 0.5));
          vec4 smV = texture2D(uPuff, clamp(puvV, 0.0, 1.0));
          vKW = mix(1.0, smV.g * 2.0, edgeV); vKS = mix(1.0, smV.b * 2.0, edgeV); vWhite = mix(uWhiteRef, smV.a / 10.0, edgeV); // (whitecaps stored ×10: up to the 10% cap)
          vWaveP = simP;
          vec3 dsp = waveDisp(simP, vKW, vKS, length(wp0.xz - cameraPosition.xz));
          transformed += vec3(dsp.x, dsp.z, -dsp.y);
          vec2 wuv = vec2((wp0.x + 60000.0) / 120000.0, (60000.0 - wp0.z) / 120000.0);
          vMapUv = (mapTransform * vec3(wuv, 1.0)).xy;
          vBumpMapUv = (bumpMapTransform * vec3(wuv, 1.0)).xy;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSkyCol; uniform float uDay;\n' + decl + VNOISE)
        .replace('#include <map_fragment>', WATER_FRAGMENT)
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = waveN;')
        // the ripple texture's bumps (about 12 cm a texel) fade where a pixel covers more water than they can show, so
        // the far water doesn't alias into rows parallel to the horizon
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, waveN, smoothstep(0.12, 0.6, foot)));');
    };
    // the water: a mesh that follows the camera, fine near it and coarse far out, displaced by the waves
    const wg = waterGrid(), wgeo = new THREE.BufferGeometry();
    wgeo.setAttribute('position', new THREE.BufferAttribute(wg.pos, 3));
    wgeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(wg.pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    wgeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(wg.pos.length / 3 * 2), 2));
    wgeo.setIndex(new THREE.BufferAttribute(wg.index, 1));
    const water = this.water = new THREE.Mesh(wgeo, waterMat) as unknown as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshPhongMaterial>;
    water.frustumCulled = false; water.receiveShadow = true; water.renderOrder = 2; scene.add(water); // after the boats and their cockpit lids (boatMesh.ts)

    this.wakes = new Wakes(scene);
    this.moorings = new Moorings(scene, p => landAt(p) === false);
    this.harbor = new Harbor(scene); // West Harbor: docks, breakwaters, boats in their slips
    addWharf(scene); // Fisherman's Wharf and Pier 39: the open piers, breakwaters and the marina's docks
    this.wildlife = new Wildlife(scene, p => landAt(p) === false);
    if (import.meta.env.DEV) Object.assign(window, { __wild: this.wildlife, __renderer: renderer }); // for the scenery check (scripts/check/scenery.cjs)
    this.vesselView = new VesselView(scene);
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
      const m = L.mark.p, g = L.tracks[i], a = P3(m.x, m.y, 0.3), b = P3(m.x - g.x * 900, m.y - g.y * 900, 0.3);
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
  private harbor!: Harbor;
  setWorld(w: World): void {
    this.harbor.clearSlips(w.settings.boats?.map(b => b.slip) ?? []);
    this.laylineAcc = 1; this.puffAcc = 1; this.puffT = null; this.skyAcc = 1; this.seaRef = null; this.seaGrid = null; this.seaAcc = 99;
    // the ripples start lying across this race's wind (turning the drifted texture into place would sweep it past at speed)
    this.ripAngle = -w.windModel.base * D2R; this.wtex.offset.set(0, 0);
    this.waves = new WaveSet(); this.waves.setSwellPeriod(w.sea.swell?.tp ?? 12);
    this.wakes.reset(w.boats);
    const month = +w.raceDate.slice(5, 7) || new Date().getMonth() + 1; // the grass: gold in summer and autumn, green after the rains
    if (month !== this.landMonth) { this.landMonth = month; this.land?.setSeason(month); }
    const key = `${Math.round(w.C.center.x)},${Math.round(w.C.center.y)},${Math.round(w.C.base)}`;
    if (key !== this.terrainKey) { this.terrain = new TerrainGrid(w.C.center.x, w.C.center.y, 5000, 50, w.C.base); this.terrainKey = key; } // with the lee of the land
    const oldBoats = this.boatMeshes.map(m => m.grp);
    this.boatMeshes.forEach(m => this.scene.remove(m.grp));
    this.boatMeshes = w.boats.map(b => {
      const m = buildBoatMesh(b); this.scene.add(m.grp);
      m.grp.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      return m;
    });
    this.fittings.set(this.boatMeshes.map(m => m.grp));
    this.buildCourse(w);
    disposeUnused(oldBoats, this.scene);
    this.warmShaders();
  }

  /**
   * Have the GPU compile the shaders of everything that's hidden now (the city's and the bridge's lights after dark,
   * the boats' navigation lights, rain, the fog bank) in the background, so the frame they first appear in doesn't
   * stall while it compiles fifty-odd of them (half a second or more when night fell with the city in view). Each is
   * shown only for the moment it takes to queue the work (no frame is drawn meanwhile), then hidden again. Both with
   * the sun's shadows and without (it stops casting them once it's down, which changes every lit surface's shader).
   * Programs already compiled are reused, so after the first race this costs only the walk through the scene.
   */
  private warmShaders(): void {
    const hidden: THREE.Object3D[] = [], shadow = this.sun.castShadow;
    this.scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try {
      for (const cast of [shadow, !shadow]) { this.sun.castShadow = cast; void this.renderer.compileAsync(this.scene, this.camera).catch(() => { /* (a lost context: nothing to warm) */ }); }
    } finally { this.sun.castShadow = shadow; for (const o of hidden) o.visible = false; }
  }

  /** A buoy on the water, leaning and trailing a wake in the current (see update). */
  private addMark(add: (o: THREE.Object3D) => THREE.Object3D, p: { x: number; y: number }, shape: MarkShape, look: string): void {
    if (!this.wakeTex) {
      // a mark's wake: a V of foam trailing downstream, fading out
      const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d')!;
      for (let i = 0; i < 140; i++) {
        const y = Math.random() * 128, spread = 4 + y * 0.42, side = Math.random() < 0.5 ? -1 : 1, x = 32 + side * spread * (0.75 + Math.random() * 0.3);
        g.fillStyle = `rgba(255,255,255,${(0.75 * (1 - y / 128)).toFixed(2)})`; g.fillRect(x, y, 1.5 + Math.random() * 2, 1.5 + Math.random() * 3);
      }
      this.wakeTex = new THREE.CanvasTexture(c);
    }
    const float = markBody(shape, look);
    float.position.copy(P3(p.x, p.y, 0)); add(float);
    const big = shape === 'lighted' ? 1.6 : 1;
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(4 * big, 10 * big), new THREE.MeshLambertMaterial({ map: this.wakeTex, transparent: true, depthWrite: false })); // lit, so it dims after dark like the sea
    wake.rotation.x = -Math.PI / 2; wake.position.copy(P3(p.x, p.y, 0.12)); add(wake);
    this.markObjs.push({ p, float, wake, fixed: shape === 'beacon' });
  }

  /** The course or destination changed (a new destination picked on the chart): build its marks again. */
  refreshCourse(w: World): void { this.buildCourse(w); }
  /** New conditions mid-sail (World.applyConditions): the swell's period, and the wind's drawings (puffs, ripples, laylines, sea) worked out afresh. */
  conditionsChanged(w: World): void {
    this.laylineAcc = 1; this.puffAcc = 1; this.puffT = null; this.skyAcc = 1; this.seaRef = null; this.seaGrid = null; this.seaAcc = 99;
    this.waves.setSwellPeriod(w.sea.swell?.tp ?? 12);
  }

  private buildCourse(w: World): void {
    const old = this.courseObjs;
    this.placeCourse(w);
    disposeUnused(old, this.scene); // (the last course's marks, freed once the new ones are in)
  }
  private placeCourse(w: World): void {
    this.courseObjs.forEach(o => this.scene.remove(o)); this.courseObjs = [];
    const add = (o: THREE.Object3D) => { this.scene.add(o); this.courseObjs.push(o); return o; };
    const C = w.C, aids = !!w.settings.aids;
    this.markObjs = [];
    if (w.freeSail) {
      // just sailing: no race course, only the buoys that are really out there
      this.signal = null;
      for (const pl of PLACES) if (pl.buoy) this.addMark(add, pl.p, pl.buoy.shape, pl.buoy.look ?? 'Y');
      if (w.dest && !PLACES.some(pl => pl.buoy && pl.p === w.dest!.p) && aids) {
        // a spot rather than a buoy: a faint ring on the water where you're heading
        const ring = new THREE.Mesh(new THREE.RingGeometry(38, 40, 64), new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.copy(P3(w.dest.p.x, w.dest.p.y, 0.3)); add(ring);
      }
      return;
    }
    if (C.committeeKind === 'boat') {
      const rc = new THREE.Group();
      const rh = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 12), new THREE.MeshLambertMaterial({ color: 0xf0f0ea })); rh.position.y = 0.5; rc.add(rh);
      const rcab = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 5), new THREE.MeshLambertMaterial({ color: 0xdedcd2 })); rcab.position.set(0, 2.2, 0.5); rc.add(rcab);
      rc.position.copy(P3(C.committee.x, C.committee.y)); rc.rotation.y = -C.base * D2R; add(rc);
      // the signal mast on her cabin top
      const mast = new SignalMast(5, true, 0.9); mast.group.position.set(0, 3.2, 0.5); rc.add(mast.group);
      this.signal = { mast, heading: C.base };
    } else if (C.committeeKind === 'shore') {
      // flags on a yardarm on the club's flagpole (the pole itself is part of the landscape)
      const mast = new SignalMast(12, false, 1.3); mast.group.position.copy(P3(C.committee.x, C.committee.y, 2.3)); add(mast.group);
      this.signal = { mast, heading: 0 };
    } else this.signal = null;
    this.signal?.mast.setCourse(w.courseSignal?.no ?? null); // the committee's choice of course, in numeral pennants
    if (C.pinKind === 'buoy') {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 1.8, 10), new THREE.MeshLambertMaterial({ color: 0xff7a1a })); pin.position.copy(P3(C.pin.x, C.pin.y, 0.6)); add(pin);
    }
    const drawn = new Set<string>();
    C.marks.forEach(m => {
      if (drawn.has(m.name)) return; drawn.add(m.name);
      if (m.shape === 'island') return; // the island is the mark
      this.addMark(add, m.p, m.shape, m.look);
      if (aids && m.type === 'round') {
        const ring = new THREE.Mesh(new THREE.RingGeometry(ZONE - 0.25, ZONE + 0.25, 64), new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.copy(P3(m.p.x, m.p.y, 0.3)); add(ring);
      }
    });
    if (aids) {
      const lg = new THREE.BufferGeometry().setFromPoints([P3(C.pin.x, C.pin.y, 0.3), P3(C.committee.x, C.committee.y, 0.3)]);
      const line = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xffd84a, dashSize: 2.5, gapSize: 2.5, transparent: true, opacity: 0.8 }));
      line.computeLineDistances(); add(line);
      // the line's transit: its extension beyond the pin to what it lines up with ashore
      const T = w.lineTransit;
      if (T) {
        const tg = new THREE.BufferGeometry().setFromPoints([P3(C.pin.x, C.pin.y, 0.3), P3(T.p.x, T.p.y, T.landmark ? 0.3 : 2)]);
        const tl = new THREE.Line(tg, new THREE.LineDashedMaterial({ color: 0xffd84a, dashSize: 12, gapSize: 18, transparent: true, opacity: 0.35 }));
        tl.computeLineDistances(); add(tl);
      }
    }
  }

  /** The sea map: how big the chop and swell are around `at`, relative to the sea at the focus, and the whitecaps. */
  private updateSeaMap(w: World, at: { x: number; y: number }, span: number): void {
    const ref = this.seaRef!, cell = span / (SEA_N - 1), x0 = at.x - span / 2, y0 = at.y - span / 2, v = new Float32Array(SEA_N * SEA_N * 3);
    for (let j = 0; j < SEA_N; j++) for (let i = 0; i < SEA_N; i++) {
      const s = w.seaHere({ x: x0 + i * cell, y: y0 + j * cell }), o = (j * SEA_N + i) * 3;
      v[o] = ref.hsW > 0.01 ? s.hsW / ref.hsW : 1; v[o + 1] = ref.hsS > 0.01 ? s.hsS / ref.hsS : 1; v[o + 2] = s.white;
    }
    this.seaGrid = { x0, y0, cell, v };
    // the current, and where it converges (tidelines): convergence = −div(current), shown above ~3e-4 /s
    const cc = span / (CUR_N - 1), cx0 = at.x - span / 2, cy0 = at.y - span / 2, U = new Float32Array(CUR_N * CUR_N * 2);
    for (let j = 0; j < CUR_N; j++) for (let i = 0; i < CUR_N; i++) { const c = w.currentAt({ x: cx0 + i * cc, y: cy0 + j * cc }); U[(j * CUR_N + i) * 2] = c.x; U[(j * CUR_N + i) * 2 + 1] = c.y; }
    const d = this.curData, at2 = (i: number, j: number, k: number) => U[(Math.min(CUR_N - 1, Math.max(0, j)) * CUR_N + Math.min(CUR_N - 1, Math.max(0, i))) * 2 + k];
    for (let j = 0; j < CUR_N; j++) for (let i = 0; i < CUR_N; i++) {
      const o = (j * CUR_N + i) * 4, conv = -((at2(i + 1, j, 0) - at2(i - 1, j, 0)) + (at2(i, j + 1, 1) - at2(i, j - 1, 1))) / (2 * cc);
      d[o] = Math.round(Math.min(1, Math.max(0, 0.5 + at2(i, j, 0) / 4)) * 255); d[o + 1] = Math.round(Math.min(1, Math.max(0, 0.5 + at2(i, j, 1) / 4)) * 255);
      d[o + 2] = Math.round(Math.min(1, Math.max(0, conv / 1.6e-3)) * 255); d[o + 3] = 255; // unsaturated, so the shader can find the crest
    }
    this.curTex.needsUpdate = true;
    this.curUni.uCurO.value.set(cx0, cy0); this.curUni.uCurCell.value = cc;
  }

  /** Rasterize the wind strength (terrain × puffs) around a point into the water shader's wind map. */
  private drawWindOnWater(w: World, at: { x: number; y: number }, span: number): void {
    const PUFF_SPAN = span, cell = span / PUFF_N, x0 = Math.round((at.x - PUFF_SPAN / 2) / cell) * cell, y0 = Math.round((at.y - PUFF_SPAN / 2) / cell) * cell;
    const sum = this.puffSum.fill(0), g = w.puffs.gustiness;
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
      const px = x0 + (i + 0.5) * cell, py = y0 + (j + 0.5) * cell; // the land's effect, and the day's wind across the course
      const kk = Math.min(1.8, Math.max(0.4, (1 + sum[j * PUFF_N + i]) * (tg ? tg.at(px, py) : 1) * w.fieldExtra({ x: px, y: py })));
      const o = (j * PUFF_N + i) * 4;
      d[o] = Math.round((kk - 0.4) / 1.4 * 255);
      const sg = this.seaGrid;
      if (sg) {
        // the sea map, bilinear from the coarse grid
        const gx = Math.min(SEA_N - 1.001, Math.max(0, (x0 + (i + 0.5) * cell - sg.x0) / sg.cell)), gy = Math.min(SEA_N - 1.001, Math.max(0, (y0 + (j + 0.5) * cell - sg.y0) / sg.cell));
        const a = Math.floor(gx), b = Math.floor(gy), u = gx - a, v = gy - b;
        for (let ch = 0; ch < 3; ch++) {
          const q = (ii: number, jj: number) => sg.v[(jj * SEA_N + ii) * 3 + ch];
          const val = (q(a, b) * (1 - u) + q(a + 1, b) * u) * (1 - v) + (q(a, b + 1) * (1 - u) + q(a + 1, b + 1) * u) * v;
          d[o + 1 + ch] = Math.round(Math.min(1, Math.max(0, ch < 2 ? val / 2 : val * 10)) * 255);
        }
      } else { d[o + 1] = d[o + 2] = 128; d[o + 3] = 0; }
    }
    this.puffTex.needsUpdate = true;
    this.puffUni.uPuffO.value.set(x0, y0); this.puffUni.uPuffS.value = span;
    this.puffUni.uMeanKt.value = w.wind.kt;
    const fh = w.fieldAt(at), go = V(w.wind.from + fh.turn + 180); // the wind here: the puffs in view travel with it
    this.puffUni.uPuffV.value.set(go.x, go.y).multiplyScalar(w.wind.kt * fh.k * 0.5144 * 0.8); // as the puffs travel (environment/wind.ts)
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
    // no edges anywhere: the cloud thins to nothing at the sides, the top and the foot, so wherever the sprite meets the
    // water or the land, or the edge of the picture, it has already faded out (a hard line across the sea otherwise)
    c.globalCompositeOperation = 'destination-in';
    const fx = c.createLinearGradient(0, 0, 256, 0);
    fx.addColorStop(0, 'rgba(0,0,0,0)'); fx.addColorStop(0.18, 'rgba(0,0,0,1)'); fx.addColorStop(0.82, 'rgba(0,0,0,1)'); fx.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = fx; c.fillRect(0, 0, 256, 128);
    const fy = c.createLinearGradient(0, 0, 0, 128);
    fy.addColorStop(0, 'rgba(0,0,0,0)'); fy.addColorStop(0.2, 'rgba(0,0,0,1)'); fy.addColorStop(0.8, 'rgba(0,0,0,1)'); fy.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = fy; c.fillRect(0, 0, 256, 128);
    c.globalCompositeOperation = 'source-over';
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
      // from the water (its faded foot) up to the bank's top: the sprite always faces the camera, so from any height its
      // foot stays at or above the water
      const top = h + size * 0.375, p = LL(lat, lon);
      sp.position.set(p.x, top / 2, -p.y); sp.scale.set(size * 1.7, top, 1); sp.visible = false;
      this.scene.add(sp); this.fogBank.push(sp);
    }
  }

  /** Sun, sky light, haze and fog bank for the moment `tMin` (minutes since epoch, UTC). */
  private updateSky(tMin: number, focus: { x: number; y: number }, rain: 0 | 1 | 2 = 0, fog: 'real' | 0 | 1 | 2 = 'real'): void {
    const sp = sunPosition(tMin * 60000), el = sp.el, D = Math.PI / 180;
    this.sunEl = el;
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
    // rain and fog (the conditions adjuster): overcast light, grey haze, and you see less far
    const murk = Math.max(rain === 2 ? 0.75 : rain === 1 ? 0.45 : 0, fog === 2 ? 0.85 : fog === 1 ? 0.5 : 0);
    if (murk > 0) { haze.lerp(new THREE.Color('#9aa3aa').multiplyScalar(0.35 + 0.65 * day), murk); this.sun.intensity *= 1 - 0.85 * murk; this.hemi.intensity *= 1 - 0.35 * murk; }
    // the sky itself overcast (the cloud's grey, darker with the day), and no sun glinting off the water through it
    sm.uniforms.uMurk.value = Math.min(0.92, murk * 1.15); (sm.uniforms.uMurkCol.value as THREE.Color).copy(haze).multiplyScalar(0.92);
    const fogN = fog === 2 ? 15 : fog === 1 ? 120 : rain === 2 ? 60 : rain === 1 ? 300 : 1500, setV = setVisibility({ fog, rain }).m, fogF = Number.isFinite(setV) ? setV : 57000; // (all haze by the water's far edge, 60 km out: waves.ts GRID_R; set fog and rain: environment/weather.ts SET_VIS, which the map's visibility reads too)
    // (rain's visibility: V ≈ 11.6·R^−0.63 km for R mm/h, Atlas, "Optical extinction by rainfall", J. Meteor. 10, 486–488,
    // 1953, as quoted in a secondary summary, for a 0.055 threshold contrast: the paper itself couldn't be reached to check
    // it. Taken as the fog's far edge, where the haze is complete: near enough the distance you lose sight of things. Light rain about 2 mm/h,
    // 7.5 km; heavy about 8 mm/h (heavy is over 7.6 mm/h, the US observing practice's class), 3.1 km)
    Object.assign(this.scene.fog as THREE.Fog, { near: fogN, far: fogF });
    setRestrictedVisibility(fog === 1 || fog === 2 || rain === 2); // the boats' lights by day too (navLights.ts)
    (this.scene.fog as THREE.Fog).color.copy(haze);
    this.skyUni.uSkyCol.value.copy(haze); this.skyUni.uDay.value = 0.3 + 0.7 * day;
    (this.water.material.specular as THREE.Color).setRGB(0.55, 0.55 - 0.2 * warm, 0.5 - 0.3 * warm).multiplyScalar(up * (1 - 0.9 * murk));
    for (const l of bridgeLights) l.visible = el < 3; // the bridge lights come on around sunset
    if (this.land) this.land.lights.visible = el < 1;
    // the fog bank
    const fogAmt = fog === 'real' ? fogBankAmount(tMin) : 0; // set fog replaces the summer fog bank
    for (const sprite of this.fogBank) {
      sprite.visible = fogAmt > 0.05;
      const m = sprite.material as THREE.SpriteMaterial;
      sprite.userData.opacity = Math.min(1, fogAmt * 1.25) * (0.35 + 0.65 * day); // (faded near the camera in render)
      m.color.setRGB(0.55 + 0.45 * day, 0.55 + 0.45 * day - 0.06 * warm * up, 0.6 + 0.4 * day - 0.15 * warm * up);
    }
  }

  /** Rain (the conditions adjuster): streaks falling round the camera, slanting with the wind. */
  private rain: { mesh: THREE.LineSegments; drops: Float32Array } | null = null;
  private updateRain(w: World, dt: number, camera: THREE.Camera): void {
    const level = w.settings.rain ?? 0;
    if (!level) { if (this.rain) this.rain.mesh.visible = false; return; }
    const N = 7200, R = 45, H = 30; // (heavy rain at all of them; light at a sixth)
    if (!this.rain) {
      const drops = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { drops[i * 3] = (Math.random() * 2 - 1) * R; drops[i * 3 + 1] = Math.random() * H; drops[i * 3 + 2] = (Math.random() * 2 - 1) * R; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
      const mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d2da, transparent: true, opacity: 0.35, depthWrite: false }));
      mesh.frustumCulled = false; this.scene.add(mesh); this.rain = { mesh, drops };
    }
    const { mesh, drops } = this.rain, pos = mesh.geometry.attributes.position as THREE.BufferAttribute, a = pos.array as Float32Array;
    mesh.visible = true; (mesh.material as THREE.LineBasicMaterial).opacity = level === 2 ? 0.55 : 0.28;
    const n = level === 2 ? N : N / 6, fall = 8.5, wv = V(w.wind.from + 180), wk = w.wind.kt * 0.5144 * 0.6;
    const vx = wv.x * wk, vz = -wv.y * wk, len = 0.06 * (1 + level); // streak: the drop's path over a sixtieth of a second, stretched for the eye
    const c = camera.position;
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      drops[o] += vx * dt; drops[o + 1] -= fall * dt; drops[o + 2] += vz * dt;
      if (drops[o + 1] < -2) { drops[o + 1] += H; drops[o] = (Math.random() * 2 - 1) * R; drops[o + 2] = (Math.random() * 2 - 1) * R; }
      // (blown along by the wind, a drop that leaves the box round the camera comes back in on the other side, so it stays full)
      if (drops[o] > R) drops[o] -= 2 * R; else if (drops[o] < -R) drops[o] += 2 * R;
      if (drops[o + 2] > R) drops[o + 2] -= 2 * R; else if (drops[o + 2] < -R) drops[o + 2] += 2 * R;
      const x = c.x + drops[o], y = c.y - 8 + drops[o + 1], z = c.z + drops[o + 2], q = i * 6;
      if (i >= n) { a[q] = a[q + 3] = x; a[q + 1] = a[q + 4] = -100; a[q + 2] = a[q + 5] = z; continue; }
      a[q] = x; a[q + 1] = y; a[q + 2] = z; a[q + 3] = x - vx * len; a[q + 4] = y + fall * len; a[q + 5] = z - vz * len;
    }
    pos.needsUpdate = true;
  }

  /** Draw a frame. dt is wall-clock seconds since the last frame; now is ms. */
  /** The showroom camera's angle round the boat (it turns slowly unless paused). */
  private showroomA = 0;
  render(w: World, dt: number, now: number, viewMode: number, look: { yaw: number; pitch: number; aft?: number; chase?: number; shift?: number; spin?: boolean }, over: Overhead): void {
    const t = now / 1000, k = (w.running && !w.paused ? w.speed : 0) * dt / this.tile;
    // ripples lie across the wind (the course's mean direction, so they don't swing with every shift)
    { const d = Math.atan2(Math.sin(-w.windModel.base * D2R - this.ripAngle), Math.cos(-w.windModel.base * D2R - this.ripAngle)); // the short way round
      this.ripAngle += d * Math.min(1, dt * 0.2); }
    const c = Math.cos(this.ripAngle), s = Math.sin(this.ripAngle);
    this.wtex.rotation = this.ripAngle;
    // the texture drifts with the current: offset in texture space is the rotated displacement
    this.wtex.offset.x -= (c * w.cvec.x + s * w.cvec.y) * k; this.wtex.offset.y -= (-s * w.cvec.x + c * w.cvec.y) * k;
    // metres on the water → texture coordinates (the ripple texture's own transform), for the flow map
    this.wtex.updateMatrix(); const fm = this.wtex.matrix.elements, sc = 1 / 120000;
    this.curUni.uFlowM.value.set(fm[0] * sc, fm[3] * sc, 0, fm[1] * sc, fm[4] * sc, 0, 0, 0, 0);
    this.curUni.uCurMean.value.set(w.cvec.x, w.cvec.y);
    this.skyAcc += dt;
    if (this.skyAcc > 0.5) { this.skyAcc = 0; this.updateSky(w.clockUtc, w.user, w.settings.rain ?? 0, w.settings.fog ?? 'real'); }
    // the fog bank thins as you sail into it, rather than a flat picture of cloud that's suddenly gone as you pass it
    for (const sp of this.fogBank) if (sp.visible) {
      const cp = this.camera.position, d = Math.hypot(sp.position.x - cp.x, sp.position.z - cp.z), wd = sp.scale.x / 2;
      const u = Math.min(1, Math.max(0, (d - 0.4 * wd) / (1.2 * wd))), m = sp.material as THREE.SpriteMaterial;
      m.opacity = (sp.userData.opacity ?? 0) * u * u * (3 - 2 * u);
    }
    updateNight(this.sunEl, w.clockUtc, w.wind.kt * 0.5144, t); // the Bay Bridge's and the city's lights after dark (night.ts)
    this.envAcc += dt;
    if (this.envAcc > 30) {
      this.envAcc = 0; this.envCam.update(this.renderer, this.scene);
      for (const r of REFLECTIVE) if (r.mat.envMap !== this.envTarget.texture) { r.mat.envMap = this.envTarget.texture; r.mat.needsUpdate = true; }
    }
    // the puffs' texture carried down the wind on the sim's clock (paused, sped up and replayed with it; a jump starts afresh)
    const pdt = this.puffT == null ? 0 : w.t - this.puffT; this.puffT = w.t;
    if (pdt > 0 && pdt < 5) this.puffUni.uPuffOff.value.addScaledVector(this.puffUni.uPuffV.value, pdt);
    this.puffAcc += dt;
    if (this.puffAcc > 0.15) { this.puffAcc = 0; this.drawWindOnWater(w, viewMode === 2 ? { x: w.user.x + over.off.x, y: w.user.y + over.off.y } : w.user, viewMode === 2 ? Math.max(PUFF_SPAN, over.height * 2.6) : PUFF_SPAN); }
    // the waves: heights for the sea where you are, then the sea map around you (every 2 s)
    const focus = viewMode === 2 ? { x: w.user.x + over.off.x, y: w.user.y + over.off.y } : w.user;
    this.seaAcc += dt;
    if (!this.seaRef || this.seaAcc > 2) {
      this.seaAcc = 0; this.seaRef = w.seaHere(focus);
      this.updateSeaMap(w, focus, viewMode === 2 ? Math.max(PUFF_SPAN, over.height * 2.6) : PUFF_SPAN);
    }
    const tw = w.t + 600; // wave time: the sim's clock, so the waves pause, speed up and replay with it
    this.waves.update(this.seaRef, w.windModel.base, dt);
    this.waves.pack(this.waveA, this.waveB);
    this.waveUni.uTime.value = tw; this.waveUni.uHs.value.set(this.waves.ref.hsW, this.waves.ref.hsS); this.waveUni.uWhiteRef.value = this.seaRef.white;
    // the signal flags, and marks leaning and trailing a wake in the current
    this.signal?.mast.sync(w.flags, w.wind.from, this.signal.heading, t, dt);
    for (const mo of this.markObjs) {
      const c = w.currentAt(mo.p), kt = Math.hypot(c.x, c.y) / 0.5144, set = Math.atan2(c.x, c.y);
      const lean = Math.min(16, 6.5 * kt) * D2R; // a moored buoy heels over downstream on its chain
      if (!mo.fixed) { // (a beacon stands on its pile: it doesn't heel or ride the waves)
        mo.float.rotation.set(0, 0, 0); mo.float.rotateOnWorldAxis(new THREE.Vector3(Math.cos(set), 0, Math.sin(set)), -lean);
        mo.float.position.y = this.waves.height(mo.p, tw, 1, 1);
      }
      const len = Math.min(1.6, kt / 1.5);
      mo.wake.visible = kt > 0.15; mo.wake.scale.set(0.6 + 0.4 * len, len, 1);
      mo.wake.rotation.z = -set + Math.PI; // trailing downstream
      mo.wake.position.set(mo.p.x + Math.sin(set) * 5 * len, 0.12, -(mo.p.y + Math.cos(set) * 5 * len));
      (mo.wake.material as THREE.MeshBasicMaterial).opacity = Math.min(0.9, kt / 1.2);
    }
    w.boats.forEach((b, i) => {
      const kW = this.waves.ref.hsW > 0.01 ? b.sea.hsW / this.waves.ref.hsW : 0, kS = this.waves.ref.hsS > 0.01 ? b.sea.hsS / this.waves.ref.hsS : 0;
      const mo = boatOnWaves(this.waves, b, b.h, tw, kW, kS); this.pitches[i] = mo.pitch;
      this.boatMeshes[i].hideHelm = b.isUser && viewMode === 0;
      syncBoatMesh(this.boatMeshes[i], b, t, mo);
    });
    this.moorings.update(w.running && !w.paused ? dt * w.speed : dt * 0.2, p => w.currentAt(p), p => w.windHere(p), p => this.waves.height(p, tw, 0.7, 0.4));
    this.wildlife.setMonth(+w.raceDate.slice(5, 7) || new Date().getMonth() + 1);
    this.wildlife.update(w.running && !w.paused ? dt * w.speed : 0, tw, w.user, w.boats, (x, y) => this.waves.height({ x, y }, tw, 1, 1));
    this.vesselView.sync(w.vessels, tw, w.running && !w.paused ? dt * w.speed : 0, (x, y) => this.waves.height({ x, y }, tw, 1, 1));
    this.wakes.update(w.boats, tw, w.running && !w.paused ? dt * w.speed : 0, (x, y) => this.waves.height({ x, y }, tw, 1, 1), this.pitches);
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
      // the eye rides with the hull (heel and waves move it), but the view stays level: the horizon never tilts
      camera.rotation.set(-4 * D2R + look.pitch, -u.h * D2R + look.yaw, 0);
    } else if (viewMode === 1) {
      // chase: orbit the boat with the look direction
      const dist = look.chase ?? 24, hv = V(u.h - look.yaw / D2R), height = Math.max(1.2, (9 + look.pitch * 25) * dist / 24);
      camera.position.lerp(P3(u.x - hv.x * dist, u.y - hv.y * dist, height), Math.min(1, dt * 3));
      // aimed up the rig rather than at the waterline: she sits lower in the frame, her masthead clear of the dials
      camera.lookAt(P3(u.x + hv.x * 10, u.y + hv.y * 10, 4.5));
    } else if (viewMode === 3) {
      // the showroom (setting up your boat): a slow circle round her, from a little above the deck
      if (look.spin !== false) this.showroomA += dt * 0.11; // a slow turn (paused from the panel)
      const a = this.showroomA + look.yaw, d = look.chase ?? 10;
      camera.position.set(P3(u.x, u.y).x + Math.sin(a) * d, 2.6 + look.pitch * 6, P3(u.x, u.y).z + Math.cos(a) * d);
      camera.lookAt(P3(u.x, u.y, 2.8));
    } else {
      // overhead: straight down, north / bow / wind at the top, zoomed and panned as you like
      const up = V(overheadUp(over, w)), cx = u.x + over.off.x, cy = u.y + over.off.y;
      camera.position.copy(P3(cx, cy, over.height)); camera.up.set(up.x, 0, -up.y); camera.lookAt(P3(cx, cy, 0));
    }
    // dev only: a free camera for checking the scenery (window.__cam = { pos: [x, y, z], at: [x, y, z] }, sim coords)
    const dc = import.meta.env.DEV ? (window as unknown as { __cam?: { pos: number[]; at: number[] } }).__cam : undefined;
    if (dc) { camera.up.set(0, 1, 0); if (Math.hypot(dc.pos[0] - dc.at[0], dc.pos[1] - dc.at[1]) < 1) camera.up.set(0, 0, -1); // straight down: north at the top
       camera.position.copy(P3(dc.pos[0], dc.pos[1], dc.pos[2])); camera.lookAt(P3(dc.at[0], dc.at[1], dc.at[2])); }
    // the showroom shifts the picture right, clear of the panel on the left
    const shift = viewMode === 3 ? (look.shift ?? 0) : 0, size = this.renderer.getSize(new THREE.Vector2());
    if (shift) camera.setViewOffset(size.x, size.y, -shift, 0, size.x, size.y); else if (camera.view?.enabled) camera.clearViewOffset();
    this.updateRain(w, dt, camera);
    // the water follows the camera (snapped, so the fine mesh near you doesn't swim)
    this.water.position.set(Math.round(camera.position.x / 2) * 2, 0, Math.round(camera.position.z / 2) * 2);
    this.fittings.update(camera, size.y * this.renderer.getPixelRatio()); // (the boats' fittings too small to see from here)
    this.renderer.render(this.scene, camera);
  }
}

const MARK_COL: Record<string, number> = { R: 0xc8262b, G: 0x1f8a4c, Y: 0xffc21a, O: 0xf0621e };
/**
 * A mark as it looks on the water. Racing inflatables (a yellow sphere or cylinder; the clubs' red and orange balls);
 * a yellow column (Blackaller, Hank Easom); a light on a pile (a beacon); or a lighted navigation buoy: a round float with a steel tower and a light on top, painted in its
 * colours top to bottom (Harding Rock's red-green-red bands).
 */
function markBody(shape: string, look: string): THREE.Group {
  const g = new THREE.Group(), lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });
  const col = (i: number) => MARK_COL[look[Math.min(i, look.length - 1)]] ?? MARK_COL.Y;
  if (shape === 'sphere') { const b = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), lam(look === 'Y' ? 0xffd21a : col(0))); b.position.y = 0.8; g.add(b); } // (the clubs' red and orange balls too)
  else if (shape === 'cylinder') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.0, 2.4, 12), lam(look === 'Y' ? 0xffc21a : col(0))); b.position.y = 0.8; g.add(b); }
  else if (shape === 'beacon') {
    // a light on a pile (a fixed aid, USCG style): a dark steel or timber pile, the dayboard near the top (a green square
    // for an odd-numbered mark, a red triangle for an even one, to leave to port and starboard coming in from sea), the
    // light above it
    const H = 5.2, pile = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, H + 2, 8), lam(0x3a3633)); pile.position.y = H / 2 - 1; g.add(pile);
    const red = look[0] === 'R', board = new THREE.Mesh(red ? new THREE.CircleGeometry(0.75, 3) : new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshLambertMaterial({ color: col(0), side: THREE.DoubleSide }));
    if (red) board.rotation.z = Math.PI / 2; // (a triangle point up)
    board.position.set(0, H - 1.1, 0.3); g.add(board);
    const lt = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.35, 8), new THREE.MeshBasicMaterial({ color: red ? 0xffb0a8 : 0xa8ffc0 })); lt.position.y = H + 0.2; g.add(lt);
  }
  else if (shape === 'column') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 3.6, 14), lam(col(0))); b.position.y = 1.4; g.add(b);
    const lt = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2b0 })); lt.position.y = 3.35; g.add(lt);
  } else {
    // the float, then a lattice tower drawn as four legs and the band panels, then the lantern
    const n = look.length, H = 3.6;
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.1, 18), lam(col(n - 1))); fl.position.y = 0.3; g.add(fl);
    for (let i = 0; i < n; i++) {
      const h = H / n, pnl = new THREE.Mesh(new THREE.CylinderGeometry(0.55 + 0.35 * (i + 1) / n, 0.55 + 0.35 * (i + 2) / n, h, 4, 1, true), new THREE.MeshLambertMaterial({ color: col(i), side: THREE.DoubleSide }));
      pnl.position.y = 0.85 + H - (i + 0.5) * h; pnl.rotation.y = Math.PI / 4; g.add(pnl);
    }
    const lt = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.35, 8), new THREE.MeshBasicMaterial({ color: look[0] === 'G' ? 0xa8ffc0 : 0xffb0a8 })); lt.position.y = 0.85 + H + 0.2; g.add(lt);
  }
  g.traverse(o => { o.castShadow = true; });
  return g;
}
