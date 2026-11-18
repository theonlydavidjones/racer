import { describe, expect, it } from 'vitest';
import { weatherHelmChip } from '../src/ui/weatherHelm';

// The weather-helm chip at the tiller guide's foot (r035, the owner's ruling 18 Nov 2026): "4° weather" / "1° lee", teal
// when balanced (2–5° of weather helm), amber past 8°, light otherwise.
describe('The weather-helm chip (ui/weatherHelm.ts)', () => {
  it('says weather or lee, in whole degrees', () => {
    expect(weatherHelmChip(4.2).text).toBe('4° weather');
    expect(weatherHelmChip(-1.4).text).toBe('1° lee');
    expect(weatherHelmChip(0.3).text).toBe('0°');
  });
  it('teal for a balanced 2–5° of weather helm, amber past 8°, light between and for lee helm', () => {
    for (const a of [2, 3.6, 5]) expect(weatherHelmChip(a).tone, `${a}`).toBe('ok');
    for (const a of [9, 14]) expect(weatherHelmChip(a).tone, `${a}`).toBe('over');
    for (const a of [0, 1, 6, 8, -3]) expect(weatherHelmChip(a).tone, `${a}`).toBe('');
    expect(weatherHelmChip(-12).tone).toBe('over'); // (a lot of lee helm is too much too)
  });
});
