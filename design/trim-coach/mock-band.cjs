// Trim coach revamp mock-up (the owner, via the Coordinator, 14 Nov 2026): stills over the real page, with the coach's
// own output (src/boat/coach.ts lessons) for a mis-trimmed boat in the same run. node tc-mock.cjs <out>
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch({ args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(200000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5173/?inproc'); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="race"]').click()); await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector('[data-home="create"]').click()); await p.waitForTimeout(3000);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(6000);
  // close-hauled, every line by hand, set to the coach's best, then three set wrong; what the coach says about each line
  const D = await p.evaluate(async () => {
    const w = sim(), u = w.user, C = await import('/src/boat/coach.ts');
    u.trimAll = true; u.manualTrim = true; u.h = (w.wind.from + 45) % 360; u.desired = u.h;
    for (let i = 0; i < 60 * 20; i++) w.step(1 / 60);
    const set = (k, v) => { u.ctl[k] = v; if (u.ctlTarget) u.ctlTarget[k] = v; };
    for (const l of C.lessons(u).list) if (l.line && l.to != null) set(l.line, l.to);
    for (let i = 0; i < 60 * 5; i++) w.step(1 / 60);
    set('vang', 0); set('backstay', 0); set('jibsheet', Math.min(1, u.ctl.jibsheet + 0.25));
    for (let i = 0; i < 60 * 6; i++) w.step(1 / 60);
    const { s, list } = C.lessons(u), tws = Math.round(s.tws);
    // the three parts for each line: now (what it's doing to her), should (the lesson's own step), why (one reason)
    const words = l => {
      const k = l.line, more = l.to > u.ctl[k];
      switch (k) {
        // (a sheet's value is how far it's eased: a target above it is an ease)
        case 'jibsheet': return more ? { now: "Over-trimmed: the jib's stalled", why: 'A stalled jib pushes her sideways.' } : { now: "Eased: the jib's luffing", why: 'A luffing jib barely pulls.' };
        case 'mainsheet': return more ? { now: "In too hard: the main's stalled", why: 'Stalled, it pushes her sideways.' } : { now: "Eased: the main's luff is lifting", why: "A lifting luff isn't pulling." };
        case 'traveller': return more ? { now: 'Too far up to windward', why: 'Less heel and helm, same shape.' } : { now: 'Down to leeward', why: 'Boom to the centerline, leech still open: height.' };
        case 'vang': return more ? { now: 'Off: the top of the main twists away', why: 'With the sheet eased, only the vang holds the leech.' } : { now: 'Tight: the leech is closed', why: 'She needs more twist.' };
        case 'backstay': return more ? { now: 'Off: both sails full', why: `In ${tws} kt, flatter sails drive instead of heel.` } : { now: 'On: both sails flat', why: 'Fuller sails for power.' };
        case 'outhaul': return more ? { now: 'Eased: the foot is deep', why: "Power she can't use in this breeze." } : { now: 'Tight: the foot is flat', why: 'A deeper foot is power.' };
        case 'cunningham': case 'downhaul': return more ? { now: 'Eased: the draft has blown aft', why: 'Luff tension pulls it forward.' } : { now: 'Tight: the draft is too far forward', why: 'Back to the middle: power.' };
        case 'jibHalyard': return more ? { now: "Soft: the jib's draft is aft", why: 'Halyard tension pulls it forward.' } : { now: 'Tight: a crease up the luff', why: 'Lets the draft move back.' };
      }
      return { now: '', why: l.why };
    };
    const should = h => { const t = h.replace(/\.$/, '').replace(/^Trim the (jib|main) in, /, 'In, ').replace(/^Ease the (jib|main), /, 'Out, '); return t[0].toUpperCase() + t.slice(1); };
    return { label: s.label, tws: s.tws, twa: u.twa, speed: s.speedKt, target: s.targetKt, ctl: { ...u.ctl },
      list: list.filter(l => l.line).map(l => ({ line: l.line, to: l.to, head: l.head, gain: l.gain, should: should(l.head), ...words(l) })) };
  });
  console.log(JSON.stringify(D.list.map(l => [l.line, (l.gain * 100).toFixed(1) + '%', l.now, l.should, l.why])));
  fs.writeFileSync(out + '/tc-mock-data.json', JSON.stringify(D, null, 1));
  await p.evaluate(() => { if (!document.body.classList.contains('band-open')) document.getElementById('bBand').click(); });
  await p.waitForTimeout(2500);

  // the mock's own styles: the page's tokens; amber for "yours to fix", teal for the target, green for "right"
  await p.addStyleTag({ content: `
    .tcm{--fix:#ffb627;--tgt:#3ad1c1;--ok:#5fd38d;--ink:#e8eef3;--dim:#93a6b6;font-family:var(--f-body);color:var(--ink)}
    .tcm-live{position:fixed;left:16px;top:662px;width:240px;height:165px;background:#0f1b27f2;border:1px solid #22384a;border-left:4px solid var(--fix);border-radius:6px;padding:12px 14px;box-sizing:border-box;z-index:50}
    .tcm-live .eb{font:600 10px/1 var(--f-inst, system-ui);letter-spacing:.14em;color:var(--dim)}
    .tcm-live .n{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--fix);color:#1a1205;font:700 11px/1 var(--f-inst);margin-right:6px;vertical-align:2px}
    .tcm-live .h{font:700 17px/1.25 var(--f-inst, system-ui);margin:10px 0 6px}
    .tcm-live .s{font:500 12px/1.35 var(--f-body);color:var(--dim)}
    .tcm-live .hold{position:absolute;left:14px;right:14px;bottom:12px;height:3px;background:#22384a;border-radius:2px}
    .tcm-live .hold i{position:absolute;left:0;top:0;bottom:0;width:62%;background:var(--fix);border-radius:2px}
    .tcm-live .q{position:absolute;right:12px;top:11px;font:600 10px/1 var(--f-inst);color:var(--dim);letter-spacing:.08em}
    .tcm-ring{position:fixed;border:2px solid var(--fix);border-radius:5px;box-shadow:0 0 0 3px #ffb62733;z-index:50;pointer-events:none}
    .tcm-tgt{position:fixed;width:10px;height:10px;background:var(--tgt);transform:translate(-50%,-50%) rotate(45deg);box-shadow:0 0 0 2px #0a141c;z-index:51}
    .tcm-dim{position:fixed;inset:0;background:#06101acc;z-index:40}
    .tcm-sheet{position:fixed;left:50%;top:70px;transform:translateX(-50%);width:1240px;background:#0f1b27;border:1px solid #22384a;border-radius:10px;z-index:45;padding:18px 20px 16px;box-sizing:border-box}
    .tcm-hd{display:flex;align-items:baseline;gap:16px;margin-bottom:14px}
    .tcm-hd h2{font:700 22px/1 var(--f-inst);margin:0}
    .tcm-hd .sit{font:600 12px/1 var(--f-inst);letter-spacing:.12em;color:var(--dim)}
    .tcm-hd .spd{margin-left:auto;font:600 13px/1 var(--f-inst)}
    .tcm-hd .spd b{font-size:20px} .tcm-hd .spd i{font-style:normal;color:var(--dim)}
    .tcm-hd .x{margin-left:14px;font:600 12px/1 var(--f-inst);letter-spacing:.1em;border:1px solid #2c4659;border-radius:6px;padding:8px 12px;color:var(--ink)}
    .tcm-row{display:grid;grid-template-columns:repeat(9,1fr);gap:8px}
    .tcm-row + .tcm-row{margin-top:8px}
    .tcm-c{background:#0a141c;border:1px solid #1d3242;border-radius:7px;padding:10px 10px 11px;position:relative}
    .tcm-c.fix{border-color:#ffb62766;background:#16140c}
    .tcm-c .nm{display:flex;align-items:center;gap:6px;font:700 11px/1.1 var(--f-inst);letter-spacing:.08em;text-transform:uppercase}
    .tcm-c .nm .rope{width:4px;height:14px;border-radius:2px;background:var(--rope)}
    .tcm-c .badge{margin-left:auto;display:inline-grid;place-items:center;min-width:18px;height:18px;border-radius:9px;font:700 11px/1 var(--f-inst)}
    .tcm-c.fix .badge{background:var(--fix);color:#1a1205}
    .tcm-c.ok .badge{color:var(--ok);font-size:14px}
    .tcm-tr{position:relative;height:56px;width:14px;margin:10px auto 10px;background:#06101a;border:1px solid #22384a;border-radius:3px}
    .tcm-tr.h{height:12px;width:auto;margin:10px 4px}
    .tcm-tr .now{position:absolute;left:-3px;right:-3px;height:3px;background:#fff;border-radius:1px;transform:translateY(-50%)}
    .tcm-tr.h .now{top:-3px;bottom:-3px;width:3px;height:auto;right:auto;transform:translateX(-50%)}
    .tcm-tr .tg{position:absolute;left:50%;width:9px;height:9px;background:var(--tgt);transform:translate(-50%,-50%) rotate(45deg);box-shadow:0 0 0 2px #0a141c}
    .tcm-tr.h .tg{top:50%}
    .tcm-tr .arr{position:absolute;left:50%;width:2px;background:var(--tgt);opacity:.55;transform:translateX(-50%)}
    .tcm-tr.h .arr{top:50%;height:2px;transform:translateY(-50%)}
    .tcm-c dl{margin:0;display:grid;grid-template-columns:1fr;gap:1px;font:500 12px/1.3 var(--f-body)}
    .tcm-c dd + dt{margin-top:6px}
    .tcm-c dt{font:700 9.5px/1.5 var(--f-inst);letter-spacing:.1em;color:var(--dim)}
    .tcm-c dd{margin:0}
    .tcm-c dd.sh{color:var(--tgt);font-weight:600}
    .tcm-c.ok p{margin:0;font:500 12px/1.3 var(--f-body);color:var(--dim)}
    .tcm-wx{display:grid;place-items:center;text-align:center;font:600 11px/1.4 var(--f-inst);color:var(--dim);letter-spacing:.06em}
    .tcm-wx b{display:block;font-size:15px;color:var(--ink);letter-spacing:0}
    .tcm-wide{grid-column:span 4}
    .tcm-foot{margin-top:12px;font:500 11px/1 var(--f-body);color:var(--dim)}
  ` });
  await p.evaluate(() => document.body.classList.add('tcm'));

  // ---- 1. live: one note, held; the line it's about ringed in the band, its target on the track
  await p.evaluate(D => {
    const top = D.list[0], sel = top.line === 'jibsheet' ? '.sailband [data-line="jib"][data-side="S"]' : `.sailband [data-line="${top.line}"]`, col = document.querySelector(sel);
    const host = document.createElement('div'); host.className = 'tcm'; host.id = 'tcmLive';
    host.innerHTML = `<div class="tcm-live"><span class="eb">COACH</span><span class="q">1 of ${D.list.length}</span>
      <div class="h"><span class="n">1</span>${top.head.replace(/\.$/, '')}</div>
      <div class="s">${top.now}. ${top.why}</div><div class="hold"><i></i></div></div>`;
    document.body.append(host);
    if (col) {
      const r = col.getBoundingClientRect(), ring = document.createElement('div'); ring.className = 'tcm-ring';
      Object.assign(ring.style, { left: r.x - 4 + 'px', top: r.y - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' }); host.append(ring);
      const wl = col.querySelector('.sb-well'), well = wl && wl.getBoundingClientRect();
      if (well) { const tg = document.createElement('div'); tg.className = 'tcm-tgt'; Object.assign(tg.style, { left: well.x + well.width / 2 + 'px', top: well.y + well.height * top.to + 'px' }); host.append(tg); }
    }
    for (const id of ['coachPanel', 'situ', 'trimPanel']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }
  }, D);
  await p.waitForTimeout(400);
  await p.screenshot({ path: out + '/tc-1-live.png' });
  await p.evaluate(() => { document.getElementById('tcmLive').remove(); for (const id of ['coachPanel', 'situ', 'trimPanel']) { const e = document.getElementById(id); if (e) e.style.visibility = ''; } });

  // ---- Option 1, closed: a Notes tab in the band's own tab row (beside Hand back), and "All notes ›" in the coach note
  await p.addStyleTag({ content: `
    .tcm-notes-tab{outline:2px solid #3ad1c1;outline-offset:1px}
    .tcm-all{display:inline-block;margin-top:8px;font:700 11px/1 var(--f-inst);letter-spacing:.08em;color:#3ad1c1;text-transform:uppercase}
    .tcm-band{position:fixed;left:40px;right:40px;z-index:45}
    .tcm-band .bar{display:flex;align-items:baseline;gap:14px;margin:0 0 8px 2px}
    .tcm-band .bar h2{margin:0;font:700 18px/1 var(--f-inst)}
    .tcm-band .bar .sit{font:600 11px/1 var(--f-inst);letter-spacing:.12em;color:var(--dim)}
    .tcm-band .bar .slow{font:700 11px/1 var(--f-inst);letter-spacing:.1em;color:#1a1205;background:#3ad1c1;border-radius:4px;padding:4px 7px}
    .tcm-band .bar .spd{margin-left:auto;font:600 13px/1 var(--f-inst)} .tcm-band .bar .spd b{font-size:18px} .tcm-band .bar .spd i{font-style:normal;color:var(--dim)}
    .tcm-band .cards{display:grid;grid-template-columns:repeat(11,1fr);gap:7px;align-items:end}
    .tcm-band .tcm-c{padding:9px 9px 10px;background:#0a141cf2}
    .tcm-band .tcm-c.fix{background:#17140bf5}
    .tcm-band .tcm-c .tcm-tr{display:none}
    .tcm-band .tcm-c .nm{font-size:10px}
    .tcm-band .tcm-c dl{margin-top:8px;font-size:11.5px}
    .tcm-band .tcm-c.ok p{margin-top:6px;font-size:11px}
    .tcm-lead{position:fixed;inset:0;z-index:44;pointer-events:none}
    .tcm-scrim{position:fixed;inset:0;background:linear-gradient(to top,#06101add 0,#06101a99 55%,#06101a33 100%);z-index:43}
  ` });
  await p.evaluate(D => {
    const tabs = document.querySelector('.sailband .sb-tabs'), t = document.createElement('button');
    t.type = 'button'; t.className = 'sb-tab tcm-notes-tab'; t.textContent = 'Notes'; tabs?.prepend(t);
    const top = D.list[0], host = document.createElement('div'); host.className = 'tcm'; host.id = 'tcmLive2';
    host.innerHTML = `<div class="tcm-live"><span class="eb">COACH</span><span class="q">1 of ${D.list.length}</span>
      <div class="h"><span class="n">1</span>${top.head.replace(/\.$/, '')}</div>
      <div class="s">${top.now}. ${top.why}</div><span class="tcm-all">All notes ›</span><div class="hold"><i></i></div></div>`;
    document.body.append(host);
    for (const id of ['coachPanel', 'situ', 'trimPanel']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }
  }, D);
  await p.waitForTimeout(400);
  await p.screenshot({ path: out + '/tc-4-opt1-closed.png' });

  // ---- Option 1, open: the notes grow up out of the band, each card on a leader down to its own line; time at ¼
  await p.evaluate(D => {
    document.getElementById('tcmLive2').remove();
    const ROPE = { jibsheet: '#e8a33b', downhaul: '#c9c9c9', jibCunningham: '#e06aa3', cunningham: '#d65b5b', outhaul: '#3fb6c6', vang: '#9b6bd9', jibHalyard: '#d0773c', backstay: '#cfcfcf', mainsheet: '#4c8be0', traveller: '#4c8be0', car: '#9aa7b3' };
    const L = Object.fromEntries(D.list.map((l, i) => [l.line, { ...l, n: i + 1 }])), tws = Math.round(D.tws);
    const OK = { downhaul: 'Draft about halfway back', jibCunningham: 'Jib luff smooth', cunningham: 'Draft where it should be', outhaul: `Foot right for ${tws} kt`, jibHalyard: 'Hank wrinkles just gone', backstay: `Right for ${tws} kt`, vang: 'Leech held', mainsheet: 'Main drawing', traveller: 'Boom where it pays', jibsheet: 'Telltales streaming', car: "Crew's: set for upwind" };
    const NAME = { jibsheet: 'Jib sheet', downhaul: 'Main hal.', jibCunningham: 'Jib cunn.', cunningham: 'Main cunn.', outhaul: 'Outhaul', vang: 'Vang', jibHalyard: 'Jib hal.', backstay: 'Backstay', mainsheet: 'Mainsheet', traveller: 'Traveler', car: 'Jib car' };
    // each line's column in the band (the leeward jib sheet: starboard here; the dual-ended lines: their port end)
    const colOf = k => document.querySelector(k === 'jibsheet' ? '.sailband [data-line="jib"][data-side="S"]' : k === 'car' ? '.sailband [data-line="car"][data-side="P"]' : `.sailband [data-line="${k}"]`);
    const keys = ['car', 'jibsheet', 'downhaul', 'jibCunningham', 'cunningham', 'outhaul', 'vang', 'jibHalyard', 'backstay', 'mainsheet', 'traveller'];
    const at = k => { const r = colOf(k).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y }; };
    keys.sort((a, b) => at(a).x - at(b).x);
    const card = k => { const l = L[k], fix = !!l;
      return `<div class="tcm-c ${fix ? 'fix' : 'ok'}" data-k="${k}" style="--rope:${ROPE[k]}"><div class="nm"><span class="rope"></span>${NAME[k]}<span class="badge">${fix ? l.n : '✓'}</span></div>
        ${fix ? `<dl><dt>NOW</dt><dd>${l.now}</dd><dt>SHOULD</dt><dd class="sh">${l.should}</dd><dt>WHY</dt><dd>${l.why}</dd></dl>` : `<p>${OK[k]}</p>`}</div>`; };
    const band = document.querySelector('.sailband').getBoundingClientRect();
    const host = document.createElement('div'); host.className = 'tcm'; host.id = 'tcmBand';
    host.innerHTML = `<div class="tcm-scrim"></div><svg class="tcm-lead"></svg><div class="tcm-band" style="bottom:${innerHeight - band.y + 70}px">
      <div class="bar"><h2>Trim notes</h2><span class="sit">${D.label}</span><span class="slow">¼ SPEED</span>
        <span class="spd"><b>${D.speed.toFixed(1)}</b> <i>of</i> <b>${D.target.toFixed(1)}</b> <i>kt</i></span></div>
      <div class="cards">${keys.map(card).join('')}</div></div>`;
    document.body.append(host);
    // the leaders: from each card's foot down to its line's column
    const svg = host.querySelector('svg'); let s = '';
    for (const el of host.querySelectorAll('.tcm-c')) {
      const k = el.dataset.k, r = el.getBoundingClientRect(), a = { x: r.x + r.width / 2, y: r.bottom }, b = at(k), fix = !!L[k];
      const my = a.y + (b.y - a.y) * 0.55;
      s += `<path d="M${a.x} ${a.y} C${a.x} ${my},${b.x} ${my},${b.x} ${b.y - 3}" fill="none" stroke="${fix ? '#ffb627' : '#3a5468'}" stroke-width="${fix ? 1.6 : 1}" opacity="${fix ? .9 : .7}"/><circle cx="${b.x}" cy="${b.y - 3}" r="${fix ? 3 : 2}" fill="${fix ? '#ffb627' : '#3a5468'}"/>`;
    }
    svg.setAttribute('width', innerWidth); svg.setAttribute('height', innerHeight); svg.innerHTML = s;
    // the band stays live and on top: the lines are worked right under their notes; its Notes tab now on
    const bandEl = document.querySelector('.sailband'); if (getComputedStyle(bandEl).position === 'static') bandEl.style.position = 'relative'; bandEl.style.zIndex = 46;
    // the fix's target on its track, as live
    const top = D.list[0], col = colOf(top.line), wl = col?.querySelector('.sb-well');
    if (wl) { const w = wl.getBoundingClientRect(), tg = document.createElement('div'); tg.className = 'tcm-tgt'; Object.assign(tg.style, { left: w.x + w.width / 2 + 'px', top: w.y + w.height * top.to + 'px', zIndex: 60 }); host.append(tg); }
  }, D);
  await p.waitForTimeout(500);
  await p.screenshot({ path: out + '/tc-5-opt1-open.png' });
  console.log('errors:', errs.join(' | ') || 'none'); await b.close();
})();
