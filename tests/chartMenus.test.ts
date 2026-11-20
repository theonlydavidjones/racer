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
  it('the switches are a Layers dropdown beside the field picker, top right', () => {
    expect(html).toMatch(/class="ch-layers"><div id="chartField"[\s\S]*?id="bChartShow"[^>]*>Layers/);
    expect(read('src/styles/04-screens.css')).toMatch(/\.ch-layers,#planField\{position:absolute;right:72px/);
    expect(SWITCH_LAYERS.map(l => l.key)).toEqual(['ships', 'laylines', 'shadows']);
    expect(switchesHtml(DEFAULT_SETTINGS as never)).toContain('data-layer="shadows"');
  });
  it('what the inset shows is in Settings, and Points of sail is a Tools tile', () => {
    expect(html).toMatch(/id="insetSeg"[\s\S]*?data-v="map"[\s\S]*?data-v="nav"/);
    expect(read('src/app.ts')).toContain("{ id: 'pointsRose'");
  });
  it('the chart draws no spot names, only the buoys', () => {
    expect(read('src/ui/hud.ts')).toContain('if (!pl.buoy) continue; // (the spots');
    expect(read('src/ui/chart.ts')).toContain('if (!pl.buoy) continue;');
  });
});
