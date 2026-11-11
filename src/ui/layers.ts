import type { Settings } from '../settings';

/**
 * The map's layers (the inset map and the full chart): what the sim draws over NOAA's chart, each one on or off, saved
 * with the player's settings. Left unset, a layer follows its default (some follow the training aids, as before).
 */
export type LayerKey = 'wind' | 'current' | 'sea' | 'fog' | 'ships' | 'laylines' | 'shadows';
export const LAYERS: { key: LayerKey; name: string; what: string }[] = [
  { key: 'wind', name: 'Wind', what: 'The wind across the course (darker where it blows harder, hatched where lighter) and the puffs and lulls' },
  { key: 'current', name: 'Current', what: 'The tidal current: arrows the way it sets, longer where it runs faster' },
  { key: 'sea', name: 'Sea state', what: 'The height of the waves (the wind\'s chop and the ocean swell) from the sim\'s own sea' },
  { key: 'fog', name: 'Fog', what: 'Visibility from the National Weather Service forecast, or as observed, for this day and hour' },
  { key: 'ships', name: 'Ships', what: 'Ships, ferries and tour boats, with where they\'ll be in a minute' },
  { key: 'laylines', name: 'Laylines', what: 'The laylines to your next mark or destination' },
  { key: 'shadows', name: 'Wind shadows', what: 'Each boat\'s dirty air downwind of her sails' }
];

const DEFAULT: Record<LayerKey, (s: Settings) => boolean> = {
  wind: () => true, current: () => true, sea: () => false, fog: () => false, ships: () => true,
  laylines: s => !!s.aids, shadows: s => !!s.aids
};
export const layerOn = (s: Settings, k: LayerKey): boolean => s.mapLayers?.[k] ?? DEFAULT[k](s);

/**
 * A layer menu: a button that opens a small list of switches. `get` reads the settings now; `set` saves a change (the
 * app keeps the saved settings and the running race's in step); `changed` redraws.
 */
export function layerMenu(button: HTMLElement, pop: HTMLElement, get: () => Settings | null, set: (k: LayerKey, on: boolean) => void, changed: () => void,
  key?: (el: HTMLElement, force: boolean) => void): void {
  let keyEl: HTMLElement | null = null;
  const render = () => {
    const s = get(); if (!s) return;
    pop.innerHTML = '<div class="lp-h">Map layers</div>' + LAYERS.map(l =>
      `<label title="${l.what}"><input type="checkbox" data-layer="${l.key}"${layerOn(s, l.key) ? ' checked' : ''}><span>${l.name}</span></label>`).join('')
      + (key ? '<div class="lp-h lp-kh">Key: what\'s on the map</div><div class="lp-key"></div>' : '');
    keyEl = pop.querySelector('.lp-key');
    if (key && keyEl) key(keyEl, true);
  };
  // the key follows the map while the list is open (what's on screen changes as it moves); rebuilt only when it changes
  setInterval(() => { if (!pop.hidden && key && keyEl) key(keyEl, false); }, 500);
  button.addEventListener('click', e => { e.stopPropagation(); if (pop.hidden) render(); pop.hidden = !pop.hidden; button.setAttribute('aria-expanded', String(!pop.hidden)); });
  pop.addEventListener('click', e => e.stopPropagation());
  pop.addEventListener('pointerdown', e => e.stopPropagation());
  pop.addEventListener('change', e => {
    const t = e.target as HTMLInputElement, k = t.dataset.layer as LayerKey | undefined;
    if (k) { set(k, t.checked); changed(); if (key && keyEl) setTimeout(() => key(keyEl!, false), 60); }
  });
  document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target as Node) && e.target !== button) { pop.hidden = true; button.setAttribute('aria-expanded', 'false'); } });
}
