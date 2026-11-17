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
const half = (g: G, W: number, H: number, a: string, b: string) => { rect(g, a, 0, 0, W, H / 2); rect(g, b, 0, H / 2, W, H / 2); };

/** A border just inside the cut (a fimbriation, as classic burgees have): d is its width as a share of the hoist. */
const border = (g: G, W: number, H: number, shape: 'pennant' | 'swallow', c: string, d: number) => { burgeePath(g, W, H, shape); g.strokeStyle = c; g.lineWidth = H * d * 2; g.lineJoin = 'miter'; g.stroke(); };

export const PARODY_BURGEES: Burgee[] = [
  // ---- Tier 1 · San Francisco city front
  { id: 'stfyc', shape: 'swallow', ratio: 1.6, // classic, prestige: very dark blue and red per pale, a white fimbriation; one gold phoenix, the city's own emblem, rising from red flames
    draw: (g, W, H) => { fill(g, W, H, NAVY); rect(g, WHITE, W * 0.57, 0, W * 0.035, H); rect(g, RED, W * 0.605, 0, W * 0.395, H);
      const x = W * 0.295, y = H * 0.47, u = H, q = (a: number, b: number): P => [x + a * u, y + b * u];
      for (const s of [-1, 1]) poly(g, GOLD, q(s * 0.04, -0.05), q(s * 0.32, -0.29), q(s * 0.23, -0.1), q(s * 0.36, -0.12), q(s * 0.26, 0.02), q(s * 0.33, 0.08), q(s * 0.18, 0.08), q(s * 0.04, 0.09)); // the wings, swept up
      poly(g, GOLD, q(-0.035, -0.14), q(0.035, -0.14), q(0.075, -0.01), q(0.045, 0.12), q(-0.045, 0.12), q(-0.075, -0.01)); // the body, neck to waist
      dot(g, GOLD, x, y - u * 0.19, u * 0.06); poly(g, GOLD, q(0.045, -0.22), q(0.14, -0.17), q(0.045, -0.14)); // the head, the beak
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
  { id: 'sfyc', shape: 'swallow', ratio: 1.67, // the reference classic: red, white and dark blue bands, one dark star
    draw: (g, W, H) => { rect(g, RED, 0, 0, W, H / 3); rect(g, WHITE, 0, H / 3, W, H / 3); rect(g, NAVY, 0, H * 2 / 3, W, H / 3); const x = W * 0.2, y = H / 2;
      poly(g, NAVY, [x, y - H * 0.3], [x + H * 0.08, y - H * 0.08], [x + H * 0.3, y], [x + H * 0.08, y + H * 0.08], [x, y + H * 0.3], [x - H * 0.08, y + H * 0.08], [x - H * 0.3, y], [x - H * 0.08, y - H * 0.08]); } },
  { id: 'cyc', shape: 'pennant', ratio: 1.6, // classic: dark blue over red, one gold torch
    draw: (g, W, H) => { half(g, W, H, NAVY, RED); poly(g, GOLD, [W * 0.16, H * 0.56], [W * 0.26, H * 0.56], [W * 0.24, H * 0.7], [W * 0.18, H * 0.7]); poly(g, GOLD, [W * 0.21, H * 0.2], [W * 0.27, H * 0.38], [W * 0.21, H * 0.5], [W * 0.15, H * 0.38]); } },
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
  { id: 'byc', shape: 'pennant', ratio: 1.6, // with a wink: purple and gold; one bishop's mitre
    draw: (g, W, H) => { fill(g, W, H, '#5b2a86'); rect(g, GOLD, W * 0.55, 0, W * 0.08, H); poly(g, GOLD, [W * 0.1, H * 0.7], [W * 0.1, H * 0.4], [W * 0.215, H * 0.22], [W * 0.33, H * 0.4], [W * 0.33, H * 0.7]); stroke(g, '#5b2a86', H * 0.06, [W * 0.215, H * 0.32], [W * 0.215, H * 0.7]); } },
  { id: 'csc', shape: 'pennant', ratio: 1.5, // modern co-op: bright green and yellow, one rising sun
    draw: (g, W, H) => { fill(g, W, H, '#2fa04a'); rect(g, '#f6d21a', 0, H * 0.7, W, H * 0.3); dot(g, '#f6d21a', W * 0.2, H * 0.46, H * 0.2); } },
  { id: 'emyc', shape: 'pennant', ratio: 1.5, // small and informal: sky, reed green, mud; a tide line
    draw: (g, W, H) => { fill(g, W, H, '#8ec7e8'); rect(g, '#6b5338', 0, H * 0.62, W, H * 0.38); rect(g, '#4c7a3a', 0, H * 0.5, W, H * 0.12); } },
  { id: 'eyc', shape: 'pennant', ratio: 1.6, // classic: dark blue, white and red; one green oak leaf
    draw: (g, W, H) => { fill(g, W, H, NAVY); rect(g, WHITE, W * 0.42, 0, W * 0.07, H); rect(g, RED, W * 0.49, 0, W * 0.51, H); oval(g, '#2e8b3e', W * 0.2, H / 2, W * 0.09, H * 0.2, 0.6); } },
  { id: 'oyc', shape: 'pennant', ratio: 1.5, // established: navy, white and green; one oak tree
    draw: (g, W, H) => { fill(g, W, H, NAVY); rect(g, WHITE, W * 0.18, H * 0.56, W * 0.04, H * 0.2); dot(g, '#2e8b3e', W * 0.2, H * 0.42, H * 0.17); } },
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
