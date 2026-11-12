/**
 * The racing instrument on Josephine's cabin top: a Tacktick-style unit (reference/photos/josephine-cabin-top-forward-port.png,
 * the black unit just forward of the sliding hatch, near the mast foot), facing aft toward the helm. It reads her heading
 * and her speed, its digits drawn on its face a few times a second, as a real LCD updates.
 */
import * as THREE from 'three';

/**
 * The unit's size (m) and its face's tilt toward the cockpit (rad from vertical). The size is the Tacktick Micro Compass
 * T060's, 100 × 68 × 57 mm with a 20 mm twin LCD (retailer specification, sailboats.co.uk TA-T060, and the T060 manual's
 * listing on manualslib.com, 787009); its manual asks for mounting within 20° of vertical, so the face leans back 20°.
 * Which Tacktick unit Josephine carries isn't confirmed (the T060 shows heading only; a Race Master, 164 × 122 mm, also
 * shows speed from a paddlewheel over its wireless link): the owner says it shows heading and speed.
 */
export const UNIT = { w: 0.100, h: 0.068, d: 0.057, tilt: 20 * Math.PI / 180, lcd: 0.84 };
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
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 174; // (the face's own shape)
  const ctx = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(UNIT.w * UNIT.lcd, UNIT.h * UNIT.lcd), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.z = UNIT.d / 2 + 0.0005; head.add(face);
  const foot = new THREE.Mesh(new THREE.BoxGeometry(UNIT.w * 0.5, 0.024, 0.05), body); foot.position.y = 0.012; grp.add(foot);
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
  const g = inst.ctx, W = 256, H = 174;
  // a reflective LCD: dark segments on a grey-green ground, in the black case; two lines, heading over speed
  g.fillStyle = '#9fa89a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#16191a'; g.textBaseline = 'alphabetic';
  g.textAlign = 'right'; g.font = '700 84px "Arial Narrow", "Helvetica Neue", Arial, sans-serif'; g.fillText(hdg, 220, 82);
  g.font = '700 22px Arial, sans-serif'; g.fillText('°', 242, 30);
  g.font = '700 62px "Arial Narrow", "Helvetica Neue", Arial, sans-serif'; g.fillText(spd, 220, 162);
  g.textAlign = 'left'; g.font = '700 15px Arial, sans-serif'; g.fillText('HDG', 10, 26); g.fillText('KTS', 10, 116);
  g.fillRect(8, 96, W - 16, 3); // the rule between the two lines
  inst.tex.needsUpdate = true;
}
