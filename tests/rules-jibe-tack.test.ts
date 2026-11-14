import { describe, expect, it } from 'vitest';
import { V } from '../src/core/math';
import { wideOfGybe } from '../src/rules/pairs';
import type { RulesMark } from '../src/rules';
import { boat, ctx } from './diagram';

// Rule 18.4: an inside right-of-way boat that must jibe at the mark to sail her proper course sails no farther from it
// than needed until she does. Must she jibe? Her tack is the definition's (Definitions, Tack; Leeward and Windward):
// sailing by the lee or dead downwind, her mainsail's side. Within a few degrees of dead downwind the sim's main stays
// where it is (boat/physics.ts), so a next leg there she sails on the tack she's on: no jibe needed.
describe('Rule 18.4: must she jibe, dead downwind', () => {
  const run = (legCourse: number, tack: 'S' | 'P') => {
    const p = V(legCourse), marks: RulesMark[] = [
      { name: 'M', p: { x: 0, y: 0 }, type: 'round', side: 'p', beat: false },
      { name: 'N', p: { x: p.x * 500, y: p.y * 500 }, type: 'round', side: 'p', beat: false }];
    // (past the mark, 15 m on, sailing on down the next leg's line, away from the mark)
    const b = boat('B', { at: [p.x * 15, p.y * 15], heading: legCourse });
    b.tack = tack;
    return wideOfGybe(b, 0, ctx(10, marks));
  };
  it('the next leg 2° by the lee of her: she sails it on her tack, her main where it is: no jibe owed', () => {
    expect(run(182, 'P')).toBe(false); // (wind from 000°: heading 182 on port is 2° by the lee)
  });
  it('but 20° off dead downwind on her other side, she must jibe: sailing on away from the mark is wide of it', () => {
    expect(run(200, 'P')).toBe(true);
  });
});
