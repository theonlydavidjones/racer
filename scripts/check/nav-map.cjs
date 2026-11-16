#!/usr/bin/env node
/**
 * The navigator's panel draws its chart (the owner, 16 Nov 2026: "when in inset map, clicking the navigator button opens
 * the navigator modal, which fails to populate with the map"): cruising from the Cityfront to off Crissy Field, the
 * panel opened from the inset (its view set to the passage) and from the full chart's Navigator button, and the share
 * of its canvas's pixels that differ from the blank background counted, at once and once the passage plan is in. Fails
 * (exit 1) if either draws no chart. Needs the dev server (default :5173).
 *
 *   node scripts/check/nav-map.cjs [<url>] [<out-dir>]   → screenshots in <out-dir> when given
 */
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:5173/', OUT = process.argv[3];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [], bad = [];
  const page = async insetView => {
    const p = await b.newPage({ viewport: { width: 1400, height: 860 } }); p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(v => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(s, { mode: 'sail', sailFrom: 'alcatraz', sailTo: 'crissy', windKind: 'west', windKt: 12, tideDate: '2026-07-11', tideTime: '15:00', insetView: v }); localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); }, insetView);
    await p.goto(URL); await p.waitForTimeout(5000);
    await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(2000);
    await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(6000);
    return p;
  };
  // (the share of the canvas's pixels that differ from its corner, the empty background, by more than a shade)
  const inked = p => p.evaluate(() => {
    const c = document.getElementById('navcanvas'), r = c.getBoundingClientRect();
    if (!r.width || !c.width) return { w: Math.round(r.width), cw: c.width, share: 0 };
    const g = document.createElement('canvas'); g.width = c.width; g.height = c.height; const x = g.getContext('2d'); x.drawImage(c, 0, 0);
    const d = x.getImageData(0, 0, g.width, g.height).data, bg = [d[0], d[1], d[2]]; let n = 0;
    for (let i = 0; i < d.length; i += 16) if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 30) n++;
    return { w: Math.round(r.width), cw: c.width, share: +(n / (d.length / 16)).toFixed(3) };
  });
  const check = async (p, label, shot) => {
    const open = await p.evaluate(() => !document.getElementById('navView').hidden);
    const now = await inked(p); await p.waitForTimeout(8000); const later = await inked(p); // (the passage plan takes a few seconds)
    const ok = open && now.share > 0.05 && later.share > 0.05;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: open ${open}, at once ${JSON.stringify(now)}, with the plan ${JSON.stringify(later)}`); if (!ok) bad.push(label);
    if (OUT) await p.screenshot({ path: `${OUT}/${shot}.png` }).catch(() => {});
  };
  // from the inset, its view the navigator's passage: a tap on it opens the panel
  { const p = await page('nav'); await p.evaluate(() => document.getElementById('map').click()); await p.waitForTimeout(300); await check(p, 'opened from the inset', 'nav-from-inset'); await p.close(); }
  // from the full chart (the inset as the map, tapped to open it), its Navigator button
  { const p = await page('map'); await p.evaluate(() => document.getElementById('map').click()); await p.waitForTimeout(1500);
    await p.evaluate(() => document.getElementById('bChartNav').click()); await p.waitForTimeout(300); await check(p, 'opened from the full chart', 'nav-from-chart'); await p.close(); }
  console.log('ERRORS:', errs.join('; ') || 'none'); await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
