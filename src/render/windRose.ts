import * as THREE from 'three';
import { P3 } from './coords';
import { D2R } from '../core/math';

/**
 * The points of sail and the wind on the water round your boat (the owner, 14 Nov 2026: "in-situ on-the-water points of
 * sail and wind direction, similar to the tack drills, so a new learner can easily understand where these points of sail
 * (and the wind) are relationally. also, that on-water marks would move around the boat as the wind shifts, helping user
 * understand the relativity"). Laid out from the TRUE wind where she is, both tacks: the no-go zone, a dashed ray between
 * each two points of sail and a chevron on each, her own point lit (--accent), a lesson's target teal (--target), and the
 * wind coming in from upwind. The rose itself is drawn in the water (scene.ts ROSE_FRAGMENT), so the waves carry it right
 * up to her hull; the names stand just above it, here. It turns with every shift, the marks swinging round her while her
 * heading stays put. The bands are the lesson's (sim/lessons.ts POINTS), close-hauled from her own beat angle.
 * (Design: design/learn-to-sail. Not on in the app yet: the owner's choices of size and names drop in as `opts`.)
 */
export interface RoseOpts {
  /** Inner and outer radii, and the radius of the marks (m). */
  r0: number; r1: number; rm: number;
  /** Which points are named: all of them, or only hers and the target ('key'). */
  labels: 'all' | 'key';
}
export const ROSE_DEFAULTS: RoseOpts = { r0: 9, r1: 26, rm: 19, labels: 'all' };
export const ROSE_POINTS = ['irons', 'close', 'closeReach', 'beam', 'broad', 'run'] as const;
export type RosePoint = typeof ROSE_POINTS[number];
const WORDS: Record<RosePoint, string> = { irons: 'No-go', close: 'Close-hauled', closeReach: 'Close reach', beam: 'Beam reach', broad: 'Broad reach', run: 'Run' };
/** The edges between the bands (TWA, °), the lesson's own: close-hauled from her beat angle. */
export const roseEdges = (beat: number): number[] => [beat - 3, beat + 8, 75, 105, 160];
/** What the water draws (scene.ts rose()). */
export interface RoseDecal { rose(r: { x: number; y: number; from: number; edges: number[]; r0: number; r1: number; rm: number; lit: number; side: number; target: number } | null): void }

const dir = (a: number) => ({ x: Math.sin(a * D2R), y: Math.cos(a * D2R) });
function label(t: string, color: string, big = false): THREE.Sprite {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 112;
  const x = cv.getContext('2d')!; x.font = `700 ${big ? 64 : 54}px "Saira Semi Condensed", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 12; x.strokeStyle = 'rgba(8,20,30,.7)'; x.strokeText(t, 256, 56); x.fillStyle = color; x.fillText(t, 256, 56);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
  sp.scale.set(big ? 7 : 5.6, big ? 1.55 : 1.23, 1); sp.renderOrder = 4;
  return sp;
}

export class WindRose {
  readonly group = new THREE.Group();
  private key = '';
  constructor(scene: THREE.Scene, private decal: RoseDecal, private opts: RoseOpts = ROSE_DEFAULTS) { scene.add(this.group); }
  /** Each frame: where she is (sim m), the true wind at her (from, °), her heading, her beat angle, the target (or null). */
  update(x: number, y: number, from: number, h: number, beat: number, target: RosePoint | null, on = true): void {
    this.group.visible = on;
    if (!on) { this.decal.rose(null); return; }
    const o = this.opts, edges = roseEdges(beat), rel = ((from - h + 540) % 360) - 180, twa = Math.abs(rel), side = rel >= 0 ? 1 : -1;
    const lit = [...edges, 181].findIndex(e => twa < e), tgt = target ? ROSE_POINTS.indexOf(target) : -1;
    this.decal.rose({ x, y, from, edges, r0: o.r0, r1: o.r1, rm: o.rm, lit, side, target: tgt });
    this.group.position.copy(P3(x, y, 0));
    // the names: rebuilt only when the wind's turned a degree, or her point or the target has changed
    const k = `${Math.round(from)}|${Math.round(beat)}|${lit}|${side}|${tgt}`; if (k === this.key) return; this.key = k;
    for (const c of [...this.group.children]) { this.group.remove(c); ((c as THREE.Sprite).material as THREE.SpriteMaterial).map?.dispose(); }
    const put = (sp: THREE.Sprite, a: number, r: number) => { const d = dir(a); sp.position.copy(P3(d.x * r, d.y * r, 1.6)); this.group.add(sp); };
    ROSE_POINTS.forEach((p, i) => {
      const isLit = i === lit, isTgt = i === tgt;
      if (o.labels === 'key' && !isLit && !isTgt) return;
      const lo = i === 0 ? 0 : edges[i - 1], hi = i < 5 ? edges[i] : 180, mid = (lo + hi) / 2, color = isTgt ? '#3ad1c1' : isLit ? '#ffd08a' : p === 'irons' ? '#ff9b8f' : '#eef4f7';
      if (p === 'irons') { put(label(WORDS[p], color), from, (o.r0 + o.r1) / 2); return; }
      if (p === 'run') { put(label(WORDS[p], color), from + 180, o.rm); return; }
      for (const s of [-1, 1]) if (o.labels === 'all' || (isLit && s === side) || isTgt) put(label(WORDS[p], color), from - s * mid, o.rm + 4); // (s +1: the starboard side, from − twa)
    });
    put(label('WIND', '#ffd84a', true), from, o.r1 + 21);
  }
  dispose(): void { this.decal.rose(null); this.group.removeFromParent(); }
}
