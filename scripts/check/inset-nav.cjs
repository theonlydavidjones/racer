#!/usr/bin/env node
/**
 * The navigator as a view of the inset map (the owner: "It should just be a view in the inset map"), cruising from the
 * Cityfront to off Crissy Field in a westerly: the inset as a map, then as the navigator's passage; the Course button
 * gone from the helm's while cruising, and kept racing. Needs the dev server on :5173.
 *
 *   node scripts/check/inset-nav.cjs <out-dir>   → inset-map.png, inset-nav.png, screen-nav.png, plan-open.png, race.png
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
const warm = p => p.evaluate(() => { for (let i = 0; i < 150; i++) __hud.insetStreaks(1 / 60); });
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const p = await b.newPage({ viewport: { width: 1400, height: 860 } }); p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(s, { mode: 'sail', sailFrom: 'alcatraz', sailTo: 'crissy', windKind: 'west', windKt: 0, tideDate: '2026-07-11', tideTime: '15:00', mapLayers: { wind: true } }); localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); });
  await p.goto('http://localhost:5173/'); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(2000);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(6000);
  const clip = async () => { const r = await p.evaluate(() => { const q = document.getElementById('map').getBoundingClientRect(); return [q.left, q.top, q.width, q.height]; }); return { x: r[0] - 10, y: r[1] - 10, width: r[2] + 20, height: r[3] + 45 }; };
  console.log('Course button hidden cruising:', await p.evaluate(() => document.getElementById('bCourse').hidden), '· views shown:', await p.evaluate(() => !document.getElementById('mapViews').hidden));
  await warm(p); await p.screenshot({ path: `${out}/inset-map.png`, clip: await clip() });
  await p.evaluate(() => document.querySelector('#mapViews [data-iv="nav"]').click()); await p.waitForTimeout(3000);
  await warm(p); await p.screenshot({ path: `${out}/inset-nav.png`, clip: await clip() });
  await p.screenshot({ path: `${out}/screen-nav.png` });
  await p.evaluate(() => document.getElementById('map').click()); await p.waitForTimeout(3000);
  console.log('passage plan open:', await p.evaluate(() => !document.getElementById('navView').hidden));
  await p.screenshot({ path: `${out}/plan-open.png` });
  await p.close();
  // racing: the Course button stays, no views
  const r = await b.newPage({ viewport: { width: 1400, height: 860 } }); r.on('pageerror', e => errs.push(e.message));
  await r.addInitScript(() => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(s, { mode: 'race' }); localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); });
  await r.goto('http://localhost:5173/'); await r.waitForTimeout(5000);
  await r.evaluate(() => document.querySelector('[data-home="create"]').click()); await r.waitForTimeout(1500);
  await r.evaluate(() => document.getElementById('bGo').click()); await r.waitForTimeout(5000);
  console.log('racing: Course button shown:', await r.evaluate(() => !document.getElementById('bCourse').hidden), '· views hidden:', await r.evaluate(() => document.getElementById('mapViews').hidden));
  await r.screenshot({ path: `${out}/race.png` });
  console.log('ERRORS:', errs.join('; ') || 'none'); await b.close();
})();
