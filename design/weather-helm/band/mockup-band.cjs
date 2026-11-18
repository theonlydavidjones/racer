// MOCK-UPS (nothing built): tiller angle and weather helm in the sail band, four options, both tacks. The values are put in
// by hand (the tiller now 6.5 deg to windward, its average 4 deg; option c's port tack shows 9 deg, past "too much").
const { chromium } = require('playwright');
const [out, url] = [process.argv[2], process.argv[3]];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 860 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(180000);
  await p.goto(url + '?inproc'); await p.waitForTimeout(5000);
  await p.evaluate(() => { document.querySelector('[data-home="race"]').click(); setTimeout(() => document.querySelector('[data-home="create"]')?.click(), 1000); setTimeout(() => document.getElementById('bGo')?.click(), 2500); });
  await p.waitForTimeout(9000);
  for (const tack of ['S', 'P']) {
    await p.evaluate(t => { const u = sim().user, twd = u.h + u.rel; u.h = ((twd + (t === 'S' ? -50 : 50)) % 360 + 360) % 360; u.tack = t; }, tack); await p.waitForTimeout(2500);
    for (const opt of ['a', 'b', 'c', 'd']) {
      const r = await p.evaluate(([tack, opt]) => {
        document.querySelectorAll('.mk').forEach(e => e.remove()); document.querySelectorAll('.mk-moved').forEach(e => { e.style.transform = ''; e.classList.remove('mk-moved'); }); document.querySelectorAll('.mk-hid').forEach(e => { e.style.visibility = ''; e.classList.remove('mk-hid'); });
        const ww = tack === 'S' ? 1 : -1, now = 6.5 * ww, avg = (opt === 'c' && tack === 'P' ? 9 : 4) * ww, NS = 'http://www.w3.org/2000/svg';
        const wx = document.querySelector('.sb-wx'), TEAL = 'var(--target)', AMBER = 'var(--accent)';
        const chip = (txt, amber) => { const c = document.createElement('span'); c.className = 'mk'; c.textContent = txt;
          Object.assign(c.style, { display: 'inline-block', padding: '2px 6px', borderRadius: '4px', font: '700 12px/1.1 var(--f-inst)', letterSpacing: '.02em', color: '#0a141c', background: amber ? '#ffb627' : '#e9f2f5', boxShadow: '0 1px 2px rgba(0,0,0,.5)', whiteSpace: 'nowrap' }); return c; };
        const label = `${Math.abs(avg)}° W`;
        // (the band rewrites the point-of-sail word every frame: a still copy of it stands in, the original hidden)
        const inLabel = (dy = 0) => { const pos = document.querySelector('.sb-pos:not(.mk)'); if (!pos) return; const cp = pos.cloneNode(true); cp.classList.add('mk');
          pos.style.visibility = 'hidden'; pos.classList.add('mk-hid'); if (dy) cp.style.transform = `translateY(${dy}px)`;
          const sp = document.createElement('span'); sp.textContent = ` · ${label}`; Object.assign(sp.style, { color: Math.abs(avg) > 8 ? '#ffb627' : 'inherit', fontWeight: '800' });
          cp.append(sp); pos.after(cp); };
        if (opt === 'a' || opt === 'd') {
          // an overlay in the windex's own coordinates, as the heel ring is
          const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'mk'); svg.setAttribute('viewBox', '-21 -21 182 182');
          Object.assign(svg.style, { position: 'absolute', left: '-15%', top: '-15%', width: '130%', height: '130%', overflow: 'visible', pointerEvents: 'none' });
          const P = (deg, r) => [70 + Math.sin(deg * Math.PI / 180) * r, 70 - Math.cos(deg * Math.PI / 180) * r];
          const el = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); svg.append(e); return e; };
          if (opt === 'a') {
            // (a) a helm ring round the dial's bottom, the heel ring's partner: the tiller's side is the dot's side
            const R = 78, ring = t => 180 - t * (60 / 46.5), arc = (t0, t1, st, w) => { const [x0, y0] = P(ring(t0), R), [x1, y1] = P(ring(t1), R); el('path', { d: `M${x0} ${y0} A${R} ${R} 0 0 ${t1 > t0 ? 0 : 1} ${x1} ${y1}`, fill: 'none', stroke: st, 'stroke-width': w }); };
            arc(-46.5, 46.5, '#8aa3b3', 3.4); arc(2 * ww, 5 * ww, '#3fd0c0', 8);
            const [ax, ay] = P(ring(avg), R); el('circle', { cx: ax, cy: ay, r: 6.5, fill: 'none', stroke: Math.abs(avg) > 8 ? '#ffb627' : '#f1f6f8', 'stroke-width': 2.6 });
            const [nx, ny] = P(ring(now), R); el('circle', { cx: nx, cy: ny, r: 5, fill: '#f1f6f8', stroke: '#0a141c', 'stroke-width': 2 });
          } else {
            // (d) the tiller drawn on her own deck in the dial, from the rudder head forward (angles x3, to be seen), a ghost at
            // its average and the teal wedge where a balanced helm lies
            const pin = [70, 108], L = 44, tip = t => [pin[0] + Math.sin(3 * t * Math.PI / 180) * L, pin[1] - Math.cos(3 * t * Math.PI / 180) * L];
            const [w0x, w0y] = tip(2 * ww), [w1x, w1y] = tip(5 * ww); el('path', { d: `M${pin[0]} ${pin[1]} L${w0x} ${w0y} L${w1x} ${w1y} Z`, fill: '#3fd0c0', opacity: '.8' });
            const [gx, gy] = tip(avg); el('line', { x1: pin[0], y1: pin[1], x2: gx, y2: gy, stroke: '#f1f6f8', 'stroke-width': 4, opacity: '.7', 'stroke-linecap': 'round' });
            const [tx, ty] = tip(now); el('line', { x1: pin[0], y1: pin[1], x2: tx, y2: ty, stroke: '#ffb627', 'stroke-width': 6, 'stroke-linecap': 'round' });
            el('circle', { cx: pin[0], cy: pin[1], r: 3, fill: '#d9a45b' });
          }
          wx.append(svg);
          if (opt === 'a') inLabel(16);
        } else if (opt === 'b') {
          // (b) a helm rail under the traveller's, as the band's tracks are drawn: P … S, the middle, the teal band to windward,
          // the tiller as the car, its average a hollow marker; the degrees at its end
          const trav = document.querySelector('.sb-trk[data-line="traveller"]'), row = trav.cloneNode(true);
          row.classList.add('mk'); row.removeAttribute('data-line'); row.querySelectorAll('.sb-cue, .sb-mark, .sb-rin, .sb-rtk').forEach(e => e.remove()); row.querySelectorAll('button.sb-a').forEach(e => { e.style.visibility = 'hidden'; });
          row.querySelector('.sb-nm').textContent = 'Helm';
          const rail = row.querySelector('.sb-rail'), pc = t => `${50 + t / 46.5 * 50}%`; rail.querySelectorAll('.sb-car, .sb-boom').forEach(e => e.remove());
          const add = (st) => { const e = document.createElement('span'); Object.assign(e.style, { position: 'absolute' }, st); rail.append(e); return e; };
          add({ top: '1px', bottom: '1px', left: ww > 0 ? pc(2) : pc(-5), width: `${3 / 46.5 * 50}%`, background: '#3fd0c0', borderRadius: '2px' });
          add({ top: '-4px', bottom: '-4px', left: pc(avg), width: '10px', marginLeft: '-5px', border: `2px solid ${Math.abs(avg) > 8 ? '#ffb627' : '#f1f6f8'}`, borderRadius: '3px' });
          add({ top: '-3px', bottom: '-3px', left: pc(now), width: '6px', marginLeft: '-3px', background: '#d9a45b', borderRadius: '2px', boxShadow: '0 1px 2px rgba(0,0,0,.6)' });
          const c = chip(label); Object.assign(c.style, { gridColumn: '7', marginLeft: '2px' }); row.style.gridTemplateColumns = '70px 10px 16px 1fr 16px 10px auto'; row.append(c);
          trav.after(row);
        } else {
          // (c) a number tile by the dial, dark on light; amber past 8 degrees
          inLabel();
        }
        const bb = document.getElementById('sailBand').getBoundingClientRect(); return { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
      }, [tack, opt]);
      const pad = 24, clip = { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - 40), width: Math.min(1400, r.w + 2 * pad), height: Math.min(860 - Math.max(0, r.y - 40), r.h + 60) };
      await p.screenshot({ path: `${out}/band-${opt}_${tack === 'S' ? 'stbd' : 'port'}tack.png`, clip });
      const dial = await p.evaluate(() => { const q = document.querySelector('.sb-wx').getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height }; });
      await p.screenshot({ path: `${out}/band-${opt}_${tack === 'S' ? 'stbd' : 'port'}tack_close.png`, clip: { x: dial.x - 170, y: dial.y - 40, width: dial.w + 340, height: dial.h + 140 } });
    }
  }
  await b.close();
})();
