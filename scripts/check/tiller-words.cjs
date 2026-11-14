#!/usr/bin/env node
/**
 * No on-screen tiller instructions outside the Learn to sail lessons (the owner, 14 Nov 2026): with the tiller held, the
 * guide's words ("◀ tiller to port · turns to starboard" …) and the first-grab toast are absent in a plain race and a
 * plain cruise, and still there in the tiller lesson. The guide's center line and cursor stay everywhere.
 * Needs the dev server (npm run dev) on :5173, or a page URL as the second argument.
 *   node scripts/check/tiller-words.cjs [out-dir] [url]   → fails (exit 1) if the words show where they shouldn't
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.', url = process.argv[3] || 'http://localhost:5173/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const fails = [], errs = [];
  const run = async (name, start, wantWords) => {
    const p = await b.newPage({ viewport: { width: 1400, height: 860 } }); p.setDefaultTimeout(180000);
    p.on('pageerror', e => errs.push(`${name}: ${e.message}`));
    await p.goto(url); await p.waitForTimeout(5000);
    await p.evaluate(start); await p.waitForTimeout(8000);
    // take the tiller (T) once the boat is sailing: a lesson may first wait for its Ready
    for (let i = 0; i < 20 && !(await p.evaluate(() => document.body.classList.contains('tiller-held'))); i++) {
      await p.evaluate(() => document.querySelector('#coachTip button, .lessonReady, [data-act="lessonReady"]')?.click());
      await p.keyboard.press('t'); await p.waitForTimeout(1500);
    }
    const r = await p.evaluate(() => {
      const shown = el => !!el && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
      return { held: document.body.classList.contains('tiller-held'), words: shown(document.querySelector('#tillerGuide .tg-l')) || shown(document.querySelector('#tillerGuide .tg-r')), line: shown(document.querySelector('#tillerGuide .tg-line')), toast: /You have the tiller/.test(document.getElementById('toast')?.textContent ?? '') };
    });
    await p.screenshot({ path: `${out}/tiller-words-${name}.png` });
    const ok = r.held && r.line && r.words === wantWords && (wantWords || !r.toast);
    console.log(`${name}: tiller held ${r.held}, center line ${r.line}, words ${r.words}, toast ${r.toast}`, ok ? 'ok' : 'WRONG'); if (!ok) fails.push(name);
    await p.close();
  };
  await run('race', () => { document.querySelector('[data-home="race"]').click(); setTimeout(() => document.querySelector('[data-home="create"]')?.click(), 1000); setTimeout(() => document.getElementById('bGo')?.click(), 3000); }, false);
  await run('cruise', () => { document.querySelector('[data-home="cruise"]').click(); setTimeout(() => document.getElementById('bGo')?.click(), 2500); }, false);
  await run('lesson', () => { document.getElementById('bLessons').click(); setTimeout(() => document.querySelector('#lessonGrid [data-lesson="tiller"]')?.click(), 1500); }, true);
  console.log('ERRORS:', errs.join(' | ') || 'none'); console.log('FAILED:', fails.join(', ') || 'none');
  await b.close(); process.exit(errs.length || fails.length ? 1 : 0);
})();
