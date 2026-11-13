import './three-setup';
import { ensignStep, flagDrawn, flagExtension, flagRow } from './flagWave';
import * as THREE from 'three';
import { D2R, KT } from '../core/math';
import { FLEET, type Boat, type Tack } from '../boat/boat';
import { CAR_FORE_PINS, CAR_IN_PINS, carLead } from '../boat/controls';
import { sailPlan } from '../boat/physics';
import { guideTune, rigDrawn } from '../boat/rigTune';
import { lineColor, type BoatSpec, type LineColorKey } from '../boat/spec';
import { P3 } from './coords';
import { buildCrew, dockhand, syncCrew, tillerTip, type Crew } from './crew';
import { burgeeCanvas, officerRule } from './burgees';
import { flagArtCanvas, needsCourtesy } from './flagArt';
import { DEFAULT_CREW } from '../boat/crewPhys';
import { buildInstrument, syncInstrument, type Instrument } from './tacktick';
import { cabinHalf, CABIN, COCKPIT, COAMING_T, HEEL, L, aftLineZ, PAINT_LINES, RUDDER_RAKE, cabinGeometry, cabinTopAt, sidePatch, cockpitLid, companionwayLid, slidingHatch, companionwayDoors, companionwayDoorPanels, COMPANIONWAY, sheer, uAtZ, cockpitGeometry, cockpitHalf, COCKPIT_FIT, COAMING_H, thwartTop, lazaretteLids, thwartGeometry, deckGeometry, deckY, fairCurve, halfBeam, hullGeometry, rail, rudderGeometry, sheerLine } from './hull';
import { NIGHT } from './night';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cabinInteriorGeometry, cabinInteriorMaterial, lanternGeometry, makeLanternSwing, swingLantern, windowLids, type LanternSwing } from './cabinInterior';
import { buildNavLights, markBoat, syncNavLights, type NavLights } from './navLights';
import { Sail, Telltale, boatTells, sailEdges, type SailDef, type SailShape } from './sails';

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/**
 * The sails, as Folkboat sails are made (crosscut Dacron; from photographs of San Francisco boats and Fritz Segel's
 * drawings of their Folkboat main and jibs, fritz-segel.com): the main with four battens up the leech (the top one
 * shorter), a long window low down parallel to the boom and a small upright spreader window near the luff (for watching
 * the jib's leech); the jib with three battens, a window low down toward the luff, and a radially cut head.
 */
/*
 * The rig, where the class puts it (NFIA Class Rules 2025–2028, "CR") and as FRIDA's ORC certificate measures it (EST F51,
 * 2026; the same figures as src/boat/balance.ts):
 * - the forestay meets the deck 0.80 m aft of the bow (CR 7.21, the least allowed) and the mast's fore side is 2.00 m
 *   aft of that (CR 6.1.7: 1990–2000 mm), so the mast's front is 2.80 m from the bow;
 * - the mast is 110 mm across and 133 mm fore and aft with its luff groove (CR 6.1.6: 100–110 mm; 6.1.4: the groove 23 mm);
 * - the boom's top is at the lower band, 1.00 m above the deck (CR 6.1.11), the main's head at the upper band P = 8.75 m
 *   above that, and its clew at the boom band, E = 3.38 m from the mast's after side (CR 6.3.3);
 * - the forestay meets the mast IG = 6.50 m above the deck (CR 6.1.11: no more than 5.50 m above the lower band), and the
 *   shrouds about there too (CR 7.60: 5.30–5.50 m above it), from chainplates at least 0.90 m out and 0.28–0.36 m aft of
 *   the mast's after side (CR 7.20);
 * - the masthead is 0.28 m above the upper band (CR 6.1.10: 0.25–0.30 m);
 * - no spreaders: the standing rigging is the main shrouds, the forestay, the jumper stays and the backstay (CR 7.10). The
 *   jumper struts are 5.50 m above the lower band, 450 mm long, their bearing points 900 mm apart (CR 6.1.12); the jumper
 *   stays run from 8.50–8.75 m above the band over them down to 2.235–2.265 m (CR 7.60), and the shrouds meet the mast
 *   below the struts (CR 7.60).
 * The mast section is the timber mast's; an aluminium one may be 100–112 mm at the deck and tapers above 5.5–7.0 m
 * (CR 6.2.1, 6.2.3), so its after side, the origin for E, is up to about 1 cm further forward than drawn.
 * Heights "above the deck" are taken from the deck at the mast (DECK_AT_MAST). (CR 6.1.7's 2.00 m is a distance, CR 7.21's 0.80 m
 * horizontal: with the sheer 0.21 m higher at the stay, 2.00 m horizontally is 2.011 m in a straight line, as ORC's J
 * measures it horizontally.)
 */
const MAST_FRONT_Z = -L / 2 + 0.80 + 2.00, MAST_FA = 0.133, MAST_ATH = 0.110;
const MAST_Z = MAST_FRONT_Z + MAST_FA / 2, MAST_AFT_Z = MAST_FRONT_Z + MAST_FA;
/**
 * The deck at the mast, on the centreline where the mast goes through it: CR 6.1.11 measures the Lower Mast Point "1000mm
 * ± 10mm above deck ... taken along the aft side of the mast", so the rig's heights are from here, not from the sheer at
 * the side (the deck's camber puts it about 4.5 cm higher), at the mast's after side as the rule measures. (The physics'
 * heights, balance.ts RIG, are ORC's, from its datum, the sheer at the mast: HBI, BAS and IG, ORC VPP Documentation
 * 2026. The drawing and the physics differ by the deck's camber at the mast.)
 */
const DECK_AT_MAST = deckY(uAtZ(MAST_AFT_Z), 0);
const BAS = 1.0, P = 8.75, E = 3.38, IG = 6.5;
/** The boom's top (the main's tack and foot), and the masthead. */
const BOOM_TOP = DECK_AT_MAST + BAS, MAST_TOP = BOOM_TOP + P + 0.28, BOOM_R = 0.045;
const FORESTAY_DECK = V3(0, deckY(uAtZ(-L / 2 + 0.80), 0), -L / 2 + 0.80); // (on the deck's crown, as the mast)
/** Where the forestay meets the mast's front (the hounds), and the shrouds its sides. */
const HOUNDS = V3(0, DECK_AT_MAST + IG, MAST_FRONT_Z);
/**
 * The main, in the boom's frame (origin at the mast's after side, at the waterline): luff P, foot E, and its roach. Its
 * widths, measured (as ORC does) square from the luff at a quarter, half, three quarters and seven eighths of the way up
 * the leech and at the head, from the certificate: MQW 2.89, MHW 2.22, MTW 1.32, MUW 0.72, MHB 0.11 m; the class's limits
 * on the same widths (CR 9.22, measured from the head: 1.31 m at 2.28 m down the leech, 2.225 m at 4.57 m) agree within
 * a centimetre. The sail is laid out by height up the luff rather than distance along the leech, which differ here by a
 * few centimetres (ORC rates the widths at their real heights up the luff: 2.31, 4.58, 6.78, 7.80 m; drawn 2.32, 4.58,
 * 6.75, 7.77). A fair leech through them encloses 18.48 m². ORC's "measured area" from the same widths is 17.89 m²
 * (ORC Rating Systems 2026, rule 109.1: P/8·(E + 2·MQW + 2·MHW + 1.5·MTW + MUW + 0.5·MHB)); its rated outline, with
 * straight leech segments between the widths at their heights, 18.37; the certificate's Area_Main, 18.51 (the rest is
 * other terms of rule 109, the mast section's perhaps). The physics uses the four certificates' average, 18.45.
 */
const MAIN_GIRTH = fairCurve([[0, E], [0.25, 2.89], [0.5, 2.22], [0.75, 1.32], [0.875, 0.72], [1, 0.11]]);
const MAIN_LEECH = Math.hypot(P, E);
const MAIN_DEF: SailDef = {
  tack: V3(0, BOOM_TOP, 0), head: V3(0, BOOM_TOP + P, 0), clew: V3(0, BOOM_TOP, E), depth: 0.42, rows: 18, cols: 10,
  // the roach square to the straight leech, from the width it adds square to the luff
  roach: t => (MAIN_GIRTH(t) - E * (1 - t)) * MAIN_LEECH / P,
  windows: [{ t0: 0.3 / P, t1: 0.65 / P, s0: 0.18, s1: 0.18 + 1.8 / E }, { t0: 0.3, t1: 0.355, s0: 0.07, s1: 0.16 }],
  battens: [{ t: 0.2, len: 1.0 }, { t: 0.41, len: 1.0 }, { t: 0.61, len: 1.0 }, { t: 0.82, len: 0.6 }], battenLines: false,
  footOnSpar: true // the foot's bolt-rope in the boom's groove, the clew lashed at its end
};
/** The forestay: the jib swings around it, so its luff stays on the stay. */
const JIB_AXIS = HOUNDS.clone().sub(FORESTAY_DECK).normalize();
/**
 * The jib, hanked on the forestay, in its own frame (origin where the stay meets the deck): from the certificate, luff
 * 5.95 m and LP 2.36 m (the clew's distance square from the luff), area 7.30 m². Its tack is on a short strop 0.10 m up
 * the stay; the clew sits 1.20 m above the water (an estimate). With the car 2.65 m aft of the stay (North Sails'
 * Nordic Folkboat tuning guide, as boat/crewPhys.ts)
 * the sheet pulls about 30° more steeply than the clew's bisector, closing the leech a little; the bisector would
 * want the car about 2.79 m aft. The leech has the small roach that makes up
 * the certificate's area (the class allows a head 0.14 m wide 0.20 m down, CR 9.32).
 */
const JIB_LUFF = 5.95, JIB_LP = 2.36, JIB_CLEW_Y = 1.20, JIB_ROACH = 0.09;
const JIB_DEF: SailDef = (() => {
  const a = JIB_AXIS, n = V3(0, -a.z, a.y); // square to the stay, aft
  const tack = a.clone().multiplyScalar(0.10), f = (JIB_CLEW_Y - FORESTAY_DECK.y - tack.y - JIB_LP * n.y) / a.y;
  return {
    tack, head: tack.clone().addScaledVector(a, JIB_LUFF), clew: tack.clone().addScaledVector(n, JIB_LP).addScaledVector(a, f), depth: 0.36, rows: 14, cols: 8,
    roach: t => JIB_ROACH * Math.sin(Math.PI * t) ** 1.5,
    windows: [{ t0: 0.14, t1: 0.21, s0: 0.17, s1: 0.56 }],
    battens: [{ t: 0.25, len: 0.7 }, { t: 0.51, len: 0.47 }, { t: 0.76, len: 0.37 }], battenLines: false
  };
})();
/** The rig's layout, for the tests (tests/rig.test.ts). */
export const RIG = { MAST_FRONT_Z, MAST_Z, DECK_AT_MAST, BOOM_TOP, MAST_TOP, FORESTAY_DECK, HOUNDS, JIB_AXIS, MAIN_DEF, JIB_DEF, carPos: (side: number, fore: number, ins: number) => carPos(side, fore, ins) };
const WINDOW_MAT = new THREE.MeshPhongMaterial({ color: 0xd8e8ee, transparent: true, opacity: 0.22, shininess: 90, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false });

/** Glossy materials that reflect the sky (the scene sets their environment map from the sky as it changes). */
export const REFLECTIVE: { mat: THREE.MeshPhongMaterial; amount: number }[] = [];
const reflect = <T extends THREE.MeshPhongMaterial>(m: T, amount: number): T => { m.combine = THREE.MixOperation; m.reflectivity = amount; REFLECTIVE.push({ mat: m, amount }); return m; };
const MAT = {
  deck: new THREE.MeshLambertMaterial({ color: 0xb98d5c, side: THREE.DoubleSide }), // laid teak / varnish
  cabin: new THREE.MeshLambertMaterial({ color: 0xece6d8 }),
  spar: new THREE.MeshLambertMaterial({ color: 0xc7a06a }), // varnished spruce
  // fiberglass boats: off-white non-skid gelcoat deck, anodised aluminium spars
  deckGrp: new THREE.MeshLambertMaterial({ color: 0xb9b5ab, side: THREE.DoubleSide }), // matte non-skid reads darker than the glossy cabin top
  // clear (silver) anodised aluminium, the usual Folkboat extrusion (as CircleSea's boom, the owner's photo): a satin
  // mid-grey with soft, broad highlights, not a mirror (it read as white plastic, taking the bright sky)
  sparAlu: reflect(new THREE.MeshPhongMaterial({ color: 0x8e959b, specular: 0x5c6166, shininess: 28 }), 0.08),
  wire: new THREE.LineBasicMaterial({ color: 0x333333 }),
  wood: reflect(new THREE.MeshPhongMaterial({ color: 0x8a5a30, specular: 0x553322, shininess: 40 }), 0.06), // varnished trim
  tiller: new THREE.MeshPhongMaterial({ color: 0xb07a44, specular: 0x664422, shininess: 50 }),
  cream: new THREE.MeshLambertMaterial({ color: 0xebe5d6, side: THREE.DoubleSide }),
  mahogany: new THREE.MeshPhongMaterial({ color: 0x6e3f22, specular: 0x442211, shininess: 45, side: THREE.DoubleSide }),
  glass: new THREE.MeshPhongMaterial({ color: 0x1d2a33, specular: 0xaabbcc, shininess: 90 }),
  dark: new THREE.MeshLambertMaterial({ color: 0x1a1d22 })
};


/**
 * Paint by height, per pixel, so the lines are crisp: bottom paint, the boot stripe, the topsides (paintLines in
 * hull.ts). The vertex colours carry only the light and shade of the laps. `rudder`: the blade's own frame is raked
 * and turns, so its height is taken in the boat's frame.
 */
function paintMaterial(m: THREE.MeshPhongMaterial, top: THREE.Color, boot: THREE.Color, bottom: THREE.Color, rudder = false): THREE.MeshPhongMaterial {
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uTop: { value: top }, uBoot: { value: boot }, uBottom: { value: bottom }, uL: { value: L }, uRake: { value: rudder ? RUDDER_RAKE : 0 }, uHeel: { value: new THREE.Vector2(HEEL.y, HEEL.z) },
      uLines: { value: new THREE.Vector4(PAINT_LINES.wl, PAINT_LINES.wlRise, PAINT_LINES.stripe, PAINT_LINES.stripeRise) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uRake; uniform vec2 uHeel; varying vec2 vPaint;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${rudder ? 'vPaint = vec2(uHeel.x + position.y * cos(uRake) - position.z * sin(uRake), uHeel.y + position.y * sin(uRake) + position.z * cos(uRake));' : 'vPaint = vec2(position.y, position.z);'}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uTop; uniform vec3 uBoot; uniform vec3 uBottom; uniform float uL; uniform vec4 uLines; varying vec2 vPaint;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float e = pow(2.0 * vPaint.y / uL, 2.0), wl = uLines.x + uLines.y * e, tp = uLines.x + uLines.z + (uLines.y + uLines.w) * e;
        float aw = max(fwidth(vPaint.x) * 0.6, 0.0006);
        vec3 paintC = mix(uBottom, mix(uBoot, uTop, smoothstep(tp - aw, tp + aw, vPaint.x)), smoothstep(wl - aw, wl + aw, vPaint.x));
        diffuseColor.rgb *= paintC;`);
  };
  m.customProgramCacheKey = () => 'hullpaint' + (rudder ? 'R' : 'H');
  return m;
}

/** Hull, deck, cabin, cockpit, rudder and tiller, painted for this boat. The rudder group turns about its hinge. */
function buildHull(b: Boat, grp: THREE.Group): THREE.Group {
  const F = FLEET[b.id] ?? FLEET[1], glass = b.build.hull === 'fiberglass', paint = b.paint ?? F.paint;
  const C = (h: string) => new THREE.Color(h), boot = paint.boot || b.hullColor; // no boot stripe: the topsides run down to the bottom paint
  const hullMat = glass
    ? reflect(new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x777777, shininess: 75 }), 0.14) // glossy gelcoat, reflecting the sky
    : reflect(new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x333333, shininess: b.hullColor === '#9a6a36' ? 60 : 25 }), b.hullColor === '#9a6a36' ? 0.08 : 0.04); // painted or varnished planking
  paintMaterial(hullMat, C(b.hullColor), C(boot), C(paint.bottom));
  grp.add(new THREE.Mesh(hullGeometry(), hullMat));
  // the sea is never drawn inside the hull: a lid over the cockpit at deck level, in the depth buffer only (drawn after
  // the boat and before the water, which scene.ts draws last of the solid things)
  // (the companionway's openings too: one mesh for both)
  const lid = new THREE.Mesh(mergeGeometries([cockpitLid().toNonIndexed(), companionwayLid(), windowLids()], false)!, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide })); lid.renderOrder = 1; grp.add(lid);
  // deck: non-skid on glassfibre boats, painted canvas or laid teak on the wooden ones
  const teak = paint.deck.startsWith('teak'), silver = paint.deck === 'teak-silver';
  const deckMat = teak ? new THREE.MeshLambertMaterial({ color: 0xffffff, map: teakTexture(silver), side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ color: paint.deck, side: THREE.DoubleSide });
  // the cabin top: as chosen (paint or laid teak), or else like the deck (a teak-decked boat's: painted canvas)
  const ct = paint.cabinTop;
  const cabinTopMat = ct ? (ct.startsWith('teak') ? new THREE.MeshLambertMaterial({ color: 0xffffff, map: teakTexture(ct === 'teak-silver'), side: THREE.DoubleSide }) : new THREE.MeshLambertMaterial({ color: ct, side: THREE.DoubleSide }))
    : teak ? new THREE.MeshLambertMaterial({ color: 0xd9cfb6, side: THREE.DoubleSide }) : deckMat;
  grp.add(new THREE.Mesh(deckGeometry(), deckMat));
  // cabin trunk: cream sides (varnished mahogany on the wooden boats), deck-coloured top
  const cab = cabinGeometry();
  const sideMat = glass ? MAT.cream : MAT.mahogany;
  grp.userData.sideMat = sideMat; // (the winches' pedestals, moulded with the coamings: buildLines)
  grp.add(new THREE.Mesh(cab.sides, sideMat));
  grp.add(new THREE.Mesh(cab.top, cabinTopMat));
  grp.add(new THREE.Mesh(cab.aft, sideMat));
  const zc = (u: number) => -L / 2 + u * L;
  // the cabin window: one long, narrow light each side with rounded ends, set in an aluminium frame (as on Josephine;
  // portholes' shape is free, CR 3.19)
  // (one material for both: after dark the cabin's lamps glow warm through the glass, not the frame; navLights.ts
  // syncNavLights sets how bright, on the boat-lights clock)
  // (clear glass in an aluminium frame, cut through the cabin side: the cabin's inside, lit by its lantern after dark,
  // is what shows through it)
  const winTex = windowTexture(), winMat = new THREE.MeshPhongMaterial({ map: winTex, transparent: true, specular: 0x99aabb, shininess: 90, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const s of [1, -1]) {
    const geo = sidePatch(uAtZ(-0.05), 0.95, CABIN.h * 0.32, CABIN.h * 0.72, 24, 2);
    if (s < 0) mirrorPatch(geo);
    grp.add(new THREE.Mesh(geo, winMat));
  }
  const topAft = cab.topY(CABIN.u1), zAft = zc(CABIN.u1);
  // companionway, sliding hatch and the compass on the aft end of the cabin (as on Josephine)
  // the companionway open, its hatch slid forward: through the doorway its well and steps, dim varnished wood by day;
  // after dark lit warm by the cabin's lamp below, brightest low down and fading up the well (navLights.ts, the same
  // clock as the ports)
  // the cabin's inside (cabinInterior.ts), seen through the companionway and the windows, lit by its one lantern
  const below = cabinInteriorMaterial();
  grp.add(new THREE.Mesh(cabinInteriorGeometry(), below));
  grp.userData.below = below;
  // its lantern, on its own arm from the shackle so it can swing (syncBoatMesh)
  const lanternArm = new THREE.Group(); lanternArm.add(new THREE.Mesh(lanternGeometry(), below)); grp.add(lanternArm);
  grp.userData.lantern = makeLanternSwing(lanternArm);
  const compass = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 20), MAT.dark); compass.rotation.x = Math.PI / 2; compass.position.set(0.42, topAft - CABIN.h * 0.5, zAft + 0.016); compass.name = 'compass'; grp.add(compass);
  // wooden grab rails on the cabin top, and the sliding hatch (one mesh: the same varnished wood)
  // the companionway open (the hatch slid forward, the doors stowed below) or shut (the hatch slid aft, the doors in)
  const shut = paint.companionway === 'closed';
  const woodTop = [slidingHatch(shut).toNonIndexed(), ...(shut ? companionwayDoors().map(g => (g.index ? g.toNonIndexed() : g)) : [])];
  if (shut) { // the doors' panels a darker varnish, set in; their hinges and latch bronze
    const dp = companionwayDoorPanels(), keep = (g: THREE.BufferGeometry) => { const q = g.toNonIndexed(); for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal') q.deleteAttribute(k); return q; };
    grp.add(new THREE.Mesh(mergeGeometries(dp.panels.map(keep), false)!, DOOR_PANEL));
    grp.add(new THREE.Mesh(mergeGeometries(dp.metal.map(keep), false)!, BRONZE));
  }
  { // the doorway's frame (a post each side, the sill across its foot) and the hatch's runners along the cabin top
    const { hw, len, sill } = COMPANIONWAY, z1 = zc(CABIN.u1), top = cabinTopAt(CABIN.u1, hw);
    for (const sx of [1, -1]) {
      woodTop.push(new THREE.BoxGeometry(0.04, top - sill, 0.025).toNonIndexed().translate(sx * (hw + 0.02), (top + sill) / 2, z1 + 0.012));
      const xr = sx * (hw + 0.045), zf = z1 - 2 * len - 0.08, zm = (z1 + zf) / 2;
      woodTop.push(new THREE.BoxGeometry(0.025, 0.035, z1 - zf).toNonIndexed().translate(xr, cabinTopAt(uAtZ(zm), xr) + 0.017, zm));
    }
    woodTop.push(new THREE.BoxGeometry(2 * hw + 0.08, 0.03, 0.05).toNonIndexed().translate(0, sill - 0.015, z1 + 0.005));
  }
  for (const s of [1, -1]) {
    const gu = (CABIN.u0 + CABIN.u1) / 2 + 0.03, gx = s * (CABIN.w - 0.2);
    woodTop.push(new THREE.BoxGeometry(0.04, 0.05, 1.2).toNonIndexed().translate(gx, cabinTopAt(gu, gx) + 0.03, zc(gu)));
  }
  for (const g of woodTop) for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  grp.add(new THREE.Mesh(mergeGeometries(woodTop, false)!, MAT.wood));
  // cockpit well, seats, and coamings
  // the cockpit: oiled teak throughout (sole, sides and seats), whatever the deck, as on Josephine
  const cockpitTeak = new THREE.MeshLambertMaterial({ color: 0xffffff, map: teakTexture(false), side: THREE.DoubleSide });
  const cg = cockpitGeometry(), flat = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map(g => (g.index ? g.toNonIndexed() : g)), false)!;
  grp.add(new THREE.Mesh(plankUV(flat(cg.teak)), cockpitTeak)); // the sole, benches and shelf (one mesh)
  grp.add(new THREE.Mesh(flat(cg.lining), COCKPIT_LINING)); // the hull's inside round the footwell, under the side decks, and the after wall: smooth moulding
  grp.add(new THREE.Mesh(flat(cg.panel), LOCKER)); // the lazarettes: varnished lockers, fronts, ends and lids
  // each lazarette's lid: the seam where it lifts, its two hinges along the outboard edge, and a finger-hole at the front
  { const seams: THREE.BufferGeometry[] = [], hinges: THREE.BufferGeometry[] = [], g = 0.007;
    for (const l of lazaretteLids()) {
      const xa = Math.min(l.x0, l.x1), xb = Math.max(l.x0, l.x1), y = l.y + 0.0015, fx = l.x0 + Math.sign(l.x1 - l.x0) * 0.035;
      for (const z of [l.z0, l.z1]) seams.push(new THREE.BoxGeometry(xb - xa, 0.002, g).translate((xa + xb) / 2, y, z));
      for (const x of [xa, xb]) seams.push(new THREE.BoxGeometry(g, 0.002, l.z1 - l.z0).translate(x, y, (l.z0 + l.z1) / 2));
      seams.push(new THREE.BoxGeometry(0.025, 0.002, 0.06).translate(fx, y, (l.z0 + l.z1) / 2)); // the finger-hole
      for (const f of [0.22, 0.78]) hinges.push(new THREE.BoxGeometry(0.03, 0.006, 0.06).translate(l.x1 - Math.sign(l.x1) * 0.012, l.y + 0.003, l.z0 + (l.z1 - l.z0) * f));
    }
    grp.add(new THREE.Mesh(mergeGeometries(seams.map(q => q.toNonIndexed()), false)!, BLACK));
    grp.add(new THREE.Mesh(mergeGeometries(hinges.map(q => q.toNonIndexed()), false)!, CHROME)); }
  const strakes: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    // the coamings: the cabin sides carried on aft (moulded with them on a glassfibre boat), a wooden cap on top (CR 3.25)
    const pts: THREE.Vector3[] = [], caps: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const u = COCKPIT.u0 + (COCKPIT.u1 - COCKPIT.u0) * i / 16, x = cockpitHalf(u) + COAMING_T / 2, y = deckY(u, x);
      pts.push(new THREE.Vector3(s * x, y, zc(u))); caps.push(new THREE.Vector3(s * x, y + COAMING_H(zc(u)), zc(u)));
    }
    grp.add(new THREE.Mesh(rail(pts, i => COAMING_H(pts[i].z), COAMING_T), sideMat));
    grp.add(new THREE.Mesh(rail(caps, 0.02, 0.04), MAT.wood));
    // toerail along the sheer
    grp.add(new THREE.Mesh(rail(sheerLine(s, 0.03), 0.035, 0.03), MAT.wood));
    // and the rubbing strake just under the sheer, a half-round of the same wood standing proud of the topsides (CR 2.218:
    // 13 × 26 to 14 × 28 mm, round the sheer)
    // (ending just short of the stem and of the transom's corner, where the strake is cut off)
    strakes.push(rail(sheerLine(s, -0.007, 200).slice(3, -2).map(p => p.setY(p.y - 0.045)), 0.027, 0.014).toNonIndexed());
  }
  grp.add(new THREE.Mesh(mergeGeometries(strakes, false)!, MAT.wood));
  deckFittings(grp);
  // the raised lip across the after end of the cockpit, moulded in with the side coamings and turning into them round
  // its corners (at least 80 mm high at station 3, CR 3.22), so water on the after deck stays out of the cockpit
  {
    const u1 = COCKPIT.u1, z1 = zc(u1) + COAMING_T / 2, w = cockpitHalf(u1) + COAMING_T / 2, r = 0.12, lip: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) { const a = Math.PI / 2 * i / 8; lip.push(new THREE.Vector3(-(w - r + r * Math.cos(a)), 0, z1 - r + r * Math.sin(a))); }
    for (let i = 8; i >= 0; i--) { const a = Math.PI / 2 * i / 8; lip.push(new THREE.Vector3(w - r + r * Math.cos(a), 0, z1 - r + r * Math.sin(a))); }
    for (const q of lip) q.y = deckY(uAtZ(q.z), Math.abs(q.x));
    const lipRail = wall(lip, i => COAMING_H(lip[i].z), COAMING_T);
    grp.add(new THREE.Mesh(lipRail, sideMat));
    // a mooring cleat on the after deck, a little to starboard of the centreline (as on Josephine)
    const cz = (z1 + L / 2) / 2, cx = 0.12, cy = deckY(uAtZ(cz), cx);
    const cleat = new THREE.Group();
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 10), STEEL); horn.rotation.x = Math.PI / 2; horn.position.y = 0.035; cleat.add(horn);
    for (const dz of [-0.035, 0.035]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.035, 0.022), STEEL); leg.position.set(0, 0.017, dz); cleat.add(leg); }
    cleat.position.set(cx, cy, cz); grp.add(cleat);
  }
  // rudder and tiller, hinged on the raked sternpost/transom line
  const rud = new THREE.Group(); rud.position.set(0, HEEL.y, HEEL.z); rud.rotation.x = RUDDER_RAKE;
  const turn = new THREE.Group(); rud.add(turn);
  const rg = rudderGeometry();
  // the blade: bottom paint below the boot stripe, topsides colour above (fixed paint line in the boat's frame)
  const cols = new Float32Array(rg.blade.attributes.position.count * 3).fill(1);
  rg.blade.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  turn.add(new THREE.Mesh(rg.blade, paintMaterial(hullMat.clone() as THREE.MeshPhongMaterial, C(b.hullColor), C(boot), C(paint.bottom), true)));
  turn.add(new THREE.Mesh(rg.tiller, MAT.tiller));
  grp.add(rud);
  // an outboard on its transom bracket, tilted up (port quarter, clear of the rudder, the tiller and the ensign staff)
  if (b.spec?.perf.outboard === 'bracket') {
    const ob = new THREE.Group(), grey = new THREE.MeshPhongMaterial({ color: 0x9aa0a6, specular: 0x666666, shininess: 50 }), blk = MAT.dark;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.34), blk); head.position.set(0, 0.13, 0.12); ob.add(head);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.62), grey); leg.position.set(0, 0.0, -0.2); ob.add(leg); // tilted up: the leg lies forward along the bracket
    const brk = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.04), grey); brk.position.set(0, -0.05, -0.12); ob.add(brk);
    ob.position.set(-0.42, sheer(1) - 0.12, L / 2 + 0.12); ob.rotation.x = 0.35; grp.add(ob);
  }
  // her name on both sides, where the boats carry it: on the cabin side and the coaming, aft of the window and
  // forward of the winch (there's no room for it on the topsides under the low sheer); hand-lettered script
  if (paint.boatName) {
    const name = /[a-z]/.test(paint.boatName) ? paint.boatName : paint.boatName.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 200;
    const ctx = cv.getContext('2d')!, col = paint.nameColor || nameColor(C(glass ? '#ebe5d6' : '#6e3f22').getStyle(), paint.boot);
    const draw = () => {
      ctx.clearRect(0, 0, cv.width, cv.height); ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let px = 170; ctx.font = `${px}px ${NAME_FONT}`;
      while (ctx.measureText(name).width > cv.width * 0.96 && px > 40) { px -= 6; ctx.font = `${px}px ${NAME_FONT}`; }
      ctx.lineWidth = px * 0.035; ctx.strokeStyle = col; ctx.lineJoin = 'round'; // a sign-writer's full stroke
      ctx.fillText(name, cv.width / 2, cv.height * 0.56); ctx.strokeText(name, cv.width / 2, cv.height * 0.56);
    };
    draw();
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
    document.fonts?.load(`170px ${NAME_FONT}`).then(() => { draw(); tex.needsUpdate = true; }).catch(() => { /* the fallback script face */ });
    for (const s of [1, -1]) {
      const geo = sidePatch(uAtZ(0.84), 0.86, 0.02, 0.19, 32, 4);
      if (s < 0) mirrorPatch(geo);
      grp.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
    }
  }
  return turn;
}

interface FlyingFlag { mesh: THREE.Mesh<THREE.PlaneGeometry>; base: Float32Array; fly: number; h: number; ph: number }
const FLAG_SEGS = 30; // (along the fly: a dozen segments to each of the wave's half-waves and the faster ripple's)
const ROW_X = new Float64Array(FLAG_SEGS + 1), ROW_Z = new Float64Array(FLAG_SEGS + 1);
interface Ribbon { geom: THREE.BufferGeometry; anchor: THREE.Vector3; phase: number }
export interface BoatMesh {
  /** The lines drawn as rope, close up. */
  ropes: Ropes;
  grp: THREE.Group; boomPivot: THREE.Group; jibPivot: THREE.Group; main: Sail; jib: Sail;
  /** The main flaked on the boom and the jib bagged on the foredeck, when they're down. */
  mainFurl: THREE.Mesh; jibBag: THREE.Mesh;
  jibTells: { windward: Telltale[]; leeward: Telltale[] }; leechTells: Telltale[];
  pole: THREE.Mesh; stowedPole: THREE.Group; ribbons: Ribbon[];
  rudder: THREE.Group; prevH: number; prevT: number;
  /** The mast (bent by syncRig: its unbent vertices kept) and the forestay (sagging), with the bend last drawn. */
  rigDrawn: { mast: THREE.Mesh; mastBase: Float32Array; forestay: THREE.Line; bow: number; topAft: number; windexZ: number; jumperLines: THREE.Line[]; windexTabs: THREE.Mesh[]; tabZ: number[]; sag: number; load: number; want: number };
  /** The masthead windex (turns to the apparent wind) and the bulkhead compass card (turns with the heading). */
  windex: THREE.Group; card: THREE.CanvasTexture;
  /** The racing instrument on the cabin top (her heading and speed on its face), on your own boat. */
  instrument?: Instrument;
  /** Her flags (stream in the apparent wind and flutter): ensign, burgee or officer's flag, courtesy flag. */
  flags: FlyingFlag[];
  /** The ensign, its staff and truck, and how far down it is (0 flying … 1 struck and the staff unshipped). */
  ensign: { staff: THREE.Group; flag: THREE.Mesh | null; at: THREE.Vector3; axis: THREE.Vector3; slideMax: number; down: number } | null;
  /** The crew, and whether to hide the helm (you're looking through their eyes in the cockpit view). */
  crew: Crew; hideHelm: boolean;
  mainsheet: THREE.Line;
  lines: Lines;
  /** Her navigation lights and the cabin's glow (navLights.ts). */
  nav: NavLights;
  /** The cabin's lantern, swinging on its chain (cabinInterior.ts). */
  lantern: LanternSwing;
}
/** The working lines drawn on the boat: they move with the controls. */
interface Lines {
  travCar: THREE.Mesh; backstay: THREE.Line; cars: Record<Tack, THREE.Mesh>; jibSheets: Record<Tack, THREE.Line>; winches: Record<Tack, THREE.Vector3>;
  /** The traveller's control lines (port, starboard): from the car to the blocks at the track's ends and down to their cams. */
  travLines: THREE.Line[];
  /** Lines that run up the mast (the outhaul, the main Cunningham): their unbent points, moved with the mast's bend (syncRig). */
  mastLines: { l: THREE.Line; base: Float32Array }[];
  /** The Cunninghams' last legs to their cringles, which come down with the sail as it's struck (syncLines). */
  cringles: { l: THREE.Line; sail: 'main' | 'jib' }[];
  /** The vang's tackle, from the boom's block (it swings with the boom) to the lower block on the mast's foot. */
  vang: THREE.Line;
}
const LINE_MAT = new THREE.LineBasicMaterial({ color: 0x5c7f76 }); // sheets and control lines (the boat's green-grey braid)
const STEEL = new THREE.MeshPhongMaterial({ color: 0xc9ced3, specular: 0xffffff, shininess: 90 });
/** The companionway doors' panels (a darker varnish, set in) and their bronze hinges and latch. */
const DOOR_PANEL = new THREE.MeshPhongMaterial({ color: 0x5e3a1e, specular: 0x442211, shininess: 40 }), BRONZE = new THREE.MeshPhongMaterial({ color: 0x9a7a3c, specular: 0xffe0a0, shininess: 80 });
/** The lazarettes' varnished panels (seen from either side: the lockers are built of single surfaces). */
const LOCKER = new THREE.MeshPhongMaterial({ color: 0x8a5a30, specular: 0x553322, shininess: 40, side: THREE.DoubleSide });
/** Polished chrome (the winches): bright, mirror-like, taking the sky. */
const CHROME = reflect(new THREE.MeshPhongMaterial({ color: 0x8c939c, specular: 0xffffff, shininess: 220 }), 0.32);
/** A smoked acrylic hatch lid: dark, glossy, a little see-through. */
const ACRYLIC = new THREE.MeshPhongMaterial({ color: 0x2b3036, specular: 0xffffff, shininess: 110, transparent: true, opacity: 0.82, emissive: 0x000000, emissiveIntensity: 0 });
/** The cockpit's moulded inside, where it isn't teak: smooth, off-white. */
const COCKPIT_LINING = new THREE.MeshLambertMaterial({ color: 0xe9e3d4, side: THREE.DoubleSide });
const BLACK = new THREE.MeshLambertMaterial({ color: 0x1b1d20 }), CAM_GREEN = new THREE.MeshLambertMaterial({ color: 0x3fb36a });
/** Jib car on its cabin-top track: x across (pins 25 mm apart, inboard first), z fore–aft. */
const carPos = (side: number, fore: number, ins: number) => {
  // the middle fore–aft pin 2.65 m aft of the stay (North Sails' tuning guide); across, where the physics' lead angle puts it
  // (carLead, seen from the tack: 12.3° puts the car the guide's 58 cm off the centreline)
  const z = FORESTAY_DECK.z + 2.65 + 0.025 * (fore - (CAR_FORE_PINS - 1) / 2), x = side * (z - FORESTAY_DECK.z) * Math.tan(carLead(ins) * D2R);
  return new THREE.Vector3(x, cabinTopAt(uAtZ(z), x) + 0.035, z); // on the cabin top's arch
};
/**
 * The cockpit coaming's height (m) along the boat: at least 200 mm just aft of the cabin, 140 mm at station 4.5 and
 * 80 mm at station 3 (CR 3.22); drawn a little above each.
 */
const TRAV_Z = COCKPIT_FIT.thwart.z, TRAV_HALF = 0.5, MASTHEAD = new THREE.Vector3(0, MAST_TOP, MAST_Z);
/** Which sail a line works (its colour, the sail-controls band's: jib warm, main cool, the backstay's control white). */
type Rope = 'jib' | 'main' | 'backstay';
const ROPE_COLOR: Record<Rope | 'wire', number> = { jib: 0xc4572e, main: 0x2f5f8f, backstay: 0xe6e3da, wire: 0x9aa1a8 };
const ROPE_MAT: Record<Rope, THREE.LineBasicMaterial> = { jib: new THREE.LineBasicMaterial({ color: ROPE_COLOR.jib }), main: new THREE.LineBasicMaterial({ color: ROPE_COLOR.main }), backstay: new THREE.LineBasicMaterial({ color: ROPE_COLOR.backstay }) };
/** A line: its rope's role (its default colour), and the control it works, whose colour you choose on the Boat page. */
function line(points: THREE.Vector3[], mat: THREE.Material | Rope = LINE_MAT, key?: LineColorKey): THREE.Line {
  const rope = typeof mat === 'string' ? mat : undefined;
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), rope ? ROPE_MAT[rope] : mat as THREE.Material); l.frustumCulled = false;
  if (rope) l.userData.rope = rope;
  if (key) l.userData.key = key;
  return l;
}
/**
 * Each line in the colour of its control (the owner: the drawn lines wear the colours chosen for the sail controls band,
 * the Boat page's line colours, spec.ts lineColor; none chosen: the band's defaults). One screen-line material per
 * colour, dimmed with the daylight as the role materials are (syncRopes).
 */
const KEY_MATS = new Map<string, { mat: THREE.LineBasicMaterial; base: THREE.Color }>();
function keyMat(hex: string): THREE.LineBasicMaterial {
  let e = KEY_MATS.get(hex);
  if (!e) { const base = new THREE.Color(hex); KEY_MATS.set(hex, e = { mat: new THREE.LineBasicMaterial({ color: base.clone() }), base }); }
  return e.mat;
}

/**
 * The lines as rope, close up: every sheet, control line and wire drawn as a thin round line along its points (8 mm
 * braid, the wire 7 mm, CR 7.10), in its colour, all one instanced mesh, following the lines each frame as they move.
 * The thin screen lines under them still show the rig from afar, where 8 mm is less than a pixel.
 */
interface Ropes { mesh: THREE.InstancedMesh; lines: { l: THREE.Line; r: number }[] }
function buildRopes(grp: THREE.Group, spec?: Pick<BoatSpec, 'lineColors'> | null): Ropes {
  const lines: Ropes['lines'] = [], colors: THREE.Color[] = [];
  grp.traverse(o => {
    const l = o as THREE.Line; if (!l.isLine) return;
    const role = l.userData.rope as Rope | undefined, wire = l.material === MAT.wire, key = l.userData.key as LineColorKey | undefined;
    if (!role && !wire) return;
    lines.push({ l, r: wire ? 0.0035 : 0.004 });
    if (key) l.material = keyMat(lineColor(spec, key));
    const c = new THREE.Color(key ? lineColor(spec, key) : ROPE_COLOR[role ?? 'wire']);
    for (let i = 0; i < l.geometry.attributes.position.count - 1; i++) colors.push(c);
  });
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, colors.length));
  colors.forEach((c, i) => mesh.setColorAt(i, c));
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; grp.add(mesh);
  return { mesh, lines };
}
const R_M = new THREE.Matrix4(), R_T = new THREE.Matrix4(), R_ZERO = new THREE.Matrix4().makeScale(0, 0, 0), R_A = new THREE.Vector3(), R_B = new THREE.Vector3(), R_Q = new THREE.Quaternion(), R_S = new THREE.Vector3(), R_UP = new THREE.Vector3(0, 1, 0), R_D = new THREE.Vector3();
const ROPE_BASE = Object.fromEntries(Object.entries(ROPE_MAT).map(([k, mt]) => [k, mt.color.clone()])) as Record<Rope, THREE.Color>;
function syncRopes(m: BoatMesh): void {
  // the screen lines aren't lit by the scene: dim their colours with the daylight, as the lit ropes over them go dark
  const day = 1 - 0.85 * NIGHT.uNight.value;
  for (const k of Object.keys(ROPE_MAT) as Rope[]) ROPE_MAT[k].color.copy(ROPE_BASE[k]).multiplyScalar(day);
  for (const { mat, base } of KEY_MATS.values()) mat.color.copy(base).multiplyScalar(day);
  const { mesh, lines } = m.ropes; let k = 0;
  for (const { l, r } of lines) {
    // (a line that never moves in the boat's frame is laid once)
    if (l.userData.fixed && l.userData.laid) { k += l.geometry.attributes.position.count - 1; continue; }
    if (l.userData.fixed) l.userData.laid = true;
    // the line's frame relative to the boat's
    R_M.identity(); let shown = true;
    for (let o: THREE.Object3D | null = l; o && o !== m.grp; o = o.parent) { if (!o.visible) shown = false; o.updateMatrix(); R_M.premultiply(o.matrix); }
    const P = l.geometry.attributes.position, n = P.count;
    for (let i = 0; i < n - 1; i++, k++) {
      R_A.fromBufferAttribute(P, i).applyMatrix4(R_M); R_B.fromBufferAttribute(P, i + 1).applyMatrix4(R_M);
      const len = R_D.subVectors(R_B, R_A).length();
      if (!shown || len < 1e-4) { mesh.setMatrixAt(k, R_ZERO); continue; }
      R_Q.setFromUnitVectors(R_UP, R_D.divideScalar(len));
      mesh.setMatrixAt(k, R_T.compose(R_A.add(R_B).multiplyScalar(0.5), R_Q, R_S.set(r, len, r)));
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/**
 * The standing rigging's deck ends, in stainless steel, all one mesh: each shroud's chainplate (a strap through the side
 * deck at the class position, CR 7.20) with its rigging screw, the forestay's stemhead fitting and rigging screw, the
 * backstay bridle's two chainplates on the quarters; and a mooring cleat on the foredeck, aft of the forestay.
 */
function deckFittings(grp: THREE.Group): void {
  const parts: THREE.BufferGeometry[] = [], up = new THREE.Vector3(0, 1, 0);
  const along = (g: THREE.BufferGeometry, from: THREE.Vector3, dir: THREE.Vector3, at: number) => g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir)).translate(from.x + dir.x * at, from.y + dir.y * at, from.z + dir.z * at);
  const screw = (foot: THREE.Vector3, toward: THREE.Vector3) => { // a strap on deck, and the rigging screw (turnbuckle) up the wire from it
    const d = toward.clone().sub(foot).normalize();
    parts.push(new THREE.BoxGeometry(0.03, 0.06, 0.008).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d)).translate(foot.x, foot.y + 0.02, foot.z));
    parts.push(along(new THREE.CylinderGeometry(0.011, 0.011, 0.17, 8), foot, d, 0.13));
    for (const at of [0.04, 0.22]) parts.push(along(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 6), foot, d, at)); // its studs
  };
  for (const sx of [-1, 1]) screw(new THREE.Vector3(sx * CHAINPLATE_X, CHAINPLATE_Y, CHAINPLATE_Z), new THREE.Vector3(sx * MAST_ATH / 2, SHROUD_Y, MAST_Z));
  screw(FORESTAY_DECK.clone(), HOUNDS);
  parts.push(new THREE.BoxGeometry(0.05, 0.012, 0.16).translate(0, FORESTAY_DECK.y + 0.006, FORESTAY_DECK.z - 0.03)); // the stemhead plate
  for (const sx of [-1, 1]) { const q = new THREE.Vector3(sx * 0.3, sheer(1) + 0.01, 3.64); parts.push(new THREE.BoxGeometry(0.025, 0.04, 0.05).translate(q.x, q.y + 0.01, q.z)); }
  { const cz = FORESTAY_DECK.z + 0.35, cy = deckY(uAtZ(cz), 0);
    parts.push(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 10).rotateX(Math.PI / 2).translate(0, cy + 0.035, cz));
    for (const dz of [-0.035, 0.035]) parts.push(new THREE.BoxGeometry(0.022, 0.035, 0.022).translate(0, cy + 0.017, cz + dz)); }
  const flat = parts.map(g => { const q = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal') q.deleteAttribute(k); return q; });
  grp.add(new THREE.Mesh(mergeGeometries(flat, false)!, STEEL));
}

/**
 * A rope block: a sheave (`r` m) between two black cheeks with its shackle, as one mesh; its sheave's centre `dy` m
 * above (or below, hanging) where it's made fast.
 */
function sheaveBlock(r: number, dy: number): THREE.Mesh {
  const parts = [
    new THREE.CylinderGeometry(r + 0.008, r + 0.008, 0.012, 14).rotateZ(Math.PI / 2).translate(0.011, dy, 0), // a cheek
    new THREE.CylinderGeometry(r + 0.008, r + 0.008, 0.012, 14).rotateZ(Math.PI / 2).translate(-0.011, dy, 0), // the other
    new THREE.BoxGeometry(0.008, Math.abs(dy) - r * 0.6, 0.016).translate(0, dy / 2, 0), // the shackle and strap to its fitting
  ].map(g => g.toNonIndexed());
  return new THREE.Mesh(mergeGeometries(parts, false)!, BLACK);
}

/** Fittings and lines: traveller, backstay with its bridle, vang, winches, jib cars and sheets, and the piano. */
const sideMatFor = (g: THREE.Group): THREE.Material => g.userData.sideMat ?? MAT.cream;
function buildLines(grp: THREE.Group, boomPivot: THREE.Group): Lines {
  // traveller: the thwart, a deep varnished beam across the cockpit in front of the helm, on its post (hull.ts
  // COCKPIT_FIT), the track on its top, and the car
  const tu = uAtZ(TRAV_Z), tw = cockpitHalf(tu), ty = thwartTop();
  grp.add(new THREE.Mesh(thwartGeometry()[0], MAT.wood));
  const track = new THREE.Mesh(new THREE.BoxGeometry(TRAV_HALF * 2 + 0.08, 0.02, 0.035), STEEL); track.position.set(0, ty + 0.005, TRAV_Z); grp.add(track);
  const travCar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.06), BLACK); travCar.position.set(0, ty + 0.03, TRAV_Z); grp.add(travCar);
  // the mainsheet's lower block, on its swivel on the car: a sheave between black cheeks (it turns with the car); the
  // tackle is four parts (syncLines), the upper (double) block hanging from the boom right above the thwart
  travCar.add(sheaveBlock(0.03, 0.06));
  // the traveller's control lines: from each end of the car to a block at that end of the track, then down the thwart's
  // forward face to a cam (Josephine under way, looking aft: the lines along the thwart's face to its ends)
  const travLines: THREE.Line[] = [];
  for (const side of [-1, 1]) {
    const end = new THREE.Vector3(side * (TRAV_HALF + 0.04), ty + 0.02, TRAV_Z), cam = new THREE.Vector3(side * (TRAV_HALF + 0.12), ty - 0.06, TRAV_Z - THWART_FACE);
    const bk = sheaveBlock(0.018, 0.03); bk.position.copy(end).setY(ty); bk.rotation.y = Math.PI / 2; grp.add(bk);
    const cm = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.025), BLACK); cm.position.copy(cam).setZ(cam.z - 0.012); grp.add(cm);
    const tl = line([end.clone(), end.clone(), cam, cam.clone().add(new THREE.Vector3(-side * 0.02, -0.2, -0.03))], 'main'); grp.add(tl); travLines.push(tl);
  }
  // backstay: masthead down to a bridle, which splits to both quarters (pulling the bridle down tensions it)
  const backstay = line([MASTHEAD, MASTHEAD, MASTHEAD, MASTHEAD, MASTHEAD], MAT.wire); grp.add(backstay);
  // its dual-ended control line: from the blocks on the quarters, forward along the inside of the hull to a cam
  // cleat at each end of the thwart, where the thwart meets the hull
  for (const side of [1, -1]) {
    const x = side * (tw - 0.02), foot = new THREE.Vector3(side * 0.3, sheer(1) - 0.05, 3.62);
    const cl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.06), CAM_GREEN); cl.position.set(x, ty + 0.017, TRAV_Z); grp.add(cl); // green cam cleats, as on Josephine
    grp.add(line([foot, new THREE.Vector3(side * (tw - 0.04), ty - 0.04, (TRAV_Z + foot.z) / 2), new THREE.Vector3(x, ty + 0.03, TRAV_Z)], 'backstay', 'backstay'));
    grp.add(line([new THREE.Vector3(x, ty + 0.03, TRAV_Z - 0.03), new THREE.Vector3(x - side * 0.03, ty - 0.25, TRAV_Z - 0.06)], 'backstay', 'backstay')); // the tail
  }
  // vang: a rope tackle from a block under the boom, about a quarter of the way out, down to a block on a fitting at the
  // foot of the mast, four parts (Josephine's photos: hauled out from starboard, and the mast foot from forward; CR 8.60
  // only limits what may hold the boom up, so a rope vang is legal). Its tail comes down to the turning blocks at the
  // mast's foot and aft to the piano. (The part count is read off the photo: an estimate.)
  { const ub = sheaveBlock(0.025, -0.05); ub.position.set(0, BOOM_TOP - 2 * BOOM_R, VANG_R); boomPivot.add(ub);
    const lb = sheaveBlock(0.025, 0.05); lb.position.copy(VANG_FOOT).setY(VANG_FOOT.y - 0.05); grp.add(lb); }
  const vang = line(Array.from({ length: 5 }, () => VANG_FOOT.clone()), 'main', 'vang'); grp.add(vang);
  // winches on the cockpit coamings, near the forward end
  const winches = {} as Record<Tack, THREE.Vector3>, cars = {} as Record<Tack, THREE.Mesh>, jibSheets = {} as Record<Tack, THREE.Line>;
  for (const [tk, side] of [['S', 1], ['P', -1]] as const) {
    // the jib sheet winch, as on Josephine (the owner's photos): on a moulded pedestal standing on the side deck against
    // the coaming's outer face, about 1.4 m aft of amidships (just aft of her name, some 0.6 m forward of the thwart);
    // the pedestal tapers up from a broader foot to about the coaming's top, and the chromed winch stands on it
    const zw = 1.4, u = uAtZ(zw), xo = cockpitHalf(u) + COAMING_T, wx = side * (xo + 0.075), deck = deckY(u, xo + 0.075), top = deckY(u, xo) + COAMING_H(zw) + 0.03;
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.095, top - deck, 20), sideMatFor(grp)); ped.scale.z = 1.25; ped.position.set(wx, (top + deck) / 2, zw); grp.add(ped);
    const wy = top, winch = new THREE.Group(); winch.position.set(wx, wy, zw); grp.add(winch);
    for (const [r0, r1, h, y] of [[0.065, 0.065, 0.025, 0.0125], [0.05, 0.055, 0.075, 0.0625], [0.04, 0.05, 0.02, 0.11]] as const) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 20), CHROME); m.position.y = y; winch.add(m);
    }
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 12), BLACK); socket.position.y = 0.121; winch.add(socket); // the handle's socket
    winches[tk] = new THREE.Vector3(wx, wy + 0.07, zw);
    // H-shaped car track on the cabin top: two short fore–aft rails and the cross rail
    const a = carPos(side, 0, 0), b2 = carPos(side, CAR_FORE_PINS - 1, CAR_IN_PINS - 1);
    for (const x of [a.x, b2.x]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, b2.z - a.z + 0.06), STEEL); r.position.set(x, a.y - 0.05, (a.z + b2.z) / 2); grp.add(r); }
    const cr = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(b2.x - a.x) + 0.025, 0.02, 0.025), STEEL); cr.position.set((a.x + b2.x) / 2, a.y - 0.05, (a.z + b2.z) / 2); grp.add(cr);
    const car = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.07), BLACK); grp.add(car); cars[tk] = car;
    const js = line(Array.from({ length: 5 }, () => new THREE.Vector3()), 'jib', 'jibsheet'); grp.add(js); jibSheets[tk] = js;
  }
  // the piano: three cam cleats a side on the aft end of the cabin, and the lines running forward to the mast
  // (on the cabin top at its after edge, beside the companionway: the lines come straight aft along the cabin top
  // outboard of the hatch's runners, as on Josephine, and turn in to the mast's foot only forward of the hatch)
  const zA = -L / 2 + CABIN.u1 * L - 0.05, zClear = -L / 2 + CABIN.u1 * L - 2 * COMPANIONWAY.len - 0.15;
  const onTop = (x: number, z: number) => new THREE.Vector3(x, cabinTopAt(uAtZ(z), x) + 0.025, z);
  // The piano, as the sail controls band lays it out (sailBand.ts: "as you face forward from the helm", the owner's design
  // mirroring Josephine), inboard to outboard: to starboard the vang, the outhaul, the jib Cunningham and the jib
  // halyard; to port the vang, the outhaul, the main Cunningham (a clam cleat), the jib Cunningham and the main halyard
  // (on a block). Each line runs forward along the cabin top to a turning block on the deck at the mast's foot
  // (Josephine's photos: a cluster of blocks at the partner, the lines coming down to them and running aft in a bundle),
  // and on to what it works:
  //  - the vang (dual-ended): to the vang's lower block, its tail;
  //  - the outhaul (dual-ended): up the mast's after side to the gooseneck, and inside the boom to the clew, where it's
  //    made fast (inside the boom and fixed to the clew: the owner, on Josephine; how it gets from the foot block to the
  //    boom is still an estimate);
  //  - the jib Cunningham (dual-ended): forward along the foredeck, outboard of the forehatch, to a block at the stemhead
  //    and up the stay to the jib's cringle (an estimate: not in the photos, and her foredeck looks clear in the one from
  //    the bow; it may well run below);
  //  - the main Cunningham: up the mast's port side, outside the boom, to a block at the gooseneck and to its cringle
  //    above the main's tack (an estimate: not in the photos);
  //  - the halyards: inside the mast, out of it low down (CR 6.2.5), the jib's at its front, the main's at its after side,
  //    each to a small block-and-tackle on the mast's side by its foot, the tackle's fall to the foot block and aft to the
  //    piano (the owner, on Josephine). The tackle's purchase and exact height aren't known: drawn as a 2:1, its moving
  //    block on the halyard's end about 0.4 m up, its standing part and fall at the foot block (estimates).
  const mastLines: Lines['mastLines'] = [], deckAt = (x: number, z: number) => deckY(uAtZ(z), Math.abs(x));
  // (a line lying on the boat from a to b: straight in plan, following the cabin top, over its forward edge and down its
  // face to the deck; a point every 20 cm, and points at the edge, so it lies on the surface)
  const zFront = -L / 2 + CABIN.u0 * L;
  const surf = (x: number, z: number) => { const u = uAtZ(z); return (u > CABIN.u0 && u < CABIN.u1 && Math.abs(x) < cabinHalf(u) ? cabinTopAt(u, x) : deckY(u, Math.abs(x))) + 0.012; };
  const lay = (a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.2)), out: THREE.Vector3[] = [];
    for (let i = 1; i <= n; i++) {
      const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, zPrev = a.z + (b.z - a.z) * (i - 1) / n;
      // (crossing the cabin's forward edge: a point on the edge, so the line goes over it and down the face)
      if ((zPrev - zFront) * (z - zFront) < 0) { const tf = (zFront - a.z) / (b.z - a.z), xf = a.x + (b.x - a.x) * tf; out.push(new THREE.Vector3(xf, surf(xf, zFront + 0.002), zFront + 0.002), new THREE.Vector3(xf, deckY(uAtZ(zFront - 0.01), Math.abs(xf)) + 0.012, zFront - 0.01)); }
      out.push(new THREE.Vector3(x, i === n && b.y ? b.y : surf(x, z), z));
    }
    return out;
  };
  const fixed = (l: THREE.Line) => { l.userData.fixed = true; grp.add(l); return l; }; // (never moves: syncRopes lays it once)
  const footZ = MAST_AFT_Z + 0.06;
  const footBlock = (x: number) => { const fb = sheaveBlock(0.016, 0.03); fb.position.set(x, deckAt(x, footZ), footZ); fb.rotation.y = Math.PI / 2; grp.add(fb); return new THREE.Vector3(x, deckAt(x, footZ) + 0.03, footZ); };
  const upMast = (pts: THREE.Vector3[], role: Rope, key: LineColorKey) => { const l = line(pts, role, key); grp.add(l); mastLines.push({ l, base: (l.geometry.attributes.position.array as Float32Array).slice() }); return l; };
  const stem = new THREE.Vector3(0, FORESTAY_DECK.y + 0.04, FORESTAY_DECK.z + 0.14);
  { const sb = sheaveBlock(0.016, 0.03); sb.position.copy(stem).setY(FORESTAY_DECK.y); grp.add(sb); }
  const cringles: Lines['cringles'] = [];
  const PIANO: Record<'S' | 'P', LineColorKey[]> = { S: ['vang', 'outhaul', 'jibCunningham', 'jibHalyard'], P: ['vang', 'outhaul', 'cunningham', 'jibCunningham', 'downhaul'] };
  for (const [tk, side] of [['S', 1], ['P', -1]] as const) PIANO[tk].forEach((key, i) => {
    const x = side * (0.37 + 0.065 * i), cp = onTop(x, zA), role: Rope = key === 'jibCunningham' || key === 'jibHalyard' ? 'jib' : 'main';
    // (the cleat: a cam, the main Cunningham's a clam cleat, the main halyard's tail on a block, as the band has them)
    if (key === 'downhaul') { const hb = sheaveBlock(0.016, 0.03); hb.position.copy(cp).setY(cp.y - 0.025); grp.add(hb); }
    const cl = new THREE.Mesh(key === 'cunningham' ? new THREE.BoxGeometry(0.035, 0.025, 0.06) : new THREE.BoxGeometry(0.05, 0.035, 0.05), BLACK); cl.position.copy(cp).setY(cp.y - 0.008); grp.add(cl);
    // (straight forward along the cabin top outboard of the hatch, fanning a little inward, then straight in to its block
    // at the mast's foot, as the photo of her cabin top looking forward shows)
    const fb = footBlock(side * (0.04 + 0.028 * i)), mid = new THREE.Vector3(x * 0.95, 0, zClear);
    fixed(line([cp, ...lay(cp, mid), ...lay(mid, fb.clone())], role, key));
    fixed(line([cp.clone().setZ(zA + 0.02), new THREE.Vector3(x + side * 0.02, cp.y - 0.25 - 0.04 * i, zA + 0.1)], role, key)); // the tail, down the bulkhead
    if (key === 'vang') fixed(line([fb, VANG_FOOT.clone().add(new THREE.Vector3(side * 0.012, -0.02, 0))], 'main', 'vang')); // the vang's tail, to its lower block
    else if (key === 'outhaul') upMast([fb, new THREE.Vector3(side * 0.03, fb.y + 0.1, MAST_AFT_Z + 0.012), new THREE.Vector3(side * 0.015, BOOM_TOP - BOOM_R, MAST_AFT_Z + 0.012)], 'main', 'outhaul');
    else if (key === 'cunningham') { // up the port side outside the boom, a block at the gooseneck, and in to the cringle (which comes down with the sail)
      const gb = sheaveBlock(0.014, -0.03); gb.position.set(-0.07, BOOM_TOP + 0.05, MAST_AFT_Z + 0.02); grp.add(gb);
      cringles.push({ l: upMast([fb, new THREE.Vector3(-0.07, fb.y + 0.1, MAST_AFT_Z + 0.02), new THREE.Vector3(-0.07, BOOM_TOP + 0.02, MAST_AFT_Z + 0.02), new THREE.Vector3(0, BOOM_TOP + MAIN_CUNNINGHAM_UP, MAST_AFT_Z + 0.01)], 'main', 'cunningham'), sail: 'main' });
    } else if (key === 'jibCunningham') { // forward outboard of the forehatch (its frame x ±0.29, z −2.04 to −1.46) to the stem's block, clear of the mooring cleat
      const d = (z: number) => new THREE.Vector3(side * 0.36, 0, z);
      fixed(line([fb, ...lay(fb, new THREE.Vector3(side * 0.09, 0, MAST_FRONT_Z - 0.12)), ...lay(new THREE.Vector3(side * 0.09, 0, MAST_FRONT_Z - 0.12), d(-1.38)), ...lay(d(-1.38), d(-2.12)), ...lay(d(-2.12), new THREE.Vector3(side * 0.07, 0, stem.z + 0.06)), stem.clone().setX(side * 0.015)], 'jib', 'jibCunningham'));
      if (side > 0) cringles.push({ l: line([stem.clone(), FORESTAY_DECK.clone().addScaledVector(JIB_AXIS, 0.10 + JIB_CUNNINGHAM_UP)], 'jib', 'jibCunningham'), sail: 'jib' }), grp.add(cringles[cringles.length - 1].l);
    } else { // the halyards: out of the mast low down, to the moving block of a 2:1 tackle, whose fall runs to the foot block
      const exit = key === 'jibHalyard' ? new THREE.Vector3(side * 0.03, DECK_AT_MAST + 0.62, MAST_FRONT_Z + 0.004) : new THREE.Vector3(side * 0.03, DECK_AT_MAST + 0.55, MAST_AFT_Z - 0.004);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.012), STEEL); plate.position.copy(exit).setY(exit.y + 0.03); grp.add(plate);
      const sx = side * (MAST_ATH / 2 + 0.02), mz = MAST_Z + (key === 'jibHalyard' ? -0.025 : 0.025), my = fb.y + 0.36;
      const mb = sheaveBlock(0.014, -0.03); mb.position.set(sx, my + 0.03, mz); mb.rotation.y = Math.PI / 2; grp.add(mb); // the moving block, hanging from the halyard's end
      upMast([exit, new THREE.Vector3(sx, exit.y - 0.06, mz), new THREE.Vector3(sx, my + 0.03, mz)], role, key); // the halyard's end, down the mast's side to the block
      // the tackle's two parts: the standing part from the foot block's becket up to the moving block, and back down to the
      // foot block's sheave (the fall, which goes aft to the piano)
      upMast([fb.clone().setX(fb.x + side * 0.03), new THREE.Vector3(sx + side * 0.014, my - 0.01, mz), new THREE.Vector3(sx - side * 0.014, my - 0.01, mz), fb.clone()], role, key); // (the two parts a sheave's width apart, either side of it)
    }
  });
  // the mast's own bands: a black boot where it goes through the deck, and the lower band (CR 6.1.11: its upper edge the
  // Lower Mast Point, 1.00 m up; dark on Josephine), from the photos of her mast foot
  for (const [y0, h] of [[DECK_AT_MAST - 0.01, 0.13], [BOOM_TOP - 0.03, 0.03]] as const) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, h, 14), BLACK); band.scale.set(MAST_ATH + 0.006, 1, MAST_FA + 0.006); band.position.set(0, y0 + h / 2, MAST_Z); grp.add(band);
  }
  return { travCar, backstay, cars, jibSheets, winches, travLines, mastLines, cringles, vang };
}
/** Mainsheet: from the end of the boom (its height and distance from the gooseneck) down to the traveller. */
const BOOM_END = { y: BOOM_TOP - BOOM_R, r: E - 0.05 }, TRAVELLER = new THREE.Vector3(0, 0.78, 3.62);
/**
 * Where the mainsheet's upper block hangs from the boom (m from the gooseneck): right above the traveller on the thwart,
 * about an eighth of the boom from its end (0.42 m of E: Josephine hauled out, from starboard), so the sheet comes straight down to the
 * car upwind. And the vang's block under the boom, about a quarter of the way out (the same photo).
 */
const MS_R = COCKPIT_FIT.thwart.z - MAST_AFT_Z, VANG_R = 0.85;
/** The mainsheet's two upper blocks, on bails about 15 cm apart along the boom (the photo, as measured in the physics review). */
const MS_GAP = 0.15;
/** The vang's lower block: on its fitting at the foot of the mast, abaft it (fixed to the mast: the tackle swings to the boom's block). */
const VANG_FOOT = new THREE.Vector3(0, DECK_AT_MAST + 0.07 + 0.05, MAST_AFT_Z + 0.05);
/** The thwart's forward face from the track's centreline (its half depth, hull.ts). */
const THWART_FACE = COCKPIT_FIT.thwart.half;
/** The Cunninghams' cringles: the main's above its tack, the jib's up its luff from the tack (estimates: not in the photos). */
const MAIN_CUNNINGHAM_UP = 0.22, JIB_CUNNINGHAM_UP = 0.3;

// Rig points in the boat group's frame: x to starboard, y up, z aft (the bow is at z = −3.82).
const CHAINPLATE_Z = MAST_AFT_Z + 0.32, CHAINPLATE_X = 0.98, CHAINPLATE_Y = sheer(uAtZ(CHAINPLATE_Z));
/** The jumper struts (tip, starboard side): 5.50 m above the lower band, 450 mm long, tips 900 mm apart, raked forward (CR 6.1.12). */
const STRUT_Y = BOOM_TOP + 5.5, STRUT = new THREE.Vector3(0.45, STRUT_Y, MAST_FRONT_Z - Math.sqrt(0.45 ** 2 - (0.45 - MAST_ATH / 2) ** 2));
/** The shrouds meet the mast's sides just below the struts (CR 7.60: 5.30–5.50 m above the band); the jumper stays' ends (CR 7.60). */
const SHROUD_Y = BOOM_TOP + 5.4, JUMPER_TOP = BOOM_TOP + 8.6, JUMPER_FOOT = BOOM_TOP + 2.25;
const POLE_INBOARD = new THREE.Vector3(0, DECK_AT_MAST + 1.08, MAST_FRONT_Z); // pole fitting on the front of the mast
/** The mast's height segments (for its bend) and the forestay's points (for its sag). */
const MAST_SEGS = 24, STAY_PTS = 13, STAY_LEN = HOUNDS.distanceTo(FORESTAY_DECK);
/**
 * The mast's bend at h m above the deck (m, + forward): its middle bowed forward between the deck and the hounds (a
 * sine: the pinned span's shape under a moment at its ends), and above them the topmast carrying on along the tangent the
 * bow leaves it at the hounds (one continuous tube: no kink), with the backstay's own bend of the topmast on top
 * (rigTune.ts rigDrawn).
 */
const TOPMAST = MAST_TOP - DECK_AT_MAST - IG;
const mastFwd = (h: number, bow: number, topAft: number) => h <= IG ? bow * Math.sin(Math.PI * Math.max(0, h) / IG)
  : -(Math.PI * bow / IG) * (h - IG) - topAft * ((h - IG) / TOPMAST) ** 2;
const JIB_CLEW = JIB_DEF.clew; // in the jib pivot's frame
// Cassette-tape telltales: old audio tape tied to the shrouds, about 1.4 m above the deck (low enough to
// see from the cockpit). Dark brown and shiny, like the real thing.
const TAPE_HEIGHT = 1.4, RIBBON_LEN = 0.45, RIBBON_W = 0.025, RIBBON_N = 8;
const RIBBON_MAT = new THREE.MeshPhongMaterial({ color: 0x3b2516, specular: 0x8a7a6a, shininess: 80, side: THREE.DoubleSide });
const POLE_MAT = new THREE.MeshLambertMaterial({ color: 0x9aa1a8 });

export function buildBoatMesh(b: Boat): BoatMesh {
  const grp = new THREE.Group(); grp.rotation.order = 'YXZ';
  const alu = b.build.spars === 'aluminium', aluBoom = (b.build.boom ?? b.build.spars) === 'aluminium';
  const spar = alu ? MAT.sparAlu : MAT.spar, boomMat = aluBoom ? MAT.sparAlu : MAT.spar;
  const rudder = buildHull(b, grp);
  // the rig sits on the real deck height
  const rig = new THREE.Group(); grp.add(rig);
  // aluminium extrusion: constant section; wooden mast: tapered
  // (its section an oval, wider fore and aft; from the deck, through the cabin top, to the masthead)
  const mastH = MAST_TOP - DECK_AT_MAST;
  // (in height segments, so it can bend: syncRig)
  const mast = new THREE.Mesh(alu ? new THREE.CylinderGeometry(0.5, 0.5, mastH, 14, MAST_SEGS) : new THREE.CylinderGeometry(0.34, 0.5, mastH, 10, MAST_SEGS), spar);
  mast.scale.set(MAST_ATH, 1, MAST_FA); mast.position.set(0, DECK_AT_MAST + mastH / 2, MAST_Z); rig.add(mast);
  const mastBase = (mast.geometry.attributes.position.array as Float32Array).slice();
  // Your own sails are slightly see-through, as Dacron is in daylight, so the leeward telltales show through.
  // Dacron sails: crosscut panel seams, the class letter, and the sail number on the main (starboard side higher, RRS
  // Appendix G), each side its own picture so the numbers read the right way round from both sides
  // Each side of the cloth has its own picture, by which way it faces (the sail mesh is mirrored to the boom's side,
  // which swaps the faces: syncBoatMesh puts the right picture on each face)
  const inks = { no: b.paint?.numberColor, f: b.paint?.insigniaColor }, pics = { mainStbd: sailTexture(b.sailColor, b.no, 'stbd', true, inks), mainPort: sailTexture(b.sailColor, b.no, 'port', true, inks), jibStbd: sailTexture(b.sailColor, '', 'stbd', false), jibPort: sailTexture(b.sailColor, '', 'port', false) };
  const sm = (side: 'front' | 'back', map: THREE.Texture) => new THREE.MeshLambertMaterial({
    map, side: side === 'front' ? THREE.FrontSide : THREE.BackSide, transparent: b.isUser, opacity: b.isUser ? 0.86 : 1
  });
  const sailMat = sm('front', pics.mainStbd), sailBack = sm('back', pics.mainPort), jibMat = sm('front', pics.jibStbd), jibBack = sm('back', pics.jibPort);
  sailPics.set(sailMat, { front: sailMat, back: sailBack, stbd: pics.mainStbd, port: pics.mainPort });
  sailPics.set(jibMat, { front: jibMat, back: jibBack, stbd: pics.jibStbd, port: pics.jibPort });
  const boomPivot = new THREE.Group(); boomPivot.position.set(0, 0, MAST_AFT_Z); rig.add(boomPivot);
  // the mainsheet's upper block, hung from a strap under the boom's end
  { for (const dz of [-MS_GAP / 2, MS_GAP / 2]) { const ub = sheaveBlock(0.03, -0.075); ub.position.set(0, BOOM_END.y - BOOM_R, MS_R + dz); boomPivot.add(ub); } } // (two blocks on bails, fore and aft)
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(BOOM_R, BOOM_R, E + 0.12, aluBoom ? 10 : 5), boomMat); boom.rotation.x = Math.PI / 2; boom.position.set(0, BOOM_TOP - BOOM_R, (E + 0.12) / 2); boomPivot.add(boom);
  if (aluBoom) { // the extrusion's black moulded end fitting, at its after end (as CircleSea's)
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(BOOM_R * 1.05, BOOM_R * 1.05, 0.06, 10), MAT.dark); cap.rotation.x = Math.PI / 2; cap.position.set(0, BOOM_TOP - BOOM_R, E + 0.12 - 0.02); boomPivot.add(cap);
  }
  const main = new Sail(MAIN_DEF, sailMat, WINDOW_MAT, sailBack); boomPivot.add(main.mesh);
  const jibPivot = new THREE.Group(); jibPivot.position.copy(FORESTAY_DECK); rig.add(jibPivot);
  const jib = new Sail(JIB_DEF, jibMat, WINDOW_MAT, jibBack); jibPivot.add(jib.mesh);
  // Telltales on your own boat: three pairs on the jib luff, one at each batten on the main leech.
  const jibTells = { windward: [] as Telltale[], leeward: [] as Telltale[] }, leechTells: Telltale[] = [];
  if (b.isUser) {
    [0.25, 0.5, 0.75].forEach((t, i) => {
      jibTells.windward.push(new Telltale(jib, t, 0.13, false, 0.26, i * 1.9));
      jibTells.leeward.push(new Telltale(jib, t, 0.13, true, 0.26, i * 2.3 + 1));
    });
    for (const bt of MAIN_DEF.battens!) leechTells.push(new Telltale(main, bt.t, 0.995, true, 0.3, bt.t * 7));
  }
  // the forestay: sagging to leeward in the jib's pull (syncRig)
  const forestay = new THREE.Line(new THREE.BufferGeometry().setFromPoints([...Array(STAY_PTS)].map((_, i) => FORESTAY_DECK.clone().lerp(HOUNDS, i / (STAY_PTS - 1)))), MAT.wire);
  forestay.frustumCulled = false; rig.add(forestay);
  // upper shrouds, each with a cassette-tape telltale tied on low enough to see from the cockpit
  const ribbons: Ribbon[] = [], jumperLines: THREE.Line[] = [], windexTabs: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const foot = new THREE.Vector3(sx * CHAINPLATE_X, CHAINPLATE_Y, CHAINPLATE_Z), tip = new THREE.Vector3(sx * MAST_ATH / 2, SHROUD_Y, MAST_Z);
    // the shroud, straight from its chainplate to the mast; the jumper strut, and the jumper stay over its tip
    { const st = new THREE.Vector3(sx * STRUT.x, STRUT.y, STRUT.z), root = new THREE.Vector3(sx * MAST_ATH / 2, STRUT_Y, MAST_FRONT_Z + 0.02);
      const len = st.distanceTo(root), js = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.016, len, 5), spar);
      js.position.copy(st).lerp(root, 0.5); js.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), st.clone().sub(root).normalize()); rig.add(js);
      const jl = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(0, JUMPER_TOP, MAST_FRONT_Z), st, V3(0, JUMPER_FOOT, MAST_FRONT_Z)]), MAT.wire); rig.add(jl); jumperLines.push(jl); }
    rig.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([foot, tip]), MAT.wire));
    const anchor = foot.clone().lerp(tip, TAPE_HEIGHT / (tip.y - CHAINPLATE_Y));
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RIBBON_N * 2 * 3), 3));
    const idx: number[] = [];
    for (let i = 0; i < RIBBON_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geom.setIndex(idx);
    const mesh = new THREE.Mesh(geom, RIBBON_MAT); mesh.frustumCulled = false; rig.add(mesh);
    ribbons.push({ geom, anchor, phase: sx * 1.7 + b.id });
  }
  // whisker pole: from the mast to the jib clew when wing-on-wing
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 6), POLE_MAT); pole.visible = false; rig.add(pole);
  // ... and stowed when it isn't: flat on a side deck in two chocks, from near the bow aft
  const stowed = new THREE.Group();
  // (on a side deck, port or starboard as her owner keeps it, flat, just inboard of the toe rail)
  { const side = (b.paint?.poleSide ?? 'port') === 'starboard' ? 1 : -1;
    // (2.85 m long: Theis Palm, North Sails' Folkboat talk to the Finnish class, 2023, "Whisker 'Jib' pole is 2,85 m";
    // stowed well forward, its fore end near the bow, as the owner has it on Josephine)
    // (just aft of the forestay, 0.22 m in from the side: clear of the forehatch, inboard of the shrouds' chainplates, and
    // about 8 cm off the cabin's side at its after end)
    const z0 = -L / 2 + 0.9, z1 = z0 + 2.85, xAt = (z: number) => side * (halfBeam(uAtZ(z)) - 0.22), yAt = (z: number) => deckY(uAtZ(z), Math.abs(xAt(z))) + 0.024;
    const a = new THREE.Vector3(xAt(z0), yAt(z0), z0), c = new THREE.Vector3(xAt(z1), yAt(z1), z1), len = a.distanceTo(c);
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 6), POLE_MAT);
    sp.position.copy(a).lerp(c, 0.5); sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize()); stowed.add(sp);
    for (const t of [0.12, 0.88]) { const p = a.clone().lerp(c, t), ch = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.03, 0.06), MAT.dark); ch.position.set(p.x, p.y - 0.01, p.z); stowed.add(ch); } // its chocks
  }
  // the forehatch (class rule 3.31: one hatch forward of the mast, a clear opening no more than 500 mm square, properly
  // framed, with a hinged cover): on the centreline a little forward of the cabin, its cover varnished teak, hinged at
  // its forward edge (so a sea over the bow can't throw it open) with a hasp aft; it lies with the deck's sheer
  { const hz = -1.75, open = 0.5, wall = 0.04, out = open + 2 * wall, rise = 0.055;
    const yC = deckY(uAtZ(hz), 0), tilt = Math.atan2(deckY(uAtZ(hz - 0.3), 0) - deckY(uAtZ(hz + 0.3), 0), 0.6);
    const hatch = new THREE.Group(); hatch.position.set(0, yC, hz); hatch.rotation.x = tilt; grp.add(hatch);
    // teak: a wooden frame and a varnished teak cover; acrylic: an anodised aluminium frame round a smoked acrylic lid
    const acrylic = b.paint?.hatch === 'acrylic';
    const frameMat = acrylic ? STEEL : new THREE.MeshLambertMaterial({ color: b.spec?.deck?.startsWith('#') ? b.spec.deck : 0xb0a58f });
    for (const [w, d, x, z] of [[out, wall, 0, (open + wall) / 2], [out, wall, 0, -(open + wall) / 2], [wall, open, (open + wall) / 2, 0], [wall, open, -(open + wall) / 2, 0]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, rise + 0.03, d), frameMat); f.position.set(x, (rise - 0.03) / 2, z); hatch.add(f); // (its foot set into the deck's camber)
    }
    const cover = new THREE.Mesh(new THREE.BoxGeometry(out + 0.02, acrylic ? 0.02 : 0.032, out + 0.02), acrylic ? ACRYLIC : MAT.wood); cover.position.y = rise + (acrylic ? 0.01 : 0.016); hatch.add(cover);
    if (acrylic) { const rim = new THREE.Mesh(new THREE.BoxGeometry(out + 0.04, 0.012, out + 0.04), STEEL); rim.position.y = rise + 0.004; hatch.add(rim); } // the lid's aluminium rim
    for (const x of [-0.17, 0.17]) { const hg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.05), STEEL); hg.position.set(x, rise + 0.034, -(out / 2) + 0.02); hatch.add(hg); } // hinges, forward
    const hasp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.016, 0.04), STEEL); hasp.position.set(0, rise + 0.034, out / 2 - 0.01); hatch.add(hasp); // the hasp, aft
  }
  grp.add(stowed);
  // sails down: the main flaked along the boom (tied with sail ties) and the jib in its bag on the foredeck
  const clothMat = new THREE.MeshLambertMaterial({ color: b.sailColor });
  const mainFurl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 2.9, 10), clothMat); mainFurl.rotation.x = Math.PI / 2; mainFurl.position.set(0, BOOM_TOP + 0.07, 1.55); mainFurl.visible = false; boomPivot.add(mainFurl);
  for (const z of [0.5, 1.2, 1.9, 2.6]) { const tie = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 4, 10), MAT.dark); tie.rotation.x = Math.PI / 2; tie.position.y = z - 1.55; mainFurl.add(tie); } // (along the cylinder's own axis)
  const jibBag = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshLambertMaterial({ color: 0x2c3e66 })); jibBag.scale.set(0.2, 0.12, 0.45);
  jibBag.position.set(-0.05, deckY(uAtZ(-2.9), 0.05) + 0.1, -2.9); jibBag.visible = false; grp.add(jibBag);
  const mainsheet = line(Array.from({ length: 7 }, () => TRAVELLER.clone()), 'main', 'mainsheet'); grp.add(mainsheet); // (four parts and the tail)
  const lines = buildLines(grp, boomPivot);
  // her flags (yachting etiquette: render/flagArt.ts): the ensign on its staff at the stern; the club burgee, or an officer's flag in its place, on the flag halyard under the
  // starboard jumper strut (she has no spreaders; the masthead has the windex). Flying a foreign ensign on the Bay, she
  // flies the US flag as a courtesy flag at the starboard strut and moves her burgee to port.
  const flags: FlyingFlag[] = [];
  let ensign: BoatMesh['ensign'] = null;
  const hoist = (canvas: HTMLCanvasElement | null, at: THREE.Vector3, h: number, parent: THREE.Object3D, tail = true) => {
    if (!canvas) return;
    const fly = h * canvas.width / canvas.height, geo = new THREE.PlaneGeometry(fly, h, FLAG_SEGS, 2); geo.translate(fly / 2, -h / 2, 0); // hoisted at its top corner
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide, alphaTest: 0.5 }));
    mesh.position.copy(at); parent.add(mesh);
    if (tail) parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(at.x, at.y - h - 0.05, at.z), new THREE.Vector3(at.x, DECK_AT_MAST + 0.3, at.z)]), MAT.wire)); // the halyard's tail
    flags.push({ mesh, base: (geo.attributes.position.array as Float32Array).slice(), fly, h, ph: flags.length * 2.1 }); // (each its own phase)
  };
  // an officer's flag (her skipper's, when he or she is a flag officer of her club) flies by the club's rule: in place of
  // the burgee, or on the same halyard just below it
  const burgee = b.burgee ? burgeeCanvas(b.burgee) : null, officer = b.special ? flagArtCanvas(b.special) : null;
  const below = !!officer && officerRule(b.burgee) === 'below';
  const flagBlock = (side: number) => new THREE.Vector3(side * (STRUT.x - 0.04), STRUT.y - 0.06, STRUT.z); // (the flag halyard's block under the strut's tip)
  const clubHoist = (side: number) => {
    if (!below) { hoist(officer ?? burgee, flagBlock(side), 0.3, rig); return; }
    hoist(burgee, flagBlock(side), 0.3, rig, false); hoist(officer, flagBlock(side).add(new THREE.Vector3(0, -0.36, 0)), 0.3, rig);
  };
  if (needsCourtesy(b.ensign)) { hoist(flagArtCanvas('us'), flagBlock(1), 0.25, rig); clubHoist(-1); }
  else clubHoist(1);
  if (b.ensign) {
    // on an ensign staff in a socket on the starboard quarter, close to the centreline (the backstay and tiller have the
    // middle of the transom), raked aft; the flag about an inch of fly per foot of boat (a 24-inch fly)
    const ens = flagArtCanvas(b.ensign), staffH = 1.0, rake = 0.22, base = new THREE.Vector3(0.3, sheer(1) + 0.02, L / 2 - 0.08);
    const staffG = new THREE.Group(); grp.add(staffG);
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, staffH, 6), MAT.wood);
    const top = base.clone().add(new THREE.Vector3(0, Math.cos(rake) * staffH, Math.sin(rake) * staffH));
    staff.position.copy(base.clone().lerp(top, 0.5)); staff.rotation.x = rake; staffG.add(staff);
    const truck = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), MAT.wood); truck.position.copy(top); staffG.add(truck);
    if (ens) hoist(ens, top.clone().add(new THREE.Vector3(0, -0.03, 0)), 0.61 * ens.height / ens.width, staffG, false);
    const flag = ens ? flags[flags.length - 1].mesh : null;
    // (down the staff no further than leaves the flag's foot clear of the deck: a Danish or Norwegian ensign is deep in the hoist)
    const fh = ens ? 0.61 * ens.height / ens.width : 0, slideMax = Math.max(0, Math.min(0.62, staffH - 0.03 - fh - 0.05));
    ensign = { staff: staffG, flag, at: flag?.position.clone() ?? top, axis: top.clone().sub(base).normalize(), slideMax, down: b.ensignStruck ? 1 : 0 };
  }
  // the windex on the masthead: an arrow that swings into the apparent wind, between two reference tabs
  const windex = new THREE.Group(); windex.position.set(0, MAST_TOP, MAST_Z); rig.add(windex);
  { const blk = new THREE.MeshLambertMaterial({ color: 0x1b1d20 }), red = new THREE.MeshLambertMaterial({ color: 0xd8342a });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.55, 5), blk); rod.rotation.x = Math.PI / 2; rod.position.set(0, 0.12, -0.05); windex.add(rod);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 6), red); head.rotation.x = -Math.PI / 2; head.position.set(0, 0.12, -0.35); windex.add(head);
    const fin = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.09), red); fin.rotation.y = Math.PI / 2; fin.position.set(0, 0.12, 0.2); windex.add(fin);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5), blk); post.position.set(0, 0.06, 0); windex.add(post);
    // the fixed reference tabs, set to the close-hauled apparent wind angle either side of the bow
    for (const sx of [-1, 1]) { const tab = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.03, 0.22), blk); const a = sx * 28 * Math.PI / 180; tab.position.set(Math.sin(a) * 0.14, 0.05, -Math.cos(a) * 0.14).add(windex.position); tab.rotation.y = -a; windexTabs.push(tab); rig.add(tab); }
  }
  // a compass card behind the glass of the bulkhead compass
  const cc = document.createElement('canvas'); cc.width = cc.height = 256; const g = cc.getContext('2d')!;
  g.fillStyle = '#10161c'; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e8e4d8'; g.fillStyle = '#e8e4d8'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 5) {
    const a = d * Math.PI / 180, r0 = d % 30 === 0 ? 92 : d % 10 === 0 ? 100 : 106;
    g.lineWidth = d % 30 === 0 ? 3 : 1.5; g.beginPath(); g.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0); g.lineTo(128 + Math.sin(a) * 118, 128 - Math.cos(a) * 118); g.stroke();
    if (d % 30 === 0) { g.save(); g.translate(128 + Math.sin(a) * 74, 128 - Math.cos(a) * 74); g.rotate(a); g.font = `bold ${d % 90 === 0 ? 30 : 22}px sans-serif`; g.fillStyle = d === 0 ? '#ff5a3c' : '#e8e4d8'; g.fillText(({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[d] ?? String(d / 10), 0, 0); g.restore(); }
  }
  const card = new THREE.CanvasTexture(cc); card.center.set(0.5, 0.5);
  const cmp = grp.getObjectByName('compass')!;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.068, 32), new THREE.MeshBasicMaterial({ map: card }));
  face.position.copy(cmp.position); face.position.z += 0.017; grp.add(face);
  const lubber = new THREE.Mesh(new THREE.PlaneGeometry(0.006, 0.03), new THREE.MeshBasicMaterial({ color: 0xffb35c })); lubber.position.copy(face.position); lubber.position.y += 0.055; lubber.position.z += 0.001; grp.add(lubber);
  // the racing instrument on your own boat's cabin top, as on Josephine: just forward of the sliding hatch's runners, on
  // the centreline, its face tilted up toward the helm (render/tacktick.ts)
  let instrument: Instrument | undefined;
  if (b.isUser) {
    instrument = buildInstrument();
    const z = -L / 2 + CABIN.u1 * L - 2 * COMPANIONWAY.len - 0.08 - 0.09; // (0.09 m forward of the runners' forward ends)
    instrument.grp.position.set(0, cabinTopAt(uAtZ(z), 0), z); grp.add(instrument.grp);
  }
  const JACKETS = [[0xc8372d, 0x2b4f8a, 0xe8b21c], [0x1f3a5f, 0xd8d4c8, 0xb03a2e], [0x2e6b4f, 0xf2c14e, 0x3a3f47], [0xe36a1e, 0x274060, 0xdedad0]];
  const spec = b.crew?.spec ?? DEFAULT_CREW;
  const crew = buildCrew(spec.helm, spec.crew, JACKETS[b.id % JACKETS.length], b.id * 3); grp.add(crew.group);
  // she stands in front of the lights' reflections on the water (the streaks are drawn over the waves, so they can't
  // use the depth buffer): everything of hers marks the stencil, and the streaks leave those pixels alone (navLights.ts)
  grp.traverse(o => { const m = (o as THREE.Mesh).material; for (const x of Array.isArray(m) ? m : m ? [m] : []) markBoat(x); });
  // her lights: the bicolour on the stemhead, the sternlight on the transom to port of the rudder head (clear of the
  // tiller, the backstay's bridle and the ensign staff), or the tricolour just above the masthead, under the windex
  const sternY = sheer(1) - 0.07;
  const nav = buildNavLights(grp, { stem: V3(0, sheer(0) + 0.03, -L / 2 + 0.09), stern: V3(-0.17, sternY, aftLineZ(sternY) + 0.02), masthead: V3(0, MAST_TOP + 0.05, MAST_Z) },
    b.paint?.navLights ?? 'deck');
  if (b.paint?.hatch === 'acrylic') nav.hatch = ACRYLIC; // the forehatch's smoked acrylic: a faint glow from the cabin through it
  nav.below = grp.userData.below;
  const ropes = buildRopes(grp, b.spec);
  return { rigDrawn: { mast, mastBase, forestay, bow: 0, topAft: 0, windexZ: MAST_Z, jumperLines, windexTabs, tabZ: windexTabs.map(t => t.position.z), sag: 0, load: 0, want: 0 }, grp, boomPivot, jibPivot, main, jib, mainFurl, jibBag, jibTells, leechTells, pole, stowedPole: stowed, ribbons, rudder, prevH: b.h, prevT: -1, mainsheet, lines, windex, card, instrument, crew, flags, ensign, hideHelm: false, nav, ropes, lantern: grp.userData.lantern };
}

/** Pose the mesh from the boat state. `t` is wall-clock seconds, for bobbing and flogging. */
export function syncBoatMesh(m: BoatMesh, b: Boat, t: number, wave?: { heave: number; pitch: number; roll: number }): void {
  // riding the waves: heave, pitch and roll from the sea surface under her (or a gentle bob in flat water)
  const heave = wave ? wave.heave : Math.sin(t * 1.3 + b.id) * 0.03, pitch = wave ? wave.pitch : Math.sin(t * 0.9 + b.id) * 0.006;
  m.grp.position.copy(P3(b.x, b.y, heave));
  m.grp.rotation.y = -b.h * D2R; m.grp.rotation.z = b.heel * D2R + (wave ? wave.roll : 0); m.grp.rotation.x = pitch;
  // rudder and tiller: the helm. Turning to port (heading falling) means the tiller is pushed to starboard.
  // rudder and tiller follow the helm the sim is using (steady, not estimated from frame-to-frame heading changes,
  // which jitter with the frame rate); eased so it swings like a real tiller
  const dt = m.prevT < 0 ? 0 : Math.min(0.1, t - m.prevT); m.prevT = t;
  // the cabin's lantern swings on its chain under her motion, and its light goes with it
  { const u = (m.grp.userData.below as ReturnType<typeof cabinInteriorMaterial>).uniforms;
    swingLantern(m.lantern, m.grp, Math.max(0, dt), u.uLampAt.value);
    u.uLampUp.value.set(0, 1, 0).applyQuaternion(m.lantern.arm.quaternion); }
  const want = Math.max(-0.5, Math.min(0.5, (b.helm ?? 0) * 0.5)); // full helm ~0.5 rad
  m.rudder.rotation.y += (want - m.rudder.rotation.y) * Math.min(1, dt * 8);
  // the windex swings into the apparent wind (damped, as a real one is); the compass card turns with the heading
  const wantW = -b.arel * D2R, curW = m.windex.rotation.y, dW = Math.atan2(Math.sin(wantW - curW), Math.cos(wantW - curW));
  m.windex.rotation.y = curW + dW * Math.min(1, dt * 5);
  if (m.flags.length) {
    // each flag streams downwind of its hoist in the same apparent wind as the windex, sails and telltales, flapping in
    // waves that run out to the fly at the rate and swing measured for flags (render/flagWave.ts); in light air it hangs
    const ext = flagExtension(b.aws), sag = (1 - ext) * 1.3, cs = Math.cos(sag), sn = Math.sin(sag); // (hanging: the fly falls about 75° from the wind's line)
    for (const f of m.flags) {
      const p = f.mesh.geometry.attributes.position as THREE.BufferAttribute, a = p.array as Float32Array;
      f.mesh.rotation.y = m.windex.rotation.y - Math.PI / 2;
      const { hz, snap } = flagDrawn(b.aws, f.fly, dt);
      f.ph = (f.ph + 2 * Math.PI * hz * dt) % (2 * Math.PI * 100); // (the phase runs on: no jump as the wind changes)
      flagRow(FLAG_SEGS, f.ph, f.fly, ext, snap, ROW_X, ROW_Z);
      for (let i = 0; i < a.length; i += 3) {
        const k = (i / 3) % (FLAG_SEGS + 1), x = ROW_X[k], y = f.base[i + 1];
        // streaming, it lies out along the wind; hanging, the fly falls away below the hoist, which stays on its staff or
        // halyard (the foot folds in under it rather than hanging the whole flag's length lower)
        a[i] = x * cs; a[i + 1] = y - x * sn * (1 + y / f.h); a[i + 2] = ROW_Z[k];
      }
      p.needsUpdate = true;
    }
  }
  if (m.ensign) {
    // striking the ensign: hand over hand down the staff (about 3 s), then the staff out of its socket and below (1 s);
    // hoisting it again, the other way round
    const e = m.ensign, { down, slide, out } = ensignStep(e.down, !!b.ensignStruck, dt); e.down = down;
    if (e.flag) { e.flag.position.copy(e.at).addScaledVector(e.axis, -slide * e.slideMax); e.flag.visible = slide < 1; } // (down the raked staff, gathered in at the foot)
    e.staff.position.copy(e.axis).multiplyScalar(out * 0.3); e.staff.visible = out < 1; // (lifted up out of its socket, along its rake)
  }
  m.card.rotation = b.h * D2R;
  if (m.instrument) syncInstrument(m.instrument, t, b.h, b.v / KT);
  // the crew on the windward side, hiking as hard as she needs
  syncCrew(m.crew, b.rel >= 0 ? 1 : -1, b.crew, dt, m.hideHelm, tillerTip(m.rudder), b.heel, b.tacking);
  if (b.pushing) dockhand(m.crew, b.pushing, 0.45, deckY(uAtZ(-0.55), halfBeam(uAtZ(-0.55)) - 0.15), t); // (the docks' top: render/marina.ts)
  // positive rotation swings the boom to starboard (+x); b.boom is negative when the wind is from starboard, so it goes to port, to leeward
  m.boomPivot.rotation.y = b.boom * D2R;
  m.jibPivot.quaternion.setFromAxisAngle(JIB_AXIS, b.jib * D2R);
  const plan = sailPlan(b), headToWind = b.twa < 32;
  // main: twists more as the sheet is eased; bubbles at the luff when under-trimmed; flogs when let go
  const tm = b.trim.main;
  const mainShape: SailShape = {
    twist: b.shape.main.twist, depth: b.shape.main.depth, draft: b.shape.main.draft, time: t + b.id,
    bubble: tm.flow === 'luffing' ? Math.min(1, tm.amount * 1.4) : 0,
    flog: b.luff || headToWind ? 0.85 : tm.flow === 'luffing' ? Math.max(0, tm.amount - 0.6) * 2 : 0
  };
  // jib: full when poled out; hangs while the crew handles the pole; collapses behind the main dead downwind
  const tj = b.trim.jib;
  const jibShape: SailShape = {
    twist: b.shape.jib?.twist ?? 4 + 10 * Math.min(1, Math.abs(b.jib) / 40), depth: b.shape.jib?.depth, draft: b.shape.jib?.draft, time: t * 1.1 + b.id,
    bubble: tj && tj.flow === 'luffing' ? Math.min(1, tj.amount * 1.6) : 0,
    flog: plan === 'main' ? 0.7 : b.luff || headToWind ? 0.85 : plan === 'jib' && b.awa > 160 ? 0.35 + 0.35 * Math.abs(Math.sin(t * 1.7 + b.id))
      : tj && tj.flow === 'luffing' ? Math.max(0, tj.amount - 0.6) * 2 : 0
  };
  const jibSgnNow = (b.jibBacked ?? 0) > 0 ? Math.sign(b.boom || 1) : Math.sign(b.jib || 1);
  // (the jib's pull on the stay: drawing, or as much as it is when it starts to luff; nothing flogging)
  const jibLoad = jibShape.flog > 0.2 ? 0 : 1 - jibShape.bubble;
  const rd = syncRig(m, b, jibSgnNow, jibLoad, dt);
  if (rd.bow || rd.topAft) { // the main's luff on the bent mast, from the gooseneck (the boom's on it): forward in the boat's frame, into the boom's (mirrored to its side)
    const a = b.boom * D2R, sx = Math.sign(b.boom || 1), g0 = mastFwd(BOOM_TOP - DECK_AT_MAST, rd.bow, rd.topAft);
    mainShape.luff = { x: sx * Math.sin(a), z: -Math.cos(a), f: tt => mastFwd(BOOM_TOP - DECK_AT_MAST + tt * P, rd.bow, rd.topAft) - g0 };
  }
  if (Math.abs(rd.sag) > 0.002) { // the jib's luff on the sagging stay, in its turned frame (mirrored to its side)
    const v = tmpE.copy(sagDir(rd.sag)).applyQuaternion(tmpQ.copy(m.jibPivot.quaternion).invert());
    const jt0 = JIB_DEF.tack.length();
    jibShape.luff = { x: v.x * jibSgnNow, z: v.z, f: tt => { const u = (jt0 + tt * JIB_LUFF) / STAY_LEN; return 4 * u * (1 - u); } };
  }
  m.main.update(mainShape); m.jib.update(jibShape);
  m.main.mesh.scale.x = Math.sign(b.boom || 1);
  // a backed jib lies to windward, but the wind still presses its belly to leeward, toward the mast
  const jibSgn = (b.jibBacked ?? 0) > 0 ? Math.sign(b.boom || 1) : Math.sign(b.jib || 1);
  m.jib.mesh.scale.x = jibSgn;
  { // hoisting and striking: the main's head comes down its track to the boom; the jib's head down the forestay
    const hm = b.rig?.main ?? 1, hj = b.rig?.jib ?? 1;
    m.main.mesh.visible = hm > 0.02; m.main.mesh.scale.y = Math.max(0.02, hm); m.main.mesh.position.y = MAIN_DEF.tack.y * (1 - hm);
    m.mainFurl.visible = hm < 0.98; m.mainFurl.scale.set(0.3 + 0.7 * (1 - hm), 1, 0.3 + 0.7 * (1 - hm));
    m.jib.mesh.visible = hj > 0.02; m.jibBag.visible = hj < 0.98; m.jibBag.scale.set(0.2 * (0.4 + 0.6 * (1 - hj)), 0.12 * (0.4 + 0.6 * (1 - hj)), 0.45);
    // squeeze the jib along the stay (and mirror it to its side): M = (I + (h − 1)·a·aᵀ)·diag(sx, 1, 1), a the forestay
    const a = JIB_AXIS, k = hj - 1, sx = m.jib.mesh.scale.x, jm = m.jib.mesh;
    jm.matrixAutoUpdate = false;
    jm.matrix.set(sx * (1 + k * a.x * a.x), k * a.x * a.y, k * a.x * a.z, 0, sx * k * a.y * a.x, 1 + k * a.y * a.y, k * a.y * a.z, 0, sx * k * a.z * a.x, k * a.z * a.y, 1 + k * a.z * a.z, 0, 0, 0, 0, 1);
    jm.matrixWorldNeedsUpdate = true;
  }
  // the cloth's front face looks along the mesh's +x, which the mirroring turns to starboard (+1) or port (−1)
  for (const [sail, sgn] of [[m.main, Math.sign(b.boom || 1)], [m.jib, jibSgn]] as const) {
    const mats = sail.mesh.material as THREE.MeshLambertMaterial[], pr = sailPics.get(mats[0]);
    if (pr) { const want = sgn > 0 ? pr.stbd : pr.port, other = sgn > 0 ? pr.port : pr.stbd; if (pr.front.map !== want) { pr.front.map = want; pr.back.map = other; } }
  }
  if (b.isUser) {
    const tells = boatTells(plan === 'jib' ? tj : null, tm, b.awa, !!b.luff), st = tells.jib;
    const amt = tj?.amount ?? 0, mirJ = m.jib.mesh.scale.x < 0;
    m.jibTells.windward.forEach(tt => tt.update(jibShape, st.windward, amt, mirJ));
    m.jibTells.leeward.forEach(tt => tt.update(jibShape, st.leeward, amt, mirJ));
    const leech = tells.leech;
    m.leechTells.forEach(tt => tt.update(mainShape, leech, tm.amount, m.main.mesh.scale.x < 0));
  }
  syncPole(m, plan === 'wing');
  syncLines(m, b);
  for (const r of m.ribbons) syncRibbon(r, b, t);
  // her lights: none in her slip or when switched off, the anchor light at anchor, else under way's (navLights.ts)
  syncNavLights(m.nav, b.docked || b.lightsOff ? 'off' : b.atAnchor ? 'anchor' : 'underway');
  syncRopes(m);
}

const tmpE = new THREE.Vector3(), tmpG = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
/**
 * The rig as the tune, the backstay and the wind set it (rigTune.ts rigDrawn): the forestay sagging to leeward in the
 * jib's pull (straight with the jib down), the mast bowed forward in its middle and its head aft. The mast's vertices
 * are moved only when its bend changes by a millimetre or more; the stay's 13 points every frame.
 */
function syncRig(m: BoatMesh, b: Boat, jibSgn: number, load: number, dt: number): { sag: number; bow: number; topAft: number } {
  const r = m.rigDrawn, tune = b.tune ?? guideTune(b.ww.kt);
  const d = rigDrawn(tune, b.ctl.backstay, b.aws / KT, b.cond?.main.bend ?? 1);
  if (Math.abs(d.bow - r.bow) > 0.001 || Math.abs(d.topAft - r.topAft) > 0.001) {
    r.bow = d.bow; r.topAft = d.topAft;
    const g = r.mast.geometry, a = g.attributes.position.array as Float32Array, base = r.mastBase, half = (MAST_TOP - DECK_AT_MAST) / 2;
    for (let i = 0; i < a.length; i += 3) a[i + 2] = base[i + 2] - mastFwd(base[i + 1] + half, d.bow, d.topAft) / MAST_FA; // (the mesh is scaled by MAST_FA fore and aft)
    g.attributes.position.needsUpdate = true;
    // what's fixed to the mast goes with it: the windex and its tabs at the head, the gooseneck (and the boom), the
    // jumper stays' ends (their struts are at the hounds, which don't move)
    const at = (h: number) => mastFwd(h - DECK_AT_MAST, d.bow, d.topAft);
    m.windex.position.z = r.windexZ - at(MAST_TOP);
    r.windexTabs.forEach((t, k) => { t.position.z = r.tabZ[k] - at(MAST_TOP); });
    m.boomPivot.position.z = MAST_AFT_Z - at(BOOM_TOP);
    for (const { l, base } of m.lines.mastLines) { // (the lines up the mast's after side follow it)
      const q = l.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < q.count; i++) { const y = base[i * 3 + 1], z = base[i * 3 + 2]; q.setZ(i, z - (y > DECK_AT_MAST + 0.06 && Math.abs(z - MAST_Z) < 0.15 ? at(y) : 0)); }
      q.needsUpdate = true;
    }
    for (const jl of r.jumperLines) { const q = jl.geometry.attributes.position as THREE.BufferAttribute; q.setZ(0, MAST_FRONT_Z - at(JUMPER_TOP)); q.setZ(2, MAST_FRONT_Z - at(JUMPER_FOOT)); q.needsUpdate = true; }
  }
  // the stay sags as far as the jib is pulling on it (none head to wind or luffing, the jib down or docked), and it
  // unloads and reloads through a tack rather than jumping across: drawn toward the loaded sag in about a quarter second
  r.load = load; // (for scripts/check/rig-bend.cjs)
  const want = (b.rig?.jib ?? 1) > 0.5 && !b.docked ? d.sag * load * jibSgn : 0;
  r.want = want; r.sag += (want - r.sag) * Math.min(1, dt * 4);
  const st = r.forestay.geometry.attributes.position as THREE.BufferAttribute, v = sagDir(r.sag);
  for (let i = 0; i < STAY_PTS; i++) {
    const u = i / (STAY_PTS - 1), k = 4 * u * (1 - u);
    st.setXYZ(i, FORESTAY_DECK.x + (HOUNDS.x - FORESTAY_DECK.x) * u + v.x * k, FORESTAY_DECK.y + (HOUNDS.y - FORESTAY_DECK.y) * u + v.y * k, FORESTAY_DECK.z + (HOUNDS.z - FORESTAY_DECK.z) * u + v.z * k);
  }
  st.needsUpdate = true;
  return { sag: r.sag, bow: d.bow, topAft: d.topAft };
}
/**
 * The forestay's sag at mid-stay (m), signed by the jib's side, as a vector in the boat's frame: square to the stay, aft
 * and to leeward, the way the jib's cloth pulls on it (its tangent at the luff: the chord's angle plus the entry's, about
 * 40° off the fore-and-aft line). Sailmakers' "aft and to leeward" (North Sails, "Why is headstay sag fast upwind in light
 * air"); the aft part is what deepens the jib.
 */
const SAG_ANG = 40 * D2R, STAY_AFT = V3(0, -JIB_AXIS.z, JIB_AXIS.y); // (square to the stay, aft and down)
function sagDir(sag: number): THREE.Vector3 {
  const a = Math.abs(sag), lee = Math.sign(sag);
  return tmpF.set(lee * a * Math.sin(SAG_ANG), STAY_AFT.y * a * Math.cos(SAG_ANG), STAY_AFT.z * a * Math.cos(SAG_ANG));
}
const tmpF = new THREE.Vector3();

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function syncPole(m: BoatMesh, on: boolean): void {
  m.pole.visible = on; m.stowedPole.visible = !on;
  if (!on) return;
  const clew = tmpA.copy(JIB_CLEW).applyQuaternion(m.jibPivot.quaternion).add(m.jibPivot.position);
  const inb = tmpG.copy(POLE_INBOARD); inb.z -= mastFwd(POLE_INBOARD.y - DECK_AT_MAST, m.rigDrawn.bow, m.rigDrawn.topAft); // (its fitting on the bent mast)
  const d = tmpB.copy(clew).sub(inb), len = d.length();
  m.pole.position.copy(inb).addScaledVector(d, 0.5);
  m.pole.quaternion.setFromUnitVectors(UP, d.normalize());
  m.pole.scale.set(1, len, 1);
}

/** A cassette tape streams the way the apparent wind blows, droops when it's light, and flutters. */
function syncRibbon(r: Ribbon, b: Boat, t: number): void {
  const pos = r.geom.attributes.position as THREE.BufferAttribute, arr = pos.array as Float32Array;
  const th = b.arel * D2R;
  const fx = -Math.sin(th), fz = Math.cos(th); // flow direction in the boat frame (x starboard, z aft)
  const stream = Math.min(1, b.aws / 3); // fully streaming above ~6 kt apparent
  const px = -fz, pz = fx; // horizontal, across the flow: the ribbon's width and flutter direction
  let x = r.anchor.x, y = r.anchor.y, z = r.anchor.z;
  const seg = RIBBON_LEN / (RIBBON_N - 1);
  for (let i = 0; i < RIBBON_N; i++) {
    if (i > 0) {
      const flutter = Math.sin(t * (9 + 6 * stream) - i * 1.1 + r.phase) * 0.35 * (i / RIBBON_N);
      const h = stream * seg, v = Math.sqrt(Math.max(0, seg * seg - h * h));
      x += (fx + px * flutter) * h; z += (fz + pz * flutter) * h; y -= v;
    }
    const k = i * 6;
    arr[k] = x - px * RIBBON_W / 2; arr[k + 1] = y; arr[k + 2] = z - pz * RIBBON_W / 2;
    arr[k + 3] = x + px * RIBBON_W / 2; arr[k + 4] = y; arr[k + 5] = z + pz * RIBBON_W / 2;
  }
  pos.needsUpdate = true;
}

const tmpC = new THREE.Vector3(), tmpD = new THREE.Vector3();
/** Move the traveller car, tension the backstay, set the jib cars on their pins and run the jib sheets. */
function syncLines(m: BoatMesh, b: Boat): void {
  const L2 = m.lines, c = b.ctl, lee = b.tack === 'S' ? -1 : 1; // the leeward side (x sign)
  // traveller car: +1 is to leeward; the mainsheet runs from the boom end down to it
  const cx = lee * c.traveller * TRAV_HALF; L2.travCar.position.x = cx;
  const a = b.boom * D2R, p = m.mainsheet.geometry.attributes.position as THREE.BufferAttribute;
  // (from the lower block's sheave on the car up to the upper block's under the boom)
  // (four parts between the car's block and the two blocks under the boom, the after one then the forward one, then the
  // tail from the car's block aft to the helmsman's hand)
  { const ux = Math.cos(a), uz = -Math.sin(a), lo = tmpC.set(cx, L2.travCar.position.y + 0.06, TRAV_Z), boomZ = m.boomPivot.position.z, hy = BOOM_END.y - BOOM_R - 0.075;
    for (let i = 0; i <= 4; i++) {
      const o = (i - 2) * 0.007;
      if (i % 2) { const r = MS_R + (i === 1 ? MS_GAP / 2 : -MS_GAP / 2); p.setXYZ(i, Math.sin(a) * r + ux * o, hy, boomZ + Math.cos(a) * r + uz * o); }
      else p.setXYZ(i, lo.x + ux * o, lo.y, lo.z + uz * o);
    }
    p.setXYZ(5, cx, lo.y + 0.04, TRAV_Z + 0.06); p.setXYZ(6, cx * 0.6, lo.y - 0.3, TRAV_Z + 0.4); p.needsUpdate = true; } // (the tail, falling to the helmsman's side of the cockpit)
  // the vang: four parts from the boom's block (where the boom has swung it) down to the lower block on the mast's foot
  { const q = L2.vang.geometry.attributes.position as THREE.BufferAttribute, ux = Math.cos(a), uz = -Math.sin(a), boomZ = m.boomPivot.position.z;
    const top = tmpG.set(Math.sin(a) * VANG_R, BOOM_TOP - 2 * BOOM_R - 0.05, boomZ + Math.cos(a) * VANG_R);
    for (let i = 0; i <= 4; i++) { const o = (i - 2) * 0.006, at = i % 2 ? top : VANG_FOOT; q.setXYZ(i, at.x + ux * o, at.y, at.z + uz * o); }
    q.needsUpdate = true; }
  // the Cunninghams' cringles come down with their sails as they're struck (the tack stays put)
  for (const { l, sail } of L2.cringles) {
    const q = l.geometry.attributes.position as THREE.BufferAttribute, n = q.count - 1, h = sail === 'main' ? b.rig?.main ?? 1 : b.rig?.jib ?? 1;
    if (sail === 'main') q.setY(n, BOOM_TOP + MAIN_CUNNINGHAM_UP * h);
    else { const p2 = tmpE.copy(FORESTAY_DECK).addScaledVector(JIB_AXIS, 0.10 + JIB_CUNNINGHAM_UP * h); q.setXYZ(n, p2.x, p2.y, p2.z); }
    q.needsUpdate = true;
  }
  // the traveller's control lines: from the car's ends to the blocks at the track's ends
  L2.travLines.forEach((tl, k) => { const side = k ? 1 : -1, q = tl.geometry.attributes.position as THREE.BufferAttribute; q.setXYZ(0, cx + side * 0.045, L2.travCar.position.y + 0.005, TRAV_Z); q.needsUpdate = true; });
  // backstay: the bridle's apex is pulled down as the backstay goes on
  { const q = L2.backstay.geometry.attributes.position as THREE.BufferAttribute, foot = new THREE.Vector3(0, sheer(1), 3.74);
    const ay = 2.7 - 1.3 * c.backstay, f = (MASTHEAD.y - ay) / (MASTHEAD.y - foot.y), apex = MASTHEAD.clone().lerp(foot, f);
    // (the masthead where the bent mast has it; the apex on the straight wire from there to the fixed foot: both legs meet it)
    const headAft = -mastFwd(MAST_TOP - DECK_AT_MAST, m.rigDrawn.bow, m.rigDrawn.topAft); apex.z += headAft * (1 - f);
    q.setXYZ(0, MASTHEAD.x, MASTHEAD.y, MASTHEAD.z + headAft); q.setXYZ(1, apex.x, apex.y, apex.z);
    q.setXYZ(2, 0.3, foot.y + 0.02, foot.z - 0.1); q.setXYZ(3, apex.x, apex.y, apex.z); q.setXYZ(4, -0.3, foot.y + 0.02, foot.z - 0.1); q.needsUpdate = true; }
  // jib cars and sheets: the leeward sheet runs taut from the clew through its car to the winch; the lazy one hangs slack
  const clew = tmpC.copy(JIB_CLEW).applyQuaternion(m.jibPivot.quaternion).add(m.jibPivot.position);
  for (const [tk, side] of [['S', 1], ['P', -1]] as const) {
    const pin = c.car[tk], car = carPos(side, pin.fore, pin.ins);
    L2.cars[tk].position.copy(car);
    // (backed, it's the windward sheet that holds the clew)
    const wv = L2.winches[tk], q = L2.jibSheets[tk].geometry.attributes.position as THREE.BufferAttribute, loaded = (side === lee) !== ((b.jibBacked ?? 0) > 0);
    const sag = loaded ? 0 : 0.25;
    const mid1 = tmpD.copy(clew).lerp(car, 0.5); mid1.y -= sag;
    q.setXYZ(0, clew.x, clew.y, clew.z); q.setXYZ(1, mid1.x, mid1.y, mid1.z); q.setXYZ(2, car.x, car.y + 0.03, car.z);
    // aft from the car along the cabin top, over its after corner, and down to the winch (a straight line from the car
    // would cut through the cabin's side)
    const zA = -L / 2 + CABIN.u1 * L, mid2 = tmpD.set(side * (CABIN.w - 0.07), cabinTopAt(CABIN.u1, CABIN.w - 0.07) + 0.03 + (loaded ? 0.01 : 0), zA);
    q.setXYZ(3, mid2.x, mid2.y, mid2.z); q.setXYZ(4, wv.x, wv.y, wv.z); q.needsUpdate = true;
  }
}

/**
 * A sail's picture (u: luff → leech, v: foot → head): sailcloth, crosscut seams, and on the main the class insignia
 * (the letter F), the national letters and the sail number, as the class rules lay them down (NFIA class rules 9.14:
 * as in the Racing Rules' Appendix G): the insignia above the national letters, the national letters above the number,
 * figures at least 300 mm high and 200 mm wide with a 40 mm stroke and 60 mm between them, in a sans-serif face, all
 * above the arc 60% of the leech length from the head, and the starboard side's set higher than the port side's so
 * they don't sit back to back. `side`: which side of the sail this picture is seen from. Sizes are in metres on the real sail.
 */
/** Which picture goes on which face of a sail's cloth (by the front material). */
const sailPics = new WeakMap<THREE.Material, { front: THREE.MeshLambertMaterial; back: THREE.MeshLambertMaterial; stbd: THREE.Texture; port: THREE.Texture }>();
function sailTexture(color: string, no: string, side: 'stbd' | 'port', main: boolean, inks: { no?: string; f?: string } = {}): THREE.CanvasTexture {
  // the picture is in the sail's own coordinates: across from luff (u 0) to leech (u 1), up from foot (v 0) to head
  // (v 1), so everything is drawn where it physically is on the cloth, whichever side the picture is for. Seen from
  // starboard the leech is on your left, so the lettering on that side is drawn back to front in the picture
  const def = main ? MAIN_DEF : JIB_DEF, LUFF = def.head.distanceTo(def.tack), FOOT = def.clew.distanceTo(def.tack);
  const W = main ? 512 : 384, H = main ? 2048 : 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const X = (u: number) => u * W, Y = (v: number) => (1 - v) * H;
  const dark = lum(color) < 0.3; // black sails: light seams and stripes, white numbers
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  const line = (pts: [number, number][], col: string, w: number) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); pts.forEach(([u, v], i) => i ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v))); g.stroke(); };
  // the sail flat, in its own plane (fore and aft z, up y), and where a point on it falls in the picture's coordinates
  // (the same outline as the cloth's mesh, roach and all: sails.ts sailEdges)
  const at = (s0: number, t0: number) => { const [lu, le] = sailEdges(def, t0); return { z: lu.z + (le.z - lu.z) * s0, y: lu.y + (le.y - lu.y) * s0 }; };
  const uvOf = (q: { z: number; y: number }): [number, number] => { // (Newton's method on the bilinear map)
    let sv = 0.5, tv = 0.5;
    for (let k = 0; k < 12; k++) {
      const p = at(sv, tv), e = 1e-4, ps = at(sv + e, tv), pt = at(sv, tv + e);
      const a11 = (ps.z - p.z) / e, a12 = (pt.z - p.z) / e, a21 = (ps.y - p.y) / e, a22 = (pt.y - p.y) / e, det = a11 * a22 - a12 * a21 || 1e-9;
      const dz = q.z - p.z, dy = q.y - p.y; sv += (a22 * dz - a12 * dy) / det; tv += (-a21 * dz + a11 * dy) / det;
    }
    return [sv, tv];
  };
  // the leech's length, and the way in from it at height fraction t: square to the leech there (it curves with the roach),
  // pointing in toward the luff
  const ll = def.head.distanceTo(def.clew);
  const inward = (t: number) => {
    const a = at(1, Math.max(0, t - 0.01)), b = at(1, Math.min(1, t + 0.01)), lz = b.z - a.z, ly = b.y - a.y, l = Math.hypot(lz, ly);
    let nz = -ly / l, ny = lz / l; const mid = at(0.5, t), lp = at(1, t); if (nz * (mid.z - lp.z) + ny * (mid.y - lp.y) < 0) { nz = -nz; ny = -ny; }
    return { nz, ny };
  };
  /** From the leech at height fraction t, square to it, in toward the luff: `len` m, or until it meets the luff or the foot. */
  const fromLeech = (t: number, len = 99): [number, number][] => {
    const o = at(1, t), { nz, ny } = inward(t), pts: [number, number][] = [];
    for (let d = 0; d <= len; d += 0.05) { const uv = uvOf({ z: o.z + nz * d, y: o.y + ny * d }); if (uv[0] < 0 || uv[1] < 0) break; pts.push(uv); }
    return pts;
  };
  // crosscut panels, as sailmakers lay them: each seam runs from the leech square to it, about 0.95 m apart up the leech,
  // to the luff or the foot (on the main that slants it down toward the mast; on the jib, whose leech is nearly upright,
  // it runs nearly level)
  const seam = dark ? 'rgba(210,210,210,.2)' : 'rgba(100,96,86,.32)', step = 0.95 / ll;
  for (let t = step; t < 1 - 0.04; t += step) line(fromLeech(t), seam, main ? 3.5 : 3);
  // the jib's head is cut radially: seams fanning down from the head to the first crosscut seam below it
  if (!main) { const t1 = 1 - step * 1.15; for (const sv of [0.25, 0.6]) line([[0.02, 0.995], [sv, t1]], seam, 3); }
  // the draft stripes: dark lines along the chord, luff to leech at one height (a third and two-thirds of the way up), as
  // sailmakers put them on: what the trimmer reads the sail's depth and draft position against
  for (const v of [0.34, 0.67]) line([[0, v], [1, v]], dark ? 'rgba(235,235,235,.55)' : 'rgba(25,30,40,.75)', main ? 7 : 6);
  // reinforcement patches at the corners: overlapped cloth, a little greyer and more opaque
  g.fillStyle = dark ? 'rgba(120,120,120,.25)' : 'rgba(150,152,155,.28)';
  const patch = (u: number, v: number, r: number) => { g.beginPath(); g.ellipse(X(u), Y(v), r / FOOT * W, r / LUFF * H, 0, 0, Math.PI * 2); g.fill(); };
  patch(0, 0, main ? 0.75 : 0.55); patch(1, 0, main ? 0.85 : 0.7); patch(0, 1, 0.35);
  // batten pockets: from the leech in, square to it, ending in a rounded end
  for (const bt of def.battens ?? []) {
    const pts = fromLeech(bt.t, bt.len); if (pts.length < 2) continue;
    line(pts, dark ? 'rgba(200,200,200,.45)' : 'rgba(110,112,118,.6)', (main ? 0.05 : 0.045) / LUFF * H);
    const [eu, ev] = pts[pts.length - 1]; g.fillStyle = dark ? 'rgba(200,200,200,.35)' : 'rgba(150,152,158,.45)';
    g.beginPath(); g.ellipse(X(eu), Y(ev), 0.07 / (FOOT * Math.max(0.2, 1 - ev)) * W, 0.07 / LUFF * H, 0, 0, Math.PI * 2); g.fill();
  }
  if (main && no) {
    const pxV = H / LUFF; // canvas px per metre up the sail
    /**
     * One line of figures at height fraction t, its leech end 0.15 m in from the leech (as sailmakers set them: each line
     * follows the leech down, so a lower line sits a little further aft). Each figure 0.30 m × 0.20 m, 0.06 m apart, in a
     * plain bold sans-serif; a 1 is a single straight bar, as on the sails. `stbd`: the starboard side's set, which is
     * read with the leech on your left, so in the picture (luff on the left) it runs, and each figure faces, back to front.
     * The same ink shows through the cloth on the other side, at the same place, so both pictures draw both sets alike.
     */
    const figures = (txt: string, t: number, col: string, stbd: boolean) => {
      const [lu, le] = sailEdges(def, t), chord = lu.distanceTo(le), pxU = W / chord; // px per metre across the sail at this height
      const glyphs = [...txt].filter(ch => ch !== ' '), widths = glyphs.map(ch => (ch === '1' || ch === 'I' ? 0.07 : 0.2));
      const total = widths.reduce((a, w) => a + w, 0) + 0.06 * (glyphs.length - 1);
      let x = chord - 0.15 - total; // metres from the luff
      g.fillStyle = col;
      const size = 0.3 * pxV * 1.37; // a bold sans-serif's cap height is about 0.73 of its em
      // luff to leech in the picture: in reading order for the port side's, the other way for the starboard side's
      const order = stbd ? glyphs.map((_, k) => glyphs.length - 1 - k) : glyphs.map((_, k) => k);
      for (const k of order) {
        const ch = glyphs[k], cxM = x + widths[k] / 2, cx = cxM * pxU, y = H * (1 - t) + 0.15 * pxV;
        if (ch === '1' || ch === 'I') g.fillRect(cx - 0.035 * pxU, y - 0.3 * pxV, 0.07 * pxU, 0.3 * pxV); // a plain bar
        else {
          g.save(); g.font = `bold ${Math.round(size)}px "Helvetica Neue", Helvetica, Arial, "Liberation Sans", "DejaVu Sans", sans-serif`; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
          const m = g.measureText(ch), sx = (widths[k] * pxU) / Math.max(1, m.width), back = stbd;
          g.translate(cx, y); g.scale(sx * (back ? -1 : 1), 1); g.fillText(ch, -m.width / 2, 0); g.restore();
        }
        x += widths[k] + 0.06;
      }
    };
    // (the numbers' ink: the colour chosen on the Boat page, or the one that contrasts with the cloth; the F like the numbers unless chosen)
    const ink = inks.no ?? (dark ? '#f2f2ee' : '#1c2128'), fInk = inks.f ?? ink, letters = (no.match(/^[A-Z]+/)?.[0] ?? '').replace(/^US$/, 'USA'), digits = no.replace(/^[A-Z]+\s*/, '');
    // each side carries its own: the F up near the head and the numbers below, the starboard set higher (RRS G1.3);
    // this side's reads crisply, the other side's shows through the cloth mirrored, a little softer
    const set = (s: 'stbd' | 'port', alpha: number) => {
      const mir = s === 'stbd';
      const hi = s === 'stbd', fT = hi ? 0.835 : 0.765, nT = hi ? 0.665 : 0.565, step = 0.42 / LUFF;
      g.globalAlpha = alpha;
      figures('F', fT, fInk, mir); // the class insignia (by default in the same ink as the numbers, as on San Francisco boats' sails)
      if (letters) figures(letters, nT, ink, mir);
      figures(digits, nT - (letters ? step : 0), ink, mir);
      g.globalAlpha = 1;
    };
    set(side === 'stbd' ? 'port' : 'stbd', dark ? 0.35 : 0.72);
    set(side, 1);
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
  return t;
}

/** Relative luminance of a hex colour (0 black .. 1 white). */
function lum(hex: string): number { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
/** Her name on the quarters: in the boot stripe's colour, or whatever reads against the topsides. */
function nameColor(hull: string, boot: string): string {
  if (boot && Math.abs(lum(boot) - lum(hull)) > 0.25) return boot;
  return lum(hull) > 0.45 ? '#1f2c4f' : '#f2eee4';
}

const teakCache = new Map<boolean, THREE.CanvasTexture>();
/** Laid teak: planks with black caulked seams and grain; weathered silver-grey, or oiled and polished. */
/**
 * Texture coordinates for laid planks on any surface: on the flat (sole, seat tops) they run fore and aft like the deck's;
 * on the sides of the well they run fore and aft along the wall; on the end walls, across the boat. 0.07 m planks.
 */
function plankUV(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, uv: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    if (ny > 0.7) uv.push(p.getX(i) / 0.28, p.getZ(i) / 2.4);
    else if (nx >= nz) uv.push(p.getY(i) / 0.28, p.getZ(i) / 2.4);
    else uv.push(p.getY(i) / 0.28, p.getX(i) / 2.4);
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
function teakTexture(silver: boolean): THREE.CanvasTexture {
  const hit = teakCache.get(silver); if (hit) return hit;
  const W = 256, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, planks = 4, pw = W / planks;
  let seed = silver ? 7 : 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < planks; i++) {
    const base = silver ? [168, 163, 152] : [176, 116, 62], k = 0.9 + rnd() * 0.18;
    g.fillStyle = `rgb(${base.map(v => Math.round(v * k)).join(',')})`; g.fillRect(i * pw, 0, pw, H);
    for (let j = 0; j < 40; j++) { // grain: long thin streaks along the plank
      const x = i * pw + 3 + rnd() * (pw - 6), a = (silver ? 0.1 : 0.14) * rnd();
      g.strokeStyle = rnd() < 0.5 ? `rgba(60,40,20,${a})` : `rgba(255,240,210,${a * 0.7})`; g.lineWidth = 0.6 + rnd() * 1.2;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (rnd() - 0.5) * 6, H * 0.33, x + (rnd() - 0.5) * 6, H * 0.66, x + (rnd() - 0.5) * 4, H); g.stroke();
    }
  }
  g.fillStyle = silver ? '#3b3a37' : '#17130f';
  for (let i = 0; i < planks; i++) g.fillRect(i * pw, 0, 2.5, H); // caulked seams
  for (let i = 0; i < planks; i++) { const y = (rnd() * 0.8 + 0.1) * H; g.fillRect(i * pw, y, pw, 2); } // butt joints, staggered
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  teakCache.set(silver, t); return t;
}

/** The face for boats' names: a hand-lettered script (Google Fonts' Playball, loaded with the page), falling back to any script. */
const NAME_FONT = '"Playball", "Brush Script MT", cursive';
/** A starboard-side patch mirrored to port: flipped across the centreline, read the other way round, and turned to face out. */
function mirrorPatch(geo: THREE.BufferGeometry): void {
  geo.scale(-1, 1, 1); const uv = geo.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  (geo.index!.array as Uint16Array | Uint32Array).reverse(); geo.computeVertexNormals();
}
let winCache: THREE.CanvasTexture | null = null;
/** The long cabin light: dark tinted glass with a sky sheen, in a thin aluminium frame with rounded ends. */
function windowTexture(): THREE.CanvasTexture {
  if (winCache) return winCache;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 64; const c = cv.getContext('2d')!;
  const rr = (x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  c.fillStyle = '#b9bec3'; rr(2, 4, 508, 56, 26); c.fill(); // the frame
  const g = c.createLinearGradient(0, 10, 0, 54); g.addColorStop(0, '#3c4c5a'); g.addColorStop(0.45, '#1c252d'); g.addColorStop(1, '#141a20');
  c.save(); rr(10, 10, 492, 44, 20); c.clip(); c.clearRect(0, 0, 512, 64); c.fillStyle = g; c.globalAlpha = 0.5; c.fillRect(0, 0, 512, 64); c.restore(); // the glass: tinted, see-through
  winCache = new THREE.CanvasTexture(cv); winCache.anisotropy = 4; return winCache;
}

/** A wall standing up from a path of points, h high and t thick across the path (in plan), with its top closed. */
function wall(pts: THREE.Vector3[], hh: (i: number) => number, t: number): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l * t / 2, nz = dx / l * t / 2, p = pts[i], h = hh(i);
    pos.push(p.x - nx, p.y, p.z - nz, p.x - nx, p.y + h, p.z - nz, p.x + nx, p.y + h, p.z + nz, p.x + nx, p.y, p.z + nz);
  }
  for (let i = 0; i < pts.length - 1; i++) { const a = i * 4, b = a + 4; for (let k = 0; k < 3; k++) idx.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
