import './three-setup';
import * as THREE from 'three';

/**
 * The city's lights after dark, shared by the scenery: how dark it is, the clock the light shows run on, and the
 * cheap shader pieces that draw them (lit windows on the buildings, the Bay Lights' patterns, and the lights' long
 * reflections on the water). The scene (scene.ts) sets the values from the real sun for the race day and time.
 */
export const NIGHT = {
  /** How dark it is, 0 by day … 1 at night: the sun from 6° up to 6° down (civil twilight), when lit windows show. */
  uNight: { value: 0 },
  /** The light installations are on: from sunset (the sun's centre 0.83° down) to sunrise. */
  uOn: { value: 0 },
  /** The share of offices' lights on now, and of homes' (OFFICE_LIGHTS, HOME_LIGHTS below, by the local hour). */
  uOffice: { value: 0.05 },
  uHome: { value: 0.3 },
  /** Seconds, for the light shows' movement. */
  uTime: { value: 0 },
  /** The sea's slope standard deviation (Cox & Munk), for how long and wide the reflections stretch. */
  uSlope: { value: 0.15 },
  /** The Salesforce Tower's crown: 0 = its city video (sunset to 00:30), 1 = the stars (00:30 to sunrise). */
  uStars: { value: 0 },
};

/** Objects that show only when the installations are on (hidden by day, so they cost no draw calls). */
export const nightOnly: THREE.Object3D[] = [];
/** Objects that show only by day (the Bay Bridge's steel suspenders, which the Bay Lights replace after dark). */
export const dayOnly: THREE.Object3D[] = [];
/** Lamps that come on around sunset, as the Golden Gate's do (the Bay Bridge's roadway and aviation lights). */
export const duskLights: THREE.Object3D[] = [];
/** Unlit lines (cables drawn as lines) that would glow at night: their colour fades with the daylight. */
export const nightDim: THREE.LineBasicMaterial[] = [];
const dimBase = new WeakMap<THREE.LineBasicMaterial, THREE.Color>();
/** Clocks that show the time (the Ferry Building's dials), redrawn when the minute changes: (hour, minute) local. */
export const clocks: ((h: number, m: number) => void)[] = [];

const TZ_FMT = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * How many lights are on, by the hour: the US Department of Energy's commercial reference buildings, as the
 * EnergyPlus models carry them (NREL/EnergyPlus testfiles, RefBldgMediumOfficeNew2004 and
 * RefBldgMidriseApartmentNew2004; the office one is ASHRAE 90.1-2004's schedule). Each value holds until the hour
 * given. They are fractions of a building's installed lighting in use, which stands in here for the share of its
 * windows lit. Offices: half lit at 19:00 on a weekday, a tenth by 22:30, a twentieth (cleaners, security, stairwells)
 * through the night and all Saturday evening and Sunday. Apartments: most lit around 20:00–21:00, falling to a
 * sixth by midnight.
 */
const OFFICE_LIGHTS: Record<'wk' | 'sat' | 'sun', [number, number][]> = {
  wk: [[5, 0.05], [7, 0.1], [8, 0.3], [17, 0.9], [18, 0.7], [20, 0.5], [22, 0.3], [23, 0.1], [24, 0.05]],
  sat: [[6, 0.05], [8, 0.1], [14, 0.5], [17, 0.15], [24, 0.05]],
  sun: [[24, 0.05]],
};
const HOME_LIGHTS: [number, number][] = [[4, 0.067], [5, 0.187], [6, 0.394], [7, 0.44], [8, 0.393], [9, 0.172], [15, 0.119], [16, 0.206], [17, 0.439],
  [18, 0.616], [19, 0.829], [20, 0.986], [21, 1.0], [22, 0.692], [23, 0.384], [24, 0.16]];
/**
 * At the apartments' peak not every window shows a light: rooms not in use, blinds and curtains drawn. The share
 * of a home's windows lit at that peak is a judgement (no survey found), set so the residential hills read sparse.
 */
const HOME_PEAK_WINDOWS = 0.3;
/** A schedule's value at hour h (0–24), eased over the half hour either side of each step so lights don't all switch at once. */
function sched(tab: [number, number][], h: number): number {
  const at = (x: number) => { x = (x + 24) % 24; for (const [u, v] of tab) if (x < u) return v; return tab[tab.length - 1][1]; };
  const f = h - Math.floor(h); return at(h) * (1 - Math.max(0, f - 0.5)) + at(h + 1) * Math.max(0, f - 0.5);
}
let lastMin = NaN, localH = 12;
/**
 * The city's lights for the moment: `el` the sun's elevation (°), `tMin` minutes since the epoch (UTC), `windMs`
 * the wind (m/s) for the sea's slope, `tSec` a running clock for the light shows. Called by the scene.
 */
export function updateNight(el: number, tMin: number, windMs: number, tSec: number): void {
  NIGHT.uTime.value = tSec % 3600;
  NIGHT.uSlope.value = Math.sqrt(0.003 + 0.00512 * Math.max(0, windMs)); // Cox & Munk (1954)
  // recomputed when the minute or the sun's height changes (the sun is updated a moment after the clock)
  const m = Math.floor(tMin), key = m * 1000 + Math.round(el * 10);
  if (key === lastMin) return;
  lastMin = key;
  const parts = TZ_FMT.formatToParts(new Date(m * 60000)), part = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const hh = +part('hour'), mm = +part('minute'), wd = part('weekday'); localH = hh + mm / 60;
  NIGHT.uOffice.value = sched(OFFICE_LIGHTS[wd === 'Sat' ? 'sat' : wd === 'Sun' ? 'sun' : 'wk'], localH);
  NIGHT.uHome.value = HOME_PEAK_WINDOWS * sched(HOME_LIGHTS, localH);
  for (const c of clocks) c(hh, mm);
  const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  NIGHT.uNight.value = 1 - ss(-6, 6, el);
  const on = el < -0.83 ? 1 : 0; // from sunset (the sun's upper limb on the horizon, with refraction) to sunrise
  NIGHT.uOn.value = on;
  // lights going out late: 0 at 23:00 → 1 at 01:00, and back on through the small hours before dawn
  const h = localH < 12 ? localH + 24 : localH;
  // Day for Night: the city video from sunset to 00:30, then the stars until sunrise
  NIGHT.uStars.value = h >= 24.5 && h < 36 ? 1 : 0;
  for (const o of nightOnly) o.visible = on === 1;
  for (const o of dayOnly) o.visible = on === 0;
  for (const o of duskLights) o.visible = el < 3;
  for (const mt of nightDim) { const c0 = dimBase.get(mt) ?? dimBase.set(mt, mt.color.clone()).get(mt)!; mt.color.copy(c0).multiplyScalar(1 - 0.85 * NIGHT.uNight.value); }
}

const HASH = `
float nHash(float n) { return fract(sin(n) * 43758.5453123); }
float nHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
`;

/**
 * Lit windows: patches a Lambert or Phong material so its walls show lit windows after dark, as many as the hour's
 * schedule says (NIGHT.uOffice, uHome), each building its own share round that. Offices light by floor (whole floors
 * or runs of floors, and a stray light or two on the dark ones), in runs of windows along a floor; homes in ones and
 * twos (a flat's rooms), floor by floor at random. Each run has its own brightness and colour: offices 3500–4100 K
 * (fluorescent and LED), homes 2700–3000 K with the odd cooler LED. The windows come from the wall's position in the
 * world (floors every `floor` m, bays every `bay` m along the wall), so the material needs no texture or uv. Far
 * off, where a window is smaller than a pixel, a floor's lit runs show as short streaks; where the floors are too,
 * the wall shows the building's average, a faint glow. `kind`: 'office', 'home', or 'auto' for an instanced city,
 * where a building over 24 m tall counts as offices.
 */
export function litWindows(mat: THREE.Material, o: { floor?: number; bay?: number; kind?: 'office' | 'home' | 'auto'; seed?: number; glow?: number; from?: number } = {}): void {
  const { floor = 3.6, bay = 3.2, kind = 'auto', seed = 0, glow = 1, from = 4 } = o;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, { uNight: NIGHT.uNight, uOffice: NIGHT.uOffice, uHome: NIGHT.uHome });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWinP; varying vec3 vWinN; varying float vWinSeed; varying float vWinH;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vec4 winW = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vWinN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
          vWinSeed = mod(float(gl_InstanceID) * 7.31, 977.0) + ${(seed + 0.5).toFixed(3)};
          vWinH = length(instanceMatrix[1].xyz);
        #else
          vec4 winW = modelMatrix * vec4(transformed, 1.0);
          vWinN = normalize(mat3(modelMatrix) * objectNormal);
          vWinSeed = ${(seed + 0.5).toFixed(3)}; vWinH = 0.0;
        #endif
        vWinP = winW.xyz;`);
    const office = kind === 'office' ? '1.0' : kind === 'home' ? '0.0' : 'step(24.0, vWinH)';
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight; uniform float uOffice; uniform float uHome; varying vec3 vWinP; varying vec3 vWinN; varying float vWinSeed; varying float vWinH;
        // a hash without sine (Hoskins), steady at the world's large coordinates
        float wH(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uNight > 0.01 && abs(vWinN.y) < 0.5 && vWinP.y > ${from.toFixed(1)}) {
          vec2 tg = normalize(vec2(-vWinN.z, vWinN.x));
          vec2 cell = vec2(dot(vWinP.xz, tg) / ${bay.toFixed(2)}, vWinP.y / ${floor.toFixed(2)});
          vec2 id = floor(cell), f = fract(cell);
          float s = vWinSeed, off = ${office};
          // this building's share of windows lit: the schedule's, varied between a third and twice that
          float share = clamp(mix(uHome, uOffice, off) * (0.35 + 1.65 * wH(vec2(s, 7.0))), 0.0, 1.0);
          // offices: lit floors (in runs of 1–3), and runs of 3–8 windows lit on them; homes: every floor, flats of 1–2 windows
          float runF = 1.0 + floor(wH(vec2(s, 3.0)) * 3.0 * off), fid = floor(id.y / runF);
          float pFloor = off > 0.5 ? min(1.0, share / 0.5) : 1.0;
          float pRun = min(1.0, share / (pFloor * 0.85));
          float runW = off > 0.5 ? 3.0 + floor(wH(vec2(s, 5.0)) * 6.0) : 1.0 + floor(wH(vec2(s, 6.0)) * 2.0);
          float rid = floor((id.x + floor(wH(vec2(fid, s)) * 8.0)) / runW);
          float floorOn = step(wH(vec2(fid * 1.37, s + 1.0)), pFloor), runOn = step(wH(vec2(rid + s * 0.73, id.y * 1.91)), pRun);
          float on = floorOn * runOn * step(wH(id + vec2(s * 1.13, 0.5)), 0.85) + off * (1.0 - floorOn) * step(0.993, wH(id * 1.7 + s));
          float rh = wH(vec2(rid * 1.3 + 0.2, id.y + s)), br = 0.3 + 0.7 * rh;
          // colour: offices 3500–4100 K, homes 2700–3000 K and one in eight a cool LED
          vec3 cOff = mix(vec3(1.0, 0.84, 0.66), vec3(0.86, 0.9, 1.0), wH(vec2(rid, id.y * 0.37 + s)));
          vec3 cHome = wH(vec2(rid * 0.7, id.y + s * 2.0)) < 0.125 ? vec3(0.8, 0.85, 1.0) : mix(vec3(1.0, 0.62, 0.32), vec3(1.0, 0.76, 0.5), rh);
          vec3 wc = mix(cHome, cOff, off);
          float paneX = step(0.2, f.x) * step(f.x, 0.84), paneY = step(0.24, f.y) * step(f.y, 0.86);
          // near: each window; windows smaller than a pixel: the run's average along the floor; floors too: the wall's average
          float subX = smoothstep(0.4, 1.0, fwidth(cell.x)), subY = smoothstep(0.4, 1.0, fwidth(cell.y));
          float w0 = on * paneX * br, w1 = floorOn * runOn * 0.85 * 0.64 * br;
          float w = mix(w0, w1, subX) * mix(paneY, 0.62, subY);
          w = mix(w, share * 0.64 * 0.62 * 0.65, smoothstep(0.6, 1.4, fwidth(cell.y)));
          totalEmissiveRadiance += wc * w * uNight * ${glow.toFixed(2)};
        }`);
  };
  mat.customProgramCacheKey = () => `win2|${floor}|${bay}|${kind}|${seed}|${glow}|${from}`;
}

/**
 * Floodlighting: a warm glow added to a material after dark, brightest low down where the lamps at its foot aim and
 * fading upward (`y0`..`y1`, metres in the world), with the rest of the building lit at `top`.
 */
export function floodlit(mat: THREE.Material, color: THREE.ColorRepresentation, y0: number, y1: number, top = 0.45, gain = 1, key = 'flood'): void {
  const c = new THREE.Color(color);
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uNight: NIGHT.uNight, uOn: NIGHT.uOn, uFloodC: { value: c } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vFloodY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFloodY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; uniform float uOn; uniform vec3 uFloodC; varying float vFloodY;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fl = mix(1.0, ${top.toFixed(2)}, smoothstep(${y0.toFixed(1)}, ${y1.toFixed(1)}, vFloodY));
        totalEmissiveRadiance += uFloodC * fl * uOn * (0.4 + 0.6 * uNight) * ${gain.toFixed(2)} * diffuseColor.rgb;`);
  };
  mat.customProgramCacheKey = () => key;
}

/**
 * The Bay Lights' patterns (Leo Villareal, 2013; relit with about 50,000 white LEDs on both sides of the West Span's
 * vertical cables on 20 March 2026: Wikipedia, "The Bay Lights", and the press on the relighting). The artist's
 * sequences are computer-generated and don't repeat; they move up and down the cables and seem to sweep across the
 * bridge, drawn from water, traffic and weather. These are four such movements, faded one into the next every 40 s:
 * broad sweeps along the span, rain falling down the cables, a sparkle of single LEDs, and a rising and falling
 * water line. `s` is metres along the bridge, `h` the height on the cable (0 the deck … 1 the main cable), `hm` metres
 * up the cable, `c` the cable's number. White only.
 */
export const BAY_LIGHTS_GLSL = HASH + `
float blMove(float k, float s, float h, float hm, float c, float t) {
  if (k < 0.5) return pow(0.5 + 0.5 * sin(s * 0.011 - t * 0.55 + h * 1.2), 7.0) + 0.6 * pow(0.5 + 0.5 * sin(-s * 0.004 - t * 0.21), 12.0);
  if (k < 1.5) { float f = fract(h * 1.6 + t * 0.32 * (0.6 + 0.8 * nHash(c)) + nHash(c + 3.1)); return pow(f, 14.0); }
  if (k < 2.5) return step(0.985, nHash(floor(hm / 0.3) * 1.7 + c * 97.0 + floor(t * 6.0 + nHash(c) * 6.0))) * 1.2 + 0.08 * (0.5 + 0.5 * sin(s * 0.02 + t));
  float lv = 0.5 + 0.32 * sin(s * 0.0075 - t * 0.45) + 0.12 * sin(s * 0.031 + t * 1.3);
  return step(h, lv) * (0.2 + 0.8 * exp(-abs(h - lv) * 9.0));
}
float bayLights(float s, float h, float hm, float c, float t) {
  float ph = t / 40.0, k = mod(floor(ph), 4.0), x = smoothstep(0.85, 1.0, fract(ph));
  return 0.05 + 0.95 * mix(blMove(k, s, h, hm, c, t), blMove(mod(k + 1.0, 4.0), s, h, hm, c, t), x);
}
`;

const FOG_PARS = 'uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;';

/** The Bay Lights: one line per cable (`aS` along the bridge, `aH` 0..1 up it, `aHm` metres up it, `aC` its number). */
export function bayLightsMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, uTime: NIGHT.uTime, uOn: NIGHT.uOn, uNight: NIGHT.uNight },
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float aS; attribute float aH; attribute float aHm; attribute float aC;
      varying float vS; varying float vH; varying float vHm; varying float vC; varying float vDepth;
      void main() { vS = aS; vH = aH; vHm = aHm; vC = aC;
        vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime; uniform float uOn; uniform float uNight; ${FOG_PARS}
      varying float vS; varying float vH; varying float vHm; varying float vC; varying float vDepth;
      ${BAY_LIGHTS_GLSL}
      void main() {
        #include <logdepthbuf_fragment>
        float b = min(1.0, 1.6 * bayLights(vS, vH, vHm, vC, uTime)) * uOn * (0.45 + 0.55 * uNight); // 1-px lines: brighter so the far span still reads
        b *= 1.0 - smoothstep(fogNear, fogFar, vDepth);
        gl_FragColor = vec4(vec3(0.93, 0.95, 1.0) * b, 1.0);
      }`,
  });
}

/** A source of light reflected on the water. */
export interface Glint { x: number; y: number; h: number; color: THREE.ColorRepresentation; i: number; w: number; s?: number }

/**
 * The lights' reflections on the water: for each light, a streak on the sea from below it toward the eye. On a
 * rough sea each light's image breaks into a glitter path: the facets that send it to the eye tilt by up to the
 * sea's slope (Cox & Munk 1954, σ² = 0.003 + 0.00512·U, U the wind in m/s at 12.5 m), so seen from a height `hc`
 * a light at elevation α reflects from the water between the depression angles α − σ and α + σ (the bright core),
 * which stretches it toward you, long and narrow for a far, low light. Drawn as one instanced quad per light,
 * oriented in the vertex shader; they tremble with a moving noise. Bay Lights sources (`s` given) pulse with the
 * sculpture's pattern. One draw call for all of them.
 */
export function glints(list: Glint[]): THREE.Mesh {
  const n = list.length, g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  const src = new Float32Array(n * 4), col = new Float32Array(n * 4), c = new THREE.Color();
  list.forEach((l, k) => { src.set([l.x, -l.y, l.h, l.w], k * 4); c.set(l.color); col.set([c.r * l.i, c.g * l.i, c.b * l.i, l.s ?? -1], k * 4); });
  g.setAttribute('aSrc', new THREE.InstancedBufferAttribute(src, 4)); g.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 4));
  g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, uTime: NIGHT.uTime, uOn: NIGHT.uOn, uNight: NIGHT.uNight, uSlope: NIGHT.uSlope },
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec4 aSrc; attribute vec4 aCol; uniform float uSlope; uniform float uTime; uniform float uOn;
      varying vec2 vUV; varying vec3 vCol; varying float vDepth; varying float vSeed;
      ${BAY_LIGHTS_GLSL}
      void main() {
        vec2 L = aSrc.xy, C = cameraPosition.xz, d = C - L;
        float D = max(length(d), 1.0), hc = max(cameraPosition.y, 0.5); vec2 u = d / D, p = vec2(-u.y, u.x);
        float al = atan(aSrc.z, D), sg = uSlope;
        // the streak's ends, as distances from the eye: the mirror image is seen at a depression equal to the light's
        // elevation; facets tilted by up to σ move it (the far end reaches the light's foot once α − σ is below the horizon)
        float dFar = al - sg > 0.0004 ? hc / tan(al - sg) : D, dNear = hc / tan(min(al + 1.5 * sg, 1.4));
        dFar = min(dFar, D); dNear = min(dNear, dFar - 1.0);
        float along = mix(dFar, dNear, position.y);
        // its width: the light's own, seen in the mirror at that distance (w·along/D), plus the glitter's spread across
        float wdt = aSrc.w * along / D + along * sg * max(sin(al), 0.012);
        vec2 q = C - u * along + p * position.x * wdt;
        vUV = vec2(position.x, position.y); vSeed = aSrc.x * 0.013 + aSrc.y * 0.007;
        float k = 1.0;
        if (aCol.w >= 0.0) k = bayLights(aCol.w, 0.55, 20.0, floor(aCol.w / 15.0), uTime) * 1.4;
        // fainter as the light's image spreads over a longer streak
        vCol = aCol.rgb * k * uOn * clamp(60.0 / (dFar - dNear + 30.0), 0.2, 1.0);
        vec4 mv = viewMatrix * vec4(q.x, 0.35, q.y, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime; ${FOG_PARS}
      varying vec2 vUV; varying vec3 vCol; varying float vDepth; varying float vSeed;
      void main() {
        #include <logdepthbuf_fragment>
        float across = 1.0 - vUV.x * vUV.x, ends = smoothstep(0.0, 0.25, vUV.y) * smoothstep(1.0, 0.55, vUV.y);
        // the glitter: bright facets in bands across the streak, moving with the waves
        float tr = 0.55 + 0.45 * sin(vUV.y * 90.0 + uTime * 3.1 + vSeed) * sin(vUV.y * 37.0 - uTime * 1.7 + vUV.x * 2.0);
        float b = across * across * ends * tr * (1.0 - smoothstep(fogNear, fogFar, vDepth));
        gl_FragColor = vec4(vCol * b, 1.0);
      }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 3; nightOnly.push(m); m.visible = false;
  return m;
}

/**
 * The Salesforce Tower's crown, "Day for Night" (Jim Campbell, 2018; Wikipedia, "Salesforce Tower"): about 11,000
 * white LEDs facing inward on the top six floors, seen through the crown's open lattice, showing low-resolution video
 * of people and scenes filmed round the city from sunset to about 00:30 (the SF Chronicle, 2020), then star fields
 * until sunrise. Drawn here as a grid of 200 × 55 cells round and up the crown (`y0`..`y1` in its own frame): drifting
 * soft figures of light for the video, sparse twinkling cells for the stars, warm at first in the sunset's colours.
 */
export function crownDisplayMaterial(y0: number, y1: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsLib.fog, uTime: NIGHT.uTime, uOn: NIGHT.uOn, uNight: NIGHT.uNight, uStars: NIGHT.uStars },
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `#include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vP; varying float vDepth;
      void main() { vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime; uniform float uOn; uniform float uNight; uniform float uStars; ${FOG_PARS}
      varying vec3 vP; varying float vDepth;
      ${HASH}
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(nHash2(i), nHash2(i + vec2(1, 0)), f.x), mix(nHash2(i + vec2(0, 1)), nHash2(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        #include <logdepthbuf_fragment>
        float u = (atan(vP.z, vP.x) / 6.2831853 + 0.5) * 200.0, v = (vP.y - ${y0.toFixed(1)}) / ${(y1 - y0).toFixed(1)} * 55.0;
        if (v < 0.0 || v > 55.0) discard;
        vec2 c = floor(vec2(u, v));
        // the video: soft shapes drifting round the crown (people walking, water, traffic), changing scene every 20 s
        float sc = floor(uTime / 20.0), dir = nHash(sc) < 0.5 ? -1.0 : 1.0;
        float vid = smoothstep(0.55, 0.8, vn(vec2(c.x * 0.09 + dir * uTime * (0.6 + nHash(sc + 1.0)), c.y * 0.14 + sc * 7.0)) * (0.7 + 0.3 * vn(c * 0.3 + uTime)));
        float stars = step(0.992, nHash2(c)) * (0.5 + 0.5 * sin(uTime * (1.0 + 3.0 * nHash2(c.yx)) + c.x));
        float b = mix(0.12 + 0.88 * vid, stars, uStars) * uOn * (0.5 + 0.5 * uNight) * (1.0 - smoothstep(fogNear, fogFar, vDepth));
        vec3 col = mix(vec3(1.0, 0.62, 0.42), vec3(0.95, 0.96, 1.0), smoothstep(0.3, 0.9, uNight)); // the sunset's colours at first
        gl_FragColor = vec4(col * b * 0.9, 1.0);
      }`,
  });
}
