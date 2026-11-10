/**
 * Yacht club burgees, drawn on a canvas: a triangular pennant, hoist on the left, fly to the right.
 *
 * Only clubs whose burgee could be checked against a written description are here. The St. Francis Yacht Club's
 * is well documented. Treasure Island, Coyote Point and Island Yacht Club are drawn from short written descriptions
 * (colours and main device), so details such as exact proportions may differ from the real thing. Others (Golden
 * Gate, San Francisco, Richmond, Corinthian, Sausalito, Encinal, Berkeley...) are left out until their designs can
 * be checked: a club's burgee drawn wrong would be worse than not offered.
 */

export interface Burgee { id: string; name: string; club: string; draw: (g: CanvasRenderingContext2D, W: number, H: number) => void }

const NAVY = '#1f2a5c', RED = '#c8102e', WHITE = '#ffffff', GOLD = '#f2b51c', BLUE = '#1d4f9c', YELLOW = '#f5d000', BLACK = '#111111';

function star(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  g.fillStyle = color; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
const poly = (g: CanvasRenderingContext2D, color: string, ...pts: [number, number][]) => { g.fillStyle = color; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); };

export const BURGEES: Burgee[] = [
  {
    id: 'stfyc', name: 'St. Francis', club: 'St. Francis Yacht Club',
    // the pennant split into four triangles at the midpoints of its sides: white at the two hoist corners, each with
    // a red star; navy in the middle; red at the fly
    draw: (g, W, H) => {
      const hm: [number, number] = [0, H / 2], tm: [number, number] = [W / 2, H / 4], bm: [number, number] = [W / 2, 3 * H / 4];
      poly(g, WHITE, [0, 0], hm, tm); poly(g, WHITE, hm, [0, H], bm);
      poly(g, NAVY, hm, tm, bm); poly(g, RED, tm, [W, H / 2], bm);
      star(g, W / 6, H / 4, H * 0.11, RED); star(g, W / 6, 3 * H / 4, H * 0.11, RED);
    }
  },
  {
    id: 'tiyc', name: 'Treasure Island', club: 'Treasure Island Yacht Club',
    // blue, with a gold stripe from the hoist to the point, and "TI" in black
    draw: (g, W, H) => {
      poly(g, BLUE, [0, 0], [0, H], [W, H / 2]);
      poly(g, GOLD, [0, H * 0.36], [0, H * 0.64], [W, H / 2]);
      g.fillStyle = BLACK; g.font = `bold ${Math.round(H * 0.24)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TI', W * 0.22, H / 2 + 1);
    }
  },
  {
    id: 'cpyc', name: 'Coyote Point', club: 'Coyote Point Yacht Club',
    // blue at the hoist, red to the fly; a white diamond with a red star
    draw: (g, W, H) => {
      poly(g, RED, [0, 0], [0, H], [W, H / 2]);
      const d = 0.42; // the division, straight across the pennant
      poly(g, BLUE, [0, 0], [0, H], [W * d, H * (1 - d / 2)], [W * d, H * d / 2]);
      const cx = W * 0.18, cy = H / 2;
      poly(g, WHITE, [cx, cy - H * 0.3], [cx + H * 0.17, cy], [cx, cy + H * 0.3], [cx - H * 0.17, cy]);
      star(g, cx, cy, H * 0.11, RED);
    }
  },
  {
    id: 'iyc', name: 'Island', club: 'Island Yacht Club (Alameda)',
    // a blue triangle at the hoist; the rest red over yellow; the club's letters in black
    draw: (g, W, H) => {
      poly(g, RED, [0, 0], [0, H / 2], [W, H / 2]); poly(g, YELLOW, [0, H / 2], [0, H], [W, H / 2]);
      poly(g, BLUE, [0, 0], [0, H], [W * 0.36, H / 2]);
      g.fillStyle = BLACK; g.font = `bold ${Math.round(H * 0.17)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('IYC', W * 0.5, H / 2 + 1);
    }
  }
];

/** A burgee as a texture: the pennant on a transparent canvas (fly ratio 3:2). */
export function burgeeCanvas(id: string): HTMLCanvasElement | null {
  const b = BURGEES.find(x => x.id === id); if (!b) return null;
  const W = 192, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.save(); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, H); g.lineTo(W, H / 2); g.closePath(); g.clip();
  b.draw(g, W, H); g.restore();
  return c;
}
