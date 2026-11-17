import type { Burgee } from './burgees';

/**
 * The parody burgees (the owner's brief, 17 Nov 2026: the Burgee style guide and each club's guidance): nods to a club's
 * age and character, never copies of the real burgee, and none of its initials or devices. The era sets the shape and
 * palette (classic: swallowtail, red/white/blue; established: triangle; mid-century: swept, wider palette; modern: a
 * rectangle, bold colors), two or three colors and one clear charge so each reads on a masthead and as a map icon. Initials
 * are the parody name's, never a real club's. Not yet in BURGEES (render/burgees.ts): they go in when the owner approves.
 */
type G = CanvasRenderingContext2D; type P = [number, number];
const WHITE = '#ffffff', GOLD = '#e9b72f', BLACK = '#14171c', NAVY = '#14285a', RED = '#c8202f', BLUE = '#1f56b5';
const poly = (g: G, c: string, ...p: P[]) => { g.fillStyle = c; g.beginPath(); p.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); };
const rect = (g: G, c: string, x: number, y: number, w: number, h: number) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const fill = (g: G, W: number, H: number, c: string) => rect(g, c, 0, 0, W, H);
const dot = (g: G, c: string, x: number, y: number, r: number) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
const oval = (g: G, c: string, x: number, y: number, rx: number, ry: number, rot = 0) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, 7); g.fill(); };
const stroke = (g: G, c: string, w: number, ...p: P[]) => { g.strokeStyle = c; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); p.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); };
const arc = (g: G, c: string, w: number, x: number, y: number, r: number, a0: number, a1: number) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); };
const txt = (g: G, c: string, s: string, x: number, y: number, size: number) => { g.fillStyle = c; g.font = `bold ${Math.round(size)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y); };

export const PARODY_BURGEES: Burgee[] = [
  // ---- Tier 1 · San Francisco city front
  { id: 'stfyc', shape: 'swallow', ratio: 1.6, // classic, prestige: navy, white, red, gold; one formal charge, no initials
    draw: (g, W, H) => { fill(g, W, H, NAVY); rect(g, WHITE, 0, H * 0.06, W, H * 0.03); rect(g, WHITE, 0, H * 0.91, W, H * 0.03); rect(g, RED, W * 0.62, 0, W * 0.38, H);
      poly(g, GOLD, [W * 0.17, H * 0.62], [W * 0.15, H * 0.36], [W * 0.22, H * 0.5], [W * 0.27, H * 0.3], [W * 0.32, H * 0.5], [W * 0.39, H * 0.36], [W * 0.37, H * 0.62]); rect(g, GOLD, W * 0.17, H * 0.64, W * 0.2, H * 0.05); } },
  { id: 'ggyc', shape: 'pennant', ratio: 1.67, // scrappy: blue and gold, a leaping dorado, a splash
    draw: (g, W, H) => { fill(g, W, H, BLUE); const x = W * 0.26, y = H * 0.46; g.save(); g.translate(x, y); g.rotate(-0.5);
      oval(g, GOLD, 0, 0, W * 0.15, H * 0.15); poly(g, GOLD, [W * 0.12, 0], [W * 0.22, -H * 0.14], [W * 0.21, 0], [W * 0.22, H * 0.14]); poly(g, GOLD, [-W * 0.08, -H * 0.13], [W * 0.05, -H * 0.2], [W * 0.07, -H * 0.1]); dot(g, BLUE, -W * 0.1, -H * 0.03, H * 0.025); g.restore();
      for (const [dx, dy] of [[0.12, 0.8], [0.2, 0.72], [0.3, 0.8]] as P[]) dot(g, WHITE, W * dx, H * dy, H * 0.025); } },
  { id: 'sbyc', shape: 'rect', ratio: 1.6, // modern urban: harbor blue, orange, a crane, initials
    draw: (g, W, H) => { fill(g, W, H, '#0f5f99'); rect(g, WHITE, 0, H * 0.82, W, H * 0.04); stroke(g, '#f08a1c', H * 0.07, [W * 0.12, H * 0.8], [W * 0.22, H * 0.22], [W * 0.32, H * 0.8]); stroke(g, '#f08a1c', H * 0.06, [W * 0.22, H * 0.22], [W * 0.62, H * 0.3]); stroke(g, '#f08a1c', H * 0.03, [W * 0.55, H * 0.29], [W * 0.55, H * 0.5]); txt(g, WHITE, 'CBYC', W * 0.78, H * 0.55, H * 0.2); } },
  { id: 'bvbc', shape: 'pennant', ratio: 1.5, // working waterfront: faded dark blue, rust, cream; a dry-dock crane, hand-painted initials
    draw: (g, W, H) => { fill(g, W, H, '#27415f'); stroke(g, '#efe3c6', H * 0.06, [W * 0.07, H * 0.5], [W * 0.07, H * 0.2], [W * 0.22, H * 0.2]); stroke(g, '#efe3c6', H * 0.04, [W * 0.22, H * 0.2], [W * 0.22, H * 0.32]); poly(g, '#a4502d', [W * 0.15, H * 0.44], [W * 0.3, H * 0.44], [W * 0.27, H * 0.52], [W * 0.18, H * 0.52]); txt(g, '#efe3c6', 'DDBC', W * 0.27, H * 0.68, H * 0.11); } },
  { id: 'mhpyc', shape: 'rect', ratio: 1.6, // modern: orange and black, a stylized butterfly (offset), initials
    draw: (g, W, H) => { fill(g, W, H, '#f08a1c'); rect(g, BLACK, W * 0.58, 0, W * 0.42, H); const x = W * 0.3, y = H * 0.45; for (const s of [-1, 1]) { oval(g, BLACK, x - W * 0.06, y + s * H * 0.2, W * 0.11, H * 0.13, s * 0.5); oval(g, BLACK, x + W * 0.08, y + s * H * 0.12, W * 0.06, H * 0.08, -s * 0.3); dot(g, '#f08a1c', x - W * 0.08, y + s * H * 0.22, H * 0.03); } stroke(g, BLACK, H * 0.05, [x - W * 0.04, y], [x + W * 0.13, y]); txt(g, '#f08a1c', 'MPYC', W * 0.79, H * 0.5, H * 0.2); } },
  { id: 'tiyc', shape: 'pennant', ratio: 1.5, // small and friendly: blue and white, a clipper under sail, one warm accent
    draw: (g, W, H) => { fill(g, W, H, '#1f4f9a'); poly(g, WHITE, [W * 0.1, H * 0.62], [W * 0.1, H * 0.3], [W * 0.2, H * 0.6]); poly(g, WHITE, [W * 0.23, H * 0.6], [W * 0.23, H * 0.22], [W * 0.35, H * 0.58]); poly(g, WHITE, [W * 0.38, H * 0.58], [W * 0.38, H * 0.34], [W * 0.46, H * 0.56]); poly(g, '#f2a33a', [W * 0.07, H * 0.64], [W * 0.5, H * 0.6], [W * 0.44, H * 0.7], [W * 0.13, H * 0.7]); } },
  // ---- Marin
  { id: 'sfyc', shape: 'swallow', ratio: 1.67, // the reference classic: strict red, white, blue; a compass rose; no initials
    draw: (g, W, H) => { rect(g, RED, 0, 0, W, H / 3); rect(g, WHITE, 0, H / 3, W, H / 3); rect(g, BLUE, 0, H * 2 / 3, W, H / 3); const x = W * 0.2, y = H / 2;
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, u = [Math.sin(a), -Math.cos(a)], v = [-u[1], u[0]]; poly(g, NAVY, [x + u[0] * H * 0.4, y + u[1] * H * 0.4], [x + v[0] * H * 0.08, y + v[1] * H * 0.08], [x - v[0] * H * 0.08, y - v[1] * H * 0.08]); } dot(g, NAVY, x, y, H * 0.07); } },
  { id: 'cyc', shape: 'swallow', ratio: 1.6, // classic: red, white, blue with gold; a laurel wreath
    draw: (g, W, H) => { fill(g, W, H, WHITE); rect(g, RED, 0, 0, W, H * 0.14); rect(g, RED, 0, H * 0.86, W, H * 0.14); dot(g, BLUE, W * 0.22, H / 2, H * 0.3);
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; oval(g, GOLD, W * 0.22 + Math.cos(a) * H * 0.2, H / 2 + Math.sin(a) * H * 0.2, H * 0.1, H * 0.05, a + Math.PI / 2); } } },
  { id: 'tyc', shape: 'pennant', ratio: 1.8, // mid-century: deep blue and gray, a shark's fin cutting the water
    draw: (g, W, H) => { fill(g, W, H, '#16386b'); poly(g, '#9aa3ad', [W * 0.08, H * 0.7], [W * 0.2, H * 0.2], [W * 0.3, H * 0.7]); stroke(g, WHITE, H * 0.05, [W * 0.04, H * 0.74], [W * 0.12, H * 0.7], [W * 0.2, H * 0.74], [W * 0.28, H * 0.7], [W * 0.38, H * 0.74]); } },
  { id: 'pyc', shape: 'rect', ratio: 1.5, // modern-formal: navy, gold, a touch of red; a horseshoe, symmetrical; initials
    draw: (g, W, H) => { fill(g, W, H, NAVY); rect(g, RED, 0, 0, W, H * 0.1); const x = W * 0.5, y = H * 0.42, r = H * 0.2; stroke(g, GOLD, H * 0.1, [x - r, y - H * 0.2], [x - r, y]); stroke(g, GOLD, H * 0.1, [x + r, y - H * 0.2], [x + r, y]); arc(g, GOLD, H * 0.1, x, y, r, 0, Math.PI); txt(g, GOLD, 'HCYC', x, H * 0.84, H * 0.13); } },
  { id: 'ssyc', shape: 'pennant', ratio: 1.5, // artsy: willow green, teal, cream; a drooping willow branch
    draw: (g, W, H) => { fill(g, W, H, '#f0e9d0'); poly(g, '#1f8c8a', [0, H], [W * 0.6, H * 0.7], [W * 0.6, H * 0.6], [0, H * 0.84]); stroke(g, '#3d7a35', H * 0.04, [0, H * 0.16], [W * 0.18, H * 0.12], [W * 0.38, H * 0.22]); for (const x of [0.05, 0.13, 0.21, 0.29]) stroke(g, '#3d7a35', H * 0.03, [W * x, H * (0.15 + x * 0.1)], [W * (x + 0.02), H * 0.4], [W * (x - 0.01), H * 0.56]); } },
  { id: 'myc', shape: 'pennant', ratio: 1.5, // established: blue, white and mountain green; a mountain
    draw: (g, W, H) => { fill(g, W, H, '#2a62b8'); poly(g, '#2f7d4a', [0, H], [0, H * 0.62], [W * 0.14, H * 0.38], [W * 0.26, H * 0.6], [W * 0.34, H * 0.5], [W * 0.62, H * 0.5], [W * 0.4, H]); poly(g, WHITE, [W * 0.1, H * 0.46], [W * 0.14, H * 0.38], [W * 0.18, H * 0.46], [W * 0.14, H * 0.43]); } },
  { id: 'sryc', shape: 'pennant', ratio: 1.5, // quiet: deep blue, white, a sandstone bell over a canal ripple
    draw: (g, W, H) => { fill(g, W, H, '#17386e'); poly(g, '#d2a46e', [W * 0.08, H * 0.58], [W * 0.1, H * 0.36], [W * 0.16, H * 0.24], [W * 0.22, H * 0.36], [W * 0.24, H * 0.58]); rect(g, '#d2a46e', W * 0.06, H * 0.58, W * 0.2, H * 0.04); dot(g, '#d2a46e', W * 0.16, H * 0.68, H * 0.03); stroke(g, WHITE, H * 0.035, [W * 0.04, H * 0.8], [W * 0.1, H * 0.76], [W * 0.16, H * 0.8], [W * 0.22, H * 0.76], [W * 0.28, H * 0.8]); } },
  // ---- East Bay
  { id: 'ryc', shape: 'pennant', ratio: 1.5, // DIY: brick red, white, black; bricks and a kiln chimney
    draw: (g, W, H) => { fill(g, W, H, '#b03a2a'); for (let r = 1; r < 6; r++) rect(g, WHITE, 0, H * r / 6 - H * 0.008, W, H * 0.016); for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) rect(g, WHITE, W * (0.06 + c * 0.14 + (r % 2) * 0.07), H * r / 6, W * 0.012, H / 6); rect(g, BLACK, W * 0.05, H * 0.28, W * 0.09, H * 0.5); rect(g, BLACK, W * 0.04, H * 0.24, W * 0.11, H * 0.06); } },
  { id: 'byc', shape: 'swallow', ratio: 1.6, // classic with a wink: purple and gold; a bishop's mitre
    draw: (g, W, H) => { fill(g, W, H, '#5b2a86'); rect(g, GOLD, W * 0.6, 0, W * 0.05, H); poly(g, GOLD, [W * 0.1, H * 0.76], [W * 0.14, H * 0.34], [W * 0.225, H * 0.14], [W * 0.31, H * 0.34], [W * 0.35, H * 0.76]); rect(g, '#5b2a86', W * 0.1, H * 0.52, W * 0.25, H * 0.05); poly(g, '#5b2a86', [W * 0.225, H * 0.3], [W * 0.25, H * 0.4], [W * 0.2, H * 0.4]); } },
  { id: 'csc', shape: 'rect', ratio: 1.5, // modern co-op: bright green and yellow, a sun; initials
    draw: (g, W, H) => { fill(g, W, H, '#2fa04a'); rect(g, '#f6d21a', 0, H * 0.62, W, H * 0.38); dot(g, '#f6d21a', W * 0.28, H * 0.42, H * 0.2); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; stroke(g, '#f6d21a', H * 0.04, [W * 0.28 + Math.cos(a) * H * 0.26, H * 0.42 + Math.sin(a) * H * 0.26], [W * 0.28 + Math.cos(a) * H * 0.36, H * 0.42 + Math.sin(a) * H * 0.36]); } txt(g, WHITE, 'PSC', W * 0.7, H * 0.4, H * 0.22); } },
  { id: 'emyc', shape: 'rect', ratio: 1.5, // small, informal, a little crooked: mud brown, reed green, sky blue; a wading bird
    draw: (g, W, H) => { g.save(); g.translate(W / 2, H / 2); g.rotate(-0.03); g.translate(-W / 2, -H / 2); rect(g, '#8ec7e8', -5, -5, W + 10, H * 0.5); rect(g, '#6b5338', -5, H * 0.5, W + 10, H * 0.6); const x = W * 0.3; stroke(g, '#4c7a3a', H * 0.03, [x + W * 0.12, H * 0.64], [x + W * 0.13, H * 0.4]); stroke(g, '#4c7a3a', H * 0.03, [x + W * 0.17, H * 0.64], [x + W * 0.17, H * 0.34]); oval(g, '#f4f0e6', x, H * 0.4, W * 0.07, H * 0.09, -0.3); stroke(g, '#f4f0e6', H * 0.035, [x + W * 0.05, H * 0.36], [x + W * 0.12, H * 0.2], [x + W * 0.17, H * 0.23]); stroke(g, '#f4f0e6', H * 0.03, [x, H * 0.48], [x, H * 0.72]); stroke(g, '#b8a27a', H * 0.03, [W * 0.55, H * 0.7], [W * 0.65, H * 0.67], [W * 0.75, H * 0.7], [W * 0.85, H * 0.67]); g.restore(); } },
  { id: 'eyc', shape: 'swallow', ratio: 1.6, // classic: red, white and blue, one green oak leaf
    draw: (g, W, H) => { fill(g, W, H, BLUE); rect(g, WHITE, W * 0.38, 0, W * 0.07, H); rect(g, RED, W * 0.45, 0, W * 0.55, H); oval(g, '#2e8b3e', W * 0.19, H / 2, W * 0.1, H * 0.2, 0.5); stroke(g, '#fff', H * 0.02, [W * 0.13, H * 0.64], [W * 0.25, H * 0.36]); } },
  { id: 'oyc', shape: 'pennant', ratio: 1.5, // established: navy, white and green; a stylized oak tree
    draw: (g, W, H) => { fill(g, W, H, NAVY); rect(g, WHITE, W * 0.145, H * 0.5, W * 0.03, H * 0.3); dot(g, '#2e8b3e', W * 0.16, H * 0.4, H * 0.18); dot(g, '#2e8b3e', W * 0.1, H * 0.5, H * 0.1); dot(g, '#2e8b3e', W * 0.22, H * 0.5, H * 0.1); } },
  { id: 'iyc', shape: 'rect', ratio: 2, // modern, thrifty: sand, teal, white stripes; a sandbar; initials
    draw: (g, W, H) => { rect(g, '#e6cf99', 0, 0, W, H / 3); rect(g, WHITE, 0, H / 3, W, H / 3); rect(g, '#16a0a6', 0, H * 2 / 3, W, H / 3); oval(g, '#e6cf99', W * 0.3, H / 2, W * 0.14, H * 0.1); txt(g, '#0d6d72', 'SdbYC', W * 0.74, H / 2, H * 0.2); } },
  { id: 'aeyc', shape: 'pennant', ratio: 1.6, // mid-century, swept: sky blue and white with a silver wind swirl
    draw: (g, W, H) => { fill(g, W, H, '#7cc0ec'); const pts: P[] = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 3.2, r = H * (0.06 + 0.2 * (1 - i / 40)); pts.push([W * 0.18 + Math.cos(a) * r, H * 0.5 + Math.sin(a) * r]); } stroke(g, WHITE, H * 0.06, ...pts); stroke(g, '#c9d2da', H * 0.045, [W * 0.3, H * 0.4], [W * 0.5, H * 0.45]); stroke(g, '#c9d2da', H * 0.045, [W * 0.3, H * 0.6], [W * 0.46, H * 0.55]); } },
  { id: 'bbyc', shape: 'rect', ratio: 1.6, // modern: black, white and ocean blue; a leaping orca; initials
    draw: (g, W, H) => { fill(g, W, H, '#0e63a8'); const x = W * 0.34, y = H * 0.42; g.save(); g.translate(x, y); g.rotate(-0.5); oval(g, BLACK, 0, 0, W * 0.2, H * 0.14); poly(g, BLACK, [W * 0.17, 0], [W * 0.28, -H * 0.14], [W * 0.27, 0], [W * 0.28, H * 0.14]); poly(g, BLACK, [-W * 0.02, -H * 0.12], [W * 0.04, -H * 0.3], [W * 0.07, -H * 0.1]); oval(g, WHITE, -W * 0.1, -H * 0.04, W * 0.04, H * 0.025, -0.3); oval(g, WHITE, 0, H * 0.08, W * 0.12, H * 0.04); g.restore(); rect(g, WHITE, 0, H * 0.86, W, H * 0.05); txt(g, WHITE, 'OBYC', W * 0.8, H * 0.52, H * 0.16); } },
  // ---- North Bay / Peninsula
  { id: 'vyc', shape: 'pennant', ratio: 1.5, // naval flavor: navy, white, red; an anchor
    draw: (g, W, H) => { fill(g, W, H, NAVY); rect(g, RED, 0, H * 0.84, W, H * 0.06); const x = W * 0.17; stroke(g, WHITE, H * 0.06, [x, H * 0.22], [x, H * 0.7]); stroke(g, WHITE, H * 0.05, [x - H * 0.12, H * 0.32], [x + H * 0.12, H * 0.32]); arc(g, WHITE, H * 0.06, x, H * 0.52, H * 0.19, 0.2, Math.PI - 0.2); dot(g, WHITE, x, H * 0.18, H * 0.04); } },
  { id: 'bnyc', shape: 'swallow', ratio: 1.6, // history-minded: navy, white and gold; a capitol dome
    draw: (g, W, H) => { fill(g, W, H, NAVY); rect(g, WHITE, W * 0.08, H * 0.74, W * 0.34, H * 0.08); g.fillStyle = GOLD; g.beginPath(); g.arc(W * 0.25, H * 0.72, W * 0.13, Math.PI, 0); g.fill(); rect(g, GOLD, W * 0.243, H * 0.2, W * 0.014, H * 0.16); dot(g, GOLD, W * 0.25, H * 0.18, H * 0.04); for (const dx of [-0.09, -0.03, 0.03, 0.09]) rect(g, NAVY, W * (0.25 + dx) - 2, H * 0.58, 4, H * 0.14); } },
  { id: 'seqyc', shape: 'pennant', ratio: 1.5, // established: green, white and blue; a pine cone
    draw: (g, W, H) => { fill(g, W, H, '#1d6b3a'); rect(g, BLUE, 0, H * 0.82, W, H * 0.06); const x = W * 0.17; oval(g, '#e9dfc6', x, H * 0.5, H * 0.17, H * 0.27); for (let r = 0; r < 4; r++) stroke(g, '#1d6b3a', H * 0.025, [x - H * 0.15, H * (0.34 + r * 0.1)], [x, H * (0.4 + r * 0.1)], [x + H * 0.15, H * (0.34 + r * 0.1)]); stroke(g, '#e9dfc6', H * 0.04, [x, H * 0.24], [x, H * 0.18]); } },
  { id: 'cpyc', shape: 'pennant', ratio: 1.5, // mid-century: steel gray, blue and white; a wolf's head
    draw: (g, W, H) => { fill(g, W, H, '#6c7886'); rect(g, BLUE, 0, H * 0.8, W, H * 0.06); const x = W * 0.17; poly(g, WHITE, [x - H * 0.2, H * 0.22], [x - H * 0.08, H * 0.34], [x + H * 0.08, H * 0.34], [x + H * 0.2, H * 0.22], [x + H * 0.2, H * 0.5], [x + H * 0.07, H * 0.66], [x, H * 0.74], [x - H * 0.07, H * 0.66], [x - H * 0.2, H * 0.5]); dot(g, '#6c7886', x - H * 0.08, H * 0.47, H * 0.025); dot(g, '#6c7886', x + H * 0.08, H * 0.47, H * 0.025); poly(g, '#6c7886', [x - H * 0.03, H * 0.64], [x + H * 0.03, H * 0.64], [x, H * 0.7]); } },
  { id: 'spyc', shape: 'rect', ratio: 1.6, // modern, minimal: mountain gray, blue and white; a ridge line
    draw: (g, W, H) => { fill(g, W, H, '#6e7a85'); rect(g, '#2f6fb5', 0, 0, W, H * 0.34); stroke(g, WHITE, H * 0.06, [0, H * 0.74], [W * 0.18, H * 0.46], [W * 0.3, H * 0.62], [W * 0.5, H * 0.3], [W * 0.7, H * 0.7], [W * 0.85, H * 0.5], [W, H * 0.68]); } },
  // ---- Tier 2 (no guidance in the file: kept simple, two colors and one charge)
  { id: 'mbyc', shape: 'rect', ratio: 2,
    draw: (g, W, H) => { fill(g, W, H, '#8a96a6'); rect(g, '#f2c200', 0, H * 0.4, W, H * 0.2); for (let i = 0; i < 8; i++) dot(g, '#5a5a5a', W * (0.08 + i * 0.11), H / 2, H * 0.04); } },
  { id: 'slyc', shape: 'pennant', ratio: 1.67,
    draw: (g, W, H) => { fill(g, W, H, '#124d33'); stroke(g, '#7fc050', H * 0.03, [W * 0.1, H * 0.52], [W * 0.17, H * 0.26], [W * 0.24, H * 0.52]); dot(g, '#c3122f', W * 0.1, H * 0.6, H * 0.12); dot(g, '#c3122f', W * 0.24, H * 0.6, H * 0.12); } }
];
