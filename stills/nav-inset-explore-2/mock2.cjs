// r272 round 2 (throwaway, not the app): the instruments in one group, a compact nav strip, the r271 corner controls.
// The live game at 1920x1080 with its own elements moved by injected CSS/DOM. node mock2.cjs <out-dir>
const { chromium } = require('playwright');
const out = process.argv[2];
const CSS = `
.mx{position:fixed;z-index:30;font-family:var(--f-inst);color:#e9f2f5}
.mx-strip{display:flex;align-items:stretch;background:var(--pod);border:1px solid var(--rule);border-radius:8px;overflow:hidden}
.mx-strip > div{display:flex;flex-direction:column;justify-content:center;padding:5px 11px;border-left:1px solid var(--rule)}
.mx-strip > div:first-child{border-left:0}
.mx-l{font-size:9.5px;font-weight:700;letter-spacing:.12em;color:#8fa9b8;line-height:1.2}
.mx-v{font-size:19px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap}
.mx-v small{font-size:10.5px;font-weight:600;color:#a9bcc6;margin-left:2px}
.mx-dest{color:#ffb627;font-size:12.5px;font-weight:700;letter-spacing:.05em;white-space:nowrap;max-width:190px;overflow:hidden;text-overflow:ellipsis}
.mx-good{color:#3fd197}.mx-bad{color:#ff5d4c}
.mx-strip.two{display:grid;grid-template-columns:1fr 1fr}
.mx-strip.two > .mx-hd{grid-column:1 / 3;border-left:0;border-bottom:1px solid var(--rule)}
.mx-strip.two > div{border-left:0}
.mx-inst{display:flex;gap:8px}
.mx-inst .pod{width:132px!important;min-width:0!important;max-width:none!important;height:64px!important;box-sizing:border-box!important;margin:0!important;flex:none!important}
.mx-inst .pod.hdg canvas{width:100%!important}
.mx-lab{position:fixed;z-index:40;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;font:700 40px var(--f-inst);color:#ffb627;text-shadow:0 2px 8px #000;pointer-events:none;background:rgba(10,24,34,.82);padding:8px 18px 10px;border-radius:10px}
.mx-lab small{display:block;font-size:18px;color:#e9f2f5;font-weight:600}
.mx-br{position:fixed;z-index:30;display:flex;gap:6px;align-items:flex-end}
`;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const shoot = async mode => {
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); p.setDefaultTimeout(240000);
    p.on('pageerror', e => console.log('ERR', e.message));
    await p.addInitScript(m => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}');
      Object.assign(s, m === 'cruise' ? { mode: 'sail', sailFrom: 'cityfront', sailTo: 'alcatraz', windKind: 'west', windKt: 14, tideDate: '2026-07-11', tideTime: '15:00' }
        : { mode: 'race', opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5'], windKind: 'west', windKt: 14, tideDate: '2026-07-11', tideTime: '13:00', seq: 3 });
      localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); }, mode);
    await p.goto('http://localhost:5173/?inproc'); await p.waitForTimeout(7000);
    if (mode === 'cruise') await p.evaluate(() => document.querySelector('[data-home="cruise"]').click());
    else { await p.evaluate(() => document.querySelector('[data-home="race"]').click()); await p.waitForTimeout(800); await p.evaluate(() => document.querySelector('[data-home="create"]')?.click()); }
    await p.waitForTimeout(2500); await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(14000);
    await p.addStyleTag({ content: CSS });
    await p.evaluate(() => {
      const KT = 0.514444, D = Math.PI / 180, brg = (dx, dy) => (Math.atan2(dx, dy) / D + 360) % 360, f3 = n => String(Math.round(n)).padStart(3, '0');
      window.__vals = () => {
        const w = sim(), u = w.user, m = w.nextMark(u); if (!m) return null; const p = m.p;
        const r = Math.hypot(p.x - u.x, p.y - u.y), vmc = (u.vx * (p.x - u.x) + u.vy * (p.y - u.y)) / Math.max(1, r), ttg = vmc > 0.1 ? r / vmc : Infinity;
        return { name: m.name, side: m.side, brg: f3(brg(p.x - u.x, p.y - u.y)), dtw: r < 370 ? [r.toFixed(0), 'm'] : [(r / 1852).toFixed(1), 'nm'], vmc: (vmc / KT).toFixed(1),
          ttg: !isFinite(ttg) ? ['--', ''] : ttg < 3600 ? [String(Math.round(ttg / 60)), 'min'] : [(ttg / 3600).toFixed(1), 'h'], race: !w.freeSail };
      };
      // the nav strip: cruising, the destination then BRG DTW TTG VMC; racing, the mark and its side then BRG DTW VMG
      window.__strip = (two) => {
        document.getElementById('nextCard').style.display = 'none';
        const d = document.createElement('div'); d.className = 'mx mx-strip' + (two ? ' two' : ''); d.id = 'mxStrip'; document.body.appendChild(d);
        const cell = (l, v, u = '', c = '') => `<div><span class="mx-l">${l}</span><span class="mx-v ${c}">${v}${u ? `<small>${u}</small>` : ''}</span></div>`;
        const f = () => { const v = __vals(); if (!v) return;
          const head = v.race ? `<div class="mx-hd"><span class="mx-l">NEXT</span><span class="mx-dest">${v.name.toUpperCase()} ${v.side === 'S' ? '<span class="mx-good">▶ stbd</span>' : '<span class="mx-bad">◀ port</span>'}</span></div>`
            : `<div class="mx-hd"><span class="mx-l">TO</span><span class="mx-dest">${v.name.toUpperCase()}</span></div>`;
          d.innerHTML = head + cell('BRG', v.brg, '°') + cell('DTW', v.dtw[0], v.dtw[1]) + (v.race ? '' : cell('TTG', v.ttg[0], v.ttg[1])) + cell(v.race ? 'VMG' : 'VMC', v.vmc, 'kn', 'mx-good'); };
        f(); setInterval(f, 250); return d;
      };
      // r271's corner controls: Crew Auto beside the autopilot (bottom left); Exit in the corner, with chase, Tools, Sound,
      // Pause and the speed button beside it (bottom right)
      window.__corners = () => {
        const helm = document.getElementById('helmBar'), crew = document.getElementById('bCrew'); helm.appendChild(crew);
        const br = document.createElement('div'); br.className = 'mx-br'; br.style.cssText = 'right:16px;bottom:16px'; document.body.appendChild(br);
        const fast = document.getElementById('bFast'); fast.hidden = false;
        for (const id of ['bView', 'bTools', 'bSound', 'bPause', 'bFast', 'bExit']) br.appendChild(document.getElementById(id));
        document.getElementById('viewBar').style.visibility = 'hidden';
        return br;
      };
      // all the instruments in one group, one size
      window.__inst = (dir) => {
        const g = document.createElement('div'); g.className = 'mx mx-inst'; g.id = 'mxInst'; g.style.flexDirection = dir; if (dir === 'grid') { g.style.display = 'grid'; g.style.gridTemplateColumns = 'repeat(3,132px)'; }
        document.body.appendChild(g);
        for (const el of [...document.querySelectorAll('#hud .pod'), ...document.querySelectorAll('#hudRight .pod')]) g.appendChild(el);
        return g;
      };
      window.__fixedOf = el => { while (el && el !== document.body && getComputedStyle(el).position !== 'fixed') el = el.parentElement; return el; };
    });
    return p;
  };
  const label = (p, id, sub) => p.evaluate(([id, sub]) => { const d = document.createElement('div'); d.className = 'mx-lab'; d.id = 'mxLab'; d.innerHTML = id + '<small>' + sub + '</small>'; document.body.appendChild(d); }, [id, sub]);
  const unlabel = p => p.evaluate(() => document.getElementById('mxLab')?.remove());

  for (const mode of ['cruise', 'race']) {
    // today, for comparison
    let p = await shoot(mode); await p.waitForTimeout(800);
    await p.screenshot({ path: `${out}/today-${mode}.png` }); await p.close();
    // D: the instruments down the left edge; the nav strip top right, the inset map under it
    p = await shoot(mode);
    await p.evaluate(() => {
      const g = __inst('column'); g.style.left = '16px'; g.style.top = '16px';
      const lc = document.getElementById('leftCol'); const fl = document.getElementById('sigPanel'); if (fl && !fl.hidden) { g.appendChild(fl); fl.style.position = 'static'; fl.style.width = '132px'; }
      __corners();
      const s = __strip(false); s.style.right = '16px'; s.style.top = '16px';
      const map = document.getElementById('map'); map.style.setProperty('top', '84px', 'important');
      document.getElementById('appBar').style.visibility = 'hidden';
    });
    await p.waitForTimeout(1500);
    await label(p, `D-${mode}`, 'The instruments down the left edge · the nav strip top right, the inset map under it'); await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}/D-${mode}.png` }); await unlabel(p);
    const r = await p.evaluate(() => { const r = document.getElementById('mxStrip').getBoundingClientRect(); return { x: r.x - 6, y: r.y - 6, width: r.width + 12, height: r.height + 12 }; });
    await p.screenshot({ path: `${out}/strip-D-${mode}.png`, clip: r }); await p.close();
    // E: the instruments, the sail band and the nav strip along the bottom; the coach and messages up the right edge;
    // the top left clear, the inset top right
    p = await shoot(mode);
    await p.evaluate(() => {
      const br = __corners(), band = document.getElementById('sailBand').getBoundingClientRect();
      const g = __inst('grid'); g.style.right = (1920 - band.left + 10) + 'px'; g.style.bottom = '16px';
      const s = __strip(true); s.style.left = (band.right + 10) + 'px'; s.style.bottom = '16px'; s.style.width = '250px';
      // the coach and messages up the right edge, over the corner buttons
      const msg = document.getElementById('msgLog'), coachBtn = [...document.querySelectorAll('button, a, span')].find(e => /trim coach/i.test(e.textContent || '') && e.children.length === 0);
      const coach = coachBtn ? __fixedOf(coachBtn) : null, stack = document.createElement('div'); stack.className = 'mx'; stack.style.cssText = 'right:16px;bottom:84px;width:260px;display:flex;flex-direction:column;gap:8px';
      document.body.appendChild(stack);
      const fl = document.getElementById('sigPanel'); if (fl && !fl.hidden) { stack.appendChild(fl); fl.style.position = 'static'; }
      if (coach) { stack.appendChild(coach); coach.style.position = 'static'; coach.style.width = '100%'; }
      stack.appendChild(msg); msg.style.position = 'static'; msg.style.width = '100%';
      document.getElementById('appBar').style.visibility = 'hidden';
    });
    await p.waitForTimeout(1500);
    await label(p, `E-${mode}`, 'Along the bottom: the instruments, the sail controls, the nav strip · the coach and messages up the right edge'); await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}/E-${mode}.png` }); await unlabel(p);
    const r2 = await p.evaluate(() => { const r = document.getElementById('mxStrip').getBoundingClientRect(); return { x: r.x - 6, y: r.y - 6, width: r.width + 12, height: r.height + 12 }; });
    await p.screenshot({ path: `${out}/strip-E-${mode}.png`, clip: r2 }); await p.close();
    console.log('done', mode);
  }
  await b.close();
})();
