import { describe, expect, it } from 'vitest';
import { pointOfSailWord } from '../src/ui/pointOfSail';
import band from '../src/ui/sailBand.ts?raw';
import hud from '../src/ui/hud.ts?raw';

// The windex names her point of sail (the owner, ROADMAP 8j): in the band's windex and on the wind angle dial. It was
// dropped once by a layout change, so the second test reads both drawings to be sure they still show it.
const at = (twa: number) => pointOfSailWord({ twa, ww: { kt: 10 }, sea: { hsW: 0, tpW: 0 } } as never);

describe('the point of sail', () => {
  it('in one or two words, US spelling', () => {
    expect(at(10)).toBe('Head to wind');
    expect(at(-42)).toBe('Close-hauled');
    expect(at(65)).toBe('Close reach');
    expect(at(90)).toBe('Beam reach');
    expect(at(-125)).toBe('Broad reach');
    expect(at(175)).toBe('Run');
  });
  it('is drawn with the windex in the band and on the dial', () => {
    expect(band).toContain('class="sb-pos"');
    expect(band).toMatch(/put\(wx\.querySelector\('\.sb-pos'\)!, pos\)/);
    expect(hud).toMatch(/const pos = pointOfSailWord\(u\)/); expect(hud).toMatch(/fillText\(pos, cx/);
  });
});
