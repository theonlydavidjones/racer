const pw = require('playwright'), fs = require('fs'), path = require('path');
(async () => {
  const dir = __dirname, b = await pw.chromium.launch({ args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(200000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5174/?inproc'); await p.waitForTimeout(4000);
  await p.click('[data-home="race"]'); await p.click('[data-home="create"]'); await p.waitForTimeout(2500);
  await p.click('#bGo'); await p.waitForTimeout(8000);
  await p.keyboard.press('Escape'); await p.waitForTimeout(1500);
  await p.mouse.move(5, 5); await p.screenshot({ path: path.join(dir, '0-pause-today.png') });
  if (process.argv[2] === 'raced') { // (racing a while: the debrief has something to say)
    await p.keyboard.press('Escape'); await p.waitForTimeout(800);
    await p.evaluate(() => { const w = sim(); w.speed = 16; }); await p.waitForTimeout(60000);
    console.log('t', await p.evaluate(() => Math.round(sim().t)));
    await p.keyboard.press('Escape'); await p.waitForTimeout(2000);
    console.log('debrief', await p.$eval('#pauseDebrief', e => e.hidden ? 'hidden' : e.textContent.slice(0, 80)));
    await p.screenshot({ path: path.join(dir, '0b-pause-today-raced.png') });
  }
  await p.evaluate(src => (0, eval)(src), fs.readFileSync(path.join(dir, 'mock.js'), 'utf8')); await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(dir, process.argv[2] === 'raced' ? '2-pause-column-debrief.png' : '1-pause-column.png') });
  console.log('errors:', errs.join(' | ') || 'none'); await b.close();
})();
