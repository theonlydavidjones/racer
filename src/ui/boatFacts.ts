// The boat's particulars as the fleet page shows them (fleet.ts, her page, "The boat"): kept apart from the page so a
// test can read every row for every boat a player can make (tests/boat-facts.test.ts).
import { BOTTOM_COLORS, BRIGHT_FINISH, HULL_COLORS, TEAK_DECKS, type BoatSpec } from '../boat/spec';

/**
 * A color's name: the preset's it matches (any letter case), or "Custom" for one the player mixed in the picker.
 * (The owner's "Bottom: ," report: the page matched presets exactly, so a mixed bottom paint named nothing.)
 */
export function colorLabel(c: string, presets: [string, string][]): string {
  return presets.find(([, x]) => x.toLowerCase() === c.toLowerCase())?.[0] ?? 'Custom';
}

/** Her hull, paint, deck, sails and spars, as [label, text] rows (plain text: the page escapes nothing here but names). */
export function boatFacts(b: BoatSpec): [string, string][] {
  const p = b.perf, ages = { new: 'new', mid: 'midlife', old: 'end of life' } as const;
  const deckish = [...TEAK_DECKS, ...HULL_COLORS];
  return [
    ['Hull', b.hull.material === 'wood' ? 'Wood' : 'Fiberglass'],
    ['Topsides', colorLabel(b.hull.upper, [...HULL_COLORS, BRIGHT_FINISH])],
    ['Bottom', `${colorLabel(b.hull.lower, BOTTOM_COLORS)}, ${p.cleanedWeeks ? `cleaned ${p.cleanedWeeks} wk ago` : 'just cleaned'}`],
    ['Deck', colorLabel(b.deck, deckish)],
    ['Forehatch', b.hatch === 'acrylic' ? 'Smoked acrylic, aluminum frame' : 'Teak'],
    ['Cabin top', b.cabinTop ? colorLabel(b.cabinTop, deckish) : b.deck.startsWith('teak') ? 'Painted canvas' : 'Like the deck'],
    ['Sails', `${b.sails.color === 'black' ? 'Black' : 'White'}; main ${ages[p.mainAge]}, jib ${ages[p.jibAge]}`],
    ['Spars', `${p.mast === 'wood' ? `Spruce mast (${p.mastStiffness})` : 'Aluminum mast'}, ${p.boom === 'wood' ? 'spruce' : 'aluminum'} boom`]
  ];
}
