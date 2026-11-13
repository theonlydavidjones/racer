import { sfLocalToUtcMin } from '../environment/tide';
import { sunTimes } from '../environment/sun';

/**
 * Her ensign keeps its hours: by yachting custom it's worn from morning colours at 0800 until evening colours at sunset,
 * and at any hour while she's entering or leaving port. USPS (https://usps.org/f_stuff/etiquett.html): "from 0800 until
 * sunset … also when entering or leaving port, by day or night"; the Seattle Yacht Club the same for a boat at anchor or
 * moored (https://www.seattleyachtclub.org/syc-flag-etiquette). Under way out on the water after dark, flying it is
 * optional by those sources (the CCA: when there's light enough to identify the yacht); here it comes down at sunset and
 * goes up again only for coming into or out of a harbour. "Entering or leaving port" is taken as under way (COLREGS Rule
 * 3(i): not made fast to the shore, not at anchor) inside a harbour's basin (geo/marina.ts inBasin). Racing she flies none at all (sim/world.ts), as now.
 */

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
let cached: { day: string; up: number; down: number } | null = null;

/** Morning and evening colours (UTC minutes) on San Francisco's local day containing `utcMin`. */
export function colourHours(utcMin: number): { up: number; down: number } {
  const day = DAY.format(new Date(utcMin * 60000));
  if (cached?.day !== day) {
    const up = sfLocalToUtcMin(day, '08:00'), set = sunTimes((up + 4 * 60) * 60000).set; // (the sunset of that same day: asked from noon)
    cached = { day, up, down: set / 60000 };
  }
  return { up: cached.up, down: cached.down };
}

/** Whether her ensign is due to fly at `utcMin`: between colours, or entering or leaving a harbour (under way in its basin). */
export function ensignDue(utcMin: number, inHarbor: boolean, underWay: boolean): boolean {
  const { up, down } = colourHours(utcMin);
  return (utcMin >= up && utcMin < down) || (inHarbor && underWay);
}
