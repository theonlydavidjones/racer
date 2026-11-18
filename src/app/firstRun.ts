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
 * The start page quiet behind it (docs/FTUE-PLAN.md step 0; the owner, 17 Nov 2026): her alone, sailing, not the setup's
 * race with its fleet, start line, clock and right-of-way hails. The race is the same one the setup built (the same World
 * as ever, so what's filed, built and drawn after it is the same: Capacity's release gate, v206 and v208); only the fleet
 * and the course are hidden in the view, and the game's own displays (body.atHome, 04-screens.css), with `visibility`, so
 * the inset map goes on drawing at its size and readies the race's wind shadows as before.
 */
export function startPageQuiet(on: boolean, view: { quiet(on: boolean): void }): void {
  document.body.classList.toggle('atHome', on); view.quiet(on);
}
