import type { Vec } from '../core/math';
import { PLACES, place } from '../sim/places';
import { nearFeature } from '../sim/brief';
import { isSpot } from '../sim/places';
export { isRemovedSpot } from '../settings';

/**
 * What the player can pick on the charts (the owner, 20 Nov 2026: "remove them from the pickers too"): her slip, the racing
 * marks and buoys, or any water they click. The old named spots ("Off Crissy Field", "Under the Golden Gate Bridge",
 * "Cityfront, off the yacht clubs" and the rest) stay in sim/places.ts as plain positions for the AI and the tests, which
 * start from them, but none is drawn, snapped to or offered.
 */
export const PICKABLE = PLACES.filter(p => p.buoy);
/** A spot clicked on the water, by the nearest place's bare name; never its coordinates. */
export const spotName = (p: Vec): string => nearFeature(p, 9000) ?? 'open water';
/** A place as the player reads it: "Home" for her slip, a mark by its name, any other spot by the nearest place. */
export function placeLabel(id: string | undefined): string {
  if (id === 'slip') return 'Home';
  if (!id) return 'nowhere in particular';
  const pl = place(id);
  return !pl ? '?' : pl.buoy ? pl.name : spotName(pl.p);
}
/** A destination as the player reads it: a spot picked on the water (named by coordinates in the sim) by the nearest place. */
export const destName = (d: { name: string; p: Vec }): string => isSpot(d.name) ? spotName(d.p) : d.name;
