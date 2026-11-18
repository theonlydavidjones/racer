// MOCK-UP (nothing built): the weather-helm needle in the tiller guide. The cursor bar is the tiller now; added: a faint
// band for the well-balanced 2-5 degrees to windward (Good Old Boat: "between 2 and 4 degrees"; forum 3-5; too much past 8),
// and a soft mark at the tiller's average over the last few seconds; its degrees on hover.
const { chromium } = require('playwright');
const [out, url] = [process.argv[2], process.argv[3]];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 860 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(180000);
  await p.goto(url + '?inproc'); await p.waitForTimeout(5000);
  await p.evaluate(() => { document.querySelector('[data-home="race"]').click(); setTimeout(() => document.querySelector('[data-home="create"]')?.click(), 1000); setTimeout(() => document.getElementById('bGo')?.click(), 2500); });
  await p.waitForTimeout(9000); await p.mouse.move(700, 430);
  for (let i = 0; i < 20 && !(await p.evaluate(() => document.body.classList.contains('tiller-held'))); i++) { await p.keyboard.press('t'); await p.waitForTimeout(1500); }
  const x = deg => 700 + deg / 46.5 * 0.5 * 1400; // (the cursor's own mapping: TILLER_SPAN 0.5 of the width to hard over)
  for (const tack of ['S', 'P']) {
    await p.evaluate(t => { const u = sim().user, twd = u.h + u.rel; u.h = ((twd + (t === 'S' ? -50 : 50)) % 360 + 360) % 360; u.tack = t; }, tack); await p.waitForTimeout(2500);
    // weather helm: the tiller held to windward. On starboard tack the wind's from starboard: the tiller to starboard, screen right
    const ww = tack === 'S' ? 1 : -1, now = 6.5 * ww, avg = 4 * ww;
    await p.mouse.move(x(now), 430); await p.waitForTimeout(500);
    for (const hover of [false, true]) {
      await p.evaluate(([ww, avg, hover]) => {
        document.querySelectorAll('.wh-mock').forEach(e => e.remove());
        const g = document.getElementById('tillerGuide'), pc = d => `${50 + d / 46.5 * 50}%`;
        const band = document.createElement('div'); band.className = 'wh-mock';
        Object.assign(band.style, { position: 'absolute', top: '30%', bottom: '30%', left: ww > 0 ? pc(2) : pc(-5), width: `${3 / 46.5 * 50}%`, background: 'rgba(255,255,255,.22)', border: '1px solid rgba(0,0,0,.25)', borderRadius: '3px' });
        const mark = document.createElement('div'); mark.className = 'wh-mock';
        Object.assign(mark.style, { position: 'absolute', top: '28%', bottom: '28%', left: pc(avg), width: '10px', marginLeft: '-5px', background: 'rgba(255,255,255,.6)', borderRadius: '5px', boxShadow: '0 0 0 1px rgba(0,0,0,.35), 0 0 8px rgba(255,255,255,.4)' });
        g.append(band, mark);
        if (hover) { const t = document.createElement('div'); t.className = 'wh-mock'; t.textContent = `${Math.abs(avg)}° weather helm`;
          Object.assign(t.style, { position: 'absolute', top: 'calc(28% - 22px)', left: pc(avg), transform: 'translateX(-50%)', font: '600 11px/1.2 var(--f-inst)', letterSpacing: '.06em', color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.7)' }); g.append(t); }
      }, [ww, avg, hover]);
      const nm = `weatherhelm-mockup_${tack === 'S' ? 'stbd' : 'port'}tack${hover ? '_hover' : ''}`;
      await p.screenshot({ path: `${out}/${nm}.png` });
      await p.screenshot({ path: `${out}/${nm}_close.png`, clip: { x: 450, y: 180, width: 500, height: 460 } });
    }
  }
  await b.close();
})();
