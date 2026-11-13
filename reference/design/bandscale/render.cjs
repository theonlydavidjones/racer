const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1000 }, deviceScaleFactor: 2 });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://' + __dirname + '/bandscale.html'); await p.waitForTimeout(300);
  await p.screenshot({ path: __dirname + '/bandscale.png', fullPage: true }); console.log('ERR', errs.join('|')||'none'); await b.close(); })();
