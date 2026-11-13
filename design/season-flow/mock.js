// Mock-up for the owner (not built): the season's flow, from Race. The owner: "I'm confused about the UX for seasons. I go
// to the yacht club to pick a season (counterintuitive, since I would think to go to Race), then when I select a season,
// BAM, I'm in my slip. no clue what's going on."
// 1. Race → Season (a third card). 2. The season's overview: the calendar, the next race, the standings, her crew.
// 3. Sail Race N → that race's setup, its fixed rows locked, a brief line. 4. On the water: one line, where she is and what's next.
// Each piece is drawn from the real page (the setup's own tiles, burgee, course and conditions strip), so it's what a build looks like.
window.__mock = (() => {
  const $ = id => document.getElementById(id);
  const css = document.createElement('style');
  css.textContent = `
    #raceChoose .modes{grid-template-columns:repeat(3,1fr)}
    .modecard .mc-sea{display:flex;align-items:center;gap:10px;margin-top:10px}
    .modecard .mc-sea img{height:22px;box-shadow:0 1px 2px rgba(0,0,0,.5)}
    .modecard .mc-sea .t-date{width:38px;height:38px}
    #seaView .panel{max-width:1120px;gap:18px}
    #seaView .sv-head{display:flex;align-items:center;gap:14px}
    #seaView .sv-head img{height:36px;box-shadow:0 1px 2px rgba(0,0,0,.5)}
    #seaView .sv-head h1{font-size:26px}
    #seaView .sv-head .t-s{margin-left:auto}
    .sv-cal{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
    .sv-day{border:1px solid var(--rule);border-radius:12px;padding:12px;display:flex;gap:12px;align-items:center;background:var(--ink)}
    .sv-day.done{opacity:.75}
    .sv-day.next{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
    .sv-day.tbc .t-date{background:transparent;border:1.5px dashed #5f7a8c;color:#9fb3c2}
    .sv-day .sv-r{font:700 12px/1 var(--f-inst);letter-spacing:.12em;color:var(--muted)}
    .sv-day .sv-res{font:700 18px/1.1 var(--f-inst)}
    .sv-day.next .sv-res{color:var(--accent);font-size:13px;letter-spacing:.08em;text-transform:uppercase}
    .sv-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:18px;align-items:start}
    .sv-card{border:1px solid var(--rule);border-radius:12px;padding:14px 16px;background:var(--ink);display:flex;flex-direction:column;gap:12px}
    .sv-card h3{margin:0;font:600 11px/1 var(--f-inst);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
    .sv-next{display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:center}
    .sv-next .sv-pics{display:flex;gap:10px;align-items:center}
    .sv-next .t-strip{margin:0}
    .sv-go{display:flex;gap:10px;align-items:center}
    .sv-go .cta{padding:13px 22px;font-size:15px}
    .t-strip > .sv-wait,#condStrip > .sv-wait{border-style:dashed!important;opacity:.8}
    .sv-crew{display:flex;gap:14px;align-items:center}
    #seaView table.standings{font-size:13px}
    #seaView .sv-tbl{max-height:290px;overflow:auto}
    .sv-brief{display:flex;align-items:center;gap:12px;border:1px solid var(--accent);border-radius:12px;padding:10px 14px;background:rgba(255,182,39,.07)}
    .sv-brief img{height:26px}
    .srow.locked .srow-go{visibility:hidden}
    .srow.locked .srow-head{cursor:default}
    .srow.locked .srow-main::after{content:'🔒';font-size:12px;opacity:.55;margin-left:auto}
    #waterLine{position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:8;background:rgba(10,22,32,.86);border:1px solid var(--rule);border-radius:10px;padding:10px 16px;font:600 15px/1.3 var(--f-inst);letter-spacing:.02em;color:var(--text);white-space:nowrap;pointer-events:none}
    #waterLine b{color:var(--accent)}
  `;
  document.head.appendChild(css);
  const dateTile = (iso, dashed) => { const d = new Date(iso + 'T12:00'); return `<span class="t-date"><b>${d.getDate()}</b><small>${d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</small></span>`; };
  const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
  return {
    /** Still 1: Race, with Season beside Create a race and Past races; the card shows the next race. */
    raceCards(d) {
      const cards = $('raceChoose').querySelector('.modes'), past = $('bPast');
      const c = document.createElement('button'); c.type = 'button'; c.className = 'modecard'; c.id = 'mSeason';
      c.innerHTML = `<b>Season</b><span class="mc-sea"><img src="${d.burgee}" alt="">${dateTile(d.next.date)}<span class="t-text"><span class="t-h">${d.title}</span><span class="t-s">Race ${d.next.no} next · you're ${ord(d.yourPlace)}</span></span></span>`;
      cards.insertBefore(c, past);
    },
    /** Still 2: the season's overview, opened from the card (‹ Race back). */
    overview(d) {
      const o = document.createElement('div'); o.className = 'overlay'; o.id = 'seaView';
      const cal = d.races.map(r => {
        const cls = r.done ? 'done' : r.no === d.next.no ? 'next' : r.tbc ? 'tbc' : '';
        const res = r.done ? ord(r.place) : r.no === d.next.no ? 'Next' : r.tbc ? '' : '';
        return `<div class="sv-day ${cls}"${r.tbc ? ' title="Date to confirm: the first Saturday of the month, as the series has run"' : ''}>${dateTile(r.date)}<span class="t-text"><span class="sv-r">RACE ${r.no}</span><span class="sv-res">${res || '&nbsp;'}</span></span></div>`;
      }).join('');
      o.innerHTML = `<div class="panel wide home">
        <button type="button" class="linkbtn back">‹ Race</button>
        <div class="sv-head"><img src="${d.burgee}" alt=""><h1>${d.title}</h1><span class="t-s">${d.host}</span></div>
        <div class="sv-cal">${cal}</div>
        <div class="sv-grid">
          <div class="sv-card"><h3>Race ${d.next.no} · ${new Date(d.next.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · gun ${d.next.start}</h3>
            <div class="sv-next"><span class="sv-pics">${d.course}</span><span class="t-text"><span class="t-h">${d.courseName}</span><span class="t-s">${d.courseSub}</span></span></div>
            ${d.strip}
            <div class="sv-crew">${d.boat}<span class="t-group">${d.crew}</span></div>
            <div class="sv-go"><button class="cta" type="button">Sail Race ${d.next.no}</button></div>
          </div>
          <div class="sv-card"><h3>Standings · after ${d.sailed} of ${d.races.length}</h3><div class="sv-tbl">${d.table}</div></div>
        </div></div>`;
      document.body.appendChild(o);
      // three weeks out there's no wind forecast yet (NWS's runs out to 7 days): the tide and the sun are predictions, the wind waits
      const wt = o.querySelector('.t-strip > *'); if (wt && d.windFrom) { wt.classList.add('sv-wait'); wt.title = 'The forecast opens a week before the race'; wt.innerHTML = `<span class="t-text"><span class="t-h">Wind</span><span class="t-s">forecast ${d.windFrom}</span></span>`; }
      // (the standings' own header and footer lines: the overview has its own)
      o.querySelectorAll('.season .shead, .season .sdays, .season .sfoot').forEach(e => e.remove());
      o.querySelectorAll('.season table th:nth-child(n+4):not(:nth-last-child(-n+3))').forEach(th => th.textContent = th.textContent);
    },
    /** Still 3: that race's setup, prefilled: course, fleet and day locked (the series fixes them), her boat and crew still hers to change. */
    setupBrief(d) {
      $('seaView')?.remove();
      const back = document.querySelector('#setup .linkbtn.back, #setupBack'); if (back) back.textContent = '‹ ' + d.title;
      for (const r of ['course', 'fleet', 'when']) $('row-' + r)?.classList.add('locked');
      const h = document.querySelector('#setup h1'); if (h) h.textContent = 'Race ' + d.next.no;
      document.querySelectorAll('#row-fleet .srow-main .t-add').forEach(e => e.closest('.t-av').remove());
      const b = document.createElement('div'); b.className = 'sv-brief';
      b.innerHTML = `<img src="${d.burgee}" alt=""><span class="t-text"><span class="t-h">${d.title} · Race ${d.next.no}</span></span>`;
      const steps = document.querySelector('#setup .steps'); steps.prepend(b);
      // (the same honest wind as the overview: no forecast yet for a day three weeks out)
      const wt = document.querySelector('#condStrip > *'); if (wt && d.windFrom) { wt.classList.add('sv-wait'); wt.innerHTML = `<span class="t-text"><span class="t-h">Wind</span><span class="t-s">forecast ${d.windFrom}</span></span>`; }
      const go = $('bGo'); if (go) go.textContent = 'Sail Race ' + d.next.no;
    },
    /** Still 4: on the water, one line: where she is and what's next. */
    waterLine(html) {
      const l = document.createElement('div'); l.id = 'waterLine'; l.innerHTML = html; document.body.appendChild(l);
    }
  };
})();
