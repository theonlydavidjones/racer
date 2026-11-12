import type { World } from '../../src/sim/world';
import { legacyKnobs } from '../../src/ai/skipper';

/** Every AI boat's skipper made neutral: the AI's numbers from before the skipper model and no misjudgements, for the
 * tests of how the AI sails (the leeway, the crab, the rules' moves) rather than how well. */
export function neutralSkippers(w: World): World {
  for (const b of w.boats) if (b.ai) { b.ai.kn = legacyKnobs(b.ai.aware); b.ai.mind = undefined; }
  return w;
}
