/**
 * Ensigns and officer flags, drawn on a canvas from their official constructions (Flags of the World; US Executive
 * Order 10834 for the US flag; the national flag laws for the Nordic crosses, the Australian and NZ ensigns).
 *
 * Etiquette (USPS, CCA, RYA): under way, a sloop wears her ensign on the backstay (no higher than two-thirds up) or
 * on a stern staff; the club burgee at the masthead or, when instruments are up there, at the starboard spreader.
 * An officer's flag replaces the burgee in the same place. A foreign-flagged boat flies the host country's ensign as a
 * courtesy flag at the starboard spreader, and moves her burgee to port. The US yacht ensign is for US waters only.
 * Owner-absent, guest and meal flags are for a boat at anchor or on her mooring, never under way, so they aren't
 * offered here. Racing boats strike ensign and burgee at the preparatory signal and hoist them again after finishing.
 */

export interface FlagArt { id: string; name: string; ratio: number; draw: (g: CanvasRenderingContext2D, W: number, H: number) => void; shape?: 'swallowtail' }

const RED_US = '#b22234', BLUE_US = '#3c3b6e', WHITE = '#ffffff', UK_RED = '#c8102e', UK_BLUE = '#012169';
type P = [number, number];
const rect = (g: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
function poly(g: CanvasRenderingContext2D, c: string, pts: P[]): void { g.fillStyle = c; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); }
function star(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, c: string, n = 5, inner = 0.382, rot = 0): void {
  g.fillStyle = c; g.beginPath();
  for (let i = 0; i < 2 * n; i++) { const a = -Math.PI / 2 + rot + i * Math.PI / n, rr = i % 2 ? r * inner : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}

/** A fouled anchor (ring and stock at the top, crown and flukes below, a rope round the shank), leaning `lean` rad. */
function anchor(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, c: string, lean = -0.6): void {
  g.save(); g.translate(cx, cy); g.rotate(lean); g.strokeStyle = c; g.fillStyle = c; g.lineCap = 'round';
  const s = size, lw = s * 0.07;
  g.lineWidth = lw; g.beginPath(); g.moveTo(0, -s * 0.36); g.lineTo(0, s * 0.42); g.stroke(); // shank
  g.beginPath(); g.arc(0, -s * 0.43, s * 0.07, 0, 7); g.stroke(); // ring
  g.lineWidth = lw * 0.9; g.beginPath(); g.moveTo(-s * 0.2, -s * 0.3); g.lineTo(s * 0.2, -s * 0.3); g.stroke(); // stock
  g.lineWidth = lw; g.beginPath(); g.arc(0, s * 0.12, s * 0.3, Math.PI * 0.12, Math.PI * 0.88); g.stroke(); // arms
  for (const sx of [-1, 1]) { const x = sx * s * 0.29, y = s * 0.23; g.beginPath(); g.moveTo(x, y - s * 0.02); g.lineTo(x + sx * s * 0.05, y - s * 0.12); g.lineTo(x - sx * s * 0.07, y - s * 0.02); g.closePath(); g.fill(); } // flukes
  g.lineWidth = lw * 0.45; g.beginPath(); g.moveTo(0, -s * 0.43); // the rope, fouled round the shank
  for (let i = 0; i <= 12; i++) { const t = i / 12, y = -s * 0.36 + t * s * 0.7; g.lineTo(Math.sin(t * Math.PI * 3) * s * 0.11, y); }
  g.stroke(); g.restore();
}
/** The yacht-ensign device: a fouled anchor inside a ring of 13 stars. */
function anchorRing(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, starR: number, c: string): void {
  for (let i = 0; i < 13; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 13; star(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r, starR, c); }
  anchor(g, cx, cy, r * 1.45, c);
}

function stripes13(g: CanvasRenderingContext2D, W: number, H: number): void {
  for (let i = 0; i < 13; i++) rect(g, i % 2 ? WHITE : RED_US, 0, i * H / 13, W, H / 13 + 0.5);
}
/** The US flag (EO 10834: hoist 1, fly 1.9, union 7/13 × 0.76, 50 stars in 9 rows). */
function usFlag(g: CanvasRenderingContext2D, W: number, H: number): void {
  stripes13(g, W, H); const uw = 0.76 * H, uh = 7 / 13 * H; rect(g, BLUE_US, 0, 0, uw, uh);
  for (let r = 1; r <= 9; r++) for (let k = r % 2 ? 1 : 2; k <= (r % 2 ? 11 : 10); k += 2) star(g, 0.063 * k * H, 0.054 * r * H, 0.0308 * H, WHITE);
}
/** The Union Flag in a box (30 × 60 units): St Andrew's saltire counterchanged with St Patrick's, under St George's cross. */
function union(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.save(); g.translate(x, y); g.scale(w / 60, h / 30);
  rect(g, UK_BLUE, 0, 0, 60, 30);
  g.save(); g.beginPath(); g.rect(0, 0, 60, 30); g.clip();
  g.strokeStyle = WHITE; g.lineWidth = 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(60, 30); g.moveTo(60, 0); g.lineTo(0, 30); g.stroke();
  // St Patrick's red saltire, 2 wide, offset 1 from each white arm's centre line (broad white 3, red 2, narrow white 1):
  // in the upper hoist arm the red lies below the line (the broad white uppermost); the flag has 180° rotational symmetry
  g.strokeStyle = UK_RED; g.lineWidth = 2;
  const r5 = Math.sqrt(5), n1: P = [-1 / r5, 2 / r5], n2: P = [1 / r5, 2 / r5]; // normals: TL–BR diagonal (down-left), TR–BL (down-right)
  const arm = (qx: number, qy: number, a: P, b: P, n: P, k: number) => {
    g.save(); g.beginPath(); g.rect(qx, qy, 30, 15); g.clip();
    g.beginPath(); g.moveTo(a[0] + n[0] * k, a[1] + n[1] * k); g.lineTo(b[0] + n[0] * k, b[1] + n[1] * k); g.stroke(); g.restore();
  };
  arm(0, 0, [0, 0], [60, 30], n1, 1); arm(30, 15, [0, 0], [60, 30], n1, -1); // upper hoist: below; lower fly: above
  arm(30, 0, [60, 0], [0, 30], n2, -1); arm(0, 15, [60, 0], [0, 30], n2, 1); // upper fly: above; lower hoist: below
  g.restore();
  rect(g, WHITE, 25, 0, 10, 30); rect(g, WHITE, 0, 10, 60, 10);
  rect(g, UK_RED, 27, 0, 6, 30); rect(g, UK_RED, 0, 12, 60, 6);
  g.restore();
}
/** A Nordic cross: field, cross (and an inner cross), divisions along the fly and the hoist. */
function nordic(g: CanvasRenderingContext2D, W: number, H: number, field: string, cross: string, fly: number[], hoist: number[], inner?: { c: string; fly: number[]; hoist: number[] }): void {
  rect(g, field, 0, 0, W, H);
  const draw = (c: string, f: number[], h: number[]) => {
    const fs = f.reduce((a, b) => a + b), hs = h.reduce((a, b) => a + b), x = f[0] / fs * W, w = f[1] / fs * W, y = h[0] / hs * H, hh = h[1] / hs * H;
    rect(g, c, x, 0, w, H); rect(g, c, 0, y, W, hh);
  };
  draw(cross, fly, hoist); if (inner) draw(inner.c, inner.fly, inner.hoist);
}
function mapleLeaf(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, c: string): void {
  // the 11-point maple leaf, from a simplified outline of the official construction (unit: half the white square)
  const pts: P[] = [[0, -0.9], [0.13, -0.66], [0.27, -0.73], [0.22, -0.32], [0.45, -0.58], [0.5, -0.46], [0.73, -0.5], [0.66, -0.27], [0.75, -0.2], [0.42, 0.08], [0.48, 0.24], [0.04, 0.18], [0.05, 0.62],
    [-0.05, 0.62], [-0.04, 0.18], [-0.48, 0.24], [-0.42, 0.08], [-0.75, -0.2], [-0.66, -0.27], [-0.73, -0.5], [-0.5, -0.46], [-0.45, -0.58], [-0.22, -0.32], [-0.27, -0.73], [-0.13, -0.66]];
  poly(g, c, pts.map(([x, y]) => [cx + x * s, cy + y * s]));
}
/** Australia's stars on the fly half (positions from the Flags Act, in hoist units from the centre of the fly half). */
function southernCross(g: CanvasRenderingContext2D, W: number, H: number, c: string): void {
  const fx = W * 0.75, fy = H / 2;
  star(g, W / 4, H * 0.75, H * 0.15, c, 7, 4 / 9); // the Commonwealth star, lower hoist
  const big = H / 14, sm = H / 24;
  star(g, fx, H - H / 6, big, c, 7, 4 / 9); // alpha
  star(g, fx - H / 4, fy - H / 16, big, c, 7, 4 / 9); // beta
  star(g, fx, H / 6, big, c, 7, 4 / 9); // gamma
  star(g, fx + 2 * H / 9, fy - 31 * H / 240, big, c, 7, 4 / 9); // delta
  star(g, fx + H / 10, fy + H / 24, sm, c, 5, 4 / 9); // epsilon
}
/** New Zealand's Southern Cross: four five-pointed stars (white on the red ensign). */
function nzCross(g: CanvasRenderingContext2D, W: number, H: number, c: string): void {
  const fx = W * 0.75, top = H * 0.2, bottom = H * 0.8, cross = top + 12 / 60 * H, a = 8 * Math.PI / 180; // the short limb crosses at 82°, rising to the fly
  star(g, fx, top, 3 / 60 * H, c); star(g, fx, bottom, 3.5 / 60 * H, c);
  star(g, fx + Math.cos(a) * 12 / 60 * H, cross - Math.sin(a) * 12 / 60 * H + 0.0 * H, 2.5 / 60 * H, c);
  star(g, fx - Math.cos(a) * 14 / 60 * H, cross + Math.sin(a) * 14 / 60 * H, 3 / 60 * H, c);
}

export const ENSIGNS: FlagArt[] = [
  { id: 'us', name: 'United States (the national flag)', ratio: 1.9, draw: usFlag },
  {
    id: 'us-yacht', name: 'US yacht ensign (US waters only)', ratio: 1.9,
    draw: (g, W, H) => { stripes13(g, W, H); const uw = 0.76 * H, uh = 7 / 13 * H; rect(g, BLUE_US, 0, 0, uw, uh); anchorRing(g, uw / 2, uh / 2, 0.37 * uh, 0.075 * uh, WHITE); }
  },
  { id: 'can', name: 'Canada', ratio: 2, draw: (g, W, H) => { rect(g, UK_RED, 0, 0, W, H); rect(g, WHITE, W / 4, 0, W / 2, H); mapleLeaf(g, W / 2, H * 0.52, H * 0.42, UK_RED); } },
  { id: 'gbr', name: 'United Kingdom (Red Ensign)', ratio: 2, draw: (g, W, H) => { rect(g, UK_RED, 0, 0, W, H); union(g, 0, 0, W / 2, H / 2); } },
  { id: 'den', name: 'Denmark', ratio: 37 / 28, draw: (g, W, H) => nordic(g, W, H, UK_RED, WHITE, [12, 4, 21], [12, 4, 12]) },
  { id: 'swe', name: 'Sweden', ratio: 1.6, draw: (g, W, H) => nordic(g, W, H, '#006aa7', '#fecc00', [5, 2, 9], [4, 2, 4]) },
  { id: 'nor', name: 'Norway', ratio: 22 / 16, draw: (g, W, H) => nordic(g, W, H, '#ba0c2f', WHITE, [6, 4, 12], [6, 4, 6], { c: '#00205b', fly: [7, 2, 13], hoist: [7, 2, 7] }) },
  { id: 'fin', name: 'Finland', ratio: 18 / 11, draw: (g, W, H) => nordic(g, W, H, WHITE, '#002f6c', [5, 3, 10], [4, 3, 4]) },
  { id: 'ger', name: 'Germany', ratio: 5 / 3, draw: (g, W, H) => { rect(g, '#000000', 0, 0, W, H / 3); rect(g, '#dd0000', 0, H / 3, W, H / 3); rect(g, '#ffce00', 0, 2 * H / 3, W, H / 3 + 1); } },
  { id: 'ned', name: 'Netherlands', ratio: 1.5, draw: (g, W, H) => { rect(g, '#ae1c28', 0, 0, W, H / 3); rect(g, WHITE, 0, H / 3, W, H / 3); rect(g, '#21468b', 0, 2 * H / 3, W, H / 3 + 1); } },
  { id: 'fra', name: 'France (30:33:37 at sea)', ratio: 1.5, draw: (g, W, H) => { rect(g, '#002395', 0, 0, W * 0.3, H); rect(g, WHITE, W * 0.3, 0, W * 0.33, H); rect(g, '#ed2939', W * 0.63, 0, W * 0.37 + 1, H); } },
  { id: 'aus', name: 'Australia (Red Ensign)', ratio: 2, draw: (g, W, H) => { rect(g, UK_RED, 0, 0, W, H); union(g, 0, 0, W / 2, H / 2); southernCross(g, W, H, WHITE); } },
  { id: 'nzl', name: 'New Zealand (Red Ensign)', ratio: 2, draw: (g, W, H) => { rect(g, UK_RED, 0, 0, W, H); union(g, 0, 0, W / 2, H / 2); nzCross(g, W, H, WHITE); } },
  { id: 'jpn', name: 'Japan', ratio: 1.5, draw: (g, W, H) => { rect(g, WHITE, 0, 0, W, H); g.fillStyle = '#bc002d'; g.beginPath(); g.arc(W / 2, H / 2, 0.3 * H, 0, 7); g.fill(); } }
];

const NAVY = '#14205a';
/** US yacht club officers' flags (rectangular, 2:3): flown in place of the club burgee while the officer is aboard. */
export const SPECIAL_FLAGS: FlagArt[] = [
  { id: 'commodore', name: 'Commodore', ratio: 1.5, draw: (g, W, H) => { rect(g, NAVY, 0, 0, W, H); anchorRing(g, W / 2, H / 2, 0.34 * H, 0.07 * H, WHITE); } },
  { id: 'vice', name: 'Vice Commodore', ratio: 1.5, draw: (g, W, H) => { rect(g, '#c8102e', 0, 0, W, H); anchorRing(g, W / 2, H / 2, 0.34 * H, 0.07 * H, WHITE); } },
  { id: 'rear', name: 'Rear Commodore', ratio: 1.5, draw: (g, W, H) => { rect(g, WHITE, 0, 0, W, H); anchorRing(g, W / 2, H / 2, 0.34 * H, 0.07 * H, '#c8102e'); } },
  { id: 'past', name: 'Past Commodore', ratio: 1.5, draw: (g, W, H) => { rect(g, NAVY, 0, 0, W, H); anchor(g, W * 0.6, H / 2, H * 0.62, WHITE); for (const y of [0.2, 0.5, 0.8]) star(g, W * 0.12, H * y, H * 0.08, WHITE); } },
  { id: 'fleetcapt', name: 'Fleet Captain', ratio: 1.5, draw: (g, W, H) => { rect(g, WHITE, 0, 0, W, H); anchor(g, W / 2, H / 2, H * 0.66, NAVY); } },
  { id: 'portcapt', name: 'Port Captain', ratio: 1.5, draw: (g, W, H) => { rect(g, NAVY, 0, 0, W, H); anchor(g, W / 2, H / 2, H * 0.66, WHITE); } }
];

/** Ensigns that aren't the host country's (SF Bay): she flies the US flag as a courtesy flag. */
export const needsCourtesy = (ensign: string | undefined) => !!ensign && ensign !== 'us' && ensign !== 'us-yacht';

/** A flag as a texture: fly over hoist at its own proportions. */
export function flagArtCanvas(id: string): HTMLCanvasElement | null {
  const f = ENSIGNS.find(x => x.id === id) ?? SPECIAL_FLAGS.find(x => x.id === id); if (!f) return null;
  const H = 120, W = Math.round(H * f.ratio), c = document.createElement('canvas'); c.width = W; c.height = H;
  f.draw(c.getContext('2d')!, W, H);
  return c;
}
