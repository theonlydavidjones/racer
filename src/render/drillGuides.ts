import * as THREE from 'three';
import { P3 } from './coords';
import { D2R, ZONE } from '../core/math';

/**
 * MOCK-UP (design/drill-redo, dev server only): the drills' on-water guides and the one-or-two-word cue beside the boat,
 * for the owner to judge before anything is built (ROADMAP Training tools 3; the owner on #218: "contextual cues ...
 * on-water tracks ... doesn't feel different from regular cruise mode"; on the rounding drill: "a mark in front of me,
 * or a marked pathway on the water"). Drawn from the sim's own numbers by the capture script (beat angle, the sim
 * crew's turn rate), not hand-placed. Nothing here is wired to the drill trackers yet.
 */
export interface GuideSpec {
  /** The lane to sail (water polylines, sim metres), its half-width (m). */
  lane?: { pts: { x: number; y: number }[]; half: number }[];
  /** Where to start the turn: a bar across the lane, and its rep number. */
  gate?: { p: { x: number; y: number }; h: number; half: number; n?: number };
  /** The good crew's turn (white) and hers (amber), as drawn after the rep. */
  ideal?: { x: number; y: number }[];
  wake?: { x: number; y: number }[];
  /** The target heading after the turn: chevrons on the water along it. */
  target?: { p: { x: number; y: number }; h: number };
  /** Rounding: the mark and its zone, the path round (wide in, close out), and the exit course. */
  zone?: { x: number; y: number };
  exit?: { p: { x: number; y: number }; h: number; len: number };
  /** The cue beside the boat: the word(s), and a small second line (the rep, or the rep's short score). */
  cue?: { word: string; sub?: string; tone?: 'go' | 'hold' | 'done' };
}

const GOLD = 0xffd84a, WHITE = 0xffffff, AMBER = 0xff9a2e, CYAN = 0x6fe3ff;
const dir = (h: number) => ({ x: Math.sin(h * D2R), y: Math.cos(h * D2R) });

/** A flat ribbon on the water along a polyline (WebGL lines are a pixel wide: a ribbon reads from the chase camera). */
function ribbon(pts: { x: number; y: number }[], w: number, color: number, opacity: number, dash = 0): THREE.Mesh {
  const pos: number[] = [], idx: number[] = [];
  let along = 0, k = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L * w / 2, ny = dx / L * w / 2;
    const steps = dash ? Math.ceil(L / dash) : 1;
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps, t1 = (s + 1) / steps;
      if (dash && Math.floor((along + t0 * L) / dash) % 2) continue;
      const p0 = { x: a.x + dx * t0, y: a.y + dy * t0 }, p1 = { x: a.x + dx * t1, y: a.y + dy * t1 };
      for (const q of [P3(p0.x + nx, p0.y + ny, 0.35), P3(p0.x - nx, p0.y - ny, 0.35), P3(p1.x + nx, p1.y + ny, 0.35), P3(p1.x - nx, p1.y - ny, 0.35)]) pos.push(q.x, q.y, q.z);
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); k += 4;
    }
    along += L;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
}
/** Chevrons on the water pointing along `h`. */
function chevrons(p: { x: number; y: number }, h: number, n: number, color: number): THREE.Object3D[] {
  const out: THREE.Object3D[] = [], d = dir(h), r = dir(h + 90);
  for (let i = 0; i < n; i++) {
    const c = { x: p.x + d.x * i * 7, y: p.y + d.y * i * 7 };
    const tip = { x: c.x + d.x * 3, y: c.y + d.y * 3 }, l = { x: c.x - r.x * 3, y: c.y - r.y * 3 }, rr = { x: c.x + r.x * 3, y: c.y + r.y * 3 };
    out.push(ribbon([l, tip, rr], 0.9, color, 0.85 - i * 0.18));
  }
  return out;
}

export class DrillGuides {
  private objs: THREE.Object3D[] = [];
  private tag: HTMLDivElement;
  constructor(private scene: THREE.Scene, private camera: THREE.Camera, private where: () => { x: number; y: number }) {
    this.tag = document.createElement('div'); this.tag.className = 'dg-cue'; this.tag.hidden = true; document.body.appendChild(this.tag);
    const s = document.createElement('style');
    s.textContent = `.dg-cue{position:fixed;z-index:30;transform:translate(-50%,-100%);pointer-events:none;text-align:center;font:800 26px/1 var(--font, system-ui);letter-spacing:.06em;text-transform:uppercase;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.7)}
.dg-cue .w{display:inline-block;padding:6px 14px;border-radius:8px;background:rgba(12,20,30,.62);border:2px solid #ffd84a}
.dg-cue.go .w{background:#ffd84a;color:#14202c;text-shadow:none}.dg-cue.done .w{border-color:#6fe3ff}
.dg-cue .s{margin-top:6px;font:700 13px/1.2 var(--font, system-ui);letter-spacing:.04em;text-transform:none;color:#e8eef4}`;
    document.head.appendChild(s);
    const loop = () => { this.place(); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  }
  set(g: GuideSpec | null): void {
    this.objs.forEach(o => this.scene.remove(o)); this.objs = [];
    const add = (o: THREE.Object3D) => { this.scene.add(o); this.objs.push(o); };
    if (!g) { this.tag.hidden = true; return; }
    for (const L of g.lane ?? []) {
      add(ribbon(L.pts, L.half * 2, GOLD, 0.10)); // (the lane itself, faint)
      for (const s of [-1, 1]) { // (its edges, dashed)
        const e = L.pts.map((p, i) => { const q = L.pts[Math.min(i + 1, L.pts.length - 1)], o = L.pts[Math.max(i - 1, 0)], dx = q.x - o.x, dy = q.y - o.y, n = Math.hypot(dx, dy) || 1; return { x: p.x - dy / n * L.half * s, y: p.y + dx / n * L.half * s }; });
        add(ribbon(e, 0.5, GOLD, 0.75, 4));
      }
    }
    if (g.gate) { const r = dir(g.gate.h + 90), p = g.gate.p; add(ribbon([{ x: p.x - r.x * g.gate.half, y: p.y - r.y * g.gate.half }, { x: p.x + r.x * g.gate.half, y: p.y + r.y * g.gate.half }], 1.4, GOLD, 0.95)); }
    if (g.ideal) add(ribbon(g.ideal, 0.8, WHITE, 0.85));
    if (g.wake) add(ribbon(g.wake, 0.8, AMBER, 0.95));
    if (g.target) chevrons(g.target.p, g.target.h, 3, CYAN).forEach(add);
    if (g.zone) { const ring = new THREE.Mesh(new THREE.RingGeometry(ZONE - 0.35, ZONE + 0.35, 96), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.copy(P3(g.zone.x, g.zone.y, 0.35)); add(ring); }
    if (g.exit) { const d = dir(g.exit.h), p = g.exit.p; add(ribbon([p, { x: p.x + d.x * g.exit.len, y: p.y + d.y * g.exit.len }], 0.6, CYAN, 0.8, 4)); chevrons({ x: p.x + d.x * (g.exit.len - 14), y: p.y + d.y * (g.exit.len - 14) }, g.exit.h, 2, CYAN).forEach(add); }
    if (g.cue) {
      this.tag.className = 'dg-cue' + (g.cue.tone ? ' ' + g.cue.tone : '');
      this.tag.innerHTML = `<div class="w"></div>${g.cue.sub ? '<div class="s"></div>' : ''}`;
      (this.tag.querySelector('.w') as HTMLElement).textContent = g.cue.word;
      if (g.cue.sub) (this.tag.querySelector('.s') as HTMLElement).textContent = g.cue.sub;
      this.tag.hidden = false;
    } else this.tag.hidden = true;
  }
  /** The cue rides above her masthead, beside where you're already looking. */
  private place(): void {
    if (this.tag.hidden) return;
    const b = this.where(), v = P3(b.x, b.y, 11.5).project(this.camera);
    this.tag.style.left = `${(v.x + 1) / 2 * innerWidth }px`; this.tag.style.top = `${(1 - v.y) / 2 * innerHeight}px`;
  }
}
