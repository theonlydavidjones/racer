// Mock-up for the owner (UI-AUDIT §4.3; not built into the game): the race setup's left column folded into four
// one-line summaries, made from the real setup's own fields and values. Run in the page with the race setup open.
// window.__fold(name) opens one group (or none).
(() => {
  const $ = id => document.getElementById(id);
  const pressed = el => el?.querySelector('[aria-pressed="true"]')?.textContent.trim() ?? '';
  const sel = id => { const s = $(id); return s?.options[s.selectedIndex]?.text ?? ''; };
  const steps = document.querySelector('#setup .steps');
  const groups = [
    { key: 'course', title: 'Club and course', ids: ['hostField', 'courseField'],
      line: () => {
        const host = pressed($('hostSeg')).replace(' · ', ', '), course = $('courseMode') && pressed($('courseMode')) === "The committee's choice" ? "The committee's choice" : sel('courseSel').replace(/ · .*?·/, ' ·');
        const si = ($('siSum')?.textContent || '').replace(/^Sailing instructions: /, '');
        return `${host} · ${course} · ${si}`;
      } },
    { key: 'fleet', title: 'Fleet', ids: ['fleetField'],
      line: () => { const on = [...document.querySelectorAll('#oppList .opp[aria-pressed="true"] span')].map(s => s.textContent); return on.length ? `${on.join(', ')} · ${on.length} boat${on.length > 1 ? 's' : ''}` : 'Nobody: a solo race'; } },
    { key: 'boat', title: 'Your boat and crew', ids: ['crewField'],
      line: () => `${sel('boatPick')} · ${($('crewSum')?.textContent || '').replace(/,/, ' ·')} · ${pressed($('raceFromField')).toLowerCase().replace(/^start /, 'starting ')}` },
    { key: 'when', title: 'Start time', ids: ['tideBox'], open: true }
  ];
  const css = document.createElement('style');
  css.textContent = `
    #setup .steps{counter-reset:none;gap:8px}
    #setup .fold{border:1px solid var(--rule);border-radius:10px;background:var(--ink)}
    #setup .fold>header{display:grid;grid-template-columns:150px 1fr auto;align-items:center;gap:12px;padding:12px 14px;cursor:pointer}
    #setup .fold>header:hover{border-color:var(--accent)}
    #setup .fold>header b{font:600 11px/1 var(--f-inst);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
    #setup .fold>header span{font:600 13.5px/1.35 var(--f-inst);letter-spacing:.02em;color:var(--text)}
    #setup .fold>header i{font-style:normal;color:var(--accent);font:600 12px/1 var(--f-inst);letter-spacing:.06em}
    #setup .fold:hover{border-color:rgba(255,182,39,.55)}
    #setup .fold>.fbody{padding:0 14px 14px;display:flex;flex-direction:column;gap:14px}
    #setup .fold:not(.open)>.fbody{display:none}
    #setup .fold.open{border-color:var(--accent)}
    #setup .fold .step{border-top:0;padding:0}
    #setup .fold.one .step>span:first-child{display:none}
    #setup .fold .step>span:first-child::before{content:none}
    #setup .fold.when>header{display:none}
    #setup .fold.when.open{border-color:var(--rule)}
    #setup .fold.when{padding:10px 14px;display:grid;grid-template-columns:150px 1fr;align-items:center;gap:12px}
    #setup .fold.when>.fbody{padding:0}
    #setup .fold.when::before{content:'Start time';font:600 11px/1 var(--f-inst);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
    #setup .step::before{display:none!important;content:none!important}
  `;
  document.head.appendChild(css);
  const made = groups.map(g => {
    const box = document.createElement('section'); box.className = 'fold ' + g.key + (g.ids.length === 1 ? ' one' : '') + (g.open ? ' open' : '');
    const head = document.createElement('header'); head.innerHTML = `<b>${g.title}</b><span></span><i>Change ▾</i>`;
    const body = document.createElement('div'); body.className = 'fbody';
    for (const id of g.ids) { const f = $(id); if (f) body.appendChild(f); }
    box.append(head, body); steps.appendChild(box);
    if (g.line) head.querySelector('span').textContent = g.line();
    head.onclick = () => window.__fold(box.classList.contains('open') ? null : g.key);
    return { g, box, head };
  });
  window.__fold = key => {
    for (const { g, box, head } of made) {
      if (g.open) continue;
      const on = g.key === key; box.classList.toggle('open', on);
      head.querySelector('i').textContent = on ? 'Done ▴' : 'Change ▾';
      if (g.line) head.querySelector('span').textContent = g.line();
    }
  };
})();
