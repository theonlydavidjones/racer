// Mock-up for the owner (not built): the pause menu as one narrow column, grouped, Exit set apart; the debrief beside it.
// The owner: "these buttons are a beast to read. too wide, incoherent stacking. just bad design."
(() => {
  const $ = id => document.getElementById(id);
  const panel = document.querySelector('#pause .panel');
  const css = document.createElement('style');
  css.textContent = `
    #pause .panel.menu2{max-width:none;width:auto;display:grid;grid-template-columns:300px minmax(0,640px);gap:28px;align-items:start;padding:22px 24px}
    #pause .panel.menu2.nodeb{grid-template-columns:300px}
    .mcol{display:flex;flex-direction:column;gap:6px}
    .mcol h2{margin:0 0 8px}
    .mcol .mgrp{display:flex;flex-direction:column;gap:6px;padding-bottom:12px;margin-bottom:6px;border-bottom:1px solid var(--rule)}
    .mcol .mgrp:last-child{border-bottom:0;padding-bottom:0;margin-bottom:0}
    .mcol .mgrp.apart{margin-top:22px;border-top:0}
    .mcol button{width:100%;text-align:left;padding:11px 14px;font-size:13px}
    .mcol button.cta{text-align:center;font-size:15px;padding:13px 14px}
    .mcol #bExit2{color:var(--muted)}
    #pause .menu2 #pauseDebrief{margin:0;max-height:calc(100vh - 140px);overflow:auto}
  `;
  document.head.appendChild(css);
  const col = document.createElement('div'); col.className = 'mcol';
  const grp = (ids, cls = '') => { const g = document.createElement('div'); g.className = 'mgrp ' + cls; ids.forEach(id => { const b = $(id); if (b && !b.closest('[hidden]')) g.appendChild(b); }); return g; };
  col.append(panel.querySelector('h2'), grp(['bResume']), grp(['bPauseCond', 'bWatch2']), grp(['bRestart', 'bSettings', 'bKeys2', 'bSound2']), grp(['bExit2'], 'apart'));
  const deb = $('pauseDebrief');
  for (const r of [...panel.querySelectorAll('.btnrow')]) r.remove();
  panel.prepend(col); panel.classList.add('menu2'); if (deb.hidden || !deb.innerHTML.trim()) panel.classList.add('nodeb');
})();
