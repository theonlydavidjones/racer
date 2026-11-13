#!/usr/bin/env node
/**
 * The wind and current layers as Windy draws them (ui/flow.ts): each on the full chart (with the readout under the
 * cursor and the scale), and the inset map without them (the owner: the full chart only), cruising off the Cityfront on a strong ebb (2026-11-14 18:30: NOAA's
 * Golden Gate Bridge station SFB1202 about 2.5 kt then). Needs the dev server (npm run dev) on :5173.
 *
 *   node scripts/check/flow-layers.cjs <out-dir>   → chart-wind.png, chart-current.png, inset-wind.png, inset-current.png
 *                                                     (and chart-*-dusk.png), and the frame time with each
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
// (headless, a frame takes a second or two: the streaks' trails are stepped through 2.5 s of 60 fps frames before a
// picture, as a real browser draws them)
const warm = (p, which) => p.evaluate(w => { const h = __hud; for (let i = 0; i < 150; i++) { if (w === 'inset') h.insetStreaks(1 / 60); else h.chartFx(document.getElementById(w === 'plan' ? 'planFx' : 'chartFx'), sim(), 1 / 60, null); } }, which);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 860 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(s, { mode: 'sail', sailFrom: 'cityfront', sailTo: '', windKind: 'west', windKt: 16, tideDate: '2026-11-14', tideTime: '18:30', mapLayers: {} , chartPal: 'day' }); localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); } catch {} });
  await p.goto('http://localhost:5173/?inproc'); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(6000);
  // (headless, the 3-D scene is drawn in software and a frame takes seconds: the layers' own JS is what's measured,
  // ms a frame for the streaks and the readout, smoothed, and the colour field's last build)
  const frame = async () => p.evaluate(() => { const h = __hud; return `streaks inset ${h.fxMs.inset.toFixed(2)} chart ${h.fxMs.chart.toFixed(2)} ms/frame; field build (the full chart's only; the inset shows no field) chart ${h.flowField.chart.lastMs.toFixed(0)} ms`; });
  const inset = async name => { await p.waitForTimeout(1500); console.log(name, await frame()); await warm(p, 'inset'); await p.screenshot({ path: `${out}/${name}.png`, clip: { x: 1150, y: 60, width: 250, height: 250 } }); };
  const chart = async (field, name) => {
    await p.evaluate(() => document.getElementById('map').click()); await p.waitForTimeout(1500);
    await p.evaluate(f => document.querySelector(`#chartField [data-field="${f}"]`).click(), field);
    await p.mouse.move(700, 460); await p.mouse.wheel(0, 400); await p.waitForTimeout(1500);
    await p.mouse.move(520, 380); await p.waitForTimeout(1200);
    console.log(name, await frame());
    await warm(p, 'chart'); await p.screenshot({ path: `${out}/${name}.png` });
    await p.evaluate(() => document.getElementById('bChartPal').click()); await p.waitForTimeout(1200);
    await p.screenshot({ path: `${out}/${name}-dusk.png` });
    await p.evaluate(() => document.getElementById('bChartPal').click());
    await p.evaluate(() => document.getElementById('bChartClose').click()); await p.waitForTimeout(800);
  };
  await chart('wind', 'chart-wind'); await inset('inset-wind');
  await chart('current', 'chart-current'); await inset('inset-current');
  await chart('off', 'chart-off'); await inset('inset-off');
  console.log('ERRORS:', errs.join('; ') || 'none'); await b.close();
})();
