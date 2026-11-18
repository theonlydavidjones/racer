import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// ODbL: "© OpenStreetMap contributors", visible near the work without interacting, linked to the copyright page
describe('the OpenStreetMap credit', () => {
  const html = readFileSync('index.html', 'utf8');
  it('sits under the inset map and in the big charts, linked to openstreetmap.org/copyright', () => {
    expect(html).toMatch(/<a id="mapCredit" href="https:\/\/www\.openstreetmap\.org\/copyright"[^>]*>© OpenStreetMap contributors<\/a>/);
    expect(html.match(/class="ch-credit" href="https:\/\/www\.openstreetmap\.org\/copyright"/g)?.length).toBe(2);
  });
  it('is hidden with the inset in the showroom and the still views', () => {
    for (const f of ['04-screens', '09-audit']) expect(readFileSync(`src/styles/${f}.css`, 'utf8')).toMatch(/#mapCredit/);
  });
});
