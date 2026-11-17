import { burgeePath, type Burgee } from './burgees';

/**
 * The parody burgees (the owner's brief, 17 Nov 2026: the Burgee style guide and each club's guidance; then "too many have
 * awkwardly overlapping elements, text or graphics that run too close to the edge, fine details that aren't legible from a
 * distance in wind"). So each is a flag, not a drawing: a field of one to three flat colors cut in broad bands, and one
 * bold charge built of a few big shapes, set clear of the edges and of everything else; no lettering at all; nothing a
 * masthead flag at 100 m, flogging in 15 kt, would lose. The classic clubs are the old-school dark blue and red. Shapes: a
 * pennant, or (rare, two of twenty-nine, the owner's at most one in ten) a swallowtail. They are not yet in BURGEES
 * (render/burgees.ts): they go in when the owner approves.
 */
type G = CanvasRenderingContext2D; type P = [number, number];
const WHITE = '#ffffff', GOLD = '#e7b52c', BLACK = '#15181d', NAVY = '#14285a', RED = '#bf2431', BLUE = '#2257a8';
const poly = (g: G, c: string, ...p: P[]) => { g.fillStyle = c; g.beginPath(); p.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); };
const rect = (g: G, c: string, x: number, y: number, w: number, h: number) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const fill = (g: G, W: number, H: number, c: string) => rect(g, c, 0, 0, W, H);
const dot = (g: G, c: string, x: number, y: number, r: number) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
const oval = (g: G, c: string, x: number, y: number, rx: number, ry: number, rot = 0) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, 7); g.fill(); };
const stroke = (g: G, c: string, w: number, ...p: P[]) => { g.strokeStyle = c; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'butt'; g.beginPath(); p.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); };
const arc = (g: G, c: string, w: number, x: number, y: number, r: number, a0: number, a1: number) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'butt'; g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); };

/** A border just inside the cut (a fimbriation, as classic burgees have): d is its width as a share of the hoist. */
const border = (g: G, W: number, H: number, shape: 'pennant' | 'swallow', c: string, d: number) => { burgeePath(g, W, H, shape); g.strokeStyle = c; g.lineWidth = H * d * 2; g.lineJoin = 'miter'; g.stroke(); };


/**
 * An oak leaf's silhouette, as one outline (about 70 points: its lobes, notches and long thin stem), traced from the
 * owner's reference picture, x across from the leaf's middle and y down from its tip, both in units of the whole leaf's
 * length (stem included).
 */
const OAK_LEAF: P[] = [[-0.004, 0.0], [0.018, 0.007], [0.047, 0.036], [0.047, 0.073], [0.055, 0.08], [0.069, 0.073], [0.091, 0.08], [0.091, 0.131], [0.084, 0.139], [0.091, 0.168], [0.164, 0.139], [0.193, 0.168], [0.193, 0.241], [0.142, 0.336], [0.142, 0.35], [0.164, 0.372], [0.179, 0.372], [0.281, 0.321], [0.347, 0.321], [0.361, 0.336], [0.354, 0.409], [0.318, 0.474], [0.274, 0.518], [0.281, 0.54], [0.318, 0.547], [0.354, 0.577], [0.347, 0.599], [0.303, 0.642], [0.179, 0.693], [0.223, 0.737], [0.201, 0.766], [0.128, 0.796], [0.069, 0.796], [0.018, 0.839], [0.011, 0.854], [0.011, 1.0], [0.004, 1.0], [-0.011, 1.0], [-0.011, 0.854], [-0.018, 0.839], [-0.069, 0.796], [-0.128, 0.796], [-0.201, 0.766], [-0.223, 0.745], [-0.223, 0.73], [-0.193, 0.715], [-0.179, 0.693], [-0.303, 0.642], [-0.347, 0.599], [-0.354, 0.577], [-0.332, 0.555], [-0.281, 0.54], [-0.274, 0.518], [-0.332, 0.453], [-0.361, 0.387], [-0.361, 0.336], [-0.339, 0.321], [-0.281, 0.321], [-0.172, 0.372], [-0.142, 0.35], [-0.142, 0.336], [-0.172, 0.299], [-0.193, 0.241], [-0.193, 0.168], [-0.172, 0.139], [-0.091, 0.168], [-0.084, 0.161], [-0.091, 0.08], [-0.084, 0.073], [-0.055, 0.08], [-0.047, 0.073], [-0.047, 0.036]];
/** The leaf drawn with its middle at (x, y), `len` long from tip to stem's end, leaning `ang` radians clockwise from upright. */
function oakLeaf(g: G, x: number, y: number, len: number, ang: number, c: string): void {
  g.save(); g.translate(x, y); g.rotate(ang); g.translate(0, -len / 2);
  g.fillStyle = c; g.strokeStyle = c; g.lineJoin = 'round'; g.lineWidth = len * 0.01;
  g.beginPath(); OAK_LEAF.forEach(([a, b], i) => i ? g.lineTo(a * len, b * len) : g.moveTo(a * len, b * len)); g.closePath(); g.fill(); g.stroke(); g.restore();
}

/**
 * The letters of the City of Oakland's flag, traced from the owner's picture of it: O, A, K, L, N and D, each straightened
 * from its arc and outlined (counters included), in units of the cap height (x from the letter's left, y down). The T and W
 * that word needs are not in that picture, so they are built in the same style from its measured strokes: a stem 0.26 wide, a
 * bar 0.25 thick, the diagonals 0.26 across.
 */
const OAKLAND_GLYPHS: Record<string, { w: number; outer: P[]; holes: P[][] }> = {"O":{"w":1.048,"outer":[[0.503,-0.014],[0.676,0.007],[0.793,0.055],[0.862,0.103],[0.986,0.248],[1.021,0.324],[1.048,0.434],[1.048,0.572],[1.034,0.641],[0.979,0.766],[0.917,0.848],[0.848,0.91],[0.759,0.966],[0.634,1.007],[0.552,1.014],[0.386,1.0],[0.255,0.945],[0.179,0.89],[0.09,0.793],[0.041,0.703],[0.014,0.621],[0.0,0.51],[0.028,0.338],[0.117,0.179],[0.186,0.11],[0.276,0.048],[0.379,0.007]],"holes":[[[0.503,0.214],[0.586,0.221],[0.683,0.269],[0.745,0.345],[0.779,0.448],[0.779,0.572],[0.752,0.655],[0.676,0.745],[0.628,0.772],[0.559,0.786],[0.476,0.786],[0.379,0.745],[0.317,0.676],[0.29,0.621],[0.269,0.51],[0.276,0.421],[0.317,0.324],[0.393,0.248]]]},"A":{"w":1.014,"outer":[[0.386,-0.003],[0.614,0.003],[1.014,0.976],[0.766,0.976],[0.703,0.803],[0.607,0.803],[0.324,0.803],[0.255,0.983],[0.0,1.003]],"holes":[[[0.503,0.293],[0.621,0.603],[0.503,0.61],[0.393,0.61]]]},"K":{"w":0.945,"outer":[[0.041,-0.003],[0.276,0.003],[0.276,0.362],[0.614,0.017],[0.91,0.024],[0.51,0.438],[0.945,0.997],[0.903,1.003],[0.621,0.99],[0.324,0.624],[0.262,0.693],[0.255,0.983],[0.0,0.997],[0.014,0.1],[0.021,0.003]],"holes":[]},"L":{"w":0.662,"outer":[[0.014,0.003],[0.276,0.01],[0.262,0.755],[0.276,0.769],[0.662,0.776],[0.655,0.997],[0.0,0.99]],"holes":[]},"N":{"w":0.972,"outer":[[0.021,-0.003],[0.269,0.003],[0.69,0.562],[0.703,0.555],[0.717,0.01],[0.972,0.017],[0.959,1.003],[0.945,1.003],[0.703,0.99],[0.276,0.424],[0.262,0.431],[0.255,0.597],[0.255,0.983],[0.0,0.99],[0.007,0.224]],"holes":[]},"D":{"w":0.917,"outer":[[0.069,0.0],[0.352,0.014],[0.579,0.048],[0.641,0.069],[0.759,0.138],[0.862,0.262],[0.897,0.345],[0.917,0.469],[0.91,0.607],[0.883,0.71],[0.828,0.814],[0.766,0.883],[0.676,0.945],[0.607,0.972],[0.4,1.0],[0.0,0.986]],"holes":[[[0.317,0.234],[0.428,0.241],[0.545,0.283],[0.6,0.331],[0.634,0.4],[0.641,0.559],[0.621,0.641],[0.6,0.683],[0.552,0.731],[0.49,0.759],[0.379,0.779],[0.283,0.772]]]}};
const STEM = 0.262, BAR = 0.25;
const OAKLAND_BUILT: Record<string, { w: number; polys: P[][] }> = {
  T: { w: 0.86, polys: [[[0, 0.5 - 0.5], [0.86, 0], [0.86, BAR], [0, BAR]], [[0.43 - STEM / 2, BAR - 0.01], [0.43 + STEM / 2, BAR - 0.01], [0.43 + STEM / 2, 1], [0.43 - STEM / 2, 1]]] },
  W: (() => { const w = 1.55, s = STEM; const st = (xt: number, xb: number): P[] => [[xt - s / 2, 0], [xt + s / 2, 0], [xb + s / 2, 1], [xb - s / 2, 1]]; return { w, polys: [st(s / 2, w * 0.27), st(w * 0.5, w * 0.27), st(w * 0.5, w * 0.73), st(w - s / 2, w * 0.73)] }; })()
};
/** A word's letters along the pennant's middle line, each as tall as `k` of the flag's height where it stands (so they taper with the cloth); k is found so the word ends at `endX`. */
function pennantWord(g: G, word: string, c: string, W: number, H: number, startX: number, endX: number): void {
  const wOf = (ch: string) => OAKLAND_GLYPHS[ch]?.w ?? OAKLAND_BUILT[ch].w;
  const layout = (k: number) => { let x = startX; const out: { ch: string; x: number; h: number }[] = [];
    for (const ch of word) { let h = k * H * (1 - x / W); for (let i = 0; i < 3; i++) h = k * H * (1 - (x + wOf(ch) * h / 2) / W); out.push({ ch, x, h }); x += wOf(ch) * h + 0.14 * h; }
    return { out, end: x - 0.14 * out[out.length - 1].h }; };
  let lo = 0.05, hi = 0.6; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; layout(m).end > endX ? hi = m : lo = m; }
  g.fillStyle = c;
  for (const { ch, x, h } of layout(Math.min(lo, 0.5)).out) {
    g.save(); g.translate(x, H / 2 - h / 2); g.scale(h, h);
    const gl = OAKLAND_GLYPHS[ch];
    if (gl) { g.beginPath(); for (const ring of [gl.outer, ...gl.holes]) { ring.forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b)); g.closePath(); } g.fill('evenodd'); }
    else for (const poly of OAKLAND_BUILT[ch].polys) { g.beginPath(); poly.forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b)); g.closePath(); g.fill(); }
    g.restore(); }
}

export const PARODY_BURGEES: Burgee[] = [
  // ---- Tier 1 · San Francisco city front
  { id: 'stfyc', shape: 'swallow', ratio: 1.6, // classic, prestige: very dark blue and red per pale, a white fimbriation; one gold phoenix, the city's own emblem, rising from red flames
    draw: (g, W, H) => { fill(g, W, H, NAVY); rect(g, WHITE, W * 0.57, 0, W * 0.035, H); rect(g, RED, W * 0.605, 0, W * 0.395, H);
      const x = W * 0.295, y = H * 0.47, u = H, q = (a: number, b: number): P => [x + a * u, y + b * u];
      for (const s of [-1, 1]) poly(g, GOLD, q(s * 0.04, -0.05), q(s * 0.32, -0.29), q(s * 0.23, -0.1), q(s * 0.36, -0.12), q(s * 0.26, 0.02), q(s * 0.33, 0.08), q(s * 0.18, 0.08), q(s * 0.04, 0.09)); // the wings, swept up
      poly(g, GOLD, q(-0.035, -0.14), q(0.035, -0.14), q(0.075, -0.01), q(0.045, 0.12), q(-0.045, 0.12), q(-0.075, -0.01)); // the body, neck to waist
      dot(g, GOLD, x, y - u * 0.19, u * 0.06); poly(g, GOLD, q(0.03, -0.225), q(0.15, -0.19), q(0.04, -0.155)); // the head, the beak (its base inside the head, so no corner shows)
      poly(g, GOLD, q(-0.045, 0.1), q(-0.11, 0.31), q(-0.04, 0.23), q(0, 0.33), q(0.04, 0.23), q(0.11, 0.31), q(0.045, 0.1)); // the tail
      poly(g, RED, q(-0.2, 0.33), q(-0.13, 0.2), q(-0.07, 0.28), q(0, 0.15), q(0.07, 0.28), q(0.13, 0.2), q(0.2, 0.33)); // rising from the flames
      border(g, W, H, 'swallow', WHITE, 0.035); } },
  { id: 'ggyc', shape: 'pennant', ratio: 1.67, // scrappy: blue and gold, one leaping dorado
    draw: (g, W, H) => { fill(g, W, H, BLUE); g.save(); g.translate(W * 0.22, H * 0.5); g.rotate(-0.45); oval(g, GOLD, 0, 0, W * 0.14, H * 0.17); poly(g, GOLD, [W * 0.1, 0], [W * 0.2, -H * 0.16], [W * 0.2, H * 0.16]); g.restore(); } },
  { id: 'sbyc', shape: 'pennant', ratio: 1.6, // modern urban: harbor blue and orange, one bridge span
    draw: (g, W, H) => { fill(g, W, H, '#0f5f99'); rect(g, '#f08a1c', W * 0.05, H * 0.62, W * 0.3, H * 0.09); arc(g, '#f08a1c', H * 0.1, W * 0.2, H * 0.62, H * 0.2, Math.PI, 0); } },
  { id: 'bvbc', shape: 'pennant', ratio: 1.5, // working waterfront: dark blue, rust, cream; a keel in its cradle
    draw: (g, W, H) => { fill(g, W, H, '#27415f'); rect(g, '#a4502d', 0, H * 0.7, W, H * 0.3); poly(g, '#efe3c6', [W * 0.08, H * 0.3], [W * 0.3, H * 0.3], [W * 0.24, H * 0.64], [W * 0.14, H * 0.64]); } },
  { id: 'mhpyc', shape: 'pennant', ratio: 1.6, // modern: orange and black, one butterfly
    draw: (g, W, H) => { fill(g, W, H, '#f08a1c'); poly(g, BLACK, [W * 0.55, H * 0.28], [W, H / 2], [W * 0.55, H * 0.72]); for (const s of [-1, 1]) { oval(g, BLACK, W * 0.15, H * 0.5 + s * H * 0.13, W * 0.09, H * 0.1, s * 0.55); oval(g, BLACK, W * 0.27, H * 0.5 + s * H * 0.09, W * 0.05, H * 0.06, -s * 0.3); } } },
  { id: 'tiyc', shape: 'pennant', ratio: 1.5, // small and friendly: blue and white, a clipper under sail, a gold hull
    draw: (g, W, H) => { fill(g, W, H, '#1f4f9a'); poly(g, WHITE, [W * 0.08, H * 0.58], [W * 0.08, H * 0.3], [W * 0.19, H * 0.56]); poly(g, WHITE, [W * 0.22, H * 0.56], [W * 0.22, H * 0.24], [W * 0.36, H * 0.54]); poly(g, GOLD, [W * 0.06, H * 0.62], [W * 0.38, H * 0.62], [W * 0.33, H * 0.72], [W * 0.11, H * 0.72]); } },
  // ---- Marin
  { id: 'sfyc', shape: 'swallow', ratio: 1.67, // the reference classic, the oldest club: strict red, white and dark blue; a white field under a double border, one dark-blue anchor (the first to drop one on this coast)
    draw: (g, W, H) => { fill(g, W, H, WHITE); border(g, W, H, 'swallow', RED, 0.075); border(g, W, H, 'swallow', NAVY, 0.045);
      const x = W * 0.27, y = H * 0.52, u = H, S = NAVY;
      rect(g, S, x - u * 0.025, y - u * 0.2, u * 0.05, u * 0.42); rect(g, S, x - u * 0.12, y - u * 0.13, u * 0.24, u * 0.045); // the shank and the stock
      g.strokeStyle = S; g.lineWidth = u * 0.04; g.beginPath(); g.arc(x, y - u * 0.26, u * 0.05, 0, 7); g.stroke(); // the ring
      arc(g, S, u * 0.05, x, y + u * 0.02, u * 0.2, 0.12 * Math.PI, 0.88 * Math.PI); // the arms
      for (const s of [-1, 1]) poly(g, S, [x + s * u * 0.14, y + u * 0.2 - u * 0.03], [x + s * u * 0.27, y + u * 0.05], [x + s * u * 0.14, y + u * 0.08]); } },
  { id: 'cyc', shape: 'pennant', ratio: 1.6, // classic, the amateur's club (the owner's layout): a red hoist panel coming to a single point, a white middle, a dark-blue tip with a chevron notch; one gold laurel wreath (the Greek games) on the red
    draw: (g, W, H) => { fill(g, W, H, WHITE);
      poly(g, RED, [0, 0], [W * 0.25, H * 0.125], [W * 0.355, H * 0.5], [W * 0.25, H * 0.875], [0, H]);
      poly(g, NAVY, [W * 0.5, H * 0.25], [W, H * 0.5], [W * 0.5, H * 0.75], [W * 0.605, H * 0.5]); // (the white between them is a third shorter than the first draft's, along the edges and the middle)
      const x = W * 0.165, y = H * 0.485, r = H * 0.13, d = Math.PI / 180; // (a hair below the middle for balance: the wreath is open at the top and weighted low)
      const leaf = (px: number, py: number, dir: number, len: number, wid: number) => { g.save(); g.translate(px, py); g.rotate(dir); g.fillStyle = GOLD; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.4, -wid, len, 0); g.quadraticCurveTo(len * 0.4, wid, 0, 0); g.fill(); g.restore(); };
      for (const s of [-1, 1]) { // two branches from the bottom: a stem, six pairs of leaves growing up it (smaller toward the tip), a leaf at the end
        const a0 = (s > 0 ? 80 : 100) * d, a1 = (s > 0 ? -34 : 214) * d; arc(g, GOLD, H * 0.022, x, y, r, Math.min(a0, a1), Math.max(a0, a1));
        for (let i = 0; i < 6; i++) { const a = (s > 0 ? 72 - i * 21 : 108 + i * 21) * d, grow = a + s * -Math.PI / 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r, k = 1 - i * 0.07;
          for (const t of [-1, 1]) leaf(px, py, grow + t * 0.8, H * 0.085 * k, H * 0.028 * k); }
        const e = (s > 0 ? -34 : 214) * d; leaf(x + Math.cos(e) * r, y + Math.sin(e) * r, e + s * -Math.PI / 2, H * 0.07, H * 0.022); } } },
  { id: 'tyc', shape: 'pennant', ratio: 1.8, // mid-century: deep blue over gray water, one white fin
    draw: (g, W, H) => { rect(g, '#16386b', 0, 0, W, H * 0.64); rect(g, '#8d99a6', 0, H * 0.64, W, H * 0.36); poly(g, WHITE, [W * 0.09, H * 0.64], [W * 0.17, H * 0.22], [W * 0.27, H * 0.64]); } },
  { id: 'pyc', shape: 'pennant', ratio: 1.5, // modern-formal: navy, gold, a red band; one horseshoe, symmetrical
    draw: (g, W, H) => { fill(g, W, H, NAVY); rect(g, RED, W * 0.58, 0, W * 0.42, H); const x = W * 0.25, y = H * 0.42, r = H * 0.15; stroke(g, GOLD, H * 0.1, [x - r, y - H * 0.14], [x - r, y]); stroke(g, GOLD, H * 0.1, [x + r, y - H * 0.14], [x + r, y]); arc(g, GOLD, H * 0.1, x, y, r, 0, Math.PI); } },
  { id: 'ssyc', shape: 'pennant', ratio: 1.5, // artsy: cream, teal and willow green; one drooping branch
    draw: (g, W, H) => { fill(g, W, H, '#f0e9d0'); rect(g, '#1f8c8a', 0, 0, W * 0.07, H); stroke(g, '#3d7a35', H * 0.07, [W * 0.12, H * 0.3], [W * 0.3, H * 0.3]); for (const x of [0.15, 0.21, 0.27]) stroke(g, '#3d7a35', H * 0.06, [W * x, H * 0.3], [W * x, H * 0.62]); } },
  { id: 'myc', shape: 'pennant', ratio: 1.5, // established: blue, mountain green, a white cap
    draw: (g, W, H) => { fill(g, W, H, '#2a62b8'); poly(g, '#2f7d4a', [W * 0.05, H * 0.7], [W * 0.2, H * 0.28], [W * 0.35, H * 0.7]); poly(g, WHITE, [W * 0.155, H * 0.42], [W * 0.2, H * 0.28], [W * 0.245, H * 0.42]); } },
  { id: 'sryc', shape: 'pennant', ratio: 1.5, // quiet: deep blue and white, one sandstone bell
    draw: (g, W, H) => { fill(g, W, H, '#17386e'); rect(g, WHITE, W * 0.52, 0, W * 0.48, H); poly(g, '#d2a46e', [W * 0.07, H * 0.66], [W * 0.12, H * 0.58], [W * 0.13, H * 0.38], [W * 0.2, H * 0.25], [W * 0.27, H * 0.38], [W * 0.28, H * 0.58], [W * 0.33, H * 0.66]); } },
  // ---- East Bay
  { id: 'ryc', shape: 'pennant', ratio: 1.5, // DIY: brick red, black and white; one kiln chimney
    draw: (g, W, H) => { fill(g, W, H, '#b03a2a'); rect(g, WHITE, W * 0.5, 0, W * 0.14, H); rect(g, BLACK, W * 0.11, H * 0.34, W * 0.1, H * 0.34); poly(g, BLACK, [W * 0.09, H * 0.34], [W * 0.23, H * 0.34], [W * 0.21, H * 0.27], [W * 0.11, H * 0.27]); } },
  { id: 'byc', shape: 'pennant', ratio: 1.667, // Campanile YC (Berkeley, 1929), on the owner's template: five equal stripes to the point, Berkeley blue and California gold; no charge (the name does the work)
    draw: (g, W, H) => { fill(g, W, H, '#003262'); rect(g, '#fdb515', W * 0.2, 0, W * 0.2, H); rect(g, '#fdb515', W * 0.6, 0, W * 0.2, H); } },
  { id: 'csc', shape: 'pennant', ratio: 1.5, // modern co-op: bright green and yellow, one rising sun
    draw: (g, W, H) => { fill(g, W, H, '#2fa04a'); rect(g, '#f6d21a', 0, H * 0.7, W, H * 0.3); dot(g, '#f6d21a', W * 0.2, H * 0.46, H * 0.2); } },
  { id: 'emyc', shape: 'pennant', ratio: 1.5, // small and informal: sky, reed green, mud; a tide line
    draw: (g, W, H) => { fill(g, W, H, '#8ec7e8'); rect(g, '#6b5338', 0, H * 0.62, W, H * 0.38); rect(g, '#4c7a3a', 0, H * 0.5, W, H * 0.12); } },
  { id: 'eyc', shape: 'pennant', ratio: 1.6, // classic, 1890 (the owner's template): a dark-blue hoist panel bearing one white oak leaf, then red and white stripes to the point, a gold border, a white hoist band
    draw: (g, W, H) => { const X0 = W * 0.215, BORDER = '#f0b323';
      fill(g, W, H, WHITE);
      rect(g, NAVY, 0, 0, W * 0.4, H); // the hoist panel
      for (let k = 0; W * (0.4 + (2 * k + 1) * 0.0625) < W; k++) rect(g, RED, W * (0.4 + (2 * k + 1) * 0.0625), 0, W * 0.0625, H); // the stripes, red and white
      oakLeaf(g, X0, H * 0.515, H * 0.58, 0.3, WHITE); // one white oak leaf, leaning a little toward the fly, well inside the panel
      border(g, W, H, 'pennant', BORDER, 0.045); rect(g, WHITE, 0, 0, W * 0.04, H); } },
  { id: 'oyc', shape: 'pennant', ratio: 1.667, // Oaktown YC, after the City of Oakland's flag (the owner's): its exact yellow, its exact green, the word OAKTOWN down the middle in its lettering, tapering with the cloth
    draw: (g, W, H) => { fill(g, W, H, '#f5dc0e'); pennantWord(g, 'OAKTOWN', '#005e00', W, H, W * 0.07, W * 0.84); } },
  { id: 'iyc', shape: 'pennant', ratio: 2, // modern, thrifty: sand, white and teal stripes
    draw: (g, W, H) => { rect(g, '#e6cf99', 0, 0, W, H / 3); rect(g, WHITE, 0, H / 3, W, H / 3); rect(g, '#16a0a6', 0, H * 2 / 3, W, H / 3); oval(g, '#e6cf99', W * 0.16, H / 2, W * 0.1, H * 0.08); } },
  { id: 'aeyc', shape: 'pennant', ratio: 1.6, // mid-century: sky blue and white, one wind swirl
    draw: (g, W, H) => { fill(g, W, H, '#7cc0ec'); const pts: P[] = []; for (let i = 0; i <= 30; i++) { const a = i / 30 * Math.PI * 2.6, r = H * (0.05 + 0.17 * (1 - i / 30)); pts.push([W * 0.2 + Math.cos(a) * r, H * 0.5 + Math.sin(a) * r]); } stroke(g, WHITE, H * 0.09, ...pts); } },
  { id: 'bbyc', shape: 'pennant', ratio: 1.6, // modern: ocean blue, black and white; one orca
    draw: (g, W, H) => { fill(g, W, H, '#0e63a8'); g.save(); g.translate(W * 0.2, H * 0.5); g.rotate(-0.4); oval(g, BLACK, 0, 0, W * 0.13, H * 0.15); poly(g, BLACK, [W * 0.1, 0], [W * 0.18, -H * 0.15], [W * 0.18, H * 0.15]); poly(g, BLACK, [-W * 0.03, -H * 0.12], [W * 0.02, -H * 0.3], [W * 0.05, -H * 0.1]); oval(g, WHITE, -W * 0.01, H * 0.09, W * 0.07, H * 0.045); g.restore(); } },
  // ---- North Bay / Peninsula
  { id: 'vyc', shape: 'pennant', ratio: 1.5, // naval flavor: dark blue, white and red; one anchor
    draw: (g, W, H) => { fill(g, W, H, NAVY); rect(g, RED, W * 0.56, 0, W * 0.44, H); const x = W * 0.2; stroke(g, WHITE, H * 0.08, [x, H * 0.26], [x, H * 0.7]); stroke(g, WHITE, H * 0.08, [x - H * 0.14, H * 0.36], [x + H * 0.14, H * 0.36]); arc(g, WHITE, H * 0.08, x, H * 0.52, H * 0.2, 0.15, Math.PI - 0.15); } },
  { id: 'bnyc', shape: 'pennant', ratio: 1.6, // history-minded: navy, white and gold; one capitol dome
    draw: (g, W, H) => { fill(g, W, H, NAVY); rect(g, WHITE, W * 0.06, H * 0.64, W * 0.3, H * 0.08); g.fillStyle = GOLD; g.beginPath(); g.arc(W * 0.21, H * 0.64, W * 0.11, Math.PI, 0); g.fill(); rect(g, GOLD, W * 0.2, H * 0.22, W * 0.02, H * 0.1); } },
  { id: 'seqyc', shape: 'pennant', ratio: 1.5, // established: green, white and blue; one pine cone
    draw: (g, W, H) => { fill(g, W, H, '#1d6b3a'); rect(g, BLUE, W * 0.55, 0, W * 0.45, H); poly(g, WHITE, [W * 0.2, H * 0.22], [W * 0.31, H * 0.42], [W * 0.27, H * 0.7], [W * 0.2, H * 0.78], [W * 0.13, H * 0.7], [W * 0.09, H * 0.42]); stroke(g, '#1d6b3a', H * 0.06, [W * 0.1, H * 0.46], [W * 0.3, H * 0.46]); stroke(g, '#1d6b3a', H * 0.06, [W * 0.11, H * 0.6], [W * 0.29, H * 0.6]); } },
  { id: 'cpyc', shape: 'pennant', ratio: 1.5, // mid-century: steel gray, blue and white; one wolf's head
    draw: (g, W, H) => { fill(g, W, H, '#6c7886'); rect(g, BLUE, W * 0.56, 0, W * 0.44, H); poly(g, WHITE, [W * 0.08, H * 0.26], [W * 0.15, H * 0.4], [W * 0.25, H * 0.4], [W * 0.32, H * 0.26], [W * 0.33, H * 0.5], [W * 0.2, H * 0.74], [W * 0.07, H * 0.5]); } },
  { id: 'spyc', shape: 'pennant', ratio: 1.6, // modern, minimal: mountain gray and blue; one white ridge
    draw: (g, W, H) => { fill(g, W, H, '#6e7a85'); rect(g, '#2f6fb5', 0, 0, W, H * 0.38); poly(g, WHITE, [W * 0.06, H * 0.7], [W * 0.15, H * 0.4], [W * 0.22, H * 0.56], [W * 0.31, H * 0.34], [W * 0.42, H * 0.7]); } },
  // ---- Tier 2 (no guidance in the file)
  { id: 'mbyc', shape: 'pennant', ratio: 2, // steel gray with a safety-yellow band
    draw: (g, W, H) => { fill(g, W, H, '#8a96a6'); rect(g, '#f2c200', 0, H * 0.4, W, H * 0.2); } },
  { id: 'slyc', shape: 'pennant', ratio: 1.67, // dark green with two cherries
    draw: (g, W, H) => { fill(g, W, H, '#124d33'); stroke(g, '#7fc050', H * 0.06, [W * 0.1, H * 0.58], [W * 0.17, H * 0.28], [W * 0.24, H * 0.58]); dot(g, '#c3122f', W * 0.1, H * 0.6, H * 0.13); dot(g, '#c3122f', W * 0.24, H * 0.6, H * 0.13); } }
];
