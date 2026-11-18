import type { Vec } from '../core/math';
import { N_WAVES, type WaveField } from '../environment/waveField';

/**
 * The drawn water's patterns turn about where you are, not about the Bay's origin (the owner's "rushing water", its
 * fourth return: "way out at the map edge outside the Golden Gate"). Three of the water's layers lie along the wind
 * or the waves: the ripples (across the course's mean wind), the whitecaps' foam (streaked down the wind here) and
 * the wave groups' light (each wave's envelope along its travel). Each was turned by turning its coordinates, and
 * coordinates turn about their own origin: the Bay's, by the GGYC line. Out by the bar, 14 km from it, one degree of
 * turn swept the pattern 250 m past a still boat; on a sea-breeze afternoon the mean wind turns that much in a minute
 * or two, and a shift turns the wind here faster. (The waves themselves were already turned about the boat:
 * environment/waveField.ts.) Here each layer keeps its pattern where it lies at the focus (the boat, or the middle of
 * the overhead view) while its direction turns, and from there the turn sweeps it by no more than the distance from
 * the focus. All in double precision, handed to the shader as small numbers round a local origin.
 */

/** Where a uv lands under a texture's transform (three's Matrix3.setUvTransform: offset, repeat, rotation about center). */
export function uvAt(uv: Vec, off: Vec, rep: Vec, rot: number, c: Vec): Vec {
  const co = Math.cos(rot), s = Math.sin(rot), u = uv.x - c.x, v = uv.y - c.y;
  return { x: rep.x * (co * u + s * v) + c.x + off.x, y: rep.y * (-s * u + co * v) + c.y + off.y };
}
/** The offset that leaves the texture where it lay at `focus` (a uv) as its rotation goes from rot0 to rot1. */
export function turnTexture(off: Vec, rep: Vec, c: Vec, rot0: number, rot1: number, focus: Vec): Vec {
  const a = uvAt(focus, off, rep, rot0, c), b = uvAt(focus, off, rep, rot1, c);
  return { x: off.x + a.x - b.x, y: off.y + a.y - b.y };
}

/** How long and how wide a patch of foam lies, m per unit of its noise: streaked down the wind. */
export const FOAM_ALONG = 3, FOAM_ACROSS = 1.6;
/**
 * The foam's own coordinates: fq(p) = R(d)·(p − o) + q, with d the way the wind blows here, R stretching along and
 * across it, o a local origin by the camera and q carried here. The foam drifts with the surface water; as the wind
 * turns the streaks turn where they lie at the focus; and a new local origin changes nothing.
 */
export class FoamFrame {
  dx = 0; dy = 1; qx = 0; qy = 0; private ox = 0; private oy = 0; private primed = false;
  private R(vx: number, vy: number, dx = this.dx, dy = this.dy): Vec { return { x: (vx * dx + vy * dy) / FOAM_ALONG, y: (-vx * dy + vy * dx) / FOAM_ACROSS }; }
  /** `dir`: the way the wind blows here (any length; none, the last); `drift`: the surface water's (m/s) for `dt` s. */
  step(dir: Vec, drift: Vec, dt: number, o: Vec, focus: Vec): void {
    if (!this.primed) { this.ox = o.x; this.oy = o.y; this.primed = true; }
    if (o.x !== this.ox || o.y !== this.oy) { const m = this.R(o.x - this.ox, o.y - this.oy); this.qx += m.x; this.qy += m.y; this.ox = o.x; this.oy = o.y; }
    const L = Math.hypot(dir.x, dir.y);
    if (L > 1e-6) {
      const nx = dir.x / L, ny = dir.y / L;
      if (nx !== this.dx || ny !== this.dy) {
        const fx = focus.x - o.x, fy = focus.y - o.y, a = this.R(fx, fy), b = this.R(fx, fy, nx, ny);
        this.qx += a.x - b.x; this.qy += a.y - b.y; this.dx = nx; this.dy = ny;
      }
    }
    if (dt > 0) { const m = this.R(drift.x * dt, drift.y * dt); this.qx -= m.x; this.qy -= m.y; }
  }
  /** The foam's coordinates at p (as the shader works them out). */
  at(p: Vec): Vec { const m = this.R(p.x - this.ox, p.y - this.oy); return { x: m.x + this.qx, y: m.y + this.qy }; }
  reset(): void { this.primed = false; this.qx = this.qy = 0; }
}

/**
 * The wave groups' envelopes (render/waves.ts waveSlope): each wind-sea component's light swells and fades along its
 * travel, the envelope moving at the group speed. Its coordinates are (p·a − cg·t, 0.4·p·c), a the wave's way and c
 * across it; as the wave's direction eases round with the wind, each keeps its envelope where it lay at `about`.
 * Packs, for the shader, each component's (along, across) at the local origin `o`: it adds only (p − o)'s part.
 */
export class EnvelopeFrame {
  private readonly sd = new Float64Array(N_WAVES); private readonly cd = new Float64Array(N_WAVES);
  private readonly ua = new Float64Array(N_WAVES); private readonly uc = new Float64Array(N_WAVES);
  private readonly cg = new Float64Array(N_WAVES);
  private primed = false;
  pack(f: WaveField, e: Float32Array, t: number, o: Vec, about: Vec): void {
    for (let i = 0; i < N_WAVES; i++) {
      const s = f.sd[i], c = f.cd[i];
      if (this.primed && (s !== this.sd[i] || c !== this.cd[i])) {
        // (along is (s, c), across (−c, s): what each coordinate was at `about` with the old direction, kept with the new)
        this.ua[i] += about.x * (this.sd[i] - s) + about.y * (this.cd[i] - c);
        this.uc[i] += about.x * (-this.cd[i] + c) + about.y * (this.sd[i] - s);
      }
      this.sd[i] = s; this.cd[i] = c;
      // (the groups run at the group speed, c·n: n = ½ in deep water, toward 1 in shallow, n = ½(1 + 2kd / sinh 2kd),
      // linear theory, Dean & Dalrymple ch. 3. When the depth changes it, the groups where they are carry on: the change
      // times the wave time, thousands of seconds, would otherwise slide them across the water)
      const k = f.k[i], kd = k * f.depth, n = kd < 20 ? 0.5 * (1 + 2 * kd / Math.sinh(2 * kd)) : 0.5, cg = k > 0 ? n * f.w[i] / k : 0;
      if (this.primed && cg !== this.cg[i]) this.ua[i] += (cg - this.cg[i]) * t;
      this.cg[i] = cg;
      e[i * 2] = o.x * s + o.y * c - cg * t + this.ua[i];
      e[i * 2 + 1] = 0.4 * (-o.x * c + o.y * s + this.uc[i]);
    }
    this.primed = true;
  }
  /** Component i's envelope coordinates at p (as the shader works them out from what pack() gave it for `o`). */
  at(e: Float32Array, i: number, p: Vec, o: Vec): Vec {
    return { x: (p.x - o.x) * this.sd[i] + (p.y - o.y) * this.cd[i] + e[i * 2], y: 0.4 * (-(p.x - o.x) * this.cd[i] + (p.y - o.y) * this.sd[i]) + e[i * 2 + 1] };
  }
}
