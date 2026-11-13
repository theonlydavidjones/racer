const { chromium } = require('playwright'); const fs = require('fs'); const out = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(240000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5199/'); await p.waitForTimeout(4000);
  await p.evaluate(() => document.querySelector('[data-home="fleet"]').click()); await p.waitForTimeout(3000);
  await p.evaluate(() => document.querySelector('.fcard').click()); await p.waitForTimeout(3000);
  await p.evaluate(() => document.querySelector('[data-f="edit"]').click()); await p.waitForTimeout(5000);
  await p.evaluate(fs.readFileSync(__dirname + '/mock.js', 'utf8'));
  for (const m of ['folded', 'hull', 'lines']) { await p.evaluate(m => window.__mockEditor(m), m); await p.waitForTimeout(2500); await p.screenshot({ path: `${out}/editor-${m}.png` }); }
  console.log('errors', errs); await b.close();
})();
