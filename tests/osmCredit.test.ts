import { describe, expect, it } from 'vitest';

// ODbL: "© OpenStreetMap contributors", visible near the work without interacting, linked to the copyright page
describe('the OpenStreetMap credit', () => {
  const raw = import.meta.glob(['../index.html'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const html = raw['../index.html'];
  it('sits under the inset map and in the big charts, linked to openstreetmap.org/copyright', () => {
    expect(html).toMatch(/<a id="mapCredit" href="https:\/\/www\.openstreetmap\.org\/copyright"[^>]*>© OpenStreetMap contributors<\/a>/);
    expect(html.match(/class="ch-credit" href="https:\/\/www\.openstreetmap\.org\/copyright"/g)?.length).toBe(2);
  });
});
