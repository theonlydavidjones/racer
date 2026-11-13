import { describe, expect, it } from 'vitest';
import { airTempC } from '../src/environment/air';

/** Local time on the Bay (Pacific) as minutes since epoch, UTC. */
const at = (iso: string, offsetH: number) => (Date.parse(iso + 'Z') + offsetH * 3600000) / 60000;

describe('The air temperature on the race area (environment/air.ts, NOAA CO-OPS 9414290)', () => {
  it("follows Fort Point's climate: a cool, foggy summer, the warmest afternoons in September and October", () => {
    const jul = airTempC('2027-07-10', at('2027-07-10T14:00:00', 7)), oct = airTempC('2027-10-09', at('2027-10-09T14:00:00', 7)), jan = airTempC('2027-01-09', at('2027-01-09T14:00:00', 8));
    console.log(`14:00 Jan ${jan.c.toFixed(1)} °C (warm ${jan.warmShare}), Jul ${jul.c.toFixed(1)} (${jul.warmShare}), Oct ${oct.c.toFixed(1)} (${oct.warmShare})`);
    expect(jul.c).toBeGreaterThan(12); expect(jul.c).toBeLessThan(18); // (the summer fog: about 15)
    expect(oct.c).toBeGreaterThan(jul.c); // (the Bay's warm season is the autumn)
    expect(oct.warmShare).toBeGreaterThan(0.05); expect(jul.warmShare).toBeLessThan(0.05);
    expect(jan.c).toBeLessThan(oct.c);
  });
  it('warms through the morning and cools by evening', () => {
    const t = (h: number) => airTempC('2027-09-11', at(`2027-09-11T${String(h).padStart(2, '0')}:00:00`, 7)).c;
    expect(t(14)).toBeGreaterThan(t(6));
    expect(t(14)).toBeGreaterThan(t(22));
  });
});
