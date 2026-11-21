const { chromium } = require('playwright');
// r294 phase 1 in the page: her bottom foul (9 weeks on your clock), the setup's one line and its Care link, her Care tab,
// Mike booked, the Particulars bottom row. node scripts/check/care.cjs <out-dir> [<dev server url>]
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 860 }, deviceScaleFactor: 1 }), errs = []; p.on('pageerror', e => errs.push(e.message));
  const URL = process.argv[3] || 'http://localhost:5173/', OUT = process.argv[2];
  await p.goto(URL); await p.waitForTimeout(4500);
  const json = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); const d = new Date(); d.setDate(d.getDate() - 63); const day = d.toISOString().slice(0, 10);
    const boat = { ...s.boat, cleanedOn: day }; Object.assign(s, { boat, boats: (s.boats || [boat]).map(x => x.id === boat.id ? boat : x), mode: 'race' }); return JSON.stringify(s); });
  await p.addInitScript(j => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('fbsim-settings-v2', j); sessionStorage.setItem('seeded', '1'); } }, json);
  await p.goto(URL); await p.waitForTimeout(4500);
  // the setup: her bottom's line
  await p.evaluate(() => document.querySelector('[data-home="race"]')?.click()); await p.waitForTimeout(2000);
  await p.evaluate(() => { const r = document.querySelector('#row-boat .srow-head'); r?.click(); }); await p.waitForTimeout(800);
  const line = await p.evaluate(() => [...document.querySelectorAll('#crewRows small')].map(e => e.textContent));
  console.log('setup line:', JSON.stringify(line));
  await p.screenshot({ path: `${OUT}/care-setup-line.png` });
  await p.evaluate(() => document.querySelector('[data-crew="care"]')?.click()); await p.waitForTimeout(2000);
  const care = await p.evaluate(() => ({ tabs: [...document.querySelectorAll('#fleetBoat .yctabs button')].map(e => e.textContent + (e.getAttribute('aria-pressed') === 'true' ? '*' : '')), word: document.querySelector('.careword')?.textContent, btn: !!document.querySelector('[data-f="mike"]') }));
  console.log('care tab:', JSON.stringify(care));
  await p.screenshot({ path: `${OUT}/care-tab-foul.png` });
  await p.evaluate(() => document.querySelector('[data-f="mike"]').click()); await p.waitForTimeout(800);
  console.log('booked:', await p.evaluate(() => document.querySelector('.carenote')?.textContent), await p.evaluate(() => JSON.parse(localStorage.getItem('fbsim-settings-v2')).boat.diverBooked));
  await p.screenshot({ path: `${OUT}/care-tab-booked.png` });
  await p.evaluate(() => document.querySelector('[data-f="btab"][data-v="particulars"]').click()); await p.waitForTimeout(600);
  console.log('bottom row:', await p.evaluate(() => [...document.querySelectorAll('#fleetBoat .ftab tr')].map(r => r.textContent).find(t => t.startsWith('Bottom'))));
  console.log('ERR', errs.join('; ') || 'none'); await b.close();
})();
