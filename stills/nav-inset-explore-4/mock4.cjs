// r272 round 4: the tape on a plain band, the heading shown three ways without a chip.
// r272 round 3: the compass top-centre, skinny, four ways; on layout D.
// r272 round 2 (throwaway, not the app): the instruments in one group, a compact nav strip, the r271 corner controls.
// The live game at 1920x1080 with its own elements moved by injected CSS/DOM. node mock2.cjs <out-dir>
const { chromium } = require('playwright');
const out = process.argv[2];
const CSS = `
.mx{position:fixed;z-index:30;font-family:var(--f-inst);color:#e9f2f5}
.mx-strip{display:flex;align-items:stretch;background:var(--pod);border:1px solid var(--rule);border-radius:8px;overflow:hidden}
.mx-strip > div{flex:none;display:flex;flex-direction:column;justify-content:center;padding:5px 11px;border-left:1px solid var(--rule)}
.mx-strip > div:first-child{border-left:0}
.mx-l{font-size:9.5px;font-weight:700;letter-spacing:.12em;color:#8fa9b8;line-height:1.2}
.mx-v{font-size:19px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap}
.mx-v small{font-size:10.5px;font-weight:600;color:#a9bcc6;margin-left:2px}
.mx-dest{color:#ffb627;font-size:12.5px;font-weight:700;letter-spacing:.05em;white-space:nowrap}
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
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 } }); p.setDefaultTimeout(240000); p.on('console', m => { if (m.text().startsWith('strip')) console.log(m.text()); });
    p.on('pageerror', e => console.log('ERR', e.message));
    await p.addInitScript(m => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}');
      Object.assign(s, m === 'cruise' ? { mode: 'sail', sailFrom: 'cityfront', sailTo: 'alcatraz', windKind: 'west', windKt: 14, tideDate: '2026-07-11', tideTime: '15:00' }
        : { mode: 'race', opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5'], windKind: 'west', windKt: 14, tideDate: '2026-07-11', tideTime: '13:00', seq: 3 });
      localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); }, mode);
    await p.addInitScript({ content: '// The nav strip\'s "To" name (the owner, 20 Nov 2026): brief, never truncated. Her slip: Home. A place: its bare name\n// (no "Off", no "(south side)", nothing after a comma, no light or buoy designation). Racing, the mark by its code.\nfunction shortName(name, race, slip) {\n  if (slip) return \'Home\';\n  if (race && name.includes(\' · \')) return name.split(\' · \')[0];\n  let n = name.includes(\' · \') ? name.split(\' · \')[1] : name;\n  n = n.replace(/\\s*\\(.*?\\)/g, \'\').replace(/^(Off|Under|North of|South of|East of|West of)\\s+/i, \'\').replace(/^the\\s+/i, \'\').replace(/,.*$/, \'\').replace(/\\s+light\\b.*$/i, \'\')\n    .replace(/\\s+[RG]\\s+"[^"]*".*$/, \'\').replace(/\\s+"[^"]*".*$/, \'\').replace(/\\s+(start mark|outer buoy|mid-channel)$/i, \'\').trim();\n  return n;\n}\nwindow.__short = shortName;\n' });
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
          const head = v.race ? `<div class="mx-hd"><span class="mx-l">NEXT</span><span class="mx-dest">${__short(window.__forceName ?? v.name, true, false).toUpperCase()} ${v.side === 'S' ? '<span class="mx-good">▶ stbd</span>' : '<span class="mx-bad">◀ port</span>'}</span></div>`
            : `<div class="mx-hd"><span class="mx-l">TO</span><span class="mx-dest">${__short(window.__forceName ?? v.name, false, /slip/i.test(v.name)).toUpperCase()}</span></div>`;
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
        for (const el of [...document.querySelectorAll('#hud .pod'), ...document.querySelectorAll('#hudRight .pod')]) { if (el.classList.contains('hdg')) { el.style.display = 'none'; continue; } g.appendChild(el); }
        return g;
      };
      window.__fixedOf = el => { while (el && el !== document.body && getComputedStyle(el).position !== 'fixed') el = el.parentElement; return el; };
    });
    return p;
  };
  const label = (p, id, sub) => p.evaluate(([id, sub]) => { const d = document.createElement('div'); d.className = 'mx-lab'; d.id = 'mxLab'; d.innerHTML = id + '<small>' + sub + '</small>'; document.body.appendChild(d); }, [id, sub]);
  const unlabel = p => p.evaluate(() => document.getElementById('mxLab')?.remove());



  // the compass: a tape on a plain band (44 px, slightly transparent, crisp ends), the heading shown without a chip
  const compass = (p, style) => p.evaluate(style => {
    const W = 560, BAND = 44, TOP = style.startsWith('G2') ? 26 : 0, H = BAND + TOP, c = document.createElement('canvas'); c.id = 'mxCompass'; c.width = W * 2; c.height = H * 2;
    c.style.cssText = `position:fixed;z-index:30;top:${TOP ? 4 : 16}px;left:${(innerWidth - W) / 2}px;width:${W}px;height:${H}px;pointer-events:none`;
    document.body.appendChild(c); const g = c.getContext('2d'); g.scale(2, 2);
    const n360 = a => ((a % 360) + 360) % 360, wrap = a => { a = n360(a); return a > 180 ? a - 360 : a; }, Dg = Math.PI / 180;
    const brg = (dx, dy) => n360(Math.atan2(dx, dy) / Dg), F = '"Saira Semi Condensed","Arial Narrow",sans-serif';
    const lifts = style.endsWith('+F3');
    const draw = () => {
      const w = sim(), u = w.user, h = u.h, from = u.ww.from, m = w.nextMark(u), mb = m ? brg(m.p.x - u.x, m.p.y - u.y) : null;
      const hm = window.__hud?.meanHdg; if (lifts && hm && hm[u.tack] == null) hm[u.tack] = n360(h + (u.tack === 'S' ? 15 : -15));
      const mean = hm?.[u.tack] ?? null;
      g.clearRect(0, 0, W, H);
      // the band: one even, slightly see-through fill, square-ended
      g.fillStyle = 'rgba(10,24,34,.62)'; g.fillRect(0, TOP, W, BAND);
      g.strokeStyle = 'rgba(150,196,218,.22)'; g.lineWidth = 1; g.strokeRect(0.5, TOP + 0.5, W - 1, BAND - 1);
      const span = 75, x0 = W / 2, half = W / 2 - 10, k = half / span, X = a => x0 + wrap(a - h) * k, y0 = TOP;
      const hdg = String(Math.round(n360(h)) % 360).padStart(3, '0') + '°';
      // G3: the ticks part round the digits at the centre
      g.font = `700 21px ${F}`; const gap = style.startsWith('G3') ? g.measureText(hdg).width / 2 + 9 : 0;
      if (lifts && mean != null) { const d = wrap(h - mean) * (u.tack === 'S' ? -1 : 1), a = X(mean), b0 = X(h);
        g.fillStyle = d >= 0 ? 'rgba(63,209,151,.38)' : 'rgba(255,93,76,.38)'; g.fillRect(Math.min(a, b0), y0 + 15, Math.abs(b0 - a), 13);
        g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(a, y0 + 12); g.lineTo(a, y0 + 30); g.stroke(); }
      for (let a = Math.ceil((h - span) / 5) * 5; a <= h + span; a += 5) {
        const x = X(a); if (Math.abs(x - x0) < gap) continue;
        const big = a % 30 === 0, mid = a % 10 === 0, len = big ? 12 : mid ? 8 : 5;
        g.strokeStyle = big ? '#e9f2f5' : mid ? 'rgba(233,242,245,.75)' : 'rgba(233,242,245,.42)'; g.lineWidth = big ? 1.6 : 1;
        g.beginPath(); g.moveTo(x, y0 + 15); g.lineTo(x, y0 + 15 + len); g.stroke();
        if (big && Math.abs(x - x0) > Math.max(gap, 22)) { const n = n360(a), t = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[n] ?? String(n).padStart(3, '0');
          g.fillStyle = /[NESW]/.test(t) ? '#ffffff' : '#a9bcc6'; g.font = `700 ${/[NESW]/.test(t) ? 12 : 10.5}px ${F}`; g.textAlign = 'center'; g.fillText(t, x, y0 + BAND - 4); }
      }
      // the wind (blue ▼) and the next mark (amber ◆) on the tape's top edge, or an arrow at its end when off it
      const at = (b, col, shape) => { const d = wrap(b - h), off = Math.abs(d) > span, x = off ? x0 + Math.sign(d) * half : X(b), y = y0 + 8;
        if (!off && Math.abs(x - x0) < (style.startsWith('G1') ? 26 : gap)) return; // (not over the heading's digits)
        g.fillStyle = col; g.strokeStyle = '#08141e'; g.lineWidth = 1.2; g.beginPath();
        if (off) { const s = Math.sign(d); g.moveTo(x, y - 6); g.lineTo(x + 8 * s, y); g.lineTo(x, y + 6); }
        else if (shape === 'wind') { g.moveTo(x - 6, y - 5); g.lineTo(x + 6, y - 5); g.lineTo(x, y + 5); }
        else { g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); }
        g.closePath(); g.fill(); g.stroke(); };
      at(from, '#5ab8ff', 'wind'); if (mb != null) at(mb, '#ffb627', 'mark');
      g.fillStyle = '#ffffff'; g.textAlign = 'center';
      if (style.startsWith('G1')) { // a thin lubber line at the centre, the digits set into the tape's top edge
        g.font = `700 14px ${F}`; g.fillText(hdg, x0, y0 + 12);
        g.strokeStyle = '#ffb627'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0 + 15); g.lineTo(x0, y0 + BAND); g.stroke();
      } else if (style.startsWith('G2')) { // the digits above the tape's centre, the instruments' type, a small notch into the band
        g.font = `700 20px ${F}`; g.lineJoin = 'round'; g.strokeStyle = 'rgba(8,20,30,.85)'; g.lineWidth = 4; g.strokeText(hdg, x0, 19); g.fillStyle = '#ffffff'; g.fillText(hdg, x0, 19);
        g.fillStyle = '#ffb627'; g.beginPath(); g.moveTo(x0 - 6, y0); g.lineTo(x0 + 6, y0); g.lineTo(x0, y0 + 8); g.fill();
        g.strokeStyle = '#ffb627'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0, y0 + 8); g.lineTo(x0, y0 + 28); g.stroke();
      } else { // G3: the digits in the centre of the tape, the ticks parted round them; a notch above and below
        g.font = `700 21px ${F}`; g.fillText(hdg, x0, y0 + 30);
        g.fillStyle = '#ffb627'; g.beginPath(); g.moveTo(x0 - 5, y0); g.lineTo(x0 + 5, y0); g.lineTo(x0, y0 + 6); g.fill();
        g.beginPath(); g.moveTo(x0 - 5, y0 + BAND); g.lineTo(x0 + 5, y0 + BAND); g.lineTo(x0, y0 + BAND - 6); g.fill();
      }
      requestAnimationFrame(draw);
    };
    draw();
  }, style);
  const STYLES = {
    G1: 'A thin lubber line at the centre, the heading set into the tape’s top edge; the wind and the mark on it',
    G2: 'The heading above the tape’s centre in the instruments’ type, a small notch pointer; the wind and the mark on it',
    G3: 'The heading in the tape’s centre, the ticks parting round it; the wind and the mark on it',
    'G2+F3': 'G2 with the lift/header band: green lifted, red headed, from the tack’s mean (white tick)',
  };
  for (const [id, sub] of Object.entries(STYLES)) {
    const p = await shoot('race');
    await p.evaluate(() => {
      const g = __inst('column'); g.style.left = '16px'; g.style.top = '16px';
      const fl = document.getElementById('sigPanel'); if (fl && !fl.hidden) { g.appendChild(fl); fl.style.position = 'static'; fl.style.width = '132px'; }
      __corners();
      const s = __strip(false); s.style.right = '16px'; s.style.top = '16px';
      document.getElementById('map').style.setProperty('top', '84px', 'important');
      document.getElementById('appBar').style.visibility = 'hidden';
    });
    await compass(p, id); await p.waitForTimeout(1500);
    const tag = id.replace('+', '-');
    await label(p, `${id}-race`, sub); await p.waitForTimeout(300);
    await p.screenshot({ path: `${out}/${tag}-race.png` }); await unlabel(p);
    const r = await p.evaluate(() => { const r = document.getElementById('mxCompass').getBoundingClientRect(); return { x: r.x - 8, y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 }; });
    await p.screenshot({ path: `${out}/compass-${tag}.png`, clip: r }); await p.close();
    console.log('done', id);
  }
  await b.close();
})();
