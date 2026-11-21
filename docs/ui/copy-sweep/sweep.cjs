/**
 * The copy sweep (21 Nov 2026): each page and menu of the game, a still of it and every block of copy on it longer than
 * one short line (the owner's rule: "these blocks of tiny copy are useless. nobody will ever read this."). A block is
 * the text a visible element holds itself (its own text nodes), over 90 characters, or a hover over 110.
 *   node docs/ui/copy-sweep/sweep.cjs <out-dir>        (the dev server on :5199)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || '.';
const SCAN = () => {
  const vis = e => { const c = getComputedStyle(e), r = e.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.05 && r.width > 1 && r.height > 1 && !e.closest('[hidden]') && !e.closest('details:not([open])') ; };
  const sel = e => { let s = e.tagName.toLowerCase(); if (e.id) return s + '#' + e.id; const c = typeof e.className === 'string' ? e.className.trim().split(/\s+/)[0] : ''; const p = e.parentElement; const pid = p?.id ? '#' + p.id : (p && typeof p.className === 'string' && p.className ? '.' + p.className.trim().split(/\s+/)[0] : ''); return (pid ? pid + ' > ' : '') + s + (c ? '.' + c : ''); };
  const blocks = [], tips = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e) || ['SCRIPT', 'STYLE', 'OPTION', 'CANVAS', 'SVG', 'NOSCRIPT'].includes(e.tagName)) continue;
    const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    if (own.length > 90) blocks.push({ el: sel(e), n: own.length, text: own.slice(0, 140) });
    const t = e.getAttribute('title'); if (t && t.length > 110) tips.push({ el: sel(e), n: t.length, text: t.slice(0, 100) });
  }
  return { blocks, tips };
};
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const rep = {}, errs = [];
  const fresh = async (name) => { const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.setDefaultTimeout(240000); p.on('pageerror', e => errs.push(`${name}: ${e.message}`)); await p.goto('http://localhost:5199/?inproc'); await p.waitForTimeout(4500); return p; };
  const snap = async (p, name) => { await p.waitForTimeout(1200); await p.screenshot({ path: `${out}/${name}.png` }); rep[name] = await p.evaluate(SCAN); console.log(name, 'blocks', rep[name].blocks.length, 'tips', rep[name].tips.length); };
  const clickHome = async (p, v) => { await p.evaluate(v => document.querySelector(`[data-home="${v}"]`)?.click(), v); await p.waitForTimeout(1800); };
  // ---- the start page and its pages
  let p = await fresh('home'); await snap(p, 'home-start-page');
  await clickHome(p, 'race'); await snap(p, 'race-choose');
  await p.evaluate(() => document.querySelector('[data-home="create"]')?.click()); await p.waitForTimeout(2500); await snap(p, 'race-setup-practice');
  await p.evaluate(() => { const e = document.querySelector('#setup'); e?.scrollTo?.(0, 99999); document.querySelector('#setup .panel')?.scrollTo?.(0, 99999); window.scrollTo(0, 99999); }); await snap(p, 'race-setup-practice-lower');
  await p.close();
  p = await fresh('cruise'); await clickHome(p, 'cruise'); await snap(p, 'cruise-setup'); await p.close();
  p = await fresh('drill'); await clickHome(p, 'drill'); await snap(p, 'drills'); await p.close();
  p = await fresh('past'); await clickHome(p, 'past'); await snap(p, 'past-races'); await p.close();
  p = await fresh('season'); await clickHome(p, 'season'); await snap(p, 'season'); await p.close();
  // the Yacht Club's pages (fleet): every tab
  p = await fresh('fleet'); await clickHome(p, 'fleet'); await snap(p, 'yacht-club');
  const tabs = await p.evaluate(() => [...document.querySelectorAll('[data-f="tab"]')].map(b => b.dataset.v));
  console.log('yacht club tabs:', tabs.join(', '));
  for (const t of tabs) { await p.evaluate(t => document.querySelector(`[data-f="tab"][data-v="${t}"]`)?.click(), t); await p.waitForTimeout(1500); await snap(p, `yacht-club-${t}`); }
  // the boat editor: the first Change / Edit on the boats tab
  await p.evaluate(() => document.querySelector('[data-f="tab"][data-v="boats"]')?.click()); await p.waitForTimeout(1200);
  const opened = await p.evaluate(() => { const bt = [...document.querySelectorAll('#fleetView button, #fleet button, .overlay:not([hidden]) button')].find(x => /^(change|edit|open)/i.test(x.textContent.trim()) && x.getClientRects().length); if (bt) { bt.click(); return bt.textContent.trim(); } return null; });
  console.log('boat editor opened by:', opened); await p.waitForTimeout(2000); await snap(p, 'boat-editor');
  await p.close();
  // ---- Settings and Keys
  p = await fresh('settings'); await p.evaluate(() => document.getElementById('bKeys0').click()); await p.waitForTimeout(1500); await snap(p, 'settings-training-aids');
  await p.evaluate(() => document.querySelector('[data-st="keys"]').click()); await p.waitForTimeout(1000); await snap(p, 'settings-keys'); await p.close();
  // ---- in the game: Tools, the pause screen, the crew pop, the lessons
  p = await fresh('game'); await clickHome(p, 'race'); await p.evaluate(() => document.querySelector('[data-home="create"]')?.click()); await p.waitForTimeout(1200); await p.evaluate(() => document.getElementById('bGo')?.click()); await p.waitForTimeout(6000);
  await p.evaluate(() => document.getElementById('bTools').click()); await snap(p, 'tools-tray'); await p.evaluate(() => document.getElementById('bTools').click());
  await p.evaluate(() => document.getElementById('bPause').click()); await snap(p, 'pause-screen');
  await p.close();
  p = await fresh('lessons'); await p.evaluate(() => document.getElementById('bLessons')?.click()); await p.waitForTimeout(1800); await snap(p, 'lessons'); await p.close();
  // ---- the results: the race sailed to the finish by the AI's skipper
  p = await fresh('results'); await clickHome(p, 'race'); await p.evaluate(() => document.querySelector('[data-home="create"]')?.click()); await p.waitForTimeout(1200); await p.evaluate(() => document.getElementById('bGo')?.click()); await p.waitForTimeout(6000);
  await p.evaluate(() => { const w = sim(), u = w.boats[0]; u.ai = structuredClone(w.boats[1].ai); u.isUser = false; });
  let r;
  for (let k = 0; k < 130; k++) { r = await p.evaluate(() => { const w = sim(); for (let i = 0; i < 3600; i++) { w.paused = true; w.step(1 / 60); if (w.boats[0].finished && w.t - w.boats[0].finishT > 5) break; } return [Math.round(w.t), w.boats[0].finished, w.boats[0].finishT]; }); if ((r[1] && r[0] - r[2] > 5) || r[0] > 7200) break; }
  await p.evaluate(() => { const w = sim(); w.boats[0].isUser = true; w.boats[0].ai = null; if (w.userFinishT == null) w.userFinishT = w.boats[0].finishT; w.paused = false; });
  await p.waitForSelector('#results:not([hidden])', { timeout: 90000 }).catch(() => console.log('results never showed'));
  await snap(p, 'results'); await p.close();
  fs.writeFileSync(`${out}/sweep.json`, JSON.stringify(rep, null, 1));
  console.log('errors:', errs.join(' | ') || 'none');
  await b.close();
})();
