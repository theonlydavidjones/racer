import * as THREE from 'three';
import { P3 } from './coords';
import { D2R } from '../core/math';

/**
 * The points of sail and the wind, drawn on the water round your boat, in the drill guides' style (render/drillGuides.ts)
 * (the owner, 14 Nov 2026: "in-situ on-the-water points of sail and wind direction, similar to the tack drills, so a new
 * learner can easily understand where these points of sail (and the wind) are relationally. also, that on-water marks
 * would move around the boat as the wind shifts, helping user understand the relativity"). Laid out from the TRUE wind
 * where she is, both tacks:
 * - the wind: chevrons coming in from where it blows from, and WIND;
 * - the no-go zone (in irons), a faint red wedge;
 * - a dashed white ray between each two points, and on each point a chevron pointing the way she'd sail, named
 *   (close-hauled, close reach, beam reach, broad reach, run);
 * - her own point lit amber (--accent), a lesson's target teal (--target).
 * It turns with every shift, the marks swinging round her while her heading stays put. The bands are the lesson's
 * (sim/lessons.ts POINTS), close-hauled from her own beat angle.
 */
export interface RosePoint { key: string; word: string; lo: number; hi: number }
const TEAL = 0x3ad1c1, WHITE = 0xffffff, RED = 0xc8463a, AMBER = 0xffb627, GOLD = 0xffd84a;
const R0 = 16, R1 = 40, RM = 30; // (m: two lengths clear of her, out to about five; the marks between)

export function rosePoints(beat: number): RosePoint[] {
  return [
    { key: 'irons', word: 'In irons', lo: 0, hi: beat - 3 },
    { key: 'close', word: 'Close-hauled', lo: beat - 3, hi: beat + 8 },
    { key: 'closeReach', word: 'Close reach', lo: beat + 8, hi: 75 },
    { key: 'beam', word: 'Beam reach', lo: 75, hi: 105 },
    { key: 'broad', word: 'Broad reach', lo: 105, hi: 160 },
    { key: 'run', word: 'Run', lo: 160, hi: 180 }
  ];
}

const dir = (a: number) => ({ x: Math.sin(a * D2R), y: Math.cos(a * D2R) });
const Z = 0.5; // (just above the water's mean level, pulled toward the eye in depth below: the waves rise in the water's shader)
function mat(color: number, opacity: number) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -40, polygonOffsetUnits: -40 });
}
function mesh(pos: number[], idx: number[], m: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const o = new THREE.Mesh(g, m); o.renderOrder = 3; return o;
}
/** A flat sector, headings a0..a1, radii r0..r1. */
function sector(a0: number, a1: number, r0: number, r1: number, color: number, opacity: number): THREE.Mesh {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 3)), pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const d = dir(a0 + (a1 - a0) * i / n);
    for (const r of [r0, r1]) { const q = P3(d.x * r, d.y * r, Z); pos.push(q.x, q.y, q.z); }
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  return mesh(pos, idx, mat(color, opacity));
}
/** A dashed ray along heading a from r0 to r1, w wide (the drill's lane edges). */
function ray(a: number, r0: number, r1: number, w: number, color: number, opacity: number): THREE.Mesh {
  const d = dir(a), n = { x: -d.y * w / 2, y: d.x * w / 2 }, pos: number[] = [], idx: number[] = [];
  let k = 0;
  for (let r = r0; r < r1; r += 3) {
    const e = Math.min(r + 1.8, r1);
    for (const [rr, s] of [[r, 1], [r, -1], [e, 1], [e, -1]]) { const q = P3(d.x * rr + n.x * s, d.y * rr + n.y * s, Z); pos.push(q.x, q.y, q.z); }
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); k += 4;
  }
  return mesh(pos, idx, mat(color, opacity));
}
/** A chevron on the water at radius r on heading a, pointing along `toward` (the drill's chevrons). */
function chevron(a: number, r: number, toward: number, size: number, color: number, opacity: number): THREE.Mesh {
  const c = dir(a), f = dir(toward), s = dir(toward + 90), p = { x: c.x * r, y: c.y * r }, pos: number[] = [], th = size * 0.35;
  // two arms, each a thin quad: from the tip back to either side
  const tip = { x: p.x + f.x * size, y: p.y + f.y * size };
  for (const side of [1, -1]) {
    const back = { x: p.x + s.x * size * side, y: p.y + s.y * size * side }, ax = tip.x - back.x, ay = tip.y - back.y, L = Math.hypot(ax, ay), nx = -ay / L * th / 2, ny = ax / L * th / 2;
    for (const q of [[tip.x + nx, tip.y + ny], [tip.x - nx, tip.y - ny], [back.x + nx, back.y + ny], [back.x - nx, back.y - ny]]) { const v = P3(q[0], q[1], Z); pos.push(v.x, v.y, v.z); }
  }
  return mesh(pos, [0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6], mat(color, opacity));
}
/** A name, standing just above the water and facing you (the drill's cue is a word above her masthead). */
function label(t: string, a: number, r: number, color: string, big = false): THREE.Sprite {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 112;
  const x = cv.getContext('2d')!; x.font = `700 ${big ? 64 : 54}px "Saira Semi Condensed", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 12; x.strokeStyle = 'rgba(8,20,30,.7)'; x.strokeText(t, 256, 56); x.fillStyle = color; x.fillText(t, 256, 56);
  // (the same size on the screen near or far: one near the camera would fill it)
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, sizeAttenuation: false }));
  const d = dir(a); sp.position.copy(P3(d.x * r, d.y * r, 1.6)); sp.scale.set(big ? 0.34 : 0.28, big ? 0.075 : 0.062, 1); sp.renderOrder = 4;
  return sp;
}

export class WindRose {
  readonly group = new THREE.Group();
  private key = '';
  constructor(scene: THREE.Scene) { scene.add(this.group); }
  /** Each frame: where she is, the true wind at her (from, °), her heading, her beat angle, the lesson's target key. */
  update(x: number, y: number, from: number, h: number, beat: number, target: string | null, on = true): void {
    this.group.visible = on; if (!on) return;
    this.group.position.copy(P3(x, y, 0));
    const pts = rosePoints(beat), twa = Math.abs(((from - h + 540) % 360) - 180), now = pts.find(p => twa >= p.lo && twa < p.hi + 1e-9)?.key ?? 'run';
    const mine = ((h - from + 540) % 360) - 180 >= 0 ? 1 : -1; // (her side of the wind: lit there only)
    const k = `${from.toFixed(1)}|${beat.toFixed(1)}|${now}|${mine}|${target}`; if (k === this.key) return; this.key = k;
    for (const c of [...this.group.children]) { this.group.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
    const add = (o: THREE.Object3D) => this.group.add(o);
    // the no-go: a faint red wedge either side of the wind
    add(sector(from - pts[0].hi, from + pts[0].hi, R0, R1, RED, 0.22));
    add(label('No-go', from, (R0 + R1) / 2, '#ff9b8f'));
    for (const p of pts.slice(1)) for (const side of [-1, 1]) {
      // (headings: from − twa on starboard, from + twa on port)
      const a0 = from + side * p.lo, a1 = from + side * p.hi, mid = from + side * (p.lo + p.hi) / 2, lit = p.key === now && side === mine, tgt = p.key === target;
      if (lit || tgt) add(sector(Math.min(a0, a1), Math.max(a0, a1), R0, R1, tgt ? TEAL : AMBER, tgt ? 0.32 : 0.26));
      add(ray(a0, R0, R1, 0.5, WHITE, 0.6)); // (the line between this point and the one above it)
      const c = tgt ? TEAL : lit ? AMBER : WHITE;
      add(chevron(mid, RM, mid, 2.4, c, tgt || lit ? 0.95 : 0.7)); // (pointing the way she'd sail on it)
      if (p.key !== 'run' || side === 1) add(label(p.word, p.key === 'run' ? from + 180 : mid, RM + (p.key === 'run' ? 0 : 5), tgt ? '#3ad1c1' : lit ? '#ffd08a' : '#eef4f7'));
    }
    // the wind: chevrons coming in from where it blows from, pointing at her
    for (let i = 0; i < 3; i++) add(chevron(from, R1 + 5 + i * 5, from + 180, 3, GOLD, 0.9 - i * 0.2));
    add(label('WIND', from, R1 + 22, '#ffd84a', true));
  }
}
