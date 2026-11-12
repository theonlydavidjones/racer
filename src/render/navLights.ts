import './three-setup';
import * as THREE from 'three';
import { NIGHT } from './night';

/**
 * A Folkboat's own lights at night: her navigation lights, by the Navigation Rules (COLREGS 1972 and the US Inland
 * Rules, 33 CFR part 83, which read alike for these; San Francisco Bay inside the demarcation line is Inland), and the
 * warm glow of her cabin's lantern through its windows, companionway and forehatch.
 *
 * Under sail a vessel under 20 m shows sidelights and a sternlight (Rule 25(a)), or may combine the three in one
 * lantern at the masthead, the tricolour (25(b)); never both, and never the tricolour under engine, when she's a
 * power-driven vessel (Rule 3(b), Rule 23). Under 20 m the two sidelights may share one lantern on the centreline
 * (Rule 21(b)): the bicolour, here on the stemhead (a Folkboat has no pulpit). The arcs (Rule 21): each sidelight from
 * right ahead to 22.5° abaft the beam on its own side (112.5°), green to starboard, red to port; the sternlight 67.5°
 * either side of dead astern (135°); together they light the whole horizon once. Lit from sunset to sunrise (Rule 20(b)).
 *
 * How the light falls off at the edges of its arc (Annex I §9(a)): forward, a sidelight keeps its intensity to 1°
 * outside its arc and is cut off by 3°; at the after edges, the intensity may fall to half at the edge and must be gone
 * within 5° outside it. How far each is seen (Rule 22(c), vessels under 12 m): sidelights 1 nautical mile, the
 * sternlight and an all-round light 2 nm. Annex I §8 ties range to the lantern's intensity, I = 3.43·10⁶ · T · D² · K^−D
 * (cd, D in nm, T = 2·10⁻⁷ lx the night-time threshold, K = 0.8 the clear air's transmission per mile), so the
 * illuminance at the eye from a light rated for D₀ at distance D is T · (D₀/D)² · 0.8^(D − D₀): at its rated range it's
 * just at the threshold. (The rule text and the Annex figures are as remembered and reported; the primary pages
 * weren't reachable from here, so they want checking against 33 CFR 83.21–83.25 and part 84.)
 *
 * The reflections: a light low over the water is mirrored by the facets of the waves that tilt the right way to send it
 * to the eye. Wave slopes are spread about σ, with σ² = 0.003 + 0.00512·U (Cox & Munk 1954, U the wind at 12.5 m in
 * m/s), so the light glitters on the water wherever the tilt it needs is within about 2σ: a streak from under the
 * light toward the viewer, long when the light and the eye are low, wider with the wind.
 */

/** The stencil value a boat's surfaces leave where they're drawn, so the lights' reflections on the water stay off her. */
const BOAT_STENCIL = 1;
export function markBoat(m: THREE.Material): void {
  m.stencilWrite = true; m.stencilRef = BOAT_STENCIL; m.stencilFunc = THREE.AlwaysStencilFunc;
  m.stencilFail = THREE.KeepStencilOp; m.stencilZFail = THREE.KeepStencilOp; m.stencilZPass = THREE.ReplaceStencilOp;
}

/** How dark it is, whether lights are on (sunset to sunrise) and the sea's slope: shared with the city's lights (night.ts). */
const DARK = () => NIGHT.uNight.value, ON = () => NIGHT.uOn.value;

const NM = 1852;
type Arc = { from: number; to: number; aftFrom: boolean; aftTo: boolean };
/** Bearing (deg, 0 dead ahead, + to starboard) of the eye from the light, in the boat's frame (bow −z, starboard +x). */
const bearing = (dx: number, dz: number) => Math.atan2(dx, -dz) * 180 / Math.PI;

/**
 * The share of a light's intensity seen at bearing `b` (deg) for its arc (Annex I §9(a)): full inside; at a forward edge
 * full to 1° outside and gone by 3°; at an after edge (22.5° abaft the beam) half at the edge, gone 5° outside.
 */
export function arcIntensity(arc: Arc | null, b: number): number {
  if (!arc) return 1;
  const w = ((arc.to - arc.from) % 360 + 360) % 360, x = ((b - arc.from) % 360 + 360) % 360; // the arc's width; degrees into it
  // how far outside an edge (negative: inside it), and what's left of the light there
  const edge = (out: number, aft: boolean) => aft
    ? (out <= -5 ? 1 : out <= 0 ? 0.5 - 0.1 * out : Math.max(0, 0.5 * (1 - out / 5))) // (1 at 5° inside, ½ at the edge)
    : (out <= 1 ? 1 : Math.max(0, 1 - (out - 1) / 2));
  if (x <= w) return Math.min(edge(-x, arc.aftFrom), edge(x - w, arc.aftTo));
  const pastTo = x - w, pastFrom = 360 - x; // outside: seen only in the tail of the nearer edge
  return pastTo < pastFrom ? edge(pastTo, arc.aftTo) : edge(pastFrom, arc.aftFrom);
}

/** Illuminance at the eye over the night-time threshold, for a light rated for `range` nm seen from `d` m (Annex I §8). */
export const overThreshold = (range: number, d: number) => { const D = Math.max(0.005, d / NM); return (range / D) ** 2 * Math.pow(0.8, D - range); };

/** Which of her lights: the sidelights and sternlight (or the tricolour) under way, the all-round white at anchor. */
type Role = 'underway' | 'anchor';
/** What she shows (Rules 25 and 30): nothing (in her slip or made fast to a dock, or switched off), under way, at anchor or on a mooring. */
export type LightsMode = 'off' | 'underway' | 'anchor';
interface Lamp { pos: THREE.Vector3; color: THREE.Color; arc: Arc | null; range: number; glow: THREE.Sprite; streak: THREE.Mesh; seen: number; role: Role; split: number; spread: number }
export interface NavLights { group: THREE.Group; lamps: Lamp[]; lenses: { m: THREE.MeshPhongMaterial; role: Role }[]; fittings: Record<Role, THREE.Group>; kind: 'deck' | 'tricolour'; sigma: number; sigmaC: number; below?: { uniforms: { uDay: { value: number }; uLamp: { value: number } } }; hatch?: THREE.MeshPhongMaterial }

/** Colours of the lights as the eye sees them (inside Annex I §7's chromaticity areas: a deep red, a blue-green, a warm white). */
const RED = new THREE.Color(1.0, 0.13, 0.08), GREEN = new THREE.Color(0.1, 1.0, 0.55), WHITE = new THREE.Color(1.0, 0.93, 0.8);
const ARC = {
  stbd: { from: 0, to: 112.5, aftFrom: false, aftTo: true },
  port: { from: -112.5, to: 0, aftFrom: true, aftTo: false },
  stern: { from: 112.5, to: -112.5, aftFrom: true, aftTo: true }
};

let glowTex: THREE.Texture | null = null, streakTex: THREE.Texture | null = null;
/** A point of light: a hot core and a soft halo (the eye's own scatter round a bright point). */
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.1, 'rgba(255,255,255,1)'); r.addColorStop(0.22, 'rgba(255,255,255,0.5)'); r.addColorStop(0.5, 'rgba(255,255,255,0.14)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return (glowTex = new THREE.CanvasTexture(c));
}
/** The glitter streak: brightest at the mirror point, fading toward its ends and its sides. */
function streakTexture(): THREE.Texture {
  if (streakTex) return streakTex;
  const c = document.createElement('canvas'); c.width = 32; c.height = 128; const g = c.getContext('2d')!, im = g.createImageData(32, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 32; x++) {
    const u = (x + 0.5) / 32 * 2 - 1, v = (y + 0.5) / 128 * 2 - 1, a = Math.exp(-4 * u * u) * Math.exp(-3 * v * v) * (0.75 + 0.25 * Math.sin(y * 1.7) * Math.sin(y * 0.61 + 1));
    const k = (y * 32 + x) * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = 255; im.data[k + 3] = Math.round(255 * Math.max(0, a));
  }
  g.putImageData(im, 0, 0);
  return (streakTex = new THREE.CanvasTexture(c));
}

const tmpW = new THREE.Vector3(), tmpE = new THREE.Vector3(), tmpL = new THREE.Vector3(), inv = new THREE.Matrix4(), size = new THREE.Vector2();
const X = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3();

/**
 * Her lights, added to the boat's group `grp`: `at` gives the lantern positions in the hull's frame (the stemhead, the
 * transom, the masthead). `kind`: sidelights and sternlight on deck, or the masthead tricolour.
 */
export function buildNavLights(grp: THREE.Group, at: { stem: THREE.Vector3; stern: THREE.Vector3; masthead: THREE.Vector3 }, kind: 'deck' | 'tricolour'): NavLights {
  const group = new THREE.Group(); group.name = 'navLights'; grp.add(group);
  const housing = new THREE.MeshPhongMaterial({ color: 0x15171a, specular: 0x666666, shininess: 60 });
  // the lanterns themselves, a group for each set, always on her: only the light goes on and off
  const fittings = { underway: new THREE.Group(), anchor: new THREE.Group() }; group.add(fittings.underway, fittings.anchor);
  const nl: NavLights = { group, lamps: [], lenses: [], fittings, kind, sigma: 0.15, sigmaC: 0.1 };
  let role: Role = 'underway';
  const lens = (c: THREE.Color) => { const m = new THREE.MeshPhongMaterial({ color: c.clone().multiplyScalar(0.55), emissive: c.clone(), emissiveIntensity: 0, transparent: true, opacity: 0.9, shininess: 100 }); nl.lenses.push({ m, role }); return m; };
  const lamp = (pos: THREE.Vector3, color: THREE.Color, arc: Arc | null, range: number, split = 0) => {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, sizeAttenuation: false, fog: false }));
    glow.visible = false; glow.renderOrder = 5; glow.frustumCulled = false;
    const streak = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: streakTexture(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide,
      stencilWrite: true, stencilRef: BOAT_STENCIL, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp }));
    // (drawn over the sea, whose waves would hide a quad at its mean level, but not over a boat: the water under her
    // hull, her cockpit and her deck is out of sight, so where a boat has marked the stencil the streak isn't drawn)
    streak.visible = false; streak.matrixAutoUpdate = false; streak.matrixWorldAutoUpdate = false; streak.renderOrder = 10; streak.frustumCulled = false;
    const L: Lamp = { pos, color, arc, range, glow, streak, seen: 0, role, split, spread: 0 };
    // what the eye sees of the light, worked out for each camera as it draws: the arc, the range, how dark it is
    glow.onBeforeRender = (r, _s, cam) => {
      tmpW.copy(pos).applyMatrix4(grp.matrixWorld); cam.getWorldPosition(tmpE);
      tmpL.copy(tmpE).applyMatrix4(inv.copy(grp.matrixWorld).invert()).sub(pos);
      const seen = arcIntensity(arc, bearing(tmpL.x, tmpL.z)) * DARK(), d = tmpW.distanceTo(tmpE), e = seen * overThreshold(range, d);
      L.seen = e;
      // the point grows with how far over the threshold it is (a log response, as the eye's), from a pinprick at its range
      r.getSize(size); const p11 = cam instanceof THREE.PerspectiveCamera ? cam.projectionMatrix.elements[5] : 1;
      const px = e < 1e-3 ? 0 : Math.min(48, 3 + 7 * Math.log10(1 + e));
      glow.scale.setScalar(px * 2 / (size.y * p11));
      (glow.material as THREE.SpriteMaterial).opacity = Math.min(1, e);
      // far off, the depth buffer can't tell a light 1 m up from the waves its line of sight grazes; out there her own
      // hull and sails are smaller than the light's point, so it's drawn over them
      (glow.material as THREE.SpriteMaterial).depthTest = d < 150;
      // the bicolour's two lenses are 6 cm apart, far less than the points drawn for them: from ahead, where both show,
      // they'd merge into one yellow-white light. The eye sees a red point and a green one side by side (each lens
      // screened from the other's side), so each is set out to its own side by most of its point's width on the screen
      // (one pixel at d is 2d / (p11 · height) m), and its reflection with it
      L.spread = split ? 0.6 * px * 2 * d / (p11 * size.y) : 0;
      // just in front of the lantern, so its own housing doesn't hide it
      glow.position.copy(pos).addScaledVector(tmpL.normalize(), 0.08); glow.position.x += split * L.spread;
      glow.updateMatrixWorld();
    };
    // the reflection: the stretch of water whose waves can tilt within ±2σ to mirror the light to the eye
    streak.onBeforeRender = (_r, _s, cam) => {
      cam.getWorldPosition(tmpE); tmpW.copy(pos); tmpW.x += L.split * L.spread; tmpW.applyMatrix4(grp.matrixWorld);
      const e = L.seen; if (e < 0.02) { (streak.material as THREE.MeshBasicMaterial).opacity = 0; return; }
      const h = Math.max(0.05, tmpW.y), Hc = Math.max(0.3, tmpE.y), dx = tmpE.x - tmpW.x, dz = tmpE.z - tmpW.z, D = Math.hypot(dx, dz);
      // the slope a facet x m from the light toward the eye needs: half the difference of the two depression angles
      const need = (x: number) => (Math.atan2(h, x) - Math.atan2(Hc, Math.max(0.01, D - x))) / 2;
      const s2 = 2 * nl.sigma, root = (target: number) => { let lo = 0.01, hi = Math.max(0.02, D - 0.01); for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (need(m) > target) lo = m; else hi = m; } return (lo + hi) / 2; };
      const x0 = root(s2), x1 = root(-s2), len = Math.max(0.2, x1 - x0), mid = (x0 + x1) / 2;
      // across: a facet x m from the eye mirrors a light w m to one side when tilted w·(1/x + 1/(D − x))/2, so the streak's
      // half-width at its middle is σ_c·x·(D − x)/D, σ_c the slopes' spread across the line of sight
      const wid = Math.min(10, Math.max(0.2, 2 * nl.sigmaC * mid * (D - mid) / D));
      X.set(dx / (D || 1), 0, dz / (D || 1)); Z.crossVectors(X, Y);
      // lying on the water: the quad's x across the streak, its y along it toward the eye, its face up
      streak.matrixWorld.makeBasis(Z.clone().multiplyScalar(wid), X.clone().multiplyScalar(len), Y).setPosition(tmpW.x + X.x * mid, 0.03, tmpW.z + X.z * mid);
      (streak.material as THREE.MeshBasicMaterial).opacity = Math.min(0.7, 0.13 * Math.log10(1 + e) * (0.6 + 0.4 * Math.min(1, 0.15 / nl.sigma)));
    };
    group.add(glow); group.add(streak); nl.lamps.push(L);
  };
  if (kind === 'deck') {
    // the bicolour on the stemhead: a small lantern, green lens to starboard, red to port, split by a black screen
    const b = new THREE.Group(); b.position.copy(at.stem); fittings.underway.add(b);
    b.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.06), housing));
    const g = lens(GREEN), r = lens(RED);
    const lg = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.035, 0.05), g); lg.position.set(0.037, 0, -0.005); b.add(lg);
    const lr = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.035, 0.05), r); lr.position.set(-0.037, 0, -0.005); b.add(lr);
    lamp(at.stem.clone().add(new THREE.Vector3(0.03, 0, -0.02)), GREEN, ARC.stbd, 1, 1);
    lamp(at.stem.clone().add(new THREE.Vector3(-0.03, 0, -0.02)), RED, ARC.port, 1, -1);
    // the sternlight on the transom, a little to port of the rudder head
    const s = new THREE.Group(); s.position.copy(at.stern); fittings.underway.add(s);
    s.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.035), housing));
    const w = lens(WHITE), lw = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.035, 0.004), w); lw.position.z = 0.019; s.add(lw);
    lamp(at.stern.clone().add(new THREE.Vector3(0, 0, 0.03)), WHITE, ARC.stern, 2);
  } else {
    // the tricolour: one lantern at the masthead, its three sectors from one bulb
    const t = new THREE.Group(); t.position.copy(at.masthead); fittings.underway.add(t);
    t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12), housing));
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.04, 12), lens(WHITE)); ring.position.y = 0.01; t.add(ring);
    for (const [c, arc] of [[GREEN, ARC.stbd], [RED, ARC.port], [WHITE, ARC.stern]] as const) lamp(at.masthead.clone().add(new THREE.Vector3(0, 0.01, 0)), c, arc, 2);
  }
  // at anchor or on a mooring: one all-round white light where it can best be seen (Rule 30(b), a vessel under 50 m;
  // Inland Rule 30 reads alike), seen 2 nm (Rule 22(c), under 12 m): a small all-round lantern at the masthead. (In a
  // special anchorage such as Richardson Bay, Inland Rule 30(g) excuses a boat under 20 m from it; showing it is allowed.)
  role = 'anchor';
  // (on a short bracket aft of the masthead, clear of the windex's post and arrow and of the tricolour)
  { const a = new THREE.Group(), ap = at.masthead.clone().add(new THREE.Vector3(0, -0.03, 0.1)); a.position.copy(ap); fittings.anchor.add(a);
    a.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.03, 10), housing));
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.04, 10), lens(WHITE)); ring.position.y = 0.035; a.add(ring);
    lamp(ap.clone().add(new THREE.Vector3(0, 0.035, 0)), WHITE, null, 2); }
  return nl;
}

/**
 * Restricted visibility (the conditions set to fog, or heavy rain): the lights are shown by day too (Rule 20(c)).
 * The summer fog bank at the Gate, which comes and goes by place, isn't counted.
 */
let restricted = false;
export function setRestrictedVisibility(on: boolean): void { restricted = on; }

/**
 * Each frame: which set is lit, by what she's doing (`mode`), the clock (sunset to sunrise, Rule 20(b)) and the visibility (Rule 20(c)), and the
 * reflections' spread from the sea. In her slip or made fast to a dock she shows none (the Rules light vessels under
 * way or at anchor, not ones made fast to the shore), under way the sidelights and sternlight or the tricolour
 * (Rule 25), at anchor the all-round white (Rule 30). The lanterns stay on her, dark when not lit.
 */
export function syncNavLights(nl: NavLights, mode: LightsMode = 'underway'): void {
  const dark = ON() > 0 || restricted, lit = (r: Role) => dark && mode === r;
  // (the lanterns themselves stay on her, lit or not, as on any boat: the owner's call)
  nl.fittings.underway.visible = nl.fittings.anchor.visible = true;
  // the sea's slopes (Cox & Munk 1954): all directions σ² = 0.003 + 0.00512·U (night.ts, from the true wind); across the
  // wind σ_c² = 0.003 + 0.00192·U (the streak is taken as if seen across the wind)
  nl.sigma = NIGHT.uSlope.value; const U = Math.max(0, (nl.sigma ** 2 - 0.003) / 0.00512); nl.sigmaC = Math.sqrt(0.003 + 0.00192 * U);
  for (const L of nl.lamps) L.glow.visible = L.streak.visible = lit(L.role);
  for (const { m, role } of nl.lenses) m.emissiveIntensity = lit(role) ? 1.6 : 0;
  // (the cabin's lamps are hers to light whatever she's doing: on after dark)
  const on = dark;
  // the cabin's lantern (cabinInterior.ts): lit after dark, brighter as the dusk deepens; by day only what comes in
  // through the openings lights the cabin. Its light is what's seen through the windows and the companionway, and,
  // faintly, through the smoked acrylic of the forehatch, forward of the cabin's bulkhead
  const lamp = on ? 0.35 + 0.65 * DARK() : 0;
  if (nl.below) { nl.below.uniforms.uLamp.value = lamp; nl.below.uniforms.uDay.value = 2.1 * (1 - DARK()) + 0.03; }
  if (nl.hatch) { nl.hatch.emissive.setRGB(1.0, 0.62, 0.3); nl.hatch.emissiveIntensity = 0.08 * lamp; }
}
