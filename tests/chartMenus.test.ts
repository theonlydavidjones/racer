import { describe, it, expect } from 'vitest';
// @ts-ignore node:fs for the source text
import { readFileSync } from 'node:fs';
import { SWITCH_LAYERS, switchesHtml } from '../src/ui/layers';
import { DEFAULT_SETTINGS } from '../src/settings';

const read = (f: string) => readFileSync(f, 'utf8') as string;
const html = read('index.html');

describe('the chart\'s menus (owner chart, 20 Nov)', () => {
  it('the old Layers button is the Key, and Back to boat is Recenter', () => {
    expect(html).toMatch(/id="bChartLayers"[^>]*>Key</);
    expect(html).toMatch(/id="bChartBoat">Recenter</);
    expect(html).not.toMatch(/Back to boat/i);
  });
  it('the Key is only the list: no Color the water, Training views, inset choice or subtitles', () => {
    const l = read('src/ui/layers.ts'), g = read('src/ui/legend.ts');
    for (const w of ['Color the water', 'Training views', 'The inset map shows', "what\\'s on the map"]) expect(l).not.toContain(w);
    expect(g).not.toContain('NOAA chart (US Chart No. 1)');
    expect(g).not.toContain("head('On the map')");
  });
  it('the switches are a collapsible Layers panel top left; the field picker stays top right', () => {
    expect(html).toMatch(/id="chartField"[\s\S]*?class="ch-lpanel"[\s\S]*?id="bChartShow"[^>]*>Layers/);
    const css = read('src/styles/04-screens.css');
    expect(css).toMatch(/#chartField\{position:absolute;right:226px/);
    expect(css).toMatch(/\.ch-lpanel\{position:absolute;left:12px/);
    expect(read('src/ui/layers.ts')).toContain("'fbsim-chart-layers-open'");
    expect(SWITCH_LAYERS.map(l => l.key)).toEqual(['ships', 'laylines', 'shadows']);
    expect(switchesHtml(DEFAULT_SETTINGS as never)).toContain('data-layer="shadows"');
  });
  it('what the inset shows is one Settings toggle, and Points of sail is a Tools tile', () => {
    expect(html).toMatch(/Show passage in inset map while cruising<input type="checkbox" id="insetNavTog"><span class="tog-sw">/);
    expect(read('src/app.ts')).toContain("{ id: 'pointsRose'");
  });
  it('Day | Dusk is a two-state toggle beside the field picker; the Dusk colors button is gone', () => {
    expect(html).not.toContain('bChartPal');
    expect(html).toMatch(/id="chartPal"[\s\S]*?data-pal="day"[\s\S]*?data-pal="dusk"/);
    expect(read('src/styles/04-screens.css')).toMatch(/#chartPal\{position:absolute;right:72px/);
  });
  it('the chart draws no spot names, only the buoys', () => {
    expect(read('src/ui/hud.ts')).toContain('if (!pl.buoy) continue; // (the spots');
    expect(read('src/ui/chart.ts')).toContain('if (!pl.buoy) continue;');
  });
});
