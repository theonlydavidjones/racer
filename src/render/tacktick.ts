/**
 * The racing instrument on Josephine's cabin top: a Tacktick-style unit (reference/photos/josephine-cabin-top-forward-port.png,
 * the black unit just forward of the sliding hatch, near the mast foot), facing aft toward the helm. It reads her heading
 * and her speed, its digits drawn on its face a few times a second, as a real LCD updates.
 */
import * as THREE from 'three';

/**
 * The unit's size (m) and its face's tilt toward the cockpit (rad from vertical): the Tacktick Race Master T070's display,
 * 164 × 122 × 58 mm, a two-tier LCD with digits about 28 mm high on the upper line and 20 mm on the lower (retailer
 * specification, chsmith.com.au, Tacktick T070 Micronet Race Master; Raymarine's T070 page for what it shows: heading,
 * and speed over its wireless link). The owner measures Josephine's unit at about 8 × 5 inches (203 × 127 mm), which fits
 * the Race Master rather than the Micro Compass (100 × 68 mm). Raymarine gives no mounting angle; 20° back from vertical
 * is an estimate (the Micro Compass's manual asks for within 20° of vertical).
 */
export const UNIT = { w: 0.164, h: 0.122, d: 0.058, tilt: 20 * Math.PI / 180, lcd: 0.84 };
/** How often the readout changes (s): a small instrument's LCD updates about once a second for heading damping, but
 * a few times a second reads better in the sim. */
const EVERY = 0.25;

export interface Instrument { grp: THREE.Group; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; next: number; shown: string }

export function buildInstrument(): Instrument {
  const grp = new THREE.Group(); grp.name = 'instrument';
  const body = new THREE.MeshLambertMaterial({ color: 0x15171a });
  // the face, tilted up toward the cockpit, on a short black bracket
  const head = new THREE.Group(); head.rotation.x = -UNIT.tilt; head.position.y = UNIT.h * 0.5 * Math.cos(UNIT.tilt) + 0.012; grp.add(head);
  head.add(new THREE.Mesh(new THREE.BoxGeometry(UNIT.w, UNIT.h, UNIT.d), body));
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 190; // (the face's own shape)
  const ctx = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(UNIT.w * UNIT.lcd, UNIT.h * UNIT.lcd), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.z = UNIT.d / 2 + 0.0005; head.add(face);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(UNIT.w * 0.5, 0.024, 0.06), body); foot.position.y = 0.012; grp.add(foot);
  const inst = { grp, ctx, tex, next: 0, shown: '' };
  draw(inst, 0, 0);
  return inst;
}

/** Draw her heading (deg, true as the sim steers; 3 digits) and speed (kt, one decimal) on the face, if they've changed. */
export function syncInstrument(inst: Instrument, t: number, heading: number, kt: number): void {
  if (t < inst.next) return; inst.next = t + EVERY;
  draw(inst, heading, kt);
}

function draw(inst: Instrument, heading: number, kt: number): void {
  const hdg = String(Math.round(((heading % 360) + 360) % 360) % 360).padStart(3, '0'), spd = Math.max(0, kt).toFixed(1);
  const key = hdg + '|' + spd; if (key === inst.shown) return; inst.shown = key;
  const g = inst.ctx, W = 256, H = 190;
  // a reflective LCD: dark segments on a grey-green ground, in the black case; two tiers, heading (the larger digits,
  // about 28 mm on the real unit) over speed (about 20 mm)
  g.fillStyle = '#9fa89a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#16191a'; g.textBaseline = 'alphabetic';
  g.textAlign = 'right'; g.font = '700 92px "Arial Narrow", "Helvetica Neue", Arial, sans-serif'; g.fillText(hdg, 220, 92);
  g.font = '700 22px Arial, sans-serif'; g.fillText('°', 242, 34);
  g.font = '700 66px "Arial Narrow", "Helvetica Neue", Arial, sans-serif'; g.fillText(spd, 220, 176);
  g.textAlign = 'left'; g.font = '700 15px Arial, sans-serif'; g.fillText('HDG', 10, 28); g.fillText('KTS', 10, 128);
  g.fillRect(8, 108, W - 16, 3); // the rule between the two tiers
  inst.tex.needsUpdate = true;
}
