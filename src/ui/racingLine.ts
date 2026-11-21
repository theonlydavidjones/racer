/**
 * The Strategist card's racing line (r298, ROADMAP 8s19; the owner, 21 Nov 2026: one card, two lines, "treat both as the
 * strategist"): when no rules situation is on (that line is the situation's own, hud.ts), the next most pertinent
 * racing line, from what the page already works out, never a second opinion:
 *   1. over early (the line card's own call);
 *   2. a penalty owed (the turns to do);
 *   3. the start in its last minute (the line card's time to burn, or time to the line);
 *   4. the strategist's call on this leg (the C view's own brief, when it has worked the day out), unless it's open.
 * One line, short; a tag to say whose it is.
 */
import type { Boat } from '../boat/boat';
import { sailNo } from '../boat/spec';

export interface RacingLineIn {
  over: boolean;
  /** Turns owed (0: none), and of how many degrees (360 one turn, 720 two). */
  penalty: number; penaltyDeg: number;
  /** Seconds to the gun (negative after it). */
  toGun: number;
  /** The line card's words for the last minute: time to burn, or time to the line. */
  burnS: number | null; toLineS: number | null;
  /** The strategist's call on her leg (the C view's brief), if it's worked one out. */
  leg: { name: string; best: 'left' | 'right' | 'middle'; certainty: 'clear' | 'likely' | 'open' } | null;
}
export interface RacingLine { tag: string; text: string; kind: 'alarm' | 'go' | 'plan' }

export function racingLine(i: RacingLineIn): RacingLine | null {
  if (i.over) return { tag: 'OCS', text: 'Over early: dip back below the line', kind: 'alarm' };
  if (i.penalty > 0) return { tag: 'PEN', text: i.penaltyDeg >= 720 ? 'Do your two turns now' : 'Do your turn now', kind: 'alarm' };
  if (i.toGun > 0 && i.toGun <= 60) {
    if (i.burnS != null && i.burnS >= 1) return { tag: 'START', text: `Burn ${Math.round(i.burnS)} s, then go for the line`, kind: 'go' };
    if (i.toLineS != null) return { tag: 'START', text: `${Math.round(i.toLineS)} s to the line: go`, kind: 'go' };
  }
  if (i.leg && i.leg.certainty !== 'open') return { tag: 'PLAN', text: `${i.leg.name}: the ${i.leg.best}${i.leg.best === 'middle' ? '' : ' side'} pays`, kind: 'plan' };
  return null;
}

/** A boat as a race message names her (the owner, 21 Nov 2026): her country and sail number; the club's default boats
 *  (Red, Blue, Varnish …, which have no sail plan of their own) by name. */
export const boatLabel = (b: Pick<Boat, 'name' | 'spec'>): string => b.spec ? sailNo(b.spec) : b.name;
