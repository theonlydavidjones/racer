import type { Settings } from '../settings';
import type { WorldOptions } from '../sim/world';
/**
 * The first run (docs/FTUE-PLAN.md). For now, the start page's wait: index.html shows it marked aria-busy, its cards
 * dimmed and not taking clicks (styles 04-screens), while your saves come back (store/cloud.ts, up to 8 s) and the app
 * loads. Until then a click on a card was simply lost. Called once the app has set itself up: two frames on, so the
 * first frame (the scene behind the page) is drawn and the page is answering clicks before the cards light up.
 */
export function startPageReady(): void {
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('home')?.removeAttribute('aria-busy')));
}

/**
 * The scene behind the start page (docs/FTUE-PLAN.md step 0; the owner, 17 Nov 2026): a quiet cruise, her alone, under
 * way off her cruising start, not the last setup's race (its fleet, start line, clock and right-of-way hails). Her own
 * boat, wind, tide and day as set; only the fleet left out and the slip left for open water (a boat tied up in her slip
 * is no picture). Read-only: the player's own settings are left as they are. Each setup builds its own race on opening.
 */
export function homeScene(S: Settings): { settings: Settings; opts: WorldOptions } {
  return { settings: { ...S, opponents: [], fleet: 0, sailFrom: S.sailFrom === 'slip' ? 'cityfront' : S.sailFrom, sailTo: '' }, opts: { freeSail: true } };
}
