// The Drill mock-up's stills: the start page with the Drill card, and the Drill screen. Needs the dev server.
const pw = require('playwright'), fs = require('fs'), path = require('path');
(async () => {
  const dir = __dirname, b = await pw.chromium.launch({ args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(200000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5173/'); await p.waitForTimeout(4000);
  await p.click('[data-home="race"]'); await p.click('[data-home="create"]'); await p.waitForTimeout(3500);
  await p.evaluate(src => (0, eval)(src), fs.readFileSync(path.join(dir, 'mock.js'), 'utf8')); await p.waitForTimeout(500);
  await p.evaluate(() => window.__drillHome()); await p.mouse.move(5, 5); await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(dir, '1-start-page.png') });
  await p.evaluate(() => window.__drillPage()); await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(dir, '2-drill.png') });
  console.log('errors:', errs.join(' | ') || 'none'); await b.close();
})();
