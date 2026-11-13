import { boomAngle, carLead, jibAngle, jibsheetFor, loadedCar, type Controls } from '../boat/controls';
import type { Tack } from '../boat/boat';
import { D2R } from '../core/math';

/**
 * Rope through the hand, for the sail band's inch ticks (the "middle way" the owner asked to see, 13 Nov 2026: the band's
 * marks unchanged, with inches of rope marked on each line; shipped on the owner's go, 13 Nov 2026, after seeing it in
 * situ: reference/design/bandscale/in-situ). The figures are Rigging's (reference/design/sheet-geometry.md and their
 * note of 13 Nov 2026), measured on Josephine where they say so, else their estimates.
 */
const IN = 0.0254;

/** The tension lines: inches of rope from off to full on. Each line works the sail evenly over its travel in the sim, so
 * its ticks are evenly spaced (the backstay's bridle isn't really even: its purchase grows as its apex comes down; drawn
 * evenly until its curve is worked). */
export const ROPE_IN: Partial<Record<keyof Controls, { inches: number; even: boolean; note: string }>> = {
  vang: { inches: 4 * 6.5 / 2.54, even: true, note: '4:1 (parts read off a photo), 5–8 cm at the boom: an estimate' },
  outhaul: { inches: 3 / 2.54, even: true, note: '1:1 to the clew, 3 cm of travel (North Sails)' },
  cunningham: { inches: 6.5 / 2.54, even: true, note: '1:1, 5–8 cm at the cringle: an estimate' },
  jibCunningham: { inches: 6.5 / 2.54, even: true, note: '1:1, a few cm: an estimate' },
  downhaul: { inches: 2 * 5 / 2.54, even: true, note: '2:1 at the mast foot, a few cm at the head: an estimate' },
  jibHalyard: { inches: 2 * 5 / 2.54, even: true, note: '2:1 at the mast foot, a few cm at the head: an estimate' },
  backstay: { inches: 1.4 / IN, even: false, note: 'a bridle, about 1.3–1.5 m of rope: an estimate, and uneven in truth (drawn evenly)' }
};

/** The mainsheet: four parts between the boom's blocks, 2.957 m aft of the gooseneck, and the traveller car 0.75 m below
 * them (measured), the car ±0.5 m on its track. Rope eased from two-blocked (the blocks right over the car), inches, for
 * a boom angle off the centreline (to leeward) and the traveller (+1 to leeward). The shroud stops the boom near 70°. */
const MS = { r: 2.957, h: 0.75, parts: 4, trav: 0.5 };
export function mainsheetIn(boomDeg: number, traveller: number): number {
  const th = Math.abs(boomDeg) * D2R, car = MS.trav * traveller;
  const lat = MS.r * Math.sin(th) - car, aft = MS.r * (1 - Math.cos(th));
  const lat0 = 0; // two-blocked: the blocks straight over the car
  return Math.max(0, MS.parts * (Math.hypot(MS.h, lat, aft) - Math.hypot(MS.h, lat0)) / IN);
}
/** The boom angle with `inches` of mainsheet eased (inverse of mainsheetIn). */
export function boomAtIn(inches: number, traveller: number): number {
  let lo = Math.max(0, Math.asin(Math.max(-1, Math.min(1, MS.trav * traveller / MS.r))) / D2R), hi = 85;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (mainsheetIn(m, traveller) < inches) lo = m; else hi = m; }
  return lo;
}

/** The jib sheet: 1:1 from the clew (LP 2.36 m from the tack) through the car's block, 2.65 m from the tack at its lead
 * angle and about 0.4 m below the clew (Rigging's geometry; 1.9 m from hard in to 68°). Inches eased from hard in. */
const JS = { lp: 2.36, car: 2.65, drop: 0.4 };
const jibSpan = (phi: number, lead: number) => Math.hypot(JS.lp * Math.sin(phi * D2R) - JS.car * Math.sin(lead * D2R), JS.lp * Math.cos(phi * D2R) - JS.car * Math.cos(lead * D2R), JS.drop);
export function jibsheetIn(c: Controls, tack: Tack): number {
  const lead = carLead(loadedCar(c, tack).ins);
  return Math.max(0, (jibSpan(jibAngle(c, tack), lead) - jibSpan(lead, lead)) / IN);
}
/** The sheet setting (0 hard in … 1 eased) with `inches` of jib sheet eased (inverse of jibsheetIn). */
export function jibsheetAtIn(inches: number, c: Controls, tack: Tack): number {
  const lead = carLead(loadedCar(c, tack).ins);
  let lo = lead, hi = 68;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if ((jibSpan(m, lead) - jibSpan(lead, lead)) / IN < inches) lo = m; else hi = m; }
  return jibsheetFor(lo, c, tack);
}
/** The jib sheet's whole run, hard in to 68°, inches. */
export const jibsheetTotal = (c: Controls, tack: Tack) => { const lead = carLead(loadedCar(c, tack).ins); return (jibSpan(68, lead) - jibSpan(lead, lead)) / IN; };
/** Where the boom is for the controls (the band's marker): re-exported for the ticks' own use. */
export { boomAngle };
