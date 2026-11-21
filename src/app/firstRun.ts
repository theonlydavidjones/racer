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

/** The pages between the start page and the water (the Race page, Practice and the drills' setups, Past races, the season,
 * the Yacht Club's lists). */
const MENUS = ['raceChoose', 'pastView', 'setup', 'drillView', 'seasonView', 'fleet'];
/**
 * The game's displays hidden behind those pages, as behind the start page (the first-hour audit, 21 Nov 2026: a stopped
 * race clock, the start line and the coach showed behind them). Kept by watching the pages themselves, so every way in
 * and out is covered; not in the showroom (her page and the editor have their own bar), nor once she's sailing.
 */
export function watchMenus(): void {
  const els = MENUS.map(id => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
  const set = () => document.body.classList.toggle('atMenu', els.some(e => !e.hidden) && !document.body.classList.contains('showroom'));
  const mo = new MutationObserver(set);
  for (const e of els) mo.observe(e, { attributes: true, attributeFilter: ['hidden'] });
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] }); // (the showroom coming and going)
  set();
}
