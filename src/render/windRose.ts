import * as THREE from 'three';
import { P3 } from './coords';
import { D2R } from '../core/math';

/**
 * The points of sail drawn on the water round your boat (the owner, 14 Nov 2026: "in-situ wind indication … showing on
 * the water where the wind is and the points of sail … if it could move with a wind shift to help teach the relativity of
 * it all"). A ring of sectors laid out from the TRUE wind where she is, both tacks: in irons (no-go), close-hauled, close
 * reach, beam reach, broad reach and run; the sector her heading is in lit, a lesson's target teal. It turns with every
 * shift, so the sectors swing while she holds her course. Faint and flat on the water, as the drill's guides are
 * (render/drillGuides.ts). The bands are the lesson's (sim/lessons.ts POINTS), close-hauled from her own beat angle.
 */
export interface RosePoint { key: string; word: string; lo: number; hi: number }
const TEAL = 0x3ad1c1, WHITE = 0xffffff, RED = 0xc8463a, AMBER = 0xffb627;
const R0 = 6, R1 = 18; // (m: just clear of her hull, out to about two and a half lengths)

/** The sectors for a beat angle `beat` (°, true): the lesson's own bands. */
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

/** A flat annulus sector on the water, headings a0..a1 (compass, °) round (0, 0), sim metres. */
function sector(a0: number, a1: number, r0: number, r1: number, color: number, opacity: number): THREE.Mesh {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 3)), pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * i / n) * D2R, s = Math.sin(a), c = Math.cos(a);
    for (const r of [r0, r1]) { const q = P3(s * r, c * r, 0.5); pos.push(q.x, q.y, q.z); }
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  // (pulled toward the eye in depth: the waves are raised in the water's own shader, so a flat sheet near the mean level
  // is under them close by. A prototype: built, the rose is drawn in the water's own shader, as the waves are)
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -40, polygonOffsetUnits: -40 }));
  m.renderOrder = 3; return m; // (after the water, which is see-through too: else it's drawn over her near the boat)
}
/** A word lying on the water at heading a, radius r, read from her (its top away from her). */
function word(t: string, a: number, r: number, color: string): THREE.Mesh {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
  const x = cv.getContext('2d')!; x.font = '700 52px "Saira Semi Condensed", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 10; x.strokeStyle = 'rgba(8,20,30,.55)'; x.strokeText(t, 256, 48); x.fillStyle = color; x.fillText(t, 256, 48);
  const tex = new THREE.CanvasTexture(cv), m = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.33), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  const s = Math.sin(a * D2R), c = Math.cos(a * D2R); m.position.copy(P3(s * r, c * r, 1.45));
  m.rotation.x = -Math.PI / 2; m.rotation.z = -a * D2R; m.renderOrder = 4; // (flat, its top pointing out along a)
  return m;
}

export class WindRose {
  readonly group = new THREE.Group();
  private key = '';
  constructor(scene: THREE.Scene) { scene.add(this.group); this.group.renderOrder = 2; }
  /** Each frame: where she is, the true wind at her (from, °), her heading, her beat angle, and the lesson's target key. */
  update(x: number, y: number, from: number, h: number, beat: number, target: string | null, on = true): void {
    this.group.visible = on; if (!on) return;
    this.group.position.copy(P3(x, y, 0));
    const pts = rosePoints(beat), twa = Math.abs(((from - h + 540) % 360) - 180), now = pts.find(p => twa >= p.lo && twa < p.hi + 1e-9)?.key ?? 'run';
    const k = `${from.toFixed(1)}|${beat.toFixed(1)}|${now}|${target}`; if (k === this.key) return; this.key = k;
    for (const c of [...this.group.children]) { this.group.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
    for (const p of pts) for (const side of [-1, 1]) {
      // (headings: from − twa on starboard, from + twa on port; the run and in irons meet across the wind's line)
      const a0 = from + side * p.lo, a1 = from + side * p.hi, mid = from + side * (p.lo + p.hi) / 2;
      const lit = p.key === now, tgt = p.key === target;
      const color = tgt ? TEAL : p.key === 'irons' ? RED : lit ? AMBER : WHITE, op = tgt ? 0.55 : p.key === 'irons' ? 0.3 : lit ? 0.5 : 0.14;
      if (tgt || lit || p.key === 'irons') this.group.add(sector(Math.min(a0, a1), Math.max(a0, a1), R0, R1, color, op)); // (the others only their lines: the water shows through)
      this.group.add(sector(a0 - 0.5, a0 + 0.5, R0, R1, WHITE, 0.5)); // (the line between two points)
      if ((lit || tgt) && p.key !== 'irons') this.group.add(word(p.word, mid, R1 + 3, tgt ? '#3ad1c1' : '#ffd08a'));
    }
    // the wind itself: chevrons coming in from upwind, beyond the rose, pointing at her
    for (let i = 0; i < 3; i++) { const r = R1 + 4 + i * 3.5, a = from; this.group.add(sector(a - 4, a + 4, r, r + 1.6, WHITE, 0.5 - i * 0.12)); }
    this.group.add(word('WIND', from, R1 + 16, '#e9f2f5'));
  }
}
