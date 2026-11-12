import './three-setup';
import * as THREE from 'three';
import type { Flag } from '../sim/signals';

/**
 * Signal flags, drawn from the International Code of Signals (P, I, Z, U, X) and the black flag, plus a class
 * flag for the Folkboats (white, with the class's blue "F"). Flown from a yardarm on the committee boat or the
 * club flagpole, hoisted and lowered on the signals, streaming downwind and fluttering.
 */

const W = 128, H = 86;
const cache = new Map<Flag, HTMLCanvasElement>();
/** The flag as a small picture (also used by the HUD). */
export function flagCanvas(f: Flag): HTMLCanvasElement {
  let c = cache.get(f);
  if (c) return c;
  c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, fill = (col: string, x = 0, y = 0, w = W, h = H) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const BLUE = '#1d3f8f', RED = '#c8202b', YEL = '#f5c400';
  switch (f) {
    case 'P': fill(BLUE); fill('#fff', W / 3, H / 3, W / 3, H / 3); break; // blue with a white square
    case 'I': fill(YEL); g.fillStyle = '#111'; g.beginPath(); g.arc(W / 2, H / 2, H * 0.26, 0, Math.PI * 2); g.fill(); break; // yellow, black disc
    case 'Z': { // four triangles meeting in the middle: yellow (top), black (hoist), red (bottom), blue (fly)
      const tri = (col: string, a: number[], b: number[]) => { g.fillStyle = col; g.beginPath(); g.moveTo(W / 2, H / 2); g.lineTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.fill(); };
      tri(YEL, [0, 0], [W, 0]); tri('#111', [0, 0], [0, H]); tri(RED, [0, H], [W, H]); tri(BLUE, [W, 0], [W, H]); break;
    }
    case 'U': fill('#fff'); fill(RED, 0, 0, W / 2, H / 2); fill(RED, W / 2, H / 2, W / 2, H / 2); break; // red and white quarters
    case 'black': fill('#111'); break;
    case 'X': fill('#fff'); fill(BLUE, W / 2 - 10, 0, 20, H); fill(BLUE, 0, H / 2 - 10, W, 20); break; // white, blue cross
    case 'AP': for (let i = 0; i < 5; i++) fill(i % 2 ? '#fff' : RED, i * W / 5, 0, W / 5 + 1, H); break; // red and white vertical stripes
    case 'N': for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) fill((i + j) % 2 ? '#fff' : BLUE, i * W / 4, j * H / 4, W / 4 + 1, H / 4 + 1); break; // blue and white chequers
    case 'A': { fill('#fff', 0, 0, W / 2, H); g.fillStyle = BLUE; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W, 0); g.lineTo(W * 0.78, H / 2); g.lineTo(W, H); g.lineTo(W / 2, H); g.fill(); break; } // white at the hoist, blue swallowtail
    case 'class': fill('#fff'); g.fillStyle = BLUE; g.font = 'bold 66px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('F', W / 2, H / 2 + 3); break;
  }
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);
  cache.set(f, c);
  return c;
}

/**
 * The International Code numeral pennants 0–9 (tapered; as drawn on Flags of the World, crwflags.com/fotw/flags/xf~ics0.html).
 * The Seaweed Soup committee flies the course number in these (Addendum B1.4), top to bottom.
 */
const PW = 128, PH = 64;
const pennants = new Map<string, HTMLCanvasElement>();
export function pennantCanvas(digit: string): HTMLCanvasElement {
  let c = pennants.get(digit);
  if (c) return c;
  c = document.createElement('canvas'); c.width = PW; c.height = PH;
  const g = c.getContext('2d')!, RED = '#d21f26', BLUE = '#1d3f9a', YEL = '#f7d000', BLK = '#111', WHT = '#fff';
  const fill = (col: string, x = 0, y = 0, w = PW, h = PH) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const disc = (col: string) => { g.fillStyle = col; g.beginPath(); g.arc(PW * 0.28, PH / 2, PH * 0.25, 0, Math.PI * 2); g.fill(); };
  const crossOn = (col: string) => { fill(col, PW * 0.21, 0, PW * 0.14, PH); fill(col, 0, PH * 0.38, PW, PH * 0.24); };
  g.beginPath(); g.moveTo(0, 0); g.lineTo(PW, PH * 0.25); g.lineTo(PW, PH * 0.75); g.lineTo(0, PH); g.closePath(); g.clip(); // the taper
  switch (digit) {
    case '0': fill(YEL); fill(RED, PW / 3, 0, PW / 3); break; // yellow, red, yellow
    case '1': fill(WHT); disc(RED); break; // white, red disc
    case '2': fill(BLUE); disc(WHT); break; // blue, white disc
    case '3': fill(RED); fill(WHT, PW / 3, 0, PW / 3); fill(BLUE, PW * 2 / 3, 0, PW / 3); break; // red, white, blue
    case '4': fill(RED); crossOn(WHT); break; // red, white cross
    case '5': fill(YEL); fill(BLUE, PW / 2, 0, PW / 2); break; // yellow at the hoist, blue at the fly
    case '6': fill(WHT); fill(BLK, 0, 0, PW, PH / 2); break; // black over white
    case '7': fill(RED); fill(YEL, 0, 0, PW, PH / 2); break; // yellow over red
    case '8': fill(WHT); crossOn(RED); break; // white, red cross
    case '9': fill(WHT, 0, 0, PW / 2, PH / 2); fill(BLK, PW / 2, 0, PW / 2, PH / 2); fill(RED, 0, PH / 2, PW / 2, PH / 2); fill(YEL, PW / 2, PH / 2, PW / 2, PH / 2); break; // quartered
  }
  g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 2; g.beginPath(); g.moveTo(1, 1); g.lineTo(PW - 1, PH * 0.25); g.lineTo(PW - 1, PH * 0.75); g.lineTo(1, PH - 1); g.closePath(); g.stroke();
  pennants.set(digit, c);
  return c;
}

/** Which halyard each flag flies from: class flag to port, preparatory flags to starboard, X in the middle. */
const SLOT: Record<Flag, number> = { class: -1, P: 1, I: 1, Z: 1, U: 1, black: 1, X: 0, AP: 0, N: 0, A: 0 };
/** How far below the yardarm a flag flies: A under AP or N on the same halyard ("AP over A"). */
const LOW: Partial<Record<Flag, number>> = { A: 1.1 };
const ALL: Flag[] = ['class', 'P', 'I', 'Z', 'U', 'black', 'X', 'AP', 'N', 'A'];

export class SignalMast {
  readonly group = new THREE.Group();
  private flags = new Map<Flag, { mesh: THREE.Mesh<THREE.PlaneGeometry>; base: Float32Array; y: number }>();
  private yard: number;
  private size: number;
  private course: { mesh: THREE.Mesh<THREE.PlaneGeometry>; base: Float32Array }[] = [];

  /** `poleH`: height of the yardarm above the base; `pole`: draw a pole (false when mounting on an existing one). */
  constructor(poleH: number, pole: boolean, size = 1.2) {
    this.yard = poleH; this.size = size;
    const mat = new THREE.MeshLambertMaterial({ color: 0xf2f2ee });
    if (pole) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, poleH + 1, 8), mat); m.position.y = (poleH + 1) / 2; this.group.add(m); }
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6), mat); yard.rotation.z = Math.PI / 2; yard.position.y = poleH; this.group.add(yard);
    for (const f of ALL) {
      const geo = new THREE.PlaneGeometry(size * 1.5, size, 8, 2); geo.translate(size * 0.75, -size / 2, 0); // hoisted at its top-left corner
      const tex = new THREE.CanvasTexture(flagCanvas(f));
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
      mesh.visible = false; this.group.add(mesh);
      this.flags.set(f, { mesh, base: (geo.attributes.position.array as Float32Array).slice(), y: 0 });
    }
  }

  /** The course number in numeral pennants, one above the other on the pole's own halyard (null: none). */
  setCourse(no: number | null): void {
    for (const p of this.course) { this.group.remove(p.mesh); p.mesh.geometry.dispose(); (p.mesh.material as THREE.Material).dispose(); }
    this.course = [];
    if (no == null) return;
    const len = this.size * 1.7, h = this.size * 0.85;
    [...String(no)].forEach((d, i) => {
      const geo = new THREE.PlaneGeometry(len, h, 8, 2); geo.translate(len / 2, -h / 2, 0);
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(pennantCanvas(d)), side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }));
      mesh.position.set(0, this.yard - this.size * 1.3 - i * (h + 0.12), 0); // below the yard (and the X flag's place)
      this.group.add(mesh);
      this.course.push({ mesh, base: (geo.attributes.position.array as Float32Array).slice() });
    });
  }

  /**
   * Hoist and lower to match `flying`, stream the flags downwind (wind from `windFrom`, deg; the group's heading
   * `heading` deg), and flutter them. `dt` in seconds, `t` for the flutter.
   */
  sync(flying: Flag[], windFrom: number, heading: number, t: number, dt: number): void {
    const toward = -(windFrom + 180 - heading) * Math.PI / 180;
    for (const [f, s] of this.flags) {
      const up = flying.includes(f), target = up ? this.yard - 0.05 - (LOW[f] ?? 0) * this.size : 0.3;
      s.y += (target - s.y) * Math.min(1, dt * (up ? 1.2 : 2)); // hauled up steadily, down a little quicker
      const m = s.mesh; m.visible = s.y > 0.5;
      if (!m.visible) continue;
      m.position.set(SLOT[f] * 1.4, s.y, 0);
      m.rotation.y = toward + Math.PI / 2; // the fly streams downwind
      const p = m.geometry.attributes.position as THREE.BufferAttribute, a = p.array as Float32Array;
      for (let i = 0; i < a.length; i += 3) { const x = s.base[i]; a[i + 2] = Math.sin(x * 3.2 - t * 9 + SLOT[f]) * 0.12 * x; }
      p.needsUpdate = true;
    }
    this.course.forEach(({ mesh, base }, i) => {
      mesh.rotation.y = toward + Math.PI / 2;
      const p = mesh.geometry.attributes.position as THREE.BufferAttribute, a = p.array as Float32Array;
      for (let k = 0; k < a.length; k += 3) { const x = base[k]; a[k + 2] = Math.sin(x * 3.6 - t * 10 + i) * 0.1 * x; }
      p.needsUpdate = true;
    });
  }
}
