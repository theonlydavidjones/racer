#!/usr/bin/env node
/**
 * The course she'd sail and when she'd get there (sim/navigator.ts passageNow), in the cruise setup: on the planner's
 * chart (the track, tacks and gybes, the readout) and on the tide graph (the Arrive bar). Alcatraz to off Crissy Field
 * in the afternoon westerly: a beat. Needs the dev server on :5173.
 *
 *   node scripts/check/cruise-eta.cjs <out-dir>   → eta-plan.png, eta-setup.png, eta-run-plan.png
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const shot = async (from, to, name) => {
    const p = await b.newPage({ viewport: { width: 1400, height: 860 } }); p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(([f, t]) => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(s, { mode: 'sail', sailFrom: f, sailTo: t, windKind: 'west', windKt: 0, tideDate: '2026-07-11', tideTime: '15:00', mapLayers: { wind: true } }); localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); }, [from, to]);
    await p.goto('http://localhost:5173/'); await p.waitForTimeout(5000);
    await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(3000);
    await p.screenshot({ path: `${out}/${name}-setup.png` });
    await p.evaluate(() => document.getElementById('bPlanOpen').click()); await p.waitForTimeout(5000);
    await p.screenshot({ path: `${out}/${name}-plan.png` });
    console.log(name, await p.evaluate(() => document.getElementById('planInfo').innerText.replace(/\n+/g, ' | ')));
    await p.close();
  };
  await shot('alcatraz', 'crissy', 'eta');
  await shot('crissy', 'pier39', 'eta-run');
  console.log('ERRORS:', errs.join('; ') || 'none'); await b.close();
})();
