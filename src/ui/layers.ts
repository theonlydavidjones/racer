import type { Settings } from '../settings';

/**
 * The map's layers (the inset map and the full chart): what the sim draws over NOAA's chart, each one on or off, saved
 * with the player's settings. Left unset, a layer follows its default (some follow the training aids, as before).
 */
export type LayerKey = 'wind' | 'current' | 'sea' | 'fog' | 'ships' | 'laylines' | 'shadows';
export const LAYERS: { key: LayerKey; name: string; what: string }[] = [
  { key: 'wind', name: 'Wind', what: 'The wind\'s speed in colour (kt, on the scale) with streaks the way it blows, and the puffs and lulls' },
  { key: 'current', name: 'Current', what: 'The tidal current\'s speed in colour (kt, on the scale) with streaks the way it sets' },
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
 * A layer menu: a button that opens a small list of switches. `get` reads the settings now; `set` saves a change (the
 * app keeps the saved settings and the running race's in step); `changed` redraws.
 */
/** A view that isn't a map layer but is switched from the same menu (the owner, 13 Nov 2026: new controls go inside
 * existing elements, not on new buttons): the wind indicator, the flow view. */
export interface MenuView { name: string; what: string; keyLabel: () => string; on: () => boolean; set: (on: boolean) => void }
export function layerMenu(button: HTMLElement, pop: HTMLElement, get: () => Settings | null, set: (k: LayerKey, on: boolean) => void, changed: () => void,
  key?: (el: HTMLElement, force: boolean) => void, views: MenuView[] = []): () => void {
  let keyEl: HTMLElement | null = null;
  const render = () => {
    const s = get(); if (!s) return;
    // the field (what colours the water) is one of several, or none: radio rows under their own heading, apart from the
    // switches, so it reads as a choice (the owner, 13 Nov 2026: a checkbox acting as a radio button was confusing)
    const f = fieldLayer(s), fields = LAYERS.filter(l => isField(l.key)), rest = LAYERS.filter(l => !isField(l.key));
    pop.innerHTML = '<div class="lp-h">Colour the water <span class="lp-sub">· the full chart</span></div><div class="lp-field" role="radiogroup" aria-label="Colour the water">'
      + [...fields.map(l => ({ v: l.key as string, name: l.name, what: l.what })), { v: 'off', name: 'Off', what: 'The plain chart' }].map(o =>
        `<label title="${o.what}"><input type="radio" name="lp-field" data-field="${o.v}"${(f ?? 'off') === o.v ? ' checked' : ''}><span>${o.name}</span></label>`).join('') + '</div>'
      + '<div class="lp-h lp-kh">Show</div>' + rest.map(l =>
      `<label title="${l.what}"><input type="checkbox" data-layer="${l.key}"${shown(s, l.key) ? ' checked' : ''}><span>${l.name}</span></label>`).join('')
      + (views.length ? '<div class="lp-h lp-kh">Training views</div>' + views.map((v, i) =>
        `<label title="${v.what}"><input type="checkbox" data-view="${i}"${v.on() ? ' checked' : ''}><span>${v.name} <span class="lp-k">${v.keyLabel()}</span></span></label>`).join('') : '')
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
    const t = e.target as HTMLInputElement;
    // a field picked: it on (withLayer puts the others off), or Off: the one showing off
    const fv = t.dataset.field, cur = get() && fieldLayer(get()!);
    const k = (fv ? (fv === 'off' ? cur ?? undefined : fv) : t.dataset.layer) as LayerKey | undefined;
    if (fv) { if (k) { set(k, fv !== 'off'); render(); changed(); if (key && keyEl) setTimeout(() => key(keyEl!, false), 60); } return; }
    if (t.dataset.view != null) { views[+t.dataset.view]?.set(t.checked); render(); return; }
    if (k) { set(k, t.checked); render(); changed(); if (key && keyEl) setTimeout(() => key(keyEl!, false), 60); }
  });
  document.addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target as Node) && e.target !== button) { pop.hidden = true; button.setAttribute('aria-expanded', 'false'); } });
  // (for a change made elsewhere, the chart's field picker: the list and its key follow it if it's open)
  return () => { if (!pop.hidden) render(); };
}
const isField = (k: LayerKey): boolean => (FIELD_LAYERS as readonly string[]).includes(k);
/** Ticked in the menu: a field layer only if it's the one showing (an older save may have two on: one shows). */
const shown = (s: Settings, k: LayerKey): boolean => (FIELD_LAYERS as readonly string[]).includes(k) ? fieldLayer(s) === k : layerOn(s, k);
