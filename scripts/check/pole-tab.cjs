#!/usr/bin/env node
/**
 * The band's Pole tab and the O key in the page (npm run dev -- --port 5199; ?inproc for the dev handles): on a deep run
 * the tab shows, a tap sets the pole and O stows it; at 142° true, where the crew refuse it, the tab is hidden and O says
 * why in the Messages card (the owner, v184: "pole out button isn't working"). node scripts/check/pole-tab.cjs <out-dir>
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(120000);
  const errs = [], fails = []; page.on('pageerror', e => errs.push(e.message));
  const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
  await page.goto('http://localhost:5199/?inproc'); await page.waitForTimeout(3000);
  await page.click('[data-home="race"]'); await page.waitForTimeout(500); await page.click('[data-home="create"]'); await page.waitForTimeout(1000);
  await page.click('#bGo'); await page.waitForTimeout(3000);
  // (the race stepped here, quickly, holding her `off` the wind: headless draws a frame a second or so)
  const run = (secs, off) => page.evaluate(([secs, off]) => { const w = sim(), u = w.user; w.paused = true; const t0 = w.t;
    while (w.t < t0 + secs) { u.h = (u.ww.from + off + 360) % 360; w.step(1 / 60); } w.paused = false;
    return { pole: u.pole, want: u.poleWant }; }, [secs, off]);
  const tab = async () => { await page.waitForTimeout(400); return page.evaluate(() => { const t = document.querySelector('.sb-pole'); return { hidden: t.hidden, text: t.textContent }; }); };
  await run(10, 165);
  let t = await tab(); check(!t.hidden && t.text === 'Pole out', `deep (165°): the tab shows "Pole out" (${JSON.stringify(t)})`);
  const b = await (await page.$('.sb-pole')).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  let s = await run(30, 165); check(s.pole === 'set', `a tap, then 30 s: the pole is set (${JSON.stringify(s)})`);
  await page.screenshot({ path: `${out}/pole-set.png` });
  await page.keyboard.press('o'); s = await run(15, 165); check(s.pole === 'down' && !s.want, `O: stowed (${JSON.stringify(s)})`);
  await run(10, 142);
  t = await tab(); check(t.hidden, `at 142°: the tab is hidden (${JSON.stringify(t)})`);
  await page.keyboard.press('o'); await page.waitForTimeout(300); s = await run(5, 142);
  const msg = await page.evaluate(() => document.getElementById('msgRecent')?.textContent ?? '');
  check(s.pole === 'down' && !s.want && /no pole now, she's too high/.test(msg), `O at 142°: nothing set, and the Messages card says why ("${msg.slice(0, 90)}")`);
  console.log('ERRORS:', errs.join('\n') || 'none'); await browser.close();
  if (errs.length || fails.length) process.exit(1);
})();
