#!/usr/bin/env node
/**
 * The navigator as a layer on the one chart (the owner, 17 Nov 2026: "build the navigator without the ferry squares"),
 * cruising from the Cityfront to off Crissy Field in a 12 kt westerly: the inset in its navigator's view, then the full
 * chart from it, with its one line about the passage, and the plan in words behind that line's Plan link. Fails (exit 1)
 * on a page error, a chart with no line, a plan that never comes in for the layer, or one never shown in words over the
 * chart. Needs the dev server (default :5173).
 *
 *   node scripts/check/nav-layer.cjs [<url>] [<out-dir>]   → inset.png, chart.png, plan.png in <out-dir> when given
 */
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:5173/', OUT = process.argv[3];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [], bad = [];
  const p = await b.newPage({ viewport: { width: 1400, height: 860 }, deviceScaleFactor: OUT ? 2 : 1 }); p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(s, { mode: 'sail', sailFrom: 'alcatraz', sailTo: 'crissy', windKind: 'west', windKt: 12, tideDate: '2026-07-11', tideTime: '15:00', insetView: 'nav' }); localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); });
  await p.goto(URL); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(2000);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(4000);
  // (the full chart, opened from the inset: its plan worked out between frames, a few seconds to a minute)
  await p.evaluate(() => document.getElementById('map').click());
  let plan = null;
  for (let i = 0; i < 90 && !plan; i++) { await p.waitForTimeout(2000); plan = await p.evaluate(() => { const m = window.__hud?.planMemo; return m?.plan ? { marks: m.plan.marks.map(k => k.kind) } : null; }); }
  if (!plan) bad.push('the plan never came in for the chart\'s layer');
  await p.waitForTimeout(800);
  const line = await p.evaluate(() => { const e = document.getElementById('chartPlan'); return e && !e.hidden ? e.textContent : null; });
  console.log('the chart\'s line:', line, '· the plan\'s marks:', JSON.stringify(plan?.marks));
  if (!line || !/To .* · \d+ min · ETA \d/.test(line)) bad.push(`the chart's line: ${line}`);
  if (OUT) await p.screenshot({ path: `${OUT}/chart.png` });
  // (the plan in words, from the line's link, over the chart)
  await p.evaluate(() => document.getElementById('chartPlanLink').click());
  let title = ''; for (let i = 0; i < 90; i++) { title = await p.evaluate(() => document.getElementById('navTitle').textContent); if (!/Working out/.test(title)) break; await p.waitForTimeout(2000); }
  const over = await p.evaluate(() => { const r = document.getElementById('navView').getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + 40); return !!e && !!e.closest('#navView'); });
  console.log('the plan in words:', title, '· over the chart:', over);
  if (!/^Passage plan/.test(title) || !over) bad.push(`the plan in words: "${title}", over the chart ${over}`);
  if (OUT) await p.screenshot({ path: `${OUT}/plan.png` });
  await p.evaluate(() => document.getElementById('bNavClose').click());
  await p.evaluate(() => document.getElementById('bChartClose').click()); await p.waitForTimeout(1500);
  if (OUT) { const r = await p.evaluate(() => { const q = document.getElementById('map').getBoundingClientRect(); return [q.left, q.top, q.width, q.height]; }); await p.screenshot({ path: `${OUT}/inset.png`, clip: { x: r[0] - 10, y: r[1] - 10, width: r[2] + 20, height: r[3] + 20 } }); }
  const words = await p.evaluate(() => document.getElementById('map').title);
  if (!/passage plan/.test(words)) bad.push(`the inset's hover: ${words}`);
  console.log('ERRORS:', errs.join('; ') || 'none'); bad.forEach(x => console.log('FAIL', x)); await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
