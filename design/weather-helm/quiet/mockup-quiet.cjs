// MOCK-UPS (nothing built), round 4: quieter weather-helm marks at the foot of the tiller guide's dashed line, both tacks.
// Values by hand: starboard tack 4 deg weather (balanced), port tack 9 deg weather (past the band); q2 also at 1 deg lee.
const { chromium } = require('playwright');
const [out, url] = [process.argv[2], process.argv[3]];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 860 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(180000);
  await p.goto(url + '?inproc'); await p.waitForTimeout(5000);
  await p.evaluate(() => { document.querySelector('[data-home="race"]').click(); setTimeout(() => document.querySelector('[data-home="create"]')?.click(), 1000); setTimeout(() => document.getElementById('bGo')?.click(), 2500); });
  await p.waitForTimeout(9000); await p.mouse.move(700, 430);
  for (let i = 0; i < 20 && !(await p.evaluate(() => document.body.classList.contains('tiller-held'))); i++) { await p.keyboard.press('t'); await p.waitForTimeout(1500); }
  const x = deg => 700 + deg / 46.5 * 0.5 * 1400;
  const cases = [['S', 4, 'q1'], ['P', 9, 'q1'], ['S', 4, 'q2'], ['P', 9, 'q2'], ['S', -1, 'q2'], ['S', 4, 'q3'], ['P', 9, 'q3']];
  for (const [tack, avg, opt] of cases) {
    await p.evaluate(t => { const u = sim().user, twd = u.h + u.rel; u.h = ((twd + (t === 'S' ? -50 : 50)) % 360 + 360) % 360; u.tack = t; }, tack); await p.waitForTimeout(2000);
    const ww = tack === 'S' ? 1 : -1; await p.mouse.move(x(6.5 * ww * Math.sign(avg)), 430); await p.waitForTimeout(400);
    await p.evaluate(([ww, avg, opt]) => {
      document.querySelectorAll('.mk').forEach(e => e.remove());
      const g = document.getElementById('tillerGuide'), a = Math.abs(avg), held = avg * ww, inBand = avg >= 2 && avg <= 5;
      const pc = d => `${50 + d / 46.5 * 50}%`, mk = (st) => { const e = document.createElement('div'); e.className = 'mk'; Object.assign(e.style, { position: 'absolute' }, st); g.append(e); return e; };
      // (the guide's own: its dashes are 2 px white at .55; the number a thin face, the same white, a hair of shadow to stay legible on bright water)
      const num = (txt, color) => { const e = mk({ bottom: 'calc(22% - 6px)', font: '400 13px/1 var(--f-inst)', letterSpacing: '.04em', color, textShadow: '0 0 3px rgba(0,0,0,.45)' }); e.textContent = txt;
        if (held >= 0) e.style.left = 'calc(50% + 7px)'; else e.style.right = 'calc(50% + 7px)'; return e; };
      if (opt === 'q1') num(`${a}°`, 'rgba(255,255,255,.62)');
      if (opt === 'q2' && !inBand) num(`${a}°`, 'rgba(255,182,39,.75)');
      if (opt === 'q3') {
        // the balanced band, a faint bar on the foot to windward; the average, a short tick
        mk({ bottom: 'calc(22% - 2px)', height: '3px', left: ww > 0 ? pc(2) : pc(-5), width: `${3 / 46.5 * 50}%`, background: 'rgba(255,255,255,.28)', borderRadius: '2px' });
        mk({ bottom: 'calc(22% - 7px)', height: '12px', width: '2px', marginLeft: '-1px', left: pc(held), background: inBand ? 'rgba(255,255,255,.75)' : 'rgba(255,182,39,.8)', borderRadius: '1px' });
      }
    }, [ww, avg, opt]);
    const nm = `quiet-${opt}_${tack === 'S' ? 'stbd' : 'port'}tack_${Math.abs(avg)}${avg < 0 ? 'lee' : 'weather'}`;
    await p.screenshot({ path: `${out}/${nm}.png` });
    await p.screenshot({ path: `${out}/${nm}_close.png`, clip: { x: 500, y: 560, width: 400, height: 150 } });
  }
  await b.close();
})();
