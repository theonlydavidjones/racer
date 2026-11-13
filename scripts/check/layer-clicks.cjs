#!/usr/bin/env node
/**
 * One click switches a map layer (the owner: "these buttons are requiring two clicks"). With the race in its worker
 * (the default, not ?inproc: the bug was the maps drawing from the mirror before the race had the change), each chip
 * of the full chart's field picker, each row of its Layers menu (the inset's choices are there too) and the Dusk colours
 * button is clicked once, and what's drawn is checked: the chart's field, the menu's ticks, the palette.
 * Needs the dev server (npm run dev) on :5173.
 *
 *   node scripts/check/layer-clicks.cjs [out-dir]   → fails (exit 1) on any click that didn't take
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 860 } });
  const errs = [], fails = []; p.on('pageerror', e => errs.push(e.message)); p.setDefaultTimeout(120000); // (headless, a frame can take seconds)
  await p.goto('http://localhost:5173/'); await p.waitForTimeout(5000);
  console.log('the race sails in:', await p.evaluate(() => document.documentElement.dataset.sim));
  await p.evaluate(() => document.querySelector('[data-home="race"]').click()); await p.waitForTimeout(1000);
  await p.evaluate(() => document.getElementById('bGo')?.click()); await p.waitForTimeout(5000);
  const settle = () => p.waitForTimeout(700);
  // the full chart's field chips: a real mouse click on each, once
  await p.evaluate(() => document.getElementById('map').click()); await p.waitForTimeout(1500);
  const drawnKind = () => p.evaluate(() => { const h = __hud; return { kind: h.drawn.chart?.kind ?? null, checked: [...document.querySelectorAll('#chartField [aria-checked="true"]')].map(x => x.dataset.field) }; });
  for (const f of ['current', 'wind', 'sea', 'fog', 'off', 'wind']) {
    await p.click(`#chartField [data-field="${f}"]`); await settle();
    const d = await drawnKind(), want = f === 'wind' || f === 'current' ? f : null;
    const ok = d.checked.length === 1 && d.checked[0] === f && d.kind === want;
    console.log(`chart chip ${f}: ticked ${d.checked.join(',')}, drawn ${d.kind}`, ok ? 'ok' : 'DIDN\'T TAKE'); if (!ok) fails.push(`chart chip ${f}`);
  }
  // the chart's own Layers menu: each row once
  await p.click('#bChartLayers'); await p.waitForTimeout(600);
  const rows = await p.evaluate(() => [...document.querySelectorAll('#chartLayersPop input')].map(i => i.dataset.field ? `field:${i.dataset.field}` : `layer:${i.dataset.layer}`));
  for (const r of rows) {
    const [kind, v] = r.split(':'), sel = kind === 'field' ? `#chartLayersPop [data-field="${v}"]` : `#chartLayersPop [data-layer="${v}"]`;
    const before = await p.evaluate(s => document.querySelector(s).checked, sel);
    await p.click(sel); await settle();
    const after = await p.evaluate(s => document.querySelector(s)?.checked, sel);
    const ok = kind === 'field' ? after === true : after === !before;
    console.log(`chart menu ${r}: ${before} → ${after}`, ok ? 'ok' : 'DIDN\'T TAKE'); if (!ok) fails.push(`chart menu ${r}`);
  }
  await p.screenshot({ path: `${out}/layer-clicks-chart.png` });
  // Dusk colours, once each way
  for (const want of ['dusk', 'day']) {
    await p.click('#bChartPal'); await settle();
    const pal = await p.evaluate(() => sim().settings.chartPal ?? 'day'), label = await p.evaluate(() => document.getElementById('bChartPal').textContent);
    const ok = pal === want && label === (want === 'day' ? 'Dusk colours' : 'Day colours');
    console.log(`palette → ${want}: race has ${pal}, button says "${label}"`, ok ? 'ok' : 'DIDN\'T TAKE'); if (!ok) fails.push(`palette ${want}`);
  }
  await p.click('#bChartClose'); await p.waitForTimeout(800);
  // the inset map has no buttons of its own (its choices are the chart's menu's: the owner)
  const insetButtons = await p.evaluate(() => !!document.getElementById('bMapLayers') || !!document.getElementById('bMapNav'));
  console.log('buttons on the inset:', insetButtons ? 'SOME' : 'none'); if (insetButtons) fails.push('inset buttons');
  console.log('ERRORS:', errs.join(' | ') || 'none'); console.log('FAILED CLICKS:', fails.join(', ') || 'none');
  await b.close(); process.exit(errs.length || fails.length ? 1 : 0);
})();
