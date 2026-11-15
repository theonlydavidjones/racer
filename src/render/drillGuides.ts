import * as THREE from 'three';
import { P3 } from './coords';
import { D2R, ZONE } from '../core/math';

/**
 * The drills' guides on the water and the cue beside the boat (ROADMAP Training tools 3; the owner on #218: "the coach
 * info is too far away from the boat ... too much copy to read in the moment. I need contextual cues ... maybe even some
 * on-water tracks"; on the rounding drill: "a mark in front of me, or a marked pathway on the water"; the mock-up,
 * design/drill-redo, approved: "drill looks good"). What to draw comes from app/drillCoach.ts, worked out from the sim's
 * own numbers (her beat angle, the sim crew's turn); this file only draws it:
 * - a lane on the water (faint, with dashed edges) and a bar across it where to turn;
 * - a good crew's turn (white) and her own wake (amber), compared after each rep;
 * - chevrons along the course to steer after the turn, the three-length zone and the exit course at a mark;
 * - a word or two above her masthead: the cue, and a small line under it (the rep, or its short score).
 */
export interface Pt { x: number; y: number }
export interface GuideSpec {
  /** The lane to sail (water polylines, sim metres) and its half-width (m). */
  lane?: { pts: Pt[]; half: number }[];
  /** Where to start the turn: a bar across the lane. */
  gate?: { p: Pt; h: number; half: number; hint?: string };
  /** A good crew's turn (white). */
  ideal?: Pt[];
  /** The favored-end read (8za): from her, her bow's line (amber) and the line's square (white, dashed), the arc between
   *  them and its degrees; the bow leans toward the favored end. */
  read?: { o: Pt; bow: number; sq: number };
  /** Gold arrowheads along the lane toward its end (the start: the approach, pointing at the line). */
  arrows?: { p: Pt; h: number; n: number };
  /** The course to steer after the turn: chevrons on the water along it. */
  target?: { p: Pt; h: number };
  /** Rounding: the mark's zone, drawn bright; the exit course (dashed, with chevrons). */
  zone?: Pt;
  exit?: { p: Pt; h: number; len: number };
}
export interface Cue { word: string; sub?: string; tone?: 'go' | 'done' }

const GOLD = 0xffd84a, WHITE = 0xffffff, AMBER = 0xff9a2e, CYAN = 0x6fe3ff;
const dir = (h: number) => ({ x: Math.sin(h * D2R), y: Math.cos(h * D2R) });

/** A flat ribbon on the water along a polyline (WebGL lines are a pixel wide: a ribbon reads from the chase camera),
 * dashed every `dash` m if given. */
function ribbon(pts: Pt[], w: number, color: number, opacity: number, dash = 0): THREE.Mesh {
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
function chevrons(p: Pt, h: number, n: number, color: number): THREE.Object3D[] {
  const out: THREE.Object3D[] = [], d = dir(h), r = dir(h + 90);
  for (let i = 0; i < n; i++) {
    const c = { x: p.x + d.x * i * 7, y: p.y + d.y * i * 7 };
    const tip = { x: c.x + d.x * 3, y: c.y + d.y * 3 }, l = { x: c.x - r.x * 3, y: c.y - r.y * 3 }, rr = { x: c.x + r.x * 3, y: c.y + r.y * 3 };
    out.push(ribbon([l, tip, rr], 0.9, color, 0.85 - i * 0.18));
  }
  return out;
}
const free = (o: THREE.Object3D) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose(); };

export class DrillGuides {
  private objs: THREE.Object3D[] = [];
  private wakeObj: THREE.Object3D | null = null;
  private key = '';
  private wakeN = -1;
  private cueKey = '';
  private readonly tag: HTMLDivElement;
  private readonly hit: HTMLDivElement;
  private gateAt: Pt | null = null;
  private readAt: { p: Pt; txt: string } | null = null;
  private readonly readTag: HTMLDivElement;
  constructor(private scene: THREE.Scene, private camera: THREE.Camera) {
    this.tag = document.createElement('div'); this.tag.className = 'dg-cue'; this.tag.hidden = true; this.tag.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.tag);
    // (the gate's hover: a small invisible patch over it on the screen, its line the gate's hint)
    this.hit = document.createElement('div'); this.hit.className = 'dg-hit'; this.hit.hidden = true; document.body.appendChild(this.hit);
    this.readTag = document.createElement('div'); this.readTag.className = 'dg-read'; this.readTag.hidden = true; document.body.appendChild(this.readTag);
  }
  /** The guides on the water: rebuilt only when `key` changes (they're fixed for a rep). */
  set(g: GuideSpec | null, key: string): void {
    if (key === this.key) return; this.key = key;
    this.objs.forEach(o => { this.scene.remove(o); free(o); }); this.objs = [];
    if (!g) { this.gateAt = null; this.hit.hidden = true; this.readAt = null; this.readTag.hidden = true; return; }
    const add = (o: THREE.Object3D) => { this.scene.add(o); this.objs.push(o); };
    for (const L of g.lane ?? []) {
      add(ribbon(L.pts, L.half * 2, GOLD, 0.10)); // (the lane itself, faint)
      for (const s of [-1, 1]) { // (its edges, dashed)
        const e = L.pts.map((p, i) => { const q = L.pts[Math.min(i + 1, L.pts.length - 1)], o = L.pts[Math.max(i - 1, 0)], dx = q.x - o.x, dy = q.y - o.y, n = Math.hypot(dx, dy) || 1; return { x: p.x - dy / n * L.half * s, y: p.y + dx / n * L.half * s }; });
        add(ribbon(e, 0.5, GOLD, 0.75, 4));
      }
    }
    this.gateAt = g.gate?.hint ? g.gate.p : null; this.hit.title = g.gate?.hint ?? '';
    if (g.gate) { const r = dir(g.gate.h + 90), p = g.gate.p; add(ribbon([{ x: p.x - r.x * g.gate.half, y: p.y - r.y * g.gate.half }, { x: p.x + r.x * g.gate.half, y: p.y + r.y * g.gate.half }], 1.4, GOLD, 0.95)); }
    if (g.ideal && g.ideal.length > 1) add(ribbon(g.ideal, 0.8, WHITE, 0.85));
    if (g.arrows) chevrons(g.arrows.p, g.arrows.h, g.arrows.n, GOLD).forEach(add);
    this.readAt = null;
    if (g.read) {
      const { o, bow, sq } = g.read, R = 90, off = ((bow - sq + 540) % 360) - 180, at = (h: number, r: number) => { const q = dir(h); return { x: o.x + q.x * r, y: o.y + q.y * r }; };
      add(ribbon([o, at(sq, R)], 0.9, WHITE, 0.85, 4));
      add(ribbon([o, at(bow, R)], 1.1, AMBER, 0.95));
      if (Math.abs(off) >= 1) add(ribbon(Array.from({ length: 13 }, (_, i) => at(sq + off * i / 12, R * 0.65)), 0.7, AMBER, 0.9));
      this.readAt = { p: at(sq + off / 2, R * 0.8), txt: `${Math.round(Math.abs(off))}°` };
    }
    if (g.target) chevrons(g.target.p, g.target.h, 3, CYAN).forEach(add);
    if (g.zone) { const ring = new THREE.Mesh(new THREE.RingGeometry(ZONE - 0.35, ZONE + 0.35, 96), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.copy(P3(g.zone.x, g.zone.y, 0.35)); add(ring); }
    if (g.exit) { const d = dir(g.exit.h), p = g.exit.p; add(ribbon([p, { x: p.x + d.x * g.exit.len, y: p.y + d.y * g.exit.len }], 0.6, CYAN, 0.8, 4)); chevrons({ x: p.x + d.x * (g.exit.len - 14), y: p.y + d.y * (g.exit.len - 14) }, g.exit.h, 2, CYAN).forEach(add); }
  }
  /** Her wake (amber) through the turn, redrawn as it grows. */
  wake(pts: Pt[] | null): void {
    const n = pts && pts.length > 1 ? pts.length : 0; if (n === this.wakeN) return; this.wakeN = n;
    if (this.wakeObj) { this.scene.remove(this.wakeObj); free(this.wakeObj); this.wakeObj = null; }
    if (n) { this.wakeObj = ribbon(pts!, 0.8, AMBER, 0.95); this.scene.add(this.wakeObj); }
  }
  /** The word or two above her masthead (null: none). */
  cue(c: Cue | null): void {
    const key = c ? `${c.word}|${c.sub ?? ''}|${c.tone ?? ''}` : '';
    if (key === this.cueKey) return; this.cueKey = key;
    this.tag.hidden = !c; if (!c) return;
    this.tag.className = 'dg-cue' + (c.tone ? ' ' + c.tone : '');
    this.tag.replaceChildren();
    const w = document.createElement('div'); w.className = 'w'; w.textContent = c.word; this.tag.appendChild(w);
    if (c.sub) { const s = document.createElement('div'); s.className = 's'; s.textContent = c.sub; this.tag.appendChild(s); }
  }
  /** Each frame: the cue rides above her masthead (11.5 m up), beside where you're already looking, but always whole on
   *  the screen: below the dials' row, above the sail band, clear of the sides (the owner, 15 Nov 2026: it "keeps floating
   *  out of view" in the start practice, up under the top bar), and eased toward where it's going so the boat's pitch and
   *  the camera's sway don't shake it. */
  place(at: Pt | null): void {
    if (this.readAt) { const g = P3(this.readAt.p.x, this.readAt.p.y, 0.4).project(this.camera), on = g.z <= 1 && Math.abs(g.x) < 1 && Math.abs(g.y) < 1;
      this.readTag.hidden = !on; if (on) { this.readTag.style.left = `${Math.round((g.x + 1) / 2 * innerWidth)}px`; this.readTag.style.top = `${Math.round((1 - g.y) / 2 * innerHeight)}px`; if (this.readTag.textContent !== this.readAt.txt) this.readTag.textContent = this.readAt.txt; } }
    else if (!this.readTag.hidden) this.readTag.hidden = true;
    if (this.gateAt) { const g = P3(this.gateAt.x, this.gateAt.y, 0.4).project(this.camera), on = g.z <= 1 && Math.abs(g.x) < 1 && Math.abs(g.y) < 1;
      this.hit.hidden = !on; if (on) { this.hit.style.left = `${Math.round((g.x + 1) / 2 * innerWidth)}px`; this.hit.style.top = `${Math.round((1 - g.y) / 2 * innerHeight)}px`; } }
    if (this.tag.hidden || !at) return;
    const v = P3(at.x, at.y, 11.5).project(this.camera);
    if (v.z > 1) { this.tag.style.visibility = 'hidden'; this.held = null; return; } // (behind the camera)
    const W = innerWidth, H = innerHeight, cw = this.tag.offsetWidth, ch = this.tag.offsetHeight, now = performance.now();
    if (now - this.edgeT > 1000) { // (the dials' row and the band, measured again each second: they come and go with views)
      this.edgeT = now;
      const box = (q: string) => { const r = document.querySelector(q)?.getBoundingClientRect(); return r && r.height > 0 ? r : null; }; // (fixed: no offsetParent)
      this.edgeTop = Math.max(box('#hud')?.bottom ?? 0, box('#hudRight')?.bottom ?? 0) + 10;
      this.edgeBot = Math.min(box('.sailband')?.top ?? H, H) - 10;
      this.sides = ['#leftCol', '#map', '#trimPanel', '#msgLog'].map(box).filter((r): r is DOMRect => !!r);
    }
    // (the tag hangs from its point: translate(-50%, -100%), so x is its middle and y its foot)
    let x = Math.min(Math.max((v.x + 1) / 2 * W, cw / 2 + 16), W - cw / 2 - 16);
    const y = Math.min(Math.max((1 - v.y) / 2 * H, this.edgeTop + ch), Math.max(this.edgeTop + ch, this.edgeBot));
    // (and off the panels down the sides, the start line's card, the flags, the inset map: slid toward the middle past them)
    for (const r of this.sides) if (y > r.top && y - ch < r.bottom && x + cw / 2 > r.left && x - cw / 2 < r.right)
      x = r.left + r.width / 2 < W / 2 ? r.right + cw / 2 + 10 : r.left - cw / 2 - 10;
    const k = this.held ? 1 - Math.exp(-(now - this.held.t) / 120) : 1; // (eased over ~0.1 s)
    const p = this.held ? { x: this.held.x + (x - this.held.x) * k, y: this.held.y + (y - this.held.y) * k } : { x, y };
    this.held = { ...p, t: now };
    this.tag.style.visibility = ''; this.tag.style.left = `${Math.round(p.x)}px`; this.tag.style.top = `${Math.round(p.y)}px`;
  }
  private held: { x: number; y: number; t: number } | null = null;
  private edgeT = -1e9; private edgeTop = 0; private edgeBot = 0; private sides: DOMRect[] = [];
  clear(): void { this.set(null, ''); this.wake(null); this.cue(null); }
}
