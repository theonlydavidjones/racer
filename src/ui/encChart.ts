import chart from '../geo/data/enc-chart.json';
import { LL } from '../geo/geo';
import type { Tf } from './draw2d';

/*
 * NOAA's nautical chart of the Central Bay, drawn from its ENC vector data (src/geo/data/enc-chart.json, made by
 * scripts/fetch-charts.mjs from NOAA's S-57 cells): depth areas tinted by depth, depth contours and soundings, the
 * land, piers and breakwaters, the shipping lanes and other areas in magenta, the buoys, beacons and lights with their
 * characteristics, rocks and wrecks, and the names. Symbols follow US Chart No. 1 (paper-chart look, "day") or an
 * ECDIS-style dark display ("dusk").
 */

type Pts = number[]; // [lon, lat, dlon, dlat, …] in 1e-5 degrees
interface Area { k: string; name?: string; orient?: number; d?: number; restrn?: number[]; catrea?: number[]; catach?: number[]; o?: Pts[]; f?: Pts[][]; at?: [number, number]; size?: number }
export interface Light { chr: number; col: number[]; grp?: string; per?: number; h?: number; r?: number; cat?: number[]; s1?: number; s2?: number; name?: string }
export interface Aid { k: 'buoy' | 'beacon' | 'light'; cls?: string; p: [number, number]; name?: string; col?: number[]; pat?: number[]; shp?: number; cat?: number; spm?: number[]; priv?: number; lit?: Light[]; fog?: number; top?: number; topcol?: number[]; racon?: number }
interface Hazard { k: 'rock' | 'wreck' | 'obstn'; p?: [number, number]; d?: number; wl?: number; cw?: number; f?: Pts[][]; o?: Pts[] }
interface Name { k: 'sea' | 'land' | 'bridge'; t: string; p: [number, number]; size: number; clr?: number }
interface ChartData {
  source: string; cells: { name: string; title: string; scale: number; edition: number; update: number; updated: string; issued: string }[];
  box: { south: number; north: number; west: number; east: number };
  depth: { d: number; p: Pts[][] }[]; contours: { d: number; l: Pts[] }[]; land: Pts[][]; built: Pts[][]; structures: Pts[][]; shore: Pts[]; piers: Pts[];
  islets: [number, number][]; soundings: number[]; areas: Area[]; aids: Aid[]; hazards: Hazard[]; names: Name[];
}
export const ENC = chart as unknown as ChartData;

export type ChartPalette = 'day' | 'dusk';
/** Colours for the chart and for what the sim draws over it. */
export interface Ink {
  // depth tints, shoal to deep (see BANDS)
  dry: string; vshoal: string; shoal: string; mid: string; deep: string;
  none: string; land: string; built: string; structure: string; coast: string; contour: string; magenta: string; ink: string; sounding: string; soundingDeep: string; waterText: string;
  // the sim's own overlays
  current: string; lull: (a: number) => string; lullHatch?: boolean; windTick: string; ship: string; shipText: string; text: string; boatEdge: string; pick: string; mark: string; markPass: string; line: string;
}
export const INK: Record<ChartPalette, Ink> = {
  // US Chart No. 1 on paper: buff land, white deep water, blue shoal tints, green where it dries, magenta for regulated areas
  day: {
    dry: '#c6d7a4', vshoal: '#8fc3ea', shoal: '#b9dbf2', mid: '#e1eff9', deep: '#ffffff', none: '#d9dcdf',
    land: '#f3e2a9', built: '#e6cf8f', structure: '#d4c08a', coast: '#2e3236', contour: '#7f9bb0', magenta: '#b8188f', ink: '#1d2328', sounding: '#1d2328', soundingDeep: '#6a7781', waterText: '#1f4f7a',
    current: 'rgba(0,96,170,.8)', lull: a => `rgba(196,140,50,${a})`, lullHatch: true, windTick: 'rgba(20,40,60,.35)', ship: 'rgba(55,55,60,.9)', shipText: 'rgba(40,40,45,.9)', text: '#1d2328',
    boatEdge: '#000000', pick: '#000000', mark: '#e09a00', markPass: '#9c8a3a', line: 'rgba(200,130,0,.9)'
  },
  // the ECDIS night-time look: dark water, deeper is darker
  dusk: {
    dry: '#3e4e36', vshoal: '#2c6491', shoal: '#21496b', mid: '#17344e', deep: '#0e2233', none: '#1a1f24',
    land: '#4f4a39', built: '#5d5641', structure: '#7a7258', coast: '#b9b2a2', contour: '#3e6b8c', magenta: '#d670c8', ink: '#d5dde2', sounding: '#c3d0d9', soundingDeep: '#7d93a3', waterText: '#8fb8d6',
    current: 'rgba(111,208,255,.55)', lull: a => `rgba(200,230,245,${a})`, windTick: 'rgba(232,238,246,.28)', ship: 'rgba(230,230,225,.9)', shipText: 'rgba(230,230,225,.85)', text: '#e9f2f5',
    boatEdge: '#ffffff', pick: '#ffffff', mark: '#ffc21a', markPass: '#c9b25a', line: 'rgba(255,216,74,.75)'
  }
};

/**
 * The depth tints, by the shoal edge of each depth area (metres below MLLW). The ENC's areas break at the fathom
 * contours (1, 2, 3, 5, 6, 10, 15, 20 fm); the chart tints four shades: drying, under 1 fm (6 ft), under 5 fm (30 ft),
 * under 10 fm (60 ft), and deeper water white.
 */
export function band(d: number): 'dry' | 'vshoal' | 'shoal' | 'mid' | 'deep' {
  return d < 0 ? 'dry' : d < 1.8 ? 'vshoal' : d < 9.1 ? 'shoal' : d < 18.2 ? 'mid' : 'deep';
}

export const FT = 3.28084;

// ---- text: what the chart prints beside each aid (US Chart No. 1, section P and Q) ----

const LITCHR: Record<number, string> = { 1: 'F', 2: 'Fl', 3: 'LFl', 4: 'Q', 5: 'VQ', 6: 'UQ', 7: 'Iso', 8: 'Oc', 9: 'IQ', 10: 'IVQ', 11: 'IUQ', 12: 'Mo', 13: 'FFl', 14: 'Fl+LFl', 15: 'Oc+Fl', 16: 'F+LFl', 17: 'Al.Oc', 18: 'Al.LFl', 19: 'Al.Fl', 20: 'Al.Gr', 25: 'Q+LFl', 26: 'VQ+LFl', 27: 'UQ+LFl', 28: 'Al', 29: 'Al.F+Fl' };
// colour letters (S-57 COLOUR): white is left out of a light's characteristic on US charts ("Fl 4s" is a white light)
const COL: Record<number, string> = { 1: 'W', 2: 'B', 3: 'R', 4: 'G', 5: 'Bu', 6: 'Y', 7: 'Gy', 8: 'Br', 9: 'Am', 10: 'Vi', 11: 'Or', 12: 'Mg', 13: 'Pk' };
const FOG: Record<number, string> = { 1: 'EXPLOS', 2: 'DIA', 3: 'SIREN', 4: 'NAUTO', 5: 'REED', 6: 'TYFON', 7: 'BELL', 8: 'WHIS', 9: 'GONG', 10: 'HORN' };

/** A light's characteristic as the chart prints it: "Fl(2+1) R 6s 15ft 4M", "Q G", "Iso 6s 85ft 9M". */
export function lightText(l: Light): string {
  const ch = LITCHR[l.chr] ?? '';
  const grp = l.grp && l.grp !== '(1)' && l.grp !== '()' ? l.grp : '';
  const col = l.col.filter(c => c !== 1).map(c => COL[c] ?? '').join('');
  const parts = [ch + grp];
  if (col) parts.push(col);
  if (l.per) parts.push(`${+l.per.toFixed(1)}s`);
  if (l.h != null) parts.push(`${Math.round(l.h * FT)}ft`);
  if (l.r != null) parts.push(`${+l.r.toFixed(1)}M`);
  return parts.join(' ');
}

/** The buoy's or beacon's number or letters, from its NOAA name: "...Lighted Bell Buoy 7" → "7", "...Buoy HR" → "HR". */
export function aidId(a: Aid): string | null {
  const m = a.name?.match(/(?:^|\s)([0-9]{1,3}[A-Z]?|[A-Z]{1,3}[0-9]{0,2})$/);
  return m ? m[1] : null;
}

/** The chart's label for an aid: colour letters, "number", light, fog signal: `RG "HR" Fl(2+1) R 6s BELL`. */
export function aidText(a: Aid): string {
  const parts: string[] = [];
  if (a.k === 'buoy' && a.col) parts.push([...new Set(a.col)].map(c => COL[c] ?? '').join(''));
  const id = aidId(a); if (id) parts.push(`"${id}"`);
  const lit = (a.lit ?? []).filter(l => !(l.cat ?? []).includes(17));
  if (lit.length) parts.push(lightText(lit[0]));
  if (a.fog) parts.push(FOG[a.fog] ?? 'FOG SIG');
  if (a.racon) parts.push('Racon');
  return parts.join(' ');
}

// ---- geometry, built once in the sim's metres ----

function pts(a: Pts): [number, number][] {
  const out: [number, number][] = []; let x = 0, y = 0;
  for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; const p = LL(y / 1e5, x / 1e5); out.push([p.x, p.y]); }
  return out;
}
const at = (q: [number, number]) => LL(q[1] / 1e5, q[0] / 1e5);
function addRing(P: Path2D, a: Pts, close: boolean): void {
  pts(a).forEach(([x, y], i) => i ? P.lineTo(x, y) : P.moveTo(x, y));
  if (close) P.closePath();
}
function polyPath(list: Pts[][]): Path2D { const P = new Path2D(); for (const poly of list) for (const r of poly) addRing(P, r, true); return P; }
function linePath(list: Pts[]): Path2D { const P = new Path2D(); for (const l of list) addRing(P, l, false); return P; }

interface Built {
  bands: { k: ReturnType<typeof band>; p: Path2D }[]; contours: Path2D; land: Path2D; built: Path2D; structures: Path2D; shore: Path2D; piers: Path2D;
  areas: { a: Area; o: Path2D | null; f: Path2D | null; at: { x: number; y: number } | null }[];
  hazards: { h: Hazard; p: { x: number; y: number } | null; f: Path2D | null; o: Path2D | null }[];
  soundings: { x: number; y: number; d: number }[]; aids: { a: Aid; x: number; y: number; text: string }[]; islets: { x: number; y: number }[];
  names: (Name & { x: number; y: number })[];
}
let B: Built | null = null;
function built(): Built {
  if (B) return B;
  const byBand = new Map<string, Pts[][]>();
  for (const g of ENC.depth) { const k = band(g.d); byBand.set(k, (byBand.get(k) ?? []).concat(g.p)); }
  const snd: Built['soundings'] = [];
  for (let i = 0; i < ENC.soundings.length; i += 3) { const p = LL(ENC.soundings[i + 1] / 1e5, ENC.soundings[i] / 1e5); snd.push({ x: p.x, y: p.y, d: ENC.soundings[i + 2] / 10 }); }
  snd.sort((a, b) => a.d - b.d); // the shoalest first: where there's room for only one, the chart shows the shoal one
  return B = {
    bands: (['deep', 'mid', 'shoal', 'vshoal', 'dry'] as const).filter(k => byBand.has(k)).map(k => ({ k, p: polyPath(byBand.get(k)!) })),
    contours: linePath(ENC.contours.flatMap(c => c.l)),
    land: polyPath(ENC.land), built: polyPath(ENC.built), structures: polyPath(ENC.structures), shore: linePath(ENC.shore), piers: linePath(ENC.piers),
    areas: ENC.areas.map(a => ({ a, o: a.o?.length ? linePath(a.o) : null, f: a.f?.length ? polyPath(a.f) : null, at: a.at ? at(a.at) : null })),
    hazards: ENC.hazards.map(h => ({ h, p: h.p ? at(h.p) : null, f: h.f?.length ? polyPath(h.f) : null, o: h.o?.length ? linePath(h.o) : null })),
    soundings: snd,
    aids: ENC.aids.map(a => ({ a, ...at(a.p), text: aidText(a) })),
    islets: ENC.islets.map(at),
    // each name once (where an area spans several cells, at its biggest piece)
    names: [...new Map([...ENC.names].sort((a, b) => a.size - b.size).map(n => [n.k + n.t, { ...n, ...at(n.p) }])).values()].sort((a, b) => b.size - a.size)
  };
}

// ---- drawing ----

/** How much to show: the small inset map shows the chart's areas and aids without the small print. */
export type Detail = 'inset' | 'chart';

/**
 * The chart under everything the sim draws. `tf` is the map's own world → screen transform (rotated with the wind on
 * the inset map; north up on the full chart); `scale` is px per metre.
 */
export function drawEncChart(ctx: CanvasRenderingContext2D, tf: Tf, scale: number, w: number, h: number, pal: ChartPalette, detail: Detail, avoid: [number, number, number, number][] = []): void {
  const G = built(), I = INK[pal];
  const o = tf(0, 0), ex = tf(1, 0), ey = tf(0, 1), k = Math.hypot(ex[0] - o[0], ex[1] - o[1]) || 1e-9; // px per metre
  const px = (v: number) => v / k;
  ctx.save();
  // beyond the chart's cells: grey, as a chart leaves blank what it doesn't cover
  ctx.fillStyle = I.none; ctx.fillRect(0, 0, w, h);
  { const b = ENC.box, c = [LL(b.south, b.west), LL(b.south, b.east), LL(b.north, b.east), LL(b.north, b.west)].map(p => tf(p.x, p.y));
    ctx.fillStyle = I.deep; ctx.beginPath(); c.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill(); }
  // world-space layers: paths in metres under the map's transform
  ctx.save();
  ctx.transform(ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0], o[1]);
  ctx.lineJoin = 'round';
  for (const b of G.bands) { ctx.fillStyle = I[b.k]; ctx.fill(b.p); ctx.strokeStyle = I[b.k]; ctx.lineWidth = px(0.8); ctx.stroke(b.p); } // (the stroke hides seams between cells)
  // dredged channels and fairways: their tint, then the separation zones
  for (const A of G.areas) if (A.f && (A.a.k === 'dredged')) { ctx.fillStyle = pal === 'day' ? 'rgba(255,255,255,.55)' : 'rgba(30,70,100,.5)'; ctx.fill(A.f); }
  for (const A of G.areas) if (A.f && A.a.k === 'sepzone') { ctx.fillStyle = pal === 'day' ? 'rgba(184,24,143,.22)' : 'rgba(214,112,200,.22)'; ctx.fill(A.f); }
  ctx.strokeStyle = I.contour; ctx.lineWidth = px(0.7); ctx.stroke(G.contours);
  ctx.fillStyle = I.land; ctx.fill(G.land); ctx.strokeStyle = I.land; ctx.lineWidth = px(0.8); ctx.stroke(G.land);
  ctx.fillStyle = I.built; ctx.fill(G.built);
  ctx.fillStyle = I.structure; ctx.fill(G.structures);
  ctx.strokeStyle = I.coast; ctx.lineWidth = px(1); ctx.stroke(G.structures); ctx.stroke(G.piers);
  ctx.lineWidth = px(1.2); ctx.stroke(G.shore);
  // the regulated areas: magenta dashed limits, as on the chart
  for (const A of G.areas) {
    if (!A.o) continue;
    const s = areaStroke(A.a.k, I); if (!s) continue;
    ctx.strokeStyle = s.c; ctx.lineWidth = px(s.w); ctx.setLineDash(s.dash.map(px)); ctx.stroke(A.o);
  }
  ctx.setLineDash([]);
  for (const H of G.hazards) {
    if (H.f) { ctx.fillStyle = H.h.wl === 3 || H.h.wl == null ? 'rgba(0,0,0,0)' : I.structure; ctx.fill(H.f); }
    if ((H.f || H.o) && scale > 0.15) { ctx.strokeStyle = I.ink; ctx.lineWidth = px(0.8); ctx.setLineDash([px(1.5), px(2)]); if (H.f) ctx.stroke(H.f); if (H.o) ctx.stroke(H.o); ctx.setLineDash([]); }
  }
  ctx.restore();

  // screen-space symbols and print
  const on = (x: number, y: number, m = 30) => x > -m && x < w + m && y > -m && y < h + m;
  ctx.fillStyle = I.ink;
  for (const p of G.islets) { const s = tf(p.x, p.y); if (on(s[0], s[1])) { ctx.beginPath(); ctx.arc(s[0], s[1], 1.3, 0, 6.29); ctx.fill(); } }
  // TSS lanes: an open arrow along each lane, the way traffic goes
  for (const A of G.areas) if (A.a.k === 'lane' && A.at && A.a.orient != null) {
    const s = tf(A.at.x, A.at.y); if (!on(s[0], s[1], 60)) continue;
    const L = Math.min(60, Math.max(18, (A.a.size ?? 1000) * scale * 0.5)), d = A.a.orient * Math.PI / 180;
    const e = tf(A.at.x + Math.sin(d) * 10, A.at.y + Math.cos(d) * 10), ang = Math.atan2(e[1] - s[1], e[0] - s[0]);
    laneArrow(ctx, s[0], s[1], ang, L, I.magenta);
  }
  // hazard symbols
  if (scale > 0.12) for (const H of G.hazards) if (H.p) {
    const s = tf(H.p.x, H.p.y); if (!on(s[0], s[1])) continue;
    hazard(ctx, s[0], s[1], H.h, I, detail === 'chart' && scale > 0.35);
  }
  // the print: names first, then the aids' labels, each kept clear of what's already placed; soundings fill the gaps
  const P = new Placer(ctx);
  for (const b of avoid) P.block(...b); // the sim's own labels, drawn later over the chart
  ctx.textAlign = 'left';
  if (detail === 'chart') {
    for (const n of G.names) {
      const s = tf(n.x, n.y), sz = n.size * scale; if (!on(s[0], s[1], 80)) continue;
      if (n.k === 'sea' && /Anchorage/.test(n.t)) continue; // (named with the anchorage's own symbol)
      if (n.k === 'bridge') { if (scale < 0.08) continue; }
      else if (sz < 70 || sz > Math.max(w, h) * 2.5) continue;
      const font = n.k === 'sea' ? 'italic 600 12px Georgia, serif' : n.k === 'land' ? '600 11px "Saira Semi Condensed", sans-serif' : '600 10px "Saira Semi Condensed", sans-serif';
      const col = n.k === 'sea' ? I.waterText : I.ink;
      if (P.text(n.t, s[0], s[1], font, col) && n.k === 'bridge' && n.clr != null && scale > 0.15) P.text(`VERT CL ${Math.round(n.clr * FT)} FT`, s[0], s[1] + 11, '9px "Saira Semi Condensed", sans-serif', col);
    }
    // the areas' names: the anchorages by number, the rest by name, in magenta
    const done = new Set<string>();
    for (const A of [...G.areas].sort((a, b) => (b.a.size ?? 0) - (a.a.size ?? 0))) {
      if (!A.at) continue;
      const s = tf(A.at.x, A.at.y), sz = (A.a.size ?? 0) * scale; if (!on(s[0], s[1], 60)) continue;
      const id = A.a.k + (A.a.name ?? ''); if (A.a.name && done.has(id)) continue; // (an area split across cells: named once)
      if (A.a.k === 'anchorage' && sz > 30) {
        const num = A.a.name?.match(/Anchorage(?: Number)? ([0-9A-Z]+)$/)?.[1] ?? A.a.name?.replace(/^San Francisco Bay, /, '').replace(/ Anchorage$/, '') ?? '';
        if (P.text(num, s[0], s[1] + 12, 'italic 600 11px Georgia, serif', I.magenta)) { anchor(ctx, s[0], s[1] - 6, I.magenta); done.add(id); }
      } else if (A.a.k === 'precaution' && sz > 120 && sz < Math.max(w, h) * 2) {
        if (P.text('PRECAUTIONARY AREA', s[0], s[1], 'italic 11px Georgia, serif', I.magenta)) done.add(id);
      } else if ((A.a.k === 'restricted' || A.a.k === 'caution') && A.a.name && sz > 140 && sz < Math.max(w, h) * 1.5) {
        if (P.text(A.a.name.toUpperCase(), s[0], s[1], 'italic 10px Georgia, serif', I.magenta)) done.add(id);
      } else if (A.a.k === 'dredged' && A.a.d != null && sz > 50 && scale > 0.12) {
        P.text(`${Math.round(A.a.d * FT)} FT`, s[0], s[1], 'italic 10px Georgia, serif', I.ink);
      }
    }
  }
  // buoys, beacons and lights: the symbol always, the label where there's room
  if (scale > 0.025) {
    const lab = detail === 'chart' ? scale > 0.18 : scale > 0.9;
    for (const A of G.aids) {
      const s = tf(A.x, A.y); if (!on(s[0], s[1], 40)) continue;
      aid(ctx, s[0], s[1], A.a, I, scale);
      P.block(s[0] - 6, s[1] - 14, 12, 16);
      const major = A.a.k === 'light' && (A.a.lit?.[0]?.r ?? 0) >= 8;
      if ((lab || (detail === 'chart' && major && scale > 0.06)) && A.text) {
        const font = '600 9.5px "Saira Semi Condensed", sans-serif';
        if (P.text(A.text, s[0] + 9, s[1] + 12, font, I.ink, 'left') && major && A.a.name) P.text(A.a.name, s[0] + 9, s[1] + 23, '600 10px "Saira Semi Condensed", sans-serif', I.ink, 'left');
      }
    }
  }
  // soundings, thinned so they never overlap each other or the print: the shoal ones win (feet below MLLW)
  if (detail === 'chart' && scale > 0.05 || detail === 'inset' && scale > 0.6) {
    const cell = 24, taken = new Set<number>(), cols = Math.ceil(w / cell) + 2;
    ctx.font = 'italic 10px "Saira Semi Condensed", Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const q of G.soundings) {
      const s = tf(q.x, q.y); if (!on(s[0], s[1], 0)) continue;
      const ci = Math.floor(s[0] / cell) + 1, cj = Math.floor(s[1] / (cell * 0.6)) + 1, id = cj * cols + ci;
      if (taken.has(id) || taken.has(id - 1) || taken.has(id + 1)) continue;
      if (P.hits(s[0] - 7, s[1] - 6, 14, 12)) continue;
      taken.add(id);
      const ft = Math.round(q.d * FT);
      ctx.fillStyle = q.d < 9.1 ? I.sounding : I.soundingDeep;
      ctx.fillText(String(Math.abs(ft)), s[0], s[1]);
      if (ft < 0) { ctx.fillRect(s[0] - 5, s[1] + 5, 10, 0.8); } // drying heights are underlined
    }
    ctx.textBaseline = 'alphabetic';
  }
  P.flush();
  ctx.restore();
}

/** Places the chart's print so nothing overlaps: each label takes its box, or is left out if the box is taken. */
class Placer {
  private boxes: [number, number, number, number][] = [];
  private queue: { t: string; x: number; y: number; font: string; col: string; align: CanvasTextAlign }[] = [];
  constructor(private ctx: CanvasRenderingContext2D) {}
  hits(x: number, y: number, w: number, h: number): boolean { return this.boxes.some(b => x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]); }
  block(x: number, y: number, w: number, h: number): void { this.boxes.push([x, y, w, h]); }
  /** Queue a label (drawn on flush, over the soundings) if it fits; true if placed. */
  text(t: string, x: number, y: number, font: string, col: string, align: CanvasTextAlign = 'center'): boolean {
    if (!t) return false;
    this.ctx.font = font; const w = this.ctx.measureText(t).width, h = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '10');
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x, y0 = y - h;
    if (this.hits(x0 - 2, y0 - 1, w + 4, h + 3)) return false;
    this.block(x0 - 2, y0 - 1, w + 4, h + 3); this.queue.push({ t, x, y, font, col, align });
    return true;
  }
  flush(): void {
    const c = this.ctx;
    for (const q of this.queue) { c.font = q.font; c.fillStyle = q.col; c.textAlign = q.align; c.fillText(q.t, q.x, q.y); }
    this.queue = [];
  }
}

/** The land again, over what the sim has drawn on the water (puffs and lulls stop at the shore). */
export function drawEncLand(ctx: CanvasRenderingContext2D, tf: Tf, pal: ChartPalette): void {
  const G = built(), I = INK[pal], o = tf(0, 0), ex = tf(1, 0), ey = tf(0, 1), k = Math.hypot(ex[0] - o[0], ex[1] - o[1]) || 1e-9;
  ctx.save(); ctx.transform(ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0], o[1]); ctx.lineJoin = 'round';
  ctx.fillStyle = I.land; ctx.fill(G.land); ctx.fillStyle = I.built; ctx.fill(G.built); ctx.fillStyle = I.structure; ctx.fill(G.structures);
  ctx.strokeStyle = I.coast; ctx.lineWidth = 1 / k; ctx.stroke(G.structures); ctx.stroke(G.piers); ctx.lineWidth = 1.2 / k; ctx.stroke(G.shore);
  ctx.restore();
}

/** Each area kind's line on the chart (widths and dashes in metres on the water: they scale with the chart). */
function areaStroke(k: string, I: Ink): { c: string; w: number; dash: number[] } | null {
  const m = I.magenta;
  switch (k) {
    case 'tssbound': return { c: m, w: 6, dash: [60, 30] };
    case 'sepline': return { c: m, w: 10, dash: [] };
    case 'precaution': return { c: m, w: 5, dash: [40, 25] };
    case 'anchorage': return { c: m, w: 4, dash: [40, 20] };
    case 'berth': return { c: m, w: 2, dash: [10, 8] };
    case 'restricted': return { c: m, w: 3, dash: [40, 12, 6, 12] };
    case 'caution': return { c: m, w: 3, dash: [20, 15] };
    case 'cable': case 'cableline': return { c: m, w: 3, dash: [25, 10, 4, 10] };
    case 'pipeline': return { c: m, w: 3, dash: [25, 10] };
    case 'dumping': return { c: I.contour, w: 3, dash: [20, 12] };
    case 'military': return { c: m, w: 4, dash: [30, 15] };
    case 'fairway': case 'dredged': return { c: I.ink, w: 2.5, dash: [30, 18] };
    case 'deepwater': return { c: m, w: 5, dash: [50, 20] };
    case 'track': case 'navline': return { c: I.ink, w: 2.5, dash: [] };
    case 'ferry': return { c: hexToA(m, 0.55), w: 2, dash: [30, 12, 6, 12] };
    default: return null;
  }
}

const COLOUR: Record<number, string> = { 1: '#ffffff', 2: '#111111', 3: '#d4202c', 4: '#1f9d48', 5: '#1a5fd0', 6: '#f2c418', 7: '#8a8a8a', 8: '#8a5a2b', 9: '#f0a020', 10: '#8040c0', 11: '#ff7a1a', 12: '#c0188f', 13: '#f080b0' };

/** A buoy, beacon or light, by Chart No. 1: the position circle, the buoy's shape in its colours, a daymark, the light's flare. */
function aid(ctx: CanvasRenderingContext2D, x: number, y: number, a: Aid, I: Ink, scale: number): void {
  const z = Math.max(0.75, Math.min(1.3, 0.7 + scale * 1.2));
  const cols = (a.col ?? []).map(c => COLOUR[c] ?? '#888');
  if (a.lit?.length) { // the flare: a magenta teardrop from the position
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI * 0.25); ctx.scale(z, z);
    ctx.fillStyle = hexToA(I.magenta, 0.85); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-4.5, -9, 0, -15); ctx.quadraticCurveTo(4.5, -9, 0, 0); ctx.fill();
    ctx.restore();
  }
  ctx.save(); ctx.translate(x, y); ctx.scale(z, z);
  ctx.strokeStyle = I.ink; ctx.lineWidth = 1;
  if (a.k === 'buoy') {
    // leaning shape above the position: can (2) a parallelogram, nun (1) pointed, others a lozenge
    ctx.save(); ctx.rotate(-Math.PI * 0.17);
    ctx.beginPath();
    if (a.shp === 2) { ctx.rect(-3, -12, 6, 10); }
    else if (a.shp === 1) { ctx.moveTo(-3.5, -2); ctx.lineTo(3.5, -2); ctx.lineTo(0, -12); ctx.closePath(); }
    else { ctx.moveTo(0, -2); ctx.lineTo(3.2, -7.5); ctx.lineTo(0, -13); ctx.lineTo(-3.2, -7.5); ctx.closePath(); }
    if (cols.length > 1 && (a.pat ?? [1]).includes(1)) { // horizontal bands, top colour first
      ctx.save(); ctx.clip(); const n = cols.length, top = -13, hgt = 11;
      cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-5, top + hgt * i / n, 10, hgt / n + 0.3); }); ctx.restore();
    } else if (cols.length > 1) { // vertical stripes
      ctx.save(); ctx.clip(); cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-4 + 8 * i / cols.length, -14, 8 / cols.length + 0.3, 13); }); ctx.restore();
    } else { ctx.fillStyle = cols[0] ?? '#cccccc'; ctx.fill(); }
    ctx.stroke(); ctx.restore();
  } else if (a.k === 'beacon' && a.top != null) {
    // a daymark: red triangles, green squares
    const c = COLOUR[(a.topcol ?? a.col ?? [])[0]] ?? '#888';
    ctx.fillStyle = c; ctx.beginPath();
    if ([19, 21].includes(a.top)) ctx.rect(-3.5, -12, 7, 7); else { ctx.moveTo(-4, -4.5); ctx.lineTo(4, -4.5); ctx.lineTo(0, -12); ctx.closePath(); }
    ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -1.5); ctx.lineTo(0, -4.5); ctx.stroke();
  } else if (a.k === 'beacon' && !a.lit?.length) {
    ctx.fillStyle = cols[0] ?? I.ink; ctx.beginPath(); ctx.moveTo(-3, -1.5); ctx.lineTo(3, -1.5); ctx.lineTo(0, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // the position: a small circle (filled for a light on a fixed structure)
  ctx.beginPath(); ctx.arc(0, 0, a.k === 'buoy' ? 1.8 : 2, 0, 6.29);
  ctx.fillStyle = a.k === 'buoy' ? I.deep : I.ink; ctx.fill(); ctx.stroke();
  ctx.restore();
}

function hazard(ctx: CanvasRenderingContext2D, x: number, y: number, h: Hazard, I: Ink, depthToo: boolean): void {
  ctx.save(); ctx.strokeStyle = I.ink; ctx.fillStyle = I.ink; ctx.lineWidth = 1;
  const awash = h.wl === 4 || h.wl === 5, dries = h.wl === 1 || h.wl === 2;
  if (h.k === 'rock') {
    if (awash || dries) { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 3.5, y - Math.sin(a) * 3.5); ctx.lineTo(x + Math.cos(a) * 3.5, y + Math.sin(a) * 3.5); ctx.stroke(); } }
    else { ctx.beginPath(); ctx.moveTo(x - 3.5, y); ctx.lineTo(x + 3.5, y); ctx.moveTo(x, y - 3.5); ctx.lineTo(x, y + 3.5); ctx.stroke(); }
  } else if (h.k === 'wreck') {
    ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); for (const dx of [-3, 0, 3]) { ctx.moveTo(x + dx, y - 2.5); ctx.lineTo(x + dx, y + 2.5); } ctx.stroke();
  } else {
    ctx.setLineDash([1.5, 1.5]); ctx.beginPath(); ctx.arc(x, y, 4, 0, 6.29); ctx.stroke(); ctx.setLineDash([]);
  }
  if (depthToo && h.d != null) { ctx.font = 'italic 9px Georgia, serif'; ctx.textAlign = 'left'; ctx.fillText(String(Math.round(h.d * FT)), x + 5, y - 4); }
  ctx.restore();
}

/** The outlined arrow that shows which way traffic goes in a lane of a traffic separation scheme. */
function laneArrow(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, L: number, c: string): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.strokeStyle = c; ctx.lineWidth = 1.4;
  const hw = L * 0.09, hl = L * 0.3;
  ctx.beginPath(); ctx.moveTo(-L / 2, -hw); ctx.lineTo(L / 2 - hl, -hw); ctx.lineTo(L / 2 - hl, -hw * 2.4); ctx.lineTo(L / 2, 0);
  ctx.lineTo(L / 2 - hl, hw * 2.4); ctx.lineTo(L / 2 - hl, hw); ctx.lineTo(-L / 2, hw); ctx.closePath(); ctx.stroke();
  ctx.restore();
}

function anchor(ctx: CanvasRenderingContext2D, x: number, y: number, c: string): void {
  ctx.save(); ctx.strokeStyle = c; ctx.lineWidth = 1.3; ctx.beginPath();
  ctx.arc(x, y - 6, 1.6, 0, 6.29); ctx.moveTo(x, y - 4.4); ctx.lineTo(x, y + 4); ctx.moveTo(x - 3, y - 2.5); ctx.lineTo(x + 3, y - 2.5);
  ctx.moveTo(x - 4.5, y + 1); ctx.quadraticCurveTo(x - 4, y + 4.5, x, y + 4.5); ctx.quadraticCurveTo(x + 4, y + 4.5, x + 4.5, y + 1); ctx.stroke(); ctx.restore();
}

function hexToA(hex: string, a: number): string { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

/** Where the chart came from, for the full chart's corner and the docs. */
export function chartCredit(): string {
  const c = ENC.cells, newest = c.map(x => x.issued).sort().pop();
  return `NOAA ENC ${c.length} cells (${c[0].name}–${c[c.length - 1].name}), issued to ${newest} · soundings in feet at MLLW · not for navigation`;
}
