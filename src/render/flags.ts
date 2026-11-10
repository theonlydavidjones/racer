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
    case 'class': fill('#fff'); g.fillStyle = BLUE; g.font = 'bold 66px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('F', W / 2, H / 2 + 3); break;
  }
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);
  cache.set(f, c);
  return c;
}

/** Which halyard each flag flies from: class flag to port, preparatory flags to starboard, X in the middle. */
const SLOT: Record<Flag, number> = { class: -1, P: 1, I: 1, Z: 1, U: 1, black: 1, X: 0 };
const ALL: Flag[] = ['class', 'P', 'I', 'Z', 'U', 'black', 'X'];

export class SignalMast {
  readonly group = new THREE.Group();
  private flags = new Map<Flag, { mesh: THREE.Mesh<THREE.PlaneGeometry>; base: Float32Array; y: number }>();
  private yard: number;

  /** `poleH`: height of the yardarm above the base; `pole`: draw a pole (false when mounting on an existing one). */
  constructor(poleH: number, pole: boolean, size = 1.2) {
    this.yard = poleH;
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

  /**
   * Hoist and lower to match `flying`, stream the flags downwind (wind from `windFrom`, deg; the group's heading
   * `heading` deg), and flutter them. `dt` in seconds, `t` for the flutter.
   */
  sync(flying: Flag[], windFrom: number, heading: number, t: number, dt: number): void {
    const toward = -(windFrom + 180 - heading) * Math.PI / 180;
    for (const [f, s] of this.flags) {
      const up = flying.includes(f), target = up ? this.yard - 0.05 : 0.3;
      s.y += (target - s.y) * Math.min(1, dt * (up ? 1.2 : 2)); // hauled up steadily, down a little quicker
      const m = s.mesh; m.visible = s.y > 0.5;
      if (!m.visible) continue;
      m.position.set(SLOT[f] * 1.4, s.y, 0);
      m.rotation.y = toward + Math.PI / 2; // the fly streams downwind
      const p = m.geometry.attributes.position as THREE.BufferAttribute, a = p.array as Float32Array;
      for (let i = 0; i < a.length; i += 3) { const x = s.base[i]; a[i + 2] = Math.sin(x * 3.2 - t * 9 + SLOT[f]) * 0.12 * x; }
      p.needsUpdate = true;
    }
  }
}
