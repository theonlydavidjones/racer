#!/usr/bin/env node
/**
 * The season end to end, in the dev server (npm run dev -- --port 5199), the race in the page's thread (?inproc) to
 * speed up time: the Yacht Club's Season tab, a race day sailed to the finish (her on the AI's skipper), the results'
 * season line, saved, and the standings with that race in them.
 *   node scripts/check/season.cjs <out-dir>   (a few minutes; screenshots → out-dir/season-*.png; exits 1 on a failure)
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(180000);
  const errs = [], fail = m => { console.log('FAIL:', m); errs.push(m); };
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:5199/?inproc'); await page.waitForTimeout(3000);
  await page.evaluate(() => localStorage.removeItem('fbsim-season-v1'));
  // 1. the Yacht Club's Season tab
  await page.click('[data-home="fleet"]'); await page.waitForTimeout(800);
  await page.click('[data-f="tab"][data-v="season"]'); await page.waitForTimeout(500);
  const tab = await page.evaluate(() => ({ days: [...document.querySelectorAll('.sday')].map(d => d.textContent.trim()), abn: document.querySelectorAll('.sday.abn').length, foot: document.querySelector('.sfoot')?.textContent }));
  console.log('Season tab:', JSON.stringify(tab));
  if (tab.days.length !== 5 || tab.abn !== 1) fail('the Season tab doesn\'t show five race days with one abandoned');
  await page.screenshot({ path: out + '/season-empty.png' });
  // 2. race 5, sailed by the AI's skipper to the finish
  await page.click('.sday[data-v="5"]'); await page.waitForTimeout(3000);
  const set = await page.evaluate(() => { const w = sim(); return { date: w.raceDate, n: w.boats.length, names: w.boats.map(b => `${b.no} ${b.name}`) }; });
  console.log('race:', JSON.stringify(set));
  if (set.date !== '2026-03-07' || set.n !== 8) fail('race 5 isn\'t on its day with the 8-boat series fleet');
  await page.evaluate(() => { const w = sim(), u = w.boats[0]; u.ai = structuredClone(w.boats[1].ai); u.isUser = false; });
  let r;
  for (let k = 0; k < 130; k++) {
    r = await page.evaluate(() => { const w = sim(); for (let i = 0; i < 3600; i++) { w.paused = true; w.step(1 / 60); if (w.boats[0].finished && w.t - w.boats[0].finishT > 5) break; } return [Math.round(w.t), w.boats[0].finished, w.boats[0].finishT]; });
    if ((r[1] && r[0] - r[2] > 5) || r[0] > 7200) break;
  }
  console.log('finished:', r);
  if (!r[1]) { fail('she never finished'); await browser.close(); process.exit(1); }
  await page.evaluate(() => { const w = sim(); w.boats[0].isUser = true; w.boats[0].ai = null; if (w.userFinishT == null) w.userFinishT = w.boats[0].finishT; w.paused = false; }); // (her finish, as the race marks the user's)
  await page.waitForSelector('#results:not([hidden])', { timeout: 60000 }).catch(() => fail('the results never showed'));
  const line = await page.evaluate(() => { const e = document.getElementById('resSeason'); return { hidden: e.hidden, text: e.textContent }; });
  console.log('results season line:', JSON.stringify(line));
  if (line.hidden || !/^Seaweed Soup: \d+(st|nd|rd|th) · \d+ nett/.test(line.text)) fail('no season line in the results');
  await page.screenshot({ path: out + '/season-results.png' });
  // 3. saved: the standings
  await page.click('#bSet2'); await page.waitForSelector('#keepAsk:not([hidden])'); await page.click('#bKeep'); await page.waitForTimeout(800);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('fbsim-season-v1') || '{}'));
  const r5 = kept['ggyc-seaweed-2025-26']?.[5];
  console.log('kept race 5:', JSON.stringify(r5?.scores.map(s => [s.sail, s.name, s.points, s.code])));
  if (!r5 || r5.scores.length !== 8 || !r5.scores.some(s => s.you)) fail('race 5 wasn\'t kept with all 8 boats and you');
  if (r5 && r5.scores.some(s => !/^[A-Z]{3} \d+$/.test(s.sail))) fail('a boat without country and sail number');
  await page.evaluate(() => document.getElementById('bBoat').click()); await page.waitForTimeout(800); // (the setup's Yacht Club link)
  await page.click('[data-f="tab"][data-v="season"]'); await page.waitForTimeout(500);
  const st = await page.evaluate(() => [...document.querySelectorAll('.standings tbody tr')].map(tr => tr.innerText.replace(/\s+/g, ' ').trim()));
  console.log('standings:', JSON.stringify(st));
  if (st.length !== 8) fail('the standings don\'t list the 8 boats');
  await page.screenshot({ path: out + '/season-standings.png' });
  console.log('ERRORS:', errs.join('\n') || 'none'); await browser.close();
  if (errs.length) process.exit(1);
})();
