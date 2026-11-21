// Do the game surface's controls answer? Each is clicked once on the running race and what changed is read back.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.setDefaultTimeout(240000);
  await p.goto('http://localhost:5199/?inproc'); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="race"]').click()); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-home="create"]')?.click()); await p.waitForTimeout(1000);
  await p.evaluate(() => document.getElementById('bGo')?.click()); await p.waitForTimeout(6000);
  const state = () => p.evaluate(() => { const w = sim(); return { paused: w.paused, speed: w.speed, fast: document.querySelector('#bFast .w')?.textContent, fastOn: document.getElementById('bFast').classList.contains('on'), sound: document.querySelector('#bSound .w')?.textContent, view: document.querySelector('#bView .w')?.textContent, crewPop: !document.getElementById('crewPop').hidden, tools: !document.getElementById('toolsTray').hidden, band: document.querySelector('.sailband')?.className, msgAll: !document.getElementById('msgLog').classList.contains('closed'), tiller: document.body.classList.contains('tiller-held') }; });
  const click = async (sel, what) => { const a = await state(); await p.evaluate(s => document.querySelector(s).click(), sel); await p.waitForTimeout(1200); const c = await state(); const diff = Object.keys(c).filter(k => JSON.stringify(a[k]) !== JSON.stringify(c[k])).map(k => `${k}: ${a[k]} → ${c[k]}`); console.log((diff.length ? 'answers ' : 'NO ANSWER ') + what + ' ' + diff.join('; ')); return diff.length > 0; };
  await click('#bPause', 'Pause (opens the pause screen)'); await click('#bResume', 'Resume on the pause screen');
  await click('#bFast', 'Speed'); await click('#bFast', 'Speed 2'); await click('#bFast', 'Speed 3');
  await click('#bSound', 'Sound'); await click('#bSound', 'Sound again');
  await click('#bTools', 'Tools'); await click('#bTools', 'Tools close');
  await click('#bView', 'Cockpit/Chase'); await click('#bView', 'next view'); await click('#bView', 'next view');
  await click('#bCrew', 'Crew'); await click('#bCrew', 'Crew close');
  await click('.sb-away', 'Band away ▾');
  await p.keyboard.press('t'); await p.waitForTimeout(1200); console.log('T takes the tiller:', (await state()).tiller);
  await p.keyboard.press('Shift+Y'); await p.waitForTimeout(800); console.log('Shift+Y speed key:', (await state()).fast);
  await p.keyboard.press('p'); await p.waitForTimeout(800); console.log('P pauses:', (await state()).paused);
  await b.close();
})();
