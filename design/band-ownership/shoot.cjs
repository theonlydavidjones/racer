// The band-ownership mock-up's stills, cropped to the band (the dev server on :5173). Usage: node design/band-ownership/shoot.cjs
const pw = require('playwright'), fs = require('fs'), path = require('path');
(async () => {
  const dir = __dirname, b = await pw.chromium.launch({ args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(300000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5173/'); await p.waitForTimeout(5000);
  await p.click('[data-home="race"]'); await p.click('[data-home="create"]'); await p.waitForTimeout(3000);
  await p.click('#bGo'); await p.waitForTimeout(7000);
  const band = async () => { const r = await p.$eval('#sailBand', e => { const q = e.getBoundingClientRect(); return { x: q.x - 10, y: q.y - 40, width: q.width + 20, height: q.height + 50 }; }); return r; };
  await p.mouse.move(5, 5);
  await p.screenshot({ path: path.join(dir, '0-crew-all-today.png'), clip: await band() });
  // take two lines: the starboard vang and the starboard jib sheet
  await p.click('.sb-v[data-line="vang"][data-side="S"] [data-act="pull"]'); await p.waitForTimeout(800);
  await p.click('.sb-v[data-line="jib"][data-side="S"] [data-act="pull"]'); await p.waitForTimeout(2500);
  await p.mouse.move(5, 5);
  await p.screenshot({ path: path.join(dir, '1-two-yours-today.png'), clip: await band() });
  await p.evaluate(src => (0, eval)(src), fs.readFileSync(path.join(dir, 'mock.js'), 'utf8'));
  for (const k of ['a', 'b', 'c']) {
    await p.evaluate(k => { __mock.clear(); __mock[k](); }, k); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(dir, `2-option-${k}.png`), clip: await band() });
  }
  console.log('mine:', await p.$$eval('#sailBand .mine', l => l.map(e => e.dataset.line + (e.dataset.side ?? '')).join(',')), '· errors:', errs.join(' | ') || 'none'); await b.close();
})();
