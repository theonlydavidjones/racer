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
  /** Late at night (from 23:00 to 01:00 local, 0 → 1): offices and homes put their lights out. */
  uLate: { value: 0 },
  /** Seconds, for the light shows' movement. */
  uTime: { value: 0 },
  /** The sea's slope standard deviation (Cox & Munk), for how long and wide the reflections stretch. */
  uSlope: { value: 0.15 },
  /** The Salesforce Tower's crown: 0 = its city video (sunset to 00:30), 1 = the stars (00:30 to sunrise). */
  uStars: { value: 0 },
};

/** Objects that show only when the installations are on (hidden by day, so they cost no draw calls). */
export const nightOnly: THREE.Object3D[] = [];

const HASH = `
float nHash(float n) { return fract(sin(n) * 43758.5453123); }
float nHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
`;

/**
 * Lit windows: patches a Lambert or Phong material so its walls show a grid of windows after dark, each on or off
 * by its own chance, the fraction lit varying from building to building (an instanced mesh gives each instance its
 * own) and falling late at night. The window grid comes from the wall's position in the world (floors every
 * `floor` metres, bays every `bay` metres along the wall), so it needs no texture or uv. Where a window is smaller
 * than a pixel the wall shows the average of its windows instead, so the far city glows evenly and doesn't shimmer.
 * `warm` is the share of warm (homes, 2700–3000 K) against cool (offices, 4000 K) light.
 */
export function litWindows(mat: THREE.Material, o: { floor?: number; bay?: number; lit?: [number, number]; warm?: number; seed?: number; glow?: number; from?: number } = {}): void {
  const { floor = 3.6, bay = 3.2, lit = [0.15, 0.55], warm = 0.5, seed = 0, glow = 1, from = 4 } = o;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, { uNight: NIGHT.uNight, uLate: NIGHT.uLate });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWinP; varying vec3 vWinN; varying float vWinSeed;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vec4 winW = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vWinN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
          vWinSeed = float(gl_InstanceID) * 0.6180339 + ${(seed + 0.5).toFixed(3)};
        #else
          vec4 winW = modelMatrix * vec4(transformed, 1.0);
          vWinN = normalize(mat3(modelMatrix) * objectNormal);
          vWinSeed = ${(seed + 0.5).toFixed(3)};
        #endif
        vWinP = winW.xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight; uniform float uLate; varying vec3 vWinP; varying vec3 vWinN; varying float vWinSeed;${HASH}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (uNight > 0.01 && abs(vWinN.y) < 0.5 && vWinP.y > ${from.toFixed(1)}) {
          vec2 tg = normalize(vec2(-vWinN.z, vWinN.x));
          vec2 cell = vec2(dot(vWinP.xz, tg) / ${bay.toFixed(2)}, vWinP.y / ${floor.toFixed(2)});
          vec2 id = floor(cell), f = fract(cell);
          float bld = nHash(vWinSeed * 17.0);
          float share = mix(${lit[0].toFixed(3)}, ${lit[1].toFixed(3)}, bld) * (1.0 - 0.6 * uLate);
          float on = step(nHash2(id + vWinSeed * 31.0), share);
          // the glass in the middle of each cell, the wall and floor slab round it
          float pane = step(0.18, f.x) * step(f.x, 0.86) * step(0.22, f.y) * step(f.y, 0.88);
          float w = on * pane * (0.55 + 0.45 * nHash2(id.yx + 3.7));
          // smaller than a pixel: the wall's average instead
          float sub = smoothstep(0.35, 0.9, max(length(fwidth(cell.x)), length(fwidth(cell.y))));
          w = mix(w, share * 0.46 * 0.78, sub);
          float wm = step(nHash2(id * 1.3 + 7.1), ${warm.toFixed(2)});
          vec3 wc = mix(vec3(0.80, 0.86, 1.0), vec3(1.0, 0.74, 0.42), wm);
          totalEmissiveRadiance += wc * w * uNight * ${glow.toFixed(2)};
        }`);
  };
  mat.customProgramCacheKey = () => `win${floor}|${bay}|${lit}|${warm}|${seed}|${glow}|${from}`;
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
        float b = bayLights(vS, vH, vHm, vC, uTime) * uOn * (0.45 + 0.55 * uNight);
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
        float wdt = aSrc.w + along * 2.0 * sg * max(sin(al), 0.012);
        vec2 q = C - u * along + p * position.x * wdt;
        vUV = vec2(position.x, position.y); vSeed = aSrc.x * 0.013 + aSrc.y * 0.007;
        float k = 1.0;
        if (aCol.w >= 0.0) k = bayLights(aCol.w, 0.55, 20.0, floor(aCol.w / 15.0), uTime) * 1.4;
        // fainter as the light's image spreads over a longer streak
        vCol = aCol.rgb * k * uOn * clamp(60.0 / (dFar - dNear + 30.0), 0.12, 1.0);
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
