import { describe, expect, it } from 'vitest';
import { waveFt } from '../src/ui/mapLayers';

// chart audit #7: the Waves layer gave heights in meters ("1.0 m") while the setup and the HUD give the sea in feet.
describe('wave heights on the chart (chart audit #7)', () => {
  it('in feet, as the HUD writes them', () => {
    expect(waveFt(0.1)).toBe('0.3 ft');
    expect(waveFt(0.3)).toBe('1.0 ft');
    expect(waveFt(1.0)).toBe('3 ft');
    expect(waveFt(2.0)).toBe('7 ft');
  });
});
