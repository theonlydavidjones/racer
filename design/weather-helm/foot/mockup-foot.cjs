// MOCK-UPS (nothing built): the weather-helm readout at the foot of the tiller guide's dotted center line, three placements,
// both tacks; and a still marking which line is "the dotted line". Values by hand: starboard tack 4 deg weather (teal,
// balanced), port tack 9 deg weather (amber, past 8); placement 3 also shown at 1 deg lee (neutral).
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
  // which line: the guide's dashed center line, outlined
  await p.evaluate(() => { const l = document.querySelector('#tillerGuide .tg-line'), r = l.getBoundingClientRect(), m = document.createElement('div'); m.className = 'mk';
    Object.assign(m.style, { position: 'fixed', left: `${r.left - 14}px`, top: `${r.top - 8}px`, width: '30px', height: `${r.height + 16}px`, border: '3px solid #ff3df0', borderRadius: '10px', zIndex: 50, pointerEvents: 'none' });
    const t = document.createElement('div'); t.className = 'mk'; t.textContent = '"the dotted line": the tiller guide\'s center line'; Object.assign(t.style, { position: 'fixed', left: `${r.left + 24}px`, top: `${r.top + 10}px`, padding: '3px 8px', background: '#ff3df0', color: '#111', font: '700 13px/1.2 sans-serif', borderRadius: '4px', zIndex: 50 }); document.body.append(m, t); });
  await p.screenshot({ path: `${out}/which-line.png` });
  await p.evaluate(() => document.querySelectorAll('.mk').forEach(e => e.remove()));
  const cases = [['S', 4, 'a'], ['P', 9, 'a'], ['S', 4, 'b'], ['P', 9, 'b'], ['S', 4, 'c'], ['P', 9, 'c'], ['S', -1, 'c']];
  for (const [tack, avg, opt] of cases) {
    await p.evaluate(t => { const u = sim().user, twd = u.h + u.rel; u.h = ((twd + (t === 'S' ? -50 : 50)) % 360 + 360) % 360; u.tack = t; }, tack); await p.waitForTimeout(2000);
    const ww = tack === 'S' ? 1 : -1; await p.mouse.move(x(6.5 * ww * Math.sign(avg)), 430); await p.waitForTimeout(400);
    await p.evaluate(([ww, avg, opt]) => {
      document.querySelectorAll('.mk').forEach(e => e.remove());
      const g = document.getElementById('tillerGuide'), a = Math.abs(avg), lee = avg < 0;
      const col = !lee && a >= 2 && a <= 5 ? '#3fd0c0' : !lee && a > 8 ? '#ffb627' : '#e9f2f5';
      const pill = (txt) => { const c = document.createElement('div'); c.className = 'mk'; c.textContent = txt;
        Object.assign(c.style, { position: 'absolute', padding: '4px 10px', borderRadius: '999px', font: '700 14px/1.1 var(--f-inst)', letterSpacing: '.02em', color: '#0a141c', background: col, boxShadow: '0 1px 4px rgba(0,0,0,.55)', whiteSpace: 'nowrap' }); g.append(c); return c; };
      const txt = `${a}° ${lee ? 'lee' : 'weather'}`, foot = 'calc(22% - 2px)'; // (the line runs from 22% to 78% of the height: its foot at 78%)
      if (opt === 'a') { const c = pill(txt); Object.assign(c.style, { left: '50%', bottom: 'calc(22% - 13px)', transform: 'translateX(-50%)' }); }
      if (opt === 'b') {
        // to the side the helm's held, the windward side for weather helm: a short tick on the line's foot at the average
        const pc = d => `${50 + d / 46.5 * 50}%`, side = lee ? -ww : ww;
        const tick = document.createElement('div'); tick.className = 'mk'; Object.assign(tick.style, { position: 'absolute', bottom: 'calc(22% - 10px)', left: pc(avg * ww), width: '3px', height: '20px', marginLeft: '-1.5px', background: col, borderRadius: '2px', boxShadow: '0 0 0 1px rgba(0,0,0,.5)' }); g.append(tick);
        const c = pill(txt); Object.assign(c.style, { bottom: 'calc(22% - 12px)' }, side > 0 ? { left: 'calc(50% + 26px)' } : { right: 'calc(50% + 26px)' });
      }
      if (opt === 'c') {
        // a small scale under the line's foot, ±10 degrees across 160 px: the teal balanced band to windward, a tick at the average
        const W = 160, s = W / 20, wrap = document.createElement('div'); wrap.className = 'mk';
        Object.assign(wrap.style, { position: 'absolute', left: `calc(50% - ${W / 2}px)`, bottom: 'calc(22% + 20px)', width: `${W}px`, height: '10px', background: 'rgba(10,20,28,.72)', borderRadius: '5px', boxShadow: '0 0 0 1px rgba(255,255,255,.25)' });
        const bnd = document.createElement('div'); Object.assign(bnd.style, { position: 'absolute', top: '2px', bottom: '2px', left: `${W / 2 + (ww > 0 ? 2 : -5) * s}px`, width: `${3 * s}px`, background: '#3fd0c0', borderRadius: '2px' });
        const mid = document.createElement('div'); Object.assign(mid.style, { position: 'absolute', top: '-3px', bottom: '-3px', left: `${W / 2}px`, width: '1px', background: 'rgba(255,255,255,.7)' });
        const tk = document.createElement('div'); Object.assign(tk.style, { position: 'absolute', top: '-5px', bottom: '-5px', left: `${W / 2 + Math.max(-10, Math.min(10, avg * ww)) * s}px`, width: '4px', marginLeft: '-2px', background: col, borderRadius: '2px', boxShadow: '0 0 0 1px rgba(0,0,0,.6)' });
        wrap.append(bnd, mid, tk); g.append(wrap);
        const c = pill(txt); Object.assign(c.style, { left: '50%', bottom: 'calc(22% - 13px)', transform: 'translateX(-50%)' });
      }
    }, [ww, avg, opt]);
    const nm = `foot-${opt}_${tack === 'S' ? 'stbd' : 'port'}tack_${Math.abs(avg)}${avg < 0 ? 'lee' : 'weather'}`;
    await p.screenshot({ path: `${out}/${nm}.png` });
    await p.screenshot({ path: `${out}/${nm}_close.png`, clip: { x: 430, y: 500, width: 540, height: 230 } });
  }
  await b.close();
})();
