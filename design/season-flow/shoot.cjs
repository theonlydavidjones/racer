// The season-flow mock-up's stills, from the real page (dev server on the port given, default 5175). Usage: node shoot.cjs [port]
const pw = require('playwright'), fs = require('fs'), path = require('path');
(async () => {
  const dir = __dirname, port = process.argv[2] || '5175', b = await pw.chromium.launch({ args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(300000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://localhost:${port}/`); await p.waitForTimeout(5000);
  await p.mouse.move(5, 5);
  // today: Race (two cards)
  await p.click('[data-home="race"]'); await p.waitForTimeout(800); await p.screenshot({ path: path.join(dir, '0-race-today.png') });
  // the next race's setup, as the season would fill it: GGYC, its day and gun, the series' fleet
  const series = await p.evaluate(async () => { const m = await import('/src/club/season.ts'); const s = m.currentSeason(); return { id: s.id, title: s.title, host: s.host, fleet: s.fleet, races: s.races }; });
  const r1 = series.races[0]; console.log('season', series.title, 'R1', r1.date, r1.start, r1.courseNo);
  // the dates still to come: the first Saturday of Dec–Mar, as the series has run (researcher: only 7 Nov is published)
  const tbc = ['2026-12-05', '2027-01-02', '2027-02-06', '2027-03-06'];
  const next = { no: 2, date: tbc[0], start: r1.start };
  await p.click('[data-home="create"]'); await p.waitForTimeout(3000);
  await p.evaluate(() => { const b = document.querySelector('#hostSeg [data-host="ggyc"]'); if (b.getAttribute('aria-pressed') !== 'true') b.click(); }); await p.waitForTimeout(800);
  const setv = (id, v) => p.evaluate(([id, v]) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
  await setv('tideDate', next.date); await p.waitForTimeout(1500); await setv('tideTime', next.start); await p.waitForTimeout(3000);
  // the series' fleet, as the season sails it (club/season.ts: the five club boats and two of the club's other Folkboats)
  for (const id of await p.$$eval('#oppList [data-opp][aria-pressed="true"]', l => l.map(e => e.dataset.opp))) if (!series.fleet.includes(id)) await p.evaluate(id => document.querySelector(`#oppList [data-opp="${id}"]`).click(), id), await p.waitForTimeout(500);
  for (const id of series.fleet) await p.evaluate(id => { const b = document.querySelector(`#oppList [data-opp="${id}"]`); if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); }, id), await p.waitForTimeout(500);
  await p.waitForTimeout(2500);
  const got = await p.evaluate(() => {
    const q = s => document.querySelector(s);
    return {
      burgee: q('#row-course .srow-lead img')?.src ?? '', course: q('#row-course .srow-main').innerHTML, strip: q('#condStrip').outerHTML,
      boat: q('#row-boat .srow-lead').innerHTML, crew: [...document.querySelectorAll('#row-boat .srow-main > .t-group > .t-av')].slice(1).map(e => e.outerHTML).join(''),
      fleet: [...document.querySelectorAll('#oppList [data-opp][aria-pressed="true"]')].map(e => ({ title: e.title, hull: e.querySelector('.t-tile').style.background })),
      seq: (q('#siSum')?.textContent.match(/(\d)[- ]min/) || [])[1] || '3'
    };
  });
  console.log('fleet', got.fleet.length, 'seq', got.seq, 'burgee', !!got.burgee);
  // standings after race 1: a sample result (you 4th) so the table shows; the real one comes from your saved race
  const table = await p.evaluate(async ({ id, fleet }) => {
    const m = await import('/src/club/season.ts'), ui = await import('/src/ui/season.ts');
    const boats = fleet.map(f => { const t = f.title.split(':')[0]; const mm = /^(\S+ \S+) (.+)$/.exec(t) || [, t, t]; return { sail: mm[1], name: mm[2], hull: f.hull }; });
    const order = [boats[0], boats[1], boats[2], { sail: 'USA 122', name: 'You', hull: '#ffffff', you: true }, ...boats.slice(3)];
    m.keepSeasonRace(id, 1, { at: new Date().toISOString(), scores: order.map((x, i) => ({ sail: x.sail, name: x.name, hull: x.hull, you: !!x.you, points: i + 1, code: null })) });
    const s = m.seasonById(id); return ui.seasonHtml(s, m.seasonResults(id), [s]);
  }, { id: series.id, fleet: got.fleet });
  const d = {
    title: series.title, host: series.host, burgee: got.burgee, next, yourPlace: 4, sailed: 1,
    races: [{ no: 1, date: r1.date, done: true, place: 4 }, ...tbc.map((x, i) => ({ no: i + 2, date: x, tbc: true }))],
    course: got.course, courseName: '', courseSub: '', strip: got.strip, windFrom: 'Nov 28', boat: got.boat, crew: got.crew, table
  };
  await p.evaluate(src => (0, eval)(src), fs.readFileSync(path.join(dir, 'mock.js'), 'utf8'));
  await p.screenshot({ path: path.join(dir, '3-setup-before.png') });
  // 1: Race, with Season
  await p.evaluate(() => { document.getElementById('setup').hidden = true; document.getElementById('raceChoose').hidden = false; });
  await p.evaluate(d => __mock.raceCards(d), d); await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(dir, '1-race-season.png') });
  // 2: the overview
  await p.evaluate(() => { document.getElementById('raceChoose').hidden = true; });
  await p.evaluate(d => __mock.overview(d), d); await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(dir, '2-season-overview.png') });
  // 3: Sail Race 2 → its setup, locked rows, the brief
  await p.evaluate(() => { document.getElementById('setup').hidden = false; });
  await p.evaluate(d => __mock.setupBrief(d), d); await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(dir, '3-race-setup.png') });
  // 4: on the water, from her slip if she has one
  await p.click('#row-boat .srow-head'); await p.waitForTimeout(500);
  const slip = await p.$('#raceFromField [data-v="slip"]:not([disabled])'); if (slip) { await slip.click(); await p.waitForTimeout(1500); }
  await p.click('#bGo'); await p.waitForTimeout(10000);
  const st = await p.evaluate(() => ({ fromSlip: !!sim().fromSlip }));
  const [h, mi] = next.start.split(':').map(Number), wm = h * 60 + mi - Number(got.seq), warn = `${Math.floor(wm / 60)}:${String(wm % 60).padStart(2, '0')}`;
  const line = st.fromSlip ? `In your slip. <b>Warning signal ${warn}</b>: sail out to the start.` : `By the line. <b>Warning signal ${warn}</b>.`;
  await p.evaluate(l => __mock.waterLine(l), line); await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(dir, '4-on-the-water.png') });
  console.log('fromSlip', st.fromSlip, '· errors:', errs.join(' | ') || 'none'); await b.close();
})();
