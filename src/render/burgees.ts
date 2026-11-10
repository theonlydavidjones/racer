/**
 * Bay Area yacht club burgees, drawn on a canvas: a triangular pennant, hoist on the left, fly to the right.
 *
 * Drawn from the images and descriptions on Flags of the World (crwflags.com/fotw/flags/us~yc*.html), and the
 * St. Francis Yacht Club's bylaws (2.1) for theirs. FOTW notes that GGYC's own website shows its burgee "somewhat
 * different" from their image, so GGYC's may not match the cloth exactly. Swallowtail burgees with detailed artwork
 * (Alameda, Ballena Bay, Sierra Point) aren't drawn yet.
 */

export interface Burgee {
  id: string; club: string;
  /** Fly length over hoist (3:2 unless the burgee is longer). */
  ratio?: number;
  draw: (g: CanvasRenderingContext2D, W: number, H: number) => void;
}

const NAVY = '#1c2466', RED = '#d61a1f', WHITE = '#ffffff', BLUE = '#1a3fc4', YELLOW = '#ffd60a', GREEN = '#169b2c', GOLD = '#f6c440', BLACK = '#111111';

type P = [number, number];
function poly(g: CanvasRenderingContext2D, color: string, ...pts: P[]): void { g.fillStyle = color; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); }
/** The whole pennant in one colour. */
const field = (g: CanvasRenderingContext2D, W: number, H: number, c: string) => poly(g, c, [0, 0], [0, H], [W, H / 2]);
/** The pennant shrunk by a border `d` (in units of the hoist): what's left inside the border. */
const inset = (g: CanvasRenderingContext2D, W: number, H: number, c: string, d: number) => {
  const k = d * H, m = H / 2 / W, s = Math.hypot(1, m); // the slanted edges move in by k measured square to them
  poly(g, c, [k, k * s + k * m], [k, H - k * s - k * m], [W - k * s / m, H / 2]);
};
function star(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, points = 5, inner = 0.4, rot = 0): void {
  g.fillStyle = color; g.beginPath();
  for (let i = 0; i < points * 2; i++) { const a = -Math.PI / 2 + rot + i * Math.PI / points, rr = i % 2 ? r * inner : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, font = 'sans-serif'): void {
  g.fillStyle = color; g.font = `bold ${Math.round(size)}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y);
}
/** Where the pennant's top edge is at x (the bottom edge is H minus this). */
const edge = (x: number, W: number, H: number) => x / W * H / 2;

export const BURGEES: Burgee[] = [
  {
    id: 'byc', club: 'Berkeley Yacht Club',
    draw: (g, W, H) => { field(g, W, H, BLUE); g.fillStyle = YELLOW; g.beginPath(); g.arc(W * 0.36, H / 2, H * 0.22, 0, 7); g.fill(); text(g, 'B', W * 0.36, H * 0.52, H * 0.32, BLUE); }
  },
  {
    id: 'bvbc', club: 'Bay View Boat Club', ratio: 2.3,
    // yellow, with a blue compass: a ring with the four cardinal points and a needle
    draw: (g, W, H) => {
      field(g, W, H, YELLOW);
      const cx = W * 0.19, cy = H / 2, r = H * 0.25;
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, u = [Math.sin(a), -Math.cos(a)], v = [-u[1], u[0]]; poly(g, BLUE, [cx + u[0] * r * 1.55, cy + u[1] * r * 1.55], [cx + v[0] * r * 0.3, cy + v[1] * r * 0.3], [cx - v[0] * r * 0.3, cy - v[1] * r * 0.3]); }
      g.strokeStyle = BLUE; g.lineWidth = H * 0.06; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
      g.fillStyle = YELLOW; g.beginPath(); g.arc(cx, cy, r - H * 0.03, 0, 7); g.fill();
      const a = 0.35; poly(g, BLUE, [cx + Math.sin(a) * r * 0.85, cy - Math.cos(a) * r * 0.85], [cx + Math.cos(a) * r * 0.12, cy + Math.sin(a) * r * 0.12], [cx - Math.sin(a) * r * 0.85, cy + Math.cos(a) * r * 0.85], [cx - Math.cos(a) * r * 0.12, cy - Math.sin(a) * r * 0.12]);
    }
  },
  {
    id: 'cyc', club: 'Corinthian Yacht Club (Tiburon)', ratio: 1.6,
    // blue, a white stripe to the point, and a red hoist triangle edged in white with a white star
    draw: (g, W, H) => {
      field(g, W, H, BLUE);
      g.fillStyle = WHITE; g.fillRect(0, H * 0.44, W, H * 0.12);
      poly(g, WHITE, [0, 0], [0, H], [W * 0.31, H / 2]);
      poly(g, RED, [0, H * 0.06], [0, H * 0.94], [W * 0.27, H / 2]);
      star(g, W * 0.09, H / 2, H * 0.12, WHITE);
    }
  },
  {
    id: 'cpyc', club: 'Coyote Point Yacht Club',
    // blue at the hoist, red to the fly, a white diamond with a red star on the line between
    draw: (g, W, H) => {
      field(g, W, H, RED);
      const d = 0.4; poly(g, BLUE, [0, 0], [0, H], [W * d, H - edge(W * d, W, H)], [W * d, edge(W * d, W, H)]);
      const cx = W * d, cy = H / 2; poly(g, WHITE, [cx, cy - H * 0.27], [cx + W * 0.1, cy], [cx, cy + H * 0.27], [cx - W * 0.1, cy]);
      star(g, cx, cy, H * 0.12, RED);
    }
  },
  {
    id: 'eyc', club: 'Encinal Yacht Club',
    draw: (g, W, H) => { field(g, W, H, RED); poly(g, WHITE, [0, 0], [0, H], [W * 0.33, H / 2]); star(g, W * 0.1, H * 0.49, H * 0.1, NAVY); }
  },
  {
    id: 'ggyc', club: 'Golden Gate Yacht Club', ratio: 1.67,
    // blue, with a white diamond along the middle and the bridge on it in red
    draw: (g, W, H) => {
      field(g, W, H, BLUE);
      poly(g, WHITE, [W * 0.15, H / 2], [W * 0.3, H * 0.22], [W * 0.86, H / 2], [W * 0.3, H * 0.78]);
      g.strokeStyle = RED; g.fillStyle = RED; g.lineCap = 'round';
      const y = H * 0.52, x0 = W * 0.25, x1 = W * 0.53, t1 = W * 0.32, t2 = W * 0.46, top = H * 0.37;
      g.fillRect(x0, y - H * 0.025, x1 - x0, H * 0.05); // the deck
      for (const tx of [t1, t2]) { g.fillRect(tx - W * 0.012, top, W * 0.024, H * 0.27); g.fillRect(tx - W * 0.02, H * 0.6, W * 0.04, H * 0.04); } // towers and piers
      g.lineWidth = H * 0.025; g.beginPath(); g.moveTo(t1, top + H * 0.01); g.quadraticCurveTo((t1 + t2) / 2, y + H * 0.02, t2, top + H * 0.01); g.stroke(); // the main span's cable
      g.beginPath(); g.moveTo(t1, top + H * 0.01); g.lineTo(x0, y - H * 0.02); g.moveTo(t2, top + H * 0.01); g.lineTo(x1, y - H * 0.02); g.stroke(); // side spans
    }
  },
  {
    id: 'iyc', club: 'Island Yacht Club (Alameda)', ratio: 2,
    // red over yellow, a blue hoist triangle, and the interlaced letters I Y C in black over it
    draw: (g, W, H) => {
      poly(g, RED, [0, 0], [0, H / 2], [W, H / 2]); poly(g, YELLOW, [0, H / 2], [0, H], [W, H / 2]);
      poly(g, BLUE, [0, 0], [0, H], [W * 0.27, H / 2]);
      const cx = W * 0.16, lw = H * 0.075; g.strokeStyle = BLACK; g.lineWidth = lw; g.lineCap = 'butt';
      g.beginPath(); g.arc(cx, H * 0.55, H * 0.28, Math.PI * 0.28, Math.PI * 1.72); g.stroke(); // C
      g.beginPath(); g.moveTo(cx - W * 0.07, H * 0.2); g.lineTo(cx, H * 0.45); g.lineTo(cx + W * 0.07, H * 0.2); g.moveTo(cx, H * 0.45); g.lineTo(cx, H * 0.84); g.stroke(); // Y (and I)
      g.lineWidth = lw * 0.8; g.beginPath(); g.moveTo(cx - W * 0.05, H * 0.86); g.lineTo(cx + W * 0.05, H * 0.86); g.moveTo(cx - W * 0.045, H * 0.17); g.lineTo(cx + W * 0.045, H * 0.17); g.stroke(); // serifs
    }
  },
  {
    id: 'mbyc', club: 'Marina Bay Yacht Club (Richmond)', ratio: 2,
    draw: (g, W, H) => {
      field(g, W, H, BLUE);
      poly(g, YELLOW, [W * 0.26, H / 2], [W * 0.6, H * 0.36], [W, H / 2], [W * 0.6, H * 0.64]);
      star(g, W * 0.2, H * 0.48, H * 0.18, YELLOW, 5, 0.42, 0.3);
    }
  },
  {
    id: 'oyc', club: 'Oakland Yacht Club',
    draw: (g, W, H) => {
      field(g, W, H, BLUE); poly(g, WHITE, [0, 0], [0, H], [W * 0.5, H / 2]);
      g.strokeStyle = RED; g.lineWidth = H * 0.03; g.beginPath(); g.ellipse(W * 0.12, H / 2, W * 0.07, H * 0.2, 0, 0, 7); g.stroke();
    }
  },
  {
    id: 'ryc', club: 'Richmond Yacht Club',
    draw: (g, W, H) => {
      field(g, W, H, RED);
      poly(g, NAVY, [0, 0], [0, H], [W * 0.43, H / 2]); poly(g, WHITE, [0, H * 0.05], [0, H * 0.95], [W * 0.39, H / 2]);
      text(g, 'R', W * 0.13, H * 0.53, H * 0.5, NAVY);
    }
  },
  {
    id: 'sfyc', club: 'San Francisco Yacht Club', ratio: 1.67,
    // red at the hoist with a white triangle from the middle of the hoist bearing a red star; the fly blue with a white star
    draw: (g, W, H) => {
      field(g, W, H, RED);
      const x = W * 0.48, e = edge(x, W, H);
      poly(g, WHITE, [0, H / 2], [x, e], [x, H - e]); poly(g, BLUE, [x, e], [W, H / 2], [x, H - e]);
      star(g, W * 0.33, H / 2, H * 0.1, RED); star(g, W * 0.62, H / 2, H * 0.1, WHITE);
    }
  },
  {
    id: 'slyc', club: 'San Leandro Yacht Club', ratio: 1.67,
    // white, bordered red, a red cross and a red compass star where its arms meet
    draw: (g, W, H) => {
      field(g, W, H, RED); inset(g, W, H, WHITE, 0.06);
      g.fillStyle = RED; g.fillRect(0, H * 0.485, W, H * 0.03); g.fillRect(W * 0.27, 0, H * 0.03, H);
      star(g, W * 0.28, H / 2, H * 0.17, RED, 8, 0.5);
    }
  },
  {
    id: 'ssyc', club: 'Sausalito Yacht Club',
    draw: (g, W, H) => { field(g, W, H, NAVY); star(g, W * 0.2, H * 0.47, H * 0.22, RED); star(g, W * 0.2, H * 0.47, H * 0.17, WHITE); }
  },
  {
    id: 'seqyc', club: 'Sequoia Yacht Club',
    // gold, bordered green, a green redwood at the hoist
    draw: (g, W, H) => {
      field(g, W, H, GREEN); inset(g, W, H, GOLD, 0.07);
      const cx = W * 0.2; for (const [y0, w] of [[0.22, 0.09], [0.34, 0.12], [0.46, 0.15]] as P[]) poly(g, GREEN, [cx, H * y0], [cx + W * w, H * (y0 + 0.2)], [cx - W * w, H * (y0 + 0.2)]);
      g.fillStyle = GREEN; g.fillRect(cx - W * 0.015, H * 0.66, W * 0.03, H * 0.13);
    }
  },
  {
    id: 'stfyc', club: 'St. Francis Yacht Club',
    // Bylaws 2.1: two-thirds as wide as long; two white triangles at the hoist, each half the width and half the length,
    // with a red star 22% of the hoist across, a third of the way along the field; navy between them; red at the fly
    draw: (g, W, H) => {
      const hm: P = [0, H / 2], tm: P = [W / 2, H / 4], bm: P = [W / 2, 3 * H / 4];
      poly(g, WHITE, [0, 0], hm, tm); poly(g, WHITE, hm, [0, H], bm);
      poly(g, NAVY, hm, tm, bm); poly(g, RED, tm, [W, H / 2], bm);
      star(g, W / 6, H / 4, H * 0.11, RED); star(g, W / 6, 3 * H / 4, H * 0.11, RED);
    }
  },
  {
    id: 'tyc', club: 'Tiburon Yacht Club', ratio: 1.8,
    // white, a blue triangle along the middle to the point, a red hoist triangle with a white T
    draw: (g, W, H) => {
      field(g, W, H, WHITE);
      poly(g, BLUE, [W * 0.15, H * 0.29], [W * 0.15, H * 0.71], [W, H / 2]);
      poly(g, RED, [0, 0], [0, H], [W * 0.25, H / 2]);
      text(g, 'T', W * 0.08, H * 0.53, H * 0.38, WHITE, 'serif');
    }
  },
  {
    id: 'tiyc', club: 'Treasure Island Yacht Club',
    // FOTW: "Blue field charges with the black letters TI on a horizontal 1 unit-wide yellow band" (their image shows the letters in the field's blue)
    draw: (g, W, H) => { field(g, W, H, '#3d3f96'); g.fillStyle = YELLOW; g.fillRect(0, H * 0.375, W, H * 0.25); text(g, 'TI', W * 0.3, H * 0.51, H * 0.24, '#3d3f96', 'serif'); }
  },
  {
    id: 'vyc', club: 'Vallejo Yacht Club',
    draw: (g, W, H) => { field(g, W, H, RED); inset(g, W, H, WHITE, 0.045); inset(g, W, H, BLUE, 0.075); star(g, W * 0.17, H / 2, H * 0.13, WHITE); }
  }
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
 * Where a flag officer's flag flies on a single-masted boat, by the club's own rule: in place of the burgee (the US
 * Power Squadrons' rule, and most US clubs': usps.org/f_stuff/etiquett.html), or on the same halyard just below the
 * burgee (e.g. Plymouth Yacht Club's). Clubs whose own rule isn't known follow the usual one.
 */
export type OfficerRule = 'replace' | 'below';
const OFFICER_RULE: Record<string, { rule: OfficerRule; source: string }> = {};

/**
 * The clubs a boat can belong to: those whose burgees are drawn, and South Beach Yacht Club (its burgee isn't drawn yet:
 * the club's own image of it couldn't be fetched, and it isn't on Flags of the World).
 */
export const CLUBS: { id: string; club: string; officer: OfficerRule; officerSource: string }[] = [...BURGEES.map(b => ({ id: b.id, club: b.club })), { id: 'sbyc', club: 'South Beach Yacht Club' }]
  .map(c => ({ ...c, officer: OFFICER_RULE[c.id]?.rule ?? 'replace', officerSource: OFFICER_RULE[c.id]?.source ?? 'the usual US rule (USPS): in place of the burgee' }))
  .sort((a, b) => a.club.localeCompare(b.club));
export const officerRule = (club: string | undefined): OfficerRule => CLUBS.find(c => c.id === club)?.officer ?? 'replace';
