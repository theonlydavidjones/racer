import type { Controls } from '../boat/controls';
import type { LineKey } from '../boat/boat';

/**
 * The sail lines in sailors' words: their names, what each end does to the sail, and when each is used. The trim panel,
 * the sail controls band and the coach share them. On Josephine (the owner's boat) the main's luff is tensioned with
 * the main halyard on its tackle, not a separate downhaul: controls.ts keeps the name `downhaul`, the player sees "Main
 * halyard".
 */
export type CtlKey = Exclude<keyof Controls, 'car'>;
export type LineUiKey = CtlKey | 'carFore' | 'carIn';

/** The lines' names in running text ("the main halyard"). */
export const LINE_NAME: Record<LineKey, string> = {
  mainsheet: 'mainsheet', traveller: 'traveller', backstay: 'backstay', vang: 'vang', outhaul: 'outhaul',
  cunningham: 'Cunningham', downhaul: 'main halyard', jibCunningham: 'jib Cunningham', jibsheet: 'jib sheet', jibsheetW: 'windward jib sheet', car: 'jib cars'
};
/** Their names as labels ("Main halyard"). */
export const LINE_LABEL: Record<LineUiKey, string> = {
  mainsheet: 'Mainsheet', traveller: 'Traveller', backstay: 'Backstay', vang: 'Vang', outhaul: 'Outhaul', cunningham: 'Cunningham',
  downhaul: 'Main halyard', jibCunningham: 'Jib Cunningham', jibsheet: 'Jib sheet', jibsheetW: 'Windward sheet', carFore: 'Car fore–aft', carIn: 'Car in–out'
};

/** What each line does, in a sentence (standard trim practice: controls.ts). */
export const LINE_WHAT: Record<LineUiKey, string> = {
  mainsheet: 'Eased to spill a puff, and on a reach.',
  traveller: 'Light air: up to windward, the sheet eased. Medium: the middle. A breeze or a puff: down to leeward.',
  backstay: 'On in a breeze; its draft moves aft as it goes on, so the Cunningham follows.',
  vang: 'On reaching and running, and upwind only in a real breeze (18 kt and more).',
  outhaul: 'Eased in light air and reaching; on in a breeze upwind.',
  cunningham: 'On as the wind builds and blows the draft aft.',
  downhaul: 'The main halyard on its tackle: pulled tight at the start for the wind range and rarely touched after; the Cunningham fine-tunes it.',
  jibCunningham: 'On as the wind builds.',
  jibsheet: 'The working sheet, on the leeward winch.',
  jibsheetW: 'The lazy sheet, on the windward winch: haul it with the other eased and the jib backs (heaving to).',
  carFore: 'The lazy car, set ready for the next tack; after it:',
  carIn: 'The lazy car, set ready for the next tack; after it:'
};
/**
 * Each line's two ends in sailors' words, and what each end does to the sail: [eased end, its effect, on end, its
 * effect]. From the model in controls.ts: 0 off … 1 bar tight for the strings; the sheets 0 hard in … 1 eased; the
 * traveller −1 windward … +1 leeward; the cars' pins 0 forward / 0 inboard.
 */
export const LINE_ENDS: Record<LineUiKey, [string, string, string, string]> = {
  mainsheet: ['eased', 'boom out, the leech twisted open: less power', 'in', 'boom to the middle, the leech closed: power and pointing'],
  traveller: ['leeward', 'boom off the centreline: depowers', 'windward', 'boom to the middle with the sheet eased, the leech open'],
  backstay: ['eased', 'fuller main, more forestay sag', 'on', 'flatter main, tighter forestay, straighter jib luff'],
  vang: ['off', 'once the sheet is eased, the boom free to rise and the leech twisting open', 'on', 'the boom held down, the leech closed on a reach or run'],
  outhaul: ['eased', 'fuller foot, more power', 'on', 'flatter foot: less power and heel, less drag'],
  cunningham: ['off', 'the luff slack, the draft further aft', 'on', 'the luff tight, the draft pulled forward'],
  downhaul: ['eased', 'the luff slack, the draft further aft', 'tight', 'the luff tight, the draft forward'],
  jibCunningham: ['off', 'the jib\'s draft further aft', 'on', 'the jib\'s draft held forward'],
  jibsheet: ['eased', 'the clew out, the jib twisted open: speed and reaching', 'in', 'the clew in and down: pointing'],
  jibsheetW: ['slack', 'as normal, the jib to leeward', 'hauled', 'the jib backed to windward'],
  carFore: ['forward', 'the leech closed, a fuller foot: power', 'aft', 'the leech open, a flatter foot: depower'],
  carIn: ['inboard', 'a narrow lead: pointing in flat water', 'outboard', 'a wider lead: speed in a chop or reaching']
};
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
/** A line's help, for a hover title: both ends and what they do, then when it's used. */
export function lineHelp(k: LineUiKey): string {
  const [a, ae, b, be] = LINE_ENDS[k], car = k === 'carFore' || k === 'carIn';
  return `${car ? LINE_WHAT[k] + ' ' : ''}${cap(a)}: ${ae}. ${cap(b)}: ${be}.${car ? '' : ' ' + LINE_WHAT[k]}`;
}
