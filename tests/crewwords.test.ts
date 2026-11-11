import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { DEFAULT_CREW, newCrew } from '../src/boat/crewPhys';
import { beatAngle } from '../src/boat/polar';
import { crewWords, sides } from '../src/ui/crewWords';

// The trim panel's crew line names the side the crew are on, by the tack (owner, Nov 2026: "how do I get them to hike
// on the lee?"). Hiking is always over the windward rail; the leeward side is the other one.
describe('The crew line names the right side on each tack', () => {
  const beat = (tack: 'S' | 'P', W: number) => {
    // starboard tack: the wind over the starboard side (heading west of the wind from 0°); port tack the other way
    const twa = beatAngle(W), b = testBoat({ heading: tack === 'S' ? 360 - twa : twa, kt: 4.5, windKt: W });
    b.tack = tack; b.crew = newCrew(DEFAULT_CREW, tack); sail(b, 20); return b;
  };
  it('windward is the side the wind comes over', () => {
    expect(sides(beat('S', 12))).toMatchObject({ ww: 'starboard', lw: 'port' });
    expect(sides(beat('P', 12))).toMatchObject({ ww: 'port', lw: 'starboard' });
  });
  it('placed to hike: "hiking out on the starboard rail" on starboard tack, the port rail on port', () => {
    for (const tack of ['S', 'P'] as const) {
      const b = beat(tack, 12); b.crew!.place = { across: 'hike', fore: null };
      expect(crewWords(b)).toContain(`You: hiking out on the ${tack === 'S' ? 'starboard' : 'port'} rail`);
    }
  });
  it('placed to leeward: the low side, never "hiking"', () => {
    const b = beat('S', 12); b.crew!.place = { across: 'lee', fore: null };
    const w = crewWords(b); expect(w).toContain('sitting to leeward on the port side'); expect(w).not.toContain('hiking');
  });
  it('on auto it says so, with the wind and her heel', () => {
    const b = beat('P', 16); const w = crewWords(b);
    expect(w.startsWith('Auto: ')).toBe(true); expect(w).toMatch(/\d+ kt/);
  });
});
