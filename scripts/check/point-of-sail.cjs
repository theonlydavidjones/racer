// The point of sail is on screen with the windex (the owner, ROADMAP 8j): in the band's windex, and on the wind angle
// dial under the inset map when it's on; and it changes as she luffs up. Needs the dev server.
// Usage: node scripts/check/point-of-sail.cjs [out-dir] [url]
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '.', url = process.argv[3] || 'http://localhost:5173/?inproc';
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }); p.setDefaultTimeout(120000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url); await p.waitForTimeout(4000);
  await p.click('#bKeys0'); await p.waitForTimeout(500);
  await p.evaluate(() => { const c = document.querySelector('input[data-t="windDial"]'); if (c && !c.checked) c.click(); });
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.click('[data-home="race"]'); await p.click('[data-home="create"]'); await p.waitForTimeout(2500);
  await p.click('#bGo'); await p.waitForTimeout(6000);
  const read = () => p.evaluate(() => {
    const t = document.querySelector('#sailBand .sb-pos'), r = t?.getBoundingClientRect(), d = document.getElementById('dial');
    return { band: t?.textContent ?? '', bandShown: !!r && r.width > 0 && r.height > 0, dial: d?.dataset.pos ?? '', dialShown: !!d && !d.hidden && d.getBoundingClientRect().width > 0, twa: Math.round(sim().user.twa) };
  });
  const first = await read(); console.log('as she is:', JSON.stringify(first));
  await p.screenshot({ path: out + '/point-of-sail.png' });
  // luff her up to about 60° off the wind: the words follow
  await p.evaluate(() => { const w = sim(), u = w.user; u.h = (w.wind.from + 60) % 360; });
  await p.waitForTimeout(6000);
  const run = await read(); console.log('luffed up:', JSON.stringify(run));
  const errsOut = [];
  if (!first.band || !first.bandShown) errsOut.push('no point of sail in the band\'s windex');
  if (!first.dial || !first.dialShown) errsOut.push('no point of sail on the wind angle dial');
  if (first.band !== first.dial) errsOut.push(`the band and the dial differ (${first.band} / ${first.dial})`);
  if (run.band === first.band && Math.abs(run.twa - first.twa) > 40) errsOut.push('the words didn\'t follow her luffing up');
  if (run.band !== run.dial) errsOut.push(`after luffing up, the band and the dial differ (${run.band} / ${run.dial})`);
  console.log('ERRORS:', [...errsOut, ...errs].join(' | ') || 'none'); await b.close();
  if (errsOut.length || errs.length) process.exit(1);
})();
