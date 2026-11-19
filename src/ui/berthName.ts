import { harborOf, marinaName } from '../geo/marina';

/** The boat editor's Home berth rows. A marina id no longer in the list (an old or hand-edited save) reads as no marina:
 * "Marina: None", and no slip row, never a blank name or "Slip in " with nothing after it. */
export function berthRows(marina: string | undefined): { marina: string; slipRow: string | null } {
  const name = marinaName(marina);
  return { marina: name || 'None', slipRow: name ? `Slip in ${harborOf(marina!)?.short ?? 'port'}`.trim() : null };
}
