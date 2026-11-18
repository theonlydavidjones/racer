import { ROPES, lineRope, type BoatSpec, type LineColorKey, type Rope } from '../boat/spec';

/**
 * How a line's rope looks on the 3D boat (8i: the lines in their real colorways, drawn as rope). Each colorway is one
 * layer of a small texture, wrapped around the drawn rope: the 16-carrier double braid of a racing sheet (8 carriers each
 * way), its strands over and under each other, and the colored yarns where the colorway has them. A fleck rope has a
 * colored yarn in a few carriers, which shows as a short mark wherever that carrier comes over the top; a tracer is a
 * whole carrier of the other color, showing as a dashed spiral (it's hidden where it passes under). Layer 0 is plain
 * white braid, for the lines no one colors (tinted in their own color).
 *
 * ESTIMATES, by eye (no maker gives them): the lay (one carrier's turn around the rope in 32 mm of its length), how many
 * carriers carry a fleck (two one way, one the other), how wide a fleck yarn is (a third of its strand) and how many of
 * its crossings it shows at (under half). The colors
 * are spec.ts ROPES', from the retailers' listings.
 */
export const ROPE_TILE = {
  /** texels around the rope, and along one tile */
  around: 64, along: 128,
  /** the rope's length one tile covers (m): two lays */
  length: 0.064,
  /** a carrier's lay (m), and the carriers each way */
  lay: 0.032, carriers: 8
} as const;

/** Which carriers (each way) carry the colorway's other color, and how much of their width it fills. */
function marked(r: Rope, right: boolean, k: number): number {
  if (r.kind === 'tracer') return right && (r.id === 'red-tracers' ? k % 4 === 0 : k === 0) ? 1 : 0; // (two tracers, opposite each other; or one)
  if (r.kind === 'fleck') return (right ? k % 4 === 0 : k === 2) ? 1 / 3 : 0;
  return 0;
}

/** A fixed pseudo-random 0..1 for a crossing. */
const hash = (p: number, q: number) => { const x = Math.sin(p * 127.1 + q * 311.7) * 43758.5453; return x - Math.floor(x); };
const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/**
 * One colorway's tile, RGBA, `around` texels across and `along` down (row j is j/along of the tile's length along the
 * rope). Without a rope: plain white braid, for the line's band color to tint.
 */
export function ropeTile(r?: Rope): Uint8Array {
  const { around: W, along: H, length, lay, carriers: N } = ROPE_TILE, out = new Uint8Array(W * H * 4);
  const base = hex(r?.base ?? '#ffffff'), mark = r?.mark ? hex(r.mark) : base;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const a = (i + 0.5) / W, s = (j + 0.5) / H * length / lay; // around (turns), along (lays)
    // each family's position across its carriers: the right-hand ones climb one way, the left-hand the other
    const u = (a + s) * N, v = (a - s) * N, ku = Math.floor(u), kv = Math.floor(v);
    // two over, two under: which family is on top at this crossing
    const rightOnTop = (((Math.floor((ku + kv) / 2) % 2) + 2) % 2) === 0;
    const k = ((rightOnTop ? ku : kv) % N + N) % N, f = rightOnTop ? u - ku : v - kv; // the strand on top, and across it (0..1)
    // (a fleck yarn is twisted into its strand, so it shows at only some of the strand's crossings: picked by the crossing,
    // in a way that repeats with the tile, around and along)
    const shows = r?.kind !== 'fleck' || hash(((ku + kv) % (2 * N) + 2 * N) % (2 * N), ((ku - kv) % (4 * N) + 4 * N) % (4 * N)) < 0.45;
    const m = r ? marked(r, rightOnTop, k) : 0, inMark = shows && m > 0 && Math.abs(f - 0.5) < m / 2;
    const c = inMark ? mark : base;
    // a round strand: lit across its middle, darker at its edges where it dips under its neighbours
    const shade = 0.78 + 0.22 * Math.sin(Math.PI * f);
    const o = (j * W + i) * 4;
    out[o] = Math.round(c[0] * shade); out[o + 1] = Math.round(c[1] * shade); out[o + 2] = Math.round(c[2] * shade); out[o + 3] = 255;
  }
  return out;
}

/** A tile's mean color (#rrggbb): the rope as it reads from afar, where its braid is less than a pixel. */
export function tileMean(t: Uint8Array): string {
  let r = 0, g = 0, b = 0; const n = t.length / 4;
  for (let o = 0; o < t.length; o += 4) { r += t[o]; g += t[o + 1]; b += t[o + 2]; }
  const h = (x: number) => Math.round(x / n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** The layers: plain braid, then each of ROPES in order. */
export const ROPE_LAYERS = 1 + ROPES.length;

/**
 * A line's look on this boat: its colorway's texture layer, the tint the layer is drawn in (white: the layer carries the
 * colors) and the color of the thin line that shows it from afar (the colorway's blend). Every line is a real colorway,
 * hers or the usual one (spec.ts lineRope); plain braid (layer 0) is for the lines no one colors.
 */
export function ropeLook(spec: Pick<BoatSpec, 'lineRopes'> | null | undefined, key: LineColorKey): { layer: number; tint: string; far: string; rope: Rope } {
  const rope = lineRope(spec, key);
  return { layer: 1 + ROPES.indexOf(rope), tint: '#ffffff', far: farOf(rope), rope };
}
const FAR = new Map<string, string>();
const farOf = (r: Rope) => { let f = FAR.get(r.id); if (!f) FAR.set(r.id, f = tileMean(ropeTile(r))); return f; };
