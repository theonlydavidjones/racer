import type { Settings } from '../settings';

/**
 * The map's layers (the inset map and the full chart): what the sim draws over NOAA's chart, each one on or off, saved
 * with the player's settings. Left unset, a layer follows its default (some follow the training aids, as before).
 */
export type LayerKey = 'wind' | 'current' | 'sea' | 'fog' | 'ships' | 'laylines' | 'shadows';
export const LAYERS: { key: LayerKey; name: string; what: string }[] = [
  { key: 'wind', name: 'Wind', what: 'The wind\'s speed in color (kt, on the scale) with streaks the way it blows, and the puffs and lulls' },
  { key: 'current', name: 'Current', what: 'The tidal current\'s speed in color (kt, on the scale) with streaks the way it sets' },
  { key: 'sea', name: 'Sea state', what: 'The height of the waves (the wind\'s chop and the ocean swell) from the sim\'s own sea' },
  { key: 'fog', name: 'Fog', what: 'Visibility from the National Weather Service forecast, or as observed, for this day and hour' },
  { key: 'ships', name: 'Ships', what: 'Ships, ferries and tour boats, with where they\'ll be in a minute' },
  { key: 'laylines', name: 'Laylines', what: 'The laylines to your next mark or destination' },
  { key: 'shadows', name: 'Wind shadows', what: 'Where the wind is lighter for what stands upwind: the lee of the land, boats\' dirty air, ships, the committee boat and the bridge piers, as the sails feel it' }
];

const DEFAULT: Record<LayerKey, (s: Settings) => boolean> = {
  wind: () => true, current: () => true, sea: () => false, fog: () => false, ships: () => true,
  laylines: s => !!s.aids, shadows: s => !!s.aids
};
export const layerOn = (s: Settings, k: LayerKey): boolean => s.mapLayers?.[k] ?? DEFAULT[k](s);

/** The layers that colour the whole water: one at a time, as Windy shows them (the owner's choice). */
export const FIELD_LAYERS = ['wind', 'current', 'sea', 'fog'] as const;
export type FieldLayer = typeof FIELD_LAYERS[number];
/** The field layer showing (the first that's on, so an older save with two on shows one), or null. */
export const fieldLayer = (s: Settings): FieldLayer | null => FIELD_LAYERS.find(k => layerOn(s, k)) ?? null;
/** The map layers with `k` switched on or off: a field layer switched on puts the other field layers off. */
export function withLayer(s: Settings, k: LayerKey, on: boolean): NonNullable<Settings['mapLayers']> {
  const m = { ...s.mapLayers, [k]: on };
  if (on && (FIELD_LAYERS as readonly string[]).includes(k)) for (const f of FIELD_LAYERS) if (f !== k) m[f] = false;
  return m;
}

/**
 * The chart's two small menus (the owner, 20 Nov 2026): the Key (what the map's symbols and lines are, a plain list) and
 * the Layers dropdown beside the field picker (the switches for ships, laylines and wind shadows). Each is a button that
 * opens a small pop. `get` reads the settings now; `set` saves a change (the app keeps the saved settings and the running
 * race's in step); `changed` redraws; `key` fills the Key's list (it follows the map while the pop is open).
 */
export function keyMenu(button: HTMLElement, pop: HTMLElement, key: (el: HTMLElement, force: boolean) => void): () => void {
  let keyEl: HTMLElement | null = null;
  const render = () => { pop.innerHTML = '<div class="lp-key"></div>'; keyEl = pop.querySelector('.lp-key'); if (keyEl) key(keyEl, true); };
  // (what's on screen changes as the map moves; rebuilt only when the key would change)
  setInterval(() => { if (!pop.hidden && keyEl) key(keyEl, false); }, 500);
  wirePop(button, pop, render);
  return () => { if (!pop.hidden) render(); };
}
/** The switches: the layers that aren't the field (the field is the chart's big picker). */
export const SWITCH_LAYERS = LAYERS.filter(l => !(FIELD_LAYERS as readonly string[]).includes(l.key));
export const switchesHtml = (s: Settings): string => SWITCH_LAYERS.map(l =>
  `<label title="${l.what}"><input type="checkbox" data-layer="${l.key}"${layerOn(s, l.key) ? ' checked' : ''}><span>${l.name}</span></label>`).join('');
export function layersMenu(button: HTMLElement, pop: HTMLElement, get: () => Settings | null, set: (k: LayerKey, on: boolean) => void, changed: () => void): () => void {
  const render = () => { const s = get(); if (s) pop.innerHTML = switchesHtml(s); };
  wirePop(button, pop, render);
  pop.addEventListener('change', e => {
    const t = e.target as HTMLInputElement, k = t.dataset.layer as LayerKey | undefined;
    if (k) { set(k, t.checked); render(); changed(); }
  });
  return () => { if (!pop.hidden) render(); };
}
/** A button that opens a pop and closes it on a click elsewhere. */
function wirePop(button: HTMLElement, pop: HTMLElement, render: () => void): void {
  button.addEventListener('click', e => { e.stopPropagation(); if (pop.hidden) render(); pop.hidden = !pop.hidden; button.setAttribute('aria-expanded', String(!pop.hidden)); });
  pop.addEventListener('click', e => e.stopPropagation());
  pop.addEventListener('pointerdown', e => e.stopPropagation());
  document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target as Node) && e.target !== button) { pop.hidden = true; button.setAttribute('aria-expanded', 'false'); } });
}
