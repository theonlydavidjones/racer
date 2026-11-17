/**
 * The first run (docs/FTUE-PLAN.md). For now, the start page's wait: index.html shows it marked aria-busy, its cards
 * dimmed and not taking clicks (styles 04-screens), while your saves come back (store/cloud.ts, up to 8 s) and the app
 * loads. Until then a click on a card was simply lost. Called once the app has set itself up: two frames on, so the
 * first frame (the scene behind the page) is drawn and the page is answering clicks before the cards light up.
 */
export function startPageReady(): void {
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('home')?.removeAttribute('aria-busy')));
}
