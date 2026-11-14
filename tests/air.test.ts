import { describe, expect, it } from 'vitest';
import { airTempC, dayWindOf, warmDay } from '../src/environment/air';
import { dayWeather } from '../src/environment/weather';
import { LL } from '../src/geo/geo';
import climate from '../src/environment/data/sf-air-climate.json';

/** Local time on the Bay (Pacific) as minutes since epoch, UTC. */
const at = (iso: string, offsetH: number) => (Date.parse(iso + 'Z') + offsetH * 3600000) / 60000;

describe("The air temperature on the race area (environment/air.ts, NOAA CO-OPS's shore stations)", () => {
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
  it("on days with only the climate, warm as often as Fort Point's days were (12:00–16:59), the same day for everyone", () => {
    const share = (month: number) => {
      let warm = 0, n = 0;
      for (let y = 2030; y < 2080; y++) for (let d = 1; d <= 28; d++) { if (warmDay(`${y}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`, LL(37.806305, -122.46589))) warm++; n++; }
      return warm / n;
    };
    const oct = share(10), jul = share(7);
    console.log(`climate-only days warm: October ${(oct * 100).toFixed(0)}% (Fort Point 2021–2025: 17%), July ${(jul * 100).toFixed(0)}%`);
    expect(Math.abs(oct - 0.174)).toBeLessThan(0.04);
    expect(jul).toBe(0);
  });
  it('a day on record says for itself: 6 Sep 2022 (34 °C at Fort Point) warm; 11 Jul 2026 (the morning fog) not', () => {
    expect(warmDay('2022-09-06')).toBe(true);
    expect(warmDay('2026-07-11')).toBe(false);
  });
  it("a day on record reads what Fort Point saw (11 July 2026: 53–55 °F in the morning fog)", () => {
    const a = airTempC('2026-07-11', at('2026-07-11T11:00:00', 7));
    expect(a.real).toBe(true);
    expect(a.c).toBeGreaterThan(11); expect(a.c).toBeLessThan(14); // (54.9 °F is 12.7 °C, the station's own 11:00 reading)
  });
  it('warmer in the east Bay than at the Gate: an autumn afternoon at Alameda against Fort Point (the stations, 2021–2025)', () => {
    const t = at('2027-09-11T14:00:00', 7), gate = LL(37.81, -122.47), alameda = LL(37.772, -122.30);
    const a = airTempC('2027-09-11', t, gate), b = airTempC('2027-09-11', t, alameda);
    console.log(`Sep 14:00: the Gate ${a.c.toFixed(1)} °C (warm ${a.warmShare}), Alameda ${b.c.toFixed(1)} (${b.warmShare})`);
    expect(b.c).toBeGreaterThan(a.c + 1.5);
    let ga = 0, al = 0;
    for (let y = 2030; y < 2080; y++) for (let d = 1; d <= 28; d++) { const date = `${y}-09-${String(d).padStart(2, '0')}`; if (warmDay(date, gate)) ga++; if (warmDay(date, alameda)) al++; }
    expect(al).toBeGreaterThan(2 * ga); // (Fort Point about one day in eight in September, Alameda nearly one in two)
  });
  it("on climate-only days, warm with the day's wind as such days were (scripts/fit-warm-days.mjs): every station and month", () => {
    const C = climate as unknown as { stations: Record<string, { name: string; lat: number; lon: number; warmDay: number[] }> };
    const bad: string[] = [];
    for (const st of Object.values(C.stations)) {
      const p = LL(st.lat, st.lon);
      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, '0'), share = st.warmDay[m - 1];
        const r = ([0, 1, 2] as const).map(wd => { let w = 0, n = 0; for (let y = 2030; y < 2090; y++) for (let d = 1; d <= 28; d++) { const date = `${y}-${mm}-${String(d).padStart(2, '0')}`; if (warmDay(date, p, dayWindOf(date, dayWeather(date, 'auto', wd)))) w++; n++; } return w / n; });
        // (a typical day keeps the month's own rate: the wind says which days are warm, not how many)
        if (Math.abs(r[1] - share) > 0.03 + 0.2 * share) bad.push(`${st.name} ${mm}: typical ${r[1].toFixed(3)} against the month's ${share}`);
        // (along the east shore in summer, a windy day is warmer than a light one: the inland heat that drives the breeze)
        if (st.name !== 'Fort Point' && m >= 5 && m <= 9 && !(r[2] > r[0] + 0.05)) bad.push(`${st.name} ${mm}: windy ${r[2].toFixed(2)} not warmer than light ${r[0].toFixed(2)}`);
      }
    }
    expect(bad).toEqual([]);
    // (at Fort Point, a light and variable autumn day is the warm one)
    const fp = LL(37.806305, -122.46589), oct = (kind: 'auto' | 'light') => { let w = 0, n = 0; for (let y = 2030; y < 2130; y++) for (let d = 1; d <= 28; d++) { const date = `${y}-10-${String(d).padStart(2, '0')}`; if (warmDay(date, fp, dayWindOf(date, dayWeather(date, kind, 1)))) w++; n++; } return w / n; };
    expect(oct('light')).toBeGreaterThan(2 * oct('auto'));
  }, 120000);
});
