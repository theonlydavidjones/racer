// Throwaway mock-ups for the owner (not the app): the live game at 1920x1080, with the navigator's data and the inset map
// combined by injected DOM, filled from the sim's own fields every 250 ms. node mock.cjs <out-dir>
const { chromium } = require('playwright');
const out = process.argv[2];
const CSS = `
.mx{position:fixed;z-index:30;font-family:var(--f-inst);color:#e9f2f5;pointer-events:none}
.mx-card{background:rgba(10,24,34,.86);border:1px solid rgba(150,196,218,.25);border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.35)}
.mx-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 10px;padding:10px 12px}
.mx-c{display:flex;flex-direction:column;align-items:flex-start;min-width:0}
.mx-l{font-size:10px;font-weight:700;letter-spacing:.12em;color:#8fa9b8}
.mx-v{font-size:22px;font-weight:700;line-height:1.05;font-variant-numeric:tabular-nums;white-space:nowrap}
.mx-v small{font-size:11px;font-weight:600;color:#a9bcc6;margin-left:2px}
.mx-head{display:flex;align-items:center;gap:8px;padding:8px 12px 0;font-size:12px;font-weight:700;letter-spacing:.06em;color:#ffb627;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mx-head i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ffb627;flex:none}
.mx-good{color:#3fd197}.mx-warn{color:#ffb627}.mx-bad{color:#ff5d4c}
.mx-corner{position:fixed;z-index:36;font-family:var(--f-inst);pointer-events:none;text-shadow:0 0 3px #08141e,0 0 3px #08141e}
.mx-lab{position:fixed;z-index:40;left:50%;top:64px;transform:translateX(-50%);text-align:center;font:700 40px var(--f-inst);color:#ffb627;text-shadow:0 2px 8px #000;pointer-events:none;background:rgba(10,24,34,.82);padding:8px 18px 10px;border-radius:10px}
.mx-lab small{display:block;font-size:18px;color:#e9f2f5;font-weight:600}
`;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const shoot = async (mode, opts) => {
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
    // the live values, from the sim's own fields
    await p.addStyleTag({ content: CSS });
    await p.evaluate(() => {
      const KT = 0.514444, D = Math.PI / 180;
      const brg = (dx, dy) => (Math.atan2(dx, dy) / D + 360) % 360, fmt = n => String(Math.round(n)).padStart(3, '0');
      const w0 = sim(), u0 = w0.user; window.__start = { x: u0.x, y: u0.y };
      window.__vals = () => {
        const w = sim(), u = w.user, sog = Math.hypot(u.vx, u.vy) / KT, cog = brg(u.vx, u.vy);
        const m = w.nextMark(u), p = m ? m.p : null, out = { sog: sog.toFixed(1), cog: fmt(cog), bsp: (u.v / KT).toFixed(1), tws: Math.round(u.ww.kt), clock: w.clock, t: w.t, name: m ? m.name : '' };
        if (p) {
          const r = Math.hypot(p.x - u.x, p.y - u.y), vmc = (u.vx * (p.x - u.x) + u.vy * (p.y - u.y)) / Math.max(1, r);
          out.brg = fmt(brg(p.x - u.x, p.y - u.y)); out.dtw = r < 370 ? [r.toFixed(0), 'm'] : [(r / 1852).toFixed(1), 'nm'];
          out.vmc = (vmc / KT).toFixed(1); out.ttg = vmc > 0.1 ? r / vmc : Infinity;
          const now = w.clock.split(':').map(Number), mins = now[0] * 60 + now[1] + (isFinite(out.ttg) ? out.ttg / 60 : 0);
          out.eta = isFinite(out.ttg) ? `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(Math.round(mins % 60) % 60).padStart(2, '0')}` : '--:--';
          out.ttgS = !isFinite(out.ttg) ? '--' : out.ttg < 3600 ? [Math.round(out.ttg / 60), 'min'] : [(out.ttg / 3600).toFixed(1), 'h'];
          // cross-track: off the straight line from where she set out to the destination (+ to starboard of it)
          const a = window.__start, dx = p.x - a.x, dy = p.y - a.y, L = Math.hypot(dx, dy) || 1, xt = ((u.x - a.x) * dy - (u.y - a.y) * dx) / L;
          out.xte = [Math.abs(xt) < 1000 ? Math.round(Math.abs(xt)) : (Math.abs(xt) / 1852).toFixed(1), Math.abs(xt) < 1000 ? 'm' : 'nm', xt > 0 ? 'S' : 'P'];
          out.side = m.side;
        }
        // fleet position (derived: legs done, then nearest to the next mark)
        if (!w.freeSail) { const prog = x => x.leg * 1e6 - (w.nextMark(x) ? Math.hypot(w.nextMark(x).p.x - x.x, w.nextMark(x).p.y - x.y) : 0); const order = [...w.boats].sort((a, b) => prog(b) - prog(a)); out.pos = order.indexOf(u) + 1; out.of = w.boats.length; }
        return out;
      };
    });
    await opts(p);
    await p.waitForTimeout(1200);
    return p;
  };
  // a cell
  const cellJs = `const C=(l,v,u='',c='')=>'<div class="mx-c"><span class="mx-l">'+l+'</span><span class="mx-v '+c+'">'+v+(u?'<small>'+u+'</small>':'')+'</span></div>';`;
  const label = (p, id, text, sub) => p.evaluate(([id, text, sub]) => { const d = document.createElement('div'); d.className = 'mx-lab'; d.innerHTML = id + ' <small>' + text + '</small>' + (sub ? '<small>' + sub + '</small>' : ''); document.body.appendChild(d); }, [id, text, sub]);
  const run = async (p, js) => p.evaluate(js);

  // ---------- C: today's tile, and the dashboard tile (cruising) ----------
  let p;
  if (process.env.ALL) { p = await shoot('cruise', async () => {});
  await p.screenshot({ path: `${out}/today-cruise.png` });
  const r = await p.evaluate(() => { const r = document.getElementById('nextCard').getBoundingClientRect(); return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }; });
  await p.screenshot({ path: `${out}/C-today-tile.png`, clip: r });
  await run(p, `(() => { ${cellJs}
    const nc = document.getElementById('nextCard'), r = nc.getBoundingClientRect(); nc.style.visibility='hidden';
    const d = document.createElement('div'); d.className='mx mx-card'; d.style.cssText='left:'+r.left+'px;top:'+r.top+'px;width:300px';
    document.body.appendChild(d);
    const f = () => { const v = __vals(); d.innerHTML = '<div class="mx-head"><i></i>TO '+v.name.toUpperCase()+'</div><div class="mx-grid">'
      + C('BRG',v.brg,'°') + C('DTW',v.dtw[0],v.dtw[1]) + C('ETA',v.eta) + C('SOG',v.sog,'kn') + C('VMC',v.vmc,'kn', +v.vmc>0.3?'mx-good':'mx-warn') + C('TTG',v.ttgS[0],v.ttgS[1])
      + C('XTE',v.xte[0],v.xte[1]+' '+v.xte[2]) + C('COG',v.cog,'°') + C('BSP',v.bsp,'kn') + '</div>'; };
    f(); setInterval(f, 250); })()`);
  await p.waitForTimeout(800);
  const r2 = await p.evaluate(() => { const r = document.querySelector('.mx').getBoundingClientRect(); return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }; });
  await p.screenshot({ path: `${out}/C-dashboard-tile.png`, clip: r2 });
  await p.close(); }

  // ---------- A: cruising with a destination: the data with the inset ----------
  const A = {
    A1: ['A1 · Data strip docked under the inset', 'The inset stays top right; its navigator data in a grid right under it', `(() => { ${cellJs}
      document.getElementById('nextCard').style.display='none'; document.getElementById('map').style.zIndex='35';
      const m = document.getElementById('map').getBoundingClientRect(), d = document.createElement('div'); d.className='mx mx-card';
      d.style.cssText='left:'+(m.right-280)+'px;top:'+(m.bottom+10)+'px;width:280px'; document.body.appendChild(d);
      const f = () => { const v = __vals(); d.innerHTML = '<div class="mx-head"><i></i>'+v.name.toUpperCase()+'</div><div class="mx-grid">'
        + C('BRG',v.brg,'°') + C('DTW',v.dtw[0],v.dtw[1]) + C('ETA',v.eta) + C('SOG',v.sog,'kn') + C('VMC',v.vmc,'kn','mx-good') + C('XTE',v.xte[0],v.xte[1]) + '</div>'; };
      f(); setInterval(f, 250); })()`],
    A2: ['A2 · Data in the inset’s corners', 'The inset in a square tile; four numbers in its corners, the destination on one line', `(() => { ${cellJs}
      document.getElementById('nextCard').style.display='none'; document.getElementById('map').style.zIndex='35';
      const mp = document.getElementById('map'); mp.style.setProperty('right','58px','important'); mp.style.setProperty('top','118px','important'); const m = mp.getBoundingClientRect(), pad = 40, sq = document.createElement('div'); sq.className='mx mx-card';
      sq.style.cssText='left:'+(m.left-pad)+'px;top:'+(m.top-pad+6)+'px;width:'+(m.width+2*pad)+'px;height:'+(m.height+2*pad+30)+'px;z-index:1';
      document.body.appendChild(sq);
      const corner = (x, y, al) => { const e = document.createElement('div'); e.className='mx-corner'; e.style.cssText='left:'+x+'px;top:'+y+'px;text-align:'+al; document.body.appendChild(e); return e; };
      const L = m.left-pad+10, R = m.right+pad-10, T = m.top-pad+12, B = m.bottom+pad-24;
      const c1 = corner(L,T,'left'), c2 = corner(R-90,T,'right'), c3 = corner(L,B,'left'), c4 = corner(R-90,B,'right'), nm = corner(m.left-pad,m.bottom+pad+14,'center');
      nm.style.width=(m.width+2*pad)+'px'; nm.style.font='700 12px var(--f-inst)'; nm.style.letterSpacing='.06em'; nm.style.color='#ffb627';
      const one = (e,l,v,u,c='') => { e.style.width='90px'; e.innerHTML='<div class="mx-l">'+l+'</div><div class="mx-v '+c+'" style="font-size:20px">'+v+'<small>'+u+'</small></div>'; };
      const f = () => { const v = __vals(); one(c1,'BRG',v.brg,'°'); one(c2,'DTW',v.dtw[0],v.dtw[1]); one(c3,'SOG',v.sog,'kn'); one(c4,'ETA',v.eta,''); nm.textContent = v.name.toUpperCase()+' · TTG '+v.ttgS[0]+' '+v.ttgS[1]; };
      f(); setInterval(f, 250); })()`],
    A3: ['A3 · The inset grows a data panel', 'With a destination, the inset widens into one card: data on the left, the chart on the right', `(() => { ${cellJs}
      document.getElementById('nextCard').style.display='none'; document.getElementById('map').style.zIndex='35';
      const m = document.getElementById('map').getBoundingClientRect(), W = 250, card = document.createElement('div'); card.className='mx mx-card';
      card.style.cssText='left:'+(m.left-W-14)+'px;top:'+(m.top-10)+'px;width:'+(m.width+W+28)+'px;height:'+(m.height+20)+'px;z-index:1';
      document.body.appendChild(card);
      const d = document.createElement('div'); d.className='mx'; d.style.cssText='left:'+(m.left-W-8)+'px;top:'+(m.top-4)+'px;width:'+W+'px'; document.body.appendChild(d);
      const f = () => { const v = __vals(); d.innerHTML = '<div class="mx-head" style="padding-left:6px"><i></i>'+v.name.toUpperCase()+'</div><div class="mx-grid" style="grid-template-columns:repeat(2,1fr);padding:8px 6px">'
        + C('BRG',v.brg,'°') + C('DTW',v.dtw[0],v.dtw[1]) + C('ETA',v.eta) + C('TTG',v.ttgS[0],v.ttgS[1]) + C('SOG',v.sog,'kn') + C('VMC',v.vmc,'kn','mx-good') + '</div>'; };
      f(); setInterval(f, 250); })()`],
  };
  for (const [id, [t, sub, js]] of Object.entries(A)) {
    p = await shoot('cruise', async q => { await run(q, js); });
    await label(p, t.split(' · ')[0], t.split(' · ')[1], sub);
    await p.screenshot({ path: `${out}/${id}.png` }); await p.close(); console.log('done', id);
  }
  // ---------- B: racing ----------
  const markSide = `const side = v => v.side === 'S' ? '<span class="mx-good">▶ stbd</span>' : '<span class="mx-bad">◀ port</span>';
    const clock = t => { const a = Math.abs(t), s = Math.floor(a % 60); return (t < 0 ? '−' : '') + Math.floor(a / 60) + ':' + String(s).padStart(2, '0'); };`;
  const B = {
    B1: ['B1 · Race strip under the inset', 'The next mark, its range and bearing, VMG to it, the clock and your place, in a grid under the inset', `(() => { ${cellJs} ${markSide}
      document.getElementById('nextCard').style.display='none'; document.getElementById('map').style.zIndex='35';
      const m = document.getElementById('map').getBoundingClientRect(), d = document.createElement('div'); d.className='mx mx-card';
      d.style.cssText='left:'+(m.right-300)+'px;top:'+(m.bottom+10)+'px;width:300px'; document.body.appendChild(d);
      const f = () => { const v = __vals(); d.innerHTML = '<div class="mx-head"><i></i>'+v.name.toUpperCase()+' · '+side(v)+'</div><div class="mx-grid">'
        + C('BRG',v.brg,'°') + C('DTW',v.dtw[0],v.dtw[1]) + C('ETA',isFinite(v.ttg)?clock(v.ttg):'--')
        + C('VMG',v.vmc,'kn','mx-good') + C(v.t<0?'START':'RACE', clock(v.t), '', v.t<0&&v.t>-60?'mx-warn':'') + C('POS',v.pos,'/'+v.of) + '</div>'; };
      f(); setInterval(f, 250); })()`],
    B2: ['B2 · Race numbers in the inset’s corners', 'The clock and your place up top, the mark’s range and VMG below; laylines on the chart itself', `(() => { ${cellJs} ${markSide}
      document.getElementById('nextCard').style.display='none'; document.getElementById('map').style.zIndex='35';
      const mp = document.getElementById('map'); mp.style.setProperty('right','58px','important'); mp.style.setProperty('top','118px','important'); const m = mp.getBoundingClientRect(), pad = 40, sq = document.createElement('div'); sq.className='mx mx-card';
      sq.style.cssText='left:'+(m.left-pad)+'px;top:'+(m.top-pad+6)+'px;width:'+(m.width+2*pad)+'px;height:'+(m.height+2*pad+30)+'px;z-index:1'; document.body.appendChild(sq);
      const corner = (x, y) => { const e = document.createElement('div'); e.className='mx-corner'; e.style.cssText='left:'+x+'px;top:'+y+'px;width:90px'; document.body.appendChild(e); return e; };
      const L = m.left-pad+10, R = m.right+pad-100, T = m.top-pad+12, Bt = m.bottom+pad-24;
      const c1 = corner(L,T), c2 = corner(R,T), c3 = corner(L,Bt), c4 = corner(R,Bt), nm = corner(m.left-pad,m.bottom+pad+14);
      c2.style.textAlign = c4.style.textAlign = 'right'; nm.style.width=(m.width+2*pad)+'px'; nm.style.textAlign='center'; nm.style.font='700 12px var(--f-inst)'; nm.style.color='#ffb627';
      const one = (e,l,v,u,c='') => { e.innerHTML='<div class="mx-l">'+l+'</div><div class="mx-v '+c+'" style="font-size:20px">'+v+'<small>'+u+'</small></div>'; };
      const f = () => { const v = __vals(); one(c1, v.t<0?'START':'RACE', clock(v.t), '', v.t<0&&v.t>-60?'mx-warn':''); one(c2,'POS',v.pos,'/'+v.of); one(c3,'DTW',v.dtw[0],v.dtw[1]); one(c4,'VMG',v.vmc,'kn','mx-good');
        nm.innerHTML = v.name.toUpperCase()+' · BRG '+v.brg+'° · '+side(v); };
      f(); setInterval(f, 250); })()`],
    B3: ['B3 · A bigger race map with a side rail', 'The inset larger, and a narrow rail of race numbers beside it: the map does the laylines and the fleet', `(() => { ${cellJs} ${markSide}
      document.getElementById('nextCard').style.display='none'; document.getElementById('map').style.zIndex='35';
      const mp = document.getElementById('map'); mp.style.zIndex='35'; mp.style.setProperty('width','300px','important'); mp.style.setProperty('height','300px','important');
      setTimeout(() => {}, 0);
      const m = mp.getBoundingClientRect(), W = 120, card = document.createElement('div'); card.className='mx mx-card';
      card.style.cssText='left:'+(m.left-W-14)+'px;top:'+(m.top-10)+'px;width:'+(m.width+W+28)+'px;height:'+(m.height+20)+'px;z-index:1'; document.body.appendChild(card);
      const d = document.createElement('div'); d.className='mx'; d.style.cssText='left:'+(m.left-W-6)+'px;top:'+(m.top-2)+'px;width:'+W+'px'; document.body.appendChild(d);
      const f = () => { const v = __vals(); d.innerHTML = '<div class="mx-head" style="padding:4px 4px 0;white-space:normal">'+v.name.toUpperCase()+'<br>'+side(v)+'</div><div class="mx-grid" style="grid-template-columns:1fr;padding:6px 4px;gap:5px">'
        + C(v.t<0?'START':'RACE', clock(v.t), '', v.t<0&&v.t>-60?'mx-warn':'') + C('DTW',v.dtw[0],v.dtw[1]) + C('BRG',v.brg,'°') + C('VMG',v.vmc,'kn','mx-good') + C('POS',v.pos,'/'+v.of) + '</div>'; };
      f(); setInterval(f, 250); })()`],
  };
  for (const [id, [t, sub, js]] of Object.entries(B)) {
    p = await shoot('race', async q => { await run(q, js); });
    await label(p, t.split(' · ')[0], t.split(' · ')[1], sub);
    await p.screenshot({ path: `${out}/${id}.png` }); await p.close(); console.log('done', id);
  }

  await b.close();
})();
