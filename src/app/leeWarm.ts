import type { Vec } from '../core/math';
import { harborLeeDeficit } from '../environment/harborLee';
import type { SimView } from '../sim/host';

/**
 * The harbors' lee (environment/harborLee.ts) filed ahead, in the page's idle time, over the waters of the race just set
 * up. Each 50 m cell's list of the walls and sheds that can shelter it is worked out the first time anything asks about
 * it, and the race's inset map asks about hundreds at once when it first draws the wind shadows (ui/shadowLayer.ts).
 * While a race sat behind the start page that happened before the race began; with the start page's quiet cruise
 * (app/firstRun.ts) it fell into the race's first minute, 2 to 3 ms a frame (Capacity's release gate, v206). Filed here
 * while you're in the setup instead. Only the page's own copy is filed (the inset reads it); the answers are the same.
 */
export const LEE_WARM_CELL = 50, LEE_WARM_MARGIN = 800;

/** The race's waters: the course's marks, its line and center, and where she starts. */
export function raceWaters(w: Pick<SimView, 'C' | 'user'>): Vec[] {
  const C = w.C, out: Vec[] = [...C.marks.map(m => m.p), C.center, { x: w.user.x, y: w.user.y }];
  if (C.committee) out.push(C.committee); if (C.pin) out.push(C.pin);
  return out;
}

/** One point in every 50 m cell over the box round `waters` (with the margin), nearest `from` first. (On a lattice 50 m
 * apart, each 50 m cell of any other grid holds exactly one of its points.) */
export function leeWarmPoints(waters: Vec[], from: Vec): Vec[] {
  const x0 = Math.min(...waters.map(p => p.x)) - LEE_WARM_MARGIN, x1 = Math.max(...waters.map(p => p.x)) + LEE_WARM_MARGIN;
  const y0 = Math.min(...waters.map(p => p.y)) - LEE_WARM_MARGIN, y1 = Math.max(...waters.map(p => p.y)) + LEE_WARM_MARGIN;
  const pts: { p: Vec; d: number }[] = [];
  for (let y = y0; y <= y1; y += LEE_WARM_CELL) for (let x = x0; x <= x1; x += LEE_WARM_CELL) pts.push({ p: { x, y }, d: Math.hypot(x - from.x, y - from.y) });
  return pts.sort((a, b) => a.d - b.d).map(q => q.p);
}

let queue: Vec[] = [], at = 0, windFrom = 0, running = false;
/** Start (or start again, for a new race) filing her race's waters, a few ms at a time when the page is idle. */
export function warmLeeIdle(w: Pick<SimView, 'C' | 'user' | 'wind'>): void {
  queue = leeWarmPoints(raceWaters(w), w.user); at = 0; windFrom = w.wind.from;
  if (running) return; running = true;
  const idle = (cb: (ms: number) => void) => typeof requestIdleCallback === 'function' ? requestIdleCallback(d => cb(Math.max(0, d.timeRemaining() - 1)), { timeout: 1000 }) : setTimeout(() => cb(4), 50);
  const tick = (ms: number) => {
    const t0 = performance.now();
    // (any wind direction files the cell for all of them; a point outside every harbor's reach is passed at once)
    while (at < queue.length && performance.now() - t0 < ms) harborLeeDeficit(queue[at++], windFrom);
    if (at < queue.length) idle(tick); else { running = false; queue = []; }
  };
  idle(tick);
}
