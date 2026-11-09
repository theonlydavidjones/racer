import './three-setup';
import * as THREE from 'three';
import type { SailTrim } from '../boat/trim';

/**
 * A sail as a live surface: camber, twist toward the head, a luff bubble when it's under-trimmed, and
 * flogging when it's let right out. Coordinates are the sail's own frame (x = sideways, + to leeward
 * before the mesh is mirrored to the right side; y up; z aft along the foot).
 */
export interface SailDef {
  tack: THREE.Vector3; head: THREE.Vector3; clew: THREE.Vector3;
  depth: number; // camber at mid height, m
  rows: number; cols: number;
  window?: { t0: number; t1: number; s0: number; s1: number }; // clear window (height and chord fractions)
  battens?: { t: number; len: number }[]; // height fraction and length (m) in from the leech
}

export interface SailShape {
  twist: number; // deg the head turns to leeward relative to the foot
  bubble: number; // 0..1 luff bubble (front of the sail backing as it starts to luff)
  flog: number; // 0..1 the whole sail flogging
  time: number; // s, for the flapping
}

const tmp = new THREE.Vector3();

export class Sail {
  readonly mesh: THREE.Mesh;
  readonly geom = new THREE.BufferGeometry();
  readonly battens: THREE.LineSegments | null = null;
  readonly telltales: Telltale[] = [];
  private pos: Float32Array;

  private tVals: number[];
  private sVals: number[];

  constructor(readonly def: SailDef, sailMat: THREE.Material, windowMat: THREE.Material | null) {
    // grid lines: evenly spaced, plus the window's edges so its corners come out square
    const grid = (n: number, extra: number[]) => [...new Set([...Array(n + 1).keys()].map(i => i / n).concat(extra))].sort((a, b) => a - b);
    const w = def.window;
    this.tVals = grid(def.rows, w ? [w.t0, w.t1] : []);
    this.sVals = grid(def.cols, w ? [w.s0, w.s1] : []);
    const R = this.tVals.length - 1, C = this.sVals.length - 1;
    this.pos = new Float32Array((R + 1) * (C + 1) * 3);
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    // two index groups: sailcloth, then the window cells
    const cloth: number[] = [], win: number[] = [];
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
      const a = i * (C + 1) + j, b = a + 1, c = a + C + 1, d = c + 1;
      const t = (this.tVals[i] + this.tVals[i + 1]) / 2, sm = (this.sVals[j] + this.sVals[j + 1]) / 2;
      const inWin = !!w && t > w.t0 && t < w.t1 && sm > w.s0 && sm < w.s1;
      (inWin ? win : cloth).push(a, c, b, b, c, d);
    }
    this.geom.setIndex(cloth.concat(win));
    this.geom.addGroup(0, cloth.length, 0);
    if (win.length) this.geom.addGroup(cloth.length, win.length, 1);
    this.mesh = new THREE.Mesh(this.geom, windowMat ? [sailMat, windowMat] : [sailMat]);
    this.mesh.frustumCulled = false;
    if (def.battens?.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(def.battens.length * 5 * 2 * 3), 3));
      this.battens = new THREE.LineSegments(g, BATTEN_MAT); this.battens.frustumCulled = false;
      this.mesh.add(this.battens);
    }
    this.update({ twist: 6, bubble: 0, flog: 0, time: 0 });
  }

  /** Luff and leech points at height fraction t. */
  private edges(t: number): [THREE.Vector3, THREE.Vector3] {
    const d = this.def;
    return [d.tack.clone().lerp(d.head, t), d.clew.clone().lerp(d.head, t)];
  }

  /** A point on the sail surface at height fraction t and chord fraction s (0 luff → 1 leech). */
  point(t: number, s: number, sh: SailShape, out = new THREE.Vector3()): THREE.Vector3 {
    const [L, F] = this.edges(t);
    out.copy(L).lerp(F, s);
    // camber: deepest a third of the way back, flatter toward the head
    let x = this.def.depth * Math.sin(Math.PI * Math.pow(s, 0.8)) * (1 - 0.7 * t);
    // luff bubble: the front of the sail backs in as it starts to luff
    if (sh.bubble > 0 && s < 0.45) x -= sh.bubble * this.def.depth * 1.7 * Math.sin(Math.PI * s / 0.45) * (1 - 0.5 * t);
    // flogging: the whole sail shakes
    if (sh.flog > 0) x = x * (1 - sh.flog) + sh.flog * this.def.depth * 0.9 * Math.sin(sh.time * 16 + t * 5 + s * 6) * s;
    // twist: rotate the section about the luff, the head falling off to leeward
    const th = sh.twist * t * Math.PI / 180, rz = out.z - L.z, rx = x;
    out.x = L.x + rx * Math.cos(th) + rz * Math.sin(th);
    out.z = L.z - rx * Math.sin(th) + rz * Math.cos(th);
    return out;
  }

  /** Chord length at height fraction t, m. */
  chord(t: number): number { const [L, F] = this.edges(t); return L.distanceTo(F); }

  update(sh: SailShape): void {
    let k = 0;
    for (const t of this.tVals) for (const s of this.sVals) {
      this.point(t, s, sh, tmp);
      this.pos[k++] = tmp.x; this.pos[k++] = tmp.y; this.pos[k++] = tmp.z;
    }
    this.geom.attributes.position.needsUpdate = true;
    this.geom.computeVertexNormals();
    if (this.battens && this.def.battens) {
      const arr = (this.battens.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
      let q = 0;
      for (const bt of this.def.battens) {
        const s0 = Math.max(0, 1 - bt.len / this.chord(bt.t));
        for (let n = 0; n < 5; n++) {
          const sa = s0 + (1 - s0) * n / 5, sb = s0 + (1 - s0) * (n + 1) / 5;
          for (const sv of [sa, sb]) { this.point(bt.t, sv, sh, tmp); arr[q++] = tmp.x + 0.006; arr[q++] = tmp.y; arr[q++] = tmp.z; }
        }
      }
      this.battens.geometry.attributes.position.needsUpdate = true;
    }
  }
}

const BATTEN_MAT = new THREE.LineBasicMaterial({ color: 0x8d8a82 });
// Telltale colours follow the sailor's convention: red on the port side of the sail, green on starboard.
const RED = new THREE.MeshBasicMaterial({ color: 0xe0281e, side: THREE.DoubleSide });
const GREEN = new THREE.MeshBasicMaterial({ color: 0x18a14a, side: THREE.DoubleSide });

/** What a telltale does: stream with the flow, lift (windward side, luffing), droop (leeward side,
 * stalled), hang (no flow along the sail, downwind) or curl (leech telltale, stalled main). */
export type TellState = 'stream' | 'lift' | 'droop' | 'hang' | 'curl';

/** A short yarn telltale on one side of a sail. */
export class Telltale {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  constructor(readonly sail: Sail, readonly t: number, readonly s: number, readonly leeward: boolean, readonly len: number, readonly phase: number) {
    this.pos = new Float32Array(6 * 2 * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const idx: number[] = [];
    for (let i = 0; i < 5; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, RED); this.mesh.frustumCulled = false;
    sail.mesh.add(this.mesh);
  }

  update(sh: SailShape, state: TellState, amount: number, mirrored: boolean): void {
    // local +x is leeward; mirrored means local +x is the boat's port side
    const onStarboard = this.leeward !== mirrored;
    this.mesh.material = onStarboard ? GREEN : RED;
    const side = this.leeward ? 1 : -1;
    const P = this.sail.point(this.t, this.s, sh, new THREE.Vector3());
    const ahead = this.sail.point(this.t, Math.min(1, this.s + 0.05), sh, new THREE.Vector3());
    const aft = ahead.sub(P).normalize(); // along the sail toward the leech
    const up = new THREE.Vector3(0, 1, 0), out = new THREE.Vector3(side, 0, 0);
    let dir: THREE.Vector3, flutter: number;
    const tt = sh.time * 14 + this.phase;
    switch (state) {
      case 'lift': // windward telltale when luffing: kicks up and forward, dancing
        dir = aft.clone().multiplyScalar(Math.cos(1 + amount)).add(up.clone().multiplyScalar(0.6 + 0.5 * Math.sin(tt * 0.7))).normalize(); flutter = 0.6; break;
      case 'droop': // leeward telltale when stalled: falls and spins
        dir = aft.clone().multiplyScalar(0.35).add(up.clone().multiplyScalar(-0.9)).add(out.clone().multiplyScalar(0.2 * Math.sin(tt * 0.5))).normalize(); flutter = 0.5; break;
      case 'curl': // leech telltale when the main is over-trimmed: curls round behind the leech to leeward
        dir = aft.clone().multiplyScalar(0.2).add(new THREE.Vector3(1, 0, 0).multiplyScalar(0.9)).add(up.clone().multiplyScalar(-0.2)).normalize(); flutter = 0.35; break;
      case 'hang':
        dir = aft.clone().multiplyScalar(0.25).add(up.clone().multiplyScalar(-1)).normalize(); flutter = 0.15; break;
      default:
        dir = aft.clone(); flutter = 0.12;
    }
    const base = P.clone().add(out.clone().multiplyScalar(0.012)); // just off the cloth on its own side
    const seg = this.len / 5, W = 0.06; // much wider than real yarn so it reads on a screen
    let q = 0; const p = base.clone();
    for (let i = 0; i <= 5; i++) {
      if (i > 0) p.addScaledVector(dir, seg).addScaledVector(out, Math.sin(tt - i * 1.2) * flutter * seg * (i / 5));
      this.pos[q++] = p.x; this.pos[q++] = p.y - W / 2; this.pos[q++] = p.z;
      this.pos[q++] = p.x; this.pos[q++] = p.y + W / 2; this.pos[q++] = p.z;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}

/** Telltale behaviour for a luff telltale pair from how the sail is drawing. */
export function luffTellStates(trim: SailTrim | null, awa: number): { windward: TellState; leeward: TellState } {
  if (!trim || awa > 115) return { windward: 'hang', leeward: 'hang' };
  if (trim.flow === 'luffing') return { windward: 'lift', leeward: 'stream' };
  if (trim.flow === 'stalled') return { windward: 'stream', leeward: 'droop' };
  return { windward: 'stream', leeward: 'stream' };
}
