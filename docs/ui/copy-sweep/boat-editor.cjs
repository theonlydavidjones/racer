/**
 * The boat editor, swept (21 Nov 2026): the Yacht Club's Boats tab, a boat's page, its editor, and every "Change" in it,
 * a still of each and the blocks of copy over 90 characters and the hovers over 110, as sweep.cjs counts them.
 *   node docs/ui/copy-sweep/boat-editor.cjs <out-dir>        (the dev server on :5199)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || '.';
const SCAN = () => {
  const vis = e => { const c = getComputedStyle(e), r = e.getBoundingClientRect(); return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.05 && r.width > 1 && r.height > 1 && !e.closest('[hidden]') && !e.closest('details:not([open])'); };
  const sel = e => { let s = e.tagName.toLowerCase(); if (e.id) return s + '#' + e.id; const c = typeof e.className === 'string' ? e.className.trim().split(/\s+/)[0] : ''; const p = e.parentElement; const pid = p?.id ? '#' + p.id : (p && typeof p.className === 'string' && p.className ? '.' + p.className.trim().split(/\s+/)[0] : ''); return (pid ? pid + ' > ' : '') + s + (c ? '.' + c : ''); };
  const blocks = [], tips = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e) || ['SCRIPT', 'STYLE', 'OPTION', 'CANVAS', 'SVG', 'NOSCRIPT'].includes(e.tagName)) continue;
    const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    if (own.length > 90) blocks.push({ el: sel(e), n: own.length, text: own.slice(0, 160) });
    const t = e.getAttribute('title'); if (t && t.length > 110) tips.push({ el: sel(e), n: t.length, text: t.slice(0, 110) });
  }
  return { blocks, tips, tipCuts: window.__tipCuts || [] };
};
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.setDefaultTimeout(240000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5199/?inproc'); await p.waitForTimeout(4500);
  const rep = {};
  const snap = async name => { await p.waitForTimeout(1200); await p.screenshot({ path: `${out}/${name}.png` }); rep[name] = await p.evaluate(SCAN); console.log(name, 'blocks', rep[name].blocks.length, 'tips', rep[name].tips.length); };
  await p.evaluate(() => document.querySelector('[data-home="fleet"]').click()); await p.waitForTimeout(1800);
  await p.evaluate(() => document.querySelector('[data-f="tab"][data-v="boats"]')?.click()); await p.waitForTimeout(1200); await snap(p && 'boat-editor-0-boats');
  await p.evaluate(() => document.querySelector('[data-f="boat"]')?.click()); await p.waitForTimeout(1800); await snap('boat-editor-1-boat-page');
  const ed = await p.evaluate(() => { const bt = document.querySelector('[data-f="edit"]'); if (bt) { bt.click(); return true; } return false; });
  console.log('editor opened:', ed); await p.waitForTimeout(2500); await snap('boat-editor-2-editor');
  // every "Change" (and its Done), one at a time
  const n = await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => /^change\b/i.test(x.textContent.trim()) && x.getClientRects().length).length);
  console.log('Change buttons:', n);
  for (let i = 0; i < n; i++) {
    const label = await p.evaluate(i => { const bs = [...document.querySelectorAll('button')].filter(x => /^change\b/i.test(x.textContent.trim()) && x.getClientRects().length); const x = bs[i]; if (!x) return null; const sec = x.closest('section, .be-sec, .t-card, .tile, div'); x.scrollIntoView({ block: 'center' }); x.click(); return (sec?.querySelector('b, h3, .t-h, label')?.textContent || x.textContent).trim().slice(0, 30); }, i);
    await p.waitForTimeout(1200); await snap(`boat-editor-3-change-${i + 1}`);
    console.log('  change', i + 1, label);
    await p.evaluate(i => { const bs = [...document.querySelectorAll('button')].filter(x => /^(change|done)\b/i.test(x.textContent.trim()) && x.getClientRects().length); const done = bs.find(x => /^done\b/i.test(x.textContent.trim())); if (done) done.click(); }, i); await p.waitForTimeout(600);
  }
  fs.writeFileSync(`${out}/boat-editor.json`, JSON.stringify(rep, null, 1));
  console.log('errors:', errs.join(' | ') || 'none');
  await b.close();
})();
