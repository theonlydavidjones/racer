import { describe, expect, it } from 'vitest';
import results from '../src/boat/data/sf-folkboat-results.json';

// Real skippers' names stay out of the game (the owner): the results the app imports carry an anonymous id per skipper,
// the names kept in reference/skipper-keys.json, which nothing in src/ imports (scripts/skipper-keys.mjs).
describe('the real results the app ships', () => {
  it('name no skipper: each is an anonymous id', () => {
    const ev = (results as unknown as { events: { races: { boats: { skipper?: string | null }[] }[] }[] }).events;
    const all = ev.flatMap(e => e.races.flatMap(r => r.boats.map(b => b.skipper))).filter(s => s != null && s !== '');
    expect(all.length).toBeGreaterThan(300);
    expect(all.filter(s => !/^k\d{3,}$/.test(s!))).toEqual([]);
    const cal = JSON.stringify((results as unknown as { calibration: unknown }).calibration);
    for (const s of (JSON.parse(cal) as { consistency: { skippers: { key: string; name: string }[] } }).consistency.skippers) expect([s.key, s.name].every(x => /^k\d{3,}$/.test(x))).toBe(true);
  });
});
