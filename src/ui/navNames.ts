import { PLACES, isSpot } from '../sim/places';
import { wrap, type Vec } from '../core/math';

/**
 * The nav strip's name for where she's bound (the owner, 20 Nov 2026, r272): "The player knows where they're going, so
 * this is just a reminder. Should be very brief and not truncated." Her own slip is "Home". A place on the chart, its
 * bare name: no "Off" or "Under the", no "(south side)", nothing after a comma, no light or buoy designation ("Off
 * Alcatraz (south side)" → "Alcatraz"; "Corte Madera Channel light R "2"" → "Corte Madera Channel"). Racing, a mark by
 * its code, as racers call it ("A · St. Felix outer buoy" → "A"). A spot picked on open water, the nearest named place.
 * The longest any of the sim's places comes to is 20 characters ("Oakland Inner Harbor"): tests/navNames.test.ts.
 */
export function shortName(name: string, opts: { race?: boolean; slip?: boolean } = {}): string {
  if (opts.slip) return 'Home';
  if (opts.race && name.includes(' · ')) return name.split(' · ')[0];
  let n = name.includes(' · ') ? name.split(' · ')[1] : name;
  n = n.replace(/\s*\(.*?\)/g, '').replace(/^(Off|Under|North of|South of|East of|West of)\s+/i, '').replace(/^the\s+/i, '')
    .replace(/,.*$/, '').replace(/\s+light\b.*$/i, '').replace(/\s+[RG]\s+"[^"]*".*$/, '').replace(/\s+"[^"]*".*$/, '')
    .replace(/\s+(start mark|outer buoy|mid-channel)$/i, '').replace(/"/g, '').trim();
  return n || name;
}

/** Where she's bound, by the nav strip's rule: a spot on open water takes the nearest named place's name. */
export function destName(d: { name: string; key?: string; p: Vec }, race = false): string {
  if (d.key === 'slip') return 'Home';
  if (isSpot(d.name)) {
    let best = PLACES[0], bd = Infinity;
    for (const pl of PLACES) { const dd = Math.hypot(pl.p.x - d.p.x, pl.p.y - d.p.y); if (dd < bd) { bd = dd; best = pl; } }
    return shortName(best.name);
  }
  return shortName(d.name, { race });
}

/**
 * Can she lay the mark on the tack (or jibe) she's on, with no maneuver to make? (the owner, 20 Nov 2026: VMC when she
 * can lay it, VMG when she must tack or jibe to get there, by the laylines the inset draws.) Angles are measured from
 * where the wind comes from, starboard side negative: on a beat she lays it once its bearing is as far off the wind as
 * her tack's layline track or further (she's on or past the layline); on a run, once it's no further off the wind than
 * her jibe's track (she's on or past the downwind layline). `tracks` are the laylines' ground-track bearings,
 * starboard first (sim/laylines.ts).
 */
export function canLay(bearingToMark: number, windFrom: number, kind: 'up' | 'down', tack: 'S' | 'P', tracks: [number, number]): boolean {
  const a = wrap(bearingToMark - windFrom), sgn = tack === 'S' ? -1 : 1;
  const m = a * sgn, t = Math.abs(wrap(tracks[tack === 'S' ? 0 : 1] - windFrom)); // (her own side's angles, positive)
  if (m < 0) return false; // the mark's on the other tack's side: she has to tack or jibe for it
  return kind === 'up' ? m >= t - 0.5 : m <= t + 0.5;
}
