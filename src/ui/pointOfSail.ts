import type { Boat } from '../boat/boat';
import { beatFor } from '../boat/seaway';

/**
 * Her point of sail from the true wind angle: head to wind (in irons), close-hauled (to her beat angle and a little
 * more), a close reach, a beam reach (80–100°), a broad reach, a run (from 160°).
 */
export function pointOfSail(u: Pick<Boat, 'twa'> & Parameters<typeof beatFor>[0]): { short: string; long: string } {
  const a = Math.abs(u.twa), beat = beatFor(u);
  const [short, long] = a < 30 ? ['head to wind', 'head to wind'] : a < beat + 7 ? ['close-hauled', 'close-hauled']
    : a < 80 ? ['close reach', 'on a close reach'] : a <= 100 ? ['beam reach', 'on a beam reach']
    : a < 160 ? ['broad reach', 'on a broad reach'] : ['run', 'running'];
  return { short, long };
}
/** The point of sail as the windex and the dial show it: one or two words, capitalized ("Broad reach"). */
export const pointOfSailWord = (u: Parameters<typeof pointOfSail>[0]): string => { const s = pointOfSail(u).short; return s[0].toUpperCase() + s.slice(1); };
