// Player-facing lines built by joining parts (the owner's "Bottom: ," report, 18 Nov 2026): each part that may be
// missing is dropped, never left as a blank beside its separator. Pure, so tests/readouts.test.ts can sweep them.
import { BRIGHT_FINISH, HULL_COLORS, type BoatSpec } from '../boat/spec';

/** Her topsides' preset name, any letter case, or "Custom-painted" for a color mixed in the picker. */
const topsides = (hex: string) => [...HULL_COLORS, BRIGHT_FINISH].find(([, x]) => x.toLowerCase() === hex.toLowerCase())?.[0] ?? 'Custom-painted';

/** The setup page's one line on the boat picked (app.ts boatSummary): her topsides, hull and condition. */
export function boatSummaryText(b: BoatSpec): string {
  const p = b.perf;
  const cond = [p.cleanedWeeks ? `bottom ${p.cleanedWeeks} wk` : 'clean bottom', p.mainAge === 'new' && p.jibAge === 'new' ? 'new sails' : 'used sails', p.mast === 'wood' ? 'wooden mast' : ''].filter(Boolean).join(', ');
  return `${topsides(b.hull.upper)} ${b.hull.material === 'wood' ? 'wooden' : 'fiberglass'} hull; ${cond}.`;
}

/** The log's line at the start of a session (app/setup.ts): what, from where to where, on which course. */
export function startHead(mode: string, o: { from?: string; dest?: string; course?: string }): string {
  const parts = mode === 'sail' ? ['Cruise', [o.from, o.dest && `to ${o.dest}`].filter(Boolean).join(' ')]
    : [mode === 'drill' ? 'Start practice' : 'Race', o.course];
  return `— ${parts.filter(Boolean).join(' · ')}`;
}
