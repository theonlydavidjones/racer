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

/** The setup page's one line on the boat picked (app.ts boatSummary): her topsides, hull and condition. */
export function boatSummaryText(b: BoatSpec): string {
  const p = b.perf;
  const cond = [p.cleanedWeeks ? `bottom ${p.cleanedWeeks} wk` : 'clean bottom', p.mainAge === 'new' && p.jibAge === 'new' ? 'new sails' : 'used sails', p.mast === 'wood' ? 'wooden mast' : ''].filter(Boolean).join(', ');
  const c = colorLabel(b.hull.upper, [...HULL_COLORS, BRIGHT_FINISH]);
  return `${c === 'Custom' ? 'Custom-painted' : c} ${b.hull.material === 'wood' ? 'wooden' : 'fiberglass'} hull; ${cond}.`;
}

/** The log's line at the start of a session (app/setup.ts): what, from where to where, on which course; no blank parts. */
export function startHead(mode: string, o: { from?: string; dest?: string; course?: string }): string {
  const parts = mode === 'sail' ? ['Cruise', [o.from, o.dest && `to ${o.dest}`].filter(Boolean).join(' ')]
    : [mode === 'drill' ? 'Start practice' : 'Race', o.course];
  return `— ${parts.filter(Boolean).join(' · ')}`;
}
