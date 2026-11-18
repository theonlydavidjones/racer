#!/usr/bin/env node
/**
 * Sail home in a race (the owner, 18 Nov 2026: "sail home should work in a race and retire you, but should surface a dialog
 * first explaining that you're retiring from the race and give you the chance to keep racing if you fat-fingered"): her
 * home slip Josephine's, a race started, the Course panel opened (M), its Sail home live; clicked, the confirm, Keep
 * racing focused; Esc keeps her racing, nothing changed; clicked again and Retire and sail home: retired (RET), her slip
 * the destination. Fails (exit 1) on any step or a page error. Needs the dev server (default :5173).
 *
 *   node scripts/check/race-home.cjs [<url>] [<out-dir>]   → panel.png, confirm.png, retired.png in <out-dir> when given
 */
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:5173/', OUT = process.argv[3];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 860 } }), errs = [], bad = [];
  p.on('pageerror', e => errs.push(e.message));
  const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad.push(what); };
  // (her settings as the page saves them, then her home slip, and a race)
  await p.goto(URL); await p.waitForTimeout(5000);
  const json = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); const boat = { ...s.boat, marina: 'gashouse-cove', slip: 'gashouse-cove:572' };
    Object.assign(s, { boat, boats: (s.boats || [boat]).map(x => x.id === boat.id ? boat : x), mode: 'race' }); return JSON.stringify(s); });
  await p.addInitScript(j => localStorage.setItem('fbsim-settings-v2', j), json);
  await p.goto(URL); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="create"]').click()); await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(14000);
  await p.keyboard.press('m'); await p.waitForTimeout(1200);
  const btn = await p.evaluate(() => { const e = document.getElementById('bCvHome'); return { shown: !e.hidden && !document.getElementById('courseView').hidden, dim: e.classList.contains('dim'), title: e.title }; });
  check(btn.shown && !btn.dim, `Sail home live in the Course panel (${JSON.stringify(btn)})`);
  if (OUT) await p.screenshot({ path: `${OUT}/panel.png` });
  await p.evaluate(() => document.getElementById('bCvHome').click()); await p.waitForTimeout(800);
  const ask = await p.evaluate(() => ({ open: !document.getElementById('homeAsk').hidden, focus: document.activeElement?.id, title: document.getElementById('homeTitle').textContent }));
  check(ask.open && ask.focus === 'bHomeNo', `the confirm, Keep racing focused (${JSON.stringify(ask)})`);
  if (OUT) await p.screenshot({ path: `${OUT}/confirm.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(1500);
  const kept = await p.evaluate(() => { const w = window.__w(); return { open: !document.getElementById('homeAsk').hidden, retired: !!w.user.retired, dest: w.dest?.key ?? null }; });
  check(!kept.open && !kept.retired && kept.dest !== 'slip', `Esc: still racing, nothing changed (${JSON.stringify(kept)})`);
  await p.keyboard.press('m'); await p.waitForTimeout(1000);
  await p.evaluate(() => document.getElementById('bCvHome').click()); await p.waitForTimeout(800);
  await p.evaluate(() => document.getElementById('bHomeYes').click()); await p.waitForTimeout(2500);
  const done = await p.evaluate(() => { const w = window.__w(); return { retired: !!w.user.retired, dest: w.dest?.key ?? null }; });
  check(done.retired && done.dest === 'slip', `Retire and sail home: RET, her slip the destination (${JSON.stringify(done)})`);
  if (OUT) await p.screenshot({ path: `${OUT}/retired.png` });
  console.log('ERRORS:', errs.join('; ') || 'none'); await b.close();
  process.exit(bad.length || errs.length ? 1 : 0);
})();
