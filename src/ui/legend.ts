import { AREA_NAME, INK, areaPen, type ChartPalette, type Detail, type Ink } from './encChart';
import { PEN } from './draw2d';
import { CURRENT_RAMP, WIND_RAMP, rampColor } from './flow';

/*
 * The map's key: what each line and symbol on it means, listing only what's on the map now (the sim's overlays that
 * are switched on and in play, and the chart's line kinds on screen). Each sample is drawn with the map's own colours
 * and pens (encChart.ts INK and areaPen, draw2d.ts PEN), so the key can't drift from the map.
 */

export type SimKey = 'you' | 'boats' | 'start' | 'marks' | 'next' | 'dest' | 'destline' | 'track' | 'laylines' | 'ships' | 'current' | 'wind' | 'puffs' | 'sea' | 'fog' | 'shadows';
type Draw = (g: CanvasRenderingContext2D, I: Ink, w: number, h: number) => void;

const line = (g: CanvasRenderingContext2D, w: number, h: number, pen: { w: number; dash: number[]; halo?: number }, color: string, halo?: string) => {
  const y = h / 2;
  if (pen.halo && halo) { g.strokeStyle = halo; g.lineWidth = pen.halo; g.setLineDash([]); g.beginPath(); g.moveTo(3, y); g.lineTo(w - 3, y); g.stroke(); }
  g.strokeStyle = color; g.lineWidth = pen.w; g.setLineDash(pen.dash); g.beginPath(); g.moveTo(3, y); g.lineTo(w - 3, y); g.stroke(); g.setLineDash([]);
};
const dot = (g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, I: Ink, edge = true) => {
  g.fillStyle = I.halo; g.beginPath(); g.arc(x, y, r + 2.2, 0, 6.29); g.fill();
  g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill(); if (edge) { g.strokeStyle = I.edge; g.lineWidth = 1.2; g.stroke(); }
};
const boat = (g: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string, I: Ink, you: boolean) => {
  g.save(); g.translate(x, y); g.rotate(Math.PI / 2); g.lineJoin = 'round';
  g.beginPath(); g.moveTo(0, -s * 1.6); g.lineTo(s * 0.8, s); g.lineTo(-s * 0.8, s); g.closePath();
  g.strokeStyle = I.halo; g.lineWidth = you ? 5 : 3.5; g.stroke(); g.fillStyle = fill; g.fill(); g.strokeStyle = I.edge; g.lineWidth = you ? 1.6 : 1.1; g.stroke();
  g.restore();
  if (you) { g.strokeStyle = I.you; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, s * 1.9, 0, 6.29); g.stroke(); }
};

/** A sample of a flow layer: its colours from calm to strong, with a streak over them. */
const flowSample = (g: CanvasRenderingContext2D, w: number, h: number, ramp: typeof WIND_RAMP, max: number) => {
  for (let x = 2; x < w - 2; x++) { const c = rampColor(ramp, (x - 2) / (w - 4) * max); g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; g.fillRect(x, 1, 1, h - 2); }
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.3; g.lineCap = 'round'; g.beginPath(); g.moveTo(8, h / 2); g.lineTo(w - 8, h / 2); g.stroke();
};

const SIM: { key: SimKey; name: string; draw: Draw }[] = [
  { key: 'you', name: 'You', draw: (g, I, w, h) => boat(g, w / 2, h / 2, 4, I.you, I, true) },
  { key: 'boats', name: 'Other boats (in their colors)', draw: (g, I, w, h) => { boat(g, w / 2 - 8, h / 2, 3.4, '#c8302a', I, false); boat(g, w / 2 + 8, h / 2, 3.4, '#f3f1ea', I, false); } },
  { key: 'start', name: 'Start and finish line', draw: (g, I, w, h) => line(g, w, h, PEN.start, I.line, I.halo) },
  { key: 'marks', name: 'Course marks (the zone ring with the aids)', draw: (g, I, w, h) => dot(g, w / 2, h / 2, 4, I.mark, I) },
  { key: 'next', name: 'Your next mark', draw: (g, I, w, h) => dot(g, w / 2, h / 2, 5, I.markHi, I) },
  { key: 'dest', name: 'Where you\'re heading', draw: (g, I, w, h) => { const x = w / 2, y = h / 2; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 5, y); g.lineTo(x, y + 6); g.lineTo(x - 5, y); g.closePath(); g.lineJoin = 'round'; g.strokeStyle = I.halo; g.lineWidth = 4; g.stroke(); g.fillStyle = I.mark; g.fill(); g.strokeStyle = I.edge; g.lineWidth = 1.2; g.stroke(); } },
  { key: 'destline', name: 'The navigator\'s route there', draw: (g, I, w, h) => line(g, w, h, PEN.dest, I.line, I.halo) },
  { key: 'track', name: 'The course she\'d sail leaving now (tacks ▲, gybes ○)', draw: (g, I, w, h) => { const y = h / 2; g.lineJoin = 'round'; const z = () => { g.beginPath(); g.moveTo(3, y + 3); g.lineTo(w * 0.35, y - 4); g.lineTo(w * 0.65, y + 4); g.lineTo(w - 3, y - 3); }; g.strokeStyle = I.halo; g.lineWidth = PEN.track.halo; z(); g.stroke(); g.strokeStyle = I.you; g.lineWidth = PEN.track.w; z(); g.stroke(); } },
  { key: 'laylines', name: 'Laylines over the ground, allowing for the current: starboard tack (green), port tack (red)', draw: (g, I, w, h) => { line(g, w / 2 - 1, h, PEN.layline, I.starboard, I.halo); g.save(); g.translate(w / 2 + 1, 0); line(g, w / 2 - 1, h, PEN.layline, I.port, I.halo); g.restore(); } },
  { key: 'ships', name: 'Ship, and where she\'ll be in a minute', draw: (g, I, w, h) => { const y = h / 2; g.lineCap = 'round'; g.strokeStyle = I.shipHalo; g.lineWidth = 6.5; g.beginPath(); g.moveTo(4, y); g.lineTo(16, y); g.stroke(); g.strokeStyle = I.ship; g.lineWidth = 3.5; g.stroke(); g.lineCap = 'butt'; g.globalAlpha = PEN.ahead.alpha; g.lineWidth = PEN.ahead.w; g.setLineDash(PEN.ahead.dash); g.beginPath(); g.moveTo(16, y); g.lineTo(w - 3, y); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; } },
  { key: 'current', name: 'Current: its speed in color (kt: the scale on the chart), streaks the way it sets', draw: (g, _I, w, h) => flowSample(g, w, h, CURRENT_RAMP, 3) },
  { key: 'wind', name: 'Wind: its speed in color, the puffs and lulls with it (kt: the scale on the chart), streaks the way it blows', draw: (g, _I, w, h) => flowSample(g, w, h, WIND_RAMP, 30) },
  { key: 'puffs', name: 'Puffs (dark) and lulls (pale) drifting down the course', draw: (g, _I, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2.5); gr.addColorStop(0, 'rgba(8,22,40,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } },
  { key: 'sea', name: 'Sea state: wave height (chop and swell together), the arrow the way the swell runs', draw: (g, I, w, h) => { g.lineCap = 'round'; for (const [lw, c] of [[4, I.halo], [1.8, I.seaMark]] as const) { g.strokeStyle = c; g.lineWidth = lw; g.beginPath(); g.moveTo(4, h / 2); g.lineTo(w - 5, h / 2); g.moveTo(w - 5, h / 2); g.lineTo(w - 10, h / 2 - 3.5); g.moveTo(w - 5, h / 2); g.lineTo(w - 10, h / 2 + 3.5); g.stroke(); } } },
  { key: 'fog', name: 'Fog: gray where visibility is low (real readings)', draw: (g, I, w, h) => { g.fillStyle = I.fog(0.45); g.fillRect(2, 1, w - 4, h - 2); } },
  { key: 'shadows', name: 'Wind shadow: lighter wind behind land, boats, ships, piers (darker = lighter wind)', draw: (g, _I, w, h) => { const gr = g.createLinearGradient(3, 0, w - 3, 0); gr.addColorStop(0, 'rgba(74,32,140,.85)'); gr.addColorStop(0.8, 'rgba(74,32,140,.3)'); gr.addColorStop(1, 'rgba(235,228,250,.35)'); g.fillStyle = gr; g.fillRect(3, 2, w - 6, h - 4); } }
];

/** The chart's line kinds, in the order the key lists them (what US Chart No. 1 shows in magenta first). */
export const CHART_ORDER = ['tssbound', 'sepline', 'lane', 'precaution', 'deepwater', 'anchorage', 'berth', 'restricted', 'caution', 'military', 'cable', 'cableline', 'pipeline', 'dumping', 'ferry', 'fairway', 'dredged', 'track', 'navline'];

function laneSample(g: CanvasRenderingContext2D, I: Ink, w: number, h: number): void {
  const L = w - 8, x = w / 2, y = h / 2, hw = L * 0.09, hl = L * 0.3;
  g.save(); g.translate(x, y); g.strokeStyle = I.magenta; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(-L / 2, -hw); g.lineTo(L / 2 - hl, -hw); g.lineTo(L / 2 - hl, -hw * 2.4); g.lineTo(L / 2, 0); g.lineTo(L / 2 - hl, hw * 2.4); g.lineTo(L / 2 - hl, hw); g.lineTo(-L / 2, hw); g.closePath(); g.stroke();
  g.restore();
}

const SW = 44, SH = 14;
/** Fill `el` with the key: the sim's overlays in play (`sim`), then the chart's line kinds on screen (`chart`). */
export function renderKey(el: HTMLElement, sim: SimKey[], chart: Set<string>, pal: ChartPalette, detail: Detail, pxPerM: number): void {
  const I = INK[pal], dpr = Math.min(2, devicePixelRatio || 1);
  el.innerHTML = '';
  const row = (name: string, draw: Draw) => {
    const r = document.createElement('div'); r.className = 'lk-row';
    const c = document.createElement('canvas'); c.width = SW * dpr; c.height = SH * dpr; c.style.width = `${SW}px`; c.style.height = `${SH}px`;
    const g = c.getContext('2d')!; g.scale(dpr, dpr); g.fillStyle = pal === 'day' ? '#ffffff' : I.deep; g.fillRect(0, 0, SW, SH); draw(g, I, SW, SH);
    const s = document.createElement('span'); s.textContent = name;
    r.append(c, s); el.append(r);
  };
  const head = (t: string) => { const d = document.createElement('div'); d.className = 'lk-h'; d.textContent = t; el.append(d); };
  const mine = SIM.filter(e => sim.includes(e.key));
  if (mine.length) { head('On the map'); for (const e of mine) row(e.name, e.draw); }
  const kinds = CHART_ORDER.filter(k => chart.has(k));
  if (kinds.length) {
    head('NOAA chart (US Chart No. 1)');
    // (a sample at the chart's scale, at least 0.25 px/m so its dashes show, drawn with the map's own pen)
    for (const k of kinds) row(AREA_NAME[k] ?? k, k === 'lane' ? laneSample : (g, I2, w, h) => { const p = areaPen(k, I2, Math.max(0.25, pxPerM), detail); if (p) line(g, w, h, { w: p.w, dash: p.dash }, p.c); });
  }
}
/** A short string that changes when the key would: so it's rebuilt only then. */
export const keySig = (sim: SimKey[], chart: Set<string>, pal: string) => `${pal}|${sim.join(',')}|${[...chart].sort().join(',')}`;
