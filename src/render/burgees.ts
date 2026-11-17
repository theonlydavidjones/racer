/**
 * The game's yacht club burgees, drawn on a canvas: a triangular pennant, hoist on the left, fly to the right. Each is the
 * owner's parody of a Bay club's (club/clubs.ts), designed here and unlike the real one in colors and design.
 */

import { clubFullName } from '../club/clubs';

export interface Burgee {
  id: string; club: string;
  /** Fly length over hoist (3:2 unless the burgee is longer). */
  ratio?: number;
  draw: (g: CanvasRenderingContext2D, W: number, H: number) => void;
}

const WHITE = '#ffffff', GOLD = '#f6c440', BLACK = '#111111';

type P = [number, number];
function poly(g: CanvasRenderingContext2D, color: string, ...pts: P[]): void { g.fillStyle = color; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); }
/** The whole pennant in one colour. */
const field = (g: CanvasRenderingContext2D, W: number, H: number, c: string) => poly(g, c, [0, 0], [0, H], [W, H / 2]);

const TEAL = '#0e8a8a', PURPLE = '#5b2a86', ORANGE = '#f28c1c', GREY = '#5d6470', BROWN = '#7a4a2a', CREAM = '#f3e9d2', SKY = '#8fcdf0', OLIVE = '#6b7a2a', BRICK = '#a8452a', SAND = '#e3c98a', VIOLET = '#7a3fb0', STEEL = '#8a96a6', CRIMSON = '#b3122f';
const dot = (g: CanvasRenderingContext2D, x: number, y: number, r: number, c: string) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
const ring = (g: CanvasRenderingContext2D, x: number, y: number, r: number, w: number, c: string) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); };
const line = (g: CanvasRenderingContext2D, c: string, w: number, ...pts: P[]) => { g.strokeStyle = c; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); };
const band = (g: CanvasRenderingContext2D, W: number, H: number, c: string, y0: number, y1: number) => { g.fillStyle = c; g.fillRect(0, H * y0, W, H * (y1 - y0)); };

/**
 * The game's own burgees (the owner's parodies, 17 Nov 2026): each clearly unlike the real club's, in colors and in design,
 * and drawn from the parody name. Real burgees are trademarks; none of their art is used here.
 */
export const BURGEES: Burgee[] = [
  { id: 'stfyc', club: '', // teal with a gold palm (the island)
    draw: (g, W, H) => { field(g, W, H, TEAL); line(g, GOLD, H * 0.06, [W * 0.13, H * 0.78], [W * 0.15, H * 0.42]); for (const a of [-2.5, -1.9, -1.25, -0.6]) line(g, GOLD, H * 0.05, [W * 0.15, H * 0.42], [W * 0.15 + Math.cos(a) * H * 0.3, H * 0.42 + Math.sin(a) * H * 0.3 + H * 0.08]); } },
  { id: 'ggyc', club: '', ratio: 1.67, // emerald with a golden fish (the dorado)
    draw: (g, W, H) => { field(g, W, H, '#0b6b3a'); g.fillStyle = GOLD; g.beginPath(); g.ellipse(W * 0.27, H / 2, W * 0.15, H * 0.17, 0, 0, 7); g.fill(); poly(g, GOLD, [W * 0.4, H / 2], [W * 0.5, H * 0.38], [W * 0.5, H * 0.62]); dot(g, W * 0.18, H * 0.46, H * 0.03, '#0b6b3a'); } },
  { id: 'sbyc', club: '', ratio: 1.47, // slate with an orange dockside crane
    draw: (g, W, H) => { field(g, W, H, '#37424f'); line(g, ORANGE, H * 0.06, [W * 0.08, H * 0.82], [W * 0.17, H * 0.28], [W * 0.26, H * 0.82]); line(g, ORANGE, H * 0.05, [W * 0.17, H * 0.28], [W * 0.46, H * 0.36]); line(g, ORANGE, H * 0.025, [W * 0.4, H * 0.37], [W * 0.4, H * 0.58]); } },
  { id: 'bvbc', club: '', ratio: 2.3, // maroon with a white anchor
    draw: (g, W, H) => { field(g, W, H, '#6e1f2e'); const x = W * 0.17; line(g, WHITE, H * 0.07, [x, H * 0.24], [x, H * 0.78]); line(g, WHITE, H * 0.06, [x - H * 0.14, H * 0.36], [x + H * 0.14, H * 0.36]); g.strokeStyle = WHITE; g.lineWidth = H * 0.07; g.beginPath(); g.arc(x, H * 0.58, H * 0.22, 0.2, Math.PI - 0.2); g.stroke(); ring(g, x, H * 0.19, H * 0.05, H * 0.04, WHITE); } },
  { id: 'mhpyc', club: '', // orange with a black butterfly (the monarch)
    draw: (g, W, H) => { field(g, W, H, ORANGE); const x = W * 0.2; for (const s of [-1, 1]) { g.fillStyle = BLACK; g.beginPath(); g.ellipse(x - W * 0.04, H / 2 + s * H * 0.16, H * 0.2, H * 0.12, s * 0.5, 0, 7); g.fill(); } line(g, BLACK, H * 0.04, [x + W * 0.04, H / 2], [x - W * 0.1, H / 2]); } },
  { id: 'tiyc', club: '', // white with a green clipper's two sails
    draw: (g, W, H) => { field(g, W, H, WHITE); poly(g, '#14804a', [W * 0.1, H * 0.78], [W * 0.1, H * 0.22], [W * 0.26, H * 0.74]); poly(g, '#14804a', [W * 0.3, H * 0.74], [W * 0.3, H * 0.3], [W * 0.43, H * 0.7]); band(g, W, H, '#14804a', 0.8, 0.84); } },
  { id: 'sfyc', club: '', ratio: 1.67, // sky blue with a white cove and a gold buoy
    draw: (g, W, H) => { field(g, W, H, SKY); g.fillStyle = WHITE; g.beginPath(); g.arc(W * 0.2, H / 2, H * 0.3, -Math.PI / 2, Math.PI / 2); g.fill(); dot(g, W * 0.3, H / 2, H * 0.08, GOLD); } },
  { id: 'cyc', club: '', ratio: 1.6, // white with an olive laurel ring and a gold torch dot
    draw: (g, W, H) => { field(g, W, H, WHITE); ring(g, W * 0.2, H / 2, H * 0.27, H * 0.08, OLIVE); dot(g, W * 0.2, H / 2, H * 0.1, GOLD); } },
  { id: 'tyc', club: '', ratio: 1.8, // charcoal with a white fin
    draw: (g, W, H) => { field(g, W, H, '#2b2f36'); poly(g, WHITE, [W * 0.1, H * 0.72], [W * 0.2, H * 0.22], [W * 0.3, H * 0.72]); g.strokeStyle = SKY; g.lineWidth = H * 0.04; g.beginPath(); g.moveTo(W * 0.05, H * 0.77); g.lineTo(W * 0.4, H * 0.77); g.stroke(); } },
  { id: 'pyc', club: '', // brown with a gold horseshoe, nail holes in it
    draw: (g, W, H) => { field(g, W, H, BROWN); const x = W * 0.2, y = H * 0.42, r = H * 0.2; line(g, GOLD, H * 0.12, [x - r, y - H * 0.2], [x - r, y]); line(g, GOLD, H * 0.12, [x + r, y - H * 0.2], [x + r, y]); g.strokeStyle = GOLD; g.lineWidth = H * 0.12; g.beginPath(); g.arc(x, y, r, 0, Math.PI); g.stroke(); for (const a of [0.3, 0.5, 0.7]) dot(g, x + Math.cos(Math.PI * a + Math.PI * 0.0) * r * (a === 0.5 ? 1 : 1), y + Math.sin(Math.PI * a) * r, H * 0.022, BROWN); } },
  { id: 'ssyc', club: '', // pale green with drooping willow fronds
    draw: (g, W, H) => { field(g, W, H, '#bfe0a8'); for (const dx of [0.1, 0.19, 0.28]) line(g, '#2f6b2a', H * 0.04, [W * dx, H * 0.2], [W * (dx + 0.02), H * 0.45], [W * (dx - 0.01), H * 0.78]); line(g, '#2f6b2a', H * 0.05, [W * 0.03, H * 0.2], [W * 0.34, H * 0.2]); } },
  { id: 'myc', club: '', // slate violet with a white peak
    draw: (g, W, H) => { field(g, W, H, '#4a4f86'); poly(g, WHITE, [W * 0.05, H * 0.78], [W * 0.2, H * 0.22], [W * 0.35, H * 0.78]); poly(g, '#4a4f86', [W * 0.15, H * 0.4], [W * 0.2, H * 0.34], [W * 0.25, H * 0.4], [W * 0.2, H * 0.47]); } },
  { id: 'sryc', club: '', // terracotta with two cream canal stripes
    draw: (g, W, H) => { field(g, W, H, '#c0623a'); band(g, W, H, CREAM, 0.34, 0.42); band(g, W, H, CREAM, 0.58, 0.66); } },
  { id: 'ryc', club: '', // brick with cream mortar courses
    draw: (g, W, H) => { field(g, W, H, BRICK); for (let r = 1; r < 6; r++) band(g, W, H, CREAM, r / 6 - 0.012, r / 6 + 0.012); for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) { const x = W * (0.1 + c * 0.14 + (r % 2) * 0.07); g.fillStyle = CREAM; g.fillRect(x, H * (r / 6 + 0.01), W * 0.012, H / 6 - H * 0.02); } } },
  { id: 'byc', club: '', // purple with a gold mitre
    draw: (g, W, H) => { field(g, W, H, PURPLE); poly(g, GOLD, [W * 0.08, H * 0.76], [W * 0.14, H * 0.3], [W * 0.2, H * 0.18], [W * 0.26, H * 0.3], [W * 0.32, H * 0.76]); band(g, W, H, PURPLE, 0.52, 0.56); } },
  { id: 'csc', club: '', // tangerine with a white rising sun
    draw: (g, W, H) => { field(g, W, H, '#ee6a1f'); g.fillStyle = WHITE; g.beginPath(); g.arc(W * 0.18, H * 0.7, H * 0.26, Math.PI, 0); g.fill(); for (let i = 0; i < 5; i++) { const a = Math.PI + 0.35 + i * 0.6; line(g, WHITE, H * 0.04, [W * 0.18 + Math.cos(a) * H * 0.33, H * 0.7 + Math.sin(a) * H * 0.33], [W * 0.18 + Math.cos(a) * H * 0.46, H * 0.7 + Math.sin(a) * H * 0.46]); } } },
  { id: 'emyc', club: '', // mud brown with tan tide ripples
    draw: (g, W, H) => { field(g, W, H, '#5a4632'); for (const y of [0.35, 0.5, 0.65]) line(g, SAND, H * 0.035, [W * 0.04, H * y], [W * 0.1, H * (y - 0.05)], [W * 0.17, H * y], [W * 0.24, H * (y - 0.05)], [W * 0.31, H * y]); } },
  { id: 'eyc', club: '', // forest green with a gold acorn
    draw: (g, W, H) => { field(g, W, H, '#1f4d2a'); g.fillStyle = GOLD; g.beginPath(); g.ellipse(W * 0.2, H * 0.55, H * 0.15, H * 0.2, 0, 0, 7); g.fill(); g.fillStyle = BROWN; g.beginPath(); g.ellipse(W * 0.2, H * 0.38, H * 0.19, H * 0.1, 0, Math.PI, 0); g.fill(); band(g, W, H, '#1f4d2a', 0.01, 0.01); } },
  { id: 'oyc', club: '', // charcoal with two amber estuary stripes
    draw: (g, W, H) => { field(g, W, H, '#33302d'); band(g, W, H, '#e0a21a', 0.4, 0.47); band(g, W, H, '#e0a21a', 0.53, 0.6); } },
  { id: 'iyc', club: '', ratio: 2, // turquoise with a sand bar
    draw: (g, W, H) => { field(g, W, H, '#17b0b8'); g.fillStyle = SAND; g.beginPath(); g.ellipse(W * 0.22, H * 0.6, W * 0.17, H * 0.09, 0, 0, 7); g.fill(); } },
  { id: 'aeyc', club: '', // pale blue with three white gusts
    draw: (g, W, H) => { field(g, W, H, '#a9d3ee'); for (const y of [0.34, 0.5, 0.66]) line(g, WHITE, H * 0.045, [W * 0.04, H * y], [W * 0.22, H * y], [W * 0.27, H * (y - 0.07)], [W * 0.22, H * (y - 0.12)]); } },
  { id: 'bbyc', club: '', // black with a white orca patch and belly
    draw: (g, W, H) => { field(g, W, H, '#101418'); g.fillStyle = WHITE; g.beginPath(); g.ellipse(W * 0.2, H * 0.36, W * 0.07, H * 0.07, -0.5, 0, 7); g.fill(); poly(g, WHITE, [W * 0.06, H * 0.8], [W * 0.38, H * 0.66], [W * 0.1, H * 0.62]); } },
  { id: 'vyc', club: '', // violet with a white strait narrowing to the point
    draw: (g, W, H) => { field(g, W, H, VIOLET); poly(g, WHITE, [0, H * 0.38], [W * 0.5, H * 0.48], [W * 0.5, H * 0.52], [0, H * 0.62]); } },
  { id: 'bnyc', club: '', // gold with a brown span
    draw: (g, W, H) => { field(g, W, H, '#d9a21b'); line(g, BROWN, H * 0.06, [W * 0.04, H * 0.6], [W * 0.38, H * 0.6]); g.strokeStyle = BROWN; g.lineWidth = H * 0.05; g.beginPath(); g.arc(W * 0.21, H * 0.6, W * 0.12, Math.PI, 0); g.stroke(); } },
  { id: 'seqyc', club: '', // green with three white chevrons
    draw: (g, W, H) => { field(g, W, H, '#17652f'); for (const x of [0.06, 0.15, 0.24]) line(g, WHITE, H * 0.06, [W * x, H * 0.28], [W * (x + 0.07), H / 2], [W * x, H * 0.72]); } },
  { id: 'cpyc', club: '', // grey with a white paw
    draw: (g, W, H) => { field(g, W, H, GREY); dot(g, W * 0.17, H * 0.62, H * 0.15, WHITE); for (const [dx, dy] of [[-0.12, 0.43], [-0.04, 0.3], [0.05, 0.3], [0.13, 0.43]] as P[]) dot(g, W * (0.17 + dx * 0.9), H * dy + H * 0.03, H * 0.06, WHITE); } },
  { id: 'spyc', club: '', // slate with a white ridgeline
    draw: (g, W, H) => { field(g, W, H, '#4b3a34'); line(g, WHITE, H * 0.05, [W * 0.03, H * 0.72], [W * 0.1, H * 0.38], [W * 0.16, H * 0.6], [W * 0.24, H * 0.3], [W * 0.34, H * 0.72]); } },
  { id: 'mbyc', club: '', ratio: 2, // steel grey with a yellow rivet row
    draw: (g, W, H) => { field(g, W, H, STEEL); band(g, W, H, '#f2c200', 0.44, 0.56); for (let i = 0; i < 6; i++) dot(g, W * (0.06 + i * 0.07), H / 2, H * 0.035, '#5a5a5a'); } },
  { id: 'slyc', club: '', ratio: 1.67, // dark green with two cherries
    draw: (g, W, H) => { field(g, W, H, '#124d33'); line(g, '#7fc050', H * 0.03, [W * 0.1, H * 0.52], [W * 0.17, H * 0.26], [W * 0.24, H * 0.52]); dot(g, W * 0.1, H * 0.6, H * 0.12, CRIMSON); dot(g, W * 0.24, H * 0.6, H * 0.12, CRIMSON); } }
];

/** A burgee as a texture: the pennant on a transparent canvas. Its aspect is the burgee's own (fly over hoist). */
export function burgeeCanvas(id: string): HTMLCanvasElement | null {
  const b = BURGEES.find(x => x.id === id); if (!b) return null;
  const H = 128, W = Math.round(H * (b.ratio ?? 1.5)), c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.save(); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, H); g.lineTo(W, H / 2); g.closePath(); g.clip();
  b.draw(g, W, H); g.restore();
  return c;
}

/**
 * Where a flag officer's flag flies on a single-masted boat, by the club's own rule: in place of the burgee, or on the
 * same halyard just below it (some clubs elsewhere, e.g. Plymouth YC). The US rule is "in place": USPS ("on ...
 * single-masted sailboats, ... flown at the masthead in place of the club burgee", usps.org/f_stuff/etiquett.html) and
 * Chapman ("flown in place of the club burgee at the masthead"). None of the Bay Area clubs here publishes a rule of its
 * own (checked Nov 2026: their bylaws and traditions as far as reachable, and Flags of the World), so all follow it;
 * Coyote Point's constitution has its officers fly "the regulation flag of their office", the standard US flags.
 * A club found to differ goes in OFFICER_RULE.
 */
export type OfficerRule = 'replace' | 'below';
const OFFICER_RULE: Record<string, { rule: OfficerRule; source: string }> = {};

/** The clubs a boat can belong to (each with its burgee drawn above). */
export const CLUBS: { id: string; club: string; officer: OfficerRule; officerSource: string }[] = BURGEES.map(b => ({ id: b.id, club: clubFullName(b.id) || b.club }))
  .map(c => ({ ...c, officer: OFFICER_RULE[c.id]?.rule ?? 'replace', officerSource: OFFICER_RULE[c.id]?.source ?? 'the usual US rule (USPS): in place of the burgee' }))
  .sort((a, b) => a.club.localeCompare(b.club));
export const officerRule = (club: string | undefined): OfficerRule => CLUBS.find(c => c.id === club)?.officer ?? 'replace';
